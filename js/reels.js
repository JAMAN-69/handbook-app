/**
 * Reels Module — Full screen vertical video player
 */
const Reels = {
  reels: [],
  currentIndex: 0,

  init() {
    // Expose reels globally
  },

  // ── Render Reels Page ──────────────────────────────────────────────
  async renderReelsPage() {
    // Fetch reels
    setTimeout(() => this.loadReels(), 100);

    return `
      <div class="reels-container" id="reels-container">
        <div class="reels-loading">
          <i class="fas fa-circle-notch fa-spin"></i> Loading Reels...
        </div>
      </div>
    `;
  },

  async loadReels() {
    const container = document.getElementById('reels-container');
    if (!container) return;

    try {
      const data = await Api.get('/posts/reels');
      this.reels = data.reels || [];

      if (!this.reels.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">🎬</div>
            <h3>No Reels Yet</h3>
            <p>Share a video post to start the reels feed!</p>
          </div>
        `;
        return;
      }

      this.renderReelsList(container);
      this.setupReelIntersectionObserver();
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Error loading reels.</p></div>`;
    }
  },

  renderReelsList(container) {
    const html = this.reels.map((reel, idx) => {
      const videoMedia = reel.media.find(m => m.type === 'video');
      const videoUrl = videoMedia ? videoMedia.url : '';
      const authorName = window.Utils.escapeHtml(reel.author.fullName || reel.author.username);
      const avatar = reel.author.avatar;
      const content = window.Utils.escapeHtml(reel.content || '');

      const isFollowing = window.Social && window.Social.isFollowing(reel.author.id);
      const isSelf = window.Auth && window.Auth.getCurrentUser()?.id === reel.author.id;
      const followBtn = (!isSelf && window.Social)
        ? `<button class="btn btn-sm ${isFollowing ? 'btn-outline btn-following' : 'btn-primary'} follow-btn" data-action="${isFollowing ? 'unfollow' : 'follow'}" data-user-id="${reel.author.id}">${isFollowing ? 'Following' : 'Follow'}</button>`
        : '';

      return `
        <div class="reel-item" data-index="${idx}" id="reel-item-${reel.id}">
          <video class="reel-video" src="${videoUrl}" loop playsinline muted></video>
          
          <div class="reel-overlay-play">
            <i class="fas fa-play"></i>
          </div>

          <div class="reel-sidebar">
            <div class="reel-action-btn" data-action="reel-like" data-post-id="${reel.id}" title="Like">
              <i class="fas fa-heart ${reel.viewerLiked ? 'liked' : ''}"></i>
              <span class="count">${reel.likesCount || 0}</span>
            </div>
            <div class="reel-action-btn" data-action="reel-comment" data-post-id="${reel.id}" title="Comments">
              <i class="fas fa-comment"></i>
              <span class="count">${reel.commentsCount || 0}</span>
            </div>
            <div class="reel-action-btn" data-action="reel-share" data-post-id="${reel.id}" title="Share Options">
              <i class="fas fa-share"></i>
              <span class="count">${reel.sharesCount || 0}</span>
            </div>
            <div class="reel-action-btn" data-action="reel-copylink" data-post-id="${reel.id}" title="Copy Link">
              <i class="fas fa-link"></i>
              <span class="count">Link</span>
            </div>
            <div class="reel-action-btn" data-action="reel-sound" data-post-id="${reel.id}" title="Toggle Sound">
              <i class="fas fa-volume-mute"></i>
              <span class="count">Sound</span>
            </div>
          </div>

          <div class="reel-meta">
            <div class="reel-author">
              <a href="#profile/${reel.author.id}" class="reel-author-link">
                <img src="${avatar}" alt="${authorName}" class="reel-avatar">
                <span class="reel-name">${authorName}</span>
              </a>
              ${followBtn}
            </div>
            <div class="reel-description">
              <p>${content}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="reels-scroll-wrapper" id="reels-scroll-wrapper">${html}</div>`;
  },

  setupReelIntersectionObserver() {
    const wrapper = document.getElementById('reels-scroll-wrapper');
    if (!wrapper) return;

    const options = {
      root: wrapper,
      rootMargin: '0px',
      threshold: 0.6
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (entry.isIntersecting) {
          // Play current video
          if (video) {
            video.play().catch(err => console.log('Autoplay blocked:', err));
            entry.target.classList.add('playing');
          }
          this.currentIndex = parseInt(entry.target.dataset.index);
        } else {
          // Pause offscreen videos
          if (video) {
            video.pause();
            entry.target.classList.remove('playing');
          }
        }
      });
    }, options);

    const items = wrapper.querySelectorAll('.reel-item');
    items.forEach(item => observer.observe(item));

    // Global listener for click actions on reels wrapper
    wrapper.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        this.handleEvent(e);
        return;
      }

      const reelItem = e.target.closest('.reel-item');
      if (!reelItem) return;

      // Make sure we didn't click actions/meta
      if (e.target.closest('.reel-sidebar') || e.target.closest('.reel-meta')) return;

      const video = reelItem.querySelector('video');
      const playIcon = reelItem.querySelector('.reel-overlay-play');
      if (!video) return;

      if (video.paused) {
        video.muted = false; // Unmute on manual play
        video.play();
        if (playIcon) playIcon.classList.remove('active');
        const soundIcon = reelItem.querySelector('[data-action="reel-sound"] i');
        if (soundIcon) { soundIcon.className = 'fas fa-volume-up'; }
      } else {
        video.pause();
        if (playIcon) playIcon.classList.add('active');
      }
    });
  },

  // ── Handle events ──────────────────────────────────────────────────
  async handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;
    const postId = target.dataset.postId;
    const userId = target.dataset.userId;

    if (action === 'reel-like') {
      const heartIcon = target.querySelector('i');
      const countSpan = target.querySelector('.count');
      const isLiked = heartIcon.classList.contains('liked');

      try {
        const res = await Api.post(`/posts/${postId}/react`, { type: isLiked ? null : 'like' });
        if (res.success) {
          if (res.action === 'reacted') {
            heartIcon.classList.add('liked');
          } else {
            heartIcon.classList.remove('liked');
          }
          if (countSpan && res.likesCount !== undefined) countSpan.textContent = res.likesCount;
          window.Utils?.showToast?.(res.action === 'reacted' ? 'Liked Reel!' : 'Removed Like', 'success');
        }
      } catch (err) {
        window.Utils?.showToast?.('Failed to toggle like', 'error');
      }
      return true;
    }

    if (action === 'reel-comment') {
      if (typeof Post !== 'undefined') {
        Post.showCommentsModal(postId);
      }
      return true;
    }

    if (action === 'reel-share') {
      if (typeof Post !== 'undefined') {
        Post.showShareModal(postId, 'reel');
      } else {
        window.Utils?.showToast?.('Reel link copied!', 'success');
      }
      return true;
    }

    if (action === 'reel-copylink') {
      if (typeof Post !== 'undefined') {
        Post.copyPostLink(postId, 'reel');
      } else {
        window.Utils?.showToast?.('Reel link copied!', 'success');
      }
      return true;
    }

    if (action === 'reel-sound') {
      const reelItem = target.closest('.reel-item');
      if (reelItem) {
        const video = reelItem.querySelector('video');
        const icon = target.querySelector('i');
        if (video) {
          video.muted = !video.muted;
          if (icon) {
            icon.className = video.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
          }
          window.Utils?.showToast?.(video.muted ? 'Muted sound' : 'Unmuted sound', 'info');
        }
      }
      return true;
    }

    if (action === 'follow' || action === 'unfollow') {
      if (window.Social) {
        if (action === 'follow') {
          await window.Social.followUser(userId);
        } else {
          await window.Social.unfollowUser(userId);
        }
        // Update button UI
        const isFollowing = window.Social.isFollowing(userId);
        target.dataset.action = isFollowing ? 'unfollow' : 'follow';
        target.className = `btn btn-sm ${isFollowing ? 'btn-outline btn-following' : 'btn-primary'} follow-btn`;
        target.textContent = isFollowing ? 'Following' : 'Follow';
      }
      return true;
    }

    return false;
  }
};

window.Reels = Reels;
