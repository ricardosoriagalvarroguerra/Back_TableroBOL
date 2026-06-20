// Tablero Inteligente BOL — API (Fastify + pg).
// Sirve los módulos A–F desde las vistas v_* de la BDR PostgreSQL `bolivia`.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './env.ts';
import { pool, one } from './db.ts';
import { registerIndicadores } from './routes/indicadores.ts';
import { registerBloqueos } from './routes/bloqueos.ts';
import { registerMercados } from './routes/mercados.ts';
import { registerExterno } from './routes/externo.ts';
import { registerNoticias } from './routes/noticias.ts';
import { registerEventos } from './routes/eventos.ts';
import { registerFuentes } from './routes/fuentes.ts';
import { registerSearch } from './routes/search.ts';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

// Health-check (incluye ping a la BDR)
app.get('/api/health', async () => {
  const row = await one<{ now: string }>('SELECT now() AS now');
  return { ok: true, db: row != null, time: row?.now };
});

registerIndicadores(app);
registerBloqueos(app);
registerMercados(app);
registerExterno(app);
registerNoticias(app);
registerEventos(app);
registerFuentes(app);
registerSearch(app);

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
