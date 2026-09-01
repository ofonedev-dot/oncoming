/**
 * Oncoming — arcade crash-racer in Ember Bay.
 * Original IP. Not affiliated with EA or any other publisher.
 */
import * as THREE from 'three';
import { pack, partsOf } from './pack.js';

export { THREE, pack, partsOf };

const BLOCK = pack.world?.block ?? 52;
const GRID = pack.world?.grid ?? 10;
const ROAD_W = 16;
const LANE = 3.4;
const CITY = GRID * BLOCK;
const PLAYER_R = 1.28;
const TRAFFIC_R = 1.2;

const CAR_NAMES = pack.vehicles.filter((v) => v.traffic).map((v) => v.name);

const BUILDING_COLORS = [
  0x8a4a38, 0x5c4a42, 0x3d5560, 0x6b5335, 0x4a3c48, 0x2f5c5a, 0x7a5a3a, 0x3a3a48,
];

const DEFAULT_WHEELS = [
  { id: 'fl', x: -0.78, y: 0.32, z: 0.95 },
  { id: 'fr', x: 0.78, y: 0.32, z: 0.95 },
  { id: 'rl', x: -0.78, y: 0.32, z: -0.95 },
  { id: 'rr', x: 0.78, y: 0.32, z: -0.95 },
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
  loadout: document.getElementById('loadout'),
  compass: document.getElementById('compass'),
  compassNeedle: document.getElementById('compass-needle'),
  compassLabel: document.getElementById('compass-label'),
  compassDist: document.getElementById('compass-dist'),
  minimap: document.getElementById('minimap'),
  garageOverlay: document.getElementById('garage-overlay'),
  garageParts: document.getElementById('garage-parts'),
  garageFeel: document.getElementById('garage-feel'),
  modeOverlay: document.getElementById('mode-overlay'),
  modeList: document.getElementById('mode-list'),
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
  x: BLOCK * Math.floor(GRID / 2) + 8,
  z: BLOCK * (Math.floor(GRID / 2) - 1),
  heading: 0,
  speed: 0,
  yawRate: 0,
  boost: 40,
  crashT: 0,
  shake: 0,
  nearMissLock: new WeakSet(),
  kitId: 'vesper-gt',
  tires: 'street',
  brakes: 'stock',
  engine: 'mill',
  boostKit: 'boost-stock',
  armorKit: 'armor-stock',
  spec: null,
  radius: PLAYER_R,
  wrecking: false,
  wreckScore: 0,
  wreckChain: 1,
};

const buildings = [];
const props = [];
const traffic = [];
const debris = [];
const checkpoints = [];
const worldMarkers = [];

const garage = {
  open: false,
  cool: 0,
  mustExit: false,
  gx: 1,
  gz: Math.max(2, GRID - 2),
  x: BLOCK * 1 + 26,
  z: BLOCK * Math.max(2, GRID - 2) + 14,
  label: 'GARAGE',
  color: 0x4ae0c8,
  bay: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
};

const eventState = {
  phase: 'idle',
  kind: 'sprint',
  time: 0,
  need: 0,
  got: 0,
  cooldown: 0,
  junction: { x: BLOCK * Math.floor(GRID / 2), z: BLOCK * Math.floor(GRID / 2) },
  score: 0,
  chain: 1,
  picker: false,
  pickIndex: 0,
};

const modes = {
  open: false,
  cool: 0,
  index: 0,
  ids: ['race', 'takedown', 'route', 'wreck'],
};

const clock = { last: 0, elapsed: 0 };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140a12);
scene.fog = new THREE.FogExp2(0x1a0e16, pack.world?.fog ?? 0.0062);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 1100);
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

