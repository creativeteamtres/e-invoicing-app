const local = name => String(name).split(':').at(-1);

function decodeXml(text) {
  const source=String(text);
  if(/&(?!(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);)[^;\s]*;/i.test(source))throw Object.assign(new Error('XML contains an unsupported entity reference.'),{status:400});
  return source.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{
    const e=entity.toLowerCase();
    if(e==='amp')return '&';if(e==='lt')return '<';if(e==='gt')return '>';if(e==='quot')return '"';if(e==='apos')return "'";
    const code=e.startsWith('#x')?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
    if(!Number.isInteger(code)||code<1||code>0x10ffff||(code>=0xd800&&code<=0xdfff))throw Object.assign(new Error('XML contains an invalid character reference.'),{status:400});
    return String.fromCodePoint(code);
  });
}

function parseTree(xml) {
  if(typeof xml!=='string'||Buffer.byteLength(xml)<1||Buffer.byteLength(xml)>10*1024*1024)throw Object.assign(new Error('XML must be between 1 byte and 10 MB.'),{status:413});
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Object.assign(new Error('DTD and entity declarations are rejected.'),{status:400});
  const root={name:'#document',attrs:{},children:[],text:''},stack=[root];
  const tokens=xml.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g)||[];
  for(const token of tokens){
    if(token.startsWith('<!--')||token.startsWith('<?'))continue;
    if(token.startsWith('<![CDATA[')){stack.at(-1).text+=token.slice(9,-3);continue;}
    if(token.startsWith('<!'))throw Object.assign(new Error('XML declarations other than comments and CDATA are not accepted.'),{status:400});
    if(token.startsWith('</')){
      const name=token.slice(2,-1).trim();if(stack.length===1||stack.at(-1).name!==name)throw Object.assign(new Error('XML has mismatched closing tags.'),{status:400});stack.pop();continue;
    }
    if(token.startsWith('<')){
      const selfClosing=/\/\s*>$/.test(token),inside=token.slice(1,selfClosing?token.lastIndexOf('/'): -1).trim(),nameMatch=inside.match(/^([^\s/>]+)/);
      if(!nameMatch)throw Object.assign(new Error('XML contains an invalid element name.'),{status:400});
      const name=nameMatch[1],attrSource=inside.slice(name.length),attrs={};let consumed='',match;const attrPattern=/([^\s=]+)\s*=\s*("[^"]*"|'[^']*')/g;
      while((match=attrPattern.exec(attrSource))){const key=match[1];if(Object.hasOwn(attrs,key))throw Object.assign(new Error('XML contains a duplicate attribute.'),{status:400});attrs[key]=decodeXml(match[2].slice(1,-1));consumed+=match[0];}
      if(attrSource.replace(attrPattern,'').trim())throw Object.assign(new Error('XML contains malformed attributes.'),{status:400});
      const node={name,attrs,children:[],text:''};stack.at(-1).children.push(node);if(!selfClosing)stack.push(node);continue;
    }
    stack.at(-1).text+=decodeXml(token);
  }
  if(stack.length!==1||root.children.length!==1)throw Object.assign(new Error('XML is incomplete or must contain exactly one document root.'),{status:400});
  return root.children[0];
}

