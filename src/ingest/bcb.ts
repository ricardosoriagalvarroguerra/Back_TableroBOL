// Fuente BCB · Tipo de Cambio Oficial (TCO) del régimen flexible.
// La página pública muestra la última cotización y su fecha de vigencia:
//   «Última cotización Bs 11,70/$us · FECHA DE CORTE: LUNES 16 DE NOVIEMBRE DE 2026
//    · VIGENCIA: MARTES 17 DE NOVIEMBRE DE 2026»
// Se guarda como observación de `usdbob_oficial` en la fecha de VIGENCIA y se
// recalculan el delta, el dato «vs fijo 6,96» y la brecha con el último paralelo.

import type { PoolClient } from 'pg';
import { getText } from './http.ts';
import { upsertObs, recalcularDelta, ultimo, pctTxt } from './obs.ts';

export const URL_TCO = 'https://www.bcb.gob.bo/bcb_tco_publico_ultima_cotizacion.php';
const TC_FIJO = 6.96;
const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7,
  AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

/** Extrae { valor, vigencia (YYYY-MM-DD) } del HTML de la página del TCO. */
export function parseTco(html: string): { valor: number; vigencia: string } {
  const texto = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  const mv = texto.match(/(?:ÚLTIMA|ULTIMA) COTIZACI[ÓO]N\s*BS\s*([\d.,]+)/);
  const mf = texto.match(/VIGENCIA:\s*[A-ZÁÉÍÓÚ]+\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚ]+)\s+DE\s+(\d{4})/);
  if (!mv || !mf) throw new Error('no se encontró la cotización o la vigencia en la página del TCO');
  const valor = Number(mv[1].replace(/\./g, '').replace(',', '.'));
  const mes = MESES[mf[2]];
  if (!Number.isFinite(valor) || valor < 1 || valor > 100 || !mes) {
    throw new Error(`valor o fecha fuera de rango: ${mv[1]} · ${mf[0]}`);
  }
  const vigencia = `${mf[3]}-${String(mes).padStart(2, '0')}-${mf[1].padStart(2, '0')}`;
  return { valor, vigencia };
}

export async function ingestarTco(client: PoolClient): Promise<{ filas: number; mensaje: string; cambio: boolean }> {
  const { valor, vigencia } = parseTco(await getText(URL_TCO));
  const cambio = await upsertObs(client, 'usdbob_oficial', vigencia, valor);
  await recalcularDelta(client, 'usdbob_oficial', { minDias: 14, modo: 'pct' });
  await client.query(
    `UPDATE indicadores SET extra_label = 'vs fijo 6,96', extra_valor = $1, extra_tono = 'neg' WHERE codigo = 'usdbob_oficial'`,
    [pctTxt((valor / TC_FIJO - 1) * 100)],
  );

  // Brecha con el último paralelo disponible (se fecha en la vigencia del TCO).
  const par = await ultimo(client, 'usdbob_paralelo');
  let filas = cambio ? 1 : 0;
  if (par) {
    const brecha = Number(((par.valor / valor - 1) * 100).toFixed(1));
    if (await upsertObs(client, 'brecha', vigencia, brecha)) filas++;
    await recalcularDelta(client, 'brecha', { minDias: 30, modo: 'pp', conFecha: false });
    await client.query(
      `UPDATE indicadores SET extra_label = 'Brecha', extra_valor = $1, extra_tono = 'neutral' WHERE codigo = 'usdbob_paralelo'`,
      [pctTxt(brecha)],
    );
  }
  return { filas, mensaje: `TCO Bs ${valor.toFixed(2).replace('.', ',')} vigente ${vigencia}`, cambio };
}
