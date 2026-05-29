import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, MoreVertical, ChevronLeft, User, Loader2, Settings } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, onValue, serverTimestamp, update, query, limitToLast, orderByChild, equalTo } from 'firebase/database';

export const ChatLayout = ({ 
  isMobile, 
  onClose, 
  user, 
  isDarkMode, 
  chatTab, 
  setChatTab, 
  chatSellerId, 
  setChatSellerId,
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
  const [sellerChatPartners, setSellerChatPartners] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- LOGIKA FETCH LIST PARTNER PENJUAL (SISI PEMBELI) ---
  useEffect(() => {
    if (chatTab === 'seller' && !chatSellerId && user?.uid) {
      setLoading(true);
      // Query terpusat ke seller_chats dimana saya adalah pembelinya
      const chatsRef = query(ref(db, 'seller_chats'), orderByChild('buyerId'), equalTo(user.uid));
      const unsubscribe = onValue(chatsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.keys(data).map(key => ({ 
            id: key, 
            sellerId: data[key].sellerId, 
            ...data[key] 
          }));
          setSellerChatPartners(list.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0)));
        } else {
          setSellerChatPartners([]);
        }
        setLoading(false);
      }, (error) => {
        console.error("Gagal ambil daftar partner:", error);
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [chatTab, chatSellerId, user?.uid]);

  // LOGIKA 1 & 2: Pisahkan Alur Simpan & Filter Path Berdasarkan Tab Aktif
  const getChatConfig = () => {
    const currentId = user?.uid;
    if (!currentId) return { messagesPath: null, metaPath: null, roomId: null };
    
    if (chatTab === 'admin') {
      return {
        messagesPath: `chats/${currentId}/messages`,
        metaPath: `chats/${currentId}`,
        roomId: currentId
      };
    } else if (chatTab === 'seller') {
      const partnerId = isSellerView ? chatBuyerId : chatSellerId;
      if (!partnerId) return { messagesPath: null, metaPath: null, roomId: null };

      // Logika konsisten: sort alfabetis UID tanpa prefix agar tidak menabrak rules 'chats' admin
      const buyerId = isSellerView ? partnerId : currentId;
      const sellerId = isSellerView ? currentId : partnerId;
      const roomId = buyerId < sellerId ? `${buyerId}_${sellerId}` : `${sellerId}_${buyerId}`;

      return {
        messagesPath: `seller_chats/${roomId}/messages`,
        metaPath: `seller_chats/${roomId}`,
        roomId: roomId,
        buyerId,
        sellerId
      };
    } else {
      return { messagesPath: null, metaPath: null, roomId: null };
    }
  };

  // LOGIKA 3: Ambil Pesan Realtime Berdasarkan Path Sesuai Tab
  useEffect(() => {
    const config = getChatConfig();
    if (!config.messagesPath) return;

    setLoading(true);

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
  }, [chatTab, chatSellerId, chatBuyerId, user?.uid]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const config = getChatConfig();
    if (!config.messagesPath) return;

    const messageData = {
      senderId: user.uid,
      senderName: user.displayName,
      text: inputText,
      timestamp: serverTimestamp(),
      sender: chatTab === 'admin' ? 'user' : (isSellerView ? 'seller' : 'buyer'), 
      status: 'sent'
    };

    try {
      await push(ref(db, config.messagesPath), messageData);

      const metaUpdate = {
        lastMessageText: inputText,
        lastMessageTime: serverTimestamp(),
      };

      if (chatTab === 'admin') {
        metaUpdate.userName = user.displayName;
        metaUpdate.userPhoto = user.photoURL || '';
        metaUpdate.userEmail = user.email;
        metaUpdate.hasUnreadAdmin = true;
      } else {
        metaUpdate.sellerId = config.sellerId;
        metaUpdate[isSellerView ? 'hasUnreadUser' : 'hasUnreadSeller'] = true;
        // Jika pembeli yang kirim, update info pembeli untuk seller
        if (!isSellerView) {
          metaUpdate.userName = user.displayName;
          metaUpdate.userPhoto = user.photoURL || '';
        }
      }

      await update(ref(db, config.metaPath), metaUpdate);

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
          {isMobile && (
            <button onClick={() => {
              if (chatTab === 'seller' && chatSellerId) {
                setChatSellerId(null); // Balik ke list partner
              } else {
                onClose(); // Keluar ke Home
              }
            }}>
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="flex flex-col">
            <span className="font-bold text-sm">
              {chatTab === 'admin' ? 'Customer Service' : (chatSellerId ? sellerChatPartners.find(p => p.sellerId === chatSellerId)?.storeName || 'Chat Penjual' : 'Kotak Masuk')}
            </span>
            <span className="text-[10px] opacity-80">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}><MoreVertical size={20} /></button>
          {!isMobile && <button onClick={onClose}><X size={20} /></button>}
        </div>
      </div>

      {/* --- TAB NAVIGATION (MOBILE & DESKTOP) --- */}
      <div className={`flex border-b text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50'}`}>
        <button 
          onClick={() => { setChatTab('admin'); setChatSellerId(null); }}
          className={`flex-1 py-3 border-b-2 transition-all ${chatTab === 'admin' ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-400'}`}
        >Bantuan Admin</button>
        <button 
          onClick={() => setChatTab('seller')}
          className={`flex-1 py-3 border-b-2 transition-all ${chatTab === 'seller' ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-400'}`}
        >Chat Penjual</button>
      </div>

      {/* List Pesan */}
      <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        {chatTab === 'seller' && !chatSellerId ? (
          loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-500" /></div>
          ) : sellerChatPartners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
              <MessageCircle size={48} className="mb-2" />
              <p className="text-sm font-bold">Belum ada percakapan dengan penjual.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sellerChatPartners.map(partner => (
                <div 
                  key={partner.id} 
                  onClick={() => setChatSellerId(partner.sellerId)}
                  className={`p-4 rounded-2xl border flex items-center gap-4 cursor-pointer transition-all active:scale-[0.98] ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-100 hover:bg-sky-50'}`}
                >
                  <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                    {partner.storePhoto ? <img src={partner.storePhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-sky-100 text-sky-600 font-bold uppercase">{partner.storeName?.charAt(0) || 'S'}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{partner.storeName || 'Penjual'}</h3>
                    <p className="text-xs truncate text-gray-500 mt-0.5">{partner.lastMessageText || 'Klik untuk melihat pesan'}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              ))}
            </div>
          )
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
      {(chatTab === 'admin' || (chatTab === 'seller' && chatSellerId)) && (
        <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ketik pesan untuk ${chatTab === 'admin' ? 'Admin' : 'Penjual'}...`}
            className={`flex-1 px-4 py-2 rounded-full text-sm outline-none ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-800'}`}
          />
          <button type="submit" disabled={!inputText.trim()} className="p-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-colors shadow-md shadow-sky-200 disabled:opacity-50"><Send size={20} /></button>
        </form>
      )}
    </div>
  );
};