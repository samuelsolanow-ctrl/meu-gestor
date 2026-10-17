'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContext } from '@/lib/context';
import { addBill, addTransaction, payBill } from '@/lib/finance';
import { parseMoney, todaySP } from '@/lib/format';

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
    });
  } catch (e: any) {
    return { error: e.message };
  }
  revalidatePath('/', 'layout');
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
  });
  revalidatePath('/', 'layout');
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
