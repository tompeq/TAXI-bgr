import 'package:flutter/foundation.dart';

import '../auth/auth_controller.dart';
import '../network/api_exception.dart';
import 'support_api_client.dart';
import 'support_models.dart';

class SupportStore extends ChangeNotifier {
  SupportStore({required this.api, required this.auth});

  final SupportApiClient api;
  final AuthController auth;

  SupportConversation? _conversation;
  bool _loading = false;
  bool _sending = false;
  String? _errorMessage;

  SupportConversation? get conversation => _conversation;
  bool get loading => _loading;
  bool get sending => _sending;
  String? get errorMessage => _errorMessage;
  String? get currentUserId => auth.session?.user.id;

  bool get isLocalDevelopment =>
      auth.session?.accessToken.startsWith('local-dev-') ?? false;

  void resetForAccountSwitch() {
    _conversation = null;
    _loading = false;
    _sending = false;
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> load({bool showLoading = true}) async {
    if (isLocalDevelopment) {
      return;
    }
    if (showLoading) {
      _loading = true;
    }
    _errorMessage = null;
    notifyListeners();
    try {
      _conversation = await auth.authorizedRequest(api.getConversation);
    } on ApiException catch (error) {
      _errorMessage = error.message;
      rethrow;
    } finally {
      if (showLoading) {
        _loading = false;
      }
      notifyListeners();
    }
  }

  Future<void> send(String value) async {
    final body = value.trim();
    if (body.isEmpty) {
      return;
    }
    if (isLocalDevelopment) {
      _appendLocalMessage(body);
      notifyListeners();
      return;
    }
    _sending = true;
    _errorMessage = null;
    notifyListeners();
    try {
      _conversation = await auth.authorizedRequest(
        (token) => api.sendMessage(token, body),
      );
    } on ApiException catch (error) {
      _errorMessage = error.message;
      rethrow;
    } finally {
      _sending = false;
      notifyListeners();
    }
  }

  void _appendLocalMessage(String body) {
    final user = auth.session?.user;
    if (user == null) {
      return;
    }
    final participant = SupportParticipant(
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role?.name ?? 'passenger',
    );
    final message = SupportMessage(
      id: 'local-message-${DateTime.now().microsecondsSinceEpoch}',
      body: body,
      createdAt: DateTime.now(),
      sender: participant,
    );
    final existing = _conversation;
    _conversation = SupportConversation(
      id: existing?.id ?? 'local-support',
      status: 'open',
      participant: participant,
      createdAt: existing?.createdAt ?? message.createdAt,
      updatedAt: message.createdAt,
      messages: [...(existing?.messages ?? const []), message],
    );
  }
}
