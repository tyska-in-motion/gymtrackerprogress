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

Bez tych zmiennych aplikacja uruchamia tryb demo bez ekranu logowania, co ułatwia podgląd UI.

## Deploy na Render

Utwórz **Static Site** z repozytorium i ustaw:

- Build Command: `npm run build`
- Publish Directory: `dist`

Po pierwszym deployu dodaj domenę Render w Firebase Auth.
