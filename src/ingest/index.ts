// Orquestador de la ingesta automática.
//
// Cada fuente corre en su propia transacción (si una falla, las demás siguen),
// queda registrada en `ingesta_corridas` y actualiza `fuente_estado` con el
// resultado real (latencia y fecha del último dato). Un advisory lock evita que
// dos instancias ingesten a la vez.
//
//   npm run ingest            (CLI, src/ingest/cli.ts)
//   POST /api/ingesta         (con Authorization: Bearer $INGEST_TOKEN)
//   automática: al arrancar y cada INGEST_INTERVAL_HOURS (por defecto 6)

import type { FastifyBaseLogger } from 'fastify';
import type { PoolClient } from 'pg';
import { pool } from '../db.ts';
import { ingestarTco } from './bcb.ts';
import { ingestarFmi } from './imf.ts';
import { ingestarP2p } from './p2p.ts';
import { ingestarIpc } from './ine_ipc.ts';
import { ingestarComercio } from './ine_comercio.ts';
import { ingestarEmbi } from './embi.ts';
import { ingestarCommodities } from './commodities.ts';
import { ingestarNoticias } from './noticias.ts';

const LOCK_ID = 727_101;

interface Fuente {
  id: string; // clave de la corrida
  fuenteCodigo: string; // fila de `fuentes` cuyo estado se actualiza
  run: (c: PoolClient) => Promise<{ filas: number; mensaje: string }>;
}

// Orden: el paralelo va antes del TCO para que la brecha use el dato del día.
export const FUENTES_INGESTA: Fuente[] = [
  { id: 'p2p_binance', fuenteCodigo: 'p2p', run: ingestarP2p },
  { id: 'bcb_tco', fuenteCodigo: 'bcb', run: ingestarTco },
  { id: 'ine_ipc', fuenteCodigo: 'ine', run: ingestarIpc },
  { id: 'ine_comercio', fuenteCodigo: 'ine', run: ingestarComercio },
  { id: 'embi_bcrd', fuenteCodigo: 'embi', run: ingestarEmbi },
  { id: 'commodities', fuenteCodigo: 'commodities', run: ingestarCommodities },
  { id: 'noticias_rss', fuenteCodigo: 'news', run: ingestarNoticias },
  { id: 'fmi_weo', fuenteCodigo: 'fmi', run: ingestarFmi },
];

export interface ResultadoCorrida {
  fuente: string;
  estado: 'ok' | 'error' | 'sin_cambios';
  filas: number;
  mensaje: string;
  ms: number;
}

const hoyCorto = () => {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const d = new Date();
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export async function runIngesta(log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>, solo?: string[]): Promise<ResultadoCorrida[]> {
  const client = await pool.connect();
  const out: ResultadoCorrida[] = [];
  try {
    const lock = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!lock.rows[0]?.ok) {
      log.warn('ingesta en curso en otra instancia: se omite');
      return out;
    }
    for (const f of FUENTES_INGESTA) {
      if (solo && !solo.includes(f.id)) continue;
      const t0 = Date.now();
      let r: ResultadoCorrida;
      try {
        await client.query('BEGIN');
        const { filas, mensaje } = await f.run(client);
        await client.query('COMMIT');
        r = { fuente: f.id, estado: filas > 0 ? 'ok' : 'sin_cambios', filas, mensaje, ms: Date.now() - t0 };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        r = { fuente: f.id, estado: 'error', filas: 0, mensaje: (err as Error).message.slice(0, 500), ms: Date.now() - t0 };
      }
      out.push(r);
      // bitácora + estado de la fuente (fuera de la transacción de datos)
      await client
        .query(
          `INSERT INTO ingesta_corridas (fuente, inicio, fin, estado, filas, mensaje)
           VALUES ($1, to_timestamp($2 / 1000.0), now(), $3, $4, $5)`,
          [r.fuente, t0, r.estado, r.filas, r.mensaje],
        )
        .catch((e) => log.warn({ err: e }, 'no se pudo registrar la corrida'));
      await client
        .query(
          `INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
           SELECT id, $2::estado_fuente, $3, $4 FROM fuentes WHERE codigo = $1`,
          [f.fuenteCodigo, r.estado === 'error' ? 'down' : 'live', r.ms, hoyCorto()],
        )
        .catch((e) => log.warn({ err: e }, 'no se pudo actualizar fuente_estado'));
      const nivel = r.estado === 'error' ? 'error' : 'info';
      log[nivel]({ fuente: r.fuente, estado: r.estado, filas: r.filas, ms: r.ms }, `ingesta: ${r.mensaje}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
  return out;
}

/** Programa la ingesta periódica en el proceso de la API. */
export function programarIngesta(log: FastifyBaseLogger): void {
  if (process.env.INGEST_ENABLED === 'false') {
    log.info('INGEST_ENABLED=false: ingesta automática desactivada');
    return;
  }
  const horas = Math.max(1, Number(process.env.INGEST_INTERVAL_HOURS ?? 6));
  const correr = () => runIngesta(log).catch((err) => log.error({ err }, 'falló la ingesta programada'));
  setTimeout(correr, 5_000).unref();
  setInterval(correr, horas * 3_600_000).unref();
  log.info({ horas }, 'ingesta automática programada');
}
