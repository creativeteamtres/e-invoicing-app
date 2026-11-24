const toast=document.getElementById('toast');let timer;
function notify(text){toast.textContent=text;toast.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),3200);}
document.querySelectorAll('[data-cycle]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-cycle]').forEach(item=>item.classList.toggle('active',item===button));
  const annual=button.dataset.cycle==='yearly';
  document.querySelectorAll('.plan-price b').forEach(price=>{const value=annual?price.dataset.year:price.dataset.month;price.textContent=`€${value}`;});
}));
document.querySelectorAll('.choose-plan').forEach(button=>button.addEventListener('click',async()=>{
  const plan=button.dataset.plan.toLowerCase();
  const interval=document.querySelector('[data-cycle].active')?.dataset.cycle==='yearly'?'year':'month';
  button.disabled=true;
  try{const result=await window.LedgerlyAPI.json('/api/subscription/checkout','POST',{plan,interval});location.assign(result.url);}
  catch(error){notify(error.message);}
  finally{button.disabled=false;}
}));
document.getElementById('comparePlans').addEventListener('click',()=>document.querySelector('.section-head').scrollIntoView({behavior:'smooth',block:'center'}));
document.getElementById('managePlan').addEventListener('click',async()=>{try{const result=await window.LedgerlyAPI.json('/api/subscription/portal','POST',{});location.assign(result.url);}catch(error){notify(error.message);}});
document.getElementById('paymentButton').addEventListener('click',async()=>{try{const result=await window.LedgerlyAPI.json('/api/subscription/portal','POST',{});location.assign(result.url);}catch(error){notify(error.message);}});
document.getElementById('menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
window.LedgerlyAPI.json('/api/subscription').then(data=>{
  const title=document.querySelector('.current-head h2'), status=document.querySelector('.current-foot span'), price=document.querySelector('.price');
  if(title)title.innerHTML=`${data.plan[0].toUpperCase()+data.plan.slice(1)} <span>${data.status.toUpperCase()}</span>`;
  if(status)status.innerHTML=`<i></i> Your workspace subscription is ${data.status}`;
  if(price)price.innerHTML=`${data.plan==='starter'?'€0':'Paid'} <small>/ ${data.interval}</small><span>${data.provider==='stripe'?'Stripe subscription':'No payment method connected'}</span>`;
  const invoiceUsage=document.querySelector('.usage-grid article b'); if(invoiceUsage)invoiceUsage.innerHTML=`${data.usage.invoicesThisMonth} <small>/ ${data.plan==='starter'?'10':'Unlimited'}</small>`;
}).catch(error=>notify(error.message));
const checkout=new URLSearchParams(location.search).get('checkout');if(checkout==='success')notify('Checkout returned. Subscription status updates after Stripe confirms payment.');if(checkout==='cancelled')notify('Checkout was cancelled. No subscription change was made.');
