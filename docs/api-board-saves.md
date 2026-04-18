# API – Táblaállapot mentések (csoportok + név szerinti slotok)

A sejtautomata **táblaállapotát** a bejelentkezett felhasználó **saját csoportjaiban**, **névvel** elmentheti. Egy mentés tartalmazza, **milyen típusú tábláról** mentettünk (négyzetes / hex), a **szomszédsági módot**, a **játék módot**, és a **cellák értékeit**.

## Auth

Minden végpont **védett**: `auth:sanctum` (Bearer token), ugyanúgy mint a `docs/api-spec.md` és `docs/api-lists-words.md`.

```
Authorization: Bearer <TOKEN>
Accept: application/json
Content-Type: application/json
```

## Fogalmak

| Fogalom | Jelentés |
|--------|----------|
| **Csoport** | Felhasználói mappa (pl. „Gyakorlatok”, „ZH feladatok”). |
| **Mentés** | Egy elnevezett pillanatkép a tábláról; mindig **egy csoporton belül** van. |

## Adatmodell (Laravel migráció)

A táblák a repóban léteznek; részletes oszlopok és `SHOW CREATE TABLE` kimenetek: **`docs/database-schema.md`**.

| Tábla | Migráció fájl |
|--------|----------------|
| `board_save_groups` | `database/migrations/2026_04_10_120000_create_board_save_groups_table.php` |
| `board_saves` | `database/migrations/2026_04_10_120001_create_board_saves_table.php` |

**Rövid összefoglaló:**

- `board_save_groups`: `user_id`, `name`, opcionális `position`, `timestamps`. FK: `user_id` → `users` **ON DELETE CASCADE**.
- `board_saves`: `user_id`, `board_save_group_id`, `name`, `payload` (JSON), `timestamps`. **UNIQUE** `(board_save_group_id, name)`. FK-k: csoport és user törlésekor **CASCADE**.

**MySQL / MariaDB / SQLite:** a Laravel `json()` oszlop MySQL 5.7.8+ / MariaDB 10.2.7+ alatt natív `JSON`; fejlesztői SQLite-ban is támogatott. InnoDB + `utf8mb4` a production MySQL sémában (`database-schema.md`).

---

## Payload séma (JSON)

A `board_saves.payload` egy **objektum**; a frontend és backend ugyanezt a sémát használja.

### Kötelező meta

| Kulcs | Típus | Leírás |
|-------|--------|--------|
| `schemaVersion` | int | Jelenleg: **1**. Későbbi változásnál növelni. |
| `board` | string | `"square"` \| `"hex"` – négyzetes vagy hex tábla. |
| `neighbors` | string | `side` \| `apex` \| `hex` \| `life` \| `life_hex` – ugyanaz, mint a UI `neighbors` select. |
| `mode` | string | `"play"` \| `"test"` – játék / teszt mód. |

### Cellák – két megengedett forma (egy mentésben **egy** legyen kitöltve)

**A) Ritka (sparse) – ajánlott (kisebb JSON)**

| Kulcs | Típus | Leírás |
|-------|--------|--------|
| `cells` | tömb | Minden elem: `{ "x": int, "y": int, "v": int }` ahol `v` a cella értéke (0 = üres nem kötelező tárolni). |

- `x`, `y`: a játék **belső** indexelése, **0..viewCol-1** és **0..viewRow-1** (a frontend `matrix[x][y]` szerint).
- Csak **nem nulla** vagy releváns cellákat kell küldeni (üres = nincs a listában, vagy explicit `v: 0`).

**B) Teljes rács – opcionális**

| Kulcs | Típus | Leírás |
|-------|--------|--------|
| `viewRow` | int | Pl. 31 |
| `viewCol` | int | Pl. 31 |
| `matrix` | tömb | Kétdimenziós: `matrix[x][y]` értékek, `viewCol` × `viewRow` méret. |

A backend **elfogadhatja mindkettőt**; mentéskor a frontend választhat. Visszaadáskor elég **egy** formát visszaadni (ajánlott: ugyanaz, amit mentéskor kaptunk, vagy mindig `cells` sparse).

### Opcionális kontextus (UI visszatöltéshez)

| Kulcs | Típus | Leírás |
|-------|--------|--------|
| `wordListId` | int \| null | Melyik szólista volt kiválasztva (`/api/lists` id), ha volt. |
| `colorListId` | int \| null | Melyik színpaletta (`/api/color-lists` id), ha volt. |
| `maxLevel` | int | Max generáció (UI `level` select). |
| `delay` | number | Késleltetés mp-ben. |
| `wordMode` | string | `select` \| `word` – `word_mode` select. |
| `drawLevel` | int \| null | Teszt módban melyik generáció rajz (1–6), ha értelmes. |

Ezek **nem kötelezőek** a szimulációhoz, de segítenek a kliensnek visszaállítani a vezérlőket.

### Példa payload (`schemaVersion` 1)

