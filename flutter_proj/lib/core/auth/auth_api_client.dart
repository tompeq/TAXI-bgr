import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../models/app_role.dart';
import '../network/api_exception.dart';
import 'auth_models.dart';

class AuthApiClient {
  AuthApiClient({required String baseUrl, http.Client? client})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
      _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<OtpChallenge> requestOtp(String phone) async {
    final response = await _postJson('/auth/otp/request', {'phone': phone});
    return OtpChallenge.fromJson(response);
  }

  Future<OtpVerificationResult> verifyOtp({
    required String challengeId,
    required String code,
    required AppRole role,
  }) async {
    final response = await _postJson('/auth/otp/verify', {
      'challengeId': challengeId,
      'code': code,
      'role': role.name,
      'deviceName': 'Taxi Bgr mobile',
    });

    if (response['status'] == 'authenticated') {
      return ExistingUserAuthenticated(AuthSession.fromJson(response));
    }
    return RegistrationRequired(
      registrationToken: response['registrationToken'] as String,
      expiresInSeconds: response['registrationTokenExpiresInSeconds'] as int,
    );
  }

  Future<AuthSession> registerPassenger({
    required String registrationToken,
    required String name,
    String? avatarObjectKey,
  }) async {
    final response = await _postJson('/auth/register/passenger', {
      'registrationToken': registrationToken,
      'name': name,
      'avatarObjectKey': ?avatarObjectKey,
      'deviceName': 'Taxi Bgr mobile',
    });
    return AuthSession.fromJson(response);
  }

  Future<AuthSession> registerDriver({
    required String registrationToken,
    required String fullName,
    required String licensePhotoKey,
    required String licensePhotoBackKey,
    required String vehicleMakeModel,
    required String vehicleColor,
    required String vehiclePlate,
    required List<String> carPhotoKeys,
  }) async {
    final response = await _postJson('/auth/register/driver', {
      'registrationToken': registrationToken,
      'fullName': fullName,
      'licensePhotoKey': licensePhotoKey,
      'licensePhotoBackKey': licensePhotoBackKey,
      'vehicleMakeModel': vehicleMakeModel,
      'vehicleColor': vehicleColor,
      'vehiclePlate': vehiclePlate,
      'carPhotoKeys': carPhotoKeys,
      'deviceName': 'Taxi Bgr mobile',
    });
    return AuthSession.fromJson(response);
  }

  Future<String> uploadRegistrationImage({
    required String registrationToken,
    required RegistrationUploadKind kind,
    required XFile image,
  }) async {
    final bytes = await image.readAsBytes();
    if (bytes.length > 8 * 1024 * 1024) {
      throw const ApiException(message: 'Фотография должна быть меньше 8 МБ');
    }

    final request =
        http.MultipartRequest(
            'POST',
            Uri.parse('$_baseUrl/auth/registration/images/${kind.wireName}'),
          )
          ..headers['Authorization'] = 'Bearer $registrationToken'
          ..files.add(
            http.MultipartFile.fromBytes('file', bytes, filename: image.name),
          );

    try {
      final streamed = await _client
          .send(request)
          .timeout(const Duration(seconds: 45));
      final response = await http.Response.fromStream(streamed);
      final body = _decodeBody(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw _apiError(response.statusCode, body);
      }
      return body['objectKey'] as String;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw _connectionError();
    } on TimeoutException {
      throw const ApiException(message: 'Сервер слишком долго не отвечает');
    }
  }

  Future<AuthUser> getCurrentUser(String accessToken) async {
    final response = await _sendJson(
      'GET',
      '/auth/me',
      accessToken: accessToken,
    );
    return AuthUser.fromJson(response);
  }

  Future<AuthSession> refresh(String refreshToken) async {
    final response = await _postJson('/auth/refresh', {
      'refreshToken': refreshToken,
    });
    return AuthSession.fromJson(response);
  }

  Future<void> logout(String accessToken) async {
    await _sendJson('POST', '/auth/logout', accessToken: accessToken);
  }

  Future<Map<String, dynamic>> _postJson(
    String path,
    Map<String, dynamic> body,
  ) {
    return _sendJson('POST', path, body: body);
  }

  Future<Map<String, dynamic>> _sendJson(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? accessToken,
  }) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'));
    if (accessToken != null) {
      request.headers['Authorization'] = 'Bearer $accessToken';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    try {
      final streamed = await _client
          .send(request)
          .timeout(const Duration(seconds: 20));
      final response = await http.Response.fromStream(streamed);
      final decoded = _decodeBody(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw _apiError(response.statusCode, decoded);
      }
      return decoded;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw _connectionError();
    } on TimeoutException {
      throw const ApiException(message: 'Сервер слишком долго не отвечает');
    } on http.ClientException {
      throw _connectionError();
    }
  }

  Map<String, dynamic> _decodeBody(http.Response response) {
    if (response.bodyBytes.isEmpty) {
      return <String, dynamic>{};
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    return <String, dynamic>{};
  }

  ApiException _apiError(int statusCode, Map<String, dynamic> body) {
    final rawMessage = body['message'];
    final message = switch (rawMessage) {
      String value => value,
      List<dynamic> values => values.join(', '),
      _ => 'Не удалось выполнить запрос',
    };
    return ApiException(
      message: message,
      statusCode: statusCode,
      code: body['code'] as String?,
    );
  }

  ApiException _connectionError() {
    return const ApiException(
      message:
          'Не удалось подключиться к серверу. Проверьте интернет и адрес API.',
    );
  }

  void close() => _client.close();
}
