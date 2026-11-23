(() => {
  const key='ledgerly-ui-scale-v2';
  const cookieValue=()=>document.cookie.split('; ').find(part=>part.startsWith(`${key}=`))?.split('=')[1];
  let stored=1;
  const urlScale=Number(new URLSearchParams(location.search).get('uiScale'));
  try { stored=urlScale||Number(localStorage.getItem(key))||Number(cookieValue())||1; } catch { stored=urlScale||Number(cookieValue())||1; }
  let scale=Math.min(1.25,Math.max(.9,stored));
  const setScale=value=>{
    scale=Math.min(1.25,Math.max(.9,Math.round(value*100)/100));
    if(document.body)document.body.style.zoom=String(scale);
    try{localStorage.setItem(key,String(scale));}catch{}
    document.cookie=`${key}=${scale}; path=/; max-age=31536000; SameSite=Lax`;
    const output=document.querySelector('.ui-scale-controls output');
    if(output)output.value=`${Math.round(scale*100)}%`;
  };
  const routes=[
    ['Overview','./index.html'],['Invoices','./invoices.html'],['Incoming invoices','./delivery.html?tab=inbox'],
    ['Send & receive','./delivery.html'],['Customers','./customers.html'],['Validation','./validation.html'],
    ['Archive','./archive.html'],['Exports','./archive.html?tab=exports'],['Settings','./settings.html'],['Plan & billing','./billing.html']
  ];
  const modal=document.createElement('div');modal.className='utility-overlay';modal.hidden=true;
  modal.innerHTML='<section class="utility-dialog" role="dialog" aria-modal="true"><button class="utility-close" aria-label="Close">×</button><div class="utility-content"></div></section>';
  const utilityContent=modal.querySelector('.utility-content');
  const closeModal=()=>{modal.hidden=true;document.body.classList.remove('utility-open');};
  const openModal=(title,body)=>{utilityContent.innerHTML=`<p class="utility-eyebrow">LEDGERLY WORKSPACE</p><h2>${title}</h2>${body}`;modal.hidden=false;document.body.classList.add('utility-open');modal.querySelector('.utility-close').focus();};
  const showHelp=()=>openModal('How can we help?',`<p class="utility-copy">Choose a workspace area to continue. This prototype help panel works offline.</p><div class="utility-links">${routes.slice(1).map(([label,url])=>`<a href="${url}">${label}<span>→</span></a>`).join('')}</div><p class="utility-footnote">For product support, connect a support inbox before launch.</p>`);
  const showSearch=()=>{
    openModal('Search your workspace',`<label class="utility-search"><span>⌕</span><input id="globalSearch" type="search" placeholder="Try invoices, customers, settings…" autocomplete="off"/></label><div class="utility-links" id="searchResults">${routes.map(([label,url])=>`<a href="${url}" data-route-label="${label.toLowerCase()}">${label}<span>↗</span></a>`).join('')}</div>`);
    const input=modal.querySelector('#globalSearch');
    input.addEventListener('input',()=>{const query=input.value.toLowerCase().trim();modal.querySelectorAll('[data-route-label]').forEach(link=>link.hidden=!link.dataset.routeLabel.includes(query));});
    input.focus();
  };
  const showNotifications=()=>openModal('Notifications',`<p class="utility-copy">Recent workspace activity</p><div class="notification-list"><article><i>✓</i><div><b>Payment received</b><small>Berger &amp; Sohn · INV-2026-042</small></div><time>2h ago</time></article><article><i>⇧</i><div><b>Invoice sent</b><small>Weber &amp; Partner · INV-2026-041</small></div><time>Yesterday</time></article><article><i>!</i><div><b>Incoming invoice needs review</b><small>Hanse Bürobedarf GmbH</small></div><time>Yesterday</time></article></div>`);
  const showAccount=()=>openModal('Account menu',`<p class="utility-copy">Signed in as <b>Alex Morgan</b> · Workspace admin</p><a class="signout-link" href="./auth.html">Sign out <span>→</span></a><p class="utility-footnote">Authentication is a prototype. No live session is connected.</p>`);
  document.addEventListener('DOMContentLoaded',()=>{
    setScale(scale);
    document.body.append(modal);
    const controls=document.createElement('div');controls.className='ui-scale-controls';controls.setAttribute('aria-label','Display size controls');controls.innerHTML='<button type="button" data-scale="down" aria-label="Decrease display size">A−</button><output aria-live="polite">100%</output><button type="button" data-scale="up" aria-label="Increase display size">A+</button><button type="button" class="scale-reset" data-scale="reset">Reset</button>';
    document.body.append(controls);
    setScale(scale);
    controls.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.scale;if(action==='up')setScale(scale+.05);else if(action==='down')setScale(scale-.05);else if(action==='reset')setScale(1);});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();if((event.ctrlKey||event.metaKey)&&['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0')setScale(1);else if(event.key==='-')setScale(scale-.05);else setScale(scale+.05);}});
    modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('.utility-close'))closeModal();});
    document.addEventListener('click',event=>{
      const help=event.target.closest('a[href$="#help"],.top-help,.help-link,.top-help-link') || (event.target.closest('.topbar span')?.textContent.trim().startsWith('Help')?event.target.closest('.topbar span'):null);
      if(help){event.preventDefault();showHelp();return;}
      const search=event.target.closest('button[aria-label="Search"]');
      if(search){event.preventDefault();showSearch();return;}
      const notifications=event.target.closest('button[aria-label="Notifications"]');
      if(notifications){event.preventDefault();showNotifications();return;}
      const account=event.target.closest('.account-action,.more-button,.user-row i,.user>button');
      if(account){event.preventDefault();showAccount();return;}
      const localPage=event.target.closest('a[href]');
      if(localPage){
        const destination=new URL(localPage.href,location.href);
        if(destination.origin===location.origin&&destination.pathname.endsWith('.html')){
          destination.searchParams.set('uiScale',String(scale));
          event.preventDefault();location.assign(destination.toString());return;
        }
      }
      const tab=event.target.closest('.tab[data-tab],.tab[data-pane]');
      if(tab){
        const paneId=tab.dataset.pane||(tab.dataset.tab==='inbox'?'inboxPanel':'outboxPanel');
        const pane=document.getElementById(paneId);
        if(pane&&!pane.hidden)pane.animate([{opacity:.55},{opacity:1}],{duration:180,easing:'ease-out'});
      }
    });
    const sidebar=document.querySelector('.sidebar');
    if(sidebar&&!sidebar.querySelector('.account-action')){
      const profile=sidebar.querySelector('.profile-row,.user-row,.user');
      const existing=profile?.querySelector('.more-button,.account-action,.user>button,.user-row i');
      if(existing){existing.classList.add('account-action');existing.setAttribute('aria-label','Account options');if(existing.tagName==='I')existing.outerHTML='<button class="account-action" aria-label="Account options">···</button>';}
      else if(profile){
        [...profile.childNodes].filter(node=>node.nodeType===3&&node.textContent.trim()==='···').forEach(node=>node.remove());
        const button=document.createElement('button');button.className='account-action';button.textContent='···';button.setAttribute('aria-label','Account options');profile.append(button);
      } else {
        const footer=sidebar.querySelector('.side-foot')||sidebar;
        [...footer.childNodes].filter(node=>node.nodeType===3&&node.textContent.includes('Alex Morgan')).forEach(node=>node.remove());
        const button=document.createElement('button');button.className='account-action account-action-wide';button.textContent='Alex Morgan · Admin　⌄';button.setAttribute('aria-label','Account options');footer.append(button);
      }
    }
    const params=new URLSearchParams(location.search);
    if(params.get('tab')==='inbox')document.querySelector('[data-tab="inbox"]')?.click();
    if(params.get('tab')==='exports')document.querySelector('[data-pane="exportsPane"]')?.click();
  });
})();
