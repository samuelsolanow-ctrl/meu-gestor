import TabBar from '@/components/TabBar';
import AppLock from '@/components/AppLock';
import { getContext } from '@/lib/context';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Garante que a pessoa está logada e já faz parte de uma família
  await getContext();
  return (
    <AppLock>
      <div className="shell">
        {children}
        <TabBar />
      </div>
    </AppLock>
  );
}
