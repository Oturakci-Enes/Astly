import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, MessageSquare,
  Settings, LogOut, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import WorkOSLogo from './WorkOSLogo';

const menuConfig = [
  {
    groupKey: 'menu_main',
    items: [
      { path: '/', icon: LayoutDashboard, labelKey: 'menu_dashboard', moduleId: 'dashboard' },
    ],
  },
  {
    groupKey: 'menu_management',
    items: [
      { path: '/tasks', icon: ClipboardList, labelKey: 'menu_tasks', moduleId: 'tasks' },
      { path: '/messaging', icon: MessageSquare, labelKey: 'menu_messaging', moduleId: 'messaging' },
    ],
  },
  {
    groupKey: 'menu_system',
    items: [
      { path: '/settings', icon: Settings, labelKey: 'menu_settings', moduleId: '_settings' },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { logout, user, hasAccess } = useAuth();
  const { t } = useLocale();

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-astra-surface border-r border-astra-border flex flex-col transition-all duration-300 z-50
        ${collapsed ? 'md:w-[72px]' : 'md:w-64'}
        ${mobileOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-astra-border flex-shrink-0">
        <WorkOSLogo size={30} showText={true} collapsed={collapsed} />
        <div className="flex items-center gap-1">
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="md:hidden text-astra-text-muted hover:text-astra-text transition-colors p-1 rounded"
          >
            <X size={18} />
          </button>
          {/* Desktop collapse button */}
          {!collapsed && (
            <button
              onClick={onToggle}
              className="hidden md:block text-astra-text-muted hover:text-astra-text transition-colors p-1 rounded"
            >
              <ChevronLeft size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {menuConfig.map(({ groupKey, items }) => {
          const visibleItems = items.filter(item =>
            item.moduleId === '_settings' || hasAccess(item.moduleId)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={groupKey} className="mb-1">
              {!collapsed && (
                <p className="text-[9px] font-bold text-astra-text-muted uppercase tracking-widest px-5 pt-3 pb-1">
                  {t(groupKey)}
                </p>
              )}
              {collapsed && <div className="h-2 hidden md:block" />}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 mx-2 mb-0.5 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                      isActive
                        ? 'bg-accent/15 text-accent border border-accent/25'
                        : 'text-astra-text-muted hover:text-astra-text hover:bg-astra-muted/40'
                    } ${collapsed ? 'md:justify-center' : ''}`
                  }
                  title={collapsed ? t(item.labelKey) : undefined}
                >
                  <item.icon size={17} className="flex-shrink-0" />
                  <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Expand button */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="hidden md:flex mx-2 mb-2 p-2.5 text-astra-text-muted hover:text-astra-text hover:bg-astra-muted rounded-lg transition-colors justify-center"
        >
          <ChevronRight size={15} />
        </button>
      )}

      {/* User & Logout */}
      <div className="p-3 border-t border-astra-border flex-shrink-0">
        {(!collapsed || mobileOpen) && (
          <div className="flex items-center gap-2.5 mb-2 px-2 py-2 rounded-lg bg-astra-muted/20">
            <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0 border border-accent/30">
              <span className="text-accent text-xs font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-astra-text truncate">{user?.name}</p>
              <p className="text-[10px] text-astra-text-muted truncate">{t(`role_${user?.role}`) || user?.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={`flex items-center gap-2.5 w-full px-3 py-2 text-astra-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors text-sm ${
            collapsed && !mobileOpen ? 'md:justify-center' : ''
          }`}
          title={t('logout')}
        >
          <LogOut size={15} />
          <span className={`font-medium ${collapsed && !mobileOpen ? 'md:hidden' : ''}`}>{t('logout')}</span>
        </button>
      </div>
    </aside>
  );
}
