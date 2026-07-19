-- ════════════════════════════════════════════════════════════════════════
-- Tablero Inteligente BOL · Actualización al 19-jul-2026 (domingo)
--
-- Primer refresco completo BAJO EL RÉGIMEN CAMBIARIO FLEXIBLE (arrancó 29-jun).
-- Cubre 3 semanas (29-jun → 18-jul). Novedades de titular:
--   • TCO oficial flexible del BCB: Bs 10,85 al 17-jul (desde 9,73 el 29-jun,
--     +11,5%); vs el antiguo fijo 6,96 es +55,9%. Referencial de venta = TCO+0,10.
--   • Paralelo (~10,75) convergió al oficial: la BRECHA colapsó de ~42% a ≈0.
--   • El "dólar referencial"/VRD fue absorbido por el TCO (ya no se publica aparte).
--   • IPC junio: 9,23% interanual (desde 12,51% en mayo, efecto base), 2,15% m,
--     4,82% acumulado 1S (INE, 7-jul).
--   • Balanza comercial mayo: superávit US$ 37 M (exportaciones caen por bloqueos).
--   • Exportaciones de gas −39,8% a/a (ene–may): US$ 283,8 M (INE).
--   • Deuda externa a mayo: US$ 14.418,1 M (+988 M vs marzo). Servicio 2026 ~2.007 M.
--   • Cuenta corriente: giro a superávit US$ 783 M en 1T-2026. Remesas 2025: 1.259 M.
--   • Riesgo país: ~424 pb (30-jun) → ~400 pb (10-jul).
--   • DS 5652 (9-jul) congela combustibles con fórmula ligada al TC (subvención sólo
--     si el TCO supera Bs 10,40) + Bs 1.000 M a YPFB. DS 5644 abre importación privada.
--   • FMI: misión en La Paz (17-18 jul), sin acuerdo cerrado. EFF ~US$ 3.000-3.300 M.
-- Fuentes: BCB (TCO/DEPEX/BOP/PM), INE, ASFI, MEFP, YPFB, Trading Economics y prensa.
-- Idempotente. Transacción. RIN: ver sección C (sin release oficial nuevo).
-- ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── A · CLÚSTER CAMBIARIO — régimen flexible (trayectoria 29-jun → 18-jul) ──

-- A.1 · TCO oficial (BCB): promedio ponderado diario de las compras de la banca.
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-29', 9.73,  NULL::numeric, NULL::text),
  (DATE '2026-07-03', 9.83,  NULL::numeric, NULL::text),
  (DATE '2026-07-08', 9.96,  NULL::numeric, NULL::text),
  (DATE '2026-07-09', 10.10, NULL::numeric, NULL::text),
  (DATE '2026-07-10', 10.24, NULL::numeric, NULL::text),
  (DATE '2026-07-14', 10.50, NULL::numeric, NULL::text),
  (DATE '2026-07-15', 10.70, NULL::numeric, NULL::text),
  (DATE '2026-07-17', 10.85, 11.5,          '+11,5%')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'usdbob_oficial'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- A.2 · Paralelo (P2P informal): converge al oficial.
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-07-01', 9.94,  NULL::numeric, NULL::text),
  (DATE '2026-07-05', 9.98,  NULL::numeric, NULL::text),
  (DATE '2026-07-07', 10.01, NULL::numeric, NULL::text),
  (DATE '2026-07-09', 10.34, NULL::numeric, NULL::text),
  (DATE '2026-07-10', 10.60, NULL::numeric, NULL::text),
  (DATE '2026-07-14', 10.51, NULL::numeric, NULL::text),
  (DATE '2026-07-16', 10.63, NULL::numeric, NULL::text),
  (DATE '2026-07-18', 10.75, 8.8,           '+8,8%')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'usdbob_paralelo'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- A.3 · Brecha paralelo/oficial: colapsa de 42% a ≈0 (unificación de facto).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT i.id, x.fecha, x.valor, x.variacion, x.etq
