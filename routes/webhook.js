import express from 'express';
import { sendTelegramMessage } from '../services/backupService.js';
import { verifyCiWebhookRequest } from '../services/webhookSecurity.js';

const router = express.Router();

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

export function formatCiCdMessage(payload, githubEvent = '') {
  if (payload && (payload.type === 'DEPLOY' || String(payload.type || '').startsWith('Deployment.'))) {
    const details = payload.details || payload;
    const resource = payload.resource || {};
    const stateFromEvent = String(payload.type || '').split('.').pop()?.toUpperCase();
    const status = payload.type?.startsWith('Deployment.') ? (stateFromEvent || 'UNKNOWN') : (details.status || 'UNKNOWN');
    const project = resource.project?.name || payload.project || payload.projectName || 'Railway Project';
    const environment = resource.environment?.name || payload.environment || payload.environmentName || 'Production';
    const service = resource.service?.name;
    const commit = details.commitMessage || payload.meta?.commitMessage;
    const icon = status === 'SUCCESS' || status === 'DEPLOYED' ? '✅' :
      status === 'FAILED' || status === 'CRASHED' || status === 'OOM_KILLED' ? '❌' : 'ℹ️';
    let message = `${icon} <b>Deploy ${escapeHtml(status)}</b>\n\n`;
    message += `<b>Platform:</b> Railway\n`;
    message += `<b>Project:</b> ${escapeHtml(project)}\n`;
    message += `<b>Environment:</b> ${escapeHtml(environment)}\n`;
    if (service) message += `<b>Service:</b> ${escapeHtml(service)}\n`;
    if (commit) message += `<b>Commit:</b> ${escapeHtml(commit)}\n`;
    return message;
  }

  if (githubEvent === 'push') {
    const repo = payload.repository?.name || 'GitHub Repo';
    const committer = payload.pusher?.name || 'Someone';
    const commitMsg = payload.head_commit?.message || 'No commit message';
    const branch = (payload.ref || '').split('/').pop() || 'main';
    return `🔄 <b>New Code Pushed!</b>\n\n` +
      `<b>Repository:</b> ${escapeHtml(repo)} (${escapeHtml(branch)})\n` +
      `<b>Pusher:</b> ${escapeHtml(committer)}\n` +
      `<b>Commit:</b> ${escapeHtml(commitMsg)}\n`;
  }

  return `🔔 <b>CI/CD Event Received:</b>\n\n<pre>${escapeHtml(JSON.stringify(payload, null, 2).substring(0, 500))}</pre>`;
}

router.post('/cicd', async (req, res) => {
  const verification = verifyCiWebhookRequest(req);
  if (!verification.ok) {
    return res.status(verification.status).json({ success: false, error: verification.code });
  }
  try {
    const message = formatCiCdMessage(req.body, req.headers['x-github-event']);
    const sent = await sendTelegramMessage(message);
    if (sent) console.log('[Webhook] Sent CI/CD notification to Telegram.');
    else console.log('[Webhook] Telegram bot not initialized or failed to send notification.');
    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('[Webhook] Error processing CI/CD webhook:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
