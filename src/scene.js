// Draws the world (world.js data) with three.js. Simple shapes, but lit like a clear day: one sun, its shadows on the ground,
// a sky with the sun in it, haze toward the horizon and ground detail at every scale (cues for speed and height).
import * as THREE from '../vendor/three.module.min.js';
import { FIELD_SIZE } from './world.js';

const HORIZON = 0xc4dcf0, ZENITH = 0x2f6fc4, SUN_COLOR = 0xfff0d2;
// Direction toward the sun (unit vector): 46° above the horizon, behind the pilot's left shoulder so it is never in the eyes on the pad.
export const SUN_DIR = (() => { const v = [-0.45, 0.72, 0.53], n = Math.hypot(...v); return v.map((c) => c / n); })();
export const SUN_ANGULAR_DIAMETER = 0.533 * Math.PI / 180; // rad, the sun seen from Earth (docs/physics.md): sets the disc in the sky and how fast a shadow softens
const SHADOW_Y = 0.025;      // m above the ground, so shadows do not flicker against the grass
const SHADOW_DARK = 0.42;    // how much of the light a shadow takes away on the ground

// The ground is flat, so a shadow is the object slid along the sun's rays onto the ground: exact and sharp at any distance, almost free to draw.
// This matrix does the sliding (every point lands on y = SHADOW_Y).
export function shadowMatrix(target = new THREE.Matrix4()) {
  const [lx, ly, lz] = SUN_DIR, h = SHADOW_Y;
  return target.set(1, -lx / ly, 0, (lx / ly) * h, 0, 0, 0, h, 0, -lz / ly, 1, (lz / ly) * h, 0, 0, 0, 1);
}
// Where the shadow of a point lands on the ground: [x, z].
export function shadowPoint(pos) {
  const k = Math.max(0, pos[1] - SHADOW_Y) / SUN_DIR[1];
  return [pos[0] - SUN_DIR[0] * k, pos[2] - SUN_DIR[2] * k];
}
// Shadow material. Front faces only: of a solid shape slid flat, exactly the sunlit half faces up, so each shape darkens the grass once.
function shadowMaterial(side = THREE.FrontSide) {
  return new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: SHADOW_DARK, depthWrite: false, side,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
const P = shadowMatrix(), STATIC_SHADOW = shadowMaterial();
// Shadow of a mesh that never moves (also instanced meshes).
function castStatic(scene, mesh) {
  mesh.updateMatrixWorld(true);
  let sh;
  if (mesh.isInstancedMesh) {
    sh = new THREE.InstancedMesh(mesh.geometry, STATIC_SHADOW, mesh.count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); sh.setMatrixAt(i, m.premultiply(P)); }
  } else {
    sh = new THREE.Mesh(mesh.geometry, STATIC_SHADOW);
    sh.matrixAutoUpdate = false;
    sh.matrix.multiplyMatrices(P, mesh.matrixWorld);
  }
  sh.frustumCulled = false; sh.renderOrder = 1; sh.name = 'shadow';
  scene.add(sh);
}

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

// Grey noise used to vary the grass at three scales (see groundDetail). Red: fine speckle (grass blades up close).
// Green: soft blotches that tile (patches of lighter and darker grass seen from higher up). Both average 0.5.
function detailTexture() {
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  let s = 4242;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const lattice = (cells) => { const v = Array.from({ length: cells * cells }, r); return (x, y) => {
    const fx = x * cells / n, fy = y * cells / n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), at = (i, j) => v[((j + cells) % cells) * cells + ((i + cells) % cells)];
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy; }; };
  const a = lattice(6), b = lattice(17), fine = lattice(24);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    img.data[i] = 255 * Math.min(1, Math.max(0, 0.5 + (r() - 0.5) * 0.9 + (fine(x, y) - 0.5) * 0.9));
    img.data[i + 1] = 255 * Math.min(1, Math.max(0, 0.5 + (a(x, y) - 0.5) * 1.1 + (b(x, y) - 0.5) * 0.5));
    img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// Multiplies the grass colour by the noise at three sizes: about 1 m (blades, speed cue near the ground), 27 m and 160 m (patches, height cue).