function refreshPlayerSpec() {
  const v = pack.vehiclesById[player.kitId] || pack.vehiclesById['vesper-gt'];
  const tires = pack.partsById[player.tires] || pack.partsById.street;
  const brakes = pack.partsById[player.brakes] || pack.partsById.stock;
  const engine = pack.partsById[player.engine] || pack.partsById.mill;
  const boostP = pack.partsById[player.boostKit] || pack.partsById['boost-stock'];
  const armorP = pack.partsById[player.armorKit] || pack.partsById['armor-stock'];
  const s = v.spec;
  player.spec = {
    mass: s.mass + (brakes.add?.mass || 0) + (engine.add?.mass || 0) + (armorP.add?.mass || 0),
    tireGrip: s.tireGrip * (tires.mul?.tireGrip || 1),
    brakeForce: s.brakeForce * (brakes.mul?.brakeForce || 1),
    accel: s.accel * (engine.mul?.accel || 1),
    topSpeed: s.topSpeed * (engine.mul?.topSpeed || 1),
    boostAccel: s.boostAccel * (engine.mul?.boostAccel || 1),
    boostTop: s.boostTop * (engine.mul?.boostTop || 1),
    reverseAccel: s.reverseAccel,
    maxReverse: s.maxReverse,
    coast: s.coast * (tires.mul?.coast || 1),
    rollingDrag: s.rollingDrag + (tires.add?.rollingDrag || 0) + (engine.add?.rollingDrag || 0),
    aero: s.aero,
    gripLow: s.gripLow,
    gripHigh: s.gripHigh,
    boostTank: 100 * (boostP.mul?.boostTank || 1),
    boostDrain: 22 + (boostP.add?.boostDrain || 0),
    hp: (v.hp || 100) + (armorP.add?.hp || 0),
    armor: (v.armor || 0) + (armorP.add?.armor || 0),
  };
  player.radius = v.radius ?? PLAYER_R;
  player.name = v.name;
}

function restylePlayerParts() {
  if (!player.mesh) return;
  const sticky = player.tires === 'sticky';
  for (const w of player.mesh.userData.wheels || []) {
    w.material.color.setHex(sticky ? 0x2a1810 : 0x111114);
    w.scale.set(sticky ? 1.12 : 1, 1, sticky ? 1.12 : 1);
  }
  for (const c of player.mesh.userData.calipers || []) {
    c.material.color.setHex(player.brakes === 'big' ? 0xff4a1a : 0x333338);
    c.scale.setScalar(player.brakes === 'big' ? 1.35 : 1);
  }
  const intake = player.mesh.userData.intake;
  if (intake) {
    const twin = player.engine === 'twin';
    intake.visible = true;
    intake.scale.set(twin ? 1.28 : 0.82, twin ? 1.9 : 0.7, twin ? 1.25 : 0.85);
    intake.material.color.setHex(twin ? 0x1c1c24 : 0x2a2228);
    intake.material.metalness = twin ? 0.7 : 0.25;
  }
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

function makeCarMesh(bodyColor, kind = 'sport', kit = null) {
  const g = new THREE.Group();
  if (kit?.scale && kit.scale !== 1) g.scale.setScalar(kit.scale);

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
  const axles = kit?.hardpoints?.wheels || DEFAULT_WHEELS;
  const wheels = [];
  const calipers = [];
  const calMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.45, metalness: 0.4 });
  for (const hp of axles) {
    const w = new THREE.Mesh(wheelGeo, dark.clone());
    w.position.set(hp.x, hp.y, hp.z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.22), calMat.clone());
    cal.position.set(hp.x * 0.82, hp.y, hp.z);
    g.add(cal);
    calipers.push(cal);
  }
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.62), bodyMat.clone());
  intake.position.set(0, 0.8, 0.52);
  g.add(intake);

  g.userData.wheels = wheels;
  g.userData.calipers = calipers;
  g.userData.body = body;
  g.userData.intake = intake;

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

