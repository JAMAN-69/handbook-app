'use strict';

/**
 * resendSender.js — Send emails via Resend REST API (HTTPS port 443)
 * Works on Render/Railway/etc where SMTP ports are blocked.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

async function sendViaResend(to, subject, htmlBody) {
  if (!RESEND_API_KEY) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
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
      console.warn(`[Resend] Failed:`, data);
      return false;
    }
  } catch (err) {
    console.error(`[Resend] Request failed:`, err.message);
    return false;
  }
}

module.exports = { sendViaResend };
