const toast = document.getElementById('toast');
let toastTimer;
function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

document.getElementById('newInvoice').addEventListener('click', () => { location.href = './invoices.html?action=new'; });
document.getElementById('complianceSetup').addEventListener('click', () => { location.href = './settings.html'; });
document.getElementById('setupButton').addEventListener('click', () => { location.href = './settings.html'; });
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

const money = value => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR' }).format(Number(value)||0);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date = value => value ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00Z`)) : '—';
document.querySelector('.invoice-panel tbody').replaceChildren();
document.querySelector('.activity-list').innerHTML='<p class="workspace-empty">Loading workspace activity…</p>';
document.querySelectorAll('.stat-card .stat-value').forEach(node=>node.textContent='—');
async function loadOverview(){
  try {
    const [invoiceResponse, archiveResponse, validationResponse, me] = await Promise.all([
      window.LedgerlyAPI.json('/api/invoices'), window.LedgerlyAPI.json('/api/archive'),
      window.LedgerlyAPI.json('/api/validation'), window.LedgerlyAPI.request('/api/auth/me')
    ]);
    const invoices=invoiceResponse.items||[], archive=archiveResponse.items||[], validations=validationResponse.items||[];
    document.querySelector('.workspace-copy strong').textContent=me.workspace.name;
    document.querySelector('.workspace-avatar').textContent=me.workspace.name.trim().charAt(0).toUpperCase();
    document.querySelector('.profile-copy strong').textContent=me.user.email;
    document.querySelector('.profile-copy small').textContent=me.workspace.role;
    document.querySelector('.profile-avatar').textContent=me.user.email.slice(0,2).toUpperCase();
    document.querySelector('h1').innerHTML='Good morning <span class="wave">✦</span>';
    document.querySelector('.eyebrow').innerHTML=`<span class="live-dot"></span>${new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date()).toUpperCase()}`;
    const draftCount=invoices.filter(item=>(item.data?.status||'draft')==='draft').length;
    const accepted=validations.filter(item=>item.outcome==='accepted').length;
    const stats=document.querySelectorAll('.stat-card');
    [[`INVOICES IN WORKSPACE`,String(invoices.length),'Saved drafts and invoices'],[`DRAFTS`,String(draftCount),'Not yet issued'],[`ARCHIVED FILES`,String(archive.length),'Original files retained'],[`KO SIT ACCEPTED`,String(accepted),'Accepted validation runs']].forEach(([label,value,caption],index)=>{
      const card=stats[index];card.querySelector('.stat-caption').textContent=label;card.querySelector('.stat-value').textContent=value;card.querySelector('.stat-foot').textContent=caption;card.querySelector('.sparkline,.health-progress')?.remove();card.querySelector('.stat-menu')?.remove();
    });
    const tbody=document.querySelector('.invoice-panel tbody');
    tbody.innerHTML=invoices.slice(0,5).map(({data={},documentNumber})=>`<tr><td><span class="invoice-id">${safe(data.id||documentNumber)}</span></td><td><span class="customer-cell"><span class="company-logo logo-violet">${safe((data.customer||'—').charAt(0).toUpperCase())}</span><span>${safe(data.customer||data.buyer?.name||'—')}</span></span></td><td>${date(data.issueDate)}</td><td class="amount-cell">${money(data.amount)}</td><td><span class="status-badge draft"><i></i>${safe(data.status||'Draft')}</span></td><td></td></tr>`).join('');
    document.querySelector('.invoice-panel .table-footer').innerHTML=`<span>Showing <strong>${Math.min(invoices.length,5)}</strong> of <strong>${invoices.length}</strong> invoices</span>`;
    const activity=document.querySelector('.activity-list');activity.innerHTML=invoices.length?invoices.slice(0,4).map(({data={},documentNumber})=>`<div class="activity-item"><span class="activity-icon violet-bg">▤</span><div><p><strong>Invoice saved</strong><span class="activity-time">${date(data.issueDate)}</span></p><small>${safe(data.customer||'Customer')} · ${safe(data.id||documentNumber)}</small></div></div>`).join(''):'<p class="workspace-empty">No invoice activity yet. Create a draft to get started.</p>';
    document.querySelector('.compliance-status').innerHTML='<i></i>Setup required';
    document.querySelector('.compliance-card h3').textContent='Workspace readiness';
    document.querySelector('.compliance-card>p').textContent='Complete your business profile and validate your first invoice.';
  } catch(error) { announce(error.message||'Could not load workspace dashboard data.'); }
}
loadOverview();