function addBuilding(x, z, w, d, h, color, padY = 0) {
  if (padY > 0.2) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(w + 3, padY, d + 3),
      new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.95 }),
    );
    pad.position.set(x, padY / 2, z);
    pad.receiveShadow = true;
    scene.add(pad);
  }
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, padY + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (h > 10) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2),
      new THREE.MeshStandardMaterial({ color: 0xffc07a, emissive: 0x331808, roughness: 0.5 }),
    );
    band.position.set(x, padY + h * 0.62, z);
    scene.add(band);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.4, 0.8, d * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6 }),
  );
  roof.position.set(x, padY + h + 0.4, z);
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
  const def = pack.propsById[kind] || pack.propsById.crate || {
    kind: 'crate',
    color: 0x8a6232,
    w: 1.1,
    d: 1.1,
    h: 1.1,
    smashBoost: 6,
  };
  const group = new THREE.Group();
  const color = def.color;
  const w = def.w;
  const d = def.d;
  const h = def.h;
  const mesh = new THREE.Mesh(
    def.kind === 'cone' ? new THREE.ConeGeometry(0.28, h, 8) : new THREE.BoxGeometry(w, h, d),
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
    smashBoost: def.smashBoost ?? 6,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
  });
}

function makeWaypointMarker(color, tall = false) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: tall ? 1 : 0.92 });
  const poleH = tall ? 20 : 11;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(tall ? 0.26 : 0.16, tall ? 0.32 : 0.2, poleH, 6), mat);
  pole.position.y = poleH / 2;
  g.add(pole);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(tall ? 2.1 : 1.2, 0), mat);
  diamond.position.y = poleH + (tall ? 2.4 : 1.4);
  diamond.scale.set(1, tall ? 1.7 : 1.45, 1);
  g.add(diamond);
  const disc = new THREE.Mesh(new THREE.RingGeometry(tall ? 1.35 : 0.85, tall ? 2.25 : 1.3, 20), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.14;
  g.add(disc);
  if (tall) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 24), mat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.16;
    g.add(halo);
  }
  g.userData.diamond = diamond;
  return g;
}

function buildGarageLot(cx, cz) {
  const poi = pack.poisById.garage || { gx: 1, gz: Math.max(2, GRID - 2), label: 'GARAGE', color: 0x4ae0c8 };
  const gx = poi.gx ?? 1;
  const gz = poi.gz ?? Math.max(2, GRID - 2);
  const south = gz * BLOCK;
  garage.gx = gx;
  garage.gz = gz;
  garage.cx = cx;
  garage.cz = cz;
  garage.label = poi.label || 'GARAGE';
  garage.color = 0xffc44d;
  garage.x = poi.x ?? cx;
  garage.z = poi.z ?? south + 14;
  garage.bay = {
    minX: cx - 6.5,
    maxX: cx + 6.5,
    minZ: south + 8.2,
    maxZ: south + 22,
  };

  const teal = 0x1c5e62;
  const trim = 0xffb040;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x4ae0c8 });

  const drive = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.16, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.95 }),
  );
  drive.position.set(cx, 0.08, south + 16);
  drive.receiveShadow = true;
  scene.add(drive);

  const stall = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.2), lineMat);
  stall.position.set(cx, 0.17, south + 21.2);
  scene.add(stall);
  for (const sx of [-5.5, 5.5]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 12), lineMat);
    side.position.set(cx + sx, 0.17, south + 15.2);
    scene.add(side);
  }

  const bw = 26;
  const bd = 16;
  const bh = 9.5;
  const bx = cx;
  const bz = cz + 6;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bw, bh, bd),
    new THREE.MeshStandardMaterial({ color: teal, roughness: 0.72, metalness: 0.18 }),
  );
  body.position.set(bx, bh / 2, bz);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  addAABB(bx, bz, bw, bd);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(bw + 0.3, 0.5, bd + 0.3),
    new THREE.MeshStandardMaterial({ color: trim, emissive: 0x5a3208, roughness: 0.45 }),
  );
  stripe.position.set(bx, bh * 0.72, bz);
  scene.add(stripe);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x0c2224, roughness: 0.5, metalness: 0.2 }),
  );
  door.position.set(cx, 2.7, bz - bd / 2 + 0.15);
  scene.add(door);

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.35, 11),
    new THREE.MeshStandardMaterial({ color: 0x163e42, roughness: 0.6, metalness: 0.15 }),
  );
  canopy.position.set(cx, 4.5, south + 17.5);
  canopy.castShadow = true;
  scene.add(canopy);

  for (const sx of [-6.6, 6.6]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 4.5, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x24484c, roughness: 0.55 }),
    );
    post.position.set(cx + sx, 2.25, south + 12.5);
    post.castShadow = true;
    scene.add(post);
  }

  for (const sx of [-7.4, 7.4]) {
    addAABB(cx + sx, south + 16.5, 1.8, 13);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 3.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x17464a, roughness: 0.7 }),
    );
    wall.position.set(cx + sx, 1.6, south + 16.5);
    wall.castShadow = true;
    scene.add(wall);
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(10.5, 1.7, 0.28),
    new THREE.MeshStandardMaterial({
      color: trim,
      emissive: 0xff8a20,
      emissiveIntensity: 0.7,
      roughness: 0.4,
    }),
  );
  sign.position.set(cx, 7.4, bz - bd / 2 - 0.2);
  scene.add(sign);

  const sign2 = new THREE.Mesh(
    new THREE.BoxGeometry(8.2, 0.7, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x0c2224 }),
  );
  sign2.position.set(cx, 7.4, bz - bd / 2 - 0.38);
  scene.add(sign2);

  const totemPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 6.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30 }),
  );
  totemPole.position.set(cx - 10.5, 3.1, south + 8.6);
  totemPole.castShadow = true;
  scene.add(totemPole);
  const totem = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.5, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0x4ae0c8,
      emissive: 0x146a60,
      emissiveIntensity: 0.85,
      roughness: 0.35,
    }),
  );
  totem.position.set(cx - 10.5, 5.6, south + 8.6);
  scene.add(totem);

  const marker = makeWaypointMarker(garage.color, true);
  marker.scale.setScalar(1.15);
  marker.position.set(garage.x, 0, garage.z);
  scene.add(marker);
  garage.marker = marker;
  worldMarkers.push({ id: 'garage', mesh: marker, get x() { return garage.x; }, get z() { return garage.z; } });
}

