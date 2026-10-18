'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconCheck, IconMic, IconSend, IconSpeaker, IconSpeakerOff, IconStop } from './icons';

type Action = { kind: string; title: string; sub: string; amount?: number; income?: boolean };
type Msg = { id: string; role: 'user' | 'assistant' | 'action'; content: string; action?: Action };

const brl = (n?: number) => (n == null ? '' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n));

const SUGGESTIONS = ['Resumo do mês', 'Contas desta semana', 'Quanto gastamos com mercado?', 'Gastei 50 na farmácia'];
const VOICE_KEY = 'mg-voz';

// ---------- Voz (tudo pelo próprio iPhone, sem custo) ----------
// Uma única "escuta" para o app inteiro: o iPhone pede o microfone uma vez por uso, não a cada áudio
function getRecognition(): any | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (w.__mgRec) return w.__mgRec;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;
  w.__mgRec = new SR();
  return w.__mgRec;
}

function cleanForSpeech(text: string) {
  return text
    .replace(/[*_#`>]/g, '')
    .replace(/R\$\s?([\d.]+),(\d{2})/g, (_m, inteiro, cent) => `${inteiro.replace(/\./g, '')} reais${cent !== '00' ? ` e ${Number(cent)} centavos` : ''}`)
    .replace(/\s+/g, ' ')
    .trim();
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const pt = voices.filter((v) => v.lang?.toLowerCase().startsWith('pt-br'));
  return pt.find((v) => /luciana|felipe|premium|enhanced|aprimorad/i.test(v.name)) ?? pt[0] ?? null;
}

function speak(text: string, queue = false) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text.trim()) return;
    if (!queue) synth.cancel();
    const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
    u.lang = 'pt-BR';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    synth.speak(u);
  } catch {}
}

// O iPhone só deixa falar depois de um toque: "destrava" a voz no toque de enviar
function unlockSpeech() {
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {}
}

