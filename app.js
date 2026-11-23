const toast = document.getElementById('toast');
let toastTimer;
function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

document.getElementById('newInvoice').addEventListener('click', () => announce('Invoice creation will be added in Phase 5.'));
document.getElementById('setupButton').addEventListener('click', () => announce('Business profile setup is planned for a later phase.'));
document.getElementById('complianceSetup').addEventListener('click', () => announce('Business profile setup is planned for a later phase.'));
document.getElementById('closeNotice').addEventListener('click', () => document.querySelector('.notice-banner').remove());

document.querySelectorAll('[data-page]').forEach((item) => {
  item.addEventListener('click', (event) => {
    if (item.getAttribute('href')?.includes('.html')) return;
    event.preventDefault();
    const page = item.dataset.page;
    document.querySelectorAll('.nav-item[data-page]').forEach((link) => link.classList.toggle('active', link.dataset.page === page));
    document.getElementById('breadcrumbPage').textContent = page;
    if (page !== 'Overview') announce(`${page} is coming in a later phase.`);
    closeMenu();
  });
});

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
function closeMenu() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
document.getElementById('menuButton').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
});
overlay.addEventListener('click', closeMenu);

document.querySelectorAll('.row-menu,.stat-menu,.pagination button:not(:disabled)').forEach((button) => {
  button.addEventListener('click', () => announce('This action will be available when the feature is implemented.'));
});
