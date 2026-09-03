/**
 * Oncoming — arcade crash-racer in Ember Bay.
 * Original IP. Not affiliated with EA or any other publisher.
 */
import {
  THREE,
  BLOCK,
  GRID,
  CITY,
  PLAYER_R,
  TRAFFIC_R,
  keys,
  hud,
  input,
  player,
  buildings,
  props,
  traffic,
  debris,
  checkpoints,
  garage,
  modes,
  pack,
  partsOf,
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
  buildCity,
  spawnTraffic,
  playerMeshSetup,
  placeTraffic,
  refreshPlayerSpec,
  restylePlayerParts,
  toast,
  audioStart,
  blip,
  noiseBurst,
  ui,
} from './world.js';
import {
  nav,
  openNav,
  handleNavKey,
  updateGps,
  drawRoute,
  navWaypoint,
} from './nav.js';

function circleAABB(cx, cz, r, b) {
  const qx = clamp(cx, b.minX, b.maxX);
  const qz = clamp(cz, b.minZ, b.maxZ);
  let dx = cx - qx;
  let dz = cz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r && !(cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ)) {
    if (d2 >= r * r) return null;
  }
  const inside = cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ;
  if (!inside && d2 >= r * r) return null;
  if (inside) {
    const left = cx - b.minX;
    const right = b.maxX - cx;
    const top = cz - b.minZ;
    const bot = b.maxZ - cz;
    const m = Math.min(left, right, top, bot);
    if (m === left) return { nx: -1, nz: 0, depth: r + left };
    if (m === right) return { nx: 1, nz: 0, depth: r + right };
    if (m === top) return { nx: 0, nz: -1, depth: r + top };
    return { nx: 0, nz: 1, depth: r + bot };
  }
  const dist = Math.sqrt(d2) || 0.0001;
  return { nx: dx / dist, nz: dz / dist, depth: r - dist };
}

function readInput() {
  let throttle = 0;
  let steer = 0;
  let brake = 0;
  let boost = false;

  if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1;
  if (keys.has('Space')) brake = 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) boost = true;

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad = null;
  for (const p of pads) if (p) { pad = p; break; }
  input.padConnected = !!pad;
  if (pad) {
    const ax = Math.abs(pad.axes[0]) > 0.12 ? pad.axes[0] : 0;
    steer += ax;
    const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
    const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
    const a = pad.buttons[0] && pad.buttons[0].pressed ? 1 : 0;
    const b = pad.buttons[1] && pad.buttons[1].pressed ? 1 : 0;
    const x = pad.buttons[2] && pad.buttons[2].pressed;
    const y = pad.buttons[3] && pad.buttons[3].pressed;
    const lb = pad.buttons[4] && pad.buttons[4].pressed;
    const rb = pad.buttons[5] && pad.buttons[5].pressed;
    throttle += Math.max(rt, a);
    throttle -= lt > 0.15 ? lt : 0;
    if (b) brake = 1;
    if (x || y || lb || rb) boost = true;
  }

  if (garage.open || modes.open || nav.open) {
    input.throttle = 0;
    input.steer = 0;
    input.brake = 0;
    input.boost = false;
    return;
  }

  input.throttle = clamp(throttle, -1, 1);
  input.steer = clamp(steer, -1, 1);
  input.brake = brake;
  input.boost = boost;
}

function smashProp(p, heading, speed) {
  if (p.smashed) return;
  p.smashed = true;
  p.vx = Math.sin(heading) * speed * 0.45 + rand(-3, 3);
  p.vz = Math.cos(heading) * speed * 0.45 + rand(-3, 3);
  p.vy = rand(4, 8);
  p.spin = rand(-10, 10);
  player.boost = clamp(player.boost + (p.smashBoost ?? 6), 0, boostMax());
  if (player.wrecking) addWreckScore('prop');
  else toast('SMASH');
  noiseBurst(0.12, 0.08);
}

function smashCar(car, heading, speed) {
  if (car.smashed) return;
  car.smashed = true;
  car.smashT = 0;
  car.vx = Math.sin(heading) * speed * 0.55 + rand(-4, 4);
  car.vz = Math.cos(heading) * speed * 0.55 + rand(-4, 4);
  car.vy = rand(5, 9);
  car.spin = rand(-12, 12);
  player.boost = clamp(player.boost + 18, 0, boostMax());
  player.shake = Math.max(player.shake, 0.35);
  player.speed *= 0.82;
  if (player.wrecking) addWreckScore('car');
  else toast('TAKEDOWN');
  noiseBurst(0.22, 0.16);
  blip(140, 0.12, 'sawtooth', 0.06);
  rumble(180, 0.85, 0.4);
  spawnDebris(car.x, car.z, 0xc45a18);
  if (eventState.phase === 'takedown') {
    eventState.got += 1;
  }
}


function applyDamageVisual(car) {
  const body = car.mesh?.userData?.body;
  if (!body) return;
  const ratio = 1 - Math.max(0, car.hp) / Math.max(1, car.maxHp);
  body.material.color.setHex(car.baseColor || 0x888888);
  body.material.color.multiplyScalar(1 - ratio * 0.72);
  body.material.roughness = 0.38 + ratio * 0.5;
}

