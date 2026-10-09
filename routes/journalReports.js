import express from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';
import {
  appendJournalReportRows,
  getJournalReport,
  listJournalReportFolders,
  normalizeJournalReportPeriod,
} from '../services/journalReportService.js';

import { exportJournalReportPdf } from '../services/journalReportPdfService.js';

const router = express.Router();
const requireWorkspaceRead = requireWorkspaceRequestPermission('workspace:read');
const requireJournalSave = requireWorkspaceRequestPermission('documents:create');

function classifyJournalReportError(error, fallbackCode) {
  if (error?.code === '42P01' && /journal_reports|journal_report_/i.test(String(error?.message || ''))) {
    return {
      statusCode: 503,
      code: 'JOURNAL_REPORTS_MIGRATION_REQUIRED',
      error: 'ЖУРНАЛ УЧЕТА ҳисобот жадваллари ҳали яратилмаган. DB миграциясини ишга туширинг.',
      recommendedFix: 'npm run db:migrate',
    };
  }
  return {
    statusCode: Number(error?.statusCode) || 500,
    code: error?.code || fallbackCode,
    error: error?.message || 'ЖУРНАЛ УЧЕТА ҳисобот хатоси.',
    recommendedFix: error?.recommendedFix || '',
  };
}

router.use((req, res, next) => requireAccessToken(req, res, () => requireWorkspaceRead(req, res, next)));

router.get('/', async (req, res) => {
  try {
    const reports = await listJournalReportFolders(req.workspace.id);
    return res.json({ ok: true, reports });
  } catch (error) {
    const classified = classifyJournalReportError(error, 'JOURNAL_REPORT_LIST_FAILED');
    return res.status(classified.statusCode).json({ ok: false, ...classified });
  }
});

router.get('/:year/:month', async (req, res) => {
  try {
    const { year, month } = normalizeJournalReportPeriod(req.params.year, req.params.month);
    const bundle = await getJournalReport(req.workspace.id, year, month);
    if (!bundle) {
      return res.status(404).json({
        ok: false,
        code: 'JOURNAL_REPORT_NOT_FOUND',
        error: 'Бу ой учун ЖУРНАЛ УЧЕТА ҳисоботи ҳали шакллантирилмаган.',
      });
    }
    return res.json({ ok: true, ...bundle });
  } catch (error) {
    const classified = classifyJournalReportError(error, 'JOURNAL_REPORT_READ_FAILED');
    return res.status(classified.statusCode).json({ ok: false, ...classified });
  }
});

router.post('/:year/:month/append', requireJournalSave, async (req, res) => {
  try {
    const result = await appendJournalReportRows({
      workspaceId: req.workspace.id,
      year: req.params.year,
      month: req.params.month,
      documentDate: req.body?.documentDate,
      sourceSheetName: req.body?.sourceSheetName,
      rows: req.body?.rows,
      createdBy: req.auth?.userId || null,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    const classified = classifyJournalReportError(error, 'JOURNAL_REPORT_APPEND_FAILED');
    return res.status(classified.statusCode).json({ ok: false, ...classified });
  }
});

router.post('/:year/:month/pdf', requireJournalSave, async (req, res) => {
  try {
    const result = await exportJournalReportPdf(req.workspace, req.params.year, req.params.month);
    return res.json({ ok: true, result });
  } catch (error) {
    const classified = classifyJournalReportError(error, 'JOURNAL_REPORT_PDF_FAILED');
    return res.status(classified.statusCode).json({ ok: false, ...classified });
  }
});

export default router;
