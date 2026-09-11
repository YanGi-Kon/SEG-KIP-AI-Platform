import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../services/workspaceApprovalBridgeService.js', import.meta.url), 'utf8');
const approval = fs.readFileSync(new URL('../services/signatureApprovalService.js', import.meta.url), 'utf8');

test('Хужатни юбориш yangi tasdiqlash raundida barcha biriktirilgan imzolovchilarni nishonga oladi', () => {
  assert.match(bridge, /export function selectEmailApprovalTargets\(signers = \[\]\) \{\s*return \[\.\.\.signers\];\s*\}/);
  assert.match(bridge, /resetExisting: true/);
  assert.match(bridge, /providerMessageId/);
});

test('qayta yuborishda eski tasdiqlangan holat saqlanib qolmaydi', () => {
  assert.match(approval, /resetExisting = false/);
  assert.match(approval, /resetExisting \? '' : \(existing\.approvedAt/);
  assert.match(approval, /resetExisting: Boolean\(input\.resetExistingApprovals\)/);
  assert.match(bridge, /resetExistingApprovals: true/);
});

test('umumiy hujjat holati uchala biriktirilgan tasdiqlovchi bo‘yicha hisoblanadi', () => {
  assert.match(approval, /const requiredAssignments = assignedSignerSlots\(metadata\);/);
  assert.doesNotMatch(approval, /Number\(assignment\.slot\) === 2 \|\| Number\(assignment\.slot\) === 3/);
});
