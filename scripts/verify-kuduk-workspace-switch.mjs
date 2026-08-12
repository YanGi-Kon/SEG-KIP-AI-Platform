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
               'spreadsheetUrl', w.spreadsheet_url
             ) ORDER BY w.name
           ) AS workspaces
      FROM users u
      JOIN workspace_members wm ON wm.user_id = u.id
      JOIN workspaces w ON w.id = wm.workspace_id
     WHERE u.status = 'active'
       AND wm.status = 'active'
       AND w.status = 'active'
     GROUP BY u.id, u.email, u.full_name, u.platform_role
    HAVING COUNT(DISTINCT w.spreadsheet_url) >= 2
     LIMIT 1
  `);
  const user = result.rows[0];
  if (!user) throw new Error('Ikki xil Google Sheet Workspaceʼiga kirish huquqi bor faol foydalanuvchi topilmadi');
  const selected = [];
  const seenSheets = new Set();
  for (const workspace of user.workspaces || []) {
    const sheetKey = fingerprint(workspace.spreadsheetUrl);
    if (seenSheets.has(sheetKey)) continue;
    seenSheets.add(sheetKey);
    selected.push(workspace);
    if (selected.length === 2) break;
  }
  if (selected.length < 2) throw new Error('Regression testi uchun ikki xil Workspace topilmadi');
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

async function readWorkspaceState(workspace, token) {
  const response = await fetch('http://localhost:3001/api/kuduk/state?sexId=sex_4', {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspace.id,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${workspace.name}: HTTP ${response.status} ${data.error || ''}`);
  const master = (data.routes || []).find((route) => (
    route.isMasterJournal
    || route.kind === 'master-journal'
    || String(route.title || '').trim().toLowerCase() === 'журнал'
  ));
  return {
    name: workspace.name,
    tenantKey: data.sexId,
    status: data.status,
    connected: data.connected,
    spreadsheetFingerprint: fingerprint(data.spreadsheetId),
    routeCount: (data.routes || []).length,
    totalRouteRows: (data.routes || []).reduce((total, route) => total + Number(route.count || 0), 0),
    masterRows: Number(master?.count || 0),
  };
}

try {
  const { user, workspaces } = await findUserAndDistinctWorkspaces();
  const token = makeAccessToken(user);
  const first = await readWorkspaceState(workspaces[0], token);
  const second = await readWorkspaceState(workspaces[1], token);
  const firstAgain = await readWorkspaceState(workspaces[0], token);
  const workspaceIsolation = first.tenantKey !== second.tenantKey
    && first.spreadsheetFingerprint !== second.spreadsheetFingerprint;
  const roundTripStable = JSON.stringify(first) === JSON.stringify(firstAgain);
  if (!workspaceIsolation) throw new Error('Workspace tenant yoki Google Sheet holati ajratilmagan');
  if (!roundTripStable) throw new Error('Workspace A → B → A qaytish natijasi barqaror emas');
  console.log(JSON.stringify({ first, second, firstAgain, workspaceIsolation, roundTripStable }, null, 2));
} finally {
  await closePool();
}
