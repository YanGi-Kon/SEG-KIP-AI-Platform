import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/js/app-loader.js', import.meta.url), 'utf8');
const loginGate = fs.readFileSync(new URL('../public/js/saneg-login-gate.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('startup page contains true frame-by-frame pumpjack loader', () => {
  assert.match(index, /id="segAppLoader"/);
  assert.match(index, /id="segLoaderPumpImg"/);
  assert.match(index, /class="seg-pump-frame"/);
  assert.match(index, /app-loader\.js\?v=pumpjack-loader5-real-frames/);
});

test('pumpjack loader uses three generated transparent WebP frames', () => {
  assert.match(loader, /pumpjack-frame-1\.b64/);
  assert.match(loader, /pumpjack-frame-2\.b64/);
  assert.match(loader, /pumpjack-frame-3\.b64/);
  assert.match(loader, /FRAME_SEQUENCE = \[0, 1, 2, 1\]/);
  assert.match(loader, /data:image\/webp;base64/);
  assert.match(loader, /segLoaderPumpImg/);
});

test('loader disappears when auth boot destination becomes ready', () => {
  assert.match(loader, /seg:auth-ready/);
  assert.match(loader, /seg:login-ready/);
  assert.match(loader, /classList\.add\('is-hidden'\)/);
  assert.match(loginGate, /dispatchEvent\(new CustomEvent\('seg:auth-ready'\)\)/);
});

test('auth boot guard keeps loader visible during startup', () => {
  assert.match(server, /#segAppLoader/);
  assert.match(server, /#segAppLoader \*/);
});