// The base texture is one tile per 10 m on both ground planes, so the sizes are the same everywhere.
function groundDetail(mat, detail) {
  if (!detail) return mat;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D detailMap;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= (0.6 + 0.8 * texture2D(detailMap, vMapUv * 11.0).r) * (0.72 + 0.56 * texture2D(detailMap, vMapUv * 0.37).g) * (0.78 + 0.44 * texture2D(detailMap, vMapUv * 0.061).g);`);
  };
  return mat;
}
// Board wall: one tile is 2 m wide with a board every 0.5 m, slightly uneven, a darker skirting at the bottom of each 3 m.
function wallTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
    let s = 31;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.1})`; g.fillRect(i * n / 4, 0, n / 4, n);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i * n / 4, 0, 2, n);
    }
  });
}

export function buildScene(world, renderer, opts = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HORIZON, 0.00105); // haze: half gone at about 800 m, the far tree line is pale, the horizon melts into the sky
  const aniso = renderer && !opts.fast ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;

  // Sky dome: deep blue overhead, pale toward the horizon, the sun as a disc of its real size with a glow around it.
  // Fixed in the world so the horizon tilts when you roll. Near the horizon it fades into the haze colour, the same colour the fog uses,
  // so far ground and sky meet without a seam.
  const sunDir = new THREE.Vector3(...SUN_DIR);
  // The gradient and the wide glow are worked out per corner of the dome (cheap); the disc and, on high quality, the tight glow per pixel.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, defines: opts.fast ? {} : { TIGHT_GLOW: 1 },
    uniforms: { sunDir: { value: sunDir }, zenith: { value: new THREE.Color(ZENITH) }, horizon: { value: new THREE.Color(HORIZON) },
      sunColor: { value: new THREE.Color(SUN_COLOR) }, haze: { value: scene.fog.color.clone().convertLinearToSRGB() }, cosSun: { value: Math.cos(SUN_ANGULAR_DIAMETER / 2) } },
    vertexShader: `uniform vec3 sunDir, zenith, horizon, sunColor; varying vec3 vDir, vCol; varying float vHaze;
      void main() {
        vec3 d = normalize(position);
        vDir = position;
        vCol = mix(horizon, zenith, pow(max(d.y, 0.0), 0.45)) + sunColor * 0.10 * pow(max(dot(d, sunDir), 0.0), 6.0);
        vHaze = 1.0 - smoothstep(0.0, 0.16, d.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 sunDir, sunColor, haze; uniform float cosSun; varying vec3 vDir, vCol; varying float vHaze;
      void main() {
        float c = dot(normalize(vDir), sunDir);
        vec3 col = vCol;
        #ifdef TIGHT_GLOW
        col += sunColor * 0.45 * pow(max(c, 0.0), 180.0);
        #endif
        col = mix(col, sunColor * 4.0, smoothstep(cosSun - 0.000012, cosSun + 0.000004, c));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, vHaze);
      }`,
  }));
  sky.name = 'sky';
  scene.add(sky);

  // Light: the sun plus light from the sky (blue from above, green bounced off the grass). Sides facing away from the sun stay readable.
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x5c7a45, 1.25));
  const sun = new THREE.DirectionalLight(SUN_COLOR, 2.6);
  sun.position.copy(sunDir).multiplyScalar(200);
  scene.add(sun);

  // Ground: rough grass far out, mown field with a 10 m grid in the middle.
  // Both planes are subdivided: with two giant triangles the fog came out wrong when the camera sat on the ground.
  const rough = grassTexture('#6a8b46', 'rgba(0,0,0,0)');
  rough.repeat.set(400, 400); rough.anisotropy = aniso;
  const detail = opts.fast ? null : detailTexture(); // low quality: the plain grass texture only
  if (detail) detail.anisotropy = aniso;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 80, 80), groundDetail(new THREE.MeshLambertMaterial({ map: rough }), detail));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.02;
  scene.add(far);
  const mown = grassTexture('#5a9141', 'rgba(235,245,215,0.55)');
  mown.repeat.set(FIELD_SIZE / 10, FIELD_SIZE / 10); mown.anisotropy = aniso;
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE, FIELD_SIZE / 10, FIELD_SIZE / 10), groundDetail(new THREE.MeshLambertMaterial({ map: mown }), detail));
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
  castStatic(scene, trunks); castStatic(scene, crowns);

  // Poles: red/white band per metre.
  const bandTex = canvasTexture(32, (g, n) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, n, n); g.fillStyle = '#d6322b'; g.fillRect(0, 0, n, n / 2); });
  for (const p of world.poles) {
    const tex = bandTex.clone(); tex.needsUpdate = true; tex.repeat.set(1, p.height / 2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.height, 10), new THREE.MeshLambertMaterial({ map: tex }));
    pole.position.set(p.x, p.height / 2, p.z);
    scene.add(pole);
    castStatic(scene, pole);
  }

  // Buildings: box + slightly wider roof slab + a door for scale (2 m tall).
  const boards = wallTexture();
  for (const b of world.buildings) {
    const wall = (len) => { const t = boards.clone(); t.needsUpdate = true; t.repeat.set(len / 2, 1); t.anisotropy = aniso; return new THREE.MeshLambertMaterial({ color: b.color, map: t }); };
    const plain = new THREE.MeshLambertMaterial({ color: b.color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [wall(b.d), wall(b.d), plain, plain, wall(b.w), wall(b.w)]);
    body.position.set(b.x, b.h / 2, b.z);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.3, b.d + 0.6), new THREE.MeshLambertMaterial({ color: b.roof }));
    roof.position.set(b.x, b.h - 0.15, b.z);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
    const side = b.x > 0 ? -1 : 1; // door faces the field centre
    door.position.set(b.x + side * (b.w / 2 + 0.02), 1, b.z);
    door.rotation.y = side * Math.PI / 2;
    scene.add(body, roof, door);
    castStatic(scene, body); castStatic(scene, roof);
  }
  return scene;
}

