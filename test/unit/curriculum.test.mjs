// M10e: the curriculum levels (src/curriculum.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, allLevelCards, levelOfLesson } from '../../src/curriculum.js';
import { DEMOS } from '../../src/demos.js';
import { sentences } from '../../src/theory.js';
import { LESSONS } from '../../src/lessons.js';

test('curriculum: 4 levels; basics, combinations, physics, acro; every lesson in exactly one level, in lesson order', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['basics', 'combos', 'physics', 'acro']);
  assert.deepEqual(LEVELS.flatMap((l) => l.lessons), LESSONS.map((l) => l.id));
  for (const l of LESSONS) assert.ok(levelOfLesson(l.id), l.id);
});
test('curriculum: every card has a demo, a stick pattern, a motors line, and at most 2 sentences of text', () => {
  for (const c of allLevelCards()) {
    assert.ok(DEMOS[c.demo], `${c.id}: no demo ${c.demo}`);
    assert.ok(c.sticks || c.level === 'acro', `${c.id}: no sticks`);
    assert.ok(c.why && sentences(c.why) <= 2, `${c.id}: why missing or longer than 2 sentences`);
    assert.ok(sentences(c.text) <= 2, `${c.id}: more than 2 sentences`);
  }
  const ids = allLevelCards().map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'card ids unique');
});
test('curriculum: Level 1 covers each basic move once (hover, up, down, turn, forward, backward, sideways, stop)', () => {
  const t = LEVELS[0].cards.map((c) => c.title);
  assert.deepEqual(t, ['Hover', 'Up', 'Down', 'Turn left and right', 'Fly forward', 'Backward', 'Sideways', 'Stop']);
});
