import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useSocket } from '../../context/SocketContext';
import {
  MessageSquare, Plus, Send, Users, Search, X, Check, CheckCheck,
  ArrowLeft, Paperclip, Mic, MapPin, Phone, Video, PhoneOff, MicOff, VideoOff
} from 'lucide-react';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function Messaging() {
  const { api, user: currentUser, token } = useAuth();
  const { t, locale } = useLocale();
  const { socket, isOnline } = useSocket() || {};

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
  const [isRecording, setIsRecording] = useState(false);

  // Call state
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState(null);
  const [callPeer, setCallPeer] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Refs
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const activeConvRef = useRef(null);
  const prevMessagesLenRef = useRef(0);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimerRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const callStateRef = useRef('idle');

  // Keep refs in sync
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Polling
  useEffect(() => {
    loadConversations();
    loadUsers();
    pollRef.current = setInterval(() => {
      loadConversations();
      if (activeConvRef.current) loadMessages(activeConvRef.current.id, true);
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (activeConv) { loadMessages(activeConv.id); inputRef.current?.focus(); }
  }, [activeConv?.id]);

  useEffect(() => {
    if (messages.length > prevMessagesLenRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages]);

  // ─── Socket call signaling ──────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = ({ from, fromName, type, offer }) => {
      if (callStateRef.current !== 'idle') {
        socket.emit('call-rejected', { to: from });
        return;
      }
      pendingOfferRef.current = offer;
      setCallState('incoming');
      setCallType(type);
      setCallPeer({ id: from, name: fromName });
    };
    const onCallAccepted = async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('active');
        }
      } catch (err) { console.error('Remote desc error:', err); }
    };
    const onCallRejected = () => cleanupCall();
    const onCallEnded = () => cleanupCall();
    const onIceCandidate = async ({ candidate }) => {
      try {
        if (peerConnectionRef.current && candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) { console.error('ICE error:', err); }
    };

    socket.on('incoming-call', onIncomingCall);
    socket.on('call-accepted', onCallAccepted);
    socket.on('call-rejected', onCallRejected);
    socket.on('call-ended', onCallEnded);
    socket.on('ice-candidate', onIceCandidate);

    return () => {
      socket.off('incoming-call', onIncomingCall);
      socket.off('call-accepted', onCallAccepted);
      socket.off('call-rejected', onCallRejected);
      socket.off('call-ended', onCallEnded);
      socket.off('ice-candidate', onIceCandidate);
    };
  }, [socket]);

  // Call timer
  useEffect(() => {
    if (callState === 'active') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState]);

  // ─── Call functions ─────────────────────────────────────────────────
  const cleanupCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingOfferRef.current = null;
    setCallState('idle'); setCallType(null); setCallPeer(null);
    setIsMuted(false); setIsCameraOff(false); setCallDuration(0);
  };

  const initiateCall = async (type) => {
    if (!activeConv) return;
    // For direct: call the other person. For group: pick first online member (simplified).
    let peerId, peerName;
    if (activeConv.type === 'direct') {
      const peer = activeConv.members?.find(m => m.id !== currentUser.id);
      if (!peer) return;
      peerId = peer.id; peerName = peer.name;
    } else {
      // Group call: call first other member who is online
      const onlinePeer = activeConv.members?.find(m => m.id !== currentUser.id && isOnline?.(m.id));
      if (!onlinePeer) return;
      peerId = onlinePeer.id; peerName = activeConv.display_name;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) socket?.emit('ice-candidate', { to: peerId, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit('call-user', { to: peerId, type, offer });

      setCallState('calling'); setCallType(type);
      setCallPeer({ id: peerId, name: peerName });
      if (localVideoRef.current && type === 'video') localVideoRef.current.srcObject = stream;
    } catch (err) { console.error('Call failed:', err); cleanupCall(); }
  };

  const acceptCall = async () => {
    const offer = pendingOfferRef.current;
    if (!offer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) socket?.emit('ice-candidate', { to: callPeer.id, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit('call-accepted', { to: callPeer.id, answer });
      setCallState('active');
      if (localVideoRef.current && callType === 'video') localVideoRef.current.srcObject = stream;
    } catch (err) { console.error('Accept failed:', err); cleanupCall(); }
  };

  const rejectCall = () => { socket?.emit('call-rejected', { to: callPeer?.id }); cleanupCall(); };
  const endCall = () => { socket?.emit('call-ended', { to: callPeer?.id }); cleanupCall(); };

  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  };
  const toggleCamera = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCameraOff(!t.enabled); }
  };
  const fmtDur = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // ─── Messaging functions ────────────────────────────────────────────
  const loadConversations = async () => {
    const data = await api('/api/messaging/conversations').then(r=>r.json()).catch(()=>[]);
    setConversations(data);
  };
  const loadMessages = async (convId, silent = false) => {
    const data = await api(`/api/messaging/conversations/${convId}/messages`).then(r=>r.json()).catch(()=>[]);
    setMessages(data);
    if (!silent) loadConversations();
  };
  const loadUsers = async () => {
    const data = await api('/api/messaging/users').then(r=>r.json()).catch(()=>[]);
    setUsers(data);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setAttachment(file);
    const reader = new FileReader();
    reader.onload = (e) => setAttachmentPreview(e.target.result);
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const clearAttachment = () => { setAttachment(null); setAttachmentPreview(null); };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
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
      recorder.start(); setIsRecording(true);
    } catch { /* denied */ }
  };
  const stopRecording = () => { mediaRecorderRef.current?.state !== 'inactive' && mediaRecorderRef.current?.stop(); };

  const sendLocation = () => {
    if (!navigator.geolocation || !activeConv) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const res = await api(`/api/messaging/conversations/${activeConv.id}/messages`, {
        method: 'POST', body: JSON.stringify({ message_type: 'location', lat: latitude, lng: longitude, label: t('msg_my_location') }),
      }).catch(() => null);
      if (res?.ok) { loadMessages(activeConv.id); loadConversations(); }
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
    const res = await api(`/api/messaging/conversations/${activeConv.id}/messages`, { method: 'POST', body });
    if (res.ok) { setNewMessage(''); clearAttachment(); loadMessages(activeConv.id); loadConversations(); }
  };

  const startDirectChat = async (userId) => {
    const res = await api('/api/messaging/conversations', { method: 'POST', body: JSON.stringify({ type: 'direct', member_ids: [userId] }) });
    const data = await res.json();
    setShowNewChat(false); setSelectedMembers([]); setNewChatSearch('');
    await loadConversations();
    const convs = await api('/api/messaging/conversations').then(r=>r.json());
    const conv = convs.find(c => c.id === data.id);
    if (conv) setActiveConv(conv);
  };

  const startGroupChat = async () => {
    if (!selectedMembers.length || !groupName.trim()) return;
    const res = await api('/api/messaging/conversations', { method: 'POST', body: JSON.stringify({ type: 'group', name: groupName.trim(), member_ids: selectedMembers }) });
    const data = await res.json();
    setShowNewChat(false); setSelectedMembers([]); setGroupName(''); setIsGroup(false); setNewChatSearch('');
    await loadConversations();
    const convs = await api('/api/messaging/conversations').then(r=>r.json());
    const conv = convs.find(c => c.id === data.id);
    if (conv) setActiveConv(conv);
  };

  const toggleMember = (id) => setSelectedMembers(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const filteredConvs = conversations.filter(c => !searchConv || (c.display_name||'').toLowerCase().includes(searchConv.toLowerCase()));
  const filteredUsers = users.filter(u => !newChatSearch || u.name.toLowerCase().includes(newChatSearch.toLowerCase()) || u.email.toLowerCase().includes(newChatSearch.toLowerCase()));

  const formatTime = (dt) => {
    if (!dt) return '';
    const d = new Date(dt), now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return d.toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
    if (diff === 1) return t('msg_yesterday');
    if (diff < 7) return d.toLocaleDateString(locale, { weekday:'short' });
    return d.toLocaleDateString(locale, { day:'2-digit', month:'2-digit' });
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  // Helper: get the other user's ID for a direct conversation
  const getDirectPeerId = (conv) => conv?.type === 'direct' ? conv.members?.find(m => m.id !== currentUser.id)?.id : null;

  // Helper: count online members in a group
  const getOnlineCount = (conv) => conv?.members?.filter(m => m.id !== currentUser.id && isOnline?.(m.id)).length || 0;

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:p-6 md:h-[calc(100vh-2rem)]">
      <div className="flex h-full md:bg-astra-surface md:border md:border-astra-border md:rounded-2xl overflow-hidden bg-astra-bg">

        {/* ═══ Left Panel — Conversations ═══ */}
        <div className={`w-full md:w-80 md:border-r border-astra-border flex flex-col md:shrink-0 ${activeConv ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
          <div className="p-4 border-b border-astra-border bg-astra-surface/80 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-astra-text flex items-center gap-2">
                <MessageSquare size={18} className="text-accent"/> {t('msg_messages')}
                {totalUnread > 0 && <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalUnread}</span>}
              </h2>
              <button onClick={()=>setShowNewChat(true)} className="text-accent hover:bg-accent/10 p-2 rounded-lg transition-colors"><Plus size={18}/></button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted"/>
              <input className="astra-input pl-9 text-sm h-10" placeholder={t('msg_search_chat')} value={searchConv} onChange={e=>setSearchConv(e.target.value)}/>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {filteredConvs.length === 0 && (
              <div className="p-8 text-center">
                <MessageSquare size={40} className="text-astra-text-muted mx-auto mb-3 opacity-20"/>
                <p className="text-sm text-astra-text-muted">{t('msg_no_chats')}</p>
                <button onClick={()=>setShowNewChat(true)} className="text-sm text-accent mt-2 hover:underline">{t('msg_start_new')}</button>
              </div>
            )}
            {filteredConvs.map(conv => {
              const peerId = getDirectPeerId(conv);
              const peerOnline = peerId ? isOnline?.(peerId) : false;
              const groupOnline = conv.type === 'group' ? getOnlineCount(conv) : 0;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConv(conv)}
                  className={`w-full text-left px-4 py-3 border-b border-astra-border/30 hover:bg-astra-muted/30 transition-colors flex items-center gap-3 active:bg-astra-muted/50 ${
                    activeConv?.id === conv.id ? 'bg-accent/10 md:border-l-2 md:border-l-accent' : ''
                  }`}
                >
                  {/* Avatar with online indicator */}
                  <div className="relative shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                      conv.type === 'group' ? 'bg-purple-500/15 border-purple-500/25' : 'bg-accent/15 border-accent/25'
                    }`}>
                      {conv.type === 'group'
                        ? <Users size={18} className="text-purple-400"/>
                        : <span className="text-accent text-sm font-bold">{(conv.display_name||'?').charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    {/* Online dot */}
                    {conv.type === 'direct' && (
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-astra-bg ${peerOnline ? 'bg-green-500' : 'bg-gray-500'}`}/>
                    )}
                    {conv.type === 'group' && groupOnline > 0 && (
                      <span className="absolute -bottom-0.5 -right-0.5 bg-green-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-astra-bg">{groupOnline}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-astra-text truncate">{conv.display_name}</p>
                      <span className="text-[10px] text-astra-text-muted shrink-0 ml-2">{formatTime(conv.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-astra-text-muted truncate">
                        {conv.last_message ? `${conv.last_sender_id === currentUser.id ? t('msg_you') : conv.last_sender_name}: ${conv.last_message}` : t('msg_no_messages_yet')}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="bg-accent text-white text-[9px] font-bold min-w-[20px] h-[20px] rounded-full flex items-center justify-center shrink-0 ml-1">{conv.unread_count}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ Right Panel — Chat ═══ */}
        <div className={`flex-1 flex flex-col ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
          {activeConv ? (
            <>
              {/* Chat Header */}
              <div className="px-3 py-2.5 md:p-4 border-b border-astra-border flex items-center gap-3 bg-astra-surface/80 backdrop-blur-sm shrink-0">
                <button onClick={()=>setActiveConv(null)} className="md:hidden text-astra-text-muted hover:text-accent p-1"><ArrowLeft size={20}/></button>
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                    activeConv.type === 'group' ? 'bg-purple-500/15 border-purple-500/25' : 'bg-accent/15 border-accent/25'
                  }`}>
                    {activeConv.type === 'group'
                      ? <Users size={16} className="text-purple-400"/>
                      : <span className="text-accent text-xs font-bold">{(activeConv.display_name||'?').charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  {activeConv.type === 'direct' && (
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-astra-surface ${isOnline?.(getDirectPeerId(activeConv)) ? 'bg-green-500' : 'bg-gray-500'}`}/>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-astra-text leading-tight">{activeConv.display_name}</p>
                  <p className="text-[11px] text-astra-text-muted leading-tight">
                    {activeConv.type === 'group'
                      ? (() => {
                          const on = getOnlineCount(activeConv);
                          return `${activeConv.members?.length || 0} ${t('msg_members')}${on > 0 ? ` · ${on} ${t('msg_online').toLowerCase()}` : ''}`;
                        })()
                      : isOnline?.(getDirectPeerId(activeConv)) ? t('msg_online') : t('msg_offline')
                    }
                  </p>
                </div>
                {/* Call buttons */}
                {callState === 'idle' && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => initiateCall('voice')} className="p-2 rounded-lg text-astra-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t('msg_voice_call')}><Phone size={18}/></button>
                    <button onClick={() => initiateCall('video')} className="p-2 rounded-lg text-astra-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t('msg_video_call')}><Video size={18}/></button>
                  </div>
                )}
              </div>

              {/* Messages — fills remaining space */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:p-4 space-y-2">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageSquare size={40} className="text-astra-text-muted mx-auto mb-2 opacity-20"/>
                      <p className="text-xs text-astra-text-muted">{t('msg_send_first')}</p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMine = msg.sender_id === currentUser.id;
                  const showName = !isMine && activeConv.type === 'group' && (i === 0 || messages[i-1]?.sender_id !== msg.sender_id);
                  let loc = null;
                  if (msg.message_type === 'location' && msg.content) { try { loc = JSON.parse(msg.content); } catch {} }
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] md:max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                        {showName && <p className="text-[10px] text-accent font-semibold mb-0.5 ml-1">{msg.sender_name}</p>}
                        <div className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
                          isMine ? 'bg-accent text-white rounded-br-md' : 'bg-astra-surface border border-astra-border text-astra-text rounded-bl-md'
                        }`}>
                          {msg.attachment_url && (
                            <div className="mb-1.5">
                              {msg.message_type === 'video' ? (
                                <video src={msg.attachment_url} controls className="max-w-[220px] rounded-lg bg-black aspect-video" />
                              ) : msg.message_type === 'audio' ? (
                                <audio src={msg.attachment_url} controls className="w-full max-w-[220px]" />
                              ) : (
                                <img src={msg.attachment_url} alt="" className="max-w-[220px] rounded-lg border border-white/10" />
                              )}
                            </div>
                          )}
                          {loc ? (
                            <button type="button" onClick={() => window.open(`https://www.google.com/maps?q=${loc.lat},${loc.lng}`, '_blank')}
                              className={`text-[12px] underline ${isMine ? 'text-white' : 'text-accent'}`}>{loc.label || 'Location'}</button>
                          ) : msg.content}
                        </div>
                        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end mr-1' : 'ml-1'}`}>
                          <span className="text-[9px] text-astra-text-muted">{new Date(msg.created_at).toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' })}</span>
                          {isMine && (msg.all_read ? <CheckCheck size={14} className="text-blue-400"/> : <Check size={14} className="text-white/50"/>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef}/>
              </div>

              {/* Input Bar — sticks to bottom, pushes up with keyboard on mobile */}
              <div className="shrink-0 border-t border-astra-border bg-astra-surface/90 backdrop-blur-sm safe-area-bottom">
                {attachmentPreview && (
                  <div className="px-3 pt-2">
                    <div className="relative self-start inline-block group">
                      {attachment?.type?.startsWith('video/') ? (
                        <video src={attachmentPreview} className="h-14 w-14 object-cover rounded-lg bg-black" />
                      ) : attachment?.type?.startsWith('audio/') ? (
                        <audio src={attachmentPreview} controls className="h-10 max-w-[180px]" />
                      ) : (
                        <img src={attachmentPreview} alt="" className="h-14 w-14 object-cover rounded-lg border border-astra-border" />
                      )}
                      <button onClick={clearAttachment} className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full shadow-sm"><X size={10}/></button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1 px-2 py-2 md:px-3 md:py-3">
                  <input type="file" accept="image/*,video/*,audio/*" className="hidden" ref={fileInputRef} onChange={handleFileChange}/>
                  <button onClick={() => fileInputRef.current?.click()} className="text-astra-text-muted hover:text-accent p-2 rounded-full hover:bg-accent/10 transition-colors shrink-0"><Paperclip size={20}/></button>
                  <button onClick={isRecording ? stopRecording : startRecording} className={`text-astra-text-muted hover:text-accent p-2 rounded-full hover:bg-accent/10 transition-colors shrink-0 ${isRecording ? 'text-red-400 animate-pulse' : ''}`}><Mic size={20}/></button>
                  <button onClick={sendLocation} className="text-astra-text-muted hover:text-accent p-2 rounded-full hover:bg-accent/10 transition-colors shrink-0 hidden md:block"><MapPin size={20}/></button>
                  <input
                    ref={inputRef}
                    className="astra-input flex-1 text-sm h-10 min-w-0"
                    placeholder={t('msg_type_message')}
                    value={newMessage}
                    onChange={e=>setNewMessage(e.target.value)}
                    onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  />
                  <button onClick={sendMessage} disabled={!newMessage.trim() && !attachment} className="bg-accent hover:bg-accent/80 text-white p-2.5 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"><Send size={18}/></button>
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

      {/* ═══ Incoming Call Modal ═══ */}
      {callState === 'incoming' && callPeer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-astra-surface border border-astra-border rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center mx-auto mb-4">
              {callType === 'video' ? <Video size={32} className="text-accent"/> : <Phone size={32} className="text-accent"/>}
            </div>
            <h3 className="text-lg font-bold text-astra-text mb-1">{callPeer.name}</h3>
            <p className="text-sm text-astra-text-muted mb-6">{callType === 'video' ? t('msg_video_call') : t('msg_voice_call')} — {t('msg_is_calling')}</p>
            <div className="flex justify-center gap-6">
              <button onClick={rejectCall} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg"><PhoneOff size={24}/></button>
              <button onClick={acceptCall} className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg animate-bounce"><Phone size={24}/></button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Calling / Active Call ═══ */}
      {(callState === 'calling' || callState === 'active') && callPeer && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex flex-col items-center justify-center">
          {callType === 'video' && (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover"/>
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute top-4 right-4 w-28 h-20 md:w-48 md:h-36 rounded-xl object-cover border-2 border-white/20 shadow-xl z-10"/>
            </>
          )}
          {(callType === 'voice' || callState === 'calling') && (
            <div className="text-center z-10 mb-12">
              <div className="w-24 h-24 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center mx-auto mb-4">
                <span className="text-accent text-2xl font-bold">{callPeer.name?.charAt(0).toUpperCase()}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{callPeer.name}</h3>
              <p className="text-sm text-white/60">{callState === 'calling' ? t('msg_calling') : fmtDur(callDuration)}</p>
            </div>
          )}
          {callState === 'active' && callType === 'video' && (
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 z-10">
              <p className="text-xs text-white font-mono">{fmtDur(callDuration)}</p>
            </div>
          )}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4 z-10">
            <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${isMuted ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'}`}>
              {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
            </button>
            {callType === 'video' && (
              <button onClick={toggleCamera} className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${isCameraOff ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                {isCameraOff ? <VideoOff size={20}/> : <Video size={20}/>}
              </button>
            )}
            <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg"><PhoneOff size={22}/></button>
          </div>
        </div>
      )}

      {/* ═══ New Chat Modal ═══ */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center" onClick={()=>setShowNewChat(false)}>
          <div className="bg-astra-surface border border-astra-border rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-astra-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-astra-text">{t('msg_new_chat')}</h3>
                <button onClick={()=>setShowNewChat(false)} className="text-astra-text-muted hover:text-astra-text"><X size={16}/></button>
              </div>
              <div className="flex gap-1 bg-astra-bg rounded-lg p-0.5 mb-3">
                <button onClick={()=>{setIsGroup(false);setSelectedMembers([]);}} className={`flex-1 text-xs py-1.5 rounded-md transition-all ${!isGroup?'bg-accent/15 text-accent font-medium':'text-astra-text-muted'}`}>{t('msg_direct')}</button>
                <button onClick={()=>setIsGroup(true)} className={`flex-1 text-xs py-1.5 rounded-md transition-all ${isGroup?'bg-accent/15 text-accent font-medium':'text-astra-text-muted'}`}>{t('msg_group')}</button>
              </div>
              {isGroup && <input className="astra-input text-xs mb-3" placeholder={t('msg_group_name')} value={groupName} onChange={e=>setGroupName(e.target.value)}/>}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted"/>
                <input className="astra-input pl-9 text-xs" placeholder={t('msg_search_people')} value={newChatSearch} onChange={e=>setNewChatSearch(e.target.value)}/>
              </div>
              {isGroup && selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedMembers.map(id => {
                    const u = users.find(x=>x.id===id);
                    return u ? <span key={id} className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full flex items-center gap-1 border border-accent/25">{u.name} <button onClick={()=>toggleMember(id)}><X size={10}/></button></span> : null;
                  })}
                </div>
              )}
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {filteredUsers.map(u => (
                <button key={u.id} onClick={()=> isGroup ? toggleMember(u.id) : startDirectChat(u.id)}
                  className={`w-full text-left p-3 border-b border-astra-border/50 hover:bg-astra-muted/30 transition-colors flex items-center gap-3 ${selectedMembers.includes(u.id) ? 'bg-accent/10' : ''}`}>
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center">
                      <span className="text-accent text-sm font-bold">{u.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-astra-surface ${isOnline?.(u.id) ? 'bg-green-500' : 'bg-gray-500'}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-astra-text">{u.name}</p>
                    <p className="text-[10px] text-astra-text-muted">{isOnline?.(u.id) ? t('msg_online') : t('msg_offline')} · {u.department || t('msg_general')}</p>
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
