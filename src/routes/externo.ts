// Módulo Externo & Deuda — commodities + deuda + balanza + servicio + combustibles.

import type { FastifyInstance } from 'fastify';
import { query } from '../db.ts';

interface CommodityRow {
  codigo: string;
  nombre: string;
  unidad: string;
  valor: number;
  var_mensual: number | null;
  var_anual: number | null;
  polaridad: 'up' | 'down' | 'none';
  fuente: string | null;
  asof: string | null;
  nota: string | null;
}

interface MetricaRow {
  clave: string;
  valor: number | null;
  valor_texto: string | null;
  unidad: string | null;
  asof: string | null;
  fuente: string | null;
  nota: string | null;
}

export function registerExterno(app: FastifyInstance): void {
  app.get('/api/externo', async () => {
    const [commodities, metricas, obs] = await Promise.all([
      query<CommodityRow>(`SELECT * FROM commodities ORDER BY id`),
      query<MetricaRow>(`SELECT * FROM externo_metricas`),
      // serie de cada commodity (la ingesta guarda cierres diarios) para el modal
      query<{ codigo: string; f: string; v: number }>(
        `SELECT c.codigo, to_char(o.fecha, 'YYYY-MM-DD') AS f, o.valor AS v
           FROM commodity_observaciones o JOIN commodities c ON c.id = o.commodity_id ORDER BY c.codigo, o.fecha`,
      ),
    ]);
    const hist: Record<string, { f: string; v: number }[]> = {};
    for (const o of obs) (hist[o.codigo] ??= []).push({ f: o.f, v: o.v });
    const M = Object.fromEntries(metricas.map((m) => [m.clave, m]));
    const valOf = (k: string) => M[k]?.valor ?? null;
    const srcOf = (k: string) => M[k]?.fuente ?? '';
    const asofOf = (k: string) => M[k]?.asof ?? '';

    return {
      commodities: commodities.map((c) => ({
        id: c.codigo,
        label: c.nombre,
        value: c.valor,
        unit: c.unidad,
        chgMensual: c.var_mensual,
        chgAnual: c.var_anual,
        polarity: c.polaridad,
        source: c.fuente,
        asof: c.asof,
        nota: c.nota ?? undefined,
        history: hist[c.codigo] ?? [],
      })),
      deuda: {
        externaStock: valOf('deuda_externa_stock'),
        externaPct: valOf('deuda_externa_pct'),
        totalPct: valOf('deuda_total_pct'),
        asof: asofOf('deuda_externa_pct'),
        source: srcOf('deuda_externa_pct'),
      },
      balanza: {
        exportaciones: valOf('balanza_export'),
        importaciones: valOf('balanza_import'),
        saldo: valOf('balanza_saldo'),
        periodo: M['balanza_periodo']?.valor_texto ?? asofOf('balanza_export'),
        source: srcOf('balanza_export'),
      },
      combustibles: {
        especial: valOf('comb_especial'),
        premium: valOf('comb_premium'),
        diesel: valOf('comb_diesel'),
        nota: M['comb_diesel']?.nota ?? '',
        source: srcOf('comb_diesel'),
      },
      servicio: {
        y2026: valOf('servicio_2026'),
        y2027: valOf('servicio_2027'),
        y2028: valOf('servicio_2028'),
        source: srcOf('servicio_2026'),
      },
      analitica: {
        gasExportUsd: valOf('gas_export_usd'),
        gasExportPeriodo: asofOf('gas_export_usd'),
        gasExportVar: (() => {
          const m = (M['gas_export_usd']?.nota ?? '').match(/(-?[\d.]+)%/);
          return m ? Number(m[1]) : null;
        })(),
        ccPct: valOf('cuenta_corriente_pct'),
        ccUsd: valOf('cuenta_corriente_usd'),
        ccPeriodo: asofOf('cuenta_corriente_usd'),
        remesasUsd: valOf('remesas_usd'),
        remesasPeriodo: asofOf('remesas_usd'),
        bolivianizacion: valOf('bolivianizacion'),
        bolivPeriodo: asofOf('bolivianizacion'),
        finMonetarioFlujo: valOf('fin_monetario_bcb_spnf'),
        finMonetarioProg: (() => {
          const m = (M['fin_monetario_bcb_spnf']?.nota ?? '').match(/(-?[\d.]+)/);
          return m ? Number(m[1]) : null;
        })(),
        finMonetarioPeriodo: asofOf('fin_monetario_bcb_spnf'),
        fmiEstado: asofOf('fmi_monto'),
        fmiMonto: valOf('fmi_monto'),
        fmiNota: M['fmi_monto']?.nota ?? '',
        source: srcOf('gas_export_usd') || srcOf('remesas_usd'),
      },
    };
  });
}
