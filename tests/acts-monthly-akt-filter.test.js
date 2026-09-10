import test from 'node:test';
import assert from 'node:assert/strict';
import { isTargetWork } from '../routes/acts.js';

test('monthly Acts analysis accepts only exact AKT and АКТ markers', () => {
  assert.equal(isTargetWork('AKT'), true);
  assert.equal(isTargetWork('АКТ'), true);
  assert.equal(isTargetWork(' AKT '), true);

  for (const value of ['TO-2', 'ТО-2', 'TO2', 'ТО2', 'akt', 'акт', 'AKT №1', 'АКТ ТО', '']) {
    assert.equal(isTargetWork(value), false, `${value || '(empty)'} must not pass the AKT filter`);
  }
});
