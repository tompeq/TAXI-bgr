import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_exception.dart';

class DriverVerificationScreen extends StatefulWidget {
  const DriverVerificationScreen({
    required this.authController,
    this.onSwitchToPassenger,
    this.onLogout,
    super.key,
  });

  final AuthController authController;
  final Future<void> Function()? onSwitchToPassenger;
  final Future<void> Function()? onLogout;

  @override
  State<DriverVerificationScreen> createState() =>
      _DriverVerificationScreenState();
}

class _DriverVerificationScreenState extends State<DriverVerificationScreen> {
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_refreshStatus());
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authController.session!.user;
    final status = user.driverVerificationStatus;
    final needsChanges = status == 'changes_requested';
    final rejected = status == 'rejected';
    final comment = user.driverVerificationComment?.trim();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Проверка водителя'),
        actions: [
          if (widget.onSwitchToPassenger != null)
            IconButton(
              tooltip: 'Пассажирский кабинет',
              onPressed: _loading ? null : () => widget.onSwitchToPassenger!(),
              icon: const Icon(Icons.switch_account_outlined),
            ),
          IconButton(
            tooltip: 'Выйти',
            onPressed: _loading ? null : _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: needsChanges || rejected
                          ? const Color(0xFFFFE8C2)
                          : const Color(0xFFFFF0A8),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      needsChanges || rejected
                          ? Icons.photo_camera_back_outlined
                          : Icons.fact_check_outlined,
                      size: 38,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    needsChanges
                        ? 'Нужны новые фотографии'
                        : rejected
                        ? 'Заявка отклонена'
                        : 'Заявка отправлена',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    needsChanges
                        ? 'Администратор запросил обновление документов. Возможность заменить фотографии добавим следующим шагом.'
                        : rejected
                        ? 'Свяжитесь с администратором, чтобы уточнить причину и подать документы повторно.'
                        : 'Администратор проверит права и фотографии автомобиля. После одобрения откроется кабинет водителя.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: const Color(0xFF5F6368),
                    ),
                  ),
                  if (comment != null && comment.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF4F4EF),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFE0E0D8)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Комментарий администратора',
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          Text(comment),
                        ],
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Color(0xFFB3261E)),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: _loading ? null : _refreshStatus,
                    icon: _loading
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh),
                    label: const Text('Проверить статус'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _refreshStatus() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.authController.refreshCurrentUser();
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.message);
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _logout() async {
    final onLogout = widget.onLogout;
    if (onLogout != null) {
      await onLogout();
      return;
    }
    await widget.authController.logout();
  }
}
