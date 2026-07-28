import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/engagement/engagement_models.dart';
import '../../core/engagement/engagement_store.dart';

class OrderChatSheet extends StatefulWidget {
  const OrderChatSheet({
    required this.store,
    required this.orderId,
    required this.currentUserId,
    super.key,
  });

  final EngagementStore store;
  final String orderId;
  final String currentUserId;

  @override
  State<OrderChatSheet> createState() => _OrderChatSheetState();
}

class _OrderChatSheetState extends State<OrderChatSheet> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _timer;
  List<OrderChatMessage> _messages = const [];
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
    _timer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => unawaited(_refresh(silent: true)),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      heightFactor: 0.82,
      child: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(18, 0, 18, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Чат по заказу',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                ),
              ),
            ),
            const Divider(height: 1),
            if (_error != null)
              MaterialBanner(
                content: Text(_error!),
                actions: [
                  TextButton(
                    onPressed: () => unawaited(_refresh()),
                    child: const Text('Повторить'),
                  ),
                ],
              ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _messages.isEmpty
                  ? const Center(
                      child: Text(
                        'Сообщений пока нет',
                        style: TextStyle(color: Color(0xFF777777)),
                      ),
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final message = _messages[index];
                        final own = message.sender.id == widget.currentUserId;
                        return Align(
                          alignment: own
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            constraints: const BoxConstraints(maxWidth: 300),
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 9,
                            ),
                            decoration: BoxDecoration(
                              color: own
                                  ? const Color(0xFFFFE45C)
                                  : const Color(0xFFF1F1EE),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (!own)
                                  Text(
                                    message.sender.name,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                Text(message.body),
                                const SizedBox(height: 2),
                                Text(
                                  TimeOfDay.fromDateTime(
                                    message.createdAt,
                                  ).format(context),
                                  style: const TextStyle(
                                    fontSize: 10,
                                    color: Color(0xFF666666),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            const Divider(height: 1),
            Padding(
              padding: EdgeInsets.fromLTRB(
                12,
                10,
                12,
                MediaQuery.viewInsetsOf(context).bottom + 10,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(hintText: 'Сообщение'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Отправить',
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _refresh({bool silent = false}) async {
    if (!silent && mounted) {
      setState(() => _loading = true);
    }
    try {
      final messages = await widget.store.orderMessages(widget.orderId);
      if (!mounted) return;
      final changed =
          messages.length != _messages.length ||
          (messages.isNotEmpty &&
              (_messages.isEmpty || messages.last.id != _messages.last.id));
      setState(() {
        _messages = messages;
        _loading = false;
        _error = null;
      });
      if (changed) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.jumpTo(
              _scrollController.position.maxScrollExtent,
            );
          }
        });
      }
    } on Object {
      if (mounted && !silent) {
        setState(() {
          _loading = false;
          _error = 'Не удалось загрузить сообщения';
        });
      }
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await widget.store.sendOrderMessage(widget.orderId, text);
      _controller.clear();
      await _refresh(silent: true);
    } on Object {
      if (mounted) {
        setState(() => _error = 'Не удалось отправить сообщение');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}
