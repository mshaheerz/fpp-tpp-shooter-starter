# Debug Guide for TDM AI Issues

## How to Open the Browser Console

1. **Open DevTools**: Press `F12` or `Ctrl+Shift+I` (or `Cmd+Option+I` on Mac)
2. **Go to Console Tab**: Click the "Console" tab at the top
3. **Look for colored logs**:
   - `[TDM]` = Match/Spawn logs (RED)
   - `[Enemy]` = Enemy AI logs (BLUE)
   - `[Player]` = Player logs (GREEN)

---

## What Debug Logs Mean

### When the match starts (look for):

```
[TDM] spawn: 5 tries, dist=15.2m
[Player] Respawned at (0.5, 4.5, 12.0) - HP: 100/100
```

- ✅ Spawn found after N tries
- ✅ Both player and enemies spawned far apart (distance > 14m)

### During combat (look for):

```
[Enemy] bot-1 can see target at distance 12.5m, FOV: true
[TDM] Enemy bot-1 state: patrol → chase (distance: 12.5m)
[TDM] Enemy bot-1 state: chase → attack (distance: 10.2m)
[Enemy] bot-1 firing! alertTimer=0.45, dist=9.5m
[TDM] Enemy bot-1 dealt 9 damage to player
```

- ✅ Enemy can see player
- ✅ Enemy transitions: patrol → chase → attack
- ✅ Enemy fires and deals damage

### If Something is Wrong:

#### **Enemy not attacking** (logs you WON'T see):
- No "can see target" message = Enemy's line-of-sight check is blocking
- Stay stuck in "chase" = Never gets within ATTACK_RANGE (24m)
- No "firing" message = Vision acquired but reaction delay not met

#### **Dead enemy still moving**:
- Should disappear from "firing" + "state" logs
- Should see `[Enemy] bot-X died` instead

#### **Respawn stuck**:
- Should see `[TDM] spawn: X tries` (if > 50, indicates spawn difficulty)
- Check player position - should be away from enemies

---

## Test Scenarios

### **Test 1: Basic Spawning**
```
?tdm=2
```
- Open console
- Look for spawn logs showing 2 bots and player at different positions
- Enemies should be moving (patrol)

### **Test 2: Enemy Vision**
```
?tdm=1
```
- Start one enemy match
- Walk near the enemy (get within 32m)
- You should see: `[Enemy] bot-X can see target`
- Then see state changes: `patrol → chase`

### **Test 3: Enemy Attack**
```
?tdm=1
```
- Get close to the enemy (< 24m with line-of-sight)
- You should see attack state AND `firing` message
- Check if you take damage (look at health bar)

### **Test 4: Death**
- Die to enemy
- Should see `[Enemy] bot-X died` when you kill an enemy
- Confirm:
  - Dead enemies NO LONGER appear in logs
  - Dead enemies don't move further (stay sinking in place)
  - Death animation plays (if available)

---

## Common Issues & Fixes

### Issue: Logs but no console.log output visible
→ **Scroll up in console** - older logs scroll off the bottom

### Issue: Tons of logs, hard to read
→ **Filter by `[`** - click filter box and type `[` to see only tagged logs

### Issue: No spawn logs at all
→ Match hasn't started yet. Wait for countdown to finish.

### Issue: Enemies see player but won't attack
→ Check the **distance**: `dist=25.0m` is just outside ATTACK_RANGE (24m)
→ Get closer to trigger attack

### Issue: Player respawns inside a box
→ Check spawn logs - should show distance > 14m
→ If distance is < 5m, NavGrid might be marking cells wrong
→ Try different map with `?tdm=2&m=deathmatch2`

---

## Useful Console Commands

While in console (`F12`):

```javascript
// Show all match state
window.match?.state

// Check enemy positions
window.match?.enemies.forEach(e => console.log(`${e.id}: (${e.position.x.toFixed(1)}, ${e.position.z.toFixed(1)}), alive=${e.alive}, state=${e.aiState}`))

// Check player position
console.log(`Player: (${window.player?.position.x.toFixed(1)}, ${window.player?.position.z.toFixed(1)}), hp=${window.player?.hp}`)
```

---

## Expected Console Output for Healthy Game

```
[physics] ready
[scene] loaded map
[nav] NavGrid built: 133x133 grid cells
[scene] sky
[Player] Respawned at (0.5, 4.5, 12.0) - HP: 100/100
[TDM] spawn: 12 tries, dist=18.5m
[TDM] spawn: 8 tries, dist=16.2m
[Enemy] bot-1 can see target at distance 18.5m, FOV: true
[TDM] Enemy bot-1 state: patrol → chase (distance: 18.5m)
[TDM] Enemy bot-1 state: chase → attack (distance: 22.5m)
[Enemy] bot-1 heard gunfire at distance 15.0m
[Enemy] bot-1 firing! alertTimer=0.52, dist=10.2m
[TDM] Enemy bot-1 dealt 9 damage to player
[enemy] bot-1 hit! distance=10.2m, settle=0.62, chance=0.75
```

---

## If You're Still Stuck

Check these in order:

1. **Open dev tools** (`F12`) → Console tab
2. **Start match** with `?tdm=2`
3. **Take screenshot of console** (Shift+Print)
4. **Walk toward enemies** and watch logs
5. **Share the console output** - that's the best debug info!

The logs will tell us **exactly** what the AI is seeing and doing.
