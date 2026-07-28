import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../network/api_exception.dart';
import 'engagement_models.dart';

class EngagementApiClient {
  EngagementApiClient({required String baseUrl, http.Client? client})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<List<OrderChatMessage>> orderMessages(
    String token,
    String orderId,
  ) async {
    final body = await _mapRequest('GET', '/orders/$orderId/messages', token);
    return (body['items'] as List<dynamic>)
        .map((item) => OrderChatMessage.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<OrderChatMessage> sendOrderMessage(
    String token,
    String orderId,
    String message,
  ) async {
    final body = await _mapRequest(
      'POST',
      '/orders/$orderId/messages',
      token,
      body: {'body': message},
    );
    return OrderChatMessage.fromJson(body);
  }

  Future<List<PendingRating>> pendingRatings(String token) async {
    final body = await _mapRequest('GET', '/engagement/ratings/pending', token);
    return (body['items'] as List<dynamic>)
        .where((item) => (item as Map<String, dynamic>)['target'] != null)
        .map((item) => PendingRating.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<void> submitRating(
    String token,
    String orderId,
    int score, {
    String? comment,
  }) async {
    await _request(
      'POST',
      '/orders/$orderId/rating',
      token,
      body: {
        'score': score,
        if (comment?.trim().isNotEmpty == true) 'comment': comment!.trim(),
      },
    );
  }

  Future<List<EngagementSurvey>> dueSurveys(String token) async {
    final body = await _mapRequest('GET', '/engagement/surveys/due', token);
    return (body['items'] as List<dynamic>)
        .map((item) => EngagementSurvey.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<void> submitSurvey(
    String token,
    String surveyId, {
    String? answer,
    String? comment,
  }) async {
    await _request(
      'POST',
      '/engagement/surveys/$surveyId/responses',
      token,
      body: {
        if (answer?.trim().isNotEmpty == true) 'answer': answer!.trim(),
        if (comment?.trim().isNotEmpty == true) 'comment': comment!.trim(),
      },
    );
  }

  Future<List<UserAnnouncement>> pendingAnnouncements(String token) async {
    final body = await _mapRequest(
      'GET',
      '/engagement/announcements/pending',
      token,
    );
    return (body['items'] as List<dynamic>)
        .map((item) => UserAnnouncement.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<void> acknowledgeAnnouncement(
    String token,
    String announcementId,
  ) async {
    await _request(
      'POST',
      '/engagement/announcements/$announcementId/acknowledge',
      token,
    );
  }

  Future<Map<String, dynamic>> _mapRequest(
    String method,
    String path,
    String token, {
    Map<String, dynamic>? body,
  }) async {
    final result = await _request(method, path, token, body: body);
    return result as Map<String, dynamic>;
  }

  Future<Object?> _request(
    String method,
    String path,
    String token, {
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'));
    request.headers['Authorization'] = 'Bearer $token';
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
        final error = decoded is Map<String, dynamic>
            ? decoded
            : <String, dynamic>{};
        final rawMessage = error['message'];
        throw ApiException(
          message: rawMessage is List<dynamic>
              ? rawMessage.join(', ')
              : rawMessage as String? ?? 'Не удалось выполнить запрос',
          statusCode: response.statusCode,
          code: error['code'] as String?,
        );
      }
      return decoded;
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Сервер слишком долго не отвечает');
    } on SocketException {
      throw const ApiException(message: 'Не удалось подключиться к серверу');
    } on http.ClientException {
      throw const ApiException(message: 'Не удалось подключиться к серверу');
    }
  }

  void close() => _client.close();
}
