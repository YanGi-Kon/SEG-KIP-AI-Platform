import { Router } from 'express';
import { requireAccessToken as requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { backupState, triggerManualBackup } from '../services/backupService.js';

const router = Router();

// Only admins can create backups
function requireAdmin(req, res, next) {
  const role = req.auth?.platformRole;
  if (role === 'super_admin' || role === 'admin') return next();
  return res.status(403).json({ error: 'Только администратор может создавать резервные копии' });
}

function requireSuperAdmin(req, res, next) {
  const role = req.auth?.platformRole;
  if (role === 'super_admin') return next();
  return res.status(403).json({ error: 'Только главный администратор имеет доступ к этой функции' });
}

// GET /api/backup  — download full DB backup as JSON
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // Fetch all user tables from the public schema
    const tablesResult = await query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(r => r.tablename);
    const backup = {
      createdAt: new Date().toISOString(),
      database: 'neondb',
      tables: {},
      meta: { totalTables: tables.length, exportedBy: req.auth?.email || 'admin' },
    };

    for (const table of tables) {
      try {
        const result = await query(`SELECT * FROM "${table}"`);
        backup.tables[table] = {
          rowCount: result.rowCount,
          columns: result.fields.map(f => f.name),
          rows: result.rows,
        };
      } catch (err) {
        backup.tables[table] = { error: err.message };
      }
    }

    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const json = JSON.stringify(backup, null, 2);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(json));
    res.send(json);
  } catch (err) {
    console.error('[backup] error:', err.message);
    res.status(500).json({ error: 'Ошибка при создании резервной копии: ' + err.message });
  }
});

// GET /api/backup/telegram/status
router.get('/telegram/status', requireAuth, requireSuperAdmin, (req, res) => {
  res.json({
    db: backupState.db,
    sheets: backupState.sheets,
  });
});

// POST /api/backup/telegram/trigger
router.post('/telegram/trigger', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { type } = req.body;
    if (type !== 'db' && type !== 'sheets') {
      return res.status(400).json({ error: 'Invalid backup type' });
    }
    
    // Validate configuration
    const { getAppConfig } = await import('../config/env.js');
    const config = getAppConfig();
    if (!config.telegram.botToken || !config.telegram.backupChatId) {
      return res.status(400).json({ error: 'Telegram Bot is not fully configured (check TELEGRAM_BOT_TOKEN and TELEGRAM_BACKUP_CHAT_ID in .env).' });
    }

    // Trigger in background
    triggerManualBackup(type)
      .then(() => console.log('[BackupWorker] Manual trigger completed successfully.'))
      .catch(err => console.error('[BackupWorker] Manual trigger failed:', err));
    
    // We send 'running' because it's running in background
    res.json({ message: 'Backup ishga tushirildi (orqa fonda)', status: 'running' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backup/schedule
router.get('/schedule', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await query('SELECT setting_value FROM platform_settings WHERE setting_key = $1', ['backup_schedule']);
    let schedule = { times: ["00:00", "12:00"] };
    if (result.rows.length > 0) {
      schedule = result.rows[0].setting_value;
    }
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/backup/schedule
router.post('/schedule', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { times } = req.body;
    if (!Array.isArray(times)) {
      return res.status(400).json({ error: 'times must be an array' });
    }
    
    // Ensure all times are valid HH:mm strings
    const validTimes = times.filter(t => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t));
    const schedule = { times: validTimes };

    await query(
      'INSERT INTO platform_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
      ['backup_schedule', JSON.stringify(schedule)]
    );

    // Dynamic import to avoid circular dependencies if any, though we can just import it at the top.
    const { reloadBackupSchedules } = await import('../services/backupService.js');
    await reloadBackupSchedules();

    res.json({ message: 'Backup schedule updated successfully', schedule });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
