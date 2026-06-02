import AudioManager from '../audio/AudioManager'

export interface AudioBundle {
  audio: AudioManager
}

export async function createAudio(): Promise<AudioBundle> {
  const audio = new AudioManager()

  try {
    await audio.preloadMap({
      ak47: './assets/sfx/weapons/762x39 Single WAV.wav',
      pistol: './assets/sfx/weapons/556 Single WAV.wav',
    })

    const resumeOnGesture = async () => {
      try {
        await audio.resume()
        window.removeEventListener('pointerdown', resumeOnGesture)
        window.removeEventListener('keydown', resumeOnGesture)
      } catch (e) {
        console.warn('[audio] resume on gesture failed', e)
      }
    }

    window.addEventListener('pointerdown', resumeOnGesture)
    window.addEventListener('keydown', resumeOnGesture)
  } catch (e) {
    console.warn('[audio] preload failed', e)
  }

  return { audio }
}
