# API – Access Logs (visit/login/logout)

Ez a modul a belépési és látogatási események naplózására szolgál:

- események: `visit`, `login`, `logout`
- belépési felület: `www` vagy `admin`
- rögzített adatok: felhasználó (ha van), IP, böngésző (`User-Agent`), időpont

## Esemény modell

- `event_type`: `visit` | `login` | `logout`
- `entry_point`: `www` | `admin`
- `ip_address`: a kliens IP-je
- `user_agent`: böngésző azonosító
- `occurred_at`: esemény időpontja
- `user_id`: nullable (anonim látogatásnál `null`)

## Public endpoint (bejelentkezés nélkül is)

### POST `/api/access-logs/visit`

Anonim vagy bejelentkezett látogatás naplózása. A frontend minden oldalbetöltéskor hívhatja.

- **Body**
  - `entry_point` (string, kötelező): `www` vagy `admin`
  - `occurred_at` (date, opcionális): ha nincs, a szerver `now()` értéket használ

Példa:

```bash
curl -X POST http://localhost:8000/api/access-logs/visit \
  -H "Content-Type: application/json" \
  -d '{"entry_point":"www"}'
```

## Auth endpointok

### POST `/api/login`

Login eseményt naplóz, ha a bejelentkezés sikeres.

- **Body**
  - `login` (string, kötelező)
  - `password` (string, kötelező)
  - `entry_point` (string, kötelező): `www` vagy `admin`

### POST `/api/logout`

Kijelentkezteti a jelenlegi tokenes sessiont és `logout` eseményt naplóz.

- **Body**
  - `entry_point` (string, kötelező): `www` vagy `admin`

Példa:

```bash
curl -X POST http://localhost:8000/api/logout \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"entry_point":"admin"}'
```

### GET `/api/access-logs/me`

A bejelentkezett user saját naplói (`visit`, `login`, `logout`) időrendben csökkenően, lapozva.

## Admin endpoint

### GET `/api/access-logs`

Minden napló lekérése (`auth:sanctum` + `admin`).

Szűrők query paraméterekkel:

- `event_type`: `visit` | `login` | `logout`
- `entry_point`: `www` | `admin`
- `user_id`: integer
- `from`: dátum/idő (alsó határ)
- `to`: dátum/idő (felső határ)
- `per_page`: 1..200 (default 100)

Példa:

```bash
curl "http://localhost:8000/api/access-logs?event_type=visit&entry_point=www&per_page=50" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```
