// Módulo Z — Análisis: capa analítica fechada (tesis, semáforo, proyecciones,
// escenarios, riesgos y lecturas por pestaña). Se guarda como documento jsonb en
// la tabla `analisis` porque es juicio editorial versionado, no dato de fuente.

import type { FastifyInstance } from 'fastify';
import { one } from '../db.ts';

export function registerAnalisis(app: FastifyInstance): void {
  app.get('/api/analisis', async (_req, reply) => {
    const row = await one<{ contenido: unknown }>(
      `SELECT contenido FROM analisis WHERE clave = 'vigente'`,
    );
    if (!row) return reply.code(404).send({ error: 'análisis no cargado' });
    return row.contenido;
  });
}
