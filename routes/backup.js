import { Router } from 'express';
import { requireAccessToken as requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

// Only admins can create backups
function requireAdmin(req, res, next) {
  const role = req.auth?.platformRole;
  if (role === 'super_admin' || role === 'admin') return next();
  return res.status(403).json({ error: 'Только администратор может создавать резервные копии' });
}

// GET /api/backup  — download full DB backup as JSON
router.get('/', requireAuth, requireAdmin, async (req, res) => {
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

export default router;
