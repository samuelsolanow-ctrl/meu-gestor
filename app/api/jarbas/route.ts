import { NextResponse } from 'next/server';
import { getContext } from '@/lib/context';
import { cleanFiles, runJarbas } from '@/lib/jarbasRun';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'A chave da IA (ANTHROPIC_API_KEY) ainda não foi configurada na Vercel.' }, { status: 500 });
  }
  const ctx = await getContext();
  const body = await req.json().catch(() => ({}));
  const files = cleanFiles(body?.files);
  const typed = String(body?.message ?? '').trim().slice(0, 2000);
  const text = typed || (files.length ? 'Veja o anexo.' : '');
  if (!text) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
  const attachNote = files.length ? `[Anexo: ${files.map((f) => f.name || (f.kind === 'pdf' ? 'PDF' : 'foto')).join(', ')}] ` : '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      try {
        const { actions } = await runJarbas({
          ctx,
          text,
          files,
          stored: attachNote + text,
          onText: (d) => send({ t: 'text', d }),
          onAction: (a) => send({ t: 'action', a }),
        });
        send({ t: 'done', refresh: actions.length > 0 });
      } catch (e: any) {
        console.error('Jarbas error', e);
        send({ t: 'error', d: e?.status === 401 ? 'A chave da IA parece inválida. Confira a ANTHROPIC_API_KEY na Vercel.' : 'Tive um problema para responder agora. Tente de novo.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
