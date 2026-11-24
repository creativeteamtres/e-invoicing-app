(() => {
  const defaultHost=location.hostname==='localhost'?'127.0.0.1':location.hostname;
  const base = (window.LEDGERLY_API_BASE || `${location.protocol}//${defaultHost}:3001`).replace(/\/$/, '');
  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, { credentials:'include', ...options, headers:{ ...(options.body && typeof options.body === 'string' ? {'content-type':'application/json'} : {}), ...(options.headers || {}) } });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw Object.assign(new Error(data?.error || `Request failed (${response.status}).`), { status:response.status, data });
    return data;
  }
  window.LedgerlyAPI = { base, request, json:(path,method='GET',body) => request(path,{method,...(body === undefined ? {} : {body:JSON.stringify(body)})}) };
})();