```json
{
  "schemaVersion": 1,
  "board": "square",
  "neighbors": "side",
  "mode": "play",
  "maxLevel": 10,
  "delay": 0.2,
  "wordMode": "select",
  "wordListId": 2,
  "colorListId": 1,
  "cells": [
    { "x": 10, "y": 12, "v": 1 },
    { "x": 11, "y": 12, "v": 2 }
  ]
}
```

---

## Végpontok – Csoportok

### GET `/api/board-save-groups`

A bejelentkezett user **saját csoportjai**.

**Válasz:** JSON tömb, elemek legalább: `id`, `user_id`, `name`, `position`, `created_at`, `updated_at`.

Rendezés javaslat: `position` ASC, majd `name` ASC (vagy `id` ASC).

---

### POST `/api/board-save-groups`

Új csoport.

**Body:**

```json
{
  "name": "Gyakorlatok",
  "position": 0
}
```

- `name` kötelező, max 255.
- `position` opcionális (alap: 0 vagy utolsó + 1).

**201:** létrejött csoport objektum.

---

### GET `/api/board-save-groups/{group}`

Egy csoport részletei (mentések **nélkül** is elég, vagy opcionálisan `saves` beágyazva – egyezzetek).

---

### PUT `/api/board-save-groups/{group}`

Átnevezés / sorrend.

**Body (részleges):**

```json
{
  "name": "Új név",
  "position": 1
}
```

**403:** nem a user csoportja.

---

### DELETE `/api/board-save-groups/{group}`

Csoport törlése; a hozzá tartozó **mentések** is törlődjenek (CASCADE).

**403:** nem a user csoportja.

---

## Végpontok – Mentések (egy csoporton belül)

### GET `/api/board-save-groups/{group}/saves`

A csoport **összes mentése**.

**403:** nem a user csoportja.

**Válasz:** tömb; elemek: `id`, `board_save_group_id`, `name`, `payload` (vagy csak meta + `payload` csak részletes GET-nél – ha nagy JSON, lehet listánál `payload` nélkül és külön GET).

**Javaslat:** listánál **ne** küldjön teljes `payload`-ot minden elemnél, ha sok és nagy; elég `id`, `name`, `updated_at`. Teljes tartalom: `GET .../saves/{save}`.

---

### POST `/api/board-save-groups/{group}/saves`

Új mentés.

**Body:**

```json
{
  "name": "Feladat 1",
  "payload": { ... lásd Payload séma ... }
}
```

- `name` kötelező, max 255, **egyedi a csoporton belül**.
- `payload` kötelező, érvényes JSON objektum (`schemaVersion` >= 1).

**201:** mentés rekord (`id`, `name`, `payload`, stb.).

**422:** validáció (üres név, dupla név, hibás payload).

---

### GET `/api/board-save-groups/{group}/saves/{save}`

Egy mentés **teljes** adatai, benne a `payload`.

**403 / 404:** jogosultság vagy nem létező id.

---

### PUT `/api/board-save-groups/{group}/saves/{save}`

Frissítés (átnevezés és/vagy új táblaállapot).

**Body:**

```json
{
  "name": "Új név",
  "payload": { ... }
}
```

Legalább az egyik kötelező. Ha csak név változik, `payload` elhagyható (backend megtartja a régit).

---

### DELETE `/api/board-save-groups/{group}/saves/{save}`

Mentés törlése.

---

## Útvonal-paraméterek

- `{group}` = `board_save_groups.id`
- `{save}` = `board_saves.id`

**Jogosultság:** minden műveletnél ellenőrizni, hogy a rekord `user_id`-je egyezzen a bejelentkezett userrel (vagy admin szabály – egyezzetek; alap: csak saját).

---

## Hibák (egységes)

- **401** – nincs / érvénytelen token  
- **403** – nincs jogosultság (`{ "error": "Nincs jogosultság" }`)  
- **404** – nincs ilyen csoport / mentés  
- **422** – validáció (Laravel formátum megfelelő)

---

## Laravel útvonalak (példa regisztráció)

```php
Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('board-save-groups', BoardSaveGroupController::class);
    Route::apiResource('board-save-groups.saves', BoardSaveController::class)
        ->shallow(); // vagy beágyazott névvel
});
```

A pontos route nevek egyeztethetők; a fenti **URL-ek** a specifikáció szerint:

- `/api/board-save-groups`
- `/api/board-save-groups/{group}`
- `/api/board-save-groups/{group}/saves`
- `/api/board-save-groups/{group}/saves/{save}`

---

## Frontend követelmény (későbbi implementáció)

1. Mentés: aktuális `matrix` → `cells` sparse (vagy `matrix` tömb), + meta mezők.  
2. Betöltés: `payload` alapján `matrix` feltöltése, `board` / `neighbors` / `mode` UI szinkron, opcionálisan lista ID-k.

---

## Verzió

| Verzió | Dátum | Megjegyzés |
|--------|--------|------------|
| 1.0 | 2026-04-10 | Első spec: csoportok + mentések + payload séma v1 |
| 1.1 | 2026-04-10 | Migrációk hozzáadva (`board_save_groups`, `board_saves`); séma dokumentálva `database-schema.md`-ben |
