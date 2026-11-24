/* Пост-обработка «нашей модели» — только на компьютере (renderBudget → bloom): мягкое свечение нура, золота
   и огней ночью. На телефоне композитор не создаётся. Цепочка: сцена (HalfFloat, MSAA ×4 — сглаживание
   рендерера в буферы композитора не попадает) → свечение (линейный свет) → OutputPass (тон-маппинг и sRGB один раз).
   SSAO не включаем: второй проход сцены с подменой материала не знает позы людей (их считает шейдер толпы). */
import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export interface Post {
  render(): void
  setSize(w: number, h: number): void
  setBloom(threshold: number, strength: number): void
  dispose(): void
}

/** Радиус размытия свечения: небольшой — ореол вокруг огня, а не туман на весь кадр */
const BLOOM_RADIUS = 0.35

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number): Post {
  const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.setSize(w, h)
  const scenePass = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new Vector2(w, h), 0.25, BLOOM_RADIUS, 0.9)
  const out = new OutputPass()
  composer.addPass(scenePass)
  composer.addPass(bloom)
  composer.addPass(out)
  return {
    render() { composer.render() },
    setSize(cw, ch) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(cw, ch) },
    setBloom(threshold, strength) { bloom.threshold = threshold; bloom.strength = strength },
    dispose() {
      bloom.dispose()
      out.dispose()
      scenePass.dispose()
      composer.dispose()   // оба буфера композитора (в том числе переданный target)
    },
  }
}
