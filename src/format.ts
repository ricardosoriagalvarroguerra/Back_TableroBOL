// Helpers de formato (es-BO) compartidos por las rutas.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Date | ISO string → "27 may". */
export function fechaCorta(d: Date | string | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getUTCDate()} ${MESES[date.getUTCMonth()]}`;
}

/** Número con coma decimal: 64.1 → "64,1". */
export function esNum(n: number, dec = 1): string {
  return n.toFixed(dec).replace('.', ',');
}

/** Porcentaje con signo: 64.1 → "+64,1%". */
export function pct(n: number, dec = 1): string {
  const s = n > 0 ? '+' : '';
  return `${s}${esNum(n, dec)}%`;
}
