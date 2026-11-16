/**
 * Chat Module — Direct Messaging
 * Handles conversations, message sending/receiving,
 * typing indicators, auto-reply simulation, and
 * mini chat popups (Facebook Messenger style).
 */
const Chat = {
  activeConversation: null,
  typingTimer: null,

  // Auto-reply pool — realistic conversational responses
  _autoReplies: [
    "Hey! How's it going? 😊",
    "That's really interesting, tell me more!",
    "Haha, I totally agree with you!",
    "I was just thinking about the same thing 🤔",
    "Sounds like a plan! Let's do it 💪",
    "No way! That's amazing!",
    "Oh I see, that makes sense.",
    "Yeah, I've been pretty busy lately too.",
    "Thanks for sharing that! Really appreciate it.",
    "Let me think about it and get back to you 👍",
    "Wow, I didn't know that! Thanks for telling me.",
    "Sorry, I was away for a bit. What did I miss?",
    "Lol, that's hilarious 😂",
    "Sure thing! I'll send it over soon.",
    "Have you seen the latest news? It's wild!",
    "I'm doing great, thanks for asking! How about you?",
    "That sounds awesome! Count me in!",
    "I totally understand what you mean.",
    "Good point! I hadn't thought of it that way.",
    "Miss you! We should hang out soon 🙌",
    "Can't wait! It's going to be so much fun!",
    "Absolutely, I'm on board with that.",
    "Wait, really? 😮 That's unexpected!",
    "I'll check it out and let you know what I think.",
    "You always know the right thing to say 😄"
  ],

  init() {
    // Ensure messages store exists
    const store = window.Store;
    if (store && !store.messages) store.messages = [];
  },

  // ── Render chat page (full page view) ──────────────────────────────
  renderChatPage() {
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!currentUser) return '<div class="empty-state"><p>Please log in to view messages.</p></div>';

    return `
      <div class="chat-page" id="chat-page">
        <div class="chat-sidebar" id="chat-sidebar">
          <div class="chat-sidebar__header">
            <h3>Messages</h3>
            <button class="btn-icon" data-action="new-conversation" title="New message">✏️</button>
          </div>
          <div class="chat-sidebar__search">
            <input type="text" class="chat-search-input" placeholder="Search conversations..."
                   data-action-input="search-conversations" autocomplete="off">
          </div>
          <div class="chat-sidebar__list" id="chat-conversation-list">
            ${this.renderConversationList()}
          </div>
        </div>
        <div class="chat-window" id="chat-window">
          ${this.activeConversation
            ? this.renderChatWindow(this.activeConversation)
            : this._renderEmptyChatWindow()
          }
        </div>
      </div>
    `;
  },

  // ── Render conversation list ───────────────────────────────────────
  renderConversationList(searchQuery) {
    const conversations = this.getConversations();
    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    if (conversations.length === 0) {
      return `
        <div class="chat-empty">
          <p class="chat-empty__text">No conversations yet</p>
          <p class="chat-empty__hint">Start a conversation with someone!</p>
        </div>
      `;
    }

    let filtered = conversations;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = conversations.filter(c => {
        const user = window.Store?.getUserById?.(c.userId);
        return user && (user.fullName.toLowerCase().includes(q) || user.username.toLowerCase().includes(q));
      });
    }

    return filtered.map(conv => {
      const user = window.Store?.getUserById?.(conv.userId);
      if (!user) return '';

      const isActive = this.activeConversation === conv.userId;
      const isOnline = user.isOnline !== false; // default to online for demo
      const lastMsg = conv.lastMessage;
      const timeAgo = lastMsg ? (window.Utils?.timeAgo?.(lastMsg.createdAt) || '') : '';
      const preview = lastMsg
        ? (lastMsg.senderId === window.Auth?.getCurrentUser?.()?.id ? 'You: ' : '') +
          (lastMsg.content || '').substring(0, 40) +
          (lastMsg.content?.length > 40 ? '...' : '')
        : 'Start a conversation';

      return `
        <div class="conversation-item ${isActive ? 'conversation-item--active' : ''} ${conv.unread ? 'conversation-item--unread' : ''}"
             data-action="open-conversation" data-user-id="${user.id}">
          <div class="conversation-item__avatar-wrap">
            <img class="avatar avatar-sm" src="${user.avatar}" alt="${esc(user.fullName)}">
            ${isOnline ? '<span class="online-dot"></span>' : ''}
          </div>
          <div class="conversation-item__info">
            <div class="conversation-item__top">
              <span class="conversation-item__name">${esc(user.fullName)}</span>
              <span class="conversation-item__time">${timeAgo}</span>
            </div>
            <p class="conversation-item__preview">${esc(preview)}</p>
          </div>
          ${conv.unread ? '<span class="conversation-item__badge"></span>' : ''}
        </div>
      `;
    }).join('');
  },

  // ── Render active chat window ──────────────────────────────────────
  renderChatWindow(otherUserId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return '';

    const otherUser = store.getUserById?.(otherUserId);
    if (!otherUser) return this._renderEmptyChatWindow();

    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    const messages = this.getMessages(otherUserId);
    const isOnline = otherUser.isOnline !== false;

    const bubbles = messages.map(msg => {
      const isSent = msg.senderId === currentUser.id;
      return this.renderMessageBubble(msg, isSent);
    }).join('');

    return `
      <div class="chat-window__header">
        <a href="#profile/${otherUser.id}" class="chat-window__user">
          <div class="chat-window__avatar-wrap">
            <img class="avatar avatar-sm" src="${otherUser.avatar}" alt="${esc(otherUser.fullName)}">
            ${isOnline ? '<span class="online-dot"></span>' : ''}
          </div>
          <div class="chat-window__user-info">
            <span class="chat-window__name">${esc(otherUser.fullName)}</span>
            <span class="chat-window__status">${isOnline ? 'Active now' : 'Offline'}</span>
          </div>
        </a>
        <div class="chat-window__header-actions">
          <button class="btn-icon" data-action="start-voice-call" data-user-id="${otherUserId}" title="Voice call">📞</button>
          <button class="btn-icon" data-action="start-video-call" data-user-id="${otherUserId}" title="Video call">📹</button>
        </div>
      </div>
      <div class="chat-window__messages" id="chat-messages">
        ${bubbles || `
          <div class="chat-window__start">
            <img class="avatar avatar-lg" src="${otherUser.avatar}" alt="">
            <h4>${esc(otherUser.fullName)}</h4>
            <p>Start a conversation with ${esc(otherUser.firstName || otherUser.fullName?.split(' ')[0] || 'this person')}</p>
          </div>
        `}
      </div>
      <div class="chat-typing" id="chat-typing" style="display:none;">
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
        <span class="typing-text">${esc(otherUser.firstName || otherUser.fullName?.split(' ')[0] || '')} is typing...</span>
      </div>
      <div class="chat-window__input">
        <button class="btn-icon" data-action="toggle-chat-emoji" title="Emoji">😊</button>
        <label class="btn-icon chat-attach-btn" title="Attach image">
          📎
          <input type="file" accept="image/*,video/*" class="chat-file-input" id="chat-file-input" style="display:none;" data-action="attach-media" data-receiver-id="${otherUserId}">
        </label>
        <button class="btn-icon chat-voice-btn" data-action="record-voice" data-receiver-id="${otherUserId}" title="Voice message">🎙️</button>
        <form class="chat-input-form" data-action="send-message" data-receiver-id="${otherUserId}">
          <input type="text" class="chat-input" id="chat-input"
                 placeholder="Type a message..." autocomplete="off">
          <button type="submit" class="btn-icon chat-send-btn" title="Send">
            <span class="chat-send-icon">➤</span>
          </button>
        </form>
      </div>

      <!-- Voice Call Modal -->
      <div class="call-modal-overlay" id="voice-call-modal" style="display:none;">
        <div class="call-modal call-modal--voice">
          <div class="call-modal__avatar-wrap">
            <img class="call-modal__avatar" src="${otherUser.avatar}" alt="${esc(otherUser.fullName)}">
            <div class="call-modal__pulse"></div>
          </div>
          <h3 class="call-modal__name">${esc(otherUser.fullName)}</h3>
          <p class="call-modal__status" id="voice-call-status">Calling...</p>
          <div class="call-modal__actions">
            <button class="call-btn call-btn--mute" data-action="mute-call" title="Mute">🎤</button>
            <button class="call-btn call-btn--end" data-action="end-call" data-modal="voice-call-modal" title="End call">📵</button>
            <button class="call-btn call-btn--speaker" data-action="toggle-speaker" title="Speaker">🔊</button>
          </div>
        </div>
      </div>

      <!-- Video Call Modal -->
      <div class="call-modal-overlay" id="video-call-modal" style="display:none;">
        <div class="call-modal call-modal--video">
          <div class="call-modal__video-area">
            <div class="call-modal__remote-video">
              <img class="call-modal__avatar call-modal__avatar--video" src="${otherUser.avatar}" alt="${esc(otherUser.fullName)}">
              <p class="call-modal__status" id="video-call-status">Connecting...</p>
            </div>
            <div class="call-modal__self-video">
              <span>You</span>
            </div>
          </div>
          <h3 class="call-modal__name">${esc(otherUser.fullName)}</h3>
          <div class="call-modal__actions">
            <button class="call-btn call-btn--mute" data-action="mute-call" title="Mute">🎤</button>
            <button class="call-btn call-btn--cam" data-action="toggle-cam" title="Camera">📷</button>
            <button class="call-btn call-btn--end" data-action="end-call" data-modal="video-call-modal" title="End call">📵</button>
          </div>
        </div>
      </div>
    `;
  },

  // ── Render a single message bubble ─────────────────────────────────
  renderMessageBubble(message, isSent) {
    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    const time = window.Utils?.formatTime?.(message.createdAt) || this._formatTime(message.createdAt);

    return `
      <div class="message-bubble ${isSent ? 'message-bubble--sent' : 'message-bubble--received'}">
        <div class="message-bubble__content">
          <p class="message-bubble__text">${esc(message.content)}</p>
        </div>
        <span class="message-bubble__time">${time}</span>
      </div>
    `;
  },

  // ── Send a message ─────────────────────────────────────────────────
  sendMessage(receiverId, content) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser || !content?.trim()) return null;

    if (!store.messages) store.messages = [];

    const message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      senderId: currentUser.id,
      receiverId: receiverId,
      content: content.trim(),
      read: false,
      createdAt: new Date().toISOString()
    };

    store.messages.push(message);

    // Append bubble to chat
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
      messagesContainer.insertAdjacentHTML('beforeend', this.renderMessageBubble(message, true));
      this._scrollToBottom(messagesContainer);
    }

    // Update conversation list
    this._refreshConversationList();

    // Create notification for receiver
    if (typeof Notifications !== 'undefined') {
      Notifications.createNotification('message', {
        fromUserId: currentUser.id,
        targetUserId: receiverId,
        messagePreview: content.trim().substring(0, 50)
      });
    }

    // Simulate auto-reply
    this.simulateReply(receiverId);

    return message;
  },

  // ── Get conversations ──────────────────────────────────────────────
  getConversations() {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return [];

    const messages = store.messages || [];
    const userMessages = messages.filter(m =>
      m.senderId === currentUser.id || m.receiverId === currentUser.id
    );

    // Group by other user
    const convMap = new Map();
    userMessages.forEach(msg => {
      const otherUserId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;
      if (!convMap.has(otherUserId) || new Date(msg.createdAt) > new Date(convMap.get(otherUserId).lastMessage.createdAt)) {
        const existing = convMap.get(otherUserId);
        convMap.set(otherUserId, {
          userId: otherUserId,
          lastMessage: msg,
          unread: existing?.unread || (msg.receiverId === currentUser.id && !msg.read)
        });
      }
    });

    // Sort by most recent message
    return Array.from(convMap.values())
      .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  },

  // ── Get messages between current user and another user ─────────────
  getMessages(otherUserId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return [];

    return (store.messages || [])
      .filter(m =>
        (m.senderId === currentUser.id && m.receiverId === otherUserId) ||
        (m.senderId === otherUserId && m.receiverId === currentUser.id)
      )
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  // ── Mark messages as read ──────────────────────────────────────────
  markAsRead(otherUserId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return;

    (store.messages || []).forEach(m => {
      if (m.senderId === otherUserId && m.receiverId === currentUser.id) {
        m.read = true;
      }
    });
  },

  // ── Simulate received message (auto-reply after delay) ─────────────
  simulateReply(otherUserId) {
    // Random delay: 2–4 seconds for typing indicator, then 1–2 more for message
    const typingDelay = 2000 + Math.random() * 2000;
    const messageDelay = typingDelay + 1000 + Math.random() * 1000;

    // Show typing indicator
    setTimeout(() => {
      if (this.activeConversation === otherUserId) {
        this.showTypingIndicator();
      }
    }, typingDelay);

    // Send the reply
    setTimeout(() => {
      this.hideTypingIndicator();

      const store = window.Store;
      if (!store) return;
      if (!store.messages) store.messages = [];

      const currentUser = window.Auth?.getCurrentUser?.();
      if (!currentUser) return;

      const reply = this._autoReplies[Math.floor(Math.random() * this._autoReplies.length)];

      const message = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        senderId: otherUserId,
        receiverId: currentUser.id,
        content: reply,
        read: this.activeConversation === otherUserId,
        createdAt: new Date().toISOString()
      };

      store.messages.push(message);

      // If this conversation is active, append the bubble
      if (this.activeConversation === otherUserId) {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
          messagesContainer.insertAdjacentHTML('beforeend', this.renderMessageBubble(message, false));
          this._scrollToBottom(messagesContainer);
        }
      }

      // Update conversation list
      this._refreshConversationList();

      // Show toast notification if conversation is not active
      if (this.activeConversation !== otherUserId && typeof Notifications !== 'undefined') {
        const sender = store.getUserById?.(otherUserId);
        Notifications.showToastNotification({
          type: 'message',
          message: `${sender?.fullName || 'Someone'}: ${reply.substring(0, 40)}`,
          icon: '💬'
        });
      }
    }, messageDelay);
  },

  // ── Typing indicator ──────────────────────────────────────────────
  showTypingIndicator() {
    const el = document.getElementById('chat-typing');
    if (el) el.style.display = 'flex';
  },

  hideTypingIndicator() {
    const el = document.getElementById('chat-typing');
    if (el) el.style.display = 'none';
  },

  // ── Start new conversation ─────────────────────────────────────────
  startConversation(userId) {
    this.activeConversation = userId;
    this.markAsRead(userId);

    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
      chatWindow.innerHTML = this.renderChatWindow(userId);
      this._scrollToBottom(document.getElementById('chat-messages'));
    }

    this._refreshConversationList();

    // Focus input
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    }, 100);
  },

  // ── Render mini chat popup (bottom-right, Facebook-style) ──────────
  renderMiniChat(userId) {
    const store = window.Store;
    const currentUser = window.Auth?.getCurrentUser?.();
    if (!store || !currentUser) return;

    const user = store.getUserById?.(userId);
    if (!user) return;

    const esc = str => window.Utils?.escapeHtml?.(str) || str;

    // Remove existing mini chats for this user
    const existing = document.getElementById(`mini-chat-${userId}`);
    if (existing) {
      existing.remove();
      return;
    }

    const messages = this.getMessages(userId);
    const bubbles = messages.slice(-20).map(msg => {
      const isSent = msg.senderId === currentUser.id;
      return this.renderMessageBubble(msg, isSent);
    }).join('');

    const miniChat = document.createElement('div');
    miniChat.className = 'mini-chat';
    miniChat.id = `mini-chat-${userId}`;
    miniChat.innerHTML = `
      <div class="mini-chat__header" data-action="toggle-mini-chat" data-user-id="${userId}">
        <div class="mini-chat__user">
          <img class="avatar avatar-xs" src="${user.avatar}" alt="">
          <span class="mini-chat__name">${esc(user.fullName)}</span>
          <span class="online-dot online-dot--sm"></span>
        </div>
        <div class="mini-chat__controls">
          <button class="btn-icon btn-icon--sm" data-action="minimize-mini-chat" data-user-id="${userId}">—</button>
          <button class="btn-icon btn-icon--sm" data-action="close-mini-chat" data-user-id="${userId}">&times;</button>
        </div>
      </div>
      <div class="mini-chat__messages" id="mini-chat-messages-${userId}">
        ${bubbles}
      </div>
      <div class="mini-chat__input">
        <form data-action="send-mini-message" data-receiver-id="${userId}">
          <input type="text" class="mini-chat__field" placeholder="Aa" autocomplete="off">
          <button type="submit" class="btn-icon btn-icon--sm">➤</button>
        </form>
      </div>
    `;

    document.body.appendChild(miniChat);

    // Scroll to bottom
    const msgContainer = document.getElementById(`mini-chat-messages-${userId}`);
    if (msgContainer) this._scrollToBottom(msgContainer);
  },

  // ── Private helpers ────────────────────────────────────────────────
  _renderEmptyChatWindow() {
    return `
      <div class="chat-window__empty">
        <div class="chat-window__empty-icon">💬</div>
        <h3>Your Messages</h3>
        <p>Select a conversation or start a new one</p>
      </div>
    `;
  },

  _scrollToBottom(container) {
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  },

  _refreshConversationList() {
    const listEl = document.getElementById('chat-conversation-list');
    if (listEl) {
      listEl.innerHTML = this.renderConversationList();
    }
  },

  _formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  },

  // ── Global event delegation handler ────────────────────────────────
  handleEvent(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;

    if (action === 'open-conversation') {
      const userId = target.dataset.userId;
      if (userId) {
        this.startConversation(userId);
      }
      return true;
    }

    if (action === 'send-message') {
      e.preventDefault();
      const form = target.closest('form') || target;
      const input = form.querySelector('.chat-input');
      const receiverId = form.dataset.receiverId;
      if (input && receiverId && input.value.trim()) {
        this.sendMessage(receiverId, input.value.trim());
        input.value = '';
        input.focus();
      }
      return true;
    }

    if (action === 'send-mini-message') {
      e.preventDefault();
      const form = target.closest('form') || target;
      const input = form.querySelector('.mini-chat__field');
      const receiverId = form.dataset.receiverId;
      if (input && receiverId && input.value.trim()) {
        this.sendMessage(receiverId, input.value.trim());
        input.value = '';
      }
      return true;
    }

    if (action === 'close-mini-chat') {
      const userId = target.dataset.userId;
      const el = document.getElementById(`mini-chat-${userId}`);
      if (el) el.remove();
      return true;
    }

    if (action === 'minimize-mini-chat') {
      const userId = target.dataset.userId;
      const el = document.getElementById(`mini-chat-${userId}`);
      if (el) el.classList.toggle('mini-chat--minimized');
      return true;
    }

    if (action === 'new-conversation') {
      // Show a simple user picker (could be enhanced with a modal)
      const store = window.Store;
      const currentUser = window.Auth?.getCurrentUser?.();
      if (!store || !currentUser) return true;

      const users = (store.users || store.getAllUsers?.() || [])
        .filter(u => u.id !== currentUser.id);

      if (users.length > 0) {
        // For now, open with the first user not in existing conversations
        const existingConvos = this.getConversations().map(c => c.userId);
        const newUser = users.find(u => !existingConvos.includes(u.id)) || users[0];
        this.startConversation(newUser.id);
      }
      return true;
    }

    if (action === 'toggle-chat-emoji') {
      // Placeholder for emoji picker in chat
      return true;
    }

    if (action === 'start-voice-call') {
      const modal = document.getElementById('voice-call-modal');
      if (modal) {
        modal.style.display = 'flex';
        // Simulate call connecting
        setTimeout(() => {
          const status = document.getElementById('voice-call-status');
          if (status) status.textContent = 'Ringing...';
          setTimeout(() => {
            if (status && document.getElementById('voice-call-modal').style.display !== 'none') {
              status.textContent = 'Connected · 00:00';
            }
          }, 2000);
        }, 1500);
      }
      return true;
    }

    if (action === 'start-video-call') {
      const modal = document.getElementById('video-call-modal');
      if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
          const status = document.getElementById('video-call-status');
          if (status) status.textContent = 'Connected · 00:00';
        }, 2000);
      }
      return true;
    }

    if (action === 'end-call') {
      const modalId = target.dataset.modal;
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
        const statusEl = modal.querySelector('.call-modal__status');
        if (statusEl) statusEl.textContent = 'Calling...';
      }
      return true;
    }

    if (action === 'mute-call') {
      target.classList.toggle('call-btn--active');
      target.textContent = target.classList.contains('call-btn--active') ? '🔇' : '🎤';
      return true;
    }

    if (action === 'toggle-speaker') {
      target.classList.toggle('call-btn--active');
      return true;
    }

    if (action === 'toggle-cam') {
      target.classList.toggle('call-btn--active');
      target.textContent = target.classList.contains('call-btn--active') ? '📷' : '📵';
      return true;
    }

    if (action === 'record-voice') {
      const btn = target;
      if (btn.dataset.recording === 'true') {
        // Stop recording
        btn.dataset.recording = 'false';
        btn.style.color = '';
        btn.title = 'Voice message';
        if (typeof Utils !== 'undefined') Utils.showToast('Voice message sent!', 'success');
      } else {
        // Start recording
        btn.dataset.recording = 'true';
        btn.style.color = 'var(--color-accent, #ef4444)';
        btn.title = 'Tap again to send';
        if (typeof Utils !== 'undefined') Utils.showToast('Recording... tap mic again to send', 'info');
      }
      return true;
    }

    if (action === 'attach-media') {
      const input = target;
      const file = input.files?.[0];
      if (!file) return true;
      const receiverId = input.dataset.receiverId;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const messagesEl = document.getElementById('chat-messages');
        if (messagesEl) {
          const isImage = file.type.startsWith('image/');
          const bubble = document.createElement('div');
          bubble.className = 'message-bubble message-bubble--sent';
          bubble.innerHTML = `
            <div class="message-bubble__content">
              ${isImage
                ? `<img src="${evt.target.result}" class="message-media-preview" alt="Sent image" style="max-width:240px;border-radius:12px;">`
                : `<video src="${evt.target.result}" controls class="message-media-preview" style="max-width:240px;border-radius:12px;"></video>`
              }
            </div>
            <span class="message-bubble__time">Now</span>
          `;
          messagesEl.appendChild(bubble);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        input.value = '';
      };
      reader.readAsDataURL(file);
      return true;
    }

    return false;
  }
};

// Expose globally
window.Chat = Chat;
