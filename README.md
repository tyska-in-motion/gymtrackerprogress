# Gym Progress

Mobilna aplikacja JavaScript do śledzenia progresu na siłowni: wybór osoby chroniony hasłem, start treningu ze stoperem, rekordy, historia, plan tygodnia i profil.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

## Konta w aplikacji

Aplikacja nie używa logowania Google. Po wejściu pyta, kto teraz ćwiczy, a wybór istniejącej osoby lub stworzenie nowej wymaga podania wspólnego hasła dostępu skonfigurowanego na backendzie.

Każde konto ma osobny widok treningów, historii, planów i profilu. Lista kont, dane treningowe i wspólny katalog ćwiczeń są zapisywane na backendzie.

## Trwały zapis danych w PostgreSQL

Backend automatycznie użyje PostgreSQL, gdy ustawisz zmienną środowiskową `DATABASE_URL`, `POSTGRES_URL`, `DATABASE_INTERNAL_URL`, `POSTGRES_INTERNAL_URL`, `POSTGRES_PRISMA_URL` albo `POSTGRES_URL_NON_POOLING`. Przy pierwszym starcie aplikacja sama tworzy tabele:

- `accounts` — profile osób,
- `user_data` — treningi, plany, szkice i szablony w formacie JSONB,
- `catalog_exercises` — wspólna lista ćwiczeń.

Przykład lokalnego uruchomienia z bazą:

```bash
export GYM_ACCESS_PASSWORD="twoje-haslo"
export DATABASE_URL="postgresql://user:password@localhost:5432/gym_progress"
npm start
```

Jeśli nie ustawisz żadnej zmiennej z URL-em do PostgreSQL, aplikacja działa w trybie awaryjnym na plikach `data/*.json`. Ten tryb jest dobry lokalnie, ale na hostingach bez trwałego dysku dane mogą znikać po restarcie lub redeployu.

Jeżeli dostawca bazy nie wymaga SSL, ustaw dodatkowo:

```bash
export PGSSLMODE=disable
```

## Deploy na Render

Utwórz **Web Service** z repozytorium i ustaw:

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment Variable: `GYM_ACCESS_PASSWORD` ustawione na hasło wymagane przy wyborze osoby
- Environment Variable: `DATABASE_URL` ustawione na adres połączenia do PostgreSQL

Na Renderze możesz utworzyć osobną usługę **PostgreSQL** i wkleić jej **Internal Database URL** jako `DATABASE_URL` w ustawieniach Web Service. Musi to być pełny URL z hasłem wygenerowanym przez Render, np. z panelu bazy danych, a nie przykładowe `postgresql://postgres:postgres@...`. Jeśli masz ustawionych kilka zmiennych z URL-em do bazy, aplikacja spróbuje ich po kolei i w logach pokaże, z której zmiennej udało się połączyć, maskując hasło.
