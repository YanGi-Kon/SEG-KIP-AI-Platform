import 'dotenv/config';

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { getAppConfig } from '../config/env.js';
import { closePool, query } from '../db/pool.js';

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function menuItems(workspace) {
  try {
    const rows = JSON.parse(workspace.moduleSettings?.ulchov_menu_sheet_map || '[]');
    return Array.isArray(rows) ? rows.filter((row) => row?.menuName && row?.sheetName) : [];
  } catch (_) {
    return [];
  }
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
       AND COALESCE(w.module_settings->>'ulchov_menu_sheet_map', '') <> ''
     GROUP BY u.id, u.email, u.full_name, u.platform_role
    HAVING COUNT(DISTINCT w.spreadsheet_url) >= 2
     LIMIT 1
  `);
  const user = result.rows[0];
  if (!user) throw new Error('Ikki xil sozlangan O‘lchov Workspaceʼiga kirish huquqi bor foydalanuvchi topilmadi');
  const selected = [];
  const seenSheets = new Set();
  for (const workspace of user.workspaces || []) {
    const items = menuItems(workspace);
    const sheetKey = fingerprint(workspace.spreadsheetUrl);
    if (!items.length || seenSheets.has(sheetKey)) continue;
    seenSheets.add(sheetKey);
    selected.push({ ...workspace, items });
    if (selected.length === 2) break;
  }
  if (selected.length < 2) throw new Error('Regression testi uchun ikki xil sozlangan Workspace topilmadi');
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

async function readWorkspaceInstruments(workspace, token, selectedMenu = workspace.items[0]) {
  const response = await fetch('http://localhost:3001/api/ulchov/instruments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-workspace-id': workspace.id,
    },
    body: JSON.stringify({
      sheetName: selectedMenu.sheetName,
      menuItems: workspace.items,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${workspace.name}: HTTP ${response.status} ${data.error || ''}`);
  return {
    name: workspace.name,
    workspaceId: workspace.id,
    spreadsheetFingerprint: fingerprint(workspace.spreadsheetUrl),
    sheetName: data.sheetName,
    instrumentCount: (data.instruments || []).length,
    dataFingerprint: fingerprint(JSON.stringify(data.instruments || [])),
  };
}

try {
  const { user, workspaces } = await findUserAndDistinctWorkspaces();
  const token = makeAccessToken(user);
  const commonMenus = workspaces[0].items
    .map((firstMenu) => ({
      name: firstMenu.menuName,
      firstMenu,
      secondMenu: workspaces[1].items.find((item) => item.menuName === firstMenu.menuName),
    }))
    .filter((entry) => entry.secondMenu);
  if (!commonMenus.length) throw new Error('Ikki Workspace orasida umumiy O‘lchov menyusi topilmadi');
  let selectedResult = null;
  for (const entry of commonMenus) {
    const firstCandidate = await readWorkspaceInstruments(workspaces[0], token, entry.firstMenu);
    const secondCandidate = await readWorkspaceInstruments(workspaces[1], token, entry.secondMenu);
    selectedResult = { menuName: entry.name, first: firstCandidate, second: secondCandidate, firstMenu: entry.firstMenu };
    if (firstCandidate.dataFingerprint !== secondCandidate.dataFingerprint) break;
  }
  const { menuName, first, second, firstMenu } = selectedResult;
  const firstAgain = await readWorkspaceInstruments(workspaces[0], token, firstMenu);
  const workspaceIsolation = first.workspaceId !== second.workspaceId
    && first.spreadsheetFingerprint !== second.spreadsheetFingerprint;
  const dataDiffers = first.dataFingerprint !== second.dataFingerprint;
  const roundTripStable = JSON.stringify(first) === JSON.stringify(firstAgain);
  if (!workspaceIsolation) throw new Error('O‘lchov Workspace yoki Google Sheet ma’lumotlari ajratilmagan');
  if (!roundTripStable) throw new Error('O‘lchov Workspace A → B → A natijasi barqaror emas');
  console.log(JSON.stringify({ menuName, first, second, firstAgain, workspaceIsolation, dataDiffers, roundTripStable }, null, 2));
} finally {
  await closePool();
}
