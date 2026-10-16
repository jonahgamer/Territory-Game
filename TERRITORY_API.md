# Territory Game API

Single endpoint: `/api/territory`

All requests require `Authorization: Bearer <JWT>` header.
JWT obtained from `/api/login`.

---

## Actions

### `GET ?action=bootstrap`

Returns all game data. Use on page load.

**Response:**
```json
{
  "success": true,
  "user": {
    "username": "chris",
    "role": "admin",
    "displayName": "Chris",
    "pfp": ""
  },
  "maps": [
    {
      "id": "uuid",
      "name": "Level 1",
      "cols": 10,
      "rows": 8,
      "cells": [
        { "kind": "empty" },
        { "kind": "obstacle" },
        { "kind": "problem", "problemNo": 1, "type": "math" }
      ]
    }
  ],
  "problems": [
    {
      "index": 1,
      "type": "math",
      "prompt": "<b>Find</b> x.",
      "answer": "x = 42"
    }
  ],
  "contests": [
    {
      "id": "uuid",
      "name": "Week 1",
      "mapId": "uuid",
      "contestantIds": ["s24f15", "s23r30"]
    }
  ],
  "serverNow": 1792144453404
}