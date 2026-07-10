import { Router } from 'express';
import { requireAccessToken as requireAuth } from '../middleware/auth.js';
import * as roleRepository from '../repositories/roleRepository.js';

const router = Router();

// Middleware to ensure user is Super Admin or has specific permission to manage roles
export function requireRoleManager(req, res, next) {
  const permissions = req.auth?.permissions || [];
  if (permissions.includes('*') || permissions.includes('roles:manage')) {
    return next();
  }
  return res.status(403).json({ error: 'Permission denied: roles:manage' });
}

router.use(requireAuth, requireRoleManager);

router.get('/', async (req, res, next) => {
  try {
    const roles = await roleRepository.findRoles();
    res.json({ roles });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, permissions } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Role name must be at least 2 characters long' });
    }
    const permsArray = Array.isArray(permissions) ? permissions : [];
    const role = await roleRepository.createRole(name.trim(), permsArray);
    res.json({ role });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Role with this name already exists' });
    }
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, permissions } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Role name must be at least 2 characters long' });
    }
    const permsArray = Array.isArray(permissions) ? permissions : [];
    const role = await roleRepository.updateRole(id, name.trim(), permsArray);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json({ role });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Role with this name already exists' });
    }
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    // Don't allow deleting the built-in Super Admin role or User role
    if (id === '00000000-0000-0000-0000-000000000001' || id === '00000000-0000-0000-0000-000000000002') {
      return res.status(400).json({ error: 'Cannot delete built-in roles' });
    }
    await roleRepository.deleteRole(id);
    res.json({ success: true });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete role because it is assigned to users' });
    }
    next(error);
  }
});

export default router;
