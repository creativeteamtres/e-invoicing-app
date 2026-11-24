import { randomUUID } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

class SmtpSession {
  constructor(socket){this.lines=[];this.waiter=null;this.failure=null;this.attach(socket);}
  attach(socket){
    this.socket=socket;
    this.onData=chunk=>{this.pending=(this.pending||'')+chunk.toString('utf8');let at;while((at=this.pending.indexOf('\r\n'))>=0){this.lines.push(this.pending.slice(0,at));this.pending=this.pending.slice(at+2);}this.waiter?.();};
    this.onError=error=>{this.failure=error;this.waiter?.();};
    this.onClose=()=>{if(!this.failure)this.failure=new Error('SMTP connection closed unexpectedly.');this.waiter?.();};
    socket.on('data',this.onData);socket.on('error',this.onError);socket.on('close',this.onClose);
  }
  detach(){this.socket.off('data',this.onData);this.socket.off('error',this.onError);this.socket.off('close',this.onClose);}
  async readResponse(){
    const lines=[];let code=null;
    while(true){
      if(this.failure)throw this.failure;
      if(!this.lines.length)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{this.waiter=null;reject(new Error('SMTP server response timed out.'));},30_000);this.waiter=()=>{clearTimeout(timeout);this.waiter=null;resolve();};});
      if(this.failure)throw this.failure;
      const line=this.lines.shift();lines.push(line);const match=line.match(/^(\d{3})([ -])/);
      if(match){code??=Number(match[1]);if(match[2]===' ')return {code,lines};}
    }
  }
  async command(text,expected){this.socket.write(`${text}\r\n`);const response=await this.readResponse();if(!expected.includes(response.code))throw new Error(`SMTP server returned ${response.code}: ${response.lines.join(' ').slice(0,300)}`);return response;}
}

function cleanHeader(value){const text=String(value??'').replace(/[\r\n\0]/g,' ').trim();if(!text)throw new Error('Email header value cannot be empty.');return text;}
function addressFromHeader(value){const match=String(value).match(/<([^<>]+)>/);return (match?.[1]||value).trim();}
const encodeHeader=text=>`=?UTF-8?B?${Buffer.from(text,'utf8').toString('base64')}?=`;
function attachmentMessage({sender,recipient,subject,body,filename,mimeType,payload,messageId}){
  const boundary=`ledgerly_${randomUUID().replaceAll('-','')}`,safeFilename=String(filename).replace(/["\r\n\\/\0-\x1f]/g,'_').slice(0,180),plainName=safeFilename.replace(/[^\x20-\x7e]/g,'_'),base64=payload.toString('base64').replace(/.{1,76}/g,'$&\r\n').trimEnd(),body64=Buffer.from(String(body),'utf8').toString('base64').replace(/.{1,76}/g,'$&\r\n').trimEnd();
  const lines=[`From: ${sender}`,`To: ${recipient}`,`Subject: ${encodeHeader(subject)}`,`Date: ${new Date().toUTCString()}`,`Message-ID: ${messageId}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body64,`--${boundary}`,`Content-Type: ${mimeType}; name="${plainName}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: attachment; filename="${plainName}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,'',base64,`--${boundary}--`,''];
  return lines.join('\r\n').replace(/(^|\r\n)\./g,'$1..');
}

export async function sendInvoiceEmail({smtp=null,recipient,subject,body,filename,mimeType,payload}){
  const host=String(smtp?.host||process.env.SMTP_HOST||'').trim(),sender=String(smtp?.sender||process.env.SMTP_FROM||'').trim(),port=Number(smtp?.port||process.env.SMTP_PORT||587),ssl=smtp? smtp.tlsMode==='ssl':String(process.env.SMTP_SSL||'false').toLowerCase()==='true',starttls=smtp?smtp.tlsMode==='starttls':String(process.env.SMTP_STARTTLS||'true').toLowerCase()==='true';
  if(!host||!sender)throw Object.assign(new Error('Email delivery is not configured. Add SMTP settings in Workspace Settings.'),{status:503});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw Object.assign(new Error('Enter a valid recipient email address.'),{status:400});
  const safeSender=cleanHeader(sender),safeRecipient=cleanHeader(recipient),safeSubject=cleanHeader(subject),safeFilename=String(filename).replace(/["\r\n\\/\0-\x1f]/g,'_').slice(0,180);
  if(!/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(addressFromHeader(safeSender)))throw Object.assign(new Error('SMTP_FROM must contain a valid email address.'),{status:503});
  if(!/^[\w!#$%&'*+./=?^_`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(safeRecipient))throw Object.assign(new Error('Recipient address is malformed.'),{status:400});
  if(!/^[\w!#$%&'*+./=?^_`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(addressFromHeader(safeSender)))throw Object.assign(new Error('SMTP_FROM address is malformed.'),{status:503});
  if(!safeFilename)throw Object.assign(new Error('Attachment filename is invalid.'),{status:400});
  const messageId=`<${randomUUID()}@${addressFromHeader(safeSender).split('@')[1]}>`;
  const socket=ssl?tls.connect({host,port,servername:host}):net.connect({host,port});
  try{
    await new Promise((resolve,reject)=>{const ready=ssl?'secureConnect':'connect';socket.once(ready,resolve);socket.once('error',reject);});
    let session=new SmtpSession(socket);let response=await session.readResponse();if(response.code!==220)throw new Error(`SMTP greeting failed: ${response.lines.join(' ')}`);
    const helo=cleanHeader(process.env.SMTP_HELO_NAME||'ledgerly.local');
    response=await session.command(`EHLO ${helo}`,[250]);
    const capabilities=response.lines.join('\n');
    if(!ssl&&starttls){
      if(!/^250[- ].*STARTTLS/im.test(capabilities))throw Object.assign(new Error('SMTP provider did not offer STARTTLS; refusing a plaintext email connection.'),{status:503});
      await session.command('STARTTLS',[220]);session.detach();
      const secure=tls.connect({socket,servername:host});await new Promise((resolve,reject)=>{secure.once('secureConnect',resolve);secure.once('error',reject);});
      session=new SmtpSession(secure);await session.command(`EHLO ${helo}`,[250]);
    }
    const username=smtp?String(smtp.username||''):process.env.SMTP_USERNAME||'',password=smtp?String(smtp.password||''):process.env.SMTP_PASSWORD||'';
    if(username){
      try{const auth=await session.command(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`).toString('base64')}`,[235,334]);if(auth.code===334)await session.command(Buffer.from(`\0${username}\0${password}`).toString('base64'),[235]);}
      catch{await session.command('AUTH LOGIN',[334]);await session.command(Buffer.from(username).toString('base64'),[334]);await session.command(Buffer.from(password).toString('base64'),[235]);}
    }
    await session.command(`MAIL FROM:<${addressFromHeader(safeSender)}>`,[250]);await session.command(`RCPT TO:<${safeRecipient}>`,[250,251]);await session.command('DATA',[354]);
    const content=attachmentMessage({sender:safeSender,recipient:safeRecipient,subject:safeSubject,body,filename:safeFilename,mimeType,payload,messageId});
    session.socket.write(`${content}\r\n.\r\n`);const accepted=await session.readResponse();if(accepted.code!==250)throw new Error(`SMTP delivery failed: ${accepted.lines.join(' ')}`);
    await session.command('QUIT',[221]).catch(()=>{});return {messageId};
  }catch(error){throw Object.assign(new Error(error.message||'Email provider failed.'),{status:error.status||502});}
  finally{socket.destroy();}
}
