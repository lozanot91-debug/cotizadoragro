/**
 * Catálogo: fichas de producto comercial. Cada ficha agrupa los códigos de la lista que son el mismo
 * producto en distintos envases (presentaciones), tiene el marbete en PDF y comentarios del equipo.
 * Los grupos se SUGIEREN separando el envase del nombre; el admin los confirma.
 */

export const ETIQUETAS_COMENTARIO = ['Manejo', 'Posicionamiento', 'Técnico'] as const;
export type EtiquetaComentario = (typeof ETIQUETAS_COMENTARIO)[number];

export const MAX_MARBETE_BYTES = 5 * 1024 * 1024;

const UNIDADES: [RegExp, string][] = [
  [/^(L|LT|LTS|LTRS|LITRO|LITROS)$/, 'L'],
  [/^(KG|KGS|KGRS|KILO|KILOS)$/, 'kg'],
  [/^(G|GR|GRS|GRAMOS)$/, 'g'],
  [/^(CC)$/, 'cc'],
  [/^(ML)$/, 'ml'],
];
const UNIDAD = '(?:LITROS|LITRO|LTRS|LTS|LT|L|KGRS|KGS|KG|KILOS|KILO|GRAMOS|GRS|GR|G|CC|ML)';

function unidad(u: string | undefined): string {
  if (!u) return '';
  const U = u.toUpperCase();
  return UNIDADES.find(([re]) => re.test(U))?.[1] ?? u.toLowerCase();
}

function numero(n: string): string {
  return n.replace('.', ',');
}

function limpiar(s: string): string {
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([),])/g, '$1').replace(/[\s\-–,/]+$/g, '').trim();
}

/**
 * Separa el envase del nombre del producto.
 * "A 35 T (X 5 LTRS)" → { base: "A 35 T", envase: "x 5 L" }
 * "CONCENTRADO PROTEICO TORO (BL)" → { base: "CONCENTRADO PROTEICO TORO", envase: "Bolsa" }
 * "SILO BOLSA IPESA 9 X 60 X 250" → sin cambios (son medidas, no envase)
 */
export function separarEnvase(nombre: string): { base: string; envase: string | null } {
  const original = nombre.trim();
  let s = ` ${original.toUpperCase()} `;
  let envase: string | null = null;
  const quedarse = (e: string) => { if (!envase) envase = e; };

  // (BL) (GL) (BOLSA) (BL X 25 KG)
  s = s.replace(/\(\s*(BL|GL|BOLSA|GRANEL)(?:\s*X\s*(\d+(?:[.,]\d+)?)\s*(\S*?))?\s*\)/, (_m, t: string, n?: string, u?: string) => {
    const tipo = t === 'GL' || t === 'GRANEL' ? 'Granel' : 'Bolsa';
    quedarse(n ? `${tipo} x ${numero(n)} ${unidad(u)}`.trim() : tipo);
    return ' ';
  });
  // (X LITRO) (X KG)
  s = s.replace(new RegExp(`\\(\\s*X\\s*(${UNIDAD})\\s*\\)`), (_m, u: string) => { quedarse(`por ${u.startsWith('L') ? 'litro' : unidad(u)}`); return ' '; });
  // (4 X 5 LT) (X 5L) (X1L) (X5) (200 GRS): tiene que tener una X o una unidad
  s = s.replace(new RegExp(`\\(\\s*(?:(\\d+)\\s*X\\s*|X\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIDAD})?\\s*\\)`), (m, mult?: string, n?: string, u?: string) => {
    if (!/X/.test(m) && !u) return m;
    quedarse(`${mult ? `${mult} x ` : 'x '}${numero(n!)}${u ? ` ${unidad(u)}` : ''}`);
    return ' ';
  });
  // " X 20" / " X 5 LT" al final o antes de un paréntesis, si lo anterior no es un número (9 X 60 X 250 son medidas)
  s = s.replace(new RegExp(`(?<=[A-ZÁÉÍÓÚÑ%)])\\s+X\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIDAD})?(?=\\s*(?:\\(|$))`), (_m, n: string, u?: string) => {
    quedarse(`x ${numero(n)}${u ? ` ${unidad(u)}` : ''}`);
    return ' ';
  });
  // ... BL / GL / BOLSA al final
  s = s.replace(/\s+(BL|GL|BOLSA)\s*$/, (_m, t: string) => { quedarse(t === 'GL' ? 'Granel' : 'Bolsa'); return ' '; });

  const baseMayus = limpiar(s);
  if (!envase || !baseMayus) return { base: original, envase: null };
  // Se devuelve con las mayúsculas/minúsculas del original cuando coincide
  const base = original.toUpperCase().startsWith(baseMayus) ? original.slice(0, baseMayus.length).trim() : baseMayus;
  return { base, envase };
}

/** Lo que se muestra como presentación de un código: la cargada a mano, el envase del nombre, o la unidad de la lista. */
export function presentacion(p: { producto: string; unid?: string | null; es_fertilizante?: boolean; presentacion?: string | null }): string {
  if (p.presentacion?.trim()) return p.presentacion.trim();
  return presentacionAutomatica(p);
}

/** Presentación que sale sola del nombre del producto o de la unidad de la lista. */
export function presentacionAutomatica(p: { producto: string; unid?: string | null; es_fertilizante?: boolean }): string {
  const { envase } = separarEnvase(p.producto);
  if (envase) return envase;
  if (p.es_fertilizante) return 'Por tonelada';
  const u = (p.unid || '').toUpperCase();
  if (/^(LTS?|LITROS?)$/.test(u)) return 'Por litro';
  if (/^(KGS?|KGRS)$/.test(u)) return 'Por kg';
  if (u === 'BOLSA') return 'Bolsa';
  return u ? `Por ${u.toLowerCase()}` : 'Sin dato';
}

