import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../network/api_exception.dart';
import 'finance_models.dart';

class DriverFinanceApiClient {
  DriverFinanceApiClient({required String baseUrl, http.Client? client})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<DriverPaymentDetails> getPaymentDetails(String accessToken) async {
    final body = await _request(
      'GET',
      '/driver/finance/payment-details',
      accessToken,
    );
    return DriverPaymentDetails.fromJson(body);
  }

  Future<DriverPaymentDetails> updatePaymentDetails(
    String accessToken, {
    required String transferPhone,
    required String transferBank,
  }) async {
    final body = await _request(
      'PATCH',
      '/driver/finance/payment-details',
      accessToken,
      body: {'transferPhone': transferPhone, 'transferBank': transferBank},
    );
    return DriverPaymentDetails.fromJson(body);
  }

  Future<Map<String, dynamic>> _request(
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
