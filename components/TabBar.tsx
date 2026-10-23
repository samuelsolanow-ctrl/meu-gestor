'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconCard, IconChat, IconHome, IconList, IconMore } from './icons';

export default function TabBar() {
  const path = usePathname();
  const on = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  return (
    <nav className="tabbar" aria-label="Menu principal">
      <div className="tabbar-inner">
        <Link prefetch href="/" className={`tab ${on('/') ? 'on' : ''}`} aria-current={on('/') ? 'page' : undefined}>
          <IconHome />
          Início
        </Link>
        <Link prefetch href="/extrato" className={`tab ${on('/extrato') ? 'on' : ''}`} aria-current={on('/extrato') ? 'page' : undefined}>
          <IconList />
          Extrato
        </Link>
        <Link prefetch href="/jarbas" className="tab-main" aria-label="Falar com o Jarbas">
          <IconChat />
        </Link>
        <Link prefetch href="/cartoes" className={`tab ${on('/cartoes') ? 'on' : ''}`} aria-current={on('/cartoes') ? 'page' : undefined}>
          <IconCard />
          Cartões
        </Link>
        <Link prefetch href="/mais" className={`tab ${on('/mais') ? 'on' : ''}`} aria-current={on('/mais') ? 'page' : undefined}>
          <IconMore />
          Mais
        </Link>
      </div>
    </nav>
  );
}
