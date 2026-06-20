-- ════════════════════════════════════════════════════════════════════════
-- Tablero Inteligente BOL · Esquema relacional (PostgreSQL)
-- Base de datos: bolivia
--
-- Modela las 6 funcionalidades del tablero:
--   A · Indicadores macro      → indicadores + indicador_observaciones
--   B · Bloqueos en tiempo real → bloqueos + bloqueo_eventos (+ rutas, departamentos)
--   C · Mercados soberanos      → bonos + cotizaciones, indices_riesgo, calificaciones, reservas
--   D · Feed de noticias        → noticias + terminos + vinculos (+ medios)
--   E · Calendario de eventos   → eventos
--   F · Health-check de fuentes → fuentes + fuente_estado
--
-- Convenciones:
--   · Nombres en español, snake_case.
--   · Catálogos (poca cardinalidad, referenciados) vs. hechos/series de tiempo.
--   · Toda FK lleva índice. Series de tiempo: UNIQUE(entidad, fecha).
--   · creado_en / actualizado_en con trigger en tablas mutables.
--   · Vistas v_* que entregan el "estado actual" listo para el frontend.
--
-- Idempotente: reinicia el schema public (la base es dedicada a este tablero).
-- ════════════════════════════════════════════════════════════════════════

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION CURRENT_USER;
SET search_path = public;

CREATE EXTENSION IF NOT EXISTS unaccent;   -- búsqueda sin acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- búsqueda difusa / similitud

-- ────────────────────────────────────────────────────────────────────────
-- Tipos enumerados (dominios fijos)
-- ────────────────────────────────────────────────────────────────────────
CREATE TYPE sentido_indicador  AS ENUM ('pos', 'neg', 'neutral', 'accent');
CREATE TYPE categoria_indicador AS ENUM ('cambiario', 'monetario', 'precios', 'actividad', 'fiscal', 'energia');
CREATE TYPE periodicidad       AS ENUM ('diaria', 'semanal', 'mensual', 'trimestral', 'semestral', 'anual');
CREATE TYPE tipo_fuente        AS ENUM ('oficial', 'mercado', 'prensa', 'sectorial', 'agregador');
CREATE TYPE estado_fuente      AS ENUM ('ok', 'lag', 'live', 'cold', 'down');
CREATE TYPE tipo_medio         AS ENUM ('nacional', 'internacional', 'agencia');
CREATE TYPE severidad_bloqueo  AS ENUM ('alta', 'media', 'baja');
CREATE TYPE estado_bloqueo     AS ENUM ('activo', 'parcial', 'levantado');
CREATE TYPE perspectiva_rating AS ENUM ('positiva', 'estable', 'negativa', 'en_revision', 'na');
CREATE TYPE componente_rin     AS ENUM ('oro', 'divisas', 'deg');
CREATE TYPE tono_visual        AS ENUM ('accent', 'info', 'neg', 'neutral', 'pos');
CREATE TYPE tipo_entidad       AS ENUM ('indicador', 'bono', 'indice', 'bloqueo', 'evento', 'otro');

-- ────────────────────────────────────────────────────────────────────────
-- Trigger genérico de actualizado_en
-- ────────────────────────────────────────────────────────────────────────
CREATE FUNCTION set_actualizado_en() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- CATÁLOGOS / TABLAS DE REFERENCIA
-- ════════════════════════════════════════════════════════════════════════

-- 9 departamentos de Bolivia (referenciados por bloqueos, rutas)
CREATE TABLE departamentos (
  id            smallint     PRIMARY KEY,
  codigo        text         NOT NULL UNIQUE,          -- slug: lapaz, santacruz, potosi…
  nombre        text         NOT NULL UNIQUE,
  iso_3166_2    text         UNIQUE,                   -- BO-L, BO-S…
  capital       text,
  centro_lon    numeric(9,5),                          -- centroide aprox.
  centro_lat    numeric(9,5)
);
COMMENT ON TABLE departamentos IS 'Catálogo de los 9 departamentos de Bolivia.';

