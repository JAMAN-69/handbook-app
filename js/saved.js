/**
 * Saved Posts Module
 * Renders a dedicated page showing all of the current user's saved/bookmarked posts.
 */
const Saved = {
  _page: 0,
  _loading: false,
  _hasMore: true,

  async renderSavedPage() {
    this._page = 0;
    this._hasMore = true;

    const html = `
      <div class="saved-posts-container" style="max-width:680px; margin:0 auto; padding:var(--space-4);">
        <!-- Header -->
        <div class="card" style="padding:var(--space-5) var(--space-6); margin-bottom:var(--space-4); display:flex; align-items:center; gap:var(--space-4);">
          <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg,#f59e0b,#f97316); display:flex; align-items:center; justify-content:center; font-size:1.4rem; flex-shrink:0;">
            🔖
          </div>
          <div>
            <h1 style="margin:0; font-size:1.3rem; font-weight:700; color:var(--text-primary);">Saved Posts</h1>
            <p style="margin:0; font-size:0.875rem; color:var(--text-tertiary);">Posts you've saved for later</p>
          </div>
        </div>

        <!-- Posts feed -->
        <div id="saved-posts-feed">
          <div class="card" style="padding:var(--space-6); text-align:center;">
            <i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem; color:var(--color-primary); margin-bottom:var(--space-3);"></i>
            <p style="color:var(--text-tertiary); margin:0;">Loading saved posts...</p>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => this._loadSavedPosts(true), 100);
    return html;
  },

  async _loadSavedPosts(reset = false) {
    if (this._loading || (!reset && !this._hasMore)) return;
    this._loading = true;

    const feed = document.getElementById('saved-posts-feed');
    if (!feed) { this._loading = false; return; }

    try {
      const res = await Api.getSavedPosts(this._page, 10);
      const posts = res.posts || [];

      if (reset && posts.length === 0) {
        feed.innerHTML = `
          <div class="card" style="padding:var(--space-10); text-align:center;">
            <div style="font-size:4rem; margin-bottom:var(--space-4);">🔖</div>
            <h3 style="color:var(--text-primary); margin:0 0 var(--space-2);">No Saved Posts Yet</h3>
            <p style="color:var(--text-tertiary); margin:0; max-width:320px; margin-inline:auto;">
              When you save a post by clicking the <strong>Save</strong> button, it'll appear here.
            </p>
            <a href="#feed" class="btn btn-primary" style="margin-top:var(--space-5); display:inline-block;">
              Browse Feed
            </a>
          </div>
        `;
        this._hasMore = false;
        return;
      }

      const html = posts.map(p =>
        typeof Post !== 'undefined' ? Post.renderPostCard(p) : ''
      ).join('');

      if (reset) {
        feed.innerHTML = html;
      } else {
        feed.insertAdjacentHTML('beforeend', html);
      }

      this._page++;
      this._hasMore = res.hasMore || false;

      // Add "Load more" button if there are more
      const existing = document.getElementById('saved-load-more');
      if (existing) existing.remove();
      if (this._hasMore) {
        const btn = document.createElement('button');
        btn.id = 'saved-load-more';
        btn.className = 'btn btn-secondary';
        btn.style.cssText = 'width:100%; margin-top:var(--space-4); padding:12px;';
        btn.textContent = 'Load More';
        btn.onclick = () => this._loadSavedPosts(false);
        feed.insertAdjacentElement('afterend', btn);
      }

    } catch (err) {
      if (reset) {
        feed.innerHTML = `<div class="card" style="padding:var(--space-6); text-align:center; color:var(--text-tertiary);">Failed to load saved posts.</div>`;
      }
    } finally {
      this._loading = false;
    }
  },
};

window.Saved = Saved;
