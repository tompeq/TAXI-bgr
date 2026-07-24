import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../network/api_exception.dart';
import 'support_models.dart';

class SupportApiClient {
  SupportApiClient({required String baseUrl, http.Client? client})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<SupportConversation?> getConversation(String accessToken) async {
    final body = await _request('GET', '/support/conversation', accessToken);
    if (body == null) {
      return null;
    }
    return SupportConversation.fromJson(body as Map<String, dynamic>);
  }

  Future<SupportConversation> sendMessage(
    String accessToken,
    String body,
  ) async {
    final result = await _request(
      'POST',
      '/support/messages',
      accessToken,
      body: {'body': body},
    );
    return SupportConversation.fromJson(result as Map<String, dynamic>);
  }

  Future<Object?> _request(
    String method,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'));
    request.headers['Authorization'] = 'Bearer $accessToken';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    try {
      final streamed = await _client
          .send(request)
          .timeout(const Duration(seconds: 20));
      final response = await http.Response.fromStream(streamed);
      final decoded = response.bodyBytes.isEmpty
          ? null
          : jsonDecode(utf8.decode(response.bodyBytes));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final errorBody = decoded is Map<String, dynamic>
            ? decoded
            : <String, dynamic>{};
        final rawMessage = errorBody['message'];
        throw ApiException(
          message: rawMessage is List<dynamic>
              ? rawMessage.join(', ')
              : rawMessage as String? ?? 'Не удалось выполнить запрос',
          statusCode: response.statusCode,
          code: errorBody['code'] as String?,
        );
      }
      return decoded;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw const ApiException(message: 'Не удалось подключиться к серверу');
    } on TimeoutException {
      throw const ApiException(message: 'Сервер слишком долго не отвечает');
    } on http.ClientException {
      throw const ApiException(message: 'Не удалось подключиться к серверу');
    }
  }

  void close() => _client.close();
}
