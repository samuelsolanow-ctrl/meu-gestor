// Agenda e lembretes do Jarbas (horários sempre no fuso de São Paulo)

const TZ = 'America/Sao_Paulo';

/** "2026-10-19T08:00" (hora local) → Date. Aceita também data sem hora. */
export function parseLocal(s: string): Date {
  const v = String(s).trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) return new Date(v);
  const [d, t = '09:00'] = v.split(/[T ]/);
  const hhmm = t.length === 5 ? `${t}:00` : t;
  return new Date(`${d}T${hhmm}-03:00`);
}

export function fmtWhen(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + 86_400_000));
  const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(date);
  if (day === today) return `hoje às ${hour}`;
  if (day === tomorrow) return `amanhã às ${hour}`;
  const label = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
  return `${label.replace('.', '')} às ${hour}`;
}

export function localIso(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

// ---------- Calendário (.ics) para o app Calendário do iPhone ----------
const icsDate = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
};

export function buildIcs(events: any[], calName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meu Gestor//Jarbas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const e of events) {
    const start = new Date(e.starts_at);
    const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + (e.kind === 'reminder' ? 15 : 60) * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@meugestor`,
      `DTSTAMP:${icsDate(e.created_at ?? new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${esc(e.kind === 'reminder' ? `Lembrete: ${e.title}` : e.title)}`,
    );
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    if (e.remind_at) {
      const mins = Math.max(0, Math.round((start.getTime() - new Date(e.remind_at).getTime()) / 60_000));
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${mins}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
