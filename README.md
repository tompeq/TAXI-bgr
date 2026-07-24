# Taxi BGR

Local taxi service for Bogorodskoye, Khabarovsk Krai.

The repository contains three applications:

- `flutter_proj` - Flutter passenger and driver mobile application.
- `backend` - NestJS API, database migrations, Docker Compose services.
- `admin` - web administration panel.

## Local development

Backend:

```powershell
cd backend
Copy-Item .env.example .env
npm ci
npm run start:dev
```

Admin panel:

```powershell
cd admin
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Flutter app:

```powershell
cd flutter_proj
flutter pub get
flutter run --dart-define=MAPKIT_API_KEY=YOUR_MAPKIT_KEY --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/v1
```

For a release build with the optional in-app updater, provide the update
manifest URL explicitly. Keep the real server address in local environment
settings only:

```powershell
flutter build apk --release `
  --dart-define=MAPKIT_API_KEY=YOUR_MAPKIT_KEY `
  --dart-define=API_BASE_URL=http://YOUR_SERVER_IP:3000/api/v1 `
  --dart-define=UPDATE_MANIFEST_URL=http://YOUR_SERVER_IP:8080/taxi-bgr-update.json
```

