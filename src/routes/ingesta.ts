// Ingesta manual: POST /api/ingesta (Authorization: Bearer $INGEST_TOKEN).
// GET /api/ingesta devuelve las últimas corridas (bitácora pública, sin datos sensibles).

import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { query } from '../db.ts';
import { runIngesta } from '../ingest/index.ts';

function autorizado(header: string | undefined): boolean {
  const token = process.env.INGEST_TOKEN;
  if (!token || !header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerIngesta(app: FastifyInstance): void {
  app.post<{ Body: { fuentes?: string[] } | null }>('/api/ingesta', async (req, reply) => {
    if (!autorizado(req.headers.authorization)) return reply.code(401).send({ error: 'no autorizado' });
    const solo = Array.isArray(req.body?.fuentes) ? req.body!.fuentes : undefined;
    return { corridas: await runIngesta(req.log, solo) };
  });

  app.get('/api/ingesta', async () =>
    query(
      `SELECT DISTINCT ON (fuente) fuente, estado, filas, mensaje, inicio, fin
         FROM ingesta_corridas ORDER BY fuente, inicio DESC`,
    ).catch(() => []),
  );
}
