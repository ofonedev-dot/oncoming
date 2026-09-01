/**
 * Oncoming — arcade crash-racer in Ember Bay.
 * Original IP. Not affiliated with EA or any other publisher.
 */
import * as THREE from 'three';

export { THREE };

const BLOCK = 52;
const GRID = 6;
const ROAD_W = 16;
const LANE = 3.4;
const CITY = GRID * BLOCK;
const PLAYER_R = 1.28;
const TRAFFIC_R = 1.2;

const CAR_NAMES = [
  'Ashline Coupe',
  'Forge Hauler',
  'Kestrel Hatch',
  'Nimbus Van',
  'Solara Roadster',
];

const BUILDING_COLORS = [
  0x8a4a38, 0x5c4a42, 0x3d5560, 0x6b5335, 0x4a3c48, 0x2f5c5a, 0x7a5a3a, 0x3a3a48,
];

const keys = new Set();
const mouse = { down: false };

const hud = {
  speed: document.getElementById('speed'),
  boost: document.getElementById('boost-fill'),
  banner: document.getElementById('event-banner'),
  toast: document.getElementById('toast'),
  splash: document.getElementById('splash'),
  controls: document.getElementById('controls'),
};

const ui = { started: false, toastT: 0 };

const input = {
  throttle: 0,
  steer: 0,
  brake: 0,
  boost: false,
  padConnected: false,
};

const player = {
  x: BLOCK * 3 + 8,
  z: BLOCK * 2,
  heading: 0,
  speed: 0,
  yawRate: 0,
  boost: 40,
  crashT: 0,
  shake: 0,
  nearMissLock: new WeakSet(),
};

const buildings = [];
const props = [];
const traffic = [];
const debris = [];
const checkpoints = [];

const eventState = {
  phase: 'idle',
  kind: 'sprint',
  time: 0,
  need: 0,
  got: 0,
  cooldown: 0,
  junction: { x: BLOCK * 3, z: BLOCK * 3 },
};

const clock = { last: 0 };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140a12);
scene.fog = new THREE.FogExp2(0x1a0e16, 0.0088);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 700);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmp = new THREE.Vector3();

const audio = {
  ctx: null,
  engine: null,
  gain: null,
};

function audioStart() {
  if (audio.ctx) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 40;
  filt.type = 'lowpass';
  filt.frequency.value = 280;
  gain.gain.value = 0.0;
  osc.connect(filt);
  filt.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  audio.ctx = ctx;
  audio.engine = osc;
  audio.gain = gain;
  audio.filt = filt;
}

function blip(freq, dur, type = 'square', vol = 0.08) {
  if (!audio.ctx) return;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + dur);
  o.connect(g);
  g.connect(audio.ctx.destination);
  o.start();
  o.stop(audio.ctx.currentTime + dur);
}

function noiseBurst(dur = 0.18, vol = 0.12) {
  if (!audio.ctx) return;
  const n = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
  const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = audio.ctx.createBufferSource();
  const g = audio.ctx.createGain();
  const f = audio.ctx.createBiquadFilter();
  src.buffer = n;
  f.type = 'bandpass';
  f.frequency.value = 420;
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(audio.ctx.destination);
  src.start();
}

function toast(text) {
  hud.toast.textContent = text;
  hud.toast.classList.add('show');
  ui.toastT = 0.9;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(480, 20, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vP;
      void main() {
        float h = normalize(vP).y;
        vec3 low = vec3(0.95, 0.38, 0.18);
        vec3 mid = vec3(0.42, 0.14, 0.22);
        vec3 hi = vec3(0.07, 0.05, 0.14);
        vec3 col = mix(low, mid, smoothstep(-0.15, 0.12, h));
        col = mix(col, hi, smoothstep(0.12, 0.62, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(geo, mat));
}

function makeCarMesh(bodyColor, kind = 'sport') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.38,
    metalness: 0.45,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.7, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x88c4dd,
    roughness: 0.15,
    metalness: 0.4,
    transparent: true,
    opacity: 0.72,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.48, kind === 'van' ? 3.6 : 3.15), bodyMat);
  body.position.y = 0.52;
  body.castShadow = true;
  g.add(body);

  const cabinZ = kind === 'van' ? 0.15 : -0.18;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, kind === 'van' ? 0.7 : 0.42, kind === 'van' ? 2.1 : 1.35),
    glass,
  );
  cabin.position.set(0, kind === 'van' ? 1.05 : 0.88, cabinZ);
  cabin.castShadow = true;
  g.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.28), bodyMat);
  spoiler.position.set(0, 0.82, -1.42);
  if (kind === 'sport') g.add(spoiler);

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const axles = [
    [-0.78, 0.32, 0.95],
    [0.78, 0.32, 0.95],
    [-0.78, 0.32, -0.95],
    [0.78, 0.32, -0.95],
  ];
  const wheels = [];
  for (const [x, y, z] of axles) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, y, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
  for (const sx of [-0.52, 0.52]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), lightMat);
    l.position.set(sx, 0.52, 1.58);
    g.add(l);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const sx of [-0.52, 0.52]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), tailMat);
    l.position.set(sx, 0.52, kind === 'van' ? -1.82 : -1.58);
    g.add(l);
  }
  return g;
}

