import React, { useState, useEffect } from 'react';
import { ArrowLeft, PlayCircle, Heart, MessageCircle, Share2, Store, Search, X, Radio } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { dbFirestore } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const NiagaVideo = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState('reels'); // 'live' | 'reels'
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch Videos from Firestore secara Real-time
  useEffect(() => {
    const q = query(collection(dbFirestore, 'niaga_videos'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videoData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVideos(videoData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Placeholder jika DB kosong
  const placeholderVideos = [
    { 
      id: 'p1', 
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-light-34505-large.mp4', 
      sellerName: 'SobatNiaga Official', 
      description: 'Cek promo gajian gila-gilaan hari ini! 🔥 #Promo #SobatNiaga',
      likes: '1.2k', comments: '45', shares: '12' 
    },
    { 
      id: 'p2', 
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-screen-with-binary-code-28731-large.mp4', 
      sellerName: 'Niaga Store', 
      description: 'Review laptop gaming murah tapi spek dewa. 💻',
      likes: '800', comments: '12', shares: '5' 
    }
  ];

  const displayVideos = videos.length > 0 ? videos : placeholderVideos;

  return (
    <div className="fixed inset-0 z-[150] bg-black overflow-hidden flex flex-col">
      {/* CSS Khusus untuk Snap Scrolling & Hidden Bar */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .video-container { scroll-snap-type: y mandatory; }
        .video-slide { scroll-snap-align: start; }
      `}</style>

      {/* Transparent Header Over Video */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 pt-12 pb-10 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-6 pointer-events-auto">
          <button onClick={() => setActiveTab('live')} className={`text-lg font-bold transition-all ${activeTab === 'live' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
            Live
          </button>
          <button onClick={() => setActiveTab('reels')} className={`text-lg font-bold transition-all ${activeTab === 'reels' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
            Video
          </button>
        </div>
        <div className="flex items-center gap-5 text-white pointer-events-auto">
          <Search size={24} className="cursor-pointer" />
          <X size={28} className="cursor-pointer" onClick={onBack} />
        </div>
      </div>

      {/* Video Content with Snap Scroll */}
      <div className="h-full w-full overflow-y-scroll video-container no-scrollbar">
        {activeTab === 'reels' ? (
          displayVideos.map((video) => (
            <div key={video.id} className="h-full w-full video-slide relative bg-black flex items-center justify-center">
              <video src={video.videoUrl} className="h-full w-full object-cover md:object-contain" loop autoPlay muted playsInline />
              
              {/* Sidebar Action Buttons (Right) */}
              <div className="absolute right-4 bottom-28 flex flex-col items-center gap-6 z-10">
                <div className="flex flex-col items-center gap-1">
                  <div className="p-3 bg-black/20 backdrop-blur-lg rounded-full text-white hover:text-red-500 transition-colors shadow-lg cursor-pointer">
                    <Heart size={28} />
                  </div>
                  <span className="text-white text-[10px] font-black drop-shadow-md">{video.likes || '0'}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="p-3 bg-black/20 backdrop-blur-lg rounded-full text-white hover:text-sky-400 transition-colors shadow-lg cursor-pointer">
                    <MessageCircle size={28} />
                  </div>
                  <span className="text-white text-[10px] font-black drop-shadow-md">{video.comments || '0'}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="p-3 bg-black/20 backdrop-blur-lg rounded-full text-white hover:text-green-400 transition-colors shadow-lg cursor-pointer">
                    <Share2 size={28} />
                  </div>
                  <span className="text-white text-[10px] font-black drop-shadow-md">{video.shares || '0'}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="p-3 bg-black/20 backdrop-blur-lg rounded-full text-white hover:text-yellow-400 transition-colors shadow-lg cursor-pointer">
                    <Store size={28} />
                  </div>
                  <span className="text-white text-[10px] font-black drop-shadow-md">Toko</span>
                </div>
              </div>

              {/* Video Info Section (Bottom Left) */}
              <div className="absolute left-4 bottom-28 z-10 max-w-[70%]">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-gray-200">
                        <img src={`https://ui-avatars.com/api/?name=${video.sellerName || 'S'}&background=random`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-white font-bold text-sm drop-shadow-md">@{video.sellerName || 'Seller'}</h3>
                </div>
                <p className="text-white/95 text-xs line-clamp-2 leading-relaxed drop-shadow-md">{video.description}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-white bg-slate-900 px-10 text-center">
            <Radio size={64} className="mb-4 text-red-500 animate-pulse" />
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Live Shopping 📡</h2>
            <p className="text-white/60 text-sm mt-2">Segera hadir! Kamu bisa jualan langsung lewat live streaming bareng mahasiswa lainnya.</p>
            <button onClick={onBack} className="mt-8 px-8 py-3 bg-white text-black font-black rounded-full text-sm">Kembali Ke Home</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NiagaVideo;