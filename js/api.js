/**
 * api.js — Handbook Frontend API Client
 *
 * Centralised wrapper for all fetch() calls to the backend.
 * - Automatically attaches JWT Authorization header
 * - Silently refreshes expired access tokens using the refresh token
 * - Handles 401 → logout flow
 */
(function () {
  'use strict';

  const BASE_URL = window.location.origin; // same origin (Express serves frontend)
  const API = `${BASE_URL}/api`;

  // -------------------------------------------------------------------------
  // Token storage (localStorage for persistence across tabs/refreshes)
  // -------------------------------------------------------------------------
  function getAccessToken() { return localStorage.getItem('hb_access_token'); }
  function getRefreshToken() { return localStorage.getItem('hb_refresh_token'); }
  function setTokens(access, refresh) {
    if (access) localStorage.setItem('hb_access_token', access);
    if (refresh) localStorage.setItem('hb_refresh_token', refresh);
  }
  function clearTokens() {
    localStorage.removeItem('hb_access_token');
    localStorage.removeItem('hb_refresh_token');
  }

  // -------------------------------------------------------------------------
  // Core fetch wrapper
  // -------------------------------------------------------------------------
  async function request(method, path, body = null, retry = true) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    let res = await fetch(`${API}${path}`, opts);

    // Auto-refresh on 401
    if (res.status === 401 && retry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request(method, path, body, false); // retry once
      } else {
        // Force logout
        clearTokens();
        document.dispatchEvent(new Event('auth:logout'));
        throw new Error('Session expired. Please log in again.');
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, code: data.code });
    return data;
  }

  async function tryRefreshToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const data = await fetch(`${API}/auth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).then(r => r.json());

      if (data.accessToken) {
        setTokens(data.accessToken, null);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Public API Methods
  // -------------------------------------------------------------------------
  const Api = {

    // -- Token Management --
    setTokens,
    clearTokens,
    getAccessToken,
    getRefreshToken,
    isLoggedIn: () => !!getAccessToken(),

    // -- OTP --
    sendOtp: (identifier, purpose = 'signup') =>
      request('POST', '/auth/otp/send', { identifier, purpose }),

    verifyOtp: (identifier, code, purpose = 'signup') =>
      request('POST', '/auth/otp/verify', { identifier, code, purpose }),

    // -- Auth --
    signup: (formData) =>
      request('POST', '/auth/signup', formData),

    login: (identifier, password) =>
      request('POST', '/auth/login', { identifier, password }),

    logout: async () => {
      const refreshToken = getRefreshToken();
      try { await request('POST', '/auth/logout', { refreshToken }, false); } catch (_) {}
      clearTokens();
    },

    refreshToken: tryRefreshToken,

    // -- Forgot Password --
    searchResetUser: (identifier) =>
      request('POST', '/auth/password/search', { identifier }),

    resetRequest: (identifier) =>
      request('POST', '/auth/password/reset-request', { identifier }),

    resetConfirm: (identifier, code, userId, firebaseIdToken) =>
      request('POST', '/auth/password/reset-confirm', { identifier, code, userId, firebaseIdToken }),

    forceResetPassword: (newPassword) =>
      request('POST', '/auth/password/force-reset', { newPassword }),

    getFirebaseConfig: () =>
      request('GET', '/auth/firebase-config'),

    // -- Profile --
    getMe: () =>
      request('GET', '/profile/me'),

    getProfile: (userId) =>
      request('GET', `/profile/${userId}`),

    updateProfile: (data) =>
      request('PUT', '/profile', data),

    changePassword: (currentPassword, newPassword) =>
      request('POST', '/profile/password', { currentPassword, newPassword }),

    deactivateAccount: (password) =>
      request('DELETE', '/profile/deactivate', { password }),

    // -- Posts --
    createPost: (data) =>
      request('POST', '/posts', data),

    getFeed: (page = 0, limit = 10) =>
      request('GET', `/posts/feed?page=${page}&limit=${limit}`),

    getPost: (postId) =>
      request('GET', `/posts/${postId}`),

    deletePost: (postId) =>
      request('DELETE', `/posts/${postId}`),

    editPost: (postId, data) =>
      request('PUT', `/posts/${postId}`, data),

    likePost: (postId, reaction = 'like') =>
      reaction
        ? request('POST', `/posts/${postId}/react`, { type: reaction })
        : request('POST', `/posts/${postId}/react`, { type: null }),

    getComments: (postId, page = 0, limit = 20) =>
      request('GET', `/posts/${postId}/comments?page=${page}&limit=${limit}`),

    addComment: (postId, content, parentId = null) =>
      request('POST', `/posts/${postId}/comments`, { content, parentId }),

    getUserPosts: (userId, page = 0, limit = 10) =>
      request('GET', `/posts/user/${userId}?page=${page}&limit=${limit}`),

    toggleBookmark: (postId) =>
      request('POST', `/posts/${postId}/bookmark`),

    getSavedPosts: (page = 0, limit = 10) =>
      request('GET', `/posts/saved/all?page=${page}&limit=${limit}`),

    // -- Users & Follows --
    getUserProfile: (username) =>
      request('GET', `/users/${username}`),

    followUser: (userId) =>
      request('POST', `/users/${userId}/follow`),

    unfollowUser: (userId) =>
      request('DELETE', `/users/${userId}/follow`),

    getFollowers: (userId) =>
      request('GET', `/users/${userId}/followers`),

    getFollowing: (userId) =>
      request('GET', `/users/${userId}/following`),

    // -- Search & Explore --
    searchUsers: (query) =>
      request('GET', `/search/users?q=${encodeURIComponent(query)}`),

    searchPosts: (query) =>
      request('GET', `/search/posts?q=${encodeURIComponent(query)}`),

    searchHashtags: (query) =>
      request('GET', `/search/hashtags?q=${encodeURIComponent(query)}`),

    getTrendingHashtags: () =>
      request('GET', '/search/trending'),

    // -- Notifications --
    getNotifications: (page = 0, limit = 20) =>
      request('GET', `/notifications?page=${page}&limit=${limit}`),

    getNotificationCount: () =>
      request('GET', '/notifications/count'),

    markNotificationRead: (id) =>
      request('PATCH', `/notifications/${id}/read`),

    markAllNotificationsRead: () =>
      request('PATCH', '/notifications/read-all'),

    // -- Generic Methods --
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path, body) => request('DELETE', path, body),
  };

  window.Api = Api;
})();