const child=(node,name)=>node?.children.find(item=>local(item.name)===name)||null;
const descendants=(node,name,out=[])=>{if(!node)return out;for(const item of node.children){if(local(item.name)===name)out.push(item);descendants(item,name,out);}return out;};
const first=(node,name)=>descendants(node,name)[0]||null;
const value=(node,name)=>first(node,name)?.text.trim()||'';
function party(node){
  const address=first(node,'PostalAddress')||first(node,'PostalTradeAddress'),tax=first(node,'PartyTaxScheme')||first(node,'SpecifiedTaxRegistration'),endpoint=first(node,'EndpointID')||first(node,'URIID');
  return {name:value(node,'RegistrationName')||value(node,'Name'),street:value(address,'StreetName')||value(address,'LineOne'),postalCode:value(address,'PostalZone')||value(address,'PostcodeCode'),city:value(address,'CityName'),country:value(address,'IdentificationCode')||value(address,'CountryID'),email:value(first(node,'Contact'),'ElectronicMail'),vatId:value(tax,'CompanyID')||value(tax,'ID'),endpoint:endpoint?.text.trim()||'',endpointScheme:endpoint?.attrs.schemeID||''};
}
function parseUbl(root){
  const supplier=first(root,'AccountingSupplierParty'),buyer=first(root,'AccountingCustomerParty'),lines=[];
  for(const line of descendants(root,'InvoiceLine').concat(descendants(root,'CreditNoteLine'))){
    const quantity=first(line,'InvoicedQuantity')||first(line,'CreditedQuantity'),item=first(line,'Item')||line,tax=first(item,'ClassifiedTaxCategory')||first(line,'TaxCategory');
    lines.push({description:value(item,'Name')||value(item,'Description'),quantity:quantity?.text.trim()||'',unitCode:quantity?.attrs.unitCode||'C62',unitPrice:value(first(line,'Price'),'PriceAmount'),netAmount:value(line,'LineExtensionAmount'),taxCategory:value(tax,'ID'),taxRate:value(tax,'Percent')});
  }
  const monetary=first(root,'LegalMonetaryTotal');
  return {format:'ubl-2.1',invoiceNumber:value(root,'ID'),issueDate:value(root,'IssueDate'),dueDate:value(root,'DueDate'),typeCode:value(root,'InvoiceTypeCode')||value(root,'CreditNoteTypeCode'),currency:value(root,'DocumentCurrencyCode'),buyerReference:value(root,'BuyerReference'),seller:party(supplier),buyer:party(buyer),lines,netTotal:value(monetary,'TaxExclusiveAmount'),taxTotal:value(first(root,'TaxTotal'),'TaxAmount'),grossTotal:value(monetary,'TaxInclusiveAmount'),amountDue:value(monetary,'PayableAmount')};
}
function parseCii(root){
  const document=first(root,'ExchangedDocument'),transaction=first(root,'SupplyChainTradeTransaction'),agreement=first(transaction,'ApplicableHeaderTradeAgreement'),settlement=first(transaction,'ApplicableHeaderTradeSettlement');
  let issue=value(first(document,'IssueDateTime'),'DateTimeString');if(/^\d{8}$/.test(issue))issue=`${issue.slice(0,4)}-${issue.slice(4,6)}-${issue.slice(6)}`;
  const lines=descendants(transaction,'IncludedSupplyChainTradeLineItem').map(line=>{const product=first(line,'SpecifiedTradeProduct'),lineAgreement=first(line,'SpecifiedLineTradeAgreement'),delivery=first(line,'SpecifiedLineTradeDelivery'),lineSettlement=first(line,'SpecifiedLineTradeSettlement'),tax=first(lineSettlement,'ApplicableTradeTax'),quantity=first(delivery,'BilledQuantity');return {description:value(product,'Name')||value(product,'Description'),quantity:quantity?.text.trim()||'',unitCode:quantity?.attrs.unitCode||'C62',unitPrice:value(first(lineAgreement,'NetPriceProductTradePrice'),'ChargeAmount'),netAmount:value(lineSettlement,'LineTotalAmount'),taxCategory:value(tax,'CategoryCode'),taxRate:value(tax,'RateApplicablePercent')};});
  const totals=first(settlement,'SpecifiedTradeSettlementHeaderMonetarySummation'),due=value(first(settlement,'SpecifiedTradePaymentTerms'),'DateTimeString');
  return {format:'cii-d16b',invoiceNumber:value(document,'ID'),issueDate:issue,dueDate:/^\d{8}$/.test(due)?`${due.slice(0,4)}-${due.slice(4,6)}-${due.slice(6)}`:due,typeCode:value(document,'TypeCode'),currency:value(settlement,'InvoiceCurrencyCode'),buyerReference:value(agreement,'BuyerReference'),seller:party(first(agreement,'SellerTradeParty')),buyer:party(first(agreement,'BuyerTradeParty')),lines,netTotal:value(totals,'TaxBasisTotalAmount'),taxTotal:value(totals,'TaxTotalAmount'),grossTotal:value(totals,'GrandTotalAmount'),amountDue:value(totals,'DuePayableAmount')};
}

export async function parseInvoiceXml(xml){
  const root=parseTree(xml),rootName=local(root.name),namespace=root.attrs[root.name.includes(':')?`xmlns:${root.name.split(':')[0]}`:'xmlns']||'';
  let invoice;
  if(rootName==='Invoice'&&namespace.includes('oasis:names:specification:ubl:schema:xsd:Invoice-2'))invoice=parseUbl(root);
  else if(rootName==='CrossIndustryInvoice'&&namespace.includes('unece:uncefact:data:standard:CrossIndustryInvoice'))invoice=parseCii(root);
  else throw Object.assign(new Error('Only UBL 2.1 Invoice and UN/CEFACT CII invoices are supported.'),{status:400});
  const issues=[];
  for(const [field,label] of [['invoiceNumber','Invoice number'],['issueDate','Issue date'],['currency','Currency']])if(!invoice[field])issues.push({field,message:`${label} could not be extracted.`});
  for(const name of ['seller','buyer'])for(const field of ['name','street','postalCode','city','country'])if(!invoice[name]?.[field])issues.push({field:`${name}.${field}`,message:`${name[0].toUpperCase()+name.slice(1)} ${field} could not be extracted.`});
  if(!invoice.lines.length)issues.push({field:'lines',message:'No invoice lines could be extracted.'});
  return {invoice,issues};
}
