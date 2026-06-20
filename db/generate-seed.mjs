// Genera db/seed.sql a partir de los MISMOS datos que usa el frontend
// (src/data/mockData.ts), de modo que la BDR refleje exactamente el tablero.
//
//   node db/generate-seed.mjs   (Node ≥ 22 lee .ts vía type-stripping)
//
// Reemplaza estos INSERT por la ingesta real (BCB/INE/YPFB/ABC/EMBI/RSS) en
// la fase de backend. Las FK se referencian por código vía subconsultas para
// no depender de ids autogenerados.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { KPIS, BLOQUEOS, MERCADOS, NOTICIAS, EVENTOS, FUENTES, EXTERNO } from '../src/data/mockData.ts';
import { HISTORY, PERIODICIDAD } from '../src/data/series.ts';
import { ELECCIONES } from '../src/data/elecciones.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'seed.sql');

// ── helpers ─────────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? 'NULL' : String(v));
const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const sub = (table, col, val) => `(SELECT id FROM ${table} WHERE ${col} = ${q(val)})`;

const lines = [];
const w = (s = '') => lines.push(s);
const section = (t) => { w(); w(`-- ── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`); };

// snapshot temporal de los datos
const NOW = new Date(Date.UTC(2026, 5, 20, 18, 30, 0)); // 20 jun 2026 14:30 BOT
const BASE_DATE = new Date(Date.UTC(2026, 5, 20));

w('-- AUTO-GENERADO por db/generate-seed.mjs — no editar a mano.');
w('-- Datos de demostración (snapshot Bolivia ~14 jun 2026) que reflejan el tablero.');
w('BEGIN;');
w('SET search_path = public;');

// ── departamentos ────────────────────────────────────────────────────────
section('departamentos');
const DEPTS = [
  [1, 'lapaz', 'La Paz', 'BO-L', 'La Paz', -68.1, -15.6],
  [2, 'cochabamba', 'Cochabamba', 'BO-C', 'Cochabamba', -65.8, -17.4],
  [3, 'santacruz', 'Santa Cruz', 'BO-S', 'Santa Cruz de la Sierra', -61.5, -16.8],
  [4, 'oruro', 'Oruro', 'BO-O', 'Oruro', -67.6, -18.7],
  [5, 'potosi', 'Potosí', 'BO-P', 'Potosí', -66.5, -20.6],
  [6, 'tarija', 'Tarija', 'BO-T', 'Tarija', -64.1, -21.7],
  [7, 'chuquisaca', 'Chuquisaca', 'BO-H', 'Sucre', -64.3, -19.9],
  [8, 'beni', 'Beni', 'BO-B', 'Trinidad', -65.0, -14.2],
  [9, 'pando', 'Pando', 'BO-N', 'Cobija', -67.6, -11.4],
];
w('INSERT INTO departamentos (id, codigo, nombre, iso_3166_2, capital, centro_lon, centro_lat) VALUES');
w(DEPTS.map((d) => `  (${d[0]}, ${q(d[1])}, ${q(d[2])}, ${q(d[3])}, ${q(d[4])}, ${num(d[5])}, ${num(d[6])})`).join(',\n') + ';');

// ── fuentes ────────────────────────────────────────────────────────────
section('fuentes');
const FUENTE_META = {
  bcb: ['oficial', 'https://www.bcb.gob.bo/'],
  ine: ['oficial', 'https://www.ine.gob.bo/'],
  ypfb: ['oficial', 'https://www.ypfb.gob.bo/'],
  abc: ['oficial', 'https://www.abc.gob.bo/'],
  embi: ['mercado', null],
  p2p: ['mercado', null],
  news: ['agregador', null],
  rate: ['mercado', null],
  mefp: ['oficial', 'https://www.economiayfinanzas.gob.bo/'],
  commodities: ['mercado', 'https://tradingeconomics.com/'],
};
const fuenteNombre = Object.fromEntries(FUENTES.map((f) => [f.id, f.name]));
fuenteNombre.mefp = 'MEFP · ejecución fiscal';
fuenteNombre.news = 'Agregador noticias';
const fuenteRows = Object.keys(FUENTE_META).map((code) => {
  const [cat, url] = FUENTE_META[code];
  return `  (${q(code)}, ${q(fuenteNombre[code] || code)}, ${q(cat)}, ${q(url)})`;
});
w('INSERT INTO fuentes (codigo, nombre, categoria, url) VALUES');
w(fuenteRows.join(',\n') + ';');

