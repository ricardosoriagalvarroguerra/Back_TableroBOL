// CLI de la ingesta: `npm run ingest` (todas) o `npm run ingest -- bcb_tco`.
import { runIngesta } from './index.ts';
import { pool } from '../db.ts';

const log = {
  info: (o: unknown, m?: string) => console.log(m ?? '', JSON.stringify(o)),
  warn: (o: unknown, m?: string) => console.warn(m ?? '', JSON.stringify(o)),
  error: (o: unknown, m?: string) => console.error(m ?? '', o),
};

const solo = process.argv.slice(2).filter(Boolean);
const res = await runIngesta(log as never, solo.length ? solo : undefined);
console.table(res);
await pool.end();
process.exit(res.some((r) => r.estado === 'error') ? 1 : 0);
