const authToast = document.getElementById('toast');
let authToastTimer;
function showMessage(message) {
  authToast.textContent = message;
  authToast.classList.add('show');
  clearTimeout(authToastTimer);
  authToastTimer = setTimeout(() => authToast.classList.remove('show'), 2800);
}

document.getElementById('togglePassword').addEventListener('click', (event) => {
  const password = document.getElementById('password');
  const isVisible = password.type === 'text';
  password.type = isVisible ? 'password' : 'text';
  event.currentTarget.textContent = isVisible ? 'Show' : 'Hide';
  event.currentTarget.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
});

document.getElementById('signInForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  if (!email.value.trim() || !email.validity.valid) {
    email.focus();
    showMessage('Enter a valid work email address.');
    return;
  }
  if (!password.value) {
    password.focus();
    showMessage('Enter your password to continue.');
    return;
  }
  const submit=form.querySelector('[type="submit"]'); submit.disabled=true;
  try {
    await window.LedgerlyAPI.json('/api/auth/login','POST',{email:email.value,password:password.value,remember:form.elements.remember.checked});
    location.assign('./index.html');
  } catch(error) { showMessage(error.message || 'Could not sign in. Start the Ledgerly API and try again.'); }
  finally { submit.disabled=false; }
});

document.getElementById('forgotLink').addEventListener('click', (event) => {
  event.preventDefault();
  showMessage('Password recovery will be connected with authentication.');
});
document.getElementById('ssoButton').addEventListener('click', () => showMessage('Google sign-in is not configured. Use email and password for this account.'));
