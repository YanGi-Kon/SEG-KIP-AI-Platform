import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const quote = value => `"${String(value).replaceAll('"', '""')}"`;

// A single snapshot and a cursor keep the export consistent and memory bounded.
export async function writeDatabaseBackup(pool, filepath) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    const { rows: identity } = await client.query('SELECT current_database() AS name');
    async function* chunks() {
      yield `{"createdAt":${JSON.stringify(new Date().toISOString())},"database":${JSON.stringify(identity[0].name)},"meta":{"totalTables":${tables.length},"exportedBy":"telegram-bot"},"tables":{`;
      for (let index = 0; index < tables.length; index++) {
        const table = tables[index].tablename;
        await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT * FROM public.${quote(table)}`);
        let batch = await client.query('FETCH FORWARD 50 FROM backup_rows');
        yield `${index ? ',' : ''}${JSON.stringify(table)}:{"columns":${JSON.stringify(batch.fields.map(field => field.name))},"rows":[`;
        let count = 0;
        while (batch.rows.length) {
          for (const row of batch.rows) {
            yield `${count++ ? ',' : ''}${JSON.stringify(row)}`;
          }
          batch = await client.query('FETCH FORWARD 50 FROM backup_rows');
        }
        await client.query('CLOSE backup_rows');
        yield `],"rowCount":${count}}`;
      }
      yield '}}';
    }
    await pipeline(chunks(), createWriteStream(filepath, { flags: 'wx', mode: 0o600 }));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
