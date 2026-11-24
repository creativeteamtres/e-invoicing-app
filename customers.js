let customers=[];
const rows=document.getElementById('customerRows');
const search=document.getElementById('searchInput');
const toast=document.getElementById('toast');
let toastTimer;
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2400);}

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
function openDrawer(customer){form.reset();document.getElementById('customerKey').value=customer?.key||'';document.getElementById('drawerTitle').textContent=customer?'Edit customer':'Add customer';if(customer){for(const key of ['name','email','customerId','country','street','postal','city','endpoint','endpointScheme']){const field=form.elements[key];if(field)field.value=customer[key]||'';}}drawer.classList.add('open');scrim.classList.add('open');setTimeout(()=>document.getElementById('name').focus(),100);}
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
form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form).entries()),key=data.customerKey,button=form.querySelector('[type="submit"]');button.disabled=true;try{const payload={...data,customerNumber:data.customerId};const customer=key?await window.LedgerlyAPI.json(`/api/customers/${key}`,'PUT',payload):await window.LedgerlyAPI.json('/api/customers','POST',payload);const existing=customers.findIndex(item=>item.key===customer.id);customer.key=customer.id;customer.color=customers[existing]?.color||['violet','amber','blue','green','pink'][customers.length%5];customer.balance=customers[existing]?.balance||'€0.00';customer.last=customers[existing]?.last||'—';if(existing>=0)customers[existing]=customer;else customers.unshift(customer);render();closeDrawer();notify(existing>=0?'Customer updated in the workspace.':'Customer added to the workspace.');}catch(error){notify(error.message||'Customer could not be saved to the workspace.');}finally{button.disabled=false;}});
window.LedgerlyAPI.json('/api/customers').then(({items=[]})=>{customers=items.map((item,index)=>({...item,customerId:item.customerNumber,key:item.id,color:['violet','amber','blue','green','pink'][index%5],balance:'€0.00',last:'—'}));render();}).catch(error=>notify(error.message||'Could not load workspace customers.'));
render();
