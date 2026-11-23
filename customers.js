const initialCustomers = [
  {key:'c-1',name:'Berger & Sohn GmbH',email:'buchhaltung@berger-sohn.de',customerId:'CUS-001',country:'Germany',street:'Hafenstraße 24',postal:'20457',city:'Hamburg',endpoint:'',balance:'€3,450.00',last:'Nov 22, 2026',color:'amber'},
  {key:'c-2',name:'Weber & Partner',email:'office@weber-partner.de',customerId:'CUS-002',country:'Germany',street:'Friedrichstraße 81',postal:'10117',city:'Berlin',endpoint:'',balance:'€1,890.00',last:'Nov 20, 2026',color:'violet'},
  {key:'c-3',name:'Kraftwerk Digital',email:'finance@kraftwerk.digital',customerId:'CUS-003',country:'Germany',street:'Schanzenstraße 6',postal:'20357',city:'Hamburg',endpoint:'',balance:'€5,200.00',last:'Nov 18, 2026',color:'blue'},
  {key:'c-4',name:'Medienhaus Nord',email:'invoice@medienhaus-nord.de',customerId:'CUS-004',country:'Germany',street:'Kieler Straße 12',postal:'24103',city:'Kiel',endpoint:'',balance:'€0.00',last:'Nov 16, 2026',color:'green'},
  {key:'c-5',name:'Schmidt Consulting',email:'billing@schmidt-consulting.de',customerId:'CUS-005',country:'Germany',street:'Leopoldstraße 50',postal:'80802',city:'Munich',endpoint:'',balance:'€0.00',last:'Nov 14, 2026',color:'pink'}
];
const storageKey='ledgerly-demo-customers-v1';
let customers;
try { customers=JSON.parse(localStorage.getItem(storageKey)) || initialCustomers; } catch { customers=initialCustomers; }
const rows=document.getElementById('customerRows');
const search=document.getElementById('searchInput');
const toast=document.getElementById('toast');
let toastTimer;
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2400);}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(customers));}catch{notify('Browser storage is unavailable. Changes are temporary.');}}
function render(){
  const query=search.value.trim().toLowerCase();
  const sort=document.getElementById('sortSelect').value;
  let list=customers.filter(c=>`${c.name} ${c.email} ${c.customerId}`.toLowerCase().includes(query));
  if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById('totalCount').textContent=customers.length;
  document.getElementById('tableCount').textContent=customers.length;
  document.getElementById('resultsText').textContent=`Showing ${list.length} of ${customers.length} customers`;
  rows.innerHTML=list.map(c=>`<tr><td><div class="person"><span class="company-avatar logo-${escapeHtml(c.color||'violet')}">${escapeHtml(c.name.charAt(0).toUpperCase())}</span><span class="company-copy"><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.city||c.country||'Customer')}</small></span></div></td><td class="email">${escapeHtml(c.email)}</td><td>${escapeHtml(c.customerId||'—')}</td><td class="open-balance ${c.balance==='€0.00'?'no-balance':''}">${escapeHtml(c.balance||'—')}</td><td class="last-date">${escapeHtml(c.last||'—')}</td><td><button class="row-menu" data-edit="${escapeHtml(c.key)}" aria-label="Edit ${escapeHtml(c.name)}">···</button></td></tr>`).join('');
  document.getElementById('emptyState').hidden=list.length!==0;
  rows.hidden=list.length===0;
  rows.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>openDrawer(customers.find(c=>c.key===button.dataset.edit))));
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
const drawer=document.getElementById('drawer');const scrim=document.getElementById('scrim');const form=document.getElementById('customerForm');
function openDrawer(customer){form.reset();document.getElementById('customerKey').value=customer?.key||'';document.getElementById('drawerTitle').textContent=customer?'Edit customer':'Add customer';if(customer){for(const key of ['name','email','customerId','country','street','postal','city','endpoint']){const field=form.elements[key];if(field)field.value=customer[key]||'';}}drawer.classList.add('open');scrim.classList.add('open');setTimeout(()=>document.getElementById('name').focus(),100);}
function closeDrawer(){drawer.classList.remove('open');scrim.classList.remove('open');}
document.getElementById('addCustomer').addEventListener('click',()=>openDrawer());
document.getElementById('emptyAdd').addEventListener('click',()=>openDrawer());
document.getElementById('closeDrawer').addEventListener('click',closeDrawer);
document.getElementById('cancelDrawer').addEventListener('click',closeDrawer);
scrim.addEventListener('click',closeDrawer);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDrawer();});
search.addEventListener('input',render);document.getElementById('sortSelect').addEventListener('change',render);
document.getElementById('filterButton').addEventListener('click',()=>notify('Customer filters will be added with invoice reporting.'));
document.getElementById('menu').addEventListener('click',()=>{document.getElementById('sidebar').classList.toggle('open');scrim.classList.toggle('open');});
form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form).entries());const key=data.customerKey||`c-${Date.now()}`;const customer={...data,key,color:['violet','amber','blue','green','pink'][customers.length%5],balance:'€0.00',last:'—'};const existing=customers.findIndex(c=>c.key===key);if(existing>=0){customer.balance=customers[existing].balance;customer.last=customers[existing].last;customer.color=customers[existing].color;customers[existing]=customer;}else customers.unshift(customer);persist();render();closeDrawer();notify(existing>=0?'Customer updated.':'Customer added to this browser.');});
render();
