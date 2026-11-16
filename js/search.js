/**
 * Search Module — Search & Explore
 * Handles user search, post search, hashtag search,
 * search suggestions dropdown, and the explore page
 * with trending content.
 */
const Search = {
  _currentTab: 'people', // 'people' | 'posts' | 'hashtags'

  init() {
    // Module ready
  },

  // ── Render search results page ─────────────────────────────────────
  renderSearchResults(query) {
    if (!query || !query.trim()) {
      return this.renderExplorePage();
    }

    const q = query.trim();
    const tabs = [
      { key: 'people', label: 'People' },
      { key: 'posts', label: 'Posts' },
      { key: 'hashtags', label: 'Hashtags' }
    ];

    const tabHtml = tabs.map(t => `
      <button class="search-tab ${this._currentTab === t.key ? 'search-tab--active' : ''}"
              data-action="set-search-tab" data-tab="${t.key}" data-query="${window.Utils?.escapeHtml?.(q) || q}">
        ${t.label}
      </button>
    `).join('');

    let resultsHtml = '';
    switch (this._currentTab) {
      case 'people':
        resultsHtml = this._renderPeopleResults(q);
        break;
      case 'posts':
        resultsHtml = this._renderPostResults(q);
        break;
      case 'hashtags':
        resultsHtml = this._renderHashtagResults(q);
        break;
    }

    return `
      <div class="search-results-page">
        <div class="search-results__header card">
          <h2 class="search-results__title">Search results for "${window.Utils?.escapeHtml?.(q) || q}"</h2>
          <div class="search-tabs">${tabHtml}</div>
        </div>
        <div class="search-results__content" id="search-results-content">
          ${resultsHtml}
        </div>
      </div>
    `;
  },

  // ── Search users (API-backed) ──────────────────────────────────────
  async searchUsersApi(query) {
    if (!query || query.trim().length < 1) return [];
    try {
      const data = await Api.searchUsers(query.trim());
      return data.users || [];
    } catch (e) { return []; }
  },

  // ── Search posts (API-backed) ──────────────────────────────────────
  async searchPostsApi(query) {
    if (!query || query.trim().length < 1) return [];
    try {
      const data = await Api.searchPosts(query.trim());
      return data.posts || [];
    } catch (e) { return []; }
  },

  // ── Search hashtags (API-backed) ───────────────────────────────────
  async searchHashtagsApi(query) {
    if (!query || query.trim().length < 1) return [];
    try {
      const data = await Api.searchHashtags(query.trim());
      return (data.hashtags || []).map(h => ({ tag: '#' + h.name, count: h.posts_count || 0 }));
    } catch (e) { return []; }
  },

  // ── Legacy local search (fallback) ────────────────────────────────
  searchUsers(query) {
    const store = window.Store;
    if (!store || !query) return [];
    const q = query.toLowerCase().trim();
    const allUsers = store.users || store.getAllUsers?.() || [];
    return allUsers.filter(user =>
      user.fullName.toLowerCase().includes(q) ||
      user.username.toLowerCase().includes(q) ||
      (user.bio || '').toLowerCase().includes(q)
    );
  },

  searchPosts(query) {
    const store = window.Store;
    if (!store || !query) return [];
    const q = query.toLowerCase().trim();
    return (store.posts || []).filter(post =>
      (post.content || '').toLowerCase().includes(q) ||
      (post.hashtags || []).some(tag => tag.includes(q))
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  searchHashtags(query) {
    const store = window.Store;
    if (!store || !query) return [];
    const q = query.toLowerCase().trim().replace(/^#/, '');
    const hashtags = store.hashtags || {};
    return Object.values(hashtags)
      .filter(h => h.tag.replace('#', '').includes(q))
      .sort((a, b) => b.count - a.count);
  },

  // ── Render explore page ────────────────────────────────────────────
  renderExplorePage() {
    return `
      <div class="explore-page">
        <div class="explore-page__header">
          <h2>Explore</h2>
        </div>
        ${this._renderTrendingSection()}
        ${this._renderPopularPostsGrid()}
      </div>
    `;
  },

  // ── Render search suggestions dropdown (in header) ─────────────────
  renderSearchSuggestions(query) {
    if (!query || query.trim().length < 2) return '';

    const q = query.trim();
    const users = this.searchUsers(q).slice(0, 4);
    const hashtags = this.searchHashtags(q).slice(0, 3);
    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    if (users.length === 0 && hashtags.length === 0) {
      return `
        <div class="search-suggestions" id="search-suggestions">
          <div class="search-suggestion__empty">
            <p>No results for "${esc(q)}"</p>
          </div>
        </div>
      `;
    }

    let html = '<div class="search-suggestions" id="search-suggestions">';

    // User suggestions
    if (users.length > 0) {
      html += '<div class="search-suggestions__section">';
      users.forEach(user => {
        html += `
          <a class="search-suggestion-item" href="#profile/${user.id}" data-action="close-suggestions">
            <img class="avatar avatar-xs" src="${user.avatar}" alt="">
            <div class="search-suggestion-item__info">
              <span class="search-suggestion-item__name">${esc(user.fullName)}</span>
              <span class="search-suggestion-item__username">@${esc(user.username)}</span>
            </div>
          </a>
        `;
      });
      html += '</div>';
    }

    // Hashtag suggestions
    if (hashtags.length > 0) {
      html += '<div class="search-suggestions__section search-suggestions__section--tags">';
      hashtags.forEach(tag => {
        html += `
          <a class="search-suggestion-item" href="#search/tag/${tag.tag.replace('#', '')}" data-action="close-suggestions">
            <span class="search-suggestion-item__hash">#</span>
            <div class="search-suggestion-item__info">
              <span class="search-suggestion-item__name">${esc(tag.tag.replace('#', ''))}</span>
              <span class="search-suggestion-item__count">${tag.count} post${tag.count !== 1 ? 's' : ''}</span>
            </div>
          </a>
        `;
      });
      html += '</div>';
    }

    // "Search for" option
    html += `
      <div class="search-suggestions__footer">
        <a class="search-suggestion-item search-suggestion-item--search"
           href="#search/${encodeURIComponent(q)}" data-action="close-suggestions">
          <span class="search-suggestion-item__icon">🔍</span>
          <span>Search for "${esc(q)}"</span>
        </a>
      </div>
    `;

    html += '</div>';
    return html;
  },

  // ── Get trending hashtags ──────────────────────────────────────────
  getTrendingHashtags() {
    const store = window.Store;
    if (!store) return [];

    const hashtags = store.hashtags || {};
    const sorted = Object.values(hashtags)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // If no data, return defaults for demo
    if (sorted.length === 0) {
      return [
        { tag: '#technology', count: 128 },
        { tag: '#design', count: 95 },
        { tag: '#photography', count: 82 },
        { tag: '#travel', count: 76 },
        { tag: '#coding', count: 64 },
        { tag: '#music', count: 58 },
        { tag: '#food', count: 45 },
        { tag: '#fitness', count: 39 },
        { tag: '#art', count: 34 },
        { tag: '#nature', count: 28 }
      ];
    }

    return sorted;
  },

  // ── Private render helpers ─────────────────────────────────────────
  _renderPeopleResults(query) {
    const container = document.getElementById('search-results-content');
    if (container) container.innerHTML = '<div class="card" style="padding:2rem;text-align:center;"><i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem;color:var(--color-primary);"></i></div>';

    this.searchUsersApi(query).then(users => {
      const esc = str => window.Utils?.escapeHtml?.(str) || str;
      let html;
      if (!users || users.length === 0) {
        html = `<div class="empty-state card"><div class="empty-state__icon">👤</div><h3>No people found</h3><p>Try searching with different keywords</p></div>`;
      } else {
        const cards = users.map(user => {
          const currentUser = window.Auth?.getCurrentUser?.();
          const isMe = currentUser && currentUser.id === user.id;
          return `
            <div class="user-result-card card">
              <a href="#profile/${user.id}" class="user-result-card__info">
                <img class="avatar avatar-md" src="${user.avatar}" alt="${esc(user.fullName)}">
                <div class="user-result-card__details">
                  <h4 class="user-result-card__name">${esc(user.fullName)}</h4>
                  <span class="user-result-card__username">@${esc(user.username)}</span>
                  ${user.bio ? `<p class="user-result-card__bio">${esc(user.bio)}</p>` : ''}
                </div>
              </a>
              <div class="user-result-card__actions">
                ${!isMe ? `<a href="#chat/${user.id}" class="btn btn-secondary btn-sm">💬 Message</a>` : ''}
              </div>
            </div>
          `;
        }).join('');
        html = `<div class="user-results">${cards}</div>`;
      }
      const c = document.getElementById('search-results-content');
      if (c) c.innerHTML = html;
    });
    return ''; // placeholder, async fills it
  },

  _renderPostResults(query) {
    const posts = this.searchPosts(query);

    if (posts.length === 0) {
      return `
        <div class="empty-state card">
          <div class="empty-state__icon">📝</div>
          <h3>No posts found</h3>
          <p>Try searching with different keywords</p>
        </div>
      `;
    }

    const cards = posts.map(post =>
      typeof Post !== 'undefined' ? Post.renderPostCard(post) : ''
    ).join('');

    return `<div class="post-results">${cards}</div>`;
  },

  _renderHashtagResults(query) {
    const hashtags = this.searchHashtags(query);
    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    if (hashtags.length === 0) {
      return `
        <div class="empty-state card">
          <div class="empty-state__icon">#</div>
          <h3>No hashtags found</h3>
          <p>Try searching with different keywords</p>
        </div>
      `;
    }

    const items = hashtags.map(h => `
      <a class="hashtag-result-card card" href="#search/tag/${h.tag.replace('#', '')}">
        <div class="hashtag-result-card__tag">
          <span class="hashtag-result-card__hash">#</span>
          <span class="hashtag-result-card__name">${esc(h.tag.replace('#', ''))}</span>
        </div>
        <span class="hashtag-result-card__count">${h.count} post${h.count !== 1 ? 's' : ''}</span>
      </a>
    `).join('');

    return `<div class="hashtag-results">${items}</div>`;
  },

  _renderTrendingSection() {
    const trending = this.getTrendingHashtags();
    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    const tags = trending.map((h, i) => `
      <a class="trending-card" href="#search/tag/${h.tag.replace('#', '')}">
        <span class="trending-card__rank">${i + 1}</span>
        <div class="trending-card__info">
          <span class="trending-card__tag">${esc(h.tag)}</span>
          <span class="trending-card__count">${h.count} post${h.count !== 1 ? 's' : ''}</span>
        </div>
      </a>
    `).join('');

    return `
      <div class="explore-section card">
        <h3 class="explore-section__title">🔥 Trending Now</h3>
        <div class="trending-grid">${tags}</div>
      </div>
    `;
  },

  _renderPopularPostsGrid() {
    const store = window.Store;
    if (!store) return '';

    // Get posts sorted by engagement (likes + comments)
    const posts = (store.posts || [])
      .map(p => {
        const commentCount = (store.comments || []).filter(c => c.postId === p.id).length;
        const likeCount = (p.likes || []).length;
        return { ...p, engagement: likeCount + commentCount };
      })
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 12);

    if (posts.length === 0) {
      return `
        <div class="explore-section card">
          <h3 class="explore-section__title">📸 Popular Posts</h3>
          <div class="empty-state">
            <p>No posts to explore yet. Be the first to post!</p>
          </div>
        </div>
      `;
    }

    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    const grid = posts.map(post => {
      const author = store.getUserById?.(post.userId);
      const hasImage = post.images && post.images.length > 0;
      const preview = (post.content || '').substring(0, 80);

      return `
        <div class="explore-grid__item" data-action="view-explore-post" data-post-id="${post.id}">
          ${hasImage
            ? `<img class="explore-grid__image" src="${post.images[0]}" alt="" loading="lazy">`
            : `<div class="explore-grid__text-preview">
                <p>${esc(preview)}</p>
              </div>`
          }
          <div class="explore-grid__overlay">
            <span class="explore-grid__stat">👍 ${(post.likes || []).length}</span>
            <span class="explore-grid__stat">💬 ${post.engagement - (post.likes || []).length}</span>
          </div>
          ${author ? `
            <div class="explore-grid__author">
              <img class="avatar avatar-xs" src="${author.avatar}" alt="">
              <span>${esc(author.fullName)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="explore-section">
        <h3 class="explore-section__title card" style="margin-bottom: 0.5rem; padding: 1rem 1.25rem;">📸 Popular Posts</h3>
        <div class="explore-grid">${grid}</div>
      </div>
    `;
  },

  // ── Global event delegation handler ────────────────────────────────
  handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;

    if (action === 'set-search-tab') {
      const tab = target.dataset.tab;
      const query = target.dataset.query;
      if (tab && query) {
        this._currentTab = tab;
        // Update active tab
        document.querySelectorAll('.search-tab').forEach(t =>
          t.classList.toggle('search-tab--active', t.dataset.tab === tab)
        );
        // Re-render results
        const container = document.getElementById('search-results-content');
        if (container) {
          switch (tab) {
            case 'people':
              container.innerHTML = this._renderPeopleResults(query);
              break;
            case 'posts':
              container.innerHTML = this._renderPostResults(query);
              break;
            case 'hashtags':
              container.innerHTML = this._renderHashtagResults(query);
              break;
          }
        }
      }
      return true;
    }

    if (action === 'close-suggestions') {
      const suggestions = document.getElementById('search-suggestions');
      if (suggestions) suggestions.remove();
      return true;
    }

    if (action === 'view-explore-post') {
      const postId = target.dataset.postId;
      if (postId) {
        location.hash = `#post/${postId}`;
      }
      return true;
    }

    return false;
  }
};

// Expose globally
window.Search = Search;
