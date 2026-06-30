# Gym Progress

Mobilna aplikacja JavaScript do śledzenia progresu na siłowni: logowanie Google, start treningu ze stoperem, rekordy, historia, plan tygodnia i profil.

## Uruchomienie lokalne

```bash
npm run dev
```

## Google login

Aplikacja używa Firebase Authentication. Utwórz projekt Firebase, włącz provider **Google** i dodaj domenę aplikacji do Authorized domains.

W Render skonfiguruj zmienne środowiskowe:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Backend weryfikuje token Firebase ID przez Firebase Admin SDK dla każdego endpointu `/api/*`, a dane użytkownika zapisuje osobno pod jego `uid`.

Dodatkowo skonfiguruj jedną ze zmiennych dla Firebase Admin SDK:

- `GOOGLE_APPLICATION_CREDENTIALS` wskazujące plik JSON konta serwisowego, albo
- `FIREBASE_SERVICE_ACCOUNT` z pełnym JSON konta serwisowego, albo
- `FIREBASE_SERVICE_ACCOUNT_BASE64` z tym samym JSON zakodowanym base64.

Bez zmiennych `VITE_FIREBASE_*` aplikacja uruchamia tryb demo tylko do podglądu UI. Chronione endpointy backendu wymagają poprawnej konfiguracji Firebase Admin SDK.

## Deploy na Render

Utwórz **Web Service** z repozytorium i ustaw:

- Build Command: `npm install && npm run build`
- Start Command: `npm start`

Po pierwszym deployu dodaj domenę Render w Firebase Auth.
