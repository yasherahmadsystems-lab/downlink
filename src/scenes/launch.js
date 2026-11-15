// Launch scene: a small rideshare launcher lifts off at first light, seen from the pad road.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// World units are metres (the env_* models are authored at 1 unit = 1 m).
// The launcher, pad and ground-station dish are generic: they copy no real vehicle or site.
// The climb uses a constant acceleration of 3.4 m/s2 (thrust about 1.35 times weight,
// typical for a small liquid-fuelled launcher; Game balance).
import * as THREE from 'three';
import { part } from './spacecraft.js';

export const LAUNCH_S = 8.6; // length of the shot, real seconds
export const IGNITE_S = 1.3; // engines start
const LIFTOFF_S = 2.3; // hold-downs let go
const ACCEL = 3.4;

const HORIZON = new THREE.Color(0.52, 0.4, 0.36);
const GLOW_DIR = new THREE.Vector3(-0.86, 0, -0.5).normalize(); // where the Sun will rise

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 7.3) + 0.1 * vnoise(p * 4.3 + 1.7); }`;

const skyShader = {
  uniforms: { glowDir: { value: GLOW_DIR }, horizon: { value: HORIZON } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 glowDir;
    uniform vec3 horizon;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float up = clamp(d.y, 0.0, 1.0);
      // How far round the horizon this direction is from the coming sunrise
      float toward = clamp(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), glowDir) * 0.5 + 0.5, 0.0, 1.0);
      vec3 zenith = vec3(0.022, 0.04, 0.085);
      vec3 mid = vec3(0.1, 0.16, 0.27);
      vec3 warm = mix(vec3(0.3, 0.33, 0.42), vec3(1.25, 0.66, 0.34), pow(toward, 2.2));
      vec3 col = mix(mid, zenith, smoothstep(0.08, 0.75, up));
      col = mix(col, warm, exp(-up * 9.0));
      col = mix(col, horizon, exp(-up * 60.0));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const plumeShader = {
  uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uPower;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    ${NOISE}
    void main() {
      float along = vUv.y; // 0 at the nozzles, 1 at the tail
      // Soft edges: the flame is a glowing volume, brightest where the view passes through its middle
      float limb = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
      float flicker = 0.72 + 0.28 * vnoise(vec2(vUv.x * 7.0, along * 6.0 - uTime * 11.0));
      // Shock diamonds in the first third of the flame
      float diamonds = 1.0 + 0.3 * sin(along * 46.0) * (1.0 - smoothstep(0.0, 0.34, along));
      float body = pow(1.0 - along, 1.35);
      vec3 hot = vec3(1.0, 0.9, 0.72) * 4.2;
      vec3 cool = vec3(1.0, 0.36, 0.07) * 1.5;
      vec3 col = mix(hot, cool, smoothstep(0.0, 0.55, along));
      gl_FragColor = vec4(col * limb * flicker * diamonds * body * uPower, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const SMOKE_COUNT = 150;
const smokeShader = {
  uniforms: { uTime: { value: -1 }, uOrigin: { value: new THREE.Vector3() }, uGlow: { value: 0 } },
  vertexShader: /* glsl */ `
    attribute vec4 aSeed;
    uniform float uTime;
    uniform vec3 uOrigin;
    varying vec2 vUv;
    varying float vLife;
    varying float vHeat;
    varying float vSeed;
    void main() {
      vUv = uv;
      vSeed = aSeed.x;
      float age = uTime - aSeed.x * 5.2; // puffs leave the flame duct over about five seconds
      float life = clamp(age / 7.5, 0.0, 1.0);
      vLife = age > 0.0 ? life : -1.0;
      // The flame duct opens toward +X, so most of the cloud runs out that way
      float a = (aSeed.y - 0.5) * 4.0;
      vec2 dir = vec2(cos(a), sin(a) * 0.6);
      float reach = (5.0 + 34.0 * aSeed.z) * (1.0 - exp(-max(age, 0.0) * 0.5));
      float rise = 0.9 + (2.0 + 12.0 * aSeed.w) * life * life;
      vec3 centre = uOrigin + vec3(dir.x * reach, rise, dir.y * reach);
      float size = mix(2.2, 11.0 + 9.0 * aSeed.w, sqrt(life));
      vHeat = exp(-reach * 0.11) * (1.0 - life);
      vec4 mv = viewMatrix * vec4(centre, 1.0);
      mv.xy += position.xy * size;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uGlow;
    varying vec2 vUv;
    varying float vLife;
    varying float vHeat;
    varying float vSeed;
    ${NOISE}
    void main() {
      if (vLife < 0.0) discard;
      vec2 p = vUv * 2.0 - 1.0;
      float n = fbm(p * 1.7 + vSeed * 41.0 + vec2(0.0, -uTime * 0.12));
      float shape = smoothstep(1.0, 0.2, length(p) + (n - 0.5) * 0.7);
      float fade = smoothstep(0.0, 0.07, vLife) * (1.0 - smoothstep(0.5, 1.0, vLife));
      // Steam and dust: pale where the first light catches the top, blue-grey underneath
      vec3 base = mix(vec3(0.5, 0.5, 0.53), vec3(0.3, 0.33, 0.4), vLife);
      base *= 0.62 + 0.38 * (p.y * 0.5 + 0.5) + 0.12 * (n - 0.5);
      vec3 col = base + vec3(1.0, 0.5, 0.16) * vHeat * uGlow * 2.4;
      gl_FragColor = vec4(col, shape * fade * 0.78);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createLaunch(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080f);
  scene.fog = new THREE.Fog(HORIZON, 220, 2600);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 6000);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({ ...skyShader, side: THREE.BackSide, depthWrite: false, fog: false }));
  scene.add(sky);

  // Ground: dry, dark, and lost in haze long before the horizon
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), new THREE.MeshStandardMaterial({ color: 0x33312e, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // A far ridge line, so the horizon is a silhouette and not a seam
  scene.add(buildRidge());

  scene.environment = bakeSkyEnvironment(renderer, sky, ground);
  scene.environmentIntensity = 0.55;

  // Light: blue-hour sky, a warm rim from the coming sunrise, and two pad floodlights
  scene.add(new THREE.HemisphereLight(0x8ea2c9, 0x2a2622, 0.85));
  const dawn = new THREE.DirectionalLight(0xffb48a, 0.9);
  dawn.position.copy(GLOW_DIR).multiplyScalar(100).setY(14);
  scene.add(dawn);
  for (const [x, z] of [[13, 12], [-8, 13]]) { // the pad's floodlight poles
    const flood = new THREE.SpotLight(0xfff0dc, 1100, 90, 0.42, 0.7, 2);
    flood.position.set(x, 7.1, z);
    flood.target.position.set(0, 11, 0);
    scene.add(flood, flood.target);
  }

  // Everything that leaves the ground rides in `vehicle`
  const vehicle = new THREE.Group();
  scene.add(vehicle);
  const plumeMat = new THREE.ShaderMaterial({ ...plumeShader, uniforms: THREE.UniformsUtils.clone(plumeShader.uniforms), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const plume = new THREE.Mesh(
    new THREE.LatheGeometry([[0.5, 0], [0.82, -1.6], [0.86, -4.5], [0.6, -9], [0.3, -12.5], [0.04, -15]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
    plumeMat,
  );
  plume.frustumCulled = false;
  vehicle.add(plume);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTexture(), color: 0xffc890, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glare.position.y = -0.6;
  vehicle.add(glare);
  const fire = new THREE.PointLight(0xffa25c, 0, 160, 2);
  fire.position.y = -1.5;
  vehicle.add(fire);

  // Exhaust cloud
  const quad = new THREE.PlaneGeometry(1, 1);
  const smokeGeo = new THREE.InstancedBufferGeometry();
  smokeGeo.index = quad.index;
  smokeGeo.setAttribute('position', quad.getAttribute('position'));
  smokeGeo.setAttribute('uv', quad.getAttribute('uv'));
  const seeds = new Float32Array(SMOKE_COUNT * 4);
  let s = 12345;
  for (let i = 0; i < seeds.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0; // fixed sequence: the cloud is the same every launch
    seeds[i] = s / 2 ** 32;
  }
  smokeGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  smokeGeo.instanceCount = SMOKE_COUNT;
  const smokeMat = new THREE.ShaderMaterial({ ...smokeShader, uniforms: THREE.UniformsUtils.clone(smokeShader.uniforms), transparent: true, depthWrite: false });
  const smoke = new THREE.Mesh(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 2;
  scene.add(smoke);

  let dish = null;
  let padBase = 2.5; // height of the launch mount; read from the pad model when it loads
  let loading = null;
  let altitude = 0;
  const eye = new THREE.Vector3(24, 1.6, 39);
  const aim = new THREE.Vector3(-4, 10, 0);
  const tmp = new THREE.Vector3();

  /** Loads the models once. The scene is usable (if empty) even when this fails. */
  function load() {
    const optional = (name) => part(name).catch(() => null); // the shot works without the dish
    loading ??= Promise.all([part('env_pad'), part('env_launcher'), optional('env_ground_dish')]).then(([pad, launcher, antenna]) => {
      for (const m of [pad, launcher, antenna]) {
        if (!m) continue;
        m.traverse((o) => {
          if (o.isMesh) o.castShadow = o.receiveShadow = false; // first light: no hard shadows
        });
      }
      scene.add(pad);
      pad.updateMatrixWorld(true);
      const seat = pad.getObjectByName('SOCKET_launcher');
      if (seat) padBase = seat.getWorldPosition(tmp).y;
      vehicle.add(launcher);
      if (antenna) {
        antenna.position.set(8, 0, -24); // the range's tracking dish, behind and right of the pad
        scene.add(antenna);
        dish = { az: antenna.getObjectByName('Dish_Az'), el: antenna.getObjectByName('Dish_El'), at: antenna.position.clone().setY(3.4) };
      }
      smokeMat.uniforms.uOrigin.value.set(1.5, 0, 0);
    });
    return loading;
  }

  /**
   * @param t     seconds since the shot began
   * @param still true when the player asked for reduced motion: no camera shake
   */
  function update(t, still) {
    const burn = Math.max(0, t - IGNITE_S);
    const climb = Math.max(0, t - LIFTOFF_S);
    altitude = 0.5 * ACCEL * climb * climb;
    vehicle.position.set(0, padBase + altitude, 0);

    // Engines come up to full thrust in about half a second
    const power = t < IGNITE_S ? 0 : Math.min(1, burn / 0.55) * (0.94 + 0.06 * Math.sin(t * 61));
    plumeMat.uniforms.uTime.value = t;
    plumeMat.uniforms.uPower.value = power;
    plume.visible = power > 0;
    glare.material.opacity = power * 0.9;
    glare.scale.setScalar(7 + 5 * power + (still ? 0 : Math.sin(t * 47) * 0.4));
    fire.intensity = power * 3000;
    smokeMat.uniforms.uTime.value = t < IGNITE_S ? -1 : burn;
    smokeMat.uniforms.uGlow.value = power * Math.exp(-altitude * 0.03);

    // The dish follows the vehicle up
    if (dish?.az && dish.el) {
      tmp.copy(vehicle.position).setY(vehicle.position.y + 9).sub(dish.at);
      dish.az.rotation.y = Math.atan2(tmp.x, tmp.z);
      dish.el.rotation.x = -Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z));
    }

    // Camera: holds the pad, then tilts up after the vehicle, a little late
    const follow = THREE.MathUtils.smoothstep(climb, 0.4, 3.2);
    aim.set(-4 + 3 * follow, 10 + altitude * (0.55 + 0.37 * follow), 0);
    camera.position.copy(eye);
    if (!still && power > 0) {
      const shake = 0.035 * power * Math.exp(-altitude * 0.02);
      camera.position.x += Math.sin(t * 53.1) * shake;
      camera.position.y += Math.sin(t * 71.7 + 1.3) * shake;
    }
    camera.fov = 34 - 10 * THREE.MathUtils.smoothstep(climb, 2.2, 6.0); // a long lens keeps the vehicle large as it climbs
    camera.updateProjectionMatrix();
    camera.lookAt(aim);
  }

  return {
    scene,
    camera,
    load,
    update,
    get altitude() {
      return altitude;
    },
  };
}

function buildRidge() {
  const segments = 180;
  const positions = [];
  const index = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const h = 26 + 42 * Math.abs(Math.sin(a * 3.0 + 0.6)) * (0.55 + 0.45 * Math.sin(a * 7.0 + 2.0)) + 16 * Math.sin(a * 17.0);
    const r = 2300;
    positions.push(Math.cos(a) * r, -4, Math.sin(a) * r, Math.cos(a) * r, Math.max(8, h), Math.sin(a) * r);
    if (i < segments) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.075, 0.085, 0.115), side: THREE.DoubleSide, fog: false }));
}

/** Reflections for the vehicle: the same sky and ground, prefiltered once. */
function bakeSkyEnvironment(renderer, sky, ground) {
  const env = new THREE.Scene();
  const skyCopy = sky.clone();
  const groundCopy = new THREE.Mesh(ground.geometry, new THREE.MeshBasicMaterial({ color: 0x14130f }));
  groundCopy.rotation.copy(ground.rotation);
  env.add(skyCopy, groundCopy);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02, 1, 5000).texture;
  pmrem.dispose();
  groundCopy.material.dispose();
  return texture;
}

/** Soft round glare for the engine light. */
function glareTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,236,200,0.75)');
  grad.addColorStop(0.5, 'rgba(255,170,90,0.2)');
  grad.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
