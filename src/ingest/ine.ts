// Utilidades para el INE: las planillas viven en nube.ine.gob.bo con enlaces de
// descarga que el INE renueva al publicar. En cada corrida se lee la página del
// cuadro y se toma el enlace que sigue a su etiqueta (no se fijan IDs a mano).
import { getText } from './http.ts';

/** Enlaces de nube.ine.gob.bo de la página con la etiqueta que los acompaña (el texto que sigue al enlace). */
export async function enlacesIne(pagina: string): Promise<{ url: string; etiqueta: string }[]> {
  const html = await getText(pagina);
  const re = /https:\/\/nube\.ine\.gob\.bo\/index\.php\/s\/([A-Za-z0-9]+)/g;
  const out: { url: string; etiqueta: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const despues = html.slice(m.index, m.index + 1500);
    const fin = despues.search(/nube\.ine\.gob\.bo\/index\.php\/s\//g) > 0 ? despues.slice(30).search(/<a\b/i) + 30 : despues.length;
    const etiqueta = despues
      .slice(0, fin)
      .replace(/^[^>]*>/, '') // resto de la etiqueta <a …>
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#8211;/g, '–')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ url: `https://nube.ine.gob.bo/index.php/s/${m[1]}/download`, etiqueta });
  }
  return out;
}

/** Enlace de descarga cuya etiqueta cumple `etiqueta`. */
export async function enlaceIne(pagina: string, etiqueta: RegExp): Promise<string> {
  const e = (await enlacesIne(pagina)).find((x) => etiqueta.test(x.etiqueta));
  if (!e) throw new Error(`no se encontró el enlace «${etiqueta.source}» en ${pagina}`);
  return e.url;
}

export const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Último día del mes (YYYY-MM-DD). */
export function finDeMes(anio: number, mes1: number): string {
  const d = new Date(Date.UTC(anio, mes1, 0));
  return d.toISOString().slice(0, 10);
}
