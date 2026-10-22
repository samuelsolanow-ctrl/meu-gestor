'use client';

// Voz do Jarbas: voz neural do Google (pelo servidor) com reserva na voz do iPhone.
// O áudio toca pelo Web Audio, que o iPhone libera no primeiro toque e mantém liberado.

let ctx: AudioContext | null = null;
let playhead = 0;
let generation = 0;
let sources: AudioBufferSourceNode[] = [];
let chain: Promise<void> = Promise.resolve();
let serverVoice: boolean | null = null; // null = ainda não sabemos

export const VOICE_OPTIONS = [
  { id: 'Charon', label: 'Charon', desc: 'Grave e calma, tom de narrador' },
  { id: 'Algenib', label: 'Algenib', desc: 'Grave e rouca, bem marcante' },
  { id: 'Orus', label: 'Orus', desc: 'Firme e segura' },
  { id: 'Iapetus', label: 'Iapetus', desc: 'Clara e madura' },
  { id: 'Schedar', label: 'Schedar', desc: 'Serena e equilibrada' },
  { id: 'Umbriel', label: 'Umbriel', desc: 'Tranquila e suave' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Animada e enérgica' },
  { id: 'Puck', label: 'Puck', desc: 'Leve e simpática' },
];
const VOICE_KEY = 'mg-voz-nome';
const RATE_KEY = 'mg-voz-ritmo';
export function getVoiceName(): string {
  try {
    return localStorage.getItem(VOICE_KEY) || 'Charon';
  } catch {
    return 'Charon';
  }
}
export function setVoiceName(v: string) {
  try {
    localStorage.setItem(VOICE_KEY, v);
  } catch {}
}
export function getRate(): number {
  try {
    return Number(localStorage.getItem(RATE_KEY)) || 0.97;
  } catch {
    return 0.97;
  }
}
export function setRate(r: number) {
  try {
    localStorage.setItem(RATE_KEY, String(r));
  } catch {}
}
export function hasServerVoice() {
  return serverVoice;
}

export function cleanForSpeech(text: string) {
  return text
    .replace(/[*_#`>•]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chamar dentro de um toque (enviar, microfone): libera o áudio do app no iPhone. */
export function unlockAudio(forMic = false) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      ctx = ctx || new AC();
      ctx!.resume?.();
      if (forMic) return; // tocar qualquer som agora atrapalha o microfone
      const b = ctx!.createBuffer(1, 1, 22050);
      const s = ctx!.createBufferSource();
      s.buffer = b;
      s.connect(ctx!.destination);
      s.start(0);
    }
  } catch {}
}

/** Prepara a voz do iPhone (só quando NÃO vai abrir o microfone: ela derruba a escuta). */
export function unlockBrowserVoice() {
  try {
    if (serverVoice === true) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {}
}

export function stopVoice() {
  generation++;
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
  }
  sources = [];
  playhead = 0;
  chain = Promise.resolve();
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const pt = voices.filter((v) => v.lang?.toLowerCase().startsWith('pt-br'));
  return pt.find((v) => /premium|enhanced|aprimorad/i.test(v.name)) ?? pt.find((v) => /luciana|felipe/i.test(v.name)) ?? pt[0] ?? null;
}

function browserSay(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const v = pickBrowserVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    window.speechSynthesis?.speak(u);
  } catch {}
}

async function fetchAudio(text: string): Promise<ArrayBuffer | null> {
  if (serverVoice === false) return null;
  try {
    const res = await fetch('/api/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: getVoiceName(), rate: getRate() }) });
    if (res.status === 501) {
      serverVoice = false; // sem chave do Google: usa a voz do iPhone
      return null;
    }
    if (!res.ok) return null;
    serverVoice = true;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Fala um trecho. Vários trechos seguidos tocam em fila, sem cortes. */
export function say(raw: string) {
  const text = cleanForSpeech(raw);
  if (!text) return;
  const gen = generation;
  const audio = fetchAudio(text); // já começa a baixar enquanto o anterior toca
  chain = chain.then(async () => {
    const buf = await audio;
    if (gen !== generation) return;
    if (!buf || !ctx) {
      browserSay(text);
      return;
    }
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (gen !== generation) return;
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      const start = Math.max(ctx.currentTime + 0.02, playhead);
      src.start(start);
      playhead = start + decoded.duration;
      sources.push(src);
      src.onended = () => {
        sources = sources.filter((s) => s !== src);
      };
    } catch {
      browserSay(text);
    }
  });
}
