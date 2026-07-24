# Taxi Bgr Mobile

Flutter application for Taxi Bgr passengers and drivers.

## Implemented

- passenger and driver role selection;
- SMS OTP login and registration through the NestJS backend;
- encrypted access/refresh session storage on the device;
- passenger profile with an optional photo;
- driver application with a license photo and four car photos;
- pending-verification screen with manual status refresh;
- Yandex MapKit address selection and route preview.
- driver order board, navigation and live vehicle tracking;
- configurable driver price and road surveys;
- Firebase push token registration and foreground notifications.

## Local Run

Start Docker and the backend first:

```powershell
cd ..\backend
npm run db:up
npm run migration:run
npm run start:dev
```

Android emulator:

```powershell
flutter run `
  --dart-define=MAPKIT_API_KEY=YOUR_KEY `
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Physical Android device on the same Wi-Fi or LAN:

```powershell
flutter run `
  --dart-define=MAPKIT_API_KEY=YOUR_KEY `
  --dart-define=API_BASE_URL=http://YOUR_COMPUTER_IP:3000/api/v1
```

The backend listens on all local interfaces. Windows Firewall must allow
inbound connections to Node.js on port `3000`.

## Firebase Push

The app builds and runs without Firebase configuration, but push stays
disabled. Before testing real notifications, create Android and iOS apps in a
Firebase project, choose the final application identifiers, add
`android/app/google-services.json` and later
`ios/Runner/GoogleService-Info.plist`, then configure
`FCM_SERVICE_ACCOUNT_BASE64` on the backend. These files contain project
configuration and must not be replaced with the Yandex MapKit key.

## Checks

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

The live auth smoke test requires the local backend in `SMS_MODE=mock`:

```powershell
flutter test tool\auth_smoke.dart
```

The smoke test creates a temporary driver and uploaded documents. Remove its
data after a manual run if the test environment is shared.
