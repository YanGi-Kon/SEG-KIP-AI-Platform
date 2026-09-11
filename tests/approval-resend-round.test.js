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

test('yangi yuborish raundi 3-of-3 siyosatini metadata orqali belgilaydi', () => {
  assert.match(bridge, /approvalPolicy: 'all-assigned-v2'/);
  assert.match(approval, /function requiresAllAssignedApprovals/);
  assert.match(approval, /requiresAllAssignedApprovals\(metadata\)/);
  assert.match(approval, /assignments\.filter\(\(assignment\) => Number\(assignment\.slot\) === 2 \|\| Number\(assignment\.slot\) === 3\)/);
});



test('biriktirilgan tasdiqlovchilardan bittasi topilmasa qisman yuborish boshlanmaydi', () => {
  assert.match(bridge, /resolved\.signers\.length !== resolved\.requested\.length/);
  assert.match(bridge, /Hujjatdagi barcha tasdiqlovchilar topilmadi/);
});

test('HTTP email provider natijasi audit logga message ID bilan yoziladi', () => {
  assert.match(bridge, /action: 'DOCUMENT_SENT'/);
  assert.match(bridge, /messageId=/);
  assert.match(bridge, /action: 'EMAIL_FAILED'/);
});


test('Resend test sender bir nechta Gmail uchun approval holatini reset qilishdan oldin to‘xtaydi', () => {
  assert.match(bridge, /provider\.fromMode === 'resend-test-sender'/);
  assert.match(bridge, /uniqueRecipients\.size > 1/);
  assert.match(bridge, /EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED/);
  const preflightIndex = bridge.indexOf("provider.fromMode === 'resend-test-sender'");
  const sendIndex = bridge.indexOf('return sendWorkspaceDocumentViaHttp');
  assert.ok(preflightIndex >= 0 && sendIndex > preflightIndex);
});
