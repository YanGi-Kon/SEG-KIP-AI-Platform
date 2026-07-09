import { Router } from 'express';
import { requireAccessToken as requireAuth } from '../middleware/auth.js';
import * as userRepository from '../repositories/userRepository.js';
import { hashPassword } from '../services/passwordService.js';
import { query } from '../db/pool.js';

const router = Router();

function requireUserManager(req, res, next) {
  const permissions = req.auth?.permissions || [];
  if (permissions.includes('*') || permissions.includes('users:manage')) {
    return next();
  }
  return res.status(403).json({ error: 'Permission denied: users:manage' });
}

router.use(requireAuth, requireUserManager);

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.full_name as "fullName", u.email, r.name as "platformRole", r.id as "systemRoleId", u.status, u.created_at as "createdAt"
      FROM users u
      JOIN system_roles r ON u.system_role_id = r.id
      ORDER BY u.created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { fullName, email, password, systemRoleId } = req.body;
    if (!email || !password || !fullName || !systemRoleId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const passwordHash = await hashPassword(password);
    const user = await userRepository.createUser({
      fullName,
      email,
      passwordHash,
      systemRoleId,
      status: 'active'
    });
    res.json({ user: userRepository.publicUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, systemRoleId, status, password } = req.body;
    
    let queryText = 'UPDATE users SET full_name = $2, system_role_id = $3, status = $4';
    let params = [id, fullName, systemRoleId, status];
    
    if (password) {
      const passwordHash = await hashPassword(password);
      queryText += ', password_hash = $5';
      params.push(passwordHash);
    }
    
    queryText += ' WHERE id = $1 RETURNING id';
    
    const result = await query(queryText, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
