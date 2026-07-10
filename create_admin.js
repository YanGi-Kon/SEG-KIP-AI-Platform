import dotenv from 'dotenv';
dotenv.config();

import { runMigrations } from './db/migrate.js';
import { hashPassword } from './services/passwordService.js';
import { withTransaction, closePool } from './db/pool.js';

async function main() {
  console.log("Running migrations...");
  await runMigrations();
  console.log("Migrations applied.");

  console.log("Creating admin user...");
  const email = "admin@saneg.uz";
  const password = "AdminPassword123!";
  
  await withTransaction(async (client) => {
    const passwordHash = await hashPassword(password);
    
    // Check if user exists
    const res = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (res.rows.length === 0) {
      await client.query(`
        INSERT INTO users (full_name, email, password_hash, platform_role)
        VALUES ('System Admin', $1, $2, 'super_admin')
      `, [email, passwordHash]);
      console.log(`Admin user created. Login: ${email} | Password: ${password}`);
    } else {
      console.log("Admin user already exists. Updating password...");
      await client.query(`
        UPDATE users SET password_hash = $2 WHERE email = $1
      `, [email, passwordHash]);
      console.log(`Admin password updated. Login: ${email} | Password: ${password}`);
    }
  });

  await closePool();
}

main().catch(console.error);
