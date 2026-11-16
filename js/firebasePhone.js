/**
 * firebasePhone.js — Phone OTP via Backend (No Firebase Client SDK Required)
 *
 * Previously used Firebase Phone Auth client SDK which caused auth/invalid-api-key
 * errors on localhost. Now uses the backend OTP system directly (same as email OTP)
 * which is more reliable and works everywhere without any Firebase console setup.
 *
 * The backend sends SMS via Twilio (if configured) or logs the code to the
 * server console for development testing.
 */
(function () {
  'use strict';

  let _pendingPhone = null; // store phone number while waiting for code

  // -------------------------------------------------------------------------
  // Normalize phone to E.164 format
  // Bangladeshi numbers: 01XXXXXXXXX → +8801XXXXXXXXX
  // -------------------------------------------------------------------------
  function normalizePhone(phone) {
    let p = phone.replace(/[\s\-().]/g, '');
    if (!p.startsWith('+')) {
      if (/^0[0-9]{10}$/.test(p)) {
        p = '+88' + p;
      } else if (/^[0-9]{10,11}$/.test(p)) {
        p = '+' + p;
      }
    }
    return p;
  }

  // -------------------------------------------------------------------------
  // Public: Send phone OTP via backend (uses Twilio SMS or console mock)
  // Returns a fake "confirmationResult" compatible object for drop-in use
  // -------------------------------------------------------------------------
  async function sendPhoneOtp(phone) {
    const e164Phone = normalizePhone(phone);
    if (!e164Phone.startsWith('+') || e164Phone.length < 10) {
      throw new Error('সঠিক ফোন নম্বর দিন (যেমন: 01XXXXXXXXX বা +8801XXXXXXXXX)');
    }

    _pendingPhone = e164Phone;

    // Call backend OTP endpoint — same as email flow
    await Api.sendOtp(e164Phone, 'signup');

    // Return a mock confirmationResult object that confirmPhoneOtp can use
    return { _phone: e164Phone, _type: 'backend' };
  }

  // -------------------------------------------------------------------------
  // Public: Confirm the OTP code entered by user
  // Returns a fake idToken string that tells the backend "backend-otp-verified"
  // -------------------------------------------------------------------------
  async function confirmPhoneOtp(confirmationResult, code) {
    if (!confirmationResult || confirmationResult._type !== 'backend') {
      throw new Error('ভেরিফিকেশন শুরু হয়নি। নতুন কোড রিকোয়েস্ট করুন।');
    }
    // Return a special sentinel so backend knows to verify via OTP table
    // The actual otpCode will be sent in the signup/reset-confirm payload
    return 'backend-otp:' + code;
  }

  // -------------------------------------------------------------------------
  // Public: Re-send OTP
  // -------------------------------------------------------------------------
  async function resendPhoneOtp(phone) {
    return sendPhoneOtp(phone);
  }

  // -------------------------------------------------------------------------
  // Expose globally
  // -------------------------------------------------------------------------
  window.FirebasePhone = {
    sendPhoneOtp,
    confirmPhoneOtp,
    resendPhoneOtp,
    normalizePhone,
  };

})();

