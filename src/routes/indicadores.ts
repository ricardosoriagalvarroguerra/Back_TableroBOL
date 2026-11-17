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
  periodicidad: string | null;
  fecha_iso: string | null;
  historico: { periodo: string; valor: number }[] | null;
  historico_nota: string | null;
  extra_label: string | null;
  extra_valor: string | null;
  extra_tono: 'pos' | 'neg' | 'neutral' | null;
}

function toKpi(r: IndicadorRow) {
  // dato complementario: el curado en la BDR; si falta, brecha o variación mensual
  const extra =
    r.extra_label != null
      ? { label: r.extra_label, value: r.extra_valor ?? '', tone: r.extra_tono ?? 'neutral' }
      : r.brecha_pct != null
        ? { label: 'Brecha', value: pct(r.brecha_pct, 1), tone: 'neutral' as const }
        : r.var_mensual != null
          ? { label: 'Mensual', value: pct(r.var_mensual, 2), tone: 'neg' as const }
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
    periodicidad: r.periodicidad ?? undefined,
    // serie anual 2015 → hoy (pestaña Histórico)
    historico: r.historico ?? undefined,
    historicoNota: r.historico_nota ?? undefined,
    fecha: r.fecha_iso ?? undefined,
    extra,
  };
}

const SELECT_INDICADORES = `
  SELECT a.id, a.codigo, a.nombre, a.unidad, a.categoria, a.sentido, a.decimales,
         a.definicion, a.asof, a.fuente, a.fecha_dato, a.valor, a.variacion,
         a.variacion_etiqueta, a.var_mensual, a.brecha_pct, a.periodicidad,
         a.historico, a.historico_nota, to_char(a.fecha_dato, 'YYYY-MM-DD') AS fecha_iso, a.extra_label, a.extra_valor, a.extra_tono,
         (SELECT array_agg(valor ORDER BY fecha)
            FROM (SELECT valor, fecha FROM indicador_observaciones
                  WHERE indicador_id = a.id ORDER BY fecha DESC LIMIT 12) s) AS spark
  FROM v_indicadores_actuales a
  ORDER BY a.id`;

export function registerIndicadores(app: FastifyInstance): void {
  // Lista de KPIs con sparkline + delta + brecha
  app.get('/api/indicadores', async () => {
    const [rows, obs] = await Promise.all([
      query<IndicadorRow>(SELECT_INDICADORES),
      // serie fechada completa (modal y sparkline): refleja la ingesta en vivo
      query<{ codigo: string; f: string; v: number }>(
        `SELECT i.codigo, to_char(o.fecha, 'YYYY-MM-DD') AS f, o.valor AS v
           FROM indicador_observaciones o JOIN indicadores i ON i.id = o.indicador_id
          ORDER BY i.codigo, o.fecha`,
      ),
    ]);
    const hist: Record<string, { f: string; v: number }[]> = {};
    for (const o of obs) (hist[o.codigo] ??= []).push({ f: o.f, v: o.v });
    return rows.map((r) => ({ ...toKpi(r), history: hist[r.codigo] ?? [] }));
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
