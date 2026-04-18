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
- **SANCTUM\_IDLE\_TIMEOUT**: token inaktivitási timeout percben (alap: `120`)

Megjegyzés: ebben a projektben a védett API végpontok az `auth:sanctum` middleware-t használják; tipikusan **Bearer token**-nel (personal access token) történik a hitelesítés.

## CORS (külön domain: admin vs API)

Ha a frontend (pl. `https://admin.cellauto.ro`) és az API (`https://api.cellauto.ro`) **külön origin**, a böngésző CORS előtétet küld. A Laravel ezt a `config/cors.php` és a `HandleCors` middleware kezeli.

- Alapértelmezés: ha a `.env`-ben a `CORS_ALLOWED_ORIGINS` üres, engedett az összes origin (`*`).
- Éles környezetben érdemes explicit listát megadni:  
  `CORS_ALLOWED_ORIGINS=https://admin.cellauto.ro,https://www.cellauto.ro`
- Ha a frontend **cookie-s** Sanctum / `credentials: include` módot használ, állítsd `CORS_SUPPORTS_CREDENTIALS=true`-ra, és **ne** használj `*`-ot originnek, csak konkrét hostokat.

A DNS és az Apache proxyn csak azt dönti el, hogy az `api.cellauto.ro` a szerverre mutat-e; a CORS fejlécet a Laravel adja vissza a megfelelő **API** virtuális host konfigurációban.

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

A `lists_word` tábla opcionálisan tartalmaz `notes` (többsoros megjegyzés) és `wordlist` (nagy szövegblokk, admin által szerkesztett, pl. pontosvesszővel tagolt szavak) mezőket; az API csak tárolja őket. Migrációk: `2026_04_16_160000_add_notes_and_wordlist_text_to_lists_table.php`, `2026_04_17_120000_rename_lists_to_lists_word_table.php`.

A `words` tábla generáció-alapú: `generation` mezővel kezeli a `GEN1..GENN` szinteket. Egy szó azonos listában és azonos generációban egyedi (`UNIQUE(list_id, generation, word)`). Generációnként opcionális „helyes / helytelen” szövegek: `word_gen_messages` tábla (`database/migrations/2026_04_17_130000_create_word_gen_messages_table.php`). Részletek és API: `docs/api-lists-words.md`. Séma bővítés migrációk: `database/migrations/2026_04_14_120000_add_generation_to_words_table.php`, `database/migrations/2026_04_14_130000_drop_position_from_words_table.php`.

## Adatmodell – táblaállapot mentések (`board_save_groups`, `board_saves`)

Felhasználónként csoportok és név szerinti mentések (JSON **payload**). Migrációk: `2026_04_10_120000_create_board_save_groups_table.php`, `2026_04_10_120001_create_board_saves_table.php`. API és végpontok: `docs/api-board-saves.md`; követelmények: `docs/kovetelmenyspecifikacio-tablamentesek.md`. Ütemezett fejlesztések: `docs/implementacios-terv.md`.

## Adatmodell – hozzáférési naplók (`access_logs`)

A rendszer naplózza a `visit`, `login`, `logout` eseményeket, `entry_point` jelöléssel (`www` vagy `admin`), IP címmel, böngésző azonosítóval és időponttal. Az anonim (`www`) látogatások is naplózódnak (`user_id = null`). Migráció: `2026_04_14_150000_create_access_logs_table.php`. API: `docs/api-access-logs.md`.

## Middleware / jogosultság

Az `admin` middleware alias itt van regisztrálva:

- `bootstrap/app.php` → `'admin' => \App\Http\Middleware\AdminMiddleware::class`

Az `AdminMiddleware` akkor enged tovább, ha:

- van bejelentkezett user, és a `role === 'admin'`

## API végpontok

Alap útvonal fájl: `routes/api.php`

Részletes endpoint dokumentáció:

- Users: `docs/api-users.md`
- Access logs: `docs/api-access-logs.md`
- Lists & Words: `docs/api-lists-words.md`
- Task saves & evaluations: `docs/api-task-saves.md`
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
    - `entry_point`: `www` vagy `admin`
  - Siker esetén:
    - `token`: Sanctum personal access token (plain text)
    - `user`: user objektum
  - Hibák:
    - 401: hibás adatok
    - 403: felfüggesztett/inaktív user
- **POST `/api/access-logs/visit`**
  - Nyilvános oldal-látogatás naplózása (auth nélkül is)
  - Body: `entry_point` (`www`/`admin`), opcionális `occurred_at`

### Auth (Sanctum)

Middleware: `auth:sanctum`

- **GET `/api/users`**
  - Listázás (minden user)
- **GET `/api/user`**
  - Aktuális bejelentkezett user (`$request->user()`)
- **POST `/api/logout`**
  - Kijelentkezés + `logout` napló esemény
- **GET `/api/access-logs/me`**
  - Saját felhasználói naplók (`visit`/`login`/`logout`)

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
- **GET `/api/access-logs`**
  - Összes napló admin lekérdezése (szűrhető)
- **GET `/api/admin/users/online-status`**
  - Admin státuszlista: felhasználónként bejelentkezve/nincs bejelentkezve

### Auth header példa

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/user
```

## Ismert technikai megjegyzések / fejlesztői teendők

- **Validáció**: a controllerek jelenleg nem használnak form request validációt (`$request->...` közvetlenül). Éles környezethez érdemes mező- és jogosultság-validációt hozzáadni.
- **Hibakezelés / response forma**: az API válaszok vegyesek; érdemes egységes JSON error formátumot bevezetni.
- **Role enum**: a `role` mező sztring; ha fix szerepkörök vannak, érdemes konstans/enum szerű kezelést kialakítani.

