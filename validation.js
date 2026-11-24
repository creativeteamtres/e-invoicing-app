const shade=document.getElementById('shade'),report=document.getElementById('report'),toast=document.getElementById('toast');let timer;
async function loadValidatorStatus(){const title=document.getElementById('validatorTitle'),copy=document.getElementById('validatorStatus');try{const {validator}=await window.LedgerlyAPI.json('/api/health');if(validator.configured&&validator.running){title.textContent='KoSIT is ready';copy.textContent=`${validator.engine} · ${validator.ruleset}. Invoice checks use this live official ruleset.`;}else if(validator.configured){title.textContent='Start KoSIT to validate';copy.textContent=`${validator.engine} and ${validator.ruleset} are installed. Run npm run start:kosit, then reload this page.`;}else{title.textContent='KoSIT setup required';copy.textContent='Run npm run setup:kosit to download and verify the pinned official engine and XRechnung ruleset, then start it with npm run start:kosit.';}}catch{title.textContent='KoSIT status unavailable';copy.textContent='Start the API server and KoSIT service to run invoice checks.';}}
function message(text){toast.textContent=text;toast.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),3500);}
function close(){shade.classList.remove('open');report.classList.remove('open');}
function showRun(result,filename){
  document.getElementById('reportTitle').textContent=filename;
  const body=document.getElementById('reportBody');body.replaceChildren();
  const summary=document.createElement('section');summary.className='finding';
  const title=document.createElement('b');title.textContent=result.outcome==='accepted'?'KoSIT accepted':result.outcome==='unavailable'?'Validator unavailable':result.outcome==='failed'?'Validation failed':'Acceptance could not be determined';
  const status=document.createElement('span');status.className=`severity ${result.outcome==='accepted'?'passed':'warn'}`;status.textContent=(result.outcome||'unknown').toUpperCase();
  const text=document.createElement('p');text.textContent=result.message || 'No further details provided.';
  const meta=document.createElement('span');meta.className='rule';meta.textContent=`Format: ${result.format || 'unknown'} · Ruleset: ${result.ruleset || 'not configured'}`;
  summary.append(title,status,text,meta);body.append(summary);
  if(result.archive){const archived=document.createElement('section');archived.className='finding';archived.textContent=`Original XML archived in the workspace SQL database. SHA-256: ${result.archive.sha256}`;body.append(archived);}
  if(result.report){const details=document.createElement('details');const heading=document.createElement('summary');heading.textContent='KoSIT XML report';const pre=document.createElement('pre');pre.textContent=result.report;pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;max-height:260px;overflow:auto';details.append(heading,pre);body.append(details);}
  report.classList.add('open');shade.classList.add('open');
}
const upload=document.getElementById('validationUpload');
document.getElementById('startValidation').addEventListener('click',()=>upload.click());
upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];if(!file)return;
  const xml=await file.text(),button=document.getElementById('startValidation');button.disabled=true;button.textContent='Checking…';
  try{
    let result;
    try{result=await window.LedgerlyAPI.json('/api/validation','POST',{filename:file.name,format:document.getElementById('formatFilter').value==='all'?'':document.getElementById('formatFilter').value,xml});}
    catch(error){if(error.data?.outcome)result=error.data;else throw error;}
    showRun(result,file.name);
    const checks=document.getElementById('checks');const row=document.createElement('tr');row.dataset.format=result.format?.includes('ubl')?'XRechnung':'ZUGFeRD';
    row.innerHTML=`<td><b></b><small>Workspace upload</small></td><td><span class="format"></span></td><td>${new Date().toLocaleDateString()}</td><td></td><td><span class="result"></span></td><td><button class="view">View report →</button></td>`;
    row.querySelector('td b').textContent=file.name;row.querySelector('.format').textContent=row.dataset.format;row.querySelectorAll('td')[3].textContent=result.ruleset||'Not configured';
    const badge=row.querySelector('.result');badge.textContent=result.outcome==='accepted'?'✓ Accepted':result.outcome==='unavailable'?'Validator unavailable':'Needs review';badge.classList.add(result.outcome==='accepted'?'good':'warn');row.querySelector('.view').addEventListener('click',()=>showRun(result,file.name));checks.prepend(row);
  }catch(error){message(error.message||'Validation could not run.');}
  finally{button.disabled=false;button.innerHTML='＋ Check an invoice';upload.value='';}
});
document.getElementById('formatFilter').addEventListener('change',event=>document.querySelectorAll('#checks tr').forEach(row=>row.hidden=event.target.value!=='all'&&row.dataset.format!==event.target.value));
document.getElementById('closeReport').addEventListener('click',close);document.getElementById('closeReportBottom').addEventListener('click',close);shade.addEventListener('click',close);document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});document.getElementById('menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));

async function loadValidationHistory(){
  try{
    const {items=[]}=await window.LedgerlyAPI.json('/api/validation');
    const checks=document.getElementById('checks');checks.replaceChildren();
    const metrics=document.querySelectorAll('.summary article b');
    if(metrics[0])metrics[0].textContent=items.length;
    if(metrics[1])metrics[1].textContent=items.filter(item=>item.outcome==='accepted').length;
    if(metrics[2])metrics[2].textContent=items.filter(item=>item.outcome!=='accepted').length;
    document.querySelector('.panel-title p').textContent='Validation history saved in this workspace';
    for(const item of items){
      const row=document.createElement('tr');row.dataset.format=item.format?.includes('ubl')?'XRechnung':'ZUGFeRD';
      row.innerHTML='<td><b></b><small>Workspace validation</small></td><td><span class="format"></span></td><td></td><td></td><td><span class="result"></span></td><td><button class="view">View report →</button></td>';
      row.querySelector('td b').textContent=item.filename;row.querySelector('.format').textContent=row.dataset.format;
      row.querySelectorAll('td')[2].textContent=new Date(item.createdAt).toLocaleDateString();row.querySelectorAll('td')[3].textContent=item.ruleset||'Not configured';
      const badge=row.querySelector('.result');badge.textContent=item.outcome==='accepted'?'✓ Accepted':item.outcome==='unavailable'?'Validator unavailable':'Needs review';badge.classList.add(item.outcome==='accepted'?'good':'warn');
      row.querySelector('.view').addEventListener('click',()=>showRun(item,item.filename));checks.append(row);
    }
    const filter=document.getElementById('formatFilter');if(filter.value!=='all')checks.querySelectorAll('tr').forEach(row=>row.hidden=row.dataset.format!==filter.value);
  }catch(error){message(error.message||'Could not load validation history.');}
}
loadValidationHistory();
loadValidatorStatus();
