# Cellauto API (Laravel) – Backend dokumentáció

Ez a projekt egy **Laravel 12** alapú backend (PHP \(^8.2\)), API autentikációval **Laravel Sanctum** segítségével.

## Gyors áttekintés

- **Framework**: Laravel \(12\)
- **PHP**: 8.2+
- **Auth**: Sanctum personal access token (Bearer token)
- **DB alapértelmezetten**: SQLite \(lokális fejlesztéshez\)
- **Queue**: database driver \(jobs tábla\)
- **Frontend build**: Vite (Tailwind), a repo tartalmaz `package.json`-t is

Belépési pontok / routing:

- Web: `routes/web.php`
- API: `routes/api.php`
- Middleware aliasok: `bootstrap/app.php`

## Telepítés és futtatás

### Előfeltételek

- PHP 8.2+
- Composer
- Node.js + npm

### Gyors setup (ajánlott)

A `composer.json` tartalmaz egy `setup` scriptet, ami a tipikus lépéseket elvégzi:

```bash
composer run setup
```

Ez a következőket futtatja:

- `composer install`
- `.env` létrehozása `.env.example` alapján (ha még nincs)
- `php artisan key:generate`
- `php artisan migrate --force`
- `npm install`
- `npm run build`

### Fejlesztői mód

```bash
composer run dev
```

Ez egyszerre indítja:

- `php artisan serve` (backend)
- `php artisan queue:listen ...` (queue worker)
- `php artisan pail ...` (log/trace nézet)
- `npm run dev` (vite)

### Tesztek

```bash
composer run test
```

## Környezeti változók (.env)

Kiindulás: `.env.example`

Legfontosabbak:

- **APP\_KEY**: kötelező (setup generálja)
- **APP\_URL**: lokális/prod URL
- **DB\_CONNECTION**: alapból `sqlite`
- **DB\_DATABASE**: sqlite fájl elérési út (alap: `database/database.sqlite`)
- **QUEUE\_CONNECTION**: alapból `database`
- **SESSION\_DRIVER / CACHE\_STORE**: alapból `database`
- **SANCTUM\_STATEFUL\_DOMAINS**: SPA cookie-s (stateful) használat esetén

Megjegyzés: ebben a projektben a védett API végpontok az `auth:sanctum` middleware-t használják; tipikusan **Bearer token**-nel (personal access token) történik a hitelesítés.

## Adatmodell – User

### Tábla mezők

A felhasználók táblája a default Laravel mezőkön túl kiegészül:

- **username**: unique
- **role**: alapértelmezetten `vendeg`
- **active**: bool, alapértelmezetten `true`
- **suspended_at**: timestamp, nullable

Migrációk:

- `database/migrations/0001_01_01_000000_create_users_table.php`
- `database/migrations/2026_04_07_171316_add_admin_fields_to_users_table.php`

### Felfüggesztés logika

Bejelentkezéskor a rendszer **nem ad tokent**, ha:

- `active` false **vagy**
- `suspended_at` nem null

Lásd: `app/Http/Controllers/AuthController.php`

## Adatmodell – lists / words

A `words` táblában a szó szövege és a megjelenési **sorrend** (`position`) is listán belül egyedi: `UNIQUE(list_id, word)` és `UNIQUE(list_id, position)`. Részletek és API: `docs/api-lists-words.md`. Séma bővítés migráció: `database/migrations/2026_04_10_100000_add_position_to_words_table.php`.

## Adatmodell – táblaállapot mentések (`board_save_groups`, `board_saves`)

Felhasználónként csoportok és név szerinti mentések (JSON **payload**). Migrációk: `2026_04_10_120000_create_board_save_groups_table.php`, `2026_04_10_120001_create_board_saves_table.php`. API spec (végpontok még implementálandók): `docs/api-board-saves.md`.

## Middleware / jogosultság

Az `admin` middleware alias itt van regisztrálva:

- `bootstrap/app.php` → `'admin' => \App\Http\Middleware\AdminMiddleware::class`

Az `AdminMiddleware` akkor enged tovább, ha:

- van bejelentkezett user, és a `role === 'admin'`

## API végpontok

Alap útvonal fájl: `routes/api.php`

Részletes endpoint dokumentáció:

- Users: `docs/api-users.md`
- Lists & Words: `docs/api-lists-words.md`
- Color lists & Colors: `docs/api-color-lists-colors.md`
- Táblaállapot mentések (spec): `docs/api-board-saves.md`
- Adatbázis séma (MySQL, táblák + `CREATE TABLE`): `docs/database-schema.md`

### Public

- **GET `/api/ping`**
  - Válasz: `{"ok": true, "message": "API mukodik"}`
- **POST `/api/login`**
  - Body mezők:
    - `login`: email *vagy* username
    - `password`
  - Siker esetén:
    - `token`: Sanctum personal access token (plain text)
    - `user`: user objektum
  - Hibák:
    - 401: hibás adatok
    - 403: felfüggesztett/inaktív user

### Auth (Sanctum)

Middleware: `auth:sanctum`

- **GET `/api/users`**
  - Listázás (minden user)
- **GET `/api/user`**
  - Aktuális bejelentkezett user (`$request->user()`)

### Auth + Admin

Middleware: `auth:sanctum` + `admin`

- **POST `/api/users`**
  - Új user létrehozása
  - Body mezők (jelenlegi implementáció szerint):
    - `name`, `email`, `username`, `password`
    - `role` (opcionális; default `vendeg`)
- **POST `/api/users/{id}/suspend`**
  - User felfüggesztése: `active=false`, `suspended_at=now()`
- **POST `/api/users/{id}/unsuspend`**
  - User visszaaktiválása: `active=true`, `suspended_at=null`
- **PUT `/api/users/{id}`**
  - User frissítése (name/email/username/role + opcionális password)

### Auth header példa

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/user
```

## Ismert technikai megjegyzések / fejlesztői teendők

- **Validáció**: a controllerek jelenleg nem használnak form request validációt (`$request->...` közvetlenül). Éles környezethez érdemes mező- és jogosultság-validációt hozzáadni.
- **Hibakezelés / response forma**: az API válaszok vegyesek; érdemes egységes JSON error formátumot bevezetni.
- **Role enum**: a `role` mező sztring; ha fix szerepkörök vannak, érdemes konstans/enum szerű kezelést kialakítani.

