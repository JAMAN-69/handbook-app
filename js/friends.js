/**
 * Friends Module — Complete Friends System
 * Handles friend requests, confirmations, suggestions, and friend list.
 */
const Friends = {
  init() {
    // nothing needed on startup
  },

  // ── Render full friends page ───────────────────────────────────────
  async renderFriendsPage() {
    return `
      <div class="friends-page" id="friends-page">
        <div class="friends-page__header">
          <h1 class="friends-page__title"><i class="fas fa-user-friends"></i> Friends</h1>
          <div class="friends-page__tabs">
            <button class="friends-tab friends-tab--active" data-action="switch-friends-tab" data-tab="requests">Friend Requests</button>
            <button class="friends-tab" data-action="switch-friends-tab" data-tab="suggestions">People You May Know</button>
            <button class="friends-tab" data-action="switch-friends-tab" data-tab="all-friends">All Friends</button>
          </div>
        </div>
        <div class="friends-page__content" id="friends-tab-content">
          ${this._renderLoadingSkeleton()}
        </div>
      </div>
    `;
  },

  async loadTab(tab) {
    const content = document.getElementById('friends-tab-content');
    if (!content) return;
    content.innerHTML = this._renderLoadingSkeleton();

    try {
      if (tab === 'requests') {
        const data = await Api.get('/friends/requests');
        content.innerHTML = this._renderRequestsTab(data.requests || []);
      } else if (tab === 'suggestions') {
        const data = await Api.get('/friends/suggestions');
        content.innerHTML = this._renderSuggestionsTab(data.suggestions || []);
      } else if (tab === 'all-friends') {
        const data = await Api.get('/friends');
        content.innerHTML = this._renderAllFriendsTab(data.friends || []);
      }
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>Failed to load. Please try again.</p></div>`;
    }
  },

  _renderRequestsTab(requests) {
    if (!requests.length) {
      return `<div class="empty-state"><div class="empty-state__icon">👥</div><h3>No Friend Requests</h3><p>When people send you friend requests, you'll see them here.</p></div>`;
    }
    return `
      <div class="friends-section">
        <h2 class="friends-section__title">Friend Requests <span class="badge-count">${requests.length}</span></h2>
        <div class="friends-grid">
          ${requests.map(u => this._renderRequestCard(u)).join('')}
        </div>
      </div>
    `;
  },

  _renderRequestCard(user) {
    const name = window.Utils.escapeHtml(user.fullName || user.username);
    const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1877f2&color=fff&size=80`;
    return `
      <div class="friend-card" id="friend-card-${user.id}">
        <a href="#profile/${user.id}" class="friend-card__avatar-link">
          <img src="${avatar}" alt="${name}" class="friend-card__avatar">
        </a>
        <div class="friend-card__info">
          <a href="#profile/${user.id}" class="friend-card__name">${name}</a>
          ${user.mutualCount ? `<span class="friend-card__mutual">${user.mutualCount} mutual friend${user.mutualCount > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="friend-card__actions">
          <button class="btn btn-primary btn-sm" data-action="confirm-friend" data-user-id="${user.id}">
            <i class="fas fa-check"></i> Confirm
          </button>
          <button class="btn btn-ghost btn-sm" data-action="decline-friend" data-user-id="${user.id}">
            Delete
          </button>
        </div>
      </div>
    `;
  },

  _renderSuggestionsTab(suggestions) {
    if (!suggestions.length) {
      return `<div class="empty-state"><div class="empty-state__icon">🔍</div><h3>No Suggestions</h3><p>We'll suggest people you may know here.</p></div>`;
    }
    return `
      <div class="friends-section">
        <h2 class="friends-section__title">People You May Know</h2>
        <div class="friends-grid">
          ${suggestions.map(u => this._renderSuggestionCard(u)).join('')}
        </div>
      </div>
    `;
  },

  _renderSuggestionCard(user) {
    const name = window.Utils.escapeHtml(user.fullName || user.username);
    const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1877f2&color=fff&size=80`;
    return `
      <div class="friend-card" id="friend-card-${user.id}">
        <a href="#profile/${user.id}" class="friend-card__avatar-link">
          <img src="${avatar}" alt="${name}" class="friend-card__avatar">
        </a>
        <div class="friend-card__info">
          <a href="#profile/${user.id}" class="friend-card__name">${name}</a>
          ${user.mutualCount ? `<span class="friend-card__mutual">${user.mutualCount} mutual friend${user.mutualCount > 1 ? 's' : ''}</span>` : '<span class="friend-card__mutual">Suggested for you</span>'}
        </div>
        <div class="friend-card__actions">
          <button class="btn btn-primary btn-sm" data-action="add-friend" data-user-id="${user.id}">
            <i class="fas fa-user-plus"></i> Add Friend
          </button>
          <button class="btn btn-ghost btn-sm" data-action="dismiss-suggestion" data-user-id="${user.id}">
            Remove
          </button>
        </div>
      </div>
    `;
  },

  _renderAllFriendsTab(friends) {
    if (!friends.length) {
      return `<div class="empty-state"><div class="empty-state__icon">🤝</div><h3>No Friends Yet</h3><p>Start connecting with people you know!</p></div>`;
    }
    return `
      <div class="friends-section">
        <h2 class="friends-section__title">All Friends <span class="badge-count">${friends.length}</span></h2>
        <div class="friends-grid">
          ${friends.map(u => this._renderFriendCard(u)).join('')}
        </div>
      </div>
    `;
  },

  _renderFriendCard(user) {
    const name = window.Utils.escapeHtml(user.fullName || user.username);
    const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1877f2&color=fff&size=80`;
    return `
      <div class="friend-card" id="friend-card-${user.id}">
        <a href="#profile/${user.id}" class="friend-card__avatar-link">
          <img src="${avatar}" alt="${name}" class="friend-card__avatar">
        </a>
        <div class="friend-card__info">
          <a href="#profile/${user.id}" class="friend-card__name">${name}</a>
        </div>
        <div class="friend-card__actions">
          <a href="#chat/${user.id}" class="btn btn-ghost btn-sm">
            <i class="fas fa-comment"></i> Message
          </a>
          <button class="btn btn-ghost btn-sm btn-danger" data-action="unfriend" data-user-id="${user.id}">
            Unfriend
          </button>
        </div>
      </div>
    `;
  },

  _renderLoadingSkeleton() {
    return `
      <div class="friends-grid">
        ${Array(6).fill(0).map(() => `
          <div class="friend-card skeleton-card">
            <div class="skeleton skeleton--circle" style="width:80px;height:80px;border-radius:50%;"></div>
            <div style="width:100%;padding:8px;">
              <div class="skeleton skeleton--line skeleton--w60" style="margin-bottom:8px;"></div>
              <div class="skeleton skeleton--line skeleton--w40"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ── Handle friend action events ────────────────────────────────────
  async handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;
    const userId = target.dataset.userId;

    if (action === 'add-friend') {
      target.disabled = true;
      target.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        await Api.post(`/friends/request/${userId}`);
        target.innerHTML = '<i class="fas fa-check"></i> Request Sent';
        target.classList.remove('btn-primary');
        target.classList.add('btn-ghost');
        target.disabled = false;
        target.dataset.action = 'cancel-friend-request';
        window.Utils.showToast('Friend request sent!', 'success');
      } catch (err) {
        target.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
        target.disabled = false;
        window.Utils.showToast(err.message || 'Could not send request', 'error');
      }
      return true;
    }

    if (action === 'cancel-friend-request') {
      try {
        await Api.delete(`/friends/remove/${userId}`);
        target.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
        target.classList.add('btn-primary');
        target.classList.remove('btn-ghost');
        target.dataset.action = 'add-friend';
        window.Utils.showToast('Friend request cancelled.', 'info');
      } catch (err) {
        window.Utils.showToast('Failed to cancel.', 'error');
      }
      return true;
    }

    if (action === 'confirm-friend') {
      target.disabled = true;
      try {
        await Api.post(`/friends/confirm/${userId}`);
        const card = document.getElementById(`friend-card-${userId}`);
        if (card) {
          card.querySelector('.friend-card__actions').innerHTML = `
            <a href="#chat/${userId}" class="btn btn-ghost btn-sm"><i class="fas fa-comment"></i> Message</a>
            <span class="badge badge-success" style="padding:6px 12px;border-radius:20px;">Friends ✓</span>
          `;
        }
        window.Utils.showToast('Friend request accepted!', 'success');
      } catch (err) {
        target.disabled = false;
        window.Utils.showToast('Failed to confirm.', 'error');
      }
      return true;
    }

    if (action === 'decline-friend') {
      try {
        await Api.post(`/friends/decline/${userId}`);
        const card = document.getElementById(`friend-card-${userId}`);
        if (card) card.style.display = 'none';
        window.Utils.showToast('Request declined.', 'info');
      } catch (err) {
        window.Utils.showToast('Failed.', 'error');
      }
      return true;
    }

    if (action === 'unfriend') {
      if (!confirm('Are you sure you want to unfriend this person?')) return true;
      try {
        await Api.delete(`/friends/remove/${userId}`);
        const card = document.getElementById(`friend-card-${userId}`);
        if (card) card.style.opacity = '0.4';
        window.Utils.showToast('Unfriended.', 'info');
      } catch (err) {
        window.Utils.showToast('Failed.', 'error');
      }
      return true;
    }

    if (action === 'dismiss-suggestion') {
      const card = document.getElementById(`friend-card-${userId}`);
      if (card) {
        card.style.transform = 'scale(0.9)';
        card.style.opacity = '0';
        card.style.transition = 'all 0.3s ease';
        setTimeout(() => card.remove(), 300);
      }
      return true;
    }

    // Tab switching
    if (action === 'switch-friends-tab' || target.classList.contains('friends-tab')) {
      document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('friends-tab--active'));
      target.classList.add('friends-tab--active');
      this.loadTab(target.dataset.tab);
      return true;
    }

    return false;
  },

  // ── Get friend status for a user (used by profile page) ───────────
  async getFriendStatus(userId) {
    try {
      const data = await Api.get(`/friends/status/${userId}`);
      return data.status; // 'none', 'friends', 'sent', 'received'
    } catch {
      return 'none';
    }
  },

  // ── Render friend action button for profile page ───────────────────
  renderFriendButton(userId, status) {
    switch (status) {
      case 'friends':
        return `
          <button class="btn btn-ghost" data-action="unfriend" data-user-id="${userId}">
            <i class="fas fa-user-check"></i> Friends
          </button>
        `;
      case 'sent':
        return `
          <button class="btn btn-ghost" data-action="cancel-friend-request" data-user-id="${userId}">
            <i class="fas fa-user-clock"></i> Request Sent
          </button>
        `;
      case 'received':
        return `
          <button class="btn btn-primary" data-action="confirm-friend" data-user-id="${userId}">
            <i class="fas fa-user-plus"></i> Confirm Request
          </button>
        `;
      default:
        return `
          <button class="btn btn-primary" data-action="add-friend" data-user-id="${userId}">
            <i class="fas fa-user-plus"></i> Add Friend
          </button>
        `;
    }
  }
};

window.Friends = Friends;
