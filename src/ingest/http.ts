// HTTP mínimo para la ingesta: timeout, User-Agent explícito (algunos sitios
// oficiales —FMI— devuelven HTML de bloqueo sin él) y error legible.

const UA = 'tablero-inteligente-ingesta/0.9 (+https://github.com/ricardosoriagalvarroguerra)';

export async function getText(url: string, timeoutMs = 30_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function getJson<T>(url: string, timeoutMs = 30_000): Promise<T> {
  const txt = await getText(url, timeoutMs);
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error(`${url} → respuesta no JSON (${txt.slice(0, 60).replace(/\s+/g, ' ')}…)`);
  }
}

export async function getBuffer(url: string, timeoutMs = 60_000): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

export async function postJson<T>(url: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
