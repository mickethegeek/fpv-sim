// Theory for the Learn chapters (M9): the cards and the check questions. Text only, no DOM.
// NOT WIRED INTO THE PAGE YET: M9 builds the chapter screens and the live demos from this.
// Rules (PLAN.md, Phase 2): one idea per card, at most 2 short sentences, and the sim shows it (demo).
// Every claim about real drones has a row in docs/theory.md. `concept` is the number in PLAN.md's list of 10.
// `demo` names the scene the sim plays next to the card (to be built in M9; described in docs/theory.md).

export const MAX_CARDS = 4;

export const CHAPTERS = [
  { lesson: 'takeoff', cards: [
    { id: 'props', concept: 1, title: 'Four props, one push', demo: 'hover-arrows',
      text: 'Four props push air down, and that push carries the drone. More throttle means more push on all four.' },
    { id: 'tilt', concept: 1, title: 'Tilting', demo: 'tilt-motors',
      text: 'Speed up the props on one side and the drone tips away from them. There are no flaps or rudders: tilting is all it can do.' },
    { id: 'sticks', concept: 2, title: 'What each stick does', demo: 'stick-tour',
      text: 'Left stick: up and down is throttle, left and right turns the nose. Right stick tilts the drone the way you push it.' },
    { id: 'arm', concept: 10, title: 'Armed means live', demo: 'arm-disarm',
      text: 'Arming switches the motors on. Arm only when the drone is clear of people and your throttle is down.' },
  ], check: [
    { q: 'You push the right stick forward. What does the drone do?', a: ['Tips its nose down and moves forward', 'Climbs', 'Turns to the right'], right: 0 },
    { q: 'What carries the drone?', a: ['Wings', 'Four props pushing air down', 'A balloon effect from the frame'], right: 1 },
  ] },
  { lesson: 'directions', cards: [
    { id: 'yaw', concept: 1, title: 'Turning on the spot', demo: 'yaw-pairs',
      text: 'Two props spin one way and two the other. Speed up one pair and the drone turns the opposite way.' },
    { id: 'relative', concept: 6, title: 'The sticks follow the drone', demo: 'nose-in',
      text: 'Right on the stick is always the drone\'s right, not yours. When its nose points at you, its right is your left.' },
    { id: 'nose-in', concept: 6, title: 'Nose toward you', demo: 'nose-in-fix',
      text: 'Do not think left or right: imagine you sit in the drone and steer from there. When unsure, turn the nose away from you first.' },
  ], check: [
    { q: 'The nose points at you and you push the right stick right. Which way does the drone go, as you see it?', a: ['To your right', 'To your left', 'Away from you'], right: 1 },
    { q: 'How does a quad turn its nose without tilting?', a: ['A small rudder', 'It speeds up the pair of props that spin the same way', 'It slows all four props'], right: 1 },
  ] },
  { lesson: 'turns', cards: [
    { id: 'tilt-move', concept: 3, title: 'Tilt to move', demo: 'tilt-forward',
      text: 'A tilted drone pushes some of its air backward, so it moves. The more tilt, the faster it goes.' },
    { id: 'tilt-height', concept: 3, title: 'Tilting costs height', demo: 'tilt-sink',
      text: 'Push used for moving is no longer holding the drone up. Add a little throttle when you tilt, or it sinks.' },
    { id: 'turn', concept: 7, title: 'A turn uses both sticks', demo: 'coordinated-turn',
      text: 'Turn the nose with the left stick and lean into the turn with the right, like a bike. Nose only, and the drone slides sideways.' },
  ], check: [
    { q: 'You tilt forward and do nothing else. What happens to the height?', a: ['It stays', 'The drone sinks', 'The drone climbs'], right: 1 },
    { q: 'What makes a clean turn?', a: ['Yaw alone', 'Yaw and roll together', 'Cutting the throttle'], right: 1 },
  ] },
  { lesson: 'outback', cards: [
    { id: 'no-brakes', concept: 4, title: 'No brakes', demo: 'coast',
      text: 'Level the drone and it keeps gliding: air slows it only a little. To stop, tilt back against the movement.' },
    { id: 'stop-early', concept: 4, title: 'Stop early', demo: 'stop-distance',
      text: 'Stopping takes room, and more speed takes much more. Start slowing down well before the place you want to stop.' },
    { id: 'camera', concept: 9, title: 'The tilted camera', demo: 'camera-tilt',
      text: 'The drone flies nose down, so the camera is tilted up to keep looking ahead. Hovering, you see more sky; moving, you see the horizon.' },
  ], check: [
    { q: 'You are flying forward and centre the right stick. What happens?', a: ['The drone stops at once', 'It keeps gliding forward', 'It flies backward'], right: 1 },
    { q: 'Why is an FPV camera tilted up?', a: ['To film the sky', 'Because the drone leans forward when it flies', 'To protect the lens'], right: 1 },
  ] },
  { lesson: 'wind', cards: [
    { id: 'wind-drift', concept: 8, title: 'The drone lives in the air', demo: 'wind-drift',
      text: 'The drone floats in the air, so when the air moves, the drone goes with it. Level is not the same as still.' },
    { id: 'wind-lean', concept: 8, title: 'Lean into it', demo: 'wind-lean',
      text: 'To stay over one spot, hold a small tilt into the wind. Flying back against the wind takes longer, so do not go far downwind.' },
  ], check: [
    { q: 'Wind from the left, sticks centred, angle mode. The drone…', a: ['Stays over the spot', 'Drifts to the right', 'Drifts to the left'], right: 1 },
    { q: 'How do you hover over one spot in wind?', a: ['Hold a small tilt into the wind', 'Add throttle', 'Turn the nose away from the wind'], right: 0 },
  ] },
  { lesson: 'emergency', cards: [
    { id: 'disarm', concept: 10, title: 'Crashed? Disarm', demo: 'disarm-drop',
      text: 'The moment you crash or lose control near anything, disarm. A drone that drops is safer than one with its props still spinning.' },
    { id: 'failsafe', concept: 10, title: 'Lost signal', demo: 'failsafe-drop',
      text: 'If the drone loses your radio signal, it stops its motors and drops. So never fly over people, roads or water you cannot wade into.' },
    { id: 'spotter', concept: 10, title: 'Goggles need a second person', demo: 'spotter',
      text: 'With goggles on you cannot see around you. In Switzerland and the EU a spotter must stand beside you and keep the drone in sight.' },
    { id: 'lost', concept: 6, title: 'Which way is it pointing?', demo: 'find-nose',
      text: 'If you lose track, nudge forward and watch which way it moves: that is where the nose is. Then turn it away from you.' },
  ], check: [
    { q: 'You clip a tree and the drone tumbles into the grass. First thing?', a: ['Throttle up to get out', 'Disarm', 'Switch to acro'], right: 1 },
    { q: 'What does a typical FPV drone do when it loses the radio signal?', a: ['Flies home by itself', 'Hovers and waits', 'Stops its motors and drops'], right: 2 },
  ] },
  { lesson: 'acro', cards: [
    { id: 'angle', concept: 5, title: 'Angle mode', demo: 'angle-release',
      text: 'In angle mode the stick sets how far the drone tilts. Let go and it levels itself.' },
    { id: 'acro', concept: 5, title: 'Acro mode', demo: 'acro-release',
      text: 'In acro the stick sets how fast the drone rotates. Let go and it stays at the angle it has reached.' },
    { id: 'rates', concept: 5, title: 'Small stick, slow turn', demo: 'rates-curve',
      text: 'Near the centre the stick is gentle; at the edge it is very fast. A full push flips the drone in about half a second.' },
    { id: 'acro-level', concept: 5, title: 'You level it', demo: 'acro-level',
      text: 'To stop a tilt in acro, push the stick the other way until the horizon is flat, then centre it. Every move has its counter-move.' },
  ], check: [
    { q: 'In acro you roll right a little and let go of the stick. The drone…', a: ['Levels itself', 'Stays tilted and slides right', 'Keeps rolling faster'], right: 1 },
    { q: 'What does the stick set in acro mode?', a: ['The tilt angle', 'How fast the drone rotates', 'The height'], right: 1 },
  ] },
  { lesson: 'ready', cards: [], check: [] },
];

export const chapterFor = (lessonId) => CHAPTERS.find((c) => c.lesson === lessonId) || null;
export const allCards = () => CHAPTERS.flatMap((c) => c.cards.map((card) => ({ ...card, lesson: c.lesson })));
// Sentences in a card (a colon does not end a sentence).
export const sentences = (text) => text.split(/[.?!](?:\s|$)/).filter((s) => s.trim()).length;
