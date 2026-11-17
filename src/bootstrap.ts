// Auto-aprovisionamiento de la BDR al desplegar.
//
// La base del tablero se deriva íntegramente de db/schema.sql + db/seed.sql
// (copiados desde el repo front_TableroBOL con `npm run sync:db`). Al arrancar,
// la API calcula el hash de ambos archivos y lo compara con `seed_meta.version`:
// si difiere (o la tabla no existe), aplica schema + seed en UNA transacción,
// con un advisory lock para que dos instancias no lo hagan a la vez.
//
//   DB_AUTO_SEED=false  → desactiva el auto-aprovisionamiento.
//
// Si algo falla, se hace ROLLBACK (la base queda como estaba) y la API sigue
// sirviendo con los datos existentes.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { pool } from './db.ts';

const LOCK_ID = 727_002;

export async function ensureSeed(log: FastifyBaseLogger): Promise<void> {
  if (process.env.DB_AUTO_SEED === 'false') {
    log.info('DB_AUTO_SEED=false: no se verifica el seed');
    return;
  }

  const dir = new URL('../db/', import.meta.url);
  let schema: string;
  let seed: string;
  try {
    [schema, seed] = await Promise.all([
      readFile(new URL('schema.sql', dir), 'utf8'),
      readFile(new URL('seed.sql', dir), 'utf8'),
    ]);
  } catch {
    log.warn('db/schema.sql o db/seed.sql no encontrados: se omite el auto-seed');
    return;
  }
  const version = createHash('sha256').update(schema).update(seed).digest('hex').slice(0, 16);

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);

    let actual: string | null = null;
    try {
      const r = await client.query<{ version: string }>('SELECT version FROM seed_meta LIMIT 1');
      actual = r.rows[0]?.version ?? null;
    } catch {
      actual = null; // base vacía o esquema anterior sin seed_meta
    }
    if (actual === version) {
      log.info({ version }, 'BDR al día con el seed');
      return;
    }

    log.warn({ actual, version }, 'aplicando schema + seed (versión nueva)');
    // El seed trae su propio BEGIN/COMMIT: se quitan para envolver todo en una
    // única transacción junto con el schema.
    const seedBody = seed.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
    await client.query('BEGIN');
    try {
      await client.query(schema);
      await client.query(seedBody);
      await client.query('INSERT INTO seed_meta (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      log.info({ version }, 'schema + seed aplicados');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      log.error({ err }, 'falló el auto-seed: ROLLBACK, se mantienen los datos anteriores');
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}
