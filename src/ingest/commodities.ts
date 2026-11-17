// Fuente: precios de commodities de exportación.
//  · Yahoo Finance (futuros): oro GC=F, plata SI=F, soya ZS=F (centavos → USD/bushel), Henry Hub NG=F.
//  · Westmetall (cierre oficial LME, cash-settlement): estaño y zinc.
// Actualiza `commodities` (valor, var. mensual/anual) y `commodity_observaciones` (cierre diario).
import type { PoolClient } from 'pg';
import { getJson, getText } from './http.ts';

type Serie = { f: string; v: number }[];

type YahooResp = { chart: { result?: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] } };
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Yahoo limita ráfagas (HTTP 429): alterna query1/query2 con pausas crecientes. */
async function yahooJson(simbolo: string): Promise<YahooResp> {
  let ultimo: unknown;
  for (let i = 0; i < 4; i++) {
    const host = i % 2 ? 'query2' : 'query1';
    try {
      return await getJson<YahooResp>(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=13mo&interval=1d`);
    } catch (err) {
      ultimo = err;
      await pausa(1500 * (i + 1));
    }
  }
  throw ultimo;
}

async function yahoo(simbolo: string, escala = 1): Promise<Serie> {
  await pausa(800);
  const r = await yahooJson(simbolo);
  const res = r.chart.result?.[0];
  if (!res) throw new Error(`Yahoo sin datos para ${simbolo}`);
  const c = res.indicators.quote[0].close;
  return res.timestamp
    .map((t, i) => ({ f: new Date(t * 1000).toISOString().slice(0, 10), v: c[i] }))
    .filter((p): p is { f: string; v: number } => p.v != null)
    .map((p) => ({ f: p.f, v: Number((p.v * escala).toFixed(3)) }));
}

const MESES_EN: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
  July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
};
async function westmetall(campo: 'LME_Sn_cash' | 'LME_Zn_cash'): Promise<Serie> {
  const html = await getText(`https://www.westmetall.com/en/markdaten.php?action=table&field=${campo}`);
  const out: Serie = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const celdas = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    const md = celdas[0]?.match(/^(\d{1,2})\.\s+(\w+)\s+(\d{4})$/);
    const v = Number((celdas[1] ?? '').replace(/,/g, ''));
    if (md && MESES_EN[md[2]] && Number.isFinite(v) && v > 0) out.push({ f: `${md[3]}-${MESES_EN[md[2]]}-${md[1].padStart(2, '0')}`, v });
  }
  if (!out.length) throw new Error(`Westmetall sin datos para ${campo}`);
  return out.sort((a, b) => (a.f < b.f ? -1 : 1)).filter((p) => p.f >= new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
}

const FUENTES: { codigo: string; leer: () => Promise<Serie>; fuente: string }[] = [
  { codigo: 'oro', leer: () => yahoo('GC=F'), fuente: 'COMEX (Yahoo Finance)' },
  { codigo: 'plata', leer: () => yahoo('SI=F'), fuente: 'COMEX (Yahoo Finance)' },
  { codigo: 'soya', leer: () => yahoo('ZS=F', 0.01), fuente: 'CBOT (Yahoo Finance)' },
  { codigo: 'gas_hh', leer: () => yahoo('NG=F'), fuente: 'NYMEX (Yahoo Finance)' },
  { codigo: 'estano', leer: () => westmetall('LME_Sn_cash'), fuente: 'LME cash (Westmetall)' },
  { codigo: 'zinc', leer: () => westmetall('LME_Zn_cash'), fuente: 'LME cash (Westmetall)' },
];

/** Valor en la fecha más cercana anterior o igual a `f`. */
const enFecha = (s: Serie, f: string) => [...s].reverse().find((p) => p.f <= f)?.v ?? null;
const atras = (f: string, dias: number) => new Date(Date.parse(f) - dias * 86_400_000).toISOString().slice(0, 10);
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export async function ingestarCommodities(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  let filas = 0;
  const ok: string[] = [];
  const errores: string[] = [];
  for (const c of FUENTES) {
    try {
      const s = await c.leer();
      const ult = s[s.length - 1];
      const m = enFecha(s, atras(ult.f, 30));
      const a = enFecha(s, atras(ult.f, 365));
      const varM = m ? Number(((ult.v / m - 1) * 100).toFixed(2)) : null;
      const varA = a ? Number(((ult.v / a - 1) * 100).toFixed(2)) : null;
      const r = await client.query(
        `UPDATE commodities SET valor = $2, var_mensual = $3, var_anual = $4, fuente = $5, asof = $6 WHERE codigo = $1 RETURNING id`,
        [c.codigo, ult.v, varM, varA, c.fuente, `${Number(ult.f.slice(8))} ${MES[Number(ult.f.slice(5, 7)) - 1]}`],
      );
      const id = r.rows[0]?.id;
      if (!id) continue;
      for (const p of s) {
        const u = await client.query(
          `INSERT INTO commodity_observaciones (commodity_id, fecha, valor) VALUES ($1, $2, $3)
           ON CONFLICT (commodity_id, fecha) DO UPDATE SET valor = EXCLUDED.valor
             WHERE commodity_observaciones.valor IS DISTINCT FROM EXCLUDED.valor`,
          [id, p.f, p.v],
        );
        filas += u.rowCount ?? 0;
      }
      ok.push(`${c.codigo} ${ult.v}`);
    } catch (err) {
      errores.push(`${c.codigo}: ${(err as Error).message.replace(/^https?:\/\/\S+ → /, '').slice(0, 60)}`);
    }
  }
  if (!ok.length) throw new Error(errores.join(' · '));
  return { filas, mensaje: ok.join(' · ') + (errores.length ? ` · fallas: ${errores.join(' · ')}` : '') };
}
