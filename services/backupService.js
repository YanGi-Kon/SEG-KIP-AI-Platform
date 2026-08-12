import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import cron from 'node-cron';
import TelegramBot from 'node-telegram-bot-api';
import { getAppConfig } from '../config/env.js';
import { query } from '../db/pool.js';
import { resolveEnvServiceAccount } from './googleCredentialService.js';
import { google } from 'googleapis';

const execAsync = promisify(exec);
const getConfig = () => getAppConfig();
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

let bot = null;
let activeCronJobs = [];

export const backupState = {
  db: { lastRun: null, status: 'idle', message: '' },
  sheets: { lastRun: null, status: 'idle', message: '' }
};

function getTashkentTime() {
  return new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }) + ' (UTC+5)';
}

export async function initBackupWorker() {
  if (!getConfig().features.backupWorkerEnabled) {
    console.log('[BackupWorker] Backup worker is disabled.');
    return;
  }

  if (!getConfig().telegram.botToken || !getConfig().telegram.backupChatId) {
    console.error('[BackupWorker] TELEGRAM_BOT_TOKEN and TELEGRAM_BACKUP_CHAT_ID must be set when BACKUP_WORKER_ENABLED is true.');
    return;
  }

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  bot = new TelegramBot(getConfig().telegram.botToken, { polling: false });
  console.log('[BackupWorker] Initialized Telegram Bot.');

  await reloadBackupSchedules();
}

export async function reloadBackupSchedules() {
  // Stop existing cron jobs
  activeCronJobs.forEach(job => job.stop());
  activeCronJobs = [];

  let schedule = { times: ["00:00", "12:00"] };
  try {
    const res = await query('SELECT setting_value FROM platform_settings WHERE setting_key = $1', ['backup_schedule']);
    if (res.rows.length > 0) {
      schedule = res.rows[0].setting_value;
    }
  } catch (err) {
    console.error('[BackupWorker] Failed to load backup_schedule from DB, using defaults.', err.message);
  }

  // Validate loaded schedule
  if (!schedule || !Array.isArray(schedule.times) || schedule.times.length === 0) {
     schedule = { times: ["00:00", "12:00"] };
  }

  const times = schedule.times;
  times.forEach(t => {
    const [hour, minute] = t.split(':');
    if (hour == null || minute == null) return;
    
    // Convert to standard cron syntax: "minute hour * * *"
    const cronStr = `${parseInt(minute)} ${parseInt(hour)} * * *`;
    
    // DB Backup Job
    const dbJob = cron.schedule(cronStr, async () => {
      console.log(`[BackupWorker] Starting scheduled database backup for ${t}...`);
      await performDatabaseBackup();
    });
    activeCronJobs.push(dbJob);

    // Sheets Backup Job
    const sheetsJob = cron.schedule(cronStr, async () => {
      console.log(`[BackupWorker] Starting scheduled Google Sheets backup for ${t}...`);
      await performGoogleSheetsBackup();
    });
    activeCronJobs.push(sheetsJob);
  });

  console.log(`[BackupWorker] Backup schedules registered for times: ${times.join(', ')}`);
}

