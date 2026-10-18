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
function getRecognition(): any | null {
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
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

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
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

export default function ChatClient({ initial, firstName }: { initial: { id: string; role: 'user' | 'assistant'; content: string }[]; firstName: string }) {
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
    if (voiceOnRef.current) unlockSpeech();
    setText('');
    setHint('');
    setBusy(true);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: message }]);
    try {
      const res = await fetch('/api/jarbas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      const actionMsgs: Msg[] = (data.actions ?? []).map((a: Action, i: number) => ({ id: `a${Date.now()}${i}`, role: 'action', content: '', action: a }));
      const reply = data.reply ?? data.error ?? 'Não consegui responder agora.';
      setMsgs((m) => [...m, ...actionMsgs, { id: `b${Date.now()}`, role: 'assistant', content: reply }]);
      if (voiceOnRef.current) speak(reply);
      if (actionMsgs.length) router.refresh();
    } catch {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: 'Sem conexão. Tente de novo.' }]);
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
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText((finalText + interim).trim());
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
      setListening(false);
      const said = finalText.trim();
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
          ) : (
            <div key={m.id} className="bubble bot">
              {m.content}
              <button type="button" className="listen" onClick={() => speak(m.content)} aria-label="Ouvir esta resposta">
                <IconSpeaker size={15} /> Ouvir
              </button>
            </div>
          ),
        )}
        {busy && <div className="typing" role="status">Jarbas está pensando…</div>}
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
