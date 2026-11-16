/**
 * Notifications Module — Notification System
 * Handles notification creation, dropdown panel,
 * toast notifications, read/unread state, and
 * full notification page view.
 */
const Notifications = {
  _toastCount: 0,

  init() {
    const store = window.Store;
    if (store && !store.notifications) store.notifications = [];
  },

  // ── Create a notification ──────────────────────────────────────────
  createNotification(type, data) {
    const store = window.Store;
    if (!store) return null;
    if (!store.notifications) store.notifications = [];

    const notification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: type, // 'like', 'comment', 'follow', 'share', 'message', 'mention'
      fromUserId: data.fromUserId,
      targetUserId: data.targetUserId,
      postId: data.postId || null,
      commentText: data.commentText || null,
      messagePreview: data.messagePreview || null,
      read: false,
      createdAt: new Date().toISOString()
    };

    store.notifications.unshift(notification);

    // Update badge count in header
    this._updateBadge();

    // Show toast notification for the target user if they're the current user
    const currentUser = window.Auth?.getCurrentUser?.();
    if (currentUser && notification.targetUserId === currentUser.id) {
      this.showToastNotification(this._buildToastFromNotification(notification));
    }

    return notification;
  },

  // ── Get all notifications for current user ─────────────────────────
  getNotifications() {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return [];

    return (store.notifications || [])
      .filter(n => n.targetUserId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // ── Get unread count ───────────────────────────────────────────────
  getUnreadCount() {
    return this.getNotifications().filter(n => !n.read).length;
  },

  // ── Mark notification as read ──────────────────────────────────────
  markAsRead(notificationId) {
    const store = window.Store;
    if (!store) return;

    const notif = (store.notifications || []).find(n => n.id === notificationId);
    if (notif) {
      notif.read = true;
      this._updateBadge();
    }
  },

  // ── Mark all as read ───────────────────────────────────────────────
  markAllAsRead() {
    const notifications = this.getNotifications();
    notifications.forEach(n => { n.read = true; });
    this._updateBadge();

    // Update UI
    document.querySelectorAll('.notification-item--unread').forEach(el => {
      el.classList.remove('notification-item--unread');
    });
    document.querySelectorAll('.notification-item__dot').forEach(el => {
      el.remove();
    });
  },

  // ── Render notification dropdown ───────────────────────────────────
  renderNotificationDropdown() {
    const notifications = this.getNotifications().slice(0, 10);
    const unreadCount = this.getUnreadCount();

    const items = notifications.length > 0
      ? notifications.map(n => this.renderNotificationItem(n)).join('')
      : '<div class="notification-empty"><p>No notifications yet</p></div>';

    return `
      <div class="notification-dropdown" id="notification-dropdown">
        <div class="notification-dropdown__header">
          <h4 class="notification-dropdown__title">Notifications</h4>
          ${unreadCount > 0
            ? '<button class="notification-dropdown__mark-read" data-action="mark-all-read">Mark all as read</button>'
            : ''
          }
        </div>
        <div class="notification-dropdown__list">
          ${items}
        </div>
        <div class="notification-dropdown__footer">
          <a href="#notifications" class="notification-dropdown__see-all" data-action="see-all-notifications">
            See All Notifications
          </a>
        </div>
      </div>
    `;
  },

  // ── Render a single notification item ──────────────────────────────
  renderNotificationItem(notification) {
    const store = window.Store;
    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    const fromUser = store?.getUserById?.(notification.fromUserId);
    if (!fromUser) return '';

    const timeAgo = window.Utils?.timeAgo?.(notification.createdAt) || '';
    const message = this._getNotificationMessage(notification, fromUser);
    const icon = this._getNotificationIcon(notification.type);
    const isUnread = !notification.read;

    return `
      <div class="notification-item ${isUnread ? 'notification-item--unread' : ''}"
           data-action="read-notification" data-notification-id="${notification.id}"
           data-link="${this._getNotificationLink(notification)}">
        <div class="notification-item__avatar-wrap">
          <img class="avatar avatar-sm" src="${fromUser.avatar}" alt="${esc(fromUser.fullName)}">
          <span class="notification-item__icon">${icon}</span>
        </div>
        <div class="notification-item__content">
          <p class="notification-item__message">${message}</p>
          <span class="notification-item__time">${timeAgo}</span>
        </div>
        ${isUnread ? '<span class="notification-item__dot"></span>' : ''}
      </div>
    `;
  },

  // ── Toast notification (popup at top-right) ────────────────────────
  showToastNotification(toastData) {
    if (!toastData) return;

    // Ensure toast container exists
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const id = 'toast_' + (++this._toastCount);
    const typeClass = `toast--${toastData.type || 'info'}`;

    const toast = document.createElement('div');
    toast.className = `toast ${typeClass}`;
    toast.id = id;
    toast.innerHTML = `
      <div class="toast__icon">${toastData.icon || 'ℹ️'}</div>
      <div class="toast__content">
        <p class="toast__message">${window.Utils?.escapeHtml?.(toastData.message) || toastData.message}</p>
      </div>
      <button class="toast__close btn-icon" data-action="close-toast" data-toast-id="${id}">&times;</button>
    `;

    container.appendChild(toast);

    // Trigger slide-in animation
    requestAnimationFrame(() => {
      toast.classList.add('toast--visible');
    });

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      this._dismissToast(id);
    }, 4000);
  },

  // ── Render full notifications page ─────────────────────────────────
  renderNotificationsPage() {
    const notifications = this.getNotifications();
    const unreadCount = this.getUnreadCount();

    const items = notifications.length > 0
      ? notifications.map(n => this.renderNotificationItem(n)).join('')
      : `
        <div class="empty-state card">
          <div class="empty-state__icon">🔔</div>
          <h3>No notifications</h3>
          <p>When someone interacts with your posts or profile, you'll see it here.</p>
        </div>
      `;

    return `
      <div class="notifications-page">
        <div class="notifications-page__header card">
          <h2>Notifications</h2>
          <div class="notifications-page__actions">
            ${unreadCount > 0
              ? `<span class="badge badge--primary">${unreadCount} new</span>
                 <button class="btn btn-outline btn-sm" data-action="mark-all-read">Mark all as read</button>`
              : '<span class="text-muted">All caught up!</span>'
            }
          </div>
        </div>
        <div class="notifications-page__list">
          ${items}
        </div>
      </div>
    `;
  },

  // ── Private helpers ────────────────────────────────────────────────
  _getNotificationMessage(notification, fromUser) {
    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    const name = `<strong>${esc(fromUser.fullName)}</strong>`;

    switch (notification.type) {
      case 'like':
        return `${name} liked your post`;
      case 'comment':
        const preview = notification.commentText
          ? `: "${esc(notification.commentText)}"`
          : '';
        return `${name} commented on your post${preview}`;
      case 'follow':
        return `${name} started following you`;
      case 'share':
        return `${name} shared your post`;
      case 'message':
        const msgPreview = notification.messagePreview
          ? `: "${esc(notification.messagePreview)}"`
          : '';
        return `${name} sent you a message${msgPreview}`;
      case 'mention':
        return `${name} mentioned you in a post`;
      default:
        return `${name} interacted with your content`;
    }
  },

  _getNotificationIcon(type) {
    const icons = {
      like: '👍',
      comment: '💬',
      follow: '👤',
      share: '↗️',
      message: '✉️',
      mention: '@'
    };
    return icons[type] || '🔔';
  },

  _getNotificationLink(notification) {
    switch (notification.type) {
      case 'like':
      case 'comment':
      case 'share':
      case 'mention':
        return notification.postId ? `#post/${notification.postId}` : '#';
      case 'follow':
        return `#profile/${notification.fromUserId}`;
      case 'message':
        return `#chat/${notification.fromUserId}`;
      default:
        return '#';
    }
  },

  _buildToastFromNotification(notification) {
    const store = window.Store;
    const fromUser = store?.getUserById?.(notification.fromUserId);
    if (!fromUser) return null;

    const name = fromUser.fullName || 'Someone';
    const messages = {
      like: `${name} liked your post`,
      comment: `${name} commented on your post`,
      follow: `${name} started following you`,
      share: `${name} shared your post`,
      message: `${name} sent you a message`,
      mention: `${name} mentioned you in a post`
    };

    const typeColors = {
      like: 'info',
      comment: 'info',
      follow: 'success',
      share: 'info',
      message: 'message',
      mention: 'warning'
    };

    return {
      type: typeColors[notification.type] || 'info',
      message: messages[notification.type] || `${name} interacted with your content`,
      icon: this._getNotificationIcon(notification.type)
    };
  },

  _updateBadge() {
    const count = this.getUnreadCount();
    const badges = document.querySelectorAll('.notification-badge');
    badges.forEach(badge => {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });
  },

  _dismissToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    toast.classList.remove('toast--visible');
    toast.classList.add('toast--leaving');

    setTimeout(() => {
      toast.remove();
      // Clean up container if empty
      const container = document.getElementById('toast-container');
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 300);
  },

  // ── Global event delegation handler ────────────────────────────────
  handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;

    if (action === 'toggle-notifications') {
      let dropdown = document.getElementById('notification-dropdown');
      if (dropdown) {
        dropdown.remove();
      } else {
        const btn = target;
        const rect = btn.getBoundingClientRect();

        const wrapper = document.createElement('div');
        wrapper.id = 'notification-dropdown-wrap';
        wrapper.className = 'notification-dropdown-wrap';
        wrapper.innerHTML = this.renderNotificationDropdown();
        wrapper.style.position = 'fixed';
        wrapper.style.top = (rect.bottom + 4) + 'px';
        wrapper.style.right = (window.innerWidth - rect.right) + 'px';
        wrapper.style.zIndex = '1000';

        document.body.appendChild(wrapper);

        // Close on outside click
        const closeHandler = (ev) => {
          if (!wrapper.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
            wrapper.remove();
            document.removeEventListener('click', closeHandler);
          }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
      }
      return true;
    }

    if (action === 'mark-all-read') {
      this.markAllAsRead();
      return true;
    }

    if (action === 'read-notification') {
      const notifId = target.dataset.notificationId;
      const link = target.dataset.link;
      if (notifId) this.markAsRead(notifId);
      target.classList.remove('notification-item--unread');
      const dot = target.querySelector('.notification-item__dot');
      if (dot) dot.remove();
      if (link && link !== '#') location.hash = link;
      return true;
    }

    if (action === 'close-toast') {
      const toastId = target.dataset.toastId;
      if (toastId) this._dismissToast(toastId);
      return true;
    }

    if (action === 'see-all-notifications') {
      const dropdown = document.getElementById('notification-dropdown-wrap');
      if (dropdown) dropdown.remove();
      // Navigation will be handled by hash change
      return true;
    }

    return false;
  }
};

// Expose globally
window.Notifications = Notifications;
