import 'dart:convert';

import 'package:flutter_proj/core/auth/auth_api_client.dart';
import 'package:flutter_proj/core/driver_work/driver_work_api_client.dart';
import 'package:flutter_proj/core/models/app_role.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'omits the JSON content type for a bodyless driver start request',
    () async {
      http.Request? captured;
      final client = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode(_driverWorkState), 200);
      });
      final api = DriverWorkApiClient(
        baseUrl: 'http://localhost:3000/api/v1',
        client: client,
      );

      await api.start('access-token');

      expect(captured?.method, 'POST');
      expect(captured?.body, isEmpty);
      expect(captured?.headers.containsKey('content-type'), isFalse);
      api.close();
    },
  );

  test('keeps the JSON content type when a request has a body', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(jsonEncode(_driverWorkState), 200);
    });
    final api = DriverWorkApiClient(
      baseUrl: 'http://localhost:3000/api/v1',
      client: client,
    );

    await api.startBreak('access-token', 10);

    expect(captured?.headers['content-type'], 'application/json');
    expect(jsonDecode(captured!.body), {'minutes': 10});
    api.close();
  });

  test('omits the JSON content type for a bodyless logout request', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response('', 204);
    });
    final api = AuthApiClient(
      baseUrl: 'http://localhost:3000/api/v1',
      client: client,
    );

    await api.logout('access-token');

    expect(captured?.method, 'POST');
    expect(captured?.headers.containsKey('content-type'), isFalse);
    api.close();
  });

  test('sends the selected role when verifying an OTP', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'status': 'registration_required',
          'registrationToken': 'registration-token',
          'registrationTokenExpiresInSeconds': 900,
        }),
        200,
      );
    });
    final api = AuthApiClient(
      baseUrl: 'http://localhost:3000/api/v1',
      client: client,
    );

    await api.verifyOtp(
      challengeId: '00000000-0000-0000-0000-000000000000',
      code: '123456',
      role: AppRole.driver,
    );

    expect(jsonDecode(captured!.body), containsPair('role', 'driver'));
    api.close();
  });
}

const _driverWorkState = {
  'status': 'online',
  'shiftId': 'shift-id',
  'startedAt': '2026-07-12T10:00:00.000Z',
  'breakUntil': null,
  'earnings24h': 0,
  'commissionDebt': 0,
  'commissionDebtStatus': 'clear',
  'visibilityDelaySeconds': 0,
  'settings': {
    'acceptsTaxi': true,
    'acceptsDelivery': true,
    'backgroundNotifications': true,
    'nightNotifications': true,
  },
};
