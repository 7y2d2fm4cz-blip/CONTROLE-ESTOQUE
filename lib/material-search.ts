export function normalizeSearch(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Match every word independently, so order, accents and code separators do not block a result.
export function matchesMaterial(material: any, query: string): boolean {
  const fields = [material.code, material.description, material.project, material.location, material.unit].map(normalizeSearch);
  const text = fields.join(' ');
  const compact = fields.map(value => value.replace(/ /g, ''));
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every(word => text.includes(word) || compact.some(field => field.includes(word)));
}

export function searchMaterials(materials: any[], query: string): any[] {
  const normalized = normalizeSearch(query).replace(/ /g, '');
  const score = (m: any) => normalized && normalizeSearch(m.code).replace(/ /g, '') === normalized ? 2 : normalized && normalizeSearch(m.description).startsWith(normalizeSearch(query)) ? 1 : 0;
  return materials.filter(m => matchesMaterial(m, query)).sort((a, b) => score(b) - score(a) || a.description.localeCompare(b.description, 'pt-BR', {sensitivity:'base', numeric:true}));
}
