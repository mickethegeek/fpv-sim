// Entry point. Wires renderer + loop. Keep physics out of here (see physics.js).
import * as THREE from '../vendor/three.module.min.js';
import { PHYSICS_HZ } from './physics.js';

// Test hook: the Playwright flight script (test/flight.mjs) reads this.
const sim = (window.__sim = { ready: false, frames: 0, errors: [], physicsHz: PHYSICS_HZ });
window.addEventListener('error', (e) => sim.errors.push(String(e.message)));

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec5ff);
const camera = new THREE.PerspectiveCamera(110, 1, 0.05, 2000);
camera.position.set(0, 1.5, 4);

scene.add(new THREE.HemisphereLight(0xffffff, 0x406030, 1.2));
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x4f8a3a })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(400, 80, 0x2f5f24, 0x3f7430);
grid.position.y = 0.02;
scene.add(grid);
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xff7a1a })
);
box.position.set(0, 1, 0);
scene.add(box);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function frame(t) {
  box.rotation.y = t / 1000;
  renderer.render(scene, camera);
  sim.frames++;
  sim.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
