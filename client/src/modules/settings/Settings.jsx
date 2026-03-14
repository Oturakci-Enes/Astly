import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { Users, Plus, X, Lock, Sun, Moon, Globe, Trash2 } from 'lucide-react';

const POWER_SCORES = { admin: 100, senior_manager: 80, manager: 60, senior_user: 40, user: 20 };

export default function Settings() {
  const { api, user: currentUser } = useAuth();
  const { t, locale, setLocale, availableLocales } = useLocale();
  const { theme, setTheme, themes } = useTheme();

  const canManage = (POWER_SCORES[currentUser?.role] || 0) >= 60;
  const isAdminUser = currentUser?.role === 'admin';

  const [tab, setTab] = useState(canManage ? 'users' : 'profile');
  const [users, setUsers] = useState([]);
  const [creatableRoles, setCreatableRoles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'user', department:'', phone:'' });
  const [pwForm, setPwForm] = useState({ currentPassword:'', newPassword:'', confirmPassword:'' });
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => { loadUsers(); loadCreatableRoles(); }, []);

  const loadUsers = async () => {
    const data = await api('/api/settings/users').then(r=>r.json()).catch(()=>[]);
    setUsers(data);
  };

  const loadCreatableRoles = async () => {
    if (!canManage) return;
    const data = await api('/api/settings/creatable-roles').then(r=>r.json()).catch(()=>({ roles: [] }));
    setCreatableRoles(data.roles || []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editUser ? `/api/settings/users/${editUser.id}` : '/api/settings/users';
    const method = editUser ? 'PUT' : 'POST';
    const res = await api(url, { method, body: JSON.stringify(form) });
    if (res.ok) {
      setShowModal(false); setEditUser(null); setForm({ name:'', email:'', password:'', role: creatableRoles[creatableRoles.length - 1] || 'user', department:'', phone:'' });
      loadUsers();
    }
  };

  const openEdit = (u) => {
    // Can only edit users with lower power
    const userPower = POWER_SCORES[currentUser?.role] || 0;
    const targetPower = POWER_SCORES[u.role] || 0;
    if (targetPower >= userPower) return;
    setEditUser(u);
    setForm({ name:u.name, email:u.email, password:'', role:u.role, department:u.department||'', phone:u.phone||'' });
    setShowModal(true);
  };

  const handleDelete = async (u) => {
    if (!isAdminUser) return;
    if (!confirm(t('confirm_delete_user'))) return;
    await api(`/api/settings/users/${u.id}`, { method: 'DELETE' });
    loadUsers();
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwMsg(t('password_mismatch'));
    if (pwForm.newPassword.length < 6) return setPwMsg(t('password_too_short'));
    const res = await api('/api/settings/me/password', { method:'PUT', body: JSON.stringify(pwForm) });
    if (res.ok) { setPwMsg(t('password_changed')); setPwForm({ currentPassword:'', newPassword:'', confirmPassword:'' }); }
    else { const err = await res.json(); setPwMsg(err.error); }
  };

  const canEditUser = (u) => {
    const userPower = POWER_SCORES[currentUser?.role] || 0;
    const targetPower = POWER_SCORES[u.role] || 0;
    return targetPower < userPower;
  };

  const tabs = [
    ...(canManage ? [{ id:'users', label:t('users'), icon:Users }] : []),
    { id:'profile', label:t('profile_password'), icon:Lock },
    { id:'appearance', label:t('theme'), icon:Sun },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-astra-text">{t('settings_title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-astra-surface border border-astra-border rounded-xl p-1 overflow-x-auto">
        {tabs.map(tb =>
          <button key={tb.id} onClick={()=>setTab(tb.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-medium py-2 rounded-lg transition-all whitespace-nowrap ${
              tab === tb.id ? 'bg-accent/15 text-accent border border-accent/25' : 'text-astra-text-muted hover:text-astra-text'
            }`}>
            <tb.icon size={14}/> {tb.label}
          </button>
        )}
      </div>

      {/* Users Tab */}
      {tab === 'users' && canManage && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={()=>{setEditUser(null);setForm({name:'',email:'',password:'',role: creatableRoles[creatableRoles.length - 1] || 'user',department:'',phone:''});setShowModal(true);}} className="astra-btn-primary text-xs flex items-center gap-1.5">
              <Plus size={14}/> {t('add_user')}
            </button>
          </div>
          <div className="astra-card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-astra-bg border-b border-astra-border">
                <tr>
                  {[t('full_name'),t('email'),t('role'),t('department'),t('status')].map(h=>
                    <th key={h} className="astra-table-header">{h}</th>
                  )}
                  <th className="astra-table-header">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="astra-table-row">
                    <td className="astra-table-cell text-xs font-medium">{u.name}</td>
                    <td className="astra-table-cell text-xs text-astra-text-muted">{u.email}</td>
                    <td className="astra-table-cell text-xs">{t(`role_${u.role}`) || u.role}</td>
                    <td className="astra-table-cell text-xs text-astra-text-muted">{u.department || '—'}</td>
                    <td className="astra-table-cell">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.status==='active'?'bg-green-500/10 text-green-400 border border-green-500/20':'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {u.status === 'active' ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="astra-table-cell">
                      <div className="flex items-center gap-2">
                        {canEditUser(u) && (
                          <button onClick={()=>openEdit(u)} className="text-xs text-accent hover:underline">{t('edit')}</button>
                        )}
                        {isAdminUser && u.id !== currentUser.id && (
                          <button onClick={()=>handleDelete(u)} className="text-xs text-red-400 hover:underline"><Trash2 size={12}/></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="max-w-md">
          <div className="astra-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-astra-text">{t('change_password')}</h3>
            <form onSubmit={changePassword} className="space-y-3">
              <div>
                <label className="astra-label">{t('current_password')}</label>
                <input type="password" className="astra-input" value={pwForm.currentPassword} onChange={e=>setPwForm(f=>({...f,currentPassword:e.target.value}))} required />
              </div>
              <div>
                <label className="astra-label">{t('new_password')}</label>
                <input type="password" className="astra-input" value={pwForm.newPassword} onChange={e=>setPwForm(f=>({...f,newPassword:e.target.value}))} required />
              </div>
              <div>
                <label className="astra-label">{t('new_password_confirm')}</label>
                <input type="password" className="astra-input" value={pwForm.confirmPassword} onChange={e=>setPwForm(f=>({...f,confirmPassword:e.target.value}))} required />
              </div>
              {pwMsg && <p className="text-xs text-accent">{pwMsg}</p>}
              <button type="submit" className="astra-btn-primary text-xs">{t('save')}</button>
            </form>
          </div>
        </div>
      )}

      {/* Appearance Tab */}
      {tab === 'appearance' && (
        <div className="max-w-md space-y-4">
          <div className="astra-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-astra-text flex items-center gap-2"><Sun size={14}/> {t('theme')}</h3>
            <div className="flex gap-2">
              {themes.map(th => (
                <button key={th.id} onClick={()=>setTheme(th.id)}
                  className={`flex-1 p-3 rounded-lg border text-xs font-medium transition-all ${
                    theme === th.id ? 'bg-accent/15 text-accent border-accent/25' : 'bg-astra-surface text-astra-text-muted border-astra-border hover:border-accent/20'
                  }`}>
                  {th.id === 'dark' ? <Moon size={16} className="mx-auto mb-1"/> : <Sun size={16} className="mx-auto mb-1"/>}
                  {t(th.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="astra-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-astra-text flex items-center gap-2"><Globe size={14}/> {t('language')}</h3>
            <div className="flex gap-2">
              {availableLocales.map(l => (
                <button key={l.code} onClick={()=>setLocale(l.code)}
                  className={`flex-1 p-3 rounded-lg border text-xs font-medium transition-all ${
                    locale === l.code ? 'bg-accent/15 text-accent border-accent/25' : 'bg-astra-surface text-astra-text-muted border-astra-border hover:border-accent/20'
                  }`}>
                  <span className="text-lg block mb-1">{l.flag}</span>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={()=>setShowModal(false)}>
          <div className="bg-astra-surface border border-astra-border rounded-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-astra-border">
              <h3 className="text-sm font-bold text-astra-text">{editUser ? t('edit_user') : t('new_user')}</h3>
              <button onClick={()=>setShowModal(false)} className="text-astra-text-muted hover:text-astra-text"><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="astra-label">{t('full_name')}</label>
                  <input required className="astra-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
                </div>
                <div>
                  <label className="astra-label">{t('email')}</label>
                  <input type="email" required className="astra-input" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div>
                  <label className="astra-label">{editUser ? t('new_password_hint') : t('password')}</label>
                  <input type="password" className="astra-input" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} {...(!editUser && {required:true})}/>
                </div>
                <div>
                  <label className="astra-label">{t('role')}</label>
                  <select className="astra-select" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                    {creatableRoles.map(r => (
                      <option key={r} value={r}>{t(`role_${r}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="astra-label">{t('department')}</label>
                  <input className="astra-input" value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))}/>
                </div>
                <div>
                  <label className="astra-label">{t('phone')}</label>
                  <input className="astra-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="astra-btn-primary flex-1">{t('save')}</button>
                <button type="button" onClick={()=>setShowModal(false)} className="flex-1 py-2 rounded-lg bg-astra-surface border border-astra-border text-astra-text text-sm hover:bg-astra-muted">{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
