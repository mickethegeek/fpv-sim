// The theory cards keep to PLAN.md's rules: short, one per idea, all ten concepts covered, a chapter per lesson.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, MAX_CARDS, allCards, chapterFor, sentences } from '../../src/theory.js';
import { LESSONS } from '../../src/lessons.js';

test('theory: one chapter per lesson, in the same order, at most 4 cards each', () => {
  assert.deepEqual(CHAPTERS.map((c) => c.lesson), LESSONS.map((l) => l.id));
  for (const c of CHAPTERS) assert.ok(c.cards.length <= MAX_CARDS, `${c.lesson}: ${c.cards.length} cards`);
  assert.equal(chapterFor('wind').cards.length, 2); assert.equal(chapterFor('nope'), null);
});

test('theory: every card is one idea in at most 2 short sentences, with a demo', () => {
  const ids = new Set();
  for (const card of allCards()) {
    assert.ok(!ids.has(card.id), `duplicate card id ${card.id}`); ids.add(card.id);
    assert.ok(sentences(card.text) <= 2, `${card.id}: ${sentences(card.text)} sentences`);
    assert.ok(card.text.length <= 170, `${card.id}: ${card.text.length} characters`);
    assert.ok(card.title && card.demo, `${card.id}: title and demo`);
  }
  assert.equal(sentences('One. Two: still two.'), 2);
});

test('theory: the ten concepts of the plan are all covered', () => {
  const covered = new Set(allCards().map((c) => c.concept));
  for (let n = 1; n <= 10; n++) assert.ok(covered.has(n), `concept ${n} has no card`);
});

test('theory: checks are 2 or 3 quick questions with one right answer (the Ready check has none)', () => {
  for (const c of CHAPTERS) {
    assert.ok(c.check.length <= 3, c.lesson);
    for (const q of c.check) assert.ok(q.a.length === 3 && q.right >= 0 && q.right < 3 && q.q.length < 130, q.q);
  }
});
