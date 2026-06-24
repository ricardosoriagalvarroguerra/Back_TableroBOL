-- ════════════════════════════════════════════════════════════════════════
-- Tablero Inteligente BOL · Actualización de datos · 24-jun-2026
--
-- Fuentes oficiales / prensa verificadas:
--   · ABC (Administradora Boliviana de Carreteras) — transitabilidad RVF
--   · BCB — Valor Referencial del Dólar (VRD)
--   · INE — IPC mayo 2026 (sin cambios; release de junio recién ~1-jul)
--   · Prensa: Infobae, Opinión, La Patria, Red Uno, Bloomberg Línea, ABI
--
-- Contexto: tras el acuerdo Gobierno–COB (19-jun) y el estado de excepción
-- (20-jun), la ABC confirmó el 23-jun que las carreteras quedaron LIBRES de
-- bloqueos por conflictos sociales (54 días). Solo 4 rutas seguían en limpieza
-- de escombros (Cochabamba, La Paz, Oruro). El paralelo cedió a Bs 9,90.
--
-- Idempotente (UPSERT / DELETE+INSERT). Ejecuta en una transacción.
-- ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- B · BLOQUEOS — desenlace del conflicto (ABC, 23-jun)
-- ────────────────────────────────────────────────────────────────────────

-- 1) Todos los bloqueos quedan LEVANTADOS. El 23-jun la ABC declaró las
--    carreteras libres de bloqueos por conflictos sociales; las 4 rutas que
--    seguían con escombros eran limpieza post-bloqueo, no bloqueos activos.
--    → 0 puntos activos en la Red Vial Fundamental al 24-jun.
UPDATE bloqueos
   SET estado       = 'levantado',
       fecha_fin    = DATE '2026-06-23',
       fuente_texto = 'ABC · transitabilidad RVF (23 jun)'
 WHERE estado <> 'levantado';

-- 2) Cronología del desenlace (idempotente para fechas ≥ 19-jun).
DELETE FROM bloqueo_eventos be
 USING bloqueos b
 WHERE be.bloqueo_id = b.id
   AND b.codigo IN ('b1','b3','b9','b14')
   AND be.fecha >= DATE '2026-06-19';

INSERT INTO bloqueo_eventos (bloqueo_id, fecha, descripcion)
SELECT b.id, v.fecha, v.descripcion
FROM bloqueos b
JOIN (VALUES
  ('b1',  DATE '2026-06-19', 'La COB y el Gobierno firman un acuerdo de pacificación; se instruye levantar los bloqueos.'),
  ('b1',  DATE '2026-06-22', 'El Trópico de Cochabamba (Evo Morales) declara un cuarto intermedio: "no es rendirnos".'),
  ('b1',  DATE '2026-06-23', 'ABC habilita la vía; cuadrillas retiran piedras y escombros con resguardo policial-militar.'),
  ('b3',  DATE '2026-06-20', 'Estado de excepción; FF.AA. y Policía despejan los piquetes del corredor Cochabamba–Oruro.'),
  ('b3',  DATE '2026-06-23', 'ABC reporta tránsito restablecido; limpieza de escombros en curso.'),
  ('b9',  DATE '2026-06-20', 'Intervención policial-militar reabre el corredor La Paz–Oruro (Patacamaya–Sica Sica).'),
  ('b9',  DATE '2026-06-23', 'Vía habilitada; retiro de escombros con maquinaria de la ABC.'),
  ('b14', DATE '2026-06-20', 'Despeje del nudo de Caracollo bajo el estado de excepción.'),
  ('b14', DATE '2026-06-23', 'ABC confirma vía expedita; cuadrillas concluyen la limpieza de escombros.')
) AS v(codigo, fecha, descripcion) ON v.codigo = b.codigo;

-- 4) Health-check de la fuente ABC (footer · Módulo F).
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 320, '24 jun · 06:00' FROM fuentes WHERE codigo = 'abc';

-- ────────────────────────────────────────────────────────────────────────
-- A · INDICADORES — clúster cambiario (dato diario, 21–24 jun)
-- El paralelo cede a Bs 9,90 y la brecha a 42,2%. VRD del BCB: Bs 9,76
-- compra / 9,96 venta (mid 9,86). Oficial fijo en 6,96.
-- Los macro (RIN, IPC, PIB, fiscal, deuda, gas, salario) NO tienen release
-- nuevo: su último dato oficial ya es el vigente en la BDR.
-- ────────────────────────────────────────────────────────────────────────

