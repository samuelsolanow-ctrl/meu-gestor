'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContext } from '@/lib/context';
import { addBill, addTransaction, deleteTransaction, payBill, updateTransaction } from '@/lib/finance';
import { addInvestment, kindFrom, moveInvestment } from '@/lib/investments';
import { parseMoney, todaySP } from '@/lib/format';
import { ensureSchema } from '@/lib/migrate';
import { getBudgets, setBudget } from '@/lib/budget';

function spaceIdFrom(ctx: Awaited<ReturnType<typeof getContext>>, value: FormDataEntryValue | null) {
  return value === 'pessoal' ? ctx.pessoal.id : ctx.casal.id;
}

export async function createTransactionAction(_prev: any, form: FormData) {
  const ctx = await getContext();
  const amount = parseMoney(String(form.get('valor') ?? ''));
  if (!(amount > 0)) return { error: 'Digite um valor maior que zero.' };
  const kind = form.get('tipo') === 'receita' ? 'income' : 'expense';
  try {
    await addTransaction(ctx.supabase, {
      spaceId: spaceIdFrom(ctx, form.get('espaco')),
      kind,
      amount,
      description: String(form.get('descricao') ?? ''),
      categoryId: String(form.get('categoria') ?? '') || null,
      accountId: String(form.get('conta') ?? '') || null,
      occurredOn: String(form.get('data') ?? '') || todaySP(),
      source: 'form',
      installments: Number(form.get('parcelas')) || 1,
    });
  } catch (e: any) {
    return { error: e.message };
  }
  revalidatePath('/', 'layout');
  if (form.get('voltar') === 'cartoes') redirect(`/cartoes?c=${String(form.get('conta') ?? '')}`);
  redirect(form.get('espaco') === 'pessoal' ? '/?e=pessoal' : '/');
}

export async function createBillAction(_prev: any, form: FormData) {
  const ctx = await getContext();
  await ensureSchema();
  const amount = parseMoney(String(form.get('valor') ?? ''));
  if (!(amount > 0)) return { error: 'Digite um valor maior que zero.' };
  const name = String(form.get('nome') ?? '').trim();
  if (!name) return { error: 'Dê um nome para a conta.' };
  try {
    await addBill(ctx.supabase, {
      spaceId: spaceIdFrom(ctx, form.get('espaco')),
      name,
      amount,
      dueDate: String(form.get('vencimento') ?? ''),
      recurrence: (String(form.get('recorrencia') ?? 'none') as any) || 'none',
      categoryId: String(form.get('categoria') ?? '') || null,
      accountId: String(form.get('conta') ?? '') || null,
      remindDays: form.get('aviso') != null ? Number(form.get('aviso')) : undefined,
    });
  } catch (e: any) {
    return { error: e.message };
  }
  revalidatePath('/', 'layout');
  return { ok: true, error: '' };
}

export async function payBillAction(form: FormData) {
  const ctx = await getContext();
  await payBill(ctx.supabase, String(form.get('id')), 'form');
  revalidatePath('/', 'layout');
}

export async function createAccountAction(form: FormData) {
  const ctx = await getContext();
  const name = String(form.get('nome') ?? '').trim();
  if (!name) return;
  const type = String(form.get('tipo') ?? 'checking');
  const day = (k: string) => {
    const n = Number(form.get(k));
    return n >= 1 && n <= 31 ? n : null;
  };
  await ctx.supabase.from('accounts').insert({
    space_id: spaceIdFrom(ctx, form.get('espaco')),
    name,
    institution: String(form.get('banco') ?? '').trim() || null,
    type,
    closing_day: type === 'credit_card' ? day('fechamento') : null,
    due_day: type === 'credit_card' ? day('vencimento') : null,
    credit_limit: type === 'credit_card' && parseMoney(String(form.get('limite') ?? '')) > 0 ? parseMoney(String(form.get('limite'))) : null,
  });
  revalidatePath('/', 'layout');
}

