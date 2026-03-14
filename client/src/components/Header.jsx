import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Menu, ClipboardList, Megaphone, MessageSquare, Phone, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';

export default function Header({ title, onMenuToggle }) {
  const { user, api } = useAuth();
  const { t } = useLocale();
  const { socket } = useSocket() || {};
  const navigate = useNavigate();

  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  // Fetch notifications
  const fetchNotifs = async () => {
    try {
      const [notifsRes, countRes] = await Promise.all([
        api('/api/notifications').then(r => r.json()),
        api('/api/notifications/unread-count').then(r => r.json()),
      ]);
      setNotifications(notifsRes);
      setUnreadCount(countRes.count || 0);
    } catch {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Listen for real-time notifications via socket
  useEffect(() => {
    if (!socket) return;
    const onNotification = (notif) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      setUnreadCount(prev => prev + 1);
    };
    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, [socket]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    if (showNotifs) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifs]);

  const markAsRead = async (id) => {
    await api(`/api/notifications/${id}/read`, { method: 'PUT' }).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await api('/api/notifications/read-all', { method: 'PUT' }).catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  };

  const handleNotifClick = (notif) => {
    if (!notif.is_read) markAsRead(notif.id);
    setShowNotifs(false);
    if (notif.reference_type === 'task') navigate('/tasks');
    else if (notif.reference_type === 'conversation') navigate('/messaging');
    else if (notif.reference_type === 'announcement') navigate('/tasks');
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'task_assigned': return <ClipboardList size={14} className="text-accent" />;
      case 'announcement': return <Megaphone size={14} className="text-orange-400" />;
      case 'new_message': return <MessageSquare size={14} className="text-green-400" />;
      case 'incoming_call': return <Phone size={14} className="text-blue-400" />;
      default: return <Bell size={14} className="text-astra-text-muted" />;
    }
  };

  const getNotifTypeLabel = (type) => {
    switch (type) {
      case 'task_assigned': return t('notif_task_assigned');
      case 'announcement': return t('notif_announcement');
      case 'new_message': return t('notif_new_message');
      case 'incoming_call': return t('notif_incoming_call');
      default: return '';
    }
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notif_just_now');
    if (mins < 60) return `${mins} ${t('notif_minutes_ago')}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ${t('notif_hours_ago')}`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

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

        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 text-astra-text-muted hover:text-astra-text hover:bg-astra-muted rounded-lg transition-colors"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] md:w-[360px] max-h-[70vh] bg-astra-surface border border-astra-border rounded-xl shadow-xl overflow-hidden z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-astra-border bg-astra-card/50">
                <h3 className="text-sm font-bold text-astra-text">{t('notif_title')}</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1"
                  >
                    <CheckCheck size={12} /> {t('notif_mark_all_read')}
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="overflow-y-auto max-h-[calc(70vh-48px)]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell size={32} className="text-astra-text-muted/30 mx-auto mb-2" />
                    <p className="text-xs text-astra-text-muted">{t('notif_no_notifications')}</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`w-full text-left px-4 py-3 border-b border-astra-border/30 hover:bg-astra-muted/30 transition-colors flex items-start gap-3 ${
                        !notif.is_read ? 'bg-accent/5' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-astra-card border border-astra-border flex items-center justify-center shrink-0 mt-0.5">
                        {getNotifIcon(notif.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-astra-text-muted uppercase">
                            {getNotifTypeLabel(notif.type)}
                          </span>
                          {!notif.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-medium text-astra-text truncate mt-0.5">{notif.title}</p>
                        {notif.message && (
                          <p className="text-[11px] text-astra-text-muted truncate">{notif.message}</p>
                        )}
                        <p className="text-[10px] text-astra-text-muted/60 mt-1">{timeAgo(notif.created_at)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center border border-accent/30">
          <span className="text-accent text-[11px] font-bold">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
        </div>
      </div>
    </header>
  );
}