// Gates: a frame (two posts + top bar) and a number board on top. Returns { group, highlight(nextIndex) }.
// The next gate is bright orange with a glowing board; the others are blue.
const GATE_NEXT = 0xff7a1a, GATE_IDLE = 0x2f5fb0;
export function buildGates(course) {
  const group = new THREE.Group();
  group.name = 'gates';
  const shadows = new THREE.Group();
  shadows.name = 'gate-shadows'; // added to the group after the gates, so gate i stays child i
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
    gate.updateMatrixWorld(true);
    for (const part of gate.children.slice(0, 3)) { // posts and top bar
      const sh = new THREE.Mesh(part.geometry, STATIC_SHADOW);
      sh.matrixAutoUpdate = false; sh.matrix.multiplyMatrices(P, part.matrixWorld); sh.frustumCulled = false; sh.renderOrder = 1;
      shadows.add(sh);
    }
    frames.push(mat);
  }
  group.add(shadows);
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
  const dark = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }); // light frame: easier to see from the ground
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.025), dark);
    arm.rotation.y = a;
    quad.add(arm);
  }
  quad.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.14), dark));
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
  nose.position.set(0, 0.02, -0.07);
  quad.add(nose);
  // Big nose arrow, shown in the demos about which way the drone points (main.js turns it on): bright, unlit, on top of the frame.
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff6a00 });
  const noseArrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.2), arrowMat);
  shaft.position.set(0, 0.05, -0.1);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.11, 16).rotateX(-Math.PI / 2), arrowMat);
  head.position.set(0, 0.05, -0.25);
  noseArrow.add(shaft, head);
  noseArrow.visible = false;
  quad.add(noseArrow);
  quad.userData.nose = noseArrow;
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

// Shadow of the quad on the ground, where the sun really puts it: the main real-life cue for height and position, in every view.
// Drawn as a disc the size of the quad (frame + props), tilted with the quad, slid along the sun's rays onto the ground.
// It fades with height the way a real shadow does: the sun is a disc 0.53° wide, so the soft edge grows by 0.93 cm per metre
// of distance and eats the dark core. update(pos, quat) once per frame.
export function buildShadow() {
  const mat = shadowMaterial(THREE.DoubleSide);
  const m = new THREE.Mesh(new THREE.CircleGeometry(QUAD_SHADOW_RADIUS, 24).rotateX(-Math.PI / 2), mat);
  m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 1; m.name = 'quad-shadow';
  const body = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  m.update = (pos, quat) => {
    body.compose(p.set(pos[0], Math.max(pos[1], 0.03), pos[2]), q.set(quat[0], quat[1], quat[2], quat[3]), one);
    m.matrix.multiplyMatrices(P, body);
    mat.opacity = SHADOW_DARK * quadShadowStrength(pos[1]);
  };
  return m;
}
const QUAD_SHADOW_RADIUS = 0.2; // m
// 1 on the ground, falling as the soft edge (distance to the shadow x the sun's angular size) grows against the shadow's radius.
export function quadShadowStrength(height) {
  const dist = Math.max(0, height) / SUN_DIR[1];
  return 1 / (1 + (dist * SUN_ANGULAR_DIAMETER) / QUAD_SHADOW_RADIUS);
}
