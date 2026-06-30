# Gym Progress

Mobilna aplikacja JavaScript do śledzenia progresu na siłowni: wybór osoby chroniony hasłem, start treningu ze stoperem, rekordy, historia, plan tygodnia i profil.

## Uruchomienie lokalne

```bash
npm run dev
```

## Konta w aplikacji

Aplikacja nie używa logowania Google. Po wejściu pyta, kto teraz ćwiczy, a wybór istniejącej osoby lub stworzenie nowej wymaga podania wspólnego hasła dostępu skonfigurowanego na backendzie.

Każde konto ma osobny widok treningów, historii, planów i profilu. Lista kont jest zapisywana w przeglądarce, a dane treningowe są zapisywane przez backend w `data/users.json` pod technicznym identyfikatorem konta.

## Deploy na Render

Utwórz **Web Service** z repozytorium i ustaw:

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment Variable: `GYM_ACCESS_PASSWORD` ustawione na hasło wymagane przy wyborze osoby
