import pg from 'pg';
import { getAppConfig } from '../config/env.js';

const { Pool } = pg;
let pool;

export function isDatabaseConfigured(env = process.env) {
  return Boolean(String(env.DATABASE_URL || '').trim());
}

export function getPool() {
  if (pool) return pool;

  const config = getAppConfig();
  if (!config.database.url) {
    throw new Error('DATABASE_URL is not configured');
  }

  pool = new Pool({
    connectionString: config.database.url,
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeoutMs,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    statement_timeout: config.database.statementTimeoutMs,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
    application_name: 'seg-kip-ai-platform',
  });

  pool.on('error', (error) => {
    console.error('[database] unexpected pool error:', error.message);
  });

  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase() {
  if (!isDatabaseConfigured()) {
    return { configured: false, connected: false, latencyMs: null };
  }

  const startedAt = Date.now();
  try {
    const result = await query('SELECT current_database() AS database, NOW() AS server_time');
    return {
      configured: true,
      connected: true,
      latencyMs: Date.now() - startedAt,
      database: result.rows[0]?.database || '',
      serverTime: result.rows[0]?.server_time || null,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      latencyMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}
