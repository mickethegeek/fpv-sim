// Entry point. Wires renderer + loop. Physics lives in sim.js / physics.js / flightcontroller.js (no DOM there).
import * as THREE from '../vendor/three.module.min.js';
import { PHYSICS_HZ, attitude } from './physics.js';
import { MODES } from './flightcontroller.js';
import { createSim, resetSim, simAdvance } from './sim.js';
import { DEG } from './params.js';

const sim = createSim({ mode: MODES.ANGLE });
// Sticks the sim flies on. M2 replaces this with gamepad/keyboard input; tests write to it via window.__sim.
const sticks = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };

// Test hook: the Playwright flight script (test/flight.mjs) drives and reads the sim through this.
const hook = (window.__sim = {
  ready: false, frames: 0, errors: [], physicsHz: PHYSICS_HZ, physicsSteps: 0,
  sim, sticks,
  setSticks(s) { Object.assign(sticks, s); },
  arm(on = true) { sim.armed = on; },
  setMode(m) { sim.mode = m; },
  reset() { resetSim(sim); Object.assign(sticks, { roll: 0, pitch: 0, yaw: 0, throttle: 0 }); },
  snapshot() {
    const s = sim.state, a = attitude(s.quat);
    return { pos: [...s.pos], vel: [...s.vel], quat: [...s.quat], omega: [...s.omega], motors: [...s.motors],
      rollDeg: a.roll / DEG, pitchDeg: a.pitch / DEG, yawDeg: a.yaw / DEG,
      onGround: s.onGround, crashed: s.crashed, armed: sim.armed, mode: sim.mode, time: s.time };
  },
});
window.addEventListener('error', (e) => hook.errors.push(String(e.message)));

const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec5ff);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);

scene.add(new THREE.HemisphereLight(0xffffff, 0x406030, 1.2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x4f8a3a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(2000, 400, 0x2f5f24, 0x3f7430); // 5 m squares
grid.position.y = 0.02;
scene.add(grid);

// Placeholder quad model (M3 replaces the chase view with the FPV camera). Body axes: -Z is the nose.
const quadModel = new THREE.Group();
const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
for (const a of [Math.PI / 4, -Math.PI / 4]) {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.025), dark);
  arm.rotation.y = a;
  quadModel.add(arm);
}
const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.14), dark);
quadModel.add(bodyBox);
const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
nose.position.set(0, 0.02, -0.07);
quadModel.add(nose);
const d = 0.11 * Math.SQRT1_2;
for (const [x, z] of [[d, -d], [d, d], [-d, d], [-d, -d]]) {
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.0635, 0.0635, 0.004, 20),
    new THREE.MeshLambertMaterial({ color: z < 0 ? 0xff7a1a : 0x1a9cff, transparent: true, opacity: 0.6 }));
  prop.position.set(x, 0.02, z);
  quadModel.add(prop);
}
scene.add(quadModel);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const camPos = new THREE.Vector3(0, 0.6, 1.6);
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  hook.physicsSteps += simAdvance(sim, sticks, dt);

  const s = sim.state;
  quadModel.position.set(s.pos[0], s.pos[1], s.pos[2]);
  quadModel.quaternion.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
  // Chase camera: stays south of the quad (+Z), a little above, looking at it.
  camPos.lerp(new THREE.Vector3(s.pos[0], s.pos[1] + 0.5, s.pos[2] + 1.6), Math.min(1, dt * 6));
  camera.position.copy(camPos);
  camera.lookAt(quadModel.position);

  const a = attitude(s.quat);
  const speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  hud.textContent = `${s.crashed ? 'CRASHED' : sim.armed ? 'ARMED' : 'DISARMED'} | ${sim.mode.toUpperCase()} | thr ${(sticks.throttle * 100).toFixed(0)}% | `
    + `${(speed * 3.6).toFixed(0)} km/h | alt ${s.pos[1].toFixed(1)} m | roll ${(a.roll / DEG).toFixed(0)}° pitch ${(a.pitch / DEG).toFixed(0)}°`;

  renderer.render(scene, camera);
  hook.frames++;
  hook.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
