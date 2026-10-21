'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContext } from '@/lib/context';
import { addBill, addTransaction, payBill } from '@/lib/finance';
import { parseMoney, todaySP } from '@/lib/format';
import { ensureSchema } from '@/lib/migrate';

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
