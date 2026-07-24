import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../network/api_exception.dart';
import 'driver_work_models.dart';

class DriverWorkApiClient {
  DriverWorkApiClient({required String baseUrl, http.Client? client})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<DriverWorkState> getState(String accessToken) {
    return _stateRequest('GET', '/driver/work', accessToken);
  }

  Future<DriverWorkState> start(String accessToken) {
    return _stateRequest('POST', '/driver/work/start', accessToken);
  }

  Future<DriverWorkState> end(String accessToken) {
    return _stateRequest('POST', '/driver/work/end', accessToken);
  }

  Future<DriverWorkState> startBreak(String accessToken, int minutes) {
    return _stateRequest(
      'POST',
      '/driver/work/break',
      accessToken,
      body: {'minutes': minutes},
    );
  }

  Future<DriverWorkState> resume(String accessToken) {
    return _stateRequest('POST', '/driver/work/resume', accessToken);
  }

  Future<DriverWorkState> updateSettings(
    String accessToken, {
    bool? acceptsTaxi,
    bool? acceptsDelivery,
    bool? backgroundNotifications,
    bool? nightNotifications,
  }) {
    return _stateRequest(
      'PATCH',
      '/driver/work/settings',
      accessToken,
      body: {
        'acceptsTaxi': ?acceptsTaxi,
        'acceptsDelivery': ?acceptsDelivery,
        'backgroundNotifications': ?backgroundNotifications,
        'nightNotifications': ?nightNotifications,
      },
    );
  }

  Future<List<DriverSurvey>> getDueSurveys(String accessToken) async {
    final body = await _mapRequest('GET', '/driver/surveys/due', accessToken);
    return (body['items'] as List<dynamic>)
        .map((item) => DriverSurvey.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<void> submitSurvey(
    String accessToken,
    DriverSurvey survey,
    DriverSurveyAnswer answer, {
    String? suggestion,
  }) async {
    final type = switch (survey.type) {
      DriverSurveyType.price => 'price',
      DriverSurveyType.roadBgr => 'road_bgr',
      DriverSurveyType.roadHarbor => 'road_harbor',
    };
    await _mapRequest(
      'POST',
      '/driver/surveys/$type/responses',
      accessToken,
      body: {
        'answer': answer.wireName,
        if (suggestion?.trim().isNotEmpty ?? false)
          'suggestion': suggestion!.trim(),
        if (survey.orderId != null) 'orderId': survey.orderId,
      },
    );
  }

  Future<DriverWorkState> _stateRequest(
    String method,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    final decoded = await _mapRequest(method, path, accessToken, body: body);
    return DriverWorkState.fromJson(decoded);
  }

  Future<Map<String, dynamic>> _mapRequest(
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
          ? <String, dynamic>{}
          : jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final rawMessage = decoded['message'];
        throw ApiException(
          message: rawMessage is List<dynamic>
              ? rawMessage.join(', ')
              : rawMessage as String? ?? 'Не удалось выполнить запрос',
          statusCode: response.statusCode,
          code: decoded['code'] as String?,
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