export async function updateCardAction(form: FormData) {
  const ctx = await getContext();
  const id = String(form.get('id') ?? '');
  const day = (k: string) => {
    const n = Number(form.get(k));
    return n >= 1 && n <= 31 ? n : null;
  };
  const limit = parseMoney(String(form.get('limite') ?? ''));
  await ctx.supabase
    .from('accounts')
    .update({
      name: String(form.get('nome') ?? '').trim() || undefined,
      closing_day: day('fechamento'),
      due_day: day('vencimento'),
      credit_limit: limit > 0 ? limit : null,
    })
    .eq('id', id);
  revalidatePath('/cartoes');
  redirect(`/cartoes?c=${id}`);
}

export async function archiveCardAction(form: FormData) {
  const ctx = await getContext();
  await ctx.supabase.from('accounts').update({ archived: true }).eq('id', String(form.get('id') ?? ''));
  revalidatePath('/', 'layout');
  redirect('/cartoes');
}

export async function toggleInvoicePaidAction(form: FormData) {
  const ctx = await getContext();
  await ensureSchema();
  const id = String(form.get('id') ?? '');
  const key = String(form.get('fatura') ?? '');
  if (!/^\d{4}-\d{2}$/.test(key)) return;
  if (form.get('desfazer')) await ctx.supabase.from('card_invoices').delete().eq('account_id', id).eq('invoice_key', key);
  else await ctx.supabase.from('card_invoices').upsert({ account_id: id, invoice_key: key });
  revalidatePath('/cartoes');
  redirect(`/cartoes?c=${id}&f=${key}`);
}

export async function createGoalAction(form: FormData) {
  const ctx = await getContext();
  const name = String(form.get('nome') ?? '').trim();
  const target = parseMoney(String(form.get('alvo') ?? ''));
  if (!name || !(target > 0)) return;
  const current = parseMoney(String(form.get('atual') ?? ''));
  await ctx.supabase.from('goals').insert({
    space_id: spaceIdFrom(ctx, form.get('espaco')),
    name,
    target_amount: target,
    current_amount: current > 0 ? current : 0,
    deadline: String(form.get('prazo') ?? '') || null,
  });
  revalidatePath('/', 'layout');
}

export async function signOutAction() {
  const ctx = await getContext();
  await ctx.supabase.auth.signOut();
  redirect('/entrar');
}

export async function saveBudgetsAction(form: FormData) {
  const ctx = await getContext();
  const spaceId = spaceIdFrom(ctx, form.get('espaco'));
  const current = Object.fromEntries((await getBudgets(ctx.supabase, spaceId)).map((b) => [b.categoryId, b.limit]));
  const jobs: Promise<unknown>[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('b:')) continue;
    const cat = k.slice(2);
    const raw = String(v).trim();
    const amount = raw ? parseMoney(raw) : 0;
    if (!Number.isFinite(amount)) continue;
    if ((current[cat] ?? 0) === (amount > 0 ? Math.round(amount * 100) / 100 : 0)) continue;
    jobs.push(setBudget(ctx.supabase, spaceId, cat, amount));
  }
  await Promise.all(jobs);
  revalidatePath('/', 'layout');
  redirect(form.get('espaco') === 'pessoal' ? '/?e=pessoal' : '/');
}

const str = (form: FormData, k: string) => String(form.get(k) ?? '').trim();

// ---------- Editar lançamento
export async function updateTransactionAction(_prev: any, form: FormData) {
  const ctx = await getContext();
  const id = str(form, 'id');
  const amount = parseMoney(str(form, 'valor'));
  if (!(amount > 0)) return { error: 'Digite um valor maior que zero.' };
  try {
    await updateTransaction(ctx.supabase, id, {
      amount,
      description: str(form, 'descricao'),
      categoryId: str(form, 'categoria') || null,
      accountId: str(form, 'conta') || null,
      occurredOn: str(form, 'data') || undefined,
      spaceId: spaceIdFrom(ctx, form.get('espaco')),
    });
  } catch (e: any) {
    return { error: e.message };
  }
  revalidatePath('/', 'layout');
  redirect(str(form, 'voltar') || '/');
}

export async function deleteTransactionAction(form: FormData) {
  const ctx = await getContext();
  await deleteTransaction(ctx.supabase, str(form, 'id'));
  revalidatePath('/', 'layout');
  redirect(str(form, 'voltar') || '/');
}

