import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/js/app-loader.js', import.meta.url), 'utf8');
const loginGate = fs.readFileSync(new URL('../public/js/saneg-login-gate.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('startup page contains visible pumpjack loader frame', () => {
  assert.match(index, /id="segAppLoader"/);
  assert.match(index, /id="segLoaderPumpImg"/);
  assert.match(index, /pumpjack-frame-1\.webp/);
  assert.match(index, /opacity:1/);
});

test('pumpjack loader uses direct WebP frame files and animates them', () => {
  assert.match(loader, /pumpjack-frame-1\.webp/);
  assert.match(loader, /pumpjack-frame-2\.webp/);
  assert.match(loader, /pumpjack-frame-3\.webp/);
  assert.match(loader, /FRAME_ORDER = \[0,1,2,1\]/);
  assert.match(loader, /setInterval/);
  assert.doesNotMatch(loader, /fetch\(/);
  assert.doesNotMatch(loader, /data:image\/webp;base64/);
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
