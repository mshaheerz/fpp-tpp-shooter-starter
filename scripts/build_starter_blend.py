"""
Build a starter .blend for FPP+TPP map authoring.

Run via:
    blender --background --python scripts/build_starter_blend.py

Produces `public/assets/maps/starter.blend` — a clean Blender scene with:
  - 100 x 100 m gridded ground plane sized to 1 unit = 1 meter (matches Rapier)
  - Sun light + simple sky world
  - A "Library" collection off to the side containing a curated sample of Kenney
    props (one of each: building, wall, crate, target, road, tree). Drag any of
    these into your "Map" collection to build your scene.
  - A "Map" collection (currently empty) for your authored geometry.
  - A README text block (open `Scripting` workspace → Text editor → 'README')
    with the export settings the game expects.

Why this exists: the user installed Blender but has no starter; this script
seeds a known-good scene so they can open it and immediately build a map
that loads into the game without unit / axis / pivot surprises.
"""
import math
import os
import sys

import bpy

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
KENNEY_ROOT = os.path.join(PROJECT_ROOT, "public", "assets", "kenney")
OUTPUT_BLEND = os.path.join(PROJECT_ROOT, "public", "assets", "maps", "starter.blend")

# Sample assets imported into the Library collection so the user has obvious
# starting blocks. One of each kind, kept small so the .blend stays under ~5 MB.
SAMPLE_ASSETS = [
    ("industrial", "building-a.glb"),
    ("industrial", "detail-tank.glb"),
    ("suburban", "building-type-a.glb"),
    ("suburban", "tree-large.glb"),
    ("suburban", "fence-1x4.glb"),
    ("prototype", "wall.glb"),
    ("prototype", "wall-corner.glb"),
    ("prototype", "crate.glb"),
    ("prototype", "target-a-round.glb"),
    ("roads", "road-straight.glb"),
    ("roads", "road-crossroad.glb"),
]


def reset_scene():
    """Strip the default cube/camera/light so we start from a blank slate."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Length unit = meters; this matches Rapier's 1 unit = 1 meter convention.
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"


def make_collection(name: str) -> bpy.types.Collection:
    """Create a top-level collection linked to the scene."""
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def move_to_collection(obj: bpy.types.Object, coll: bpy.types.Collection):
    """Move `obj` out of every collection it's in and into `coll` only."""
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def build_ground(map_coll: bpy.types.Collection):
    """100 x 100 m plane with a checkered gridded material so scale is obvious."""
    bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    move_to_collection(ground, map_coll)

    # Procedural grid material — repeating squares roughly 2 m on a side.
    mat = bpy.data.materials.new("GroundGrid")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.95
    checker = nt.nodes.new("ShaderNodeTexChecker")
    checker.inputs["Color1"].default_value = (0.36, 0.40, 0.34, 1)
    checker.inputs["Color2"].default_value = (0.30, 0.34, 0.28, 1)
    checker.inputs["Scale"].default_value = 50.0
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")

    nt.links.new(tex_coord.outputs["Generated"], checker.inputs["Vector"])
    nt.links.new(checker.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    out.location = (300, 0)
    bsdf.location = (60, 0)
    checker.location = (-180, 0)
    tex_coord.location = (-420, 0)

    ground.data.materials.append(mat)


def build_sun_and_sky():
    """Strong sun + warm sky background. Matches the in-game lighting roughly."""
    bpy.ops.object.light_add(type="SUN", location=(20, -20, 30))
    sun = bpy.context.active_object
    sun.name = "Sun"
    sun.data.energy = 4.0
    sun.data.angle = math.radians(2.0)
    sun.rotation_euler = (math.radians(50), math.radians(-15), math.radians(30))

    # Sky world background — simple gradient using a Sky Texture.
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    bg = nt.nodes.new("ShaderNodeBackground")
    sky = nt.nodes.new("ShaderNodeTexSky")
    # `NISHITA` was Blender 4.x's physically-based sky model; it was renamed in
    # 5.x. Pick whichever option the running build accepts so this script
    # stays compatible across 4.2 LTS and 5.x.
    sky_options = sky.bl_rna.properties["sky_type"].enum_items.keys()
    if "NISHITA" in sky_options:
        sky.sky_type = "NISHITA"
    elif "MULTIPLE_SCATTERING" in sky_options:
        sky.sky_type = "MULTIPLE_SCATTERING"
    else:
        sky.sky_type = list(sky_options)[0]
    if "sun_elevation" in sky.bl_rna.properties:
        sky.sun_elevation = math.radians(35)
    if "sun_rotation" in sky.bl_rna.properties:
        sky.sun_rotation = math.radians(60)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    bg.inputs["Strength"].default_value = 1.0


def build_camera():
    """Top-down perspective so the user immediately sees the whole 100x100 plot."""
    bpy.ops.object.camera_add(location=(0, -40, 35), rotation=(math.radians(55), 0, 0))
    cam = bpy.context.active_object
    cam.name = "PreviewCam"
    cam.data.lens = 35
    bpy.context.scene.camera = cam


def import_glb(path: str) -> list[bpy.types.Object]:
    """Import a .glb file and return the new top-level objects."""
    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=path)
    except Exception as e:
        print(f"[starter] import failed {path}: {e}")
        return []
    new = [o for o in bpy.data.objects if o not in before]
    return new


