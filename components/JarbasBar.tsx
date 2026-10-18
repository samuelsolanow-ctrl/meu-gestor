'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconMic, IconSend, IconStop } from './icons';

// Mesma "escuta" do chat (o iPhone pede o microfone uma vez por uso)
function getRecognition(): any | null {
  const w = window as any;
  if (w.__mgRec) return w.__mgRec;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;
  w.__mgRec = new SR();
  return w.__mgRec;
}

function unlockSpeech() {
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {}
}

const SUGGESTIONS = ['Gastei 50 no mercado', 'Me lembra às 15h', 'Resumo do mês'];

export default function JarbasBar({ tip }: { tip: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState('');
  const recRef = useRef<any>(null);

  function go(message: string) {
    const m = message.trim();
    if (!m) return;
    router.push(`/jarbas?q=${encodeURIComponent(m)}`);
  }

  function listen() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    unlockSpeech();
    const rec = getRecognition();
    if (!rec) {
      setHint('Use o microfone do teclado para ditar.');
      document.getElementById('jarbas-bar')?.focus();
      return;
    }
    recRef.current = rec;
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    let heard = '';
    let silence: any = null;
    const arm = () => {
      clearTimeout(silence);
      silence = setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, 900);
    };
    rec.onresult = (e: any) => {
      arm();
      let all = '';
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
      heard = all.trim();
      setText(heard);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') setHint('Libere o microfone em Ajustes › Apps › Safari.');
    };
    rec.onend = () => {
      clearTimeout(silence);
      setListening(false);
      if (heard) go(heard);
    };
    try {
      rec.start();
      setListening(true);
      setHint('');
    } catch {
      setHint('Não consegui ligar o microfone.');
    }
  }

  return (
    <section className="jbar-wrap" aria-label="Fale com o Jarbas">
      <form
        className={`jbar ${listening ? 'live' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          unlockSpeech();
          go(text);
        }}
      >
        <span className="jbar-avatar" aria-hidden="true">J</span>
        <label htmlFor="jarbas-bar" className="sr-only">Mensagem para o Jarbas</label>
        <input
          id="jarbas-bar"
          className="jbar-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? 'Ouvindo…' : 'Fale com o Jarbas…'}
          autoComplete="off"
          enterKeyHint="send"
        />
        {text.trim() && !listening ? (
          <button className="jbar-btn" aria-label="Enviar para o Jarbas"><IconSend /></button>
        ) : (
          <button type="button" className="jbar-btn" onClick={listen} aria-label={listening ? 'Parar de ouvir' : 'Falar com o Jarbas'}>
            {listening ? <IconStop /> : <IconMic />}
          </button>
        )}
      </form>

      {hint && <p className="small muted" role="status" style={{ margin: 0 }}>{hint}</p>}

      <div className="jbar-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => { unlockSpeech(); go(s); }}>{s}</button>
        ))}
      </div>

      <button type="button" className="jbar-tip" onClick={() => router.push('/jarbas')}>
        <span className="jbar-dot" aria-hidden="true" />
        <span><strong>Jarbas:</strong> {tip}</span>
      </button>
    </section>
  );
}
