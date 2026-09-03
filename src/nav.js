/**
 * Oncoming — pull-up map + GPS ribbon.
 * Destinations come from pack.pois. Straight-line guide, not a pathfinder.
 */
import { THREE, pack, hud, player, garage, modes, scene, toast, blip } from './world.js';

const SKIP = new Set(['base-poi', 'waypoint']);

const nav = {
  open: false,
  index: 0,
  dest: null,
  line: null,
  pin: null,
  arrived: false,
};

function destinations() {
  const list = [];
  list.push({
    id: 'garage',
    label: garage.label || 'GARAGE',
    x: garage.x,
    z: garage.z,
  });
  const block = pack.world?.block ?? 52;
  for (const p of pack.pois || []) {
    if (!p.id || SKIP.has(p.id) || p.id === 'garage') continue;
    const x = p.x ?? (p.gx != null ? p.gx * block : null);
    const z = p.z ?? (p.gz != null ? p.gz * block : null);
    if (x == null || z == null) continue;
    list.push({ id: p.id, label: p.label || p.id, x, z });
  }
  return list;
}

function renderNavUI() {
  const list = destinations();
  if (!hud.mapList) return;
  hud.mapList.innerHTML = list
    .map((d, i) => {
      const on = i === nav.index ? ' on' : '';
      const live = nav.dest && nav.dest.id === d.id ? 'GPS' : '';
      return `<div class="slot${on}"><span class="slot-k">${i + 1}</span><span class="slot-v">${d.label}</span><span class="slot-h">${live}</span></div>`;
    })
    .join('');
}

function openNav() {
  if (nav.open || garage.open || modes.open) return;
  nav.open = true;
  player.speed = 0;
  const list = destinations();
  if (nav.dest) {
    const i = list.findIndex((d) => d.id === nav.dest.id);
    if (i >= 0) nav.index = i;
  }
  if (hud.mapOverlay) hud.mapOverlay.classList.remove('hidden');
  renderNavUI();
  toast('MAP');
  blip(360, 0.1, 'square', 0.06);
}

function closeNav() {
  if (!nav.open) return;
  nav.open = false;
  if (hud.mapOverlay) hud.mapOverlay.classList.add('hidden');
}

function ensureLine() {
  if (nav.line) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffc44d,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  nav.line = new THREE.Line(geo, mat);
  nav.line.frustumCulled = false;
  nav.line.renderOrder = 8;
  nav.line.visible = false;
  scene.add(nav.line);

  const pin = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.8, 0),
    new THREE.MeshBasicMaterial({ color: 0xffc44d }),
  );
  pin.scale.set(1, 1.7, 1);
  pin.visible = false;
  scene.add(pin);
  nav.pin = pin;
}

function setDest(item) {
  nav.dest = item ? { id: item.id, label: item.label, x: item.x, z: item.z } : null;
  nav.arrived = false;
  ensureLine();
}

function pickDest() {
  const list = destinations();
  const item = list[nav.index];
  if (!item) return;
  setDest(item);
  closeNav();
  toast(item.label);
  blip(520, 0.1, 'square', 0.06);
}

function clearDest() {
  nav.dest = null;
  nav.arrived = false;
  if (nav.line) nav.line.visible = false;
  if (nav.pin) nav.pin.visible = false;
}

function handleNavKey(code) {
  const list = destinations();
  if (!list.length) return false;
  if (code === 'ArrowUp' || code === 'KeyW') {
    nav.index = (nav.index + list.length - 1) % list.length;
    renderNavUI();
    return true;
  }
  if (code === 'ArrowDown' || code === 'KeyS') {
    nav.index = (nav.index + 1) % list.length;
    renderNavUI();
    return true;
  }
  if (code.startsWith('Digit')) {
    const i = Number(code.slice(-1)) - 1;
    if (list[i]) {
      nav.index = i;
      pickDest();
    }
    return true;
  }
  if (code === 'Enter') {
    pickDest();
    return true;
  }
  if (code === 'KeyX' || code === 'Backspace') {
    clearDest();
    closeNav();
    toast('GPS OFF');
    return true;
  }
  if (code === 'Escape' || code === 'KeyM') {
    closeNav();
    return true;
  }
  return false;
}

function updateGps(dt) {
  ensureLine();
  const dest = nav.dest;
  if (!dest) {
    if (nav.line) nav.line.visible = false;
    if (nav.pin) nav.pin.visible = false;
    return;
  }
  const dist = Math.hypot(dest.x - player.x, dest.z - player.z);
  if (dist < 10 && !nav.arrived) {
    nav.arrived = true;
    toast(dest.label);
    blip(660, 0.12, 'square', 0.07);
  }
  if (dist > 16) nav.arrived = false;

  const pos = nav.line.geometry.attributes.position;
  pos.setXYZ(0, player.x, 0.4, player.z);
  pos.setXYZ(1, dest.x, 0.4, dest.z);
  pos.needsUpdate = true;
  nav.line.geometry.computeBoundingSphere();
  nav.line.visible = dist > 8;

  nav.pin.position.set(dest.x, 7.2 + Math.sin((performance.now() / 1000) * 2.2) * 0.7, dest.z);
  nav.pin.rotation.y += dt * 1.4;
  nav.pin.visible = true;
}

function drawRoute(ctx, toX, toY, u) {
  if (!nav.dest) return;
  const x0 = toX(player.x, player.z);
  const y0 = toY(player.x, player.z);
  const x1 = toX(nav.dest.x, nav.dest.z);
  const y1 = toY(nav.dest.x, nav.dest.z);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 196, 77, 0.92)';
  ctx.lineWidth = Math.max(2, 2.4 * u);
  ctx.setLineDash([6 * u, 4 * u]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ffc44d';
  ctx.beginPath();
  ctx.arc(x1, y1, 4.2 * u, 0, Math.PI * 2);
  ctx.fill();
}

function navWaypoint() {
  if (!nav.dest) return null;
  return { x: nav.dest.x, z: nav.dest.z, label: nav.dest.label };
}

export {
  nav,
  destinations,
  openNav,
  closeNav,
  handleNavKey,
  updateGps,
  drawRoute,
  navWaypoint,
  clearDest,
};
