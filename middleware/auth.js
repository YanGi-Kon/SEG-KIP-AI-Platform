import { getAuthenticatedUser, verifyAccessToken } from '../services/authService.js';

function extractBearerToken(req) {
  const header = String(req.get('authorization') || '').trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function requireAccessToken(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Access token is required',
      code: 'ACCESS_TOKEN_REQUIRED',
    });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await getAuthenticatedUser(payload.sub);
    req.auth = {
      tokenId: payload.jti,
      userId: user.id,
      user,
      platformRole: user.platformRole,
    };
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({
      error: error.message || 'Access token is invalid',
      code: error.code || 'INVALID_ACCESS_TOKEN',
    });
  }
}

export function requirePlatformRole(...roles) {
  const allowed = new Set(roles.map((role) => String(role).trim().toLowerCase()));
  return (req, res, next) => {
    const role = String(req.auth?.platformRole || '').toLowerCase();
    if (!allowed.has(role)) {
      return res.status(403).json({
        error: 'Platform role permission denied',
        code: 'PLATFORM_PERMISSION_DENIED',
      });
    }
    next();
  };
}
