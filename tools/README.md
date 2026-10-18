# 64-spawn arena

`seed-map-64spawns.mjs` builds a 30×30 map with:

- 64 spawn points in four open plazas, 16 per plaza
- spawn spacing: Manhattan distance at least 3, checked by the script
- every spawn keeps at least two open orthogonal exits
- central two-cell-wide bridge cross, walls on both sides
- sixteen two-cell quadrant gates into the bridge network
- four one-sided platform ledges attached to the outer wall
- 196 obstacles, 640 empty cells
- no problem cells; all remaining cells are `empty`

## Preview

```bash
node tools/seed-map-64spawns.mjs --ascii
```

## Apply

```bash
node tools/seed-map-64spawns.mjs --apply
```

The default map id is the one in the admin URL. Override it with `MAP_ID`:

```bash
MAP_ID=another-map-id node tools/seed-map-64spawns.mjs --apply
```

The script updates the existing map, sets `updatedAt`, and increments the `maps`
revision so other admin tabs cannot save stale map data.

## Put problems later

The design intentionally leaves non-wall cells empty. When placing problems,
cover the spawn-plaza exits, the quadrant gates, and the bridge cells.
Empty cells do not connect territory, so a path made only of empty cells is
not traversable.
