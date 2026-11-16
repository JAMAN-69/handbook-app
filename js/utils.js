// =============================================================================
// utils.js — Utility Functions for Handbook
// =============================================================================

const Utils = (() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // UUID Generation
  // ---------------------------------------------------------------------------
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------------------------------------------------------------------------
  // Time Formatting
  // ---------------------------------------------------------------------------
  function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 0) return 'just now';
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;

    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const month = months[date.getMonth()];
    const day = date.getDate();

    if (date.getFullYear() === now.getFullYear()) {
      return `${month} ${day}`;
    }
    return `${month} ${day}, ${date.getFullYear()}`;
  }

  // ---------------------------------------------------------------------------
  // Number Formatting
  // ---------------------------------------------------------------------------
  function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    num = Number(num);
    if (isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  }

  // ---------------------------------------------------------------------------
  // Simple Password Hashing (NOT for production)
  // ---------------------------------------------------------------------------
  function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    // Convert to hex and pad
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `hb_${hex}`;
  }

  // ---------------------------------------------------------------------------
  // HTML Sanitization (XSS Prevention)
  // ---------------------------------------------------------------------------
  function sanitizeHTML(str) {
    if (!str) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
      '/': '&#x2F;'
    };
    return String(str).replace(/[&<>"'/]/g, (s) => map[s]);
  }

  // ---------------------------------------------------------------------------
  // Hashtag Extraction
  // ---------------------------------------------------------------------------
  function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#[a-zA-Z0-9_]+/g);
    return matches ? [...new Set(matches.map((h) => h.toLowerCase()))] : [];
  }

  // ---------------------------------------------------------------------------
  // Format Post Content (clickable hashtags & links)
  // ---------------------------------------------------------------------------
  function formatPostContent(text) {
    if (!text) return '';
    let safe = sanitizeHTML(text);

    // Convert hashtags to clickable links
    safe = safe.replace(
      /#([a-zA-Z0-9_]+)/g,
      '<a href="#" class="hashtag" data-tag="$1">#$1</a>'
    );

    // Convert @mentions to clickable links
    safe = safe.replace(
      /@([a-zA-Z0-9_.]+)/g,
      '<a href="#" class="mention" data-username="$1">@$1</a>'
    );

    // Convert URLs to links
    safe = safe.replace(
      /(https?:&#x2F;&#x2F;[^\s<]+)/g,
      '<a href="$1" class="post-link" target="_blank" rel="noopener">$1</a>'
    );

    // Convert newlines to <br>
    safe = safe.replace(/\n/g, '<br>');

    return safe;
  }

  // ---------------------------------------------------------------------------
  // Debounce
  // ---------------------------------------------------------------------------
  function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ---------------------------------------------------------------------------
  // Throttle
  // ---------------------------------------------------------------------------
  function throttle(fn, limit = 300) {
    let inThrottle = false;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Avatar Generation (initials + color)
  // ---------------------------------------------------------------------------
  function generateAvatar(name, size = 40) {
    if (!name) name = 'User';
    const initials = name
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');

    const color = _nameToColor(name);

    return `<div class="avatar avatar-initials" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.floor(size * 0.4)}px;line-height:${size}px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:600;flex-shrink:0;text-transform:uppercase;">${initials}</div>`;
  }

  // Generate avatar as an inline data URL SVG for img tags
  function generateAvatarURL(name, size = 200) {
    if (!name) name = 'User';
    const initials = name
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');

    const color = _nameToColor(name);
    const fontSize = Math.floor(size * 0.4);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${color}" rx="${size / 2}"/>
      <text x="50%" y="50%" dy=".1em" fill="white" font-size="${fontSize}" font-family="Arial,sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="central">${initials}</text>
    </svg>`;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  function _nameToColor(name) {
    const colors = [
      '#1877f2', '#42b72a', '#f02849', '#1da1f2',
      '#6c5ce7', '#e17055', '#00b894', '#fdcb6e',
      '#e84393', '#0984e3', '#d63031', '#6c5ce7',
      '#00cec9', '#fab1a0', '#74b9ff', '#a29bfe'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Get just the color for a name
  function getAvatarColor(name) {
    return _nameToColor(name);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function validatePassword(password) {
    return typeof password === 'string' && password.length >= 6;
  }

  // ---------------------------------------------------------------------------
  // Text Truncation
  // ---------------------------------------------------------------------------
  function truncate(text, maxLength = 150) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength).trimEnd() + '...';
  }

  // ---------------------------------------------------------------------------
  // Create Element from HTML String
  // ---------------------------------------------------------------------------
  function createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  // ---------------------------------------------------------------------------
  // Toast Notification System
  // ---------------------------------------------------------------------------
  let _toastContainer = null;

  function _ensureToastContainer() {
    if (!_toastContainer || !document.body.contains(_toastContainer)) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'toast-container';
      _toastContainer.setAttribute('role', 'alert');
      _toastContainer.setAttribute('aria-live', 'polite');
      Object.assign(_toastContainer.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '10000',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none'
      });
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  function showToast(message, type = 'info') {
    const container = _ensureToastContainer();

    const colors = {
      info: { bg: '#1877f2', icon: 'ℹ️' },
      success: { bg: '#42b72a', icon: '✅' },
      error: { bg: '#f02849', icon: '❌' },
      warning: { bg: '#f7b928', icon: '⚠️' }
    };

    const config = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    Object.assign(toast.style, {
      background: config.bg,
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '14px',
      fontWeight: '500',
      pointerEvents: 'auto',
      cursor: 'pointer',
      transform: 'translateX(120%)',
      transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease',
      opacity: '0',
      maxWidth: '380px',
      minWidth: '260px'
    });

    toast.innerHTML = `<span style="font-size:18px">${config.icon}</span><span>${sanitizeHTML(message)}</span>`;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    // Auto-dismiss
    const dismiss = () => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, 4000);
  }

  // ---------------------------------------------------------------------------
  // Date Formatting
  // ---------------------------------------------------------------------------
  function formatDate(dateString) {
    const date = new Date(dateString);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function formatDateShort(dateString) {
    const date = new Date(dateString);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  // ---------------------------------------------------------------------------
  // Random Pick
  // ---------------------------------------------------------------------------
  function randomPick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------------------------------------------------------------------------
  // File to Data URL
  // ---------------------------------------------------------------------------
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file provided'));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------------------
  // Miscellaneous Helpers
  // ---------------------------------------------------------------------------

  // Generate a random date between two dates
  function randomDate(start, end) {
    return new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime())
    ).toISOString();
  }

  // Random integer between min (inclusive) and max (inclusive)
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Pluralize a word
  function pluralize(count, singular, plural) {
    return count === 1 ? singular : (plural || singular + 's');
  }

  // Capitalize first letter
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Simple deep clone
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    generateId,
    timeAgo,
    formatNumber,
    hashPassword,
    sanitizeHTML,
    escapeHtml: sanitizeHTML,
    extractHashtags,
    formatPostContent,
    debounce,
    throttle,
    generateAvatar,
    generateAvatarURL,
    getAvatarColor,
    validateEmail,
    validatePassword,
    truncate,
    createElement,
    showToast,
    formatDate,
    formatDateShort,
    formatNumber,
    randomPick,
    fileToDataURL,
    randomDate,
    randomInt,
    pluralize,
    capitalize,
    deepClone
  };
})();

// Expose globally
window.Utils = Utils;
