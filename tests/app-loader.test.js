import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../public/js/app-loader.js',import.meta.url),'utf8');
const loginGate=fs.readFileSync(new URL('../public/js/saneg-login-gate.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('startup page contains canvas pumpjack loader and source GIF',()=>{
  assert.match(index,/id="segAppLoader"/);
  assert.match(index,/id="segLoaderPumpSource"/);
  assert.match(index,/id="segLoaderPumpCanvas"/);
  assert.match(index,/pump_jack\.gif/);
  assert.match(index,/seg-pump-canvas/);
});

test('loader removes checkerboard in canvas while GIF keeps animating',()=>{
  assert.match(loader,/PUMP_SOURCE = '\/assets\/loader\/pump_jack\.gif'/);
  assert.match(loader,/getImageData/);
  assert.match(loader,/putImageData/);
  assert.match(loader,/neutral && lo>=218/);
  assert.match(loader,/setInterval\(chromaKeyFrame, FRAME_DELAY\)/);
});

test('loader has a visible-ready state only after successful canvas paint',()=>{
  assert.match(loader,/st\.classList\.add\('is-ready'\)/);
  assert.match(loader,/st\.classList\.remove\('is-error'\)/);
  assert.match(index,/seg-pump-stage\.is-ready \.seg-pump-canvas\{opacity:1\}/);
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