export default function ChatClient({ initial, firstName, initialQuery }: { initial: { id: string; role: 'user' | 'assistant'; content: string }[]; firstName: string; initialQuery?: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [hint, setHint] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const voiceOnRef = useRef(false);

  useEffect(() => {
    try {
      const on = localStorage.getItem(VOICE_KEY) === '1';
      setVoiceOn(on);
      voiceOnRef.current = on;
    } catch {}
    window.speechSynthesis?.getVoices?.(); // carrega a lista de vozes
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);

  // Mensagem vinda da barra do Início: envia na hora
  const sentInitial = useRef(false);
  useEffect(() => {
    if (initialQuery && !sentInitial.current) {
      sentInitial.current = true;
      window.history.replaceState(null, '', '/jarbas');
      send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    try {
      localStorage.setItem(VOICE_KEY, next ? '1' : '0');
    } catch {}
    if (next) {
      unlockSpeech();
      setHint('Respostas em voz ligadas.');
    } else {
      window.speechSynthesis?.cancel();
      setHint('Respostas em voz desligadas.');
    }
    setTimeout(() => setHint(''), 2500);
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    window.speechSynthesis?.cancel();
    if (voiceOnRef.current) unlockSpeech();
    setText('');
    setHint('');
    setBusy(true);
    const botId = `b${Date.now()}`;
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: message }, { id: botId, role: 'assistant', content: '' }]);

    let full = '';
    let spoken = 0;
    const speakReady = (final = false) => {
      if (!voiceOnRef.current) return;
      const rest = full.slice(spoken);
      const m = final ? rest.length : Math.max(rest.lastIndexOf('. '), rest.lastIndexOf('! '), rest.lastIndexOf('? '), rest.lastIndexOf('\n'));
      if (m <= 0) return;
      const cut = final ? rest.length : m + 1;
      speak(rest.slice(0, cut), true);
      spoken += cut;
    };
    const setBot = (content: string) => setMsgs((ms) => ms.map((x) => (x.id === botId ? { ...x, content } : x)));
    const addAction = (a: Action) =>
      setMsgs((ms) => {
        const i = ms.findIndex((x) => x.id === botId);
        const card: Msg = { id: `a${Date.now()}${Math.random()}`, role: 'action', content: '', action: a };
        return i < 0 ? [...ms, card] : [...ms.slice(0, i), card, ...ms.slice(i)];
      });

    try {
      const res = await fetch('/api/jarbas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body || !(res.headers.get('content-type') || '').includes('ndjson')) {
        const data = await res.json().catch(() => ({}));
        full = data.error ?? 'Não consegui responder agora.';
        setBot(full);
        speakReady(true);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let refresh = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev: any;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.t === 'text') {
            full += ev.d;
            setBot(full);
            speakReady();
          } else if (ev.t === 'action') {
            addAction(ev.a);
          } else if (ev.t === 'error') {
            full = full ? `${full}\n${ev.d}` : ev.d;
            setBot(full);
          } else if (ev.t === 'done') {
            refresh = !!ev.refresh;
          }
        }
      }
      speakReady(true);
      if (refresh) router.refresh();
    } catch {
      setBot(full || 'Sem conexão. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (voiceOnRef.current) unlockSpeech();
    const rec = getRecognition();
    if (!rec) {
      setHint('Toque na caixa de texto e use o microfone do teclado para ditar.');
      document.getElementById('msg')?.focus();
      return;
    }
    recRef.current = rec;
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    let lastHeard = '';
    let silence: any = null;
    const armSilence = () => {
      clearTimeout(silence);
      silence = setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, 900); // 0,9 s de silêncio = terminou de falar
    };
    rec.onresult = (e: any) => {
      armSilence();
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      const now = (finalText + interim).trim();
      setText(now);
      lastHeard = now;
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setHint('Permita o microfone nos ajustes do iPhone, ou use o microfone do teclado.');
      } else if (e?.error !== 'no-speech' && e?.error !== 'aborted') {
        setHint('Não consegui ouvir. Tente de novo.');
      }
    };
    rec.onend = () => {
      clearTimeout(silence);
      setListening(false);
      const said = (lastHeard || finalText).trim();
      if (said) send(said);
    };
    try {
      rec.start();
      setListening(true);
      setHint('Pode falar…');
    } catch {
      setHint('Não consegui ligar o microfone. Use o microfone do teclado.');
    }
  }

  const showMic = !text.trim() || listening;

  return (
    <>
      <div className="chat" style={{ paddingBottom: 170 }}>
        {msgs.length === 0 && (
          <div className="bubble bot">
            Oi, {firstName}! Eu sou o Jarbas. Me conte seus gastos do jeito que falaria com alguém, por exemplo “gastei 85 no mercado no cartão”, e eu lanço tudo. Pode escrever ou tocar no microfone e falar.
          </div>
        )}
        {msgs.map((m) =>
          m.role === 'action' && m.action ? (
            <div className="action-card" key={m.id}>
              <div className={`item-icon ${m.action.income ? 'income' : ''}`} style={{ width: 36, height: 36, borderRadius: 10 }}>
                {m.action.kind === 'paid' || m.action.kind === 'goal' ? <IconCheck /> : m.action.title.charAt(0)}
              </div>
              <div className="grow">
                <div className="item-title">{m.action.title}</div>
                <div className="item-sub">{m.action.sub}</div>
              </div>
              {m.action.amount != null && (
                <span className={`amount ${m.action.income ? 'income' : ''}`} style={{ fontSize: 15, fontWeight: 700 }}>
                  {m.action.kind === 'deleted' ? <s>{brl(m.action.amount)}</s> : brl(m.action.amount)}
                </span>
              )}
            </div>
          ) : m.role === 'user' ? (
            <div key={m.id} className="bubble user">{m.content}</div>
          ) : !m.content ? null : (
            <div key={m.id} className="bubble bot">
              {m.content}
              <button type="button" className="listen" onClick={() => speak(m.content)} aria-label="Ouvir esta resposta">
                <IconSpeaker size={15} /> Ouvir
              </button>
            </div>
          ),
        )}
        {busy && !msgs[msgs.length - 1]?.content && <div className="typing" role="status">Jarbas está pensando…</div>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="composer-inner">
          {hint ? (
            <div className="voice-hint" role="status">{hint}</div>
          ) : (
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          )}
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <button
              type="button"
              className={`btn btn-icon voice-toggle ${voiceOn ? 'on' : ''}`}
              onClick={toggleVoice}
              aria-pressed={voiceOn}
              aria-label={voiceOn ? 'Desligar respostas em voz' : 'Ligar respostas em voz'}
            >
              {voiceOn ? <IconSpeaker /> : <IconSpeakerOff />}
            </button>
            <label htmlFor="msg" className="sr-only">Mensagem para o Jarbas</label>
            <input
              id="msg"
              className="input"
              style={{ borderRadius: 22, height: 44 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={listening ? 'Ouvindo…' : 'Fale ou escreva para o Jarbas…'}
              autoComplete="off"
              enterKeyHint="send"
            />
            {showMic ? (
              <button
                type="button"
                className={`btn btn-primary btn-icon ${listening ? 'mic-live' : ''}`}
                onClick={startListening}
                disabled={busy}
                aria-label={listening ? 'Parar de ouvir' : 'Falar com o Jarbas'}
              >
                {listening ? <IconStop /> : <IconMic />}
              </button>
            ) : (
              <button className="btn btn-primary btn-icon" aria-label="Enviar" disabled={busy}>
                <IconSend />
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
