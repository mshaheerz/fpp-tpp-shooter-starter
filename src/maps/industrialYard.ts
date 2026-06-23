import type { MapDefinition } from './index'
import { loadLayout } from './layoutLoader'
import { placePropsFromLayout } from './entitySpawner'

/**
 * Industrial Yard — props loaded from industrialYard.layout.json.
 * Edit in the Map Studio, then export the JSON to regenerate.
 */
export const industrialYard: MapDefinition = {
  id: 'industrialYard',
  name: 'Industrial Yard',
  description: 'Factory complex — clusters of industrial buildings, central yard with destructible cover, chimneys and tanks.',
  scene: { groundSize: 220, groundColor: 0x595c52 },
  async build(b) {
    const layout = await loadLayout('industrialYard')
    if (layout) await placePropsFromLayout(b, layout)
  },
}
