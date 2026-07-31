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
  verifyApprovalToken,
} from '../services/signatureApprovalService.js';
import { enqueueFinalPdfExport } from '../repositories/outboxRepository.js';
import { isDatabaseConfigured } from '../db/pool.js';

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

function approvalPreviewStyles() {
  return `
.a4-preview{max-width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:14mm 18mm 16mm;box-sizing:border-box;font-family:"Times New Roman",serif;font-size:15px;line-height:1.28}
.a4-preview .act-meta{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:8mm}
.a4-preview .act-date-head{font-size:13px;line-height:1.2;white-space:nowrap;padding-top:28mm}
.a4-preview .act-date-head .line{display:inline-block;min-width:26px;border-bottom:1px solid #111;text-align:center;line-height:1;padding:0 2px 1px}
.a4-preview .act-date-head .month,.a4-preview .act-date-head .year{color:#1d4ed8;font-style:italic}
.a4-preview .act-head{margin-bottom:10mm}
.a4-preview .right{text-align:right;color:#1d4ed8;font-size:14px;line-height:1.25;font-weight:700;max-width:92mm;margin-left:auto;white-space:pre-line}
.a4-preview .act-title{display:flex;justify-content:center;align-items:flex-end;gap:10px;font-size:20px;font-weight:700;line-height:1.05;text-align:center;margin:0 0 4px}
.a4-preview .act-title .act-no-line{display:inline-flex;align-items:flex-end;justify-content:center;min-width:82px;padding:0 6px 2px;border-bottom:1px solid #111}
.a4-preview .act-subtitle{text-align:center;font-size:16px;font-weight:700;margin-bottom:0}
.a4-preview .act-signers-title{font-weight:700;font-size:16px;margin:0 0 8px}
.a4-preview .act-signers{display:grid;gap:14px;margin-bottom:14px}
.a4-preview .act-signers-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:end}
.a4-preview .act-signers-cell{text-align:center;min-width:0}
.a4-preview .act-signers-value{min-height:22px;padding:0 4px 1px;border-bottom:1px solid #111;text-align:center;display:flex;align-items:flex-end;justify-content:center;word-break:break-word;color:transparent;text-shadow:none}
.a4-preview .act-signers-label{font-size:12px;line-height:1.15;font-style:italic;margin-top:2px}
.a4-preview .act-section{margin-top:12px}
.a4-preview .act-section-title{font-size:16px;font-weight:700;margin-bottom:6px}
.a4-preview .act-section-value{min-height:20px;padding-bottom:4px;border-bottom:1px solid #111;white-space:pre-wrap;word-break:break-word}
.a4-preview .act-section-value.tall{min-height:60px}
.a4-preview .act-section-value.xl{min-height:88px}
.a4-preview .act-date-inline{display:flex;justify-content:flex-end;align-items:flex-end;gap:10px;font-weight:700;margin-top:4px;font-size:13px}
.a4-preview .act-date-inline .line{display:inline-flex;align-items:flex-end;justify-content:center;min-width:132px;border-bottom:1px solid #111;text-align:center;padding:0 4px 1px;font-weight:400}
.a4-preview .act-conclusion{margin-top:12px}
.a4-preview img{max-width:100%;height:auto}
@media (max-width: 980px){.a4-preview{padding:12mm 12mm 14mm;font-size:14px}.a4-preview .act-meta{gap:10px;margin-bottom:6mm}.a4-preview .act-date-head{padding-top:18mm}.a4-preview .act-title{font-size:18px}.a4-preview .act-subtitle{font-size:15px}}
@media (max-width: 760px){.a4-preview .act-meta{display:block}.a4-preview .act-date-head{padding-top:0;margin-bottom:10px}.a4-preview .act-signers-row{grid-template-columns:1fr}.a4-preview .act-date-inline{justify-content:flex-start;flex-wrap:wrap}.a4-preview .act-date-inline .line{min-width:0;width:100%}}
`;
}

function injectApprovalPreviewStyles(html) {
  const extra = approvalPreviewStyles();
  return String(html || '').includes('</style>')
    ? String(html).replace('</style>', `${extra}</style>`)
    : String(html || '');
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
    const html = injectApprovalPreviewStyles(renderApprovalPage(data, req.params.token));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (error) {
    res.status(403).send(`<!doctype html><meta charset="utf-8"><title>Havola xatosi</title><body style="font-family:Arial;padding:40px"><h2>Havola yaroqsiz</h2><p>${String(error.message).replace(/[&<>]/g, '')}</p></body>`);
  }
});

router.post('/document/approve', async (req, res) => {
  try {
    const approvalContext = req.body?.token ? verifyApprovalToken(req.body.token) : {};
    const result = await approveDocument(req.body?.token, req.body?.csrfToken, req);
    let finalPdfExport = null;
    if (result?.status === 'Тасдиқланди' && result?.approval?.actNo) {
      if (approvalContext.workspaceId && isDatabaseConfigured()) {
        try {
          const job = await enqueueFinalPdfExport({
            actNo: result.approval.actNo,
            updatedHtml: result.updatedHtml || '',
            workspaceId: approvalContext.workspaceId,
          });
          finalPdfExport = {
            status: job.status === 'completed' ? 'EXPORTED' : 'PENDING',
            jobId: job.id,
            idempotencyKey: job.idempotencyKey,
          };
        } catch (queueError) {
          finalPdfExport = {
            status: 'FAILED_RETRYABLE',
            code: 'FINAL_PDF_QUEUE_FAILED',
            error: queueError.message,
          };
        }
      } else {
        finalPdfExport = {
          status: 'FAILED_PERMANENT',
          code: approvalContext.workspaceId
            ? 'FINAL_PDF_OUTBOX_DATABASE_REQUIRED'
            : 'APPROVAL_WORKSPACE_CONTEXT_REQUIRED',
          error: approvalContext.workspaceId
            ? 'Final PDF outbox uchun DATABASE_URL talab qilinadi.'
            : 'Legacy approval token workspaceId saqlamaydi; tenantlar bo‘yicha qidiruv bajarilmadi.',
        };
      }
    }
    res.json({ ok: true, ...result, finalPdfExport });
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
