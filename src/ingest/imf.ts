// Fuente FMI · World Economic Outlook (API pública del DataMapper).
// Agnóstica del país: descarga los indicadores comparables de la región y los
// guarda en `region_observaciones`. Los años ≥ ANIO_PROYECCION se marcan como
// proyección (el WEO mezcla datos y proyecciones en la misma serie).
//
//   https://www.imf.org/external/datamapper/api/v1/{INDICADOR}
//   (la API ignora el filtro de países en la URL: se filtra aquí)

import type { PoolClient } from 'pg';
import { getJson } from './http.ts';

export const PAISES: { iso: string; nombre: string }[] = [
  { iso: 'ARG', nombre: 'Argentina' },
  { iso: 'BOL', nombre: 'Bolivia' },
  { iso: 'BRA', nombre: 'Brasil' },
  { iso: 'CHL', nombre: 'Chile' },
  { iso: 'COL', nombre: 'Colombia' },
  { iso: 'ECU', nombre: 'Ecuador' },
  { iso: 'PER', nombre: 'Perú' },
  { iso: 'PRY', nombre: 'Paraguay' },
  { iso: 'URY', nombre: 'Uruguay' },
];

/** polaridad: 'up' = un valor más alto es favorable. */
export const INDICADORES_WEO: { id: string; label: string; unidad: string; polaridad: 'up' | 'down' }[] = [
  { id: 'NGDP_RPCH', label: 'Crecimiento del PIB real', unidad: '%', polaridad: 'up' },
  { id: 'PCPIEPCH', label: 'Inflación (dic/dic)', unidad: '%', polaridad: 'down' },
  { id: 'GGXWDG_NGDP', label: 'Deuda pública bruta', unidad: '% PIB', polaridad: 'down' },
  { id: 'GGXCNL_NGDP', label: 'Resultado fiscal', unidad: '% PIB', polaridad: 'up' },
  { id: 'BCA_NGDPD', label: 'Cuenta corriente', unidad: '% PIB', polaridad: 'up' },
  { id: 'LUR', label: 'Desempleo', unidad: '%', polaridad: 'down' },
];

export const ANIO_DESDE = 2015;
export const ANIO_HASTA = 2027;
export const ANIO_PROYECCION = 2026;

type WeoResp = { values?: Record<string, Record<string, Record<string, number>>> };

export async function ingestarFmi(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  const isos = new Set(PAISES.map((p) => p.iso));
  const vintage = `WEO · descargado ${new Date().toISOString().slice(0, 10)}`;
  let filas = 0;
  const faltan: string[] = [];
  for (const ind of INDICADORES_WEO) {
    const data = await getJson<WeoResp>(`https://www.imf.org/external/datamapper/api/v1/${ind.id}`);
    const porPais = data.values?.[ind.id] ?? {};
    for (const iso of isos) {
      const serie = porPais[iso];
      if (!serie) {
        faltan.push(`${ind.id}/${iso}`);
        continue;
      }
      for (const [anioTxt, valor] of Object.entries(serie)) {
        const anio = Number(anioTxt);
        if (!Number.isFinite(valor) || anio < ANIO_DESDE || anio > ANIO_HASTA) continue;
        await client.query(
          `INSERT INTO region_observaciones (pais, indicador, anio, valor, proyeccion, vintage)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (pais, indicador, anio)
           DO UPDATE SET valor = EXCLUDED.valor, proyeccion = EXCLUDED.proyeccion, vintage = EXCLUDED.vintage`,
          [iso, ind.id, anio, valor, anio >= ANIO_PROYECCION, vintage],
        );
        filas++;
      }
    }
  }
  return { filas, mensaje: faltan.length ? `sin serie: ${faltan.join(', ')}` : vintage };
}
