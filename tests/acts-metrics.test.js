import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCompletionPercentage } from '../domain/actsMetrics.js';

test('completion percentage rounds 9 of 251 to 4 percent', () => {
  assert.equal(calculateCompletionPercentage(9, 251), 4);
});

test('completion percentage returns zero for empty denominator', () => {
  assert.equal(calculateCompletionPercentage(9, 0), 0);
  assert.equal(calculateCompletionPercentage(0, 0), 0);
});

test('completion percentage is finite and clamped to 0..100', () => {
  assert.equal(calculateCompletionPercentage(Number.NaN, 10), 0);
  assert.equal(calculateCompletionPercentage(500, 10), 100);
  assert.equal(calculateCompletionPercentage(-1, 10), 0);
});