FROM indicadores i
JOIN (VALUES
  (DATE '2026-06-29', 1.6,  NULL::numeric, NULL::text),
  (DATE '2026-07-03', 1.3,  NULL::numeric, NULL::text),
  (DATE '2026-07-09', 2.4,  NULL::numeric, NULL::text),
  (DATE '2026-07-10', 3.5,  NULL::numeric, NULL::text),
  (DATE '2026-07-14', 0.1,  NULL::numeric, NULL::text),
  (DATE '2026-07-17', -0.9, -42.9,         '−42,9 pp')
) AS x(fecha, valor, variacion, etq) ON i.codigo = 'brecha'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- A.4 · VRD: absorbido por el TCO; se refleja el referencial de venta (TCO + 0,10).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-07-17', 10.95, 10.3, '+10,3%'
FROM indicadores WHERE codigo = 'vrd'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

-- A.5 · Brecha paralelo/VRD: prácticamente nula/negativa.
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-07-17', -1.8, -1.3, '−1,3 pp'
FROM indicadores WHERE codigo = 'brecha_vrd'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;

UPDATE indicadores SET asof = '17 jul · TCO' WHERE codigo = 'usdbob_oficial';
UPDATE indicadores SET asof = '18 jul'        WHERE codigo = 'usdbob_paralelo';
UPDATE indicadores SET asof = '17 jul'        WHERE codigo IN ('vrd','brecha','brecha_vrd');

-- ── B · IPC — junio 2026 (INE, publicado 7-jul) ─────────────────────────
-- Interanual baja a 9,23% (efecto base: sale de la ventana un mes de 2025 con
-- inflación mensual alta) pese a inflación mensual positiva (2,15%).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta, var_mensual)
SELECT id, DATE '2026-06-30', 9.23, -3.28, '−3,3 pp', 2.15
FROM indicadores WHERE codigo = 'ipc'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta, var_mensual = EXCLUDED.var_mensual;
UPDATE indicadores SET asof = '07 jul' WHERE codigo = 'ipc';

-- ── C · RIN — al 31-may-2026 (BCB, planilla oficial por componentes) ─────
-- Último dato OFICIAL con desglose: US$ 4.546,8 M (oro 3.580,6 · divisas 897,5 ·
-- DEG 33,1 · tramo FMI 35,6). El 4.694/4.819 fue el PICO del 14-15 may por el bono
-- soberano; a fin de mayo bajó a 4.547. El Programa Monetario de junio del BCB
-- registra un drenaje de −525 M en junio (importación de combustibles, intervención
-- cambiaria, pago de deuda), dejando el nivel efectivo de julio en ~3.600 M con
-- ~671 M líquidos (estimación de prensa, no oficial).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-05-31', 4546.8, 22.7, '+22,7%'
FROM indicadores WHERE codigo = 'rin'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;
UPDATE indicadores SET asof = '31 may 2026' WHERE codigo = 'rin';