const clave = (familia: string | null | undefined, base: string) =>
  `${(familia || '').trim().toUpperCase()}|${base.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()}`;

export interface ProductoLista { cod: string; producto: string; familia: string | null; unid?: string | null; /** Cargada a mano en la ficha (null = automática) */ presentacion?: string | null }

// ---- Presentación cargada a mano: envase + cantidad + unidad ("Bidón 20 L") ----
export const ENVASES = ['Bidón', 'Caja', 'Bolsa', 'Big bag', 'Balde', 'Frasco', 'Botella', 'Tambor', 'Contenedor', 'Sobre', 'Granel'] as const;
export const UNIDADES_PRESENTACION = ['L', 'cc', 'ml', 'kg', 'g', 'tn', 'unidades'] as const;

export interface PartesPresentacion { envase: string; cantidad: string; unidad: string }

/** "Bidón" + "20" + "L" → "Bidón 20 L". Sin cantidad, solo el envase ("Granel"). */
export function armarPresentacion(p: PartesPresentacion): string {
  const env = p.envase.trim();
  const cant = p.cantidad.trim().replace('.', ',');
  const uni = p.unidad.trim();
  return limpiar([env, cant ? `${cant}${uni ? ` ${uni}` : ''}` : ''].filter(Boolean).join(' '));
}

/** Intenta separar una presentación guardada en sus partes (para editarla). Si no se puede, va todo al envase. */
export function partesDePresentacion(texto: string | null | undefined): PartesPresentacion {
  const t = (texto || '').trim();
  const m = t.match(/^(.*?)\s*(\d+(?:[.,]\d+)?)\s*(L|cc|ml|kg|g|tn|unidades)?$/i);
  if (m && m[1]) {
    const uni = UNIDADES_PRESENTACION.find((u) => u.toLowerCase() === (m[3] || '').toLowerCase()) ?? (m[3] || '');
    return { envase: m[1].trim(), cantidad: m[2].replace('.', ','), unidad: uni };
  }
  return { envase: t, cantidad: '', unidad: '' };
}

/**
 * Punto de partida del editor cuando el código no tiene presentación cargada, a partir de la automática:
 * "x 5 L" → Bidón 5 L; "x 25 kg" → Bolsa 25 kg; "Bolsa" → Bolsa; lo demás → Bidón vacío.
 */
export function sugerirPartes(automatica: string): PartesPresentacion {
  const m = automatica.trim().match(/^x\s*(\d+(?:[.,]\d+)?)\s*(L|cc|ml|kg|g)\b/i);
  if (m) {
    const uni = UNIDADES_PRESENTACION.find((u) => u.toLowerCase() === m[2].toLowerCase()) ?? m[2];
    return { envase: ['kg', 'g'].includes(uni) ? 'Bolsa' : 'Bidón', cantidad: m[1].replace('.', ','), unidad: uni };
  }
  const env = ENVASES.find((e) => e.toLowerCase() === automatica.trim().toLowerCase());
  return { envase: env ?? 'Bidón', cantidad: '', unidad: env ? '' : 'L' };
}

/** Error para mostrar, o null si la presentación sirve. */
export function validarPresentacion(texto: string): string | null {
  const t = texto.trim();
  if (!t) return 'Elegí o escribí el envase.';
  if (t.length > 60) return 'La presentación es muy larga (máximo 60 caracteres).';
  return null;
}
export interface GrupoSugerido { nombre: string; familia: string | null; codigos: ProductoLista[] }

/**
 * Agrupa los códigos que todavía no tienen ficha por familia + nombre sin envase.
 * Cada grupo es una ficha a crear (también los de un solo código).
 */
export function sugerirGrupos(productos: ProductoLista[], conFicha: Set<string>): GrupoSugerido[] {
  const grupos = new Map<string, GrupoSugerido>();
  for (const p of productos) {
    if (conFicha.has(p.cod)) continue;
    const { base } = separarEnvase(p.producto);
    const k = clave(p.familia, base);
    const g = grupos.get(k) ?? { nombre: base, familia: p.familia, codigos: [] };
    g.codigos.push(p);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, codigos: g.codigos.sort((a, b) => a.producto.localeCompare(b.producto, 'es')) }))
    .sort((a, b) => (a.familia || '').localeCompare(b.familia || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Validación del PDF del marbete antes de subirlo. */
export function validarMarbete(f: { name: string; type: string; size: number }): string | null {
  const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!esPdf) return 'El marbete tiene que ser un PDF.';
  if (f.size <= 0) return 'El archivo está vacío.';
  if (f.size > MAX_MARBETE_BYTES) return `El PDF pesa ${(f.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB y el máximo es 5 MB. Comprimilo (por ejemplo con iLovePDF) y volvé a subirlo.`;
  return null;
}

/** Nombre de archivo seguro para el almacenamiento: <ficha>/<marca de tiempo>-<nombre>.pdf */
export function rutaMarbete(fichaId: string, nombreArchivo: string, ahora = Date.now()): string {
  const limpio = nombreArchivo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'marbete';
  return `${fichaId}/${ahora}-${limpio}.pdf`;
}

export function pesoLegible(bytes: number | null | undefined): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function validarComentario(texto: string, etiqueta: string): string | null {
  const t = texto.trim();
  if (!t) return 'Escribí el comentario.';
  if (t.length > 2000) return 'El comentario es muy largo (máximo 2000 caracteres).';
  if (etiqueta && !(ETIQUETAS_COMENTARIO as readonly string[]).includes(etiqueta)) return 'Etiqueta inválida.';
  return null;
}
