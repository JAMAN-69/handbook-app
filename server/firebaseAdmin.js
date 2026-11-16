'use strict';

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');

let authInstance = null;
let isMock = false;

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : null;

if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(serviceAccountPath);
    const app = initializeApp({
      credential: cert(serviceAccount)
    });
    authInstance = getAuth(app);
    console.log('[Firebase Admin] Initialized successfully with service account key.');
  } catch (err) {
    console.error('[Firebase Admin] Initialization failed:', err.message);
    console.warn('[Firebase Admin] Falling back to MOCK MODE.');
    isMock = true;
  }
} else {
  console.warn(`[Firebase Admin] Service account JSON not found at: ${serviceAccountPath || 'undefined'}`);
  console.warn('[Firebase Admin] Running in MOCK MODE for development. Client can send mock tokens.');
  isMock = true;
}

/**
 * Verify a Firebase ID token sent from the client
 * @param {string} idToken 
 * @returns {Promise<{phone_number: string}>}
 */
async function verifyFirebaseToken(idToken) {
  if (isMock || !authInstance) {
    console.log(`[Firebase Admin] (Mock Verification) Token received: "${idToken}"`);
    // Allow mock tokens in the format "mock-token-phone_number"
    if (idToken && idToken.startsWith('mock-token-')) {
      const phone = idToken.replace('mock-token-', '');
      return { phone_number: phone };
    }
    throw new Error('Invalid mock verification token. Use format "mock-token-<phone_number>" for development.');
  }

  try {
    const decodedToken = await authInstance.verifyIdToken(idToken);
    if (!decodedToken.phone_number) {
      throw new Error('Token does not contain a verified phone number.');
    }
    return decodedToken;
  } catch (err) {
    console.error('[Firebase Admin] Token verification failed:', err.message);
    throw new Error('Verification failed. Invalid or expired token.');
  }
}

module.exports = { verifyFirebaseToken, isMock: () => isMock };
