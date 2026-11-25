const shade=document.getElementById('shade'),drawer=document.getElementById('drawer'),toast=document.getElementById('toast');let toastTimer;
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2400);}
function close(){shade.classList.remove('open');drawer.classList.remove('open');}
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==tab.dataset.pane);}));
document.getElementById('archiveSearch').addEventListener('input',event=>{const query=event.target.value.toLowerCase();let count=0;document.querySelectorAll('#archiveRows tr').forEach(row=>{const show=row.textContent.toLowerCase().includes(query);row.hidden=!show;if(show)count++;});document.getElementById('empty').hidden=count>0;document.getElementById('empty').textContent=query?'No archived records match this search.':'No archived documents yet.';});
const datevDialog=document.getElementById('datevDialog'),datevForm=document.getElementById('datevForm');
document.getElementById('newExport').addEventListener('click',()=>{const today=new Date(),year=today.getFullYear(),month=String(today.getMonth()+1).padStart(2,'0'),monthEnd=String(new Date(year,today.getMonth()+1,0).getDate()).padStart(2,'0');datevForm.elements.fiscalYearStart.value=`${year}-01-01`;datevForm.elements.periodStart.value=`${year}-${month}-01`;datevForm.elements.periodEnd.value=`${year}-${month}-${monthEnd}`;document.getElementById('datevStatus').textContent='DATEV export requires at least one validated invoice in the selected date range.';datevDialog.showModal();});
document.getElementById('closeDatev').addEventListener('click',()=>datevDialog.close());document.getElementById('cancelDatev').addEventListener('click',()=>datevDialog.close());
datevForm.addEventListener('submit',async event=>{event.preventDefault();if(!datevForm.reportValidity())return;const fields=Object.fromEntries(new FormData(datevForm)),status=document.getElementById('datevStatus'),button=datevForm.querySelector('[type="submit"]');button.disabled=true;status.textContent='Preparing DATEV EXTF export…';try{const result=await window.LedgerlyAPI.json('/api/exports/datev','POST',{config:{consultantNumber:fields.consultantNumber,clientNumber:fields.clientNumber,accountingFramework:fields.accountingFramework,salesAccount:fields.salesAccount,salesContraAccount:fields.salesContraAccount,purchaseAccount:fields.purchaseAccount,purchaseContraAccount:fields.purchaseContraAccount,fiscalYearStart:fields.fiscalYearStart,periodStart:fields.periodStart,periodEnd:fields.periodEnd,taxKeys:{'S:19':fields.vatS19,'S:7':fields.vatS7,'E:0':fields.vatE0,'AE:19':fields.vatAE19,'G:0':fields.vatG0}}});const response=await fetch(`${window.LedgerlyAPI.base}${result.downloadUrl}`,{credentials:'include'});if(!response.ok)throw new Error('Export was created, but the download failed.');const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();URL.revokeObjectURL(url);status.textContent=`Created ${result.filename} with ${result.rowCount} booking row(s). Confirm account and VAT mappings with the tax advisor before import.`;notify('DATEV EXTF file created.');await loadExportHistory();}catch(error){const details=error.data?.details||error.details||[];status.textContent=(Array.isArray(details)?details.map(item=>typeof item==='string'?item:item.message||String(item)):[]).join('\n')||error.data?.error||error.message||'DATEV export failed.';}finally{button.disabled=false;}});
document.getElementById('closeDrawer').addEventListener('click',close);shade.addEventListener('click',close);document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});document.getElementById('menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));

async function loadWorkspaceArchive(){
 try{
  const [{items=[]},{items:artifacts=[]}]=await Promise.all([window.LedgerlyAPI.json('/api/archive'),window.LedgerlyAPI.json('/api/artifacts')]);const tbody=document.getElementById('archiveRows');tbody.replaceChildren();
  const count=items.length;document.querySelectorAll('[data-pane="archivePane"] span').forEach(node=>node.textContent=count);document.querySelectorAll('#archivePane .summary article b')[0].textContent=count;document.querySelectorAll('#archivePane .summary article b')[1].textContent=count;
  document.querySelectorAll('#archivePane .summary article')[2].querySelector('b').textContent=artifacts.filter(item=>item.validationOutcome==='accepted').length;
  document.querySelector('#archivePane .panel-head p').textContent='Original files stored in this workspace SQL database with SHA-256 integrity hashes';
  const empty=document.getElementById('empty');empty.hidden=count!==0;empty.textContent='No archived documents yet.';document.querySelector('#archivePane .panel footer').firstChild.textContent=`Showing ${count} stored records `;
  for(const item of items){
   const row=document.createElement('tr');row.innerHTML='<td><b></b><small></small></td><td></td><td></td><td><span class="format"></span></td><td><span class="verified"></span></td><td><button class="action" data-record-id="">View record →</button></td>';
   row.querySelector('td b').textContent=item.documentNumber;row.querySelector('td small').textContent=item.filename;row.children[1].textContent=item.direction;row.children[2].textContent=new Date(item.createdAt).toLocaleDateString();row.querySelector('.format').textContent=item.format;row.querySelector('.verified').textContent=`SHA-256 · ${item.sha256.slice(0,12)}…`;row.querySelector('[data-record-id]').dataset.recordId=item.id;tbody.append(row);
  }
 }catch(error){notify(error.message||'Could not load the archive from the backend.');}
}
document.getElementById('archiveRows').addEventListener('click',async event=>{
 const button=event.target.closest('[data-record-id]');if(!button)return;
 const item=(await window.LedgerlyAPI.json('/api/archive')).items.find(record=>record.id===button.dataset.recordId);if(!item)return;
 document.getElementById('drawerLabel').textContent='WORKSPACE ARCHIVE RECORD';document.getElementById('drawerTitle').textContent=item.documentNumber;
 const integrity=await window.LedgerlyAPI.json('/api/audit/verify');
 document.getElementById('drawerBody').innerHTML=`<p style="font-size:11px;color:#737987;line-height:1.6">Original document stored in the workspace SQL database. Records are protected against updates and deletes through this application API.</p><div class="history"><div class="event"><b>Original file</b><small>${new Date(item.createdAt).toLocaleString()}</small><p>${item.filename} · ${item.format}</p></div><div class="event"><b>SHA-256 integrity digest</b><p class="integrity">${item.sha256}</p></div><div class="event"><b>Retention target</b><p>${new Date(item.retentionUntil).toLocaleDateString()}</p></div><div class="event"><b>Audit chain</b><p>${integrity.valid?'Verified':'Integrity check failed'} · ${integrity.checked} event(s)</p></div></div>`;
 document.getElementById('drawerBody').insertAdjacentHTML('beforeend','<button class="secondary" id="downloadArchive">Download original</button>');
 document.getElementById('downloadArchive').addEventListener('click',async()=>{try{const response=await fetch(`${window.LedgerlyAPI.base}/api/archive/${item.id}/download`,{credentials:'include'});if(!response.ok)throw new Error('Original file could not be downloaded.');const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),link=document.createElement('a');link.href=objectUrl;link.download=item.filename;link.click();URL.revokeObjectURL(objectUrl);}catch(error){notify(error.message);}});
 drawer.classList.add('open');shade.classList.add('open');
});
loadWorkspaceArchive();
async function loadExportHistory(){
 try{
  const {items=[]}=await window.LedgerlyAPI.json('/api/exports'),tbody=document.getElementById('exportRows');tbody.replaceChildren();
  const tabCount=document.querySelector('[data-pane="exportsPane"] span');if(tabCount)tabCount.textContent=String(items.length);
  document.querySelectorAll('#exportsPane .summary article b').forEach((item,index)=>{if(index<2)item.textContent=String(items.length);if(index===2)item.textContent='0';});
  document.querySelector('#exportsPane .panel footer').firstChild.textContent=`Showing ${items.length} export jobs `;
  let empty=document.getElementById('exportEmpty');if(!empty){empty=document.createElement('tr');empty.id='exportEmpty';empty.innerHTML='<td colspan="6" class="empty-export">No DATEV exports yet. Create an eligible, validated invoice first.</td>';tbody.append(empty);}empty.hidden=items.length>0;
  for(const item of items){
   const row=document.createElement('tr');row.innerHTML='<td><b></b><small></small></td><td></td><td></td><td></td><td><span class="status done">Completed</span></td><td><button class="action">Download</button></td>';
   row.children[0].querySelector('b').textContent=item.filename;row.children[0].querySelector('small').textContent=`${item.rowCount} booking rows`;row.children[1].textContent=item.format;
   const period=item.filename.match(/_(\d{8})_(\d{8})\.csv$/);row.children[2].textContent=period?`${period[1].slice(6,8)}.${period[1].slice(4,6)}.${period[1].slice(0,4)} – ${period[2].slice(6,8)}.${period[2].slice(4,6)}.${period[2].slice(0,4)}`:'Period in DATEV file';
   row.children[3].textContent=new Date(item.createdAt).toLocaleDateString();
   row.querySelector('button').addEventListener('click',async()=>{const response=await fetch(`${window.LedgerlyAPI.base}/api/exports/${item.id}/download`,{credentials:'include'});if(!response.ok){notify('DATEV export could not be downloaded.');return;}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=item.filename;link.click();URL.revokeObjectURL(url);});
   tbody.insertBefore(row,empty);
  }
 }catch(error){notify(error.message||'Could not load DATEV export history.');}
}
loadExportHistory();
