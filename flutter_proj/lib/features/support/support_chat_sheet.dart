import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/support/support_models.dart';
import '../../core/support/support_store.dart';

class SupportChatSheet extends StatefulWidget {
  const SupportChatSheet({required this.store, required this.title, super.key});

  final SupportStore store;
  final String title;

  @override
  State<SupportChatSheet> createState() => _SupportChatSheetState();
}

class _SupportChatSheetState extends State<SupportChatSheet> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onStoreChanged);
    unawaited(_load());
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 12),
      (_) =>
          unawaited(widget.store.load(showLoading: false).catchError((_) {})),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    widget.store.removeListener(_onStoreChanged);
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      await widget.store.load();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.store.errorMessage ?? 'Не удалось загрузить сообщения',
            ),
          ),
        );
      }
    }
  }

  void _onStoreChanged() {
    if (mounted) {
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToLatest());
    }
  }

  Future<void> _send() async {
    final value = _messageController.text;
    if (value.trim().isEmpty || widget.store.sending) {
      return;
    }
    try {
      await widget.store.send(value);
      _messageController.clear();
      _scrollToLatest();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.store.errorMessage ?? 'Не удалось отправить сообщение',
            ),
          ),
        );
      }
    }
  }

  void _scrollToLatest() {
    if (!_scrollController.hasClients) {
      return;
    }
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final conversation = widget.store.conversation;
    final messages = conversation?.messages ?? const <SupportMessage>[];
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.72,
          child: Column(
            children: [
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (conversation?.status == 'closed')
                    const Chip(label: Text('Закрыт')),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: widget.store.loading && conversation == null
                    ? const Center(child: CircularProgressIndicator())
                    : messages.isEmpty
                    ? const _EmptyChat()
                    : ListView.separated(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        itemCount: messages.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) => _MessageBubble(
                          message: messages[index],
                          isOwn:
                              messages[index].sender.id ==
                              widget.store.currentUserId,
                        ),
                      ),
              ),
              const Divider(height: 1),
              const SizedBox(height: 8),
              TextField(
                controller: _messageController,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: 'Сообщение',
                  suffixIcon: IconButton(
                    tooltip: 'Отправить',
                    onPressed: widget.store.sending ? null : _send,
                    icon: widget.store.sending
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_outlined),
                  ),
                ),
                onSubmitted: (_) => _send(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Сообщений пока нет',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isOwn});

  final SupportMessage message;
  final bool isOwn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final time = TimeOfDay.fromDateTime(message.createdAt).format(context);
    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: isOwn
                ? scheme.primaryContainer
                : scheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 7),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isOwn)
                  Text(
                    message.sender.name,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                if (!isOwn) const SizedBox(height: 2),
                Text(message.body),
                const SizedBox(height: 3),
                Align(
                  alignment: Alignment.centerRight,
                  child: Text(time, style: theme.textTheme.labelSmall),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