function addAABB(x, z, w, d) {
  buildings.push({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  });
}

function addBuilding(x, z, w, d, h, color) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (h > 10) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2),
      new THREE.MeshStandardMaterial({ color: 0xffc07a, emissive: 0x331808, roughness: 0.5 }),
    );
    band.position.set(x, h * 0.62, z);
    scene.add(band);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.4, 0.8, d * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6 }),
  );
  roof.position.set(x, h + 0.4, z);
  scene.add(roof);
  addAABB(x, z, w, d);
}

function addLamp(x, z) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 5.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30 }),
  );
  pole.position.set(x, 2.6, z);
  pole.castShadow = true;
  scene.add(pole);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.28),
    new THREE.MeshBasicMaterial({ color: 0xffd8a0 }),
  );
  head.position.set(x, 5.25, z);
  scene.add(head);
}

function addProp(x, z, kind) {
  const group = new THREE.Group();
  let color = 0xc45a18;
  let w = 0.7;
  let d = 0.7;
  let h = 0.9;
  if (kind === 'crate') {
    color = 0x8a6232;
    w = 1.1;
    d = 1.1;
    h = 1.1;
  } else if (kind === 'dumpster') {
    color = 0x3d6b48;
    w = 1.6;
    d = 0.9;
    h = 1.15;
  } else if (kind === 'cone') {
    color = 0xff7a18;
    w = 0.45;
    d = 0.45;
    h = 0.85;
  }
  const mesh = new THREE.Mesh(
    kind === 'cone' ? new THREE.ConeGeometry(0.28, h, 8) : new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 }),
  );
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  group.add(mesh);
  group.position.set(x, 0, z);
  scene.add(group);
  props.push({
    x,
    z,
    r: Math.max(w, d) * 0.55,
    mesh: group,
    smashed: false,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
  });
}

