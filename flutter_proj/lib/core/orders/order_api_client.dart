import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../finance/finance_models.dart';
import '../models/taxi_order.dart';
import 'order_quote.dart';
import '../network/api_exception.dart';
import 'driver_availability.dart';

class DriverOrderBoard {
  const DriverOrderBoard({required this.orders, required this.announcement});

  final List<TaxiOrder> orders;
  final String announcement;
}

class OrderApiClient {
  OrderApiClient({required String baseUrl, http.Client? client})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<OrderQuote> quoteOrder(String accessToken, TaxiOrder draft) async {
    final body = await _mapRequest(
      'POST',
      '/orders/quote',
      accessToken,
      body: draft.toCreateJson(),
    );
    return OrderQuote.fromJson(body);
  }

  Future<TaxiOrder> createOrder(String accessToken, TaxiOrder draft) async {
    final body = await _mapRequest(
      'POST',
      '/orders',
      accessToken,
      body: draft.toCreateJson(),
    );
    return TaxiOrder.fromJson(body);
  }

  Future<DriverAvailability> getDriverAvailability(
    String accessToken,
    RideKind kind,
  ) async {
    final body = await _mapRequest(
      'GET',
      '/orders/availability?kind=${Uri.encodeQueryComponent(kind.wireName)}',
      accessToken,
    );
    return DriverAvailability.fromJson(body);
  }

  Future<DriverOrderBoard> getBoard(String accessToken) async {
    final body = await _mapRequest('GET', '/orders/board', accessToken);
    return DriverOrderBoard(
      orders: (body['items'] as List<dynamic>)
          .map((item) => TaxiOrder.fromJson(item as Map<String, dynamic>))
          .toList(growable: false),
      announcement: body['announcement'] as String? ?? '',
    );
  }

  Future<TaxiOrder?> getActive(String accessToken) async {
    final body = await _request('GET', '/orders/active', accessToken);
    if (body == null) {
      return null;
    }
    return TaxiOrder.fromJson(body as Map<String, dynamic>);
  }

  Future<TaxiOrder> acceptOrder(String accessToken, String orderId) async {
    final body = await _mapRequest(
      'POST',
      '/orders/$orderId/accept',
      accessToken,
    );
    return TaxiOrder.fromJson(body);
  }

  Future<TransferPaymentDetails> getTransferDetails(
    String accessToken,
    String orderId,
  ) async {
    final body = await _mapRequest(
      'GET',
      '/orders/$orderId/transfer-details',
      accessToken,
    );
    return TransferPaymentDetails.fromJson(body);
  }

  Future<TaxiOrder> updateStatus(
    String accessToken,
    String orderId,
    OrderStatus status,
  ) async {
    final body = await _mapRequest(
      'PATCH',
      '/orders/$orderId/status',
      accessToken,
      body: {'status': status.wireName},
    );
    return TaxiOrder.fromJson(body);
  }

  Future<TaxiOrder> cancelOrder(
    String accessToken,
    String orderId,
    String reason,
  ) async {
    final body = await _mapRequest(
      'POST',
      '/orders/$orderId/cancel',
      accessToken,
      body: {'reason': reason},
    );
    return TaxiOrder.fromJson(body);
  }

  Future<Map<String, dynamic>> _mapRequest(
    String method,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    final result = await _request(method, path, accessToken, body: body);
    return result as Map<String, dynamic>;
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
