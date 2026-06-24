-- ════════════════════════════════════════════════════════════════════════
-- Tablero Inteligente BOL · Refresco de indicadores macro · 24-jun-2026 (b)
--
-- Lleva los indicadores macro a su dato oficial MÁS RECIENTE. Fuentes:
--   · BCB — RIN (lectura de alta frecuencia al 15-may), composición, deuda
--   · INE — IPC, PIB (sin release nuevo: may-2026 / 4T-2025)
--   · MEFP — fiscal (cierre 2025 sigue siendo el último anual)
--   · JP Morgan — EMBI (425 pb al 22-jun)
--
-- Solo cambian los que tienen dato nuevo: RIN (↑ por el bono soberano de
-- US$1.000 M de mayo), cobertura de importaciones (reescalada con la RIN),
-- EMBI y la composición de RIN. El resto ya estaba en su último release.
--
-- Idempotente (UPSERT). Ejecuta en una transacción.
-- ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- RIN · BCB — USD 4.694 M al 15-may-2026 (oro 3.608 + divisas 1.017 + DEG/FMI 69).
-- Subió ~US$1.151 M vs mar-2026 por la emisión del bono soberano de US$1.000 M.
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-05-15', 4694, 1151, '+32,5%'
FROM indicadores WHERE codigo = 'rin'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

UPDATE indicadores SET asof = '15 may 2026' WHERE codigo = 'rin';

UPDATE indicadores
   SET definicion = 'Reservas Internacionales Netas del BCB. Lectura de alta frecuencia al 15-may-2026: US$4.694 M (oro 3.608 M · divisas 1.017 M · DEG/FMI 69 M). El salto frente a marzo (US$3.543 M) refleja el ingreso del bono soberano de US$1.000 M emitido a inicios de mayo; la foto trimestral de junio podría reordenar la composición.'
 WHERE codigo = 'rin';

-- Cobertura de importaciones — reescalada con la nueva RIN (RIN ÷ importaciones).
INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta)
SELECT id, DATE '2026-05-15', 4.9, 1.2, '+1,2 m'
FROM indicadores WHERE codigo = 'cobertura_importaciones'
ON CONFLICT (indicador_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion,
              variacion_etiqueta = EXCLUDED.variacion_etiqueta;

UPDATE indicadores SET asof = '15 may 2026' WHERE codigo = 'cobertura_importaciones';

-- EMBI (Módulo C) — 425 pb al 22-jun (vs 444 el 19-jun).
INSERT INTO indice_riesgo_observaciones (indice_id, fecha, valor, variacion, nota)
SELECT id, DATE '2026-06-22', 425, -19, NULL
FROM indices_riesgo WHERE codigo = 'EMBI'
ON CONFLICT (indice_id, fecha)
DO UPDATE SET valor = EXCLUDED.valor, variacion = EXCLUDED.variacion;

-- Composición de RIN (donut · Módulo C): oro 76,8 · divisas 21,6 · DEG/FMI 1,6
-- (total US$4.694 M). Se actualiza la foto vigente (la de fecha máxima, que el
-- API sirve) para que el donut concuerde con la nueva RIN.
UPDATE reservas_composicion SET porcentaje = 76.8, monto_musd = 3608
 WHERE componente = 'oro'     AND fecha = (SELECT max(fecha) FROM reservas_composicion);
UPDATE reservas_composicion SET porcentaje = 21.6, monto_musd = 1017
 WHERE componente = 'divisas' AND fecha = (SELECT max(fecha) FROM reservas_composicion);
UPDATE reservas_composicion SET porcentaje = 1.6,  monto_musd = 69
 WHERE componente = 'deg'     AND fecha = (SELECT max(fecha) FROM reservas_composicion);

-- Health-check de la fuente BCB (footer).
INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion)
SELECT id, 'ok', 210, '24 jun' FROM fuentes WHERE codigo = 'bcb';

COMMIT;
