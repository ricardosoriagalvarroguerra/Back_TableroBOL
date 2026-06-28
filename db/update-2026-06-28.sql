-- ════════════════════════════════════════════════════════════════════════
-- Tablero Inteligente BOL · Actualización al 28-jun-2026 (domingo)
--
-- Novedad estructural: el 26-jun el Gobierno anunció el FIN del tipo de cambio
-- fijo (Bs 6,96 desde 2011). Desde el lunes 29-jun rige un régimen FLEXIBLE,
-- con TCO inicial de Bs 9,73 (promedio ponderado de compras de la banca,
-- publicado a diario). Hoy (28-jun) el oficial AÚN es 6,96; el flexible arranca
-- mañana, así que se refleja el valor de hoy + el aviso en la definición.
--
-- Clúster cambiario al 28-jun (movimientos mínimos) + 3 notas (flexibilización,
-- reacción de Evo, medidas de apoyo). Bloqueos siguen en 0; sin release macro.
-- Fuentes: BCB/MEFP (RM 245), Visión360, Erbol, El Diario, agregadores P2P.
-- Idempotente. Transacción.
-- ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── A · INDICADORES — clúster cambiario al 28-jun ───────────────────────
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-28', 6.96, 0, '0,00%'
FROM indicadores WHERE codigo = 'usdbob_oficial'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-27', 9.89, NULL::numeric, NULL::text),
  (DATE '2026-06-28', 9.88, -0.10,         '−0,1%')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'usdbob_paralelo'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-27', 42.1, NULL::numeric, NULL::text),
  (DATE '2026-06-28', 42.0, -0.1,          '−0,1 pp')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'brecha'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- VRD sin cambio el fin de semana (el BCB lo publica en días hábiles).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-28', 9.93, 0, '≈ 0'
FROM indicadores WHERE codigo = 'vrd'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-28', -0.5, 0, '−0,5%'
FROM indicadores WHERE codigo = 'brecha_vrd'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

UPDATE indicadores SET asof = '28 jun · 09:00' WHERE codigo = 'usdbob_oficial';
UPDATE indicadores SET asof = '28 jun' WHERE codigo IN ('usdbob_paralelo','vrd','brecha','brecha_vrd');

-- Definiciones que avisan del cambio de régimen (29-jun).
UPDATE indicadores
   SET definicion = 'Tipo de cambio oficial, fijo en Bs 6,96 por el BCB desde nov-2011. El 28-jun es el ÚLTIMO día del régimen fijo: desde el lunes 29-jun el BCB adopta un tipo de cambio FLEXIBLE, con un TCO inicial de Bs 9,73 calculado a diario como promedio ponderado de las compras de dólares de la banca (operaciones 00:00–17:00, publicado a las 20:00). El referencial de venta será el TCO + Bs 0,10.'
 WHERE codigo = 'usdbob_oficial';

UPDATE indicadores
   SET definicion = 'Brecha entre el dólar paralelo y el oficial (6,96). Al 28-jun ~42%. Con el tipo de cambio FLEXIBLE que arranca el 29-jun (TCO inicial 9,73), la brecha contra el oficial colapsa de ~42% a ~2%: es, de facto, la unificación cambiaria.'
 WHERE codigo = 'brecha';

-- ── D · NOTICIAS — fin del tipo de cambio fijo (26–28 jun) ──────────────
INSERT INTO medios (nombre, tipo, pais) VALUES
  ('Visión 360', 'nacional', 'BO'),
  ('Erbol',      'nacional', 'BO')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO noticias (codigo, publicado_en, medio_id, categoria_id, titular, resumen, cuerpo, breaking, url)
