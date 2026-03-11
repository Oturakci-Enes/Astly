import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  MessageSquare,
  Plus,
  Send,
  Users,
  User,
  Search,
  X,
  Check,
  CheckCheck,
  Hash,
  ArrowLeft,
  Paperclip,
  Mic,
  MapPin
} from 'lucide-react';

export default function Messaging() {
  const { api, user: currentUser } = useAuth();
  const { t, locale } = useLocale();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [users, setUsers] = useState([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [searchConv, setSearchConv] = useState('');
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    loadConversations();
    loadUsers();
    // Poll for new messages every 3 seconds
    pollRef.current = setInterval(() => {
      loadConversations();
      if (activeConv) loadMessages(activeConv.id, true);
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
      inputRef.current?.focus();
    }
  }, [activeConv?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    const data = await api('/api/messaging/conversations').then(r=>r.json()).catch(()=>[]);
    setConversations(data);
  };

  const loadMessages = async (convId, silent = false) => {
    const data = await api(`/api/messaging/conversations/${convId}/messages`).then(r=>r.json()).catch(()=>[]);
    setMessages(data);
    if (!silent) loadConversations(); // update unread counts
  };

  const loadUsers = async () => {
    const data = await api('/api/messaging/users').then(r=>r.json()).catch(()=>[]);
    setUsers(data);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAttachment(file);
    const reader = new FileReader();
    reader.onload = (e) => setAttachmentPreview(e.target.result);
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
  };

  const startRecording = async () => {
    if (typeof navigator === 'undefined') return;
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
      alert(t('msg_audio_not_supported') || 'Tarayıcınız ses kaydını desteklemiyor.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length) {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
          setAttachment(file);
          const reader = new FileReader();
          reader.onload = (e) => setAttachmentPreview(e.target.result);
          reader.readAsDataURL(file);
        }
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      // permission denied or not available
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const sendLocation = () => {
    if (!navigator.geolocation || !activeConv) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const body = JSON.stringify({
        message_type: 'location',
        lat: latitude,
        lng: longitude,
        label: t('msg_my_location'),
      });
      const res = await api(`/api/messaging/conversations/${activeConv.id}/messages`, {
        method: 'POST',
        body,
      }).catch(() => null);
      if (res && res.ok) {
        loadMessages(activeConv.id);
        loadConversations();
      }
    });
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !attachment) || !activeConv) return;
    
    let body;
    if (attachment) {
      body = new FormData();
      body.append('content', newMessage.trim());
      body.append('attachment', attachment);
    } else {
      body = JSON.stringify({ content: newMessage.trim() });
    }

    const res = await api(`/api/messaging/conversations/${activeConv.id}/messages`, {
      method: 'POST', body,
    });
    if (res.ok) {
      setNewMessage('');
      clearAttachment();
      loadMessages(activeConv.id);
      loadConversations();
    }
  };

  const startDirectChat = async (userId) => {
    const res = await api('/api/messaging/conversations', {
      method: 'POST', body: JSON.stringify({ type: 'direct', member_ids: [userId] }),
    });
    const data = await res.json();
    setShowNewChat(false); setSelectedMembers([]); setNewChatSearch('');
    await loadConversations();
    // Find and activate the conversation
    const convs = await api('/api/messaging/conversations').then(r=>r.json());
    const conv = convs.find(c => c.id === data.id);
    if (conv) setActiveConv(conv);
  };

  const startGroupChat = async () => {
    if (!selectedMembers.length || !groupName.trim()) return;
    const res = await api('/api/messaging/conversations', {
      method: 'POST', body: JSON.stringify({ type: 'group', name: groupName.trim(), member_ids: selectedMembers }),
    });
    const data = await res.json();
    setShowNewChat(false); setSelectedMembers([]); setGroupName(''); setIsGroup(false); setNewChatSearch('');
    await loadConversations();
    const convs = await api('/api/messaging/conversations').then(r=>r.json());
    const conv = convs.find(c => c.id === data.id);
    if (conv) setActiveConv(conv);
  };

  const toggleMember = (id) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  };

  const filteredConvs = conversations.filter(c => {
    if (!searchConv) return true;
    return (c.display_name||'').toLowerCase().includes(searchConv.toLowerCase());
  });

  const filteredUsers = users.filter(u => {
    if (!newChatSearch) return true;
    return u.name.toLowerCase().includes(newChatSearch.toLowerCase()) || u.email.toLowerCase().includes(newChatSearch.toLowerCase());
  });

  const formatTime = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
    if (diffDays === 1) return t('msg_yesterday');
    if (diffDays < 7) return d.toLocaleDateString(locale, { weekday:'short' });
    return d.toLocaleDateString(locale, { day:'2-digit', month:'2-digit' });
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div className="p-6 h-[calc(100vh-2rem)]">
      <div className="flex h-full bg-astra-surface border border-astra-border rounded-2xl overflow-hidden">

        {/* Left Panel — Conversations */}
        <div className={`w-80 border-r border-astra-border flex flex-col shrink-0 ${activeConv ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
          <div className="p-4 border-b border-astra-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-astra-text flex items-center gap-2">
                <MessageSquare size={16} className="text-accent"/> {t('msg_messages')}
                {totalUnread > 0 && <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalUnread}</span>}
              </h2>
              <button onClick={()=>setShowNewChat(true)} className="text-accent hover:bg-accent/10 p-1.5 rounded-lg transition-colors"><Plus size={16}/></button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted"/>
              <input className="astra-input pl-9 text-xs" placeholder={t('msg_search_chat')} value={searchConv} onChange={e=>setSearchConv(e.target.value)}/>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConvs.length === 0 && (
              <div className="p-6 text-center">
                <MessageSquare size={32} className="text-astra-text-muted mx-auto mb-2 opacity-30"/>
                <p className="text-xs text-astra-text-muted">{t('msg_no_chats')}</p>
                <button onClick={()=>setShowNewChat(true)} className="text-xs text-accent mt-2 hover:underline">{t('msg_start_new')}</button>
              </div>
            )}
            {filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`w-full text-left p-3 border-b border-astra-border/50 hover:bg-astra-muted/30 transition-colors flex items-center gap-3 ${
                  activeConv?.id === conv.id ? 'bg-accent/10 border-l-2 border-l-accent' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                  conv.type === 'group' ? 'bg-purple-500/15 border-purple-500/25' : 'bg-accent/15 border-accent/25'
                }`}>
                  {conv.type === 'group'
                    ? <Users size={16} className="text-purple-400"/>
                    : <span className="text-accent text-xs font-bold">{(conv.display_name||'?').charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-astra-text truncate">{conv.display_name}</p>
                    <span className="text-[10px] text-astra-text-muted shrink-0 ml-2">{formatTime(conv.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[10px] text-astra-text-muted truncate">
                      {conv.last_message ? `${conv.last_sender_id === currentUser.id ? t('msg_you') : conv.last_sender_name}: ${conv.last_message}` : t('msg_no_messages_yet')}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="bg-accent text-white text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 ml-1">{conv.unread_count}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel — Messages */}
        <div className={`flex-1 flex flex-col ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
          {activeConv ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-astra-border flex items-center gap-3">
                <button onClick={()=>setActiveConv(null)} className="md:hidden text-astra-text-muted hover:text-accent"><ArrowLeft size={18}/></button>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                  activeConv.type === 'group' ? 'bg-purple-500/15 border-purple-500/25' : 'bg-accent/15 border-accent/25'
                }`}>
                  {activeConv.type === 'group'
                    ? <Users size={14} className="text-purple-400"/>
                    : <span className="text-accent text-[10px] font-bold">{(activeConv.display_name||'?').charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-astra-text">{activeConv.display_name}</p>
                  <p className="text-[10px] text-astra-text-muted">
                    {activeConv.type === 'group'
                      ? `${activeConv.members?.length || 0} ${t('msg_members')}`
                      : activeConv.members?.find(m=>m.id!==currentUser.id)?.role || ''}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageSquare size={40} className="text-astra-text-muted mx-auto mb-2 opacity-20"/>
                      <p className="text-xs text-astra-text-muted">{t('msg_send_first')}</p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMine = msg.sender_id === currentUser.id;
                  const showAvatar = !isMine && (i === 0 || messages[i-1]?.sender_id !== msg.sender_id);
                  let locationPayload = null;
                  if (msg.message_type === 'location' && msg.content) {
                    try {
                      locationPayload = JSON.parse(msg.content);
                    } catch {
                      locationPayload = null;
                    }
                  }
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                        {showAvatar && activeConv.type === 'group' && (
                          <p className="text-[10px] text-accent font-semibold mb-0.5 ml-1">{msg.sender_name}</p>
                        )}
                        <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                          isMine
                            ? 'bg-accent text-white rounded-br-md'
                            : 'bg-astra-bg border border-astra-border text-astra-text rounded-bl-md'
                        }`}>
                          {msg.attachment_url && (
                            <div className="mb-2">
                              {msg.message_type === 'video' ? (
                                <video src={msg.attachment_url} controls className="max-w-[200px] rounded-lg bg-black object-contain aspect-video" />
                              ) : msg.message_type === 'audio' ? (
                                <audio src={msg.attachment_url} controls className="w-full max-w-[200px]" />
                              ) : (
                                <img src={msg.attachment_url} alt="attachment" className="max-w-[200px] rounded-lg border border-white/20 object-cover" />
                              )}
                            </div>
                          )}
                          {locationPayload ? (
                            <button
                              type="button"
                              onClick={() => window.open(`https://www.google.com/maps?q=${locationPayload.lat},${locationPayload.lng}`, '_blank')}
                              className={`text-[11px] underline ${isMine ? 'text-white' : 'text-accent'}`}
                            >
                              {locationPayload.label || t('msg_location')}
                            </button>
                          ) : (
                            msg.content
                          )}
                        </div>
                        <p className={`text-[9px] text-astra-text-muted mt-0.5 ${isMine ? 'text-right mr-1' : 'ml-1'}`}>
                          {new Date(msg.created_at).toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef}/>
              </div>

              {/* Message Input */}
              <div className="p-3 border-t border-astra-border flex flex-col">
                {attachmentPreview && (
                  <div className="relative self-start mb-2 group">
            {attachment?.type.startsWith('video/') ? (
              <video src={attachmentPreview} className="h-16 w-16 object-cover rounded-lg bg-black" />
            ) : attachment?.type.startsWith('audio/') ? (
              <audio src={attachmentPreview} controls className="h-10 max-w-[200px]" />
            ) : (
              <img src={attachmentPreview} alt="preview" className="h-16 w-16 object-cover rounded-lg border border-astra-border" />
            )}
                    <button 
                      onClick={clearAttachment}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X size={12}/>
                    </button>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-astra-text-muted hover:text-accent p-2 rounded-full hover:bg-accent/10 transition-colors"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`text-astra-text-muted hover:text-accent p-2 rounded-full hover:bg-accent/10 transition-colors ${isRecording ? 'text-accent' : ''}`}
                    title={isRecording ? t('msg_stop_recording') : t('msg_start_recording')}
                  >
                    <Mic size={18} />
                  </button>
                  <button
                    onClick={sendLocation}
                    className="text-astra-text-muted hover:text-accent p-2 rounded-full hover:bg-accent/10 transition-colors"
                    title={t('msg_share_location')}
                  >
                    <MapPin size={18} />
                  </button>
                  <input
                    ref={inputRef}
                    className="astra-input flex-1 text-sm"
                    placeholder={t('msg_type_message')}
                    value={newMessage}
                    onChange={e=>setNewMessage(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendMessage())}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() && !attachment}
                    className="astra-btn-primary px-4 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send size={16}/>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-accent/20">
                  <MessageSquare size={32} className="text-accent opacity-50"/>
                </div>
                <h3 className="text-sm font-semibold text-astra-text mb-1">{t('msg_astra_messaging')}</h3>
                <p className="text-xs text-astra-text-muted mb-3">{t('msg_select_or_start')}</p>
                <button onClick={()=>setShowNewChat(true)} className="astra-btn-primary text-xs"><Plus size={14} className="inline mr-1"/> {t('msg_new_chat')}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={()=>setShowNewChat(false)}>
          <div className="bg-astra-surface border border-astra-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-astra-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-astra-text">{t('msg_new_chat')}</h3>
                <button onClick={()=>setShowNewChat(false)} className="text-astra-text-muted hover:text-astra-text"><X size={16}/></button>
              </div>

              {/* Toggle direct/group */}
              <div className="flex gap-1 bg-astra-bg rounded-lg p-0.5 mb-3">
                <button onClick={()=>{setIsGroup(false);setSelectedMembers([]);}} className={`flex-1 text-xs py-1.5 rounded-md transition-all ${!isGroup?'bg-accent/15 text-accent font-medium':'text-astra-text-muted'}`}>{t('msg_direct')}</button>
                <button onClick={()=>setIsGroup(true)} className={`flex-1 text-xs py-1.5 rounded-md transition-all ${isGroup?'bg-accent/15 text-accent font-medium':'text-astra-text-muted'}`}>{t('msg_group')}</button>
              </div>

              {isGroup && (
                <input className="astra-input text-xs mb-3" placeholder={t('msg_group_name')} value={groupName} onChange={e=>setGroupName(e.target.value)}/>
              )}

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted"/>
                <input className="astra-input pl-9 text-xs" placeholder={t('msg_search_people')} value={newChatSearch} onChange={e=>setNewChatSearch(e.target.value)}/>
              </div>

              {isGroup && selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedMembers.map(id => {
                    const u = users.find(x=>x.id===id);
                    return u ? (
                      <span key={id} className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full flex items-center gap-1 border border-accent/25">
                        {u.name} <button onClick={()=>toggleMember(id)}><X size={10}/></button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="overflow-y-auto max-h-[50vh]">
              {filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={()=> isGroup ? toggleMember(u.id) : startDirectChat(u.id)}
                  className={`w-full text-left p-3 border-b border-astra-border/50 hover:bg-astra-muted/30 transition-colors flex items-center gap-3 ${
                    selectedMembers.includes(u.id) ? 'bg-accent/10' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center">
                    <span className="text-accent text-xs font-bold">{u.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-astra-text">{u.name}</p>
                    <p className="text-[10px] text-astra-text-muted">{u.role} · {u.department || t('msg_general')}</p>
                  </div>
                  {isGroup && selectedMembers.includes(u.id) && <Check size={16} className="text-accent"/>}
                </button>
              ))}
            </div>

            {isGroup && (
              <div className="p-3 border-t border-astra-border">
                <button onClick={startGroupChat} disabled={!selectedMembers.length||!groupName.trim()} className="astra-btn-primary w-full text-xs disabled:opacity-30">
                  {t('msg_create_group')} ({selectedMembers.length} {t('msg_members')})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
