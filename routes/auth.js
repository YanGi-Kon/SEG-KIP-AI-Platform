import express from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import { requireSelfRegistration, requireWorkspaceMode } from '../middleware/featureGate.js';
import {
  loginUser,
  logoutUser,
  registerUser,
  rotateUserSession,
} from '../services/authService.js';

const router = express.Router();
const REFRESH_COOKIE = 'seg_kip_refresh';

function requestContext(req) {
  return {
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

function parseCookies(req) {
  const result = {};
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch (_) { result[key] = value; }
  }
  return result;
}

function refreshCookieOptions(req, expiresAt) {
  const secure = req.appConfig?.isProduction || String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  };
}

function setRefreshCookie(req, res, session) {
  res.cookie(
    REFRESH_COOKIE,
    session.refreshToken,
    refreshCookieOptions(req, session.refreshTokenExpiresAt),
  );
}

function clearRefreshCookie(req, res) {
  res.clearCookie(REFRESH_COOKIE, {
    ...refreshCookieOptions(req, new Date(0)),
    expires: undefined,
    maxAge: 0,
  });
}

function responseSession(session) {
  return {
    accessToken: session.accessToken,
    accessTokenExpiresIn: session.accessTokenExpiresIn,
    user: session.user,
  };
}

function handleError(res, error) {
  const knownStatus = Number(error.statusCode);
  const status = Number.isInteger(knownStatus) && knownStatus >= 400 && knownStatus < 600
    ? knownStatus
    : 500;
  const message = status >= 500 ? 'Authentication service error' : error.message;
  res.status(status).json({
    error: message,
    code: error.code || (status >= 500 ? 'AUTH_SERVICE_ERROR' : 'AUTH_REQUEST_FAILED'),
  });
}

router.use(requireWorkspaceMode);

router.post('/register', requireSelfRegistration, async (req, res) => {
  try {
    const session = await registerUser(req.body || {}, requestContext(req));
    setRefreshCookie(req, res, session);
    res.status(201).json(responseSession(session));
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/login', async (req, res) => {
  try {
    const session = await loginUser(req.body || {}, requestContext(req));
    setRefreshCookie(req, res, session);
    res.json(responseSession(session));
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = parseCookies(req)[REFRESH_COOKIE] || req.body?.refreshToken;
    const session = await rotateUserSession(refreshToken, requestContext(req));
    setRefreshCookie(req, res, session);
    res.json(responseSession(session));
  } catch (error) {
    clearRefreshCookie(req, res);
    handleError(res, error);
  }
});

router.post('/logout', async (req, res) => {
  try {
    const refreshToken = parseCookies(req)[REFRESH_COOKIE] || req.body?.refreshToken;
    const result = await logoutUser(refreshToken);
    clearRefreshCookie(req, res);
    res.json({ ok: true, ...result });
  } catch (error) {
    clearRefreshCookie(req, res);
    handleError(res, error);
  }
});

router.get('/me', requireAccessToken, (req, res) => {
  res.json({ user: req.auth.user });
});

export default router;