// ── medios ───────────────────────────────────────────────────────────────
section('medios');
const MEDIO_META = {
  Bloomberg: ['internacional', 'US'], Reuters: ['internacional', 'GB'],
  ABI: ['agencia', 'BO'], 'El Deber': ['nacional', 'BO'], 'La Razón': ['nacional', 'BO'],
  'Los Tiempos': ['nacional', 'BO'], 'Página Siete': ['nacional', 'BO'], 'El País Tarija': ['nacional', 'BO'],
  Opinión: ['nacional', 'BO'], Unitel: ['nacional', 'BO'],
  Infobae: ['internacional', 'AR'], 'Bloomberg Línea': ['internacional', 'US'], EFE: ['agencia', 'ES'],
};
const medios = [...new Set(NOTICIAS.map((n) => n.fuente))];
w('INSERT INTO medios (nombre, tipo, pais) VALUES');
w(medios.map((m) => {
  const meta = MEDIO_META[m] || ['nacional', 'BO'];
  return `  (${q(m)}, ${q(meta[0])}, ${q(meta[1])})`;
}).join(',\n') + ';');

// ── categorías de noticia ──────────────────────────────────────────────
section('categorias_noticia');
const catNoticia = [...new Set(NOTICIAS.map((n) => n.tag))];
w('INSERT INTO categorias_noticia (codigo, nombre) VALUES');
w(catNoticia.map((c) => `  (${q(slug(c))}, ${q(c)})`).join(',\n') + ';');

// ── categorías de evento ───────────────────────────────────────────────
section('categorias_evento');
const catEvento = [...new Set(EVENTOS.map((e) => e.tag))];
w('INSERT INTO categorias_evento (codigo, nombre) VALUES');
w(catEvento.map((c) => `  (${q(slug(c))}, ${q(c)})`).join(',\n') + ';');

// ── agencias calificadoras ─────────────────────────────────────────────
section('agencias_calificadoras');
const AG_CODE = { 'Moody’s': 'moodys', 'S&P': 'sp', 'Fitch': 'fitch' };
w('INSERT INTO agencias_calificadoras (codigo, nombre) VALUES');
w(MERCADOS.ratings.map((r) => `  (${q(AG_CODE[r.agencia] || slug(r.agencia))}, ${q(r.agencia)})`).join(',\n') + ';');

// ── bonos soberanos ────────────────────────────────────────────────────
section('bonos_soberanos');
const BONO_META = {
  BOL28: [4.5, '2028-03-20'],
  BOL30: [7.5, '2030-03-13'],
  BOL31: [9.45, '2031-05-07'],
};
w('INSERT INTO bonos_soberanos (codigo, nombre, cupon, vencimiento) VALUES');
w(MERCADOS.bonos.map((b) => {
  const [cupon, venc] = BONO_META[b.id] || [null, null];
  return `  (${q(b.id)}, ${q(b.name)}, ${num(cupon)}, ${q(venc)})`;
}).join(',\n') + ';');

// ── índices de riesgo ──────────────────────────────────────────────────
section('indices_riesgo');
w("INSERT INTO indices_riesgo (codigo, nombre, unidad) VALUES");
w("  ('EMBI', 'EMBI Bolivia', 'pb'),");
w("  ('CDS5Y', 'CDS soberano 5 años', 'pb');");

// ── rutas (RVF) ────────────────────────────────────────────────────────
section('rutas (Red Vial Fundamental)');
const rutaKey = (s) => s; // full string is unique
const rutaParse = (s) => {
  const i = s.indexOf(' · ');
  return i === -1 ? [s, s] : [s.slice(0, i), s.slice(i + 3)];
};
const rutaMap = new Map(); // fullString -> [codigo, nombre, deptNombre]
for (const b of BLOQUEOS) {
  if (!rutaMap.has(b.ruta)) {
    const [cod, nom] = rutaParse(b.ruta);
    rutaMap.set(b.ruta, [cod, nom, b.dept]);
  }
}
w('INSERT INTO rutas (codigo, nombre, departamento_id) VALUES');
w([...rutaMap.values()]
  .map(([cod, nom, dept]) => `  (${q(cod)}, ${q(nom)}, ${sub('departamentos', 'nombre', dept)})`)
  .join(',\n') + ';');

