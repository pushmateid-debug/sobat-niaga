import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, User, HelpCircle, ChevronRight, Loader2, Check, CheckCheck, Trash2, CheckCircle, ChevronLeft, Store, MoreVertical } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, onValue, serverTimestamp, update, remove } from 'firebase/database';
import Swal from 'sweetalert2';

// --- INTERNAL CHAT COMPONENT ---
const ChatComponent = ({ user, isDarkMode, playCustomNotificationSound, chatTab, chatSellerId }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const prevMsgCount = useRef(0);
  const isFirstLoadMsg = useRef(true);

  const chatPath = chatTab === 'admin' 
    ? `chats/${user.uid}` 
    : `seller_chats/${user.uid}_${chatSellerId}`;

  useEffect(() => {
    if (!user?.uid) return;
    // If chatTab is seller but no chatSellerId is provided, don't load messages
    if (chatTab === 'seller' && !chatSellerId) {
        setMessages([]); // Clear messages if no seller is selected
        return;
    }

    const chatRef = ref(db, `${chatPath}/messages`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        
        // Trigger suara jika ada pesan baru dari Admin/Lawan Chat
        if (!isFirstLoadMsg.current && msgs.length > prevMsgCount.current) {
            const sorted = [...msgs].sort((a, b) => b.timestamp - a.timestamp);
            if (sorted[0]?.sender !== 'user') {
                playCustomNotificationSound();
            }
        }
        prevMsgCount.current = msgs.length;
        isFirstLoadMsg.current = false;

        setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, [user, chatTab, chatSellerId, chatPath, playCustomNotificationSound]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    // Sanitasi Input Chat
    const text = input.replace(/[<>]/g, "").trim();
    if (!text) return;
    setInput('');
    
    // Determine the correct chat metadata path
    const chatMetaPath = chatTab === 'admin' ? `chats/${user.uid}` : `seller_chats/${user.uid}_${chatSellerId}`;

    await push(ref(db, `${chatPath}/messages`), {
      text,
      sender: 'user',
      timestamp: serverTimestamp()
    });
    await update(ref(db, chatMetaPath), {
      userName: user.displayName,
      hasUnreadAdmin: true, // Mark for admin
      sellerId: chatTab === 'seller' ? chatSellerId : null,
      lastMessageTime: serverTimestamp()
    });
  };

  if (chatTab === 'seller' && !chatSellerId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center p-6">
        <Store size={40} className="mb-3 opacity-50" />
        <p className="text-sm font-bold">Pilih Toko</p>
        <p className="text-xs mt-1 max-w-xs">Kunjungi profil toko untuk mulai chat dengan penjual.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map(m => (
             <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${m.sender === 'user' ? 'bg-sky-600 text-white rounded-tr-none' : (isDarkMode ? 'bg-slate-800 text-gray-200' : 'bg-white text-gray-900 border border-gray-100') + ' rounded-tl-none'}`}>
                   {m.text}
                   <p className={`text-[9px] mt-1 text-right ${m.sender === 'user' ? 'text-sky-100' : 'text-gray-400'}`}>{new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
             </div>
          ))}
          <div ref={bottomRef} className="pb-4" />
      </div>
      
      <div className={`flex-none p-3 border-t z-50 pointer-events-auto ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 max-w-7xl mx-auto items-center">
             <input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder="Tulis pesan..." 
                autoFocus
                className={`flex-1 py-2.5 px-4 rounded-full border text-sm outline-none transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white placeholder-gray-500' : 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500'}`}
             />
             <button type="submit" className="p-2.5 bg-sky-600 text-white rounded-full hover:bg-sky-700 shadow-sm flex-shrink-0 transition-transform active:scale-95"><Send size={18}/></button>
          </form>
       </div>
    </>
  );
};

// --- CHAT LAYOUT COMPONENT (Reusable for Mobile & Desktop) ---
export const ChatLayout = ({ isMobile, onClose, user, isDarkMode, chatTab, setChatTab, chatSellerId, isChatMenuOpen, setIsChatMenuOpen, playCustomNotificationSound, onViewProfile }) => {
  const chatMenuRef = useRef(null); // Ref for the chat menu dropdown

  // Click outside to close chat menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target)) {
        setIsChatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsChatMenuOpen]);

  const handleClearChat = async () => {
    if (!user?.uid) return;
    const chatPath = chatTab === 'admin' 
      ? `chats/${user.uid}` 
      : `seller_chats/${user.uid}_${chatSellerId}`;

    const result = await Swal.fire({
      title: 'Bersihkan Chat?',
      text: "Semua pesan di obrolan ini akan dihapus permanen dari database.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Bersihkan',
      cancelButtonText: 'Batal'
    });
    if (result.isConfirmed) {
      await remove(ref(db, `${chatPath}/messages`));
      // Also clear unread status for this chat
      const chatMetaPath = chatTab === 'admin' ? `chats/${user.uid}` : `seller_chats/${user.uid}_${chatSellerId}`;
      await update(ref(db, chatMetaPath), { hasUnreadAdmin: false, hasUnreadUser: false });
      Swal.fire('Berhasil!', 'Chat berhasil dibersihkan!', 'success');
      setIsChatMenuOpen(false);
    }
  };

  return (
    <div className={`flex flex-col h-full w-full ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
       {/* Chat Header */}
       <div className={`flex-none border-b z-50 transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`px-4 py-3 flex items-center justify-between ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
             <div className="flex items-center gap-2">
                <button onClick={onClose} className={`p-1 rounded-full transition-colors ${isDarkMode ? 'text-white hover:bg-slate-700' : 'text-slate-800 hover:bg-gray-100'}`}>
                    {isMobile ? <ChevronLeft size={26} className="text-sky-600" /> : <X size={24} />}
                </button>
                <div className="flex items-center gap-3 ml-1">
                    <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center border border-sky-50 overflow-hidden">
                            <div className="w-full h-full flex items-center justify-center bg-sky-100 text-sky-600 font-bold text-[10px]">ADM</div>
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full"></div>
                    </div>
                    <div>
                        <h3 className={`font-bold text-sm leading-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Admin SobatNiaga</h3>
                        <p className="text-[10px] text-green-500 font-bold">Online</p>
                    </div>
                </div>
             </div>
             
             <div className="relative" ref={chatMenuRef}>
                 <button onClick={() => setIsChatMenuOpen(!isChatMenuOpen)} className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-gray-100'}`}>
                    <MoreVertical size={20} />
                 </button>
                 {isChatMenuOpen && (
                    <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsChatMenuOpen(false)}></div>
                    <div className={`absolute right-0 top-full mt-2 w-48 rounded-xl shadow-xl border py-1.5 z-50 animate-in fade-in zoom-in duration-200 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                        <button 
                          onClick={() => {
                            if (chatTab === 'admin') {
                              Swal.fire('Info', 'Anda sedang mengobrol dengan Admin Pusat.', 'info');
                              setIsChatMenuOpen(false);
                            } else {
                              // Jika chat seller diaktifkan, arahkan ke profil seller
                              onViewProfile && onViewProfile(chatSellerId); 
                              setIsChatMenuOpen(false);
                            }
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <User size={14} /> Lihat Profil
                        </button>
                        <button 
                          onClick={handleClearChat}
                          className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20`}
                        >
                            <Trash2 size={14} /> Bersihkan Chat
                        </button>
                    </div>
                    </>
                 )}
             </div>
          </div>
          
          <div className={`flex border-t ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
             <button 
                onClick={() => setChatTab('admin')} 
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors ${
                    chatTab === 'admin' 
                    ? (isDarkMode ? 'border-sky-500 text-sky-400 bg-slate-800' : 'border-sky-600 text-sky-700 bg-sky-50/50') 
                    : (isDarkMode ? 'border-transparent text-gray-400 hover:bg-slate-800' : 'border-transparent text-gray-500 hover:bg-gray-50')
                }`}
             >
                Chat Admin
             </button>
             <button 
                onClick={() => setChatTab('seller')} 
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors ${
                    chatTab === 'seller' 
                    ? (isDarkMode ? 'border-sky-500 text-sky-400 bg-slate-800' : 'border-sky-600 text-sky-700 bg-sky-50/50') 
                    : (isDarkMode ? 'border-transparent text-gray-400 hover:bg-slate-800' : 'border-transparent text-gray-500 hover:bg-gray-50')
                }`}
             >
                Chat Seller
             </button>
          </div>
       </div>

       <div className={`flex-1 relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
          {!user ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
              <User size={40} className="mb-2 opacity-50" />
              <p className="text-sm">Silakan login untuk memulai chat.</p>
              <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg text-xs font-bold">Login</button>
            </div>
          ) : (
            <ChatComponent user={user} isDarkMode={isDarkMode} playCustomNotificationSound={playCustomNotificationSound} chatTab={chatTab} chatSellerId={chatSellerId} />
          )}
       </div>
    </div>
  );
};