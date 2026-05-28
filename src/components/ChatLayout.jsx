import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, MoreVertical, ChevronLeft, User, Loader2, Settings } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, onValue, serverTimestamp, update, query, limitToLast } from 'firebase/database';

export const ChatLayout = ({ 
  isMobile, 
  onClose, 
  user, 
  isDarkMode, 
  chatTab, 
  setChatTab, 
  chatSellerId, 
  chatBuyerId,
  isSellerView,
  setIsChatMenuOpen, 
  isChatMenuOpen,
  playCustomNotificationSound,
  onViewProfile
}) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // LOGIKA 1 & 2: Pisahkan Alur Simpan & Filter Path Berdasarkan Tab Aktif
  const getChatConfig = () => {
    // KEMBALI KE PATH ASLI: Admin chat menggunakan UID user langsung sebagai Room ID
    const buyerId = user.uid;
    
    if (chatTab === 'admin') {
      return {
        messagesPath: `chats/${buyerId}/messages`,
        metaPath: `chats/${buyerId}`,
        roomId: buyerId
      };
    } else {
      // MATIKAN ENGINE SELLER: Return null agar tidak memicu query ke Firebase
      return {
        messagesPath: null,
        metaPath: null,
        roomId: null
      };
    }
  };

  // LOGIKA 3: Ambil Pesan Realtime Berdasarkan Path Sesuai Tab
  useEffect(() => {
    if (chatTab === 'seller') {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const config = getChatConfig();
    if (!config.messagesPath) return;

    const msgQuery = query(ref(db, config.messagesPath), limitToLast(50));

    const unsubscribe = onValue(msgQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMessages(list);
      } else {
        setMessages([]);
      }
      setLoading(false); // WAJIB: Matikan loading di sini, baik ada data atau kosong!
    }, (error) => {
      console.error("Firebase Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatTab, user.uid]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || chatTab !== 'admin') return;

    const config = getChatConfig();
    const messageData = {
      senderId: user.uid,
      senderName: user.displayName,
      text: inputText,
      timestamp: serverTimestamp(),
      sender: 'user', // Identitas untuk Admin Panel
      status: 'sent'
    };

    try {
      await push(ref(db, config.messagesPath), messageData);

      const metaData = {
        lastMessageText: inputText,
        lastMessageTime: serverTimestamp(),
        userName: user.displayName,
        userPhoto: user.photoURL || '',
        userEmail: user.email,
        hasUnreadAdmin: true // Notifikasi titik merah di Dashboard Admin
      };

      await update(ref(db, config.metaPath), metaData);
      setInputText('');
    } catch (error) {
      console.error("Gagal kirim pesan:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Chat */}
      <div className={`p-3 border-b flex items-center justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-sky-600 text-white'}`}>
        <div className="flex items-center gap-3">
          {isMobile && <button onClick={onClose}><ChevronLeft size={24} /></button>}
          <div className="flex flex-col">
            <span className="font-bold text-sm">
              {chatTab === 'admin' ? 'Customer Service' : 'Chat Penjual'}
            </span>
            <span className="text-[10px] opacity-80">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}><MoreVertical size={20} /></button>
          {!isMobile && <button onClick={onClose}><X size={20} /></button>}
        </div>
      </div>

      {/* Tab Switcher (Khusus Desktop) */}
      {!isMobile && (
        <div className={`flex border-b text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50'}`}>
          <button 
            onClick={() => setChatTab('admin')}
            className={`flex-1 py-2 border-b-2 transition-all ${chatTab === 'admin' ? 'border-sky-500 text-sky-500' : 'border-transparent text-gray-400'}`}
          >Bantuan Admin</button>
          <button 
            onClick={() => setChatTab('seller')}
            className={`flex-1 py-2 border-b-2 transition-all ${chatTab === 'seller' ? 'border-sky-500 text-sky-500' : 'border-transparent text-gray-400'}`}
          >Chat Penjual</button>
        </div>
      )}

      {/* List Pesan */}
      <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        {chatTab === 'seller' ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-70">
            <div className="p-4 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
              <Settings size={40} className="animate-spin" />
            </div>
            <div>
              <h4 className="font-black text-sm uppercase tracking-wider">Maintenance</h4>
              <p className="text-xs mt-1">Fitur Chat Penjual sedang diperbaiki.<br/>Gunakan Bantuan Admin untuk sementara.</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-500" /></div>
        ) : (
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs italic">
                Belum ada percakapan. Silakan tulis pesan untuk bantuan Admin.
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                    msg.senderId === user.uid 
                      ? 'bg-sky-500 text-white rounded-tr-none' 
                      : (isDarkMode ? 'bg-slate-800 text-gray-200' : 'bg-white text-gray-800') + ' rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Form Input */}
      {chatTab === 'admin' && (
        <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ketik pesan untuk Admin..."
            className={`flex-1 px-4 py-2 rounded-full text-sm outline-none ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-800'}`}
          />
          <button type="submit" className="p-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-colors shadow-md shadow-sky-200"><Send size={20} /></button>
        </form>
      )}
    </div>
  );
};