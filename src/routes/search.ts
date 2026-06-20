// Búsqueda global — noticias (full-text) + indicadores (similitud trigram).

import type { FastifyInstance } from 'fastify';
import { query } from '../db.ts';

export function registerSearch(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req) => {
    const q = (req.query.q ?? '').trim();
    if (!q) return { indicadores: [], noticias: [] };

    const [indicadores, noticias] = await Promise.all([
      query<{ codigo: string; nombre: string }>(
        `SELECT codigo, nombre FROM indicadores
          WHERE nombre ILIKE '%' || $1 || '%' OR codigo ILIKE '%' || $1 || '%'
          ORDER BY similarity(nombre, $1) DESC LIMIT 8`,
        [q],
      ),
      query<{ codigo: string; titular: string }>(
        `SELECT codigo, titular FROM noticias
          WHERE busqueda @@ plainto_tsquery('spanish', $1)
          ORDER BY ts_rank(busqueda, plainto_tsquery('spanish', $1)) DESC LIMIT 8`,
        [q],
      ),
    ]);
    return { indicadores, noticias };
  });
}
