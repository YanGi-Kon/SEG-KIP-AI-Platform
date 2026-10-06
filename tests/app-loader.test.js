import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../public/js/app-loader.js',import.meta.url),'utf8');
const loginGate=fs.readFileSync(new URL('../public/js/saneg-login-gate.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('startup loader shows the supplied GIF above its status',()=>{
  assert.match(index,/id="segAppLoader"/);
  assert.match(index,/Sanegplatform yuklanmoqda\.\.\./);
  assert.match(index,/<img class="seg-loader-animation"[^>]+src="assets\/images\/saneg-loading\.gif"[^>]*>\s*<div id="segAppLoaderStatus"/);
  const animation=fs.readFileSync(new URL('../public/assets/images/saneg-loading.gif',import.meta.url));
  assert.match(animation.subarray(0,6).toString(),/^GIF8[79]a$/);
  assert.doesNotMatch(index,/seg-loader-dots/);
  assert.doesNotMatch(loader,/setInterval/);
  assert.doesNotMatch(loader,/canvas/);
  assert.doesNotMatch(loader,/pump/i);
});

test('loader disappears when auth boot destination becomes ready',()=>{
  assert.match(loader,/seg:auth-ready/);
  assert.match(loader,/seg:login-ready/);
  assert.match(loader,/classList\.add\('is-hidden'\)/);
  assert.match(loginGate,/dispatchEvent\(new CustomEvent\('seg:auth-ready'\)\)/);
});

test('auth boot guard keeps loader visible during startup',()=>{
  assert.match(server,/#segAppLoader/);
  assert.match(server,/#segAppLoader \*/);
});
