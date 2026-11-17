// Fuente: titulares en vivo por RSS.
//  · Google News (búsquedas sobre Bolivia: economía, política, sociedad), que
//    agrega medios nacionales e internacionales con enlace a la nota original.
//  · ABC (notas de prensa: transitabilidad y cortes de ruta) y eju.tv.
// Clasifica cada titular por reglas de palabras clave, evita duplicados y
// conserva sólo los RECIENTES más nuevos (las noticias curadas del seed se mantienen).
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { getText } from './http.ts';

const GN = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=BO&ceid=BO:es-419`;
const FEEDS: { url: string; medio?: string }[] = [
  { url: GN('Bolivia economía when:7d') },
  { url: GN('Bolivia gobierno Rodrigo Paz when:7d') },
  { url: GN('Bolivia bloqueos OR protestas OR COB when:7d') },
  { url: GN('Bolivia FMI OR dólar OR inflación when:7d') },
  { url: 'https://www.abc.gob.bo/feed/', medio: 'ABC' },
  { url: 'https://www.eju.tv/feed/', medio: 'eju.tv' },
];
const MAX_AUTO = 40; // titulares automáticos que se conservan
const DIAS = 10;

const INTERNACIONALES = /Reuters|Bloomberg|Infobae|EFE|AP News|AFP|Al Jazeera|El País|BBC|CNN|France 24|DW|Swissinfo|Rio Times|América Economía|Prensa Latina/i;

const REGLAS: [RegExp, string][] = [
  [/bloque|protest|marcha|paro|huelga|COB|magisterio|maestr|cocaler|conflict|vigilia|cortes? de ruta|transitab/i, 'Social'],
  [/FMI|Banco Mundial|BID|CAF|EE\.?UU|Estados Unidos|Chile|Argentina|Brasil|Perú|internacional|mundial|Mercosur/i, 'Internacional'],
  [/dólar|tipo de cambio|TCO|inflaci|IPC|PIB|exporta|importa|reservas|RIN|déficit|deuda|presupuesto|PGE|combustible|diésel|gasolina|subsidi|YPFB|BCB|banco|econom|precio|salario|bono|impuest|minería|litio|gas/i, 'Económico'],
  [/Paz|Lara|Asamblea|ministr|gobierno|elecci|Evo|Morales|fiscal general|TSE|diputad|senad|polític|ley/i, 'Político'],
];
const categoria = (t: string) => REGLAS.find(([re]) => re.test(t))?.[1] ?? 'Económico';

const desc = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (item: string, t: string) => {
  const m = item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i'));
  return m ? desc(m[1]) : '';
};

interface Item { titular: string; medio: string; url: string; fecha: Date; resumen: string }

function parseRss(xml: string, medioFijo?: string): Item[] {
  const out: Item[] = [];
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []) {
    let titular = tag(item, 'title');
    let medio = medioFijo ?? tag(item, 'source');
    if (!medioFijo && medio && titular.endsWith(` - ${medio}`)) titular = titular.slice(0, -(medio.length + 3));
    const url = tag(item, 'link');
    const fecha = new Date(tag(item, 'pubDate'));
    if (!titular || !url || Number.isNaN(fecha.getTime())) continue;
    const resumen = medioFijo ? tag(item, 'description').slice(0, 280) : '';
    out.push({ titular, medio: medio || 'Prensa', url, fecha, resumen });
  }
  return out;
}

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').slice(0, 90);

export async function ingestarNoticias(client: PoolClient): Promise<{ filas: number; mensaje: string }> {
  const limite = Date.now() - DIAS * 86_400_000;
  const items: Item[] = [];
  const fallas: string[] = [];
  for (const f of FEEDS) {
    // Google News limita ráfagas: una pausa entre búsquedas y un reintento.
    for (let intento = 0; intento < 2; intento++) {
      try {
        items.push(...parseRss(await getText(f.url), f.medio));
        break;
      } catch (err) {
        if (intento === 1) fallas.push(`${new URL(f.url).hostname}: ${(err as Error).message.replace(/^https?:\/\/\S+ → /, '').slice(0, 60)}`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!items.length) throw new Error(`sin titulares (${fallas.join(' · ')})`);

  // sólo Bolivia (los feeds de medios traen otras secciones), recientes y sin repetir
  const vistos = new Set((await client.query<{ titular: string }>(`SELECT titular FROM noticias`)).rows.map((r) => norm(r.titular)));
  const nuevos = items
    .filter((i) => i.fecha.getTime() >= limite && i.fecha.getTime() <= Date.now() + 3_600_000)
    .filter((i) => i.medio === 'ABC' || /Bolivia|bolivian|La Paz|Santa Cruz|Cochabamba|El Alto|BCB|YPFB|COB|Rodrigo Paz/i.test(i.titular + ' ' + i.resumen) || !/eju/.test(i.medio))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .filter((i) => {
      const k = norm(i.titular);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

  let filas = 0;
  for (const i of nuevos) {
    const codigo = 'r' + createHash('sha1').update(i.url).digest('hex').slice(0, 10);
    const tipo = INTERNACIONALES.test(i.medio) ? 'internacional' : 'nacional';
    await client.query(`INSERT INTO medios (nombre, tipo) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING`, [i.medio, tipo]);
    const cat = categoria(i.titular + ' ' + i.resumen);
    await client.query(
      `INSERT INTO categorias_noticia (codigo, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [cat.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), cat],
    );
    const r = await client.query(
      `INSERT INTO noticias (codigo, publicado_en, medio_id, categoria_id, titular, resumen, url)
       VALUES ($1, $2, (SELECT id FROM medios WHERE nombre = $3), (SELECT id FROM categorias_noticia WHERE nombre = $4), $5, $6, $7)
       ON CONFLICT (codigo) DO NOTHING`,
      [codigo, i.fecha.toISOString(), i.medio, cat, i.titular, i.resumen || null, i.url],
    );
    filas += r.rowCount ?? 0;
  }
  // conserva los MAX_AUTO automáticos más recientes
  await client.query(
    `DELETE FROM noticias WHERE codigo LIKE 'r%' AND id NOT IN (
       SELECT id FROM noticias WHERE codigo LIKE 'r%' ORDER BY publicado_en DESC LIMIT $1)`,
    [MAX_AUTO],
  );
  return { filas, mensaje: `${filas} titulares nuevos de ${items.length} leídos${fallas.length ? ` · fallas: ${fallas.join(' · ')}` : ''}` };
}
