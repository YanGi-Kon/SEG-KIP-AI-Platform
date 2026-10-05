import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/js/app-loader.js', import.meta.url), 'utf8');
const loginGate = fs.readFileSync(new URL('../public/js/saneg-login-gate.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('startup page contains animated pumpjack loader', () => {
  assert.match(index, /id="segAppLoader"/);
  assert.match(index, /class="seg-loader-pump"/);
  assert.match(index, /segPumpBeam/);
  assert.match(index, /segPumpCrank/);
  assert.match(index, /segPumpRod/);
  assert.match(index, /app-loader\.js\?v=pumpjack-loader1/);
});

test('loader disappears when auth boot destination becomes ready', () => {
  assert.match(loader, /seg:auth-ready/);
  assert.match(loader, /seg:login-ready/);
  assert.match(loader, /classList\.add\('is-hidden'\)/);
  assert.match(loginGate, /dispatchEvent\(new CustomEvent\('seg:auth-ready'\)\)/);
});

test('auth boot guard keeps only login or loader visible during startup', () => {
  assert.match(server, /:not\(#segAppLoader\)/);
  assert.match(server, /#segAppLoader \*/);
});
