import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Voz neural do Google (Chirp 3 HD). Precisa de GOOGLE_TTS_API_KEY na Vercel.
// Troque a voz com JARBAS_VOICE (ex.: pt-BR-Chirp3-HD-Orus, pt-BR-Chirp3-HD-Charon).
// Vozes masculinas que a pessoa pode escolher em Mais › Voz do Jarbas
const ALLOWED = ['Charon', 'Orus', 'Iapetus', 'Algenib', 'Schedar', 'Fenrir', 'Umbriel', 'Puck'];
const DEFAULT_VOICE = process.env.JARBAS_VOICE || 'pt-BR-Chirp3-HD-Charon';

function forSpeech(text: string) {
  return text
    .replace(/R\$\s?([\d.]+),(\d{2})/g, (_m, inteiro, cent) => `${inteiro.replace(/\./g, '')} reais${cent !== '00' ? ` e ${Number(cent)} centavos` : ''}`)
    .slice(0, 800);
}

export async function POST(req: Request) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return NextResponse.json({ error: 'Voz do Google não configurada' }, { status: 501 });

  const { text, voice, rate } = await req.json().catch(() => ({ text: '' }));
  const chosen = ALLOWED.includes(String(voice)) ? `pt-BR-Chirp3-HD-${voice}` : DEFAULT_VOICE;
  const speakingRate = Math.min(1.25, Math.max(0.8, Number(rate) || 0.97));
  const VOICES = [chosen, 'pt-BR-Neural2-B'];
  const input = forSpeech(String(text ?? '').trim());
  if (!input) return NextResponse.json({ error: 'Texto vazio' }, { status: 400 });

  for (const name of VOICES) {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: input },
        voice: { languageCode: 'pt-BR', name },
        audioConfig: { audioEncoding: 'MP3', speakingRate },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return new Response(Buffer.from(data.audioContent, 'base64'), {
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' },
      });
    }
    const err = await res.text();
    console.error('Google TTS', name, res.status, err.slice(0, 300));
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: 'Chave do Google recusada', detail: err.slice(0, 300) }, { status: 502 });
    }
    // voz indisponível: tenta a próxima
  }
  return NextResponse.json({ error: 'Não foi possível gerar a voz' }, { status: 502 });
}
