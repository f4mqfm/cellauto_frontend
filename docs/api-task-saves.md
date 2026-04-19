# API – Task Saves, Task Save Groups, Task Evaluations

Ez a modul a feladat-rács mentésére és értékelésére szolgál.

- csoportok: `task_save_groups`
- mentések: `task_saves`
- értékelések: `task_evaluations`

## Auth

Minden végpont védett: `auth:sanctum` + aktív session.

## Task Save Group végpontok

### GET `/api/task-save-groups`
Saját csoportok listája.

### POST `/api/task-save-groups`
Új csoport létrehozása.

Body:

```json
{
  "name": "Feladatok",
  "position": 0
}
```

### GET `/api/task-save-groups/{task_save_group}`
Egy csoport lekérése.

### PUT `/api/task-save-groups/{task_save_group}`
Csoport frissítése (`name`, `position`).

### DELETE `/api/task-save-groups/{task_save_group}`
Csoport törlése (CASCADE mentések).

## Task Save végpontok

### GET `/api/task-save-groups/{task_save_group}/saves`
Csoport mentései.

### POST `/api/task-save-groups/{task_save_group}/saves`
Új task mentés.

Body:

```json
{
  "name": "Feladat 1",
  "level": "Medium",
  "generation_mode": "square_lateral",
  "board_size": 31,
  "generations_count": 5,
  "word_list_id": 2,
  "time_limit": 120,
  "payload": {
    "cells": [
      { "x": 1, "y": 2, "v": 1 }
    ]
  }
}
```

### Kötelező szabályok

- `level`: nehézség (enum) – pontosan `Easy` \| `Medium` \| `Hard`
- `generation_mode`: `square_lateral` | `square_apex` | `hexagonal`
- `board_size`: pozitív egész
- `generations_count`: pozitív egész
- `word_list_id`: opcionális (`null` lehet)
- `time_limit`: másodperc, pozitív egész
- ha `word_list_id` meg van adva, a lista generációszáma pontosan egyezzen a `generations_count` értékkel

### GET `/api/task-save-groups/{task_save_group}/saves/{save}`
Egy mentés lekérése.

### PUT `/api/task-save-groups/{task_save_group}/saves/{save}`
Mentés frissítése (ugyanazok a mezők, mint POST).

### DELETE `/api/task-save-groups/{task_save_group}/saves/{save}`
Mentés törlése.

## Task Evaluation végpontok

### GET `/api/task-saves/{task_save}/evaluations`
Értékelések listája.

- task tulajdonos/admin: minden értékelést lát
- más user: csak saját értékeléseit látja

### POST `/api/task-saves/{task_save}/evaluations`
Új értékelés mentése (a bejelentkezett userre).

Body:

```json
{
  "date": "2026-04-17 10:30:00",
  "note": "Első próbálkozás",
  "filled_board": {
    "cells": [
      { "x": 1, "y": 2, "v": 1 }
    ]
  },
  "total_good_cell": 120,
  "good_cell": 95,
  "bad_cell": 25,
  "unfilled_cell": 10,
  "possible_sentence": 30,
  "good_sentence": 18,
  "bad_sentence": 12,
  "duplicate_sentence": 5,
  "sentence_result": "Helyes: A B C; hibás: …",
  "completed_time": 87
}
```

- `filled_board`: kötelező JSON objektum (a táblán kiöltött állapot); a pontos szerkezetet a kliens határozza meg (tipikusan megegyezhet a task save `payload`-jával, pl. `cells` tömb).
- `unfilled_cell`: nem kitöltött cellák száma (nem negatív egész).
- `duplicate_sentence`: duplikált mondatok száma (nem negatív egész), a `possible_sentence` / `good_sentence` / `bad_sentence` mezőkkel együtt értelmezhető.
- `sentence_result`: opcionális szöveg (többsoros lehet); mondatokra vonatkozó összegző / részletes eredmény (szerkezetét a kliens határozza meg).

### PUT `/api/task-saves/{task_save}/evaluations/{task_evaluation}`
Értékelés frissítése (saját vagy admin). Ugyanazok a mezők, mint POST-nál (`filled_board` kötelező).

### DELETE `/api/task-saves/{task_save}/evaluations/{task_evaluation}`
Értékelés törlése (saját vagy admin).

