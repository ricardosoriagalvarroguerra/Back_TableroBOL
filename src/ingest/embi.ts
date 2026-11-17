// Fuente EMBI (JP Morgan) vía la serie histórica que publica el Banco Central de
// la República Dominicana: spread diario por país en PUNTOS PORCENTUALES
// (4,99 = 499 pb). Columna «Bolivia».
import type { PoolClient } from 'pg';
import { getBuffer } from './http.ts';
import { leerHojas, num } from './xlsx.ts';
import { upsertObs, recalcularDelta, fijarHistorico } from './obs.ts';

export const URL_EMBI = 'https://cdn.bancentral.gov.do/documents/entorno-internacional/documents/Serie_Historica_Spread_del_EMBI.xlsx';
const PAIS = 'Bolivia';
const DESDE_DIARIO = '2024-01-01';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function ingestarEmbi(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  const hojas = await leerHojas(await getBuffer(URL_EMBI));
  const filas = Object.values(hojas)[0];
  const iHdr = filas.findIndex((f) => f.some((c) => c === PAIS));
  if (iHdr < 0) throw new Error(`EMBI: sin columna ${PAIS}`);
  const col = filas[iHdr].indexOf(PAIS);
  const serie: { f: string; pb: number }[] = [];
  for (const f of filas.slice(iHdr + 1)) {
    const d = f[0];
    const v = num(f[col]);
    if (d instanceof Date && v != null) serie.push({ f: iso(d), pb: Math.round(v * 100) });
  }
  if (!serie.length) throw new Error('EMBI: serie vacía');
  serie.sort((a, b) => (a.f < b.f ? -1 : 1));

  const { rows } = await client.query<{ id: number }>(`SELECT id FROM indices_riesgo WHERE codigo = 'EMBI'`);
  const indiceId = rows[0]?.id;
  let n = 0;
  for (const p of serie) {
    if (p.f < DESDE_DIARIO) continue;
    if (await upsertObs(client, 'embi', p.f, p.pb)) n++;
    if (indiceId)
      await client.query(
        `INSERT INTO indice_riesgo_observaciones (indice_id, fecha, valor) VALUES ($1, $2, $3)
         ON CONFLICT (indice_id, fecha) DO UPDATE SET valor = EXCLUDED.valor`,
        [indiceId, p.f, p.pb],
      );
  }
  await recalcularDelta(client, 'embi', { minDias: 28, modo: 'abs', unidad: 'pb', conFecha: false });
  // variación del índice (panel Mercados) = la misma que el KPI
  const ult = serie[serie.length - 1];
  const ref = [...serie].reverse().find((p) => p.f <= new Date(Date.parse(ult.f) - 28 * 86_400_000).toISOString().slice(0, 10));
  if (indiceId && ref)
    await client.query(`UPDATE indice_riesgo_observaciones SET variacion = $3 WHERE indice_id = $1 AND fecha = $2`, [indiceId, ult.f, ult.pb - ref.pb]);

  // cierre de cada año (Histórico) + último dato
  const cierre = new Map<number, number>();
  for (const p of serie) cierre.set(Number(p.f.slice(0, 4)), p.pb);
  const anioUlt = Number(ult.f.slice(0, 4));
  const hist = [...cierre.entries()]
    .filter(([a]) => a >= 2015)
    .map(([a, v]) => ({ periodo: a === anioUlt ? `${a}*` : String(a), valor: v }));
  await fijarHistorico(client, 'embi', hist);
  await client.query(
    `UPDATE indicadores SET historico_nota = 'pb, fin de año · 2026* = ' || $1 WHERE codigo = 'embi'`,
    [ult.f.slice(8, 10) + '/' + ult.f.slice(5, 7)],
  );
  return { filas: n, mensaje: `EMBI ${ult.pb} pb al ${ult.f}` };
}
