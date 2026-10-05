import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/js/app-loader.js', import.meta.url), 'utf8');
const loginGate = fs.readFileSync(new URL('../public/js/saneg-login-gate.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('startup page contains pumpjack loader', () => {
  assert.match(index, /id="segAppLoader"/);
  assert.match(index, /id="segLoaderPumpImg"/);
  assert.match(index, /class="seg-pump-frame"/);
});

test('pumpjack loader reconstructs the complete animated asset from four chunks', () => {
  assert.match(loader, /pump280-0\.txt/);
  assert.match(loader, /pump280-1\.txt/);
  assert.match(loader, /pump280-2\.txt/);
  assert.match(loader, /pump280-3\.txt/);
  assert.match(loader, /parts\.join\(''\)/);
  assert.match(loader, /data:image\/webp;base64/);
  assert.doesNotMatch(loader, /pump_jack_280\.b64/);
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