function spawnSparks(x, z, n = 4) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(rand(0.06, 0.16), rand(0.04, 0.1), rand(0.06, 0.14)),
      new THREE.MeshBasicMaterial({ color: 0xffcc77 }),
    );
    m.position.set(x, 0.5, z);
    scene.add(m);
    debris.push({
      mesh: m,
      vx: rand(-8, 8),
      vy: rand(4, 10),
      vz: rand(-8, 8),
      life: rand(0.25, 0.55),
    });
  }
}

function damageCar(car, heading, speed) {
  if (car.smashed || car.hitCool > 0) return;
  if (player.wrecking) {
    smashCar(car, heading, Math.max(speed, 18));
    return;
  }
  const dx = car.x - player.x;
  const dz = car.z - player.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  const nx = dx / dist;
  const nz = dz / dist;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const alignment = Math.max(0, fx * nx + fz * nz);
  const boosting = input.boost && player.boost > 0;
  const boostMul = boosting ? 1.45 : 1;
  const armor = car.armor || 0;
  let dmg = speed * (0.35 + alignment * 1.55) * boostMul;
  dmg /= 1 + armor;
  if (alignment < 0.35) dmg *= 0.55;
  dmg = Math.max(6, dmg);
  car.hp -= dmg;
  car.hitCool = 0.32;
  car.hitT = 0.28;
  player.speed *= alignment > 0.7 ? 0.86 : 0.94;
  player.shake = Math.max(player.shake, alignment > 0.65 ? 0.22 : 0.1);
  player.boost = clamp(player.boost + (alignment > 0.55 ? 5 : 2), 0, boostMax());
  applyDamageVisual(car);
  spawnSparks(car.x, car.z, alignment > 0.6 ? 6 : 3);
  noiseBurst(alignment > 0.6 ? 0.1 : 0.06, alignment > 0.6 ? 0.08 : 0.04);
  if (car.hp <= 0) {
    car.hp = 0;
    smashCar(car, heading, speed);
    return;
  }
  toast(alignment > 0.62 ? 'SHUNT' : 'CLIP');
  blip(alignment > 0.62 ? 220 : 380, 0.07, 'sawtooth', 0.04);
}

function spawnDebris(x, z, color) {
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(rand(0.12, 0.35), rand(0.08, 0.22), rand(0.12, 0.3)),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    m.position.set(x, 0.6, z);
    scene.add(m);
    debris.push({
      mesh: m,
      vx: rand(-6, 6),
      vy: rand(3, 9),
      vz: rand(-6, 6),
      life: rand(0.6, 1.2),
    });
  }
}

function rumble(ms, strong, weak) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (p && p.vibrationActuator) {
      p.vibrationActuator.playEffect('dual-rumble', {
        duration: ms,
        strongMagnitude: strong,
        weakMagnitude: weak,
      }).catch(() => {});
    }
  }
}

function hitBuildings() {
  let hit = false;
  let maxImpact = 0;
  const pr = player.radius || PLAYER_R;
  for (let n = 0; n < 3; n++) {
    for (const b of buildings) {
      const c = circleAABB(player.x, player.z, pr, b);
      if (!c) continue;
      player.x += c.nx * (c.depth + 0.02);
      player.z += c.nz * (c.depth + 0.02);
      const vn = player.speed * (Math.sin(player.heading) * c.nx + Math.cos(player.heading) * c.nz);
      if (player.wrecking) {
        player.x += c.nx * 0.4;
        player.z += c.nz * 0.4;
        player.speed = Math.max(14, Math.abs(player.speed) * 0.9 + 5) * Math.sign(player.speed || 1);
        player.yawRate += (Math.random() > 0.5 ? 1 : -1) * 3.2;
        maxImpact = Math.max(maxImpact, Math.abs(vn));
        addWreckScore('building');
      } else if (vn > 0) {
        maxImpact = Math.max(maxImpact, vn);
        player.speed *= 0.28;
      } else {
        player.speed *= 0.72;
      }
      hit = true;
    }
  }
  if (player.wrecking) {
    if (hit) {
      player.shake = Math.max(player.shake, 0.35);
      rumble(80, 0.5, 0.3);
    }
  } else if (maxImpact > 14) {
    player.crashT = 0.75;
    player.shake = 0.55;
    player.yawRate = (Math.random() > 0.5 ? 1 : -1) * 4.5;
    noiseBurst(0.28, 0.18);
    rumble(220, 1, 0.6);
    spawnDebris(player.x, player.z, 0xff4a1a);
    toast('CRASH');
  } else if (hit && maxImpact > 4) {
    noiseBurst(0.08, 0.05);
  }
}

function addWreckScore(kind) {
  const def = pack.eventsById.wreck || {};
  const scores = def.scores || { car: 1500, prop: 300, building: 500, chain: 1.18 };
  const base = scores[kind] || 200;
  const chain = eventState.chain || 1;
  const pts = Math.round(base * chain);
  eventState.score = (eventState.score || 0) + pts;
  player.wreckScore = eventState.score;
  eventState.chain = Math.min(8, chain * (scores.chain || 1.18));
  player.speed += 6 * Math.sign(player.speed || 1);
  toast("+" + pts);
  blip(420 + Math.min(400, pts * 0.08), 0.08, "square", 0.05);
}

