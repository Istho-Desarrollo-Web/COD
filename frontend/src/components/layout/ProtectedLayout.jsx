import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import FloatingHeader from './FloatingHeader';
import Sidebar from './Sidebar';

export default function ProtectedLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-centhrix-bg dark:to-centhrix-bg">
      <FloatingHeader onToggleSidebar={() => setCollapsed((prev) => !prev)} currentPath={location.pathname} />
      <Sidebar collapsed={collapsed} />
      <main className={`pt-28 pb-8 px-4 transition-all duration-200 ${collapsed ? 'pl-24' : 'pl-64'}`}>
        <div className="max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
