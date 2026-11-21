// Body (parasitic) drag of the frame, battery and stopped props, element by element (docs/inertia-review.md I5).
// Each element sits at a point r in the body frame and has a drag area CdA per body axis (x right, y up, z back):
// the projected area it shows to air coming along that axis, times its drag coefficient. Its local air velocity is the
// body's plus its own motion from the rotation, v + omega x r, and it feels F_i = -1/2 rho |v_local| CdA_i v_local,i.
// From that one rule come: flat is draggier than edge-on, a spin is slowed by the air (very little at rest, much more
// while falling, because the falling air hits the side swinging into it harder), and a tumble settles.
// No DOM; runs in node and browser.

const RHO = 1.225; // kg/m^3, ISA sea level

// Geometry: every number and where it comes from (docs/inertia-review.md I5 lists the sources).
export function defaultBodyGeom() {
  return {
    // Battery: CNHL Black Series 1300 mAh 6S, 77 x 48 x 33 mm (getfpv). Long side along the body z axis, flat on top.
    battery: { x: 0.048, y: 0.033, z: 0.077 },
    // Frame centre (plates, stack, camera): FS225 frame height 36 mm, camera mount width 36 mm (getfpv);
    // length 100 mm is UNSOURCED (Chimera5 Pro V2's 140 mm overall length includes the arm ends).
    body: { x: 0.036, y: 0.036, z: 0.100 },
    cdBox: 1.05,         // cube, NASA Glenn "Shape Effects on Drag"
    cdPlate: 1.28,       // flat plate, NASA Glenn
    // Arms: from the frame centre out to the motor (wheelbase 225 mm / 2 = 112.5 mm, FS225); the first 20 mm are inside the body.
    armIn: 0.02,
    armThick: 0.005,     // FS225 "Arm thickness: 5mm" (getfpv)
    armWidth: 0.014,     // UNSOURCED: no 5-inch frame page gives arm width
    // Stopped prop: blade area of one 3-blade 5-inch prop, UNSOURCED (3 blades x 60 mm x 10 mm mean chord);
    // blade angle 20 deg at 75 % radius from the 4.3 in pitch: atan(4.3 / (2 pi 0.75 x 2.5)).
    propArea: 0.0018,
    bladeAngle: 20,      // deg (derived above)
  };
}

const cache = new WeakMap();
// Elements for one quad: { r: [x,y,z], a: [CdA_x, CdA_y, CdA_z] (m^2), prop: true for stopped-prop elements }.
export function bodyElements(p) {
  let e = cache.get(p);
  if (e) return e;
  const g = p.bodyGeom || defaultBodyGeom();
  e = [];
  const box = (b) => [g.cdBox * b.y * b.z, g.cdBox * b.x * b.z, g.cdBox * b.x * b.y];
  const bat = box(g.battery), bod = box(g.body);
  // Battery and body as two halves each (front / back), so a rotation about x or y is felt by them too.
  for (const s of [-1, 1]) {
    e.push({ r: [0, 0, s * g.battery.z / 4], a: bat.map((v) => v / 2) });
    e.push({ r: [0, 0, s * g.body.z / 4], a: bod.map((v) => v / 2) });
  }
  const L = p.armLength, n = 3, seg = (L - g.armIn) / n, cb = Math.cos(g.bladeAngle * Math.PI / 180), sb = Math.sin(g.bladeAngle * Math.PI / 180);
  for (const [sx, sz] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
    const ux = sx * Math.SQRT1_2, uz = sz * Math.SQRT1_2;
    // Arm: flat to air along y (width x length), edge-on to air along x or z (thickness x length x sin 45).
    for (let k = 0; k < n; k++) {
      const d = g.armIn + (k + 0.5) * seg;
      const side = g.cdPlate * g.armThick * seg * Math.SQRT1_2;
      e.push({ r: [ux * d, 0, uz * d], a: [side, g.cdPlate * g.armWidth * seg, side] });
    }
    // Stopped prop: blade area at four points 0.6 R around the motor (area-weighted radius of a blade, UNSOURCED rounding).
    // Seen from above: area x cos(blade angle). From the side: area x sin(blade angle) x 1/2 (blades at all angles, on average half face the air).
    const rp = 0.6 * (p.propRadius || 0.0635), mx = ux * L, mz = uz * L;
    for (const [dx, dz] of [[rp, 0], [-rp, 0], [0, rp], [0, -rp]]) {
      const a = g.propArea / 4;
      e.push({ r: [mx + dx, 0, mz + dz], a: [g.cdPlate * a * sb / 2, g.cdPlate * a * cb, g.cdPlate * a * sb / 2], prop: true });
    }
  }
  cache.set(p, e);
  return e;
}

// Total body-frame force and torque from body drag. vb = air velocity in body axes, w = body rates, scale = p.dragQuadratic
// (1 = as built; tuning's floatiness divides it), propStopped = 0..1 how much the props count as stopped blades.
export function bodyDrag(p, vb, w, scale, propStopped, outF, outT) {
  outF[0] = outF[1] = outF[2] = outT[0] = outT[1] = outT[2] = 0;
  if (!scale) return;
  const el = bodyElements(p), k = 0.5 * RHO * scale;
  for (let i = 0; i < el.length; i++) {
    const { r, a, prop } = el[i];
    const f = prop ? propStopped : 1;
    if (!f) continue;
    // Local air velocity: v + omega x r.
    const lx = vb[0] + w[1] * r[2] - w[2] * r[1];
    const ly = vb[1] + w[2] * r[0] - w[0] * r[2];
    const lz = vb[2] + w[0] * r[1] - w[1] * r[0];
    const q = -k * f * Math.hypot(lx, ly, lz);
    const fx = q * a[0] * lx, fy = q * a[1] * ly, fz = q * a[2] * lz;
    outF[0] += fx; outF[1] += fy; outF[2] += fz;
    outT[0] += r[1] * fz - r[2] * fy;
    outT[1] += r[2] * fx - r[0] * fz;
    outT[2] += r[0] * fy - r[1] * fx;
  }
}

// Drag area sums per body axis (m^2), props stopped or spinning: for docs and tests.
export function dragAreas(p, propsStopped = true) {
  const s = [0, 0, 0];
  for (const e of bodyElements(p)) if (!e.prop || propsStopped) for (let i = 0; i < 3; i++) s[i] += e.a[i];
  return s;
}