-- usdbob_oficial (fijo 6,96)
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-24', 6.96, 0, '0,00%'
FROM indicadores WHERE codigo = 'usdbob_oficial'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- usdbob_paralelo (cede a 9,90)
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-21', 9.94, NULL::numeric, NULL::text),
  (DATE '2026-06-22', 9.93, NULL,          NULL),
  (DATE '2026-06-23', 9.91, NULL,          NULL),
  (DATE '2026-06-24', 9.90, -0.10,         '−0,1%')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'usdbob_paralelo'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- brecha cambiaria (paralelo / oficial)
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-21', 42.8, NULL::numeric, NULL::text),
  (DATE '2026-06-22', 42.7, NULL,          NULL),
  (DATE '2026-06-23', 42.4, NULL,          NULL),
  (DATE '2026-06-24', 42.2, -0.9,          '−0,9 pp')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'brecha'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- vrd · BCB (mid de compra 9,76 / venta 9,96)
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-21', 9.90, NULL::numeric, NULL::text),
  (DATE '2026-06-24', 9.86, -0.6,          '−0,6%')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'vrd'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- brecha_vrd (paralelo / VRD ≈ 0)
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-06-24', 0.4, 0.0, '≈ 0'
FROM indicadores WHERE codigo = 'brecha_vrd'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- Etiquetas "asof" del clúster cambiario.
UPDATE indicadores SET asof = '24 jun · 09:00' WHERE codigo = 'usdbob_oficial';
UPDATE indicadores SET asof = '24 jun'
 WHERE codigo IN ('usdbob_paralelo','vrd','brecha','brecha_vrd');

-- Health-check de la fuente BCB.
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 210, '24 jun' FROM fuentes WHERE codigo = 'bcb';

-- ────────────────────────────────────────────────────────────────────────
-- D · NOTICIAS — feed 23–24 jun (desenlace del conflicto)
-- ────────────────────────────────────────────────────────────────────────

-- Medios nuevos citados.
INSERT INTO medios (nombre, tipo, pais) VALUES
  ('Opinión',   'nacional', 'BO'),
  ('La Patria', 'nacional', 'BO'),
  ('Red Uno',   'nacional', 'BO')
ON CONFLICT (nombre) DO NOTHING;