// ── indicadores ────────────────────────────────────────────────────────
section('indicadores (KPIs macro)');
const IND_META = {
  usdbob_oficial: { cat: 'cambiario', per: 'diaria', fuente: 'bcb', dec: 2, unidad: 'BOB/USD' },
  usdbob_paralelo: { cat: 'cambiario', per: 'diaria', fuente: 'p2p', dec: 2, unidad: 'BOB/USD', base: 'usdbob_oficial' },
  vrd: { cat: 'cambiario', per: 'diaria', fuente: 'bcb', dec: 2, unidad: 'Bs', base: 'usdbob_oficial' },
  brecha: { cat: 'cambiario', per: 'diaria', fuente: 'p2p', dec: 1, unidad: '%' },
  brecha_vrd: { cat: 'cambiario', per: 'diaria', fuente: 'p2p', dec: 1, unidad: '%' },
  rin: { cat: 'monetario', per: 'mensual', fuente: 'bcb', dec: 0, unidad: 'M USD' },
  cobertura_importaciones: { cat: 'monetario', per: 'trimestral', fuente: 'bcb', dec: 1, unidad: 'meses' },
  ipc: { cat: 'precios', per: 'mensual', fuente: 'ine', dec: 1, unidad: '%', varMensual: 2.13 },
  pib: { cat: 'actividad', per: 'trimestral', fuente: 'ine', dec: 1, unidad: '%' },
  fiscal: { cat: 'fiscal', per: 'trimestral', fuente: 'mefp', dec: 1, unidad: '%' },
  deuda_externa: { cat: 'fiscal', per: 'trimestral', fuente: 'bcb', dec: 1, unidad: '% PIB' },
  salario_minimo: { cat: 'precios', per: 'mensual', fuente: 'mefp', dec: 0, unidad: 'Bs' },
  gas: { cat: 'energia', per: 'mensual', fuente: 'ypfb', dec: 1, unidad: 'mm³/d' },
};
w('INSERT INTO indicadores (codigo, nombre, unidad, categoria, sentido, decimales, definicion, asof, periodicidad, fuente_id) VALUES');
w(KPIS.map((k) => {
  const m = IND_META[k.id];
  return `  (${q(k.id)}, ${q(k.label)}, ${q(m.unidad)}, ${q(m.cat)}, ${q(k.sentiment)}, ${m.dec}, ${q(k.def)}, ${q(k.asof)}, ${q(PERIODICIDAD[k.id] ?? m.per)}, ${sub('fuentes', 'codigo', m.fuente)})`;
}).join(',\n') + ';');
// brecha: enlazar indicador base
for (const k of KPIS) {
  const m = IND_META[k.id];
  if (m.base) {
    w(`UPDATE indicadores SET indicador_base_id = ${sub('indicadores', 'codigo', m.base)} WHERE codigo = ${q(k.id)};`);
  }
}

// ── términos (keywords) ────────────────────────────────────────────────
section('terminos (keywords)');
const terminos = [...new Set(NOTICIAS.flatMap((n) => n.keywords || []))];
w('INSERT INTO terminos (termino) VALUES');
w(terminos.map((t) => `  (${q(t)})`).join(',\n') + ';');

// ── indicador_observaciones (series históricas REALES, fechadas) ───────
section('indicador_observaciones (series reales fechadas + valor vigente)');
// Fechas y VALORES reales de fuentes oficiales (BCB/INE/MEFP/YPFB/mercado).
// Procedencia por serie en docs/SOURCES.md y src/data/series.ts. La última
// observación lleva el delta/etiqueta vigente.
const obsRows = [];
for (const k of KPIS) {
  const m = IND_META[k.id];
  const serie = HISTORY[k.id] ?? [];
  for (let i = 0; i < serie.length; i++) {
    const last = i === serie.length - 1;
    const variacion = last ? num(k.delta) : 'NULL';
    const etq = last ? q(k.deltaLabel) : 'NULL';
    const varM = last && m.varMensual != null ? num(m.varMensual) : 'NULL';
    obsRows.push(`  (${sub('indicadores', 'codigo', k.id)}, ${q(serie[i].f)}, ${num(serie[i].v)}, ${variacion}, ${etq}, ${varM})`);
  }
}
w('INSERT INTO indicador_observaciones (indicador_id, fecha, valor, variacion, variacion_etiqueta, var_mensual) VALUES');
w(obsRows.join(',\n') + ';');

