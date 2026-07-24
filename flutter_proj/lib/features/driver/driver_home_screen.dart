import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/driver_work/driver_work_models.dart';
import '../../core/models/taxi_order.dart';
import '../../core/orders/order_store.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({required this.orderStore, this.onLogout, super.key});

  final OrderStore orderStore;
  final Future<void> Function()? onLogout;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  Timer? _boardTimer;

  @override
  void initState() {
    super.initState();
    unawaited(_loadDriverState());
  }

  @override
  void dispose() {
    _boardTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Кабинет водителя'),
        actions: [
          IconButton(
            tooltip: 'Чат',
            onPressed: _showDriverChat,
            icon: const Icon(Icons.chat_bubble_outline),
          ),
          if (widget.onLogout != null)
            IconButton(
              tooltip: 'Выйти',
              onPressed: widget.onLogout,
              icon: const Icon(Icons.logout),
            ),
        ],
      ),
      body: SafeArea(
        child: AnimatedBuilder(
          animation: widget.orderStore,
          builder: (context, _) {
            final activeOrder = widget.orderStore.activeDriverOrder;
            final openOrders = widget.orderStore.openOrders;
            final workState = widget.orderStore.driverWorkState;
            final isWorking = workState?.isWorking ?? false;
            final isOnBreak = workState?.isOnBreak ?? false;
            final settings = workState?.settings;

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _WorkSwitchCard(
                  isWorking: isWorking,
                  isOnBreak: isOnBreak,
                  breakUntil: workState?.breakUntil,
                  onChanged: _setWorking,
                ),
                const SizedBox(height: 12),
                _DriverFinanceCard(
                  debt: widget.orderStore.driverDebt,
                  earnings: widget.orderStore.driverEarnings24h,
                  debtStatus: workState?.commissionDebtStatus ?? 'clear',
                ),
                const SizedBox(height: 12),
                _DriverSettingsCard(
                  acceptsTaxi: settings?.acceptsTaxi ?? true,
                  acceptsDelivery: settings?.acceptsDelivery ?? true,
                  backgroundNotifications:
                      settings?.backgroundNotifications ?? true,
                  nightNotifications: settings?.nightNotifications ?? false,
                  isWorking: isWorking,
                  isOnBreak: isOnBreak,
                  onTaxiChanged: (value) => _updateSettings(acceptsTaxi: value),
                  onDeliveryChanged: (value) =>
                      _updateSettings(acceptsDelivery: value),
                  onBackgroundChanged: (value) =>
                      _updateSettings(backgroundNotifications: value),
                  onNightChanged: (value) =>
                      _updateSettings(nightNotifications: value),
                  onBreakSelected: _handleBreak,
                  onResume: _resumeShift,
                  onEndShift: () => _setWorking(false),
                ),
                const SizedBox(height: 16),
                if (widget.orderStore.loading) ...[
                  const LinearProgressIndicator(),
                  const SizedBox(height: 12),
                ],
                if (widget.orderStore.errorMessage != null) ...[
                  _StoreErrorMessage(
                    message: widget.orderStore.errorMessage!,
                    onClose: widget.orderStore.clearError,
                  ),
                  const SizedBox(height: 12),
                ],
                if (activeOrder != null) ...[
                  _ActiveOrderCard(
                    order: activeOrder,
                    onStatusChanged: _updateOrderStatus,
                    onCancel: () => _showCancelSheet(activeOrder),
                  ),
                  const SizedBox(height: 16),
                ],
                Text(
                  'Доска заказов',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
                if ((workState?.visibilityDelaySeconds ?? 0) > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Новые заявки показываются через '
                      '${workState!.visibilityDelaySeconds} сек.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
                if (!isWorking)
                  const _EmptyBoardMessage(
                    icon: Icons.power_settings_new,
                    title: 'Вы не на линии',
                    body:
                        'Нажмите “Работать”, чтобы видеть заявки и получать уведомления.',
                  )
                else if (isOnBreak)
                  const _EmptyBoardMessage(
                    icon: Icons.pause_circle_outline,
                    title: 'Перерыв',
                    body: 'Новые заявки появятся после возвращения на линию.',
                  )
                else if (activeOrder != null)
                  const _EmptyBoardMessage(
                    icon: Icons.route_outlined,
                    title: 'У вас активный заказ',
                    body:
                        'В MVP водитель может взять только один заказ одновременно.',
                  )
                else if (openOrders.isEmpty)
                  const _EmptyBoardMessage(
                    icon: Icons.inbox_outlined,
                    title: 'Свободных заявок нет',
                    body:
                        'Новые заказы появятся здесь и придут push-уведомлением.',
                  )
                else
                  ...openOrders.map(
                    (order) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _OrderBoardCard(
                        order: order,
                        onAccept: () => _acceptOrder(order.id),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _setWorking(bool value) async {
    try {
      if (value) {
        await widget.orderStore.startDriverShift();
      } else {
        await widget.orderStore.endDriverShift();
      }
      _syncBoardTimer();
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _loadDriverState() async {
    try {
      await widget.orderStore.loadDriverState();
      _syncBoardTimer();
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _refreshBoard() async {
    if (widget.orderStore.driverWorkState?.status != DriverLineStatus.online ||
        widget.orderStore.loading) {
      return;
    }
    try {
      await widget.orderStore.refreshBoard();
    } on Object {
      // The error is shown inline; polling continues after a temporary outage.
    }
  }

  void _syncBoardTimer() {
    _boardTimer?.cancel();
    if (widget.orderStore.driverWorkState?.status != DriverLineStatus.online) {
      return;
    }
    _boardTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => unawaited(_refreshBoard()),
    );
  }

  Future<void> _acceptOrder(String orderId) async {
    try {
      await widget.orderStore.acceptOrder(orderId);
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _updateOrderStatus(OrderStatus status) async {
    try {
      await widget.orderStore.updateActiveStatus(status);
    } on Object {
      _showStoreError();
    }
  }

  void _showStoreError() {
    if (!mounted) {
      return;
    }
    final message =
        widget.orderStore.errorMessage ?? 'Не удалось выполнить действие';
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _handleBreak(int minutes) async {
    try {
      await widget.orderStore.startDriverBreak(minutes);
      _syncBoardTimer();
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _resumeShift() async {
    try {
      await widget.orderStore.resumeDriverShift();
      _syncBoardTimer();
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _updateSettings({
    bool? acceptsTaxi,
    bool? acceptsDelivery,
    bool? backgroundNotifications,
    bool? nightNotifications,
  }) async {
    try {
      await widget.orderStore.updateDriverSettings(
        acceptsTaxi: acceptsTaxi,
        acceptsDelivery: acceptsDelivery,
        backgroundNotifications: backgroundNotifications,
        nightNotifications: nightNotifications,
      );
    } on Object {
      _showStoreError();
    }
  }

  void _showDriverChat() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Чат с админом',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Здесь будут напоминания по комиссии и сообщения команды.',
            ),
            const SizedBox(height: 16),
            TextField(
              decoration: InputDecoration(
                hintText: 'Написать сообщение',
                suffixIcon: IconButton(
                  tooltip: 'Отправить',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.send_outlined),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showCancelSheet(TaxiOrder order) {
    final reasons = [
      'Пассажир не вышел',
      'Пассажир не отвечает',
      'Пассажир ведет себя неадекватно',
      'Число пассажиров не соответствует заявке',
      'Пассажиров больше посадочных мест',
      'Пассажир отказался оплатить заранее',
    ];

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Text(
            'Причина отмены',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          ...reasons.map(
            (reason) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.close_outlined),
              title: Text(reason),
              onTap: () {
                unawaited(
                  widget.orderStore
                      .cancelActiveOrder(reason)
                      .catchError((Object _) => _showStoreError()),
                );
                Navigator.of(context).pop();
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StoreErrorMessage extends StatelessWidget {
  const _StoreErrorMessage({required this.message, required this.onClose});

  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.errorContainer,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Row(
          children: [
            Icon(
              Icons.error_outline,
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
            IconButton(
              tooltip: 'Закрыть',
              onPressed: onClose,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkSwitchCard extends StatelessWidget {
  const _WorkSwitchCard({
    required this.isWorking,
    required this.isOnBreak,
    required this.breakUntil,
    required this.onChanged,
  });

  final bool isWorking;
  final bool isOnBreak;
  final DateTime? breakUntil;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: isWorking ? const Color(0xFFE7F7EF) : Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(
              isOnBreak
                  ? Icons.pause_circle_outline
                  : isWorking
                  ? Icons.check_circle_outline
                  : Icons.power_settings_new,
              color: isOnBreak
                  ? const Color(0xFFA15C00)
                  : isWorking
                  ? const Color(0xFF006C4D)
                  : const Color(0xFFB3261E),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isOnBreak
                        ? 'Вы на перерыве'
                        : isWorking
                        ? 'Вы на линии'
                        : 'Начать смену',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    isOnBreak
                        ? 'До ${_clockTime(breakUntil)}'
                        : isWorking
                        ? 'Заявки с доски доступны для принятия.'
                        : 'Без выхода на работу уведомления не приходят.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            Switch(value: isWorking, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}

String _clockTime(DateTime? value) {
  if (value == null) {
    return 'возвращения на линию';
  }
  final hour = value.hour.toString().padLeft(2, '0');
  final minute = value.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

class _DriverFinanceCard extends StatelessWidget {
  const _DriverFinanceCard({
    required this.debt,
    required this.earnings,
    required this.debtStatus,
  });

  final double debt;
  final double earnings;
  final String debtStatus;

  @override
  Widget build(BuildContext context) {
    final debtText = debt.toStringAsFixed(0);
    final earningsText = earnings.toStringAsFixed(0);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: _MetricTile(
                    label: 'Доход за 24 часа',
                    value: '$earningsText ₽',
                    icon: Icons.trending_up_outlined,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _MetricTile(
                    label: 'Долг комиссии',
                    value: '$debtText ₽',
                    icon: Icons.account_balance_wallet_outlined,
                  ),
                ),
              ],
            ),
            if (debtStatus != 'clear') ...[
              const SizedBox(height: 10),
              Text(
                _debtMessage(debtStatus),
                style: TextStyle(
                  color: debtStatus == 'blocked'
                      ? Theme.of(context).colorScheme.error
                      : Theme.of(context).colorScheme.secondary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _debtMessage(String status) {
    return switch (status) {
      'blocked' => 'Долг достиг 5 000 ₽. Выход на линию временно заблокирован.',
      'reminder' =>
        'Долг комиссии высокий. Свяжитесь с администратором для оплаты.',
      _ => 'Долг комиссии отображается при входе в приложение.',
    };
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F4EF),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20),
          const SizedBox(height: 8),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _DriverSettingsCard extends StatelessWidget {
  const _DriverSettingsCard({
    required this.acceptsTaxi,
    required this.acceptsDelivery,
    required this.backgroundNotifications,
    required this.nightNotifications,
    required this.isWorking,
    required this.isOnBreak,
    required this.onTaxiChanged,
    required this.onDeliveryChanged,
    required this.onBackgroundChanged,
    required this.onNightChanged,
    required this.onBreakSelected,
    required this.onResume,
    required this.onEndShift,
  });

  final bool acceptsTaxi;
  final bool acceptsDelivery;
  final bool backgroundNotifications;
  final bool nightNotifications;
  final bool isWorking;
  final bool isOnBreak;
  final ValueChanged<bool> onTaxiChanged;
  final ValueChanged<bool> onDeliveryChanged;
  final ValueChanged<bool> onBackgroundChanged;
  final ValueChanged<bool> onNightChanged;
  final ValueChanged<int> onBreakSelected;
  final VoidCallback onResume;
  final VoidCallback onEndShift;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: acceptsTaxi,
              onChanged: (value) {
                if (value != null) {
                  onTaxiChanged(value);
                }
              },
              title: const Text('Такси'),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: acceptsDelivery,
              onChanged: (value) {
                if (value != null) {
                  onDeliveryChanged(value);
                }
              },
              title: const Text('Доставка'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: backgroundNotifications,
              onChanged: onBackgroundChanged,
              title: const Text('Фоновые уведомления'),
              subtitle: const Text('Только когда водитель на линии'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: nightNotifications,
              onChanged: onNightChanged,
              title: const Text('Вечерние и ночные уведомления'),
              subtitle: const Text('Работает после выхода на смену'),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (isOnBreak)
                    ActionChip(
                      avatar: const Icon(Icons.play_arrow_outlined, size: 18),
                      label: const Text('Вернуться'),
                      onPressed: onResume,
                    )
                  else if (isWorking) ...[
                    ActionChip(
                      label: const Text('10 мин'),
                      onPressed: () => onBreakSelected(10),
                    ),
                    ActionChip(
                      label: const Text('30 мин'),
                      onPressed: () => onBreakSelected(30),
                    ),
                    ActionChip(
                      label: const Text('60 мин'),
                      onPressed: () => onBreakSelected(60),
                    ),
                  ],
                  if (isWorking)
                    ActionChip(
                      avatar: const Icon(Icons.stop_circle_outlined, size: 18),
                      label: const Text('Закончить'),
                      onPressed: onEndShift,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveOrderCard extends StatelessWidget {
  const _ActiveOrderCard({
    required this.order,
    required this.onStatusChanged,
    required this.onCancel,
  });

  final TaxiOrder order;
  final ValueChanged<OrderStatus> onStatusChanged;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFFFF7DF),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.route_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Активный заказ · ${order.status.title}',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Text('${order.fare} ₽'),
              ],
            ),
            const SizedBox(height: 8),
            Text('${order.from.title} → ${order.to.title}'),
            Text(
              '${order.kind.title}, ${order.passengers == 3 ? '3+' : order.passengers} чел., ${order.paymentMethod.title}',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (order.status == OrderStatus.accepted)
                  FilledButton.tonalIcon(
                    onPressed: () => onStatusChanged(OrderStatus.driverEnRoute),
                    icon: const Icon(Icons.navigation_outlined),
                    label: const Text('Еду'),
                  ),
                if (order.status == OrderStatus.driverEnRoute)
                  FilledButton.tonalIcon(
                    onPressed: () => onStatusChanged(OrderStatus.arrived),
                    icon: const Icon(Icons.notification_important_outlined),
                    label: const Text('Прибыл'),
                  ),
                if (order.status == OrderStatus.arrived ||
                    order.status == OrderStatus.waiting)
                  FilledButton.tonalIcon(
                    onPressed: () => onStatusChanged(OrderStatus.started),
                    icon: const Icon(Icons.play_arrow_outlined),
                    label: const Text('Начать'),
                  ),
                if (order.status == OrderStatus.started)
                  FilledButton.tonalIcon(
                    onPressed: () => onStatusChanged(OrderStatus.completed),
                    icon: const Icon(Icons.done_outline),
                    label: const Text('Завершить'),
                  ),
                OutlinedButton.icon(
                  onPressed: onCancel,
                  icon: const Icon(Icons.close_outlined),
                  label: const Text('Отмена'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderBoardCard extends StatelessWidget {
  const _OrderBoardCard({required this.order, required this.onAccept});

  final TaxiOrder order;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final accent = order.kind == RideKind.delivery
        ? const Color(0xFF1B7F46)
        : const Color(0xFFB3261E);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 10,
                  height: 46,
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${order.from.title} → ${order.to.title}',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        '${order.kind.title} · ${order.paymentMethod.title}',
                      ),
                    ],
                  ),
                ),
                Text(
                  '${order.fare} ₽',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  avatar: const Icon(Icons.people_outline, size: 18),
                  label: Text(
                    order.passengers == 3
                        ? '3+ чел.'
                        : '${order.passengers} чел.',
                  ),
                ),
                if (order.roundTrip)
                  const Chip(
                    avatar: Icon(Icons.sync_alt_outlined, size: 18),
                    label: Text('туда-обратно'),
                  ),
                if (order.scheduled)
                  Chip(
                    avatar: const Icon(Icons.schedule_outlined, size: 18),
                    label: Text(_formatTime(order.tripTime)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Если статус не меняется 3 минуты, заказ вернется на доску.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                FilledButton.icon(
                  onPressed: onAccept,
                  icon: const Icon(Icons.check_outlined),
                  label: const Text('Взять'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}

class _EmptyBoardMessage extends StatelessWidget {
  const _EmptyBoardMessage({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Icon(icon, size: 36, color: const Color(0xFF5F6368)),
            const SizedBox(height: 8),
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              body,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: const Color(0xFF5F6368)),
            ),
          ],
        ),
      ),
    );
  }
}