function playableModes() {
  return (modes.ids || []).map((id) => pack.eventsById[id]).filter((e) => e && !e.stub);
}

function renderModeUI() {
  const list = playableModes();
  if (!hud.modeList) return;
  hud.modeList.innerHTML = list.map((e, i) => {
    const on = i === modes.index ? " on" : "";
    return "<div class=\"slot" + on + "\"><span class=\"slot-k\">" + (i + 1) + "</span><span class=\"slot-v\">" + (e.label || e.kind).toUpperCase() + "</span></div>";
  }).join("");
}

function openModes() {
  if (modes.open || garage.open || nav.open) return;
  modes.open = true;
  player.speed = 0;
  if (hud.modeOverlay) hud.modeOverlay.classList.remove("hidden");
  renderModeUI();
  toast("EVENTS");
  blip(360, 0.1, "square", 0.06);
}

function closeModes() {
  if (!modes.open) return;
  modes.open = false;
  modes.cool = 1.2;
  if (hud.modeOverlay) hud.modeOverlay.classList.add("hidden");
}

function beginWreck(def) {
  player.wrecking = true;
  player.wreckScore = 0;
  player.wreckChain = 1;
  eventState.score = 0;
  eventState.chain = 1;
  player.crashT = 8;
  player.yawRate = (Math.random() > 0.5 ? 1 : -1) * 7.5;
  player.speed = Math.max(Math.abs(player.speed), 36) * Math.sign(player.speed || 1);
  player.shake = 0.45;
  toast("WRECK");
}

function hideGates() {
  for (const c of checkpoints) {
    c.active = false;
    c.mesh.material.opacity = 0;
    if (c.marker) c.marker.visible = false;
  }
}

function layoutGates(spots) {
  const n = Math.min(spots.length, checkpoints.length);
  eventState.need = n;
  for (let i = 0; i < checkpoints.length; i++) {
    const c = checkpoints[i];
    if (i < n) {
      let gx = spots[i][0];
      let gz = spots[i][1];
      const x = Math.abs(gx) <= 12 && Math.abs(gz) <= 12 ? gx * BLOCK : gx;
      const z = Math.abs(gx) <= 12 && Math.abs(gz) <= 12 ? gz * BLOCK : gz;
      c.x = x;
      c.z = z;
      c.active = i === 0;
      c.mesh.position.set(x, 1.4, z);
      c.mesh.material.opacity = i === 0 ? 1 : 0.15;
      c.mesh.material.color.set(i === 0 ? 0x66e0ff : 0x446688);
      if (c.marker) {
        c.marker.position.set(x, 0, z);
        c.marker.visible = i === 0;
      }
    } else {
      c.active = false;
      c.mesh.material.opacity = 0;
      if (c.marker) c.marker.visible = false;
    }
  }
}

function startEvent(kindId) {
  const list = playableModes();
  const def = pack.eventsById[kindId] || list[0];
  if (!def || def.stub) return;
  const kind = def.kind;
  eventState.kind = kind;
  eventState.phase = kind;
  eventState.got = 0;
  eventState.time = def.time;
  eventState.need = def.need || 0;
  eventState.score = 0;
  eventState.chain = 1;
  player.wrecking = false;
  player.wreckScore = 0;
  blip(520, 0.12, 'square', 0.07);
  blip(780, 0.16, 'square', 0.07);
  hideGates();
  if (kind === 'race' || kind === 'sprint') {
    layoutGates(def.gates || [[0, 5], [5, 9], [9, 5], [5, 1], [2, 8], [5, 5]]);
    toast(def.label || 'RACE');
  } else if (kind === 'route') {
    const f = def.finish || { x: -70, z: 260 };
    layoutGates([[f.x, f.z]]);
    toast(def.finishLabel || def.label || 'ROUTE');
  } else if (kind === 'wreck') {
    beginWreck(def);
  } else if (kind === 'takedown') {
    toast((def.label || 'TAKEDOWN') + ' x' + (def.need || 4));
  }
}

function pickMode() {
  const list = playableModes();
  const def = list[modes.index] || list[0];
  closeModes();
  if (def) startEvent(def.id);
}

function handleModeKey(code) {
  const list = playableModes();
  if (!list.length) return false;
  if (code === 'ArrowUp' || code === 'KeyW') {
    modes.index = (modes.index + list.length - 1) % list.length;
    renderModeUI();
    return true;
  }
  if (code === 'ArrowDown' || code === 'KeyS') {
    modes.index = (modes.index + 1) % list.length;
    renderModeUI();
    return true;
  }
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
    const i = Number(code.slice(-1)) - 1;
    if (list[i]) {
      modes.index = i;
      pickMode();
    }
    return true;
  }
  if (code === 'Enter') {
    pickMode();
    return true;
  }
  if (code === 'Escape') {
    closeModes();
    return true;
  }
  return false;
}

function boostMax() {
  return player.spec?.boostTank || 100;
}

function endEvent(win) {
  eventState.phase = win ? 'won' : 'lost';
  eventState.cooldown = 4.5;
  player.wrecking = false;
  hideGates();
  const wreck = eventState.kind === 'wreck';
  if (wreck) toast(win ? 'WRECK ' + eventState.score : 'WRECK OVER');
  else toast(win ? 'YOU WIN' : 'TIME UP');
  if (win) {
    player.boost = clamp(player.boost + 30, 0, boostMax());
    blip(660, 0.12, 'square', 0.08);
    blip(880, 0.18, 'square', 0.08);
  } else {
    blip(180, 0.25, 'sawtooth', 0.08);
  }
}

