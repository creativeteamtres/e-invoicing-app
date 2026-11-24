import { randomUUID } from 'node:crypto';

const columns = ['Umsatz (ohne Soll/Haben-Kz)','Soll/Haben-Kennzeichen','WKZ Umsatz','Kurs','Basis-Umsatz','WKZ Basis-Umsatz','Konto','Gegenkonto (ohne BU-Schlüssel)','BU-Schlüssel','Belegdatum','Belegfeld 1','Belegfeld 2','Skonto','Buchungstext'];
const csv = value => `"${String(value ?? '').replaceAll('"','""')}"`;
const dec = value => {
  const match = String(value ?? '').match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid monetary value: ${value}`);
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(3,'0').slice(0,2)) + ((match[2] || '').padEnd(3,'0')[2] >= '5' ? 1n : 0n);
  return cents;
};
const money = cents => `${cents / 100n},${String(cents % 100n).padStart(2,'0')}`;

export function buildDatevBookingExport(records, config) {
  const errors = [];
  for (const key of ['consultantNumber','clientNumber','fiscalYearStart','periodStart','periodEnd','salesAccount','salesContraAccount','purchaseAccount','purchaseContraAccount','accountingFramework']) if (!String(config?.[key] ?? '').trim()) errors.push(`${key} is required for DATEV Buchungsstapel export.`);
  if (!['3','4'].includes(String(config?.accountingFramework))) errors.push('Select the configured SKR03 or SKR04 account framework.');
  const start=String(config?.fiscalYearStart||'').replaceAll('-',''),periodStart=String(config?.periodStart||'').replaceAll('-',''),periodEnd=String(config?.periodEnd||'').replaceAll('-','');
  if (![start,periodStart,periodEnd].every(value => /^\d{8}$/.test(value))) errors.push('Enter fiscal year and export dates as YYYY-MM-DD.');
  if(periodStart>periodEnd||start>periodStart||periodEnd.slice(0,4)!==periodStart.slice(0,4))errors.push('Export period must be a valid date range within one calendar year and within the selected fiscal year.');
  if (errors.length) throw Object.assign(new Error('Complete the DATEV export settings first.'), { status: 422, details: errors });
  const taxKeys = config.taxKeys || {};
  const rows = [];
  for (const record of records) {
    const invoice = record.data;
    if (!['outgoing','incoming'].includes(record.direction)) continue;
    if (!invoice.issueDate || invoice.issueDate.replaceAll('-','')<periodStart||invoice.issueDate.replaceAll('-','')>periodEnd) continue;
    const lines = Array.isArray(invoice.lines) && invoice.lines.length ? invoice.lines : [{ description: invoice.description, quantity: invoice.quantity || 1, unitPrice: invoice.unitPrice, taxRate: invoice.taxRate ?? 19, taxCategory:invoice.taxCategory||'S' }];
    for (const line of lines) {
      const rate = String(line.taxRate ?? invoice.taxRate ?? 19);
      const category=String(line.taxCategory||invoice.taxCategory||'S'),taxKey=String(taxKeys[`${category}:${rate}`]??'');
      const quantity = Number(line.quantity || 1);
      const netCents = dec(line.unitPrice) * BigInt(Math.round(quantity * 1000)) / 1000n;
      if (!['Z','O'].includes(category)&&!taxKey.trim()) errors.push(`A DATEV BU key mapping is required for VAT category ${category} at ${rate}%.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.issueDate)) { errors.push(`${record.documentNumber} needs a valid issue date.`); continue; }
      const account=record.direction==='incoming'?config.purchaseAccount:config.salesAccount,contra=record.direction==='incoming'?config.purchaseContraAccount:config.salesContraAccount,side=record.direction==='incoming'?'S':'H',counterparty=record.direction==='incoming'?invoice.seller?.name:invoice.buyer?.name||invoice.customer;
      rows.push([money(netCents),side,'EUR','','','',String(account),String(contra),taxKey,invoice.issueDate.slice(8,10)+invoice.issueDate.slice(5,7),invoice.documentNumber || record.documentNumber,'','',`${counterparty || 'Counterparty'} · ${line.description || 'Invoice'}`]);
    }
  }
  if (errors.length) throw Object.assign(new Error('Some invoices cannot be exported with this DATEV configuration.'), { status: 422, details: errors });
  if (!rows.length) throw Object.assign(new Error('There are no outgoing invoices available for this export.'), { status: 422 });
  const now = new Date(), timestamp = now.toISOString().replace(/[-:TZ.]/g,'').slice(0,17);
  const header = ['EXTF',700,21,'Buchungsstapel',13,timestamp,'','RE','','',config.consultantNumber,config.clientNumber,start,Number(config.accountingFramework),periodStart,periodEnd,'Ledgerly export','RE',1,0,0,'EUR','','','','','03','','','',''];
  const rawHeader = new Set([1,2,4,5,10,11,12,13,14,15,18,19,20]);
  const payload = `\uFEFF${header.map((value,index)=>rawHeader.has(index)?String(value):csv(value)).join(';')}\r\n${columns.map(csv).join(';')}\r\n${rows.map(row => row.map(csv).join(';')).join('\r\n')}\r\n`;
  return { id: randomUUID(), filename: `EXTF_Buchungsstapel_${periodStart}_${periodEnd}.csv`, payload, rowCount: rows.length, format: 'DATEV-Format EXTF Buchungsstapel v700' };
}