function buildCity() {
  const hemi = new THREE.HemisphereLight(0xffc4a0, 0x1a2430, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff8a4c, 1.35);
  sun.position.set(-70, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 420;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x2a1824, 0.35));

  makeSky();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY + 280, CITY + 280),
    new THREE.MeshStandardMaterial({ color: 0x1c1416, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CITY / 2, -0.05, CITY / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.92, metalness: 0.05 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x4a4550, roughness: 0.88 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd8c8a0 });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e0c8 });

  for (let i = 0; i <= GRID; i++) {
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(CITY + ROAD_W, 0.06, ROAD_W), asphalt);
    roadZ.position.set(CITY / 2, 0.02, i * BLOCK);
    roadZ.receiveShadow = true;
    scene.add(roadZ);
    const roadX = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W, 0.06, CITY + ROAD_W), asphalt);
    roadX.position.set(i * BLOCK, 0.02, CITY / 2);
    roadX.receiveShadow = true;
    scene.add(roadX);

    for (let s = 1; s < GRID * 4; s++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.18), stripeMat);
      stripe.position.set((s * CITY) / (GRID * 4), 0.06, i * BLOCK);
      scene.add(stripe);
      const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 2.2), stripeMat);
      stripe2.position.set(i * BLOCK, 0.06, (s * CITY) / (GRID * 4));
      scene.add(stripe2);
    }
  }

  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      for (let k = -3; k <= 3; k++) {
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 1.6), crossMat);
        c1.position.set(i * BLOCK + k * 0.7, 0.07, j * BLOCK);
        scene.add(c1);
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.4), crossMat);
        c2.position.set(i * BLOCK, 0.07, j * BLOCK + k * 0.7);
        scene.add(c2);
      }
    }
  }

  const plot = BLOCK - ROAD_W;
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const cx = (gx + 0.5) * BLOCK;
      const cz = (gz + 0.5) * BLOCK;
      const walk = new THREE.Mesh(new THREE.BoxGeometry(plot, 0.12, plot), walkMat);
      walk.position.set(cx, 0.04, cz);
      walk.receiveShadow = true;
      scene.add(walk);

      const inset = 3.2;
      const count = gx % 3 === 0 ? 2 : 1;
      if (count === 1) {
        const w = plot - inset * 2 - rand(0, 4);
        const d = plot - inset * 2 - rand(0, 4);
        const h = rand(8, gx + gz > 7 ? 28 : 16);
        addBuilding(cx + rand(-1.5, 1.5), cz + rand(-1.5, 1.5), w, d, h, pick(BUILDING_COLORS));
      } else {
        const w = (plot - inset * 2) * 0.42;
        const d = plot - inset * 2 - rand(0, 3);
        const h1 = rand(7, 18);
        const h2 = rand(9, 22);
        addBuilding(cx - w * 0.7, cz, w, d, h1, pick(BUILDING_COLORS));
        addBuilding(cx + w * 0.7, cz, w, d * 0.85, h2, pick(BUILDING_COLORS));
      }

      addLamp(cx - plot / 2 + 1.2, cz - plot / 2 + 1.2);
      if ((gx + gz) % 2 === 0) addLamp(cx + plot / 2 - 1.2, cz + plot / 2 - 1.2);

      const kinds = ['barrel', 'crate', 'dumpster', 'cone'];
      addProp(cx - plot / 2 + 2.2, cz + rand(-6, 6), pick(kinds));
      if (Math.random() > 0.4) addProp(cx + plot / 2 - 2.2, cz + rand(-6, 6), pick(kinds));
    }
  }

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY + 240, 90),
    new THREE.MeshStandardMaterial({ color: 0x0a3a48, roughness: 0.18, metalness: 0.62 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY / 2, -0.2, -42);
  scene.add(water);

  for (let i = 0; i < 5; i++) {
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.5, 22),
      new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
    );
    pier.position.set(40 + i * 28, 0.2, -18);
    pier.receiveShadow = true;
    scene.add(pier);
    addAABB(40 + i * 28, -10, 4, 8);
  }

  const beacon = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.18, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xff7a30 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  beacon.add(ring);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 18, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc070 }),
  );
  pillar.position.y = 9;
  beacon.add(pillar);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffaa55 }),
  );
  glow.position.y = 18.2;
  beacon.add(glow);
  beacon.position.set(eventState.junction.x, 0, eventState.junction.z);
  scene.add(beacon);
  eventState.beacon = beacon;
  eventState.ring = ring;

  for (let n = 0; n < 4; n++) {
    const cp = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.16, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0 }),
    );
    cp.rotation.x = Math.PI / 2;
    cp.position.y = 1.4;
    scene.add(cp);
    checkpoints.push({ mesh: cp, x: 0, z: 0, active: false });
  }
}

function spawnTraffic() {
  const colors = [0x3a6ea5, 0xc45a4a, 0xd8c45a, 0x4a8a62, 0x8a6aad, 0xc07038, 0xdddddd];
  for (let i = 0; i < 18; i++) {
    const axis = i % 2 === 0 ? 'ew' : 'ns';
    const road = 1 + (i % (GRID - 1));
    const dir = i % 4 < 2 ? 1 : -1;
    const lane = (i % 4 < 2 ? 1 : -1) * LANE;
    const t = rand(10, CITY - 10);
    const kind = i % 5 === 0 ? 'van' : 'sport';
    const mesh = makeCarMesh(pick(colors), kind);
    scene.add(mesh);
    const car = {
      axis,
      road,
      dir,
      lane,
      t,
      speed: rand(9, 15),
      baseSpeed: 0,
      smashed: false,
      smashT: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      heading: 0,
      x: 0,
      z: 0,
      mesh,
      name: pick(CAR_NAMES),
      nearCool: 0,
    };
    car.baseSpeed = car.speed;
    placeTraffic(car);
    traffic.push(car);
  }
}

function placeTraffic(car) {
  if (car.axis === 'ew') {
    car.x = car.t;
    car.z = car.road * BLOCK + car.lane;
    car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.z = car.t;
    car.x = car.road * BLOCK + car.lane;
    car.heading = car.dir > 0 ? 0 : Math.PI;
  }
}

function playerMeshSetup() {
  const mesh = makeCarMesh(0xff4a1a, 'sport');
  scene.add(mesh);
  player.mesh = mesh;
}

export {
  BLOCK,
  GRID,
  ROAD_W,
  LANE,
  CITY,
  PLAYER_R,
  TRAFFIC_R,
  CAR_NAMES,
  keys,
  hud,
  input,
  player,
  buildings,
  props,
  traffic,
  debris,
  checkpoints,
  eventState,
  clock,
  scene,
  camera,
  renderer,
  camTarget,
  camPos,
  tmp,
  audio,
  rand,
  pick,
  clamp,
  makeCarMesh,
  buildCity,
  spawnTraffic,
  placeTraffic,
  playerMeshSetup,
  toast,
  audioStart,
  blip,
  noiseBurst,
  ui,
};