function updateEvent(dt) {
  eventState.beacon.rotation.y += dt * 0.6;
  eventState.ring.rotation.z += dt * 0.8;
  eventState.beacon.visible = eventState.phase === 'idle';
  const jd = eventState.beacon.userData.diamond;
  if (jd) jd.rotation.y += dt * 1.3;

  if (eventState.phase === 'idle') {
    modes.cool = Math.max(0, modes.cool - dt);
    const dx = player.x - eventState.junction.x;
    const dz = player.z - eventState.junction.z;
    if (
      !garage.open &&
      !modes.open &&
      modes.cool <= 0 &&
      Math.hypot(dx, dz) < 9 &&
      Math.abs(player.speed) < 6
    ) {
      openModes();
    }
    return;
  }

  if (eventState.phase === 'won' || eventState.phase === 'lost') {
    eventState.cooldown -= dt;
    if (eventState.cooldown <= 0) eventState.phase = 'idle';
    return;
  }

  eventState.time -= dt;
  if (eventState.time <= 0) {
    if (eventState.phase === 'wreck') endEvent(eventState.score > 0);
    else endEvent(false);
    return;
  }

  if (
    eventState.phase === 'sprint' ||
    eventState.phase === 'race' ||
    eventState.phase === 'route'
  ) {
    const i = eventState.got;
    const cp = checkpoints[i];
    if (cp) {
      cp.mesh.rotation.z += dt * 2;
      const d = Math.hypot(player.x - cp.x, player.z - cp.z);
      if (d < 5.5) {
        cp.active = false;
        cp.mesh.material.opacity = 0;
        if (cp.marker) cp.marker.visible = false;
        eventState.got += 1;
        blip(640 + eventState.got * 40, 0.1, 'square', 0.07);
        toast(`GATE ${eventState.got}/${eventState.need}`);
        if (eventState.got >= eventState.need) endEvent(true);
        else {
          const n = checkpoints[eventState.got];
          n.active = true;
          n.mesh.material.opacity = 1;
          n.mesh.material.color.set(0x66e0ff);
          if (n.marker) {
            n.marker.visible = true;
            n.marker.position.set(n.x, 0, n.z);
          }
        }
      }
    }
  } else if (eventState.phase === 'takedown') {
    if (eventState.got >= eventState.need) endEvent(true);
  } else if (eventState.phase === 'wreck') {
    if (!player.wrecking) endEvent(eventState.score > 0);
  }
}

function posePlayer() {
  player.mesh.position.set(player.x, Math.max(0, player.crashT * 0.4), player.z);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.z = input.steer * -0.12 * Math.min(1, Math.abs(player.speed) / 20);
  player.mesh.rotation.x = clamp(player.speed * 0.002, -0.08, 0.12);
}

function updatePlayer(dt) {
  const spec = player.spec;
  const boosting = !garage.open && !nav.open && input.boost && player.boost > 0 && player.crashT <= 0;
  const tank = spec.boostTank || 100;
  const drain = spec.boostDrain || 22;
  if (garage.open || modes.open || nav.open) {
    player.speed = 0;
    player.boost = Math.min(tank, player.boost + 3.2 * dt);
    posePlayer();
    if (audio.engine) audio.gain.gain.setTargetAtTime(ui.started ? 0.012 : 0, audio.ctx.currentTime, 0.1);
    return;
  }

  if (boosting) player.boost = Math.max(0, player.boost - drain * dt);
  else player.boost = Math.min(tank, player.boost + 3.2 * dt);

  const mass = Math.max(0.35, spec.mass);
  const maxSpd = boosting ? spec.boostTop : spec.topSpeed;
  const accel = (boosting ? spec.boostAccel : spec.accel) / mass;

  if (player.wrecking) {
    player.crashT = 2;
    player.heading += player.yawRate * dt;
    player.yawRate *= Math.pow(0.62, dt);
    if (Math.abs(player.yawRate) < 1.4) player.yawRate = (player.yawRate >= 0 ? 1 : -1) * 3.8;
    player.speed *= Math.pow(0.82, dt);
    const minSp = pack.eventsById.wreck?.minSpeed ?? 5;
    if (Math.abs(player.speed) < minSp) endEvent(eventState.score > 0);
  } else if (player.crashT > 0) {
    player.crashT -= dt;
    player.heading += player.yawRate * dt;
    player.yawRate *= Math.pow(0.12, dt);
    player.speed *= Math.pow(0.45, dt);
  } else {
    if (input.brake > 0) {
      player.speed += -Math.sign(player.speed || 1) * (spec.brakeForce / mass) * dt * input.brake;
      if (Math.abs(player.speed) < 1.2) player.speed = 0;
    } else if (input.throttle > 0) {
      player.speed += accel * dt * input.throttle;
    } else if (input.throttle < 0) {
      player.speed += (spec.reverseAccel / mass) * dt * input.throttle;
    } else {
      player.speed *= Math.pow(spec.coast, dt);
    }
    player.speed -= player.speed * spec.rollingDrag * dt;
    player.speed -= spec.aero * player.speed * Math.abs(player.speed) * dt;
    player.speed = clamp(player.speed, -spec.maxReverse, maxSpd);
    const grip =
      THREE.MathUtils.lerp(spec.gripLow, spec.gripHigh, Math.min(1, Math.abs(player.speed) / 36)) *
      spec.tireGrip;
    const turn = input.steer * grip * Math.max(0.25, Math.abs(player.speed) / 18);
    player.heading += turn * dt;
    player.yawRate = turn;
  }

  player.x += Math.sin(player.heading) * player.speed * dt;
  player.z += Math.cos(player.heading) * player.speed * dt;

  player.x = clamp(player.x, -120, CITY + 20);
  player.z = clamp(player.z, -40, CITY + 20);

  hitBuildings();

  const pr = player.radius || PLAYER_R;
  for (const p of props) {
    if (p.smashed) {
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, Math.max(0.1, p.mesh.position.y + p.vy * dt), p.z);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.6 * dt;
      continue;
    }
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    if (d < pr + p.r && Math.abs(player.speed) > 6) {
      smashProp(p, player.heading, Math.abs(player.speed));
    }
  }

  posePlayer();
  const wspin = player.speed * dt * 3.2;
  for (const w of player.mesh.userData.wheels) w.rotation.x += wspin;

  if (audio.engine) {
    const t = Math.abs(player.speed);
    audio.engine.frequency.setTargetAtTime(42 + t * (player.engine === 'twin' ? 8.1 : 6.5), audio.ctx.currentTime, 0.05);
    audio.filt.frequency.setTargetAtTime(240 + t * 18 + (boosting ? 220 : 0), audio.ctx.currentTime, 0.08);
    audio.gain.gain.setTargetAtTime(ui.started ? 0.025 + t * 0.0016 : 0, audio.ctx.currentTime, 0.1);
  }
}

