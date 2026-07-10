import { getAppConfig } from '../config/env.js';

export function requireWorkspaceMode(req, res, next) {
  try {
    const config = getAppConfig();
    if (!config.features.workspaceModeEnabled) {
      return res.status(404).json({
        error: 'Workspace API is not enabled',
        code: 'WORKSPACE_MODE_DISABLED',
      });
    }
    req.appConfig = config;
    next();
  } catch (error) {
    res.status(503).json({
      error: error.message,
      code: 'WORKSPACE_CONFIGURATION_INVALID',
    });
  }
}

export function requireSelfRegistration(req, res, next) {
  const enabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ALLOW_SELF_REGISTRATION || '').trim().toLowerCase(),
  );
  if (!enabled) {
    return res.status(403).json({
      error: 'Self-registration is disabled',
      code: 'SELF_REGISTRATION_DISABLED',
    });
  }
  next();
}
