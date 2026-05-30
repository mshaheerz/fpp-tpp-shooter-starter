# Death Animation Setup

Your Death.fbx files should be converted to GLB format and added to the character animations folder. Here's how:

## Option 1: Using the Conversion Script (Recommended)

1. Make sure Death.fbx and Death(1).fbx are in your Downloads folder:
   ```bash
   ls ~/Downloads/Death*.fbx
   ```

2. Install the FBX converter (if not already installed):
   ```bash
   npm install -g fbx2gltf
   # OR use: npm install fbx2gltf --save-dev
   ```

3. Run the conversion script:
   ```bash
   node scripts/convert-fbx-to-glb.js
   ```
   
   The script watches your Downloads folder and will automatically convert any new .fbx files.

4. The converted files will appear in `public/assets/kenney/converted/`

5. Move/copy them to the character animations folder:
   ```bash
   cp public/assets/kenney/converted/Death.glb public/assets/character/animations/death.glb
   cp public/assets/kenney/converted/Death\(1\).glb public/assets/character/animations/death_alt.glb
   ```

## Option 2: Manual Conversion with Blender

1. Open Death.fbx in Blender
2. Go to File > Export > glTF 2.0 (.glb/.gltf)
3. Save as `public/assets/character/animations/death.glb`
4. Repeat for Death(1).fbx as `death_alt.glb`

## What the Code Now Does

The enemy death handler now tries to play these animations in order:
1. `death` - Primary death animation
2. `dying` - Alternative death animation
3. `death_stand` - Slower death animation
4. Falls back to `falling_to_landing` if none exist

## Animation Naming Convention

If your Death.fbx contains multiple animations, you can name them:
- **Skinned version** → `death` (recommended for full rig death)
- **Non-skinned version** → Can be used as reference, extract individual animations

---

## Issues Fixed

✅ **Enemy walks after death** - Dead enemies now have velocity frozen every frame
✅ **Jump too low** - Jump velocity increased from 3.0 to 4.2 m/s
✅ **Respawn stuck in geometry** - Improved spawn point selection with 60+ tries
✅ **Enemy not shooting** - Added debug logging to verify shots hit
✅ **Dead enemy still moves** - Physics disabled + velocity zeroed

&nbsp;

**Run the dev server and test with `?tdm=4` URL parameter!**
