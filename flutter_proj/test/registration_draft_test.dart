import 'package:flutter_proj/core/auth/auth_models.dart';
import 'package:flutter_proj/core/auth/registration_draft_store.dart';
import 'package:flutter_proj/core/models/app_role.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('restores an in-progress driver registration draft', () {
    final original = RegistrationDraft(
      role: AppRole.driver,
      registrationToken: 'temporary-registration-token',
      name: 'Иван Иванович Иванов',
      savedAtEpochMs: DateTime.now().millisecondsSinceEpoch,
      licensePath: '/cache/license.jpg',
      licenseBackPath: '/cache/license-back.jpg',
      vehicleMakeModel: 'Toyota Corolla',
      vehicleColor: 'Белый',
      vehiclePlate: 'А123ВС27',
      carPhotoPaths: const {
        RegistrationUploadKind.carFront: '/cache/front.jpg',
        RegistrationUploadKind.carRear: '/cache/rear.jpg',
      },
      pendingPhotoKind: RegistrationUploadKind.carLeft,
    );

    final restored = RegistrationDraft.fromJson(original.toJson());

    expect(restored.role, AppRole.driver);
    expect(restored.registrationToken, original.registrationToken);
    expect(restored.name, original.name);
    expect(restored.licensePath, original.licensePath);
    expect(restored.licenseBackPath, original.licenseBackPath);
    expect(restored.vehicleMakeModel, 'Toyota Corolla');
    expect(restored.vehicleColor, 'Белый');
    expect(restored.vehiclePlate, 'А123ВС27');
    expect(
      restored.carPhotoPaths[RegistrationUploadKind.carFront],
      '/cache/front.jpg',
    );
    expect(restored.pendingPhotoKind, RegistrationUploadKind.carLeft);
  });

  test('rejects a draft without a registration token', () {
    expect(
      () => RegistrationDraft.fromJson({
        'role': 'driver',
        'savedAtEpochMs': DateTime.now().millisecondsSinceEpoch,
      }),
      throwsFormatException,
    );
  });
}
