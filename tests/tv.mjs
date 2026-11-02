import assert from 'node:assert/strict';
import { nearestDirectional } from '../js/ui/tv.js';
const rect = (x, y) => ({ left: x, right: x + 40, top: y, bottom: y + 40 });
const current = rect(100, 100);
const choices = [
  { element: 'above', rect: rect(100, 30) },
  { element: 'right', rect: rect(180, 100) },
  { element: 'diagonal', rect: rect(150, 220) },
  { element: 'below', rect: rect(100, 200) },
];
assert.equal(nearestDirectional(current, choices, 'ArrowRight'), 'right');
assert.equal(nearestDirectional(current, choices, 'ArrowDown'), 'below');
assert.equal(nearestDirectional(current, choices, 'ArrowUp'), 'above');
assert.equal(nearestDirectional(current, choices, 'ArrowLeft'), null);
assert.equal(nearestDirectional(current, choices, 'Escape'), null);
console.log('TV navigation checks passed');
