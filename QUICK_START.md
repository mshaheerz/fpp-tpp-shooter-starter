# Quick Reference Card

## Start the Game

```bash
npm run dev
```
Then open: `http://localhost:5174/?tdm=2`

---

## Open Console to See Debug Logs

| OS | Key |
|----|-----|
| Windows/Linux | `F12` then click "Console" tab |
| Mac | `Cmd+Option+I` then click "Console" |

---

## What to Look For

### ✅ Healthy Game

```
[TDM] spawn: 8 tries, dist=16.2m          ← Enemies spawn far away
[Player] Respawned at (0.5, 4.5, 12.0)    ← Player safe position
[Enemy] bot-1 can see target at 15.2m     ← Enemy sees player
[TDM] bot-1 state: patrol → chase         ← Enemy pursuing
[TDM] bot-1 state: chase → attack         ← Enemy attacking
[Enemy] bot-1 firing! alertTimer=0.45     ← Enemy shooting
[TDM] bot-1 dealt 9 damage to player      ← You take damage
```

### ❌ Problems & Fixes

| Problem | Look for | Fix |
|---------|----------|-----|
| **Enemy not attacking** | No "firing" message | Get < 24m away with line-of-sight |
| **Enemy won't see you** | No "can see target" | Move closer & make sure not behind wall |
| **Dead enemy still moves** | "[Enemy] ... died" NOT in logs | Should disappear after death |
| **Respawn stuck** | Spawn distance < 5m | NavGrid might have issues, try different map |
| **Jump still low** | Can't reach high platforms | Confirm you're using latest version (4.2 m/s) |

---

## Test Sequence

1. **Start game** → `?tdm=2`
2. **Open console** → `F12`
3. **Wait for countdown** → Watch logs
4. **Walk forward** → Should see "can see target" in logs
5. **Get closer** → Should see state change to "attack"
6. **Take damage** → Watch health bar & logs
7. **Shoot enemies** → They should die & stop appearing in logs

---

## Key Numbers

- **Jump height**: Now 4.2 m/s (was 3.0)
- **Enemy damage**: 9 per shot
- **Enemy accuracy**: Gets better over time (settles)
- **Attack range**: 24m
- **Spawn distance**: > 14m away from player
- **Reaction time**: 0.35 seconds before first shot

---

## Files for Death Animations

1. Get your Death.fbx files
2. Convert to GLB with fbx2gltf
3. Save to: `public/assets/character/animations/death.glb`
4. Restart dev server

See [SETUP_DEATH_ANIMATIONS.md](SETUP_DEATH_ANIMATIONS.md) for details

---

## Console Tricks

| Action | Result |
|--------|--------|
| `Ctrl+F` in console | Search logs (e.g., search for "[Enemy]") |
| Click filter `[` | Show only tagged messages |
| Right-click > Store object | Inspect current state in console |
| `Escape` | Clear console |

---

## Report Issues with

Show these screenshots:
1. Console open during gameplay
2. Health bar during combat  
3. Enemy positions on screen

This helps debug spawn/vision/attack issues!
