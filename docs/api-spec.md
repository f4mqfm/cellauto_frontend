# Cellauto Admin API specifikáció

## Általános

- **Alap URL példa**: `http://cellauto.local/api`
- **Auth típusa**: Bearer token (login után kapott token)
  - **Header**: `Authorization: Bearer TOKEN`
- **JSON kommunikáció**
  - `Content-Type: application/json`
  - `Accept: application/json`

## Felhasználó modell

```json
{
  "id": 1,
  "username": "admin",
  "name": "Admin",
  "email": "admin@cellauto.ro",
  "role": "admin",
  "active": 1,
  "suspended_at": null,
  "email_verified_at": null,
  "created_at": "2026-04-07T17:22:02.000000Z",
  "updated_at": "2026-04-07T17:22:02.000000Z"
}
```

## Szerepkörök

Lehetséges `role` értékek:

- `vendeg`
- `diak`
- `tanar`
- `admin`

## Állapot

- **Aktív**, ha: `active = 1` és `suspended_at = null`
- **Felfüggesztett**, ha: `active = 0` és `suspended_at != null`

## Auth végpontok

### 1. Bejelentkezés

`POST /login`

Belépés **username vagy email + jelszó** alapján.

Request:

```json
{
  "login": "admin@cellauto.ro",
  "password": "123456"
}
```

- **Megjegyzés**: a `login` mezőbe mehet email (`admin@cellauto.ro`) vagy username (`admin`).
- **Követelmény**: a backend a `login` mezőben a **username és email** értéket is elfogadja.

Sikeres válasz:

```json
{
  "token": "1|xxxxxxxxxxxxxxxx",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "Admin",
    "email": "admin@cellauto.ro",
    "role": "admin",
    "active": 1,
    "suspended_at": null,
    "email_verified_at": null,
    "created_at": "2026-04-07T17:22:02.000000Z",
    "updated_at": "2026-04-07T17:22:02.000000Z"
  }
}
```

Hibák:

- **Hibás adatok**: HTTP 401

```json
{ "error": "Hibás adatok" }
```

- **Felfüggesztett user**: HTTP 403

```json
{ "error": "A felhasználó fel van függesztve" }
```

### 2. Aktuális user lekérdezése

`GET /user`

Auth szükséges.

Válasz: az aktuális belépett user objektuma.

### 3. API elérhetőség teszt

`GET /ping`

Válasz:

```json
{ "ok": true, "message": "API mukodik" }
```

## Felhasználókezelés

### Jogosultság

Auth-tal elérhető:

- `GET /users`
- `GET /user`

Csak adminnal elérhető:

- `POST /users`
- `PUT /users/{id}`
- `DELETE /users/{id}`
- `POST /users/{id}/suspend`
- `POST /users/{id}/unsuspend`

Ha nincs jogosultság: HTTP 403

```json
{ "error": "Nincs jogosultság" }
```

### 4. Felhasználók listázása

`GET /users` (Auth szükséges)

Válasz:

```json
[
  {
    "id": 1,
    "username": "admin",
    "name": "Admin",
    "email": "admin@cellauto.ro",
    "role": "admin",
    "active": 1,
    "suspended_at": null,
    "email_verified_at": null,
    "created_at": "2026-04-07T17:22:02.000000Z",
    "updated_at": "2026-04-07T17:22:02.000000Z"
  }
]
```

Frontend megjegyzés: a lista jelenleg nincs lapozva/szűrve/keresve.

### 5. Felhasználó létrehozása

`POST /users` (csak admin)

Request:

```json
{
  "name": "Teszt User",
  "email": "teszt@example.com",
  "password": "123456",
  "username": "tesztuser",
  "role": "vendeg"
}
```

Megjegyzés: ha `role` nincs megadva, alapértelmezett: `"vendeg"`.

### 6. Felhasználó szerkesztése

`PUT /users/{id}` (csak admin)

Részleges módosítás is működik.

Request példa:

```json
{
  "name": "Új Név",
  "email": "uj@email.ro",
  "username": "ujuser",
  "role": "tanar",
  "password": "ujjelszo"
}
```

Megjegyzés: csak a megadott mezők változnak.

### 7. Felhasználó törlése

`DELETE /users/{id}` (csak admin)

Válasz:

```json
{ "message": "Felhasználó törölve" }
```

### 8. Felhasználó felfüggesztése

`POST /users/{id}/suspend` (csak admin)

Hatás:

- `active = false`
- `suspended_at = now()`

### 9. Felhasználó visszaaktiválása

`POST /users/{id}/unsuspend` (csak admin)

Hatás:

- `active = true`
- `suspended_at = null`

