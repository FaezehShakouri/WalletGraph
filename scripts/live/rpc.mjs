export async function rpc(url, method, params = []) {
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) });
  } catch { throw new Error(`${method}: RPC connection failed (endpoint withheld)`); }
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(`${method}: RPC error ${json.error.code}`);
  if (json.result == null) throw new Error(`${method}: missing result`);
  return json.result;
}
