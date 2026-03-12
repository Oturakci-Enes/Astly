import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  ClipboardList, Plus, CheckCircle, Circle, Clock, AlertTriangle,
  ArrowLeft, MessageSquare, Send, Megaphone, FileText, Users, X, Star,
  ChevronRight, Trash2, Calendar, User, BarChart3, Filter
} from 'lucide-react';

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-astra-surface border border-astra-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-astra-border">
          <h3 className="text-sm font-bold text-astra-text">{title}</h3>
          <button onClick={onClose} className="text-astra-text-muted hover:text-astra-text"><X size={16}/></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

// PRIORITY labels moved inside component for locale access
const PRIORITY_COLOR = { urgent:'bg-red-500/15 text-red-400 border-red-500/25', high:'bg-orange-500/15 text-orange-400 border-orange-500/25', medium:'bg-blue-500/15 text-blue-400 border-blue-500/25', low:'bg-slate-500/15 text-slate-400 border-slate-500/25' };
const STATUS_ICON = { pending: Circle, in_progress: Clock, completed: CheckCircle };

export default function TaskManager() {
  const { api, user: currentUser } = useAuth();
  const { t, locale } = useLocale();
  const PRIORITY = { urgent:t('tm_priority_urgent'), high:t('tm_priority_high'), medium:t('tm_priority_medium'), low:t('tm_priority_low') };
  const STATUS = { pending:t('tm_pending'), in_progress:t('tm_in_progress'), completed:t('tm_completed') };
  const [tab, setTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [perfStats, setPerfStats] = useState([]);
  const [filter, setFilter] = useState({ status: '', assigned_to: '' });
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [taskForm, setTaskForm] = useState({ title:'', description:'', assigned_to:'', priority:'medium', due_date:'', category:'' });
  const [annForm, setAnnForm] = useState({ title:'', content:'', priority:'normal' });
  const [reportForm, setReportForm] = useState({ content:'', tasks_completed:0, tasks_in_progress:0, issues:'' });
  const [commentText, setCommentText] = useState('');

  // Power score: admin(100), senior_manager(80), manager(60), senior_user(40), user(20)
  const POWER_SCORES = { admin:100, senior_manager:80, manager:60, senior_user:40, user:20 };
  const userPower = POWER_SCORES[currentUser?.role] || 0;
  const isManager = userPower >= 60; // manager and above can see performance, announcements, etc.
  const canAnnounce = userPower >= 60; // manager and above can publish/delete announcements

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    const params = new URLSearchParams();
    // "overdue" is a virtual status — don't send it to backend
    if (filter.status && filter.status !== 'overdue') params.set('status', filter.status);
    if (filter.assigned_to) params.set('assigned_to', filter.assigned_to);

    const [tasksData, u, a, dr] = await Promise.all([
      api(`/api/tasks?${params}`).then(r=>r.json()).catch(()=>[]),
      api('/api/tasks/users/list').then(r=>r.json()).catch(()=>[]),
      api('/api/tasks/announcements/list').then(r=>r.json()).catch(()=>[]),
      api('/api/tasks/daily-reports/list').then(r=>r.json()).catch(()=>[]),
    ]);
    setTasks(tasksData); setUsers(u); setAnnouncements(a); setDailyReports(dr);

    if (isManager) {
      const s = await api('/api/tasks/stats/performance').then(r=>r.json()).catch(()=>[]);
      setPerfStats(s);
    }
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    const res = await api('/api/tasks', { method:'POST', body: JSON.stringify(taskForm) });
    if (!res.ok) { const err = await res.json(); return alert(err.error); }
    setShowTaskModal(false); setTaskForm({ title:'', description:'', assigned_to:'', priority:'medium', due_date:'', category:'' }); load();
  };

  const updateTaskStatus = async (id, status) => {
    await api(`/api/tasks/${id}`, { method:'PUT', body: JSON.stringify({ status }) });
    load();
    if (detailTask?.id === id) openTaskDetail(id);
  };

  const deleteTask = async (id) => {
    if (!confirm(t('tm_confirm_delete'))) return;
    await api(`/api/tasks/${id}`, { method:'DELETE' });
    setDetailTask(null); load();
  };

  const openTaskDetail = async (id) => {
    const data = await api(`/api/tasks/${id}`).then(r=>r.json()).catch(()=>null);
    if (data) setDetailTask(data);
  };

  const addComment = async () => {
    if (!commentText.trim() || !detailTask) return;
    await api(`/api/tasks/${detailTask.id}/comments`, { method:'POST', body: JSON.stringify({ content: commentText }) });
    setCommentText('');
    openTaskDetail(detailTask.id);
  };

  const handleAnnSubmit = async (e) => {
    e.preventDefault();
    const res = await api('/api/tasks/announcements', { method:'POST', body: JSON.stringify(annForm) });
    if (!res.ok) { const err = await res.json(); return alert(err.error); }
    setShowAnnModal(false); setAnnForm({ title:'', content:'', priority:'normal' }); load();
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    const res = await api('/api/tasks/daily-reports', { method:'POST', body: JSON.stringify(reportForm) });
    if (!res.ok) { const err = await res.json(); return alert(err.error); }
    setShowReportModal(false); setReportForm({ content:'', tasks_completed:0, tasks_in_progress:0, issues:'' }); load();
  };

  const tabs = [
    { id:'tasks', label:t('tm_tasks'), icon: ClipboardList },
    { id:'announcements', label:t('tm_announcements'), icon: Megaphone },
    { id:'reports', label:t('tm_daily_reports'), icon: FileText },
    ...(isManager ? [{ id:'performance', label:t('tm_performance'), icon: BarChart3 }] : []),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (tk) => tk.due_date && tk.due_date < today && tk.status !== 'completed';
  const filterIsOverdue = filter.status === 'overdue';
  const overdueTasks = tasks.filter(isOverdue);
  const pendingTasks = tasks.filter(tk=>tk.status==='pending' && !isOverdue(tk));
  const inProgressTasks = tasks.filter(tk=>tk.status==='in_progress' && !isOverdue(tk));
  const completedTasks = tasks.filter(tk=>tk.status==='completed');

  // ===== TASK DETAIL VIEW =====
  if (detailTask) {
    const dt = detailTask;
    const SIcon = STATUS_ICON[dt.status] || Circle;
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
        <button onClick={()=>setDetailTask(null)} className="flex items-center gap-2 text-sm text-astra-text-muted hover:text-accent">
          <ArrowLeft size={16}/> {t('tm_back')}
        </button>

        <div className="astra-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-astra-text">{dt.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[dt.priority]}`}>{PRIORITY[dt.priority]}</span>
                <span className="flex items-center gap-1 text-xs text-astra-text-muted"><SIcon size={12}/> {STATUS[dt.status]}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {dt.status === 'pending' && <button onClick={()=>updateTaskStatus(dt.id,'in_progress')} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">{t('tm_start')}</button>}
              {dt.status === 'in_progress' && <button onClick={()=>updateTaskStatus(dt.id,'completed')} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20">{t('tm_complete')}</button>}
              {isManager && <button onClick={()=>deleteTask(dt.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"><Trash2 size={12}/></button>}
            </div>
          </div>

          {dt.description && <p className="text-sm text-astra-text-muted leading-relaxed">{dt.description}</p>}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-astra-bg p-3 rounded-lg"><span className="text-astra-text-muted">{t('tm_assigned_to')}</span><p className="text-astra-text font-medium mt-0.5">{dt.assigned_to_name || '—'}</p></div>
            <div className="bg-astra-bg p-3 rounded-lg"><span className="text-astra-text-muted">{t('tm_assigned_by')}</span><p className="text-astra-text font-medium mt-0.5">{dt.assigned_by_name || '—'}</p></div>
            <div className="bg-astra-bg p-3 rounded-lg"><span className="text-astra-text-muted">{t('tm_due_date')}</span><p className={`font-medium mt-0.5 ${dt.due_date && dt.due_date < today && dt.status !== 'completed' ? 'text-red-400' : 'text-astra-text'}`}>{dt.due_date || '—'} {dt.due_date && dt.due_date < today && dt.status !== 'completed' && <span className="text-[10px]">({t('db_overdue')})</span>}</p></div>
            <div className="bg-astra-bg p-3 rounded-lg"><span className="text-astra-text-muted">{t('tm_created_at')}</span><p className="text-astra-text font-medium mt-0.5">{new Date(dt.created_at).toLocaleDateString(locale)}</p></div>
          </div>
        </div>

        {/* Comments */}
        <div className="astra-card overflow-hidden">
          <div className="p-4 border-b border-astra-border"><p className="text-sm font-semibold text-astra-text flex items-center gap-2"><MessageSquare size={14}/> {t('tm_comments')} ({dt.comments?.length || 0})</p></div>
          <div className="max-h-64 overflow-y-auto">
            {(dt.comments || []).map(c => (
              <div key={c.id} className="p-3 border-b border-astra-border last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-accent">{c.user_name}</span>
                  <span className="text-[10px] text-astra-text-muted">{new Date(c.created_at).toLocaleString(locale)}</span>
                </div>
                <p className="text-xs text-astra-text">{c.content}</p>
              </div>
            ))}
            {(!dt.comments || !dt.comments.length) && <div className="p-4 text-center text-xs text-astra-text-muted">{t('tm_no_comments')}</div>}
          </div>
          <div className="p-3 border-t border-astra-border flex gap-2">
            <input className="astra-input flex-1 text-xs" placeholder={t('tm_write_comment')} value={commentText} onChange={e=>setCommentText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addComment()}/>
            <button onClick={addComment} className="astra-btn-primary text-xs px-3"><Send size={12}/></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-astra-text">{t('tm_task_management')}</h1>
          <p className="text-xs text-astra-text-muted mt-0.5">{t('tm_subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-astra-surface border border-astra-border rounded-xl p-1 overflow-x-auto">
        {tabs.map(tb =>
            <button key={tb.id} onClick={()=>setTab(tb.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-medium py-2 rounded-lg transition-all whitespace-nowrap ${
                tab === tb.id ? 'bg-accent/15 text-accent border border-accent/25' : 'text-astra-text-muted hover:text-astra-text'
              }`}>
              <tb.icon size={14}/> <span className="hidden sm:inline">{tb.label}</span>
          </button>
        )}
      </div>

      {/* ===== TASKS TAB ===== */}
      {tab === 'tasks' && (
        <>
          {/* Filters + Add */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <select className="astra-select text-xs flex-1 min-w-[120px]" value={filter.status} onChange={e=>{setFilter(f=>({...f,status:e.target.value})); setTimeout(load,0);}}>
              <option value="">{t('tm_all_statuses')}</option>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              <option value="overdue">{t('db_overdue')}</option>
            </select>
            {isManager && (
              <select className="astra-select text-xs flex-1 min-w-[120px]" value={filter.assigned_to} onChange={e=>{setFilter(f=>({...f,assigned_to:e.target.value})); setTimeout(load,0);}}>
                <option value="">{t('tm_all_employees')}</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <button onClick={()=>setShowTaskModal(true)} className="astra-btn-primary text-xs flex items-center gap-1.5 whitespace-nowrap"><Plus size={14}/> {t('tm_new_task')}</button>
          </div>

          {/* Overdue Banner - shown when there are overdue tasks OR when overdue filter is active */}
          {(overdueTasks.length > 0 || filterIsOverdue) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={14}/> {t('db_overdue')} <span className="ml-auto bg-black/20 px-1.5 py-0.5 rounded text-[10px]">{overdueTasks.length}</span>
              </div>
              {overdueTasks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {overdueTasks.map(task => (
                    <div key={task.id} onClick={()=>openTaskDetail(task.id)}
                      className="astra-card p-3 cursor-pointer hover:border-red-500/30 border-red-500/15 transition-all group">
                      <div className="flex items-start justify-between mb-1.5">
                        <h4 className="text-xs font-semibold text-astra-text group-hover:text-red-400 transition-colors leading-tight">{task.title}</h4>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ml-2 ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY[task.priority]}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-astra-text-muted">
                        <span className="flex items-center gap-1"><User size={10}/> {task.assigned_to_name || t('tm_not_assigned')}</span>
                        <span className="flex items-center gap-0.5 text-red-400"><Calendar size={10}/> {task.due_date}</span>
                      </div>
                      <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
                        {task.status === 'pending' && <button onClick={()=>updateTaskStatus(task.id,'in_progress')} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">{t('tm_start')}</button>}
                        {task.status === 'in_progress' && <button onClick={()=>updateTaskStatus(task.id,'completed')} className="text-[10px] px-2 py-0.5 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25">{t('tm_complete')}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-[10px] text-astra-text-muted py-6 border border-dashed border-astra-border rounded-xl">{t('tm_no_tasks')}</div>
              )}
            </div>
          )}

          {/* Kanban Board - hidden when overdue filter is active */}
          {!filterIsOverdue && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key:'pending', label:t('tm_pending'), items: pendingTasks, color:'text-yellow-400', bg:'bg-yellow-500/10', border:'border-yellow-500/20' },
              { key:'in_progress', label:t('tm_in_progress'), items: inProgressTasks, color:'text-blue-400', bg:'bg-blue-500/10', border:'border-blue-500/20' },
              { key:'completed', label:t('tm_completed'), items: completedTasks, color:'text-green-400', bg:'bg-green-500/10', border:'border-green-500/20' },
            ].map(col => {
              const SIcon = STATUS_ICON[col.key];
              return (
                <div key={col.key} className="space-y-2">
                  <div className={`flex items-center gap-2 text-xs font-bold ${col.color} ${col.bg} border ${col.border} rounded-lg px-3 py-2`}>
                    <SIcon size={14}/> {col.label} <span className="ml-auto bg-black/20 px-1.5 py-0.5 rounded text-[10px]">{col.items.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[100px]">
                    {col.items.map(task => (
                      <div key={task.id} onClick={()=>openTaskDetail(task.id)}
                        className="astra-card p-3 cursor-pointer hover:border-accent/30 transition-all group">
                        <div className="flex items-start justify-between mb-1.5">
                          <h4 className="text-xs font-semibold text-astra-text group-hover:text-accent transition-colors leading-tight">{task.title}</h4>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ml-2 ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY[task.priority]}</span>
                        </div>
                        {task.description && <p className="text-[10px] text-astra-text-muted line-clamp-2 mb-2">{task.description}</p>}
                        <div className="flex items-center justify-between text-[10px] text-astra-text-muted">
                          <span className="flex items-center gap-1"><User size={10}/> {task.assigned_to_name || t('tm_not_assigned')}</span>
                          <div className="flex items-center gap-2">
                            {task.due_date && <span className="flex items-center gap-0.5"><Calendar size={10}/> {task.due_date}</span>}
                            {task.comment_count > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={10}/> {task.comment_count}</span>}
                          </div>
                        </div>
                        {/* Quick status buttons */}
                        <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
                          {task.status === 'pending' && <button onClick={()=>updateTaskStatus(task.id,'in_progress')} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">{t('tm_start')}</button>}
                          {task.status === 'in_progress' && <button onClick={()=>updateTaskStatus(task.id,'completed')} className="text-[10px] px-2 py-0.5 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25">{t('tm_complete')}</button>}
                          {task.status === 'completed' && <button onClick={()=>updateTaskStatus(task.id,'pending')} className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25">{t('tm_undo')}</button>}
                        </div>
                      </div>
                    ))}
                    {col.items.length === 0 && <div className="text-center text-[10px] text-astra-text-muted py-6 border border-dashed border-astra-border rounded-xl">{t('tm_no_tasks')}</div>}
                  </div>
                </div>
              );
            })}
          </div>}
        </>
      )}

      {/* ===== ANNOUNCEMENTS TAB ===== */}
      {tab === 'announcements' && (
        <div className="space-y-3">
          {isManager && (
            <div className="flex justify-end">
              <button onClick={()=>setShowAnnModal(true)} className="astra-btn-primary text-xs flex items-center gap-1.5"><Plus size={14}/> {t('tm_new_announcement')}</button>
            </div>
          )}
          {announcements.length === 0 && <div className="astra-card p-8 text-center text-sm text-astra-text-muted">{t('tm_no_announcements')}</div>}
          {announcements.map(a => (
            <div key={a.id} className={`astra-card p-4 border-l-4 ${a.priority==='urgent'?'border-l-red-500':a.priority==='important'?'border-l-orange-500':'border-l-accent'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-astra-text">{a.title}</h3>
                  <p className="text-xs text-astra-text-muted mt-1 leading-relaxed">{a.content}</p>
                  <p className="text-[10px] text-astra-text-muted mt-2">— {a.created_by_name} · {new Date(a.created_at).toLocaleDateString(locale)}</p>
                </div>
                {isManager && <button onClick={async()=>{await api(`/api/tasks/announcements/${a.id}`,{method:'DELETE'});load();}} className="text-astra-text-muted hover:text-red-400"><X size={14}/></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== DAILY REPORTS TAB ===== */}
      {tab === 'reports' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={()=>setShowReportModal(true)} className="astra-btn-primary text-xs flex items-center gap-1.5"><Plus size={14}/> {t('tm_submit_report')}</button>
          </div>
          {dailyReports.length === 0 && <div className="astra-card p-8 text-center text-sm text-astra-text-muted">{t('tm_no_reports')}</div>}
          {dailyReports.map(r => (
            <div key={r.id} className="astra-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center border border-accent/30">
                    <span className="text-accent text-[10px] font-bold">{r.user_name?.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-astra-text">{r.user_name}</p>
                    <p className="text-[10px] text-astra-text-muted">{r.report_date}</p>
                  </div>
                </div>
                <div className="flex gap-2 text-[10px]">
                  <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">{r.tasks_completed} {t('tm_completed_label')}</span>
                  <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{r.tasks_in_progress} {t('tm_in_progress_label')}</span>
                </div>
              </div>
              <p className="text-xs text-astra-text leading-relaxed">{r.content}</p>
              {r.issues && <p className="text-xs text-red-400 mt-2 bg-red-500/10 p-2 rounded-lg border border-red-500/20">⚠ {r.issues}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ===== PERFORMANCE TAB (Admin only) ===== */}
      {tab === 'performance' && isManager && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label:t('tm_total_tasks'), value: tasks.length, color:'text-accent' },
              { label:t('tm_completed'), value: completedTasks.length, color:'text-green-400' },
              { label:t('tm_in_progress'), value: inProgressTasks.length, color:'text-blue-400' },
              { label:t('tm_pending'), value: pendingTasks.length, color:'text-yellow-400' },
            ].map(s => (
              <div key={s.label} className="astra-card p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-astra-text-muted mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="astra-card overflow-hidden">
            <div className="p-4 border-b border-astra-border"><p className="text-sm font-semibold text-astra-text">{t('tm_employee_perf')}</p></div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-astra-bg border-b border-astra-border">
                <tr>
                  {[t('tm_employee'),t('tm_total'),t('tm_completed'),t('tm_progress'),t('tm_overdue'),t('tm_rate'),t('tm_avg_days')].map(h=>
                    <th key={h} className="astra-table-header">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {perfStats.map(s => (
                  <tr key={s.id} className="astra-table-row">
                    <td className="astra-table-cell text-xs font-medium text-astra-text">{s.name}</td>
                    <td className="astra-table-cell text-xs text-astra-text-muted">{s.total}</td>
                    <td className="astra-table-cell text-xs text-green-400 font-semibold">{s.completed}</td>
                    <td className="astra-table-cell text-xs text-blue-400">{s.in_progress}</td>
                    <td className="astra-table-cell text-xs text-red-400 font-semibold">{s.overdue}</td>
                    <td className="astra-table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-astra-bg rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{width:`${s.completion_rate}%`}}/>
                        </div>
                        <span className="text-xs text-astra-text font-semibold">{s.completion_rate}%</span>
                      </div>
                    </td>
                    <td className="astra-table-cell text-xs text-astra-text-muted">{s.avg_completion_days ? `${s.avg_completion_days} ${t('tm_days')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}

      {/* New Task Modal */}
      <Modal open={showTaskModal} onClose={()=>setShowTaskModal(false)} title={t('tm_new_task')}>
        <form onSubmit={handleTaskSubmit} className="space-y-3">
          <div>
            <label className="astra-label">{t('tm_task_title')}</label>
            <input required className="astra-input" placeholder={t('tm_task_name_ph')} value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))}/>
          </div>
          <div>
            <label className="astra-label">{t('tm_description')}</label>
            <textarea className="astra-input h-20 resize-none" placeholder={t('tm_details_ph')} value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="astra-label">{t('tm_assignee')}</label>
              <select className="astra-select" value={taskForm.assigned_to} onChange={e=>setTaskForm(f=>({...f,assigned_to:e.target.value}))}>
                <option value="">{t('tm_select_person')}</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="astra-label">{t('tm_priority')}</label>
              <select className="astra-select" value={taskForm.priority} onChange={e=>setTaskForm(f=>({...f,priority:e.target.value}))}>
                {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="astra-label">{t('tm_due_date')}</label>
              <input type="date" className="astra-input" value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))}/>
            </div>
            <div>
              <label className="astra-label">{t('tm_category')}</label>
              <input className="astra-input" placeholder={t('tm_category_ph')} value={taskForm.category} onChange={e=>setTaskForm(f=>({...f,category:e.target.value}))}/>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="astra-btn-primary flex-1">{t('tm_create_task')}</button>
            <button type="button" onClick={()=>setShowTaskModal(false)} className="flex-1 py-2 rounded-lg bg-astra-surface border border-astra-border text-astra-text text-sm hover:bg-astra-muted">{t('cancel')}</button>
          </div>
        </form>
      </Modal>

      {/* New Announcement Modal */}
      <Modal open={showAnnModal} onClose={()=>setShowAnnModal(false)} title={t('tm_new_announcement')}>
        <form onSubmit={handleAnnSubmit} className="space-y-3">
          <div>
            <label className="astra-label">{t('tm_ann_title')}</label>
            <input required className="astra-input" placeholder={t('tm_ann_title_ph')} value={annForm.title} onChange={e=>setAnnForm(f=>({...f,title:e.target.value}))}/>
          </div>
          <div>
            <label className="astra-label">{t('tm_ann_content')}</label>
            <textarea required className="astra-input h-24 resize-none" placeholder={t('tm_ann_content_ph')} value={annForm.content} onChange={e=>setAnnForm(f=>({...f,content:e.target.value}))}/>
          </div>
          <div>
            <label className="astra-label">{t('tm_ann_priority')}</label>
            <select className="astra-select" value={annForm.priority} onChange={e=>setAnnForm(f=>({...f,priority:e.target.value}))}>
              <option value="normal">{t('tm_ann_normal')}</option>
              <option value="important">{t('tm_ann_important')}</option>
              <option value="urgent">{t('tm_ann_urgent')}</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="astra-btn-primary flex-1">{t('tm_publish')}</button>
            <button type="button" onClick={()=>setShowAnnModal(false)} className="flex-1 py-2 rounded-lg bg-astra-surface border border-astra-border text-astra-text text-sm hover:bg-astra-muted">{t('cancel')}</button>
          </div>
        </form>
      </Modal>

      {/* Daily Report Modal */}
      <Modal open={showReportModal} onClose={()=>setShowReportModal(false)} title={t('tm_daily_report')}>
        <form onSubmit={handleReportSubmit} className="space-y-3">
          <div>
            <label className="astra-label">{t('tm_what_did')}</label>
            <textarea required className="astra-input h-24 resize-none" placeholder={t('tm_daily_summary_ph')} value={reportForm.content} onChange={e=>setReportForm(f=>({...f,content:e.target.value}))}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="astra-label">{t('tm_tasks_completed_count')}</label>
              <input type="number" min="0" className="astra-input" value={reportForm.tasks_completed} onChange={e=>setReportForm(f=>({...f,tasks_completed:Number(e.target.value)}))}/>
            </div>
            <div>
              <label className="astra-label">{t('tm_tasks_in_progress_count')}</label>
              <input type="number" min="0" className="astra-input" value={reportForm.tasks_in_progress} onChange={e=>setReportForm(f=>({...f,tasks_in_progress:Number(e.target.value)}))}/>
            </div>
          </div>
          <div>
            <label className="astra-label">{t('tm_issues_blockers')}</label>
            <textarea className="astra-input h-16 resize-none" placeholder={t('tm_issues_ph')} value={reportForm.issues} onChange={e=>setReportForm(f=>({...f,issues:e.target.value}))}/>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="astra-btn-primary flex-1">{t('tm_send_report')}</button>
            <button type="button" onClick={()=>setShowReportModal(false)} className="flex-1 py-2 rounded-lg bg-astra-surface border border-astra-border text-astra-text text-sm hover:bg-astra-muted">{t('cancel')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
