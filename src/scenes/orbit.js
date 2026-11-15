// Flight scene: Earth from NASA Blue Marble imagery, a hard Sun, and the spacecraft in orbit.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// Scale: Earth radius = 100 units. The spacecraft is drawn at its hangar size
// (far larger than true scale) so it can be seen; distances along the orbit are real.
// Earth texture: NASA Scientific Visualization Studio, "Blue Marble" (svs.gsfc.nasa.gov/2915), public domain.
import * as THREE from 'three';
import earthDayUrl from '../assets/textures/earth_day_2k.jpg?url';
import constants from '../data/constants.json' with { type: 'json' };

const R = 100;
const RE_KM = constants.earth.radius_km.value;
const SUN = new THREE.Vector3(1, 0.22, 0.55).normalize();
const SIGNAL = 0xe5562a;

// Ground stations as latitude, longitude in degrees (illustrative sites, Game balance)
const SITES = [
  [34, 72],
  [-33, -71],
  [64, -147],
];

const earthShader = {
  uniforms: { map: { value: null }, sunDir: { value: SUN } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 p = modelMatrix * vec4(position, 1.0);
      vPosW = p.xyz;
      gl_Position = projectionMatrix * viewMatrix * p;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform vec3 sunDir;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vec3 n = normalize(vNormalW);
      vec3 v = normalize(cameraPosition - vPosW);
      vec3 albedo = texture2D(map, vUv).rgb;
      float ndl = dot(n, sunDir);
      float day = smoothstep(-0.08, 0.25, ndl);
      // Sun glint on water: oceans are the blue-dominant texels
      float water = smoothstep(0.02, 0.12, albedo.b - max(albedo.r, albedo.g));
      float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 60.0) * water * 0.6;
      // Air: blue haze that thickens toward the limb, lit only on the day side
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      vec3 haze = vec3(0.30, 0.52, 1.0) * rim * 0.9;
      vec3 lit = albedo * (0.06 + 1.25 * max(ndl, 0.0)) + glint + haze;
      vec3 night = albedo * 0.012;
      gl_FragColor = vec4(mix(night, lit, day), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const airShader = {
  uniforms: { sunDir: { value: SUN } },
  vertexShader: /* glsl */ `
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 p = modelMatrix * vec4(position, 1.0);
      vPosW = p.xyz;
      gl_Position = projectionMatrix * viewMatrix * p;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vec3 n = normalize(vNormalW);
      vec3 v = normalize(cameraPosition - vPosW);
      // Back faces of a slightly larger sphere: a thin glow outside the limb
      float edge = pow(clamp(1.0 + dot(n, v), 0.0, 1.0), 2.2);
      float day = smoothstep(-0.25, 0.3, dot(-n, sunDir));
      gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * edge * day * 1.4, edge * day);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createOrbit(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 6000);

  // Reflections for the spacecraft: black sky, a blue Earth below, a small bright Sun
  scene.environment = bakeSpaceEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  // Stars: random points; brightness varies, colour is near white
  const starCount = 2600;
  const starPos = new Float32Array(starCount * 3);
  const dir = new THREE.Vector3();
  for (let i = 0; i < starCount; i++) {
    dir.randomDirection().multiplyScalar(4000);
    starPos.set([dir.x, dir.y, dir.z], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe4ee, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8 })));

  // Earth
  const map = new THREE.TextureLoader().load(earthDayUrl);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const earthMat = new THREE.ShaderMaterial({ ...earthShader, uniforms: { map: { value: map }, sunDir: { value: SUN } } });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 80), earthMat);
  scene.add(earth);
  const air = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.02, 96, 64),
    new THREE.ShaderMaterial({ ...airShader, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(air);

  // Ground stations ride on the Earth mesh
  const stations = SITES.map(([lat, lon]) => {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon + 180);
    const p = new THREE.Vector3().setFromSphericalCoords(R * 1.001, phi, theta);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: SIGNAL }));
    dot.position.copy(p);
    dot.visible = false;
    earth.add(dot);
    return dot;
  });
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0.9 }));
  beam.visible = false;
  beam.frustumCulled = false;
  scene.add(beam);

  // The orbit itself, drawn as a thin ring once the camera pulls back
  const ringPts = [];
  for (let i = 0; i < 256; i++) ringPts.push(new THREE.Vector3(Math.cos((i / 256) * Math.PI * 2), 0, Math.sin((i / 256) * Math.PI * 2)));
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  ring.frustumCulled = false;
  scene.add(ring);

  // Lights act on the spacecraft only (the Earth lights itself in its shader)
  const sun = new THREE.DirectionalLight(0xfff6ea, 4.6);
  scene.add(sun, sun.target);
  const earthshine = new THREE.DirectionalLight(0x8fb4ff, 0.5);
  scene.add(earthshine, earthshine.target);

  // The spacecraft rides in `craft`; +Y points along the direction of travel
  const craft = new THREE.Group();
  scene.add(craft);
  const mount = new THREE.Group();
  craft.add(mount);
  const deployerMount = new THREE.Group();
  craft.add(deployerMount);

  let radius = R * 1.08;
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(52), 0, 0.5));
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const stationWorld = new THREE.Vector3();
  let inEclipse = false;
  let linked = false;
  let sunLevel = 1;

  /**
   * @param angle     orbit angle, radians
   * @param earthSpin Earth rotation, radians
   * @param pull      0 = close on the spacecraft, 1 = pulled back to show the orbit
   * @param slide     distance between spacecraft and deployer, asset units
   * @param dt        seconds since the last frame
   */
  function update({ angle, earthSpin, pull, slide, dt }) {
    earth.rotation.y = earthSpin;
    pos.set(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(tilt).multiplyScalar(radius);
    vel.set(-Math.sin(angle), 0, Math.cos(angle)).applyQuaternion(tilt);
    up.copy(pos).normalize();
    side.crossVectors(vel, up).normalize();
    // The orbit normal is fixed, so the camera can always sit on its sunlit side
    const camSide = side.dot(SUN) >= 0 ? 1 : -1;

    craft.position.copy(pos);
    basis.makeBasis(side, vel, up); // local X = cross-track, Y = along-track, Z = away from Earth
    craft.quaternion.setFromRotationMatrix(basis);
    // The camera follows the spacecraft, so the deployer is what falls behind
    deployerMount.position.y = -slide * 0.1;
    deployerMount.visible = slide < 120;

    // Eclipse: behind the Earth as seen from the Sun, inside its shadow cylinder
    const along = pos.dot(SUN);
    inEclipse = along < 0 && tmp.copy(pos).addScaledVector(SUN, -along).length() < R;
    sunLevel += ((inEclipse ? 0 : 1) - sunLevel) * Math.min(1, dt * 5);
    sun.intensity = 4.6 * sunLevel;
    sun.position.copy(pos).addScaledVector(SUN, 50);
    sun.target.position.copy(pos);
    scene.environmentIntensity = 0.15 + 0.6 * sunLevel;
    earthshine.intensity = 0.08 + 0.7 * Math.max(0, up.dot(SUN));
    earthshine.position.copy(pos).addScaledVector(up, -50);
    earthshine.target.position.copy(pos);

    // Downlink: the nearest active station within view of the spacecraft
    linked = false;
    const reach = Math.acos(R / radius) * 0.92;
    for (const s of stations) {
      if (!s.visible) continue;
      s.getWorldPosition(stationWorld);
      if (stationWorld.angleTo(pos) < reach) {
        linked = true;
        beamGeo.attributes.position.setXYZ(0, stationWorld.x, stationWorld.y, stationWorld.z);
        beamGeo.attributes.position.setXYZ(1, pos.x, pos.y, pos.z);
        beamGeo.attributes.position.needsUpdate = true;
        break;
      }
    }
    beam.visible = linked;
    ring.material.opacity = 0.22 * pull;
    ring.visible = pull > 0.02;

    // Chase camera: beside and above the spacecraft, the horizon ahead
    const back = THREE.MathUtils.lerp(0.25, 1.5, pull);
    const out = THREE.MathUtils.lerp(1.15, 1.35, pull);
    const high = THREE.MathUtils.lerp(0.45, 0.8, pull);
    camera.position.copy(pos).addScaledVector(vel, -back).addScaledVector(side, out * camSide).addScaledVector(up, high);
    camera.up.copy(up);
    camera.lookAt(tmp.copy(pos).addScaledVector(vel, 0.25 + pull * 0.8).addScaledVector(up, -0.05 - pull * 0.25));
  }

  return {
    scene,
    camera,
    mount,
    deployerMount,
    update,
    configure({ altitudeKm, stationCount }) {
      radius = R * (1 + altitudeKm / RE_KM);
      ring.quaternion.copy(tilt);
      ring.scale.setScalar(radius);
      stations.forEach((s, i) => (s.visible = i < stationCount));
    },
    get inEclipse() {
      return inEclipse;
    },
    get linked() {
      return linked;
    },
  };
}

function bakeSpaceEnvironment(renderer) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // Below the horizon: sunlit Earth. Above: black, with a soft glow near the horizon.
      fragmentShader: 'varying vec3 d; void main(){ float e = smoothstep(0.05, -0.25, d.z); float h = smoothstep(0.3, 0.0, abs(d.z)) * 0.25; gl_FragColor = vec4(vec3(0.16, 0.3, 0.55) * e * 1.6 + vec3(0.3, 0.5, 0.9) * h, 1.0); }',
    }),
  );
  env.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(60, 57, 52) }));
  sunDisc.position.set(30, 14, 28);
  env.add(sunDisc);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return texture;
}
