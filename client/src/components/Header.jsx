import { Bell, Search, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

export default function Header({ title, onMenuToggle }) {
  const { user } = useAuth();
  const { t } = useLocale();
  return (
    <header className="h-14 bg-astra-surface border-b border-astra-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 text-astra-text-muted hover:text-astra-text hover:bg-astra-muted rounded-lg transition-colors"
        >
          <Menu size={18} />
        </button>
        <h1 className="text-sm font-semibold text-astra-text">{title}</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted" size={13} />
          <input
            type="text"
            placeholder={t('search') + '...'}
            className="bg-astra-card border border-astra-border rounded-lg pl-8 pr-4 py-1.5 text-xs text-astra-text placeholder-astra-text-muted focus:outline-none focus:border-accent w-48 transition-colors"
          />
        </div>
        <button className="relative p-2 text-astra-text-muted hover:text-astra-text hover:bg-astra-muted rounded-lg transition-colors">
          <Bell size={15} />
        </button>
        <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center border border-accent/30">
          <span className="text-accent text-[11px] font-bold">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
        </div>
      </div>
    </header>
  );
}
