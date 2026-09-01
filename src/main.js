/**
 * Oncoming — arcade crash-racer in Ember Bay.
 * Original IP. Not affiliated with EA or any other publisher.
 */
import {
  THREE,
  BLOCK,
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
  buildCity,
  spawnTraffic,
  playerMeshSetup,
  placeTraffic,
  toast,
  audioStart,
  blip,
  noiseBurst,
  ui,
} from './world.js';

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
  player.boost = clamp(player.boost + 6, 0, 100);
  toast('SMASH');
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
  player.boost = clamp(player.boost + 18, 0, 100);
  player.shake = Math.max(player.shake, 0.35);
  player.speed *= 0.82;
  toast('TAKEDOWN');
  noiseBurst(0.22, 0.16);
  blip(140, 0.12, 'sawtooth', 0.06);
  rumble(180, 0.85, 0.4);
  spawnDebris(car.x, car.z, 0xc45a18);
  if (eventState.phase === 'takedown') {
    eventState.got += 1;
  }
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
  for (let n = 0; n < 3; n++) {
    for (const b of buildings) {
      const c = circleAABB(player.x, player.z, PLAYER_R, b);
      if (!c) continue;
      player.x += c.nx * (c.depth + 0.02);
      player.z += c.nz * (c.depth + 0.02);
      const vn = player.speed * (Math.sin(player.heading) * c.nx + Math.cos(player.heading) * c.nz);
      if (vn > 0) {
        maxImpact = Math.max(maxImpact, vn);
        player.speed *= 0.28;
      } else {
        player.speed *= 0.72;
      }
      hit = true;
    }
  }
  if (maxImpact > 14) {
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

function startEvent() {
  const kind = Math.random() < 0.5 ? 'sprint' : 'takedown';
  eventState.kind = kind;
  eventState.phase = kind;
  eventState.got = 0;
  eventState.time = kind === 'sprint' ? 38 : 28;
  eventState.need = kind === 'sprint' ? 4 : 4;
  blip(520, 0.12, 'square', 0.07);
  blip(780, 0.16, 'square', 0.07);
  if (kind === 'sprint') {
    const spots = [
      [1, 3],
      [3, 5],
      [5, 3],
      [3, 1],
    ];
    for (let i = 0; i < 4; i++) {
      const [gx, gz] = spots[i];
      checkpoints[i].x = gx * BLOCK;
      checkpoints[i].z = gz * BLOCK;
      checkpoints[i].active = i === 0;
      checkpoints[i].mesh.position.set(gx * BLOCK, 1.4, gz * BLOCK);
      checkpoints[i].mesh.material.opacity = i === 0 ? 1 : 0.15;
      checkpoints[i].mesh.material.color.set(i === 0 ? 0x66e0ff : 0x446688);
    }
    toast('SPRINT');
  } else {
    for (const c of checkpoints) {
      c.active = false;
      c.mesh.material.opacity = 0;
    }
    toast('TAKEDOWN x4');
  }
}

function endEvent(win) {
  eventState.phase = win ? 'won' : 'lost';
  eventState.cooldown = 4.5;
  for (const c of checkpoints) {
    c.active = false;
    c.mesh.material.opacity = 0;
  }
  toast(win ? 'YOU WIN' : 'TIME UP');
  if (win) {
    player.boost = clamp(player.boost + 30, 0, 100);
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

  if (eventState.phase === 'idle') {
    const dx = player.x - eventState.junction.x;
    const dz = player.z - eventState.junction.z;
    if (Math.hypot(dx, dz) < 9 && player.speed > 4) startEvent();
    return;
  }

  if (eventState.phase === 'won' || eventState.phase === 'lost') {
    eventState.cooldown -= dt;
    if (eventState.cooldown <= 0) eventState.phase = 'idle';
    return;
  }

  eventState.time -= dt;
  if (eventState.time <= 0) {
    endEvent(false);
    return;
  }

  if (eventState.phase === 'sprint') {
    const i = eventState.got;
    const cp = checkpoints[i];
    if (cp) {
      cp.mesh.rotation.z += dt * 2;
      const d = Math.hypot(player.x - cp.x, player.z - cp.z);
      if (d < 5.5) {
        cp.active = false;
        cp.mesh.material.opacity = 0;
        eventState.got += 1;
        blip(640 + eventState.got * 40, 0.1, 'square', 0.07);
        toast(`GATE ${eventState.got}/${eventState.need}`);
        if (eventState.got >= eventState.need) endEvent(true);
        else {
          const n = checkpoints[eventState.got];
          n.active = true;
          n.mesh.material.opacity = 1;
          n.mesh.material.color.set(0x66e0ff);
        }
      }
    }
  } else if (eventState.phase === 'takedown') {
    if (eventState.got >= eventState.need) endEvent(true);
  }
}

function updatePlayer(dt) {
  const boosting = input.boost && player.boost > 0 && player.crashT <= 0;
  if (boosting) player.boost = Math.max(0, player.boost - 22 * dt);
  else player.boost = Math.min(100, player.boost + 3.2 * dt);

  const maxSpd = boosting ? 46 : 32;
  const accel = boosting ? 42 : 26;

  if (player.crashT > 0) {
    player.crashT -= dt;
    player.heading += player.yawRate * dt;
    player.yawRate *= Math.pow(0.12, dt);
    player.speed *= Math.pow(0.45, dt);
  } else {
    if (input.brake > 0) {
      player.speed += -Math.sign(player.speed || 1) * 48 * dt * input.brake;
      if (Math.abs(player.speed) < 1.2) player.speed = 0;
    } else if (input.throttle > 0) {
      player.speed += accel * dt * input.throttle;
    } else if (input.throttle < 0) {
      player.speed += 18 * dt * input.throttle;
    } else {
      player.speed *= Math.pow(0.42, dt);
    }
    player.speed = clamp(player.speed, -12, maxSpd);
    const grip = THREE.MathUtils.lerp(2.8, 1.35, Math.min(1, Math.abs(player.speed) / 36));
    const turn = input.steer * grip * Math.max(0.25, Math.abs(player.speed) / 18);
    player.heading += turn * dt;
    player.yawRate = turn;
  }

  player.x += Math.sin(player.heading) * player.speed * dt;
  player.z += Math.cos(player.heading) * player.speed * dt;

  player.x = clamp(player.x, -20, CITY + 20);
  player.z = clamp(player.z, -30, CITY + 20);

  hitBuildings();

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
    if (d < PLAYER_R + p.r && Math.abs(player.speed) > 6) {
      smashProp(p, player.heading, Math.abs(player.speed));
    }
  }

  player.mesh.position.set(player.x, Math.max(0, player.crashT * 0.4), player.z);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.z = input.steer * -0.12 * Math.min(1, Math.abs(player.speed) / 20);
  player.mesh.rotation.x = clamp(player.speed * 0.002, -0.08, 0.12);
  const wspin = player.speed * dt * 3.2;
  for (const w of player.mesh.userData.wheels) w.rotation.x += wspin;

  if (audio.engine) {
    const t = Math.abs(player.speed);
    audio.engine.frequency.setTargetAtTime(42 + t * 6.5, audio.ctx.currentTime, 0.05);
    audio.filt.frequency.setTargetAtTime(240 + t * 18 + (boosting ? 220 : 0), audio.ctx.currentTime, 0.08);
    audio.gain.gain.setTargetAtTime(ui.started ? 0.025 + t * 0.0016 : 0, audio.ctx.currentTime, 0.1);
  }
}

function updateTraffic(dt) {
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

    if (dist < PLAYER_R + TRAFFIC_R + 0.15 && Math.abs(player.speed) > 5) {
      smashCar(car, player.heading, Math.abs(player.speed));
    } else if (
      dist < 4.6 &&
      dist > 2.3 &&
      Math.abs(player.speed) > 14 &&
      car.nearCool <= 0
    ) {
      car.nearCool = 1.6;
      player.boost = clamp(player.boost + 12, 0, 100);
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
  const wantFov = input.boost && player.boost > 0 ? 72 : 62;
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

function updateHud() {
  const kmh = Math.round(Math.abs(player.speed) * 8.4);
  hud.speed.textContent = String(kmh);
  hud.boost.style.width = `${player.boost.toFixed(1)}%`;

  const b = hud.banner;
  if (eventState.phase === 'idle') {
    b.className = 'hidden';
  } else if (eventState.phase === 'sprint') {
    b.className = '';
    b.textContent = `SPRINT  ${fmtTime(eventState.time)}   GATE ${eventState.got}/${eventState.need}`;
  } else if (eventState.phase === 'takedown') {
    b.className = '';
    b.textContent = `TAKEDOWN  ${eventState.got}/${eventState.need}   ${fmtTime(eventState.time)}`;
  } else if (eventState.phase === 'won') {
    b.className = 'win';
    b.textContent = eventState.kind === 'sprint' ? 'CLEAN SPRINT' : 'TAKEDOWN COMPLETE';
  } else if (eventState.phase === 'lost') {
    b.className = 'lose';
    b.textContent = "TIME'S UP — JUNCTION RESET";
  }

  if (ui.toastT > 0) {
    ui.toastT -= 1 / 60;
    if (ui.toastT <= 0) hud.toast.classList.remove('show');
  }

  const pad = input.padConnected ? ' · gamepad live' : '';
  hud.controls.innerHTML = `<div><kbd>WASD</kbd> / <kbd>Arrows</kbd> drive · <kbd>Shift</kbd> boost · <kbd>Space</kbd> brake${pad}</div>
    <div>Pad: left stick steer · RT / A throttle · B brake · RB / X boost</div>`;
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
  readInput();
  if (ui.started) {
    updatePlayer(dt);
    updateTraffic(dt);
    updateDebris(dt);
    updateEvent(dt);
  }
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

buildCity();
playerMeshSetup();
spawnTraffic();
player.mesh.position.set(player.x, 0, player.z);
camera.position.set(player.x, 8, player.z - 12);
camera.lookAt(player.x, 0, player.z);
requestAnimationFrame(tick);
