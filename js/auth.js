// =============================================================================
// auth.js — Authentication System for Handbook (Facebook-style)
// =============================================================================

const Auth = (() => {
  'use strict';

  let _appContainer = null;
  let _firebaseConfirmationResult = null; // Stores pending Firebase phone verification
  const SAVED_ACCOUNTS_KEY = 'handbook_saved_accounts';

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  function init(containerSelector = '#app') {
    _appContainer = document.querySelector(containerSelector);
    if (!_appContainer) {
      _appContainer = document.getElementById('app-container') || document.body;
    }
    _attachGlobalListeners();
  }

  // ---------------------------------------------------------------------------
  // Saved Accounts Management (like Facebook's remembered profiles)
  // ---------------------------------------------------------------------------
  function _getSavedAccounts() {
    try {
      const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveAccount(user, savedPw = null) {
    const accounts = _getSavedAccounts();
    const existing = accounts.find(a => a.id === user.id);
    const filtered = accounts.filter(a => a.id !== user.id);
    let primaryIdentifier = user.email || user.phone;
    if (!primaryIdentifier) {
      if (user.emails && user.emails.length > 0) primaryIdentifier = user.emails[0];
      else if (user.phones && user.phones.length > 0) primaryIdentifier = user.phones[0];
    }
    filtered.unshift({
      id: user.id,
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      avatar: user.avatar,
      email: primaryIdentifier,
      savedPw: savedPw !== null ? savedPw : (existing ? existing.savedPw : null)
    });
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered.slice(0, 5)));
  }

  function _removeSavedAccount(userId) {
    const accounts = _getSavedAccounts();
    const filtered = accounts.filter(a => a.id !== userId);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered));
  }

  // ---------------------------------------------------------------------------
  // Event Delegation
  // ---------------------------------------------------------------------------
  function _attachGlobalListeners() {
    document.addEventListener('click', (e) => {
      const target = e.target;

      // Switch to signup
      if (target.closest('[data-action="show-signup"]')) {
        e.preventDefault();
        sessionStorage.removeItem('hb_temp_signup_data');
        sessionStorage.removeItem('hb_temp_signup_email');
        sessionStorage.removeItem('hb_signup_otp');
        if (_resendTimerInterval) {
          clearInterval(_resendTimerInterval);
          _resendTimerInterval = null;
        }
        // Update URL hash so reload stays on signup
        history.replaceState(null, '', window.location.pathname + '#signup');
        showSignupPage();
      }

      // Switch to login
      if (target.closest('[data-action="show-login"]')) {
        e.preventDefault();
        sessionStorage.removeItem('hb_temp_signup_data');
        sessionStorage.removeItem('hb_temp_signup_email');
        sessionStorage.removeItem('hb_signup_otp');
        if (_resendTimerInterval) {
          clearInterval(_resendTimerInterval);
          _resendTimerInterval = null;
        }
        // Replace URL hash so reload stays on login, not signup
        history.replaceState(null, '', window.location.pathname + '#login');
        showLoginPage();
      }

      // Switch to email login form
      if (target.closest('[data-action="show-email-login"]')) {
        e.preventDefault();
        _showEmailLoginForm();
      }

      // Saved account click - quick login
      const savedAcctBtn = target.closest('[data-action="saved-account-login"]');
      if (savedAcctBtn) {
        e.preventDefault();
        const userId = savedAcctBtn.dataset.userId;
        const account = _getSavedAccounts().find(a => a.id === userId);
        if (!account) return;

        if (account.savedPw) {
          // Auto-login: show spinner on the card
          savedAcctBtn.style.opacity = '0.6';
          savedAcctBtn.style.pointerEvents = 'none';
          const nameEl = savedAcctBtn.querySelector('.saved-account-card__name');
          const origText = nameEl ? nameEl.textContent : '';
          const subtitleEl = savedAcctBtn.querySelector('[style*="margin-top"]');
          if (subtitleEl) subtitleEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:9px;"></i> Logging in...';

          let plainPw;
          try { plainPw = atob(account.savedPw); } catch(_) { plainPw = null; }

          if (plainPw) {
            Api.login(account.email, plainPw)
              .then(data => {
                Api.setTokens(data.accessToken, data.refreshToken);
                const user = data.user;
                Store.setCurrentUser(user);
                // Refresh the saved account entry with latest avatar
                _saveAccount(user, account.savedPw);
                Utils.showToast(`Welcome back, ${user.firstName || user.fullName}!`, 'success');
                document.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
                window.location.hash = '#feed';
                window.dispatchEvent(new Event('hashchange'));
              })
              .catch(() => {
                // Saved password wrong or expired — clear it and ask for password
                const accounts = _getSavedAccounts();
                const idx = accounts.findIndex(a => a.id === userId);
                if (idx !== -1) { accounts[idx].savedPw = null; localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts)); }
                _showPasswordPrompt(userId);
              });
          } else {
            _showPasswordPrompt(userId);
          }
        } else {
          _showPasswordPrompt(userId);
        }
      }

      // Settings gear - open remove accounts modal
      if (target.closest('[data-action="open-settings"]')) {
        e.preventDefault();
        _showRemoveAccountsModal();
      }

      // Close modal
      if (target.closest('[data-action="close-modal"]') || target.classList.contains('auth-modal-overlay')) {
        e.preventDefault();
        _closeModal();
      }

      // Remove account button
      const removeBtn = target.closest('[data-action="remove-account"]');
      if (removeBtn) {
        e.preventDefault();
        const userId = removeBtn.dataset.userId;
        _removeSavedAccount(userId);
        // Re-render the modal content
        const modalBody = document.querySelector('.auth-modal__body');
        if (modalBody) {
          modalBody.innerHTML = _renderRemoveAccountsList();
        }
        // Also re-render the login page behind the modal
        showLoginPage();
        Utils.showToast('Profile removed from this browser', 'success');
      }

      // Toggle password visibility
      const togglePw = target.closest('.toggle-password');
      if (togglePw) {
        e.preventDefault();
        const input = togglePw.parentElement.querySelector('input');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          togglePw.innerHTML = input.type === 'password' 
            ? '<i class="fas fa-eye"></i>' 
            : '<i class="fas fa-eye-slash"></i>';
        }
      }

      // Forgot password link (from general login page — shows Find Your Account)
      if (target.closest('[data-action="forgot-password"]')) {
        e.preventDefault();
        window.location.hash = '#forgot-password';
      }

      // Forgot password link (from a specific saved account)
      if (target.closest('[data-action="forgot-password-for-account"]')) {
        e.preventDefault();
        const link = target.closest('[data-action="forgot-password-for-account"]');
        const userId = link ? link.dataset.userId : null;
        const account = _getSavedAccounts().find(a => a.id === userId);
        if (!account || !account.email) {
          window.location.hash = '#forgot-password';
          return;
        }
        
        Utils.showToast('Searching account...', 'info');
        Api.searchResetUser(account.email)
          .then(res => {
            sessionStorage.setItem('hb_reset_user_data', JSON.stringify(res.user));
            window.location.hash = '#choose-login-method';
          })
          .catch(err => {
            Utils.showToast(err.message || 'Failed to search account.', 'error');
            window.location.hash = '#forgot-password';
          });
      }

      // Send reset code (Search for account by name, email, or mobile number)
      if (target.closest('[data-action="send-reset-code"]')) {
        e.preventDefault();
        const searchInput = document.getElementById('forgot-email');
        if (!searchInput) return;
        const searchVal = searchInput.value.trim().toLowerCase();
        
        // Reset errors
        const errorEl = document.getElementById('find-account-error');
        if (errorEl) {
          errorEl.style.display = 'none';
          errorEl.innerHTML = '';
        }
        
        const wrapper = searchInput.closest('.auth-input-wrapper');
        if (wrapper) wrapper.classList.remove('has-error');

        if (!searchVal) {
          if (wrapper) wrapper.classList.add('has-error');
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = `<span style="color:#f02849;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-exclamation-circle"></i> Please enter your name, email, or mobile number</span>`;
          }
          return;
        }

        const btn = target;
        btn.disabled = true;
        btn.textContent = 'Searching...';

        Api.searchResetUser(searchVal)
          .then(res => {
            sessionStorage.setItem('hb_reset_user_data', JSON.stringify(res.user));
            window.location.hash = '#choose-login-method';
          })
          .catch(err => {
            if (wrapper) wrapper.classList.add('has-error');
            if (errorEl) {
              errorEl.style.display = 'block';
              errorEl.innerHTML = `<span style="color:#f02849;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-exclamation-circle"></i> ${err.message || 'Account not found.'}</span>`;
            }
          })
          .finally(() => {
            btn.disabled = false;
            btn.textContent = 'Search';
          });
      }

      // Choose login method continue button
      if (target.closest('[data-action="choose-login-continue"]')) {
        e.preventDefault();
        const checkedInput = document.querySelector('input[name="reset-method"]:checked');
        if (!checkedInput) return;
        const selectedValue = checkedInput.value; // "email" or "password"
        const userDataStr = sessionStorage.getItem('hb_reset_user_data');
        if (!userDataStr) {
          window.location.hash = '#forgot-password';
          return;
        }
        const user = JSON.parse(userDataStr);

        if (selectedValue === 'password') {
          // Go to password prompt for this user
          sessionStorage.removeItem('hb_reset_user_data');
          window.location.hash = '#login';
          setTimeout(() => {
            _showPasswordPrompt(user.id);
          }, 100);
          return;
        }

        // Email option selected
        if (user.emails && user.emails.length > 0) {
          const primaryEmail = user.emails[0];
          const btn = target.closest('[data-action="choose-login-continue"]');
          if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

          Api.resetRequest(primaryEmail)
            .then(() => {
              sessionStorage.setItem('hb_reset_email', primaryEmail);
              sessionStorage.setItem('hb_reset_user_id', user.id);
              _showCustomBlackToast('Code successfully sent', `Your code was successfully sent via email.`);
              window.location.hash = '#verify-reset-code';
            })
            .catch(err => {
              Utils.showToast(err.message || 'Failed to send code. Please try again.', 'error');
            })
            .finally(() => {
              if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
            });
        } else {
          Utils.showToast('No active email associated with this account.', 'error');
        }
      }

      // Choose login method "Not you?" button
      if (target.closest('[data-action="not-you-reset"]')) {
        e.preventDefault();
        sessionStorage.removeItem('hb_reset_user_data');
        window.location.hash = '#forgot-password';
      }

      // Verify reset code
      if (target.closest('[data-action="verify-reset-code"]')) {
        e.preventDefault();
        const form = document.getElementById('verify-reset-code-form');
        if (form) {
          form.dispatchEvent(new Event('submit'));
        }
      }

      // Resend Reset Code click
      if (target.id === 'btn-resend-reset-code') {
        e.preventDefault();
        if (target.disabled) return;
        const emailOrPhone = sessionStorage.getItem('hb_reset_email');
        if (emailOrPhone) {
          const isPhone = /^\+?[0-9\s-]{8,15}$/.test(emailOrPhone);
          const label = isPhone ? 'SMS' : 'email';
          
          Api.sendOtp(emailOrPhone, 'reset')
            .then(() => {
              _showCustomBlackToast('Code successfully sent', `Your code was successfully sent via ${label}.`);
              const statusMsg = document.getElementById('resend-reset-status-msg');
              if (statusMsg) {
                statusMsg.style.display = 'block';
                setTimeout(() => { statusMsg.style.display = 'none'; }, 4000);
              }
              _startResendTimer(target, 'hb_reset_timer_expires');
            })
            .catch(err => {
              Utils.showToast(err.message || 'Failed to resend code.', 'error');
            });
        }
      }

      // Save new password after reset
      if (target.closest('[data-action="save-new-password"]')) {
        e.preventDefault();
        const newPwInput = document.getElementById('new-password-input');
        const confirmPwInput = document.getElementById('confirm-new-password-input');
        if (!newPwInput || !confirmPwInput) return;

        // Reset error
        const errorEl = document.getElementById('new-password-error');
        if (errorEl) {
          errorEl.style.display = 'none';
          errorEl.innerHTML = '';
        }
        
        const newPwWrapper = newPwInput.closest('.auth-input-wrapper');
        const confirmPwWrapper = confirmPwInput.closest('.auth-input-wrapper');
        if (newPwWrapper) newPwWrapper.classList.remove('has-error');
        if (confirmPwWrapper) confirmPwWrapper.classList.remove('has-error');

        const newPw = newPwInput.value;
        const confirmPw = confirmPwInput.value;

        if (!newPw || newPw.length < 6) {
          if (newPwWrapper) newPwWrapper.classList.add('has-error');
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = `<span style="color:#f02849;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-exclamation-circle"></i> Password must be at least 6 characters long.</span>`;
          }
          return;
        }

        if (newPw !== confirmPw) {
          if (confirmPwWrapper) confirmPwWrapper.classList.add('has-error');
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = `<span style="color:#f02849;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-exclamation-circle"></i> Passwords do not match.</span>`;
          }
          return;
        }

        const userStr = sessionStorage.getItem('hb_reset_user');
        if (userStr) {
          const submitBtn = target.closest('[data-action="save-new-password"]');
          if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

          Api.forceResetPassword(newPw)
            .then(() => {
              const user = JSON.parse(userStr);
              Store.setCurrentUser(user);
              _saveAccount(user, btoa(newPw));
              sessionStorage.removeItem('hb_reset_user_id');
              sessionStorage.removeItem('hb_reset_email');
              sessionStorage.removeItem('hb_reset_user');
              Utils.showToast('Password changed successfully!', 'success');
              document.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
              window.location.hash = '#feed';
              window.dispatchEvent(new Event('hashchange'));
            })
            .catch(err => {
              if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.innerHTML = `<span style="color:#f02849;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-exclamation-circle"></i> ${err.message || 'Failed to update password.'}</span>`;
              }
            })
            .finally(() => {
              if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Continue'; }
            });
        } else {
          window.location.hash = '#forgot-password';
        }
      }

      // Resend OTP click (signup confirm page)
      if (target.id === 'btn-resend-otp') {
        e.preventDefault();
        if (target.disabled) return;
        const emailOrPhone = sessionStorage.getItem('hb_temp_signup_email');
        if (emailOrPhone) {
          const _onResendSuccess = () => {
            _showCustomBlackToast('Code successfully sent', 'Your verification code was sent to your email.');
            const statusMsg = document.getElementById('resend-status-msg');
            if (statusMsg) {
              statusMsg.style.display = 'block';
              setTimeout(() => { statusMsg.style.display = 'none'; }, 4000);
            }
            _startResendTimer(target, 'hb_signup_timer_expires');
          };

          Api.sendOtp(emailOrPhone, 'signup')
            .then(() => _onResendSuccess())
            .catch(err => Utils.showToast(err.message || 'Failed to resend code.', 'error'));
        }
      }

      // Edit signup (back from confirm page)
      if (target.closest('[data-action="edit-signup"]')) {
        e.preventDefault();
        if (_resendTimerInterval) {
          clearInterval(_resendTimerInterval);
          _resendTimerInterval = null;
        }
        history.replaceState(null, '', window.location.pathname + '#signup');
        showSignupPage();
      }

      // Back to saved accounts view
      if (target.closest('[data-action="back-to-accounts"]')) {
        e.preventDefault();
        showLoginPage();
      }
    });

    document.addEventListener('submit', (e) => {
      const form = e.target;

      if (form.id === 'login-form') {
        e.preventDefault();
        const emailEl = form.querySelector('#login-email');
        const passwordEl = form.querySelector('#login-password');
        
        emailEl.style.border = '1px solid #dddfe2';
        passwordEl.style.border = '1px solid #dddfe2';
        
        let isValid = true;
        if (!emailEl.value.trim()) {
          emailEl.style.border = '1px solid #f02849';
          isValid = false;
        }
        if (!passwordEl.value) {
          passwordEl.style.border = '1px solid #f02849';
          isValid = false;
        }
        
        if (isValid) {
          const remember = form.querySelector('#save-password-checkbox')?.checked;
          handleLogin(emailEl.value.trim(), passwordEl.value, remember);
        }
      }

      if (form.id === 'password-prompt-form') {
        e.preventDefault();
        const userId = form.dataset.userId;
        const passwordEl = form.querySelector('#prompt-password');
        
        passwordEl.style.border = '1px solid #dddfe2';
        
        if (!passwordEl.value) {
          passwordEl.style.border = '1px solid #f02849';
          return;
        }

        const account = _getSavedAccounts().find(a => a.id === userId);
        if (account) {
          const remember = form.querySelector('#save-password-checkbox')?.checked;
          handleLogin(account.email, passwordEl.value, remember);
        }
      }

      if (form.id === 'signup-form') {
        e.preventDefault();
        if (_validateSignupForm(form)) {
          const formData = {
            firstName: form.querySelector('#signup-firstname').value.trim(),
            lastName: form.querySelector('#signup-lastname').value.trim(),
            email: form.querySelector('#signup-email').value.trim(),
            password: form.querySelector('#signup-password').value,
            birthMonth: form.querySelector('#signup-birth-month') ? form.querySelector('#signup-birth-month').value : '',
            birthDay: form.querySelector('#signup-birth-day') ? form.querySelector('#signup-birth-day').value : '',
            birthYear: form.querySelector('#signup-birth-year') ? form.querySelector('#signup-birth-year').value : '',
            gender: form.querySelector('#signup-gender') ? form.querySelector('#signup-gender').value : ''
          };
          handleSignup(formData);
        }
      }

      if (form.id === 'confirm-account-form') {
        e.preventDefault();
        const otpInput = form.querySelector('#confirm-otp-input');
        if (!otpInput) return;
        
        const enteredCode = otpInput.value.trim();
        const tempUserData = JSON.parse(sessionStorage.getItem('hb_temp_signup_data') || 'null');
        const identifier = sessionStorage.getItem('hb_temp_signup_email') || '';
        
        // Reset UI
        otpInput.style.borderColor = '#ced0d4';
        form.querySelectorAll('.otp-error-msg').forEach(el => el.remove());

        if (!enteredCode || !tempUserData || !identifier) {
          otpInput.style.borderColor = '#f02849';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'otp-error-msg';
          errorDiv.style.cssText = 'color: #f02849; font-size: 13px; margin-top: 6px; display: flex; align-items: center; gap: 6px;';
          errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Please enter the verification code.`;
          otpInput.closest('.auth-input-wrapper').after(errorDiv);
          return;
        }

        const continueBtn = form.querySelector('button[type="submit"]');
        if (continueBtn) { continueBtn.disabled = true; continueBtn.textContent = 'Verifying...'; }

        // EMAIL only: verify OTP then complete signup
        const signupPayload = {
          firstName: tempUserData.firstName,
          lastName: tempUserData.lastName,
          email: identifier,
          password: tempUserData.password,
          birthMonth: tempUserData.birthMonth,
          birthDay: tempUserData.birthDay,
          birthYear: tempUserData.birthYear,
          gender: tempUserData.gender,
          otpCode: enteredCode,
        };

        Api.signup(signupPayload)
          .then(data => {
            Api.setTokens(data.accessToken, data.refreshToken);
            const user = data.user;
            Store.setCurrentUser(user);
            _saveAccount(user);
            sessionStorage.removeItem('hb_temp_signup_data');
            sessionStorage.removeItem('hb_temp_signup_email');
            sessionStorage.removeItem('hb_signup_timer_expires');
            Utils.showToast(`Welcome to Handbook, ${user.firstName || user.fullName}!`, 'success');
            document.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
            window.location.hash = '#feed';
            window.dispatchEvent(new Event('hashchange'));
          })
          .catch(err => {
            otpInput.style.borderColor = '#f02849';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'otp-error-msg';
            errorDiv.style.cssText = 'color: #f02849; font-size: 13px; margin-top: 6px; display: flex; align-items: center; gap: 6px;';
            const msg = err.message || 'The code you entered doesn\'t match. Please try again.';
            errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
            otpInput.closest('.auth-input-wrapper').after(errorDiv);
            if (continueBtn) { continueBtn.disabled = false; continueBtn.textContent = 'Continue'; }
          });
      }

      if (form.id === 'verify-reset-code-form') {
        e.preventDefault();
        const codeInput = form.querySelector('#reset-code-input');
        if (!codeInput) return;

        // Reset UI
        codeInput.style.borderColor = '#ced0d4';
        form.querySelectorAll('.otp-error-msg').forEach(el => el.remove());

        const enteredCode = codeInput.value.trim();
        const identifier = sessionStorage.getItem('hb_reset_email') || '';
        const userId = sessionStorage.getItem('hb_reset_user_id') || '';

        if (!enteredCode || !identifier) {
          codeInput.style.borderColor = '#f02849';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'otp-error-msg';
          errorDiv.style.cssText = 'color: #f02849; font-size: 13px; margin-top: 6px; display: flex; align-items: center; gap: 6px;';
          errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Please enter the verification code.`;
          codeInput.closest('.auth-input-wrapper').after(errorDiv);
          return;
        }

        const continueBtn = form.querySelector('button[type="submit"]');
        if (continueBtn) { continueBtn.disabled = true; continueBtn.textContent = 'Verifying...'; }

        function _onResetSuccess(data) {
          Api.setTokens(data.accessToken, data.refreshToken);
          const user = data.user;
          sessionStorage.setItem('hb_reset_user', JSON.stringify(user));
          window.location.hash = '#new-password';
        }

        function _onResetError(err) {
          codeInput.style.borderColor = '#f02849';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'otp-error-msg';
          errorDiv.style.cssText = 'color: #f02849; font-size: 13px; margin-top: 6px; display: flex; align-items: center; gap: 6px;';
          const msg = err.message || 'The code you entered doesn\'t match. Please try again.';
          errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
          codeInput.closest('.auth-input-wrapper').after(errorDiv);
          if (continueBtn) { continueBtn.disabled = false; continueBtn.textContent = 'Continue'; }
        }

        // EMAIL only: verify OTP and confirm reset
        Api.resetConfirm(identifier, enteredCode, userId)
          .then(data => _onResetSuccess(data))
          .catch(err => _onResetError(err));
      }
    });

    // Real-time password strength on signup
    document.addEventListener('input', (e) => {
      if (e.target.id === 'signup-password') {
        _updatePasswordStrength(e.target.value);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Show Login Page
  // ---------------------------------------------------------------------------
  function showLoginPage() {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;
    _appContainer.innerHTML = renderLoginPage();
    _injectAuthStyles();
    requestAnimationFrame(() => {
      const card = _appContainer.querySelector('.auth-card');
      if (card) card.classList.add('auth-card-visible');
    });
  }

  // ---------------------------------------------------------------------------
  // Show Signup Page
  // ---------------------------------------------------------------------------
  function showSignupPage() {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;
    _appContainer.innerHTML = renderSignupPage();
    _injectAuthStyles();
    
    // Pre-fill if there is temp data
    const tempUserDataStr = sessionStorage.getItem('hb_temp_signup_data');
    if (tempUserDataStr) {
      try {
        const data = JSON.parse(tempUserDataStr);
        const firstNameEl = document.getElementById('signup-firstname');
        const lastNameEl = document.getElementById('signup-lastname');
        const emailEl = document.getElementById('signup-email');
        const passwordEl = document.getElementById('signup-password');
        const birthMonthEl = document.getElementById('signup-birth-month');
        const birthDayEl = document.getElementById('signup-birth-day');
        const birthYearEl = document.getElementById('signup-birth-year');
        const genderEl = document.getElementById('signup-gender');

        if (firstNameEl) firstNameEl.value = data.firstName || '';
        if (lastNameEl) lastNameEl.value = data.lastName || '';
        if (emailEl) emailEl.value = data.email || '';
        if (passwordEl) passwordEl.value = data.password || '';
        if (birthMonthEl) birthMonthEl.value = data.birthMonth || '';
        if (birthDayEl) birthDayEl.value = data.birthDay || '';
        if (birthYearEl) birthYearEl.value = data.birthYear || '';
        if (genderEl) genderEl.value = data.gender || '';
      } catch (err) {
        console.error("Error parsing temp signup data", err);
      }
    }

    requestAnimationFrame(() => {
      const card = _appContainer.querySelector('.auth-card');
      if (card) card.classList.add('auth-card-visible');
    });
  }

  // ---------------------------------------------------------------------------
  // Show email login form (when clicking "Use another profile")
  // ---------------------------------------------------------------------------
  function _showEmailLoginForm() {
    const formSection = document.querySelector('.auth-form-section');
    if (!formSection) return;

    formSection.innerHTML = `
      <div class="auth-card auth-card-visible" role="main">
        <div class="auth-card-header">
          <h2 class="auth-card-title">Log in to Handbook</h2>
          <button class="auth-settings-btn" data-action="open-settings" title="Settings">
            <i class="fas fa-cog"></i>
          </button>
        </div>

        <form id="login-form" class="auth-form" novalidate>
          <div class="auth-input-group">
            <input type="email" id="login-email" class="auth-input" placeholder="Email address" required autocomplete="email">
          </div>
          <div class="auth-input-group">
            <input type="password" id="login-password" class="auth-input" placeholder="Password" required autocomplete="current-password">
            <button type="button" class="toggle-password" aria-label="Toggle password"><i class="fas fa-eye"></i></button>
          </div>
          <label class="auth-checkbox" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:14px;color:#1c1e21;cursor:pointer;">
            <input type="checkbox" id="save-password-checkbox" checked style="width:16px;height:16px;accent-color:#1877f2;cursor:pointer;">
            Remember password
          </label>
          <button type="submit" class="auth-btn auth-btn--primary">Log In</button>
          <a href="#" class="auth-forgot-link" data-action="forgot-password">Forgotten password?</a>
        </form>

        <div class="auth-card-divider"></div>

        <button class="auth-btn auth-btn--success" data-action="show-signup">Create new account</button>

        <div class="auth-meta-link">
          <a href="#" data-action="back-to-accounts">← Back to saved accounts</a>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Show password prompt for saved account
  // ---------------------------------------------------------------------------
  function _showPasswordPrompt(userId) {
    const account = _getSavedAccounts().find(a => a.id === userId);
    if (!account) return;

    const formSection = document.querySelector('.auth-form-section');
    if (!formSection) return;

    formSection.innerHTML = `
      <div class="auth-card auth-card-visible" role="main">
        <div class="auth-card-header">
          <h2 class="auth-card-title">Log in to Handbook</h2>
          <button class="auth-settings-btn" data-action="open-settings" title="Settings">
            <i class="fas fa-cog"></i>
          </button>
        </div>

        <div class="auth-prompt-user">
          <img src="${account.avatar}" alt="${Utils.sanitizeHTML(account.fullName)}" class="auth-prompt-avatar">
          <span class="auth-prompt-name">${Utils.sanitizeHTML(account.fullName)}</span>
        </div>

        <form id="password-prompt-form" class="auth-form" data-user-id="${account.id}" novalidate>
          <div class="auth-input-group">
            <input type="password" id="prompt-password" class="auth-input" placeholder="Password" required autocomplete="current-password" autofocus>
            <button type="button" class="toggle-password" aria-label="Toggle password"><i class="fas fa-eye"></i></button>
          </div>
          <label class="auth-checkbox" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:14px;color:#1c1e21;cursor:pointer;">
            <input type="checkbox" id="save-password-checkbox" checked style="width:16px;height:16px;accent-color:#1877f2;cursor:pointer;">
            Remember password
          </label>
          <button type="submit" class="auth-btn auth-btn--primary">Log In</button>
          <a href="#" class="auth-forgot-link" data-action="forgot-password-for-account" data-user-id="${account.id}">Forgotten password?</a>
        </form>

        <div class="auth-card-divider"></div>

        <button class="auth-btn auth-btn--outline" data-action="back-to-accounts">← Back</button>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Remove Accounts Modal
  // ---------------------------------------------------------------------------
  function _showRemoveAccountsModal() {
    // Remove existing modal
    _closeModal();

    const modal = document.createElement('div');
    modal.className = 'auth-modal-overlay';
    modal.id = 'auth-modal';
    modal.innerHTML = `
      <div class="auth-modal">
        <div class="auth-modal__header">
          <h3 class="auth-modal__title">Remove profiles from this browser</h3>
          <button class="auth-modal__close" data-action="close-modal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="auth-modal__body">
          ${_renderRemoveAccountsList()}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
  }

  function _renderRemoveAccountsList() {
    const accounts = _getSavedAccounts();

    if (accounts.length === 0) {
      return `
        <div class="auth-modal__empty">
          <p>No saved profiles on this browser.</p>
        </div>
      `;
    }

    return accounts.map(acct => `
      <div class="auth-modal__account">
        <div class="auth-modal__account-info">
          <img src="${acct.avatar}" alt="" class="auth-modal__account-avatar">
          <div class="auth-modal__account-details">
            <span class="auth-modal__account-name">${Utils.sanitizeHTML(acct.fullName)}</span>
            <span class="auth-modal__account-label">Handbook</span>
          </div>
        </div>
        <button class="auth-modal__remove-btn" data-action="remove-account" data-user-id="${acct.id}">Remove</button>
      </div>
    `).join('') + `
      <div class="auth-modal__info">
        <a href="#" class="auth-modal__learn-more">Learn more</a> about why you see profiles here and what it means to remove them.
      </div>
    `;
  }

  function _closeModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  }

  // ---------------------------------------------------------------------------
  // Full-Page Forgot Password Flow (Facebook-style)
  // ---------------------------------------------------------------------------

  function _renderForgotWrapper(title, content, backHash) {
    return `
      <div class="auth-page" style="background:#dfe3ee; min-height:100vh;">
        <div style="max-width:480px;margin:0 auto;padding:20px 16px;min-height:100vh;display:flex;flex-direction:column;">
          <!-- Back Arrow -->
          <div style="margin-bottom:12px;">
            <a href="${backHash}" style="text-decoration:none;color:#1c1e21;font-size:24px;display:inline-block;padding:8px 0;">
              <i class="fas fa-arrow-left"></i>
            </a>
          </div>
          
          <!-- Card Content -->
          <div class="auth-card auth-card-visible" style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:24px 20px; border-radius:16px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.1); margin-bottom:20px;">
            <div>
              <h2 style="font-size:22px;font-weight:700;color:#1c1e21;margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${title}</h2>
              ${content}
            </div>
          </div>

          <!-- Footer Languages -->
          <footer class="auth-footer" style="margin-top:auto; padding:20px 0; border-top:1px solid #ced0d4; text-align:center;">
            <div class="auth-footer__langs" style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px 12px; font-size:12px; color:#65676b; margin-bottom:12px;">
              <span>English (US)</span>
              <a href="#" style="color:#1877f2;text-decoration:none;">বাংলা</a>
              <a href="#" style="color:#1877f2;text-decoration:none;">অসমীয়া</a>
              <a href="#" style="color:#1877f2;text-decoration:none;">हिन्दी</a>
              <a href="#" style="color:#1877f2;text-decoration:none;">নেपाली</a>
              <a href="#" style="color:#1877f2;text-decoration:none;">Bahasa Indonesia</a>
              <a href="#" style="color:#1877f2;text-decoration:none;">العربية</a>
              <a href="#" style="color:#1877f2;text-decoration:none;">More languages...</a>
            </div>
            <div style="font-size:12px; color:#90949c;">&copy; ${new Date().getFullYear()} Handbook</div>
          </footer>
        </div>
      </div>
    `;
  }

  function showForgotPasswordPage() {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;

    const content = `
      <p style="color:#65676b;font-size:15px;line-height:1.4;margin-bottom:20px;">
        Enter your email address to search for your account.
      </p>
      
      <div class="auth-input-wrapper" style="margin-bottom:12px;">
        <input type="email" id="forgot-email" class="auth-input-fb" placeholder="Email address" required>
      </div>

      <div id="find-account-error" style="margin-bottom:20px; display:none;"></div>

      <button class="auth-btn auth-btn--primary" data-action="send-reset-code" style="width:100%; border-radius:24px; padding:12px; font-size:16px;">
        Search
      </button>
    `;

    _appContainer.innerHTML = _renderForgotWrapper("Find Your Account", content, "#login");
    _injectAuthStyles();
  }

  function showChooseLoginMethodPage() {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;

    const userDataStr = sessionStorage.getItem('hb_reset_user_data');
    if (!userDataStr) {
      window.location.hash = '#forgot-password';
      return;
    }
    const user = JSON.parse(userDataStr);

    const obfuscateEmail = (email) => {
      if (!email) return '';
      const parts = email.split('@');
      if (parts.length !== 2) return email;
      const name = parts[0];
      const domain = parts[1];
      if (name.length <= 2) return name[0] + '***@' + domain;
      return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1] + '@' + domain;
    };

    let optionsHtml = '';
    let isFirstOption = true;

    if (user.emails && user.emails.length > 0) {
      const emailLines = user.emails.map(email => obfuscateEmail(email)).join('<br>');
      optionsHtml += `
        <label style="display:flex; align-items:center; justify-content:space-between; padding:16px; background:#fff; cursor:pointer;">
          <div style="flex:1; padding-right:12px;">
            <div style="font-weight:600; font-size:15px; color:#1c1e21; margin-bottom:4px;">Get code via email</div>
            <div style="font-size:13px; color:#65676b; line-height:1.4;">${emailLines}</div>
          </div>
          <input type="radio" name="reset-method" value="email" checked style="width:20px; height:20px; accent-color:#1877f2; cursor:pointer;">
        </label>
      `;
      isFirstOption = false;
    }

    const borderStyle = (!isFirstOption) ? 'border-top:1px solid #ced0d4;' : '';
    optionsHtml += `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:16px; background:#fff; cursor:pointer; ${borderStyle}">
        <div style="flex:1; padding-right:12px;">
          <div style="font-weight:600; font-size:15px; color:#1c1e21; margin-bottom:4px;">Continue with password</div>
          <div style="font-size:13px; color:#65676b; line-height:1.4;">Use your password to continue</div>
        </div>
        <input type="radio" name="reset-method" value="password" ${isFirstOption ? 'checked' : ''} style="width:20px; height:20px; accent-color:#1877f2; cursor:pointer;">
      </label>
    `;

    const content = `
      <!-- Profile display box -->
      <div style="display:flex; align-items:center; gap:16px; background:#f0f2f5; padding:16px; border:1px solid #ced0d4; border-radius:12px; margin-bottom:24px;">
        <img src="${user.avatar}" alt="${Utils.sanitizeHTML(user.fullName)}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
        <div>
          <div style="font-weight:700; font-size:16px; color:#1c1e21;">${Utils.sanitizeHTML(user.fullName)}</div>
          <div style="font-size:13px; color:#65676b; margin-top:2px;">Handbook</div>
        </div>
      </div>

      <!-- Radio options -->
      <div style="border:1px solid #ced0d4; border-radius:12px; overflow:hidden; margin-bottom:24px;">
        ${optionsHtml}
      </div>

      <!-- Action buttons -->
      <div style="display:flex; flex-direction:column; gap:12px;">
        <button class="auth-btn auth-btn--primary" data-action="choose-login-continue" style="width:100%; border-radius:24px; padding:12px; font-size:16px; font-weight:600;">
          Continue
        </button>
        <button class="auth-btn auth-btn--outline" data-action="not-you-reset" style="width:100%; border-radius:24px; padding:12px; font-size:16px; border:1px solid #ced0d4; background:#f0f2f5; color:#1c1e21; font-weight:600;">
          Not you?
        </button>
      </div>
    `;

    _appContainer.innerHTML = _renderForgotWrapper("Choose a way to log in", content, "#forgot-password");
    _injectAuthStyles();
  }
  // Show Forgot Password Verification Page
  function showVerifyResetCodePage() {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;

    const emailOrPhone = sessionStorage.getItem('hb_reset_email') || '';
    _appContainer.innerHTML = renderVerifyResetCodePage(emailOrPhone);
    _injectAuthStyles();

    const resendBtn = document.getElementById('btn-resend-reset-code');
    if (resendBtn) {
      _startResendTimer(resendBtn);
    }

    // Auto-focus the code input
    setTimeout(() => {
      const codeInput = document.getElementById('reset-code-input');
      if (codeInput) codeInput.focus();
    }, 100);
  }

  // HTML template for Forgot Password Code Verification Page
  function renderVerifyResetCodePage(emailOrPhone) {
    const isPhone = /^\+?[0-9\s-]{8,15}$/.test(emailOrPhone);
    const destinationType = isPhone ? 'SMS' : 'email';
    return `
      <div class="auth-page" style="background:#fff; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; display:flex; flex-direction:column; justify-content:space-between; width:100%;">
        <div style="max-width:500px; margin:0 auto; padding:24px 20px; width:100%; box-sizing:border-box;">
          
          <!-- Back arrow -->
          <div style="margin-bottom:16px; text-align:left;">
            <a href="#choose-login-method" style="text-decoration:none; color:#1c1e21; font-size:20px; display:inline-flex; align-items:center;">
              <i class="fas fa-chevron-left"></i>
            </a>
          </div>

          <!-- Title & Description -->
          <h1 style="font-size:22px; font-weight:700; color:#1c1e21; margin:0 0 8px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; letter-spacing: -0.2px;">Confirm your account</h1>
          <p style="font-size:14px; color:#65676b; margin:0 0 20px 0; line-height:1.4;">We sent a code via ${destinationType}. Enter that code to confirm your account.</p>

          <form id="verify-reset-code-form" class="auth-form" novalidate style="width:100%;">
            <div class="auth-input-wrapper" style="margin-bottom:20px; position:relative; width:100%;">
              <input type="text" id="reset-code-input" placeholder="Enter code" required style="width:100%; height:48px; background:#fff; border:1px solid #ced0d4; border-radius:8px; padding:0 16px; font-size:15px; box-sizing:border-box; color:#1c1e21; outline:none; transition:border-color 0.15s ease-in-out;" onfocus="this.style.borderColor='#1877f2'" onblur="this.style.borderColor='#ced0d4'">
            </div>

            <!-- Continue Button -->
            <button type="submit" style="width:100%; height:48px; background:#1877f2; color:#fff; border:none; border-radius:24px; font-size:16px; font-weight:600; cursor:pointer; margin-bottom:12px; display:flex; align-items:center; justify-content:center; outline:none;">Continue</button>

            <!-- Didn't get code -->
            <button type="button" id="btn-resend-reset-code" style="width:100%; height:48px; background:#fff; color:#1c1e21; border:1px solid #ced0d4; border-radius:24px; font-size:15px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; outline:none; transition:background 0.2s;" onmouseover="this.style.background='#f2f3f5'" onmouseout="this.style.background='#fff'">Didn't get a code?</button>
            
            <!-- Resend success status message -->
            <div id="resend-reset-status-msg" style="font-size:13px; color:#42b72a; text-align:center; margin-top:8px; display:none; font-weight:500;">
              <i class="fas fa-check-circle"></i> Code resent successfully!
            </div>
          </form>
        </div>

        <!-- Footer section matching facebook style exactly -->
        <div style="background:#fff; padding:40px 20px 24px; text-align:center; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; width:100%; box-sizing:border-box;">
          <!-- Languages -->
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px 16px; font-size:12px; color:#8a8d91; margin-bottom:16px; max-width:980px; margin-left:auto; margin-right:auto;">
            <span style="color:#737373;">English (US)</span>
            <a href="#" style="color:#8a8d91; text-decoration:none;">বাংলা</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">অসমীয়া</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">हिन्दी</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">নেপালী</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Bahasa Indonesia</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">العربية</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">More languages...</a>
          </div>
          
          <div style="border-top:1px solid #dddfe2; margin:16px auto; max-width:980px;"></div>

          <!-- Bottom links -->
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px 16px; font-size:12px; color:#8a8d91; line-height:1.6; max-width:980px; margin-left:auto; margin-right:auto; margin-bottom:16px;">
            <a href="#" style="color:#8a8d91; text-decoration:none;">Sign Up</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Log In</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Messenger</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Facebook Lite</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Video</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta Pay</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta Store</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta Quest</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Ray-Ban Meta</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta AI</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Instagram</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Threads</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Privacy Policy</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Privacy Center</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">About</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Create ad</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Create Page</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Developers</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Careers</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Cookies</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Ad choices <i class="fas fa-play" style="font-size:8px;"></i></a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Terms</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Help</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Contact Uploading & Non-Users</a>
          </div>
          
          <div style="font-size:12px; color:#737373; max-width:980px; margin:0 auto; text-align:left;">
            Meta © 2026
          </div>
        </div>
      </div>
    `;
  }

  function showNewPasswordPage() {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;

    const content = `
      <p style="color:#65676b;font-size:15px;line-height:1.4;margin-bottom:20px;">
        Create a new password that is at least 6 characters long. A strong password is a combination of letters, numbers, and punctuation marks.
      </p>

      <div class="auth-input-wrapper" style="margin-bottom:12px;">
        <input type="password" id="new-password-input" class="auth-input-fb" placeholder="New password">
        <span class="auth-input-label-floating">New password</span>
        <button type="button" class="toggle-password" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#65676b; cursor:pointer;"><i class="fas fa-eye"></i></button>
      </div>

      <div class="auth-input-wrapper" style="margin-bottom:20px;">
        <input type="password" id="confirm-new-password-input" class="auth-input-fb" placeholder="Confirm new password">
        <span class="auth-input-label-floating">Confirm new password</span>
        <button type="button" class="toggle-password" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#65676b; cursor:pointer;"><i class="fas fa-eye"></i></button>
      </div>

      <div id="new-password-error" style="margin-bottom:20px; display:none;"></div>

      <button class="auth-btn auth-btn--primary" data-action="save-new-password" style="width:100%; border-radius:24px; padding:12px; font-size:16px;">
        Continue
      </button>
    `;

    _appContainer.innerHTML = _renderForgotWrapper("Choose a new password", content, "#verify-reset-code");
    _injectAuthStyles();
  }

  // ---------------------------------------------------------------------------
  // Permanently Delete Account (called from Settings page)
  // ---------------------------------------------------------------------------
  function deleteAccount(userId, password) {
    const users = Store.getAll('users');
    const user = users.find(u => u.id === userId);
    if (!user) { Utils.showToast('Account not found', 'error'); return false; }

    const hashedPassword = Utils.hashPassword(password);
    if (user.password !== hashedPassword) {
      Utils.showToast('Incorrect password. Account not deleted.', 'error');
      return false;
    }

    // Remove from store
    Store.delete('users', userId);
    // Remove from saved accounts in browser
    _removeSavedAccount(userId);
    // Clear session
    Store.clearSession();

    Utils.showToast('Your account has been permanently deleted.', 'info');
    document.dispatchEvent(new CustomEvent('auth:logout'));
    setTimeout(() => showLoginPage(), 1200);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Handle Login
  // ---------------------------------------------------------------------------
  function handleLogin(emailOrPhone, password, remember = false) {
    if (!emailOrPhone || !password) {
      Utils.showToast('Please enter your email/mobile number and password', 'error');
      return false;
    }

    const submitBtn = document.querySelector('[data-action="email-login-submit"], #login-form button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Logging in...'; }

    Api.login(emailOrPhone.trim(), password)
      .then(data => {
        Api.setTokens(data.accessToken, data.refreshToken);
        const user = data.user;
        Store.setCurrentUser(user);
        _saveAccount(user, remember ? btoa(password) : null);
        Utils.showToast(`Welcome back, ${user.firstName || user.fullName}!`, 'success');
        document.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
        window.location.hash = '#feed';
        window.dispatchEvent(new Event('hashchange'));
      })
      .catch(err => {
        Utils.showToast(err.message || 'Invalid email or password', 'error');
        _shakeForm('login-form');
        _shakeForm('password-prompt-form');
      })
      .finally(() => {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Log in'; }
      });

    return true;
  }

  // Helper for signup inline validation
  function _validateSignupForm(form) {
    let isValid = true;

    // Reset previous errors
    form.querySelectorAll('.inline-error-message').forEach(el => el.remove());
    form.querySelectorAll('.auth-input-wrapper').forEach(el => el.classList.remove('has-error'));
    form.querySelectorAll('select').forEach(el => el.classList.remove('has-error'));

    const firstNameEl = form.querySelector('#signup-firstname');
    const lastNameEl = form.querySelector('#signup-lastname');
    const birthMonthEl = form.querySelector('#signup-birth-month');
    const birthDayEl = form.querySelector('#signup-birth-day');
    const birthYearEl = form.querySelector('#signup-birth-year');
    const genderEl = form.querySelector('#signup-gender');
    const emailEl = form.querySelector('#signup-email');
    const passwordEl = form.querySelector('#signup-password');

    function mkError(message) {
      const d = document.createElement('div');
      d.className = 'inline-error-message';
      d.style.cssText = 'color:#f02849;font-size:13px;margin-top:6px;display:flex;align-items:flex-start;gap:6px;font-weight:400;width:100%;';
      d.innerHTML = `<i class="fas fa-exclamation-circle" style="margin-top:2px;flex-shrink:0;"></i><span>${message}</span>`;
      return d;
    }

    function showError(wrapperEl, message) {
      isValid = false;
      wrapperEl.classList.add('has-error');
      // Insert error AFTER the wrapper's parent element, not inside the flex row
      const parent = wrapperEl.parentNode;
      parent.appendChild(mkError(message));
    }

    // Name checks — errors go below the whole name row, not inside flex
    const nameRow = form.querySelector('.name-row-container');
    let nameError = false;
    if (!firstNameEl.value.trim()) {
      isValid = false;
      nameError = true;
      firstNameEl.closest('.auth-input-wrapper').classList.add('has-error');
    }
    if (!lastNameEl.value.trim()) {
      isValid = false;
      nameError = true;
      lastNameEl.closest('.auth-input-wrapper').classList.add('has-error');
    }
    if (nameError && nameRow) {
      const msg = !firstNameEl.value.trim() && !lastNameEl.value.trim()
        ? "What's your name?"
        : (!firstNameEl.value.trim() ? "What's your first name?" : "What's your last name?");
      nameRow.appendChild(mkError(msg));
    }

    // Birthday check
    if (!birthMonthEl.value || !birthDayEl.value || !birthYearEl.value) {
      if (!birthMonthEl.value) birthMonthEl.classList.add('has-error');
      if (!birthDayEl.value) birthDayEl.classList.add('has-error');
      if (!birthYearEl.value) birthYearEl.classList.add('has-error');
      isValid = false;
      const bdayRow = form.querySelector('.birthday-row-container');
      if (bdayRow) bdayRow.appendChild(mkError('Select your birthday. You can change who can see this later.'));
    }

    // Gender check
    if (!genderEl.value) {
      genderEl.classList.add('has-error');
      isValid = false;
      genderEl.parentNode.appendChild(mkError('Please choose a gender. You can change who can see this later.'));
    }

    // Email check
    const emailVal = emailEl.value.trim();
    const emailWrapper = emailEl.closest('.auth-input-wrapper');
    if (!emailVal) {
      showError(emailWrapper, 'Please enter a valid email address.');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        showError(emailWrapper, 'Please enter a valid email address.');
      }
    }

    // Password check
    const pwdVal = passwordEl.value;
    const pwdWrapper = passwordEl.closest('.auth-input-wrapper');
    if (!pwdVal || pwdVal.length < 6) {
      showError(pwdWrapper, 'Enter a combination of at least six numbers, letters and punctuation marks (like ! and &).');
    }

    return isValid;
  }

  // Resend code countdown timer
  let _resendTimerInterval = null;
  function _startResendTimer(buttonEl, timerKey) {
    if (_resendTimerInterval) clearInterval(_resendTimerInterval);
    
    let timeLeft = 30;
    const savedExpires = sessionStorage.getItem(timerKey);
    if (savedExpires) {
      const remaining = Math.ceil((parseInt(savedExpires, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        timeLeft = remaining;
      } else {
        const newExpires = Date.now() + 30 * 1000;
        sessionStorage.setItem(timerKey, newExpires.toString());
      }
    } else {
      const newExpires = Date.now() + 30 * 1000;
      sessionStorage.setItem(timerKey, newExpires.toString());
    }

    buttonEl.disabled = true;
    buttonEl.style.opacity = '0.6';
    buttonEl.style.cursor = 'not-allowed';
    buttonEl.textContent = `Didn't get a code? (Resend in ${timeLeft}s)`;
    
    _resendTimerInterval = setInterval(() => {
      const savedExpires = sessionStorage.getItem(timerKey);
      if (!savedExpires) {
        clearInterval(_resendTimerInterval);
        return;
      }
      const remaining = Math.ceil((parseInt(savedExpires, 10) - Date.now()) / 1000);
      
      if (remaining <= 0) {
        clearInterval(_resendTimerInterval);
        sessionStorage.removeItem(timerKey);
        buttonEl.disabled = false;
        buttonEl.style.opacity = '1';
        buttonEl.style.cursor = 'pointer';
        buttonEl.textContent = "Didn't get a code?";
      } else {
        buttonEl.textContent = `Didn't get a code? (Resend in ${remaining}s)`;
      }
    }, 1000);
  }

  // Show Confirmation Page
  function showConfirmAccountPage(emailOrPhone) {
    if (!_appContainer) init();
    _appContainer = document.getElementById('app-container') || document.body;
    _appContainer.innerHTML = renderConfirmAccountPage(emailOrPhone);
    _injectAuthStyles();
    
    const resendBtn = document.getElementById('btn-resend-otp');
    if (resendBtn) {
      _startResendTimer(resendBtn, 'hb_signup_timer_expires');
    }

    // Auto-focus the code input
    setTimeout(() => {
      const otpInput = document.getElementById('confirm-otp-input');
      if (otpInput) otpInput.focus();
    }, 100);
  }

  // HTML template for Confirmation Page
  function renderConfirmAccountPage(emailOrPhone) {
    const isPhone = /^\+?[0-9\s-]{8,15}$/.test(emailOrPhone);
    const destinationType = isPhone ? 'SMS' : 'email';
    return `
      <div class="auth-page" style="background:#fff; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; display:flex; flex-direction:column; justify-content:space-between; width:100%;">
        <div style="max-width:500px; margin:0 auto; padding:24px 20px; width:100%; box-sizing:border-box;">
          
          <!-- Back arrow -->
          <div style="margin-bottom:16px; text-align:left;">
            <a href="#" data-action="edit-signup" style="text-decoration:none; color:#1c1e21; font-size:20px; display:inline-flex; align-items:center;">
              <i class="fas fa-chevron-left"></i>
            </a>
          </div>

          <!-- Title & Description -->
          <h1 style="font-size:22px; font-weight:700; color:#1c1e21; margin:0 0 8px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Confirm your account</h1>
          <p style="font-size:14px; color:#65676b; margin:0 0 20px 0; line-height:1.4;">We sent a code via ${destinationType}. Enter that code to confirm your account.</p>

          <form id="confirm-account-form" class="auth-form" novalidate style="width:100%;">
            <div class="auth-input-wrapper" style="margin-bottom:20px; position:relative; width:100%;">
              <input type="text" id="confirm-otp-input" placeholder="Enter code" required style="width:100%; height:48px; background:#fff; border:1px solid #ced0d4; border-radius:8px; padding:0 16px; font-size:15px; box-sizing:border-box; color:#1c1e21; outline:none; transition:border-color 0.15s ease-in-out;" onfocus="this.style.borderColor='#1877f2'" onblur="this.style.borderColor='#ced0d4'">
            </div>

            <!-- Continue Button -->
            <button type="submit" style="width:100%; height:48px; background:#1877f2; color:#fff; border:none; border-radius:24px; font-size:16px; font-weight:600; cursor:pointer; margin-bottom:12px; display:flex; align-items:center; justify-content:center; outline:none;">Continue</button>

            <!-- Didn't get code -->
            <button type="button" id="btn-resend-otp" style="width:100%; height:48px; background:#fff; color:#1c1e21; border:1px solid #ced0d4; border-radius:24px; font-size:15px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; outline:none; transition:background 0.2s;" onmouseover="this.style.background='#f2f3f5'" onmouseout="this.style.background='#fff'">Didn't get a code?</button>
            
            <!-- Resend success status message -->
            <div id="resend-status-msg" style="font-size:13px; color:#42b72a; text-align:center; margin-top:8px; display:none; font-weight:500;">
              <i class="fas fa-check-circle"></i> Code resent successfully!
            </div>
          </form>
        </div>

        <!-- Footer section matching facebook style exactly -->
        <div style="background:#fff; padding:40px 20px 24px; text-align:center; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; width:100%; box-sizing:border-box;">
          <!-- Languages -->
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px 16px; font-size:12px; color:#8a8d91; margin-bottom:16px; max-width:980px; margin-left:auto; margin-right:auto;">
            <span style="color:#737373;">English (US)</span>
            <a href="#" style="color:#8a8d91; text-decoration:none;">বাংলা</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">অসমীয়া</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">हिन्दी</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">নেপালী</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Bahasa Indonesia</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">العربية</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">More languages...</a>
          </div>
          
          <div style="border-top:1px solid #dddfe2; margin:16px auto; max-width:980px;"></div>

          <!-- Bottom links -->
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px 16px; font-size:12px; color:#8a8d91; line-height:1.6; max-width:980px; margin-left:auto; margin-right:auto; margin-bottom:16px;">
            <a href="#" style="color:#8a8d91; text-decoration:none;">Sign Up</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Log In</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Messenger</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Facebook Lite</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Video</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta Pay</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta Store</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta Quest</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Ray-Ban Meta</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Meta AI</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Instagram</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Threads</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Privacy Policy</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Privacy Center</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">About</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Create ad</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Create Page</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Developers</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Careers</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Cookies</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Ad choices <i class="fas fa-play" style="font-size:8px;"></i></a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Terms</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Help</a>
            <a href="#" style="color:#8a8d91; text-decoration:none;">Contact Uploading & Non-Users</a>
          </div>
          
          <div style="font-size:12px; color:#737373; max-width:980px; margin:0 auto; text-align:left;">
            Meta © 2026
          </div>
        </div>
      </div>
    `;
  }

  // Save the user data permanently after successful OTP validation
  function _completeTempSignup(formData) {
    // This is now handled entirely by the backend via the confirm-account-form submit.
    // Kept as a no-op fallback for compatibility.
    console.warn('[Auth] _completeTempSignup called — should use API signup flow instead.');
  }

  // ---------------------------------------------------------------------------
  // Handle Signup — sends OTP via backend
  // ---------------------------------------------------------------------------
  function handleSignup(formData) {
    const { email } = formData;
    const identifier = email ? email.trim() : '';
    if (!identifier) return false;

    // Save form data temporarily for the confirm page
    sessionStorage.setItem('hb_temp_signup_data', JSON.stringify(formData));
    sessionStorage.setItem('hb_temp_signup_email', identifier);

    // Show button loading state
    const submitBtn = document.getElementById('btn-signup-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending code...'; }

    function _onSendError(err) {
      if (err.status === 409) {
        const emailEl = document.getElementById('signup-email');
        if (emailEl) {
          const wrapper = emailEl.closest('.auth-input-wrapper');
          if (wrapper) {
            wrapper.querySelectorAll('.inline-error-message').forEach(el => el.remove());
            wrapper.classList.add('has-error');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'inline-error-message';
            errorDiv.style.cssText = 'color: #f02849; font-size: 13px; margin-top: 6px; display: flex; align-items: center; gap: 6px; font-weight: 400;';
            errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${err.message}`;
            wrapper.parentNode.appendChild(errorDiv);
          }
        }
      } else if (err.status === 429) {
        Utils.showToast(err.message || 'Too many requests. Please wait a few minutes.', 'error');
      } else {
        Utils.showToast(err.message || 'Failed to send code. Please try again.', 'error');
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }
    }

    // EMAIL only: Use Resend/SMTP OTP via backend
    Api.sendOtp(identifier, 'signup')
      .then(() => {
        _showCustomBlackToast('Code successfully sent', 'Your verification code was sent to your email.');
        showConfirmAccountPage(identifier);
      })
      .catch(err => _onSendError(err))
      .finally(() => {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }
      });

    return true;
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------
  function logout() {
    _closeModal();

    const modal = document.createElement('div');
    modal.className = 'auth-modal-overlay';
    modal.id = 'auth-modal';
    modal.innerHTML = `
      <div class="auth-modal" style="max-width:400px; padding:24px; border-radius:16px; background:#fff; text-align:center;">
        <div style="font-size:40px; color:#f02849; margin-bottom:16px;"><i class="fas fa-sign-out-alt"></i></div>
        <h3 class="auth-modal__title" style="font-size:20px; font-weight:700; color:#1c1e21; margin-bottom:8px;">Log Out?</h3>
        <p style="font-size:15px; color:#65676b; margin-bottom:24px; line-height:1.4;">Are you sure you want to log out of Handbook?</p>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button class="auth-btn auth-btn--outline" data-action="close-modal" style="border:1px solid #ced0d4; background:#f0f2f5; color:#1c1e21; border-radius:24px; padding:10px 24px; font-size:15px; font-weight:600; cursor:pointer;">Cancel</button>
          <button class="auth-btn auth-btn--primary" id="confirm-logout-btn" style="background:#1877f2; color:#fff; border:none; border-radius:24px; padding:10px 24px; font-size:15px; font-weight:600; cursor:pointer;">Log Out</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));

    const confirmBtn = modal.querySelector('#confirm-logout-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        _closeModal();
        const user = getCurrentUser();
        if (user) {
          Store.update('users', user.id, {
            isOnline: false,
            lastSeen: new Date().toISOString()
          });
        }
        Store.clearSession();
        Utils.showToast('You have been logged out', 'info');
        document.dispatchEvent(new CustomEvent('auth:logout'));
        window.location.hash = '#login';
        showLoginPage();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Session Helpers
  // ---------------------------------------------------------------------------
  function isLoggedIn() {
    return Store.getCurrentUser() !== null;
  }

  function getCurrentUser() {
    return Store.getCurrentUser();
  }

  // ---------------------------------------------------------------------------
  // Password Strength Checker
  // ---------------------------------------------------------------------------
  function checkPasswordStrength(password) {
    if (!password || password.length < 6) return 'weak';
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    if (score <= 1) return 'weak';
    if (score <= 3) return 'medium';
    return 'strong';
  }

  function _updatePasswordStrength(password) {
    const meter = document.querySelector('.password-strength-meter');
    const label = document.querySelector('.password-strength-label');
    if (!meter || !label) return;

    const strength = checkPasswordStrength(password);
    const configs = {
      weak: { width: '33%', color: '#f02849', text: 'Weak' },
      medium: { width: '66%', color: '#f7b928', text: 'Medium' },
      strong: { width: '100%', color: '#42b72a', text: 'Strong' }
    };

    const config = configs[strength];
    meter.style.width = password.length === 0 ? '0%' : config.width;
    meter.style.backgroundColor = config.color;
    label.textContent = password.length === 0 ? '' : config.text;
    label.style.color = config.color;
  }

  function _shakeForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 600);
  }

  // ---------------------------------------------------------------------------
  // Render Login Page HTML (Facebook-style)
  // ---------------------------------------------------------------------------
  function renderLoginPage() {
    const savedAccounts = _getSavedAccounts();

    const savedAccountCards = savedAccounts.map(acct => `
      <div class="saved-account-card" data-action="saved-account-login" data-user-id="${acct.id}">
        <div style="position:relative;flex-shrink:0;">
          <img src="${acct.avatar}" alt="${Utils.sanitizeHTML(acct.fullName)}" class="saved-account-card__avatar">
          ${acct.savedPw
            ? `<span style="position:absolute;bottom:-2px;right:-2px;background:#42b72a;color:#fff;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;border:2px solid #fff;"><i class="fas fa-check"></i></span>`
            : `<span style="position:absolute;bottom:-2px;right:-2px;background:#1877f2;color:#fff;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;border:2px solid #fff;"><i class="fas fa-lock"></i></span>`
          }
        </div>
        <div style="flex:1;min-width:0;">
          <span class="saved-account-card__name">${Utils.sanitizeHTML(acct.fullName)}</span>
          ${acct.savedPw
            ? `<div style="font-size:11px;color:#42b72a;margin-top:2px;"><i class="fas fa-bolt" style="font-size:9px;"></i> Tap to login instantly</div>`
            : `<div style="font-size:11px;color:#65676b;margin-top:2px;">Password required</div>`
          }
        </div>
        <span class="saved-account-card__arrow"><i class="fas fa-chevron-right"></i></span>
      </div>
    `).join('');

    const hasAccounts = savedAccounts.length > 0;

    const rightContent = hasAccounts ? `
      <div class="auth-card auth-card-visible" role="main">
        <div class="auth-card-header">
          <h2 class="auth-card-title">Log in to Handbook</h2>
          <button class="auth-settings-btn" data-action="open-settings" title="Settings">
            <i class="fas fa-cog"></i>
          </button>
        </div>

        <div class="saved-accounts-list">
          ${savedAccountCards}
        </div>

        <button class="auth-btn auth-btn--outline auth-btn--use-another" data-action="show-email-login">
          Use another profile
        </button>

        <div class="auth-card-divider"></div>

        <button class="auth-btn auth-btn--success" data-action="show-signup">Create new account</button>

        <div class="auth-meta-brand" style="display:flex; flex-direction:row; justify-content:center; align-items:center; gap:6px; margin-top:20px;">
          <img src="img/logo.png?v=5" class="auth-meta-brand__icon" style="width:16px;height:16px;border-radius:4px;object-fit:cover;" alt="Logo">
          <span style="font-size:15px;font-weight:500;color:#65676b;letter-spacing:0.3px;">Handbook</span>
        </div>
      </div>
    ` : `
      <div class="auth-card auth-card-visible" role="main">
        <div class="auth-card-header">
          <h2 class="auth-card-title">Log in to Handbook</h2>
          <button class="auth-settings-btn" data-action="open-settings" title="Settings">
            <i class="fas fa-cog"></i>
          </button>
        </div>

        <form id="login-form" class="auth-form" novalidate>
          <div class="auth-input-group">
            <input type="email" id="login-email" class="auth-input" placeholder="Email address" required autocomplete="email">
          </div>
          <div class="auth-input-group">
            <input type="password" id="login-password" class="auth-input" placeholder="Password" required autocomplete="current-password">
            <button type="button" class="toggle-password" aria-label="Toggle password"><i class="fas fa-eye"></i></button>
          </div>
          <label class="auth-checkbox" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:14px;color:#1c1e21;cursor:pointer;">
            <input type="checkbox" id="save-password-checkbox" checked style="width:16px;height:16px;accent-color:#1877f2;cursor:pointer;">
            Remember password
          </label>
          <button type="submit" class="auth-btn auth-btn--primary">Log In</button>
          <a href="#" class="auth-forgot-link" data-action="forgot-password">Forgotten password?</a>
        </form>

        <div class="auth-card-divider"></div>

        <button class="auth-btn auth-btn--success" data-action="show-signup">Create new account</button>

        <div class="auth-meta-brand" style="display:flex; flex-direction:row; justify-content:center; align-items:center; gap:6px; margin-top:20px;">
          <img src="img/logo.png?v=5" class="auth-meta-brand__icon" style="width:16px;height:16px;border-radius:4px;object-fit:cover;" alt="Logo">
          <span style="font-size:15px;font-weight:500;color:#65676b;letter-spacing:0.3px;">Handbook</span>
        </div>
      </div>
    `;

    return `
      <div class="auth-page">
        <div class="auth-container">
          <!-- Left Side: Hero -->
          <div class="auth-hero">
            <div class="auth-hero__logo">
              <img src="img/logo.png?v=4" class="auth-hero__logo-icon" style="background: transparent; border-radius: 12px; object-fit: cover;" alt="Handbook Logo">
            </div>
            <div class="auth-hero__image">
              <img src="img/hero.png" alt="Handbook - Connect with the world" class="auth-hero__img">
            </div>
            <h1 class="auth-hero__title">
              Explore<br>the<br>things<br><span class="auth-hero__highlight">you love</span>.
            </h1>
          </div>

          <!-- Right Side: Login/Accounts -->
          <div class="auth-form-section">
            ${rightContent}
          </div>
        </div>

        <footer class="auth-footer">
          <div class="auth-footer__langs">
            <span>English (UK)</span>
            <a href="#">বাংলা</a>
            <a href="#">অসমীয়া</a>
            <a href="#">हिन्दी</a>
            <a href="#">नेपाली</a>
            <a href="#">Bahasa Indonesia</a>
            <a href="#">العربية</a>
            <a href="#">More languages...</a>
          </div>
          <div class="auth-footer__bottom">
            <span>&copy; ${new Date().getFullYear()} Handbook</span>
          </div>
        </footer>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Render Signup Page HTML
  // ---------------------------------------------------------------------------
  function renderSignupPage() {
    // Generate month/day/year options
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthOpts = months.map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    const dayOpts = Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    const currentYear = new Date().getFullYear();
    const yearOpts = Array.from({length:100},(_,i)=>`<option value="${currentYear-i}">${currentYear-i}</option>`).join('');

    return `
      <div class="auth-page" style="background:#dfe3ee;">
        <div style="max-width:480px;margin:0 auto;padding:20px 16px;min-height:100vh;">
          
          <!-- Back Arrow -->
          <div style="margin-bottom:12px;">
            <a href="#" data-action="show-login" style="text-decoration:none;color:#1c1e21;font-size:24px;display:inline-block;padding:8px 0;">
              <i class="fas fa-arrow-left"></i>
            </a>
          </div>

          <!-- Logo -->
          <div style="margin-bottom:8px;">
            <img src="img/logo.png?v=5" style="width:32px;height:32px;border-radius:6px;object-fit:cover;" alt="Logo">
          </div>

          <!-- Title -->
          <h1 style="font-size:24px;font-weight:700;color:#1c1e21;margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Get started on Handbook</h1>
          <p style="font-size:14px;color:#65676b;margin:0 0 24px 0;line-height:1.4;">Create an account to connect with friends, family and communities of people who share your interests.</p>

          <form id="signup-form" class="auth-form" novalidate>
            
            <!-- Name -->
            <label style="font-size:15px;font-weight:600;color:#1c1e21;display:block;margin-bottom:8px;">Name</label>
            <div class="name-row-container" style="margin-bottom:20px;">
              <div style="display:flex;gap:10px;">
                <div class="auth-input-wrapper" style="flex:1;">
                  <input type="text" id="signup-firstname" class="auth-input-fb" placeholder="First name" required autocomplete="given-name">
                  <span class="auth-input-label-floating">First name</span>
                </div>
                <div class="auth-input-wrapper" style="flex:1;">
                  <input type="text" id="signup-lastname" class="auth-input-fb" placeholder="Last name" required autocomplete="family-name">
                  <span class="auth-input-label-floating">Last name</span>
                </div>
              </div>
            </div>

            <!-- Birthday -->
            <label style="font-size:15px;font-weight:600;color:#1c1e21;display:flex;align-items:center;gap:6px;margin-bottom:8px;">
              Birthday
              <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;border:1.5px solid #65676b;font-size:11px;color:#65676b;cursor:help;" title="Providing your date of birth helps make sure you get the right Handbook experience for your age.">?</span>
            </label>
            <div class="birthday-row-container" style="margin-bottom:20px;">
              <div style="display:flex;gap:10px;width:100%;">
                <select id="signup-birth-month" class="auth-select-fb" style="flex:1.3;background:#fff;border:1px solid #dddfe2;border-radius:12px;padding:14px 12px;font-size:15px;color:#1c1e21;appearance:auto;cursor:pointer;">
                  <option value="" disabled selected>Month</option>
                  ${monthOpts}
                </select>
                <select id="signup-birth-day" class="auth-select-fb" style="flex:0.8;background:#fff;border:1px solid #dddfe2;border-radius:12px;padding:14px 12px;font-size:15px;color:#1c1e21;appearance:auto;cursor:pointer;">
                  <option value="" disabled selected>Day</option>
                  ${dayOpts}
                </select>
                <select id="signup-birth-year" class="auth-select-fb" style="flex:1;background:#fff;border:1px solid #dddfe2;border-radius:12px;padding:14px 12px;font-size:15px;color:#1c1e21;appearance:auto;cursor:pointer;">
                  <option value="" disabled selected>Year</option>
                  ${yearOpts}
                </select>
              </div>
            </div>

            <!-- Gender -->
            <label style="font-size:15px;font-weight:600;color:#1c1e21;display:flex;align-items:center;gap:6px;margin-bottom:8px;">
              Gender
              <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;border:1.5px solid #65676b;font-size:11px;color:#65676b;cursor:help;" title="You can change who sees your gender later.">?</span>
            </label>
            <div id="gender-field-container" style="margin-bottom:20px;">
              <select id="signup-gender" class="auth-select-fb" style="width:100%;background:#fff;border:1px solid #dddfe2;border-radius:12px;padding:14px 16px;font-size:15px;color:#1c1e21;appearance:auto;cursor:pointer;">
                <option value="" disabled selected>Select your gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <!-- Email address -->
            <label style="font-size:15px;font-weight:600;color:#1c1e21;display:block;margin-bottom:8px;">Email address</label>
            <div class="auth-input-wrapper" style="margin-bottom:4px;">
              <input type="email" id="signup-email" class="auth-input-fb" placeholder="Email address" required autocomplete="email">
              <span class="auth-input-label-floating">Email address</span>
            </div>
            <p style="font-size:12px;color:#65676b;margin:0 0 20px 0;">You'll use this email to log in and receive notifications.</p>

            <!-- Password -->
            <label style="font-size:15px;font-weight:600;color:#1c1e21;display:block;margin-bottom:8px;">Password</label>
            <div class="auth-input-wrapper" style="margin-bottom:16px;">
              <input type="password" id="signup-password" class="auth-input-fb" placeholder="Password" required autocomplete="new-password" minlength="6">
              <span class="auth-input-label-floating">Password</span>
              <button type="button" class="toggle-password" aria-label="Toggle password" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;color:#65676b;cursor:pointer;padding:4px;"><i class="fas fa-eye"></i></button>
            </div>

            <div class="password-strength" style="margin-bottom:16px;">
              <div class="password-strength-bar">
                <div class="password-strength-meter"></div>
              </div>
              <span class="password-strength-label"></span>
            </div>

            <!-- Terms -->
            <p style="font-size:12px;color:#65676b;margin:0 0 8px 0;line-height:1.5;">People who use our service may have uploaded your contact information to Handbook. <a href="#" style="color:#1877f2;text-decoration:none;">Learn more</a>.</p>
            <p style="font-size:12px;color:#65676b;margin:0 0 20px 0;line-height:1.5;">By tapping Submit, you agree to create an account and to Handbook's <a href="#" style="color:#1877f2;text-decoration:none;">Terms</a>, <a href="#" style="color:#1877f2;text-decoration:none;">Privacy Policy</a> and <a href="#" style="color:#1877f2;text-decoration:none;">Cookies Policy</a>.</p>
            <p style="font-size:11px;color:#65676b;margin:0 0 20px 0;line-height:1.5;">The <a href="#" style="color:#1877f2;text-decoration:none;">Privacy Policy</a> describes the ways we can use the information we collect when you create an account. For example, we use this information to provide, personalise and improve our products, including ads.</p>

            <!-- Submit Button -->
            <button type="submit" style="width:100%;padding:14px;background:#1877f2;color:#fff;border:none;border-radius:24px;font-size:17px;font-weight:600;cursor:pointer;margin-bottom:12px;">Submit</button>

            <!-- Already have account -->
            <button type="button" data-action="show-login" style="width:100%;padding:14px;background:#fff;color:#1c1e21;border:1px solid #dddfe2;border-radius:24px;font-size:15px;font-weight:500;cursor:pointer;">I already have an account</button>
          </form>

          <!-- Footer Languages -->
          <div style="margin-top:30px;padding-top:16px;border-top:1px solid #ced0d4;display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center;">
            <span style="font-size:12px;color:#65676b;">English (UK)</span>
            <a href="#" style="font-size:12px;color:#1877f2;text-decoration:none;">বাংলা</a>
            <a href="#" style="font-size:12px;color:#1877f2;text-decoration:none;">हिन्दी</a>
            <a href="#" style="font-size:12px;color:#1877f2;text-decoration:none;">नेपाली</a>
            <a href="#" style="font-size:12px;color:#1877f2;text-decoration:none;">العربية</a>
            <a href="#" style="font-size:12px;color:#1877f2;text-decoration:none;">More languages...</a>
          </div>

        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Inject Auth-Specific Styles (Facebook-inspired)
  // ---------------------------------------------------------------------------
  function _injectAuthStyles() {
    if (document.getElementById('auth-styles')) {
      document.getElementById('auth-styles').remove();
    }

    const style = document.createElement('style');
    style.id = 'auth-styles';
    style.textContent = `
      /* ===== Auth Page - Facebook Style ===== */
      .auth-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: #f0f2f5;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #1c1e21;
      }

      .auth-container {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 32px 20px;
        gap: 80px;
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
      }

      /* ===== Left Side: Hero ===== */
      .auth-hero {
        flex: 1;
        max-width: 520px;
        position: relative;
      }

      .auth-hero__logo {
        margin-bottom: 20px;
      }

      .auth-hero__logo-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        background: #1877f2;
        color: #fff;
        border-radius: 14px;
        font-size: 26px;
      }

      .auth-hero__image {
        position: relative;
        margin: 0 0 10px;
        max-width: 620px;
      }

      .auth-hero__img {
        width: 100%;
        height: auto;
        max-height: 620px;
        object-fit: contain;
        mix-blend-mode: multiply;
        transform: scale(1.1);
        transform-origin: center center;
      }

      .auth-hero__title {
        font-size: 42px;
        font-weight: 800;
        line-height: 1.15;
        color: #1c1e21;
        margin: 0;
        letter-spacing: -0.5px;
      }

      .auth-hero__highlight {
        color: #1877f2;
      }

      /* ===== Right Side: Form Section ===== */
      .auth-form-section {
        flex: 0 0 auto;
        width: 400px;
      }

      .auth-card {
        background: #fff;
        border-radius: 12px;
        padding: 20px 24px 24px 24px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.1);
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.4s ease, transform 0.4s ease;
      }

      .auth-card-visible {
        opacity: 1;
        transform: translateY(0);
      }

      .auth-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .auth-card-title {
        font-size: 20px;
        font-weight: 400;
        color: #1c1e21;
        margin: 0;
      }

      .auth-card-subtitle {
        font-size: 15px;
        color: #606770;
        margin: 0 0 16px;
        border-bottom: 1px solid #dadde1;
        padding-bottom: 16px;
      }

      .auth-settings-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid #dadde1;
        background: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #606770;
        font-size: 16px;
        transition: all 0.2s;
      }
      .auth-settings-btn:hover {
        background: #f0f2f5;
        color: #1c1e21;
      }

      /* ===== Saved Account Cards (like Facebook) ===== */
      .saved-accounts-list {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-bottom: 12px;
      }

      .saved-account-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
        text-decoration: none;
      }
      .saved-account-card:hover {
        background: #f0f2f5;
      }

      .saved-account-card__avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }

      .saved-account-card__name {
        flex: 1;
        font-size: 17px;
        font-weight: 500;
        color: #1c1e21;
      }

      .saved-account-card__arrow {
        color: #bec3c9;
        font-size: 14px;
      }

      /* ===== Auth Buttons ===== */
      .auth-btn {
        width: 100%;
        padding: 12px 16px;
        border: none;
        border-radius: 8px;
        font-size: 17px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        text-align: center;
        display: block;
      }

      .auth-btn--primary {
        background: #1877f2;
        color: #fff;
      }
      .auth-btn--primary:hover {
        background: #166fe5;
      }

      .auth-btn--success {
        background: #42b72a;
        color: #fff;
        font-size: 15px;
        padding: 10px 16px;
      }
      .auth-btn--success:hover {
        background: #36a420;
      }

      .auth-btn--outline {
        background: #fff;
        color: #1c1e21;
        border: 1px solid #dadde1;
        font-weight: 500;
        font-size: 15px;
      }
      .auth-btn--outline:hover {
        background: #f0f2f5;
      }

      .auth-btn--use-another {
        margin-bottom: 0;
      }

      /* ===== Form Elements ===== */
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .auth-form-row {
        display: flex;
        gap: 10px;
      }
      .auth-form-row .auth-input-group {
        flex: 1;
      }

      .auth-input-group {
        position: relative;
      }

      .auth-input {
        width: 100%;
        padding: 14px 16px;
        font-size: 17px;
        border: 1px solid #dddfe2;
        border-radius: 6px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: #f5f6f7;
        box-sizing: border-box;
        font-family: inherit;
        color: #1c1e21;
      }
      .auth-input:focus {
        border-color: #1877f2;
        box-shadow: 0 0 0 2px rgba(24,119,242,0.2);
        background: #fff;
      }
      .auth-input::placeholder {
        color: #90949c;
      }

      /* Facebook Input Style with Floating Labels */
      .auth-input-wrapper {
        position: relative;
        background: #fff;
        border: 1px solid #dddfe2;
        border-radius: 12px;
        transition: all 0.2s;
        box-sizing: border-box;
      }
      .auth-input-wrapper:focus-within {
        border-color: #1877f2;
        box-shadow: 0 0 0 2px rgba(24,119,242,0.2);
      }
      .auth-input-fb {
        width: 100%;
        border: none;
        background: transparent;
        outline: none;
        padding: 14px 16px;
        font-size: 15px;
        color: #1c1e21;
        box-sizing: border-box;
        font-family: inherit;
        line-height: 1.4;
      }
      .auth-input-fb::placeholder {
        color: #8d949e;
        opacity: 1;
      }
      .auth-input-fb:focus::placeholder {
        color: #c0c3c9;
      }
      .auth-input-label-floating {
        display: none;
      }

      /* Error states */
      .auth-input-wrapper.has-error {
        border-color: #f02849 !important;
        background: #fff3f5 !important;
      }
      .auth-input-wrapper.has-error .auth-input-label-floating {
        color: #f02849 !important;
        opacity: 1 !important;
      }
      .auth-input-wrapper.has-error .auth-input-fb {
        color: #f02849 !important;
      }
      .auth-input-wrapper.has-error .auth-input-fb::placeholder {
        color: #f02849 !important;
      }

      .auth-select-fb.has-error {
        border-color: #f02849 !important;
        background: #fff3f5 !important;
        color: #f02849 !important;
      }

      .auth-input-label {
        display: block;
        font-size: 13px;
        color: #606770;
        margin-bottom: 4px;
        font-weight: 500;
      }

      .toggle-password {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        cursor: pointer;
        color: #90949c;
        font-size: 16px;
        padding: 4px;
        transition: color 0.2s;
      }
      .toggle-password:hover { color: #1c1e21; }

      /* ===== Divider ===== */
      .auth-card-divider {
        height: 1px;
        background: #dadde1;
        margin: 16px 0;
      }

      /* ===== Forgot Link ===== */
      .auth-forgot-link {
        text-align: center;
        font-size: 14px;
        color: #1877f2;
        text-decoration: none;
        display: block;
      }
      .auth-forgot-link:hover {
        text-decoration: underline;
      }

      /* ===== Meta Brand (bottom of card) ===== */
      .auth-meta-brand {
        text-align: center;
        margin-top: 16px;
        font-size: 14px;
        color: #65676b;
        font-weight: 500;
      }
      .auth-meta-brand__icon {
        font-size: 16px;
      }

      .auth-meta-link {
        text-align: center;
        margin-top: 12px;
      }
      .auth-meta-link a {
        font-size: 14px;
        color: #1877f2;
        text-decoration: none;
      }
      .auth-meta-link a:hover { text-decoration: underline; }

      /* ===== Password Prompt ===== */
      .auth-prompt-user {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        padding: 16px 0;
      }
      .auth-prompt-avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        object-fit: cover;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .auth-prompt-name {
        font-size: 18px;
        font-weight: 600;
        color: #1c1e21;
      }

      /* ===== Password Strength ===== */
      .password-strength {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: -4px;
      }
      .password-strength-bar {
        flex: 1;
        height: 4px;
        background: #e4e6eb;
        border-radius: 4px;
        overflow: hidden;
      }
      .password-strength-meter {
        height: 100%;
        width: 0%;
        border-radius: 4px;
        transition: width 0.3s, background-color 0.3s;
      }
      .password-strength-label {
        font-size: 12px;
        font-weight: 600;
        min-width: 55px;
      }

      /* ===== Checkbox ===== */
      .auth-checkbox-group {
        margin-top: -4px;
      }
      .auth-checkbox-label {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 13px;
        color: #606770;
        cursor: pointer;
        line-height: 1.4;
      }
      .auth-checkbox-label input[type="checkbox"] {
        margin-top: 2px;
        accent-color: #1877f2;
      }
      .auth-link {
        color: #1877f2;
        text-decoration: none;
      }
      .auth-link:hover { text-decoration: underline; }

      /* ===== Remove Accounts Modal ===== */
      .auth-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(255,255,255,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s;
      }
      .auth-modal-overlay.active {
        opacity: 1;
      }

      .auth-modal {
        background: #fff;
        border-radius: 12px;
        width: 520px;
        max-width: 95vw;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        overflow: hidden;
      }

      .auth-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px 16px;
        border-bottom: 1px solid #dadde1;
      }

      .auth-modal__title {
        font-size: 20px;
        font-weight: 700;
        color: #1c1e21;
        margin: 0;
      }

      .auth-modal__close {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: none;
        background: #e4e6eb;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #606770;
        font-size: 16px;
        transition: background 0.2s;
      }
      .auth-modal__close:hover {
        background: #d8dadf;
      }

      .auth-modal__body {
        padding: 16px 24px 24px;
      }

      .auth-modal__account {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid #f0f2f5;
      }
      .auth-modal__account:last-of-type {
        border-bottom: none;
      }

      .auth-modal__account-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .auth-modal__account-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
      }

      .auth-modal__account-details {
        display: flex;
        flex-direction: column;
      }

      .auth-modal__account-name {
        font-size: 15px;
        font-weight: 600;
        color: #1c1e21;
      }

      .auth-modal__account-label {
        font-size: 13px;
        color: #65676b;
      }

      .auth-modal__remove-btn {
        padding: 6px 16px;
        border: 1px solid #dadde1;
        border-radius: 6px;
        background: #fff;
        font-size: 14px;
        font-weight: 600;
        color: #1c1e21;
        cursor: pointer;
        transition: background 0.2s;
      }
      .auth-modal__remove-btn:hover {
        background: #f0f2f5;
      }

      .auth-modal__info {
        margin-top: 16px;
        font-size: 13px;
        color: #65676b;
      }

      .auth-modal__learn-more {
        color: #1877f2;
        text-decoration: none;
        font-weight: 500;
      }
      .auth-modal__learn-more:hover { text-decoration: underline; }

      .auth-modal__empty {
        text-align: center;
        padding: 24px 0;
        color: #65676b;
        font-size: 15px;
      }

      /* ===== Footer ===== */
      .auth-footer {
        padding: 20px 32px;
        border-top: 1px solid #dadde1;
        text-align: center;
      }

      .auth-footer__langs {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        font-size: 12px;
        color: #65676b;
        margin-bottom: 12px;
      }
      .auth-footer__langs a {
        color: #1877f2;
        text-decoration: none;
      }
      .auth-footer__langs a:hover { text-decoration: underline; }

      .auth-footer__bottom {
        font-size: 12px;
        color: #90949c;
      }

      /* ===== Shake Animation ===== */
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
        20%, 40%, 60%, 80% { transform: translateX(6px); }
      }
      .shake { animation: shake 0.6s ease-in-out; }

      /* ===== Responsive ===== */
      @media (max-width: 900px) {
        .auth-container {
          flex-direction: column;
          gap: 24px;
          padding: 20px 16px;
        }
        .auth-hero {
          max-width: 100%;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .auth-hero__title {
          font-size: 28px;
        }
        .auth-hero__image {
          max-width: 300px;
        }
        .auth-form-section {
          width: 100%;
          max-width: 400px;
        }
      }

      /* ===== Mobile Phone Layout (Facebook-style) ===== */
      @media (max-width: 600px) {
        .auth-page {
          background: #fff !important;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .auth-container {
          flex-direction: column;
          gap: 0;
          padding: 0;
          max-width: 100%;
          flex: 1;
        }

        /* Hide hero image and text on mobile */
        .auth-hero__image,
        .auth-hero__title {
          display: none !important;
        }

        /* Show only centered logo */
        .auth-hero {
          max-width: 100%;
          padding: 40px 0 20px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #fff;
        }
        .auth-hero__logo {
          margin: 0 auto;
        }
        .auth-hero__logo-icon {
          width: 56px !important;
          height: 56px !important;
          border-radius: 14px !important;
        }

        /* Full width card, no shadow, no border-radius */
        .auth-form-section {
          width: 100%;
          max-width: 100%;
          padding: 0;
        }
        .auth-card {
          border-radius: 0;
          box-shadow: none;
          border-top: 1px solid #e4e6eb;
          padding: 24px 16px;
          background: #fff;
        }

        /* Mobile specific pill buttons and outline success button */
        .auth-card .auth-btn {
          border-radius: 24px !important;
          padding: 12px 16px !important;
          font-size: 15px !important;
        }
        .auth-card .auth-btn--success {
          background: #fff !important;
          color: #42b72a !important;
          border: 1.5px solid #42b72a !important;
        }
        .auth-card .auth-btn--success:hover {
          background: #f4fbf3 !important;
        }

        .auth-card .auth-btn--outline {
          border: 1px solid #ccd0d5 !important;
          background: #fff !important;
          color: #1c1e21 !important;
        }
        .auth-card .auth-btn--outline:hover {
          background: #f5f6f7 !important;
        }

        /* Footer: NO fixed position, scrolls at bottom */
        .auth-footer {
          padding: 32px 16px;
          border-top: 1px solid #e4e6eb;
          background: #fff;
          text-align: center;
          margin-top: auto; /* push to bottom of viewport if content is short */
          position: static !important;
        }
        .auth-footer__langs {
          gap: 8px 12px;
          font-size: 12px;
          max-width: 480px;
          margin: 0 auto 16px auto;
        }

        /* Modal */
        .auth-modal {
          border-radius: 12px 12px 0 0;
          position: fixed;
          bottom: 0;
          width: 100%;
          max-width: 100%;
        }
      }

      @media (max-width: 400px) {
        .auth-card {
          padding: 20px 12px;
        }
        .auth-form-row {
          flex-direction: column;
          gap: 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function _showCustomBlackToast(title, message) {
    const existing = document.getElementById('custom-black-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'custom-black-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      background: #1c1e21;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      max-width: 320px;
    `;

    toast.innerHTML = `
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px; color: #fff; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-check-circle" style="color: #42b72a; font-size: 15px;"></i>
        ${title}
      </div>
      <div style="font-size: 12px; color: #e4e6eb; line-height: 1.3;">
        ${message}
      </div>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init,
    showLoginPage,
    showSignupPage,
    handleSignup,
    handleLogin,
    logout,
    isLoggedIn,
    getCurrentUser,
    renderLoginPage,
    renderSignupPage,
    checkPasswordStrength,
    deleteAccount,
    showForgotPasswordPage,
    showChooseLoginMethodPage,
    showVerifyResetCodePage,
    showNewPasswordPage
  };
})();

// Expose globally
window.Auth = Auth;
