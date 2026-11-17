// Copia db/schema.sql y db/seed.sql desde el repo hermano front_TableroBOL
// (fuente de verdad del esquema y del seed, generado desde src/data/ del front).
// La API los aplica al arrancar si su hash cambió (src/bootstrap.ts).
//
//   npm run sync:db            (usa ../front_TableroBOL)
//   FRONT_DIR=/ruta npm run sync:db

import { copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidatos = [process.env.FRONT_DIR, '../front_TableroBOL', '../front_tablerobol']
  .filter(Boolean)
  .map((d) => resolve(root, d));
const front = candidatos.find((d) => existsSync(resolve(d, 'db', 'seed.sql')));
if (!front) throw new Error(`no encontré db/seed.sql en: ${candidatos.join(', ')} (usa FRONT_DIR=/ruta)`);
for (const f of ['schema.sql', 'seed.sql']) {
  const src = resolve(front, 'db', f);
  copyFileSync(src, resolve(root, 'db', f));
  console.log(`✓ db/${f} ← ${src}`);
}
