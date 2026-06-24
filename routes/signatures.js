import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import {
  approveDocument,
  createSigner,
  deleteSigner,
  getAudit,
  listSigners,
  openApproval,
  parseConfigHeader,
  renderApprovalPage,
  sendDocumentForApproval,
  streamSignatureImage,
  updateSigner,
  uploadSignaturePng,
} from '../services/signatureApprovalService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

function configFromRequest(req) {
  const headerConfig = parseConfigHeader(req.get('x-seg-kip-config'));
  let serviceAccount = req.body?.serviceAccount || headerConfig.serviceAccount;
  if (typeof serviceAccount === 'string') {
    try { serviceAccount = JSON.parse(serviceAccount); } catch (_) { throw new Error('serviceAccount JSON формати нотўғри'); }
  }
  return {
    spreadsheetUrl: req.body?.spreadsheetUrl || req.query?.spreadsheetUrl || headerConfig.spreadsheetUrl,
    serviceAccount,
  };
}

function requestContext(req) {
  return {
    actor: req.user?.name || req.get('x-actor-name') || req.body?.actor || 'Administrator',
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
  };
}

function adminSecret() {
  return String(process.env.ADMIN_JWT_SECRET || process.env.APPROVAL_JWT_SECRET || '').trim();
}

function requireAdmin(req, res, next) {
  const passwordConfigured = Boolean(String(process.env.ADMIN_PASSWORD || '').trim());
  if (!passwordConfigured) return next();
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Administrator JWT токени талаб қилинади', code: 'ADMIN_AUTH_REQUIRED' });
  try {
    req.user = jwt.verify(token, adminSecret(), { issuer: 'SEG-KIP-AI', audience: 'admin' });
    next();
  } catch (_) {
    res.status(401).json({ error: 'Administrator JWT токени яроқсиз', code: 'ADMIN_AUTH_REQUIRED' });
  }
}

router.post('/auth/login', (req, res) => {
  const expected = String(process.env.ADMIN_PASSWORD || '').trim();
  if (!expected) return res.status(404).json({ error: 'ADMIN_PASSWORD созланмаган' });
  if (String(req.body?.password || '') !== expected) return res.status(401).json({ error: 'Пароль нотўғри' });
  const token = jwt.sign({ role: 'admin', name: String(req.body?.name || 'Administrator') }, adminSecret(), {
    expiresIn: '8h', issuer: 'SEG-KIP-AI', audience: 'admin',
  });
  res.json({ token, expiresIn: '8h' });
});

router.get('/signers', requireAdmin, async (req, res) => {
  try {
    res.json({ rows: await listSigners(configFromRequest(req)) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/signers', requireAdmin, async (req, res) => {
  try {
    const row = await createSigner(configFromRequest(req), req.body || {}, requestContext(req));
    res.status(201).json({ ok: true, row });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/signers/:id', requireAdmin, async (req, res) => {
  try {
    const row = await updateSigner(configFromRequest(req), req.params.id, req.body || {}, requestContext(req));
    res.json({ ok: true, row });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/signers/:id', requireAdmin, async (req, res) => {
  try {
    const result = await deleteSigner(configFromRequest(req), req.params.id, requestContext(req));
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/signature/upload', requireAdmin, upload.single('signature'), async (req, res) => {
  try {
    const result = await uploadSignaturePng(configFromRequest(req), req.file, requestContext(req));
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/signature/render/:token', async (req, res) => {
  try {
    await streamSignatureImage(req.params.token, res);
  } catch (error) {
    if (!res.headersSent) res.status(403).json({ error: error.message });
  }
});

router.post('/document/send', requireAdmin, async (req, res) => {
  try {
    const result = await sendDocumentForApproval(configFromRequest(req), req.body || {}, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/document/approve/:token', async (req, res) => {
  try {
    const data = await openApproval(req.params.token, req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderApprovalPage(data, req.params.token));
  } catch (error) {
    res.status(403).send(`<!doctype html><meta charset="utf-8"><title>Havola xatosi</title><body style="font-family:Arial;padding:40px"><h2>Havola yaroqsiz</h2><p>${String(error.message).replace(/[&<>]/g, '')}</p></body>`);
  }
});

router.post('/document/approve', async (req, res) => {
  try {
    const result = await approveDocument(req.body?.token, req.body?.csrfToken, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const rows = await getAudit(configFromRequest(req), req.query.limit);
    res.json({ rows });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
