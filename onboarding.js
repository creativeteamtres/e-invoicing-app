const setupToast=document.getElementById('toast'); let setupTimer;
function showSetupMessage(message){setupToast.textContent=message;setupToast.classList.add('show');clearTimeout(setupTimer);setupTimer=setTimeout(()=>setupToast.classList.remove('show'),3200);}
document.getElementById('businessForm').addEventListener('submit',async event=>{
  event.preventDefault(); const form=event.currentTarget, invalid=[...form.querySelectorAll('[required]')].find(field=>!field.checkValidity());
  if(invalid){invalid.focus();showSetupMessage(invalid.validationMessage || 'Complete all required fields.');return;}
  const values=Object.fromEntries(new FormData(form)); const button=form.querySelector('[type="submit"]'); button.disabled=true;
  try{
    await window.LedgerlyAPI.json('/api/auth/register','POST',{
      email:values.email,password:values.password,businessName:values.businessName,country:values.country,
      address:{street:values.street,postalCode:values.postal,city:values.city,legalForm:values.legalForm}
    });
    location.assign('./index.html');
  }catch(error){showSetupMessage(error.message || 'Could not create the workspace. Check that the Ledgerly API is running.');}
  finally{button.disabled=false;}
});
