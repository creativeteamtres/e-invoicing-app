const setupToast = document.getElementById('toast');
let setupTimer;
document.getElementById('businessForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const required = [...form.querySelectorAll('[required]')];
  const invalid = required.find((field) => !field.value.trim());
  if (invalid) {
    invalid.focus();
    setupToast.textContent = 'Please complete the required business details.';
    setupToast.classList.add('show');
    clearTimeout(setupTimer);
    setupTimer = setTimeout(() => setupToast.classList.remove('show'), 2800);
    return;
  }
  setupToast.textContent = 'Business profile will be saved when the backend is connected.';
  setupToast.classList.add('show');
  clearTimeout(setupTimer);
  setupTimer = setTimeout(() => setupToast.classList.remove('show'), 2800);
});
