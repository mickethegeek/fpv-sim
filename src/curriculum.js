// Curriculum (M10e, Mike 2026-11-17: "go from 0 to understanding motor thrust"). Text only, no DOM.
// Learn is ordered in four levels. Each level has a deck of cards (played like theory cards, each with a live demo)
// and the lesson chapters that belong to it. Every card has two layers: the pattern (`sticks`, what to do) and
// `why`, the motors layer (what the motors do and the forces that result), shown on demand with "Why? (motors)".
// The demo of every card draws the real forces and tags the faster / slower motors live while "Why?" is on.
// Claims about real drones: docs/theory.md ("Curriculum") and docs/physics.md.
import { PATTERNS } from './patterns.js';
import { chapterFor } from './theory.js';

const pat = (id, more = {}) => { const p = PATTERNS.find((x) => x.id === id); return { id: 'p-' + p.id, title: p.title, sticks: p.sticks, text: p.text, demo: p.demo, ...more }; };

export const LEVELS = [
  { id: 'basics', n: 1, title: 'The basics', line: 'One move at a time: up, down, turn, forward, back, sideways, stop, hover',
    lessons: ['takeoff', 'directions'],
    cards: [
      pat('hover', { why: 'All four motors push the same, and together exactly as much as the drone weighs.' }),
      { id: 'b-up', title: 'Up', demo: 'basic-up', sticks: 'Left: up, past hover · Right: centred',
        text: 'Push the throttle above hover and the drone climbs. Back to hover and it holds the new height.',
        why: 'All four motors speed up together: more push than weight, so it climbs.' },
      { id: 'b-down', title: 'Down', demo: 'basic-down', sticks: 'Left: a little below hover · Right: centred',
        text: 'Ease the throttle just under hover and it sinks gently. Back to hover just before the height you want.',
        why: 'All four motors slow a little: less push than weight, so it sinks. At zero they barely push and it falls.' },
      { id: 'b-yaw', title: 'Turn left and right', demo: 'basic-yaw', sticks: 'Left: sideways, smoothly · Right: centred',
        text: 'Push the left stick sideways and the nose turns on the spot. Centre it and the turning stops.',
        why: 'Props spin two one way, two the other, so their twists cancel. To turn, one diagonal pair speeds up and the other slows: the frame twists the other way.' },
      pat('forward', { why: 'The back motors speed up for a moment to tip the nose down; then the tilted push drives it forward.' }),
      { id: 'b-back', title: 'Backward', demo: 'basic-back', sticks: 'Right: pull back · Left: a little more throttle',
        text: 'Pull the right stick back and the drone tilts back and moves backward. Centre it and it levels, but keeps drifting.',
        why: 'The front motors speed up for a moment to lift the nose; then the push leans back and pulls it backward.' },
      { id: 'b-side', title: 'Sideways', demo: 'basic-side', sticks: 'Right: left or right · Left: hold height',
        text: 'Push the right stick sideways and the drone leans and slides that way, nose still pointing ahead. Lean the other way briefly to stop.',
        why: 'To lean right the left motors speed up for a moment (to lean left, the right ones); then the tilted push moves it sideways.' },
      pat('stop', { why: 'Tilting back points part of the push against the movement. Apart from air drag, that is the only brake a drone has.' }),
    ] },
  { id: 'combos', n: 2, title: 'Combinations', line: 'Two sticks at once: forward with throttle, banked turns, orbits, nose toward you, wind',
    lessons: ['turns', 'outback', 'wind', 'emergency'],
    cards: [
      pat('forward', { id: 'c-forward', title: 'Forward + throttle', why: 'Tilted, only part of the push holds the drone up. A little more throttle makes up for the part now pushing it forward.' }),
      pat('turn', { why: 'Roll tilts the push toward the inside of the turn, which bends the path; yaw keeps the nose along it.' }),
      pat('orbit', { why: 'The tilt toward the centre pulls the drone round all the time, like a stone on a string.' }),
      pat('nose-in', { why: 'The motors only know the drone\'s own left and right. Rolling right always speeds up its left motors, whichever way it faces you.' }),
      { id: 'c-wind', title: 'Wind', demo: 'wind-lean', sticks: 'Right: a small, steady tilt into the wind · Left: hold height',
        text: 'The air carries the drone, so in wind it drifts even when level. Hold a small tilt into the wind to stay over one spot.',
        why: 'Tilted into the wind, a little of the push points upwind and cancels the drag of the moving air.' },
    ] },
  { id: 'physics', n: 3, title: 'The physics', line: 'Thrust, tilt, prop torque, momentum, and why coming down is hard',
    lessons: [],
    cards: [
      { id: 'f-thrust', title: 'Thrust and throttle', demo: 'thrust-ramp', sticks: 'Left: slowly up from hover',
        text: 'This quad can push 9 times its weight, so hovering takes about a ninth of full push. Push grows faster than the stick, so that ninth sits near 15 % of the stick (about 21 % on the Trainer).',
        why: 'Each motor\'s push goes up roughly with the command to the power 1.35 (measured on 2207 motors with 5-inch props): half throttle gives well under half the push.' },
      { id: 'f-tilt', title: 'Tilt makes sideways force', demo: 'tilt-sink', sticks: 'Right: tilt · Left: add throttle',
        text: 'The push always points out of the top of the drone. Tilt it 30° and half of the push points sideways while the part holding it up shrinks.',
        why: 'Upward part = push × cos(tilt): 87 % at 30°, 50 % at 60°. The rest drives the drone along.' },
      { id: 'f-yaw', title: 'Prop torque, and the yaw jump', demo: 'pat-spin', sticks: 'Left: sideways, smoothly',
        text: 'Turning on the spot uses the props\' twist, which is weak, so the flight controller has to drive one pair hard and the other near idle. With a sudden full yaw the total push rises and the drone jumps up.',
        why: 'A prop\'s twist is its push times only about 1.2 cm, against about 8 cm of lever for tilting (the 11 cm arm, at 45° in an X frame), so turning needs a big difference between the pairs. Real Betaflight quads show the same "yaw jump" on hard yaw.' },
      { id: 'f-momentum', title: 'Momentum and drag', demo: 'coast', sticks: 'Right: forward, then centre',
        text: 'A moving drone keeps moving: only the air slows it. The faster the air rushes through the props, the less they push, and that sets the top speed (about 150 km/h for this quad).',
        why: 'Levelled, no motor pushes it back. Only drag acts, so it glides for many metres.' },
      { id: 'f-down', title: 'Coming down', demo: 'descent', sticks: 'Left: just under hover · Right: a little forward',
        text: 'Drop straight down fast and the drone falls into its own prop wash and loses push, so it sinks faster still. Come down slowly, or while moving forward.',
        why: 'NASA wind-tunnel tests of a quadcopter found up to 20 % less mean push when sinking into its own wash ("vortex ring state"). Moving forward leaves the wash behind.' },
    ] },
  { id: 'acro', n: 4, title: 'Acro', line: 'The stick sets rotation speed, and you level it yourself',
    lessons: ['acro', 'ready'],
    cards: chapterFor('acro').cards.map((c) => ({ ...c,
      why: { angle: 'The flight controller compares the tilt with the stick and drives the motors until they match; centred stick means level.',
        acro: 'The motors only speed up or slow down while the rotation speed differs from what the stick asks; centred stick asks for no rotation, so the angle stays.',
        rates: 'Betaflight "Actual" rates: 70°/s near centre, 670°/s at full stick (the defaults).',
        'acro-level': 'Counter-stick makes the opposite motors speed up until the tilt is gone.' }[c.id] })) },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const levelOfLesson = (lessonId) => LEVELS.find((l) => l.lessons.includes(lessonId)) || null;
export const allLevelCards = () => LEVELS.flatMap((l) => l.cards.map((c) => ({ ...c, level: l.id })));
// One line for the motors layer of any card: its own `why`, else a general line for the arrows and tags.
export const WHY_DEFAULT = 'Yellow arrows: each motor\'s push. ▲ / ▼: motors faster or slower than the average right now.';
