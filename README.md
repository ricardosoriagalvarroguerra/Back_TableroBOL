# API · Tablero Inteligente BOL

Backend **Fastify + TypeScript + `pg`** que sirve los módulos A–F del tablero
desde las vistas `v_*` de la BDR PostgreSQL `bolivia`.

- Sin paso de build: Node ≥ 22 ejecuta TypeScript directamente (type-stripping).
- Cada endpoint devuelve JSON ya con la forma que consumen los componentes
  React (ver `../src/api.ts`).

## Correr

```bash
npm install
cp .env.example .env        # ajustar DATABASE_URL si hace falta
npm run dev                 # http://localhost:5174 (con --watch)
# o:  npm start
npm run typecheck
```

## BDR auto-aprovisionada (Railway u otro Postgres)

No hace falta correr `psql` a mano. Al arrancar, la API ([`src/bootstrap.ts`](src/bootstrap.ts))
calcula el hash de `db/schema.sql` + `db/seed.sql` y lo compara con `seed_meta.version`:
si la base está vacía o el seed cambió, aplica ambos en **una transacción** con advisory lock
(ROLLBACK si falla; la API sigue sirviendo con lo que había). `GET /api/health` informa la
versión cargada.

- `DB_AUTO_SEED=false` desactiva el auto-aprovisionamiento.
- El esquema y el seed se generan en el repo del frontend
  ([front_TableroBOL](https://github.com/ricardosoriagalvarroguerra/front_TableroBOL), `db/`) y se
  copian aquí con `npm run sync:db` (usa `../front_TableroBOL`, o `FRONT_DIR=/ruta`).
- En Railway basta con definir `DATABASE_URL` (la del plugin Postgres) y desplegar: el primer
  arranque crea el esquema y carga los datos.

## Ingesta automática (v0.3)

La API trae datos nuevos sola, sin regenerar el seed:

| Fuente | Qué trae | Módulo |
|---|---|---|
| Binance P2P (USDT/BOB) | dólar paralelo: mediana de los 10 primeros avisos de compra y de venta | `src/ingest/p2p.ts` |
| BCB · TCO | tipo de cambio oficial vigente, «vs fijo 6,96» y la brecha con el paralelo | `src/ingest/bcb.ts` |
| INE · IPC base 2016 | inflación a 12 meses y mensual, enero 2018 → último mes | `src/ingest/ine_ipc.ts` |
| INE · comercio exterior | exportaciones (FOB), importaciones (CIF), balanza mensual, export. de gas, series anuales | `src/ingest/ine_comercio.ts` |
| EMBI (JP Morgan, serie del BCRD) | spread diario de Bolivia y cierres de año 2015 → hoy | `src/ingest/embi.ts` |
| Commodities | oro, plata, soya, Henry Hub (Yahoo Finance) · estaño y zinc LME cash (Westmetall) | `src/ingest/commodities.ts` |
| Noticias (RSS) | Google News (4 búsquedas sobre Bolivia), ABC (notas de prensa) y eju.tv; clasificación por reglas | `src/ingest/noticias.ts` |
| FMI · WEO | 6 indicadores × 9 países de Sudamérica, 2015–2027 (comparador regional) | `src/ingest/imf.ts` |

**No conectables hoy:** la transitabilidad de la ABC (`transitabilidad.abc.gob.bo`) no responde
desde fuera de Bolivia y está detrás de un captcha; YPFB no publica la producción de gas en un
formato legible (sólo boletines informativos en PDF). Ambos siguen como datos curados del seed.
Los enlaces de las planillas del INE se descubren en cada corrida leyendo la página del cuadro
(el INE los renueva al publicar).

- Corre al arrancar (después del auto-seed) y cada `INGEST_INTERVAL_HOURS` (6 por defecto);
  `INGEST_ENABLED=false` la apaga. También: `npm run ingest` o `POST /api/ingesta` con
  `Authorization: Bearer $INGEST_TOKEN`.
- Cada fuente corre en su propia transacción; las corridas quedan en `ingesta_corridas`
  (`GET /api/ingesta` muestra la última de cada fuente) y actualizan `fuente_estado`.
- Si el seed cambia, la base se recarga y la ingesta repone los datos nuevos en el arranque.
- Para sumar una fuente: un módulo `src/ingest/<fuente>.ts` con `run(client) → { filas, mensaje }`
  y una entrada en `FUENTES_INGESTA` (`src/ingest/index.ts`).

> **Aviso:** `db/schema.sql` reinicia el schema `public` (DROP … CASCADE). Úsalo sólo sobre la
> base dedicada al tablero.

## Endpoints

| Método y ruta | Módulo | Devuelve |
|---|---|---|
| `GET /api/health` | — | ping a la BDR + versión del seed |
| `GET /api/indicadores` | A | KPIs (valor, delta, dato complementario, sparkline, **serie anual 2015→hoy**) |
| `GET /api/indicadores/:codigo` | A | + serie histórica completa |
| `GET /api/bloqueos` | B | lista + resumen (activos / dptos.) |
| `GET /api/bloqueos/:codigo` | B | detalle + cronología |
| `GET /api/mercados` | C | bonos, EMBI, CDS, ratings, RIN, **calificaciones a fin de año** |
| `GET /api/externo` | X | commodities, deuda, balanza, combustibles, FMI |
| `GET /api/analisis` | Z | capa analítica: tesis, semáforo, proyecciones, escenarios, riesgos, lecturas |
| `GET /api/region` | R | comparador regional (FMI WEO, 9 países, 2015–2027) |
| `GET /api/alertas` | — | alertas por reglas explícitas (`src/alertas.ts`) sobre el último dato |
| `GET /api/ingesta` · `POST /api/ingesta` | — | última corrida por fuente · ingesta manual (con token) |
| `GET /api/noticias?tag=` | D | feed (filtrable por categoría) |
| `GET /api/noticias/:codigo` | D | cuerpo + términos + vínculos |
| `GET /api/eventos` | E | calendario próximos 30 días |
| `GET /api/fuentes` | F | estado/latencia de cada fuente |
| `GET /api/search?q=` | — | búsqueda full-text (noticias) + trigram (indicadores) |

## Arquitectura

```
React (src/) ──fetch──> Fastify (server/) ──pg──> PostgreSQL (db/ · vistas v_*)
        │                                                  │
        └── fallback a mockData si la API no responde ─────┘
```

El frontend (`src/useDashboardData.ts` en front_TableroBOL) consume
estos endpoints y cae a los datos embebidos si la API está caída, así que la UI
funciona siempre. El footer indica el origen («BDR en vivo» / «datos locales»).

## Estructura

```
db/                 # schema.sql + seed.sql (copiados del front con npm run sync:db)
scripts/sync-db.mjs # copia db/ desde front_TableroBOL
src/
├── index.ts        # bootstrap Fastify + CORS + health
├── bootstrap.ts    # auto-aprovisionamiento de la BDR (hash → seed_meta)
├── env.ts          # config desde entorno
├── db.ts           # pool pg + helpers query/one
├── format.ts       # helpers es-BO (fecha, %, número)
└── routes/         # un archivo por módulo (A–F, externo, analisis) + search
```
