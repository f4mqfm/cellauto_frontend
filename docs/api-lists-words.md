# API – Lists & Words

Ez a rész a szólisták (`lists`) és a listán belüli szavak (`words`) CRUD végpontjait írja le.

## Adatmodell (`words`)

- `list_id`, `word` (VARCHAR 255)
- `position` (INT, ≥ 0) – **listán belül egyedi** (`UNIQUE(list_id, position)`)
- `word` listán belül is **egyedi** (`UNIQUE(list_id, word)`)
- Opcionálisan: `created_at` / `updated_at` (Laravel migráció alapján)

A listák lekérésekor a beágyazott `words` tömb **`position`, majd `id`** szerint rendezett.

## Auth

Minden itt leírt végpont **védett**: `auth:sanctum` szükséges.

### Bearer token header

```
Authorization: Bearer <TOKEN>
```

## Listák (lists)

### GET `/api/lists`

A bejelentkezett user **saját listái**.

### POST `/api/lists`

Lista létrehozása.

- **Body**
  - `name` (string, kötelező, max 255)

- **201 Created válasz**
  - lista rekord (legalább: `id`, `user_id`, `name`)

Példa:

```bash
curl -X POST http://localhost:8000/api/lists \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"angol szavak"}'
```

### GET `/api/lists/{list}`

Egy lista lekérése **a szavaival együtt** (`words` reláció betöltve, rendezve `position` szerint).

- **Jogosultság**
  - Ha a lista nem a useré: **403** `{"error":"Nincs jogosultság"}`

### PUT `/api/lists/{list}`

Lista átnevezése.

- **Body**
  - `name` (string, kötelező, max 255)

- **Jogosultság**
  - Ha nem a useré: **403**

### DELETE `/api/lists/{list}`

Lista törlése.

- **Mellékhatás**
  - a lista összes szava is törlődik (`words` rekordok)

- **Jogosultság**
  - Ha nem a useré: **403**

## Szavak (words) egy listán belül

### GET `/api/lists/{list}/words`

A lista szavai **`position` szerint** (majd `id`).

- **Jogosultság**
  - Ha nem a useré: **403**

### POST `/api/lists/{list}/words`

Szó hozzáadása a listához.

- **Body**
  - `word` (string, kötelező, max 255)
  - `position` (integer, kötelező, ≥ 0) – listán belül egyedi

- **Egyediség**
  - `(list_id, word)` és `(list_id, position)` egyedi; ütközés esetén **422**.

Példa:

```bash
curl -X POST http://localhost:8000/api/lists/1/words \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"word":"apple","position":0}'
```

### PUT `/api/lists/{list}/words/{word}`

Szó szerkesztése (részlegesen: legalább egy mező kell).

- **Body (opcionális mezők)**
  - `word` (string, max 255) – listán belül egyedi (a jelenlegi sor kivételével)
  - `position` (integer, ≥ 0) – listán belül egyedi (a jelenlegi sor kivételével)

Ha egyik mező sincs: **422** `{"error":"Nincs frissítendő mező"}`.

- **Jogosultság és konzisztencia**
  - Ha a lista nem a useré: **403**
  - Ha a `{word}` nem ehhez a listához tartozik: **404** `{"error":"A szó nem ehhez a listához tartozik"}`

### DELETE `/api/lists/{list}/words/{word}`

Szó törlése.

- **Jogosultság és konzisztencia**
  - Ha a lista nem a useré: **403**
  - Ha a `{word}` nem ehhez a listához tartozik: **404**

## Megjegyzés a `position` mezőről (*reorder*)

Ha két szó helyét egyszerre cserélnéd, az egyediség miatt két egymást követő `PUT` ütközhet. Ilyenkor használj átmeneti `position` értéket a kliensen, vagy később dedikált „reorder” endpoint készíthető.
