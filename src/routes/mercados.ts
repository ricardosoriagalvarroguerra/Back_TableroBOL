// Módulo C — Mercados soberanos (bonos, EMBI, CDS, ratings, reservas).

import type { FastifyInstance } from 'fastify';
import { query, one } from '../db.ts';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesAnio = (d: string | null) => {
  if (!d) return '';
  const date = new Date(d);
  return `${MESES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};
const PERSPECTIVA: Record<string, string> = {
  positiva: 'Positivo',
  estable: 'Estable',
  negativa: 'Negativo',
  en_revision: 'En revisión',
  na: '—',
};

export function registerMercados(app: FastifyInstance): void {
  app.get('/api/mercados', async () => {
    const [bonos, embiSerie, cds, ratings, reservas] = await Promise.all([
      query<{ codigo: string; nombre: string; precio: number; rendimiento: number; spread_ust: number; variacion: number }>(
        `SELECT codigo, nombre, precio, rendimiento, spread_ust, variacion FROM v_bonos_actuales ORDER BY codigo`,
      ),
      query<{ valor: number; variacion: number | null }>(
        `SELECT io.valor, io.variacion
           FROM indice_riesgo_observaciones io JOIN indices_riesgo i ON i.id = io.indice_id
          WHERE i.codigo = 'EMBI' ORDER BY io.fecha`,
      ),
      one<{ valor: number; variacion: number | null; nota: string | null }>(
        `SELECT io.valor, io.variacion, io.nota
           FROM indice_riesgo_observaciones io JOIN indices_riesgo i ON i.id = io.indice_id
          WHERE i.codigo = 'CDS5Y' ORDER BY io.fecha DESC LIMIT 1`,
      ),
      query<{ agencia: string; calificacion: string; perspectiva: string; fecha: string }>(
        `SELECT agencia, calificacion, perspectiva, fecha FROM v_calificaciones_actuales ORDER BY agencia`,
      ),
      query<{ componente: string; porcentaje: number }>(
        `SELECT componente, porcentaje FROM reservas_composicion
          WHERE fecha = (SELECT max(fecha) FROM reservas_composicion)`,
      ),
    ]);

    const embiLast = embiSerie.at(-1);
    const reservasMap = Object.fromEntries(reservas.map((r) => [r.componente, r.porcentaje]));

    return {
      bonos: bonos.map((b) => ({
        id: b.codigo,
        name: b.nombre,
        price: b.precio,
        yield: b.rendimiento,
        spread: b.spread_ust,
        chg: b.variacion,
      })),
      embi: {
        value: embiLast?.valor ?? null,
        chg: embiLast?.variacion ?? 0,
        series: embiSerie.map((r) => r.valor),
      },
      cds5y: { value: cds?.valor ?? null, chg: cds?.variacion ?? 0, note: cds?.nota ?? '' },
      ratings: ratings.map((r) => ({
        agencia: r.agencia,
        rating: r.calificacion,
        outlook: PERSPECTIVA[r.perspectiva] ?? r.perspectiva,
        actualizado: mesAnio(r.fecha),
      })),
      reservas: {
        oro: reservasMap.oro ?? 0,
        divisas: reservasMap.divisas ?? 0,
        deg: reservasMap.deg ?? 0,
      },
    };
  });
}
