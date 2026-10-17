'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { IconLogo } from '@/components/icons';

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).',
  'User already registered': 'Este e-mail já tem conta. Use "Entrar".',
};

export default function EntrarPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const supabase = createClient();
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace('/');
        router.refresh();
      } else {
        if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (error) throw error;
        if (data.session) {
          router.replace('/bem-vindo');
          router.refresh();
        } else {
          setInfo('Conta criada! Abra o e-mail de confirmação que enviamos e depois volte aqui para entrar.');
          setMode('entrar');
        }
      }
    } catch (err: any) {
      setError(ERRORS[err?.message] ?? err?.message ?? 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-mark"><IconLogo /></span>
        Meu Gestor
      </div>
      <h1 className="hero-title">As finanças da família, num lugar só.</h1>

      <div className="seg" role="tablist" aria-label="Entrar ou criar conta">
        <a href="#" role="tab" aria-selected={mode === 'entrar'} className={mode === 'entrar' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setMode('entrar'); setError(''); }}>Entrar</a>
        <a href="#" role="tab" aria-selected={mode === 'criar'} className={mode === 'criar' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setMode('criar'); setError(''); }}>Criar conta</a>
      </div>

      <form className="stack" onSubmit={submit}>
        {mode === 'criar' && (
          <label className="field">
            <span>Seu nome</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="given-name" placeholder="Samuel" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" placeholder="voce@email.com" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {info && <p className="notice" role="status">{info}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </main>
  );
}
