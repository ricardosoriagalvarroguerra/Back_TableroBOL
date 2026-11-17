// Fuente INE · comercio exterior (cuadros mensuales 1992 → hoy).
//  · Exportaciones según actividad económica y producto, por año y mes (USD M, FOB):
//    fila TOTAL y fila «Gas Natural»; columnas = meses (fila de años + fila de meses).
//  · Importaciones por año y mes (USD, CIF): filas de gestión y de mes.
// Escribe la balanza mensual (X FOB − M CIF), las exportaciones acumuladas del año,
// las métricas del módulo Externo y las series anuales del Histórico.
import type { PoolClient } from 'pg';
import { getBuffer } from './http.ts';
import { leerHojas, num, type Celda } from './xlsx.ts';
import { enlaceIne, finDeMes, MESES_ES, MES_CORTO } from './ine.ts';
import { upsertObs, recalcularDelta, fijarAsof, fijarExtra, fijarHistorico, pctTxt } from './obs.ts';

const PAG_X = 'https://www.ine.gob.bo/index.php/estadisticas-economicas/comercio-exterior/cuadros-estadisticos-exportaciones/';
const PAG_M = 'https://www.ine.gob.bo/index.php/estadisticas-economicas/comercio-exterior/importaciones-cuadros-estadisticos/';
const DESDE = 2015;

