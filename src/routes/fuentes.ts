// Módulo F — Health-check de fuentes.

import type { FastifyInstance } from 'fastify';
import { query } from '../db.ts';

export function registerFuentes(app: FastifyInstance): void {
  app.get('/api/fuentes', async () => {
    const rows = await query<{
      codigo: string;
      nombre: string;
      estado: string;
      latencia_ms: number | null;
      ultima_actualizacion: string | null;
    }>(`SELECT codigo, nombre, estado, latencia_ms, ultima_actualizacion
          FROM v_fuentes_estado_actual ORDER BY codigo`);
    return rows.map((r) => ({
      id: r.codigo,
      name: r.nombre,
      status: r.estado,
      latency: r.latencia_ms,
      last: r.ultima_actualizacion,
    }));
  });
}
