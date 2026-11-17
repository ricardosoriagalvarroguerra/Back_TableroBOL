// Fuente INE · IPC base 2016 (cuadro «Índice General, Variación Mensual,
// Acumulada y a 12 Meses por División»). Hojas 1.2 (mensual) y 1.4 (12 meses): la fila
// «ÍNDICE GENERAL» trae los valores de enero 2018 en adelante, un mes por columna.
import type { PoolClient } from 'pg';
import { getBuffer } from './http.ts';
import { leerHojas, num, type Celda } from './xlsx.ts';
import { enlaceIne, finDeMes, MES_CORTO } from './ine.ts';
import { upsertObs, recalcularDelta, fijarAsof, fijarExtra, pctTxt } from './obs.ts';

export const PAGINA_IPC = 'https://www.ine.gob.bo/index.php/nacional/';
const ANIO_INICIO = 2018;

function serieGeneral(filas: Celda[][]): number[] {
  const fila = filas.find((f) => f.some((c) => typeof c === 'string' && /^\s*ÍNDICE GENERAL/i.test(c)));
  if (!fila) throw new Error('sin fila ÍNDICE GENERAL');
  const i = fila.findIndex((c) => typeof c === 'string' && /ÍNDICE GENERAL/i.test(c));
  return fila.slice(i + 1).map(num).filter((v): v is number => v != null);
}

export async function ingestarIpc(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  const hojas = await leerHojas(await getBuffer(await enlaceIne(PAGINA_IPC, /^Índice General, Variación Mensual, Acumulada y a 12 Meses por División$/i)));
  const hoja = (re: RegExp) => {
    const k = Object.keys(hojas).find((n) => re.test(n));
    if (!k) throw new Error(`falta la hoja ${re.source}`);
    return hojas[k];
  };
  const mensual = serieGeneral(hoja(/1\.2/));
  const anual = serieGeneral(hoja(/1\.4/));
  if (mensual.length < 12 || anual.length !== mensual.length) throw new Error(`series inconsistentes (${mensual.length}/${anual.length})`);

  let filas = 0;
  let fecha = '';
  for (let i = 0; i < anual.length; i++) {
    const anio = ANIO_INICIO + Math.floor(i / 12);
    const mes = (i % 12) + 1;
    fecha = finDeMes(anio, mes);
    if (await upsertObs(client, 'ipc', fecha, Number(anual[i].toFixed(2)))) filas++;
    if (await upsertObs(client, 'ipc_mensual', fecha, Number(mensual[i].toFixed(2)))) filas++;
  }
  const n = anual.length - 1;
  const etq = `${MES_CORTO[n % 12]} ${ANIO_INICIO + Math.floor(n / 12)}`;
  await recalcularDelta(client, 'ipc', { minDias: 20, modo: 'pp', dec: 2, conFecha: false, asof: false });
  await recalcularDelta(client, 'ipc_mensual', { minDias: 20, modo: 'pp', dec: 2, conFecha: false, asof: false });
  await fijarAsof(client, 'ipc', etq);
  await fijarAsof(client, 'ipc_mensual', etq);
  await fijarExtra(client, 'ipc', 'Mensual', pctTxt(mensual[n], 2), mensual[n] > 0 ? 'neg' : 'pos');
  return { filas, mensaje: `IPC ${etq}: ${anual[n].toFixed(2)}% i/a · ${mensual[n].toFixed(2)}% m/m` };
}
