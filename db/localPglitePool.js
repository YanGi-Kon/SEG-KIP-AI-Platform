import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

function createMutex() {
  let tail = Promise.resolve();
  return async function acquire() {
    const previous = tail;
    let unlock;
    tail = new Promise((resolve) => { unlock = resolve; });
    await previous;
    return unlock;
  };
}

export async function createLocalPglitePool() {
  const dataDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(process.cwd(), 'data', 'local-dev-pglite'));
  await fs.mkdir(dataDir, { recursive: true });
  const db = await PGlite.create({ dataDir, extensions: { citext, pgcrypto } });
  await db.exec('SET search_path TO public');

  const acquire = createMutex();
  let ended = false;

  async function runQuery(text, values = []) {
    if (ended) throw new Error('Local PGlite database is closed');
    const sql = String(text || '');
    if (Array.isArray(values) && values.length) return db.query(sql, values);
    const results = await db.exec(sql);
    return results.at(-1) || { rows: [], rowCount: 0, fields: [] };
  }

  return {
    isLocalPGlite: true,
    async query(text, values = []) {
      const unlock = await acquire();
      try { return await runQuery(text, values); }
      finally { unlock(); }
    },
    async connect() {
      const unlock = await acquire();
      let released = false;
      if (ended) {
        unlock();
        throw new Error('Local PGlite database is closed');
      }
      return {
        query: runQuery,
        release() {
          if (released) return;
          released = true;
          unlock();
        },
      };
    },
    on() { return this; },
    async end() {
      const unlock = await acquire();
      try {
        if (!ended) {
          ended = true;
          await db.close();
        }
      } finally { unlock(); }
    },
  };
}
