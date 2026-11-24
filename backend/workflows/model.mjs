const decimal = (value, scale = 2) => {
  const match = String(value ?? '').trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid decimal amount: ${value}`);
  const sign = match[1] ? -1n : 1n, fraction = (match[3] || '').padEnd(scale + 1, '0');
  const base = BigInt(match[2]) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale) || '0');
  const rounded = fraction[scale] >= '5' ? base + 1n : base;
  return sign * rounded;
};
const money = cents => `${cents / 100n}.${String(cents % 100n).replace('-', '').padStart(2, '0')}`;
const roundRatio = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
const text = value => String(value ?? '').trim();

export function buildInvoiceModel(data, seller, buyer = {}) {
  const rawLines = Array.isArray(data.lines) && data.lines.length ? data.lines : [{ description: data.description, quantity: data.quantity, unitPrice: data.unitPrice, taxRate: data.taxRate, unitCode: data.unitCode || 'C62', taxCategory: Number(data.taxRate) === 0 ? 'Z' : 'S' }];
  const lines = rawLines.map((line, index) => {
    const quantity = decimal(line.quantity || 1, 3), price = decimal(line.unitPrice, 2), lineNet = roundRatio(quantity * price, 1000n);
    const rate = decimal(line.taxRate ?? data.taxRate ?? 19, 2);
    if (quantity <= 0n || price < 0n || rate < 0n || rate > 10000n) throw new Error(`Invoice line ${index + 1} has an invalid quantity, price, or VAT rate.`);
    const category = text(line.taxCategory) || (rate === 0n ? '' : 'S');
    const taxExemptionReason = text(line.taxExemptionReason);
    return { description: text(line.description), quantity, quantityText: moneyScaled(quantity, 3), unitCode: text(line.unitCode) || 'C62', unitPrice: price, net: lineNet, rate, category, taxExemptionReason };
  });
  const byTax = new Map();
  for (const line of lines) {
    const key = `${line.category}:${line.rate}:${line.taxExemptionReason}`;
    const group = byTax.get(key) || { category: line.category, rate: line.rate, base: 0n, tax: 0n, taxExemptionReason:line.taxExemptionReason };
    group.base += line.net;
    group.tax += line.category === 'S' ? roundRatio(line.net * line.rate, 10000n) : 0n;
    byTax.set(key, group);
  }
  const net = lines.reduce((sum, line) => sum + line.net, 0n);
  const tax = [...byTax.values()].reduce((sum, group) => sum + group.tax, 0n);
  const errors = [];
  for (const [field, value] of [['invoiceNumber', data.documentNumber || data.invoiceNumber], ['issueDate', data.issueDate], ['deliveryDate', data.deliveryDate], ['currency', data.currency || 'EUR']]) if (!text(value)) errors.push(`${field} is required.`);
  for (const [partyName, party] of [['seller', seller], ['buyer', buyer]]) {
    for (const field of ['name', 'street', 'postalCode', 'city', 'country']) if (!text(party?.[field])) errors.push(`${partyName}.${field} is required to generate an EN 16931 invoice.`);
    for (const field of ['endpoint','endpointScheme']) if (!text(party?.[field])) errors.push(`${partyName}.${field} is required by the configured XRechnung profile.`);
  }
  if(!text(seller?.contactName))errors.push('seller.contactName is required for the German XRechnung profile.');
  if(!text(seller?.telephone)||String(seller.telephone).replace(/\D/g,'').length<3)errors.push('A seller telephone number with at least three digits is required for XRechnung.');
  if(!text(seller?.iban))errors.push('A seller IBAN is required for the XRechnung payment instructions.');
  if (lines.some(line => !line.description)) errors.push('Every invoice line needs a description.');
  if(lines.some(line=>!['S','Z','E','AE','G','O'].includes(line.category)))errors.push('Choose a supported VAT category for every invoice line.');
  if(lines.some(line=>line.category==='S'&&line.rate===0n))errors.push('A zero VAT rate cannot use the standard-rated category.');
  if(lines.some(line=>['E','AE','G','O'].includes(line.category)&&!line.taxExemptionReason))errors.push('Add the legal VAT exemption or reverse-charge reason for each applicable line.');
  if (!text(data.buyerReference) && !text(buyer.buyerReference)) errors.push('Buyer reference is required for the XRechnung profile.');
  if (errors.length) throw Object.assign(new Error('Invoice is missing required structured data.'), { status: 422, details: errors });
  return {
    invoiceNumber: text(data.documentNumber || data.invoiceNumber), issueDate: text(data.issueDate), deliveryDate: text(data.deliveryDate), dueDate: text(data.dueDate),
    currency: text(data.currency || 'EUR').toUpperCase(), buyerReference: text(data.buyerReference || buyer.buyerReference),
    seller, buyer, lines, taxGroups: [...byTax.values()].map(group => ({ ...group, baseText: money(group.base), taxText: money(group.tax), rateText: money(group.rate) })),
    net, tax, gross: net + tax, netText: money(net), taxText: money(tax), grossText: money(net + tax), typeCode: '380',
  };
}

function moneyScaled(value, scale) {
  const negative = value < 0n, absolute = negative ? -value : value, base = 10n ** BigInt(scale);
  const integer = absolute / base, fraction = String(absolute % base).padStart(scale, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

export function generateXRechnungUbl(invoice) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
  const tag = (name, value, attrs = '') => `<cbc:${name}${attrs}>${esc(value)}</cbc:${name}>`;
  const endpoint = party => party.endpoint ? tag('EndpointID', party.endpoint, party.endpointScheme ? ` schemeID="${esc(party.endpointScheme)}"` : '') : '';
  const address = party => `<cac:PostalAddress>${tag('StreetName', party.street)}${tag('CityName', party.city)}${tag('PostalZone', party.postalCode)}<cac:Country>${tag('IdentificationCode', party.country)}</cac:Country></cac:PostalAddress>`;
  const partyXml = (party, role) => `<cac:${role}><cac:Party>${endpoint(party)}${address(party)}${party.vatId?`<cac:PartyTaxScheme>${tag('CompanyID', party.vatId)}<cac:TaxScheme>${tag('ID', 'VAT')}</cac:TaxScheme></cac:PartyTaxScheme>`:''}<cac:PartyLegalEntity>${tag('RegistrationName', party.name)}</cac:PartyLegalEntity>${(party.contactName||party.telephone||party.email) ? `<cac:Contact>${party.contactName?tag('Name',party.contactName):''}${party.telephone?tag('Telephone',party.telephone):''}${party.email ? tag('ElectronicMail', party.email) : ''}</cac:Contact>` : ''}</cac:Party></cac:${role}>`;
  const lines = invoice.lines.map((line, index) => `<cac:InvoiceLine>${tag('ID', index + 1)}${tag('InvoicedQuantity', line.quantityText, ` unitCode="${esc(line.unitCode)}"`)}${tag('LineExtensionAmount', money(line.net), ` currencyID="${invoice.currency}"`)}<cac:Item>${tag('Name', line.description)}<cac:ClassifiedTaxCategory>${tag('ID', line.category)}${tag('Percent', money(line.rate))}${line.taxExemptionReason?tag('TaxExemptionReason',line.taxExemptionReason):''}<cac:TaxScheme>${tag('ID', 'VAT')}</cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price>${tag('PriceAmount', money(line.unitPrice), ` currencyID="${invoice.currency}"`)}</cac:Price></cac:InvoiceLine>`).join('');
  const subtotals = invoice.taxGroups.map(group => `<cac:TaxSubtotal>${tag('TaxableAmount', group.baseText, ` currencyID="${invoice.currency}"`)}${tag('TaxAmount', group.taxText, ` currencyID="${invoice.currency}"`)}<cac:TaxCategory>${tag('ID', group.category)}${tag('Percent', group.rateText)}${group.taxExemptionReason?tag('TaxExemptionReason',group.taxExemptionReason):''}<cac:TaxScheme>${tag('ID', 'VAT')}</cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join('');
  const paymentMeans=invoice.seller.iban?`<cac:PaymentMeans>${tag('PaymentMeansCode','58')}<cac:PayeeFinancialAccount>${tag('ID',invoice.seller.iban)}</cac:PayeeFinancialAccount></cac:PaymentMeans>`:'';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">${tag('CustomizationID','urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0')}${tag('ProfileID','urn:fdc:peppol.eu:2017:poacc:billing:01:1.0')}${tag('ID',invoice.invoiceNumber)}${tag('IssueDate',invoice.issueDate)}${invoice.dueDate?tag('DueDate',invoice.dueDate):''}${tag('InvoiceTypeCode',invoice.typeCode)}${tag('DocumentCurrencyCode',invoice.currency)}${tag('BuyerReference',invoice.buyerReference)}${partyXml(invoice.seller,'AccountingSupplierParty')}${partyXml(invoice.buyer,'AccountingCustomerParty')}<cac:Delivery>${tag('ActualDeliveryDate',invoice.deliveryDate)}</cac:Delivery>${paymentMeans}<cac:TaxTotal>${tag('TaxAmount',invoice.taxText,` currencyID="${invoice.currency}"`)}${subtotals}</cac:TaxTotal><cac:LegalMonetaryTotal>${tag('LineExtensionAmount',invoice.netText,` currencyID="${invoice.currency}"`)}${tag('TaxExclusiveAmount',invoice.netText,` currencyID="${invoice.currency}"`)}${tag('TaxInclusiveAmount',invoice.grossText,` currencyID="${invoice.currency}"`)}${tag('PayableAmount',invoice.grossText,` currencyID="${invoice.currency}"`)}</cac:LegalMonetaryTotal>${lines}</Invoice>`;
}

