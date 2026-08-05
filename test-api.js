import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const token = jwt.sign(
  {
    tokenType: 'access',
    platformRole: 'admin',
    permissions: ['*'],
    email: 'admin@saneg.uz',
    name: 'System Admin',
  },
  process.env.ACCESS_TOKEN_SECRET || 'fallback-secret', // WAIT! I need to know the correct secret
  {
    subject: 'ed559eeb-e933-4917-b233-ad7d733f6be8',
    expiresIn: '15m',
    jwtid: crypto.randomUUID(),
  }
);
console.log('Generated token:', token);
fetch('http://localhost:3000/api/users/directory', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json()).then(console.log).catch(console.error);
