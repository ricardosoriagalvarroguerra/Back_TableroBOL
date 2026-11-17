// Alertas: reglas explícitas (src/alertas.ts) evaluadas sobre los datos vigentes.

import type { FastifyInstance } from 'fastify';
import { query, one } from '../db.ts';
import { evaluarAlertas, type AlertaKpi } from '../alertas.ts';

export function registerAlertas(app: FastifyInstance): void {
  app.get('/api/alertas', async () => {
    const rows = await query<{ codigo: string; nombre: string; valor: number | null; variacion: number | null; fecha: string | null; periodicidad: string }>(
      `SELECT codigo, nombre, valor, variacion, to_char(fecha_dato, 'YYYY-MM-DD') AS fecha, periodicidad::text AS periodicidad
         FROM v_indicadores_actuales`,
    );
    const kpis: Record<string, AlertaKpi> = {};
    for (const r of rows) {
      if (r.valor == null) continue;
      kpis[r.codigo] = { id: r.codigo, label: r.nombre, value: r.valor, delta: r.variacion ?? undefined, fecha: r.fecha ?? undefined, periodicidad: r.periodicidad };
    }
    const oro = await one<{ porcentaje: number }>(
      `SELECT porcentaje FROM reservas_composicion WHERE componente = 'oro' ORDER BY fecha DESC LIMIT 1`,
    ).catch(() => null);
    return evaluarAlertas({ kpis, oroPct: oro?.porcentaje, hoy: new Date() });
  });
}
