// Helpers de escritura para la ingesta: upsert de observaciones de un
// indicador y recálculo del delta del dato vigente.

import type { PoolClient } from 'pg';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const ddMes = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
};
const coma = (v: number, dec = 1) => v.toFixed(dec).replace('.', ',').replace('-', '−');
export const pctTxt = (v: number, dec = 1) => `${v > 0 ? '+' : ''}${coma(v, dec)}%`;

/** Inserta o actualiza la observación (indicador, fecha). Devuelve true si cambió algo. */
export async function upsertObs(client: PoolClient, codigo: string, fecha: string, valor: number): Promise<boolean> {
  const r = await client.query(
    `INSERT INTO indicador_observaciones (indicador_id, fecha, valor)
     SELECT id, $2::date, $3 FROM indicadores WHERE codigo = $1
     ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor
       WHERE indicador_observaciones.valor IS DISTINCT FROM EXCLUDED.valor
     RETURNING id`,
    [codigo, fecha, valor],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Recalcula delta y etiqueta del último dato contra la observación más reciente
 * con al menos `minDias` de antigüedad (p. ej. 14 días → «−3,5% vs 1-nov»), y
 * actualiza `indicadores.asof` con la fecha del dato.
 */
export async function recalcularDelta(
  client: PoolClient,
  codigo: string,
  opts: { minDias: number; modo: 'pct' | 'pp' | 'abs'; dec?: number; conFecha?: boolean; unidad?: string; asof?: boolean },
): Promise<void> {
  const { rows } = await client.query<{ id: number; fecha: string; valor: number; ind: number }>(
    `SELECT o.id, to_char(o.fecha, 'YYYY-MM-DD') AS fecha, o.valor::float8 AS valor, o.indicador_id AS ind
       FROM indicador_observaciones o JOIN indicadores i ON i.id = o.indicador_id
      WHERE i.codigo = $1 ORDER BY o.fecha DESC LIMIT 1`,
    [codigo],
  );
  const ult = rows[0];
  if (!ult) return;
  const ref = await client.query<{ fecha: string; valor: number }>(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, valor::float8 AS valor FROM indicador_observaciones
      WHERE indicador_id = $1 AND fecha <= $2::date - $3::int ORDER BY fecha DESC LIMIT 1`,
    [ult.ind, ult.fecha, opts.minDias],
  );
  const base = ref.rows[0];
  if (base && base.valor !== 0) {
    const delta = opts.modo === 'pct' ? (ult.valor / base.valor - 1) * 100 : ult.valor - base.valor;
    const signo = delta > 0 ? '+' : '';
    const vs = opts.conFecha === false ? '' : ` vs ${ddMes(base.fecha)}`;
    const etiqueta =
      opts.modo === 'pct'
        ? `${pctTxt(delta, opts.dec ?? 1)}${vs}`
        : opts.modo === 'pp'
          ? `${signo}${coma(delta, opts.dec ?? 1)} pp${vs}`
          : `${signo}${Math.round(delta).toLocaleString('es-BO').replace('-', '−')} ${opts.unidad ?? ''}`.trim() + vs;
    await client.query(
      `UPDATE indicador_observaciones SET variacion = $2, variacion_etiqueta = $3 WHERE id = $1`,
      [ult.id, Number(delta.toFixed(4)), etiqueta],
    );
  }
  if (opts.asof !== false) {
    await client.query(`UPDATE indicadores SET asof = $2 WHERE codigo = $1`, [codigo, ddMes(ult.fecha)]);
  }
}

/** Fija la etiqueta «asof» del indicador (p. ej. «oct 2026»). */
export async function fijarAsof(client: PoolClient, codigo: string, asof: string): Promise<void> {
  await client.query(`UPDATE indicadores SET asof = $2 WHERE codigo = $1`, [codigo, asof]);
}

/** Actualiza el dato complementario («extra») de la tarjeta del indicador. */
export async function fijarExtra(client: PoolClient, codigo: string, label: string, valor: string, tono: 'pos' | 'neg' | 'neutral'): Promise<void> {
  await client.query(
    `UPDATE indicadores SET extra_label = $2, extra_valor = $3, extra_tono = $4 WHERE codigo = $1`,
    [codigo, label, valor, tono],
  );
}

/** Reemplaza la serie anual larga (pestaña Histórico) del indicador. */
export async function fijarHistorico(client: PoolClient, codigo: string, serie: { periodo: string; valor: number }[]): Promise<void> {
  await client.query(`DELETE FROM indicador_historico WHERE indicador_id = (SELECT id FROM indicadores WHERE codigo = $1)`, [codigo]);
  for (const [i, p] of serie.entries()) {
    await client.query(
      `INSERT INTO indicador_historico (indicador_id, orden, periodo, valor) SELECT id, $2, $3, $4 FROM indicadores WHERE codigo = $1`,
      [codigo, i, p.periodo, p.valor],
    );
  }
}

/** Último valor (y fecha) de un indicador. */
export async function ultimo(client: PoolClient, codigo: string): Promise<{ fecha: string; valor: number } | null> {
  const { rows } = await client.query<{ fecha: string; valor: number }>(
    `SELECT to_char(o.fecha, 'YYYY-MM-DD') AS fecha, o.valor::float8 AS valor
       FROM indicador_observaciones o JOIN indicadores i ON i.id = o.indicador_id
      WHERE i.codigo = $1 ORDER BY o.fecha DESC LIMIT 1`,
    [codigo],
  );
  return rows[0] ?? null;
}
