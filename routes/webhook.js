import express from 'express';
import { sendTelegramMessage } from '../services/backupService.js';

const router = express.Router();

router.post('/cicd', async (req, res) => {
  try {
    const payload = req.body;
    let message = '';

    // Detect Railway Webhook
    if (payload && payload.type === 'DEPLOY') {
      const status = payload.status || 'UNKNOWN';
      const project = payload.project || payload.projectName || 'Railway Project';
      const environment = payload.environment || payload.environmentName || 'Production';
      
      let emoji = 'ℹ️';
      if (status === 'SUCCESS') emoji = '✅';
      else if (status === 'FAILED') emoji = '❌';
      else if (status === 'INITIALIZING' || status === 'BUILDING' || status === 'DEPLOYING') emoji = '⏳';
      
      message = `${emoji} <b>Deploy ${status}</b>\n\n`;
      message += `<b>Platform:</b> Railway\n`;
      message += `<b>Project:</b> ${project}\n`;
      message += `<b>Environment:</b> ${environment}\n`;
      
      if (payload.meta && payload.meta.commitMessage) {
        message += `<b>Commit:</b> ${payload.meta.commitMessage}\n`;
      }
    } 
    // Detect GitHub Push Webhook
    else if (req.headers['x-github-event'] === 'push') {
      const repo = payload.repository?.name || 'GitHub Repo';
      const committer = payload.pusher?.name || 'Someone';
      const commitMsg = payload.head_commit?.message || 'No commit message';
      const branch = (payload.ref || '').split('/').pop() || 'main';
      
      message = `🔄 <b>New Code Pushed!</b>\n\n`;
      message += `<b>Repository:</b> ${repo} (${branch})\n`;
      message += `<b>Pusher:</b> ${committer}\n`;
      message += `<b>Commit:</b> ${commitMsg}\n`;
    }
    // Generic Webhook Fallback
    else {
      message = `🔔 <b>CI/CD Event Received:</b>\n\n<pre>${JSON.stringify(payload, null, 2).substring(0, 500)}</pre>`;
    }

    // Send to Telegram
    const sent = await sendTelegramMessage(message);
    if (sent) {
      console.log('[Webhook] Sent CI/CD notification to Telegram.');
    } else {
      console.log('[Webhook] Telegram bot not initialized or failed to send notification.');
    }

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('[Webhook] Error processing CI/CD webhook:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
