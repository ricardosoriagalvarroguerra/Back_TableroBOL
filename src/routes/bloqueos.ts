// Módulo B — Bloqueos en tiempo real.

import type { FastifyInstance } from 'fastify';
import { query, one } from '../db.ts';

interface BloqueoRow {
  id: number;
  codigo: string;
  departamento: string;
  departamento_codigo: string;
  ruta_codigo: string | null;
  ruta_nombre: string | null;
  tramo: string | null;
  lon: number;
  lat: number;
  sector: string | null;
  motivo: string | null;
  severidad: 'alta' | 'media' | 'baja';
  estado: string;
  fecha_inicio: string;
  dia: number;
  fuente: string | null;
}

function toBloqueo(r: BloqueoRow) {
  const ruta = r.ruta_codigo
    ? r.ruta_nombre
      ? `${r.ruta_codigo} · ${r.ruta_nombre}`
      : r.ruta_codigo
    : '';
  return {
    id: r.codigo,
    dept: r.departamento,
    ruta,
    km: r.tramo,
    lon: r.lon,
    lat: r.lat,
    sector: r.sector,
    motivo: r.motivo,
    dia: r.dia,
    severidad: r.severidad,
    estado: r.estado,
    fuente: r.fuente,
  };
}

export function registerBloqueos(app: FastifyInstance): void {
  // Lista + resumen (X activos en Y departamentos)
  app.get('/api/bloqueos', async () => {
    const rows = await query<BloqueoRow>(
      `SELECT * FROM v_bloqueos_activos ORDER BY dia DESC`,
    );
    const departamentos = new Set(rows.map((r) => r.departamento)).size;
    return {
      resumen: { activos: rows.length, departamentos },
      bloqueos: rows.map(toBloqueo),
    };
  });

  // Detalle + cronología (drawer)
  app.get<{ Params: { codigo: string } }>('/api/bloqueos/:codigo', async (req, reply) => {
    const { codigo } = req.params;
    const row = await one<BloqueoRow>(
      `SELECT * FROM v_bloqueos_activos WHERE codigo = $1`,
      [codigo],
    );
    if (!row) return reply.code(404).send({ error: 'bloqueo no encontrado' });
    const cronologia = await query<{ fecha: string; descripcion: string }>(
      `SELECT be.fecha, be.descripcion
         FROM bloqueo_eventos be
         JOIN bloqueos b ON b.id = be.bloqueo_id
        WHERE b.codigo = $1
        ORDER BY be.fecha`,
      [codigo],
    );
    return { ...toBloqueo(row), cronologia };
  });
}
