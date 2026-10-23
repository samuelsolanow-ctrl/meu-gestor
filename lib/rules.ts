import { ensureSchema } from '@/lib/migrate';

type DB = any;

/** Normaliza a descrição para comparar ("Jantar " = "jantar") */
export const rulePattern = (desc: string) =>
  desc.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);

/** Categoria aprendida para essa descrição (regra "sempre usar"), se houver */
export async function ruleCategory(db: DB, description: string): Promise<string | null> {
  const p = rulePattern(description);
  if (!p) return null;
  const { data, error } = await db.from('category_rules').select('pattern, category_id');
  if (error || !data?.length) return null;
  const exact = data.find((r: any) => r.pattern === p);
  if (exact) return exact.category_id;
  const part = data.filter((r: any) => r.pattern.length >= 3 && p.includes(r.pattern)).sort((a: any, b: any) => b.pattern.length - a.pattern.length)[0];
  return part?.category_id ?? null;
}

export async function saveRule(db: DB, description: string, categoryId: string) {
  await ensureSchema();
  const pattern = rulePattern(description);
  if (!pattern) return;
  await db.from('category_rules').upsert({ pattern, category_id: categoryId }, { onConflict: 'family_id,pattern' });
}
