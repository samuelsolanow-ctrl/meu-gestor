# Meu Gestor

Assessor financeiro da família, com a IA **Jarbas**. App web instalável no iPhone (PWA), feito com Next.js, Supabase e a API do Claude.

## Fase 1 (esta versão)

- Login, criação da família e convite por código
- Espaços **Casal** (compartilhado) e **pessoal** (só de cada um)
- Painel do mês: sobra, entradas, saídas, próximas contas, metas, últimos lançamentos
- Lançamentos por formulário
- Contas a pagar com recorrência; marcar como paga lança a despesa e cria a próxima
- Contas e cartões, metas
- Chat com o Jarbas: lança gastos, cadastra e paga contas, responde sobre o mês, cuida de metas

## Banco de dados

Rode `supabase/01_estrutura.sql` no SQL Editor do Supabase.

## Variáveis na Vercel

| Nome | Onde pegar |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Project Settings › Data API › Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase › Project Settings › API Keys › publishable |
| `ANTHROPIC_API_KEY` | platform.claude.com › API Keys |
| `JARBAS_MODEL` (opcional) | modelo do Claude usado pelo Jarbas |

A chave *secret* do Supabase não é usada nesta fase.
