import { useState, useEffect } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { t } = useLocale();
  const titleKey = pageTitleKeys[location.pathname];
  const title = titleKey ? t(titleKey) : 'Astly';

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-astra-bg">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className={`transition-all duration-300 min-h-screen flex flex-col ml-0 ${collapsed ? 'md:ml-[72px]' : 'md:ml-64'}`}
      >
        <Header title={title} onMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
