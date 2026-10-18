'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { IconLogo } from '@/components/icons';

export default function BemVindoPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'criar' | 'entrar'>('criar');
  const [familyName, setFamilyName] = useState('');
  const [myName, setMyName] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const supabase = createClient();
    try {
      if (mode === 'criar') {
        const { data, error } = await supabase.rpc('create_family', { family_name: familyName.trim(), my_name: myName.trim() });
        if (error) throw error;
        setCreatedCode(String(data));
      } else {
        const { error } = await supabase.rpc('join_family', { code: code.trim(), my_name: myName.trim() });
        if (error) throw error;
        router.replace('/');
        router.refresh();
      }
    } catch (err: any) {
      if (String(err?.message).includes('já faz parte')) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(err?.message ?? 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  if (createdCode) {
    return (
      <main className="auth">
        <div className="brand"><span className="brand-mark"><IconLogo /></span>Meu Gestor</div>
        <h1 className="hero-title">Família criada!</h1>
        <div className="card stack">
          <p className="label">Código de convite para a Laís (ou quem for dividir a Família com você):</p>
          <p className="code">{createdCode}</p>
          <p className="small muted">Ela cria a conta dela, escolhe “Entrar com código” e digita esse código. Você também encontra o código depois em Mais.</p>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => { router.replace('/'); router.refresh(); }}>Abrir o Meu Gestor</button>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="brand"><span className="brand-mark"><IconLogo /></span>Meu Gestor</div>
      <h1 className="hero-title">Vamos montar o espaço da família.</h1>

      <div className="seg" role="tablist" aria-label="Criar família ou entrar com código">
        <a href="#" role="tab" aria-selected={mode === 'criar'} className={mode === 'criar' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setMode('criar'); setError(''); }}>Criar família</a>
        <a href="#" role="tab" aria-selected={mode === 'entrar'} className={mode === 'entrar' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setMode('entrar'); setError(''); }}>Entrar com código</a>
      </div>

      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Como quer ser chamado(a)?</span>
          <input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} required placeholder="Seu nome" />
        </label>
        {mode === 'criar' ? (
          <label className="field">
            <span>Nome da família</span>
            <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} required placeholder="Família Solano" />
          </label>
        ) : (
          <label className="field">
            <span>Código de convite</span>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="A85158" style={{ letterSpacing: 4 }} />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'criar' ? 'Criar família' : 'Entrar na família'}
        </button>
      </form>
    </main>
  );
}
