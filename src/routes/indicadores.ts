// Módulo A — Indicadores macro.

import type { FastifyInstance } from 'fastify';
import { query, one } from '../db.ts';
import { fechaCorta, pct } from '../format.ts';

interface IndicadorRow {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string | null;
  categoria: string;
  sentido: 'pos' | 'neg' | 'neutral' | 'accent';
  decimales: number;
  definicion: string | null;
  asof: string | null;
  fuente: string | null;
  fecha_dato: string | null;
  valor: number | null;
  variacion: number | null;
  variacion_etiqueta: string | null;
  var_mensual: number | null;
  brecha_pct: number | null;
  spark: number[] | null;
}

function toKpi(r: IndicadorRow) {
  const extra =
    r.brecha_pct != null
      ? { label: 'BRECHA', value: pct(r.brecha_pct, 1), tone: 'neg' as const }
      : r.var_mensual != null
        ? { label: 'MENSUAL', value: pct(r.var_mensual, 2), tone: 'neg' as const }
        : null;
  return {
    id: r.codigo,
    label: r.nombre,
    value: r.valor,
    unit: r.unidad,
    categoria: r.categoria,
    sentiment: r.sentido,
    decimales: r.decimales,
    delta: r.variacion ?? 0,
    deltaLabel: r.variacion_etiqueta ?? '',
    spark: r.spark ?? [],
    source: r.fuente,
    asof: r.asof ?? fechaCorta(r.fecha_dato),
    def: r.definicion,
    extra,
  };
}

const SELECT_INDICADORES = `
  SELECT a.id, a.codigo, a.nombre, a.unidad, a.categoria, a.sentido, a.decimales,
         a.definicion, a.asof, a.fuente, a.fecha_dato, a.valor, a.variacion,
         a.variacion_etiqueta, a.var_mensual, a.brecha_pct,
         (SELECT array_agg(valor ORDER BY fecha)
            FROM (SELECT valor, fecha FROM indicador_observaciones
                  WHERE indicador_id = a.id ORDER BY fecha DESC LIMIT 12) s) AS spark
  FROM v_indicadores_actuales a
  ORDER BY a.id`;

export function registerIndicadores(app: FastifyInstance): void {
  // Lista de KPIs con sparkline + delta + brecha
  app.get('/api/indicadores', async () => {
    const rows = await query<IndicadorRow>(SELECT_INDICADORES);
    return rows.map(toKpi);
  });

  // Detalle + serie histórica completa (modal)
  app.get<{ Params: { codigo: string } }>('/api/indicadores/:codigo', async (req, reply) => {
    const { codigo } = req.params;
    const meta = await one<IndicadorRow>(
      SELECT_INDICADORES.replace('ORDER BY a.id', 'WHERE a.codigo = $1'),
      [codigo],
    );
    if (!meta) return reply.code(404).send({ error: 'indicador no encontrado' });
    const serie = await query<{ fecha: string; valor: number }>(
      `SELECT io.fecha, io.valor
         FROM indicador_observaciones io
         JOIN indicadores i ON i.id = io.indicador_id
        WHERE i.codigo = $1
        ORDER BY io.fecha`,
      [codigo],
    );
    return { ...toKpi(meta), serie };
  });
}
