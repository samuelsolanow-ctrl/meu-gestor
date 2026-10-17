import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Para onde o link do e-mail de confirmação leva.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/bem-vindo', url.origin));
  }

  // O e-mail já foi confirmado pelo Supabase; se o link foi aberto em outro
  // navegador, a pessoa só precisa entrar com a senha.
  return NextResponse.redirect(new URL('/entrar?confirmado=1', url.origin));
}