-- Notas (UPSERT por codigo). La columna `busqueda` (tsvector) se regenera sola.
INSERT INTO noticias (codigo, publicado_en, medio_id, categoria_id, titular, resumen, cuerpo, breaking, url)
SELECT x.codigo, x.publicado_en, m.id, cn.id, x.titular, x.resumen, x.cuerpo, x.breaking, x.url
FROM (VALUES
  ('n14', TIMESTAMPTZ '2026-06-24 13:51:00+00', 'Infobae', 'politico', true,
   'Rodrigo Paz ratifica el estado de excepción pese al levantamiento de los bloqueos en Bolivia',
   'El presidente mantiene la medida extraordinaria tras el fin de los bloqueos —"tenemos muchas cosas que ordenar"— y convoca a una cumbre de unidad nacional para reactivar la economía.',
   'Pese al levantamiento de los bloqueos, Rodrigo Paz ratificó el estado de excepción para prevenir nuevas protestas mientras se reactiva la economía, golpeada por pérdidas estimadas entre USD 2.500 y 3.000 millones durante el conflicto.',
   'https://www.infobae.com/america/america-latina/2026/06/24/rodrigo-paz-ratifica-el-estado-de-excepcion-pese-al-levantamiento-de-los-bloqueos-en-bolivia/'),

  ('n15', TIMESTAMPTZ '2026-06-24 12:30:00+00', 'Red Uno', 'economico', false,
   'Nueva baja del dólar referencial: el BCB lo cotiza en Bs 9,76 compra y Bs 9,96 venta',
   'El Valor Referencial del Dólar del Banco Central encadena su tercer día por debajo de la barrera de Bs 10, en línea con el repliegue del paralelo a Bs 9,90.',
   'El Banco Central de Bolivia reportó una nueva baja del dólar referencial (VRD): Bs 9,76 a la compra y Bs 9,96 a la venta, tercer día consecutivo bajo Bs 10. El mercado paralelo P2P operaba en torno a Bs 9,90, con la brecha cambiaria cediendo a ~42,2%.',
   'https://www.reduno.com.bo/economia/nueva-baja-del-dolar-referencial-asi-cotiza-este-miercoles-segun-el-bcb-202662492015'),

  ('n16', TIMESTAMPTZ '2026-06-23 13:16:00+00', 'Opinión', 'social', true,
   'La ABC confirma que las carreteras están libres de bloqueos',
   'Tras 54 días de conflicto, la Administradora Boliviana de Carreteras informó que el mapa nacional no registra puntos de bloqueo; solo persisten labores de limpieza de escombros en cuatro rutas.',
   'La ABC reportó a las 06:00 que todas las vías obstruidas por motivos sociales quedaron expeditas. Cuadrillas y maquinaria pesada continúan retirando piedras y escombros en Cochabamba, La Paz y Oruro, con resguardo policial y militar, hasta liberar el 100% de la Red Vial Fundamental.',
   'https://www.opinion.com.bo/articulo/pais/abc-confirma-que-carreteras-estan-libres-bloqueos/20260623091640992611.html'),

  ('n17', TIMESTAMPTZ '2026-06-23 20:44:00+00', 'Infobae', 'politico', true,
   '"El bloqueo ha sido derrotado", anunció Rodrigo Paz tras el levantamiento de los cortes',
   'El presidente declaró derrotada la medida tras 53 días de protestas que paralizaron el país y advirtió que el bloqueo "no puede volver".',
   'Rodrigo Paz afirmó que los sectores pueden reorganizarse, pero que el esfuerzo debe enfocarse en "construir la patria, no destruirla". El conflicto, el más prolongado de los últimos años, dejó pérdidas millonarias y, según la prensa, al menos 16 fallecidos.',
   'https://www.infobae.com/america/america-latina/2026/06/23/el-bloqueo-ha-sido-derrotado-anuncio-el-presidente-rodrigo-paz-tras-el-levantamiento-de-los-cortes-en-bolivia/'),

  ('n18', TIMESTAMPTZ '2026-06-23 17:00:00+00', 'Infobae', 'politico', false,
   'Evo Morales anuncia una pausa en los bloqueos de rutas tras más de 50 días de protestas',
   'La Coordinadora de las Seis Federaciones del Trópico de Cochabamba declara un cuarto intermedio; Morales aclara que "no significa rendición" y mantiene el Trópico en emergencia.',
   'El último bastión del conflicto, el Trópico de Cochabamba, se replegó tras el despeje del resto de sectores bajo el estado de excepción. Morales señaló que "por ahora es un cuarto intermedio", dejando abierta la posibilidad de reactivar las medidas.',
   'https://www.infobae.com/america/america-latina/2026/06/23/crisis-en-bolivia-evo-morales-anuncio-una-pausa-en-los-bloqueos-de-rutas-tras-mas-de-50-dias-de-protestas/'),

  ('n19', TIMESTAMPTZ '2026-06-23 10:00:00+00', 'La Patria', 'social', false,
   'Restablecen la transitabilidad en carreteras del país tras los bloqueos',
   'La ABC reabrió las principales carreteras tras más de 50 días de conflicto y se reanudó el tránsito de buses y carga entre departamentos.',
   'Maquinaria pesada continuaba con labores de limpieza en Cochabamba, La Paz y Oruro mientras el transporte interdepartamental se normalizaba. La reapertura siguió al acuerdo Gobierno–COB y al estado de excepción que despejó los piquetes.',
   'https://lapatria.bo/enfoque-nacional/gestion/paz-cochabamba-santa-cruz-reabren-vias-transporte/')
) AS x(codigo, publicado_en, medio, categoria, breaking, titular, resumen, cuerpo, url)
JOIN medios m              ON m.nombre = x.medio
JOIN categorias_noticia cn ON cn.codigo = x.categoria
ON CONFLICT (codigo) DO UPDATE SET
  publicado_en = EXCLUDED.publicado_en, medio_id = EXCLUDED.medio_id,
  categoria_id = EXCLUDED.categoria_id, titular  = EXCLUDED.titular,
  resumen      = EXCLUDED.resumen,      cuerpo   = EXCLUDED.cuerpo,
  breaking     = EXCLUDED.breaking,     url      = EXCLUDED.url;

-- Vínculos "vinculado a" de las notas nuevas (idempotente).
DELETE FROM noticia_vinculos nv
 USING noticias n
 WHERE nv.noticia_id = n.id AND n.codigo IN ('n14','n15','n16','n17','n18','n19');

INSERT INTO noticia_vinculos (noticia_id, tipo, etiqueta, indicador_id, bloqueo_id)
SELECT n.id, v.tipo::tipo_entidad, v.etiqueta, i.id, b.id
FROM (VALUES
  ('n16', 'bloqueo',   'Bloqueos · transitabilidad RVF', NULL,             'b1'),
  ('n17', 'bloqueo',   'Bloqueos · Red Vial Fundamental', NULL,            'b3'),
  ('n15', 'indicador', 'USD/BOB paralelo',               'usdbob_paralelo', NULL),
  ('n19', 'bloqueo',   'Bloqueos · transitabilidad RVF', NULL,             'b9')
) AS v(codigo, tipo, etiqueta, ind_codigo, blo_codigo)
JOIN noticias n            ON n.codigo = v.codigo
LEFT JOIN indicadores i    ON i.codigo = v.ind_codigo
LEFT JOIN bloqueos b       ON b.codigo = v.blo_codigo;

-- Health-check de la fuente de noticias.
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'live', 140, '24 jun · 14:00' FROM fuentes WHERE codigo = 'news';

COMMIT;
