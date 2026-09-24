import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeBackupScheduleTimes } from '../services/backupService.js';

const service = fs.readFileSync(new URL('../services/backupService.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/backup.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../public/modules/settings.html', import.meta.url), 'utf8');

test('backup schedule normalizer deduplicates, validates and sorts times', () => {
  assert.deepEqual(
    normalizeBackupScheduleTimes(['20:00', '08:00', '14:00', '08:00', '25:00', '', null]),
    ['08:00', '14:00', '20:00'],
  );
  assert.deepEqual(normalizeBackupScheduleTimes([]), []);
});

test('scheduled backups use configured application timezone', () => {
  assert.match(service, /getConfig\(\)\.timeZone/);
  assert.match(service, /const cronOptions = \{ timezone: timeZone \}/);
  assert.match(service, /cron\.schedule\(cronStr,[\s\S]*cronOptions\)/);
  assert.match(service, /Starting scheduled database backup for \$\{t\} \(\$\{timeZone\}\)/);
  assert.match(service, /Starting scheduled Google Sheets backup for \$\{t\} \(\$\{timeZone\}\)/);
});

test('explicit schedule save initializes Telegram runtime even when startup worker was not initialized', () => {
  assert.match(service, /function ensureBackupRuntime\(\)/);
  assert.match(service, /if \(!bot\) \{[\s\S]*new TelegramBot/);
  assert.match(route, /reloadBackupSchedules\(\{ ensureRuntime: true \}\)/);
  assert.match(route, /runtime: getBackupSchedulerStatus\(\)/);
});

test('empty backup schedule remains empty and does not restore hidden defaults', () => {
  assert.match(service, /Empty array is intentional: it means all automatic backup times are disabled/);
  assert.match(service, /schedule && Array\.isArray\(schedule\.times\)[\s\S]*normalizeBackupScheduleTimes\(schedule\.times\)/);
  assert.match(service, /times\.length \? times\.join\(', '\) : '\(none\)'/);
});

test('scheduler runtime is visible in settings UI', () => {
  assert.match(route, /res\.json\(\{ times, runtime: getBackupSchedulerStatus\(\) \}\)/);
  assert.match(settings, /backupRuntimeLabel/);
  assert.match(settings, /Vaqt zonasi:/);
  assert.match(settings, /Worker: \$\{active \? 'FAOL' : 'FAOL EMAS'\}/);
});
