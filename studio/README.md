# Map Studio — Visual 3D Level Editor

A standalone 3D level editor for placing spawns, enemies, waypoints, and Kenney props on your game maps. Built as a proper TypeScript project that builds alongside the main game via Vite's multi-page mode.

## File structure
```
studio/
  index.html              ← HTML shell (loads /src/studio/index.ts)
src/studio/
  index.ts                ← Entry — wires everything
  state.ts                ← Global state object
  types.ts                ← Entity class, types
  scene.ts                ← Three.js init, lights, grid
  entities.ts             ← createEntity, properties panel
  selection.ts            ← Single/multi-select, selection box
  tools.ts                ← Active tool + ghost preview
  palette.ts              ← Kenney catalog → palette DOM
  undo.ts                 ← Undo/redo
  waypoints.ts            ← Patrol route lines
  importexport.ts         ← Export/import layout JSON
  ui.ts                   ← Status bar
  styles.ts               ← CSS injection
```

## How to Use

### 1. Start the game
```bash
npm run dev
```

### 2. Open the editor
Open **http://localhost:5173/studio/** in Chrome.

### 3. Load a map
1. Select a map from the dropdown (e.g. "Ghost City", "Team Deathmatch 1")
2. Click **Load** — the 3D environment appears in the viewport

### 4. Place entities
1. Click a tool in the **Palette** (left panel)
2. A **blue ghost** follows your mouse — shows exactly where the entity will land
3. Click on the map to place it

### 5. Move, scale, rotate
- **Drag** an entity to move it
- **Click** to select → **Properties panel** (right) shows X, Z, Rotation, Scale, HP
- **Shift+click** for multi-select
- **Drag on empty space** to draw a **selection box**

### 6. Keyboard shortcuts
| Key | Action |
|---|---|
| `1` | Player Spawn tool |
| `2` | Enemy Spawn tool |
| `3` | Waypoint tool |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+D` | Duplicate selected |
| `Del` / `Backspace` | Delete selected |
| `Shift+click` | Multi-select |
| `Esc` | Deselect + clear tool |

### 7. Export
Click **Export JSON** → copy the JSON → save as:
```
public/assets/maps/<mapId>.layout.json
```

### 8. Play
Refresh **http://localhost:5173/** — enemies, player spawn, and patrol routes load from the layout file.

## How it builds

Vite is configured for multi-page builds (`vite.config.ts`):

```typescript
rollupOptions: {
  input: {
    main: 'index.html',
    studio: 'studio/index.html',
  },
  ...
}
```

Running `npm run build` produces:
- `dist/index.html` (the game)
- `dist/studio/index.html` (the editor)
- Shared chunks for Three.js, Rapier, etc.