export function generateCiiInvoice(invoice) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
  const element = (name, value, attrs = '') => `<ram:${name}${attrs}>${esc(value)}</ram:${name}>`;
  const party = (name, data) => `<ram:${name}><ram:Name>${esc(data.name)}</ram:Name>${name==='SellerTradeParty'&&data.contactName?`<ram:DefinedTradeContact>${element('PersonName',data.contactName)}${data.telephone?`<ram:TelephoneUniversalCommunication>${element('CompleteNumber',data.telephone)}</ram:TelephoneUniversalCommunication>`:''}${data.email?`<ram:EmailURIUniversalCommunication>${element('URIID',data.email)}</ram:EmailURIUniversalCommunication>`:''}</ram:DefinedTradeContact>`:''}<ram:PostalTradeAddress>${element('PostcodeCode',data.postalCode)}${element('LineOne',data.street)}${element('CityName',data.city)}${element('CountryID',data.country)}</ram:PostalTradeAddress>${data.endpoint ? `<ram:URIUniversalCommunication>${element('URIID',data.endpoint,data.endpointScheme?` schemeID="${esc(data.endpointScheme)}"`:'')}</ram:URIUniversalCommunication>` : ''}${data.vatId?`<ram:SpecifiedTaxRegistration>${element('ID',data.vatId,' schemeID="VA"')}</ram:SpecifiedTaxRegistration>`:''}</ram:${name}>`;
  const lines = invoice.lines.map((line,index)=>`<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument>${element('LineID',index+1)}</ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct>${element('Name',line.description)}</ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice>${element('ChargeAmount',money(line.unitPrice))}</ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery>${element('BilledQuantity',line.quantityText,` unitCode="${esc(line.unitCode)}"`)}</ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax>${element('TypeCode','VAT')}${element('CategoryCode',line.category)}${element('RateApplicablePercent',money(line.rate))}${line.taxExemptionReason?element('ExemptionReason',line.taxExemptionReason):''}</ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation>${element('LineTotalAmount',money(line.net))}</ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('');
  const taxes=invoice.taxGroups.map(group=>`<ram:ApplicableTradeTax>${element('CalculatedAmount',group.taxText,` currencyID="${invoice.currency}"`)}${element('TypeCode','VAT')}${element('BasisAmount',group.baseText,` currencyID="${invoice.currency}"`)}${element('CategoryCode',group.category)}${element('RateApplicablePercent',group.rateText)}${group.taxExemptionReason?element('ExemptionReason',group.taxExemptionReason):''}</ram:ApplicableTradeTax>`).join('');
  const paymentMeans=invoice.seller.iban?`<ram:SpecifiedTradeSettlementPaymentMeans>${element('TypeCode','58')}<ram:PayeePartyCreditorFinancialAccount>${element('IBANID',invoice.seller.iban)}</ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>`:'';
  const date=(value)=>`<udt:DateTimeString format="102">${esc(value.replaceAll('-',''))}</udt:DateTimeString>`;
  const due=invoice.dueDate?`<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime>${date(invoice.dueDate)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`:'';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"><rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter>${element('ID','urn:cen.eu:en16931:2017')}</ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext><rsm:ExchangedDocument>${element('ID',invoice.invoiceNumber)}${element('TypeCode',invoice.typeCode)}<ram:IssueDateTime>${date(invoice.issueDate)}</ram:IssueDateTime></rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction>${lines}<ram:ApplicableHeaderTradeAgreement>${invoice.buyerReference?element('BuyerReference',invoice.buyerReference):''}${party('SellerTradeParty',invoice.seller)}${party('BuyerTradeParty',invoice.buyer)}</ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date(invoice.deliveryDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery><ram:ApplicableHeaderTradeSettlement>${element('InvoiceCurrencyCode',invoice.currency)}${paymentMeans}${taxes}${due}<ram:SpecifiedTradeSettlementHeaderMonetarySummation>${element('LineTotalAmount',invoice.netText,` currencyID="${invoice.currency}"`)}${element('TaxBasisTotalAmount',invoice.netText,` currencyID="${invoice.currency}"`)}${element('TaxTotalAmount',invoice.taxText,` currencyID="${invoice.currency}"`)}${element('GrandTotalAmount',invoice.grossText,` currencyID="${invoice.currency}"`)}${element('DuePayableAmount',invoice.grossText,` currencyID="${invoice.currency}"`)}</ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}
