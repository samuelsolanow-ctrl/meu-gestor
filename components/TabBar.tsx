'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconBills, IconChat, IconHome, IconMore, IconPlus } from './icons';

export default function TabBar() {
  const path = usePathname();
  const on = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  return (
    <nav className="tabbar" aria-label="Menu principal">
      <div className="tabbar-inner">
        <Link href="/" className={`tab ${on('/') ? 'on' : ''}`} aria-current={on('/') ? 'page' : undefined}>
          <IconHome />
          Início
        </Link>
        <Link href="/contas" className={`tab ${on('/contas') ? 'on' : ''}`} aria-current={on('/contas') ? 'page' : undefined}>
          <IconBills />
          Contas
        </Link>
        <Link href="/jarbas" className="tab-main" aria-label="Falar com o Jarbas">
          <IconChat />
        </Link>
        <Link href="/lancar" className={`tab ${on('/lancar') ? 'on' : ''}`} aria-current={on('/lancar') ? 'page' : undefined}>
          <IconPlus />
          Lançar
        </Link>
        <Link href="/mais" className={`tab ${on('/mais') ? 'on' : ''}`} aria-current={on('/mais') ? 'page' : undefined}>
          <IconMore />
          Mais
        </Link>
      </div>
    </nav>
  );
}