export async function triggerManualBackup(type) {
  if (!getConfig().telegram.botToken || !getConfig().telegram.backupChatId) {
    throw new Error('Telegram Bot is not fully configured (check TELEGRAM_BOT_TOKEN and TELEGRAM_BACKUP_CHAT_ID).');
  }
  
  if (!bot) {
    bot = new TelegramBot(getConfig().telegram.botToken, { polling: false });
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  if (type === 'db') {
    return performDatabaseBackup();
  } else if (type === 'sheets') {
    return performGoogleSheetsBackup();
  } else {
    throw new Error('Invalid backup type. Use "db" or "sheets".');
  }
}

async function performDatabaseBackup() {
  if (!bot) return;

  backupState.db.status = 'running';
  backupState.db.message = 'Started DB backup...';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db_backup_${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    const dbUrl = getConfig().database.url;
    if (!dbUrl) throw new Error('DATABASE_URL is not configured.');

    // pg_dump often fails with channel_binding=require on Neon/older clients
    const dumpUrl = dbUrl.replace(/[\?&]channel_binding=require/g, '');

    // Execute pg_dump
    // Notice: pg_dump must be installed on the system where Node is running
    await execAsync(`pg_dump "${dumpUrl}" > "${filepath}"`);
    console.log(`[BackupWorker] DB dumped to ${filepath}`);

    // Send to Telegram
    await bot.sendDocument(getConfig().telegram.backupChatId, filepath, {
      caption: `🗄 Database Backup: ${filename}\n🕒 Время: ${getTashkentTime()}`,
    });
    console.log(`[BackupWorker] DB backup sent to Telegram.`);
    backupState.db.lastRun = new Date().toISOString();
    backupState.db.status = 'success';
    backupState.db.message = `Successfully sent ${filename}`;
  } catch (error) {
    console.error('[BackupWorker] Database backup failed:', error);
    backupState.db.lastRun = new Date().toISOString();
    backupState.db.status = 'error';
    backupState.db.message = error.message;
    try {
      await bot.sendMessage(getConfig().telegram.backupChatId, `❌ Database backup failed:\n${error.message}`);
    } catch (e) {
      console.error('[BackupWorker] Failed to send error message to Telegram:', e);
    }
  } finally {
    // Cleanup
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}

async function performGoogleSheetsBackup() {
  if (!bot) return;
  
  backupState.sheets.status = 'running';
  backupState.sheets.message = 'Starting Google Sheets backup...';
  
  try {
    const result = await query(`SELECT id, name, spreadsheet_url, service_account_base64 FROM workspaces WHERE status != 'archived'`);
    const workspaces = result.rows;

    if (workspaces.length === 0) {
      console.log('[BackupWorker] No active workspaces found.');
      backupState.sheets.lastRun = new Date().toISOString();
      backupState.sheets.status = 'success';
      backupState.sheets.message = 'No workspaces found to backup.';
      return;
    }

    let globalAuth = null;
    let globalAuthError = null;
    try {
      const { serviceAccount } = resolveEnvServiceAccount();
      if (serviceAccount) {
        globalAuth = new google.auth.JWT({
          email: serviceAccount.client_email,
          key: serviceAccount.private_key,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
      }
    } catch (e) {
      globalAuthError = e;
    }

    let successCount = 0;

    for (const workspace of workspaces) {
      if (!workspace.spreadsheet_url || workspace.spreadsheet_url.trim() === '') {
        const msg = `⚠️ Workspace "${workspace.name}": Google Sheet ulanmagan (ma'lumot yo'q).`;
        console.warn(`[BackupWorker] ${msg}`);
        await bot.sendMessage(getConfig().telegram.backupChatId, msg);
        continue;
      }

      const match = workspace.spreadsheet_url.match(/\/d\/(.*?)\//);
      if (!match || !match[1]) {
        const msg = `❌ Workspace "${workspace.name}": Google Sheet URL formati noto'g'ri.`;
        console.warn(`[BackupWorker] ${msg}`);
        await bot.sendMessage(getConfig().telegram.backupChatId, msg);
        continue;
      }

      let workspaceAuth = null;
      let workspaceAuthError = null;
      if (workspace.service_account_base64) {
        try {
          const serviceAccount = JSON.parse(Buffer.from(workspace.service_account_base64, 'base64').toString('utf8'));
          workspaceAuth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ['https://www.googleapis.com/auth/drive'],
          });
        } catch (e) {
          workspaceAuthError = new Error("Kiritilgan maxsus Service Account fayli xato yoki buzuq.");
        }
      }
      
      const authToUse = workspaceAuth || globalAuth;

      if (!authToUse) {
        let errMessage = 'Umumiy va maxsus Service Account topilmadi.';
        if (workspaceAuthError) errMessage = workspaceAuthError.message;
        else if (globalAuthError) errMessage = globalAuthError.message;
        
        const msg = `❌ Workspace "${workspace.name}": Google Service Account sozlanmagan (${errMessage}).`;
        await bot.sendMessage(getConfig().telegram.backupChatId, msg);
        continue;
      }

      const fileId = match[1];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = workspace.name.replace(/[^a-z0-9а-яё]/gi, '_');
      const filename = `sheet_${safeName}_${timestamp}.xlsx`;
      const filepath = path.join(BACKUP_DIR, filename);

      try {
        console.log(`[BackupWorker] Exporting sheet for ${workspace.name} (File ID: ${fileId})`);
        const drive = google.drive({ version: 'v3', auth: authToUse });
        
        const res = await drive.files.export(
          {
            fileId,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          { responseType: 'stream' }
        );

        const dest = fs.createWriteStream(filepath);
        await new Promise((resolve, reject) => {
          res.data
            .on('end', () => resolve())
            .on('error', err => reject(err))
            .pipe(dest);
        });

        console.log(`[BackupWorker] Saved ${filepath}`);

        await bot.sendDocument(getConfig().telegram.backupChatId, filepath, {
          caption: `📊 Google Sheet Backup: ${workspace.name}\n🕒 Время: ${getTashkentTime()}`,
        });
        console.log(`[BackupWorker] Sent ${filename} to Telegram.`);
        successCount++;
      } catch (error) {
        const msg = `❌ Workspace "${workspace.name}": Google Sheet yuklashda xatolik - ${error.message}`;
        console.error(`[BackupWorker] ${msg}`);
        await bot.sendMessage(getConfig().telegram.backupChatId, msg);
      } finally {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
    }

    backupState.sheets.lastRun = new Date().toISOString();
    backupState.sheets.status = 'success';
    backupState.sheets.message = `Backed up ${successCount}/${workspaces.length} sheets.`;
  } catch (error) {
    backupState.sheets.lastRun = new Date().toISOString();
    backupState.sheets.status = 'error';
    backupState.sheets.message = error.message;
    try {
      await bot.sendMessage(getConfig().telegram.backupChatId, `❌ Google Sheets backup failed:\n${error.message}`);
    } catch (e) {
      console.error('[BackupWorker] Failed to send error message to Telegram:', e);
    }
  }
}