// ── fuente_estado (Módulo F) ───────────────────────────────────────────
section('fuente_estado (health-check vigente)');
w('INSERT INTO fuente_estado (fuente_id, estado, latencia_ms, ultima_actualizacion, verificado_en) VALUES');
w(FUENTES.map((f) =>
  `  (${sub('fuentes', 'codigo', f.id)}, ${q(f.status)}, ${num(f.latency)}, ${q(f.last)}, ${q(NOW.toISOString())})`,
).join(',\n') + ';');

// ── bloqueos (Módulo B) ────────────────────────────────────────────────
section('bloqueos');
const bloqueoFuente = (s) => (s && s.startsWith('ABC') ? 'abc' : null);
w('INSERT INTO bloqueos (codigo, departamento_id, ruta_id, tramo, lon, lat, sector, motivo, severidad, estado, fecha_inicio, fuente_id, fuente_texto) VALUES');
w(BLOQUEOS.map((b) => {
  const [cod, nom] = rutaParse(b.ruta);
  const ruta = `(SELECT id FROM rutas WHERE codigo = ${q(cod)} AND nombre = ${q(nom)})`;
  const inicio = ymd(new Date(Date.UTC(2026, 5, 14 - b.dia)));
  const fcode = bloqueoFuente(b.fuente);
  const fuenteId = fcode ? sub('fuentes', 'codigo', fcode) : 'NULL';
  return `  (${q(b.id)}, ${sub('departamentos', 'nombre', b.dept)}, ${ruta}, ${q(b.km)}, ${num(b.lon)}, ${num(b.lat)}, ${q(b.sector)}, ${q(b.motivo)}, ${q(b.severidad)}, 'activo', ${q(inicio)}, ${fuenteId}, ${q(b.fuente)})`;
}).join(',\n') + ';');

// ── bloqueo_eventos (cronología del drawer) ────────────────────────────
section('bloqueo_eventos (cronología)');
const cronoRows = [];
for (const b of BLOQUEOS) {
  const inicio = new Date(Date.UTC(2026, 5, 14 - b.dia));
  const dPrev = new Date(Date.UTC(2026, 5, 14 - Math.max(0, b.dia - 1)));
  const hoy = new Date(Date.UTC(2026, 5, 14));
  const bid = `(SELECT id FROM bloqueos WHERE codigo = ${q(b.id)})`;
  cronoRows.push(`  (${bid}, ${q(ymd(inicio))}, ${q('Inicio de la medida. Pliego entregado a autoridades.')})`);
  cronoRows.push(`  (${bid}, ${q(ymd(dPrev))}, ${q('Diálogo fallido con representantes ministeriales.')})`);
  cronoRows.push(`  (${bid}, ${q(ymd(hoy))}, ${q('Vigilia indefinida ratificada en asamblea.')})`);
}
w('INSERT INTO bloqueo_eventos (bloqueo_id, fecha, descripcion) VALUES');
w(cronoRows.join(',\n') + ';');

// ── bono_cotizaciones (Módulo C) ───────────────────────────────────────
section('bono_cotizaciones (serie histórica + cierre vigente)');
const cotizRows = [];
for (const b of MERCADOS.bonos) {
  for (const p of (HISTORY[b.id] ?? [])) {
    if (p.f === ymd(BASE_DATE)) continue; // el cierre vigente se inserta aparte
    cotizRows.push(`  (${sub('bonos_soberanos', 'codigo', b.id)}, ${q(p.f)}, ${num(p.v)}, NULL, NULL, NULL)`);
  }
  cotizRows.push(`  (${sub('bonos_soberanos', 'codigo', b.id)}, ${q(ymd(BASE_DATE))}, ${num(b.price)}, ${num(b.yield)}, ${num(b.spread)}, ${num(b.chg)})`);
}
w('INSERT INTO bono_cotizaciones (bono_id, fecha, precio, rendimiento, spread_ust, variacion) VALUES');
w(cotizRows.join(',\n') + ';');

