import { getHttpEmailSummary, hasHttpEmailProvider, sendHttpEmail } from './httpEmailService.js';

const KEY_NAME = 'RESEND' + '_API' + '_KEY';
const FROM_NAME = 'EMAIL' + '_FROM';

function clean(value) {
  return String(value ?? '').trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function publicSummary() {
  const summary = getHttpEmailSummary();
  const from = clean(summary.from || process.env[FROM_NAME]);
  const mode = from.toLowerCase() === 'onboarding@resend.dev' ? 'resend-test-sender' : (from ? 'verified-domain' : 'missing');
  return {
    provider: hasHttpEmailProvider() ? 'resend' : 'none',
    hasHttpEmailProvider: hasHttpEmailProvider(),
    hasApiKey: Boolean(clean(process.env[KEY_NAME])),
    from,
    fromMode: mode,
    warning: mode === 'resend-test-sender' ? 'onboarding@resend.dev faqat account egasi emailiga yubora oladi. Boshqa Gmail uchun Resend domain verification kerak.' : '',
    recommendedFix: mode === 'resend-test-sender' ? 'Resend’da domain verification qiling va EMAIL_FROM ni verified domain emailiga almashtiring.' : '',
    secretsExposed: false,
  };
}

function classify(error) {
  const message = clean(error?.message || 'Email yuborish xatosi.');
  const text = `${error?.code || ''} ${error?.providerStatus || ''} ${message}`;
  if (/only send testing emails|own email address|verify a domain/i.test(text)) {
    return { code: 'EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED', error: 'Resend test sender faqat account egasi emailiga yubora oladi.', providerMessage: message, recommendedFix: 'Domain verification qiling va EMAIL_FROM ni verified domain emailiga almashtiring.' };
  }
  if (/domain.*not.*verified|verify.*domain/i.test(text)) return { code: 'EMAIL_DOMAIN_NOT_VERIFIED', error: 'Email domen tasdiqlanmagan.', providerMessage: message, recommendedFix: 'Resend’da domain verification qiling.' };
  if (/invalid.*email|invalid.*recipient|invalid.*to/i.test(text)) return { code: 'EMAIL_INVALID_RECIPIENT', error: 'Recipient email noto‘g‘ri.', providerMessage: message, recommendedFix: 'Emailni name@gmail.com formatida kiriting.' };
  if (/auth|unauthorized|api key|401/i.test(text)) return { code: 'EMAIL_AUTH_FAILED', error: 'Email provider kaliti noto‘g‘ri yoki bekor qilingan.', providerMessage: message, recommendedFix: 'Railway Variables’dagi email provider kalitini tekshiring.' };
  if (/timeout|abort/i.test(text)) return { code: 'EMAIL_SEND_TIMEOUT', error: 'Email provider javob bermadi.', providerMessage: message, recommendedFix: 'Birozdan keyin qayta test qiling.' };
  return { code: error?.code || 'EMAIL_HTTP_FAILED', error: message, providerMessage: message, recommendedFix: 'Provider javobini tekshiring.' };
}

export async function getEmailProviderTestSummary() {
  return { ok: true, emailReady: hasHttpEmailProvider(), ...publicSummary(), message: hasHttpEmailProvider() ? 'HTTP email provider sozlangan.' : 'HTTP email provider sozlanmagan.' };
}

export async function sendEmailProviderTest(input = {}) {
  const summary = publicSummary();
  const to = clean(input.to);
  const actNo = clean(input.actNo) || 'EMAIL_TEST';
  if (!to) return { ok: false, emailSent: false, code: 'EMAIL_RECIPIENT_REQUIRED', error: 'Test recipient email kiritilmagan.', ...summary, to };
  if (!isEmail(to)) return { ok: false, emailSent: false, code: 'EMAIL_INVALID_RECIPIENT', error: 'Recipient email noto‘g‘ri yoki to‘liq emas.', recommendedFix: 'To‘g‘ri format: name@gmail.com', ...summary, to };
  if (input.dryRun) return { ok: true, emailSent: false, dryRun: true, message: 'Dry-run diagnostika bajarildi. Email yuborilmadi.', ...summary, to };
  try {
    await sendHttpEmail({ to, subject: 'SEG KIP AI Platform email test', text: `Email diagnostika testi. Hujjat: ${actNo}`, html: `<div style="font-family:Arial,sans-serif"><h2>SEG KIP AI Platform email test</h2><p>Hujjat: <b>${actNo}</b></p><p>Email provider ishlayapti.</p></div>` });
    return { ok: true, emailSent: true, message: 'Test email yuborildi.', ...summary, to };
  } catch (error) {
    return { ok: false, emailSent: false, ...classify(error), ...summary, to };
  }
}
