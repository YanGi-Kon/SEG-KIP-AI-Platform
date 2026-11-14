import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isPathWithinRoot } from '../services/projectContextService.js';

test('project file paths stay inside the root and reject sibling-prefix traversal', () => {
  const root = path.resolve('C:/workspace/SEG-KIP-AI-Platform');
  assert.equal(isPathWithinRoot(root, path.join(root, 'public', 'index.html')), true);
  assert.equal(isPathWithinRoot(root, path.resolve(root, '..', 'SEG-KIP-AI-Platform-private', 'secret.js')), false);
  assert.equal(isPathWithinRoot(root, path.resolve(root, '..', 'other-project', 'secret.js')), false);
});