// ── indice_riesgo_observaciones (EMBI 30d + CDS) ───────────────────────
section('indice_riesgo_observaciones');
const embiSerie = HISTORY['embi'] ?? [];
const embiRows = embiSerie.map((p, i) => {
  const last = i === embiSerie.length - 1;
  const variacion = last ? num(MERCADOS.embi.chg) : 'NULL';
  return `  (${sub('indices_riesgo', 'codigo', 'EMBI')}, ${q(p.f)}, ${num(Math.round(p.v))}, ${variacion}, NULL)`;
});
if (MERCADOS.cds5y.value != null) {
  embiRows.push(
    `  (${sub('indices_riesgo', 'codigo', 'CDS5Y')}, ${q(ymd(BASE_DATE))}, ${num(MERCADOS.cds5y.value)}, ${num(MERCADOS.cds5y.chg)}, ${q(MERCADOS.cds5y.note)})`,
  );
}
w('INSERT INTO indice_riesgo_observaciones (indice_id, fecha, valor, variacion, nota) VALUES');
w(embiRows.join(',\n') + ';');

// ── calificaciones (Módulo C) ──────────────────────────────────────────
section('calificaciones');
const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
const PERSP = { Estable: 'estable', Negativo: 'negativa', Positivo: 'positiva', '—': 'na', 'Sin outlook': 'na' };
const parseMesAnio = (s) => {
  const [mes, anio] = s.split(' ');
  return ymd(new Date(Date.UTC(+anio, MES[mes] ?? 0, 1)));
};
w('INSERT INTO calificaciones (agencia_id, calificacion, perspectiva, fecha) VALUES');
w(MERCADOS.ratings.map((r) =>
  `  (${sub('agencias_calificadoras', 'nombre', r.agencia)}, ${q(r.rating)}, ${q(PERSP[r.outlook] || 'estable')}, ${q(parseMesAnio(r.actualizado))})`,
).join(',\n') + ';');

// ── reservas_composicion (donut RIN) ───────────────────────────────────
section('reservas_composicion');
const rinTotal = KPIS.find((k) => k.id === 'rin').value; // M USD
const comp = MERCADOS.reservas;
w('INSERT INTO reservas_composicion (fecha, componente, porcentaje, monto_musd) VALUES');
w([['oro', comp.oro], ['divisas', comp.divisas], ['deg', comp.deg]]
  .map(([c, pct]) => `  (${q(ymd(BASE_DATE))}, ${q(c)}, ${num(pct)}, ${num(+(rinTotal * pct / 100).toFixed(2))})`)
  .join(',\n') + ';');

// ── noticias (Módulo D) ────────────────────────────────────────────────
section('noticias');
w('INSERT INTO noticias (codigo, publicado_en, medio_id, categoria_id, titular, resumen, cuerpo, breaking, url) VALUES');
w(NOTICIAS.map((n) => {
  const pub = new Date(NOW.getTime() - n.mins * 60000).toISOString();
  return `  (${q(n.id)}, ${q(pub)}, ${sub('medios', 'nombre', n.fuente)}, ${sub('categorias_noticia', 'nombre', n.tag)}, ${q(n.titular)}, ${q(n.resumen)}, ${q(n.body)}, ${n.breaking}, ${q(n.url ?? null)})`;
}).join(',\n') + ';');

// noticia_terminos
section('noticia_terminos (M:N)');
const ntRows = [];
for (const n of NOTICIAS) {
  for (const kw of n.keywords || []) {
    ntRows.push(`  ((SELECT id FROM noticias WHERE codigo = ${q(n.id)}), ${sub('terminos', 'termino', kw)})`);
  }
}
w('INSERT INTO noticia_terminos (noticia_id, termino_id) VALUES');
w(ntRows.join(',\n') + ';');

