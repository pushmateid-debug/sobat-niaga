import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, MoreVertical, ChevronLeft, ChevronRight, User, Loader2, Settings, Trash2, ShoppingBag, Sparkles } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, onValue, serverTimestamp, update, query, limitToLast, orderByChild, equalTo, get, remove } from 'firebase/database';
import Swal from 'sweetalert2';
import { useLocation, useNavigate } from 'react-router-dom';

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
  onViewProfile,
  pendingProduct,
  setPendingProduct,
  onOpenInstantMenu
}) => {
  const location = useLocation();
  const navigate = useNavigate();
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
    const isInsideRoom = isSellerView ? !!chatBuyerId : !!chatSellerId;

    if (chatTab === 'seller' && !isInsideRoom && user?.uid) {
      setLoading(true);
      
      // FIX: Query langsung ke seller_chats dengan filter UID kita (sebagai buyer atau seller)
      // Ini menghindari error PERMISSION_DENIED karena tidak lagi mengakses path /users/ user lain.
      const fieldToFilter = isSellerView ? 'sellerId' : 'buyerId';
      const chatsRef = query(ref(db, 'seller_chats'), orderByChild(fieldToFilter), equalTo(user.uid));

      const unsubscribe = onValue(chatsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.keys(data).map(key => {
            const room = data[key];
            return {
              id: isSellerView ? room.buyerId : room.sellerId,
              partnerName: isSellerView ? room.userName : room.storeName,
              partnerPhoto: isSellerView ? room.userPhoto : room.storePhoto,
              partnerEmail: isSellerView ? room.userEmail : room.storeEmail,
              storeName: room.storeName,
              lastMessage: room.lastMessageText || '',
              timestamp: room.lastMessageTime || 0,
              hasUnread: isSellerView ? room.hasUnreadSeller : room.hasUnreadUser
            };
          });
          setSellerChatPartners(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        } else {
          setSellerChatPartners([]);
        }
        setLoading(false);
      }, (error) => {
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
  }, [chatTab, chatSellerId, chatBuyerId, user?.uid, isSellerView]);

  // --- FUNGSI HAPUS SEMUA CHAT (CLEAR HISTORY) ---
  const handleClearAllChat = async () => {
    const config = getChatConfig();
    if (!config.messagesPath) return;

    const result = await Swal.fire({
      title: 'Hapus Semua Chat?',
      text: "Bro, seriusan mau hapus semua riwayat chat di ruangan ini? Tindakan ini gak bisa dibatalkan!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Ya, Hapus!',
      cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
      try {
        await remove(ref(db, config.messagesPath));
        
        // Update metadata biar di inbox gak muncul potongan chat lama
        await update(ref(db, config.metaPath), {
          lastMessageText: 'Riwayat chat telah dibersihkan',
          lastMessageTime: serverTimestamp()
        });

        setIsChatMenuOpen(false);
        Swal.fire({
          icon: 'success',
          title: 'Berhasil!',
          text: 'Semua chat berhasil dibersihkan, Bro!',
          timer: 1500,
          showConfirmButton: false
        });
      } catch (error) {
        console.error("Gagal menghapus chat:", error);
      }
    }
  };

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
      status: 'sent',
      attachedProduct: pendingProduct || location.state?.attachedProduct || null
    };

    try {
      await push(ref(db, config.messagesPath), messageData);

      // Bersihkan lampiran setelah berhasil dikirim
      if (setPendingProduct) setPendingProduct(null);
      if (location.state?.attachedProduct) navigate(location.pathname, { replace: true, state: { ...location.state, attachedProduct: null } });

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
        metaUpdate.buyerId = config.buyerId; // Pastikan buyerId masuk metadata biar filter list jalan
        metaUpdate[isSellerView ? 'hasUnreadUser' : 'hasUnreadSeller'] = true;
        
        // Jika pembeli yang kirim, update info pembeli untuk seller
        if (!isSellerView) {
          metaUpdate.userName = user.displayName || '';
          metaUpdate.userPhoto = user.photoURL || '';
          metaUpdate.userEmail = user.email || '';
        }
      }

      await update(ref(db, config.metaPath), metaUpdate);

      // SYNC RIWAYAT CHAT (Double-Sided Indexing)
      const partnerId = isSellerView ? config.buyerId : config.sellerId;
      const now = Date.now();

      // 1. Update riwayat di sisi SAYA
      const myUpdate = {
        lastMessage: inputText,
        timestamp: now
      };
      
      if (isSellerView) {
        // Untuk seller, ambil info pembeli dari metadata room
        const roomSnap = await get(ref(db, config.metaPath));
        const roomData = roomSnap.val();
        myUpdate.partnerName = roomData?.userName || 'Pembeli';
        myUpdate.partnerPhoto = roomData?.userPhoto || '';
        myUpdate.partnerEmail = roomData?.userEmail || '';
      } else {
        const roomSnap = await get(ref(db, config.metaPath));
        const roomData = roomSnap.val();
        myUpdate.partnerName = roomData?.storeName || 'Toko';
        myUpdate.partnerPhoto = roomData?.storePhoto || '';
        myUpdate.partnerEmail = roomData?.storeEmail || '';
      }
      await update(ref(db, `users/${user.uid}/chat_partners/${partnerId}`), myUpdate);

      // REMOVE: Kita hapus update ke sisi lawan karena ini yang bikin PERMISSION_DENIED.
      // Karena kita sudah migrasi list chat ke query 'seller_chats', inbox lawan akan
      // otomatis terupdate melalui metadata room tersebut.

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
              {chatTab === 'admin' 
                ? 'Customer Service' 
                : (isSellerView 
                ? (chatBuyerId ? (sellerChatPartners.find(p => p.id === chatBuyerId)?.partnerName || sellerChatPartners.find(p => p.id === chatBuyerId)?.partnerEmail || 'Pelanggan') : 'Kotak Masuk')
                : (chatSellerId ? (sellerChatPartners.find(p => p.id === chatSellerId)?.partnerName || sellerChatPartners.find(p => p.id === chatSellerId)?.partnerEmail || 'Penjual') : 'Kotak Masuk'))}
            </span>
            <span className="text-[10px] opacity-80">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button 
              onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <MoreVertical size={20} />
            </button>

            {/* Dropdown Menu Timbul */}
            {isChatMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsChatMenuOpen(false)}></div>
                <div className={`absolute right-0 mt-2 w-48 border rounded-xl shadow-xl z-50 animate-in fade-in zoom-in duration-200 ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-gray-100'}`}>
                  <button 
                    onClick={handleClearAllChat}
                    className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-800 rounded-xl transition-colors font-medium flex items-center gap-2"
                  >
                    <Trash2 size={16} /> Hapus Semua Chat
                  </button>
                </div>
              </>
            )}
          </div>
          {!isMobile && (
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          )}
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
        >{isSellerView ? 'Chat Pelanggan' : 'Chat Penjual'}</button>
      </div>

      {/* List Pesan */}
      <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        {/* FIX BLANK SCREEN: Cek secara dinamis apakah ada partner chat yang aktif */}
        {chatTab === 'seller' && !(isSellerView ? chatBuyerId : chatSellerId) ? (
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
                  onClick={() => setChatSellerId(partner.id)}
                  className={`p-4 rounded-2xl border flex items-center gap-4 cursor-pointer transition-all active:scale-[0.98] ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-100 hover:bg-sky-50'}`}
                >
                  <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                    {partner.partnerPhoto || partner.storePhoto ? <img src={partner.partnerPhoto || partner.storePhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-sky-100 text-sky-600 font-bold uppercase">{(partner.partnerName || partner.storeName)?.charAt(0) || 'S'}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{partner.partnerName || partner.storeName || partner.partnerEmail || 'Pengguna SobatNiaga'}</h3>
                    <p className="text-xs truncate text-gray-500 mt-0.5">{partner.lastMessage || 'Klik untuk melihat pesan'}</p>
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
                Belum ada percakapan. Silakan kirim pesan untuk memulai.
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                    msg.senderId === user.uid 
                      ? 'bg-sky-500 text-white rounded-tr-none' 
                      : (isDarkMode ? 'bg-slate-800 text-gray-200' : 'bg-white text-gray-800') + ' rounded-tl-none'
                  }`}>
                    {/* ATTACHED PRODUCT CARD */}
                    {msg.attachedProduct && (
                      <div className={`mb-2 p-2 rounded-xl border flex gap-3 ${isDarkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                        <img src={msg.attachedProduct.image} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" alt="" />
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`text-[10px] font-bold truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{msg.attachedProduct.name}</p>
                          <p className="text-[10px] text-sky-500 font-bold mt-1">Rp {parseInt(msg.attachedProduct.price || 0).toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                    )}
                    {msg.text}
                    {/* Menampilkan Jam Pesan */}
                    <p className={`text-[9px] mt-1 text-right ${msg.senderId === user.uid ? 'text-sky-100' : 'text-gray-400'}`}>
                      {msg.timestamp ? new Date(msg.timestamp.seconds ? msg.timestamp.seconds * 1000 : msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Form Input */}
      {(chatTab === 'admin' || (chatTab === 'seller' && (chatSellerId || (isSellerView && chatBuyerId)))) && (
        <form onSubmit={handleSendMessage} className={`p-3 border-t flex flex-col gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          
          {/* RENDER LAMPIRAN PRODUK OTOMATIS (Dani Style) */}
          {(pendingProduct || location.state?.attachedProduct) && (
            <div className="mx-1 mb-2 p-2.5 bg-black/60 border border-slate-700 rounded-2xl flex items-center gap-3 backdrop-blur-md shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
              <img 
                src={(pendingProduct || location.state.attachedProduct).image} 
                alt="Attached" 
                className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-slate-700"
              />
              <div className="flex-1 min-w-0">
                <h5 className="text-[11px] font-bold text-white truncate uppercase tracking-tight">
                  {(pendingProduct || location.state.attachedProduct).name || (pendingProduct || location.state.attachedProduct).title}
                </h5>
                <p className="text-xs text-sky-400 font-black mt-0.5">
                  Rp {Number((pendingProduct || location.state.attachedProduct).price).toLocaleString('id-ID')}
                </p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">
                  Sedang menanyakan produk ini...
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  if (setPendingProduct) setPendingProduct(null);
                  if (location.state?.attachedProduct) navigate(location.pathname, { replace: true, state: { ...location.state, attachedProduct: null } });
                }} 
                className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex gap-2 w-full">
          {chatTab === 'admin' && (
            <button 
              type="button"
              onClick={onOpenInstantMenu}
              className={`p-2.5 rounded-full transition-all active:scale-90 ${isDarkMode ? 'bg-slate-700 text-sky-400' : 'bg-sky-50 text-sky-600'}`}
              title="Pesan Instan"
            >
              <Sparkles size={20} />
            </button>
          )}
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={chatTab === 'admin' ? "Ketik pesan untuk Admin..." : (isSellerView ? "Ketik balasan untuk pelanggan..." : "Ketik pesan untuk Penjual...")}
            className={`flex-1 px-4 py-2 rounded-full text-sm outline-none ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-800'}`}
          />
          <button type="submit" disabled={!inputText.trim()} className="p-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-colors shadow-md shadow-sky-200 disabled:opacity-50"><Send size={20} /></button>
          </div>
        </form>
      )}
    </div>
  );
};