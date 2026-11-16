// Draws the world (world.js data) with three.js. Graphics are deliberately simple: scale cues matter, detail does not.
import * as THREE from '../vendor/three.module.min.js';
import { FIELD_SIZE } from './world.js';

const HORIZON = 0xcfe3f5, ZENITH = 0x4d8fd6;

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// One tile = 10 m x 10 m of grass: mottled green, a darker mowing stripe, thin lines on the 10 m grid.
function grassTexture(base, line) {
  return canvasTexture(256, (g, n) => {
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    let s = 99;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '20,60,15' : '150,190,90'},${0.05 + r() * 0.12})`;
      const w = 2 + r() * 7;
      g.fillRect(r() * n, r() * n, w, w);
    }
    g.fillStyle = 'rgba(0,40,0,0.10)'; g.fillRect(0, 0, n / 2, n);
    g.fillStyle = line; g.fillRect(0, 0, n, 3); g.fillRect(0, 0, 3, n);
  });
}

export function buildScene(world, renderer, opts = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 150, 1400);
  const aniso = renderer && !opts.fast ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;

  // Sky dome: gradient from horizon to zenith, fixed in the world so the horizon tilts when you roll.
  const skyGeo = new THREE.SphereGeometry(1800, 24, 12);
  const cols = [], top = new THREE.Color(ZENITH), low = new THREE.Color(HORIZON), c = new THREE.Color();
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 1800);
    c.copy(low).lerp(top, Math.pow(h, 0.55));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky';
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6a3a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(-60, 100, 40);
  scene.add(sun);

  // Ground: rough grass far out, mown field with a 10 m grid in the middle.
  // Both planes are subdivided: with two giant triangles the fog came out wrong when the camera sat on the ground.
  const rough = grassTexture('#5f8f3f', 'rgba(0,0,0,0)');
  rough.repeat.set(400, 400); rough.anisotropy = aniso;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 80, 80), new THREE.MeshLambertMaterial({ map: rough }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.02;
  scene.add(far);
  const mown = grassTexture('#4f9a3c', 'rgba(235,245,215,0.55)');
  mown.repeat.set(FIELD_SIZE / 10, FIELD_SIZE / 10); mown.anisotropy = aniso;
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE, FIELD_SIZE / 10, FIELD_SIZE / 10), new THREE.MeshLambertMaterial({ map: mown }));
  field.rotation.x = -Math.PI / 2;
  scene.add(field);

  // Start pad: 2 m square with an arrow pointing the way the quad faces.
  const padTex = canvasTexture(128, (g, n) => {
    g.fillStyle = '#3b3f46'; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(6, 6, n - 12, n - 12);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(n / 2, 22); g.lineTo(n - 34, 78); g.lineTo(34, 78); g.fill();
    g.fillRect(n / 2 - 9, 78, 18, 28);
  });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshLambertMaterial({ map: padTex }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(world.start.x, 0.01, world.start.z);
  scene.add(pad);

  // Trees: instanced trunk + cone crown.
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), world.trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), world.trees.length);
  world.trees.forEach((t, i) => {
    const base = t.height * 0.35;
    m.compose(new THREE.Vector3(t.x, base / 2, t.z), q, new THREE.Vector3(t.trunk, base, t.trunk));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(t.x, base + (t.height - base) / 2, t.z), q, new THREE.Vector3(t.crown, t.height - base, t.crown));
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHSL(0.30 + t.shade * 0.06, 0.55, 0.22 + t.shade * 0.12));
  });
  scene.add(trunks, crowns);

  // Poles: red/white band per metre.
  const bandTex = canvasTexture(32, (g, n) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, n, n); g.fillStyle = '#d6322b'; g.fillRect(0, 0, n, n / 2); });
  for (const p of world.poles) {
    const tex = bandTex.clone(); tex.needsUpdate = true; tex.repeat.set(1, p.height / 2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.height, 10), new THREE.MeshLambertMaterial({ map: tex }));
    pole.position.set(p.x, p.height / 2, p.z);
    scene.add(pole);
  }

  // Buildings: box + slightly wider roof slab + a door for scale (2 m tall).
  for (const b of world.buildings) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshLambertMaterial({ color: b.color }));
    body.position.set(b.x, b.h / 2, b.z);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.3, b.d + 0.6), new THREE.MeshLambertMaterial({ color: b.roof }));
    roof.position.set(b.x, b.h - 0.15, b.z);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
    const side = b.x > 0 ? -1 : 1; // door faces the field centre
    door.position.set(b.x + side * (b.w / 2 + 0.02), 1, b.z);
    door.rotation.y = side * Math.PI / 2;
    scene.add(body, roof, door);
  }
  return scene;
}

// Gates: a frame (two posts + top bar) and a number board on top. Returns { group, highlight(nextIndex) }.
// The next gate is bright orange with a glowing board; the others are blue.
const GATE_NEXT = 0xff7a1a, GATE_IDLE = 0x2f5fb0;
export function buildGates(course) {
  const group = new THREE.Group();
  group.name = 'gates';
  const frames = [];
  for (const g of course.gates) {
    const mat = new THREE.MeshBasicMaterial({ color: GATE_IDLE });
    const gate = new THREE.Group();
    const post = new THREE.BoxGeometry(g.bar, g.h + g.bar, g.bar);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(post, mat);
      m.position.set(side * (g.w / 2 + g.bar / 2), (g.h + g.bar) / 2, 0);
      gate.add(m);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(g.w + 2 * g.bar, g.bar, g.bar), mat);
    top.position.set(0, g.h + g.bar / 2, 0);
    gate.add(top);
    // Number board, readable from the side you fly in from (and mirrored-safe: drawn on both faces).
    const tex = canvasTexture(128, (c, n) => {
      c.fillStyle = '#10151d'; c.fillRect(0, 0, n, n);
      c.fillStyle = '#ffffff'; c.font = 'bold 96px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(g.index + 1), n / 2, n / 2 + 6);
    });
    for (const face of [1, -1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: tex }));
      board.position.set(0, g.h + g.bar + 0.45, face * 0.01);
      if (face < 0) board.rotation.y = Math.PI;
      gate.add(board);
    }
    gate.position.set(g.x, 0, g.z);
    gate.rotation.y = -g.headingDeg * Math.PI / 180;
    group.add(gate);
    frames.push(mat);
  }
  let shown = -2;
  return {
    group,
    highlight(next) {
      if (next === shown) return;
      shown = next;
      frames.forEach((m, i) => m.color.setHex(i === next ? GATE_NEXT : GATE_IDLE));
    },
  };
}

// Small quad model for the chase view. Body axes: -Z is the nose (orange).
export function buildQuadModel() {
  const quad = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.025), dark);
    arm.rotation.y = a;
    quad.add(arm);
  }
  quad.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.14), dark));
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
  nose.position.set(0, 0.02, -0.07);
  quad.add(nose);
  const d = 0.11 * Math.SQRT1_2;
  for (const [x, z] of [[d, -d], [d, d], [-d, d], [-d, -d]]) {
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.0635, 0.0635, 0.004, 20),
      new THREE.MeshLambertMaterial({ color: z < 0 ? 0xff7a1a : 0x1a9cff, transparent: true, opacity: 0.6 }));
    prop.position.set(x, 0.02, z);
    quad.add(prop);
  }
  return quad;
}

// Vertical FOV (what three.js wants) from a horizontal FOV, both in degrees.
export function verticalFov(horizontalDeg, aspect) {
  return 2 * Math.atan(Math.tan((horizontalDeg * Math.PI) / 360) / aspect) * 180 / Math.PI;
}
