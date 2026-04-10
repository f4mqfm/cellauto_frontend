# API – Color lists & Colors

A `color_lists` tábla a felhasználó **színpaletta-listáinak** nevét tárolja; a `colors` tábla egy listához tartozó **színeket** stringként (`color`) és **sorrend** szerinti pozícióval (`position`).

## Auth

Minden végpont **védett**: `auth:sanctum` (Bearer token).

```
Authorization: Bearer <TOKEN>
```

## Adatmodell (MySQL)

- **color_lists**: `id`, `user_id`, `name`
- **colors**: `id`, `list_id`, `color` (max 50 char a migráció/séma alapján), `position` (egész, **listán belül egyedi**)

A backend opcionálisan hozzáadja a `created_at` / `updated_at` mezőket migrációval (`2026_04_10_000001_*`, `2026_04_10_000002_*`), hogy az Eloquent timestamp kezelése működjön.

## Color listák (`color_lists`)

### GET `/api/color-lists`

A bejelentkezett user saját színes listái (`id` csökkenő sorrend).

### POST `/api/color-lists`

Új lista.

- **Body**: `name` (string, max 255)
- **201**: a létrehozott lista rekord

### GET `/api/color-lists/{color_list}`

Egy lista **a színeivel** (`colors` reláció betöltve). A színek **`position`, majd `id`** szerint rendezve jönnek.

- **403**: nem a user listája

### PUT `/api/color-lists/{color_list}`

Átnevezés: `name` (string, max 255).

### DELETE `/api/color-lists/{color_list}`

Lista törlése; a hozzá tartozó `colors` sorok is törlődnek.

## Színek (`colors`)

### GET `/api/color-lists/{color_list}/colors`

Lista színei, **`position` szerint** (majd `id`).

### POST `/api/color-lists/{color_list}/colors`

Új szín a listában.

- **Body**
  - `color` (string, max 50)
  - `position` (integer, ≥ 0) – **egyedi** adott `list_id` mellett (DB: `UNIQUE(list_id, position)`)

Duplikált `position` esetén **422** validációs hiba.

Példa:

```bash
curl -X POST http://localhost:8000/api/color-lists/1/colors \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"color":"#FF0000","position":0}'
```

### PUT `/api/color-lists/{color_list}/colors/{color}`

Részleges frissítés: legalább egy mező kell.

- **Body (opcionális mezők)**
  - `color` (string, max 50)
  - `position` (integer, ≥ 0, listán belül egyedi, a jelenlegi sor kivételével)

Ha egyik mező sincs a kérésben: **422** `{"error":"Nincs frissítendő mező"}`.

- **403**: nem a user listája
- **404**: a `{color}` nem ehhez a listához tartozik

### DELETE `/api/color-lists/{color_list}/colors/{color}`

Szín törlése.

## Megjegyzés a `position` mezőről

Ha két elem helyét egyszerre cserélnéd (pl. 0 ↔ 1), egy egyszerű két lépéses `PUT` ütközhet az egyediség miatt. Ilyenkor vagy átmeneti pozíciót használj a kliensen, vagy később érdemes lehet dedikált „reorder” endpointot adni.
