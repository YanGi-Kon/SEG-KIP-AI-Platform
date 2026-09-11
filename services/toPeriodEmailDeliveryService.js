import { sendToPeriodForApproval } from './toPeriodApprovalService.js';

export async function sendToPeriodForApprovalWithFallback(workspace, year, month, req) {
  return sendToPeriodForApproval(workspace, year, month, req);
}