// noticia_vinculos
section('noticia_vinculos ("vinculado a")');
const vincula = (rel) => {
  // best-effort: resolver tipo + FK por patrón
  if (/^Bloqueo\s+(b\d+)/.test(rel)) {
    const code = rel.match(/^Bloqueo\s+(b\d+)/)[1];
    return { tipo: 'bloqueo', col: 'bloqueo_id', ref: `(SELECT id FROM bloqueos WHERE codigo = ${q(code)})` };
  }
  if (/EMBI/i.test(rel)) return { tipo: 'indice', col: 'indice_id', ref: sub('indices_riesgo', 'codigo', 'EMBI') };
  if (/CDS/i.test(rel)) return { tipo: 'indice', col: 'indice_id', ref: sub('indices_riesgo', 'codigo', 'CDS5Y') };
  if (/2028|BOL28/i.test(rel)) return { tipo: 'bono', col: 'bono_id', ref: sub('bonos_soberanos', 'codigo', 'BOL28') };
  if (/2031|BOL31/i.test(rel)) return { tipo: 'bono', col: 'bono_id', ref: sub('bonos_soberanos', 'codigo', 'BOL31') };
  if (/2030|BOL30/i.test(rel)) return { tipo: 'bono', col: 'bono_id', ref: sub('bonos_soberanos', 'codigo', 'BOL30') };
  const indMap = [
    [/RIN/i, 'rin'], [/Paralelo/i, 'usdbob_paralelo'], [/IPC/i, 'ipc'],
    [/PIB/i, 'pib'], [/fiscal/i, 'fiscal'], [/[Gg]as natural/, 'gas'],
  ];
  for (const [re, code] of indMap) {
    if (re.test(rel)) return { tipo: 'indicador', col: 'indicador_id', ref: sub('indicadores', 'codigo', code) };
  }
  return { tipo: 'otro', col: null, ref: null };
};
const vinRows = [];
for (const n of NOTICIAS) {
  for (const rel of n.relacionados || []) {
    const v = vincula(rel);
    const nid = `(SELECT id FROM noticias WHERE codigo = ${q(n.id)})`;
    const cols = ['noticia_id', 'tipo', 'etiqueta'];
    const vals = [nid, q(v.tipo), q(rel)];
    if (v.col) { cols.push(v.col); vals.push(v.ref); }
    vinRows.push({ cols, vals });
  }
}
// agrupar por conjunto de columnas para INSERTs válidos
const byCols = new Map();
for (const r of vinRows) {
  const key = r.cols.join(',');
  if (!byCols.has(key)) byCols.set(key, { cols: r.cols, rows: [] });
  byCols.get(key).rows.push(`  (${r.vals.join(', ')})`);
}
for (const { cols, rows } of byCols.values()) {
  w(`INSERT INTO noticia_vinculos (${cols.join(', ')}) VALUES`);
  w(rows.join(',\n') + ';');
}

// ── eventos (Módulo E) ─────────────────────────────────────────────────
section('eventos (calendario 30 días)');
w('INSERT INTO eventos (fecha, categoria_id, titulo, tono) VALUES');
w(EVENTOS.map((e) => {
  const fecha = ymd(new Date(Date.UTC(2026, 5, 14 + e.d)));
  return `  (${q(fecha)}, ${sub('categorias_evento', 'nombre', e.tag)}, ${q(e.title)}, ${q(e.tone)})`;
}).join(',\n') + ';');

// ── commodities (Módulo Externo) ───────────────────────────────────────
section('commodities');
w('INSERT INTO commodities (codigo, nombre, unidad, valor, var_mensual, var_anual, polaridad, fuente, asof, nota) VALUES');
w(EXTERNO.commodities
  .map((c) =>
    `  (${q(c.id)}, ${q(c.label)}, ${q(c.unit)}, ${num(c.value)}, ${num(c.chgMensual)}, ${num(c.chgAnual)}, ${q(c.polarity)}, ${q(c.source)}, ${q(c.asof)}, ${q(c.nota ?? null)})`,
  )
  .join(',\n') + ';');

// ── commodity_observaciones (serie histórica de precios) ───────────────
section('commodity_observaciones (serie histórica mensual)');
const commObsRows = [];
for (const c of EXTERNO.commodities) {
  for (const p of (HISTORY[c.id] ?? [])) {
    commObsRows.push(`  (${sub('commodities', 'codigo', c.id)}, ${q(p.f)}, ${num(p.v)})`);
  }
}
if (commObsRows.length) {
  w('INSERT INTO commodity_observaciones (commodity_id, fecha, valor) VALUES');
  w(commObsRows.join(',\n') + ';');
}

// ── externo_metricas (deuda, balanza, servicio, combustibles) ──────────
section('externo_metricas');
const em = [];
const pushEm = (clave, valor, unidad, asof, fuente, nota = null, texto = null) =>
  em.push(`  (${q(clave)}, ${num(valor)}, ${q(texto)}, ${q(unidad)}, ${q(asof)}, ${q(fuente)}, ${q(nota)})`);
