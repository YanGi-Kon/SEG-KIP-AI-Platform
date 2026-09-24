import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync(new URL('../public/modules/settings.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const backupRoute = fs.readFileSync(new URL('../routes/backup.js', import.meta.url), 'utf8');

test('Telegram backup timer shows server-installed times and explicit status', () => {
  assert.match(settings, /id="backupScheduleList"/);
  assert.match(settings, /O‘rnatilgan vaqtlar/);
  assert.match(settings, /id="backupScheduleStatus"/);
  assert.match(settings, /fetch\('\/api\/backup\/schedule'/);
  assert.match(settings, /backupTimes = normalizeBackupTimes\(data\.times\)/);
  assert.match(settings, /backupTimes\.length.*ta vaqt o‘rnatilgan/s);
});

test('Telegram backup timer allows adding unique HH:MM times', () => {
  assert.match(settings, /id="newBackupTime"/);
  assert.match(settings, /id="addBackupTimeBtn"/);
  assert.match(settings, /async function addBackupTime\(\)/);
  assert.match(settings, /Bu vaqt allaqachon o‘rnatilgan/);
  assert.match(settings, /saveBackupSchedule\(\[\.\.\.backupTimes, time\]\)/);
});

test('Telegram backup timer removes by time value, not rendered index', () => {
  assert.match(settings, /removeBtn\.addEventListener\('click', \(\) => void removeBackupTime\(time\)\)/);
  assert.match(settings, /async function removeBackupTime\(time\)/);
  assert.match(settings, /backupTimes\.filter\(t => t !== normalized\)/);
  assert.match(settings, /backup vaqtini o‘chirasizmi/);
});

test('Schedule save uses protected backend and server-returned canonical schedule', () => {
  assert.match(settings, /method: 'POST'/);
  assert.match(settings, /body: JSON\.stringify\(\{ times: requestedTimes \}\)/);
  assert.match(settings, /data\.schedule\?\.times \|\| requestedTimes/);
  assert.match(backupRoute, /router\.get\('\/schedule', requireAuth, requireSuperAdmin/);
  assert.match(backupRoute, /router\.post\('\/schedule', requireAuth, requireSuperAdmin/);
  assert.match(backupRoute, /reloadBackupSchedules/);
});

test('Super admin profile load fetches backup status and schedule together', () => {
  assert.match(settings, /await Promise\.all\(\[\s*fetchTelegramBackupStatus\(\),\s*fetchBackupSchedule\(\)\s*\]\)/);
});

test('Settings module cache is refreshed', () => {
  assert.match(app, /settings: 'modules\/settings\.html\?v=20260924-backup-schedule3-runtime'/);
});
