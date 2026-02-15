import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, HelpCircle, ChevronRight, Loader2, Check, CheckCheck, Trash2, CheckCircle } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, onValue, serverTimestamp, update, remove } from 'firebase/database';
import { useTheme } from '../context/ThemeContext';

export const ChatWidget = ({ user, customIcon }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('faq'); // 'faq' | 'chat'
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const widgetRef = useRef(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // FAQ Data (Bisa dipindah ke database nanti)
  const faqs = [
    { q: "Bagaimana cara pesan?", a: "Pilih produk, masukkan keranjang, lalu checkout dan lakukan pembayaran sesuai instruksi." },
    { q: "Berapa lama pengiriman?", a: "Untuk produk fisik 2-3 hari kerja. Untuk produk digital/game instan (1-10 menit)." },
    { q: "Apakah aman belanja di sini?", a: "Sangat aman! Kami menggunakan sistem Rekber (Rekening Bersama). Dana diteruskan ke penjual hanya setelah pesanan diterima." },
    { q: "Cara jadi penjual?", a: "Masuk ke menu Profil -> Dasbor Seller, lalu lengkapi data toko Anda." }
  ];

  // Load Chat Messages Realtime
  useEffect(() => {
    if (user?.uid && activeTab === 'chat') {
      setIsLoading(true);
      const chatRef = ref(db, `chats/${user.uid}/messages`);
      const unsubscribe = onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        const loadedMessages = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        // Sort by timestamp
        setMessages(loadedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [user, activeTab]);

  // Auto Scroll ke Bawah
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen, activeTab]);

  // Listener Notifikasi (Red Badge)
  useEffect(() => {
    if (user?.uid) {
      const metaRef = ref(db, `chats/${user.uid}`);
      const unsubscribe = onValue(metaRef, (snapshot) => {
        const data = snapshot.val();
        // Cek apakah ada pesan belum dibaca oleh User
        setHasUnread(data?.hasUnreadUser === true);
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Auto-Clear Badge saat Chat Dibuka
  useEffect(() => {
    if (isOpen && hasUnread && user?.uid) {
      update(ref(db, `chats/${user.uid}`), { hasUnreadUser: false });
    }
  }, [isOpen, hasUnread, user]);

  // Mark Admin Messages as Read (Saat User buka chat)
  useEffect(() => {
    if (isOpen && messages.length > 0 && user?.uid) {
      const updates = {};
      let hasUpdates = false;
      messages.forEach(msg => {
        if (msg.sender === 'admin' && msg.status !== 'read') {
          updates[`chats/${user.uid}/messages/${msg.id}/status`] = 'read';
          hasUpdates = true;
        }
      });
      if (hasUpdates) {
        update(ref(db), updates);
      }
    }
  }, [messages, isOpen, user]);

  // Click Outside to Close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !user) return;

    try {
      await push(ref(db, `chats/${user.uid}/messages`), {
        text: message,
        sender: 'user', // 'user' | 'admin'
        timestamp: serverTimestamp(),
        userName: user.displayName || 'User',
        status: 'sent'
      });
      
      // Update Metadata untuk Admin (Biar Admin dapet notif titik merah)
      await update(ref(db, `chats/${user.uid}`), {
        hasUnreadAdmin: true,
        lastMessageTime: serverTimestamp(),
        userName: user.displayName || 'User',
        userPhoto: user.photoURL || ''
      });
      setMessage('');
    } catch (error) {
      console.error("Gagal kirim pesan:", error);
    }
  };

  const handleClearChat = () => {
    if (user?.uid && messages.length > 0) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDeleteChat = async () => {
    if (user?.uid) {
      try {
        await remove(ref(db, `chats/${user.uid}/messages`));
        setShowDeleteConfirm(false);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      } catch (error) {
        console.error("Gagal hapus chat:", error);
      }
    }
  };

  return (
    <div ref={widgetRef} className="fixed bottom-24 right-6 z-[100] flex flex-col items-end">
      
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute bottom-full mb-4 right-0 bg-white dark:bg-slate-800 border border-green-100 dark:border-green-900/30 shadow-xl rounded-xl p-3 flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 w-max max-w-[300px] z-[160]">
          <div className="bg-green-100 dark:bg-green-900/50 p-1.5 rounded-full text-green-600 dark:text-green-400">
            <CheckCircle size={16} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Berhasil!</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Riwayat Chat Berhasil Dibersihkan!</p>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-[320px] p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center transform transition-all scale-100 animate-in zoom-in-95 duration-200 ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}>
            <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-5 animate-pulse">
              <Trash2 size={36} className="text-red-500" />
            </div>
            <h3 className={`text-xl font-extrabold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Hapus Semua Pesan?</h3>
            <p className={`text-sm mb-8 leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Tindakan ini tidak bisa dibatalkan, Bro. Yakin mau dibersihin?
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${isDarkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Batal
              </button>
              <button 
                onClick={confirmDeleteChat}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 dark:shadow-none transition-all"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`mb-4 w-[350px] max-w-[90vw] rounded-2xl shadow-2xl border overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 fade-in duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          
          {/* Header */}
          <div className="bg-sky-600 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-1.5 rounded-full">
                <MessageCircle size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm">Customer Service</h3>
                <p className="text-[10px] text-sky-100">Siap membantu 24/7</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeTab === 'chat' && messages.length > 0 && (
                <button onClick={handleClearChat} className="hover:bg-white/20 p-1 rounded-full transition-colors" title="Hapus Chat">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
            <button 
              onClick={() => setActiveTab('faq')} 
              className={`flex-1 py-3 text-xs font-bold transition-colors ${activeTab === 'faq' ? (isDarkMode ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-700' : 'text-sky-600 border-b-2 border-sky-600 bg-sky-50') : (isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-50')}`}
            >
              FAQ (Tanya Jawab)
            </button>
            <button 
              onClick={() => setActiveTab('chat')} 
              className={`flex-1 py-3 text-xs font-bold transition-colors ${activeTab === 'chat' ? (isDarkMode ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-700' : 'text-sky-600 border-b-2 border-sky-600 bg-sky-50') : (isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-50')}`}
            >
              Live Chat Admin
            </button>
          </div>

          {/* Content Area */}
          <div className={`h-80 overflow-y-auto p-4 scrollbar-thin ${isDarkMode ? 'bg-slate-900 scrollbar-thumb-slate-700' : 'bg-gray-50 scrollbar-thumb-gray-200'}`}>
            
            {/* FAQ Tab */}
            {activeTab === 'faq' && (
              <div className="space-y-2">
                {faqs.map((faq, idx) => (
                  <div key={idx} className={`rounded-xl p-3 shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <h4 className={`text-xs font-bold mb-1 flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      <HelpCircle size={12} className="text-sky-500" /> {faq.q}
                    </h4>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{faq.a}</p>
                  </div>
                ))}
                <div className="text-center mt-4">
                  <p className="text-xs text-gray-400 mb-2">Masih butuh bantuan?</p>
                  <button onClick={() => setActiveTab('chat')} className="text-xs font-bold text-sky-600 hover:underline">
                    Chat Langsung dengan Admin
                  </button>
                </div>
              </div>
            )}

            {/* Live Chat Tab */}
            {activeTab === 'chat' && (
              <>
                {!user ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                    <User size={32} className="mb-2 opacity-50" />
                    <p className="text-xs">Silakan login untuk chat dengan Admin.</p>
                  </div>
                ) : isLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-600" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-xs">
                    <p>Halo, {user.displayName}!</p>
                    <p>Tulis pesanmu, Admin akan segera membalas.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                          msg.sender === 'user' 
                            ? 'bg-sky-600 text-white rounded-tr-none' 
                            : (isDarkMode ? 'bg-slate-800 text-sky-100 border-slate-700' : 'bg-sky-50 text-slate-800 border-sky-100') + ' border rounded-tl-none'
                        }`}>
                          {msg.text}
                          <div className={`text-[9px] mt-1 text-right flex items-center justify-end gap-1 ${msg.sender === 'user' ? 'text-sky-200' : 'text-gray-400'}`}>
                            <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {msg.sender === 'user' && (
                              msg.status === 'read' 
                                ? <CheckCheck size={12} className="text-green-300 font-bold" /> 
                                : <Check size={12} className="text-sky-200" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input Area (Only for Chat Tab) */}
          {activeTab === 'chat' && user && (
            <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
              <input 
                type="text" 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tulis pesan..." 
                className={`flex-1 border-none rounded-full px-4 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-800'}`}
              />
              <button type="submit" disabled={!message.trim()} className="bg-sky-600 text-white p-2 rounded-full hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <Send size={16} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
      >
        {customIcon ? (
          <img src={customIcon} alt="Chat" className="w-14 h-14 object-cover rounded-full aspect-square drop-shadow-xl" />
        ) : (
          <div className="w-14 h-14 bg-sky-600 rounded-full flex items-center justify-center shadow-lg shadow-sky-600/30 text-white">
            <MessageCircle size={28} />
          </div>
        )}
        
        {/* Notification Badge (Dummy for now) */}
        {hasUnread && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
        )}
      </button>
    </div>
  );
};

export default ChatWidget;