import { buildInvoiceModel, generateXRechnungUbl } from '../backend/workflows/model.mjs';
import { validateXml } from '../backend/validator.mjs';

const data = { documentNumber:'TEST-2026-001', issueDate:'2026-11-24', deliveryDate:'2026-11-24', dueDate:'2026-12-24', buyerReference:'TEST-REF-001', currency:'EUR', lines:[{ description:'E-invoicing integration service', quantity:'1', unitPrice:'119.00', taxRate:'19', taxCategory:'S', unitCode:'C62' }] };
const seller = { name:'Ledgerly Test GmbH', street:'Teststrasse 1', postalCode:'10115', city:'Berlin', country:'DE', vatId:'DE123456789', email:'billing@example.invalid',contactName:'Accounts Receivable',telephone:'+49 30 12345678',iban:'DE89370400440532013000',endpoint:'DE123456789',endpointScheme:'9930' };
const buyer = { name:'Example Buyer GmbH', street:'Musterstrasse 2', postalCode:'20095', city:'Hamburg', country:'DE', vatId:'DE987654321', email:'ap@example.invalid',endpoint:'DE987654321',endpointScheme:'9930' };
const invoice = buildInvoiceModel(data, seller, buyer);
let failed = false;
const validResult = await validateXml(generateXRechnungUbl(invoice));
console.log(`Generated XRechnung UBL: ${validResult.outcome} (${validResult.ruleset})`);
if (validResult.outcome !== 'accepted') {
  console.error(validResult.message);
  const messages=[...String(validResult.report||'').matchAll(/<rep:message[^>]*>(.*?)<\/rep:message>/gi)].map(item=>item[1].replace(/<[^>]+>/g,' ').trim());
  if(messages.length)console.error(messages.join('\n'));
  failed = true;
}
const invalid = generateXRechnungUbl(invoice).replace('<cbc:BuyerReference>TEST-REF-001</cbc:BuyerReference>', '<cbc:BuyerReference></cbc:BuyerReference>');
const rejected = await validateXml(invalid);
console.log(`Invalid fixture (missing buyer reference): ${rejected.outcome}`);
if (rejected.outcome !== 'rejected') {
  console.error(rejected.message);
  if (rejected.report) console.error(rejected.report.slice(0, 12000));
  failed = true;
}
if (failed) process.exitCode = 1;
