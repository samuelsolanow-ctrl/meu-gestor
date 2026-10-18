'use client';

import { useEffect, useState } from 'react';
import { VOICE_OPTIONS, getRate, getVoiceName, hasServerVoice, say, setRate, setVoiceName, stopVoice, unlockAudio } from '@/lib/voice';
import { IconSpeaker } from './icons';

const SAMPLE = 'Boa tarde, Samuel. Hoje você tem um Pix às três da tarde, e a conta de energia vence amanhã. Quer que eu te lembre?';

const RATES = [
  { v: 0.9, label: 'Pausada' },
  { v: 0.97, label: 'Natural' },
  { v: 1.08, label: 'Rápida' },
];

export default function VoicePicker({ firstName }: { firstName: string }) {
  const [voice, setVoice] = useState('Charon');
  const [rate, setRateState] = useState(0.97);
  const [note, setNote] = useState('');

  useEffect(() => {
    setVoice(getVoiceName());
    setRateState(getRate());
  }, []);

  function preview(id: string) {
    unlockAudio();
    stopVoice();
    setVoiceName(id);
    setVoice(id);
    say(SAMPLE.replace('Samuel', firstName));
    setTimeout(() => {
      if (hasServerVoice() === false) setNote('A voz do Google ainda não está ligada: falta a chave GOOGLE_TTS_API_KEY na Vercel. Por enquanto toca a voz do iPhone.');
    }, 1500);
  }

  function pickRate(v: number) {
    setRate(v);
    setRateState(v);
    preview(voice);
  }

  return (
    <section className="card stack" aria-label="Voz do Jarbas">
      <div className="card-head"><h2>Voz do Jarbas</h2></div>
      <p className="small muted">Toque para ouvir. A que você tocar por último fica sendo a voz dele.</p>
      <div className="list" role="radiogroup" aria-label="Escolha a voz">
        {VOICE_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={voice === o.id}
            className={`item voice-opt ${voice === o.id ? 'on' : ''}`}
            onClick={() => preview(o.id)}
          >
            <span className="item-icon" aria-hidden="true"><IconSpeaker size={18} /></span>
            <span className="grow" style={{ textAlign: 'left' }}>
              <span className="item-title" style={{ display: 'block' }}>{o.label}</span>
              <span className="item-sub">{o.desc}</span>
            </span>
            {voice === o.id && <span className="chip-soft">Escolhida</span>}
          </button>
        ))}
      </div>
      <div className="field">
        <span>Ritmo da fala</span>
        <div className="seg" role="radiogroup" aria-label="Ritmo">
          {RATES.map((r) => (
            <a key={r.v} href="#" role="radio" aria-checked={rate === r.v} className={rate === r.v ? 'on' : ''} onClick={(e) => { e.preventDefault(); pickRate(r.v); }}>
              {r.label}
            </a>
          ))}
        </div>
      </div>
      {note && <p className="small" role="status">{note}</p>}
    </section>
  );
}
