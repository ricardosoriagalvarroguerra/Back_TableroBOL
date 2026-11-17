// Fuente: mercado paralelo P2P (Binance, USDT/BOB). El precio de referencia es la
// MEDIANA de los primeros 10 avisos: «venta» = avisos donde el usuario compra
// USDT (precio al que se consigue el dólar), «compra» = avisos de venta.
import type { PoolClient } from 'pg';
import { postJson } from './http.ts';
import { upsertObs, recalcularDelta, fijarAsof } from './obs.ts';

const URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
type Resp = { code?: string; data?: { adv: { price: string } }[] };

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function precios(tradeType: 'BUY' | 'SELL'): Promise<number[]> {
  const r = await postJson<Resp>(URL, { asset: 'USDT', fiat: 'BOB', tradeType, page: 1, rows: 10, payTypes: [], publisherType: null });
  return (r.data ?? []).map((d) => Number(d.adv.price)).filter((v) => Number.isFinite(v) && v > 1 && v < 100);
}

/** Fecha de hoy en Bolivia (UTC−4). */
const hoyBo = () => new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);

export async function ingestarP2p(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  const [venta, compra] = await Promise.all([precios('BUY'), precios('SELL')]);
  if (venta.length < 3) throw new Error(`P2P: pocos avisos (${venta.length})`);
  const v = Number(mediana(venta).toFixed(2));
  const c = compra.length ? Number(mediana(compra).toFixed(2)) : null;
  const fecha = hoyBo();
  const filas = (await upsertObs(client, 'usdbob_paralelo', fecha, v)) ? 1 : 0;
  await recalcularDelta(client, 'usdbob_paralelo', { minDias: 14, modo: 'pct', conFecha: false });
  await fijarAsof(client, 'usdbob_paralelo', `${Number(fecha.slice(8))} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(fecha.slice(5, 7)) - 1]} · P2P`);
  return { filas, mensaje: `paralelo P2P venta Bs ${v.toFixed(2).replace('.', ',')}${c ? ` · compra ${c.toFixed(2).replace('.', ',')}` : ''}` };
}
