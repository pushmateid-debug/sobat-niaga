import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, MoreVertical, ChevronLeft, User, Loader2 } from 'lucide-react';
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
    if (chatTab === 'admin') {
      return {
        messagesPath: `admin_chats/${user.uid}/messages`,
        metaPath: `admin_chats/${user.uid}`
      };
    } else {
      // Format Room ID unik: buyerId_sellerId
      const roomId = isSellerView ? `${chatBuyerId}_${user.uid}` : `${user.uid}_${chatSellerId}`;
      return {
        messagesPath: `seller_chats/${roomId}/messages`,
        metaPath: `seller_chats/${roomId}`,
        roomId
      };
    }
  };

  // LOGIKA 3: Ambil Pesan Realtime Berdasarkan Path Sesuai Tab
  useEffect(() => {
    setLoading(true);
    const config = getChatConfig();
    const msgQuery = query(ref(db, config.messagesPath), limitToLast(50));

    const unsubscribe = onValue(msgQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMessages(list);
      } else {
        setMessages([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatTab, chatSellerId, chatBuyerId]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const config = getChatConfig();
    const messageData = {
      senderId: user.uid,
      senderName: user.displayName,
      text: inputText,
      timestamp: serverTimestamp()
    };

    try {
      // 1. Simpan Pesan ke Firebase
      await push(ref(db, config.messagesPath), messageData);

      // 2. Update Metadata (Last Message & Unread Status) untuk Sisi Penerima
      const metaData = {
        lastMessageText: inputText,
        lastMessageTime: serverTimestamp(),
      };

      if (chatTab === 'admin') {
        metaData.userName = user.displayName;
        metaData.userPhoto = user.photoURL;
        metaData.userEmail = user.email;
      } else {
        if (!isSellerView) {
          // Jika pembeli yang kirim -> tandai unread untuk Penjual
          metaData.sellerId = chatSellerId;
          metaData.userName = user.displayName;
          metaData.userPhoto = user.photoURL;
          metaData.hasUnreadSeller = true;
        } else {
          // Jika penjual yang balas -> tandai unread untuk Pembeli
          metaData.hasUnreadBuyer = true;
        }
      }

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
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-500" /></div>
        ) : messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
              msg.senderId === user.uid 
                ? 'bg-sky-500 text-white rounded-tr-none' 
                : (isDarkMode ? 'bg-slate-800 text-gray-200' : 'bg-white text-gray-800') + ' rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Form Input */}
      <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <input 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ketik pesan..."
          className={`flex-1 px-4 py-2 rounded-full text-sm outline-none ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-800'}`}
        />
        <button type="submit" className="p-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-colors shadow-md shadow-sky-200"><Send size={20} /></button>
      </form>
    </div>
  );
};