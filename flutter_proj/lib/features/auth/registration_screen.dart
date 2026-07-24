import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/auth/auth_api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/auth_models.dart';
import '../../core/auth/phone_normalizer.dart';
import '../../core/auth/registration_draft_store.dart';
import '../../core/models/app_role.dart';
import '../../core/network/api_exception.dart';

enum _RegistrationStep { phone, code, profile }

const _useLocalAuthBypass = bool.fromEnvironment(
  'LOCAL_AUTH_BYPASS',
  defaultValue: false,
);

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({
    required this.role,
    required this.authApi,
    required this.authController,
    this.initialDraft,
    this.draftStore,
    this.onDraftCleared,
    super.key,
  });

  final AppRole role;
  final AuthApiClient authApi;
  final AuthController authController;
  final RegistrationDraft? initialDraft;
  final RegistrationDraftStore? draftStore;
  final VoidCallback? onDraftCleared;

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _phoneController = TextEditingController(text: '+7 ');
  final _codeController = TextEditingController();
  final _nameController = TextEditingController();
  final _vehicleMakeModelController = TextEditingController();
  final _vehicleColorController = TextEditingController();
  final _vehiclePlateController = TextEditingController();
  final _imagePicker = ImagePicker();

  late final RegistrationDraftStore _draftStore;
  _RegistrationStep _step = _RegistrationStep.phone;
  OtpChallenge? _challenge;
  String? _registrationToken;
  XFile? _avatarPhoto;
  XFile? _licensePhoto;
  XFile? _licenseBackPhoto;
  final Map<RegistrationUploadKind, XFile> _carPhotos = {};
  Timer? _resendTimer;
  Timer? _draftPersistTimer;
  int _resendRemaining = 0;
  bool _busy = false;
  String? _error;
  String? _progressText;
  RegistrationUploadKind? _pendingPhotoKind;

  bool get _isDriver => widget.role == AppRole.driver;

  @override
  void initState() {
    super.initState();
    _draftStore = widget.draftStore ?? RegistrationDraftStore();
    final draft = widget.initialDraft;
    if (draft != null) {
      _restoreDraft(draft);
      unawaited(_restoreLostImage());
    }
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    _draftPersistTimer?.cancel();
    _phoneController.dispose();
    _codeController.dispose();
    _nameController.dispose();
    _vehicleMakeModelController.dispose();
    _vehicleColorController.dispose();
    _vehiclePlateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.role.title),
        actions: [
          if (widget.initialDraft != null)
            IconButton(
              tooltip: 'Отменить регистрацию',
              onPressed: _busy ? null : () => unawaited(_discardDraft()),
              icon: const Icon(Icons.close),
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _StepHeader(step: _step),
                    const SizedBox(height: 24),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      child: switch (_step) {
                        _RegistrationStep.phone => _buildPhoneStep(),
                        _RegistrationStep.code => _buildCodeStep(),
                        _RegistrationStep.profile => _buildProfileStep(),
                      },
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      _ErrorMessage(message: _error!),
                    ],
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: _busy ? null : _handlePrimaryAction,
                      icon: _busy
                          ? const SizedBox.square(
                              dimension: 19,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(_primaryIcon),
                      label: Text(_progressText ?? _primaryLabel),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPhoneStep() {
    return Column(
      key: const ValueKey('phone'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Введите номер телефона',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          'Отправим SMS-код для входа или создания аккаунта.',
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: const Color(0xFF5F6368)),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _phoneController,
          autofocus: true,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!_busy) {
              _requestOtp();
            }
          },
          decoration: const InputDecoration(
            labelText: 'Номер телефона',
            hintText: '+7 999 000-00-00',
            prefixIcon: Icon(Icons.phone_outlined),
          ),
        ),
      ],
    );
  }

  Widget _buildCodeStep() {
    final debugCode = _challenge?.debugCode;
    return Column(
      key: const ValueKey('code'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Код из SMS',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          'Код отправлен на ${normalizePhoneNumber(_phoneController.text) ?? _phoneController.text}.',
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: const Color(0xFF5F6368)),
        ),
        if (debugCode != null) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFE8F1FF),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Тестовый код: $debugCode',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
        const SizedBox(height: 20),
        TextField(
          controller: _codeController,
          autofocus: true,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          maxLength: 6,
          onChanged: (value) {
            final digits = value.replaceAll(RegExp(r'[^0-9]'), '');
            if (digits != value) {
              _codeController.value = TextEditingValue(
                text: digits,
                selection: TextSelection.collapsed(offset: digits.length),
              );
            }
          },
          onSubmitted: (_) {
            if (!_busy) {
              _verifyOtp();
            }
          },
          decoration: const InputDecoration(
            labelText: 'Шесть цифр',
            prefixIcon: Icon(Icons.sms_outlined),
            counterText: '',
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            TextButton(
              onPressed: _busy
                  ? null
                  : () {
                      _resendTimer?.cancel();
                      setState(() {
                        _step = _RegistrationStep.phone;
                        _challenge = null;
                        _codeController.clear();
                        _error = null;
                      });
                    },
              child: const Text('Изменить номер'),
            ),
            const Spacer(),
            TextButton(
              onPressed: _busy || _resendRemaining > 0
                  ? null
                  : () => _requestOtp(resend: true),
              child: Text(
                _resendRemaining > 0
                    ? 'Повторить через $_resendRemaining с'
                    : 'Отправить ещё раз',
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildProfileStep() {
    return Column(
      key: const ValueKey('profile'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _isDriver ? 'Анкета водителя' : 'О вас',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          _isDriver
              ? 'ФИО должно совпадать с водительским удостоверением.'
              : 'Имя будет отображаться водителю при выполнении заказа.',
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: const Color(0xFF5F6368)),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => _scheduleDraftPersist(),
          decoration: InputDecoration(
            labelText: _isDriver ? 'Полное ФИО' : 'Имя',
            prefixIcon: const Icon(Icons.badge_outlined),
          ),
        ),
        const SizedBox(height: 20),
        if (_isDriver) _buildDriverPhotos() else _buildPassengerPhoto(),
      ],
    );
  }

  Widget _buildPassengerPhoto() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Фотография',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        const Text('Необязательно'),
        const SizedBox(height: 10),
        SizedBox(
          width: 180,
          child: _PhotoTile(
            label: 'Добавить фото',
            file: _avatarPhoto,
            icon: Icons.person_outline,
            onTap: () {
              unawaited(_selectImage(RegistrationUploadKind.avatar));
            },
          ),
        ),
      ],
    );
  }

  Widget _buildDriverPhotos() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Автомобиль',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _vehicleMakeModelController,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => _scheduleDraftPersist(),
          decoration: const InputDecoration(
            labelText: 'Марка и модель',
            hintText: 'Например, Toyota Corolla',
            prefixIcon: Icon(Icons.directions_car_outlined),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _vehicleColorController,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => _scheduleDraftPersist(),
          decoration: const InputDecoration(
            labelText: 'Цвет',
            prefixIcon: Icon(Icons.palette_outlined),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _vehiclePlateController,
          textCapitalization: TextCapitalization.characters,
          onChanged: (_) => _scheduleDraftPersist(),
          decoration: const InputDecoration(
            labelText: 'Госномер',
            hintText: 'А123ВС27',
            prefixIcon: Icon(Icons.pin_outlined),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Водительское удостоверение',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.05,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _PhotoTile(
              label: 'Лицевая сторона',
              file: _licensePhoto,
              icon: Icons.credit_card_outlined,
              aspectRatio: 16 / 10,
              onTap: () {
                unawaited(_selectImage(RegistrationUploadKind.license));
              },
            ),
            _PhotoTile(
              label: 'Оборотная сторона',
              file: _licenseBackPhoto,
              icon: Icons.credit_card_outlined,
              aspectRatio: 16 / 10,
              onTap: () {
                unawaited(_selectImage(RegistrationUploadKind.licenseBack));
              },
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text(
          'Автомобиль с четырёх сторон',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.18,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _carPhotoTile(
              RegistrationUploadKind.carFront,
              'Спереди',
              Icons.directions_car_outlined,
            ),
            _carPhotoTile(
              RegistrationUploadKind.carRear,
              'Сзади',
              Icons.directions_car_filled_outlined,
            ),
            _carPhotoTile(
              RegistrationUploadKind.carLeft,
              'Слева',
              Icons.arrow_back,
            ),
            _carPhotoTile(
              RegistrationUploadKind.carRight,
              'Справа',
              Icons.arrow_forward,
            ),
          ],
        ),
        const SizedBox(height: 14),
        const _ModerationNotice(),
      ],
    );
  }

  Widget _carPhotoTile(
    RegistrationUploadKind kind,
    String label,
    IconData icon,
  ) {
    return _PhotoTile(
      label: label,
      file: _carPhotos[kind],
      icon: icon,
      onTap: () {
        unawaited(_selectImage(kind));
      },
    );
  }

  IconData get _primaryIcon {
    return switch (_step) {
      _RegistrationStep.phone => Icons.sms_outlined,
      _RegistrationStep.code => Icons.verified_outlined,
      _RegistrationStep.profile => Icons.check_outlined,
    };
  }

  String get _primaryLabel {
    return switch (_step) {
      _RegistrationStep.phone => 'Получить код',
      _RegistrationStep.code => 'Подтвердить',
      _RegistrationStep.profile =>
        _isDriver ? 'Отправить на проверку' : 'Завершить регистрацию',
    };
  }

  Future<void> _handlePrimaryAction() {
    return switch (_step) {
      _RegistrationStep.phone =>
        _useLocalAuthBypass ? _completeLocalAuthentication() : _requestOtp(),
      _RegistrationStep.code => _verifyOtp(),
      _RegistrationStep.profile => _submitProfile(),
    };
  }

  Future<void> _completeLocalAuthentication() async {
    final phone = normalizePhoneNumber(_phoneController.text);
    if (phone == null) {
      setState(
        () => _error =
            'Р’РІРµРґРёС‚Рµ РЅРѕРјРµСЂ РІ С„РѕСЂРјР°С‚Рµ +7 999 000-00-00',
      );
      return;
    }

    await _runRequest(() async {
      final digits = phone.replaceAll(RegExp(r'[^0-9]'), '');
      final role = widget.role;
      await _completeAuthentication(
        AuthSession(
          accessToken: 'local-dev-access-token-$digits-${role.name}',
          refreshToken: 'local-dev-refresh-token-$digits-${role.name}',
          accessTokenExpiresInSeconds: 365 * 24 * 60 * 60,
          user: AuthUser(
            id: 'local-dev-$digits-${role.name}',
            phone: phone,
            name: role == AppRole.driver ? 'Local Driver' : 'Local Passenger',
            role: role,
            status: 'active',
            driverVerificationStatus: role == AppRole.driver
                ? 'approved'
                : null,
          ),
        ),
      );
    });
  }

  Future<void> _requestOtp({bool resend = false}) async {
    final phone = normalizePhoneNumber(_phoneController.text);
    if (phone == null) {
      setState(() => _error = 'Введите номер в формате +7 999 000-00-00');
      return;
    }

    await _runRequest(() async {
      final challenge = await widget.authApi.requestOtp(phone);
      _challenge = challenge;
      _codeController.text = challenge.debugCode ?? '';
      _startResendTimer(challenge.resendAfterSeconds);
      if (!resend) {
        _step = _RegistrationStep.code;
      }
    });
  }

  Future<void> _verifyOtp() async {
    final challenge = _challenge;
    final code = _codeController.text.trim();
    if (challenge == null || !RegExp(r'^[0-9]{6}$').hasMatch(code)) {
      setState(() => _error = 'Введите шестизначный код из SMS');
      return;
    }

    await _runRequest(() async {
      final result = await widget.authApi.verifyOtp(
        challengeId: challenge.challengeId,
        code: code,
        role: widget.role,
      );
      switch (result) {
        case ExistingUserAuthenticated(:final session):
          await _completeAuthentication(session);
        case RegistrationRequired(:final registrationToken):
          _registrationToken = registrationToken;
          _step = _RegistrationStep.profile;
      }
    });
  }

  Future<void> _submitProfile() async {
    final token = _registrationToken;
    final name = _nameController.text.trim();
    if (token == null) {
      setState(
        () => _error = 'Срок регистрации истёк. Подтвердите номер снова.',
      );
      return;
    }
    if (name.length < (_isDriver ? 5 : 2)) {
      setState(() => _error = _isDriver ? 'Введите полное ФИО' : 'Введите имя');
      return;
    }
    if (_isDriver &&
        (_licensePhoto == null ||
            _licenseBackPhoto == null ||
            _vehicleMakeModelController.text.trim().length < 2 ||
            _vehicleColorController.text.trim().length < 2 ||
            _vehiclePlateController.text.trim().length < 4 ||
            RegistrationUploadKind.values
                .where((kind) => kind.name.startsWith('car'))
                .any((kind) => !_carPhotos.containsKey(kind)))) {
      setState(
        () => _error =
            'Заполните данные автомобиля, добавьте обе стороны прав и четыре фото машины',
      );
      return;
    }

    await _runRequest(() async {
      if (_isDriver) {
        await _registerDriver(token, name);
      } else {
        await _registerPassenger(token, name);
      }
    });
  }

  Future<void> _registerPassenger(String token, String name) async {
    String? avatarObjectKey;
    if (_avatarPhoto != null) {
      _setProgress('Загружаем фотографию...');
      avatarObjectKey = await widget.authApi.uploadRegistrationImage(
        registrationToken: token,
        kind: RegistrationUploadKind.avatar,
        image: _avatarPhoto!,
      );
    }
    _setProgress('Создаём аккаунт...');
    final session = await widget.authApi.registerPassenger(
      registrationToken: token,
      name: name,
      avatarObjectKey: avatarObjectKey,
    );
    await _completeAuthentication(session);
  }

  Future<void> _registerDriver(String token, String name) async {
    _setProgress('Загружаем фото прав...');
    final licensePhotoKey = await widget.authApi.uploadRegistrationImage(
      registrationToken: token,
      kind: RegistrationUploadKind.license,
      image: _licensePhoto!,
    );
    final licensePhotoBackKey = await widget.authApi.uploadRegistrationImage(
      registrationToken: token,
      kind: RegistrationUploadKind.licenseBack,
      image: _licenseBackPhoto!,
    );

    const carKinds = [
      RegistrationUploadKind.carFront,
      RegistrationUploadKind.carRear,
      RegistrationUploadKind.carLeft,
      RegistrationUploadKind.carRight,
    ];
    final carPhotoKeys = <String>[];
    for (var index = 0; index < carKinds.length; index++) {
      final kind = carKinds[index];
      _setProgress('Загружаем автомобиль ${index + 1} из 4...');
      carPhotoKeys.add(
        await widget.authApi.uploadRegistrationImage(
          registrationToken: token,
          kind: kind,
          image: _carPhotos[kind]!,
        ),
      );
    }

    _setProgress('Отправляем анкету...');
    final session = await widget.authApi.registerDriver(
      registrationToken: token,
      fullName: name,
      licensePhotoKey: licensePhotoKey,
      licensePhotoBackKey: licensePhotoBackKey,
      vehicleMakeModel: _vehicleMakeModelController.text.trim(),
      vehicleColor: _vehicleColorController.text.trim(),
      vehiclePlate: _vehiclePlateController.text.trim().toUpperCase(),
      carPhotoKeys: carPhotoKeys,
    );
    await _completeAuthentication(session);
  }

  Future<void> _completeAuthentication(AuthSession session) async {
    await _clearDraft();
    await widget.authController.acceptSession(session);
    if (mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  void _restoreDraft(RegistrationDraft draft) {
    if (draft.role != widget.role) {
      return;
    }
    _step = _RegistrationStep.profile;
    _registrationToken = draft.registrationToken;
    _nameController.text = draft.name;
    _avatarPhoto = draft.avatarPath == null ? null : XFile(draft.avatarPath!);
    _licensePhoto = draft.licensePath == null
        ? null
        : XFile(draft.licensePath!);
    _licenseBackPhoto = draft.licenseBackPath == null
        ? null
        : XFile(draft.licenseBackPath!);
    _vehicleMakeModelController.text = draft.vehicleMakeModel;
    _vehicleColorController.text = draft.vehicleColor;
    _vehiclePlateController.text = draft.vehiclePlate;
    for (final entry in draft.carPhotoPaths.entries) {
      _carPhotos[entry.key] = XFile(entry.value);
    }
    _pendingPhotoKind = draft.pendingPhotoKind;
  }

  Future<void> _restoreLostImage() async {
    final pendingPhotoKind = _pendingPhotoKind;
    if (pendingPhotoKind == null) {
      return;
    }
    try {
      final response = await _imagePicker.retrieveLostData();
      if (!mounted) {
        return;
      }
      final image = response.file;
      setState(() {
        if (image != null) {
          _assignPhoto(pendingPhotoKind, image);
        } else if (!response.isEmpty) {
          _error = 'Не удалось восстановить фотографию. Выберите её ещё раз.';
        }
        _pendingPhotoKind = null;
      });
      await _persistProfileDraft();
    } on Object {
      if (!mounted) {
        return;
      }
      setState(() {
        _pendingPhotoKind = null;
        _error = 'Не удалось восстановить фотографию. Выберите её ещё раз.';
      });
      await _persistProfileDraft();
    }
  }

  Future<void> _selectImage(RegistrationUploadKind kind) async {
    final source = await _chooseImageSource();
    if (source == null || !mounted) {
      return;
    }

    setState(() {
      _pendingPhotoKind = kind;
      _error = null;
    });
    await _persistProfileDraft();

    try {
      final image = await _imagePicker.pickImage(
        source: source,
        maxWidth: 2400,
        imageQuality: 92,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        if (image != null) {
          _assignPhoto(kind, image);
        }
        _pendingPhotoKind = null;
      });
      await _persistProfileDraft();
    } on Object {
      if (!mounted) {
        return;
      }
      setState(() {
        _pendingPhotoKind = null;
        _error = 'Не удалось открыть камеру. Попробуйте ещё раз.';
      });
      await _persistProfileDraft();
    }
  }

  Future<ImageSource?> _chooseImageSource() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Сфотографировать'),
              onTap: () => Navigator.of(context).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Выбрать из галереи'),
              onTap: () => Navigator.of(context).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }

  void _assignPhoto(RegistrationUploadKind kind, XFile image) {
    switch (kind) {
      case RegistrationUploadKind.avatar:
        _avatarPhoto = image;
        break;
      case RegistrationUploadKind.license:
        _licensePhoto = image;
        break;
      case RegistrationUploadKind.licenseBack:
        _licenseBackPhoto = image;
        break;
      case RegistrationUploadKind.carFront:
      case RegistrationUploadKind.carRear:
      case RegistrationUploadKind.carLeft:
      case RegistrationUploadKind.carRight:
        _carPhotos[kind] = image;
        break;
    }
  }

  void _scheduleDraftPersist() {
    if (_step != _RegistrationStep.profile || _registrationToken == null) {
      return;
    }
    _draftPersistTimer?.cancel();
    _draftPersistTimer = Timer(
      const Duration(milliseconds: 350),
      () => unawaited(_persistProfileDraft()),
    );
  }

  Future<void> _persistProfileDraft() async {
    final registrationToken = _registrationToken;
    if (_step != _RegistrationStep.profile || registrationToken == null) {
      return;
    }
    try {
      await _draftStore.save(
        RegistrationDraft(
          role: widget.role,
          registrationToken: registrationToken,
          name: _nameController.text,
          savedAtEpochMs: DateTime.now().millisecondsSinceEpoch,
          avatarPath: _avatarPhoto?.path,
          licensePath: _licensePhoto?.path,
          licenseBackPath: _licenseBackPhoto?.path,
          vehicleMakeModel: _vehicleMakeModelController.text,
          vehicleColor: _vehicleColorController.text,
          vehiclePlate: _vehiclePlateController.text,
          carPhotoPaths: _carPhotos.map(
            (kind, image) => MapEntry(kind, image.path),
          ),
          pendingPhotoKind: _pendingPhotoKind,
        ),
      );
    } on Object {
      // A temporary storage failure must not stop the camera flow.
    }
  }

  Future<void> _discardDraft() async {
    await _clearDraft();
  }

  Future<void> _clearDraft() async {
    _draftPersistTimer?.cancel();
    try {
      await _draftStore.clear();
    } on Object {
      // The account flow must continue even if a local draft cannot be removed.
    }
    widget.onDraftCleared?.call();
  }

  Future<void> _runRequest(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
      _progressText = null;
    });
    try {
      await action();
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = _friendlyError(error));
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progressText = null;
        });
      }
    }
  }

  String _friendlyError(ApiException error) {
    return switch (error.code) {
      'OTP_INVALID' => 'Неверный код. Проверьте SMS и попробуйте снова.',
      'OTP_EXPIRED' => 'Код истёк. Запросите новый.',
      'OTP_RESEND_TOO_SOON' => 'Новый код пока нельзя отправить.',
      'OTP_RATE_LIMITED' => 'Слишком много запросов. Попробуйте позднее.',
      'PHONE_ALREADY_REGISTERED' => 'Этот номер уже зарегистрирован.',
      'IMAGE_FORMAT_UNSUPPORTED' =>
        'Не удалось прочитать фотографию. Выберите другое изображение.',
      'IMAGE_SIZE_INVALID' => 'Фотография слишком большая или повреждена.',
      _ => error.message,
    };
  }

  void _setProgress(String value) {
    if (mounted) {
      setState(() => _progressText = value);
    }
  }

  void _startResendTimer(int seconds) {
    _resendTimer?.cancel();
    _resendRemaining = seconds;
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || _resendRemaining <= 1) {
        timer.cancel();
        if (mounted) {
          setState(() => _resendRemaining = 0);
        }
        return;
      }
      setState(() => _resendRemaining--);
    });
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step});

  final _RegistrationStep step;

  @override
  Widget build(BuildContext context) {
    final current = step.index + 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Шаг $current из 3',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const Spacer(),
            Text(
              switch (step) {
                _RegistrationStep.phone => 'Телефон',
                _RegistrationStep.code => 'Подтверждение',
                _RegistrationStep.profile => 'Анкета',
              },
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(color: const Color(0xFF5F6368)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: current / 3,
          minHeight: 5,
          borderRadius: BorderRadius.circular(3),
        ),
      ],
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    required this.label,
    required this.file,
    required this.icon,
    required this.onTap,
    this.aspectRatio = 4 / 3,
  });

  final String label;
  final XFile? file;
  final IconData icon;
  final VoidCallback onTap;
  final double aspectRatio;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: file == null
              ? const Color(0xFFD8D8D0)
              : const Color(0xFF1B7F46),
          width: file == null ? 1 : 2,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: AspectRatio(
          aspectRatio: aspectRatio,
          child: file == null
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 30),
                    const SizedBox(height: 8),
                    Text(
                      label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    const Text(
                      'Нажмите, чтобы добавить',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF5F6368), fontSize: 12),
                    ),
                  ],
                )
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    _XFilePreview(file: file!),
                    Positioned(
                      left: 8,
                      right: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.72),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          label,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _XFilePreview extends StatefulWidget {
  const _XFilePreview({required this.file});

  final XFile file;

  @override
  State<_XFilePreview> createState() => _XFilePreviewState();
}

class _XFilePreviewState extends State<_XFilePreview> {
  late Future<Uint8List> _bytes;

  @override
  void initState() {
    super.initState();
    _bytes = widget.file.readAsBytes();
  }

  @override
  void didUpdateWidget(covariant _XFilePreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.file.path != widget.file.path) {
      _bytes = widget.file.readAsBytes();
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List>(
      future: _bytes,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return Image.memory(
          snapshot.data!,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) =>
              const Center(child: Icon(Icons.broken_image_outlined)),
        );
      },
    );
  }
}

class _ErrorMessage extends StatelessWidget {
  const _ErrorMessage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEDEA),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: Color(0xFFB3261E)),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}

class _ModerationNotice extends StatelessWidget {
  const _ModerationNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFE7F7EF),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_user_outlined, color: Color(0xFF006C4D)),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Анкета попадёт администратору. Кабинет водителя откроется после ручного одобрения.',
            ),
          ),
        ],
      ),
    );
  }
}
