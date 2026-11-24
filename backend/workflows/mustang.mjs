import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
const exec = promisify(execFile);

async function configured() {
  const jar = resolve(process.env.MUSTANG_CLI_JAR || './tools/mustang/Mustang-CLI-2.26.0.jar');
  if (!existsSync(jar)) throw Object.assign(new Error('Mustang CLI is missing. Run npm run setup:mustang and ensure Java is installed.'), { status: 503 });
  return jar;
}

export function getMustangStatus() {
  const jar=resolve(process.env.MUSTANG_CLI_JAR || './tools/mustang/Mustang-CLI-2.26.0.jar');
  return { configured:existsSync(jar), engine:'Mustang CLI 2.26.0' };
}

export async function extractCiiFromPdf(pdf) {
  const jar = await configured(), dir = await mkdtemp(join(tmpdir(), 'ledgerly-mustang-extract-'));
  const source = join(dir, 'received.pdf'), output = join(dir, 'invoice.xml');
  try {
    await writeFile(source, pdf, { flag: 'wx' });
    await exec(process.env.JAVA_BIN || 'java', ['-jar', jar, '--action', 'extract', '--source', source, '--out', output, '--disable-file-logging'], { cwd: dir, timeout: 60_000, maxBuffer: 2_000_000, windowsHide: true });
    const xml = await readFile(output);
    if (!xml.length || xml.length > 10 * 1024 * 1024) throw Object.assign(new Error('Embedded invoice XML is empty or too large.'), { status: 422 });
    return xml.toString('utf8');
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error(error.killed ? 'ZUGFeRD extraction timed out.' : `Could not extract structured XML from PDF: ${String(error.stderr || error.message).slice(0,500)}`), { status: 422 });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function combineZugferdPdf({ basePdf, xml }) {
  const jar = await configured(), dir = await mkdtemp(join(tmpdir(), 'ledgerly-mustang-combine-'));
  const source = join(dir, 'invoice-base.pdf'), sourceXml = join(dir, 'factur-x.xml'), output = join(dir, 'invoice-zugferd.pdf');
  try {
    await writeFile(source, basePdf, { flag: 'wx' }); await writeFile(sourceXml, xml, { encoding: 'utf8', flag: 'wx' });
    await exec(process.env.JAVA_BIN || 'java', ['-jar', jar, '--action', 'combine', '--source', source, '--source-xml', sourceXml, '--out', output, '--format', 'zf', '--version', '2', '--profile', 'E', '--no-additional-attachments', '--disable-file-logging'], { cwd: dir, timeout: 90_000, maxBuffer: 4_000_000, windowsHide: true });
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== '%PDF-' || !pdf.subarray(-2048).toString('latin1').includes('%%EOF')) throw Object.assign(new Error('Mustang output is not a complete PDF file.'), { status: 422 });
    const embedded = await extractCiiFromPdf(pdf);
    if (!/CrossIndustryInvoice/.test(embedded)) throw Object.assign(new Error('Packaged PDF did not retain the expected CII invoice.'), { status: 422 });
    return pdf;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error(error.killed ? 'ZUGFeRD PDF/A-3 packaging timed out.' : `Mustang could not package the ZUGFeRD PDF: ${String(error.stderr || error.message).slice(0,500)}`), { status: 422 });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function validateZugferdFile(payload, filename = 'zugferd.pdf') {
  const jar = await configured(), dir = await mkdtemp(join(tmpdir(), 'ledgerly-mustang-validate-'));
  const source = join(dir, filename.toLowerCase().endsWith('.pdf') ? 'invoice.pdf' : 'invoice.xml');
  try {
    await writeFile(source, payload, { flag: 'wx' });
    const result = await exec(process.env.JAVA_BIN || 'java', ['-jar', jar, '--action', 'validate', '--source', source, '--disable-file-logging'], { cwd: dir, timeout: 90_000, maxBuffer: 4_000_000, windowsHide: true });
    const report = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    return { outcome: 'accepted', ruleset: process.env.MUSTANG_RULESET_ID || 'Mustang CLI 2.26.0 · Factur-X/ZUGFeRD', report, message: 'Mustang accepted the ZUGFeRD document.' };
  } catch (error) {
    if (error.status) throw error;
    return { outcome: error.code === 'ENOENT' ? 'unavailable' : 'failed', ruleset: process.env.MUSTANG_RULESET_ID || 'Mustang CLI 2.26.0 · Factur-X/ZUGFeRD', report: `${error.stdout || ''}\n${error.stderr || ''}`.trim(), message: error.killed ? 'Mustang validation timed out.' : 'Mustang did not accept the ZUGFeRD document.' };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
