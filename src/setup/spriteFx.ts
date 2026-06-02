import { Color, SRGBColorSpace, TextureLoader } from 'three'
import type { Scene } from '../Scene'
import { SpriteFxSystem } from '../particle/SpriteFxSystem'
import { dlog } from '../debug/log'

export interface SpriteFxBundle {
  smokeSprites: SpriteFxSystem | null
  flashSprites: SpriteFxSystem | null
}

export async function createSpriteFx(scene: Scene): Promise<SpriteFxBundle> {
  let smokeSprites: SpriteFxSystem | null = null
  let flashSprites: SpriteFxSystem | null = null

  try {
    const loader = new TextureLoader()
    const [smokeTex, flashTex] = await Promise.all([
      loader.loadAsync('./assets/kenney/smoke/PNG/White%20puff/whitePuff12.png'),
      loader.loadAsync('./assets/kenney/smoke/PNG/Flash/flash04.png'),
    ])
    smokeTex.colorSpace = SRGBColorSpace
    flashTex.colorSpace = SRGBColorSpace
    smokeSprites = new SpriteFxSystem(smokeTex, 220, false, new Color(0xd7dde6))
    flashSprites = new SpriteFxSystem(flashTex, 80, true, new Color(0xffcc78))
    scene.add(smokeSprites.object)
    scene.add(flashSprites.object)
    dlog('[fx] Kenney smoke/flash sprites enabled')
  } catch {
    dlog('[fx] Kenney smoke textures not available; using shader particles only')
  }

  return { smokeSprites, flashSprites }
}