-- Fuentes de datos / proveedores (Módulo F + origen de indicadores)
CREATE TABLE fuentes (
  id             smallserial  PRIMARY KEY,
  codigo         text         NOT NULL UNIQUE,         -- bcb, ine, ypfb, abc, embi, p2p…
  nombre         text         NOT NULL,
  categoria      tipo_fuente  NOT NULL DEFAULT 'oficial',
  url            text,
  descripcion    text,
  creado_en      timestamptz  NOT NULL DEFAULT now(),
  actualizado_en timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE fuentes IS 'Proveedores de datos del tablero (BCB, INE, YPFB, ABC, EMBI, P2P, agregadores…).';

-- Medios de prensa (Módulo D)
CREATE TABLE medios (
  id      smallserial PRIMARY KEY,
  nombre  text        NOT NULL UNIQUE,                 -- Bloomberg, El Deber, La Razón…
  tipo    tipo_medio  NOT NULL DEFAULT 'nacional',
  pais    text        DEFAULT 'BO'
);
COMMENT ON TABLE medios IS 'Medios de prensa citados en el feed de noticias.';

-- Categorías de noticia (chips de filtro del Módulo D)
CREATE TABLE categorias_noticia (
  id      smallserial PRIMARY KEY,
  codigo  text        NOT NULL UNIQUE,
  nombre  text        NOT NULL UNIQUE
);

-- Categorías de evento (Módulo E)
CREATE TABLE categorias_evento (
  id      smallserial PRIMARY KEY,
  codigo  text        NOT NULL UNIQUE,
  nombre  text        NOT NULL UNIQUE
);

-- Agencias calificadoras (Módulo C)
CREATE TABLE agencias_calificadoras (
  id      smallserial PRIMARY KEY,
  codigo  text        NOT NULL UNIQUE,                 -- moodys, sp, fitch
  nombre  text        NOT NULL UNIQUE
);

-- Rutas de la Red Vial Fundamental (Módulo B)
CREATE TABLE rutas (
  id              serial   PRIMARY KEY,
  codigo          text     NOT NULL,                   -- RVF 01, RVF 04…
  nombre          text     NOT NULL,
  departamento_id smallint REFERENCES departamentos(id) ON DELETE SET NULL,
  UNIQUE (codigo, nombre)
);
COMMENT ON TABLE rutas IS 'Tramos de la Red Vial Fundamental sobre los que ocurren bloqueos.';

-- Bonos soberanos (Módulo C)
CREATE TABLE bonos_soberanos (
  id          smallserial PRIMARY KEY,
  codigo      text        NOT NULL UNIQUE,             -- BOL28, BOL30
  nombre      text        NOT NULL,
  cupon       numeric(6,3),                            -- % anual
  vencimiento date,
  moneda      char(3)     NOT NULL DEFAULT 'USD',
  emisor      text        NOT NULL DEFAULT 'Estado Plurinacional de Bolivia'
);

-- Índices de riesgo soberano (Módulo C): EMBI, CDS 5Y
CREATE TABLE indices_riesgo (
  id      smallserial PRIMARY KEY,
  codigo  text        NOT NULL UNIQUE,                 -- EMBI, CDS5Y
  nombre  text        NOT NULL,
  unidad  text        NOT NULL DEFAULT 'pb'
);

-- Términos / keywords de noticias (catálogo, M:N con noticias)
CREATE TABLE terminos (
  id      serial PRIMARY KEY,
  termino text   NOT NULL UNIQUE
);

-- Indicadores macro (Módulo A) — catálogo; los valores van en la serie de tiempo
CREATE TABLE indicadores (
  id                 smallserial         PRIMARY KEY,
  codigo             text                NOT NULL UNIQUE,   -- usdbob_oficial, rin, ipc…
  nombre             text                NOT NULL,          -- etiqueta mostrada
  unidad             text,                                  -- %, M USD, mm³/d…
  categoria          categoria_indicador NOT NULL,
  sentido            sentido_indicador   NOT NULL DEFAULT 'neutral',
  decimales          smallint            NOT NULL DEFAULT 2,
  definicion         text,
  asof               text,                                  -- etiqueta real del dato vigente (p.ej. "jul 2025")
  periodicidad       periodicidad        NOT NULL DEFAULT 'mensual',
  fuente_id          smallint            REFERENCES fuentes(id) ON DELETE SET NULL,
  -- indicador base para calcular brecha (p.ej. paralelo vs oficial)
  indicador_base_id  smallint            REFERENCES indicadores(id) ON DELETE SET NULL,
  creado_en          timestamptz         NOT NULL DEFAULT now(),
  actualizado_en     timestamptz         NOT NULL DEFAULT now(),
  CHECK (indicador_base_id IS NULL OR indicador_base_id <> id)
);
COMMENT ON TABLE indicadores IS 'Catálogo de KPIs macro. indicador_base_id habilita el cálculo de brecha relativa.';

-- ════════════════════════════════════════════════════════════════════════
-- HECHOS / SERIES DE TIEMPO
-- ════════════════════════════════════════════════════════════════════════

-- Observaciones de indicadores (alimenta valor actual, delta y sparkline)
CREATE TABLE indicador_observaciones (
  id                  bigserial    PRIMARY KEY,
  indicador_id        smallint     NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  fecha               date         NOT NULL,
  valor               numeric(18,4) NOT NULL,
  variacion           numeric(10,4),                   -- delta vs período previo (numérico)
  variacion_etiqueta  text,                            -- delta formateado: "−3,2% m/m"
  var_mensual         numeric(10,4),                   -- métrica secundaria (p.ej. IPC mensual)
  creado_en           timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (indicador_id, fecha)
);
COMMENT ON TABLE indicador_observaciones IS 'Serie de tiempo por indicador; la última fila es el valor vigente y las 12 últimas el sparkline.';

-- Health-check de fuentes (Módulo F) — histórico de chequeos
CREATE TABLE fuente_estado (
  id                    bigserial   PRIMARY KEY,
  fuente_id             smallint    NOT NULL REFERENCES fuentes(id) ON DELETE CASCADE,
  estado                estado_fuente NOT NULL,
  latencia_ms           integer     CHECK (latencia_ms IS NULL OR latencia_ms >= 0),
  ultima_actualizacion  text,                          -- etiqueta mostrada: "14:32", "abr", "mar 2026"
  verificado_en         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE fuente_estado IS 'Snapshots del estado/latencia de cada fuente; el más reciente alimenta el footer.';

-- Bloqueos (Módulo B)
CREATE TABLE bloqueos (
  id             bigserial         PRIMARY KEY,
  codigo         text              NOT NULL UNIQUE,    -- b1, b2…
  departamento_id smallint         NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  ruta_id        integer           REFERENCES rutas(id) ON DELETE SET NULL,
  tramo          text,                                 -- "Km 102 · Patacamaya"
  lon            numeric(9,5)      NOT NULL,
  lat            numeric(9,5)      NOT NULL,
  sector         text,                                 -- sector convocante
  motivo         text,
  severidad      severidad_bloqueo NOT NULL DEFAULT 'media',
  estado         estado_bloqueo    NOT NULL DEFAULT 'activo',
  fecha_inicio   date              NOT NULL,
  fecha_fin      date,
  fuente_id      smallint          REFERENCES fuentes(id) ON DELETE SET NULL,
  fuente_texto   text,                                 -- atribución libre cuando no hay fuente catalogada
  creado_en      timestamptz       NOT NULL DEFAULT now(),
  actualizado_en timestamptz       NOT NULL DEFAULT now(),
  CHECK (lon BETWEEN -75 AND -50),
  CHECK (lat BETWEEN -25 AND -8),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
COMMENT ON COLUMN bloqueos.lon IS 'Longitud real; el frontend la proyecta con boliviaGeo.project().';

-- Cronología de cada bloqueo (drawer de detalle)
CREATE TABLE bloqueo_eventos (
  id          bigserial   PRIMARY KEY,
  bloqueo_id  bigint      NOT NULL REFERENCES bloqueos(id) ON DELETE CASCADE,
  fecha       date        NOT NULL,
  descripcion text        NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

-- Cotizaciones de bonos (Módulo C)
CREATE TABLE bono_cotizaciones (
  id          bigserial    PRIMARY KEY,
  bono_id     smallint     NOT NULL REFERENCES bonos_soberanos(id) ON DELETE CASCADE,
  fecha       date         NOT NULL,
  precio      numeric(9,4) NOT NULL,                   -- % del nominal
  rendimiento numeric(7,3),                            -- yield %
  spread_ust  integer,                                 -- pb vs UST
  variacion   numeric(8,3),                            -- cambio del día
  UNIQUE (bono_id, fecha)
);

-- Observaciones de índices de riesgo (EMBI 30d, CDS)
CREATE TABLE indice_riesgo_observaciones (
  id        bigserial   PRIMARY KEY,
  indice_id smallint    NOT NULL REFERENCES indices_riesgo(id) ON DELETE CASCADE,
  fecha     date        NOT NULL,
  valor     integer     NOT NULL,
  variacion numeric(8,2),
  nota      text,
  UNIQUE (indice_id, fecha)
);

-- Calificaciones soberanas (Módulo C) — histórico por agencia
CREATE TABLE calificaciones (
  id           bigserial          PRIMARY KEY,
  agencia_id   smallint           NOT NULL REFERENCES agencias_calificadoras(id) ON DELETE CASCADE,
  calificacion text               NOT NULL,            -- Caa3, CCC−, CCC
  perspectiva  perspectiva_rating NOT NULL DEFAULT 'estable',
  fecha        date               NOT NULL,
  nota         text,
  UNIQUE (agencia_id, fecha)
);

-- Composición de Reservas Internacionales Netas (donut, Módulo C)
CREATE TABLE reservas_composicion (
  id          bigserial      PRIMARY KEY,
  fecha       date           NOT NULL,
  componente  componente_rin NOT NULL,
  porcentaje  numeric(5,2)   NOT NULL CHECK (porcentaje BETWEEN 0 AND 100),
  monto_musd  numeric(14,2),
  UNIQUE (fecha, componente)
);

-- Noticias (Módulo D)
CREATE TABLE noticias (
  id            bigserial   PRIMARY KEY,
  codigo        text        UNIQUE,                    -- n1, n2…
  publicado_en  timestamptz NOT NULL,
  medio_id      smallint    REFERENCES medios(id) ON DELETE SET NULL,
  categoria_id  smallint    REFERENCES categorias_noticia(id) ON DELETE SET NULL,
  titular       text        NOT NULL,
  resumen       text,
  cuerpo        text,
  breaking      boolean     NOT NULL DEFAULT false,
  url           text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  -- columna de búsqueda full-text (español) generada
  busqueda      tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(titular, '') || ' ' || coalesce(resumen, '') || ' ' || coalesce(cuerpo, ''))
  ) STORED
);
COMMENT ON COLUMN noticias.busqueda IS 'tsvector para la búsqueda global; índice GIN abajo.';

-- Términos clave por noticia (M:N)
CREATE TABLE noticia_terminos (
  noticia_id bigint NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
  termino_id integer NOT NULL REFERENCES terminos(id) ON DELETE CASCADE,
  PRIMARY KEY (noticia_id, termino_id)
);

-- Vínculos de una noticia a otras entidades del tablero ("vinculado a")
CREATE TABLE noticia_vinculos (
  id           bigserial    PRIMARY KEY,
  noticia_id   bigint       NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
  tipo         tipo_entidad NOT NULL DEFAULT 'otro',
  etiqueta     text         NOT NULL,                  -- texto mostrado
  -- FKs opcionales tipadas (se enlazan cuando la entidad existe en catálogo)
  indicador_id smallint     REFERENCES indicadores(id) ON DELETE SET NULL,
  bono_id      smallint     REFERENCES bonos_soberanos(id) ON DELETE SET NULL,
  indice_id    smallint     REFERENCES indices_riesgo(id) ON DELETE SET NULL,
  bloqueo_id   bigint       REFERENCES bloqueos(id) ON DELETE SET NULL
);
COMMENT ON TABLE noticia_vinculos IS 'Relaciona cada noticia con indicadores/bonos/índices/bloqueos; etiqueta es el fallback textual.';

-- Eventos del calendario (Módulo E)
CREATE TABLE eventos (
  id           bigserial   PRIMARY KEY,
  fecha        date        NOT NULL,
  categoria_id smallint    REFERENCES categorias_evento(id) ON DELETE SET NULL,
  titulo       text        NOT NULL,
  tono         tono_visual NOT NULL DEFAULT 'neutral',
  detalle      text,
  fuente_id    smallint    REFERENCES fuentes(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

-- Commodities de exportación (precio spot vigente) — Módulo Externo
CREATE TABLE commodities (
  id          smallserial   PRIMARY KEY,
  codigo      text          NOT NULL UNIQUE,
  nombre      text          NOT NULL,
  unidad      text          NOT NULL,
  valor       numeric(14,3) NOT NULL,
  var_mensual numeric(8,2),
  var_anual   numeric(8,2),
  polaridad   text          NOT NULL DEFAULT 'up', -- 'up' = mayor precio favorece a Bolivia
  fuente      text,
  asof        text,
  nota        text
);
COMMENT ON TABLE commodities IS 'Precios spot de commodities de exportación (oro, zinc, estaño, soya…).';

-- Serie histórica de precios de commodities (alimenta el modal de detalle)
CREATE TABLE commodity_observaciones (
  id           bigserial     PRIMARY KEY,
  commodity_id smallint      NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
  fecha        date          NOT NULL,
  valor        numeric(14,3) NOT NULL,
  UNIQUE (commodity_id, fecha)
);
COMMENT ON TABLE commodity_observaciones IS 'Serie de tiempo de precios por commodity (cierre mensual).';

-- Métricas del módulo Externo & Deuda — clave/valor flexible
CREATE TABLE externo_metricas (
  clave       text PRIMARY KEY,            -- deuda_externa_pct, balanza_saldo, comb_diesel…
  valor       numeric(16,3),
  valor_texto text,
  unidad      text,
  asof        text,
  fuente      text,
  nota        text
);
COMMENT ON TABLE externo_metricas IS 'Deuda externa, balanza comercial, servicio de deuda y precios de combustibles.';

-- Resultados electorales por departamento (cruce con bloqueos) — Módulo B
CREATE TABLE elecciones_departamento (
  departamento_id smallint     PRIMARY KEY REFERENCES departamentos(id) ON DELETE CASCADE,
  fr_paz          numeric(5,2),   -- presidencial 2025, 1ª vuelta (17-ago) %
  fr_quiroga      numeric(5,2),
  fr_doria        numeric(5,2),
  fr_andronico    numeric(5,2),
  fr_winner       text,
  ro_paz          numeric(5,2),   -- balotaje (19-oct) %
  ro_quiroga      numeric(5,2),
  ro_winner       text         NOT NULL,
  muni_partido    text,           -- alcaldía de la capital, subnacionales 2026
  muni_alcalde    text
);
COMMENT ON TABLE elecciones_departamento IS 'Presidencial 2025 (1ª v + balotaje, cómputo OEP) y alcaldía 2026 por departamento; alimenta el cruce bloqueos × elecciones del mapa.';

-- Localidades de la presidencial 2025 (1ª vuelta, OEP) geolocalizadas — scatter del mapa
CREATE TABLE eleccion_localidad (
  id            bigserial    PRIMARY KEY,
  departamento  text         NOT NULL,
  municipio     text,
  nombre        text         NOT NULL,
  lon           numeric(9,4) NOT NULL,
  lat           numeric(9,4) NOT NULL,
  partido       text         NOT NULL,   -- partido ganador en la localidad (1ª vuelta)
  votos         integer      NOT NULL    -- votos válidos sumados en la localidad
);
CREATE INDEX idx_eleccion_localidad_part ON eleccion_localidad (partido);
COMMENT ON TABLE eleccion_localidad IS '3.730 localidades de la presidencial 2025 (1ª v.) con coordenadas aproximadas (GeoNames) y partido ganador; alimenta el scatter de localidades del mapa.';

-- ════════════════════════════════════════════════════════════════════════
-- ÍNDICES (toda FK + columnas de filtro/orden frecuentes)
-- ════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_indicadores_categoria         ON indicadores (categoria);
CREATE INDEX idx_indicadores_fuente            ON indicadores (fuente_id);
CREATE INDEX idx_indicadores_nombre_trgm       ON indicadores USING gin (nombre gin_trgm_ops);
CREATE INDEX idx_obs_indicador_fecha           ON indicador_observaciones (indicador_id, fecha DESC);
CREATE INDEX idx_fuente_estado_fuente_fecha    ON fuente_estado (fuente_id, verificado_en DESC);
CREATE INDEX idx_rutas_departamento            ON rutas (departamento_id);
CREATE INDEX idx_bloqueos_departamento         ON bloqueos (departamento_id);
CREATE INDEX idx_bloqueos_ruta                 ON bloqueos (ruta_id);
CREATE INDEX idx_bloqueos_fuente               ON bloqueos (fuente_id);
CREATE INDEX idx_bloqueos_estado_severidad     ON bloqueos (estado, severidad);
CREATE INDEX idx_bloqueo_eventos_bloqueo       ON bloqueo_eventos (bloqueo_id, fecha);
CREATE INDEX idx_bono_cotiz_bono_fecha         ON bono_cotizaciones (bono_id, fecha DESC);
CREATE INDEX idx_indice_obs_indice_fecha       ON indice_riesgo_observaciones (indice_id, fecha DESC);
CREATE INDEX idx_calificaciones_agencia_fecha  ON calificaciones (agencia_id, fecha DESC);
CREATE INDEX idx_reservas_fecha                ON reservas_composicion (fecha DESC);
CREATE INDEX idx_commodity_obs_fecha           ON commodity_observaciones (commodity_id, fecha DESC);
CREATE INDEX idx_noticias_publicado            ON noticias (publicado_en DESC);
CREATE INDEX idx_noticias_categoria            ON noticias (categoria_id);
CREATE INDEX idx_noticias_medio                ON noticias (medio_id);
CREATE INDEX idx_noticias_busqueda             ON noticias USING gin (busqueda);
CREATE INDEX idx_noticia_terminos_termino      ON noticia_terminos (termino_id);
CREATE INDEX idx_noticia_vinculos_noticia      ON noticia_vinculos (noticia_id);
CREATE INDEX idx_eventos_fecha                 ON eventos (fecha);
CREATE INDEX idx_eventos_categoria             ON eventos (categoria_id);

-- ════════════════════════════════════════════════════════════════════════
-- TRIGGERS de actualizado_en
-- ════════════════════════════════════════════════════════════════════════
CREATE TRIGGER trg_fuentes_upd     BEFORE UPDATE ON fuentes     FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
CREATE TRIGGER trg_indicadores_upd BEFORE UPDATE ON indicadores FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
CREATE TRIGGER trg_bloqueos_upd    BEFORE UPDATE ON bloqueos    FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
CREATE TRIGGER trg_noticias_upd    BEFORE UPDATE ON noticias    FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- ════════════════════════════════════════════════════════════════════════
-- VISTAS · "estado actual" listo para el frontend
-- ════════════════════════════════════════════════════════════════════════

-- A · indicadores con su último valor, delta y brecha calculada
CREATE VIEW v_indicadores_actuales AS
SELECT
  i.id, i.codigo, i.nombre, i.unidad, i.categoria, i.sentido, i.decimales,
  i.definicion, i.asof, i.periodicidad,
  f.nombre  AS fuente,
  f.codigo  AS fuente_codigo,
  o.fecha   AS fecha_dato,
  o.valor,
  o.variacion,
  o.variacion_etiqueta,
  o.var_mensual,
  CASE
    WHEN i.indicador_base_id IS NOT NULL AND ob.valor IS NOT NULL AND ob.valor <> 0
    THEN round((o.valor / ob.valor - 1) * 100, 1)
  END AS brecha_pct
FROM indicadores i
LEFT JOIN fuentes f ON f.id = i.fuente_id
LEFT JOIN LATERAL (
  SELECT * FROM indicador_observaciones
  WHERE indicador_id = i.id ORDER BY fecha DESC LIMIT 1
) o ON true
LEFT JOIN LATERAL (
  SELECT valor FROM indicador_observaciones
  WHERE indicador_id = i.indicador_base_id ORDER BY fecha DESC LIMIT 1
) ob ON true;

-- B · bloqueos activos con departamento, ruta y día N calculado
CREATE VIEW v_bloqueos_activos AS
SELECT
  b.id, b.codigo, d.nombre AS departamento, d.codigo AS departamento_codigo,
  r.codigo AS ruta_codigo, r.nombre AS ruta_nombre,
  b.tramo, b.lon, b.lat, b.sector, b.motivo, b.severidad, b.estado,
  b.fecha_inicio,
  (CURRENT_DATE - b.fecha_inicio) AS dia,
  coalesce(f.nombre, b.fuente_texto) AS fuente
FROM bloqueos b
JOIN departamentos d ON d.id = b.departamento_id
LEFT JOIN rutas r   ON r.id = b.ruta_id
LEFT JOIN fuentes f ON f.id = b.fuente_id
WHERE b.estado <> 'levantado';

-- C · última cotización por bono
CREATE VIEW v_bonos_actuales AS
SELECT DISTINCT ON (c.bono_id)
  b.codigo, b.nombre, b.cupon, b.vencimiento,
  c.fecha, c.precio, c.rendimiento, c.spread_ust, c.variacion
FROM bono_cotizaciones c
JOIN bonos_soberanos b ON b.id = c.bono_id
ORDER BY c.bono_id, c.fecha DESC;

-- C · calificación vigente por agencia
CREATE VIEW v_calificaciones_actuales AS
SELECT DISTINCT ON (c.agencia_id)
  a.codigo AS agencia_codigo, a.nombre AS agencia,
  c.calificacion, c.perspectiva, c.fecha, c.nota
FROM calificaciones c
JOIN agencias_calificadoras a ON a.id = c.agencia_id
ORDER BY c.agencia_id, c.fecha DESC;

-- F · estado vigente por fuente
CREATE VIEW v_fuentes_estado_actual AS
SELECT DISTINCT ON (fe.fuente_id)
  f.codigo, f.nombre, fe.estado, fe.latencia_ms, fe.ultima_actualizacion, fe.verificado_en
FROM fuente_estado fe
JOIN fuentes f ON f.id = fe.fuente_id
ORDER BY fe.fuente_id, fe.verificado_en DESC;

-- D · feed de noticias enriquecido (breaking = < 2h)
CREATE VIEW v_noticias_feed AS
SELECT
  n.id, n.codigo, n.publicado_en, m.nombre AS medio, m.tipo AS medio_tipo,
  cn.nombre AS categoria, n.titular, n.resumen, n.cuerpo, n.url,
  (n.breaking OR n.publicado_en > now() - interval '2 hours') AS breaking
FROM noticias n
LEFT JOIN medios m            ON m.id = n.medio_id
LEFT JOIN categorias_noticia cn ON cn.id = n.categoria_id
ORDER BY n.publicado_en DESC;

-- ════════════════════════════════════════════════════════════════════════
-- Fin del esquema
-- ════════════════════════════════════════════════════════════════════════
