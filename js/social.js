/**
 * Social Module — Follow System & Suggestions
 * Handles follow/unfollow actions, follower/following queries,
 * mutual followers, "People You May Know" suggestions,
 * and the right sidebar with trending hashtags.
 */
const Social = {

  init() {
    // Module ready
  },

  // ── Follow a user ──────────────────────────────────────────────────
  followUser(targetUserId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser || currentUser.id === targetUserId) return false;

    if (!store.following) store.following = {};
    if (!store.followers) store.followers = {};

    // Add to current user's following list
    if (!store.following[currentUser.id]) store.following[currentUser.id] = [];
    if (!store.following[currentUser.id].includes(targetUserId)) {
      store.following[currentUser.id].push(targetUserId);
    }

    // Add to target user's followers list
    if (!store.followers[targetUserId]) store.followers[targetUserId] = [];
    if (!store.followers[targetUserId].includes(currentUser.id)) {
      store.followers[targetUserId].push(currentUser.id);
    }

    // Create notification
    if (typeof Notifications !== 'undefined') {
      Notifications.createNotification('follow', {
        fromUserId: currentUser.id,
        targetUserId: targetUserId
      });
    }

    // Update all follow buttons for this user on the page
    this._updateFollowButtons(targetUserId, true);

    return true;
  },

  // ── Unfollow a user ────────────────────────────────────────────────
  unfollowUser(targetUserId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return false;

    // Remove from current user's following list
    if (store.following?.[currentUser.id]) {
      const idx = store.following[currentUser.id].indexOf(targetUserId);
      if (idx !== -1) store.following[currentUser.id].splice(idx, 1);
    }

    // Remove from target user's followers list
    if (store.followers?.[targetUserId]) {
      const idx = store.followers[targetUserId].indexOf(currentUser.id);
      if (idx !== -1) store.followers[targetUserId].splice(idx, 1);
    }

    this._updateFollowButtons(targetUserId, false);

    return true;
  },

  // ── Check if current user follows target ───────────────────────────
  isFollowing(targetUserId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return false;

    return (store.following?.[currentUser.id] || []).includes(targetUserId);
  },

  // ── Get followers of a user ────────────────────────────────────────
  getFollowers(userId) {
    const store = window.Store;
    if (!store) return [];
    return store.followers?.[userId] || store.getFollowers?.(userId) || [];
  },

  // ── Get following of a user ────────────────────────────────────────
  getFollowing(userId) {
    const store = window.Store;
    if (!store) return [];
    return store.following?.[userId] || store.getFollowing?.(userId) || [];
  },

  // ── Get follower count ─────────────────────────────────────────────
  getFollowerCount(userId) {
    return this.getFollowers(userId).length;
  },

  // ── Get following count ────────────────────────────────────────────
  getFollowingCount(userId) {
    return this.getFollowing(userId).length;
  },

  // ── Get mutual followers ───────────────────────────────────────────
  getMutualFollowers(userId) {
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!currentUser || currentUser.id === userId) return [];

    const myFollowing = this.getFollowing(currentUser.id);
    const theirFollowers = this.getFollowers(userId);

    return myFollowing.filter(id => theirFollowers.includes(id));
  },

  // ── Render follow button ───────────────────────────────────────────
  renderFollowButton(userId) {
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!currentUser || currentUser.id === userId) return '';

    const following = this.isFollowing(userId);

    return `
      <button class="btn ${following ? 'btn-outline btn-following' : 'btn-primary'} follow-btn"
              data-action="${following ? 'unfollow' : 'follow'}"
              data-user-id="${userId}">
        ${following ? 'Following' : 'Follow'}
      </button>
    `;
  },

  // ── Render "People You May Know" suggestions ───────────────────────
  renderSuggestions() {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return '';

    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    const following = this.getFollowing(currentUser.id);

    // Get users the current user does NOT follow and is not themselves
    const allUsers = store.users || store.getAllUsers?.() || [];
    const suggestions = allUsers
      .filter(u => u.id !== currentUser.id && !following.includes(u.id))
      .slice(0, 5);

    if (suggestions.length === 0) return '';

    const cards = suggestions.map(user => {
      const mutuals = this.getMutualFollowers(user.id);
      const mutualText = mutuals.length > 0
        ? `<span class="suggestion-card__mutuals">${mutuals.length} mutual follower${mutuals.length !== 1 ? 's' : ''}</span>`
        : '';

      return `
        <div class="suggestion-card" data-user-id="${user.id}">
          <a href="#profile/${user.id}" class="suggestion-card__info">
            <img class="avatar avatar-sm" src="${user.avatar}" alt="${esc(user.fullName)}">
            <div class="suggestion-card__details">
              <span class="suggestion-card__name">${esc(user.fullName)}</span>
              ${mutualText}
            </div>
          </a>
          ${this.renderFollowButton(user.id)}
        </div>
      `;
    }).join('');

    return `
      <div class="sidebar-right__section">
        <h4 class="sidebar-right__heading">People You May Know</h4>
        <div class="suggestion-list">${cards}</div>
      </div>
    `;
  },

  // ── Render right sidebar ───────────────────────────────────────────
  renderRightSidebar() {
    // Return container shell. Content loaded asynchronously by loadRightSidebar()
    return `
      <div id="right-sidebar-container" style="display:flex; flex-direction:column; gap:16px; padding: 4px 8px;">
        
        <!-- Friend Requests Section (loaded dynamically) -->
        <div id="rs-friend-requests" class="sidebar-right__section d-none"></div>

        <!-- Suggestions Section (People You May Know) -->
        <div id="rs-suggestions">
          ${this.renderSuggestions()}
        </div>

        <!-- Birthdays Section (loaded dynamically) -->
        <div id="rs-birthdays" class="d-none" style="border-top:1px solid var(--color-border); padding-top:12px;"></div>

        <!-- Contacts Section (loaded dynamically) -->
        <div class="sidebar-right__section" style="border-top:1px solid var(--color-border); padding-top:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <h4 class="sidebar-right__heading" style="color:var(--text-secondary); font-size:14px; font-weight:600; margin:0;">Contacts</h4>
            <div style="display:flex; gap:8px;">
              <button class="btn-icon" style="font-size:11px; opacity:0.6; background:none; border:none; color:inherit; cursor:pointer;" title="Search"><i class="fas fa-search"></i></button>
              <button class="btn-icon" style="font-size:11px; opacity:0.6; background:none; border:none; color:inherit; cursor:pointer;" title="Options"><i class="fas fa-ellipsis-h"></i></button>
            </div>
          </div>
          <div id="rs-contacts" style="display:flex; flex-direction:column; gap:4px;">
            <!-- Loaded dynamically -->
          </div>
        </div>

        <!-- Footer -->
        ${this._renderFooter()}
      </div>
    `;
  },

  // ── Load dynamic sidebar data ──────────────────────────────────────
  async loadRightSidebar() {
    const container = document.getElementById('right-sidebar-container');
    if (!container) return;

    const currentUser = window.Auth?.getCurrentUser?.();
    if (!currentUser) return;

    // 1. Fetch and render incoming Friend Requests
    try {
      const res = await Api.get('/friends/requests');
      const requests = res.requests || [];
      const reqEl = document.getElementById('rs-friend-requests');
      
      if (reqEl) {
        if (requests.length > 0) {
          reqEl.classList.remove('d-none');
          reqEl.style.cssText = "border-bottom:1px solid var(--color-border); padding-bottom:12px; margin-bottom:4px;";
          const first = requests[0];
          const mutualText = first.mutualCount > 0 ? `${first.mutualCount} mutual friend${first.mutualCount !== 1 ? 's' : ''}` : 'Suggested for you';
          reqEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
              <h4 class="sidebar-right__heading" style="color:var(--text-secondary); font-size:14px; font-weight:600; margin:0;">Friend requests</h4>
              <a href="#friends" style="font-size:12px; color:var(--color-primary); text-decoration:none; font-weight:500;">See all</a>
            </div>
            <div style="display:flex; gap:12px;">
              <img src="${first.avatar}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; margin-top:2px;">
              <div style="flex:1;">
                <div style="font-weight:600; font-size:13.5px; color:var(--text-primary);">${window.Utils.escapeHtml(first.fullName)}</div>
                <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px;">${mutualText}</div>
                <div style="display:flex; gap:8px;">
                  <button class="btn btn-primary btn-sm rs-confirm-btn" data-user-id="${first.id}" style="flex:1; font-size:12px; padding:6px 0; border-radius:6px; font-weight:600; height:32px;">Confirm</button>
                  <button class="btn btn-ghost btn-sm rs-delete-btn" data-user-id="${first.id}" style="flex:1; font-size:12px; padding:6px 0; border-radius:6px; background:var(--color-bg-hover); font-weight:600; height:32px;">Delete</button>
                </div>
              </div>
            </div>
          `;
          
          reqEl.querySelector('.rs-confirm-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = e.target.closest('[data-user-id]').dataset.userId;
            try {
              await Api.post(`/friends/confirm/${uid}`);
              window.Utils.showToast('Friend request accepted!', 'success');
              this.loadRightSidebar();
            } catch {
              window.Utils.showToast('Could not accept request', 'error');
            }
          });
          reqEl.querySelector('.rs-delete-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = e.target.closest('[data-user-id]').dataset.userId;
            try {
              await Api.post(`/friends/decline/${uid}`);
              window.Utils.showToast('Request deleted', 'info');
              this.loadRightSidebar();
            } catch {
              window.Utils.showToast('Could not delete request', 'error');
            }
          });
        } else {
          reqEl.classList.add('d-none');
        }
      }
    } catch (err) {
      console.error('Failed to load friend requests in sidebar', err);
    }

    // 2. Fetch and render today's Birthdays (only real friends with matching dob)
    try {
      const res = await Api.get('/friends/birthdays');
      const birthdays = res.birthdays || [];
      const bEl = document.getElementById('rs-birthdays');
      if (bEl) {
        if (birthdays.length > 0) {
          bEl.classList.remove('d-none');
          const names = birthdays.slice(0, 2).map(b => `<strong>${window.Utils.escapeHtml(b.fullName)}</strong>`);
          const extra = birthdays.length > 2 ? ` and ${birthdays.length - 2} other${birthdays.length - 2 > 1 ? 's' : ''}` : '';
          const nameStr = names.length === 1 ? `${names[0]} has` : `${names.join(' and ')}${extra} have`;
          bEl.innerHTML = `
            <h4 class="sidebar-right__heading" style="color:var(--text-secondary); font-size:14px; font-weight:600; margin-bottom:8px;">Birthdays</h4>
            <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
              <span style="font-size:24px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.15));">🎁</span>
              <p style="font-size:13px; color:var(--text-secondary); margin:0; line-height:1.4;">${nameStr} a birthday today.</p>
            </div>
          `;
        } else {
          bEl.classList.add('d-none');
        }
      }
    } catch (err) {
      console.error('Failed to load birthdays in sidebar', err);
    }

    // 3. Fetch and render Contacts (accepted friends list)
    try {
      const res = await Api.get('/friends');
      const friends = res.friends || [];
      const contactsEl = document.getElementById('rs-contacts');
      
      if (contactsEl) {
        if (friends.length === 0) {
          contactsEl.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); padding:4px 8px;">No friends yet.</p>`;
        } else {
          contactsEl.innerHTML = friends.slice(0, 10).map(u => `
            <a href="#profile/${u.id}" style="display:flex; align-items:center; gap:12px; padding:6px 8px; border-radius:8px; text-decoration:none; color:inherit; transition:background 0.2s;" onmouseover="this.style.background='var(--color-bg-hover)'" onmouseout="this.style.background='transparent'">
              <div style="position:relative; width:34px; height:34px; flex-shrink:0;">
                <img src="${u.avatar}" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">
                <span style="position:absolute; bottom:0; right:0; width:9px; height:9px; background:#31a24c; border:2px solid var(--bg-card); border-radius:50%;"></span>
              </div>
              <span style="font-weight:500; font-size:13px; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${window.Utils.escapeHtml(u.fullName)}</span>
            </a>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load contacts in sidebar', err);
    }
  },

  // ── Footer ─────────────────────────────────────────────────────────
  _renderFooter() {
    return `
      <div class="sidebar-right__footer" style="margin-top:12px; border-top:1px solid var(--color-border); padding-top:12px; font-size:11px; color:var(--text-secondary); line-height:1.6;">
        <nav style="display:flex; flex-wrap:wrap; gap:4px 6px;">
          <a href="#about" style="color:inherit; text-decoration:none;">About</a> ·
          <a href="#privacy" style="color:inherit; text-decoration:none;">Privacy</a> ·
          <a href="#terms" style="color:inherit; text-decoration:none;">Terms</a> ·
          <a href="#help" style="color:inherit; text-decoration:none;">Help</a> ·
          <a href="#careers" style="color:inherit; text-decoration:none;">Careers</a>
        </nav>
        <p style="margin-top:8px; margin-bottom:0;">© ${new Date().getFullYear()} Handbook</p>
      </div>
    `;
  },

  // ── Update follow buttons on the page ──────────────────────────────
  _updateFollowButtons(userId, isNowFollowing) {
    document.querySelectorAll(`.follow-btn[data-user-id="${userId}"]`).forEach(btn => {
      if (isNowFollowing) {
        btn.className = 'btn btn-outline btn-following follow-btn';
        btn.dataset.action = 'unfollow';
        btn.textContent = 'Following';
      } else {
        btn.className = 'btn btn-primary follow-btn';
        btn.dataset.action = 'follow';
        btn.textContent = 'Follow';
      }
    });
  },

  // ── Global event delegation handler ────────────────────────────────
  handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;
    const userId = target.dataset.userId;

    if (action === 'follow' && userId) {
      this.followUser(userId);
      return true;
    }

    if (action === 'unfollow' && userId) {
      this.unfollowUser(userId);
      return true;
    }

    return false;
  }
};

// Expose globally
window.Social = Social;
