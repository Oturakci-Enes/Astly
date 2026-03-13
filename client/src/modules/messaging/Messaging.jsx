import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { io } from 'socket.io-client';
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
  MapPin,
  Phone,
  Video,
  PhoneOff,
  MicOff,
  VideoOff,
  PhoneIncoming
} from 'lucide-react';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function Messaging() {
  const { api, user: currentUser, token } = useAuth();
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
  const activeConvRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const prevMessagesLenRef = useRef(0);

  // ─── Call state ──────────────────────────────────────────────────────
  const [callState, setCallState] = useState('idle'); // idle | calling | incoming | active
  const [callType, setCallType] = useState(null);     // 'voice' | 'video'
  const [callPeer, setCallPeer] = useState(null);     // { id, name }
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimerRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const callStateRef = useRef('idle');

  // Keep refs in sync with state
  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    loadConversations();
    loadUsers();
    // Poll for new messages every 5 seconds
    pollRef.current = setInterval(() => {
      loadConversations();
      if (activeConvRef.current) loadMessages(activeConvRef.current.id, true);
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
      inputRef.current?.focus();
    }
  }, [activeConv?.id]);

  useEffect(() => {
    // Only scroll to bottom when new messages actually arrive
    if (messages.length > prevMessagesLenRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages]);

  // ─── Socket.io connection for WebRTC signaling ──────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = io(window.location.origin.replace(/:\d+$/, ':3002'), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('incoming-call', ({ from, fromName, type, offer }) => {
      // If already in a call, reject automatically
      if (callStateRef.current !== 'idle') {
        socket.emit('call-rejected', { to: from });
        return;
      }
      pendingOfferRef.current = offer;
      setCallState('incoming');
      setCallType(type);
      setCallPeer({ id: from, name: fromName });
    });

    socket.on('call-accepted', async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('active');
        }
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    });

    socket.on('call-rejected', () => {
      cleanupCall();
    });

    socket.on('call-ended', () => {
      cleanupCall();
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      try {
        if (peerConnectionRef.current && candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Call duration timer
  useEffect(() => {
    if (callState === 'active') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callState]);

  // ─── Call functions ─────────────────────────────────────────────────
  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    pendingOfferRef.current = null;
    setCallState('idle');
    setCallType(null);
    setCallPeer(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallDuration(0);
  };

  const initiateCall = async (type) => {
    if (!activeConv || activeConv.type !== 'direct') return;
    const peer = activeConv.members?.find(m => m.id !== currentUser.id);
    if (!peer) return;

    try {
      const constraints = { audio: true, video: type === 'video' };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit('ice-candidate', { to: peer.id, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('call-user', { to: peer.id, type, offer });

      setCallState('calling');
      setCallType(type);
      setCallPeer({ id: peer.id, name: peer.name });

      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Call initiation failed:', err);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    try {
      const offer = pendingOfferRef.current;
      if (!offer) return;

      const constraints = { audio: true, video: callType === 'video' };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit('ice-candidate', { to: callPeer.id, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('call-accepted', { to: callPeer.id, answer });

      setCallState('active');

      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Accept call failed:', err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    socketRef.current?.emit('call-rejected', { to: callPeer?.id });
    cleanupCall();
  };

  const endCall = () => {
    socketRef.current?.emit('call-ended', { to: callPeer?.id });
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  const formatCallDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // ─── Messaging functions ────────────────────────────────────────────
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
    <div className="p-2 md:p-6 h-[calc(100vh-2rem)]">
      <div className="flex h-full bg-astra-surface border border-astra-border rounded-2xl md:rounded-2xl rounded-xl overflow-hidden">

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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-astra-text">{activeConv.display_name}</p>
                  <p className="text-[10px] text-astra-text-muted">
                    {activeConv.type === 'group'
                      ? `${activeConv.members?.length || 0} ${t('msg_members')}`
                      : activeConv.members?.find(m=>m.id!==currentUser.id)?.role || ''}
                  </p>
                </div>
                {/* Call buttons — only for direct chats */}
                {activeConv.type === 'direct' && callState === 'idle' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => initiateCall('voice')}
                      className="p-2 rounded-lg text-astra-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                      title={t('msg_voice_call')}
                    >
                      <Phone size={18}/>
                    </button>
                    <button
                      onClick={() => initiateCall('video')}
                      className="p-2 rounded-lg text-astra-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                      title={t('msg_video_call')}
                    >
                      <Video size={18}/>
                    </button>
                  </div>
                )}
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
                        {/* Time + Read receipts */}
                        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end mr-1' : 'ml-1'}`}>
                          <span className="text-[9px] text-astra-text-muted">
                            {new Date(msg.created_at).toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' })}
                          </span>
                          {isMine && (
                            msg.all_read
                              ? <CheckCheck size={14} className="text-blue-400"/>
                              : <Check size={14} className="text-white/50"/>
                          )}
                        </div>
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

      {/* ─── Incoming Call Modal ─────────────────────────────────────── */}
      {callState === 'incoming' && callPeer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-astra-surface border border-astra-border rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl animate-pulse-slow">
            <div className="w-20 h-20 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center mx-auto mb-4">
              {callType === 'video' ? <Video size={32} className="text-accent"/> : <Phone size={32} className="text-accent"/>}
            </div>
            <h3 className="text-lg font-bold text-astra-text mb-1">{callPeer.name}</h3>
            <p className="text-sm text-astra-text-muted mb-6">
              {callType === 'video' ? t('msg_video_call') : t('msg_voice_call')} — {t('msg_is_calling')}
            </p>
            <div className="flex justify-center gap-6">
              <button
                onClick={rejectCall}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg"
                title={t('msg_reject_call')}
              >
                <PhoneOff size={24}/>
              </button>
              <button
                onClick={acceptCall}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors shadow-lg animate-bounce"
                title={t('msg_accept_call')}
              >
                <Phone size={24}/>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Calling / Active Call Overlay ────────────────────────────── */}
      {(callState === 'calling' || callState === 'active') && callPeer && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex flex-col items-center justify-center">
          {/* Video containers */}
          {callType === 'video' && (
            <>
              {/* Remote video — full screen background */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Local video — small picture-in-picture */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute top-4 right-4 w-32 h-24 md:w-48 md:h-36 rounded-xl object-cover border-2 border-white/20 shadow-xl z-10"
              />
            </>
          )}

          {/* Voice call or calling state info */}
          {(callType === 'voice' || callState === 'calling') && (
            <div className="text-center z-10 mb-12">
              <div className="w-24 h-24 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center mx-auto mb-4">
                <span className="text-accent text-2xl font-bold">{callPeer.name?.charAt(0).toUpperCase()}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{callPeer.name}</h3>
              <p className="text-sm text-white/60">
                {callState === 'calling' ? t('msg_calling') : formatCallDuration(callDuration)}
              </p>
            </div>
          )}

          {/* Active video call duration badge */}
          {callState === 'active' && callType === 'video' && (
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 z-10">
              <p className="text-xs text-white font-mono">{formatCallDuration(callDuration)}</p>
            </div>
          )}

          {/* Call controls */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4 z-10">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-lg ${
                isMuted ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              title={isMuted ? t('msg_unmute') : t('msg_mute')}
            >
              {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
            </button>

            {callType === 'video' && (
              <button
                onClick={toggleCamera}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-lg ${
                  isCameraOff ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                title={isCameraOff ? t('msg_camera_on') : t('msg_camera_off')}
              >
                {isCameraOff ? <VideoOff size={20}/> : <Video size={20}/>}
              </button>
            )}

            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg"
              title={t('msg_end_call')}
            >
              <PhoneOff size={22}/>
            </button>
          </div>
        </div>
      )}

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