function buildBay() {
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a3a48, roughness: 0.18, metalness: 0.62 });
  const west = new THREE.Mesh(new THREE.PlaneGeometry(280, CITY + 220), waterMat);
  west.rotation.x = -Math.PI / 2;
  west.position.set(-70, -0.18, CITY / 2);
  scene.add(west);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(CITY + 80, 70), waterMat);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(CITY * 0.28, -0.2, -28);
  scene.add(mouth);
  const island = new THREE.Mesh(
    new THREE.BoxGeometry(78, 1.2, 96),
    new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.92 }),
  );
  island.position.set(-70, 0.2, 260);
  island.receiveShadow = true;
  scene.add(island);
  addBuilding(-88, 248, 14, 12, 7, 0x6b5335);
  addBuilding(-52, 278, 16, 11, 9, 0x5c4a42);
  addBuilding(-80, 278, 10, 10, 6, 0x7a5a3a);
  const spanZ = 260;
  const spanEast = -6;
  const spanWest = -42;
  const spanLen = spanEast - spanWest;
  const spanMid = (spanEast + spanWest) / 2;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(spanLen, 0.2, ROAD_W),
    new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.92, metalness: 0.05 }),
  );
  deck.position.set(spanMid, 0.06, spanZ);
  deck.receiveShadow = true;
  scene.add(deck);
  const flare = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.18, ROAD_W + 1.2),
    new THREE.MeshStandardMaterial({ color: 0x32323a, roughness: 0.88, metalness: 0.06 }),
  );
  flare.position.set(-8, 0.07, spanZ);
  flare.receiveShadow = true;
  scene.add(flare);
  const waterEast = -8.2;
  const waterWest = -40;
  const waterLen = waterEast - waterWest;
  const waterMid = (waterEast + waterWest) / 2;
  const hitEast = -11.5;
  const hitLen = hitEast - waterWest;
  const hitMid = (hitEast + waterWest) / 2;
  const railZ = ROAD_W * 0.5 - 0.12;
  for (const sz of [-railZ, railZ]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(waterLen, 0.9, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xffb040, roughness: 0.45, metalness: 0.25 }),
    );
    rail.position.set(waterMid, 0.95, spanZ + sz);
    scene.add(rail);
    addAABB(hitMid, spanZ + sz, hitLen, 0.7);
  }
  for (const tx of [-24, -56]) {
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 28, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xc45a32, roughness: 0.55, metalness: 0.3 }),
    );
    tower.position.set(tx, 14, spanZ + ROAD_W * 0.5 + 2.4);
    tower.castShadow = true;
    scene.add(tower);
    addAABB(tx, spanZ + ROAD_W * 0.5 + 2.4, 2.4, 2.4);
  }
  const cableMat = new THREE.MeshBasicMaterial({ color: 0xe8d0a0 });
  for (const side of [-railZ + 0.2, railZ - 0.2]) {
    const cable = new THREE.Mesh(new THREE.BoxGeometry(waterLen, 0.12, 0.12), cableMat);
    cable.position.set(waterMid, 18, spanZ + side);
    scene.add(cable);
  }

  const ptMarker = makeWaypointMarker(0x4ae0c8);
  ptMarker.position.set(-70, 0, 260);
  scene.add(ptMarker);
  worldMarkers.push({ id: "ember-point", mesh: ptMarker, x: -70, z: 260 });
}