function updateTraffic(dt) {
  const pr = player.radius || PLAYER_R;
  for (const car of traffic) {
    if (car.smashed) {
      car.smashT += dt;
      car.vy -= 22 * dt;
      car.x += car.vx * dt;
      car.z += car.vz * dt;
      const y = Math.max(0.2, car.mesh.position.y + car.vy * dt);
      car.mesh.position.set(car.x, y, car.z);
      car.mesh.rotation.y += car.spin * dt;
      car.mesh.rotation.z += car.spin * 0.4 * dt;
      if (y <= 0.21) {
        car.vy *= -0.25;
        car.vx *= 0.7;
        car.vz *= 0.7;
      }
      if (car.smashT > 4.2) {
        car.smashed = false;
        car.hp = car.maxHp;
        car.hitT = 0;
        car.hitCool = 0;
        applyDamageVisual(car);
        car.t = rand(8, CITY - 8);
        car.speed = car.baseSpeed;
        car.mesh.rotation.set(0, 0, 0);
        placeTraffic(car);
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
      }
      continue;
    }

    car.t += car.dir * car.speed * dt;
    if (car.t > CITY - 4) {
      car.t = CITY - 4;
      car.dir = -1;
    } else if (car.t < 4) {
      car.t = 4;
      car.dir = 1;
    }
    placeTraffic(car);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const wspin = car.speed * dt * 3;
    for (const w of car.mesh.userData.wheels) w.rotation.x += wspin;

    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz);
    car.nearCool = Math.max(0, car.nearCool - dt);
    car.hitCool = Math.max(0, (car.hitCool || 0) - dt);
    if (car.hitT > 0) car.hitT -= dt;
    const dmgT = 1 - Math.max(0, car.hp ?? 100) / Math.max(1, car.maxHp ?? 100);
    car.mesh.rotation.z = Math.sin(clock.elapsed * (10 + dmgT * 14)) * 0.09 * dmgT;
    if (car.hitT > 0) car.mesh.rotation.z += Math.sin(car.hitT * 42) * 0.2;
    const tr = car.radius || TRAFFIC_R;

    if (dist < pr + tr + 0.15 && Math.abs(player.speed) > 5 && !garage.open) {
      damageCar(car, player.heading, Math.abs(player.speed));
    } else if (
      dist < 4.6 &&
      dist > 2.3 &&
      Math.abs(player.speed) > 14 &&
      car.nearCool <= 0
    ) {
      car.nearCool = 1.6;
      player.boost = clamp(player.boost + 12, 0, boostMax());
      toast('NEAR MISS');
      blip(880, 0.08, 'square', 0.05);
    }
  }
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    d.vy -= 20 * dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.position.z += d.vz * dt;
    d.mesh.rotation.x += dt * 6;
    if (d.life <= 0 || d.mesh.position.y < -1) {
      scene.remove(d.mesh);
      debris.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  const back = 9.2;
  const height = 4.4;
  const look = 8;
  const px = player.x - Math.sin(player.heading) * back;
  const pz = player.z - Math.cos(player.heading) * back;
  camPos.set(px, height + Math.abs(player.speed) * 0.03, pz);
  camTarget.set(
    player.x + Math.sin(player.heading) * look,
    0.8,
    player.z + Math.cos(player.heading) * look,
  );
  camera.position.lerp(camPos, 1 - Math.pow(0.0008, dt));
  if (player.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * player.shake * 1.4;
    camera.position.y += (Math.random() - 0.5) * player.shake * 0.8;
    player.shake = Math.max(0, player.shake - dt * 1.8);
  }
  tmp.copy(camTarget);
  camera.lookAt(tmp);
  const wantFov = input.boost && player.boost > 0 && !garage.open ? 72 : 62;
  camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

function fmtTime(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const f = Math.floor((s % 1) * 10);
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}.${f}`;
}

function tireIds() {
  return partsOf(pack, 'tires').map((p) => p.id);
}

function brakeIds() {
  return partsOf(pack, 'brakes').map((p) => p.id);
}

function engineIds() {
  return partsOf(pack, 'engine').map((p) => p.id);
}

function loadoutText() {
  const tires = pack.partsById[player.tires];
  const brakes = pack.partsById[player.brakes];
  const engine = pack.partsById[player.engine];
  return `${(tires?.name || 'Street').toUpperCase()} · ${(brakes?.name || 'Stock').toUpperCase()} · ${(engine?.name || 'Mill').toUpperCase()}`;
}

function cyclePart(slot, ids) {
  const i = Math.max(0, ids.indexOf(player[slot]));
  player[slot] = ids[(i + 1) % ids.length];
  refreshPlayerSpec();
  restylePlayerParts();
  renderGarageUI();
  const part = pack.partsById[player[slot]];
  toast((part?.name || player[slot]).toUpperCase());
  blip(slot === 'tires' ? 540 : slot === 'brakes' ? 420 : 300, 0.08, 'square', 0.06);
}

function renderGarageUI() {
  const tires = pack.partsById[player.tires];
  const brakes = pack.partsById[player.brakes];
  const engine = pack.partsById[player.engine];
  if (hud.garageParts) {
    hud.garageParts.innerHTML = `
      <div class="slot">
        <span class="slot-k">TIRES</span>
        <span class="slot-v">${tires?.name || player.tires}</span>
        <span class="slot-h"><kbd>1</kbd> / <kbd>←</kbd><kbd>→</kbd></span>
      </div>
      <div class="slot">
        <span class="slot-k">BRAKES</span>
        <span class="slot-v">${brakes?.name || player.brakes}</span>
        <span class="slot-h"><kbd>2</kbd> / <kbd>↑</kbd><kbd>↓</kbd></span>
      </div>
      <div class="slot">
        <span class="slot-k">ENGINE</span>
        <span class="slot-v">${engine?.name || player.engine}</span>
        <span class="slot-h"><kbd>3</kbd></span>
      </div>`;
  }
  if (hud.garageFeel) {
    hud.garageFeel.textContent = [tires?.feel, brakes?.feel, engine?.feel].filter(Boolean).join(' · ');
  }
  if (hud.loadout) hud.loadout.textContent = loadoutText();
}

function openGarage() {
  if (garage.open || nav.open) return;
  garage.open = true;
  player.speed = 0;
  if (hud.garageOverlay) hud.garageOverlay.classList.remove('hidden');
  renderGarageUI();
  toast('GARAGE');
  blip(360, 0.1, 'square', 0.06);
}

function closeGarage() {
  if (!garage.open) return;
  garage.open = false;
  garage.mustExit = true;
  garage.cool = 1.35;
  const facingIn = Math.cos(player.heading) >= 0;
  player.speed = facingIn ? -10 : 10;
  if (hud.garageOverlay) hud.garageOverlay.classList.add("hidden");
  blip(280, 0.08, "square", 0.05);
}
function inGarageBay() {
  const b = garage.bay;
  return player.x > b.minX && player.x < b.maxX && player.z > b.minZ && player.z < b.maxZ;
}

function updateGarage(dt) {
  garage.cool = Math.max(0, garage.cool - dt);
  if (garage.marker) garage.marker.visible = !garage.open;
  if (!inGarageBay()) garage.mustExit = false;
  if (garage.open) return;
  if (garage.mustExit) return;
  if (garage.cool > 0) return;
  if (inGarageBay() && Math.abs(player.speed) < 6) openGarage();
}
function handleGarageKey(code) {
  if (code === 'Digit1' || code === 'ArrowLeft' || code === 'ArrowRight') {
    cyclePart('tires', tireIds());
    return true;
  }
  if (code === 'Digit2' || code === 'ArrowUp' || code === 'ArrowDown') {
    cyclePart('brakes', brakeIds());
    return true;
  }
  if (code === 'Digit3') {
    cyclePart('engine', engineIds());
    return true;
  }
  if (code === 'Enter' || code === 'Escape' || code === 'KeyE') {
    closeGarage();
    return true;
  }
  return false;
}

function primaryWaypoint() {
  if (garage.open || modes.open || nav.open) return null;
  if (eventState.phase === 'sprint' || eventState.phase === 'race' || eventState.phase === 'route') {
    const cp = checkpoints[eventState.got];
    if (cp) {
      const route = eventState.phase === 'route';
      return {
        x: cp.x,
        z: cp.z,
        label: route ? (pack.eventsById.route?.finishLabel || 'EMBER POINT') : 'GATE',
      };
    }
  }
  if (eventState.phase === 'takedown') {
    return { x: player.x, z: player.z, label: 'SMASH', hudOnly: true };
  }
  if (eventState.phase === 'wreck') {
    return { x: player.x, z: player.z, label: 'WRECK', hudOnly: true };
  }
  const gps = navWaypoint();
  if (gps) return gps;
  const j = eventState.junction;
  const dg = Math.hypot(player.x - garage.x, player.z - garage.z);
  const dj = Math.hypot(player.x - j.x, player.z - j.z);
  if (dg <= dj) return { x: garage.x, z: garage.z, label: garage.label || 'GARAGE' };
  return { x: j.x, z: j.z, label: 'JUNCTION' };
}

function updateMarkers(dt) {
  const t = clock.elapsed;
  if (garage.marker) {
    garage.marker.visible = !garage.open;
    garage.marker.position.set(garage.x, Math.sin(t * 2.1) * 0.62, garage.z);
    garage.marker.rotation.y += dt * 0.75;
    const d = garage.marker.userData.diamond;
    if (d) d.rotation.y += dt * 1.5;
  }
  for (const cp of checkpoints) {
    if (!cp.marker) continue;
    const on = (eventState.phase === 'sprint' || eventState.phase === 'race' || eventState.phase === 'route') && cp.active;
    cp.marker.visible = on;
    if (on) {
      cp.marker.position.set(cp.x, Math.sin(t * 2.4 + 1.2) * 0.42, cp.z);
      cp.marker.rotation.y += dt * 0.9;
    }
  }
}

let mapCtx = null;
function ensureMinimap() {
  const c = hud.minimap;
  if (!c || mapCtx) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = 148 * dpr;
  c.height = 148 * dpr;
  mapCtx = c.getContext('2d');
}

function updateMinimap() {
  ensureMinimap();
  if (!mapCtx || !hud.minimap) return;
  const c = hud.minimap;
  const ctx = mapCtx;
  const w = c.width;
  const h = c.height;
  const u = w / 148;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(12, 8, 12, 0.82)';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 1.5 * u, 0, Math.PI * 2);
  ctx.clip();

  const pad = 10 * u;
  const minX = -120;
  const maxX = CITY + 20;
  const minZ = -40;
  const maxZ = CITY + 20;
  const worldW = maxX - minX;
  const worldH = maxZ - minZ;
  const scale = (w - pad * 2) / Math.max(worldW, worldH);
  const ch = Math.cos(player.heading);
  const sh = Math.sin(player.heading);
  const toX = (x, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    return w / 2 + (dx * ch - dz * sh) * scale;
  };
  const toY = (x, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    return h / 2 - (dx * sh + dz * ch) * scale;
  };

  ctx.fillStyle = 'rgba(28, 78, 96, 0.42)';
  ctx.beginPath();
  ctx.moveTo(toX(minX, minZ), toY(minX, minZ));
  ctx.lineTo(toX(0, minZ), toY(0, minZ));
  ctx.lineTo(toX(0, maxZ), toY(0, maxZ));
  ctx.lineTo(toX(minX, maxZ), toY(minX, maxZ));
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(42, 36, 34, 0.55)';
  ctx.beginPath();
  ctx.arc(toX(-70, 260), toY(-70, 260), 7.5 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 176, 64, 0.75)';
  ctx.lineWidth = Math.max(1.4, w / 70);
  ctx.beginPath();
  ctx.moveTo(toX(-40, 260), toY(-40, 260));
  ctx.lineTo(toX(-8, 260), toY(-8, 260));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 210, 122, 0.22)';
  ctx.lineWidth = Math.max(1.5, w / 90);
  for (let i = 0; i <= GRID; i++) {
    const a = i * BLOCK;
    ctx.beginPath();
    ctx.moveTo(toX(0, a), toY(0, a));
    ctx.lineTo(toX(CITY, a), toY(CITY, a));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX(a, 0), toY(a, 0));
    ctx.lineTo(toX(a, CITY), toY(a, CITY));
    ctx.stroke();
  }

  const dot = (x, z, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toX(x, z), toY(x, z), r, 0, Math.PI * 2);
    ctx.fill();
  };

  if (!garage.open) {
    const gx = toX(garage.x, garage.z);
    const gy = toY(garage.x, garage.z);
    const pulse = 0.55 + 0.45 * Math.sin(clock.elapsed * 4.4);
    ctx.strokeStyle = `rgba(255, 196, 77, ${0.4 + 0.55 * pulse})`;
    ctx.lineWidth = Math.max(2.2, 2.6 * u);
    ctx.beginPath();
    ctx.arc(gx, gy, 8.4 * u + 4.2 * u * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffc44d';
    ctx.beginPath();
    ctx.arc(gx, gy, 7.6 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#140c14';
    ctx.font = `bold ${Math.round(10.5 * u)}px Trebuchet MS, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G', gx, gy + 0.3 * u);
  }

  if (eventState.phase === 'idle') {
    dot(eventState.junction.x, eventState.junction.z, '#ff7a30', 3.4 * u);
  }
  if (eventState.phase === 'sprint' || eventState.phase === 'race' || eventState.phase === 'route') {
    const cp = checkpoints[eventState.got];
    if (cp) dot(cp.x, cp.z, '#66e0ff', 3.6 * u);
  }
  dot(-70, 260, '#4ae0c8', 2.2 * u);
  drawRoute(ctx, toX, toY, u);

  ctx.fillStyle = '#ff4a1a';
  ctx.beginPath();
  const s = 6.4 * u;
  ctx.moveTo(w / 2, h / 2 - s);
  ctx.lineTo(w / 2 - s * 0.72, h / 2 + s * 0.72);
  ctx.lineTo(w / 2 + s * 0.72, h / 2 + s * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function updateCompass() {
  const wp = primaryWaypoint();
  if (!hud.compass) return;
  if (!wp) {
    hud.compass.classList.add('hidden');
    return;
  }
  hud.compass.classList.remove('hidden');
  hud.compass.classList.toggle('hud-only', !!wp.hudOnly);
  if (hud.compassLabel) hud.compassLabel.textContent = wp.label;
  const dx = wp.x - player.x;
  const dz = wp.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (hud.compassDist) {
    hud.compassDist.textContent = wp.hudOnly ? (wp.label || 'TRAFFIC') : `${Math.round(dist)} m`;
  }
  if (hud.compassNeedle && !wp.hudOnly) {
    const world = Math.atan2(dx, dz);
    const rel = wrapAngle(world - player.heading);
    hud.compassNeedle.style.transform = `rotate(${(rel * 180) / Math.PI}deg)`;
  }
}

function updateHud() {
  const kmh = Math.round(Math.abs(player.speed) * 8.4);
  hud.speed.textContent = String(kmh);
  hud.boost.style.width = `${((player.boost / boostMax()) * 100).toFixed(1)}%`;

  const b = hud.banner;
  if (eventState.phase === 'idle' || modes.open) {
    b.className = 'hidden';
  } else if (eventState.phase === 'sprint' || eventState.phase === 'race') {
    b.className = '';
    b.textContent = `RACE  ${fmtTime(eventState.time)}   GATE ${eventState.got}/${eventState.need}`;
  } else if (eventState.phase === 'route') {
    b.className = '';
    b.textContent = `ROUTE  ${fmtTime(eventState.time)}   EMBER POINT`;
  } else if (eventState.phase === 'takedown') {
    b.className = '';
    b.textContent = `TAKEDOWN  ${eventState.got}/${eventState.need}   ${fmtTime(eventState.time)}`;
  } else if (eventState.phase === 'wreck') {
    b.className = '';
    b.textContent = `WRECK  ${eventState.score}   x${(eventState.chain || 1).toFixed(1)}   ${fmtTime(eventState.time)}`;
  } else if (eventState.phase === 'won') {
    b.className = 'win';
    const k = eventState.kind;
    b.textContent =
      k === 'wreck'
        ? `WRECK ${eventState.score}`
        : k === 'takedown'
          ? 'TAKEDOWN COMPLETE'
          : k === 'route'
            ? 'EMBER POINT'
            : 'CLEAN RACE';
  } else if (eventState.phase === 'lost') {
    b.className = 'lose';
    b.textContent = "TIME'S UP — JUNCTION RESET";
  }

  if (ui.toastT > 0) {
    ui.toastT -= 1 / 60;
    if (ui.toastT <= 0) hud.toast.classList.remove('show');
  }

  if (hud.loadout) hud.loadout.textContent = loadoutText();

  const pad = input.padConnected ? ' · gamepad live' : '';
  hud.controls.innerHTML = `<div><kbd>WASD</kbd> / <kbd>Arrows</kbd> drive · <kbd>Shift</kbd> boost · <kbd>Space</kbd> brake · <kbd>M</kbd> map · garage bay to swap parts${pad}</div>
    <div>Pad: left stick steer · RT / A throttle · B brake · RB / X boost · teal GARAGE / orange JUNCTION markers</div>`;

  updateCompass();
  updateMinimap();
}

function begin() {
  if (ui.started) return;
  ui.started = true;
  hud.splash.classList.add('gone');
  audioStart();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
}

function onKey(e, down) {
  if (down) {
    if (modes.open && handleModeKey(e.code)) {
      e.preventDefault();
      return;
    }
    if (garage.open && handleGarageKey(e.code)) {
      e.preventDefault();
      return;
    }
    if (nav.open && handleNavKey(e.code)) {
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyM' && !garage.open && !modes.open) {
      openNav();
      e.preventDefault();
      return;
    }
    keys.add(e.code);
    begin();
  } else keys.delete(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
}

window.addEventListener('keydown', (e) => onKey(e, true));
window.addEventListener('keyup', (e) => onKey(e, false));
window.addEventListener('mousedown', begin);
window.addEventListener('gamepadconnected', begin);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function tick(now) {
  const dt = Math.min(0.05, (now - (clock.last || now)) / 1000);
  clock.last = now;
  clock.elapsed += dt;
  readInput();
  if (ui.started) {
    updatePlayer(dt);
    updateTraffic(dt);
    updateDebris(dt);
    updateEvent(dt);
    updateGarage(dt);
    updateMarkers(dt);
    updateGps(dt);
  }
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

buildCity();
playerMeshSetup();
spawnTraffic();
renderGarageUI();
player.mesh.position.set(player.x, 0, player.z);
camera.position.set(player.x, 8, player.z - 12);
camera.lookAt(player.x, 0, player.z);
requestAnimationFrame(tick);
