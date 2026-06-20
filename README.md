# API · Tablero Inteligente BOL

Backend **Fastify + TypeScript + `pg`** que sirve los módulos A–F del tablero
desde las vistas `v_*` de la BDR PostgreSQL `bolivia`.

- Sin paso de build: Node ≥ 22 ejecuta TypeScript directamente (type-stripping).
- Cada endpoint devuelve JSON ya con la forma que consumen los componentes
  React (ver `../src/api.ts`).

## Correr

```bash
cd server
npm install
cp .env.example .env        # ajustar DATABASE_URL si hace falta
npm run dev                 # http://localhost:5174 (con --watch)
# o:  npm start
npm run typecheck
```

Requiere la BDR creada y poblada (ver [`../db/`](../db/README.md)).

## Endpoints

| Método y ruta | Módulo | Devuelve |
|---|---|---|
| `GET /api/health` | — | ping a la BDR |
| `GET /api/indicadores` | A | KPIs (valor, delta, **brecha**, sparkline 12m) |
| `GET /api/indicadores/:codigo` | A | + serie histórica completa |
| `GET /api/bloqueos` | B | lista + resumen (activos / dptos.) |
| `GET /api/bloqueos/:codigo` | B | detalle + cronología |
| `GET /api/mercados` | C | bonos, EMBI (30d), CDS, ratings, RIN |
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

El frontend ([`../src/useDashboardData.ts`](../src/useDashboardData.ts)) consume
estos endpoints y cae a los datos embebidos si la API está caída, así que la UI
funciona siempre. El footer indica el origen («BDR en vivo» / «datos locales»).

## Estructura

```
server/src/
├── index.ts        # bootstrap Fastify + CORS + health
├── env.ts          # config desde entorno
├── db.ts           # pool pg + helpers query/one
├── format.ts       # helpers es-BO (fecha, %, número)
└── routes/         # un archivo por módulo (A–F) + search
```
