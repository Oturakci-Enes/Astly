import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { ClipboardList, MessageSquare, Users, Clock, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { api } = useAuth();
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/dashboard').then(r => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { stats, recentTasks, urgentTasks } = data;

  const statCards = [
    { label: t('db_total_tasks'), value: stats.totalTasks, icon: ClipboardList, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20' },
    { label: t('db_completed'), value: stats.completedTasks, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { label: t('db_in_progress'), value: stats.inProgressTasks, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { label: t('db_overdue'), value: stats.overdueTasks, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    { label: t('db_active_users'), value: stats.totalUsers, icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    { label: t('db_messages'), value: stats.totalMessages, icon: MessageSquare, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  ];

  const PRIORITY_COLOR = { urgent:'text-red-400', high:'text-orange-400', medium:'text-blue-400', low:'text-slate-400' };
  const PRIORITY_BG = { urgent:'bg-red-500/10 border-red-500/20', high:'bg-orange-500/10 border-orange-500/20', medium:'bg-blue-500/10 border-blue-500/20', low:'bg-slate-500/10 border-slate-500/20' };
  const STATUS_COLOR = { pending:'text-yellow-400', in_progress:'text-blue-400', completed:'text-green-400' };

  return (
    <div className="p-6 space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => (
          <div key={s.label} className={`astra-card p-4 ${s.border} border`}>
            <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center mb-2`}>
              <s.icon size={16} className={s.color} />
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-astra-text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Urgent Tasks */}
        <div className="astra-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-astra-border">
            <h3 className="text-sm font-semibold text-astra-text flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" /> {t('db_urgent_tasks')}
            </h3>
            <button onClick={() => navigate('/tasks')} className="text-[10px] text-accent hover:underline flex items-center gap-1">
              {t('db_view_all')} <ArrowRight size={10} />
            </button>
          </div>
          <div className="divide-y divide-astra-border">
            {urgentTasks.length === 0 && (
              <div className="p-6 text-center text-xs text-astra-text-muted">{t('db_no_urgent')}</div>
            )}
            {urgentTasks.map(task => (
              <div key={task.id} className="p-3 hover:bg-astra-surface/50 cursor-pointer" onClick={() => navigate('/tasks')}>
                <div className="flex items-start justify-between mb-1">
                  <h4 className="text-xs font-semibold text-astra-text">{task.title}</h4>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${PRIORITY_BG[task.priority]} ${PRIORITY_COLOR[task.priority]}`}>
                    {t(`tm_priority_${task.priority}`)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-astra-text-muted">
                  <span>{task.assigned_to_name || t('tm_not_assigned')}</span>
                  {task.due_date && <span>{task.due_date}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="astra-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-astra-border">
            <h3 className="text-sm font-semibold text-astra-text flex items-center gap-2">
              <Clock size={14} className="text-blue-400" /> {t('db_recent_tasks')}
            </h3>
            <button onClick={() => navigate('/tasks')} className="text-[10px] text-accent hover:underline flex items-center gap-1">
              {t('db_view_all')} <ArrowRight size={10} />
            </button>
          </div>
          <div className="divide-y divide-astra-border">
            {recentTasks.length === 0 && (
              <div className="p-6 text-center text-xs text-astra-text-muted">{t('db_no_tasks')}</div>
            )}
            {recentTasks.map(task => (
              <div key={task.id} className="p-3 hover:bg-astra-surface/50 cursor-pointer" onClick={() => navigate('/tasks')}>
                <div className="flex items-start justify-between mb-1">
                  <h4 className="text-xs font-semibold text-astra-text">{task.title}</h4>
                  <span className={`text-[9px] ${STATUS_COLOR[task.status]}`}>{t(`tm_${task.status}`)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-astra-text-muted">
                  <span>{task.assigned_to_name || t('tm_not_assigned')}</span>
                  {task.due_date && <span>{task.due_date}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/tasks')} className="astra-card p-4 hover:border-accent/30 transition-all text-left group">
          <ClipboardList size={20} className="text-accent mb-2 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold text-astra-text">{t('menu_tasks')}</p>
          <p className="text-[10px] text-astra-text-muted mt-0.5">{t('db_manage_tasks')}</p>
        </button>
        <button onClick={() => navigate('/messaging')} className="astra-card p-4 hover:border-accent/30 transition-all text-left group">
          <MessageSquare size={20} className="text-accent mb-2 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold text-astra-text">{t('menu_messaging')}</p>
          <p className="text-[10px] text-astra-text-muted mt-0.5">{t('db_send_messages')}</p>
        </button>
      </div>
    </div>
  );
}
