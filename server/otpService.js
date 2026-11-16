'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { run, get, all } = require('./db');
const { sendViaBrevo, sendViaResend } = require('./resendSender');


// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OTP_EXPIRY_MS = 10 * 60 * 1000;     // 10 minutes
const RATE_LIMIT_MAX = 100;                 // max 100 OTP requests for testing/dev
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;             // max 5 wrong attempts before lockout

// ---------------------------------------------------------------------------
// Email transporter (SMTP via Nodemailer)
// ---------------------------------------------------------------------------
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

  if (!smtpUser || !smtpPass) {
    console.warn('[OTP] SMTP credentials not configured — running in MOCK MODE. Codes will be logged to console only.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for port 465 SSL, false for 587 TLS
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 15000,  // 15 seconds
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: false  // allow self-signed / firewall-intercepted certs
    },
  });

  return _transporter;
}

// ---------------------------------------------------------------------------
// SMS via Twilio
// ---------------------------------------------------------------------------
let _twilioClient = null;

function getTwilioClient() {
  if (_twilioClient) return _twilioClient;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    console.warn('[OTP] Twilio credentials not configured — SMS will be logged to console only.');
    return null;
  }

  try {
    const twilio = require('twilio');
    _twilioClient = twilio(sid, token);
    return _twilioClient;
  } catch (e) {
    console.error('[OTP] Failed to load Twilio client:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting check (per identifier)
// ---------------------------------------------------------------------------
async function checkRateLimit(identifier) {
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
  const rows = await all(
    `SELECT COUNT(*) as count FROM otp_codes
     WHERE identifier = ? AND created_at >= datetime(?, 'unixepoch')`,
    [identifier, Math.floor(windowStart / 1000)]
  );
  const count = rows[0]?.count || 0;
  return count >= RATE_LIMIT_MAX;
}

// ---------------------------------------------------------------------------
// Generate and store OTP
// ---------------------------------------------------------------------------
async function generateOtp(identifier, purpose = 'signup') {
  const rateLimited = await checkRateLimit(identifier);
  if (rateLimited) {
    throw Object.assign(new Error('Too many code requests. Please wait 10 minutes.'), { code: 'RATE_LIMITED' });
  }

  // Invalidate old unused codes for this identifier + purpose
  await run(
    `UPDATE otp_codes SET used = 1 WHERE identifier = ? AND purpose = ? AND used = 0`,
    [identifier, purpose]
  );

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  await run(
    `INSERT INTO otp_codes (id, identifier, code, purpose, expires_at, used, attempts)
     VALUES (?, ?, ?, ?, ?, 0, 0)`,
    [id, identifier, code, purpose, expiresAt]
  );

  return code;
}

// ---------------------------------------------------------------------------
// Verify OTP
// ---------------------------------------------------------------------------
async function verifyOtp(identifier, code, purpose = 'signup') {
  const row = await get(
    `SELECT * FROM otp_codes
     WHERE identifier = ? AND purpose = ? AND used = 0
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );

  if (!row) {
    throw Object.assign(new Error('No active verification code found. Please request a new one.'), { code: 'NOT_FOUND' });
  }

  // Check expiry
  if (Date.now() > row.expires_at) {
    await run(`UPDATE otp_codes SET used = 1 WHERE id = ?`, [row.id]);
    throw Object.assign(new Error('Verification code has expired. Please request a new one.'), { code: 'EXPIRED' });
  }

  // Check attempts
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await run(`UPDATE otp_codes SET used = 1 WHERE id = ?`, [row.id]);
    throw Object.assign(new Error('Too many incorrect attempts. Please request a new code.'), { code: 'MAX_ATTEMPTS' });
  }

  if (row.code !== code) {
    await run(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
    const remaining = MAX_VERIFY_ATTEMPTS - (row.attempts + 1);
    throw Object.assign(new Error(`Incorrect code. ${remaining} attempt(s) remaining.`), { code: 'INVALID_CODE' });
  }

  // Mark as used
  await run(`UPDATE otp_codes SET used = 1 WHERE id = ?`, [row.id]);
  return true;
}

// ---------------------------------------------------------------------------
// Send Email OTP
// ---------------------------------------------------------------------------
async function sendEmailOtp(email, code, purpose = 'signup') {
  const subject = purpose === 'reset' ? 'Your Handbook password reset code' : 'Verify your Handbook account';
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #fff; border-radius: 8px; border: 1px solid #e0e0e0;">
      <h2 style="color: #1877f2; margin-bottom: 8px;">Handbook</h2>
      <p style="color: #333; font-size: 15px;">Your verification code is:</p>
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1877f2; text-align: center; padding: 20px 0;">${code}</div>
      <p style="color: #666; font-size: 13px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 16px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  // ── Method 1: Brevo API (best for Render — HTTPS port 443, any recipient) ──
  const sentViaBrevo = await sendViaBrevo(email, subject, body);
  if (sentViaBrevo) return;

  // ── Method 2: Resend API (HTTPS port 443 — works even when SMTP is blocked) ──
  const sentViaApi = await sendViaResend(email, subject, body);
  if (sentViaApi) return;

  // ── Method 2: SMTP (nodemailer) ──
  const transporter = getTransporter();

  if (!transporter) {
    // No SMTP configured — MOCK MODE
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║  📧  MOCK EMAIL (no SMTP configured)   ║`);
    console.log(`║  To: ${email.padEnd(34)}║`);
    console.log(`║  Subject: ${subject.substring(0, 30).padEnd(30)}║`);
    console.log(`║  OTP Code: ${code.padEnd(29)}║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    return;
  }

  try {
    await Promise.race([
      transporter.sendMail({
        from: `"Handbook" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject,
        html: body,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP Timeout')), 12000))
    ]);
    console.log(`[OTP] Email sent to ${email} via SMTP`);
  } catch (err) {
    // ── Method 3: Mock (console fallback) ──
    console.error(`[OTP] SMTP also failed for ${email} (${err.message}).`);
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║  📧  MOCK EMAIL (all methods failed)   ║`);
    console.log(`║  To: ${email.padEnd(34)}║`);
    console.log(`║  Subject: ${subject.substring(0, 30).padEnd(30)}║`);
    console.log(`║  OTP Code: ${code.padEnd(29)}║`);
    console.log(`╚════════════════════════════════════════╝\n`);
  }
}


// ---------------------------------------------------------------------------
// Send SMS OTP
// ---------------------------------------------------------------------------
async function sendSmsOtp(phone, code, purpose = 'signup') {
  const client = getTwilioClient();
  const message = purpose === 'reset'
    ? `Your Handbook password reset code is: ${code}. Expires in 10 minutes.`
    : `Your Handbook verification code is: ${code}. Expires in 10 minutes.`;

  if (!client) {
    // MOCK MODE
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║  📱  MOCK SMS (no Twilio configured)   ║`);
    console.log(`║  To: ${phone.padEnd(35)}║`);
    console.log(`║  OTP Code: ${code.padEnd(29)}║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    return;
  }

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    console.log(`[OTP] SMS sent to ${phone}`);
  } catch (err) {
    console.error(`[OTP] SMS delivery failed for ${phone}:`, err.message);
    throw Object.assign(new Error('Failed to send SMS. Please try again.'), { code: 'DELIVERY_FAILED' });
  }
}

// ---------------------------------------------------------------------------
// Public: Send OTP to email or phone
// ---------------------------------------------------------------------------
async function sendOtp(identifier, purpose = 'signup') {
  const code = await generateOtp(identifier, purpose);
  const isPhone = /^\+?[0-9\s\-().]{7,15}$/.test(identifier);

  if (isPhone) {
    await sendSmsOtp(identifier, code, purpose);
  } else {
    await sendEmailOtp(identifier, code, purpose);
  }

  return { sent: true };
}

module.exports = { sendOtp, verifyOtp };