function buildCity() {
  const hemi = new THREE.HemisphereLight(0xffc4a0, 0x1a2430, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff8a4c, 1.35);
  sun.position.set(-70, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 720;
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
  const garagePoi = pack.poisById.garage || { gx: 1, gz: Math.max(2, GRID - 2) };
  const skipGx = garagePoi.gx ?? 1;
  const skipGz = garagePoi.gz ?? Math.max(2, GRID - 2);

  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      if (gx === 0) continue;
      const cx = (gx + 0.5) * BLOCK;
      const cz = (gz + 0.5) * BLOCK;
      let padY = 0;
      let pal = BUILDING_COLORS;
      let hMul = 1;
      if (gx <= 2) {
        pal = [0x6b5335, 0x5c4a42, 0x7a5a3a, 0x4a3c34];
        hMul = 0.72;
      } else if (gx >= 8 || gz >= 9) {
        pal = [0x4a3c48, 0x3a3a48, 0x5c4a42, 0x2f3a40];
        hMul = 1.12;
        padY = 3.4 + Math.max(0, gx - 7) * 1.15 + Math.max(0, gz - 8) * 0.8;
      } else if (gx >= 3 && gx <= 5 && gz >= 3 && gz <= 6) {
        pal = [0x3d5560, 0x3a3a48, 0x4a3c48, 0x2f5c5a];
        hMul = 1.4;
      } else {
        pal = [0x8a4a38, 0x7a5a3a, 0x6b5335, 0x5c4a42];
        hMul = 0.88;
      }
      const walk = new THREE.Mesh(new THREE.BoxGeometry(plot, 0.12 + padY, plot), walkMat);
      walk.position.set(cx, (0.12 + padY) / 2, cz);
      walk.receiveShadow = true;
      scene.add(walk);

      addLamp(cx - plot / 2 + 1.2, cz - plot / 2 + 1.2);
      if ((gx + gz) % 2 === 0) addLamp(cx + plot / 2 - 1.2, cz + plot / 2 - 1.2);

      if (gx === skipGx && gz === skipGz) {
        buildGarageLot(cx, cz);
        continue;
      }

      const inset = 3.2;
      const count = gx % 3 === 0 ? 2 : 1;
      if (count === 1) {
        const w = plot - inset * 2 - rand(0, 4);
        const d = plot - inset * 2 - rand(0, 4);
        const h = rand(8, gx + gz > 7 ? 28 : 16) * hMul;
        addBuilding(cx + rand(-1.5, 1.5), cz + rand(-1.5, 1.5), w, d, h, pick(pal), padY);
      } else {
        const w = (plot - inset * 2) * 0.42;
        const d = plot - inset * 2 - rand(0, 3);
        const h1 = rand(7, 18) * hMul;
        const h2 = rand(9, 22) * hMul;
        addBuilding(cx - w * 0.7, cz, w, d, h1, pick(pal), padY);
        addBuilding(cx + w * 0.7, cz, w, d * 0.85, h2, pick(pal), padY);
      }

      const kinds = ['barrel', 'crate', 'dumpster', 'cone'];
      addProp(cx - plot / 2 + 2.2, cz + rand(-6, 6), pick(kinds));
      if (Math.random() > 0.4) addProp(cx + plot / 2 - 2.2, cz + rand(-6, 6), pick(kinds));
    }
  }

  buildBay();
  for (let i = 0; i < 3; i++) {
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.5, 18),
      new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
    );
    pier.position.set(36 + i * 22, 0.2, -12);
    pier.receiveShadow = true;
    scene.add(pier);
    addAABB(36 + i * 22, -8, 4, 8);
  }

  const jPoi = pack.poisById.junction;
  if (jPoi && (jPoi.x || jPoi.z)) {
    eventState.junction.x = jPoi.x;
    eventState.junction.z = jPoi.z;
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
  const jDiamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.15, 0),
    new THREE.MeshBasicMaterial({ color: 0xff7a30 }),
  );
  jDiamond.position.y = 19.6;
  jDiamond.scale.set(1, 1.4, 1);
  beacon.add(jDiamond);
  beacon.userData.diamond = jDiamond;
  beacon.position.set(eventState.junction.x, 0, eventState.junction.z);
  scene.add(beacon);
  eventState.beacon = beacon;
  eventState.ring = ring;

  const gateColor = pack.poisById.waypoint?.color ?? 0x66e0ff;
  for (let n = 0; n < 8; n++) {
    const cp = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.16, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0 }),
    );
    cp.rotation.x = Math.PI / 2;
    cp.position.y = 1.4;
    scene.add(cp);
    const marker = makeWaypointMarker(gateColor);
    marker.visible = false;
    scene.add(marker);
    checkpoints.push({ mesh: cp, marker, x: 0, z: 0, active: false });
  }
}