def import_library(lib_coll: bpy.types.Collection):
    """Import each sample asset into the Library collection, laid out in a grid
    off to the side (x=-60..-40, z=0) so they don't overlap the build area."""
    cursor_x = -55.0
    cursor_y = -25.0
    row_step = 5.0
    col_step = 5.0
    cols = 4

    placed = 0
    for pack, fname in SAMPLE_ASSETS:
        path = os.path.join(KENNEY_ROOT, pack, "Models", "GLB format", fname)
        if not os.path.exists(path):
            print(f"[starter] skip missing {path}")
            continue
        new_objects = import_glb(path)
        # Take only the visible root-ish objects (skip empty parents from glTF).
        roots = [o for o in new_objects if o.parent is None]
        gx = placed % cols
        gy = placed // cols
        x = cursor_x + gx * col_step
        y = cursor_y + gy * row_step
        for root in roots:
            root.location = (x, y, 0)
            # Move every imported descendant into the Library collection.
            stack = [root]
            while stack:
                o = stack.pop()
                move_to_collection(o, lib_coll)
                stack.extend(list(o.children))
        placed += 1


def add_readme_text():
    """A README text block visible in Blender's Text editor."""
    text = bpy.data.texts.new("README")
    text.write(
        """\
FPP + TPP map starter — Blender scene

1) BUILDING
   - The Map collection is empty (Ground is your floor). Add cubes/planes here
     or drag Library objects out and `Shift+D` to duplicate copies.
   - Top view: Numpad 7. Walk-mode preview: backtick (`) then WASD.
   - Snap to grid: hold Ctrl while moving.

2) UNITS
   - 1 Blender unit = 1 meter. Game capsule is ~1.8 m tall, doorway >= 2 m,
     a normal wall ~3 m tall. The grid on the floor is sized so 1 cell = 2 m.

3) EXPORTING TO THE GAME
   - Select everything you want to ship: press A in the 3D viewport.
     (Don't include the Library objects unless you want them in the map.)
   - File -> Export -> glTF 2.0 (.glb/.gltf)
   - Settings (right panel):
       Format: glTF Binary (.glb)
       Include -> Selected Objects: ON
       Transform -> +Y Up: ON
       Geometry -> Apply Modifiers: ON
       Geometry -> UVs, Normals: ON
       Material -> Materials: ON
   - Save as: public/assets/maps/<your_map>.glb in this project.

4) REGISTERING IN CODE
   Copy src/maps/ghostCity.ts to src/maps/<yourMap>.ts and edit the id, name,
   and URL. Then add it to MAPS in src/maps/index.ts. The map selection menu
   picks it up automatically.

5) GOTCHAS
   - Imported FBX-via-glTF assets sometimes come in at huge scale; before
     export, select them and Ctrl+A -> All Transforms to bake.
   - If your map sinks into the floor in-game, set { yOffset: 1 } in the
     loadGlb call.
   - Each unique material is a draw call. Share materials when possible.
"""
    )


def position_view():
    """Frame the build area for the user's first opening."""
    # We can't directly set the 3D view region from --background, but we can set
    # default 3D Cursor location to (0,0,0) and ensure all collections are
    # visible. Blender will use the default startup viewport.
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)


def main():
    # Sanity check on Kenney assets path.
    if not os.path.isdir(KENNEY_ROOT):
        print(f"[starter] ERROR: Kenney root not found at {KENNEY_ROOT}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_BLEND), exist_ok=True)

    reset_scene()

    # Collections: Map (what you build) and Library (sample assets).
    map_coll = make_collection("Map")
    lib_coll = make_collection("Library")

    build_ground(map_coll)
    build_sun_and_sky()
    build_camera()
    import_library(lib_coll)
    add_readme_text()
    position_view()

    # Save.
    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
    print(f"[starter] wrote {OUTPUT_BLEND}")


if __name__ == "__main__":
    main()
