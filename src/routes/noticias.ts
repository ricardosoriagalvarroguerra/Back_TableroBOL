// Módulo D — Feed de noticias.

import type { FastifyInstance } from 'fastify';
import { query, one } from '../db.ts';

function relTime(publicado: string): { t: string; mins: number } {
  const mins = Math.max(0, Math.round((Date.now() - new Date(publicado).getTime()) / 60000));
  const t =
    mins < 1 ? 'ahora' : mins < 60 ? `−${mins}m` : mins < 1440 ? `−${Math.round(mins / 60)}h` : `−${Math.round(mins / 1440)}d`;
  return { t, mins };
}

interface FeedRow {
  codigo: string;
  publicado_en: string;
  medio: string | null;
  categoria: string | null;
  titular: string;
  resumen: string | null;
  cuerpo: string | null;
  url: string | null;
  breaking: boolean;
}

export function registerNoticias(app: FastifyInstance): void {
  // Feed (filtro opcional por tag/categoría)
  app.get<{ Querystring: { tag?: string } }>('/api/noticias', async (req) => {
    const { tag } = req.query;
    const rows =
      tag && tag !== 'Todos'
        ? await query<FeedRow>(`SELECT * FROM v_noticias_feed WHERE categoria = $1`, [tag])
        : await query<FeedRow>(`SELECT * FROM v_noticias_feed`);
    return rows.map((n) => {
      const { t, mins } = relTime(n.publicado_en);
      return {
        id: n.codigo,
        t,
        mins,
        fuente: n.medio,
        tag: n.categoria,
        titular: n.titular,
        resumen: n.resumen,
        breaking: n.breaking,
      };
    });
  });

  // Detalle (cuerpo + términos + vínculos)
  app.get<{ Params: { codigo: string } }>('/api/noticias/:codigo', async (req, reply) => {
    const { codigo } = req.params;
    const n = await one<FeedRow>(`SELECT * FROM v_noticias_feed WHERE codigo = $1`, [codigo]);
    if (!n) return reply.code(404).send({ error: 'noticia no encontrada' });
    const [keywords, relacionados] = await Promise.all([
      query<{ termino: string }>(
        `SELECT t.termino FROM noticia_terminos nt
           JOIN terminos t ON t.id = nt.termino_id
           JOIN noticias no ON no.id = nt.noticia_id
          WHERE no.codigo = $1 ORDER BY t.termino`,
        [codigo],
      ),
      query<{ etiqueta: string }>(
        `SELECT v.etiqueta FROM noticia_vinculos v
           JOIN noticias no ON no.id = v.noticia_id
          WHERE no.codigo = $1`,
        [codigo],
      ),
    ]);
    const { t } = relTime(n.publicado_en);
    return {
      id: n.codigo,
      t,
      fuente: n.medio,
      tag: n.categoria,
      titular: n.titular,
      resumen: n.resumen,
      body: n.cuerpo,
      url: n.url,
      breaking: n.breaking,
      keywords: keywords.map((k) => k.termino),
      relacionados: relacionados.map((r) => r.etiqueta),
    };
  });
}
