import type { MapDefinition } from './index'
import { loadLayout } from './layoutLoader'
import { placePropsFromLayout } from './entitySpawner'

/**
 * Suburban Street — props loaded from suburbanStreet.layout.json.
 * Edit in the Map Studio, then export the JSON to regenerate.
 */
export const suburbanStreet: MapDefinition = {
  id: 'suburbanStreet',
  name: 'Suburban Street',
  description: 'Long residential street — houses, driveways, fences and trees on both sides. A handful of reactive props in side alleys.',
  scene: { groundSize: 260, groundColor: 0x7a8a66 },
  async build(b) {
    const layout = await loadLayout('suburbanStreet')
    if (layout) await placePropsFromLayout(b, layout)
  },
}
