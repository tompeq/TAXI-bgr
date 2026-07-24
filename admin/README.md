# Taxi Bgr Admin

Internal web interface for driver verification and service administration.

## Local start

The backend and its Docker services must be running on port `3000`.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

The local development administrator is created from the backend directory:

```powershell
npm run admin:create -- +79990000000 "Администратор"
```

Development SMS mode returns the test code directly on the login screen.
Production requires a real SMS provider and an explicitly created admin account.
