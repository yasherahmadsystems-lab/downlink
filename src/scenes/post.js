// Post-processing chain. Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// High quality: MSAA render target -> ground-truth ambient occlusion -> tone map.
// If the machine cannot hold a steady frame rate the chain switches itself off
// and the renderer draws directly (MSAA + tone mapping still apply).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SLOW_FRAME_MS = 30; // below ~33 fps the AO is not worth it
const SAMPLE_FRAMES = 45;

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, size.x, size.y);
  ao.updateGtaoMaterial({ radius: 0.09, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 12 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  ao.blendIntensity = 0.9;
  composer.addPass(ao);
  composer.addPass(new OutputPass());

  let quality = new URLSearchParams(location.search).get('q') ?? 'auto'; // ?q=high | low
  let high = quality !== 'low';
  let frames = 0;
  let slowMs = 0;
  let last = 0;

  function resize() {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    if (w && h) composer.setSize(w, h);
  }
  new ResizeObserver(resize).observe(renderer.domElement);

  function render(nowMs) {
    if (high && quality === 'auto') {
      // Average the frame time after warm-up; drop to direct rendering if slow.
      if (last && frames > 10) slowMs += nowMs - last;
      last = nowMs;
      frames++;
      if (frames === 10 + SAMPLE_FRAMES) {
        if (slowMs / SAMPLE_FRAMES > SLOW_FRAME_MS) high = false;
        quality = high ? 'high' : 'low';
      }
    }
    if (high) composer.render();
    else renderer.render(scene, camera);
  }

  return { render, composer, get quality() { return high ? 'high' : 'low'; } };
}
