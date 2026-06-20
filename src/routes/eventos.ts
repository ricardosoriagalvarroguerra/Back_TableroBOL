// Módulo E — Calendario de eventos (próximos 30 días).

import type { FastifyInstance } from 'fastify';
import { query } from '../db.ts';

export function registerEventos(app: FastifyInstance): void {
  app.get('/api/eventos', async () => {
    const rows = await query<{ d: number; tag: string | null; titulo: string; tono: string }>(
      `SELECT (e.fecha - CURRENT_DATE) AS d, ce.nombre AS tag, e.titulo, e.tono
         FROM eventos e
         LEFT JOIN categorias_evento ce ON ce.id = e.categoria_id
        WHERE e.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        ORDER BY e.fecha`,
    );
    return rows.map((r) => ({ d: r.d, tag: r.tag, title: r.titulo, tone: r.tono }));
  });
}
