import 'dotenv/config';

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { getAppConfig } from '../config/env.js';
import { closePool, query } from '../db/pool.js';

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

async function findUserAndDistinctWorkspaces() {
  const result = await query(`
    SELECT u.id, u.email, u.full_name, u.platform_role,
           json_agg(
             json_build_object(
               'id', w.id,
               'name', w.name,
               'spreadsheetUrl', w.spreadsheet_url,
               'moduleSettings', w.module_settings
             ) ORDER BY w.name
           ) AS workspaces
      FROM users u
      JOIN workspace_members wm ON wm.user_id = u.id
      JOIN workspaces w ON w.id = wm.workspace_id
     WHERE u.status = 'active'
       AND wm.status = 'active'
       AND w.status = 'active'
       AND COALESCE(w.module_settings->>'acts_sheet_name', '') <> ''
     GROUP BY u.id, u.email, u.full_name, u.platform_role
    HAVING COUNT(DISTINCT w.spreadsheet_url) >= 2
     LIMIT 1
  `);
  const user = result.rows[0];
  if (!user) throw new Error('Ikki xil sozlangan Aktlar Workspaceʼiga kirish huquqi bor foydalanuvchi topilmadi');
  const selected = [];
  const seenSheets = new Set();
  for (const workspace of user.workspaces || []) {
    const sheetName = String(workspace.moduleSettings?.acts_sheet_name || '').trim();
    const sheetKey = fingerprint(workspace.spreadsheetUrl);
    if (!sheetName || seenSheets.has(sheetKey)) continue;
    seenSheets.add(sheetKey);
    selected.push({ ...workspace, sheetName });
    if (selected.length === 2) break;
  }
  if (selected.length < 2) throw new Error('Regression testi uchun ikki xil sozlangan Aktlar Workspace topilmadi');
  return { user, workspaces: selected };
}

function makeAccessToken(user) {
  const config = getAppConfig();
  return jwt.sign(
    {
      tokenType: 'access',
      platformRole: user.platform_role,
      permissions: [],
      email: user.email,
      name: user.full_name,
    },
    config.secrets.accessToken,
    {
      subject: user.id,
      issuer: 'SEG-KIP-AI',
      audience: 'workspace-api',
      expiresIn: '10m',
      jwtid: crypto.randomUUID(),
    },
  );
}

async function requestActs(workspace, token, path, body) {
  const response = await fetch(`http://localhost:3001${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-workspace-id': workspace.id,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${workspace.name}: HTTP ${response.status} ${data.error || ''}`);
  return data;
}

async function readWorkspaceActs(workspace, token) {
  const [analysis, archive] = await Promise.all([
    requestActs(workspace, token, '/api/acts/monthly-analysis', { sheetName: workspace.sheetName }),
    requestActs(workspace, token, '/api/acts/reports/daily', { sheetName: workspace.sheetName }),
  ]);
  return {
    name: workspace.name,
    workspaceId: workspace.id,
    spreadsheetFingerprint: fingerprint(workspace.spreadsheetUrl),
    sheetName: workspace.sheetName,
    analysisRows: (analysis.rows || []).length,
    analysisFingerprint: fingerprint(JSON.stringify(analysis.rows || [])),
    archiveRows: (archive.rows || []).length,
    archiveFingerprint: fingerprint(JSON.stringify(archive.rows || [])),
  };
}

try {
  const { user, workspaces } = await findUserAndDistinctWorkspaces();
  const token = makeAccessToken(user);
  const first = await readWorkspaceActs(workspaces[0], token);
  const second = await readWorkspaceActs(workspaces[1], token);
  const firstAgain = await readWorkspaceActs(workspaces[0], token);
  const workspaceIsolation = first.workspaceId !== second.workspaceId
    && first.spreadsheetFingerprint !== second.spreadsheetFingerprint;
  const dataDiffers = first.analysisFingerprint !== second.analysisFingerprint
    || first.archiveFingerprint !== second.archiveFingerprint;
  const roundTripStable = JSON.stringify(first) === JSON.stringify(firstAgain);
  if (!workspaceIsolation) throw new Error('Aktlar Workspace yoki Google Sheet maʼlumotlari ajratilmagan');
  if (!roundTripStable) throw new Error('Aktlar Workspace A → B → A natijasi barqaror emas');
  console.log(JSON.stringify({ first, second, firstAgain, workspaceIsolation, dataDiffers, roundTripStable }, null, 2));
} finally {
  await closePool();
}