-- Cobertura de importaciones (derivado RIN/importaciones ~US$ 950 M).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-05-31', 4.8, -0.1, '−0,1 m'
FROM indicadores WHERE codigo = 'cobertura_importaciones'
ON CONFLICT (indicador_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, variacion_etiqueta = EXCLUDED.variacion_etiqueta;
UPDATE indicadores SET asof = '31 may 2026' WHERE codigo = 'cobertura_importaciones';

-- ── C2 · DEUDA EXTERNA — stock a mayo 2026 (BCB DEPEX) ───────────────────
-- Sube a US$ 14.418,1 M (+988 M vs marzo) por la emisión de bonos. El % del PIB
-- oficial más reciente sigue siendo 24,3% (marzo); a mayo el BCB lo cifra en ~¼.
UPDATE externo_metricas SET valor = 14418.1, asof = 'may 2026',
       nota = 'Multilateral 70,6% · bonos 15,9% · bilateral 13,2%. +988 M vs marzo por emisión soberana.'
 WHERE clave = 'deuda_externa_stock';
UPDATE externo_metricas SET asof = 'may 2026' WHERE clave = 'deuda_externa_pct';

-- ── D · EMBI / riesgo país (JPMorgan agg., vía prensa) ──────────────────
INSERT INTO indice_riesgo_observaciones (indice_id, fecha, valor, variacion, nota)
SELECT i.id, x.fecha, x.valor, x.variacion, x.nota
FROM indices_riesgo i
JOIN (VALUES
  (DATE '2026-06-30', 424, -1,  'Cierre de 1S; 2º más alto de LatAm tras Venezuela'),
  (DATE '2026-07-10', 400, -24, 'Sigue cediendo con la unificación cambiaria')
) AS x(fecha, valor, variacion, nota) ON i.codigo = 'EMBI'
ON CONFLICT (indice_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion, nota = EXCLUDED.nota;

-- ── E · EXTERNO & DEUDA (analítica) ─────────────────────────────────────
-- Balanza comercial — mayo 2026 (INE): exportaciones se desploman por bloqueos.
UPDATE externo_metricas SET valor = 720, asof = 'mayo 2026' WHERE clave = 'balanza_export';
UPDATE externo_metricas SET valor = 683, asof = 'mayo 2026' WHERE clave = 'balanza_import';
UPDATE externo_metricas SET valor = 37,  asof = 'mayo 2026' WHERE clave = 'balanza_saldo';
UPDATE externo_metricas SET valor_texto = 'mayo 2026', asof = 'mayo 2026' WHERE clave = 'balanza_periodo';

-- Exportación de gas — ene–may 2026 (INE): US$ 283,8 M, −39,8% a/a.
UPDATE externo_metricas SET valor = 283.8, asof = 'ene–may 2026', nota = 'var −39,8% a/a (de 471,3 M). Declive de campos + fin de envíos a Argentina.'
 WHERE clave = 'gas_export_usd';

-- Remesas — 2025 completo (BCB): récord US$ 1.259 M.
UPDATE externo_metricas SET valor = 1259, asof = '2025', nota = 'Récord anual (127 M sólo en julio); 50,5% desde España. 1T-2026: 272 M.'
 WHERE clave = 'remesas_usd';

-- Bolivianización — marzo 2026 (ASFI): ~90% depósitos (99,3% créditos).
UPDATE externo_metricas SET valor = 90, asof = 'mar 2026', nota = 'Depósitos en MN; 99,3% de los créditos. Leve baja vs 92% (abr-2025) por escasez de dólares.'
 WHERE clave = 'bolivianizacion';

-- Cuenta corriente — giro a superávit en 1T-2026 (dato anual 2025 se conserva).
UPDATE externo_metricas SET nota = '1T-2026: superávit US$ 783 M por exportación de minerales (oro/plata) y remesas.'
 WHERE clave = 'cuenta_corriente_usd';

-- Servicio de deuda 2026 — DEPEX marzo: ejecutado 1T + proyectado ≈ US$ 2.007 M.
UPDATE externo_metricas SET valor = 2007, asof = '2026 (proy.)', nota = 'Ejecutado 1T 1.020 M (incl. bono) + abr-dic 986 M. Liquidez servicio/export. 10,1%.'
 WHERE clave = 'servicio_2026';

-- FMI — misión en La Paz (17-18 jul), sin acuerdo cerrado.
UPDATE externo_metricas SET valor = 3000, asof = 'En negociación (jul-2026)',
       nota = 'Programa EFF. Misión en La Paz (17-18 jul) reunida con Gobierno y empresarios; sin acuerdo firmado. Monto en discusión ~US$ 3.000-3.300 M (Paz mencionó hasta 5.000). Condiciones: reducir déficit, unificación cambiaria (ya en marcha) y reforma de subvención a combustibles.'
 WHERE clave = 'fmi_monto';

-- Combustibles — DS 5652 (9-jul): precios congelados con fórmula ligada al TC.
UPDATE externo_metricas SET nota = 'Precios congelados por DS 5652 (9-jul-2026); factor de ajuste ligado al TC: el Estado subvenciona sólo si el TCO supera Bs 10,4003 (hoy 10,85, subvención activa). Hasta Bs 1.000 M para YPFB. El DS 5644 abrió la importación privada a precio de mercado (ej. diésel ~Bs 15,80).'
 WHERE clave = 'comb_diesel';

-- ── F · COMMODITIES — spot al 16-17 jul (Trading Economics) ─────────────
UPDATE commodities SET valor = 4016.95, var_mensual = -4.59,  var_anual = 19.87, asof = '17 jul' WHERE codigo = 'oro';
UPDATE commodities SET valor = 55.90,   var_mensual = -14.86, var_anual = 46.45, asof = '17 jul' WHERE codigo = 'plata';
UPDATE commodities SET valor = 3524.60, var_mensual = -3.19,  var_anual = 24.79, asof = '17 jul' WHERE codigo = 'zinc';
UPDATE commodities SET valor = 53156,   var_mensual = -3.95,  var_anual = 61.01, asof = '16 jul' WHERE codigo = 'estano';
UPDATE commodities SET valor = 2.91,     var_mensual = -9.96,  var_anual = -18.35, asof = '17 jul' WHERE codigo = 'gas_hh';
UPDATE commodities SET valor = 12.05,   var_mensual = 7.28,   var_anual = 17.20, asof = '17 jul' WHERE codigo = 'soya';

-- ── G · NOTICIAS — 29-jun → 18-jul (medios nuevos + feed) ───────────────
INSERT INTO medios (nombre, tipo, pais) VALUES
  ('Los Tiempos', 'nacional', 'BO'),
  ('El Día', 'nacional', 'BO'),
  ('Correo del Sur', 'nacional', 'BO'),
  ('NODAL', 'internacional', 'AR'),
  ('Prensa Mercosur', 'internacional', 'AR'),
  ('Resumen Latinoamericano', 'internacional', 'AR')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO noticias (codigo, publicado_en, medio_id, categoria_id, titular, resumen, cuerpo, breaking, url)
SELECT x.codigo, x.publicado_en, m.id, cn.id, x.titular, x.resumen, x.cuerpo, x.breaking, x.url
FROM (VALUES
  ('n26', TIMESTAMPTZ '2026-06-30 21:00:00+00', 'Infobae', 'politico', false,
   'Rodrigo Paz rechaza el paro judicial y acusa al MAS de fomentar "las viejas prácticas de presión"',
   'El presidente calificó las amenazas de paro y bloqueo como "cosas del pasado" ligadas al MAS y pidió que la reforma judicial se debata en el Parlamento por acuerdo, no por presión.',
   'Paz enmarcó las movilizaciones anunciadas como parte de una lógica de presión que, dijo, el país debe superar. Reiteró su llamado a canalizar la reforma judicial vía la Asamblea Legislativa mediante un acuerdo nacional.',
   'https://www.infobae.com/america/america-latina/2026/07/01/rodrigo-paz-rechazo-el-paro-judicial-y-acuso-al-mas-de-fomentar-las-viejas-practicas-de-presion/'),

  ('n27', TIMESTAMPTZ '2026-07-01 14:00:00+00', 'Visión 360', 'economico', true,
   'Acaba el monopolio: privados podrán importar y vender gasolina y diésel a precio de mercado',
   'El DS 5644 autoriza a privados a importar y comercializar combustibles a precio de mercado (IEHD en cero hasta 2030). Empacar Energy ya ofrecía diésel a Bs 15,80 frente a Bs 9,80 de YPFB.',
   'La medida rompe el monopolio de YPFB en la importación y venta de derivados para aliviar la escasez. Doria Medina la condicionó y Evo Morales la criticó por exponer al país a la volatilidad de los precios internacionales.',
   'https://www.vision360.bo/noticias/2026/07/01/55924-acaba-el-monopolio-privados-competiran-con-ypfb-e-importaran-y-venderan-gasolina-y-diesel-a-precio-de-mercado'),

  ('n28', TIMESTAMPTZ '2026-07-02 15:00:00+00', 'NODAL', 'politico', false,
   'El Gobierno aprueba un paquete de siete decretos sobre combustibles, comercio, electricidad, pensiones y minería',
   'Paz promulgó siete decretos: importación privada de combustibles (5644), rebaja de aranceles en 5 puntos hasta 2027 (5646), banda eléctrica, manual de pensiones por invalidez y anulación de una reserva minera en Potosí.',
   'El paquete busca dinamizar el comercio exterior y la oferta interna en plena transición al tipo de cambio flexible. La rebaja arancelaria apunta a contener precios de importados; la apertura de combustibles a paliar la falta de diésel.',
   'https://www.nodal.am/2026/07/bolivia-el-gobierno-impuso-un-paquete-de-medidas-economicas-sobre-combustibles-comercio-electricidad-pensiones-y-mineria/'),

  ('n29', TIMESTAMPTZ '2026-07-04 16:00:00+00', 'Prensa Mercosur', 'politico', false,
   'Los dos bloqueos más largos del siglo en Bolivia terminan sin lograr sus objetivos',
   'El bloqueo de 53 días impulsado por la COB y sectores afines a Evo Morales terminó por desgaste sin conseguir la renuncia de Paz; analistas lo atribuyen a una agenda partidaria desconectada de las bases.',
   'El balance del conflicto que marcó mayo y junio deja pérdidas económicas millonarias y un costo político para sus promotores. El Gobierno capitalizó el desenlace para avanzar en su agenda económica.',
   'https://prensamercosur.org/2026/07/04/cuando-el-desgaste-se-impone-los-dos-bloqueos-mas-largos-del-siglo-xxi-en-bolivia-no-lograron-sus-objetivos/'),

  ('n30', TIMESTAMPTZ '2026-07-06 12:30:00+00', 'El Día', 'economico', false,
   'La inflación acumulada llega a 4,82% en el primer semestre, con junio al alza por segundo mes',
   'El IPC de junio subió 2,15% mensual (interanual ~9,2%), empujado por alimentos —plátano, carne de res y pollo, tomate—. El Gobierno proyecta 14% para el cierre de 2026.',
   'El INE reportó una inflación semestral de 4,82%. La desaceleración del interanual (desde 12,51% en mayo) responde a un efecto base, mientras la presión mensual sigue concentrada en alimentos por los coletazos de los bloqueos.',
   'https://www.eldia.com.bo/2026-07-06/economia/bolivia-registra-alta-inflacion-por-segundo-mes-consecutivo-y-la-acumulada-en-2026-es-de-482.html'),

  ('n31', TIMESTAMPTZ '2026-07-06 15:00:00+00', 'Correo del Sur', 'economico', false,
   'Las exportaciones de gas caen US$ 187,5 millones entre enero y mayo, según el INE',
   'Las ventas de gas pasaron de US$ 471,3 M (ene-may 2025) a US$ 283,8 M (ene-may 2026), una caída de ~40%, en línea con la nueva y menor certificación de reservas de YPFB.',
   'El desplome confirma el declive estructural del principal generador histórico de divisas del país. La caída de volúmenes y de mercados de exportación agrava la escasez de dólares y refuerza la urgencia de diversificar.',
   'https://correodelsur.com/economia/20260707/ingresos-del-gas-caen-en-187-5-millones-de-dolares.html'),

  ('n32', TIMESTAMPTZ '2026-07-06 18:00:00+00', 'Bloomberg Línea', 'economico', false,
   'Adiós al dólar referencial: así funciona el nuevo tipo de cambio flexible en Bolivia',
   'El BCB calcula un TCO diario según el promedio ponderado de compras de la banca y lo publica cada tarde; los bancos no pueden vender por encima del TCO + Bs 0,10. Economistas advierten que es un esquema administrado, no una flotación limpia.',
   'El nuevo régimen unifica el antiguo oficial fijo (6,96) y el referencial en un solo tipo de cambio de mercado. En su primera semana el TCO subió de 9,73 a 9,83 y la brecha con el paralelo se redujo a menos del 1%.',
   'https://www.bloomberglinea.com/latinoamerica/bolivia/adios-al-dolar-referencial-en-bolivia-asi-funcionara-ahora-el-nuevo-tipo-de-cambio-flexible/'),

  ('n33', TIMESTAMPTZ '2026-07-13 13:00:00+00', 'Infobae', 'economico', true,
   'Bolivia congela el precio de los combustibles por seis meses en medio de la crisis de abastecimiento',
   'El DS 5652 congela diésel, gasolina, gas natural y combustible de aviación hasta enero de 2027 y destina hasta Bs 1.000 millones a YPFB para cubrir el diferencial de importación, buscando aislar al consumidor de la devaluación.',
   'El decreto introduce un factor de ajuste ligado al tipo de cambio: el Estado subvenciona sólo cuando el TCO oficial supera Bs 10,40. Con el oficial en ~10,85, la subvención sigue activa.',
   'https://www.infobae.com/america/2026/07/13/bolivia-congela-el-precio-del-combustible-por-seis-meses-en-medio-de-la-crisis-de-abastecimiento-y-calidad/'),

  ('n34', TIMESTAMPTZ '2026-07-13 21:00:00+00', 'El Diario', 'social', false,
   'Disminuyen las filas por gasolina, pero la escasez de diésel continúa en el país',
   'La gasolina empezó a normalizarse en varias ciudades, pero el diésel seguía escaso con largas filas de transporte pesado y esperas de hasta una semana, calificadas de "críticas" por los dirigentes.',
   'La apertura a la importación privada aún no se traduce en abastecimiento pleno de diésel, el combustible clave para el agro y el transporte de carga. El desabastecimiento presiona costos logísticos y precios de alimentos.',
   'https://www.eldiario.net/portal/2026/07/13/filas-por-gasolina-disminuyen-pero-la-escasez-de-diesel-continua-en-el-pais/'),

  ('n35', TIMESTAMPTZ '2026-07-16 23:00:00+00', 'Infobae', 'economico', false,
   'El dólar de mercado sigue subiendo en Bolivia y se aleja del viejo oficial de Bs 6,96',
   'En la jornada del 16 de julio el dólar de mercado escaló en torno a Bs 10,6 (cerca de +9% en la semana), mientras el TCO del BCB rondaba Bs 10,7-10,9; el histórico oficial de 6,96 quedó prácticamente sin uso.',
   'La cotización de mercado y el TCO oficial se mueven casi en paralelo, confirmando la unificación cambiaria. La demanda de dólares sigue firme por la escasez de divisas líquidas en las reservas.',
   'https://www.infobae.com/noticias/2026/07/16/dolar-hoy-en-bolivia-cotizacion-de-cierre-del-16-de-julio/'),

  ('n36', TIMESTAMPTZ '2026-07-17 12:00:00+00', 'Los Tiempos', 'economico', false,
   'Bolivia se acerca a un escenario crítico: importar gas costaría diez veces más que el precio interno',
   'Según la Fundación Jubileo, la producción de gas cayó ~55% en once años y el Estado subvenciona el 79% del costo interno; si Bolivia pasa de exportador a importador pagaría US$ 14-18/MMBTU frente a ~US$ 1,30 internos.',
   'El informe alerta que la transición de exportador a importador de gas golpearía las cuentas fiscales y externas justo cuando el país enfrenta escasez de dólares y un nuevo régimen cambiario.',
   'https://www.lostiempos.com/actualidad/economia/20260717/bolivia-se-acerca-escenario-critico-importar-gas-costaria-10-veces-mas'),

  ('n37', TIMESTAMPTZ '2026-07-17 17:00:00+00', 'Resumen Latinoamericano', 'economico', false,
   'La misión del FMI se reúne con empresarios en La Paz mientras negocia con el Gobierno',
   'Una misión del FMI se reunió con las principales cámaras empresariales para evaluar el desempeño económico y el clima de inversión, en paralelo a la negociación de un paquete de apoyo financiero con el Ejecutivo.',
   'Las reuniones se dan en el marco de un programa EFF en discusión. El Gobierno insiste en que un acuerdo con el Fondo es clave para financiar el déficit y anclar la estabilidad del nuevo régimen cambiario.',
   'https://www.resumenlatinoamericano.org/2026/07/17/bolivia-en-medio-de-las-negociaciones-con-el-gobierno-el-fmi-se-reune-con-empresarios-en-la-paz'),

  ('n38', TIMESTAMPTZ '2026-07-18 14:00:00+00', 'La Razón', 'economico', true,
   'Lupo: un acuerdo con el FMI es clave para resolver el déficit fiscal',
   'El ministro de la Presidencia, José Luis Lupo, afirmó que un acuerdo con el FMI será determinante para enfrentar el déficit; el problema central, dijo, es el déficit financiado con recursos del BCB, que alimenta la inflación.',
   'Las declaraciones llegan mientras la misión del Fondo cierra su visita a La Paz. El Gobierno anticipa "novedades en las próximas semanas" sobre el programa de financiamiento.',
   'https://larazon.bo/economia-y-empresa/2026/07/18/lupo-senala-que-un-acuerdo-con-el-fmi-es-clave-para-resolver-el-deficit-fiscal/')
) AS x(codigo, publicado_en, medio, categoria, breaking, titular, resumen, cuerpo, url)
JOIN medios m              ON m.nombre = x.medio
JOIN categorias_noticia cn ON cn.codigo = x.categoria
ON CONFLICT (codigo) DO UPDATE SET
  publicado_en = EXCLUDED.publicado_en, medio_id = EXCLUDED.medio_id,
  categoria_id = EXCLUDED.categoria_id, titular  = EXCLUDED.titular,
  resumen      = EXCLUDED.resumen,      cuerpo   = EXCLUDED.cuerpo,
  breaking     = EXCLUDED.breaking,     url      = EXCLUDED.url;

-- Vínculos de noticias a indicadores del tablero.
DELETE FROM noticia_vinculos nv USING noticias n
 WHERE nv.noticia_id = n.id AND n.codigo IN ('n30','n31','n32','n35','n36');
INSERT INTO noticia_vinculos (noticia_id, tipo, etiqueta, indicador_id)
SELECT n.id, 'indicador'::tipo_entidad, 'USD/BOB oficial', i.id
FROM noticias n JOIN indicadores i ON i.codigo = 'usdbob_oficial'
WHERE n.codigo IN ('n32','n35');
INSERT INTO noticia_vinculos (noticia_id, tipo, etiqueta, indicador_id)
SELECT n.id, 'indicador'::tipo_entidad, 'IPC interanual', i.id
FROM noticias n JOIN indicadores i ON i.codigo = 'ipc'
WHERE n.codigo = 'n30';
INSERT INTO noticia_vinculos (noticia_id, tipo, etiqueta, indicador_id)
SELECT n.id, 'indicador'::tipo_entidad, 'Gas natural', i.id
FROM noticias n JOIN indicadores i ON i.codigo = 'gas'
WHERE n.codigo IN ('n31','n36');

-- ── H · Health-check de fuentes (al 19-jul) ─────────────────────────────
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 205, '17 jul · TCO' FROM fuentes WHERE codigo = 'bcb';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 180, '07 jul' FROM fuentes WHERE codigo = 'ine';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'live', 130, '18 jul · 10:00' FROM fuentes WHERE codigo = 'news';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'live', 90, '18 jul' FROM fuentes WHERE codigo = 'p2p';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'live', 260, '17 jul' FROM fuentes WHERE codigo = 'commodities';
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 300, '10 jul' FROM fuentes WHERE codigo = 'embi';

-- ── I · Definiciones actualizadas (régimen flexible + releases de julio) ──
UPDATE indicadores
   SET definicion = 'Tipo de Cambio Oficial (TCO) del BCB bajo el régimen FLEXIBLE vigente desde el 29-jun-2026. Se calcula a diario como promedio ponderado de las compras de dólares de la banca y se publica cada día hábil; el referencial de venta es el TCO + Bs 0,10. Al 17-jul: Bs 10,85 (subió desde 9,73 el 29-jun, +11,5%). Frente al antiguo tipo fijo de Bs 6,96 (2011–jun 2026) es +55,9%. La presión al alza es estructural por la escasez de divisas líquidas.'
 WHERE codigo = 'usdbob_oficial';
UPDATE indicadores
   SET definicion = 'Promedio de cotizaciones P2P (informal). Con el régimen flexible convergió al oficial: ~Bs 10,75 al 18-jul, incluso levemente por debajo del TCO. Desapareció el premio que llegó a ~42% frente al viejo oficial fijo.'
 WHERE codigo = 'usdbob_paralelo';
UPDATE indicadores
   SET definicion = 'Brecha entre el dólar paralelo y el oficial. Con el TCO flexible (que alcanzó al paralelo) colapsó de ~42% a ≈0 (levemente negativa al 17-jul): es la unificación cambiaria de facto.'
 WHERE codigo = 'brecha';
UPDATE indicadores
   SET definicion = 'El Valor Referencial del Dólar del BCB fue absorbido por el TCO: desde el 29-jun ya no se publica un VRD separado. Se muestra el referencial de venta del nuevo régimen (TCO + Bs 0,10 ≈ 10,95 al 17-jul).'
 WHERE codigo = 'vrd';
UPDATE indicadores
   SET definicion = 'Brecha entre el paralelo y el referencial de venta del BCB. Prácticamente nula/negativa bajo el régimen flexible.'
 WHERE codigo = 'brecha_vrd';
UPDATE indicadores
   SET definicion = 'Variación del IPC a doce meses (INE). Junio 2026: interanual 9,23%, mensual 2,15%, acumulado 1S 4,82%. La fuerte baja del interanual (desde 12,51% en mayo) es efecto base; la presión mensual sigue en ALIMENTOS por los coletazos de los bloqueos. El Gobierno proyecta ~14% para el cierre de 2026.'
 WHERE codigo = 'ipc';
UPDATE indicadores
   SET definicion = 'Deuda externa pública: US$ 14.418,1 M a mayo-2026 (+988 M vs marzo por la emisión de bonos soberanos). El último % del PIB oficial es 24,3% (marzo); a mayo el BCB lo cifra en torno a ¼ del PIB. La deuda pública total ronda ~45% del PIB.'
 WHERE codigo = 'deuda_externa';
UPDATE indicadores
   SET definicion = 'Déficit del SPNF: −12,2% del PIB en 2025 (el mayor desde la pandemia). El PGE 2026 reformulado fija una meta de −9,2% del PIB; el FMI y el Gobierno lo señalan como el ancla del ajuste.'
 WHERE codigo = 'fiscal';
UPDATE indicadores
   SET definicion = 'Producción de gas natural: 27,34 mm³/d a dic-2025, en declive estructural (2024 promedió 31,7). Las EXPORTACIONES de gas cayeron −39,8% a/a (US$ 283,8 M ene–may 2026). Reservas certificadas ~3,7 TCF; la prensa ya proyecta a Bolivia como importador.'
 WHERE codigo = 'gas';
UPDATE indicadores
   SET definicion = 'Reservas Internacionales Netas del BCB. Último dato oficial (31-may-2026): US$ 4.546,8 M (oro 3.580,6 M ≈ 79% · divisas líquidas 897,5 M · DEG/FMI 69 M). El pico de 4.819 M (14-may) fue transitorio por el bono soberano de US$ 1.000 M. El Programa Monetario del BCB registra un drenaje de ~US$ 525 M en junio (importación de combustibles, intervención cambiaria y pago de deuda): el nivel efectivo de julio se estima en ~US$ 3.600 M con apenas ~US$ 671 M en divisas líquidas (prensa). Además, ~6,6 t de oro están comprometidas en ventas forward, por lo que la capacidad real de defensa cambiaria es menor que el titular.'
 WHERE codigo = 'rin';
UPDATE indicadores
   SET definicion = 'Reservas en meses de importación (RIN ÷ importaciones ~US$ 950 M): ~4,8 meses con la RIN de mayo (4.547 M). Pero las divisas líquidas (~898 M) cubren menos de 1 mes y, con el drenaje de junio, el colchón usable es aún menor: el grueso de la RIN sigue siendo oro, parte comprometido en forwards.'
 WHERE codigo = 'cobertura_importaciones';

COMMIT;
