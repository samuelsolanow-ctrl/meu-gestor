import { todaySP } from '@/lib/format';
import { ensureSchema } from '@/lib/migrate';

type DB = any;

export const INV_KINDS: Record<string, string> = {
  cdb: 'CDB / LCI / LCA',
  tesouro: 'Tesouro Direto',
  acoes: 'Ações',
  fii: 'Fundos imobiliários',
  fundo: 'Fundos',
  previdencia: 'Previdência',
  poupanca: 'Poupança',
  cripto: 'Cripto',
  outro: 'Outro',
};
export const INV_COLORS: Record<string, string> = {
  cdb: '#7aa2ff', tesouro: '#5ee0c1', acoes: '#b69cff', fii: '#ffc266', fundo: '#ff8a6b',
  previdencia: '#9db9ff', poupanca: '#c3cde3', cripto: '#f472b6', outro: '#3a4870',
};

export function kindFrom(text?: string | null) {
  const t = (text ?? '').toLowerCase();
  if (!t) return 'outro';
  if (INV_KINDS[t]) return t;
  if (/cdb|lci|lca|renda fixa|cdi/.test(t)) return 'cdb';
  if (/tesouro|selic|ipca/.test(t)) return 'tesouro';
  if (/fii|imobili/.test(t)) return 'fii';
  if (/a[cç][aão]|bolsa|b3/.test(t)) return 'acoes';
  if (/previd|pgbl|vgbl/.test(t)) return 'previdencia';
  if (/poupan/.test(t)) return 'poupanca';
  if (/cripto|bitcoin|btc|eth/.test(t)) return 'cripto';
  if (/fundo/.test(t)) return 'fundo';
  return 'outro';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function listInvestments(db: DB, spaceId?: string) {
  await ensureSchema();
  let q = db.from('investments').select('*').eq('archived', false).order('current_value', { ascending: false });
  if (spaceId) q = q.eq('space_id', spaceId);
  const { data } = await q;
  const items = (data ?? []).map((i: any) => ({ ...i, invested: Number(i.invested), current_value: Number(i.current_value) }));
  const invested = r2(items.reduce((s: number, i: any) => s + i.invested, 0));
  const current = r2(items.reduce((s: number, i: any) => s + i.current_value, 0));
  return { items, invested, current, gain: r2(current - invested), gainPct: invested > 0 ? Math.round(((current - invested) / invested) * 1000) / 10 : 0 };
}

export async function addInvestment(
  db: DB,
  v: { spaceId: string; name: string; kind?: string; institution?: string | null; owner?: string | null; invested: number; current?: number | null; date?: string },
) {
  await ensureSchema();
  const invested = r2(Math.max(0, v.invested || 0));
  const current = r2(v.current != null && v.current > 0 ? v.current : invested);
  const { data, error } = await db
    .from('investments')
    .insert({ space_id: v.spaceId, name: v.name.trim(), kind: kindFrom(v.kind), institution: v.institution || null, owner_name: v.owner || null, invested, current_value: current })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (invested > 0) await db.from('investment_moves').insert({ investment_id: data.id, kind: 'aporte', amount: invested, value_after: current, occurred_on: v.date || todaySP() });
  return data;
}

/** aporte: põe dinheiro · resgate: tira · atualizacao: informa o valor atual (rendimento) */
export async function moveInvestment(db: DB, id: string, kind: 'aporte' | 'resgate' | 'atualizacao', amount: number, date?: string) {
  await ensureSchema();
  const { data: inv, error } = await db.from('investments').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error('Investimento não encontrado');
  let invested = Number(inv.invested);
  let current = Number(inv.current_value);
  const a = r2(Math.abs(amount));
  if (kind === 'aporte') {
    invested += a;
    current += a;
  } else if (kind === 'resgate') {
    const share = current > 0 ? Math.min(1, a / current) : 1;
    invested = invested * (1 - share); // tira a parte proporcional do que foi aplicado
    current = Math.max(0, current - a);
  } else {
    current = a;
  }
  invested = r2(invested);
  current = r2(current);
  const { error: upErr } = await db.from('investments').update({ invested, current_value: current, updated_at: new Date().toISOString() }).eq('id', id);
  if (upErr) throw new Error(upErr.message);
  await db.from('investment_moves').insert({ investment_id: id, kind, amount: a, value_after: current, occurred_on: date || todaySP() });
  return { ...inv, invested, current_value: current };
}
