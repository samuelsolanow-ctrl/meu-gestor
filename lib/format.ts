const TZ = 'America/Sao_Paulo';

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(value: number | string | null | undefined): string {
  return brlFormatter.format(Number(value ?? 0));
}

/** Data de hoje em São Paulo, no formato AAAA-MM-DD */
export function todaySP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** Primeiro e último dia do mês de uma data AAAA-MM-DD */
export function monthRange(isoDate: string): { start: string; end: string; key: string } {
  const [y, m] = isoDate.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}`, key: `${y}-${mm}` };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(Date.parse(isoDate + 'T00:00:00Z') + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Soma meses mantendo o dia (ajusta para o último dia quando o mês é mais curto) */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function monthName(isoDate: string): string {
  return MONTHS[Number(isoDate.slice(5, 7)) - 1];
}

/** "20 de outubro" */
export function longDate(isoDate: string): string {
  return `${Number(isoDate.slice(8, 10))} de ${monthName(isoDate)}`;
}

/** "qui, 22/10" */
export function shortDate(isoDate: string): string {
  const d = new Date(Date.parse(isoDate + 'T12:00:00Z'));
  return `${WEEKDAYS[d.getUTCDay()]}, ${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

/** Texto de vencimento relativo a hoje */
export function dueLabel(dueIso: string, today: string): { text: string; tone: 'late' | 'soon' | 'normal' } {
  const diff = daysBetween(today, dueIso);
  if (diff < 0) return { text: diff === -1 ? 'Venceu ontem' : `Venceu há ${-diff} dias`, tone: 'late' };
  if (diff === 0) return { text: 'Vence hoje', tone: 'soon' };
  if (diff === 1) return { text: 'Vence amanhã', tone: 'soon' };
  if (diff <= 3) return { text: `Vence em ${diff} dias`, tone: 'soon' };
  return { text: longDate(dueIso), tone: 'normal' };
}

/** Converte "1.234,56" ou "1234.56" em número */
export function parseMoney(input: string | null | undefined): number {
  if (!input) return NaN;
  let s = String(input).trim().replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.500" = mil e quinhentos
  return Number(s);
}
