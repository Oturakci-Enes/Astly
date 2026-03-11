import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useLocale } from '../context/LocaleContext';

const pageTitleKeys = {
  '/': 'menu_dashboard',
  '/tasks': 'menu_tasks',
  '/messaging': 'menu_messaging',
  '/settings': 'settings_title',
};

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { t } = useLocale();
  const titleKey = pageTitleKeys[location.pathname];
  const title = titleKey ? t(titleKey) : 'Astly';

  return (
    <div className="min-h-screen bg-astra-bg">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        className={`transition-all duration-300 ${collapsed ? 'ml-[72px]' : 'ml-64'} min-h-screen flex flex-col`}
      >
        <Header title={title} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
