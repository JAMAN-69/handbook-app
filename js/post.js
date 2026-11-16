/**
 * Post Module — Post Creation & Interactions
 * Handles post cards, post creator modal, likes, comments,
 * shares, bookmarks, image gallery, and emoji picker.
 */
const Post = {

  // ── Emoji data ─────────────────────────────────────────────────────
  _emojiCategories: {
    Smileys:  ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳'],
    Hearts:   ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
    Hands:    ['👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤏'],
    Animals:  ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛'],
    Food:     ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍕','🍔','🍟','🌭','🍿','🧂','🥚','🍳','🥞','🧇','🥓','🥩','🍗'],
    Objects:  ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','💡','🔦','🕯️','📷','📹','🎥','📞','☎️','📺','📻','🎵','🎶','🎤','🎧','📚','📖','📝','✏️','🖊️','📌','📎','✂️','🗑️']
  },

  _uploadedImages: [],

  init() {
    // Module ready
  },

  // ── Render a single post card ──────────────────────────────────────
  renderPostCard(post) {
    const utils = window.Utils;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!post || !post.author) return '';

    const author = post.author;
    const esc = str => utils?.escapeHtml?.(str) || str;
    const timeAgo = utils?.timeAgo?.(post.createdAt) || '';
    const isOwn = currentUser && currentUser.id === author.id;

    // Like state
    const isLiked = post.viewerLiked || false;
    const likesCount = post.likesCount || 0;

    // Comments
    const commentCount = post.commentsCount || 0;

    // Shares & bookmarks
    const shareCount = post.sharesCount || 0;
    const isBookmarked = post.viewerSaved || false;

    // Process content — highlight #hashtags
    const processedContent = this._processContent(post.content || '');

    // Image gallery
    const images = (post.media || []).filter(m => m.type === 'image').map(m => m.url);
    const gallery = images.length > 0 ? this.renderImageGallery(images, post.id) : '';

    // Video player
    const videos = (post.media || []).filter(m => m.type === 'video').map(m => m.url);
    const videoHtml = videos.length > 0 ? `
      <div class="post-card__video-wrapper" style="position:relative; border-radius:var(--radius-lg); overflow:hidden; background:#000; margin-top:var(--space-3);">
        <video src="${videos[0]}" controls style="width:100%; max-height:400px; display:block;" preload="metadata" playsinline></video>
      </div>
    ` : '';

    return `
      <div class="post-card card" data-post-id="${post.id}">
        <div class="post-card__header">
          <a class="post-card__author-link" href="#profile/${author.id}">
            <img class="avatar avatar-sm" src="${author.avatar}" alt="${esc(author.fullName)}">
          </a>
          <div class="post-card__meta">
            <div class="post-card__name-row">
              <a class="post-card__name" href="#profile/${author.id}">${esc(author.fullName)}</a>
              <span class="post-card__username">@${esc(author.username)}</span>
            </div>
            <span class="post-card__time">${timeAgo}</span>
          </div>
          <button class="post-card__menu-btn btn-icon" data-action="toggle-post-menu" data-post-id="${post.id}" title="More options">
            •••
          </button>
          <div class="post-menu dropdown-menu" id="post-menu-${post.id}" style="display:none;">
            ${this.renderPostMenu(post, isOwn)}
          </div>
        </div>

        <div class="post-card__content">
          <div class="post-card__text">${processedContent}</div>
          ${gallery}
          ${videoHtml}
        </div>

        <div class="post-card__stats">
          ${likesCount > 0 ? `<span class="post-card__stat">👍 ${likesCount}</span>` : ''}
          ${commentCount > 0 ? `<span class="post-card__stat">${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>` : ''}
          ${shareCount > 0 ? `<span class="post-card__stat">${shareCount} share${shareCount !== 1 ? 's' : ''}</span>` : ''}
        </div>

        <div class="post-card__divider"></div>

        <div class="post-card__actions">
          <div class="post-action-btn-wrapper">
            <button class="post-action-btn ${post.viewerReaction ? 'post-action-btn--liked' : ''}"
                    data-action="like-post" data-post-id="${post.id}" data-reaction="${post.viewerReaction || ''}">
              <span class="post-action-btn__icon">${this._getReactionEmoji(post.viewerReaction)}</span>
              <span class="reaction-label">${this._getReactionLabel(post.viewerReaction)}</span>
            </button>
            <div class="reactions-popup" id="reactions-popup-${post.id}">
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="like" data-post-id="${post.id}" title="Like">👍</span>
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="love" data-post-id="${post.id}" title="Love">❤️</span>
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="care" data-post-id="${post.id}" title="Care">🤗</span>
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="haha" data-post-id="${post.id}" title="Haha">😂</span>
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="wow" data-post-id="${post.id}" title="Wow">😮</span>
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="sad" data-post-id="${post.id}" title="Sad">😢</span>
              <span class="reaction-emoji-btn" data-action="react-post" data-reaction-type="angry" data-post-id="${post.id}" title="Angry">😡</span>
            </div>
          </div>
          <button class="post-action-btn" data-action="toggle-comments" data-post-id="${post.id}">
            <span class="post-action-btn__icon">💬</span>
            <span>Comment</span>
          </button>
          <button class="post-action-btn" data-action="share-post" data-post-id="${post.id}">
            <span class="post-action-btn__icon">↗️</span>
            <span>Share</span>
          </button>
          <button class="post-action-btn ${isBookmarked ? 'post-action-btn--bookmarked' : ''}"
                  data-action="bookmark-post" data-post-id="${post.id}"
                  style="${isBookmarked ? 'color:#f59e0b;' : ''}">
            <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
            <span>${isBookmarked ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        <div class="post-card__comments" id="comments-${post.id}" style="display:none;">
          <!-- Comments will be loaded here via Api.getComments -->
        </div>
      </div>
    `;
  },

  // ── Post menu (3 dots) ────────────────────────────────────────────
  renderPostMenu(post, isOwn) {
    let items = '';
    if (isOwn) {
      items += `
        <button class="dropdown-item" data-action="edit-post" data-post-id="${post.id}">✏️ Edit Post</button>
        <button class="dropdown-item dropdown-item--danger" data-action="delete-post" data-post-id="${post.id}">🗑️ Delete Post</button>
      `;
    } else {
      items += `
        <button class="dropdown-item" data-action="bookmark-post" data-post-id="${post.id}">🔖 Save Post</button>
        <button class="dropdown-item" data-action="report-post" data-post-id="${post.id}">🚩 Report</button>
      `;
    }
    return items;
  },

  // ── Render image gallery (Facebook-style) ──────────────────────────
  renderImageGallery(images, postId) {
    if (!images || images.length === 0) return '';

    const n = images.length;
    const maxShow = Math.min(n, 4);
    const extra = n > 4 ? n - 4 : 0;

    // Helper: create one image tile
    const tile = (src, i, extraOverlay = 0) => {
      const overlay = (extraOverlay > 0)
        ? `<div class="img-gallery__more">+${extraOverlay}</div>`
        : '';
      return `<div class="img-gallery__tile" data-action="view-image" data-index="${i}" data-post-id="${postId}" role="button" tabindex="0">
        <img src="${src}" alt="Photo ${i+1}" loading="lazy">
        ${overlay}
      </div>`;
    };

    let layout = '';

    if (n === 1) {
      layout = `<div class="img-gallery img-gallery--1">${tile(images[0],0)}</div>`;

    } else if (n === 2) {
      layout = `<div class="img-gallery img-gallery--2">
        ${tile(images[0],0)}${tile(images[1],1)}
      </div>`;

    } else if (n === 3) {
      layout = `<div class="img-gallery img-gallery--3">
        <div class="img-gallery__main">${tile(images[0],0)}</div>
        <div class="img-gallery__sub">
          ${tile(images[1],1)}${tile(images[2],2)}
        </div>
      </div>`;

    } else {
      // 4 or more — show 2x2, last tile gets +N overlay
      layout = `<div class="img-gallery img-gallery--4">
        ${tile(images[0],0)}
        ${tile(images[1],1)}
        ${tile(images[2],2)}
        ${tile(images[3], 3, extra)}
      </div>`;
    }

    return layout;
  },

  // ── Comments section ───────────────────────────────────────────────
  async loadComments(postId) {
    const container = document.getElementById(`comments-${postId}`);
    if (!container) return;
    try {
      container.innerHTML = '<div style="padding: 10px; text-align: center; color: #65676b; font-size: 13px;">Loading comments...</div>';
      const res = await Api.getComments(postId);
      container.innerHTML = this.renderCommentsHtml(postId, res.comments || []);
    } catch (err) {
      container.innerHTML = '<div style="padding: 10px; text-align: center; color: #f02849; font-size: 13px;">Failed to load comments</div>';
    }
  },

  renderCommentsHtml(postId, comments) {
    const currentUser = window.Auth?.getCurrentUser?.();
    let html = '';
    
    comments.forEach(c => { html += this._renderSingleComment(c); });

    if (currentUser) {
      html += `
        <div class="comment-input">
          <img class="avatar avatar-xs" src="${currentUser.avatar}" alt="">
          <form class="comment-input__form" data-action="submit-comment" data-post-id="${postId}">
            <input type="text" class="comment-input__field" placeholder="Write a comment..."
                   data-post-id="${postId}" autocomplete="off">
            <button type="submit" class="comment-input__send btn-icon" title="Post comment">➤</button>
          </form>
        </div>
      `;
    }

    return html;
  },

  _renderSingleComment(comment) {
    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    const author = comment.author;
    if (!author) return '';

    const timeAgo = window.Utils?.timeAgo?.(comment.createdAt) || '';
    const likesCount = comment.likesCount || 0;

    return `
      <div class="comment" data-comment-id="${comment.id}">
        <a href="#profile/${author.id}">
          <img class="avatar avatar-xs" src="${author.avatar}" alt="${esc(author.fullName)}">
        </a>
        <div class="comment__body">
          <div class="comment__bubble">
            <a class="comment__author" href="#profile/${author.id}">${esc(author.fullName)}</a>
            <span class="comment__text">${esc(comment.content)}</span>
          </div>
          <div class="comment__meta">
            <span class="comment__time">${timeAgo}</span>
            <button class="comment__action" data-action="like-comment" data-comment-id="${comment.id}">
              Like${likesCount > 0 ? ` · ${likesCount}` : ''}
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ── Post Creator Modal ─────────────────────────────────────────────
  renderPostCreatorModal(options = {}) {
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!currentUser) return;

    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    
    // Enforce single-image upload for profile/cover photo updates
    const isSingleUpload = (options.profileUpdateType === 'avatar' || options.profileUpdateType === 'cover');

    // Set preloaded media and profile update flags
    this._uploadedImages = options.preloadedMedia || [];
    this._profileUpdateType = options.profileUpdateType || null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'post-creator-modal';
    
    // Generate previews HTML if there is preloaded media
    let previewsHtml = '';
    this._uploadedImages.forEach((img, idx) => {
      const isVideo = img.type === 'video';
      if (isVideo) {
        previewsHtml += `
          <div class="image-preview" data-index="${idx}">
            <video src="${img.url}" style="width:100%; height:100%; object-fit:cover;" muted></video>
            <button class="image-preview__remove" data-action="remove-image" data-index="${idx}">&times;</button>
          </div>
        `;
      } else {
        previewsHtml += `
          <div class="image-preview" data-index="${idx}">
            <img src="${img.url}" alt="Upload preview">
            <button class="image-preview__edit" data-action="edit-image" data-index="${idx}" style="position:absolute; top:8px; left:8px; background:white; color:black; border:none; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 4px rgba(0,0,0,0.15);"><i class="fas fa-edit"></i> Edit</button>
            <button class="image-preview__remove" data-action="remove-image" data-index="${idx}">&times;</button>
          </div>
        `;
      }
    });

    overlay.innerHTML = `
      <div class="modal post-creator-modal">
        <div class="modal__header">
          <h3 class="modal__title">${options.title || 'Create Post'}</h3>
          <button class="modal__close btn-icon" data-action="close-modal" title="Close">&times;</button>
        </div>
        <div class="modal__body">
          <div class="post-creator-modal__user">
            <img class="avatar avatar-sm" src="${currentUser.avatar}" alt="">
            <span class="post-creator-modal__name">${esc(currentUser.fullName)}</span>
          </div>

          <!-- Feeling / Location tags under name -->
          <div id="post-meta-tags" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>

          <textarea class="post-creator-modal__textarea" id="post-content-input"
                    placeholder="What's on your mind, ${esc(currentUser.firstName || currentUser.fullName?.split(' ')[0] || 'User')}?"
                    rows="4">${esc(options.defaultContent || '')}</textarea>
          <div class="post-creator-modal__previews" id="post-image-previews">${previewsHtml}</div>
          <!-- Media Preview & Upload area -->
          <div id="post-drop-zone" class="post-creator-modal__drop-zone" style="${options.preloadedMedia && options.preloadedMedia.length > 0 ? 'display:none;' : ''}">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;">
              <span style="font-size:2.2rem;">🖼️</span>
              <span style="font-weight:600;font-size:14px;color:var(--text-primary);">Add Photos or Videos</span>
              <span style="font-size:12px;color:var(--text-secondary);">Drag & drop or</span>
            </div>
            <label for="post-file-input" class="post-creator-modal__browse" style="margin-top:4px;padding:6px 18px;border-radius:8px;background:var(--color-bg-hover);cursor:pointer;font-size:13px;font-weight:600;display:inline-block;">Browse files</label>
            <input type="file" id="post-file-input" ${isSingleUpload ? '' : 'multiple'} accept="image/*,video/*" style="display:none;">
          </div>

          <!-- Emoji picker (hidden until toggled) -->
          <div class="emoji-picker" id="emoji-picker" style="display:none;">
            ${this.renderEmojiPicker('post-content-input')}
          </div>

          <!-- Tag friends mini-search -->
          <div id="tag-friends-panel" style="display:none; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:8px; padding:10px; margin-bottom:8px;">
            <div style="font-weight:600; font-size:13px; margin-bottom:6px; color:var(--text-primary);">Tag Friends</div>
            <input type="text" id="post-tag-search" placeholder="Search friends..." style="width:100%; padding:7px 10px; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
            <div id="post-tag-suggestions" style="margin-top:6px;"></div>
            <div id="post-tag-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>
          </div>

          <!-- Location input -->
          <div id="location-panel" style="display:none; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:8px; padding:10px; margin-bottom:8px;">
            <div style="font-weight:600; font-size:13px; margin-bottom:6px; color:var(--text-primary);">📍 Add Location</div>
            <input type="text" id="post-location-input" placeholder="Enter a location..." style="width:100%; padding:7px 10px; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--text-primary); font-size:13px; box-sizing:border-box;">
          </div>

          <!-- Add to your post toolbar -->
          <div class="post-add-toolbar">
            <span class="post-add-toolbar__label">Add to your post</span>
            <div class="post-add-toolbar__actions">
              <!-- Gallery/Photos -->
              <label for="post-file-input" class="post-add-toolbar__btn" title="Photos / Videos" id="toolbar-gallery-label">
                <i class="fas fa-images" style="color:#45bd62;"></i>
                <span>Photo</span>
              </label>
              <!-- Camera (mobile captures camera, PC opens file picker) -->
              <label for="post-camera-input" class="post-add-toolbar__btn" title="Take a photo">
                <i class="fas fa-camera" style="color:#1877f2;"></i>
                <span>Camera</span>
              </label>
              <input type="file" id="post-camera-input" accept="image/*" capture="environment" style="display:none;">
              <!-- Tag Friends -->
              <button type="button" class="post-add-toolbar__btn" data-action="toggle-tag-friends" title="Tag Friends">
                <i class="fas fa-user-tag" style="color:#9b59b6;"></i>
                <span>Tag</span>
              </button>
              <!-- Emoji -->
              <button type="button" class="post-add-toolbar__btn" data-action="toggle-emoji-picker" title="Emoji / Feeling">
                <i class="far fa-smile" style="color:#f7b928;"></i>
                <span>Emoji</span>
              </button>
              <!-- Location -->
              <button type="button" class="post-add-toolbar__btn" data-action="toggle-location" title="Check In / Location">
                <i class="fas fa-map-marker-alt" style="color:#f5533d;"></i>
                <span>Location</span>
              </button>
            </div>
          </div>

        </div>
        <div class="modal__footer">
          <button class="btn btn-primary btn-block" id="post-submit-btn" data-action="submit-post" ${options.preloadedMedia && options.preloadedMedia.length > 0 ? '' : 'disabled'}>
            Post
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._setupModalListeners(overlay);

    // Focus textarea and position cursor at the end
    setTimeout(() => {
      const textarea = document.getElementById('post-content-input');
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }
    }, 100);
  },

  // ── Emoji Picker ───────────────────────────────────────────────────
  renderEmojiPicker(targetInputId) {
    const categories = Object.keys(this._emojiCategories);

    const tabs = categories.map((cat, i) => `
      <button type="button" class="emoji-picker__tab ${i === 0 ? 'emoji-picker__tab--active' : ''}"
              data-action="emoji-tab" data-category="${cat}" onmousedown="event.preventDefault()">
        ${this._emojiCategories[cat][0]}
      </button>
    `).join('');

    const panels = categories.map((cat, i) => `
      <div class="emoji-picker__panel ${i === 0 ? '' : 'emoji-picker__panel--hidden'}"
           data-category="${cat}">
        ${this._emojiCategories[cat].map(e => `
          <button type="button" class="emoji-picker__emoji" data-action="insert-emoji" data-emoji="${e}" data-target="${targetInputId}" onmousedown="event.preventDefault()">${e}</button>
        `).join('')}
      </div>
    `).join('');

    return `
      <div class="emoji-picker__tabs">${tabs}</div>
      <div class="emoji-picker__panels">${panels}</div>
    `;
  },

  // ── Handle post creation ───────────────────────────────────────────
  async handleCreatePost(content, mediaItems, location = null, taggedUsers = []) {
    const trimmed = (content || '').trim();
    if (!trimmed && (!mediaItems || mediaItems.length === 0)) return;

    try {
      // 1. If this is a profile photo/cover update, call the updateProfile API first
      if (this._profileUpdateType && mediaItems.length > 0) {
        const photoUrl = mediaItems[0].url;
        const payload = this._profileUpdateType === 'avatar' ? { avatar: photoUrl } : { coverPhoto: photoUrl };
        await Api.updateProfile(payload);

        // Update local session
        const currentUser = window.Auth?.getCurrentUser?.();
        if (currentUser) {
          if (this._profileUpdateType === 'avatar') {
            currentUser.avatar = photoUrl;
            document.querySelectorAll('.current-user-avatar').forEach(img => { img.src = photoUrl; });
          } else {
            currentUser.coverPhoto = photoUrl;
          }
          if (window.Store?.setCurrentUser) window.Store.setCurrentUser(currentUser);
        }
      }

      // 2. Create the post in feed
      await Api.createPost({
        content: trimmed,
        media: mediaItems,
        location: location || undefined,
        taggedUsers: taggedUsers.length ? taggedUsers : undefined
      });

      // 3. Reset flag
      this._profileUpdateType = null;

      // 4. Refresh UI
      if (typeof Feed !== 'undefined') Feed.refreshFeed();
      if (typeof Utils !== 'undefined') Utils.showToast('Post created successfully!', 'success');
      
      // If we are on a profile page, refresh it to show the new avatar/cover and post immediately
      const currentHash = window.location.hash;
      if (currentHash.startsWith('#profile')) {
        const userId = window.Profile?._currentUserId || window.Auth?.getCurrentUser()?.id;
        if (userId) {
          window.Profile.renderProfilePage(userId).then(html => {
            const mc = document.getElementById('main-content');
            if (mc) mc.innerHTML = html;
          });
        }
      }

    } catch (err) {
      if (typeof Utils !== 'undefined') Utils.showToast(err.message || 'Failed to create post', 'error');
    }
  },

  // ── Like / Unlike ─────────────────────────────────────────────────
  async handleLike(postId) {
    const btn = document.querySelector(`[data-action="like-post"][data-post-id="${postId}"]`);
    let reactionType = 'like';
    if (btn && btn.classList.contains('post-action-btn--liked')) {
      reactionType = null; // Toggle off
    }

    if (btn) {
      btn.classList.add('post-action-btn--animate');
      setTimeout(() => btn.classList.remove('post-action-btn--animate'), 300);
    }
    
    try {
      const res = await Api.likePost(postId, reactionType);
      if (btn) {
        const icon = btn.querySelector('.post-action-btn__icon');
        const label = btn.querySelector('.reaction-label');
        if (icon) icon.textContent = this._getReactionEmoji(reactionType);
        if (label) label.textContent = this._getReactionLabel(reactionType);
        
        if (reactionType) {
          btn.classList.add('post-action-btn--liked');
          btn.dataset.reaction = reactionType;
        } else {
          btn.classList.remove('post-action-btn--liked');
          btn.dataset.reaction = '';
        }
      }
      this._updatePostStats(postId);
    } catch (err) {
      console.error(err);
    }
  },

  async handleReact(postId, reactionType) {
    // Close active reactions-popup on click
    const popup = document.getElementById(`reactions-popup-${postId}`);
    if (popup) popup.classList.remove('active');

    const btn = document.querySelector(`[data-action="like-post"][data-post-id="${postId}"]`);
    if (btn) {
      btn.classList.add('post-action-btn--animate');
      setTimeout(() => btn.classList.remove('post-action-btn--animate'), 300);
    }

    try {
      const res = await Api.likePost(postId, reactionType);
      if (btn) {
        const icon = btn.querySelector('.post-action-btn__icon');
        const label = btn.querySelector('.reaction-label');
        if (icon) icon.textContent = this._getReactionEmoji(reactionType);
        if (label) label.textContent = this._getReactionLabel(reactionType);
        
        if (reactionType) {
          btn.classList.add('post-action-btn--liked');
          btn.dataset.reaction = reactionType;
        } else {
          btn.classList.remove('post-action-btn--liked');
          btn.dataset.reaction = '';
        }
      }
      this._updatePostStats(postId);
    } catch (err) {
      console.error(err);
      if (typeof Utils !== 'undefined') Utils.showToast('Failed to select reaction', 'error');
    }
  },

  _getReactionEmoji(reaction) {
    switch (reaction) {
      case 'like': return '👍';
      case 'love': return '❤️';
      case 'care': return '🤗';
      case 'haha': return '😂';
      case 'wow': return '😮';
      case 'sad': return '😢';
      case 'angry': return '😡';
      default: return '👍';
    }
  },

  _getReactionLabel(reaction) {
    if (!reaction) return 'Like';
    return reaction.charAt(0).toUpperCase() + reaction.slice(1);
  },

  // ── Comment ────────────────────────────────────────────────────────
  async handleComment(postId, content, parentId) {
    if (!content?.trim()) return;
    try {
      await Api.addComment(postId, content.trim(), parentId);
      this.loadComments(postId);
    } catch (err) {
      if (typeof Utils !== 'undefined') Utils.showToast('Failed to add comment', 'error');
    }
  },

  // ── Share & Copy Link ──────────────────────────────────────────────
  handleShare(postId, mediaType = 'post') {
    this.showShareModal(postId, mediaType);
  },

  async copyPostLink(postId, mediaType = 'post') {
    const baseUrl = window.location.origin;
    const shareUrl = mediaType === 'reel'
      ? `${baseUrl}/#reels`
      : `${baseUrl}/#post/${postId}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      window.Utils?.showToast?.('Link copied to clipboard!', 'success');

      // Increment share count on backend
      Api.post(`/posts/${postId}/share`).then(res => {
        if (res && res.sharesCount !== undefined) {
          const countEls = document.querySelectorAll(`[data-action="reel-share"][data-post-id="${postId}"] .count, [data-action="share-post"][data-post-id="${postId}"] .count`);
          countEls.forEach(el => { el.textContent = res.sharesCount; });
        }
      }).catch(() => {});
    } catch (err) {
      window.Utils?.showToast?.('Failed to copy link', 'error');
    }
  },

  showShareModal(postId, mediaType = 'post') {
    const existing = document.getElementById('share-modal-overlay');
    if (existing) existing.remove();

    const baseUrl = window.location.origin;
    const shareUrl = mediaType === 'reel' ? `${baseUrl}/#reels` : `${baseUrl}/#post/${postId}`;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'share-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(4px);';

    overlay.innerHTML = `
      <div class="modal" style="width:100%;max-width:440px;background:var(--bg-card, #242526);border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.4);border:1px solid var(--color-border, #3e4042);color:var(--text-primary,#e4e6eb);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--color-border, #3e4042);">
          <h3 style="margin:0;font-size:1.15rem;font-weight:700;">Share</h3>
          <button id="share-modal-close" style="background:none;border:none;color:var(--text-secondary);font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        
        <div style="padding:20px;display:flex;flex-direction:column;gap:16px;">
          <!-- Option 1: Copy Link -->
          <button id="share-opt-copy" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:var(--color-bg-hover, rgba(255,255,255,0.06));border:1px solid var(--color-border,#3e4042);color:inherit;cursor:pointer;text-align:left;transition:background 0.2s;">
            <div style="width:42px;height:42px;border-radius:50%;background:#1877f2;display:flex;align-items:center;justify-content:center;color:white;font-size:1.2rem;flex-shrink:0;">
              <i class="fas fa-link"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;">Copy Link</div>
              <div style="font-size:0.8rem;color:var(--text-secondary,#b0b3b8);">${shareUrl}</div>
            </div>
          </button>

          <!-- Option 2: Share to Feed -->
          <button id="share-opt-feed" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:var(--color-bg-hover, rgba(255,255,255,0.06));border:1px solid var(--color-border,#3e4042);color:inherit;cursor:pointer;text-align:left;transition:background 0.2s;">
            <div style="width:42px;height:42px;border-radius:50%;background:#45bd62;display:flex;align-items:center;justify-content:center;color:white;font-size:1.2rem;flex-shrink:0;">
              <i class="fas fa-retweet"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;">Share to Feed</div>
              <div style="font-size:0.8rem;color:var(--text-secondary,#b0b3b8);">Post this directly onto your profile feed</div>
            </div>
          </button>

          <!-- Option 3: Send in Chat -->
          <button id="share-opt-chat" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:var(--color-bg-hover, rgba(255,255,255,0.06));border:1px solid var(--color-border,#3e4042);color:inherit;cursor:pointer;text-align:left;transition:background 0.2s;">
            <div style="width:42px;height:42px;border-radius:50%;background:#a855f7;display:flex;align-items:center;justify-content:center;color:white;font-size:1.2rem;flex-shrink:0;">
              <i class="fab fa-facebook-messenger"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;">Send in Direct Message</div>
              <div style="font-size:0.8rem;color:var(--text-secondary,#b0b3b8);">Send link to a friend in chat</div>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('share-modal-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // Copy option
    document.getElementById('share-opt-copy').onclick = () => {
      overlay.remove();
      this.copyPostLink(postId, mediaType);
    };

    // Share to Feed option
    document.getElementById('share-opt-feed').onclick = async () => {
      overlay.remove();
      try {
        window.Utils?.showToast?.('Sharing to feed...', 'info');
        await Api.createPost({ content: `Check out this ${mediaType}: ${shareUrl}` });
        await Api.post(`/posts/${postId}/share`);
        window.Utils?.showToast?.('Shared to your feed!', 'success');
        if (typeof Feed !== 'undefined') Feed.refreshFeed();
      } catch (err) {
        window.Utils?.showToast?.('Failed to share to feed', 'error');
      }
    };

    // Send in Chat option
    document.getElementById('share-opt-chat').onclick = async () => {
      overlay.remove();
      if (typeof Chat !== 'undefined') {
        window.location.hash = '#chat';
        window.Utils?.showToast?.('Select a friend to share the link in chat!', 'info');
      } else {
        this.copyPostLink(postId, mediaType);
      }
    };
  },

  // ── Bookmark ───────────────────────────────────────────────────────
  async handleBookmark(postId) {
    const btns = document.querySelectorAll(`[data-action="bookmark-post"][data-post-id="${postId}"]`);
    try {
      const res = await Api.toggleBookmark(postId);
      btns.forEach(btn => {
        const icon = btn.querySelector('i');
        const label = btn.querySelector('span');
        if (res.saved) {
          btn.classList.add('post-action-btn--bookmarked');
          if (icon) { icon.classList.remove('far', 'fa-bookmark'); icon.classList.add('fas', 'fa-bookmark'); }
          if (label) label.textContent = 'Saved';
          btn.style.color = '#f59e0b';
        } else {
          btn.classList.remove('post-action-btn--bookmarked');
          if (icon) { icon.classList.remove('fas', 'fa-bookmark'); icon.classList.add('far', 'fa-bookmark'); }
          if (label) label.textContent = 'Save';
          btn.style.color = '';
        }
      });
      if (typeof Utils !== 'undefined') Utils.showToast(res.message, 'success');
    } catch (err) {
      if (typeof Utils !== 'undefined') Utils.showToast('Failed to save post.', 'error');
    }
  },

  // ── Delete post ────────────────────────────────────────────────────
  async handleDeletePost(postId) {
    try {
      // Fetch post first to check if deleted media matches user avatar or cover photo
      let postObj = null;
      try {
        const res = await Api.getPost(postId);
        postObj = res.post || res;
      } catch (e) {}

      await Api.deletePost(postId);
      const card = document.querySelector(`[data-post-id="${postId}"].post-card`);
      if (card) {
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => card.remove(), 300);
      }

      // 1. Permanently delete from chat/message box (if shared)
      try {
        const messagesRaw = localStorage.getItem('hb_messages');
        if (messagesRaw) {
          const messages = JSON.parse(messagesRaw);
          // Filter out any message that contains the post URL or ID
          const filteredMessages = messages.filter(m => !(m.message && (m.message.includes(`post.html?id=${postId}`) || m.message.includes(`post-id="${postId}"`))));
          if (filteredMessages.length !== messages.length) {
            localStorage.setItem('hb_messages', JSON.stringify(filteredMessages));
            if (typeof Utils !== 'undefined') Utils.showToast('Post removed from message box successfully.', 'info');
          }
        }
      } catch (e) {
        console.error('Failed to cleanup shared messages:', e);
      }

      // Sync user profile avatar/cover photo deletion
      if (postObj && postObj.media) {
        const currentUser = window.Auth?.getCurrentUser?.();
        if (currentUser) {
          let profileChanged = false;
          const updatePayload = {};

          postObj.media.forEach(m => {
            if (currentUser.avatar && m.url === currentUser.avatar) {
              updatePayload.avatar = '';
              currentUser.avatar = '';
              document.querySelectorAll('.current-user-avatar').forEach(img => { img.src = '/default-avatar.png'; });
              const profileAvatarEl = document.querySelector('.profile-avatar-lg');
              if (profileAvatarEl) profileAvatarEl.src = '/default-avatar.png';
              profileChanged = true;
            }
            if (currentUser.coverPhoto && m.url === currentUser.coverPhoto) {
              updatePayload.coverPhoto = '';
              currentUser.coverPhoto = '';
              const coverEl = document.querySelector('.cover-photo');
              if (coverEl) coverEl.src = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80';
              profileChanged = true;
            }
          });

          if (profileChanged) {
            await Api.updateProfile(updatePayload);
            if (window.Store?.setCurrentUser) window.Store.setCurrentUser(currentUser);
            if (typeof Utils !== 'undefined') Utils.showToast('Profile image synced (removed) with deleted post.', 'info');
          }
        }
      }
    } catch (err) {
      if (typeof Utils !== 'undefined') Utils.showToast('Failed to delete post', 'error');
    }
  },

  // ── Edit post ──────────────────────────────────────────────────────
  async handleEditPost(postId, newContent, mediaItems = []) {
    try {
      await Api.editPost(postId, {
        content: newContent.trim(),
        media: mediaItems
      });
      if (typeof Feed !== 'undefined') Feed.refreshFeed();
      if (typeof Utils !== 'undefined') Utils.showToast('Post updated successfully!', 'success');
    } catch (err) {
      if (typeof Utils !== 'undefined') Utils.showToast(err.message || 'Failed to update post', 'error');
    }
  },

  showEditPostModal(postId) {
    const post = (window.Store?.posts || []).find(p => p.id === postId);
    if (!post) {
      Api.getPost(postId).then(res => {
        if (res.post) this._renderEditPostModal(res.post);
      }).catch(err => {
        console.error(err);
      });
    } else {
      this._renderEditPostModal(post);
    }
  },

  _renderEditPostModal(post) {
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!currentUser) return;

    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    
    // Copy current media
    this._uploadedImages = (post.media || []).map(m => ({ url: m.url, type: m.type }));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'post-edit-modal';
    
    let previewsHtml = '';
    this._uploadedImages.forEach((img, idx) => {
      const isVideo = img.type === 'video';
      if (isVideo) {
        previewsHtml += `
          <div class="image-preview" data-index="${idx}">
            <video src="${img.url}" style="width:100%; height:100%; object-fit:cover;" muted></video>
            <button class="image-preview__remove" data-action="remove-edit-image" data-index="${idx}">&times;</button>
          </div>
        `;
      } else {
        previewsHtml += `
          <div class="image-preview" data-index="${idx}">
            <img src="${img.url}" alt="Upload preview">
            <button class="image-preview__edit" data-action="edit-image" data-index="${idx}" style="position:absolute; top:8px; left:8px; background:white; color:black; border:none; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 4px rgba(0,0,0,0.15);"><i class="fas fa-edit"></i> Edit</button>
            <button class="image-preview__remove" data-action="remove-edit-image" data-index="${idx}">&times;</button>
          </div>
        `;
      }
    });

    overlay.innerHTML = `
      <div class="modal post-creator-modal">
        <div class="modal__header">
          <h3 class="modal__title">Edit Post</h3>
          <button class="modal__close btn-icon" data-action="close-modal" title="Close">&times;</button>
        </div>
        <div class="modal__body">
          <div class="post-creator-modal__user">
            <img class="avatar avatar-sm" src="${currentUser.avatar}" alt="">
            <span class="post-creator-modal__name">${esc(currentUser.fullName)}</span>
          </div>
          <textarea class="post-creator-modal__textarea" id="post-edit-content-input"
                    placeholder="What's on your mind?"
                    rows="4">${esc(post.content || '')}</textarea>
          <div class="post-creator-modal__previews" id="post-edit-image-previews">${previewsHtml}</div>
          <!-- Edit Media Upload Area -->
          <div class="post-creator-modal__drop-zone" id="post-edit-drop-zone">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;">
              <span style="font-size:2.2rem;">🖼️</span>
              <span style="font-weight:600;font-size:14px;color:var(--text-primary);">Add more Photos or Videos</span>
            </div>
            <label for="post-edit-file-input" class="post-creator-modal__browse" style="margin-top:4px;padding:6px 18px;border-radius:8px;background:var(--color-bg-hover);cursor:pointer;font-size:13px;font-weight:600;display:inline-block;">Browse files</label>
            <input type="file" id="post-edit-file-input" multiple accept="image/*,video/*" style="display:none;">
          </div>
          <!-- Edit Post Toolbar -->
          <div class="post-add-toolbar">
            <span class="post-add-toolbar__label">Add to your post</span>
            <div class="post-add-toolbar__actions">
              <!-- Gallery -->
              <label for="post-edit-file-input" class="post-add-toolbar__btn" title="Photos / Videos">
                <i class="fas fa-images" style="color:#45bd62;"></i>
                <span>Photo</span>
              </label>
              <!-- Camera -->
              <label for="post-edit-camera-input" class="post-add-toolbar__btn" title="Take a photo">
                <i class="fas fa-camera" style="color:#1877f2;"></i>
                <span>Camera</span>
              </label>
              <input type="file" id="post-edit-camera-input" accept="image/*" capture="environment" style="display:none;">
              <!-- Emoji -->
              <button type="button" class="post-add-toolbar__btn" data-action="toggle-edit-emoji-picker" title="Emoji / Feeling">
                <i class="far fa-smile" style="color:#f7b928;"></i>
                <span>Emoji</span>
              </button>
            </div>
          </div>
          <!-- Edit Post Emoji Picker -->
          <div class="emoji-picker" id="edit-emoji-picker" style="display:none;">
            ${this.renderEmojiPicker('post-edit-content-input')}
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-primary btn-block" id="post-edit-submit-btn" data-action="submit-edit-post" data-post-id="${post.id}">
            Save Changes
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._setupEditModalListeners(overlay, post.id);
  },

  _setupEditModalListeners(overlay, postId) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) {
        overlay.remove();
        this._uploadedImages = [];
      }
    });

    const updateSubmitBtn = () => {
      const textarea = document.getElementById('post-edit-content-input');
      const submitBtn = document.getElementById('post-edit-submit-btn');
      if (!submitBtn) return;
      const hasContent = textarea && textarea.value.trim().length > 0;
      const hasImages = this._uploadedImages.length > 0;
      submitBtn.disabled = !(hasContent || hasImages);
    };

    const textarea = document.getElementById('post-edit-content-input');
    if (textarea) {
      textarea.addEventListener('input', updateSubmitBtn);
    }

    const fileInput = document.getElementById('post-edit-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        this._handleEditImageUpload(e.target.files, updateSubmitBtn);
      });
    }
    // Camera input for edit post (mobile capture)
    const editCameraInput = document.getElementById('post-edit-camera-input');
    if (editCameraInput) {
      editCameraInput.addEventListener('change', (e) => {
        this._handleEditImageUpload(e.target.files, updateSubmitBtn);
      });
    }

    const dropZone = document.getElementById('post-edit-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('post-creator-modal__drop-zone--active');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('post-creator-modal__drop-zone--active');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('post-creator-modal__drop-zone--active');
        this._handleEditImageUpload(e.dataTransfer.files, updateSubmitBtn);
      });
    }

    overlay.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;

      if (action === 'toggle-edit-emoji-picker') {
        const picker = document.getElementById('edit-emoji-picker');
        if (picker) picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
      }

      if (action === 'emoji-tab') {
        const cat = target.dataset.category;
        overlay.querySelectorAll('.emoji-picker__tab').forEach(t =>
          t.classList.toggle('emoji-picker__tab--active', t.dataset.category === cat)
        );
        overlay.querySelectorAll('.emoji-picker__panel').forEach(p =>
          p.classList.toggle('emoji-picker__panel--hidden', p.dataset.category !== cat)
        );
      }

      if (action === 'insert-emoji') {
        const emoji = target.dataset.emoji;
        const input = document.getElementById(target.dataset.target);
        if (input && emoji) {
          const start = (input.selectionStart !== undefined && input.selectionStart !== null) ? input.selectionStart : input.value.length;
          const end = (input.selectionEnd !== undefined && input.selectionEnd !== null) ? input.selectionEnd : input.value.length;
          const val = input.value;
          input.value = val.slice(0, start) + emoji + val.slice(end);
          input.focus();
          input.selectionStart = input.selectionEnd = start + emoji.length;
          updateSubmitBtn();
        }
      }

      if (action === 'edit-image') {
        const idx = parseInt(target.dataset.index, 10);
        this.showImageEditor(idx, true);
      }

      if (action === 'remove-edit-image') {
        const idx = parseInt(target.dataset.index, 10);
        this._uploadedImages[idx] = null;
        const previewEl = target.closest('.image-preview');
        if (previewEl) previewEl.remove();
        this._uploadedImages = this._uploadedImages.filter(Boolean);
        
        const previews = overlay.querySelectorAll('#post-edit-image-previews .image-preview');
        previews.forEach((p, index) => {
          p.dataset.index = index;
          const removeBtn = p.querySelector('.image-preview__remove');
          if (removeBtn) removeBtn.dataset.index = index;
          const editBtn = p.querySelector('.image-preview__edit');
          if (editBtn) editBtn.dataset.index = index;
        });

        updateSubmitBtn();
      }

      if (action === 'submit-edit-post') {
        const content = document.getElementById('post-edit-content-input')?.value || '';
        const images = this._uploadedImages.filter(Boolean);
        this.handleEditPost(postId, content, images);
        overlay.remove();
        this._uploadedImages = [];
      }
    });
  },

  _handleEditImageUpload(files, updateSubmitBtn) {
    if (!files || files.length === 0) return;

    const previewContainer = document.getElementById('post-edit-image-previews');
    if (!previewContainer) return;

    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) return;
      if (this._uploadedImages.length >= 4) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const mediaItem = { url: dataUrl, type: isVideo ? 'video' : 'image' };
        this._uploadedImages.push(mediaItem);

        const idx = this._uploadedImages.length - 1;
        const previewEl = document.createElement('div');
        previewEl.className = 'image-preview';
        previewEl.dataset.index = idx;
        
        if (isVideo) {
          previewEl.innerHTML = `
            <video src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;" muted></video>
            <button class="image-preview__remove" data-action="remove-edit-image" data-index="${idx}">&times;</button>
          `;
        } else {
          previewEl.innerHTML = `
            <img src="${dataUrl}" alt="Upload preview">
            <button class="image-preview__edit" data-action="edit-image" data-index="${idx}" style="position:absolute; top:8px; left:8px; background:white; color:black; border:none; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 4px rgba(0,0,0,0.15);"><i class="fas fa-edit"></i> Edit</button>
            <button class="image-preview__remove" data-action="remove-edit-image" data-index="${idx}">&times;</button>
          `;
        }
        previewContainer.appendChild(previewEl);

        updateSubmitBtn();
      };
      reader.readAsDataURL(file);
    });
  },

  // ── Handle image/video upload ──────────────────────────────────────
  handleImageUpload(files) {
    if (!files || files.length === 0) return;

    const previewContainer = document.getElementById('post-image-previews');
    if (!previewContainer) return;

    // Detect single-upload mode (profile/cover photo) — no 'multiple' attribute
    const fileInput = document.getElementById('post-file-input');
    const isSingle = fileInput && !fileInput.hasAttribute('multiple');

    // For single-upload mode: clear existing image and replace it
    if (isSingle) {
      this._uploadedImages = [];
      previewContainer.innerHTML = '';
    }

    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) return;
      // Limit: 1 for profile/cover, 4 for normal posts
      if (isSingle && this._uploadedImages.length >= 1) return;
      if (!isSingle && this._uploadedImages.length >= 4) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const mediaItem = { url: dataUrl, type: isVideo ? 'video' : 'image' };
        this._uploadedImages.push(mediaItem);

        const idx = this._uploadedImages.length - 1;
        const previewEl = document.createElement('div');
        previewEl.className = 'image-preview';
        previewEl.dataset.index = idx;
        
        if (isVideo) {
          previewEl.innerHTML = `
            <video src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;" muted></video>
            <button class="image-preview__remove" data-action="remove-image" data-index="${idx}">&times;</button>
          `;
        } else {
          previewEl.innerHTML = `
            <img src="${dataUrl}" alt="Upload preview">
            <button class="image-preview__edit" data-action="edit-image" data-index="${idx}" style="position:absolute; top:8px; left:8px; background:white; color:black; border:none; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 4px rgba(0,0,0,0.15);"><i class="fas fa-edit"></i> Edit</button>
            <button class="image-preview__remove" data-action="remove-image" data-index="${idx}">&times;</button>
          `;
        }
        previewContainer.appendChild(previewEl);

        this._updateSubmitButton();
      };
      reader.readAsDataURL(file);
    });
  },

  // ── Private helpers ────────────────────────────────────────────────
  _processContent(text) {
    if (!text) return '';
    const escaped = window.Utils?.escapeHtml?.(text) || text;
    // Highlight #hashtags
    return escaped.replace(/#(\w+)/g, '<a class="hashtag" href="#search/tag/$1">#$1</a>');
  },

  async _updatePostStats(postId) {
    try {
      const res = await Api.getPost(postId);
      if (!res.post) return;
      const post = res.post;

      const statsEl = document.querySelector(`[data-post-id="${postId}"] .post-card__stats`);
      if (!statsEl) return;

      const likesCount = post.likesCount || 0;
      const commentCount = post.commentsCount || 0;
      const shareCount = post.sharesCount || 0;

      let statsHtml = '';
      if (likesCount > 0) statsHtml += `<span class="post-card__stat">👍 ${likesCount}</span>`;
      if (commentCount > 0) statsHtml += `<span class="post-card__stat">${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>`;
      if (shareCount > 0) statsHtml += `<span class="post-card__stat">${shareCount} share${shareCount !== 1 ? 's' : ''}</span>`;

      statsEl.innerHTML = statsHtml;
    } catch (err) {
      console.error('Failed to update stats', err);
    }
  },

  _updateSubmitButton() {
    const textarea = document.getElementById('post-content-input');
    const submitBtn = document.getElementById('post-submit-btn');
    if (!submitBtn) return;

    const hasContent = textarea && textarea.value.trim().length > 0;
    const hasImages = this._uploadedImages.length > 0;
    submitBtn.disabled = !(hasContent || hasImages);
  },

  _setupModalListeners(overlay) {
    // Close modal
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) {
        overlay.remove();
        this._uploadedImages = [];
      }
    });

    // Textarea input — update submit button
    const textarea = document.getElementById('post-content-input');
    if (textarea) {
      textarea.addEventListener('input', () => this._updateSubmitButton());
    }

    // File input
    const fileInput = document.getElementById('post-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleImageUpload(e.target.files));
    }

    // Drop zone
    const dropZone = document.getElementById('post-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('post-creator-modal__drop-zone--active');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('post-creator-modal__drop-zone--active');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('post-creator-modal__drop-zone--active');
        this.handleImageUpload(e.dataTransfer.files);
      });
    }

    // Event delegation inside modal
    overlay.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;

      if (action === 'toggle-emoji-picker') {
        const picker = document.getElementById('emoji-picker');
        if (picker) picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
      }

      if (action === 'emoji-tab') {
        const cat = target.dataset.category;
        overlay.querySelectorAll('.emoji-picker__tab').forEach(t =>
          t.classList.toggle('emoji-picker__tab--active', t.dataset.category === cat)
        );
        overlay.querySelectorAll('.emoji-picker__panel').forEach(p =>
          p.classList.toggle('emoji-picker__panel--hidden', p.dataset.category !== cat)
        );
      }

      if (action === 'insert-emoji') {
        const emoji = target.dataset.emoji;
        const input = document.getElementById(target.dataset.target);
        if (input && emoji) {
          const start = (input.selectionStart !== undefined && input.selectionStart !== null) ? input.selectionStart : input.value.length;
          const end = (input.selectionEnd !== undefined && input.selectionEnd !== null) ? input.selectionEnd : input.value.length;
          const val = input.value;
          input.value = val.slice(0, start) + emoji + val.slice(end);
          input.focus();
          input.selectionStart = input.selectionEnd = start + emoji.length;
          this._updateSubmitButton();
        }
      }

      if (action === 'edit-image') {
        const idx = parseInt(target.dataset.index, 10);
        this.showImageEditor(idx, false);
      }

      if (action === 'remove-image') {
        const idx = parseInt(target.dataset.index, 10);
        this._uploadedImages[idx] = null;
        const previewEl = target.closest('.image-preview');
        if (previewEl) previewEl.remove();
        this._uploadedImages = this._uploadedImages.filter(Boolean);
        
        // Re-index remaining previews in the DOM
        const previews = overlay.querySelectorAll('#post-image-previews .image-preview');
        previews.forEach((p, index) => {
          p.dataset.index = index;
          const removeBtn = p.querySelector('.image-preview__remove');
          if (removeBtn) removeBtn.dataset.index = index;
          const editBtn = p.querySelector('.image-preview__edit');
          if (editBtn) editBtn.dataset.index = index;
        });

        this._updateSubmitButton();
      }

      if (action === 'toggle-tag-friends') {
        const panel = document.getElementById('tag-friends-panel');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : '';
        if (!visible) {
          // Wire up tag search once panel is shown
          const tagSearch = document.getElementById('post-tag-search');
          const tagSugg   = document.getElementById('post-tag-suggestions');
          const tagList   = document.getElementById('post-tag-list');
          if (tagSearch && !tagSearch._wired) {
            tagSearch._wired = true;
            tagSearch.oninput = async () => {
              const q = tagSearch.value.trim();
              tagSugg.innerHTML = '';
              if (!q || q.length < 2) return;
              try {
                const res = await Api.searchUsers(q);
                const users = (res.users || res || []).slice(0, 5);
                users.forEach(u => {
                  const btn = document.createElement('button');
                  btn.type = 'button';
                  btn.style.cssText = 'width:100%;background:var(--color-bg);border:1px solid var(--color-border);color:var(--text-primary);padding:7px 10px;border-radius:6px;cursor:pointer;text-align:left;margin-bottom:4px;display:flex;align-items:center;gap:8px;';
                  btn.innerHTML = `<img src="${u.avatar||'/default-avatar.png'}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;"><span style="font-size:13px;">${u.fullName||u.username}</span>`;
                  btn.onclick = () => {
                    // Prevent duplicate
                    const already = Array.from(tagList.querySelectorAll('[data-user-id]')).some(el => el.dataset.userId === u.id);
                    if (already) return;
                    const sp = document.createElement('span');
                    sp.dataset.userId = u.id;
                    sp.style.cssText = 'background:var(--color-primary);color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;display:flex;align-items:center;gap:4px;';
                    sp.innerHTML = `${u.fullName||u.username} <i class="fas fa-times" style="cursor:pointer;" onclick="this.parentElement.remove()"></i>`;
                    tagList.appendChild(sp);
                    tagSearch.value = '';
                    tagSugg.innerHTML = '';
                    // Add to meta tags bar
                    const metaTags = document.getElementById('post-meta-tags');
                    if (metaTags) {
                      const chip = document.createElement('span');
                      chip.dataset.tagRef = u.id;
                      chip.style.cssText = 'background:rgba(var(--color-primary-rgb,99,102,241),0.1);color:var(--color-primary);padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;';
                      chip.textContent = '— with ' + (u.fullName||u.username);
                      metaTags.appendChild(chip);
                    }
                  };
                  tagSugg.appendChild(btn);
                });
              } catch(e) {}
            };
          }
        }
      }

      if (action === 'toggle-location') {
        const panel = document.getElementById('location-panel');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : '';
        if (!visible) {
          // Try to get geolocation
          const locInput = document.getElementById('post-location-input');
          if (locInput && !locInput._wired) {
            locInput._wired = true;
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(pos => {
                const lat = pos.coords.latitude.toFixed(4);
                const lng = pos.coords.longitude.toFixed(4);
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
                  .then(r => r.json()).then(d => {
                    const city = d.address?.city || d.address?.town || d.address?.village || '';
                    const country = d.address?.country || '';
                    if (city || country) locInput.value = [city, country].filter(Boolean).join(', ');
                  }).catch(() => {});
              }, () => {});
            }
            locInput.oninput = () => {
              const metaTags = document.getElementById('post-meta-tags');
              if (!metaTags) return;
              const existing = metaTags.querySelector('[data-location]');
              if (existing) existing.remove();
              if (locInput.value.trim()) {
                const chip = document.createElement('span');
                chip.dataset.location = '1';
                chip.style.cssText = 'color:#f5533d;font-size:12px;font-weight:600;';
                chip.textContent = '📍 ' + locInput.value.trim();
                metaTags.appendChild(chip);
              }
            };
          }
        }
      }

    if (action === 'submit-post') {
      const content = document.getElementById('post-content-input')?.value || '';
      const images = this._uploadedImages.filter(Boolean);
      const location = document.getElementById('post-location-input')?.value?.trim() || null;
      const taggedUsers = Array.from(document.querySelectorAll('#post-tag-list [data-user-id]')).map(el => el.dataset.userId);
      this.handleCreatePost(content, images, location, taggedUsers);
      overlay.remove();
      this._uploadedImages = [];
    }
    });
  },

  // ── Image Editor Overlay (Full Interactive) ──────────────────────
  showImageEditor(index, isEditMode = false) {
    const media = this._uploadedImages[index];
    if (!media || media.type !== 'image') return;

    let currentUrl = media.url;
    let rotation = 0;
    let activeFilter = 'none';
    let activePanel = 'crop'; // crop | text | filter | tag | alt
    let textX = 50, textY = 50; // % position
    let cropX = 10, cropY = 10, cropW = 80, cropH = 80; // %
    document.getElementById('image-editor-overlay')?.remove();

    const ov = document.createElement('div');
    ov.id = 'image-editor-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10000;display:flex;flex-direction:column;color:#fff;font-family:inherit;';

    ov.innerHTML = `
      <!-- Header -->
      <div style="flex-shrink:0;height:56px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;background:#1c1c1c;border-bottom:1px solid #333;">
        <button id="img-ed-back" style="background:none;border:none;color:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;gap:8px;padding:0;">
          <i class="fas fa-arrow-left"></i><span>Back</span>
        </button>
        <span style="font-weight:700;font-size:1rem;">Edit Photo</span>
        <button id="img-ed-done" style="background:#6366f1;border:none;color:#fff;padding:7px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">Done</button>
      </div>

      <!-- Body -->
      <div style="flex:1;display:flex;overflow:hidden;">

        <!-- Preview Panel -->
        <div id="img-ed-preview-wrap" style="flex:1;display:flex;align-items:center;justify-content:center;background:#111;position:relative;overflow:hidden;">
          <div id="img-ed-img-container" style="position:relative;display:inline-block;">
            <img id="img-ed-img" src="${currentUrl}" style="max-width:80vw;max-height:calc(100vh - 220px);object-fit:contain;display:block;transition:filter 0.2s;">
            <!-- Crop Box Overlay -->
            <div id="img-ed-crop-box" style="display:none;position:absolute;border:2px solid #6366f1;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);box-sizing:border-box;left:10%;top:10%;width:80%;height:80%;touch-action:none;">
              <div class="ch ch-tl" style="position:absolute;top:-6px;left:-6px;width:14px;height:14px;background:#6366f1;border-radius:50%;cursor:nwse-resize;"></div>
              <div class="ch ch-tr" style="position:absolute;top:-6px;right:-6px;width:14px;height:14px;background:#6366f1;border-radius:50%;cursor:nesw-resize;"></div>
              <div class="ch ch-bl" style="position:absolute;bottom:-6px;left:-6px;width:14px;height:14px;background:#6366f1;border-radius:50%;cursor:nesw-resize;"></div>
              <div class="ch ch-br" style="position:absolute;bottom:-6px;right:-6px;width:14px;height:14px;background:#6366f1;border-radius:50%;cursor:nwse-resize;"></div>
              <div class="ch ch-mv" style="position:absolute;inset:0;cursor:move;"></div>
            </div>
            <!-- Text Overlay -->
            <div id="img-ed-text-el" style="display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);cursor:move;padding:6px 12px;border:1.5px dashed rgba(255,255,255,0.7);color:#fff;font-size:28px;font-weight:700;user-select:none;white-space:nowrap;text-shadow:2px 2px 6px rgba(0,0,0,0.9);touch-action:none;"></div>
          </div>
        </div>

        <!-- Right Panel -->
        <div style="width:290px;flex-shrink:0;background:#18191a;border-left:1px solid #333;display:flex;flex-direction:column;overflow:hidden;">
          <!-- Panel Tabs -->
          <div style="display:flex;border-bottom:1px solid #333;flex-shrink:0;">
            ${['crop','text','filter','tag','alt'].map(p => `
              <button class="img-ed-tab" data-panel="${p}" style="flex:1;background:none;border:none;color:#aaa;padding:10px 4px;font-size:11px;font-weight:600;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid transparent;transition:all 0.2s;">
                ${{'crop':'✂ Crop','text':'T Text','filter':'🎨 Filter','tag':'🏷 Tag','alt':'💬 Alt'}[p]}
              </button>
            `).join('')}
          </div>

          <!-- Panel Content (scrollable) -->
          <div id="img-ed-panel-content" style="flex:1;overflow-y:auto;padding:16px;">

            <!-- CROP PANEL -->
            <div id="panel-crop" class="img-ed-panel">
              <p style="color:#aaa;font-size:12px;margin:0 0 12px;">Drag sliders to adjust crop area. Click Apply to crop.</p>
              <label style="font-size:12px;color:#ccc;">Left (X): <span id="crop-x-val">10</span>%</label>
              <input type="range" id="crop-x" min="0" max="85" value="10" style="width:100%;margin:4px 0 10px;accent-color:#6366f1;">
              <label style="font-size:12px;color:#ccc;">Top (Y): <span id="crop-y-val">10</span>%</label>
              <input type="range" id="crop-y" min="0" max="85" value="10" style="width:100%;margin:4px 0 10px;accent-color:#6366f1;">
              <label style="font-size:12px;color:#ccc;">Width: <span id="crop-w-val">80</span>%</label>
              <input type="range" id="crop-w" min="10" max="100" value="80" style="width:100%;margin:4px 0 10px;accent-color:#6366f1;">
              <label style="font-size:12px;color:#ccc;">Height: <span id="crop-h-val">80</span>%</label>
              <input type="range" id="crop-h" min="10" max="100" value="80" style="width:100%;margin:4px 0 14px;accent-color:#6366f1;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                <button id="btn-preset-11" style="background:rgba(255,255,255,0.07);border:1px solid #444;color:#fff;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;">1:1 Square</button>
                <button id="btn-preset-169" style="background:rgba(255,255,255,0.07);border:1px solid #444;color:#fff;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;">16:9</button>
                <button id="btn-preset-43" style="background:rgba(255,255,255,0.07);border:1px solid #444;color:#fff;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;">4:3</button>
                <button id="btn-preset-free" style="background:rgba(255,255,255,0.07);border:1px solid #444;color:#fff;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;">Free</button>
              </div>
              <button id="btn-apply-crop" style="width:100%;background:#6366f1;border:none;color:#fff;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;">✂ Apply Crop</button>
            </div>

            <!-- TEXT PANEL -->
            <div id="panel-text" class="img-ed-panel" style="display:none;">
              <label style="font-size:12px;color:#ccc;display:block;margin-bottom:6px;">Text</label>
              <input type="text" id="text-input" placeholder="Type your text here..." style="width:100%;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;padding:9px;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:12px;">
              <label style="font-size:12px;color:#ccc;">Font Size: <span id="font-size-val">28</span>px</label>
              <input type="range" id="font-size" min="12" max="80" value="28" style="width:100%;margin:4px 0 12px;accent-color:#6366f1;">
              <label style="font-size:12px;color:#ccc;display:block;margin-bottom:6px;">Color</label>
              <input type="color" id="text-color" value="#ffffff" style="width:100%;height:40px;border:1px solid #444;border-radius:8px;cursor:pointer;background:none;margin-bottom:12px;">
              <label style="font-size:12px;color:#ccc;display:block;margin-bottom:6px;">Style</label>
              <div style="display:flex;gap:8px;margin-bottom:14px;">
                <button id="text-bold" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;color:#fff;padding:8px;border-radius:6px;cursor:pointer;font-weight:700;">B Bold</button>
                <button id="text-shadow" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;color:#fff;padding:8px;border-radius:6px;cursor:pointer;">Shadow</button>
              </div>
              <p style="color:#aaa;font-size:11px;margin:0 0 8px;">👆 Drag the text on the photo to position it</p>
              <button id="btn-add-text" style="width:100%;background:#6366f1;border:none;color:#fff;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;">Add / Update Text</button>
            </div>

            <!-- FILTER PANEL -->
            <div id="panel-filter" class="img-ed-panel" style="display:none;">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                ${['None','Grayscale','Sepia','Invert','Warm','Cool','Vivid','Fade'].map(f => `
                  <button class="filter-btn" data-filter="${f.toLowerCase()}" style="background:rgba(255,255,255,0.05);border:1px solid transparent;color:#fff;padding:10px 4px;border-radius:8px;font-size:12px;cursor:pointer;text-align:center;transition:all 0.2s;">${f}</button>
                `).join('')}
              </div>
            </div>

            <!-- TAG PANEL -->
            <div id="panel-tag" class="img-ed-panel" style="display:none;">
              <label style="font-size:12px;color:#ccc;display:block;margin-bottom:6px;">Tag People</label>
              <input type="text" id="tag-input" placeholder="Search friend by name..." style="width:100%;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;padding:9px;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
              <div id="tag-suggestions" style="margin-bottom:8px;"></div>
              <div id="tag-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
            </div>

            <!-- ALT TEXT PANEL -->
            <div id="panel-alt" class="img-ed-panel" style="display:none;">
              <label style="font-size:12px;color:#ccc;display:block;margin-bottom:6px;">Alternative Text (for accessibility)</label>
              <textarea id="alt-text-input" rows="4" placeholder="Describe this photo..." style="width:100%;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;padding:9px;color:#fff;font-size:13px;box-sizing:border-box;resize:none;">${media.altText || ''}</textarea>
            </div>

          </div><!-- /panel-content -->
        </div><!-- /right panel -->
      </div><!-- /body -->

      <!-- Bottom Toolbar: Rotate -->
      <div style="flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:16px;padding:10px 20px;background:#1c1c1c;border-top:1px solid #333;">
        <button id="img-ed-rotate" style="background:rgba(255,255,255,0.08);border:1px solid #444;color:#fff;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;">
          <i class="fas fa-redo"></i> Rotate 90°
        </button>
        <span style="font-size:11px;color:#666;">Tip: Select a panel on the right to edit</span>
      </div>
    `;

    document.body.appendChild(ov);

    // ── Element refs ────────────────────────────────────────────────
    const imgEl       = document.getElementById('img-ed-img');
    const imgContainer= document.getElementById('img-ed-img-container');
    const cropBox     = document.getElementById('img-ed-crop-box');
    const textEl      = document.getElementById('img-ed-text-el');
    const tabs        = ov.querySelectorAll('.img-ed-tab');
    const panels      = ov.querySelectorAll('.img-ed-panel');

    // ── Tab switching ────────────────────────────────────────────────
    function switchPanel(name) {
      activePanel = name;
      tabs.forEach(t => {
        const active = t.dataset.panel === name;
        t.style.color = active ? '#6366f1' : '#aaa';
        t.style.borderBottom = active ? '2px solid #6366f1' : '2px solid transparent';
      });
      panels.forEach(p => p.style.display = p.id === 'panel-' + name ? '' : 'none');
      // Show/hide crop box
      cropBox.style.display = name === 'crop' ? '' : 'none';
      // Show/hide text el when in text panel
      if (name !== 'text') textEl.style.borderColor = 'transparent';
      else textEl.style.borderColor = 'rgba(255,255,255,0.7)';
    }
    tabs.forEach(t => t.onclick = () => switchPanel(t.dataset.panel));
    switchPanel('crop');

    // ── Apply CSS filter helper ──────────────────────────────────────
    function applyFilter(f) {
      const map = {
        none:'', grayscale:'grayscale(1)', sepia:'sepia(1)', invert:'invert(1)',
        warm:'sepia(0.4) saturate(1.3)', cool:'hue-rotate(30deg) saturate(1.1)',
        vivid:'saturate(2)', fade:'opacity(0.75) saturate(0.5) brightness(1.1)'
      };
      imgEl.style.filter = map[f] || '';
    }
    ov.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = () => {
        ov.querySelectorAll('.filter-btn').forEach(b => { b.style.border='1px solid transparent'; b.style.background='rgba(255,255,255,0.05)'; });
        btn.style.border='1px solid #6366f1'; btn.style.background='rgba(99,102,241,0.2)';
        activeFilter = btn.dataset.filter;
        applyFilter(activeFilter);
      };
    });

    // ── Rotate ──────────────────────────────────────────────────────
    document.getElementById('img-ed-rotate').onclick = () => {
      rotation = (rotation + 90) % 360;
      imgEl.style.transform = `rotate(${rotation}deg)`;
    };

    // ── Crop Sliders ────────────────────────────────────────────────
    function updateCropBox() {
      const x = parseFloat(document.getElementById('crop-x').value);
      const y = parseFloat(document.getElementById('crop-y').value);
      let w = parseFloat(document.getElementById('crop-w').value);
      let h = parseFloat(document.getElementById('crop-h').value);
      if (x + w > 100) w = 100 - x;
      if (y + h > 100) h = 100 - y;
      cropX = x; cropY = y; cropW = w; cropH = h;
      document.getElementById('crop-x-val').textContent = Math.round(x);
      document.getElementById('crop-y-val').textContent = Math.round(y);
      document.getElementById('crop-w-val').textContent = Math.round(w);
      document.getElementById('crop-h-val').textContent = Math.round(h);
      cropBox.style.left   = x + '%';
      cropBox.style.top    = y + '%';
      cropBox.style.width  = w + '%';
      cropBox.style.height = h + '%';
    }
    ['crop-x','crop-y','crop-w','crop-h'].forEach(id => {
      document.getElementById(id).oninput = updateCropBox;
    });
    updateCropBox();

    // ── Drag-to-Crop (Facebook-style) ──────────────────────────────────
    (function initDragCrop() {
      const box = cropBox;
      const cont = imgContainer;
      let active = null, sx=0, sy=0, sl=0, st=0, sw=0, sh=0;
      function startDrag(e) {
        const touch = e.touches ? e.touches[0] : e;
        sx = touch.clientX; sy = touch.clientY;
        sl = parseFloat(box.style.left); st = parseFloat(box.style.top);
        sw = parseFloat(box.style.width); sh = parseFloat(box.style.height);
        const cls = e.target.className || '';
        if (cls.includes('ch-mv'))  active = 'mv';
        else if (cls.includes('ch-tl')) active = 'tl';
        else if (cls.includes('ch-tr')) active = 'tr';
        else if (cls.includes('ch-bl')) active = 'bl';
        else if (cls.includes('ch-br')) active = 'br';
        else active = null;
        if (active) { e.preventDefault(); e.stopPropagation(); }
      }
      function moveDrag(e) {
        if (!active) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const dx = ((touch.clientX - sx) / cont.offsetWidth)  * 100;
        const dy = ((touch.clientY - sy) / cont.offsetHeight) * 100;
        let nl=sl, nt=st, nw=sw, nh=sh;
        if (active==='mv') {
          nl = Math.max(0, Math.min(100-sw, sl+dx));
          nt = Math.max(0, Math.min(100-sh, st+dy));
        } else {
          if (active==='tl'||active==='bl') { // resize left
            const re = sl+sw;
            nl = Math.max(0, Math.min(re-5, sl+dx));
            nw = re - nl;
          }
          if (active==='tr'||active==='br') nw = Math.max(5, Math.min(100-sl, sw+dx)); // resize right
          if (active==='tl'||active==='tr') { // resize top
            const be = st+sh;
            nt = Math.max(0, Math.min(be-5, st+dy));
            nh = be - nt;
          }
          if (active==='bl'||active==='br') nh = Math.max(5, Math.min(100-st, sh+dy)); // resize bottom
        }
        box.style.left=nl+'%'; box.style.top=nt+'%';
        box.style.width=nw+'%'; box.style.height=nh+'%';
        cropX=nl; cropY=nt; cropW=nw; cropH=nh;
        // Sync sliders
        ['x','y','w','h'].forEach((k,i)=>{
          const v=[nl,nt,nw,nh][i];
          const sl2 = document.getElementById('crop-'+k);
          const sv2 = document.getElementById('crop-'+k+'-val');
          if(sl2) sl2.value = v;
          if(sv2) sv2.textContent = Math.round(v);
        });
      }
      function endDrag() { active = null; }
      box.addEventListener('mousedown',  startDrag);
      box.addEventListener('touchstart', startDrag, {passive:false});
      document.addEventListener('mousemove',  moveDrag);
      document.addEventListener('touchmove',  moveDrag, {passive:false});
      document.addEventListener('mouseup',    endDrag);
      document.addEventListener('touchend',   endDrag);
    })();

    // Presets
    function setPreset(x, y, w, h) {
      document.getElementById('crop-x').value = x;
      document.getElementById('crop-y').value = y;
      document.getElementById('crop-w').value = w;
      document.getElementById('crop-h').value = h;
      updateCropBox();
    }
    document.getElementById('btn-preset-11').onclick  = () => setPreset(10, 10, 80, 80);
    document.getElementById('btn-preset-169').onclick = () => setPreset(5,  22, 90, 55);
    document.getElementById('btn-preset-43').onclick  = () => setPreset(5,  15, 90, 70);
    document.getElementById('btn-preset-free').onclick= () => setPreset(10, 10, 80, 80);

    // Apply Crop button
    document.getElementById('btn-apply-crop').onclick = () => {
      const srcImg = new Image();
      srcImg.src = currentUrl;
      srcImg.onload = () => {
        const canvas = document.createElement('canvas');
        const cx = (cropX / 100) * srcImg.width;
        const cy = (cropY / 100) * srcImg.height;
        const cw = (cropW / 100) * srcImg.width;
        const ch = (cropH / 100) * srcImg.height;
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(srcImg, cx, cy, cw, ch, 0, 0, cw, ch);
        currentUrl = canvas.toDataURL('image/jpeg', 0.96);
        imgEl.src = currentUrl;
        rotation = 0; imgEl.style.transform = '';
        if (typeof Utils !== 'undefined') Utils.showToast('Crop applied!', 'success');
      };
    };

    // ── Text Tool ───────────────────────────────────────────────────
    let isBold = false, hasShadow = true, textStr = '';
    document.getElementById('text-bold').onclick = function() {
      isBold = !isBold;
      this.style.background = isBold ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)';
      updateTextEl();
    };
    document.getElementById('text-shadow').onclick = function() {
      hasShadow = !hasShadow;
      this.style.background = hasShadow ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)';
      updateTextEl();
    };
    function updateTextEl() {
      textStr = document.getElementById('text-input').value;
      const size = document.getElementById('font-size').value;
      const color = document.getElementById('text-color').value;
      document.getElementById('font-size-val').textContent = size;
      textEl.style.display = textStr ? '' : 'none';
      textEl.textContent = textStr;
      textEl.style.fontSize = size + 'px';
      textEl.style.color = color;
      textEl.style.fontWeight = isBold ? '800' : '600';
      textEl.style.textShadow = hasShadow ? '2px 2px 8px rgba(0,0,0,0.9)' : 'none';
    }
    document.getElementById('text-input').oninput = updateTextEl;
    document.getElementById('font-size').oninput  = updateTextEl;
    document.getElementById('text-color').oninput = updateTextEl;
    document.getElementById('btn-add-text').onclick = updateTextEl;

    // Drag text element
    function makeDraggable(el, container) {
      let dragging = false, offX = 0, offY = 0;
      el.onmousedown = (e) => {
        e.preventDefault(); dragging = true;
        const rect = container.getBoundingClientRect();
        offX = e.clientX - rect.left - (parseFloat(el.style.left) / 100 * container.offsetWidth);
        offY = e.clientY - rect.top  - (parseFloat(el.style.top)  / 100 * container.offsetHeight);
        document.onmousemove = (mv) => {
          if (!dragging) return;
          const r = container.getBoundingClientRect();
          let lp = ((mv.clientX - r.left - offX) / r.width) * 100;
          let tp = ((mv.clientY - r.top  - offY) / r.height) * 100;
          lp = Math.max(0, Math.min(95, lp));
          tp = Math.max(0, Math.min(95, tp));
          textX = lp; textY = tp;
          el.style.left = lp + '%'; el.style.top = tp + '%';
          el.style.transform = 'none';
        };
        document.onmouseup = () => { dragging = false; document.onmousemove = null; document.onmouseup = null; };
      };
      // Touch support
      el.ontouchstart = (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const rect = container.getBoundingClientRect();
        offX = t.clientX - rect.left - (parseFloat(el.style.left) / 100 * container.offsetWidth);
        offY = t.clientY - rect.top  - (parseFloat(el.style.top)  / 100 * container.offsetHeight);
        document.ontouchmove = (mv) => {
          const tt = mv.touches[0];
          const r = container.getBoundingClientRect();
          let lp = ((tt.clientX - r.left - offX) / r.width) * 100;
          let tp = ((tt.clientY - r.top  - offY) / r.height) * 100;
          lp = Math.max(0, Math.min(95, lp));
          tp = Math.max(0, Math.min(95, tp));
          textX = lp; textY = tp;
          el.style.left = lp + '%'; el.style.top = tp + '%';
          el.style.transform = 'none';
        };
        document.ontouchend = () => { document.ontouchmove = null; document.ontouchend = null; };
      };
    }
    makeDraggable(textEl, imgContainer);

    // ── Tag input ────────────────────────────────────────────────────
    const tagInput = document.getElementById('tag-input');
    const tagList  = document.getElementById('tag-list');
    const tagSugg  = document.getElementById('tag-suggestions');
    const currentTags = (media.tags || []).map(t => {
      const sp = document.createElement('span');
      sp.style.cssText = 'background:#6366f1;padding:4px 8px;border-radius:4px;font-size:11px;display:flex;align-items:center;gap:4px;';
      sp.innerHTML = t + ' <i class="fas fa-times" onclick="this.parentElement.remove()" style="cursor:pointer;"></i>';
      tagList.appendChild(sp);
    });
    tagInput.oninput = async () => {
      const q = tagInput.value.trim();
      tagSugg.innerHTML = '';
      if (!q || q.length < 2) return;
      try {
        const res = await Api.searchUsers(q);
        const users = res.users || res || [];
        users.slice(0, 5).forEach(u => {
          const btn = document.createElement('button');
          btn.style.cssText = 'width:100%;background:rgba(255,255,255,0.06);border:none;color:#fff;padding:8px 10px;border-radius:6px;cursor:pointer;text-align:left;margin-bottom:4px;display:flex;align-items:center;gap:8px;';
          btn.innerHTML = `<img src="${u.avatar||'/default-avatar.png'}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;"><span>${u.fullName||u.username}</span>`;
          btn.onclick = () => {
            const sp = document.createElement('span');
            sp.style.cssText = 'background:#6366f1;padding:4px 8px;border-radius:4px;font-size:11px;display:flex;align-items:center;gap:4px;';
            sp.innerHTML = (u.fullName||u.username) + ' <i class="fas fa-times" onclick="this.parentElement.remove()" style="cursor:pointer;"></i>';
            tagList.appendChild(sp);
            tagInput.value = '';
            tagSugg.innerHTML = '';
          };
          tagSugg.appendChild(btn);
        });
      } catch(e) {}
    };

    // ── Back ─────────────────────────────────────────────────────────
    document.getElementById('img-ed-back').onclick = () => {
      ov.remove();
      if (typeof Utils !== 'undefined') Utils.showToast('Edits discarded.', 'info');
    };

    // ── Done ─────────────────────────────────────────────────────────
    document.getElementById('img-ed-done').onclick = () => {
      const doneBtn = document.getElementById('img-ed-done');
      doneBtn.disabled = true; doneBtn.textContent = '⏳';

      const srcImg = new Image();
      srcImg.crossOrigin = 'anonymous';
      srcImg.src = currentUrl;
      srcImg.onload = () => {
        const canvas = document.createElement('canvas');
        const isOrtho = rotation === 90 || rotation === 270;
        const cw = isOrtho ? srcImg.height : srcImg.width;
        const ch = isOrtho ? srcImg.width  : srcImg.height;
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        // Draw rotated image
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(srcImg, -srcImg.width / 2, -srcImg.height / 2);
        ctx.setTransform(1,0,0,1,0,0);

        // Apply pixel filter
        if (activeFilter !== 'none') {
          const id = ctx.getImageData(0, 0, cw, ch);
          const d = id.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i+1], b = d[i+2];
            if      (activeFilter==='grayscale') { const gr=0.299*r+0.587*g+0.114*b; d[i]=d[i+1]=d[i+2]=gr; }
            else if (activeFilter==='sepia')     { d[i]=Math.min(255,r*.393+g*.769+b*.189); d[i+1]=Math.min(255,r*.349+g*.686+b*.168); d[i+2]=Math.min(255,r*.272+g*.534+b*.131); }
            else if (activeFilter==='invert')    { d[i]=255-r; d[i+1]=255-g; d[i+2]=255-b; }
            else if (activeFilter==='warm')      { d[i]=Math.min(255,r*1.15); d[i+2]=Math.max(0,b*0.85); }
            else if (activeFilter==='cool')      { d[i]=Math.max(0,r*0.85); d[i+2]=Math.min(255,b*1.15); }
            else if (activeFilter==='vivid')     { d[i]=Math.min(255,r*1.2); d[i+1]=Math.min(255,g*1.2); d[i+2]=Math.min(255,b*1.2); }
            else if (activeFilter==='fade')      { d[i]=r*.8+40; d[i+1]=g*.8+40; d[i+2]=b*.8+40; }
          }
          ctx.putImageData(id, 0, 0);
        }

        // Draw text overlay onto canvas
        if (textStr && textEl.style.display !== 'none') {
          const fontSize = parseFloat(document.getElementById('font-size').value);
          const scaleX = cw / imgContainer.offsetWidth;
          const scaleY = ch / imgContainer.offsetHeight;
          const finalSize = fontSize * Math.min(scaleX, scaleY) * 1.5;
          const px = (textX / 100) * cw;
          const py = (textY / 100) * ch;
          ctx.font = `${isBold ? 800 : 600} ${finalSize}px sans-serif`;
          ctx.fillStyle = document.getElementById('text-color').value;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          if (hasShadow) { ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=8; }
          ctx.fillText(textStr, px, py);
          ctx.shadowBlur = 0;
        }

        // Save everything
        const finalUrl = canvas.toDataURL('image/jpeg', 0.96);
        const finalTags = Array.from(tagList.children).map(c => c.textContent.trim());
        media.url = finalUrl;
        media.altText = (document.getElementById('alt-text-input') || {}).value || '';
        media.tags = finalTags;

        const previewsId = isEditMode ? 'post-edit-image-previews' : 'post-image-previews';
        document.querySelectorAll(`#${previewsId} .image-preview`).forEach(p => {
          if (parseInt(p.dataset.index) === index) {
            const imgTag = p.querySelector('img');
            if (imgTag) imgTag.src = finalUrl;
          }
        });
        ov.remove();
        if (typeof Utils !== 'undefined') Utils.showToast('Photo edited!', 'success');
      };
      srcImg.onerror = () => { ov.remove(); };
    };
  },

  // ── Global event delegation handler ────────────────────────────────
  handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;
    const postId = target.dataset.postId;

    if (action === 'like-post' && postId) {
      this.handleLike(postId);
      return true;
    }

    if (action === 'react-post' && postId) {
      const type = target.dataset.reactionType;
      this.handleReact(postId, type);
      return true;
    }

    if (action === 'toggle-comments' && postId) {
      const container = document.getElementById(`comments-${postId}`);
      if (container) {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          this.loadComments(postId);
        }
      }
      return true;
    }

    if (action === 'submit-comment') {
      e.preventDefault();
      const input = target.querySelector('.comment-input__field') || target.closest('form')?.querySelector('.comment-input__field');
      if (input && input.value.trim()) {
        const parentId = input.dataset.parentId || null;
        this.handleComment(input.dataset.postId, input.value.trim(), parentId);
        input.value = '';
      }
      return true;
    }

    if (action === 'share-post' && postId) {
      this.handleShare(postId);
      return true;
    }

    if (action === 'bookmark-post' && postId) {
      this.handleBookmark(postId);
      return true;
    }

    if (action === 'delete-post' && postId) {
      this.showDeleteConfirmationModal(postId);
      return true;
    }

    if (action === 'view-image') {
      const pId = target.dataset.postId;
      const idx = parseInt(target.dataset.index, 10) || 0;
      if (pId) {
        this.openPhotoViewer(pId, idx);
      }
      return true;
    }

    if (action === 'edit-post' && postId) {
      this.showEditPostModal(postId);
      // Close dropdown menu specifically
      const menu = document.getElementById(`post-menu-${postId}`);
      if (menu) menu.style.display = 'none';
      return true;
    }

    if (action === 'toggle-post-menu' && postId) {
      const menu = document.getElementById(`post-menu-${postId}`);
      if (menu) {
        // Close all other menus
        document.querySelectorAll('.post-menu').forEach(m => {
          if (m !== menu) m.style.display = 'none';
        });
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      }
      return true;
    }

    if (action === 'view-all-comments' && postId) {
      // Re-load comments with a larger limit (e.g. 100) or open a modal
      if (typeof Utils !== 'undefined') Utils.showToast('Loading more comments...', 'info');
      // this.loadComments(postId, 100);
      return true;
    }

    if (action === 'reply-comment') {
      const commentId = target.dataset.commentId;
      const replyPostId = target.dataset.postId;
      const container = document.getElementById(`comments-${replyPostId}`);
      const input = container?.querySelector('.comment-input__field');
      if (input) {
        input.value = `@user `; // We'd need the username from DOM or API
        input.dataset.parentId = commentId;
        input.focus();
      }
      return true;
    }

    if (action === 'go-to-reels') {
      window.location.hash = '#reels';
      return true;
    }

    return false;
  },

  showCommentsModal(postId) {
    const existing = document.getElementById('comments-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'comments-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div class="modal modal--md active" style="max-height:80vh; max-height:80dvh; display:flex; flex-direction:column; background:var(--bg-card); border-radius:16px; overflow:hidden; width:100%; max-width:500px; box-shadow:var(--shadow-lg);">
        <div class="modal__header" style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--color-divider);">
          <h3 class="modal__title" style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">Comments</h3>
          <button class="modal__close btn-icon" id="comments-modal-close" style="border:none; background:none; font-size:1.5rem; cursor:pointer; color:var(--text-secondary);">&times;</button>
        </div>
        <div class="modal__body" id="modal-comments-list-${postId}" style="flex:1; overflow-y:auto; padding:16px;">
          <div style="text-align:center; padding:20px; color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Loading comments...</div>
        </div>
        <div class="modal__footer" style="padding:12px 16px; border-top:1px solid var(--color-divider); background:var(--color-bg-secondary);">
          <form id="modal-comment-form-${postId}" style="display:flex; gap:10px; width:100%; margin:0; position:relative; align-items:center;">
            <div style="flex:1; display:flex; align-items:center; background:var(--color-bg-input); border:1px solid var(--color-border); border-radius:20px; padding:0 12px; position:relative;">
              <input type="text" id="modal-comment-input-${postId}" class="auth-input" placeholder="Write a comment..." style="flex:1; border:none; background:transparent; color:var(--text-primary); outline:none; padding:10px 0; padding-right:28px;" autocomplete="off">
              <button type="button" id="modal-comment-emoji-btn-${postId}" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.15rem; position:absolute; right:10px; top:50%; transform:translateY(-50%); display:flex; align-items:center; justify-content:center; padding:0; outline:none;"><i class="far fa-smile"></i></button>
              
              <!-- Modal Comment Emoji Picker Panel -->
              <div class="emoji-picker modal-comment-emoji-picker" id="modal-comment-emoji-picker-${postId}" style="display:none; position:absolute; bottom:45px; right:0; z-index:10005; width:280px; box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                ${this.renderEmojiPicker(`modal-comment-input-${postId}`)}
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="padding:10px 20px; border-radius:20px; background:var(--color-primary); color:white; border:none; cursor:pointer;">➤</button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    this.loadCommentsForModal(postId);

    document.getElementById('comments-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Toggle emoji picker inside comments modal
    const emojiBtn = document.getElementById(`modal-comment-emoji-btn-${postId}`);
    const cmtPicker = document.getElementById(`modal-comment-emoji-picker-${postId}`);
    if (emojiBtn && cmtPicker) {
      emojiBtn.onclick = (e) => {
        e.stopPropagation();
        cmtPicker.style.display = cmtPicker.style.display === 'none' ? 'block' : 'none';
      };
      document.addEventListener('click', (ev) => {
        if (!ev.target.closest(`#modal-comment-emoji-picker-${postId}`) && ev.target !== emojiBtn && !emojiBtn.contains(ev.target)) {
          cmtPicker.style.display = 'none';
        }
      });
    }

    // Delegate tab and insert clicks inside the comments modal overlay
    overlay.addEventListener('click', (e) => {
      const target2 = e.target.closest('[data-action]');
      if (!target2) return;
      const action2 = target2.dataset.action;
      if (action2 === 'emoji-tab') {
        e.stopPropagation();
        const cat = target2.dataset.category;
        overlay.querySelectorAll('.emoji-picker__tab').forEach(t =>
          t.classList.toggle('emoji-picker__tab--active', t.dataset.category === cat)
        );
        overlay.querySelectorAll('.emoji-picker__panel').forEach(p =>
          p.classList.toggle('emoji-picker__panel--hidden', p.dataset.category !== cat)
        );
      }
      if (action2 === 'insert-emoji') {
        e.stopPropagation();
        const emoji = target2.dataset.emoji;
        const input = document.getElementById(target2.dataset.target);
        if (input && emoji) {
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          const val = input.value;
          input.value = val.slice(0, start) + emoji + val.slice(end);
          input.focus();
          input.selectionStart = input.selectionEnd = start + emoji.length;
        }
      }
    });

    document.getElementById(`modal-comment-form-${postId}`).addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById(`modal-comment-input-${postId}`);
      const val = input.value.trim();
      if (!val) return;

      try {
        await Api.addComment(postId, val);
        input.value = '';
        this.loadCommentsForModal(postId);
        const countSpan = document.querySelector(`[data-action="reel-comment"][data-post-id="${postId}"] .count`);
        if (countSpan) {
          countSpan.textContent = parseInt(countSpan.textContent || '0') + 1;
        }
      } catch (err) {
        window.Utils.showToast('Failed to add comment', 'error');
      }
    });
  },

  async loadCommentsForModal(postId) {
    const listContainer = document.getElementById(`modal-comments-list-${postId}`);
    if (!listContainer) return;

    try {
      const res = await Api.getComments(postId);
      const comments = res.comments || [];
      if (!comments.length) {
        listContainer.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">No comments yet. Be the first to comment!</div>`;
        return;
      }

      const esc = str => window.Utils?.escapeHtml?.(str) || str;
      const html = comments.map(c => {
        const author = c.author || {};
        const name = esc(author.fullName || author.username);
        const avatar = author.avatar;
        const timeAgo = window.Utils?.timeAgo?.(c.createdAt) || '';
        return `
          <div class="comment" style="display:flex; gap:10px; margin-bottom:16px; text-align:left;">
            <img class="avatar avatar-xs" src="${avatar}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
            <div class="comment__body" style="flex:1;">
              <div class="comment__bubble" style="background:var(--color-bg-hover); padding:10px 14px; border-radius:14px; display:inline-block; max-width:85%;">
                <span class="comment__author" style="font-weight:700; font-size:0.85rem; display:block; color:var(--text-primary); margin-bottom:2px;">${name}</span>
                <span class="comment__text" style="font-size:0.9rem; color:var(--text-primary);">${esc(c.content)}</span>
              </div>
              <div style="font-size:0.75rem; color:var(--text-tertiary); margin-top:4px; padding-left:4px;">${timeAgo}</div>
            </div>
          </div>
        `;
      }).join('');

      listContainer.innerHTML = html;
    } catch {
      listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--color-error);">Failed to load comments.</div>`;
    }
  },

  // ── Photo Viewer Lightbox (Facebook-style) ──────────────────────────
  openPhotoViewer(postId, startIdx = 0) {
    document.getElementById('photo-viewer-lightbox')?.remove();
    const ov = document.createElement('div');
    ov.id = 'photo-viewer-lightbox';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:10000;display:flex;color:#fff;font-family:inherit;';
    ov.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;"><i class="fas fa-circle-notch fa-spin" style="font-size:2rem;color:#6366f1;"></i></div>';
    document.body.appendChild(ov);
    this._loadLightboxPost(postId, startIdx, ov);
  },

  async _loadLightboxPost(postId, startIdx, ov) {
    const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    try {
      const res  = await Api.getPost(postId);
      const post = res.post || res;
      if (!post) { ov.remove(); return; }

      const images = (post.media||[]).filter(m=>m.type==='image').map(m=>m.url);
      if (!images.length) { ov.remove(); return; }

      let idx = Math.min(startIdx, images.length-1);
      const author = post.author || {};

      const render = () => {
        const img    = images[idx];
        const isLiked= post.viewerLiked;
        const rxn    = post.viewerReaction;
        const rxEmoji= {'like':'👍','love':'❤️','haha':'😆','wow':'😮','sad':'😢','angry':'😡'};
        const rxLabel= {'like':'Like','love':'Love','haha':'Haha','wow':'Wow','sad':'Sad','angry':'Angry'};
        const likeLabel = rxn ? (rxEmoji[rxn]||'👍')+' '+(rxLabel[rxn]||'Like') : '👍 Like';
        const currentUser = window.Auth?.getCurrentUser?.() || {};
        const userAvatar = currentUser.avatar || '/default-avatar.png';

        ov.innerHTML = `
          <!-- LEFT: image -->
          <div style="flex:1;background:#000;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
            <button id="lb-close" title="Close" style="position:absolute;top:16px;left:16px;z-index:5;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'"><i class="fas fa-times"></i></button>
            <img id="lb-img" src="${img}" style="max-width:100%;max-height:100%;object-fit:contain;user-select:none;">
            ${images.length>1 ? `
              <button id="lb-prev" style="position:absolute;left:16px;width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.25s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'"><i class="fas fa-chevron-left"></i></button>
              <button id="lb-next" style="position:absolute;right:16px;width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.25s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'"><i class="fas fa-chevron-right"></i></button>
              <div style="position:absolute;bottom:16px;font-size:14px;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.6);padding:4px 10px;border-radius:12px;">${idx+1} / ${images.length}</div>
            ` : ''}
          </div>

          <!-- RIGHT: post info & comments -->
          <div style="width:360px;flex-shrink:0;background:#242526;border-left:1px solid #3e4042;display:flex;flex-direction:column;overflow:hidden;box-shadow:-4px 0 16px rgba(0,0,0,0.3);">
            <!-- Author Header -->
            <div style="padding:16px;border-bottom:1px solid #3e4042;display:flex;align-items:center;gap:12px;flex-shrink:0;">
              <img src="${author.avatar||'/default-avatar.png'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid #3e4042;">
              <div style="flex:1;">
                <div style="font-weight:700;font-size:0.95rem;color:#e4e6eb;line-height:1.2;">${esc(author.fullName||author.username)}</div>
                <div style="font-size:0.8rem;color:#b0b3b8;margin-top:2px;">${window.Utils?.formatTimeAgo?.(post.createdAt)||''}</div>
              </div>
            </div>

            <!-- Scrollable Content -->
            <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px;" class="custom-scrollbar">
              ${post.content ? `<div style="font-size:0.95rem;color:#e4e6eb;line-height:1.4;white-space:pre-wrap;word-break:break-word;">${this._processContent(post.content)}</div>` : ''}
              
              <!-- Likes & Comments Counter -->
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;color:#b0b3b8;padding-bottom:12px;border-bottom:1px solid #3e4042;">
                <span id="lb-like-count" style="display:flex;align-items:center;gap:4px;">👍 ${post.likesCount||0}</span>
                <span>${post.commentsCount||0} Comments</span>
              </div>
              
              <!-- Comments List -->
              <div id="lb-comments" style="display:flex;flex-direction:column;gap:12px;"></div>
            </div>

            <!-- Action panel + Input -->
            <div style="padding:12px 16px;border-top:1px solid #3e4042;background:#18191a;flex-shrink:0;">
              <!-- Like & Comment Actions -->
              <div style="display:flex;gap:4px;border-bottom:1px solid #3e4042;padding-bottom:8px;margin-bottom:10px;">
                <div style="position:relative;flex:1;" class="post-action-btn-wrapper">
                  <button id="lb-like-btn" style="width:100%;border:none;background:none;color:${isLiked?'#1877f2':'#b0b3b8'};cursor:pointer;font-weight:600;padding:10px 0;font-size:0.9rem;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    ${likeLabel}
                  </button>
                  <!-- Reactions Popup -->
                  <div class="reactions-popup lb-reactions-popup" style="bottom:110%;left:12px;transform:none;min-width:unset;padding:4px 8px;gap:6px;display:flex;">
                    ${['like','love','haha','wow','sad','angry'].map(t=>`<button class="reaction-emoji-btn lb-rxn-btn" data-rtype="${t}" style="font-size:1.6rem;transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">${rxEmoji[t]}</button>`).join('')}
                  </div>
                </div>
                <button id="lb-cmt-btn" style="flex:1;border:none;background:none;color:#b0b3b8;cursor:pointer;font-weight:600;padding:10px 0;font-size:0.9rem;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                  💬 Comment
                </button>
              </div>

              <!-- Comment Form -->
              <form id="lb-cmt-form" style="display:flex;gap:8px;align-items:center;">
                <img src="${userAvatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid #3e4042;flex-shrink:0;">
                <div style="flex:1;display:flex;align-items:center;background:#3a3b3c;border-radius:20px;padding:4px 12px;position:relative;">
                  <input id="lb-cmt-input" type="text" placeholder="Write a comment…" style="flex:1;border:none;background:transparent;color:#ffffff;font-size:0.875rem;outline:none;padding:6px 0;box-sizing:border-box;padding-right:28px;">
                  <button type="button" id="lb-cmt-emoji-btn" style="background:none;border:none;color:#b0b3b8;cursor:pointer;font-size:1.15rem;position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;padding:0;outline:none;"><i class="far fa-smile"></i></button>
                  <!-- Lightbox Comment Emoji Picker Panel -->
                  <div class="emoji-picker lb-comment-emoji-picker" id="lb-comment-emoji-picker" style="display:none;position:absolute;bottom:45px;right:0;z-index:1002;width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                    ${Post.renderEmojiPicker('lb-cmt-input')}
                  </div>
                </div>
                <button type="submit" style="background:#1877f2;color:#fff;border:none;padding:8px 16px;border-radius:20px;font-weight:700;cursor:pointer;font-size:0.85rem;transition:background 0.2s;" onmouseover="this.style.background='#1565c0'" onmouseout="this.style.background='#1877f2'">Send</button>
              </form>
            </div>
          </div>
        `;

        // Bind
        document.getElementById('lb-close').onclick = ()=>ov.remove();
        if (images.length>1) {
          document.getElementById('lb-prev').onclick = ()=>{ idx=(idx-1+images.length)%images.length; render(); loadCmts(); };
          document.getElementById('lb-next').onclick = ()=>{ idx=(idx+1)%images.length; render(); loadCmts(); };
        }

        // ESC key
        const escHandler = e => { if(e.key==='Escape') { ov.remove(); document.removeEventListener('keydown',escHandler); } };
        document.addEventListener('keydown', escHandler);

        // Arrow keys
        const arrowHandler = e => {
          if(e.key==='ArrowLeft' && images.length>1) { idx=(idx-1+images.length)%images.length; render(); loadCmts(); }
          if(e.key==='ArrowRight' && images.length>1) { idx=(idx+1)%images.length; render(); loadCmts(); }
        };
        document.addEventListener('keydown', arrowHandler);

        // Like
        const likeBtn = document.getElementById('lb-like-btn');
        likeBtn.onclick = async () => {
          await Post.handleLike(postId);
          const u = await Api.getPost(postId); const up = u.post||u;
          post.likesCount=up.likesCount; post.viewerLiked=up.viewerLiked; post.viewerReaction=up.viewerReaction;
          render(); loadCmts();
        };

        // Reactions
        ov.querySelectorAll('.lb-rxn-btn').forEach(btn=>{
          btn.onclick = async () => {
            await Post.handleReact(postId, btn.dataset.rtype);
            const u = await Api.getPost(postId); const up = u.post||u;
            post.likesCount=up.likesCount; post.viewerLiked=up.viewerLiked; post.viewerReaction=up.viewerReaction;
            render(); loadCmts();
          };
        });

        // Comment focus
        document.getElementById('lb-cmt-btn').onclick = ()=>document.getElementById('lb-cmt-input').focus();

        // Lightbox comment emoji picker bind
        const emojiBtn = document.getElementById('lb-cmt-emoji-btn');
        const cmtPicker = document.getElementById('lb-comment-emoji-picker');
        if (emojiBtn && cmtPicker) {
          emojiBtn.onclick = (e) => {
            e.stopPropagation();
            cmtPicker.style.display = cmtPicker.style.display === 'none' ? 'block' : 'none';
          };
          document.addEventListener('click', (ev) => {
            if (!ev.target.closest('#lb-comment-emoji-picker') && ev.target !== emojiBtn && !emojiBtn.contains(ev.target)) {
              cmtPicker.style.display = 'none';
            }
          });
        }

        // Delegate emoji picker clicks inside lightbox
        ov.onclick = (e) => {
          const target2 = e.target.closest('[data-action]');
          if (!target2) return;
          const action2 = target2.dataset.action;
          if (action2 === 'emoji-tab') {
            e.stopPropagation();
            const cat = target2.dataset.category;
            ov.querySelectorAll('.emoji-picker__tab').forEach(t =>
              t.classList.toggle('emoji-picker__tab--active', t.dataset.category === cat)
            );
            ov.querySelectorAll('.emoji-picker__panel').forEach(p =>
              p.classList.toggle('emoji-picker__panel--hidden', p.dataset.category !== cat)
            );
          }
          if (action2 === 'insert-emoji') {
            e.stopPropagation();
            const emoji = target2.dataset.emoji;
            const input = document.getElementById(target2.dataset.target);
            if (input && emoji) {
              const start = input.selectionStart || 0;
              const end = input.selectionEnd || 0;
              const val = input.value;
              input.value = val.slice(0, start) + emoji + val.slice(end);
              input.focus();
              input.selectionStart = input.selectionEnd = start + emoji.length;
            }
          }
        };

        // Comment submit
        document.getElementById('lb-cmt-form').onsubmit = async e => {
          e.preventDefault();
          const inp = document.getElementById('lb-cmt-input');
          const val = inp.value.trim(); if(!val) return;
          inp.value = '';
          await Post.handleComment(postId, val, null);
          const u = await Api.getPost(postId); const up = u.post||u;
          post.commentsCount = up.commentsCount;
          render(); loadCmts();
        };

        loadCmts();
      };

      const loadCmts = async () => {
        const el = document.getElementById('lb-comments'); if(!el) return;
        el.innerHTML = '<div style="text-align:center;padding:8px;font-size:0.82rem;color:#b0b3b8;">Loading…</div>';
        try {
          const r = await Api.getComments(postId,0,100);
          const cmts = r.comments||r||[];
          if(!cmts.length) { el.innerHTML='<div style="text-align:center;padding:8px;font-size:0.82rem;color:#b0b3b8;">No comments yet.</div>'; return; }
          el.innerHTML = cmts.map(c=>{
            const a=c.author||{}; const ago=window.Utils?.formatTimeAgo?.(c.createdAt)||'';
            return `<div style="display:flex;gap:8px;align-items:flex-start;"><img src="${a.avatar||'/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid #3e4042;"><div><div style="background:#3a3b3c;padding:8px 12px;border-radius:18px;display:inline-block;max-width:240px;word-break:break-word;"><div style="font-weight:700;font-size:0.82rem;color:#e4e6eb;">${esc(a.fullName||a.username)}</div><div style="font-size:0.88rem;color:#ffffff !important;margin-top:2px;">${esc(c.content)}</div></div><div style="font-size:0.72rem;color:#b0b3b8;margin-top:3px;padding-left:6px;">${ago}</div></div></div>`;
          }).join('');
          el.scrollTop = el.scrollHeight;
        } catch { el.innerHTML='<div style="color:#e41e3f;font-size:0.82rem;text-align:center;">Failed to load.</div>'; }
      };

      render();
    } catch { ov.innerHTML='<div style="margin:auto;text-align:center;padding:20px;">Failed to load post.</div>'; }
  },

  // ── Delete Confirmation Modal ────────────────────────────────────────
  showDeleteConfirmationModal(postId) {
    document.getElementById('del-confirm-modal')?.remove();
    const ov = document.createElement('div');
    ov.id = 'del-confirm-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10001;display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = `
      <div style="background:#242526;border:1px solid #3a3b3c;border-radius:12px;padding:28px 24px;width:100%;max-width:380px;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.5);color:#fff;">
        <div style="font-size:3rem;margin-bottom:12px;">🗑️</div>
        <h3 style="margin:0 0 8px;font-weight:700;font-size:1.25rem;color:#ffffff !important;">Delete Post?</h3>
        <p style="margin:0 0 24px;color:#e4e6eb !important;font-size:0.95rem;line-height:1.5;">এই পোস্টটি মুছে ফেলা হবে। এটি পূর্বাবস্থায় ফেরানো সম্ভব নয়।</p>
        <div style="display:flex;gap:10px;">
          <button id="del-cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid #4e4f50;background:#3a3b3c;color:#ffffff;font-weight:600;cursor:pointer;font-size:0.95rem;">Cancel</button>
          <button id="del-confirm" style="flex:1;padding:10px;border-radius:8px;border:none;background:#e41e3f;color:#ffffff;font-weight:700;cursor:pointer;font-size:0.95rem;">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    ov.onclick = e => { if(e.target===ov) ov.remove(); };
    document.getElementById('del-cancel').onclick = ()=>ov.remove();
    document.getElementById('del-confirm').onclick = async ()=>{
      document.getElementById('del-confirm').textContent='Deleting…';
      await Post.handleDeletePost(postId);
      ov.remove();
      document.getElementById('photo-viewer-lightbox')?.remove();
    };
  }

};

// Expose globally
window.Post = Post;
