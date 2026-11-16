const App = {
  init() {
    // Initialize data store
    window.Store.init();
    
    // Initialize modules
    window.Auth.init();
    if(window.Social) window.Social.init();
    if(window.Feed) window.Feed.init();
    if(window.Post) window.Post.init();
    if(window.Chat) window.Chat.init();
    if(window.Notifications) window.Notifications.init();
    if(window.Search) window.Search.init();
    if(window.Profile) window.Profile.init();

    this.setupRouter();
    this.setupThemeToggle();
    this.setupGlobalListeners();
    this.setupAuthListeners();
    
    // Check auth status and route
    if (!window.Auth.isLoggedIn()) {
      const allowedUnauthHashes = [
        '#login', '#email-login', '#signup', '#confirm-account',
        '#forgot-password', '#choose-login-method', '#verify-reset-code', '#new-password'
      ];
      const h = window.location.hash;
      if (allowedUnauthHashes.includes(h)) {
        this.route();
      } else {
        window.location.hash = '#login';
      }
    } else {
      if (!window.location.hash || window.location.hash === '#login' || window.location.hash === '#signup') {
        window.location.hash = '#feed';
      } else {
        this.route();
      }
    }
  },

  setupRouter() {
    window.addEventListener('hashchange', () => this.route());
  },

  async route() {
    const hash = window.location.hash.substring(1) || 'feed';
    const parts = hash.split('/');
    const page = parts[0];
    const id = parts[1];

    const allowedUnauthPages = [
      'login', 'email-login', 'signup', 'confirm-account',
      'forgot-password', 'choose-login-method', 'verify-reset-code', 'new-password'
    ];

    if (!window.Auth.isLoggedIn() && !allowedUnauthPages.includes(page)) {
      window.location.hash = '#login';
      return;
    }

    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;
    
    // Set active nav link
    document.querySelectorAll('.header__nav-item').forEach(link => link.classList.remove('active'));
    const activeLink = document.querySelector(`.header__nav-item[href="#${page}"]`);
    if(activeLink) activeLink.classList.add('active');

    // Set active sidebar link
    document.querySelectorAll('.sidebar-left__item').forEach(link => link.classList.remove('active'));
    const activeSidebarLink = document.querySelector(`.sidebar-left__item[href="#${page}"]`);
    if(activeSidebarLink) activeSidebarLink.classList.add('active');

    // Set active mobile nav link
    document.querySelectorAll('.mobile-nav__item').forEach(link => link.classList.remove('active'));
    const activeMobileLink = document.querySelector(`.mobile-nav__item[href="#${page}"]`);
    if(activeMobileLink) activeMobileLink.classList.add('active');

    // Remove page specific classes from body
    document.body.removeAttribute('data-page');

    window.scrollTo(0, 0);

    switch(page) {
      case 'login':
        window.Auth.showLoginPage(false);
        break;
      case 'email-login':
        window.Auth.showLoginPage(true);
        break;
      case 'signup':
        window.Auth.showSignupPage();
        break;
      case 'confirm-account':
        const tempEmail = sessionStorage.getItem('hb_temp_signup_email');
        if (tempEmail) {
          window.Auth.showConfirmAccountPage(tempEmail);
        } else {
          window.location.hash = '#signup';
        }
        break;
      case 'forgot-password':
        window.Auth.showForgotPasswordPage();
        break;
      case 'choose-login-method':
        window.Auth.showChooseLoginMethodPage();
        break;
      case 'verify-reset-code':
        window.Auth.showVerifyResetCodePage();
        break;
      case 'new-password':
        window.Auth.showNewPasswordPage();
        break;
      case 'feed':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = window.Feed.renderFeedPage();
        window.Feed.setupInfiniteScroll();
        break;
      case 'reels':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = await window.Reels.renderReelsPage();
        break;
      case 'friends':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = await window.Friends.renderFriendsPage();
        await window.Friends.loadTab('requests');
        break;
      case 'profile':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        const userId = id || window.Auth.getCurrentUser().id;
        // Show a loading skeleton while profile loads
        document.getElementById('main-content').innerHTML = `
          <div style="padding:var(--space-4);">
            <div class="skeleton-card card" style="height:300px; margin-bottom:var(--space-4); border-radius:var(--radius-xl);"></div>
            <div class="skeleton-card card"><div class="skeleton-card__body">
              <div class="skeleton skeleton--line skeleton--w100"></div>
              <div class="skeleton skeleton--line skeleton--w80"></div>
            </div></div>
          </div>`;
        window.Profile.renderProfilePage(userId).then(html => {
          const mc = document.getElementById('main-content');
          if (mc) mc.innerHTML = html;
          // Load friend status for other profiles
          if (window.Profile.loadProfileFriendStatus && userId !== window.Auth.getCurrentUser().id) {
            window.Profile.loadProfileFriendStatus(userId);
          }
        });
        break;
      case 'chat':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.body.setAttribute('data-page', 'chat');
        document.getElementById('main-content').innerHTML = window.Chat.renderChatPage(id);
        break;
      case 'notifications':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = window.Notifications.renderNotificationsPage();
        window.Notifications.markAllAsRead();
        break;
      case 'search':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        const query = new URLSearchParams(window.location.search).get('q') || '';
        document.getElementById('main-content').innerHTML = window.Search.renderSearchResults(query);
        break;
      case 'explore':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = window.Search.renderExplorePage();
        break;
      case 'settings':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = this.renderSettingsPage();
        this.setupSettingsListeners();
        break;
      case 'saved':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = `<div style="padding:var(--space-4);"><div class="card" style="padding:var(--space-6); text-align:center;"><i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem; color:var(--color-primary);"></i></div></div>`;
        window.Saved.renderSavedPage().then(html => {
          const mc = document.getElementById('main-content');
          if (mc) mc.innerHTML = html;
        });
        break;
      case 'post':
        if(!window.Auth.isLoggedIn()) return;
        this.renderAppShell();
        document.getElementById('main-content').innerHTML = `<div style="padding:var(--space-4);"><div class="card" style="padding:var(--space-6); text-align:center;"><i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem; color:var(--color-primary);"></i> Loading post...</div></div>`;
        try {
          const postRes = await Api.getPost(id);
          if (postRes && postRes.post) {
            document.getElementById('main-content').innerHTML = `
              <div style="max-width:680px; margin:20px auto; padding:0 16px;">
                <div style="margin-bottom:12px;">
                  <a href="#feed" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;">
                    <i class="fas fa-arrow-left"></i> Back to Feed
                  </a>
                </div>
                ${window.Post.renderPostCard(postRes.post)}
              </div>
            `;
          } else {
            document.getElementById('main-content').innerHTML = `<div style="padding:var(--space-4); text-align:center; color:var(--text-secondary);">Post not found or deleted.</div>`;
          }
        } catch (e) {
          document.getElementById('main-content').innerHTML = `<div style="padding:var(--space-4); text-align:center; color:var(--text-secondary);">Failed to load post.</div>`;
        }
        break;
    }
    
    // Reload sidebar data if logged in and sidebar container exists
    if (window.Social && document.getElementById('right-sidebar-container')) {
      window.Social.loadRightSidebar();
    }
  },

  _renderContactsList(dbUser) {
    if (!dbUser.emails) {
      dbUser.emails = dbUser.email ? [{ value: dbUser.email, status: 'active' }] : [];
      window.Store.update('users', dbUser.id, { emails: dbUser.emails });
    }
    if (!dbUser.phones) {
      dbUser.phones = dbUser.phone ? [{ value: dbUser.phone, status: 'active' }] : [];
      window.Store.update('users', dbUser.id, { phones: dbUser.phones });
    }

    let html = '';
    
    // Render emails
    dbUser.emails.forEach((e) => {
      const isPending = e.status === 'pending';
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-button); padding:8px 12px; border-radius:8px;">
          <div>
            <span style="font-weight:600; color:var(--text-primary); font-size:14px;">${e.value}</span>
            <span style="margin-left:8px; font-size:11px; padding:2px 6px; border-radius:12px; font-weight:700; ${isPending ? 'background:#fff3f5; color:#f02849;' : 'background:#e8f4fd; color:#1877f2;'}">${isPending ? 'Pending' : 'Active'}</span>
          </div>
          <div style="display:flex; gap:6px;">
            ${isPending ? `<button class="auth-btn" data-action="verify-contact-btn" data-type="email" data-val="${e.value}" style="width:auto; font-size:12px; padding:4px 10px; background:#1877f2; color:#fff; border:none; border-radius:4px; cursor:pointer;">Verify</button>` : ''}
            <button class="auth-btn" data-action="remove-contact-btn" data-type="email" data-val="${e.value}" style="width:auto; font-size:12px; padding:4px 10px; background:#f02849; color:#fff; border:none; border-radius:4px; cursor:pointer;">Remove</button>
          </div>
        </div>
      `;
    });

    // Render phones
    dbUser.phones.forEach((p) => {
      const isPending = p.status === 'pending';
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-button); padding:8px 12px; border-radius:8px;">
          <div>
            <span style="font-weight:600; color:var(--text-primary); font-size:14px;">${p.value}</span>
            <span style="margin-left:8px; font-size:11px; padding:2px 6px; border-radius:12px; font-weight:700; ${isPending ? 'background:#fff3f5; color:#f02849;' : 'background:#e8f4fd; color:#1877f2;'}">${isPending ? 'Pending' : 'Active'}</span>
          </div>
          <div style="display:flex; gap:6px;">
            ${isPending ? `<button class="auth-btn" data-action="verify-contact-btn" data-type="phone" data-val="${p.value}" style="width:auto; font-size:12px; padding:4px 10px; background:#1877f2; color:#fff; border:none; border-radius:4px; cursor:pointer;">Verify</button>` : ''}
            <button class="auth-btn" data-action="remove-contact-btn" data-type="phone" data-val="${p.value}" style="width:auto; font-size:12px; padding:4px 10px; background:#f02849; color:#fff; border:none; border-radius:4px; cursor:pointer;">Remove</button>
          </div>
        </div>
      `;
    });

    if (html === '') {
      return `<div style="font-size:13px; color:var(--text-secondary); font-style:italic;">No contact methods added.</div>`;
    }

    return html;
  },

  renderSettingsPage() {
    const user = window.Auth.getCurrentUser();
    const users = window.Store.getAll('users');
    const dbUser = users.find(u => u.id === user.id);
    if (!dbUser) return '';

    // Initialize lists if not exist
    if (!dbUser.emails) {
      dbUser.emails = dbUser.email ? [{ value: dbUser.email, status: 'active' }] : [];
      window.Store.update('users', dbUser.id, { emails: dbUser.emails });
    }
    if (!dbUser.phones) {
      dbUser.phones = dbUser.phone ? [{ value: dbUser.phone, status: 'active' }] : [];
      window.Store.update('users', dbUser.id, { phones: dbUser.phones });
    }

    const contactsHtml = this._renderContactsList(dbUser);

    return `
      <div class="settings-page" style="max-width:680px;margin:0 auto;padding:24px 16px;">
        <h1 style="font-size:1.4rem;font-weight:700;margin-bottom:24px;color:var(--text-primary);">Settings</h1>

        <!-- Security & Privacy -->
        <div class="settings-card" style="background:var(--bg-card);border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:var(--shadow-sm);">
          <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px;color:var(--text-primary);"><i class="fas fa-lock" style="color:#1877f2;margin-right:8px;"></i>Security & Privacy</h2>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">Manage your password and account security.</p>

          <div style="margin-bottom:16px;">
            <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:8px;color:var(--text-primary);">Change Password</h3>
            <div class="auth-input-group" style="margin-bottom:8px;">
              <input type="password" id="settings-current-pw" class="auth-input" placeholder="Current password">
              <button type="button" class="toggle-password"><i class="fas fa-eye"></i></button>
            </div>
            <div class="auth-input-group" style="margin-bottom:8px;">
              <input type="password" id="settings-new-pw" class="auth-input" placeholder="New password">
              <button type="button" class="toggle-password"><i class="fas fa-eye"></i></button>
            </div>
            <div class="auth-input-group" style="margin-bottom:12px;">
              <input type="password" id="settings-confirm-pw" class="auth-input" placeholder="Confirm new password">
              <button type="button" class="toggle-password"><i class="fas fa-eye"></i></button>
            </div>
            <button id="settings-change-pw-btn" class="auth-btn auth-btn--primary" style="width:auto;padding:10px 24px;">Save Password</button>
          </div>

          <hr style="border:none;border-top:1px solid var(--border-color);margin:16px 0;">

          <div>
            <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:4px;color:var(--text-primary);">Forgot your password?</h3>
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:8px;">Reset your password by receiving a code to your email.</p>
            <button class="auth-btn auth-btn--outline" data-action="forgot-password" style="width:auto;padding:10px 24px;">Send Reset Code</button>
          </div>
        </div>

        <!-- Contact Information -->
        <div class="settings-card" style="background:var(--bg-card);border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:var(--shadow-sm);">
          <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px;color:var(--text-primary);"><i class="fas fa-address-book" style="color:#1877f2;margin-right:8px;"></i>Contact Information</h2>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">Manage your emails and mobile numbers for logging in and account recovery.</p>

          <!-- List of current contacts -->
          <div style="margin-bottom:20px;">
            <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:8px;color:var(--text-primary);">Your Emails & Mobile Numbers</h3>
            <div id="settings-contacts-list" style="display:flex; flex-direction:column; gap:8px;">
              ${contactsHtml}
            </div>
          </div>

          <!-- Add new contact form -->
          <div style="border-top:1px solid var(--border-color); padding-top:16px;">
            <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:8px;color:var(--text-primary);">Add Email or Mobile Number</h3>
            <div style="display:flex; gap:10px; margin-bottom:8px;">
              <input type="text" id="settings-new-contact-val" class="auth-input" placeholder="Email address or mobile number" style="flex:1;">
              <button id="settings-add-contact-btn" class="auth-btn auth-btn--primary" style="width:auto; padding:10px 20px;">Add</button>
            </div>
          </div>
          
          <!-- Confirm contact Modal simulation area -->
          <div id="settings-confirm-contact-area" style="display:none; border:1px solid #1877f2; border-radius:8px; padding:16px; margin-top:16px; background:rgba(24,119,242,0.05);">
            <h4 style="font-size:0.9rem; font-weight:600; margin-bottom:8px; color:var(--text-primary);">Confirm Contact Method</h4>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;" id="settings-confirm-contact-desc"></p>
            <div style="display:flex; gap:10px;">
              <input type="text" id="settings-confirm-contact-code" class="auth-input" placeholder="Enter 6-digit code" style="flex:1;">
              <button id="settings-confirm-contact-btn" class="auth-btn auth-btn--primary" style="width:auto; padding:10px 20px;">Confirm</button>
              <button id="settings-cancel-confirm-btn" class="auth-btn auth-btn--outline" style="width:auto; padding:10px 20px;">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="settings-card" style="background:var(--bg-card);border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:var(--shadow-sm);border:1px solid #ffb3b3;">
          <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px;color:#c0392b;"><i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>Danger Zone</h2>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">Permanently delete your account. This action cannot be undone.</p>
          <button id="settings-delete-account-btn" class="auth-btn" style="background:#e74c3c;color:#fff;width:auto;padding:10px 24px;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Delete My Account</button>
        </div>
      </div>
    `;
  },

  setupSettingsListeners() {
    // Toggle password visibility (reuse auth.js toggle-password class)
    // Change password
    const changePwBtn = document.getElementById('settings-change-pw-btn');
    if (changePwBtn) {
      changePwBtn.addEventListener('click', () => {
        const user = window.Auth.getCurrentUser();
        if (!user) return;
        const currentPw = document.getElementById('settings-current-pw').value;
        const newPw = document.getElementById('settings-new-pw').value;
        const confirmPw = document.getElementById('settings-confirm-pw').value;
        if (!currentPw) { window.Utils.showToast('Enter your current password', 'error'); return; }
        const users = window.Store.getAll('users');
        const dbUser = users.find(u => u.id === user.id);
        if (!dbUser || dbUser.password !== window.Utils.hashPassword(currentPw)) {
          window.Utils.showToast('Current password is incorrect', 'error'); return;
        }
        if (!newPw || newPw.length < 6) { window.Utils.showToast('New password must be at least 6 characters', 'error'); return; }
        if (newPw !== confirmPw) { window.Utils.showToast('Passwords do not match', 'error'); return; }
        window.Store.update('users', user.id, { password: window.Utils.hashPassword(newPw) });
        document.getElementById('settings-current-pw').value = '';
        document.getElementById('settings-new-pw').value = '';
        document.getElementById('settings-confirm-pw').value = '';
        window.Utils.showToast('Password changed successfully!', 'success');
      });
    }

    // Contact Information listeners
    const addContactBtn = document.getElementById('settings-add-contact-btn');
    if (addContactBtn) {
      addContactBtn.addEventListener('click', () => {
        const contactValInput = document.getElementById('settings-new-contact-val');
        if (!contactValInput) return;
        const val = contactValInput.value.trim();
        if (!val) {
          window.Utils.showToast("Please enter an email or mobile number", "error");
          return;
        }

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        const isPhone = /^\+?[0-9\s-]{8,15}$/.test(val);

        if (!isEmail && !isPhone) {
          window.Utils.showToast("Please enter a valid email or mobile number", "error");
          return;
        }

        const user = window.Auth.getCurrentUser();
        const users = window.Store.getAll('users');
        const dbUser = users.find(u => u.id === user.id);
        if (!dbUser) return;

        if (!dbUser.emails) dbUser.emails = dbUser.email ? [{ value: dbUser.email, status: 'active' }] : [];
        if (!dbUser.phones) dbUser.phones = dbUser.phone ? [{ value: dbUser.phone, status: 'active' }] : [];

        const emailExists = dbUser.emails.some(e => e.value.toLowerCase() === val.toLowerCase());
        const phoneExists = dbUser.phones.some(p => p.value === val);

        if (emailExists || phoneExists) {
          window.Utils.showToast("This contact method is already added to your account.", "error");
          return;
        }

        // Add as pending
        if (isEmail) {
          dbUser.emails.push({ value: val.toLowerCase(), status: 'pending' });
        } else {
          dbUser.phones.push({ value: val, status: 'pending' });
        }

        window.Store.update('users', dbUser.id, { emails: dbUser.emails, phones: dbUser.phones });
        window.Utils.showToast("Pending contact method added.", "success");
        
        contactValInput.value = '';
        document.getElementById('settings-contacts-list').innerHTML = this._renderContactsList(dbUser);

        // Simulate code generation
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        sessionStorage.setItem('settings_pending_val', val);
        sessionStorage.setItem('settings_pending_code', code);
        sessionStorage.setItem('settings_pending_type', isEmail ? 'email' : 'phone');

        const confirmArea = document.getElementById('settings-confirm-contact-area');
        const confirmDesc = document.getElementById('settings-confirm-contact-desc');
        if (confirmArea && confirmDesc) {
          confirmArea.style.display = 'block';
          confirmDesc.innerHTML = `Enter the 6-digit confirmation code sent to <strong>${val}</strong> (Simulated Code: <strong>${code}</strong>)`;
        }
      });
    }

    const confirmBtn = document.getElementById('settings-confirm-contact-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const codeInput = document.getElementById('settings-confirm-contact-code');
        if (!codeInput) return;
        const enteredCode = codeInput.value.trim();
        const storedCode = sessionStorage.getItem('settings_pending_code');
        const pendingVal = sessionStorage.getItem('settings_pending_val');
        const pendingType = sessionStorage.getItem('settings_pending_type');

        if (!enteredCode || enteredCode !== storedCode) {
          window.Utils.showToast("Incorrect code. Please try again.", "error");
          return;
        }

        const user = window.Auth.getCurrentUser();
        const users = window.Store.getAll('users');
        const dbUser = users.find(u => u.id === user.id);
        if (!dbUser) return;

        if (pendingType === 'email') {
          const contact = dbUser.emails.find(e => e.value === pendingVal);
          if (contact) contact.status = 'active';
          if (!dbUser.email) dbUser.email = pendingVal;
        } else {
          const contact = dbUser.phones.find(p => p.value === pendingVal);
          if (contact) contact.status = 'active';
          if (!dbUser.phone) dbUser.phone = pendingVal;
        }

        window.Store.update('users', dbUser.id, { 
          emails: dbUser.emails, 
          phones: dbUser.phones,
          email: dbUser.email,
          phone: dbUser.phone
        });

        window.Utils.showToast("Contact method confirmed and activated!", "success");

        sessionStorage.removeItem('settings_pending_val');
        sessionStorage.removeItem('settings_pending_code');
        sessionStorage.removeItem('settings_pending_type');
        
        document.getElementById('settings-confirm-contact-area').style.display = 'none';
        codeInput.value = '';

        document.getElementById('settings-contacts-list').innerHTML = this._renderContactsList(dbUser);
      });
    }

    const cancelConfirmBtn = document.getElementById('settings-cancel-confirm-btn');
    if (cancelConfirmBtn) {
      cancelConfirmBtn.addEventListener('click', () => {
        sessionStorage.removeItem('settings_pending_val');
        sessionStorage.removeItem('settings_pending_code');
        sessionStorage.removeItem('settings_pending_type');
        document.getElementById('settings-confirm-contact-area').style.display = 'none';
        document.getElementById('settings-confirm-contact-code').value = '';
      });
    }

    const contactsList = document.getElementById('settings-contacts-list');
    if (contactsList) {
      contactsList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        const type = btn.dataset.type;
        const val = btn.dataset.val;

        const user = window.Auth.getCurrentUser();
        const users = window.Store.getAll('users');
        const dbUser = users.find(u => u.id === user.id);
        if (!dbUser) return;

        if (action === 'verify-contact-btn') {
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          sessionStorage.setItem('settings_pending_val', val);
          sessionStorage.setItem('settings_pending_code', code);
          sessionStorage.setItem('settings_pending_type', type);

          const confirmArea = document.getElementById('settings-confirm-contact-area');
          const confirmDesc = document.getElementById('settings-confirm-contact-desc');
          if (confirmArea && confirmDesc) {
            confirmArea.style.display = 'block';
            confirmDesc.innerHTML = `Enter the 6-digit confirmation code sent to <strong>${val}</strong> (Simulated Code: <strong>${code}</strong>)`;
            document.getElementById('settings-confirm-contact-code').focus();
          }
        } else if (action === 'remove-contact-btn') {
          let activeCount = 0;
          if (dbUser.emails) activeCount += dbUser.emails.filter(e => e.status === 'active').length;
          if (dbUser.phones) activeCount += dbUser.phones.filter(p => p.status === 'active').length;

          const targetContact = type === 'email' 
            ? dbUser.emails.find(e => e.value === val)
            : dbUser.phones.find(p => p.value === val);

          if (targetContact && targetContact.status === 'active' && activeCount <= 1) {
            window.Utils.showToast("Cannot remove the last active contact method.", "error");
            return;
          }

          if (type === 'email') {
            dbUser.emails = dbUser.emails.filter(e => e.value !== val);
            if (dbUser.email === val) {
              const nextActiveEmail = dbUser.emails.find(e => e.status === 'active');
              dbUser.email = nextActiveEmail ? nextActiveEmail.value : '';
            }
          } else {
            dbUser.phones = dbUser.phones.filter(p => p.value !== val);
            if (dbUser.phone === val) {
              const nextActivePhone = dbUser.phones.find(p => p.status === 'active');
              dbUser.phone = nextActivePhone ? nextActivePhone.value : '';
            }
          }

          window.Store.update('users', dbUser.id, { 
            emails: dbUser.emails, 
            phones: dbUser.phones,
            email: dbUser.email,
            phone: dbUser.phone
          });
          window.Utils.showToast("Contact method removed.", "success");
          contactsList.innerHTML = this._renderContactsList(dbUser);
        }
      });
    }

    // Delete account
    const deleteBtn = document.getElementById('settings-delete-account-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this._showDeleteAccountConfirmModal();
      });
    }
  },

  _showDeleteAccountConfirmModal() {
    const existing = document.getElementById('delete-account-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'delete-account-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:12px;padding:28px;width:100%;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <h3 style="font-size:1.1rem;font-weight:700;color:#c0392b;margin-bottom:8px;"><i class="fas fa-exclamation-triangle"></i> Delete Account</h3>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">This will <strong>permanently delete</strong> your account and all your data. This cannot be undone.</p>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:12px;">Enter your password to confirm:</p>
        <div class="auth-input-group" style="margin-bottom:16px;">
          <input type="password" id="delete-confirm-pw" class="auth-input" placeholder="Your password">
          <button type="button" class="toggle-password"><i class="fas fa-eye"></i></button>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="confirm-delete-btn" style="flex:1;background:#e74c3c;color:#fff;border:none;border-radius:8px;padding:12px;font-weight:700;cursor:pointer;">Yes, Delete My Account</button>
          <button id="cancel-delete-btn" style="flex:1;background:var(--bg-secondary);color:var(--text-primary);border:none;border-radius:8px;padding:12px;font-weight:600;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('cancel-delete-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('confirm-delete-btn').addEventListener('click', () => {
      const pw = document.getElementById('delete-confirm-pw').value;
      if (!pw) { window.Utils.showToast('Please enter your password', 'error'); return; }
      const user = window.Auth.getCurrentUser();
      if (user) {
        const success = window.Auth.deleteAccount(user.id, pw);
        if (success) modal.remove();
      }
    });
  },

  showLogoutConfirmModal() {
    const existing = document.getElementById('logout-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'logout-confirm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:12px;padding:24px;width:100%;max-width:380px;box-shadow:var(--shadow-lg);text-align:center;font-family:var(--font-family-body);">
        <h3 style="font-size:1.2rem;font-weight:700;color:var(--text-primary);margin-bottom:12px;">Log Out?</h3>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:24px;">Are you sure you want to log out of Handbook?</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="logout-confirm-yes" style="width:100%;background:var(--color-primary);color:#fff;border:none;border-radius:8px;padding:12px;font-weight:700;cursor:pointer;font-size:0.95rem;">Log Out</button>
          <button id="logout-confirm-no" style="width:100%;background:var(--bg-button, rgba(255,255,255,0.08));color:var(--text-primary);border:none;border-radius:8px;padding:12px;font-weight:600;cursor:pointer;font-size:0.95rem;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('logout-confirm-yes').addEventListener('click', () => {
      modal.remove();
      if (window.Auth && window.Auth.logout) {
        window.Auth.logout();
      }
    });

    document.getElementById('logout-confirm-no').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  },

  setupAuthListeners() {
    document.addEventListener('auth:login', (e) => {
      window.location.hash = '#feed';
      this.route();
    });

    document.addEventListener('auth:logout', () => {
      // App shell will be replaced by login page via Auth.showLoginPage()
    });
  },

  _renderProfileDropdown(user) {
    const esc = str => window.Utils?.escapeHtml?.(str) || str;
    return `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Profile Card -->
        <a href="#profile" style="text-decoration: none; color: inherit; display: block;" onclick="document.getElementById('profile-dropdown-menu').classList.add('d-none');">
          <div style="border: 2px solid var(--color-primary); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; background: var(--color-bg-hover, rgba(0,0,0,0.03));">
            <img src="${user.avatar}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
            <span style="font-weight: 700; font-size: 15px; color: var(--text-primary); letter-spacing: 0.5px;">${esc(user.fullName)}</span>
          </div>
        </a>
        
        <!-- See all profiles -->
        <button class="btn btn-secondary btn-sm" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 600; padding: 8px 0; border-radius: 8px;">
          <i class="fas fa-user-circle" style="font-size: 15px;"></i> See all profiles
        </button>

        <div style="height: 1px; background: var(--color-border); margin: 8px 0;"></div>

        <!-- Menu list -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <!-- Settings & privacy -->
          <a href="#settings" class="profile-dropdown-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 0.2s;" onclick="document.getElementById('profile-dropdown-menu').classList.add('d-none');">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%;"><i class="fas fa-cog"></i></span>
              <span style="font-weight: 500; font-size: 14.5px;">Settings & privacy</span>
            </div>
            <i class="fas fa-chevron-right" style="font-size: 12px; opacity: 0.6;"></i>
          </a>

          <!-- Help & support -->
          <a href="#help" class="profile-dropdown-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 0.2s;" onclick="document.getElementById('profile-dropdown-menu').classList.add('d-none');">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%;"><i class="fas fa-question-circle"></i></span>
              <span style="font-weight: 500; font-size: 14.5px;">Help & support</span>
            </div>
            <i class="fas fa-chevron-right" style="font-size: 12px; opacity: 0.6;"></i>
          </a>

          <!-- Display & accessibility -->
          <button id="profile-dropdown-theme-toggle" class="profile-dropdown-item" style="background: none; border: none; width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-radius: 8px; color: inherit; cursor: pointer; text-align: left; font-family: inherit; transition: background 0.2s;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%;"><i class="fas fa-moon"></i></span>
              <span style="font-weight: 500; font-size: 14.5px;">Display & accessibility</span>
            </div>
            <i class="fas fa-chevron-right" style="font-size: 12px; opacity: 0.6;"></i>
          </button>

          <!-- Give feedback -->
          <a href="#feedback" class="profile-dropdown-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 0.2s;" onclick="document.getElementById('profile-dropdown-menu').classList.add('d-none');">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%;"><i class="fas fa-comment-alt"></i></span>
              <div>
                <span style="font-weight: 500; font-size: 14.5px; display: block; line-height: 1.2;">Give feedback</span>
                <span style="font-size: 11px; color: var(--text-secondary);">CTRL B</span>
              </div>
            </div>
          </a>

          <!-- Log out -->
          <button class="profile-dropdown-item logout-btn" style="background: none; border: none; width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-radius: 8px; color: inherit; cursor: pointer; text-align: left; font-family: inherit; transition: background 0.2s;" onclick="document.getElementById('profile-dropdown-menu').classList.add('d-none');">
            <span class="action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%;"><i class="fas fa-sign-out-alt"></i></span>
            <span style="font-weight: 500; font-size: 14.5px;">Log out</span>
          </button>
        </div>

        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; border-top: 1px solid var(--color-border); padding-top: 8px;">
          Privacy · Terms · Advertising · Ad Choices ▷ · Cookies · More
        </div>
      </div>
    `;
  },

  renderAppShell() {
    const appContainer = document.getElementById('app-container');
    const currentUser = window.Auth.getCurrentUser();
    
    // Only render shell if not already there
    if(document.getElementById('app-header')) {
       // Just update user specific parts if needed
       return;
     }
     
     const unreadCount = window.Notifications ? window.Notifications.getUnreadCount() : 0;
     
     const shellHtml = `
       <header id="app-header" class="header">
         <div class="header__inner">
           <div class="header__left">
             <a href="#feed" class="header__logo" style="display: flex; align-items: center; gap: 8px;">
               <img src="img/logo.png?v=4" alt="Handbook Logo" style="height: 32px; border-radius: 8px; object-fit: cover;">
               Handbook
             </a>
             <div class="search-bar">
               <input type="text" id="global-search" class="search-bar__input" placeholder="Search Handbook...">
               <i class="fas fa-search search-bar__icon"></i>
               <div id="search-dropdown" class="search-bar__results d-none"></div>
             </div>
           </div>
           
            <nav class="header__center header__nav">
              <a href="#feed" class="header__nav-item active" title="Home"><i class="fas fa-home"></i></a>
              <a href="#profile" class="header__nav-item" title="Profile"><i class="fas fa-user"></i></a>
              <a href="#friends" class="header__nav-item" title="Friends"><i class="fas fa-user-friends"></i></a>
              <a href="#chat" class="header__nav-item position-relative" title="Messages"><i class="fab fa-facebook-messenger"></i></a>
              <a href="#reels" class="header__nav-item" title="Reels"><i class="fas fa-film"></i></a>
              
            </nav>
           
           <div class="header__right">
             <button class="action-btn" id="theme-toggle-btn" title="Toggle Theme">
               <i class="fas fa-moon"></i>
             </button>
             <div class="notification-wrapper position-relative">
               <button class="action-btn" id="notifications-toggle" title="Notifications">
                 <i class="fas fa-bell"></i>
                 ${unreadCount > 0 ? `<span class="badge badge--primary">${unreadCount}</span>` : ''}
               </button>
               <div id="notifications-dropdown" class="dropdown-menu d-none"></div>
             </div>
              <!-- Profile avatar wrapper -->
              <div class="user-profile-wrapper" style="position: relative; margin-left: 8px;">
                <button class="action-btn user-profile-trigger" id="profile-dropdown-toggle" title="Account" style="padding: 0; overflow: hidden; border-radius: 50%; width: 40px; height: 40px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                  <img src="${currentUser.avatar}" alt="Profile" style="width: 40px; height: 40px; object-fit: cover;">
                </button>
                <div id="profile-dropdown-menu" class="dropdown-menu d-none" style="position: absolute; right: 0; top: 48px; width: 360px; background: var(--bg-card); border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1); border: 1px solid var(--color-border); padding: 16px; z-index: 10000; color: var(--text-primary);">
                  ${this._renderProfileDropdown(currentUser)}
                </div>
              </div>
           </div>
         </div>
       </header>
       
       <main class="main">
         <div class="main__container">
           <aside class="sidebar-left">
             <nav class="sidebar-left__nav">
               <a href="#profile" class="sidebar-left__item">
                 <img src="${currentUser.avatar}" class="avatar-sm" alt="Profile">
                 <span class="font-weight-bold">${currentUser.fullName}</span>
               </a>
               <a href="#feed" class="sidebar-left__item active">
                 <span class="sidebar-left__item-icon"><i class="fas fa-home text-primary"></i></span>
                 Feed
               </a>
               <a href="#friends" class="sidebar-left__item">
                 <span class="sidebar-left__item-icon"><i class="fas fa-user-friends text-primary"></i></span>
                 Friends
               </a>
               <a href="#chat" class="sidebar-left__item">
                 <span class="sidebar-left__item-icon"><i class="fab fa-facebook-messenger text-success"></i></span>
                 Messages
               </a>
               <a href="#reels" class="sidebar-left__item">
                 <span class="sidebar-left__item-icon"><i class="fas fa-film text-danger"></i></span>
                 Reels
               </a>
                <a href="#saved" class="sidebar-left__item">
                  <span class="sidebar-left__item-icon"><i class="fas fa-bookmark" style="color:#f59e0b;"></i></span>
                  Saved Posts
                </a>
                <a href="#settings" class="sidebar-left__item">
                  <span class="sidebar-left__item-icon"><i class="fas fa-cog" style="color:#888;"></i></span>
                  Settings
                </a>
             </nav>
           </aside>
           
           <div id="main-content" class="feed">
             <!-- Page content injected here -->
           </div>
           
           <aside class="sidebar-right" id="right-sidebar">
             <!-- Right sidebar content injected here by Social.renderRightSidebar -->
           </aside>
         </div>
       </main>
       
       <!-- Mobile Bottom Nav -->
       <nav class="mobile-nav">
         <div class="mobile-nav__inner">
           <a href="#feed" class="mobile-nav__item active"><i class="fas fa-home mobile-nav__item-icon"></i></a>
           <a href="#friends" class="mobile-nav__item"><i class="fas fa-user-friends mobile-nav__item-icon"></i></a>
           <a href="#chat" class="mobile-nav__item"><i class="fab fa-facebook-messenger mobile-nav__item-icon"></i></a>
           <a href="#reels" class="mobile-nav__item"><i class="fas fa-film mobile-nav__item-icon"></i></a>
           <a href="#notifications" class="mobile-nav__item">
             <i class="fas fa-bell mobile-nav__item-icon"></i>
             ${unreadCount > 0 ? `<span class="badge badge--primary">${unreadCount}</span>` : ''}
           </a>
           <a href="#profile" class="mobile-nav__item"><i class="fas fa-user mobile-nav__item-icon"></i></a>
         </div>
       </nav>
      
      <div id="toast-container" class="toast-container"></div>
    `;
    
    appContainer.innerHTML = shellHtml;
    
    // Render right sidebar
    if(window.Social && document.getElementById('right-sidebar')) {
      document.getElementById('right-sidebar').innerHTML = window.Social.renderRightSidebar();
      window.Social.loadRightSidebar();
    }
  },

  setupThemeToggle() {
    // Check saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Setup listener
    document.addEventListener('click', (e) => {
      if (e.target.closest('#theme-toggle-btn')) {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const icon = document.querySelector('#theme-toggle-btn i');
        if(icon) {
          icon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
      }
    });
  },

  setupGlobalListeners() {
    // Global search
    document.addEventListener('input', (e) => {
      if (e.target.id === 'global-search') {
        const query = e.target.value;
        const dropdown = document.getElementById('search-dropdown');
        if (query.length > 0 && window.Search) {
          dropdown.innerHTML = window.Search.renderSearchSuggestions(query);
          dropdown.classList.remove('d-none');
        } else {
          dropdown.classList.add('d-none');
        }
      }
    });

    document.addEventListener('keypress', (e) => {
      if (e.target.id === 'global-search' && e.key === 'Enter') {
        const query = e.target.value;
        if (query.trim()) {
          window.location.href = `#search?q=${encodeURIComponent(query)}`;
          document.getElementById('search-dropdown').classList.add('d-none');
          e.target.blur();
        }
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      // Notifications dropdown
      const notifToggle = document.getElementById('notifications-toggle');
      const notifDropdown = document.getElementById('notifications-dropdown');
      
      if (e.target.closest('#notifications-toggle')) {
        if(notifDropdown) {
           notifDropdown.classList.toggle('d-none');
           if(!notifDropdown.classList.contains('d-none') && window.Notifications) {
              notifDropdown.innerHTML = window.Notifications.renderNotificationDropdown();
           }
        }
      } else if (notifDropdown && !e.target.closest('#notifications-dropdown')) {
        notifDropdown.classList.add('d-none');
      }

      // Search dropdown
      const searchContainer = document.querySelector('.search-bar');
      const searchDropdown = document.getElementById('search-dropdown');
      if (searchDropdown && !e.target.closest('.search-bar')) {
        searchDropdown.classList.add('d-none');
      }

      // Profile dropdown toggle
      const profileToggle = e.target.closest('#profile-dropdown-toggle');
      const profileDropdown = document.getElementById('profile-dropdown-menu');
      if (profileToggle) {
        e.preventDefault();
        e.stopPropagation();
        if (profileDropdown) {
          profileDropdown.classList.toggle('d-none');
        }
      } else if (profileDropdown && !e.target.closest('#profile-dropdown-menu')) {
        profileDropdown.classList.add('d-none');
      }

      // Theme toggle forwarding inside dropdown
      if (e.target.closest('#profile-dropdown-theme-toggle')) {
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) themeBtn.click();
        return;
      }

      // Logout button
      if (e.target.closest('.logout-btn')) {
        this.showLogoutConfirmModal();
        return;
      }

      // Delegate events to feature modules
      let handled = false;
      if (!handled && window.Feed && window.Feed.handleEvent) handled = window.Feed.handleEvent(e);
      if (!handled && window.Post && window.Post.handleEvent) handled = window.Post.handleEvent(e);
      if (!handled && window.Chat && window.Chat.handleEvent) handled = window.Chat.handleEvent(e);
      if (!handled && window.Notifications && window.Notifications.handleEvent) handled = window.Notifications.handleEvent(e);
      if (!handled && window.Search && window.Search.handleEvent) handled = window.Search.handleEvent(e);
      if (!handled && window.Social && window.Social.handleEvent) handled = window.Social.handleEvent(e);
      if (!handled && window.Friends && window.Friends.handleEvent) handled = window.Friends.handleEvent(e);
      if (!handled && window.Reels && window.Reels.handleEvent) handled = window.Reels.handleEvent(e);
    });
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
