import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bundledJar = join(projectRoot, 'tools', 'kosit', 'validator-1.6.3-standalone.jar');
const bundledScenarios = join(projectRoot, 'tools', 'kosit', 'xrechnung-3.0.2', 'scenarios.xml');
const bundledRepository = join(projectRoot, 'tools', 'kosit', 'xrechnung-3.0.2');

export async function getValidatorStatus() {
  const jar = process.env.KOSIT_VALIDATOR_JAR || bundledJar;
  const scenarios = process.env.KOSIT_SCENARIOS || bundledScenarios;
  const repository = process.env.KOSIT_REPOSITORY || bundledRepository;
  const configured = Boolean(process.env.KOSIT_DISABLED !== 'true' && existsSync(jar) && existsSync(scenarios) && existsSync(repository));
  const url=process.env.KOSIT_URL || 'http://127.0.0.1:8081';
  let running=false;
  if(configured){try{const response=await fetch(`${url.replace(/\/$/,'')}/server/health`,{signal:AbortSignal.timeout(2_000)});const status=response.ok?await response.text():'';running=response.ok&&/<(?:[\w.-]+:)?status>UP<\//i.test(status);}catch{}}
  return { configured, running, engine: 'KoSIT Validator 1.6.3', ruleset: process.env.KOSIT_RULESET_ID || 'XRechnung 3.0.2 · 2026-08-31', url };
}

function detectFormat(xml) {
  if (/urn:oasis:names:specification:ubl:schema:xsd:Invoice-2/i.test(xml)) return 'xrechnung-ubl';
  if (/CrossIndustryInvoice|urn:un:unece:uncefact:data:standard:CrossIndustryInvoice/i.test(xml)) return 'cii';
  throw Object.assign(new Error('XML root is not a recognized UBL Invoice or CII document.'), { status: 400 });
}
export function extractDocumentDate(xml){
  const ubl=xml.match(/<(?:(?:\w+):)?IssueDate(?:\s[^>]*)?>(\d{4}-\d{2}-\d{2})<\//i)?.[1];
  if(ubl)return ubl;
  return xml.match(/<(?:(?:\w+):)?DateTimeString[^>]*>(\d{8})<\//i)?.[1]?.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3') || null;
}

export async function validateXml(xml, requestedFormat = '') {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) < 1 || Buffer.byteLength(xml) > 10 * 1024 * 1024) throw Object.assign(new Error('XML must be between 1 byte and 10 MB.'), { status: 413 });
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<[^!?]/i.test(xml)) throw Object.assign(new Error('Upload must contain XML.'), { status: 400 });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Object.assign(new Error('XML document type and entity declarations are not accepted.'), { status: 400 });
  const detected = detectFormat(xml);
  const selected=String(requestedFormat).toLowerCase();
  if (selected && ((selected.includes('ubl') && detected!=='xrechnung-ubl') || (selected.includes('cii') && detected!=='cii') || (selected.includes('zugferd') && detected!=='cii'))) throw Object.assign(new Error('Selected format does not match the XML document.'), { status: 400 });
  const { configured, ruleset, url } = await getValidatorStatus();
  const jar = process.env.KOSIT_VALIDATOR_JAR || bundledJar;
  const scenarios = process.env.KOSIT_SCENARIOS || bundledScenarios;
  const repository = process.env.KOSIT_REPOSITORY || bundledRepository;
  if (!configured) return { outcome: 'unavailable', format: detected, ruleset: null, report: null, message: 'KoSIT validation is disabled. Re-run npm run setup:kosit to install the pinned validator and XRechnung ruleset.' };
  try {
    const endpoint = new URL(encodeURIComponent(`ledgerly-${Date.now()}.xml`), `${url.replace(/\/$/,'')}/`);
    let response;
    try { response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/xml; charset=utf-8','accept':'application/xml'},body:xml,signal:AbortSignal.timeout(90_000)}); }
    catch (error) { return { outcome:'unavailable',format:detected,ruleset,report:null,message:error.name==='TimeoutError'?'KoSIT validation timed out. Start the local KoSIT service and retry.':'KoSIT service is installed but not running. Start it with npm run start:kosit, then retry.' }; }
    const report=await response.text();
    const acceptedNode=/<(?:[\w.-]+:)?accept(?:\s|>)/i.test(report),rejectedNode=/<(?:[\w.-]+:)?reject(?:\s|>)/i.test(report);
    if (response.status===200 && acceptedNode && !rejectedNode) return { outcome:'accepted',format:detected,ruleset,documentDate:extractDocumentDate(xml),report,message:'KoSIT accepted the document under the configured XRechnung ruleset.' };
    if (response.status===406 && rejectedNode) return { outcome:'rejected',format:detected,ruleset,documentDate:extractDocumentDate(xml),report,message:'KoSIT rejected the document. Review the rule findings in the report.' };
    return { outcome:'inconclusive',format:detected,ruleset,documentDate:extractDocumentDate(xml),report:report.slice(0,1_000_000),message:`KoSIT returned HTTP ${response.status} without an unambiguous acceptance result; invoice remains blocked.` };
  } catch (error) {
    return { outcome:'failed',format:detected,ruleset,report:null,message:error.name==='TimeoutError'?'KoSIT validation timed out.':'KoSIT validation request failed.' };
  }
}
