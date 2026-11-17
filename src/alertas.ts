// Motor de alertas del tablero: reglas EXPLÍCITAS evaluadas sobre los datos
// vigentes. Es un archivo puro (sin dependencias) y existe idéntico en el front
// (src/alertas.ts) para que la UI funcione también sin backend.
//
// Para adaptar a otro país basta con reemplazar REGLAS; el motor y la regla de
// frescura son genéricos.

export type Nivel = 'alta' | 'media' | 'info';

export interface AlertaKpi {
  id: string;
  label: string;
  value: number;
  delta?: number;
  /** Fecha ISO (YYYY-MM-DD) del último dato. */
  fecha?: string;
  periodicidad?: string;
}

export interface Alerta {
  id: string;
  nivel: Nivel;
  titulo: string;
  detalle: string;
  indicador?: string;
  valor?: number;
  umbral?: number;
}

export interface Contexto {
  kpis: Record<string, AlertaKpi>;
  /** Participación del oro en la RIN (%), si se conoce. */
  oroPct?: number;
  hoy: Date;
}

const c = (v: number, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');

/** Días máximos sin dato nuevo antes de considerarlo desactualizado. */
export const FRESCURA: Record<string, number> = {
  diaria: 4,
  semanal: 10,
  mensual: 45,
  trimestral: 120,
  semestral: 200,
  anual: 400,
};

export function diasDesde(fecha: string | undefined, hoy: Date): number | null {
  if (!fecha) return null;
  const t = Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? Math.floor((hoy.getTime() - t) / 86_400_000) : null;
}

export type Frescura = 'al_dia' | 'rezago' | 'desactualizado';
export function frescura(k: Pick<AlertaKpi, 'fecha' | 'periodicidad'>, hoy: Date): Frescura | null {
  const d = diasDesde(k.fecha, hoy);
  const lim = FRESCURA[k.periodicidad ?? 'mensual'] ?? 45;
  if (d == null) return null;
  return d <= lim ? 'al_dia' : d <= lim * 2 ? 'rezago' : 'desactualizado';
}

type Regla = (ctx: Contexto) => Alerta | null;

// ── Reglas · Bolivia ───────────────────────────────────────────────────
export const REGLAS: Regla[] = [
  // Tipo de cambio fuera de la banda observada desde octubre (11,6–12,2) o salto brusco.
  ({ kpis }) => {
    const k = kpis.usdbob_oficial;
    if (!k) return null;
    if (k.value > 12.3)
      return { id: 'tco_alto', nivel: 'alta', indicador: k.id, valor: k.value, umbral: 12.3, titulo: `TCO en Bs ${c(k.value, 2)}`, detalle: 'Rompe por arriba la banda de 11,6–12,2 de octubre–noviembre: presión cambiaria.' };
    if (k.value < 11.4)
      return { id: 'tco_bajo', nivel: 'media', indicador: k.id, valor: k.value, umbral: 11.4, titulo: `TCO en Bs ${c(k.value, 2)}`, detalle: 'Por debajo de la banda reciente: apreciación o intervención del BCB.' };
    return null;
  },
  ({ kpis }) => {
    const k = kpis.brecha;
    if (!k) return null;
    if (k.value > 5) return { id: 'brecha', nivel: 'alta', indicador: k.id, valor: k.value, umbral: 5, titulo: `Brecha cambiaria de ${c(k.value)}%`, detalle: 'Sobre 5% reaparece el mercado dual: señal de racionamiento de divisas.' };
    if (k.value > 3) return { id: 'brecha', nivel: 'media', indicador: k.id, valor: k.value, umbral: 3, titulo: `Brecha cambiaria de ${c(k.value)}%`, detalle: 'La brecha se abre por encima del rango habitual del régimen flexible (−2% a +3%).' };
    return null;
  },
  ({ kpis }) => {
    const k = kpis.ipc_mensual;
    if (!k || k.value < 1.5) return null;
    const anual = (Math.pow(1 + k.value / 100, 12) - 1) * 100;
    return { id: 'ipc_mensual', nivel: k.value >= 2 ? 'alta' : 'media', indicador: k.id, valor: k.value, umbral: 1.5, titulo: `Inflación mensual de ${c(k.value, 2)}%`, detalle: `Anualizada equivale a ~${Math.round(anual)}%: el traspaso del tipo de cambio y de los combustibles sigue activo.` };
  },
  ({ kpis }) => {
    const k = kpis.embi;
    if (!k) return null;
    if (k.value > 700) return { id: 'embi', nivel: 'alta', indicador: k.id, valor: k.value, umbral: 700, titulo: `Riesgo país en ${k.value} pb`, detalle: 'Sobre 700 pb el mercado internacional queda cerrado para Bolivia.' };
    if (k.value > 450) return { id: 'embi', nivel: 'media', indicador: k.id, valor: k.value, umbral: 450, titulo: `Riesgo país en ${k.value} pb`, detalle: 'Por encima del mínimo de agosto (~400 pb): el mercado sigue cobrando prima por la volatilidad.' };
    return null;
  },
  ({ kpis }) => {
    const k = kpis.pib;
    if (!k || k.value >= 0) return null;
    return { id: 'recesion', nivel: k.value < -2 ? 'alta' : 'media', indicador: k.id, valor: k.value, umbral: 0, titulo: `PIB en ${c(k.value, 2)}%`, detalle: 'La economía está en contracción; FMI y Banco Mundial esperan otra caída en 2027.' };
  },
  ({ oroPct }) => {
    if (oroPct == null || oroPct < 75) return null;
    return { id: 'rin_oro', nivel: 'media', valor: oroPct, umbral: 75, titulo: `${Math.round(oroPct)}% de la RIN es oro`, detalle: 'Las divisas líquidas para defender el tipo de cambio son escasas y dependen del precio del oro.' };
  },
];

/** Regla genérica: indicadores sin dato nuevo según su periodicidad. */
function reglaFrescura({ kpis, hoy }: Contexto): Alerta | null {
  const viejos = Object.values(kpis).filter((k) => frescura(k, hoy) === 'desactualizado');
  if (!viejos.length) return null;
  return {
    id: 'frescura',
    nivel: 'info',
    titulo: `${viejos.length} indicador${viejos.length > 1 ? 'es' : ''} sin dato reciente`,
    detalle: viejos.map((k) => k.label).join(' · '),
  };
}

const ORDEN: Record<Nivel, number> = { alta: 0, media: 1, info: 2 };

export function evaluarAlertas(ctx: Contexto): Alerta[] {
  const out: Alerta[] = [];
  for (const r of [...REGLAS, reglaFrescura]) {
    const a = r(ctx);
    if (a) out.push(a);
  }
  return out.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}
