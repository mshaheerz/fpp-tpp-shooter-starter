import type { MapDefinition } from './index'
import { loadLayout } from './layoutLoader'
import { placePropsFromLayout } from './entitySpawner'

/**
 * Shooting Range — props loaded from shootRange.layout.json.
 * Edit in the Map Studio, then export the JSON to regenerate.
 */
export const shootRange: MapDefinition = {
  id: 'shootRange',
  name: 'Shooting Range',
  description: 'Open block grid with road cross, perimeter walls, mixed buildings, and a central shooting playground.',
  scene: { groundSize: 220, groundColor: 0x6d7c62 },
  async build(b) {
    const layout = await loadLayout('shootRange')
    if (layout) await placePropsFromLayout(b, layout)
  },
}
