import { addMonths, monthName, monthRange, todaySP } from '@/lib/format';
import { ensureSchema } from '@/lib/migrate';

type DB = any;

export type MonthForecast = {
  key: string; // AAAA-MM
  label: string; // "nov"
  current: boolean;
  income: number; // entradas esperadas
  bills: number; // contas a pagar (fixas) ainda em aberto
  installments: number; // parcelas do cartão e outras compras parceladas
  variable: number; // gasto do dia a dia (média dos últimos meses)
  spent: number; // já gasto (só no mês atual)
  outflow: number; // saída total prevista
  balance: number; // sobra prevista
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Previsão dos próximos meses: entradas (média dos 3 últimos meses), contas fixas
 * (inclusive as recorrentes projetadas), parcelas já lançadas e o gasto do dia a dia.
 */
export async function forecast(db: DB, spaceId: string, today = todaySP(), months = 6) {
  await ensureSchema();
  const cur = today.slice(0, 7);
  const from = monthRange(addMonths(`${cur}-01`, -3)).start;
  const to = monthRange(addMonths(`${cur}-01`, months - 1)).end;
  const [{ data: txs }, { data: bills }] = await Promise.all([
    db.from('transactions').select('kind, amount, occurred_on, installment_group, bill_id').eq('space_id', spaceId).gte('occurred_on', from).lte('occurred_on', to),
    db.from('bills').select('amount, due_date, recurrence').eq('space_id', spaceId).eq('status', 'open').lte('due_date', to),
  ]);

  // média dos últimos 3 meses fechados
  const past = [1, 2, 3].map((i) => addMonths(`${cur}-01`, -i).slice(0, 7));
  const inc: Record<string, number> = {};
  const vari: Record<string, number> = {};
  const seen = new Set<string>();
  for (const t of txs ?? []) {
    const k = String(t.occurred_on).slice(0, 7);
    seen.add(k);
    if (t.kind === 'income') inc[k] = (inc[k] ?? 0) + Number(t.amount);
    else if (!t.installment_group && !t.bill_id) vari[k] = (vari[k] ?? 0) + Number(t.amount);
  }
  const used = past.filter((k) => seen.has(k));
  const avg = (o: Record<string, number>) => (used.length ? used.reduce((s, k) => s + (o[k] ?? 0), 0) / used.length : 0);
  const incAvg = avg(inc);
  const varAvg = avg(vari);

  const out: MonthForecast[] = [];
  for (let i = 0; i < months; i++) {
    const key = addMonths(`${cur}-01`, i).slice(0, 7);
    const isCur = i === 0;
    let actualInc = 0;
    let installments = 0;
    let spent = 0;
    let varSpent = 0;
    for (const t of txs ?? []) {
      if (String(t.occurred_on).slice(0, 7) !== key) continue;
      const v = Number(t.amount);
      if (t.kind === 'income') actualInc += v;
      else {
        spent += v;
        if (t.installment_group) installments += v;
        else if (!t.bill_id) varSpent += v;
      }
    }
    // contas em aberto que caem neste mês (as recorrentes se repetem)
    let billsK = 0;
    for (const b of bills ?? []) {
      const bk = String(b.due_date).slice(0, 7);
      if (bk > key) continue;
      if (bk === key) billsK += Number(b.amount);
      else if (b.recurrence === 'monthly') billsK += Number(b.amount);
      else if (b.recurrence === 'yearly' && bk.slice(5) === key.slice(5)) billsK += Number(b.amount);
    }
    // contas vencidas e não pagas pesam no mês atual
    const income = Math.max(actualInc, isCur && used.length === 0 ? actualInc : incAvg);
    const variable = isCur ? Math.max(0, varAvg - varSpent) : varAvg;
    const outflow = isCur ? spent + billsK + variable : spent + billsK + variable; // no futuro "spent" = parcelas/compras já datadas
    out.push({
      key,
      label: monthName(`${key}-01`).slice(0, 3),
      current: isCur,
      income: r2(income),
      bills: r2(billsK),
      installments: r2(installments),
      variable: r2(variable),
      spent: r2(isCur ? spent : 0),
      outflow: r2(outflow),
      balance: r2(income - outflow),
    });
  }
  return { months: out, incomeAvg: r2(incAvg), variableAvg: r2(varAvg), monthsOfHistory: used.length };
}
