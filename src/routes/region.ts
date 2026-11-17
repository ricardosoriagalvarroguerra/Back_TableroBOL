// Comparador regional (FMI WEO): indicadores macro comparables de 9 países de
// Sudamérica, 2015–2027, con los años ≥ 2026 marcados como proyección.

import type { FastifyInstance } from 'fastify';
import { query } from '../db.ts';
import { PAISES, INDICADORES_WEO } from '../ingest/imf.ts';

export function registerRegion(app: FastifyInstance): void {
  app.get('/api/region', async () => {
    const rows = await query<{ pais: string; indicador: string; anio: number; valor: number; proyeccion: boolean; vintage: string }>(
      `SELECT pais, indicador, anio, valor, proyeccion, vintage FROM region_observaciones ORDER BY indicador, pais, anio`,
    ).catch(() => []);
    const datos: Record<string, Record<string, { anio: number; valor: number; proyeccion: boolean }[]>> = {};
    for (const r of rows) {
      ((datos[r.indicador] ??= {})[r.pais] ??= []).push({ anio: r.anio, valor: r.valor, proyeccion: r.proyeccion });
    }
    return { vintage: rows[0]?.vintage ?? null, paises: PAISES, indicadores: INDICADORES_WEO, datos };
  });
}
