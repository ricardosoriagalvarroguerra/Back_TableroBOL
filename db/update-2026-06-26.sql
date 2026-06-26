-- ════════════════════════════════════════════════════════════════════════
-- Tablero Inteligente BOL · Actualización al 26-jun-2026
--
-- Avance de 2 días (24→26 jun): el clúster cambiario al 26-jun y 3 notas
-- nuevas de la resaca post-bloqueo. Bloqueos siguen en CERO (carreteras
-- libres desde 23-jun); sin releases macro oficiales nuevos.
--
-- Fuentes: BCB (oficial/VRD), agregadores P2P (paralelo), El Deber, La
-- Patria, El Diario. Idempotente (UPSERT). Transacción.
-- ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── A · INDICADORES — clúster cambiario al 26-jun ───────────────────────
-- Paralelo Bs 9,89 · brecha 42,1% · VRD (referencial BCB) 9,93 · oficial 6,96.

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-26', 6.96, 0, '0,00%'
FROM indicadores WHERE codigo = 'usdbob_oficial'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-25', 9.90, NULL::numeric, NULL::text),
  (DATE '2026-06-26', 9.89, -0.10,         '−0,1%')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'usdbob_paralelo'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-25', 42.2, NULL::numeric, NULL::text),
  (DATE '2026-06-26', 42.1, -0.1,          '−0,1 pp')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'brecha'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-26', 9.93, 0.7, '+0,7%'
FROM indicadores WHERE codigo = 'vrd'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-26', -0.4, 0, '−0,4%'
FROM indicadores WHERE codigo = 'brecha_vrd'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

UPDATE indicadores SET asof = '26 jun · 09:00' WHERE codigo = 'usdbob_oficial';
UPDATE indicadores SET asof = '26 jun' WHERE codigo IN ('usdbob_paralelo','vrd','brecha','brecha_vrd');

-- ── D · NOTICIAS — resaca post-bloqueo (25–26 jun) ──────────────────────
INSERT INTO medios (nombre, tipo, pais) VALUES ('El Diario', 'nacional', 'BO')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO noticias (codigo, publicado_en, medio_id, categoria_id, titular, resumen, cuerpo, breaking, url)
SELECT x.codigo, x.publicado_en, m.id, cn.id, x.titular, x.resumen, x.cuerpo, x.breaking, x.url
FROM (VALUES
  ('n20', TIMESTAMPTZ '2026-06-26 12:00:00+00', 'El Diario', 'social', false,
   'El Gobierno finaliza el puente aéreo tras la reapertura de las carreteras',
   'Con las vías despejadas y el transporte terrestre normalizándose, el Ejecutivo cierra el puente aéreo que abasteció de insumos críticos durante los bloqueos.',
   'El cierre del puente aéreo —que durante el conflicto trasladó alimentos, medicamentos y oxígeno medicinal a zonas aisladas— marca la normalización del abastecimiento tras la reapertura de la Red Vial Fundamental. Persisten trabajos de limpieza de escombros en Cochabamba, La Paz y Oruro.',
   'https://www.eldiario.net/portal/2026/06/26/gobierno-finaliza-el-puente-aereo/'),

  ('n21', TIMESTAMPTZ '2026-06-25 22:00:00+00', 'El Deber', 'economico', false,
   'El Gobierno ratifica que no subirá el precio de los combustibles y que hay dólares para comprarlos',
   'El ministro de Economía Gabriel Espinoza descarta un alza de combustibles y desmiente falta de divisas; cifra las RIN en torno a US$4.900 M y prevé normalizar los surtidores en La Paz y El Alto.',
   'Espinoza afirmó que "no es un tema de falta de dólares para pagar" y que el BCB cuenta con más de US$700 M en efectivo, con RIN cerca de US$4.900 M. Las colas en surtidores persistían tres días después del fin de los bloqueos; el Gobierno esperaba regularizar el abastecimiento entre la noche del 25 y el 26 de junio. El precio de los carburantes se mantiene sin cambios.',
   'https://eldeber.com.bo/pais/gobierno-ratifica-no-subira-precio-combustibles-hay-dolares-compra_1782407329'),

  ('n22', TIMESTAMPTZ '2026-06-25 20:30:00+00', 'La Patria', 'economico', false,
   'La Paz presenta un plan de reactivación tras pérdidas por US$520 millones por los bloqueos',
   'El municipio paceño plantea un plan en tres fases —corto, mediano y largo plazo— con rutas alternativas y garantías de combustible y alimentos, tras 51 días de bloqueos que costaron unos US$520 millones a la región.',
   'La Asamblea de la Paceñidad fue convocada para presentar el plan de reactivación económica de La Paz. Incluye corredores alternativos hacia los Valles, Cochabamba y el norte paceño, y medidas para asegurar el abastecimiento de combustible, alimentos y oxígeno medicinal. Es parte de los planes de reactivación que distintos sectores y regiones impulsan tras el desenlace del conflicto.',
   'https://lapatria.bo/dinero-negocios/economia/plan-reactivacion-economica/')
) AS x(codigo, publicado_en, medio, categoria, breaking, titular, resumen, cuerpo, url)
JOIN medios m              ON m.nombre = x.medio
JOIN categorias_noticia cn ON cn.codigo = x.categoria
ON CONFLICT (codigo) DO UPDATE SET
  publicado_en = EXCLUDED.publicado_en, medio_id = EXCLUDED.medio_id,
  categoria_id = EXCLUDED.categoria_id, titular  = EXCLUDED.titular,
  resumen      = EXCLUDED.resumen,      cuerpo   = EXCLUDED.cuerpo,
  breaking     = EXCLUDED.breaking,     url      = EXCLUDED.url;

-- Vínculo de la nota de combustibles/RIN al indicador de reservas.
DELETE FROM noticia_vinculos nv USING noticias n
 WHERE nv.noticia_id = n.id AND n.codigo IN ('n20','n21','n22');
INSERT INTO noticia_vinculos (noticia_id, tipo, etiqueta, indicador_id)
SELECT n.id, 'indicador'::tipo_entidad, 'RIN · BCB', i.id
FROM noticias n JOIN indicadores i ON i.codigo = 'rin'
WHERE n.codigo = 'n21';

-- ── F · Health-check de fuentes (footer) ────────────────────────────────
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 210, '26 jun' FROM fuentes WHERE codigo = 'bcb';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'live', 140, '26 jun · 12:00' FROM fuentes WHERE codigo = 'news';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 320, '26 jun · 06:00' FROM fuentes WHERE codigo = 'abc';

COMMIT;
