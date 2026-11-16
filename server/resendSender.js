'use strict';

/**
 * emailSender.js — Send emails via HTTP APIs (port 443, works on Render)
 * Priority: 1) Brevo API  2) Resend API  3) SMTP fallback
 */

// ── Brevo (Sendinblue) API ──────────────────────────────────────────────────
async function sendViaBrevo(to, subject, htmlBody) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Handbook', email: process.env.SMTP_USER || 'mdjamanmolla44@gmail.com' },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlBody
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Brevo] Email sent to ${to} successfully. MessageId: ${data.messageId}`);
      return true;
    } else {
      const data = await response.json();
      console.warn(`[Brevo] Failed:`, JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.error(`[Brevo] Request failed:`, err.message);
    return false;
  }
}

// ── Resend API ──────────────────────────────────────────────────────────────
async function sendViaResend(to, subject, htmlBody) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Handbook <onboarding@resend.dev>',
        to: to,
        subject: subject,
        html: htmlBody
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`[Resend] Email sent to ${to} successfully:`, data.id);
      return true;
    } else {
      console.warn(`[Resend] Failed:`, JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.error(`[Resend] Request failed:`, err.message);
    return false;
  }
}

module.exports = { sendViaBrevo, sendViaResend };
