import TabBar from '@/components/TabBar';
import AppLock from '@/components/AppLock';
import { cookies } from 'next/headers';
import { getContext } from '@/lib/context';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Garante que a pessoa está logada e já faz parte de uma família
  await getContext();
  const locked = (await cookies()).get('mg-lock')?.value === '1';
  return (
    <AppLock initialLocked={locked}>
      <div className="shell">
        {children}
        <TabBar />
      </div>
    </AppLock>
  );
}
