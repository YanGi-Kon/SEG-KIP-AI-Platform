import { Router } from 'express';
import { requireAccessToken as requireAuth } from '../middleware/auth.js';
import * as userRepository from '../repositories/userRepository.js';
import { hashPassword } from '../services/passwordService.js';
import { query } from '../db/pool.js';

const router = Router();
const VALID_USER_STATUSES = new Set(['active', 'suspended']);

function requireUserManager(req, res, next) {
  const role = req.auth?.platformRole;
  if (role === 'super_admin' || role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Permission denied: platform admins only' });
}

function createValidationError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeRequiredText(value, fieldLabel, code) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw createValidationError(`${fieldLabel} is required`, code);
  }
  return normalized;
}

function normalizeStatus(value, { fallback = 'active', required = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createValidationError('Status is required', 'STATUS_REQUIRED');
    }
    return fallback;
  }
  if (!VALID_USER_STATUSES.has(normalized)) {
    throw createValidationError('Invalid status', 'INVALID_STATUS');
  }
  return normalized;
}



function logUserMutationContext(label, req, payload = {}) {
  console.info(`[users] ${label}`, {
    requestUserId: req.auth?.userId || null,
    requestPlatformRole: req.auth?.platformRole || null,
    bodyKeys: Object.keys(req.body || {}),
    fullName: payload.fullName || null,
    email: payload.email || null,
    platformRole: payload.platformRole || null,
    status: payload.status || null,
    hasPassword: Boolean(payload.password),
  });
}

function handleUserMutationError(res, next, error, context) {
  if (error?.code === '23505') {
    return res.status(409).json({ error: 'Email already exists', code: 'EMAIL_ALREADY_EXISTS' });
  }
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code || 'VALIDATION_ERROR' });
  }

  console.error(`[users] ${context}`, {
    message: error?.message,
    code: error?.code,
    detail: error?.detail,
    constraint: error?.constraint,
    table: error?.table,
    column: error?.column,
    stack: error?.stack,
  });
  return next(error);
}

router.get('/directory', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, full_name as "fullName", email
      FROM users
      WHERE status = 'active'
      ORDER BY full_name ASC
    `);
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth, requireUserManager);

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, full_name as "fullName", email, platform_role as "platformRole", status, created_at as "createdAt"
      FROM users
      ORDER BY created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = {
      fullName: normalizeRequiredText(req.body?.fullName, 'Full name', 'FULL_NAME_REQUIRED'),
      email: normalizeRequiredText(req.body?.email, 'Email', 'EMAIL_REQUIRED').toLowerCase(),
      password: normalizeRequiredText(req.body?.password, 'Password', 'PASSWORD_REQUIRED'),
      platformRole: normalizeRequiredText(req.body?.platformRole, 'platformRole', 'PLATFORM_ROLE_REQUIRED'),
      status: normalizeStatus(req.body?.status, { fallback: 'active' }),
    };

    logUserMutationContext('create request', req, payload);

    let passwordHash;
    try {
      passwordHash = await hashPassword(payload.password);
    } catch (error) {
      return res.status(400).json({
        error: error.message || 'Invalid password',
        code: error.code || 'WEAK_PASSWORD',
      });
    }

    const createdUser = await userRepository.createUser({
      fullName: payload.fullName,
      email: payload.email,
      passwordHash,
      platformRole: payload.platformRole,
      status: payload.status,
    });
    const hydratedUser = await userRepository.findUserById(createdUser.id);
    res.status(201).json({ user: userRepository.publicUser(hydratedUser || createdUser) });
  } catch (error) {
    return handleUserMutationError(res, next, error, 'create failed');
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = {
      fullName: normalizeRequiredText(req.body?.fullName, 'Full name', 'FULL_NAME_REQUIRED'),
      platformRole: normalizeRequiredText(req.body?.platformRole, 'platformRole', 'PLATFORM_ROLE_REQUIRED'),
      status: normalizeStatus(req.body?.status, { required: true }),
      password: String(req.body?.password || ''),
    };

    logUserMutationContext(`update request:${id}`, req, payload);

    let queryText = 'UPDATE users SET full_name = $2, platform_role = $3, status = $4';
    let params = [id, payload.fullName, payload.platformRole, payload.status];

    if (payload.password) {
      try {
        const passwordHash = await hashPassword(payload.password);
        queryText += ', password_hash = $5';
        params.push(passwordHash);
      } catch (error) {
        return res.status(400).json({
          error: error.message || 'Invalid password',
          code: error.code || 'WEAK_PASSWORD',
        });
      }
    }

    queryText += ' WHERE id = $1 RETURNING id';

    const result = await query(queryText, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    res.json({ success: true });
  } catch (error) {
    return handleUserMutationError(res, next, error, 'update failed');
  }
});

export default router;