type Mensual = Map<string, number>; // 'YYYY-MM' → valor
const clave = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}`;
const mesDe = (c: Celda) => (typeof c === 'string' ? MESES_ES.indexOf(c.trim().toLowerCase()) + 1 : 0);
const anioDe = (c: Celda) => {
  const v = typeof c === 'number' ? c : typeof c === 'string' ? Number(c.trim().slice(0, 4)) : NaN;
  return Number.isInteger(v) && v >= 1990 && v <= 2100 ? v : 0;
};

/** Exportaciones: { total, gas } mensuales en USD M. */
function parseExport(filas: Celda[][]): { total: Mensual; gas: Mensual } {
  const iMes = filas.findIndex((f) => f.filter((c) => mesDe(c) > 0).length >= 12);
  if (iMes < 1) throw new Error('exportaciones: sin fila de meses');
  const anios = filas[iMes - 1];
  const meses = filas[iMes];
  const etiqueta = (f: Celda[]) => f.find((c): c is string => typeof c === 'string') ?? '';
  const fila = (re: RegExp) => filas.find((f, i) => i > iMes && re.test(etiqueta(f).trim()));
  const tot = fila(/^TOTAL/i);
  const gas = fila(/^Gas Natural/i);
  if (!tot || !gas) throw new Error('exportaciones: faltan las filas TOTAL o Gas Natural');
  const out = { total: new Map(), gas: new Map() } as { total: Mensual; gas: Mensual };
  let anio = 0;
  for (let c = 1; c < meses.length; c++) {
    anio = anioDe(anios[c]) || anio;
    const m = mesDe(meses[c]);
    if (!anio || !m) continue;
    const t = num(tot[c]);
    const g = num(gas[c]);
    if (t != null) out.total.set(clave(anio, m), t);
    if (g != null) out.gas.set(clave(anio, m), g);
  }
  return out;
}

/** Importaciones CIF mensuales en USD M. */
function parseImport(filas: Celda[][]): Mensual {
  const out: Mensual = new Map();
  let anio = 0;
  for (const f of filas) {
    const a = f.slice(0, 3).map(anioDe).find((x) => x) ?? 0;
    const m = f.slice(0, 3).map(mesDe).find((x) => x) ?? 0;
    if (a && !m) {
      anio = a;
      continue;
    }
    if (!anio || !m) continue;
    const nums = f.map(num).filter((v): v is number => v != null);
    if (nums.length >= 1) out.set(clave(anio, m), nums[nums.length - 1] / 1e6); // última columna = CIF
  }
  return out;
}

const suma = (s: Mensual, anio: number, hasta: number) => {
  let t = 0;
  for (let m = 1; m <= hasta; m++) t += s.get(clave(anio, m)) ?? 0;
  return t;
};
const miles = (v: number) => Math.round(v).toLocaleString('es-BO').replace('-', '−');

export async function ingestarComercio(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  const [hx, hm] = await Promise.all([
    getBuffer(await enlaceIne(PAG_X, /Exportaciones según Actividad Económica y Producto por Año y Mes/i)).then(leerHojas),
    getBuffer(await enlaceIne(PAG_M, /Importaciones por Año y Mes/i)).then(leerHojas),
  ]);
  const hojaX = Object.keys(hx).find((n) => /Mes/i.test(n) && /Valor/i.test(n));
  if (!hojaX) throw new Error('exportaciones: falta la hoja mensual de valor');
  const { total: X, gas: G } = parseExport(hx[hojaX]);
  const M = parseImport(hm[Object.keys(hm)[0]]);

  // último mes con exportaciones E importaciones
  const comunes = [...X.keys()].filter((k) => M.has(k)).sort();
  const ult = comunes[comunes.length - 1];
  if (!ult) throw new Error('sin meses comunes entre exportaciones e importaciones');
  const [ua, um] = ult.split('-').map(Number);

  let filas = 0;
  for (const k of comunes) {
    const [a, m] = k.split('-').map(Number);
    if (a < DESDE) continue;
    if (await upsertObs(client, 'balanza_saldo', finDeMes(a, m), Number((X.get(k)! - M.get(k)!).toFixed(1)))) filas++;
  }
  // exportaciones acumuladas del año (un punto por mes: acumulado a ese mes)
  for (const k of comunes) {
    const [a, m] = k.split('-').map(Number);
    if (a < DESDE) continue;
    if (await upsertObs(client, 'exportaciones', finDeMes(a, m), Number(suma(X, a, m).toFixed(1)))) filas++;
  }

  const periodo = um === 1 ? `ene ${ua}` : `ene–${MES_CORTO[um - 1]} ${ua}`;
  const xYtd = suma(X, ua, um);
  const xYtdPrev = suma(X, ua - 1, um);
  const mYtd = suma(M, ua, um);
  const varX = xYtdPrev ? (xYtd / xYtdPrev - 1) * 100 : 0;

  // exportaciones: delta interanual del acumulado
  await client.query(
    `UPDATE indicador_observaciones SET variacion = $2, variacion_etiqueta = $3
      WHERE indicador_id = (SELECT id FROM indicadores WHERE codigo = 'exportaciones') AND fecha = $1`,
    [finDeMes(ua, um), Number(varX.toFixed(2)), `${varX > 0 ? '+' : ''}${Math.round(varX)}%`],
  );
  await fijarAsof(client, 'exportaciones', periodo);
  await recalcularDelta(client, 'balanza_saldo', { minDias: 20, modo: 'abs', unidad: 'M', conFecha: false, asof: false });
  await fijarAsof(client, 'balanza_saldo', `${MES_CORTO[um - 1]} ${ua}`);
  await fijarExtra(client, 'balanza_saldo', periodo.charAt(0).toUpperCase() + periodo.slice(1, periodo.lastIndexOf(' ')), `${xYtd - mYtd >= 0 ? '+' : ''}${miles(xYtd - mYtd)} M`, xYtd - mYtd >= 0 ? 'pos' : 'neg');

  // series anuales del Histórico (años completos + acumulado del año en curso)
  const anual = (s: Mensual, a: number) => suma(s, a, 12);
  const histX: { periodo: string; valor: number }[] = [];
  const histB: { periodo: string; valor: number }[] = [];
  for (let a = DESDE; a < ua; a++) {
    histX.push({ periodo: String(a), valor: Math.round(anual(X, a)) });
    histB.push({ periodo: String(a), valor: Math.round(anual(X, a) - anual(M, a)) });
  }
  histX.push({ periodo: `${ua}*`, valor: Math.round(xYtd) });
  histB.push({ periodo: `${ua}*`, valor: Math.round(xYtd - mYtd) });
  await fijarHistorico(client, 'exportaciones', histX);
  await fijarHistorico(client, 'balanza_saldo', histB);

  // métricas del módulo Externo
  const k = clave(ua, um);
  const met = async (c: string, valor: number | null, unidad: string | null, asof: string, texto: string | null = null, nota: string | null = null) =>
    client.query(
      `INSERT INTO externo_metricas (clave, valor, valor_texto, unidad, asof, fuente, nota) VALUES ($1, $2, $3, $4, $5, 'INE', $6)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, valor_texto = EXCLUDED.valor_texto, unidad = EXCLUDED.unidad,
         asof = EXCLUDED.asof, fuente = EXCLUDED.fuente, nota = COALESCE(EXCLUDED.nota, externo_metricas.nota)`,
      [c, valor, texto, unidad, asof, nota],
    );
  const mesTxt = `${MESES_ES[um - 1]} ${ua}`;
  await met('balanza_export', Number(X.get(k)!.toFixed(1)), 'USD M', mesTxt);
  await met('balanza_import', Number(M.get(k)!.toFixed(1)), 'USD M', mesTxt);
  await met('balanza_saldo', Number((X.get(k)! - M.get(k)!).toFixed(1)), 'USD M', mesTxt);
  await met('balanza_periodo', null, null, mesTxt, mesTxt);
  const gYtd = suma(G, ua, um);
  const gPrev = suma(G, ua - 1, um);
  const varG = gPrev ? (gYtd / gPrev - 1) * 100 : null;
  await met('gas_export_usd', Number(gYtd.toFixed(1)), 'USD M', periodo, null, varG != null ? `var ${varG.toFixed(1)}% a/a` : null);

  return {
    filas,
    mensaje: `comercio ${periodo}: X ${miles(xYtd)} M (${pctTxt(varX)} a/a) · saldo ${miles(xYtd - mYtd)} M · gas ${miles(gYtd)} M`,
  };
}
