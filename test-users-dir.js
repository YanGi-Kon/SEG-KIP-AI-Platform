import fetch from 'node-fetch';
import { query } from './db/pool.js';
import jwt from 'jsonwebtoken';

async function run() {
  try {
    const res = await query('SELECT id FROM users LIMIT 1');
    const user = res.rows[0];
    const payload = { sub: user.id, jti: 'test' };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '1h' });
    console.log("Generated token");
    const apiRes = await fetch('http://localhost:3000/api/users/directory', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(apiRes.status);
    const data = await apiRes.text();
    console.log(data);
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
run();
