export enum RegistrationUploadKind {
  Avatar = 'avatar',
  License = 'license',
  LicenseBack = 'license_back',
  CarFront = 'car_front',
  CarRear = 'car_rear',
  CarLeft = 'car_left',
  CarRight = 'car_right',
}

export const DRIVER_CAR_UPLOAD_KINDS = [
  RegistrationUploadKind.CarFront,
  RegistrationUploadKind.CarRear,
  RegistrationUploadKind.CarLeft,
  RegistrationUploadKind.CarRight,
] as const;
