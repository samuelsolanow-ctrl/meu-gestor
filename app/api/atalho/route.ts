import { NextResponse } from 'next/server';
import { atalhoUser } from '@/lib/secrets';
import { contextForUser } from '@/lib/userContext';
import { runJarbas } from '@/lib/jarbasRun';
import { pushToUser, serviceClient } from '@/lib/push';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Atalhos do iPhone:
//   Siri  → POST /api/atalho  { "texto": "gastei 50 no mercado" }            (responde em texto para a Siri falar)
//   SMS   → POST /api/atalho  { "texto": "<SMS do banco>", "origem": "sms" } (lança a compra e avisa por notificação)
// A chave pessoal vai no cabeçalho "Authorization: Bearer <chave>" ou em ?k=<chave>.

const plain = (text: string, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('k');
  const userId = atalhoUser(auth);
  if (!userId) return plain('Chave do atalho inválida. Copie de novo em Mais › Siri e atalhos.', 401);

  const ctype = req.headers.get('content-type') || '';
  let body: any = {};
  if (ctype.includes('application/json')) body = await req.json().catch(() => ({}));
  else if (ctype.includes('form')) body = Object.fromEntries((await req.formData()).entries());
  else body = { texto: await req.text() };
  // aceita "texto", "Texto", "text"… ou o primeiro campo com texto que vier
  const lower: Record<string, any> = Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k.toLowerCase().trim(), v]));
  const firstText = Object.entries(lower).find(([k, v]) => k !== 'origem' && typeof v === 'string' && v.trim())?.[1];
  const texto = String(lower.texto ?? lower.text ?? lower.mensagem ?? firstText ?? '').trim().slice(0, 1500);
  const origem = String(lower.origem ?? url.searchParams.get('origem') ?? 'siri').toLowerCase() === 'sms' ? 'sms' : 'siri';
  if (!texto) return plain('Não ouvi nada. Tente de novo.', 400);

  try {
    const ctx = await contextForUser(userId);
    const sms = origem === 'sms';
    const { reply, actions } = await runJarbas({
      ctx,
      text: texto,
      stored: sms ? `[SMS do banco] ${texto}` : `[Siri] ${texto}`,
      note: sms
        ? 'MENSAGEM AUTOMÁTICA: é um SMS/notificação do banco encaminhado pelo atalho do iPhone, não a pessoa falando. Se for uma COMPRA aprovada/débito/Pix enviado, lance com registrar_lancamento (valor, estabelecimento como descrição, categoria mais provável, cartão/conta pelo final ou nome do banco, parcelas se houver, espaço casal). Antes, veja nos últimos lançamentos se ela já foi lançada (mesmo valor no mesmo dia) e não duplique. Se for Pix/salário recebido, lance como receita. Se for código de segurança, propaganda, fatura fechada ou qualquer outra coisa, NÃO lance nada e responda só "ignorado". Responda em uma frase curta.'
        : 'Mensagem enviada pela Siri: a resposta será falada em voz alta. Uma frase curta, sem números longos desnecessários.',
    });
    if (sms) {
      if (actions.length) {
        await pushToUser(serviceClient(), userId, { title: 'Jarbas · lançado do SMS', body: reply, url: '/jarbas', tag: `sms-${Date.now()}` }).catch(() => 0);
      }
      return NextResponse.json({ ok: true, lancado: actions.length > 0, resposta: reply });
    }
    return plain(reply);
  } catch (e: any) {
    console.error('atalho', e);
    return plain('O Jarbas não conseguiu responder agora. Tente de novo em instantes.', 500);
  }
}

export async function GET() {
  return plain('Atalho do Jarbas funcionando. Use POST com { "texto": "..." }.');
}