function spawnTraffic() {
  const kits = pack.vehicles.filter((v) => v.traffic);
  const fallbackColors = [0x3a6ea5, 0xc45a4a, 0xd8c45a, 0x4a8a62, 0x8a6aad, 0xc07038, 0xdddddd];
  const count = pack.world?.trafficCount ?? 28;
  for (let i = 0; i < count; i++) {
    const axis = i % 2 === 0 ? 'ew' : 'ns';
    const road = 1 + (i % (GRID - 1));
    const dir = i % 4 < 2 ? 1 : -1;
    const lane = (i % 4 < 2 ? 1 : -1) * LANE;
    const t = rand(10, CITY - 10);
    const def = kits.length ? kits[i % kits.length] : null;
    const kind = def?.kind || (i % 5 === 0 ? 'van' : 'sport');
    const color = def?.color ?? pick(fallbackColors);
    const mesh = makeCarMesh(color, kind, def);
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
      name: def?.name || pick(CAR_NAMES),
      kitId: def?.id || 'base-car',
      radius: def?.radius ?? TRAFFIC_R,
      hp: def?.hp ?? 100,
      maxHp: def?.hp ?? 100,
      armor: def?.armor ?? 0,
      baseColor: color,
      hitCool: 0,
      hitT: 0,
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
  const def = pack.vehicles.find((v) => v.player) || pack.vehiclesById['vesper-gt'];
  const mesh = makeCarMesh(def.color, def.kind || 'sport', def);
  scene.add(mesh);
  player.mesh = mesh;
  player.kitId = def.id;
  player.tires = def.tires || 'street';
  player.brakes = def.brakes || 'stock';
  player.engine = def.engine || 'mill';
  player.boostKit = def.boostKit || 'boost-stock';
  player.armorKit = def.armorKit || 'armor-stock';
  refreshPlayerSpec();
  restylePlayerParts();
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
  worldMarkers,
  garage,
  modes,
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
  wrapAngle,
  makeCarMesh,
  makeWaypointMarker,
  buildCity,
  spawnTraffic,
  placeTraffic,
  playerMeshSetup,
  refreshPlayerSpec,
  restylePlayerParts,
  toast,
  audioStart,
  blip,
  noiseBurst,
  ui,
};
