import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { db, id, now } from './db.mjs';
import { issueSession, login, readSession, register, revokeSession } from './auth.mjs';
import { appendAudit, getArchive, listArchive, storeArchive, verifyArchiveChain } from './archive.mjs';
import { extractDocumentDate, getValidatorStatus, validateXml } from './validator.mjs';
import { parseInvoiceXml } from './workflows/parser.mjs';
import { buildInvoiceModel, generateCiiInvoice, generateXRechnungUbl } from './workflows/model.mjs';
import { combineZugferdPdf, extractCiiFromPdf, getMustangStatus, validateZugferdFile } from './workflows/mustang.mjs';
import { buildDatevBookingExport } from './workflows/datev.mjs';
import { sendInvoiceEmail } from './workflows/email.mjs';
import { decryptSecret, encryptSecret } from './secrets.mjs';

const port = Number(process.env.API_PORT || 3001);
const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:8000';
const devOrigins = new Set([allowedOrigin,'http://localhost:8000','http://127.0.0.1:8000']);
const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-ledgerly_session' : 'ledgerly_session';
const limits = new Map();
function json(res, status, data, headers = {}) { res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers }); res.end(JSON.stringify(data)); }
function cookie(token, maxAge = 30 * 86400) { const age=token?(maxAge?`; Max-Age=${maxAge}`:''):'; Max-Age=0'; return `${cookieName}=${token || ''}; Path=/; HttpOnly; SameSite=Lax${age}${production ? '; Secure' : ''}`; }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => { const index=part.indexOf('='); return index<0?null:[part.slice(0,index).trim(),part.slice(index+1).trim()]; }).filter(Boolean)); }
async function body(req, max = 12 * 1024 * 1024) {
  const chunks=[]; let length=0;
  for await (const chunk of req) { length += chunk.length; if (length > max) throw Object.assign(new Error('Request is too large.'),{status:413}); chunks.push(chunk); }
  const raw=Buffer.concat(chunks);
  if (req.headers['content-type']?.includes('application/json')) { try { return { raw, data: JSON.parse(raw.toString('utf8') || '{}') }; } catch { throw Object.assign(new Error('Invalid JSON body.'),{status:400}); } }
  return { raw, data: {} };
}
function rateLimit(req, res, key, max = 12) {
  const ip = req.socket.remoteAddress || 'unknown', nowMs = Date.now(), windowMs = 15 * 60_000;
  const bucketKey = `${key}:${ip}`, bucket = limits.get(bucketKey) || { count:0, start:nowMs };
  if (nowMs - bucket.start > windowMs) { bucket.count=0; bucket.start=nowMs; }
  bucket.count++; limits.set(bucketKey,bucket);
  if (bucket.count > max) { json(res,429,{error:'Too many attempts. Try again later.'},{'retry-after':'900'}); return false; }
  return true;
}
function setCors(req,res) {
  const origin=req.headers.origin;
  if (origin && !(production ? origin === allowedOrigin : devOrigins.has(origin))) return false;
  if (origin) { res.setHeader('access-control-allow-origin',origin); res.setHeader('vary','Origin'); res.setHeader('access-control-allow-credentials','true'); }
  res.setHeader('x-content-type-options','nosniff'); res.setHeader('referrer-policy','no-referrer');
  res.setHeader('access-control-allow-headers','content-type'); res.setHeader('access-control-allow-methods','GET,POST,PUT,OPTIONS');
  return true;
}
function requireSession(req,res) {
  const session=readSession(cookies(req)[cookieName]);
  if (!session) { json(res,401,{error:'Please sign in.'}); return null; }
  return session;
}
function safeName(value) { return String(value || 'invoice.xml').replace(/[\\/"\0-\x1f\x7f]/g,'_').slice(0,180); }
function countryCode(value) { const raw=String(value||'DE').trim(); const map={germany:'DE',deutschland:'DE',austria:'AT',österreich:'AT',netherlands:'NL',niederlande:'NL',france:'FR',frankreich:'FR',other:'DE'}; return (map[raw.toLowerCase()]||raw).toUpperCase().slice(0,2); }

async function stripeCheckout(workspaceId, email, plan, interval) {
  const priceKey=`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  const price=process.env[priceKey], secret=process.env.STRIPE_SECRET_KEY;
  if (!secret || !price) throw Object.assign(new Error('Stripe is not configured for this plan. Set the server-side Stripe secret and price ID.'),{status:503});
  const params=new URLSearchParams({mode:'subscription',success_url:`${allowedOrigin}/billing.html?checkout=success`,cancel_url:`${allowedOrigin}/billing.html?checkout=cancelled`,customer_email:email,'line_items[0][price]':price,'line_items[0][quantity]':'1','metadata[workspaceId]':workspaceId,'metadata[plan]':plan,'subscription_data[metadata][workspaceId]':workspaceId,'subscription_data[metadata][plan]':plan});
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/x-www-form-urlencoded'},body:params});
  const result=await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Stripe checkout could not be created.'),{status:502});
  return result;
}

async function route(req,res) {
  if (!setCors(req,res)) return json(res,403,{error:'Origin is not allowed.'});
  if (req.method==='OPTIONS') { res.writeHead(204); return res.end(); }
  const url=new URL(req.url,`http://${req.headers.host || 'localhost'}`), path=url.pathname;
  if (path==='/api/health' && req.method==='GET') return json(res,200,{ok:true,service:'ledgerly-api',storage:'sql',validator:await getValidatorStatus(),mustang:getMustangStatus()});

  if (path==='/api/auth/register' && req.method==='POST') {
    if (!rateLimit(req,res,'register',6)) return;
    const {data}=await body(req,32_000);
    data.country=countryCode(data.country);data.address={...(data.address||{}),country:data.country};
    try {
      const account=await register(data);
      const token=issueSession(account.userId);
      appendAudit({workspaceId:account.workspaceId,actorId:account.userId,eventType:'auth.workspace.created',subjectId:account.workspaceId,details:{email:account.email}});
      return json(res,201,{user:{email:account.email},workspace:{id:account.workspaceId,name:data.businessName || 'My workspace'},subscription:{plan:'starter',status:'trialing'}},{'set-cookie':cookie(token)});
    } catch(error) { if (error.code==='SQLITE_CONSTRAINT_UNIQUE'||/UNIQUE constraint failed/i.test(error.message)) error.status=409; throw error; }
  }
  if (path==='/api/auth/login' && req.method==='POST') {
    if (!rateLimit(req,res,'login',10)) return;
    const {data}=await body(req,16_000), user=await login(data.email,data.password), remember=Boolean(data.remember), token=issueSession(user.id,remember);
    const session=readSession(token);
    appendAudit({workspaceId:session.workspace_id,actorId:user.id,eventType:'auth.session.created',subjectId:user.id});
    return json(res,200,{user:{email:user.email},workspace:{id:session.workspace_id,name:session.workspace_name}},{'set-cookie':cookie(token,remember?30*86400:null)});
  }
  if (path==='/api/auth/logout' && req.method==='POST') {
    const token=cookies(req)[cookieName], session=readSession(token);
    if (session) appendAudit({workspaceId:session.workspace_id,actorId:session.user_id,eventType:'auth.session.revoked',subjectId:session.user_id});
    revokeSession(token); return json(res,200,{ok:true},{'set-cookie':cookie('',0)});
  }
  if (path==='/api/auth/me' && req.method==='GET') {
    const session=readSession(cookies(req)[cookieName]);
    return session ? json(res,200,{user:{id:session.user_id,email:session.email},workspace:{id:session.workspace_id,name:session.workspace_name,role:session.role}}) : json(res,401,{error:'Please sign in.'});
  }

  if (path==='/api/stripe/webhook' && req.method==='POST') {
    const {raw}=await body(req,2_000_000), secret=process.env.STRIPE_WEBHOOK_SECRET, signature=req.headers['stripe-signature'];
    if (!secret || !signature) return json(res,503,{error:'Stripe webhook is not configured.'});
    const parts=Object.fromEntries(String(signature).split(',').map(x=>x.split('='))), timestamp=parts.t;
    const expected=createHmac('sha256',secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    try { if(Math.abs(Date.now()/1000-Number(timestamp))>300 || !timingSafeEqual(Buffer.from(expected),Buffer.from(parts.v1 || ''))) return json(res,400,{error:'Invalid webhook signature.'}); } catch { return json(res,400,{error:'Invalid webhook signature.'}); }
    const event=JSON.parse(raw.toString('utf8')), object=event.data?.object || {}, workspaceId=object.metadata?.workspaceId || object.subscription_details?.metadata?.workspaceId;
    if(workspaceId && ['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) {
      const status=event.type==='customer.subscription.deleted'?'canceled':(object.object==='checkout.session'?(object.payment_status==='paid'?'active':'incomplete'):(object.status || 'active'));
      const plan=object.metadata?.plan || object.subscription_details?.metadata?.plan || 'business', customer=typeof object.customer==='string'?object.customer:null, sub=typeof object.subscription==='string'?object.subscription:(typeof object.id==='string'&&object.object==='subscription'?object.id:null);
      db.prepare(`UPDATE subscriptions SET plan=?,status=?,provider='stripe',provider_customer_id=COALESCE(?,provider_customer_id),provider_subscription_id=COALESCE(?,provider_subscription_id),period_ends_at=?,updated_at=? WHERE workspace_id=?`)
        .run(plan,status,customer,sub,object.current_period_end?new Date(object.current_period_end*1000).toISOString():null,now(),workspaceId);
    }
    return json(res,200,{received:true});
  }

  const session=requireSession(req,res); if(!session) return;
  const workspaceId=session.workspace_id, userId=session.user_id;
  if(path==='/api/workspace' && req.method==='GET') {
    const workspace=db.prepare('SELECT id,name,country,address_json AS address FROM workspaces WHERE id=?').get(workspaceId);
    return json(res,200,{...workspace,address:JSON.parse(workspace.address),role:session.role});
  }
  if(path==='/api/workspace/profile' && req.method==='PUT') {
    if(session.role!=='owner'&&session.role!=='admin')return json(res,403,{error:'Workspace owner or admin required.'});
    const {data}=await body(req,32_000),name=String(data.name||'').trim();
    if(name.length<2)return json(res,400,{error:'Enter the legal business name.'});
    const address={street:String(data.street||'').trim(),postalCode:String(data.postalCode||'').trim(),city:String(data.city||'').trim(),country:countryCode(data.country),email:String(data.email||'').trim(),contactName:String(data.contactName||'').trim(),telephone:String(data.telephone||'').trim(),vatId:String(data.vatId||'').trim(),taxId:String(data.taxId||'').trim(),electronicAddress:String(data.electronicAddress||'').trim(),electronicAddressScheme:String(data.electronicAddressScheme||'').trim(),iban:String(data.iban||'').replace(/\s/g,'')};
    db.prepare('UPDATE workspaces SET name=?,country=?,address_json=? WHERE id=?').run(name,address.country,JSON.stringify(address),workspaceId);
    appendAudit({workspaceId,actorId:userId,eventType:'workspace.profile.updated',subjectId:workspaceId});
    return json(res,200,{id:workspaceId,name,address});
  }
  if(path==='/api/settings/smtp' && req.method==='GET') {
    if(session.role!=='owner'&&session.role!=='admin')return json(res,403,{error:'Workspace owner or admin required.'});
    const item=db.prepare('SELECT host,port,username,sender,tls_mode AS tlsMode,password_ciphertext FROM smtp_settings WHERE workspace_id=?').get(workspaceId);
    return json(res,200,{configured:Boolean(item),host:item?.host||'',port:item?.port||587,username:item?.username||'',sender:item?.sender||'',tlsMode:item?.tlsMode||'starttls',passwordSaved:Boolean(item?.password_ciphertext)});
  }
  if(path==='/api/settings/smtp' && req.method==='PUT') {
    if(session.role!=='owner'&&session.role!=='admin')return json(res,403,{error:'Workspace owner or admin required.'});
    const {data}=await body(req,16_000),host=String(data.host||'').trim(),port=Number(data.port||587),username=String(data.username||'').trim(),sender=String(data.sender||'').trim(),password=String(data.password||''),tlsMode=String(data.tlsMode||'starttls');
    if(!/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(host))return json(res,400,{error:'Enter a valid SMTP host name.'});
    if(!Number.isInteger(port)||port<1||port>65535)return json(res,400,{error:'SMTP port must be between 1 and 65535.'});
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender))return json(res,400,{error:'Enter a valid sender email address.'});
    if(!['starttls','ssl'].includes(tlsMode))return json(res,400,{error:'Choose STARTTLS or implicit SSL/TLS.'});
    if(username.length>300||password.length>2000)return json(res,400,{error:'SMTP credentials are too long.'});
    const existing=db.prepare('SELECT username,password_ciphertext FROM smtp_settings WHERE workspace_id=?').get(workspaceId);
    if(username&&(!existing?.password_ciphertext||existing.username!==username)&&!password)return json(res,400,{error:'Enter the SMTP password for this username.'});
    let passwordCiphertext=existing?.password_ciphertext||'';
    if(password)try{passwordCiphertext=encryptSecret(password);}catch(error){return json(res,error.status||503,{error:error.message});}
    db.prepare(`INSERT INTO smtp_settings(workspace_id,host,port,username,password_ciphertext,sender,tls_mode,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET host=excluded.host,port=excluded.port,username=excluded.username,password_ciphertext=excluded.password_ciphertext,sender=excluded.sender,tls_mode=excluded.tls_mode,updated_at=excluded.updated_at`)
      .run(workspaceId,host,port,username,passwordCiphertext,sender,tlsMode,now());
    appendAudit({workspaceId,actorId:userId,eventType:'workspace.smtp.updated',subjectId:workspaceId,details:{host,port,tlsMode,usernameSet:Boolean(username)}});
    return json(res,200,{configured:true,host,port,username,sender,tlsMode,passwordSaved:Boolean(passwordCiphertext)});
  }
  if(path==='/api/customers' && req.method==='GET') {
    const items=db.prepare(`SELECT id,name,email,customer_number AS customerNumber,country,street,postal_code AS postalCode,city,endpoint,endpoint_scheme AS endpointScheme,vat_id AS vatId,tax_id AS taxId
      FROM customers WHERE workspace_id=? ORDER BY name COLLATE NOCASE`).all(workspaceId).map(item=>({...item,key:item.id}));
    return json(res,200,{items});
  }
  if(path==='/api/customers' && req.method==='POST') {
    const {data}=await body(req,32_000),name=String(data.name||'').trim();
    if(name.length<2)return json(res,400,{error:'Enter the customer legal name.'});
    const record={id:id(),workspace_id:workspaceId,name,email:String(data.email||'').trim(),customer_number:String(data.customerNumber||data.customerId||'').trim(),country:countryCode(data.country),street:String(data.street||'').trim(),postal_code:String(data.postalCode||data.postal||'').trim(),city:String(data.city||'').trim(),endpoint:String(data.endpoint||'').trim(),endpoint_scheme:String(data.endpointScheme||'').trim(),vat_id:String(data.vatId||'').trim(),tax_id:String(data.taxId||'').trim(),created_at:now(),updated_at:now()};
    try{db.prepare(`INSERT INTO customers(id,workspace_id,name,email,customer_number,country,street,postal_code,city,endpoint,endpoint_scheme,vat_id,tax_id,created_at,updated_at)
      VALUES(@id,@workspace_id,@name,@email,@customer_number,@country,@street,@postal_code,@city,@endpoint,@endpoint_scheme,@vat_id,@tax_id,@created_at,@updated_at)`).run(record);}
    catch(error){if(/UNIQUE constraint failed/i.test(error.message))return json(res,409,{error:'That customer number is already used in this workspace.'});throw error;}
    appendAudit({workspaceId,actorId:userId,eventType:'customer.created',subjectId:record.id,details:{name}});
    return json(res,201,{id:record.id,key:record.id,name,email:record.email,customerNumber:record.customer_number,country:record.country,street:record.street,postalCode:record.postal_code,city:record.city,endpoint:record.endpoint,endpointScheme:record.endpoint_scheme,vatId:record.vat_id,taxId:record.tax_id});
  }
  const customerMatch=path.match(/^\/api\/customers\/([0-9a-f-]+)$/i);
  if(customerMatch&&req.method==='PUT') {
    const {data}=await body(req,32_000),name=String(data.name||'').trim();if(name.length<2)return json(res,400,{error:'Enter the customer legal name.'});
    const changed=db.prepare(`UPDATE customers SET name=?,email=?,customer_number=?,country=?,street=?,postal_code=?,city=?,endpoint=?,endpoint_scheme=?,vat_id=?,tax_id=?,updated_at=? WHERE workspace_id=? AND id=?`).run(name,String(data.email||'').trim(),String(data.customerNumber||data.customerId||'').trim(),countryCode(data.country),String(data.street||'').trim(),String(data.postalCode||data.postal||'').trim(),String(data.city||'').trim(),String(data.endpoint||'').trim(),String(data.endpointScheme||'').trim(),String(data.vatId||'').trim(),String(data.taxId||'').trim(),now(),workspaceId,customerMatch[1]);
    if(!changed.changes)return json(res,404,{error:'Customer not found in this workspace.'});
    appendAudit({workspaceId,actorId:userId,eventType:'customer.updated',subjectId:customerMatch[1],details:{name}});
    return json(res,200,{id:customerMatch[1],key:customerMatch[1],...data,name});
  }
  if(path==='/api/subscription' && req.method==='GET') {
    const subscription=db.prepare('SELECT plan,status,billing_interval AS interval,period_ends_at AS periodEndsAt,provider FROM subscriptions WHERE workspace_id=?').get(workspaceId);
    const invoiceCount=db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE workspace_id=? AND created_at>=date('now','start of month')").get(workspaceId).count;
    const archiveBytes=db.prepare('SELECT COALESCE(SUM(length(payload)),0) AS bytes FROM archive_records WHERE workspace_id=?').get(workspaceId).bytes;
    return json(res,200,{...subscription,usage:{invoicesThisMonth:invoiceCount,archiveBytes}});
  }
  if(path==='/api/subscription/checkout' && req.method==='POST') {
    if(session.role!=='owner'&&session.role!=='admin') return json(res,403,{error:'Workspace owner or admin required.'});
    const {data}=await body(req,8000), plan=String(data.plan || '').toLowerCase(), interval=data.interval==='year'?'year':'month';
    if(!['business','scale'].includes(plan)) return json(res,400,{error:'Select Business or Scale.'});
    const checkout=await stripeCheckout(workspaceId,session.email,plan,interval);
    return json(res,200,{url:checkout.url});
  }
  if(path==='/api/subscription/portal' && req.method==='POST') {
    if(session.role!=='owner'&&session.role!=='admin') return json(res,403,{error:'Workspace owner or admin required.'});
    const subscription=db.prepare('SELECT provider_customer_id FROM subscriptions WHERE workspace_id=?').get(workspaceId);
    if(!process.env.STRIPE_SECRET_KEY || !subscription?.provider_customer_id) return json(res,503,{error:'No active Stripe billing profile is configured for this workspace.'});
    const params=new URLSearchParams({customer:subscription.provider_customer_id,return_url:`${allowedOrigin}/billing.html`});
    const response=await fetch('https://api.stripe.com/v1/billing_portal/sessions',{method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded'},body:params});
    const result=await response.json(); if(!response.ok) return json(res,502,{error:result.error?.message||'Billing portal could not be opened.'});
    return json(res,200,{url:result.url});
  }
  if(path==='/api/invoices' && req.method==='GET') {
    const direction=url.searchParams.get('direction');
    const rows=direction==='incoming'||direction==='outgoing'?db.prepare('SELECT id,document_number AS documentNumber,direction,format,data_json AS data,created_at AS createdAt FROM invoices WHERE workspace_id=? AND direction=? ORDER BY created_at DESC LIMIT 200').all(workspaceId,direction):db.prepare('SELECT id,document_number AS documentNumber,direction,format,data_json AS data,created_at AS createdAt FROM invoices WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200').all(workspaceId);
    return json(res,200,{items:rows.map(row=>({...row,data:JSON.parse(row.data)}))});
  }
  if(path==='/api/artifacts'&&req.method==='GET'){
    const items=db.prepare(`SELECT a.id,a.invoice_id AS invoiceId,i.document_number AS documentNumber,a.format,a.filename,a.mime_type AS mimeType,a.payload_sha256 AS sha256,a.validation_outcome AS validationOutcome,a.created_at AS createdAt
      FROM invoice_artifacts a JOIN invoices i ON i.id=a.invoice_id WHERE a.workspace_id=? ORDER BY a.created_at DESC LIMIT 200`).all(workspaceId);
    return json(res,200,{items});
  }
  if(path==='/api/deliveries'&&req.method==='GET'){
    const items=db.prepare(`SELECT d.id,d.artifact_id AS artifactId,i.document_number AS documentNumber,d.channel,d.recipient,d.status,d.provider_reference AS providerReference,d.error,d.created_at AS createdAt,d.completed_at AS completedAt
      FROM delivery_jobs d JOIN invoice_artifacts a ON a.id=d.artifact_id JOIN invoices i ON i.id=a.invoice_id WHERE d.workspace_id=? ORDER BY d.created_at DESC LIMIT 200`).all(workspaceId);
    return json(res,200,{items});
  }
  if(path==='/api/exports'&&req.method==='GET'){
    const items=db.prepare('SELECT id,format,filename,row_count AS rowCount,created_at AS createdAt FROM export_jobs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100').all(workspaceId);
    return json(res,200,{items});
  }
  if(path==='/api/invoices' && req.method==='POST') {
    const {data}=await body(req,1_000_000), number=String(data.documentNumber || '').trim();
    if(!number) return json(res,400,{error:'Invoice number is required.'});
    const sub=db.prepare('SELECT plan,status FROM subscriptions WHERE workspace_id=?').get(workspaceId);
    const used=db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE workspace_id=? AND created_at>=date('now','start of month')").get(workspaceId).count;
    if(!['active','trialing'].includes(sub?.status))return json(res,402,{error:'Invoice creation is paused for this subscription. Review billing to continue.'});
    if(sub.plan==='starter'&&used>=10)return json(res,402,{error:'Starter includes 10 invoices per month. Choose a paid plan to create more.'});
    const record={id:id(),workspace_id:workspaceId,document_number:number,direction:data.direction==='incoming'?'incoming':'outgoing',format:String(data.format||'XRechnung'),data_json:JSON.stringify(data),created_at:now()};
    try { db.prepare('INSERT INTO invoices(id,workspace_id,document_number,direction,format,data_json,created_at) VALUES(@id,@workspace_id,@document_number,@direction,@format,@data_json,@created_at)').run(record); }
    catch(error){ if(error.code==='SQLITE_CONSTRAINT_UNIQUE'||/UNIQUE constraint failed/i.test(error.message)) return json(res,409,{error:'That invoice number already exists in this workspace.'}); throw error; }
    appendAudit({workspaceId,actorId:userId,eventType:'invoice.created',subjectId:record.id,details:{documentNumber:number,direction:record.direction}});
    return json(res,201,{id:record.id,documentNumber:number,direction:record.direction,createdAt:record.created_at});
  }
  if(path==='/api/inbound' && req.method==='POST') {
    const {data}=await body(req,16_000_000),filename=safeName(data.filename),mimeType=String(data.mimeType||'').toLowerCase(),bytes=Buffer.from(String(data.payloadBase64||''),'base64');
    if(!bytes.length||bytes.length>10*1024*1024)return json(res,413,{error:'Choose a non-empty invoice file up to 10 MB.'});
    let xml;
    if(/\.pdf$/i.test(filename)||mimeType==='application/pdf'){
      if(bytes.subarray(0,5).toString()!=='%PDF-')return json(res,400,{error:'The uploaded PDF signature is invalid.'});
      xml=await extractCiiFromPdf(bytes);
    } else if(/\.xml$/i.test(filename)||mimeType.includes('xml')) xml=bytes.toString('utf8');
    else return json(res,415,{error:'Import currently supports UBL/CII XML and ZUGFeRD PDF/A-3 invoices.'});
    const parsed=await parseInvoiceXml(xml), invoice=parsed.invoice;
    let validation;
    if(/\.pdf$/i.test(filename)||mimeType==='application/pdf')validation=await validateZugferdFile(bytes,filename);
    else validation=await validateXml(xml);
    const validationId=id(),documentNumber=String(invoice.invoiceNumber||filename).slice(0,180);
    db.prepare('INSERT INTO validation_runs(id,workspace_id,filename,format,outcome,ruleset,report,created_at) VALUES(?,?,?,?,?,?,?,?)').run(validationId,workspaceId,filename,invoice.format,validation.outcome,validation.ruleset||null,validation.report||null,now());
    const storedInvoice={...invoice,direction:'incoming',status:validation.outcome==='accepted'?'validated':'needs_review',validationOutcome:validation.outcome,validationRuleset:validation.ruleset,importIssues:parsed.issues};
    const existing=db.prepare('SELECT id FROM invoices WHERE workspace_id=? AND document_number=? AND direction=?').get(workspaceId,documentNumber,'incoming');
    const invoiceId=existing?.id||id();
    if(existing)db.prepare('UPDATE invoices SET format=?,data_json=?,created_at=? WHERE id=?').run(invoice.format,JSON.stringify(storedInvoice),now(),invoiceId);
    else db.prepare('INSERT INTO invoices(id,workspace_id,document_number,direction,format,data_json,created_at) VALUES(?,?,?,?,?,?,?)').run(invoiceId,workspaceId,documentNumber,'incoming',invoice.format,JSON.stringify(storedInvoice),now());
    const archive=storeArchive({workspaceId,actorId:userId,documentNumber,direction:'incoming',filename,mimeType:/\.pdf$/i.test(filename)?'application/pdf':'application/xml',format:/\.pdf$/i.test(filename)?'zugferd-pdf':invoice.format,payload:bytes,validationId,documentDate:invoice.issueDate||null});
    appendAudit({workspaceId,actorId:userId,eventType:'invoice.imported',subjectId:invoiceId,details:{filename,outcome:validation.outcome,format:invoice.format}});
    return json(res,201,{invoiceId,invoice:storedInvoice,parseIssues:parsed.issues,validation,archive});
  }
  const invoiceMatch=path.match(/^\/api\/invoices\/([0-9a-f-]+)$/i);
  if(invoiceMatch && req.method==='PUT') {
    const {data}=await body(req,1_000_000),number=String(data.documentNumber || '').trim();
    if(!number)return json(res,400,{error:'Invoice number is required.'});
    const existing=db.prepare('SELECT id FROM invoices WHERE workspace_id=? AND id=?').get(workspaceId,invoiceMatch[1]);
    if(!existing)return json(res,404,{error:'Invoice not found in this workspace.'});
    try{db.prepare('UPDATE invoices SET document_number=?,direction=?,format=?,data_json=? WHERE workspace_id=? AND id=?').run(number,data.direction==='incoming'?'incoming':'outgoing',String(data.format||'XRechnung'),JSON.stringify(data),workspaceId,invoiceMatch[1]);}
    catch(error){if(error.code==='SQLITE_CONSTRAINT_UNIQUE'||/UNIQUE constraint failed/i.test(error.message))return json(res,409,{error:'That invoice number already exists in this workspace.'});throw error;}
    appendAudit({workspaceId,actorId:userId,eventType:'invoice.updated',subjectId:invoiceMatch[1],details:{documentNumber:number}});
    return json(res,200,{id:invoiceMatch[1],documentNumber:number});
  }
  const artifactCreateMatch=path.match(/^\/api\/invoices\/([0-9a-f-]+)\/artifacts$/i);
  if(artifactCreateMatch&&req.method==='POST') {
    const invoiceRow=db.prepare("SELECT * FROM invoices WHERE workspace_id=? AND id=? AND direction='outgoing'").get(workspaceId,artifactCreateMatch[1]);
    if(!invoiceRow)return json(res,404,{error:'Outgoing draft invoice not found in this workspace.'});
    const {data}=await body(req,16_000_000),draft=JSON.parse(invoiceRow.data_json),workspace=db.prepare('SELECT name,address_json FROM workspaces WHERE id=?').get(workspaceId),profile=JSON.parse(workspace.address_json||'{}');
    let buyer=draft.buyer||null;
    if(!buyer&&draft.customerId){buyer=db.prepare('SELECT name,email,customer_number AS customerNumber,country,street,postal_code AS postalCode,city,endpoint,endpoint_scheme AS endpointScheme,vat_id AS vatId,tax_id AS taxId FROM customers WHERE workspace_id=? AND id=?').get(workspaceId,draft.customerId);}
    const seller={name:profile.legalName||workspace.name,street:profile.street,postalCode:profile.postalCode,city:profile.city,country:profile.country||'DE',email:profile.email,contactName:profile.contactName,telephone:profile.telephone,vatId:profile.vatId,endpoint:profile.electronicAddress,endpointScheme:profile.electronicAddressScheme,iban:profile.iban};
    const invoice=buildInvoiceModel({...draft,documentNumber:invoiceRow.document_number,buyerReference:draft.buyerReference},seller,buyer||{});
    const format=String(data.format||'xrechnung-ubl');let payload,filename,mimeType,validation;
    if(format==='xrechnung-ubl'){
      const xml=generateXRechnungUbl(invoice);payload=Buffer.from(xml);filename=`${safeName(invoice.invoiceNumber)}.xml`;mimeType='application/xml';validation=await validateXml(xml,'xrechnung-ubl');
    } else if(format==='zugferd-pdf'){
      const xml=generateCiiInvoice(invoice),basePdf=Buffer.from(String(data.basePdfBase64||''),'base64');
      if(!basePdf.length||basePdf.length>10*1024*1024)return json(res,400,{error:'Upload the invoice’s human-readable PDF/A source (up to 10 MB) to package ZUGFeRD.'});
      payload=await combineZugferdPdf({basePdf,xml});filename=`${safeName(invoice.invoiceNumber)}.pdf`;mimeType='application/pdf';validation=await validateZugferdFile(payload,filename);
    } else return json(res,400,{error:'Choose XRechnung UBL or ZUGFeRD PDF/A-3.'});
    const validationId=id();
    db.prepare('INSERT INTO validation_runs(id,workspace_id,filename,format,outcome,ruleset,report,created_at) VALUES(?,?,?,?,?,?,?,?)').run(validationId,workspaceId,filename,format,validation.outcome,validation.ruleset||null,validation.report||null,now());
    const artifactId=id(),digest=createHash('sha256').update(payload).digest('hex');
    db.prepare('INSERT INTO invoice_artifacts(id,workspace_id,invoice_id,format,filename,mime_type,payload,payload_sha256,validation_id,validation_outcome,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(artifactId,workspaceId,invoiceRow.id,format,filename,mimeType,payload,digest,validationId,validation.outcome,now());
    let archive=null;
    if(validation.outcome==='accepted')archive=storeArchive({workspaceId,actorId:userId,documentNumber:invoice.invoiceNumber,direction:'outgoing',filename,mimeType,format,payload,validationId,documentDate:invoice.issueDate});
    appendAudit({workspaceId,actorId:userId,eventType:'invoice.artifact.generated',subjectId:artifactId,details:{invoiceId:invoiceRow.id,format,outcome:validation.outcome,digest}});
    return json(res,201,{artifactId,filename,format,mimeType,sha256:digest,validation,archive,deliveryAllowed:validation.outcome==='accepted'});
  }
  const artifactDownloadMatch=path.match(/^\/api\/artifacts\/([0-9a-f-]+)\/download$/i);
  if(artifactDownloadMatch&&req.method==='GET'){
    const artifact=db.prepare('SELECT * FROM invoice_artifacts WHERE workspace_id=? AND id=?').get(workspaceId,artifactDownloadMatch[1]);if(!artifact)return json(res,404,{error:'Invoice artifact not found.'});
    if(createHash('sha256').update(artifact.payload).digest('hex')!==artifact.payload_sha256)return json(res,409,{error:'Artifact integrity check failed.'});
    appendAudit({workspaceId,actorId:userId,eventType:'invoice.artifact.downloaded',subjectId:artifact.id,details:{filename:artifact.filename,sha256:artifact.payload_sha256}});
    res.writeHead(200,{'content-type':artifact.mime_type,'content-length':artifact.payload.length,'content-disposition':`attachment; filename="${safeName(artifact.filename)}"`,'x-content-sha256':artifact.payload_sha256,'cache-control':'no-store'});return res.end(artifact.payload);
  }
  if(path==='/api/deliveries'&&req.method==='POST'){
    const {data}=await body(req,200_000),channel=String(data.channel||'email').toLowerCase(),recipient=String(data.recipient||'').trim();
    if(channel!=='email')return json(res,503,{error:`${channel} delivery adapter is not configured. Email is the first live channel.`});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return json(res,400,{error:'Enter a valid recipient email address.'});
    const artifact=db.prepare('SELECT * FROM invoice_artifacts WHERE workspace_id=? AND id=?').get(workspaceId,String(data.artifactId||''));
    if(!artifact)return json(res,404,{error:'Generated invoice artifact not found.'});
    if(artifact.validation_outcome!=='accepted')return json(res,409,{error:'Delivery is blocked until the artifact passes its configured official validation rules.'});
    const deliveryId=id(),created=now();db.prepare('INSERT INTO delivery_jobs(id,workspace_id,artifact_id,channel,recipient,status,created_at) VALUES(?,?,?,?,?,?,?)').run(deliveryId,workspaceId,artifact.id,channel,recipient,'sending',created);
    try{
      const mailConfig=db.prepare('SELECT host,port,username,password_ciphertext AS passwordCiphertext,sender,tls_mode AS tlsMode FROM smtp_settings WHERE workspace_id=?').get(workspaceId);
      const smtp=mailConfig?{...mailConfig,password:decryptSecret(mailConfig.passwordCiphertext)}:null;
      const sent=await sendInvoiceEmail({smtp,recipient,subject:String(data.subject||`Invoice ${artifact.filename}`).slice(0,200),body:String(data.body||'Please find the invoice attached.').slice(0,20_000),filename:artifact.filename,mimeType:artifact.mime_type,payload:artifact.payload});
      db.prepare("UPDATE delivery_jobs SET status='sent',provider_reference=?,completed_at=? WHERE id=? AND workspace_id=?").run(sent.messageId||null,now(),deliveryId,workspaceId);
      appendAudit({workspaceId,actorId:userId,eventType:'invoice.email.sent',subjectId:deliveryId,details:{artifactId:artifact.id,recipient}});
      return json(res,201,{id:deliveryId,status:'sent',providerReference:sent.messageId||null});
    }catch(error){db.prepare("UPDATE delivery_jobs SET status='failed',error=?,completed_at=? WHERE id=? AND workspace_id=?").run(String(error.message).slice(0,500),now(),deliveryId,workspaceId);throw error;}
  }
  if(path==='/api/exports/datev'&&req.method==='POST'){
    const {data}=await body(req,100_000),ids=Array.isArray(data.invoiceIds)?data.invoiceIds:[];
    const eligibility="((i.direction='outgoing' AND EXISTS(SELECT 1 FROM invoice_artifacts x WHERE x.workspace_id=i.workspace_id AND x.invoice_id=i.id AND x.validation_outcome='accepted')) OR (i.direction='incoming' AND EXISTS(SELECT 1 FROM archive_records a JOIN validation_runs v ON v.id=a.validation_id WHERE a.workspace_id=i.workspace_id AND a.document_number=i.document_number AND a.direction='incoming' AND v.outcome='accepted')))";
    const records=ids.length?db.prepare(`SELECT i.id,i.document_number AS documentNumber,i.direction,i.data_json AS data FROM invoices i WHERE i.workspace_id=? AND ${eligibility} AND i.id IN (${ids.map(()=>'?').join(',')})`).all(workspaceId,...ids):db.prepare(`SELECT i.id,i.document_number AS documentNumber,i.direction,i.data_json AS data FROM invoices i WHERE i.workspace_id=? AND ${eligibility} ORDER BY i.created_at DESC LIMIT 500`).all(workspaceId);
    const exportFile=buildDatevBookingExport(records.map(item=>({...item,data:JSON.parse(item.data)})),data.config||{}),created=now();
    db.prepare('INSERT INTO export_jobs(id,workspace_id,format,filename,payload,row_count,created_at) VALUES(?,?,?,?,?,?,?)').run(exportFile.id,workspaceId,exportFile.format,exportFile.filename,Buffer.from(exportFile.payload,'utf8'),exportFile.rowCount,created);
    appendAudit({workspaceId,actorId:userId,eventType:'accounting.datev.exported',subjectId:exportFile.id,details:{format:exportFile.format,rowCount:exportFile.rowCount}});
    return json(res,201,{id:exportFile.id,filename:exportFile.filename,format:exportFile.format,rowCount:exportFile.rowCount,createdAt:created,downloadUrl:`/api/exports/${exportFile.id}/download`});
  }
  const exportDownloadMatch=path.match(/^\/api\/exports\/([0-9a-f-]+)\/download$/i);
  if(exportDownloadMatch&&req.method==='GET'){
    const item=db.prepare('SELECT * FROM export_jobs WHERE workspace_id=? AND id=?').get(workspaceId,exportDownloadMatch[1]);if(!item)return json(res,404,{error:'Accounting export not found.'});
    appendAudit({workspaceId,actorId:userId,eventType:'accounting.export.downloaded',subjectId:item.id,details:{filename:item.filename}});
    res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-length':item.payload.length,'content-disposition':`attachment; filename="${safeName(item.filename)}"`,'cache-control':'no-store'});return res.end(item.payload);
  }
  if(path==='/api/validation' && req.method==='POST') {
    const {data}=await body(req,12_000_000), filename=safeName(data.filename), xml=String(data.xml || '');
    const result=await validateXml(xml,data.format || '');
    const validationId=id();
    db.prepare('INSERT INTO validation_runs(id,workspace_id,filename,format,outcome,ruleset,report,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(validationId,workspaceId,filename,result.format,result.outcome,result.ruleset,result.report,now());
    let archive=null;
    if(result.outcome==='accepted') archive=storeArchive({workspaceId,actorId:userId,documentNumber:String(data.documentNumber || filename),direction:data.direction==='incoming'?'incoming':'outgoing',filename,mimeType:'application/xml',format:result.format,payload:Buffer.from(xml),validationId,documentDate:result.documentDate});
    else appendAudit({workspaceId,actorId:userId,eventType:'invoice.validation.completed',subjectId:validationId,details:{filename,outcome:result.outcome,ruleset:result.ruleset}});
    return json(res,result.outcome==='unavailable'?503:200,{validationId,...result,archive});
  }
  if(path==='/api/validation' && req.method==='GET') {
    const items=db.prepare(`SELECT id,filename,format,outcome,ruleset,report,created_at AS createdAt FROM validation_runs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100`).all(workspaceId);
    return json(res,200,{items});
  }
  if(path==='/api/archive' && req.method==='GET') return json(res,200,{items:listArchive(workspaceId,url.searchParams.get('limit'))});
  if(path==='/api/archive' && req.method==='POST') {
    const {data}=await body(req,14_000_000),filename=safeName(data.filename),payload=Buffer.from(String(data.payloadBase64||''),'base64');
    const item=storeArchive({workspaceId,actorId:userId,documentNumber:String(data.documentNumber||filename).slice(0,180),direction:data.direction==='outgoing'?'outgoing':'incoming',filename,mimeType:String(data.mimeType||'application/octet-stream').slice(0,120),format:String(data.format||'unknown').slice(0,40),payload,documentDate:data.documentDate||((String(data.mimeType).includes('xml')||String(filename).endsWith('.xml'))?extractDocumentDate(payload.toString('utf8')):null)});
    return json(res,201,item);
  }
  if(path==='/api/audit/verify' && req.method==='GET') return json(res,200,verifyArchiveChain(workspaceId));
  const downloadMatch=path.match(/^\/api\/archive\/([0-9a-f-]+)\/download$/i);
  if(downloadMatch && req.method==='GET') {
    const item=getArchive(workspaceId,downloadMatch[1]); if(!item) return json(res,404,{error:'Archived document not found.'});
    const digest=createHash('sha256').update(item.payload).digest('hex');
    if(digest!==item.payload_sha256) return json(res,409,{error:'Archived document integrity check failed.'});
    appendAudit({workspaceId,actorId:userId,eventType:'archive.document.downloaded',subjectId:item.id,details:{filename:item.filename,sha256:digest}});
    res.writeHead(200,{'content-type':item.mime_type,'content-length':item.payload.length,'content-disposition':`attachment; filename="${safeName(item.filename)}"`,'x-content-sha256':digest,'cache-control':'no-store'}); return res.end(item.payload);
  }
  return json(res,404,{error:'API route not found.'});
}

const server=createServer((req,res)=>{
  route(req,res).catch(error=>{ console.error(`[api] ${req.method} ${req.url}:`,error.stack || error.message); if(!res.headersSent) json(res,error.status || 500,{error:error.status?error.message:'The server could not complete the request.',...(error.details?{details:error.details}:{})}); else res.end(); });
});
server.listen(port,process.env.API_HOST || '127.0.0.1',()=>console.log(`Ledgerly API listening on http://${process.env.API_HOST || '127.0.0.1'}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close(()=>{db.close();process.exit(0);});});
