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
  opts: { minDias: number; modo: 'pct' | 'pp'; dec?: number; conFecha?: boolean },
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
    const vs = opts.conFecha === false ? '' : ` vs ${ddMes(base.fecha)}`;
    const etiqueta =
      opts.modo === 'pct'
        ? `${pctTxt(delta, opts.dec ?? 1)}${vs}`
        : `${delta > 0 ? '+' : ''}${coma(delta, opts.dec ?? 1)} pp${vs}`;
    await client.query(
      `UPDATE indicador_observaciones SET variacion = $2, variacion_etiqueta = $3 WHERE id = $1`,
      [ult.id, Number(delta.toFixed(4)), etiqueta],
    );
  }
  await client.query(`UPDATE indicadores SET asof = $2 WHERE codigo = $1`, [codigo, ddMes(ult.fecha)]);
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