// ---------- Editar conta a pagar
export async function updateBillAction(_prev: any, form: FormData) {
  const ctx = await getContext();
  await ensureSchema();
  const amount = parseMoney(str(form, 'valor'));
  if (!(amount > 0)) return { error: 'Digite um valor maior que zero.' };
  const name = str(form, 'nome');
  if (!name) return { error: 'Dê um nome para a conta.' };
  const due = str(form, 'vencimento');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'Data de vencimento inválida.' };
  const { error } = await ctx.supabase
    .from('bills')
    .update({
      name,
      amount: Math.round(amount * 100) / 100,
      due_date: due,
      recurrence: str(form, 'recorrencia') || 'none',
      category_id: str(form, 'categoria') || null,
      space_id: spaceIdFrom(ctx, form.get('espaco')),
      remind_days: Math.max(0, Math.min(15, Number(form.get('aviso') ?? 2) || 0)),
    })
    .eq('id', str(form, 'id'));
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  redirect(form.get('espaco') === 'pessoal' ? '/contas?e=pessoal' : '/contas');
}

export async function deleteBillAction(form: FormData) {
  const ctx = await getContext();
  await ctx.supabase.from('bills').delete().eq('id', str(form, 'id'));
  revalidatePath('/', 'layout');
  redirect('/contas');
}

// ---------- Metas
export async function updateGoalAction(form: FormData) {
  const ctx = await getContext();
  const target = parseMoney(str(form, 'alvo'));
  const current = parseMoney(str(form, 'atual'));
  await ctx.supabase
    .from('goals')
    .update({
      name: str(form, 'nome') || undefined,
      ...(target > 0 ? { target_amount: target } : {}),
      ...(current >= 0 ? { current_amount: current } : {}),
      deadline: str(form, 'prazo') || null,
    })
    .eq('id', str(form, 'id'));
  revalidatePath('/', 'layout');
}

export async function deleteGoalAction(form: FormData) {
  const ctx = await getContext();
  await ctx.supabase.from('goals').delete().eq('id', str(form, 'id'));
  revalidatePath('/', 'layout');
}

// ---------- Investimentos
export async function createInvestmentAction(_prev: any, form: FormData) {
  const ctx = await getContext();
  const name = str(form, 'nome');
  if (!name) return { error: 'Dê um nome ao investimento.' };
  const invested = parseMoney(str(form, 'aplicado'));
  const current = parseMoney(str(form, 'atual'));
  try {
    await addInvestment(ctx.supabase, {
      spaceId: ctx.casal.id,
      name,
      kind: str(form, 'tipo'),
      institution: str(form, 'instituicao') || null,
      owner: str(form, 'titular') || null,
      invested: invested > 0 ? invested : 0,
      current: current > 0 ? current : null,
    });
  } catch (e: any) {
    return { error: e.message };
  }
  revalidatePath('/', 'layout');
  redirect('/investimentos');
}

export async function moveInvestmentAction(_prev: any, form: FormData) {
  const ctx = await getContext();
  const id = str(form, 'id');
  const amount = parseMoney(str(form, 'valor'));
  if (!(amount > 0)) return { error: 'Digite um valor.' };
  const kind = str(form, 'tipo') as 'aporte' | 'resgate' | 'atualizacao';
  try {
    await moveInvestment(ctx.supabase, id, kind, amount, str(form, 'data') || undefined);
  } catch (e: any) {
    return { error: e.message };
  }
  revalidatePath('/', 'layout');
  redirect(`/investimentos?i=${id}`);
}

export async function updateInvestmentAction(form: FormData) {
  const ctx = await getContext();
  const id = str(form, 'id');
  const invested = parseMoney(str(form, 'aplicado'));
  const current = parseMoney(str(form, 'atual'));
  await ctx.supabase
    .from('investments')
    .update({
      name: str(form, 'nome') || undefined,
      kind: kindFrom(str(form, 'tipo')),
      institution: str(form, 'instituicao') || null,
      owner_name: str(form, 'titular') || null,
      ...(invested >= 0 ? { invested } : {}),
      ...(current >= 0 ? { current_value: current } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  revalidatePath('/', 'layout');
  redirect(`/investimentos?i=${id}`);
}

export async function deleteInvestmentAction(form: FormData) {
  const ctx = await getContext();
  await ctx.supabase.from('investments').delete().eq('id', str(form, 'id'));
  revalidatePath('/', 'layout');
  redirect('/investimentos');
}
