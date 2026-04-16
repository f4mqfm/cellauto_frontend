# API – Users

Minden user végpont JSON-t ad vissza. A védett végpontokhoz **Laravel Sanctum Bearer token** kell.

A védett endpointoknál inaktivitási timeout van: ha a token túl régóta nem használt, a backend törli és új bejelentkezést kér.

## Auth

### Bearer token header

```
Authorization: Bearer <TOKEN>
```

## Public

### POST `/api/login`

Bejelentkezés email *vagy* username alapján.

- **Body**
  - `login` (string, kötelező): email vagy username
  - `password` (string, kötelező)
  - `entry_point` (string, kötelező): `www` vagy `admin`

- **200 OK válasz**
  - `token` (string): plain text Sanctum token
  - `user` (object): user adatok

- **Hibák**
  - **401** `{"error":"Hibás adatok"}`
  - **403** `{"error":"A felhasználó fel van függesztve"}`

Példa:

```bash
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin@example.com","password":"secret","entry_point":"admin"}'
```

### POST `/api/logout`

Kijelentkezés az aktuális tokennel. A rendszer naplózza az eseményt (`logout`).

- **Body**
  - `entry_point` (string, kötelező): `www` vagy `admin`

```bash
curl -X POST http://localhost:8000/api/logout \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"entry_point":"www"}'
```

## Auth (Sanctum)

### GET `/api/user`

Visszaadja az aktuális bejelentkezett usert.

- **Lejárat / inaktivitás**
  - Ha a token inaktív túl sokáig: **401** `{"error":"A munkamenet inaktivitás miatt lejárt, jelentkezz be újra"}`
  - Ha a user időközben inaktív/felfüggesztett: **403** és a token törlésre kerül

```bash
curl http://localhost:8000/api/user \
  -H "Authorization: Bearer <TOKEN>"
```

### GET `/api/users`

User lista (jelenlegi implementáció: **minden user**).

```bash
curl http://localhost:8000/api/users \
  -H "Authorization: Bearer <TOKEN>"
```

## Auth + Admin

Ezekhez `auth:sanctum` + `admin` middleware kell.

### GET `/api/admin/users/online-status`

Admin felülethez státuszlista: ki van jelenleg bejelentkezve és ki nincs.

- **Mit ad vissza userenként**
  - `is_logged_in` (boolean): van-e aktív Sanctum token
  - `active_token_count` (integer): aktív tokenek száma
  - `last_seen_at` (datetime|null): utolsó naplózott aktivitás (`visit/login/logout`)
  - alap user adatok: `id`, `name`, `email`, `username`, `role`, `active`

Példa:

```bash
curl http://localhost:8000/api/admin/users/online-status \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

### POST `/api/users`

Új user létrehozása.

- **Body (jelenlegi implementáció szerint)**
  - `name` (string, kötelező)
  - `email` (string, kötelező)
  - `username` (string, kötelező)
  - `password` (string, kötelező)
  - `role` (string, opcionális; default: `vendeg`)

### PUT `/api/users/{id}`

User frissítése.

- **Body**
  - `name`, `email`, `username`, `role` (opcionális)
  - `password` (opcionális; ha megadod, újrahash-eli)

### POST `/api/users/{id}/suspend`

Felfüggesztés: `active=false`, `suspended_at=now()`

### POST `/api/users/{id}/unsuspend`

Visszaaktiválás: `active=true`, `suspended_at=null`

