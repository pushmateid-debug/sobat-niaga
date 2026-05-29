import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageCircle, User, Search, Frown, Loader2 } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { useTheme } from '../context/ThemeContext';

const SellerInbox = ({ user, onBack, onChatClick }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [chatRooms, setChatRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const chatsRef = query(ref(db, 'seller_chats'), orderByChild('sellerId'), equalTo(user.uid));
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loaded = Object.keys(data).map(key => {
          const parts = key.split('_');
          return {
            id: key,
            buyerId: parts[0] === user.uid ? parts[1] : parts[0],
            ...data[key]
          };
        });
        setChatRooms(loaded.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0)));
      } else {
        setChatRooms([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user.uid]);

  const filteredRooms = chatRooms.filter(room => room.userName?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={`min-h-screen pb-20 flex flex-col transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className={`sticky top-0 z-50 p-4 border-b flex items-center gap-4 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">Pesan Pelanggan</h1>
      </div>
      <div className="p-4">
        <div className={`relative rounded-xl overflow-hidden border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Cari pelanggan..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-transparent outline-none text-sm" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-50"><Loader2 size={40} className="animate-spin text-sky-500 mb-2" /><p className="text-sm">Memuat pesan...</p></div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center"><MessageCircle size={64} className="mb-4" /><p className="font-bold">Belum ada chat.</p></div>
        ) : (
          filteredRooms.map((room) => (
            <div key={room.id} onClick={() => onChatClick(room.buyerId)} className={`p-4 rounded-2xl border flex items-center gap-4 cursor-pointer transition-all active:scale-[0.98] ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-100 hover:bg-sky-50'}`}>
              <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                {room.userPhoto ? <img src={room.userPhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-sky-100 text-sky-600 font-bold uppercase">{room.userName?.substring(0, 2) || '...'}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-sm truncate">{room.userName || 'Pelanggan'}</h3>
                  {room.hasUnreadSeller && <span className="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-lg shadow-sky-200"></span>}
                </div>
                <p className={`text-xs truncate mt-0.5 ${room.hasUnreadSeller ? 'font-bold text-sky-600 dark:text-sky-400' : 'text-gray-500'}`}>{room.lastMessageText || 'Klik untuk membalas chat'}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SellerInbox;
