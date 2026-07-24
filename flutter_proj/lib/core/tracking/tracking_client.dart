import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../auth/auth_controller.dart';
import 'vehicle_location.dart';

class TrackingClient extends ChangeNotifier {
  TrackingClient({required String apiBaseUrl, required this.auth})
    : _socketBaseUrl = _originFor(apiBaseUrl);

  final String _socketBaseUrl;
  final AuthController auth;

  io.Socket? _socket;
  String? _orderId;
  VehicleLocation? _driverLocation;
  String? _errorMessage;
  bool _connected = false;

  VehicleLocation? get driverLocation => _driverLocation;
  String? get errorMessage => _errorMessage;
  bool get connected => _connected;

  Future<void> connectToOrder(String orderId) async {
    if (_orderId == orderId && (_socket?.connected ?? false)) {
      return;
    }
    _orderId = orderId;
    _driverLocation = null;
    _errorMessage = null;

    final token = auth.session?.accessToken;
    if (token == null || token.startsWith('local-dev-')) {
      notifyListeners();
      return;
    }

    _disposeSocket();
    final socket = io.io(
      '$_socketBaseUrl/tracking',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );
    _socket = socket;
    socket.onConnect((_) {
      _connected = true;
      socket.emit('tracking:join', {'orderId': orderId});
      notifyListeners();
    });
    socket.onDisconnect((_) {
      _connected = false;
      notifyListeners();
    });
    socket.onConnectError((error) {
      _errorMessage = 'Не удалось подключить отслеживание автомобиля';
      notifyListeners();
    });
    socket.on('tracking:error', (data) {
      _errorMessage = data is Map ? data['message']?.toString() : null;
      notifyListeners();
    });
    socket.on('driver:location', (data) {
      if (data is! Map) {
        return;
      }
      final payload = Map<String, dynamic>.from(data);
      if (payload['orderId'] != _orderId) {
        return;
      }
      _driverLocation = VehicleLocation.fromJson(payload);
      notifyListeners();
    });
    socket.connect();
  }

  void publishDriverLocation(VehicleLocation location, {int? etaSeconds}) {
    final orderId = _orderId;
    final socket = _socket;
    if (orderId == null || socket == null || !socket.connected) {
      return;
    }
    socket.emit(
      'driver:location',
      location.toJson(orderId, etaSeconds: etaSeconds),
    );
  }

  void clearOrder() {
    _orderId = null;
    _driverLocation = null;
    _errorMessage = null;
    _disposeSocket();
    notifyListeners();
  }

  void _disposeSocket() {
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }

  @override
  void dispose() {
    _disposeSocket();
    super.dispose();
  }

  static String _originFor(String apiBaseUrl) {
    final uri = Uri.parse(apiBaseUrl);
    return uri
        .replace(path: '', query: null, fragment: null)
        .toString()
        .replaceFirst(RegExp(r'/$'), '');
  }
}
