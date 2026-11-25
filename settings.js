const toast=document.getElementById('toast');let toastTimer;
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200);}
const sections=['business','smtp','integrations'];
function openSection(key){
  if(!sections.includes(key))key='business';
  document.querySelectorAll('[data-section]').forEach(item=>item.classList.toggle('active',item.dataset.section===key));
  document.getElementById('businessSection').hidden=key!=='business';
  document.getElementById('smtpSection').hidden=key!=='smtp';
  document.getElementById('integrationsSection').hidden=key!=='integrations';
  if(key==='smtp')loadSmtp();
  if(key==='integrations')loadIntegrations();
  history.replaceState(null,'',`${location.pathname}${location.search}#${key}`);
}
document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.section)));
document.getElementById('businessSettings').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  try{await window.LedgerlyAPI.json('/api/workspace/profile','PUT',{name:data.businessName,country:data.country,street:data.street,postalCode:data.postal,city:data.city,email:data.email,contactName:data.contactName,telephone:data.telephone,vatId:data.vatId,taxId:data.taxId,electronicAddress:data.electronicAddress,electronicAddressScheme:data.electronicAddressScheme,iban:data.iban});notify('Business profile saved to the workspace.');}
  catch(error){notify(error.message||'Profile could not be saved.');}
});
document.getElementById('smtpSettings').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type="submit"]'),status=document.getElementById('smtpStatus');button.disabled=true;status.textContent='Saving encrypted SMTP settings…';
  try{const result=await window.LedgerlyAPI.json('/api/settings/smtp','PUT',data);status.textContent=`Saved for ${result.host}:${result.port}. Password ${result.passwordSaved?'encrypted and stored':'not saved (no password required)'}.`;form.elements.password.value='';notify('SMTP settings saved securely.');}
  catch(error){status.textContent=error.message||'SMTP settings could not be saved.';notify(status.textContent);}
  finally{button.disabled=false;}
});
async function loadSmtp(){
  const form=document.getElementById('smtpSettings'),status=document.getElementById('smtpStatus');
  try{const data=await window.LedgerlyAPI.json('/api/settings/smtp');for(const key of ['host','port','username','sender','tlsMode'])if(data[key])form.elements[key].value=data[key];form.elements.password.value='';status.textContent=data.configured?`Configured: ${data.host}:${data.port} · ${data.tlsMode==='ssl'?'implicit SSL/TLS':'STARTTLS'} · ${data.passwordSaved?'password stored encrypted':'no password stored'}`:'No SMTP server configured yet.';}
  catch(error){status.textContent=error.message||'Could not load SMTP settings.';}
}
function statusCard(title,state,detail){
  const card=document.createElement('article');card.className='integration-card';
  const head=document.createElement('div');head.className='integration-head';
  const name=document.createElement('b');name.textContent=title;
  const badge=document.createElement('span');badge.className=`integration-badge ${state.kind}`;badge.textContent=state.label;
  const copy=document.createElement('p');copy.textContent=detail;
  head.append(name,badge);card.append(head,copy);return card;
}
async function loadIntegrations(){
  const grid=document.getElementById('integrationGrid');grid.replaceChildren();const loading=document.createElement('p');loading.className='integration-loading';loading.textContent='Loading service status…';grid.append(loading);
  try{
    const status=await window.LedgerlyAPI.json('/api/settings/integrations');grid.replaceChildren();
    grid.append(
      statusCard('KoSIT XRechnung validator',status.validator.running?{kind:'ready',label:'Ready'}:status.validator.configured?{kind:'warn',label:'Start required'}:{kind:'off',label:'Not installed'},status.validator.running?`${status.validator.engine} · ${status.validator.ruleset}`:status.validator.configured?'Installed, but the KoSIT service is stopped. Start it on the API host.':'Install the pinned KoSIT engine and ruleset on the API host.'),
      statusCard('ZUGFeRD / Mustang',status.zugferd.configured?{kind:'ready',label:'Installed'}:{kind:'off',label:'Not installed'},status.zugferd.configured?`${status.zugferd.engine} is available for CII/PDF-A-3 workflows.`:'Install the pinned Mustang CLI and Java runtime on the API host.'),
      statusCard('Email / SMTP',status.email.configured?{kind:'ready',label:'Configured'}:{kind:'off',label:'Not configured'},status.email.configured?`${status.email.host}:${status.email.port} · ${status.email.tlsMode.toUpperCase()} · ${status.email.passwordSaved?'credential encrypted':'no password stored'}`:'Add your provider details under Delivery & SMTP. No email can be sent yet.'),
      statusCard('Peppol network',status.peppol.supported?{kind:'ready',label:'Available'}:{kind:'off',label:'Adapter required'},'A Peppol access-point adapter is not included in this build; no Peppol messages can be sent or received.'),
      statusCard('API / EDI',status.apiEdi.supported?{kind:'ready',label:'Available'}:{kind:'off',label:'Adapter required'},'No external API/EDI delivery adapter is included in this build.'),
      statusCard('DATEV export', {kind:'ready',label:'Available'},'Configure SKR03/SKR04 accounts and VAT keys in the New export form.'),
      statusCard('Subscription billing',status.billing.configured?{kind:'ready',label:'Configured'}:{kind:'off',label:'Not configured'},status.billing.configured?'Stripe server integration keys and plan IDs are present.':'Stripe keys, webhook signing secret, and plan IDs are managed on the API host.'),
      statusCard('Archive storage',{kind:'warn',label:'SQL archive'},`${status.archive.storage} · ${status.archive.retentionYears}-year default retention · WORM storage is not configured.`)
    );
  }catch(error){grid.replaceChildren();const message=document.createElement('p');message.className='integration-loading';message.textContent=error.message||'Integration status is unavailable. Check that the API is running.';grid.append(message);}
}
document.querySelectorAll('[data-open-settings]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();openSection(link.dataset.openSettings);}));
document.getElementById('menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
const requestedSection=location.hash.slice(1);openSection(sections.includes(requestedSection)?requestedSection:'business');
window.LedgerlyAPI.json('/api/workspace').then(data=>{
  const form=document.getElementById('businessSettings');form.elements.businessName.value=data.address.legalName||data.name||'';form.elements.country.value=data.address.country||data.country||'DE';
  for(const field of ['street','postalCode','city','email','contactName','telephone','vatId','taxId','electronicAddress','electronicAddressScheme','iban']){const target=field==='postalCode'?'postal':field;if(form.elements[target])form.elements[target].value=data.address[field]||'';}
}).catch(error=>notify(error.message||'Could not load the workspace business profile.'));
