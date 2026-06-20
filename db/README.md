# BDR · Tablero Inteligente BOL (PostgreSQL)

Base de datos relacional que respalda las 6 funcionalidades del tablero.
Diseñada para que el backend (fase siguiente) reemplace los datos mock de
`src/data/mockData.ts` por consultas reales sin tocar el frontend.

- **Motor:** PostgreSQL 18
- **Base:** `bolivia`
- **Esquema:** `public` · 23 tablas · 6 vistas · 12 enums · 69 índices · 4 triggers

## Cómo crear / recrear

```bash
# 1) estructura (idempotente: reinicia el schema public)
psql -d bolivia -v ON_ERROR_STOP=1 -f db/schema.sql

# 2) datos de demostración (snapshot ~27 may 2026, generado desde mockData.ts)
node db/generate-seed.mjs           # regenera db/seed.sql
psql -d bolivia -v ON_ERROR_STOP=1 -f db/seed.sql
```

> `generate-seed.mjs` importa los **mismos** datos que usa el frontend, así la
> BDR y el tablero quedan idénticos. En producción se reemplaza por la ingesta
> real (BCB / INE / YPFB / ABC / EMBI / RSS).

## Modelo por módulo

| Módulo | Catálogos | Series de tiempo / hechos |
|--------|-----------|---------------------------|
| **A** Indicadores macro | `indicadores` (+ `fuentes`) | `indicador_observaciones` |
| **B** Bloqueos | `departamentos`, `rutas` | `bloqueos`, `bloqueo_eventos` |
| **C** Mercados | `bonos_soberanos`, `indices_riesgo`, `agencias_calificadoras` | `bono_cotizaciones`, `indice_riesgo_observaciones`, `calificaciones`, `reservas_composicion` |
| **D** Noticias | `medios`, `categorias_noticia`, `terminos` | `noticias`, `noticia_terminos` (M:N), `noticia_vinculos` |
| **E** Calendario | `categorias_evento` | `eventos` |
| **F** Health-check | `fuentes` | `fuente_estado` |

## Relaciones clave

```
departamentos ──< rutas ──< bloqueos ──< bloqueo_eventos
departamentos ──────────────< bloqueos
fuentes ──< indicadores ──< indicador_observaciones
indicadores ──< indicadores            (indicador_base_id → brecha paralelo/oficial)
fuentes ──< fuente_estado
bonos_soberanos ──< bono_cotizaciones
indices_riesgo ──< indice_riesgo_observaciones
agencias_calificadoras ──< calificaciones
medios / categorias_noticia ──< noticias ──< noticia_terminos >── terminos
                                  noticias ──< noticia_vinculos ──> indicadores | bonos | indices | bloqueos
categorias_evento ──< eventos
```

## Lógica incorporada

- **Enums** para dominios fijos (severidad, sentido, estado de fuente, perspectiva, tono…).
- **Series de tiempo** normalizadas con `UNIQUE(entidad, fecha)`; el valor vigente
  es simplemente la última fila (las vistas usan `LATERAL` / `DISTINCT ON`).
- **`indicador_base_id`** (auto-relación) permite calcular la *brecha* sin
  guardar el dato derivado.
- **Búsqueda global** con `tsvector` generado (`busqueda`) + índice GIN, y
  `pg_trgm` / `unaccent` para coincidencias difusas.
- **Triggers** `actualizado_en` en las tablas mutables.
- **Toda FK indexada**; índices extra en columnas de filtro/orden frecuentes.

## Vistas (estado actual, listas para el API)

| Vista | Sirve a |
|-------|---------|
| `v_indicadores_actuales` | KPI strip (valor, delta, **brecha calculada**) |
| `v_bloqueos_activos` | mapa + lista (con **día N** calculado) |
| `v_bonos_actuales` | tabla de bonos |
| `v_calificaciones_actuales` | ratings vigentes |
| `v_noticias_feed` | feed (con flag *breaking* < 2 h) |
| `v_fuentes_estado_actual` | footer de fuentes |

Ejemplo:

```sql
SELECT codigo, valor, variacion_etiqueta, brecha_pct
FROM v_indicadores_actuales ORDER BY codigo;
```

## Archivos

- [`schema.sql`](schema.sql) — DDL completo (tipos, tablas, índices, triggers, vistas).
- [`generate-seed.mjs`](generate-seed.mjs) — genera el seed desde `src/data/mockData.ts`.
- [`seed.sql`](seed.sql) — datos de demostración (auto-generado).
