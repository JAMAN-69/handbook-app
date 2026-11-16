/**
 * Profile Module
 * Handles profile page rendering, avatar/cover upload, edit profile modal,
 * and loading the user's actual posts from the API.
 */
const Profile = {
  _currentUserId: null,
  _profilePage: 1,
  _profileHasMore: true,
  _profileLoading: false,

  init() {
    this._setupGlobalListeners();
  },

  _setupGlobalListeners() {
    document.addEventListener('click', (e) => {
      // Edit profile button
      if (e.target.closest('.edit-profile-btn')) {
        this.showEditModal();
        return;
      }

      // Close any open modal
      if (e.target.matches('.profile-modal-overlay') || e.target.closest('.profile-modal-close')) {
        const modal = document.querySelector('.profile-modal-overlay');
        if (modal) modal.remove();
        return;
      }

      // Save profile
      if (e.target.closest('#profile-save-btn')) {
        this._handleSaveProfile();
        return;
      }

      // Profile tab switching
      const tab = e.target.closest('.profile-tab');
      if (tab) {
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        this._switchTab(tabName);
        return;
      }

      // Close dropdowns when clicking outside
      if (!e.target.closest('.profile-avatar-container') && !e.target.closest('.cover-photo-container')) {
        document.querySelectorAll('.profile-dropdown').forEach(d => d.remove());
      }

      // Profile avatar click / edit dropdown
      const avatarTrig = e.target.closest('.profile-avatar-lg') || e.target.closest('.edit-avatar-btn') || e.target.closest('.profile-avatar-container');
      if (avatarTrig) {
        // Prevent default file input click if clicking camera icon, we handle via dropdown
        if (e.target.closest('.edit-avatar-btn') && !e.target.closest('.profile-dropdown')) {
          e.preventDefault();
        }
        const container = document.querySelector('.profile-avatar-container');
        const currentUser = Auth.getCurrentUser();
        const isOwn = currentUser && currentUser.id === this._currentUserId;
        if (isOwn) {
          if (!e.target.closest('.profile-dropdown')) {
            this.toggleAvatarDropdown(container);
          }
        } else {
          // Open other user's avatar in viewer
          const avatarEl = document.querySelector('.profile-avatar-lg');
          if (avatarEl && avatarEl.src) {
            this.seePhoto(avatarEl.src);
          }
        }
        return;
      }

      // Cover photo click / edit dropdown
      const coverTrig = e.target.closest('.cover-photo') || e.target.closest('.edit-cover-btn') || e.target.closest('.cover-photo-container');
      if (coverTrig) {
        if (e.target.closest('.edit-cover-btn') && !e.target.closest('.profile-dropdown')) {
          e.preventDefault();
        }
        const container = document.querySelector('.cover-photo-container');
        const currentUser = Auth.getCurrentUser();
        const isOwn = currentUser && currentUser.id === this._currentUserId;
        if (isOwn) {
          if (!e.target.closest('.profile-dropdown')) {
            this.toggleCoverDropdown(container);
          }
        } else {
          // Open other user's cover in viewer
          const coverEl = document.querySelector('.cover-photo');
          if (coverEl && coverEl.src) {
            this.seePhoto(coverEl.src);
          }
        }
        return;
      }

      // Follow/Unfollow
      if (e.target.closest('.profile-follow-btn')) {
        const btn = e.target.closest('.profile-follow-btn');
        const targetUserId = btn.dataset.userId;
        this._handleFollowToggle(btn, targetUserId);
        return;
      }
    });

    // Cover photo upload
    document.addEventListener('change', async (e) => {
      if (e.target.id === 'cover-file-input') {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          if (typeof Post !== 'undefined') {
            Post.renderPostCreatorModal({
              title: 'Update Cover Photo',
              defaultContent: 'updated their cover photo.',
              preloadedMedia: [{ url: dataUrl, type: 'image' }],
              profileUpdateType: 'cover'
            });
          }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      }

      if (e.target.id === 'avatar-file-input') {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          if (typeof Post !== 'undefined') {
            Post.renderPostCreatorModal({
              title: 'Update Profile Picture',
              defaultContent: 'updated their profile picture.',
              preloadedMedia: [{ url: dataUrl, type: 'image' }],
              profileUpdateType: 'avatar'
            });
          }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      }
    });
  },

  // ── Upload avatar or cover photo ────────────────────────────────────
  async _uploadPhoto(file, type) {
    if (!file.type.startsWith('image/')) {
      Utils.showToast('Please select an image file.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      Utils.showToast('Image must be smaller than 10MB.', 'error');
      return;
    }

    Utils.showToast(`Uploading ${type === 'avatar' ? 'profile picture' : 'cover photo'}...`, 'info');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      try {
        const payload = type === 'avatar' ? { avatar: dataUrl } : { coverPhoto: dataUrl };
        const res = await Api.updateProfile(payload);

        // Update current user in Auth
        const currentUser = Auth.getCurrentUser();
        if (currentUser) {
          if (type === 'avatar') {
            currentUser.avatar = dataUrl;
            // Update avatar in header sidebar immediately
            document.querySelectorAll('.current-user-avatar').forEach(img => { img.src = dataUrl; });
            const profileAvatarEl = document.querySelector('.profile-avatar-lg');
            if (profileAvatarEl) profileAvatarEl.src = dataUrl;
          } else {
            currentUser.coverPhoto = dataUrl;
            const coverEl = document.querySelector('.cover-photo');
            if (coverEl) coverEl.src = dataUrl;
          }
          // Persist updated user in session
          if (typeof Store !== 'undefined' && Store.setCurrentUser) Store.setCurrentUser(currentUser);
        }
        Utils.showToast(`${type === 'avatar' ? 'Profile picture' : 'Cover photo'} updated!`, 'success');
      } catch (err) {
        Utils.showToast(err.message || 'Upload failed.', 'error');
      }
    };
    reader.readAsDataURL(file);
  },

  // ── Render the full profile page ────────────────────────────────────
  async renderProfilePage(userId) {
    this._currentUserId = userId;
    this._profilePage = 0;
    this._profileHasMore = true;

    const currentUser = Auth.getCurrentUser();
    const isOwn = currentUser && currentUser.id === userId;

    // Load profile data from API
    let user = null;
    try {
      const res = await Api.getProfile(userId);
      user = res.user || res;
    } catch (err) {
      return `<div class="empty-state card"><p>Could not load profile.</p></div>`;
    }

    if (!user) {
      return `<div class="not-found card"><h2>User not found</h2></div>`;
    }

    const esc = str => Utils?.escapeHtml?.(str) || (str || '');

    const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName || 'U')}&background=6366f1&color=fff&size=150`;
    const coverUrl = user.coverPhoto || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80';

    const followerCount = Utils.formatNumber(user.followersCount || 0);
    const followingCount = Utils.formatNumber(user.followingCount || 0);

    let actionButtons = '';
    if (isOwn) {
      actionButtons = `
        <button class="btn btn-secondary edit-profile-btn" id="edit-profile-btn">
          <i class="fas fa-pen"></i> Edit Profile
        </button>
      `;
    } else {
      const isFollowing = user.isFollowing || false;
      actionButtons = `
        <div id="profile-friend-btn-container" style="display:inline-block; margin-right:8px;"></div>
        <button class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} profile-follow-btn" data-user-id="${user.id}" id="profile-follow-btn">
          <i class="fas ${isFollowing ? 'fa-user-check' : 'fa-user-plus'}"></i>
          ${isFollowing ? 'Following' : 'Follow'}
        </button>
        <a href="#messages/${user.id}" class="btn btn-secondary" style="margin-left:8px;">
          <i class="fas fa-comment-dots"></i> Message
        </a>
      `;
    }

    const html = `
      <div class="profile-container">
        <!-- Hidden file inputs for photo uploads -->
        ${isOwn ? `
          <input type="file" id="avatar-file-input" accept="image/*" style="display:none;">
          <input type="file" id="cover-file-input" accept="image/*" style="display:none;">
        ` : ''}

        <!-- Profile Header Card -->
        <div class="card profile-header-card" style="overflow:visible; margin-bottom:var(--space-4);">
          <!-- Cover Photo -->
          <div class="cover-photo-container" style="position:relative; height:280px; background:#1a1a2e; border-radius:var(--radius-xl) var(--radius-xl) 0 0; overflow:hidden;">
            <img src="${coverUrl}" alt="Cover" class="cover-photo" style="width:100%; height:100%; object-fit:cover;">
            ${isOwn ? `
              <button class="edit-cover-btn" style="position:absolute; bottom:16px; right:16px; background:rgba(0,0,0,0.6); color:#fff; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:13px; backdrop-filter:blur(4px); transition:all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'">
                <i class="fas fa-camera"></i> Edit Cover Photo
              </button>
            ` : ''}
          </div>

          <!-- Avatar + Info -->
          <div class="profile-header-info" style="padding:0 var(--space-6) var(--space-5); position:relative;">
            <!-- Avatar -->
            <div class="profile-avatar-container" style="position:relative; display:inline-block; margin-top:-60px; margin-bottom:var(--space-3);">
              <img src="${avatarUrl}" alt="${esc(user.fullName)}" class="profile-avatar-lg" style="width:120px; height:120px; border-radius:50%; border:4px solid var(--bg-card, #1e1e2e); object-fit:cover; display:block;">
              ${user.isOnline ? `<div style="position:absolute; bottom:6px; right:6px; width:18px; height:18px; background:#22c55e; border-radius:50%; border:3px solid var(--bg-card, #1e1e2e);"></div>` : ''}
              ${isOwn ? `
                <button class="edit-avatar-btn" style="position:absolute; bottom:4px; right:4px; background:var(--color-primary, #6366f1); color:#fff; border:none; width:32px; height:32px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:13px; border:2px solid var(--bg-card, #1e1e2e); transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                  <i class="fas fa-camera"></i>
                </button>
              ` : ''}
            </div>

            <!-- Name + Stats + Actions -->
            <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:var(--space-4);">
              <div>
                <h1 style="font-size:1.6rem; font-weight:700; margin:0 0 4px; color:var(--text-primary);">${esc(user.fullName)}</h1>
                <p style="color:var(--text-tertiary); margin:0 0 var(--space-3); font-size:0.95rem;">@${esc(user.username)}</p>
                ${user.bio ? `<p style="color:var(--text-secondary); margin:0 0 var(--space-3); max-width:500px;">${esc(user.bio)}</p>` : ''}
                <div style="display:flex; gap:var(--space-5); flex-wrap:wrap;">
                  <span style="color:var(--text-primary); font-size:0.95rem;"><strong id="profile-post-count">0</strong> <span style="color:var(--text-tertiary);">Posts</span></span>
                  <span style="color:var(--text-primary); font-size:0.95rem; cursor:pointer;" class="stat-followers" data-user-id="${user.id}"><strong id="profile-followers-count">${followerCount}</strong> <span style="color:var(--text-tertiary);">Followers</span></span>
                  <span style="color:var(--text-primary); font-size:0.95rem; cursor:pointer;" class="stat-following" data-user-id="${user.id}"><strong>${followingCount}</strong> <span style="color:var(--text-tertiary);">Following</span></span>
                </div>
              </div>
              <div style="display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap; padding-top:var(--space-2);">
                ${actionButtons}
              </div>
            </div>
          </div>

          <!-- Profile Tabs -->
          <div style="border-top:1px solid var(--color-border, rgba(255,255,255,0.08)); display:flex; gap:0; padding:0 var(--space-4);">
            <button class="profile-tab active" data-tab="posts" style="padding:14px 20px; background:none; border:none; border-bottom:3px solid var(--color-primary, #6366f1); color:var(--color-primary, #6366f1); font-weight:600; cursor:pointer; font-size:0.95rem; transition:all 0.2s;">
              <i class="fas fa-th"></i> Posts
            </button>
            <button class="profile-tab" data-tab="about" style="padding:14px 20px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-tertiary); cursor:pointer; font-size:0.95rem; transition:all 0.2s;">
              <i class="fas fa-info-circle"></i> About
            </button>
            <button class="profile-tab" data-tab="photos" style="padding:14px 20px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-tertiary); cursor:pointer; font-size:0.95rem; transition:all 0.2s;">
              <i class="fas fa-images"></i> Photos
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="profile-tab-content">
          <div id="profile-posts-section">
            ${isOwn ? `
              <div style="margin-bottom:var(--space-4);" id="profile-post-creator-wrap">
                ${typeof Feed !== 'undefined' ? Feed.renderPostCreator() : ''}
              </div>
            ` : ''}
            <div id="profile-posts-container">
              <div class="skeleton-card card">
                <div class="skeleton-card__body">
                  <div class="skeleton skeleton--line skeleton--w100"></div>
                  <div class="skeleton skeleton--line skeleton--w80"></div>
                  <div class="skeleton skeleton--line skeleton--w60"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Schedule post load after DOM is ready
    setTimeout(() => this._loadProfilePosts(userId, true), 100);

    return html;
  },

  // ── Load posts from API ──────────────────────────────────────────────
  async _loadProfilePosts(userId, reset = false) {
    if (this._profileLoading) return;
    this._profileLoading = true;

    const container = document.getElementById('profile-posts-container');
    if (!container) { this._profileLoading = false; return; }

    try {
      const res = await Api.getUserPosts(userId, this._profilePage, 10);
      const posts = res.posts || [];

      // Update post count badge
      const countEl = document.getElementById('profile-post-count');
      if (countEl && res.total !== undefined) countEl.textContent = Utils.formatNumber(res.total);

      if (reset && posts.length === 0) {
        container.innerHTML = `
          <div class="card empty-state" style="text-align:center; padding:var(--space-8);">
            <div style="font-size:3rem; margin-bottom:var(--space-3);">📸</div>
            <h3 style="color:var(--text-primary); margin:0 0 8px;">No Posts Yet</h3>
            <p style="color:var(--text-tertiary); margin:0;">When you share posts, they'll appear here.</p>
          </div>
        `;
        this._profileHasMore = false;
        return;
      }

      const html = posts.map(p =>
        typeof Post !== 'undefined' ? Post.renderPostCard(p) : `<div class="card" style="padding:16px;"><p>${Utils.escapeHtml(p.content || '')}</p></div>`
      ).join('');

      if (reset) {
        container.innerHTML = html;
      } else {
        container.insertAdjacentHTML('beforeend', html);
      }

      this._profilePage++;
      this._profileHasMore = res.hasMore || false;

    } catch (err) {
      console.error('[Profile] Load posts error:', err);
      if (reset) {
        container.innerHTML = `<div class="card empty-state"><p>Failed to load posts.</p></div>`;
      }
    } finally {
      this._profileLoading = false;
    }
  },

  // ── Tab switching ────────────────────────────────────────────────────
  _switchTab(tabName) {
    // Update tab button styles
    document.querySelectorAll('.profile-tab').forEach(t => {
      const isActive = t.dataset.tab === tabName;
      t.style.borderBottomColor = isActive ? 'var(--color-primary, #6366f1)' : 'transparent';
      t.style.color = isActive ? 'var(--color-primary, #6366f1)' : 'var(--text-tertiary)';
      t.style.fontWeight = isActive ? '600' : '400';
    });

    const content = document.getElementById('profile-tab-content');
    if (!content) return;

    if (tabName === 'posts') {
      const postSection = document.getElementById('profile-posts-section');
      if (postSection) postSection.style.display = '';
      return;
    }

    if (tabName === 'about') {
      const postSection = document.getElementById('profile-posts-section');
      if (postSection) postSection.style.display = 'none';

      // Render About tab
      const userId = this._currentUserId;
      let user = null;
      Api.getProfile(userId).then(res => {
        user = res.user || res;
        const esc = str => Utils?.escapeHtml?.(str) || (str || '');

        // Remove any existing about section
        const existing = document.getElementById('profile-about-section');
        if (existing) existing.remove();

        const aboutHtml = `
          <div class="card" id="profile-about-section" style="padding:var(--space-6);">
            <h3 style="font-size:1.1rem; font-weight:700; margin:0 0 var(--space-4); color:var(--text-primary);">About</h3>
            ${user.bio ? `<p style="color:var(--text-secondary); margin:0 0 var(--space-4);">${esc(user.bio)}</p>` : ''}
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:var(--space-3);">
              ${user.location ? `<li style="display:flex; align-items:center; gap:10px; color:var(--text-secondary);"><i class="fas fa-map-marker-alt" style="color:var(--color-primary);width:18px;text-align:center;"></i> Lives in <strong style="color:var(--text-primary);">${esc(user.location)}</strong></li>` : ''}
              ${user.website ? `<li style="display:flex; align-items:center; gap:10px;"><i class="fas fa-link" style="color:var(--color-primary);width:18px;text-align:center;"></i> <a href="${esc(user.website)}" target="_blank" style="color:var(--color-primary);">${esc(user.website)}</a></li>` : ''}
              ${user.email ? `<li style="display:flex; align-items:center; gap:10px; color:var(--text-secondary);"><i class="fas fa-envelope" style="color:var(--color-primary);width:18px;text-align:center;"></i> ${esc(user.email)}</li>` : ''}
            </ul>
          </div>
        `;
        content.insertAdjacentHTML('beforeend', aboutHtml);
      }).catch(err => console.error(err));
      return;
    }

    if (tabName === 'photos') {
      const postSection = document.getElementById('profile-posts-section');
      if (postSection) postSection.style.display = 'none';

      const existing = document.getElementById('profile-photos-section');
      if (existing) existing.remove();

      const userId = this._currentUserId;
      const photosSection = document.createElement('div');
      photosSection.id = 'profile-photos-section';
      photosSection.innerHTML = `<div class="card" style="padding:var(--space-6);"><p style="color:var(--text-tertiary); text-align:center;">Loading photos...</p></div>`;
      content.appendChild(photosSection);

      Api.getUserPosts(userId, 0, 50).then(res => {
        const posts = res.posts || [];
        const allMedia = [];
        posts.forEach(p => {
          (p.media || []).forEach(m => {
            if (m.type === 'image') allMedia.push(m.url);
          });
        });

        if (allMedia.length === 0) {
          photosSection.innerHTML = `
            <div class="card empty-state" style="text-align:center; padding:var(--space-8);">
              <div style="font-size:3rem; margin-bottom:var(--space-3);">🖼️</div>
              <h3 style="color:var(--text-primary); margin:0 0 8px;">No Photos Yet</h3>
              <p style="color:var(--text-tertiary); margin:0;">Photos from posts will appear here.</p>
            </div>
          `;
        } else {
          photosSection.innerHTML = `
            <div class="card" style="padding:var(--space-4);">
              <h3 style="font-size:1rem; font-weight:700; margin:0 0 var(--space-4); color:var(--text-primary);">Photos (${allMedia.length})</h3>
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px;">
                ${allMedia.map(url => `
                  <div style="aspect-ratio:1; border-radius:8px; overflow:hidden; cursor:pointer;" onclick="window.open('${url}','_blank')">
                    <img src="${url}" alt="Photo" style="width:100%; height:100%; object-fit:cover; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }).catch(err => {
        photosSection.innerHTML = `<div class="card"><p style="color:var(--text-tertiary); text-align:center;">Failed to load photos.</p></div>`;
      });
    }
  },

  // ── Edit Profile Modal ───────────────────────────────────────────────
  showEditModal() {
    const user = Auth.getCurrentUser();
    if (!user) return;

    const esc = str => Utils?.escapeHtml?.(str) || (str || '');

    // Remove existing modal
    document.querySelector('.profile-modal-overlay')?.remove();

    const modal = document.createElement('div');
    modal.className = 'profile-modal-overlay modal-overlay active';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);';

    modal.innerHTML = `
      <div class="modal" style="width:100%;max-width:520px;max-height:90vh;overflow-y:auto;border-radius:var(--radius-xl);background:var(--bg-card);border:1px solid var(--color-border, rgba(255,255,255,0.08));">
        <div class="modal__header" style="padding:var(--space-5) var(--space-6); border-bottom:1px solid var(--color-border, rgba(255,255,255,0.08)); display:flex; align-items:center; justify-content:space-between;">
          <h3 style="margin:0; font-size:1.1rem; font-weight:700; color:var(--text-primary);">Edit Profile</h3>
          <button class="profile-modal-close btn-icon" style="background:none; border:none; cursor:pointer; color:var(--text-tertiary); font-size:1.2rem;">&times;</button>
        </div>
        <div class="modal__body" style="padding:var(--space-6);">
          <div style="margin-bottom:var(--space-5);">
            <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">Full Name</label>
            <input type="text" id="edit-fullname" value="${esc(user.fullName || '')}" style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; box-sizing:border-box;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4); margin-bottom:var(--space-5);">
            <div>
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">First Name</label>
              <input type="text" id="edit-firstname" value="${esc(user.firstName || '')}" style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">Last Name</label>
              <input type="text" id="edit-lastname" value="${esc(user.lastName || '')}" style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:var(--space-5);">
            <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">Bio</label>
            <textarea id="edit-bio" rows="3" style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; resize:vertical; box-sizing:border-box; font-family:inherit;">${esc(user.bio || '')}</textarea>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4); margin-bottom:var(--space-5);">
            <div>
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">Location</label>
              <input type="text" id="edit-location" value="${esc(user.location || '')}" placeholder="City, Country" style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">Website</label>
              <input type="url" id="edit-website" value="${esc(user.website || '')}" placeholder="https://..." style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:var(--space-5);">
            <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--space-2);">Date of Birth</label>
            <input type="date" id="edit-dob" value="${user.dob || ''}" style="width:100%; padding:10px 14px; border-radius:10px; border:1px solid var(--color-border, rgba(255,255,255,0.12)); background:var(--bg-input, rgba(255,255,255,0.04)); color:var(--text-primary); font-size:0.95rem; box-sizing:border-box;">
          </div>
        </div>
        <div class="modal__footer" style="padding:var(--space-4) var(--space-6); border-top:1px solid var(--color-border, rgba(255,255,255,0.08)); display:flex; justify-content:flex-end; gap:var(--space-3);">
          <button class="profile-modal-close btn btn-secondary" style="padding:10px 22px;">Cancel</button>
          <button id="profile-save-btn" class="btn btn-primary" style="padding:10px 22px;">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('edit-fullname')?.focus();
  },

  async _handleSaveProfile() {
    const user = Auth.getCurrentUser();
    if (!user) return;

    const fullName = document.getElementById('edit-fullname')?.value?.trim();
    const firstName = document.getElementById('edit-firstname')?.value?.trim();
    const lastName = document.getElementById('edit-lastname')?.value?.trim();
    const bio = document.getElementById('edit-bio')?.value?.trim();
    const location = document.getElementById('edit-location')?.value?.trim();
    const website = document.getElementById('edit-website')?.value?.trim();
    const dob = document.getElementById('edit-dob')?.value;

    const saveBtn = document.getElementById('profile-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
      await Api.updateProfile({ fullName, firstName, lastName, bio, location, website, dob });

      // Update local user object
      Object.assign(user, { fullName, firstName, lastName, bio, location, website, dob });
      if (typeof Store !== 'undefined' && Store.setCurrentUser) Store.setCurrentUser(user);

      // Update visible name in DOM
      const nameEl = document.querySelector('.profile-name, h1.profile-name');
      if (nameEl) nameEl.textContent = fullName;

      document.querySelector('.profile-modal-overlay')?.remove();
      Utils.showToast('Profile updated successfully!', 'success');

      // Reload profile to show updated data
      setTimeout(() => {
        window.location.hash = `#profile/${user.id}`;
      }, 500);

    } catch (err) {
      Utils.showToast(err.message || 'Failed to save profile.', 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  },

  async _handleFollowToggle(btn, targetUserId) {
    const isFollowing = btn.classList.contains('btn-secondary');
    try {
      if (isFollowing) {
        await Api.unfollowUser(targetUserId);
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
        btn.classList.replace('btn-secondary', 'btn-primary');
      } else {
        await Api.followUser(targetUserId);
        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
        btn.classList.replace('btn-primary', 'btn-secondary');
      }
      // Update follower count
      const followersEl = document.getElementById('profile-followers-count');
      if (followersEl) {
        const current = parseInt(followersEl.textContent.replace(/,/g, '')) || 0;
        followersEl.textContent = Utils.formatNumber(isFollowing ? current - 1 : current + 1);
      }
    } catch (err) {
      Utils.showToast(err.message || 'Action failed.', 'error');
    }
  },

  async loadProfileFriendStatus(userId) {
    const container = document.getElementById('profile-friend-btn-container');
    if (!container || userId === Auth.getCurrentUser()?.id) return;
    try {
      if (typeof Friends !== 'undefined' && Friends.getFriendStatus) {
        const status = await Friends.getFriendStatus(userId);
        container.innerHTML = Friends.renderFriendButton(userId, status);
      }
    } catch (err) {
      console.error('[Profile] Friend status error:', err);
    }
  },

  // ── Dropdown toggles and photo viewer fallback ──────────────────────
  toggleAvatarDropdown(container) {
    document.querySelectorAll('.profile-dropdown').forEach(d => d.remove());
    const dropdown = document.createElement('div');
    dropdown.className = 'profile-dropdown';
    dropdown.style.cssText = 'position:absolute; top:80%; left:50%; transform:translateX(-50%); background:#242526; border:1px solid #3a3b3c; border-radius:8px; box-shadow:0 12px 24px rgba(0,0,0,0.4); padding:6px; z-index:1000; min-width:180px; display:flex; flex-direction:column; gap:2px;';
    dropdown.innerHTML = `
      <button class="profile-dropdown-item" id="btn-see-avatar" style="display:flex; align-items:center; gap:8px; background:none; border:none; color:#fff; padding:10px 12px; font-size:14px; font-weight:600; text-align:left; cursor:pointer; width:100%; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
        <i class="far fa-user-circle" style="font-size:16px;color:#b0b3b8;"></i> See profile picture
      </button>
      <button class="profile-dropdown-item" id="btn-choose-avatar" style="display:flex; align-items:center; gap:8px; background:none; border:none; color:#fff; padding:10px 12px; font-size:14px; font-weight:600; text-align:left; cursor:pointer; width:100%; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
        <i class="far fa-images" style="font-size:16px;color:#b0b3b8;"></i> Choose profile picture
      </button>
    `;
    container.appendChild(dropdown);

    document.getElementById('btn-see-avatar').onclick = (e) => {
      e.stopPropagation(); dropdown.remove();
      const u = Auth.getCurrentUser();
      if (u && u.avatar) this.seePhoto(u.avatar);
    };
    document.getElementById('btn-choose-avatar').onclick = (e) => {
      e.stopPropagation(); dropdown.remove();
      document.getElementById('avatar-file-input')?.click();
    };
  },

  toggleCoverDropdown(container) {
    document.querySelectorAll('.profile-dropdown').forEach(d => d.remove());
    const dropdown = document.createElement('div');
    dropdown.className = 'profile-dropdown';
    dropdown.style.cssText = 'position:absolute; bottom:50px; right:16px; background:#242526; border:1px solid #3a3b3c; border-radius:8px; box-shadow:0 12px 24px rgba(0,0,0,0.4); padding:6px; z-index:1000; min-width:180px; display:flex; flex-direction:column; gap:2px;';
    dropdown.innerHTML = `
      <button class="profile-dropdown-item" id="btn-see-cover" style="display:flex; align-items:center; gap:8px; background:none; border:none; color:#fff; padding:10px 12px; font-size:14px; font-weight:600; text-align:left; cursor:pointer; width:100%; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
        <i class="far fa-image" style="font-size:16px;color:#b0b3b8;"></i> See cover photo
      </button>
      <button class="profile-dropdown-item" id="btn-choose-cover" style="display:flex; align-items:center; gap:8px; background:none; border:none; color:#fff; padding:10px 12px; font-size:14px; font-weight:600; text-align:left; cursor:pointer; width:100%; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
        <i class="fas fa-upload" style="font-size:15px;color:#b0b3b8;"></i> Upload photo
      </button>
      <button class="profile-dropdown-item" id="btn-remove-cover" style="display:flex; align-items:center; gap:8px; background:none; border:none; color:#e41e3f; padding:10px 12px; font-size:14px; font-weight:600; text-align:left; cursor:pointer; width:100%; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(228,30,63,0.1)'" onmouseout="this.style.background='transparent'">
        <i class="far fa-trash-alt" style="font-size:16px;"></i> Remove
      </button>
    `;
    container.appendChild(dropdown);

    document.getElementById('btn-see-cover').onclick = (e) => {
      e.stopPropagation(); dropdown.remove();
      const u = Auth.getCurrentUser();
      if (u && u.coverPhoto) this.seePhoto(u.coverPhoto);
    };
    document.getElementById('btn-choose-cover').onclick = (e) => {
      e.stopPropagation(); dropdown.remove();
      document.getElementById('cover-file-input')?.click();
    };
    document.getElementById('btn-remove-cover').onclick = async (e) => {
      e.stopPropagation(); dropdown.remove();
      if (confirm('Are you sure you want to remove your cover photo?')) {
        try {
          const u = Auth.getCurrentUser();
          await Api.updateProfile({ coverPhoto: '' });
          if (u) {
            u.coverPhoto = '';
            if (typeof Store !== 'undefined' && Store.setCurrentUser) Store.setCurrentUser(u);
          }
          const coverEl = document.querySelector('.cover-photo');
          if (coverEl) coverEl.src = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80';
          Utils.showToast('Cover photo removed.', 'success');
        } catch(err) { Utils.showToast('Failed to remove cover photo.', 'error'); }
      }
    };
  },

  async seePhoto(url) {
    // Find if a post corresponds to this profile picture/cover photo
    const pId = await this.findPostForMedia(url, this._currentUserId);
    if (pId && typeof Post !== 'undefined') {
      Post.openPhotoViewer(pId, 0);
    } else {
      // Fallback fullscreen viewer
      document.getElementById('photo-viewer-lightbox')?.remove();
      const ov = document.createElement('div');
      ov.id = 'photo-viewer-lightbox';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:10000;display:flex;align-items:center;justify-content:center;';
      ov.innerHTML = `
        <button id="lb-close" title="Close" style="position:absolute;top:14px;left:14px;z-index:5;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);color:#fff;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fas fa-times"></i></button>
        <img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;user-select:none;">
      `;
      document.body.appendChild(ov);
      document.getElementById('lb-close').onclick = () => ov.remove();
      const esc = e => { if(e.key==='Escape') { ov.remove(); document.removeEventListener('keydown',esc); } };
      document.addEventListener('keydown', esc);
    }
  },

  async findPostForMedia(url, userId) {
    try {
      const res = await Api.getUserPosts(userId, 0, 100);
      const posts = res.posts || res || [];
      const match = posts.find(p => (p.media || []).some(m => m.url === url));
      return match ? match.id : null;
    } catch(e) { return null; }
  },
};

window.Profile = Profile;
