// Lectura de planillas (INE, BCRD) con exceljs: devuelve cada hoja como una
// matriz de valores «planos» (número, texto, fecha) sin fórmulas ni estilos.
import ExcelJS from 'exceljs';

export type Celda = number | string | Date | null;

function plano(v: ExcelJS.CellValue): Celda {
  if (v == null) return null;
  if (typeof v === 'string') return v.normalize('NFC');
  if (typeof v === 'number' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plano(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').normalize('NFC');
    if ('text' in v) return String(v.text);
  }
  return null;
}

export async function leerHojas(buf: Buffer): Promise<Record<string, Celda[][]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: Record<string, Celda[][]> = {};
  wb.eachSheet((ws) => {
    const filas: Celda[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as ExcelJS.CellValue[]; // índice 1-based
      filas.push(vals.slice(1).map(plano));
    });
    out[ws.name] = filas;
  });
  return out;
}

/** Número desde celda (acepta «1.234,5» y «1,234.5»). */
export function num(c: Celda): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  if (typeof c !== 'string') return null;
  const t = c.trim();
  if (!t || /^n\/?a$/i.test(t)) return null;
  const norm = /,\d{1,3}$/.test(t) && !/\.\d{1,3}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const v = Number(norm);
  return Number.isFinite(v) ? v : null;
}
