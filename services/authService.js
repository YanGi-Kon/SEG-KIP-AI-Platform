import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getAppConfig } from '../config/env.js';
import { withTransaction } from '../db/pool.js';
import { hashPassword, verifyPassword } from './passwordService.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  publicUser,
} from '../repositories/userRepository.js';
import {
  createRefreshSession,
  findRefreshSessionByHash,
  revokeRefreshFamily,
  revokeRefreshSession,
  rotateRefreshSession,
} from '../repositories/sessionRepository.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function authError(message, code = 'AUTHENTICATION_FAILED', statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function isPasswordValidationError(error) {
  return String(error?.message || '').startsWith('Password must ');
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw authError('Invalid email address', 'INVALID_EMAIL', 400);
  }
  return email;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function signAccessToken(user) {
  const config = getAppConfig();
  return jwt.sign(
    {
      tokenType: 'access',
      platformRole: user.platformRole,
      email: user.email,
      name: user.fullName,
    },
    config.secrets.accessToken,
    {
      subject: user.id,
      issuer: 'SEG-KIP-AI',
      audience: 'workspace-api',
      expiresIn: ACCESS_TOKEN_TTL,
      jwtid: crypto.randomUUID(),
    },
  );
}

export function verifyAccessToken(token) {
  const config = getAppConfig();
  const payload = jwt.verify(String(token || ''), config.secrets.accessToken, {
    issuer: 'SEG-KIP-AI',
    audience: 'workspace-api',
  });
  if (payload.tokenType !== 'access' || !payload.sub) {
    throw authError('Invalid access token', 'INVALID_ACCESS_TOKEN');
  }
  return payload;
}

async function issueSession(user, context = {}, options = {}) {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const familyId = options.familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await createRefreshSession({
    userId: user.id,
    tokenHash,
    familyId,
    userAgent: context.userAgent || null,
    ipAddress: context.ipAddress || null,
    expiresAt,
  }, options.client);

  return {
    accessToken: signAccessToken(user),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
    user: publicUser(user),
  };
}

export async function registerUser(input, context = {}) {
  const fullName = String(input.fullName || '').trim();
  if (fullName.length < 2 || fullName.length > 200) {
    throw authError('Full name must contain 2-200 characters', 'INVALID_FULL_NAME', 400);
  }
  const email = normalizeEmail(input.email);
  let passwordHash;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (error) {
    if (isPasswordValidationError(error)) {
      throw authError(error.message, 'INVALID_PASSWORD', 400);
    }
    throw error;
  }

  try {
    return await withTransaction(async (client) => {
      const existing = await findUserByEmail(email, client);
      if (existing) throw authError('Email is already registered', 'EMAIL_ALREADY_REGISTERED', 409);
      const user = await createUser({ fullName, email, passwordHash }, client);
      return issueSession(user, context, { client });
    });
  } catch (error) {
    if (error.code === '23505') {
      throw authError('Email is already registered', 'EMAIL_ALREADY_REGISTERED', 409);
    }
    throw error;
  }
}

export async function loginUser(input, context = {}) {
  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(email);
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw authError('Email or password is incorrect');
  }
  if (user.status !== 'active') {
    throw authError('User account is not active', 'ACCOUNT_NOT_ACTIVE', 403);
  }
  return issueSession(user, context);
}

export async function rotateUserSession(refreshToken, context = {}) {
  const rawToken = String(refreshToken || '');
  if (!rawToken) throw authError('Refresh token is required', 'REFRESH_TOKEN_REQUIRED');
  const tokenHash = hashToken(rawToken);

  return withTransaction(async (client) => {
    const session = await findRefreshSessionByHash(tokenHash, { forUpdate: true, client });
    if (!session) throw authError('Refresh session is invalid', 'INVALID_REFRESH_SESSION');

    const expired = new Date(session.expiresAt).getTime() <= Date.now();
    if (session.revokedAt || session.rotatedAt || expired) {
      await revokeRefreshFamily(session.familyId, new Date(), client);
      throw authError('Refresh token reuse or expiry detected', 'REFRESH_TOKEN_REJECTED');
    }

    const user = await findUserById(session.userId, client);
    if (!user || user.status !== 'active') {
      await revokeRefreshFamily(session.familyId, new Date(), client);
      throw authError('User account is not active', 'ACCOUNT_NOT_ACTIVE', 403);
    }

    await rotateRefreshSession(session.id, new Date(), client);
    return issueSession(user, context, { client, familyId: session.familyId });
  });
}

export async function logoutUser(refreshToken) {
  const rawToken = String(refreshToken || '');
  if (!rawToken) return { revoked: false };
  const session = await findRefreshSessionByHash(hashToken(rawToken));
  if (!session) return { revoked: false };
  await revokeRefreshSession(session.id);
  return { revoked: true };
}

export async function getAuthenticatedUser(userId) {
  const user = await findUserById(userId);
  if (!user || user.status !== 'active') {
    throw authError('User account is not active', 'ACCOUNT_NOT_ACTIVE', 403);
  }
  return publicUser(user);
}