SELECT x.codigo, x.publicado_en, m.id, cn.id, x.titular, x.resumen, x.cuerpo, x.breaking, x.url
FROM (VALUES
  ('n23', TIMESTAMPTZ '2026-06-28 14:00:00+00', 'El Diario', 'economico', false,
   'El Gobierno anuncia medidas de apoyo al sector privado ante el nuevo tipo de cambio flexible',
   'Con la entrada en vigor del régimen cambiario flexible, el Ejecutivo prepara apoyo financiero, menos trámites e incentivos al sector privado y a las familias emprendedoras, a detallarse la próxima semana.',
   'El Gobierno sostiene que la flexibilización dinamizará el sector externo —exportaciones, remesas, inversión y repatriación de capitales— y anunció un paquete de medidas de reactivación para acompañar la transición. Los detalles se conocerían la siguiente semana, junto con el plan para los sectores más golpeados por los bloqueos.',
   'https://www.eldiario.net/portal/2026/06/28/gobierno-anuncia-medidas-de-apoyo-al-sector-privado/'),

  ('n24', TIMESTAMPTZ '2026-06-28 12:00:00+00', 'Erbol', 'politico', false,
   'Evo dice que el dólar flexible es "la receta del FMI" para devaluar al boliviano',
   'Morales calificó la flexibilización cambiaria como una imposición del FMI que devaluará la moneda y golpeará a los más pobres; advirtió sobre libre importación de combustibles y "otro gasolinazo", pero no anunció nuevas medidas ni bloqueos.',
   'Desde el Trópico de Cochabamba, Evo Morales cuestionó el nuevo régimen cambiario como una "receta del FMI" y a la dirigencia de la COB por avalar el acuerdo que habilitó el estado de excepción. El cuarto intermedio de las movilizaciones sigue vigente; Morales no convocó a nuevos cortes de ruta.',
   'https://www.erbol.com.bo/nacional/evo-dice-que-d%C3%B3lar-flexible-es-la-receta-del-fmi-para-devaluar-al-boliviano'),

  ('n25', TIMESTAMPTZ '2026-06-26 23:30:00+00', 'Visión 360', 'economico', true,
   'Bolivia pone fin al tipo de cambio fijo: el dólar oficial será flexible desde el lunes, con un TCO de Bs 9,73',
   'El Gobierno (RM 245) y el BCB abandonan el tipo de cambio fijo vigente desde 2011 y adoptan un régimen flexible: el oficial se calculará a diario según el mercado, arrancando el 29-jun en Bs 9,73.',
   'El BCB publicará el Tipo de Cambio Oficial cada día hábil a las 20:00 (para la jornada siguiente), como promedio ponderado de las compras de dólares de la banca entre las 00:00 y las 17:00; el referencial de venta será el TCO más Bs 0,10. La medida acerca el oficial al paralelo (~Bs 9,88) y, de hecho, unifica el tipo de cambio. El vicepresidente Edman Lara advirtió que, sin medidas de acompañamiento, podría acelerar la inflación.',
   'https://www.vision360.bo/noticias/2026/06/26/55249-este-lunes-bolivia-iniciara-de-forma-oficial-el-regimen-cambiario-flexible-del-dolar-con-un-tipo-de-cambio-de-bs-9_73')
) AS x(codigo, publicado_en, medio, categoria, breaking, titular, resumen, cuerpo, url)
JOIN medios m              ON m.nombre = x.medio
JOIN categorias_noticia cn ON cn.codigo = x.categoria
ON CONFLICT (codigo) DO UPDATE SET
  publicado_en = EXCLUDED.publicado_en, medio_id = EXCLUDED.medio_id,
  categoria_id = EXCLUDED.categoria_id, titular  = EXCLUDED.titular,
  resumen      = EXCLUDED.resumen,      cuerpo   = EXCLUDED.cuerpo,
  breaking     = EXCLUDED.breaking,     url      = EXCLUDED.url;

-- Vínculos: las notas cambiarias al clúster del dólar.
DELETE FROM noticia_vinculos nv USING noticias n
 WHERE nv.noticia_id = n.id AND n.codigo IN ('n23','n24','n25');
INSERT INTO noticia_vinculos (noticia_id, tipo, etiqueta, indicador_id)
SELECT n.id, 'indicador'::tipo_entidad, 'USD/BOB oficial', i.id
FROM noticias n JOIN indicadores i ON i.codigo = 'usdbob_oficial'
WHERE n.codigo IN ('n25','n24');

-- ── F · Health-check de fuentes ─────────────────────────────────────────
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 210, '28 jun' FROM fuentes WHERE codigo = 'bcb';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'live', 140, '28 jun · 14:00' FROM fuentes WHERE codigo = 'news';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 320, '28 jun · 06:00' FROM fuentes WHERE codigo = 'abc';

COMMIT;