const exD = EXTERNO.deuda, exB = EXTERNO.balanza, exC = EXTERNO.combustibles, exS = EXTERNO.servicio;
pushEm('deuda_externa_pct', exD.externaPct, '% PIB', exD.asof, exD.source);
pushEm('deuda_externa_stock', exD.externaStock, 'USD M', exD.asof, exD.source);
pushEm('deuda_total_pct', exD.totalPct, '% PIB', exD.asof, exD.source);
pushEm('balanza_export', exB.exportaciones, 'USD M', exB.periodo, exB.source);
pushEm('balanza_import', exB.importaciones, 'USD M', exB.periodo, exB.source);
pushEm('balanza_saldo', exB.saldo, 'USD M', exB.periodo, exB.source);
pushEm('balanza_periodo', null, null, exB.periodo, exB.source, null, exB.periodo);
pushEm('servicio_2026', exS.y2026, 'USD M', '2026', exS.source);
pushEm('servicio_2027', exS.y2027, 'USD M', '2027', exS.source);
pushEm('servicio_2028', exS.y2028, 'USD M', '2028', exS.source);
pushEm('comb_especial', exC.especial, 'Bs/L', null, exC.source);
pushEm('comb_premium', exC.premium, 'Bs/L', null, exC.source);
pushEm('comb_diesel', exC.diesel, 'Bs/L', null, exC.source, exC.nota);
const exA = EXTERNO.analitica;
pushEm('gas_export_usd', exA.gasExportUsd, 'USD M', exA.gasExportPeriodo, exA.source, `var ${exA.gasExportVar}% a/a`);
pushEm('cuenta_corriente_pct', exA.ccPct, '% PIB', exA.ccPeriodo, exA.source);
pushEm('cuenta_corriente_usd', exA.ccUsd, 'USD M', exA.ccPeriodo, exA.source);
pushEm('remesas_usd', exA.remesasUsd, 'USD M', exA.remesasPeriodo, exA.source);
pushEm('bolivianizacion', exA.bolivianizacion, '% MN', exA.bolivPeriodo, exA.source);
pushEm('fin_monetario_bcb_spnf', exA.finMonetarioFlujo, 'Bs MM', exA.finMonetarioPeriodo, exA.source, `programado +${exA.finMonetarioProg}`);
pushEm('fmi_monto', exA.fmiMonto, 'USD M', exA.fmiEstado, exA.source, exA.fmiNota);
w('INSERT INTO externo_metricas (clave, valor, valor_texto, unidad, asof, fuente, nota) VALUES');
w(em.join(',\n') + ';');

// ── elecciones_departamento (cruce electoral 2025/2026) ────────────────
section('elecciones_departamento (presidencial 2025 + alcaldía 2026)');
w('INSERT INTO elecciones_departamento (departamento_id, fr_paz, fr_quiroga, fr_doria, fr_andronico, fr_winner, ro_paz, ro_quiroga, ro_winner, muni_partido, muni_alcalde) VALUES');
w(ELECCIONES.map((e) =>
  `  (${sub('departamentos', 'codigo', e.id)}, ${num(e.fr_paz)}, ${num(e.fr_quiroga)}, ${num(e.fr_doria)}, ${num(e.fr_andronico)}, ${q(e.fr_winner)}, ${num(e.ro_paz)}, ${num(e.ro_quiroga)}, ${q(e.ro_winner)}, ${q(e.muni_partido)}, ${q(e.muni_alcalde)})`,
).join(',\n') + ';');

// ── eleccion_localidad (scatter de la presidencial 2025, 1ª vuelta) ────
section('eleccion_localidad (3.730 localidades geolocalizadas)');
const LOCS = JSON.parse(readFileSync(resolve(__dirname, 'localidades2025.json'), 'utf8'));
const locVals = LOCS.map((l) =>
  `  (${q(l.dep)}, ${q(l.muni)}, ${q(l.n)}, ${num(l.lon)}, ${num(l.lat)}, ${q(l.win)}, ${num(l.t)})`,
);
for (let i = 0; i < locVals.length; i += 500) {
  w('INSERT INTO eleccion_localidad (departamento, municipio, nombre, lon, lat, partido, votos) VALUES');
  w(locVals.slice(i, i + 500).join(',\n') + ';');
}

w();
w('COMMIT;');

writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`✓ wrote ${OUT} (${lines.length} líneas)`);
console.log(`  ${DEPTS.length} deptos · ${Object.keys(FUENTE_META).length} fuentes · ${medios.length} medios · ${KPIS.length} indicadores · ${BLOQUEOS.length} bloqueos · ${NOTICIAS.length} noticias · ${EVENTOS.length} eventos`);
