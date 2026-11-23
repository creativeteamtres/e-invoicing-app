const toast=document.getElementById('toast');let timer;function notify(text){toast.textContent=text;toast.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),2500);}
document.querySelectorAll('[data-cycle]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-cycle]').forEach(item=>item.classList.toggle('active',item===button));const annual=button.dataset.cycle==='yearly';document.querySelectorAll('.plan-price b').forEach(price=>{const value=annual?price.dataset.year:price.dataset.month;price.textContent=`€${value}`;});}));
document.querySelectorAll('.choose-plan').forEach(button=>button.addEventListener('click',()=>notify(`${button.dataset.plan} checkout will be connected with billing later.`)));
document.getElementById('comparePlans').addEventListener('click',()=>document.querySelector('.section-head').scrollIntoView({behavior:'smooth',block:'center'}));
document.getElementById('managePlan').addEventListener('click',()=>notify('There is no paid subscription on this demo workspace.'));
document.getElementById('paymentButton').addEventListener('click',()=>notify('Payment provider is not connected; no billing information was changed.'));
document.getElementById('menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
