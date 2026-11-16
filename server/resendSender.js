'use strict';

/**
 * resendSender.js — Disabled (using SMTP directly instead)
 * Resend free tier only sends to verified domains/emails.
 */

async function sendViaResend(to, subject, htmlBody) {
  // Always return false so SMTP fallback is used
  return false;
}

module.exports = { sendViaResend };
