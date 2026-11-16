/**
 * Feed Module — News Feed
 * Handles the main feed page: story bar, post creator, feed filters,
 * infinite scroll, and feed rendering.
 */
const Feed = {
  page: 0,
  pageSize: 5,
  loading: false,
  hasMore: true,
  filter: 'all', // 'all' | 'photos' | 'videos' | 'text'
  storyGroups: [],

  _fileInputListenerAttached: false,

  init() {
    // Redundant hashchange listener removed to prevent double-firing feed loading requests.
  },

  // ── Render the main feed page ──────────────────────────────────────
  renderFeedPage() {
    const user = window.Auth?.getCurrentUser?.();
    if (!user) return '<div class="empty-state"><p>Please log in to see your feed.</p></div>';

    // Delay initial feed load
    setTimeout(() => {
      this.refreshFeed();
      this.loadStories();
    }, 100);

    return `
      <div class="feed-page">
        <div class="feed-main">
          ${this.renderStoryBar()}
          ${this.renderPostCreator()}
          ${this.renderFeedFilters()}
          <div class="feed-posts" id="feed-posts">
            ${this._renderSkeletonCards(2)}
          </div>
          <div id="feed-sentinel" class="feed-sentinel"></div>
          <div id="feed-loader" class="feed-loader" style="display:none;">
            ${this._renderSkeletonCards(2)}
          </div>
          <div id="feed-end" class="feed-end" style="display:none;">
            <p>You've reached the end of your feed.</p>
          </div>
        </div>
      </div>
    `;
  },

  renderStoryBar() {
    const user = window.Auth?.getCurrentUser?.();
    if (!user) return '';

    return `
      <div class="story-bar card mb-4" style="overflow-x: auto; white-space: nowrap; padding: 12px; border-radius: var(--radius-lg); margin-bottom: var(--space-4); background:var(--bg-card); border:1px solid var(--color-border); scrollbar-width: none;">
        <div class="story-scroll" id="story-scroll" style="display: flex; gap: 8px; align-items: center;">
          <div class="fb-story-card fb-story-card--create" data-action="add-story" title="Create your story">
            <img class="fb-story-card__bg" src="${user.avatar}" alt="Your avatar">
            <div class="fb-story-card__footer">
              <span class="fb-story-card__plus">+</span>
              <span class="fb-story-card__label">Create Story</span>
            </div>
          </div>
        </div>
      </div>
      <!-- Hidden file input outside the scroll area to survive DOM rebuilds -->
      <input type="file" id="story-file-input" accept="image/*" style="display:none;">
    `;
  },

  renderPostCreator() {
    const user = window.Auth?.getCurrentUser?.();
    if (!user) return '';

    const firstName = user.firstName || user.fullName?.split(' ')[0] || 'User';

    // Check if user has an active story
    const myGroup = this.storyGroups.find(g => g.userId === user.id);
    const hasStory = !!myGroup && myGroup.stories.length > 0;
    const allSeen = hasStory ? myGroup.stories.every(s => s.seen) : true;
    
    // Style for the ring
    const ringStyle = hasStory 
      ? (allSeen ? 'border: 3px solid var(--color-border); padding: 2px;' : 'border: 3px solid var(--color-primary, #1877f2); padding: 2px;')
      : 'border: none; padding: 0;';

    const avatarHtml = `
      <div style="position:relative; cursor:pointer;" onclick="Feed.handleAvatarClick(event, '${user.id}', ${hasStory})">
        <img class="avatar avatar-sm" src="${user.avatar}" alt="${window.Utils?.escapeHtml?.(user.fullName) || ''}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; ${ringStyle}">
      </div>
    `;

    return `
      <div class="post-creator card" id="post-creator" style="padding: 12px 16px; margin-bottom: var(--space-4);">
        <div style="display:flex; align-items:center; gap:8px;">
          ${avatarHtml}
          <div class="post-creator__top" data-action="open-post-modal" style="flex:1; display:flex; align-items:center; justify-content:space-between; background:var(--color-bg-hover, rgba(0,0,0,0.04)); border-radius:20px; padding:10px 16px; cursor:pointer; transition:background 0.2s; border:none; margin:0;" onmouseover="this.style.background='var(--color-bg-secondary, rgba(0,0,0,0.07))'" onmouseout="this.style.background='var(--color-bg-hover, rgba(0,0,0,0.04))'">
            <span style="color:var(--color-text-secondary); font-size:14px; font-weight:500;">What's on your mind, ${window.Utils?.escapeHtml?.(firstName)}?</span>
            <div style="display:flex; align-items:center; gap:12px;">
              <i class="fas fa-video" style="color:#e42645; font-size:1.1rem;" title="Live Video"></i>
              <i class="fas fa-images" style="color:#45bd62; font-size:1.1rem;" title="Photo/Video"></i>
              <i class="fas fa-laugh" style="color:#f7b928; font-size:1.1rem;" title="Feeling/Activity"></i>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ── Feed filter tabs ───────────────────────────────────────────────
  renderFeedFilters() {
    const filters = [
      { key: 'all', label: 'All' },
      { key: 'photos', label: 'Photos' },
      { key: 'videos', label: 'Videos' },
      { key: 'text', label: 'Text' }
    ];

    const tabs = filters.map(f => `
      <button class="feed-filter__tab ${this.filter === f.key ? 'feed-filter__tab--active' : ''}"
              data-action="set-feed-filter" data-filter="${f.key}">
        ${f.label}
      </button>
    `).join('');

    return `
      <div class="feed-filters card" id="feed-filters">
        <div class="feed-filter__tabs">${tabs}</div>
      </div>
    `;
  },

  // ── Setup infinite scroll ──────────────────────────────────────────
  setupInfiniteScroll() {
    const sentinel = document.getElementById('feed-sentinel');
    if (!sentinel) return;

    if (this._observer) this._observer.disconnect();

    this._observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !this.loading && this.hasMore) {
        this.loadMorePosts();
      }
    }, { rootMargin: '200px' });

    this._observer.observe(sentinel);
  },

  // ── Load next batch of posts ───────────────────────────────────────
  async loadMorePosts() {
    if (this.loading || !this.hasMore) return;
    this.loading = true;

    const loader = document.getElementById('feed-loader');
    if (loader) loader.style.display = 'block';

    try {
      if (typeof Api === 'undefined') throw new Error('Api module missing');
      
      const data = await Api.getFeed(this.page, this.pageSize);
      let posts = data.posts || [];
      const container = document.getElementById('feed-posts');

      if (!container) return;

      // First page and no posts
      if (this.page === 0 && posts.length === 0) {
        container.innerHTML = `
          <div class="empty-state card">
            <div class="empty-state__icon">📭</div>
            <h3>No posts yet</h3>
            <p>Follow more people or create your first post to get started!</p>
          </div>
        `;
        this.hasMore = false;
        return;
      }

      // Apply filter locally for now
      if (this.filter === 'photos') {
        posts = posts.filter(p => p.media && p.media.some(m => m.type === 'image'));
      } else if (this.filter === 'videos') {
        posts = posts.filter(p => p.media && p.media.some(m => m.type === 'video'));
      } else if (this.filter === 'text') {
        posts = posts.filter(p => !p.media || p.media.length === 0);
      }

      if (posts.length === 0 && data.hasMore) {
        // If local filter removed all posts but backend has more, fetch next page automatically
        this.page++;
        this.loading = false;
        return this.loadMorePosts();
      }

      const html = posts.map(p =>
        typeof Post !== 'undefined' ? Post.renderPostCard(p) : this._renderFallbackPost(p)
      ).join('');

      // If page 0, replace content, else append
      if (this.page === 0) {
        container.innerHTML = html;
      } else {
        container.insertAdjacentHTML('beforeend', html);
      }

      this.page++;
      this.hasMore = data.hasMore;

      if (!this.hasMore) {
        const endEl = document.getElementById('feed-end');
        if (endEl) endEl.style.display = 'block';
      }
    } catch (err) {
      console.error('[Feed] Load error:', err);
      if (this.page === 0) {
        const container = document.getElementById('feed-posts');
        if (container) container.innerHTML = '<div class="empty-state">Failed to load feed.</div>';
      }
    } finally {
      if (loader) loader.style.display = 'none';
      this.loading = false;
    }
  },

  // ── Refresh feed ───────────────────────────────────────────────────
  refreshFeed() {
    this.page = 0;
    this.hasMore = true;
    this.loading = false;
    Feed._fileInputListenerAttached = false; // Reset so listener re-attaches after page rebuild

    const container = document.getElementById('feed-posts');
    if (container) container.innerHTML = this._renderSkeletonCards(2);

    const endEl = document.getElementById('feed-end');
    if (endEl) endEl.style.display = 'none';

    this.loadMorePosts();
  },

  // ── Private helpers ────────────────────────────────────────────────


  _renderFallbackPost(post) {
    const author = post.author || {};
    const timeAgo = window.Utils?.timeAgo?.(post.createdAt) || '';
    const name = window.Utils?.escapeHtml?.(author.fullName || author.firstName || 'Unknown');

    return `
      <div class="post-card card" data-post-id="${post.id}">
        <div class="post-card__header">
          <img class="avatar avatar-sm" src="${author.avatar || ''}" alt="">
          <div class="post-card__meta">
            <span class="post-card__name">${name}</span>
            <span class="post-card__time">${timeAgo}</span>
          </div>
        </div>
        <div class="post-card__content">
          <p>${window.Utils?.escapeHtml?.(post.content) || post.content}</p>
        </div>
      </div>
    `;
  },

  _renderSkeletonCards(count) {
    let cards = '';
    for (let i = 0; i < count; i++) {
      cards += `
        <div class="skeleton-card card">
          <div class="skeleton-card__header">
            <div class="skeleton skeleton--circle"></div>
            <div class="skeleton-card__meta-lines">
              <div class="skeleton skeleton--line skeleton--w40"></div>
              <div class="skeleton skeleton--line skeleton--w20"></div>
            </div>
          </div>
          <div class="skeleton-card__body">
            <div class="skeleton skeleton--line skeleton--w100"></div>
            <div class="skeleton skeleton--line skeleton--w80"></div>
            <div class="skeleton skeleton--line skeleton--w60"></div>
          </div>
          <div class="skeleton-card__image">
            <div class="skeleton skeleton--rect"></div>
          </div>
        </div>
      `;
    }
    return cards;
  },

  // ── Event delegation handler (call from global click handler) ─────
  handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;

    if (action === 'open-post-modal') {
      if (typeof Post !== 'undefined') Post.renderPostCreatorModal();
      return true;
    }

    if (action === 'set-feed-filter') {
      const newFilter = target.dataset.filter;
      if (newFilter && newFilter !== this.filter) {
        this.filter = newFilter;
        // Update active tab
        document.querySelectorAll('.feed-filter__tab').forEach(tab => {
          tab.classList.toggle('feed-filter__tab--active', tab.dataset.filter === newFilter);
        });
        // Reset and reload
        this.page = 0;
        this.hasMore = true;
        const container = document.getElementById('feed-posts');
        if (container) container.innerHTML = this._renderSkeletonCards(2);
        const endEl = document.getElementById('feed-end');
        if (endEl) endEl.style.display = 'none';
        this.loadMorePosts();
      }
      return true;
    }

    if (action === 'add-story') {
      this.openStorySelectionModal();
      return true;
    }

    if (action === 'view-story-group') {
      const userId = target.dataset.userId;
      this.showStoryViewer(userId);
      return true;
    }

    return false;
  },

  handleAvatarClick(e, userId, hasStory) {
    if (!hasStory) {
      window.location.hash = '#profile/' + userId;
      return;
    }
    
    // Show Facebook-style dropdown menu
    const existing = document.getElementById('avatar-story-menu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'avatar-story-menu';
    menu.style.cssText = `
      position: absolute;
      top: ${e.clientY + 10}px;
      left: ${e.clientX}px;
      background: var(--bg-card, #242526);
      border: 1px solid var(--color-border, #3e4042);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 150px;
    `;
    
    menu.innerHTML = `
      <button style="padding: 12px 16px; border:none; background:none; text-align:left; color:var(--text-primary, #fff); cursor:pointer; font-weight:500; font-size:14px; transition: background 0.2s;" onmouseover="this.style.background='var(--color-bg-hover, #3a3b3c)'" onmouseout="this.style.background='none'" id="btn-view-story">View Story</button>
      <button style="padding: 12px 16px; border:none; background:none; text-align:left; color:var(--text-primary, #fff); cursor:pointer; font-weight:500; font-size:14px; transition: background 0.2s;" onmouseover="this.style.background='var(--color-bg-hover, #3a3b3c)'" onmouseout="this.style.background='none'" id="btn-view-profile">View Profile</button>
    `;
    
    document.body.appendChild(menu);
    
    menu.querySelector('#btn-view-story').onclick = () => {
      menu.remove();
      Feed.showStoryViewer(userId);
    };
    
    menu.querySelector('#btn-view-profile').onclick = () => {
      menu.remove();
      window.location.hash = '#profile/' + userId;
    };
    
    // Close when clicking outside
    setTimeout(() => {
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 0);
  },

  async loadStories() {
    const scrollContainer = document.getElementById('story-scroll');
    if (!scrollContainer) return;

    try {
      const data = await Api.get('/stories');
      const groups = data.storyGroups || [];
      
      const html = groups.map(g => {
        const name = (window.Utils?.escapeHtml?.(g.fullName || g.username)) || g.username || 'User';
        const avatar = g.avatar || 'https://ui-avatars.com/api/?name=User&background=random&size=200';
        const allSeen = g.stories.every(s => s.seen);
        const latestMedia = g.stories[0]?.mediaUrl || avatar;
        const avatarClass = allSeen 
          ? 'fb-story-card__avatar--seen' 
          : 'fb-story-card__avatar--unseen';

        return `
          <div class="fb-story-card" data-action="view-story-group" data-user-id="${g.userId}">
            <img class="fb-story-card__bg" src="${latestMedia}" alt="${name}" onerror="this.src='${avatar}'">
            <img class="fb-story-card__avatar ${avatarClass}" src="${avatar}" alt="${name}">
            <span class="fb-story-card__name">${name}</span>
          </div>
        `;
      }).join('');

      const createBtn = scrollContainer.firstElementChild.outerHTML;
      scrollContainer.innerHTML = createBtn + html;

      this.storyGroups = groups;
      
      // Update post creator to show the blue ring immediately
      const postCreator = document.getElementById('post-creator');
      if (postCreator) {
        postCreator.outerHTML = this.renderPostCreator();
      }
    } catch (err) {
      console.error('[Feed] Failed to load stories:', err.message, err);
    }

    // Attach file input listener only once (prevent duplicates on story reload)
    // Attach outside try block so you can upload even if fetching stories failed (e.g. 401)
    const fileInput = document.getElementById('story-file-input');
    if (fileInput && !Feed._fileInputListenerAttached) {
      Feed._fileInputListenerAttached = true;
      fileInput.addEventListener('change', (e) => Feed.handleStoryUpload(e));
    }
  },

  handleStoryUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      window.Utils?.showToast?.('Please select an image or video file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      // Clear input so same file can be selected again
      e.target.value = '';
      if (Feed.openPhotoStoryEditor) {
        Feed.openPhotoStoryEditor(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  },

  openStorySelectionModal() {
    // Remove existing overlays
    document.getElementById('story-creator-overlay')?.remove();

    const currentUser = window.Auth?.getCurrentUser?.();
    const avatar = currentUser?.avatar || 'https://ui-avatars.com/api/?name=User&background=random&size=200';
    const name = currentUser?.fullName || currentUser?.username || 'User';

    const overlay = document.createElement('div');
    overlay.id = 'story-creator-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:var(--bg-page, #18191a);
      display:flex;flex-direction:column;
      z-index:99999;font-family:var(--font-family-body, sans-serif);
      color:var(--text-primary, #e4e6eb);
    `;

    overlay.innerHTML = `
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid var(--color-border, #3e4042);background:var(--bg-card, #242526);height:60px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:12px;">
          <button id="story-creator-close" style="background:var(--color-bg-hover, #3a3b3c);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:1.4rem;color:inherit;">&times;</button>
          <div style="font-weight:700;font-size:1.25rem;letter-spacing:0.5px;color:var(--color-primary, #1877f2);">Handbook Story</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--color-primary, #1877f2);">
        </div>
      </div>

      <!-- Main Selection Body -->
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;">
        <div style="display:flex;gap:24px;max-width:800px;width:100%;justify-content:center;flex-wrap:wrap;">
          
          <!-- Card 1: Photo Story -->
          <div id="choice-photo" style="width:220px;height:330px;border-radius:16px;background:linear-gradient(135deg, #1877f2, #00c6ff);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 12px 32px rgba(0,0,0,0.3);transition:transform 0.2s, box-shadow 0.2s;color:white;position:relative;">
            <div style="width:60px;height:60px;border-radius:50%;background:white;color:#1877f2;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:16px;box-shadow:0 4px 10px rgba(0,0,0,0.15);">
              <i class="fas fa-images"></i>
            </div>
            <span style="font-weight:700;font-size:1.05rem;text-align:center;">Create a photo story</span>
            <input type="file" id="choice-photo-input" accept="image/*" style="display:none;">
          </div>

          <!-- Card 2: Text Story -->
          <div id="choice-text" style="width:220px;height:330px;border-radius:16px;background:linear-gradient(135deg, #8a2387, #e94057, #f27121);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 12px 32px rgba(0,0,0,0.3);transition:transform 0.2s, box-shadow 0.2s;color:white;position:relative;">
            <div style="width:60px;height:60px;border-radius:50%;background:white;color:#e94057;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:16px;box-shadow:0 4px 10px rgba(0,0,0,0.15);">
              <i class="fas fa-font"></i>
            </div>
            <span style="font-weight:700;font-size:1.05rem;text-align:center;">Create a text story</span>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Hover effect animations
    const cPhoto = overlay.querySelector('#choice-photo');
    const cText = overlay.querySelector('#choice-text');
    [cPhoto, cText].forEach(c => {
      if (c) {
        c.addEventListener('mouseenter', () => {
          c.style.transform = 'scale(1.03)';
          c.style.boxShadow = '0 16px 40px rgba(0,0,0,0.4)';
        });
        c.addEventListener('mouseleave', () => {
          c.style.transform = 'scale(1)';
          c.style.boxShadow = '0 12px 32px rgba(0,0,0,0.3)';
        });
      }
    });

    // Close button click
    overlay.querySelector('#story-creator-close')?.addEventListener('click', () => {
      overlay.remove();
    });

    // Photo story triggers file selector
    cPhoto?.addEventListener('click', () => {
      overlay.querySelector('#choice-photo-input')?.click();
    });

    overlay.querySelector('#choice-photo-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.Utils?.showToast?.('Please select an image file', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        Feed.openPhotoStoryEditor(event.target.result);
      };
      reader.readAsDataURL(file);
    });

    // Text story opens text story editor
    cText?.addEventListener('click', () => {
      Feed.openTextStoryEditor();
    });
  },

  openPhotoStoryEditor(base64) {
    document.getElementById('story-creator-overlay')?.remove();

    const currentUser = window.Auth?.getCurrentUser?.();
    const avatar = currentUser?.avatar || 'https://ui-avatars.com/api/?name=User&background=random&size=200';
    const name = currentUser?.fullName || currentUser?.username || 'User';

    const overlay = document.createElement('div');
    overlay.id = 'story-creator-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:var(--bg-page, #18191a);
      display:flex;flex-direction:row;
      z-index:99999;font-family:var(--font-family-body, sans-serif);
      color:var(--text-primary, #e4e6eb);
    `;

    let rotation = 0;
    let zoom = 1.0;
    let caption = '';
    let textColor = '#ffffff';

    overlay.innerHTML = `
      <!-- Left Panel: Sidebar Edit Options -->
      <div style="width:360px;background:var(--bg-card, #242526);border-right:1px solid var(--color-border, #3e4042);display:flex;flex-direction:column;box-sizing:border-box;box-shadow:4px 0 16px rgba(0,0,0,0.15);z-index:10;">
        <div style="padding:20px;border-bottom:1px solid var(--color-border, #3e4042);display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;font-size:1.3rem;font-weight:700;">Your story</h2>
          <button id="se-discard-btn-top" style="background:none;border:none;color:var(--text-secondary, #b0b3b8);font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>

        <div style="flex:1;padding:20px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
            <span style="font-weight:600;font-size:1.05rem;">${name}</span>
          </div>

          <!-- Add Caption Area -->
          <div>
            <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text-secondary, #b0b3b8);margin-bottom:8px;">Add text</label>
            <textarea id="se-caption" placeholder="Start typing..." style="width:100%;height:100px;border-radius:8px;border:1px solid var(--color-border, #3e4042);background:var(--bg-input, #3a3b3c);color:inherit;padding:12px;box-sizing:border-box;resize:none;outline:none;font-size:0.95rem;"></textarea>
          </div>

          <!-- Text Color Chooser -->
          <div>
            <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text-secondary, #b0b3b8);margin-bottom:8px;">Text color</label>
            <div style="display:flex;gap:8px;">
              ${['#ffffff', '#f7b928', '#e42645', '#1877f2', '#45bd62', '#000000'].map(c => `
                <button class="se-color-btn" data-color="${c}" style="width:30px;height:30px;border-radius:50%;border:2px solid ${c === textColor ? 'var(--color-primary, #1877f2)' : 'transparent'};background:${c};cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Discard and Share Buttons -->
        <div style="padding:20px;border-top:1px solid var(--color-border, #3e4042);display:flex;gap:12px;background:var(--bg-card, #242526);">
          <button id="se-discard-btn" class="btn btn-secondary" style="flex:1;padding:12px;border-radius:8px;font-weight:600;background:var(--color-bg-hover, #3a3b3c);border:none;cursor:pointer;color:inherit;">Discard</button>
          <button id="se-share-btn" class="btn btn-primary" style="flex:1.2;padding:12px;border-radius:8px;font-weight:600;background:var(--color-primary, #1877f2);border:none;cursor:pointer;color:white;">Share to story</button>
        </div>
      </div>

      <!-- Right Panel: Story Live Preview -->
      <div style="flex:1;background:#090909;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;padding:24px;box-sizing:border-box;">
        
        <!-- Story Phone Card Preview -->
        <div style="width:320px;height:568px;border-radius:12px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.6);position:relative;background:#000;">
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <img id="se-preview-img" src="${base64}" style="width:100%;height:100%;object-fit:contain;transition:transform 0.15s ease-out;transform:rotate(${rotation}deg) scale(${zoom});">
          </div>

          <!-- Live Overlay Text -->
          <div id="se-text-overlay" style="position:absolute;bottom:40px;left:16px;right:16px;padding:12px;background:rgba(0,0,0,0.5);border-radius:8px;color:#fff;font-size:14px;font-weight:600;text-align:center;display:none;z-index:20;word-wrap:break-word;line-height:1.4;"></div>
        </div>

        <!-- Controls panel under preview (Screenshot 3) -->
        <div style="display:flex;align-items:center;gap:20px;margin-top:20px;background:rgba(255,255,255,0.06);padding:10px 20px;border-radius:30px;">
          <span style="font-size:0.85rem;color:var(--text-secondary, #b0b3b8);"><i class="fas fa-minus"></i></span>
          <input type="range" id="se-zoom-slider" min="1.0" max="3.0" step="0.1" value="1.0" style="width:150px;cursor:pointer;accent-color:var(--color-primary, #1877f2);">
          <span style="font-size:0.85rem;color:var(--text-secondary, #b0b3b8);"><i class="fas fa-plus"></i></span>
          
          <div style="width:1px;height:20px;background:rgba(255,255,255,0.15);"></div>
          
          <button id="se-rotate-btn" style="background:none;border:none;color:white;cursor:pointer;display:flex;align-items:center;gap:6px;font-weight:600;font-size:0.85rem;"><i class="fas fa-redo"></i> Rotate</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Live preview updates
    const previewImg = overlay.querySelector('#se-preview-img');
    const textOverlay = overlay.querySelector('#se-text-overlay');
    const updatePreview = () => {
      if (previewImg) {
        previewImg.style.transform = `rotate(${rotation}deg) scale(${zoom})`;
      }
      if (textOverlay) {
        textOverlay.textContent = caption;
        textOverlay.style.color = textColor;
        textOverlay.style.display = caption.trim() ? 'block' : 'none';
      }
    };

    // Events
    overlay.querySelector('#se-caption')?.addEventListener('input', (e) => {
      caption = e.target.value;
      updatePreview();
    });

    overlay.querySelector('#se-zoom-slider')?.addEventListener('input', (e) => {
      zoom = parseFloat(e.target.value);
      updatePreview();
    });

    overlay.querySelector('#se-rotate-btn')?.addEventListener('click', () => {
      rotation = (rotation + 90) % 360;
      updatePreview();
    });

    overlay.querySelectorAll('.se-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        textColor = btn.dataset.color;
        overlay.querySelectorAll('.se-color-btn').forEach(b => {
          b.style.borderColor = (b.dataset.color === textColor) ? 'var(--color-primary, #1877f2)' : 'transparent';
        });
        updatePreview();
      });
    });

    const closeEditor = () => {
      overlay.remove();
      Feed.openStorySelectionModal();
    };

    overlay.querySelector('#se-discard-btn')?.addEventListener('click', closeEditor);
    overlay.querySelector('#se-discard-btn-top')?.addEventListener('click', closeEditor);

    // Submit
    overlay.querySelector('#se-share-btn')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#se-share-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sharing...';
      }

      try {
        window.Utils?.showToast?.('Baking your story...', 'info');

        const bakedBase64 = await Feed.bakePhotoStory(base64, {
          rotation,
          zoom,
          textColor,
          caption
        });

        const res = await Api.post('/stories', {
          mediaUrl: bakedBase64,
          mediaType: 'image',
          caption: caption
        });

        if (res.success) {
          window.Utils?.showToast?.('Story shared successfully!', 'success');
          overlay.remove();
          Feed.loadStories();
        } else {
          throw new Error('Server upload failed');
        }
      } catch (err) {
        console.error('[Story] Upload failed:', err);
        window.Utils?.showToast?.('Failed to share story', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Share to story';
        }
      }
    });
  },

  openTextStoryEditor() {
    document.getElementById('story-creator-overlay')?.remove();

    const currentUser = window.Auth?.getCurrentUser?.();
    const avatar = currentUser?.avatar || 'https://ui-avatars.com/api/?name=User&background=random&size=200';
    const name = currentUser?.fullName || currentUser?.username || 'User';

    const overlay = document.createElement('div');
    overlay.id = 'story-creator-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:var(--bg-page, #18191a);
      display:flex;flex-direction:row;
      z-index:99999;font-family:var(--font-family-body, sans-serif);
      color:var(--text-primary, #e4e6eb);
    `;

    const GRADIENTS = [
      { id: 'grad1', value: 'linear-gradient(135deg, #1877f2, #00c6ff)', label: 'Blue Sky' },
      { id: 'grad2', value: 'linear-gradient(135deg, #8a2387, #e94057, #f27121)', label: 'Sunset Glow' },
      { id: 'grad3', value: 'linear-gradient(135deg, #f12711, #f5af19)', label: 'Flame' },
      { id: 'grad4', value: 'linear-gradient(135deg, #11998e, #38ef7d)', label: 'Nature' },
      { id: 'grad5', value: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)', label: 'Dark Void' }
    ];

    let selectedGrad = GRADIENTS[0];
    let typedText = '';
    let fontStyle = 'sans-serif';
    let textColor = '#ffffff';

    overlay.innerHTML = `
      <!-- Left Panel -->
      <div style="width:360px;background:var(--bg-card, #242526);border-right:1px solid var(--color-border, #3e4042);display:flex;flex-direction:column;box-sizing:border-box;box-shadow:4px 0 16px rgba(0,0,0,0.15);z-index:10;">
        <div style="padding:20px;border-bottom:1px solid var(--color-border, #3e4042);display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;font-size:1.3rem;font-weight:700;">Your story</h2>
          <button id="se-discard-btn-top" style="background:none;border:none;color:var(--text-secondary, #b0b3b8);font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>

        <div style="flex:1;padding:20px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
            <span style="font-weight:600;font-size:1.05rem;">${name}</span>
          </div>

          <!-- Text Area -->
          <div>
            <textarea id="se-text-content" placeholder="Start typing..." style="width:100%;height:140px;border-radius:8px;border:1px solid var(--color-border, #3e4042);background:var(--bg-input, #3a3b3c);color:inherit;padding:12px;box-sizing:border-box;resize:none;outline:none;font-size:1rem;"></textarea>
          </div>

          <!-- Font Style -->
          <div>
            <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text-secondary, #b0b3b8);margin-bottom:8px;">Font choice</label>
            <select id="se-font-select" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--color-border, #3e4042);background:var(--bg-input, #3a3b3c);color:inherit;outline:none;font-size:0.95rem;">
              <option value="sans-serif">Clean (Sans-Serif)</option>
              <option value="Georgia, serif">Fancy (Georgia)</option>
              <option value="'Courier New', monospace">Headline (Monospace)</option>
              <option value="'Comic Sans MS', cursive">Casual (Cursive)</option>
            </select>
          </div>

          <!-- Background Gradients -->
          <div>
            <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text-secondary, #b0b3b8);margin-bottom:10px;">Backgrounds</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              ${GRADIENTS.map(g => `
                <button class="se-grad-btn" data-grad-id="${g.id}" title="${g.label}" style="width:36px;height:36px;border-radius:50%;border:2px solid ${g.id === selectedGrad.id ? 'var(--color-primary, #1877f2)' : 'rgba(255,255,255,0.2)'};background:${g.value};cursor:pointer;transition:transform 0.1s;"></button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Buttons -->
        <div style="padding:20px;border-top:1px solid var(--color-border, #3e4042);display:flex;gap:12px;background:var(--bg-card, #242526);">
          <button id="se-discard-btn" class="btn btn-secondary" style="flex:1;padding:12px;border-radius:8px;font-weight:600;background:var(--color-bg-hover, #3a3b3c);border:none;cursor:pointer;color:inherit;">Discard</button>
          <button id="se-share-btn" class="btn btn-primary" style="flex:1.2;padding:12px;border-radius:8px;font-weight:600;background:var(--color-primary, #1877f2);border:none;cursor:pointer;color:white;">Share to story</button>
        </div>
      </div>

      <!-- Right Panel: Live Preview -->
      <div style="flex:1;background:#090909;display:flex;align-items:center;justify-content:center;position:relative;padding:24px;box-sizing:border-box;">
        
        <!-- Story Phone Card Preview -->
        <div id="se-text-preview-card" style="width:320px;height:568px;border-radius:12px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.6);position:relative;background:${selectedGrad.value};display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
          
          <!-- Live Overlay Text -->
          <div id="se-text-preview-overlay" style="color:${textColor};font-size:20px;font-weight:700;text-align:center;word-wrap:break-word;line-height:1.4;max-height:100%;overflow:hidden;font-family:${fontStyle};text-shadow:0 2px 4px rgba(0,0,0,0.3);">
            Type something...
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textPreviewOverlay = overlay.querySelector('#se-text-preview-overlay');
    const textPreviewCard = overlay.querySelector('#se-text-preview-card');

    const updatePreview = () => {
      if (textPreviewOverlay) {
        textPreviewOverlay.textContent = typedText.trim() ? typedText : 'Type something...';
        textPreviewOverlay.style.fontFamily = fontStyle;
      }
      if (textPreviewCard) {
        textPreviewCard.style.background = selectedGrad.value;
      }
    };

    // Events
    overlay.querySelector('#se-text-content')?.addEventListener('input', (e) => {
      typedText = e.target.value;
      updatePreview();
    });

    overlay.querySelector('#se-font-select')?.addEventListener('change', (e) => {
      fontStyle = e.target.value;
      updatePreview();
    });

    overlay.querySelectorAll('.se-grad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.gradId;
        selectedGrad = GRADIENTS.find(g => g.id === id);
        overlay.querySelectorAll('.se-grad-btn').forEach(b => {
          b.style.borderColor = (b.dataset.gradId === selectedGrad.id) ? 'var(--color-primary, #1877f2)' : 'rgba(255,255,255,0.2)';
        });
        updatePreview();
      });
    });

    const closeEditor = () => {
      overlay.remove();
      Feed.openStorySelectionModal();
    };

    overlay.querySelector('#se-discard-btn')?.addEventListener('click', closeEditor);
    overlay.querySelector('#se-discard-btn-top')?.addEventListener('click', closeEditor);

    // Share to story (Bakes the text canvas)
    overlay.querySelector('#se-share-btn')?.addEventListener('click', async () => {
      if (!typedText.trim()) {
        window.Utils?.showToast?.('Please enter some text first!', 'error');
        return;
      }

      const btn = overlay.querySelector('#se-share-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sharing...';
      }

      try {
        window.Utils?.showToast?.('Baking text story...', 'info');

        const bakedBase64 = await Feed.bakeTextStory({
          text: typedText,
          gradient: selectedGrad.value,
          font: fontStyle,
          color: textColor
        });

        const res = await Api.post('/stories', {
          mediaUrl: bakedBase64,
          mediaType: 'image',
          caption: typedText
        });

        if (res.success) {
          window.Utils?.showToast?.('Story shared successfully!', 'success');
          overlay.remove();
          Feed.loadStories();
        } else {
          throw new Error('Server upload failed');
        }
      } catch (err) {
        console.error('[Story] Text story upload failed:', err);
        window.Utils?.showToast?.('Failed to share story', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Share to story';
        }
      }
    });
  },

  bakePhotoStory(base64, options = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // High Resolution 1080x1920 HD Story Canvas
        canvas.width = Math.max(1080, img.width || 1080);
        canvas.height = Math.max(1920, img.height || 1920);

        // Black base
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Save context state for photo transformation
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        
        if (options.rotation) {
          ctx.rotate((options.rotation * Math.PI) / 180);
        }
        if (options.zoom) {
          ctx.scale(options.zoom, options.zoom);
        }

        // Draw image keeping ratio
        const imgRatio = img.width / img.height;
        const canvasRatio = canvas.width / canvas.height;
        let drawWidth, drawHeight;

        if (imgRatio > canvasRatio) {
          drawWidth = canvas.width;
          drawHeight = canvas.width / imgRatio;
        } else {
          drawHeight = canvas.height;
          drawWidth = canvas.height * imgRatio;
        }

        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();

        // Draw overlay text
        if (options.caption && options.caption.trim()) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillRect(60, canvas.height - 360, canvas.width - 120, 240);

          ctx.font = 'bold 54px sans-serif';
          ctx.fillStyle = options.textColor || '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Word wrap
          const words = options.caption.split(' ');
          let line = '';
          const lines = [];
          const maxWidth = canvas.width - 180;

          for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
              lines.push(line);
              line = words[n] + ' ';
            } else {
              line = testLine;
            }
          }
          lines.push(line);

          const startY = canvas.height - 240 - ((lines.length - 1) * 35);
          for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i].trim(), canvas.width / 2, startY + (i * 70));
          }
        }

        // HD quality 0.96 output
        resolve(canvas.toDataURL('image/jpeg', 0.96));
      };
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = base64;
    });
  },

  bakeTextStory(options = {}) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // High Resolution 1080x1920 HD Story Canvas
      canvas.width = 1080;
      canvas.height = 1920;

      // Draw background gradient
      const gradientStr = options.gradient || 'linear-gradient(135deg, #1877f2, #00c6ff)';
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      
      // Parse gradient colors
      if (gradientStr.includes('#')) {
        const matches = gradientStr.match(/#[a-fA-F0-9]{3,8}/g);
        if (matches && matches.length >= 2) {
          grad.addColorStop(0, matches[0]);
          grad.addColorStop(1, matches[matches.length - 1]);
        } else {
          grad.addColorStop(0, '#1877f2');
          grad.addColorStop(1, '#00c6ff');
        }
      } else {
        grad.addColorStop(0, '#1877f2');
        grad.addColorStop(1, '#00c6ff');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw text centered
      ctx.fillStyle = options.color || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold 64px ${options.font || 'sans-serif'}`;
      
      // Text wrap
      const textContent = options.text || '';
      const words = textContent.split(' ');
      let line = '';
      const lines = [];
      const maxWidth = canvas.width - 120;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      const startY = canvas.height / 2 - ((lines.length - 1) * 45);
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i].trim(), canvas.width / 2, startY + (i * 90));
      }

      // HD quality 0.96 output
      resolve(canvas.toDataURL('image/jpeg', 0.96));
    });
  },

  showStoryViewer(userId) {
    const group = this.storyGroups.find(g => g.userId === userId);
    if (!group || !group.stories.length) return;

    let storyIndex = 0;
    let autoTimer = null;
    let myReaction = null;
    let showEmojiPicker = false;
    let showReactors = false;

    const overlay = document.createElement('div');
    overlay.id = 'story-viewer-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.92);
      display:flex;align-items:center;justify-content:center;
      z-index:99999;font-family:var(--font-family-body, sans-serif);
      backdrop-filter:blur(10px);color:white;
    `;

    const closeViewer = () => {
      clearTimeout(autoTimer);
      document.removeEventListener('keydown', overlay._keyHandler);
      overlay.remove();
    };

    const startAutoTimer = () => {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => {
        if (storyIndex < group.stories.length - 1) {
          storyIndex++;
          render();
        } else {
          closeViewer();
        }
      }, 5000);
    };

    const render = () => {
      const story = group.stories[storyIndex];
      if (!story) { closeViewer(); return; }

      // Mark as seen
      if (!story.seen) {
        story.seen = true;
        Api.post(`/api/stories/${story.id}/seen`).catch(() => {});
      }

      const currentUser = window.Auth?.getCurrentUser?.();
      const isOwn = group.userId === currentUser?.id;

      // Reactions config
      const REACTIONS = [
        { key: 'like', emoji: '👍', label: 'Like' },
        { key: 'love', emoji: '❤️', label: 'Love' },
        { key: 'care', emoji: '🥰', label: 'Care' },
        { key: 'haha', emoji: '😆', label: 'Haha' },
        { key: 'wow', emoji: '😮', label: 'Wow' },
        { key: 'sad', emoji: '😢', label: 'Sad' },
        { key: 'angry', emoji: '😡', label: 'Angry' }
      ];

      // My reaction
      const myReactObj = story.reactions?.find(r => r.userId === currentUser?.id);
      myReaction = myReactObj ? myReactObj.reaction : null;

      // Render summary of reactions
      const counts = {};
      story.reactions?.forEach(r => { counts[r.reaction] = (counts[r.reaction] || 0) + 1; });
      const reactSummary = Object.keys(counts).map(k => {
        const matching = REACTIONS.find(r => r.key === k);
        return matching ? `<span style="display:inline-flex;align-items:center;gap:4px;">${matching.emoji} <small>${counts[k]}</small></span>` : '';
      }).join(' ');

      // Reactors panel
      let reactorsPanel = '';
      if (showReactors && isOwn && story.reactions?.length) {
        reactorsPanel = `
          <div style="position:absolute;bottom:75px;left:12px;right:12px;background:rgba(20,20,20,0.95);border-radius:12px;padding:12px;z-index:50;max-height:180px;overflow-y:auto;border:1px solid rgba(255,255,255,0.15);">
            <div style="font-weight:700;font-size:13px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;">Reactions (${story.reactions.length})</div>
            ${story.reactions.map(r => {
              const matching = REACTIONS.find(re => re.key === r.reaction);
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:12px;">
                  <span style="font-weight:600;">${window.Utils?.escapeHtml?.(r.fullName || r.username)}</span>
                  <span>${matching ? matching.emoji : ''}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      // Emoji picker panel
      let emojiPanel = '';
      if (showEmojiPicker) {
        emojiPanel = `
          <div style="position:absolute;bottom:75px;left:12px;right:12px;background:rgba(20,20,20,0.95);border-radius:12px;padding:12px;z-index:50;display:flex;gap:10px;justify-content:center;border:1px solid rgba(255,255,255,0.15);">
            ${['👍','❤️','😂','😮','😢','😡','🙏','✨'].map(em => `
              <button data-story-emoji="${em}" style="background:none;border:none;font-size:1.6rem;cursor:pointer;transition:transform 0.1s;" onmouseover="this.style.transform='scale(1.25)'" onmouseout="this.style.transform='scale(1)'">${em}</button>
            `).join('')}
          </div>
        `;
      }

      overlay.innerHTML = `
        <!-- Story View Frame -->
        <div style="width:360px;height:640px;background:#000;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,0.8);position:relative;overflow:hidden;display:flex;flex-direction:column;">
          
          <!-- Top bar with progress bars -->
          <div style="position:absolute;top:0;left:0;right:0;padding:12px 12px 24px;background:linear-gradient(to bottom,rgba(0,0,0,0.85) 0%,transparent 100%);z-index:30;">
            <!-- Progress lines -->
            <div style="display:flex;gap:4px;margin-bottom:12px;">
              ${group.stories.map((s, idx) => {
                let width = '0%';
                if (idx < storyIndex) width = '100%';
                return `
                  <div style="flex:1;height:3px;background:rgba(255,255,255,0.35);border-radius:2px;overflow:hidden;">
                    <div id="${idx === storyIndex ? 'story-progress-bar' : ''}" style="height:100%;background:white;width:${width};"></div>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Profile Info & Close -->
            <div style="display:flex;align-items:center;justify-content:space-between;color:white;">
              <div style="display:flex;align-items:center;gap:10px;">
                <img src="${group.avatar || 'https://ui-avatars.com/api/?name=User&background=random&size=200'}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid white;">
                <div>
                  <div style="font-weight:700;font-size:14px;text-shadow:0 1px 3px rgba(0,0,0,0.6);">${window.Utils?.escapeHtml?.(group.fullName || group.username)}</div>
                  <div style="font-size:11px;opacity:0.8;text-shadow:0 1px 3px rgba(0,0,0,0.6);">${window.Utils?.formatTime?.(story.createdAt) || 'Recent'}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${isOwn ? `
                  <button id="story-delete-btn" title="Delete Story" style="background:rgba(228,38,69,0.3);border:none;color:white;width:34px;height:34px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.95rem;backdrop-filter:blur(4px);"><i class="fas fa-trash-alt"></i></button>
                ` : ''}
                <button id="story-close-btn" style="background:rgba(255,255,255,0.25);border:none;color:white;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:1.15rem;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">&times;</button>
              </div>
            </div>
          </div>

          <!-- Story image / background content -->
          <img src="${story.mediaUrl}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;z-index:5;">

          <!-- Captions / Text overlays -->
          ${story.caption ? `<div style="position:absolute;bottom:90px;left:0;right:0;padding:16px 20px;background:linear-gradient(to top,rgba(0,0,0,0.75),transparent);color:white;font-size:15px;z-index:20;text-align:center;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.6);">${window.Utils?.escapeHtml?.(story.caption)}</div>` : ''}

          <!-- Tap zones (left/right navigation) -->
          <div style="position:absolute;inset:0;display:flex;z-index:15;">
            <div id="story-prev-zone" style="flex:1;cursor:pointer;"></div>
            <div id="story-next-zone" style="flex:1;cursor:pointer;"></div>
          </div>

          ${reactorsPanel}
          ${emojiPanel}

          <!-- Bottom interactive bar -->
          <div style="position:absolute;bottom:0;left:0;right:0;z-index:40;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%);padding:14px 12px 16px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
              ${reactSummary ? `<div style="color:white;font-size:13px;flex:1;display:flex;gap:8px;flex-wrap:wrap;">${reactSummary}</div>` : '<div style="flex:1;"></div>'}
              ${isOwn ? `
                <button id="story-view-reactors" style="background:rgba(255,255,255,0.15);border:none;color:white;font-size:12px;padding:4px 10px;border-radius:20px;cursor:pointer;">
                  👁 ${story.viewsCount || 0} views
                </button>` : ''}
            </div>

            ${isOwn ? '' : `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;justify-content:center;">
              ${REACTIONS.map(r => `
                <button data-story-react="${r.key}" title="${r.label}" style="background:${myReaction === r.key ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'};border:none;font-size:1.3rem;cursor:pointer;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                  ${r.emoji}
                </button>`).join('')}
            </div>`}

            <div style="display:flex;align-items:center;gap:8px;">
              <button id="story-emoji-toggle" style="background:rgba(255,255,255,0.15);border:none;color:white;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:1.2rem;">😊</button>
              <input id="story-msg-input" type="text" placeholder="${isOwn ? 'Add note...' : 'Reply to story...'}" style="flex:1;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:24px;padding:8px 16px;color:white;font-size:13px;outline:none;" />
              <button id="story-send-btn" style="background:var(--color-primary, #1877f2);border:none;color:white;width:38px;height:38px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fas fa-paper-plane"></i></button>
            </div>
          </div>
        </div>
      `;

      // Animate progress bar
      startAutoTimer();
      const bar = document.getElementById('story-progress-bar');
      if (bar) {
        bar.style.transition = 'width 5s linear';
        requestAnimationFrame(() => { bar.style.width = '100%'; });
      }

      // Event listeners
      document.getElementById('story-close-btn').addEventListener('click', closeViewer);

      document.getElementById('story-prev-zone').addEventListener('click', (e) => {
        e.stopPropagation();
        if (storyIndex > 0) { storyIndex--; render(); }
      });
      document.getElementById('story-next-zone').addEventListener('click', (e) => {
        e.stopPropagation();
        if (storyIndex < group.stories.length - 1) { storyIndex++; render(); }
        else closeViewer();
      });

      overlay.querySelectorAll('[data-story-react]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const key = btn.dataset.storyReact;
          myReaction = myReaction === key ? null : key;
          try {
            await Api.post(`/api/stories/${story.id}/react`, { reaction: myReaction });
          } catch {}
          render();
        });
      });

      const reactBtn = document.getElementById('story-view-reactors');
      if (reactBtn) {
        reactBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showReactors = !showReactors;
          render();
        });
      }

      const delBtn = document.getElementById('story-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          clearTimeout(autoTimer);
          if (!confirm('Delete this story?')) { render(); return; }
          try {
            await Api.post(`/api/stories/${story.id}/delete`);
            window.Utils?.showToast?.('Story deleted successfully!', 'success');
            group.stories.splice(storyIndex, 1);
            if (group.stories.length === 0) { closeViewer(); Feed.loadStories(); return; }
            if (storyIndex >= group.stories.length) storyIndex = group.stories.length - 1;
            render();
            Feed.loadStories();
          } catch {
            window.Utils?.showToast?.('Delete failed', 'error');
            render();
          }
        });
      }

      document.getElementById('story-emoji-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(autoTimer);
        showEmojiPicker = !showEmojiPicker;
        render();
      });

      overlay.querySelectorAll('[data-story-emoji]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const inp = document.getElementById('story-msg-input');
          if (inp) inp.value += btn.dataset.storyEmoji;
          showEmojiPicker = false;
          render();
          setTimeout(() => document.getElementById('story-msg-input')?.focus(), 50);
        });
      });

      document.getElementById('story-send-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const inp = document.getElementById('story-msg-input');
        const msg = inp?.value?.trim();
        if (!msg) return;
        try {
          if (isOwn) {
            window.Utils?.showToast?.('Note saved!', 'success');
          } else {
            await Api.post('/chat/send', {
              recipientId: group.userId,
              content: msg,
              storyId: story.id
            });
            window.Utils?.showToast?.('Reply sent via chat!', 'success');
          }
          if (inp) inp.value = '';
        } catch (err) {
          window.Utils?.showToast?.('Failed to send reply', 'error');
        }
      });

      // Keyboard nav
      const keyHandler = (e) => {
        if (e.key === 'ArrowLeft') { if (storyIndex > 0) { storyIndex--; render(); } }
        if (e.key === 'ArrowRight') {
          if (storyIndex < group.stories.length - 1) { storyIndex++; render(); }
          else closeViewer();
        }
        if (e.key === 'Escape') closeViewer();
      };
      document.addEventListener('keydown', keyHandler);
      overlay._keyHandler = keyHandler;
    };

    document.body.appendChild(overlay);
    render();
  }
};

// Expose globally
window.Feed = Feed;
