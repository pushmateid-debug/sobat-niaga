import React, { useState, useEffect, useRef, useLayoutEffect, memo, useMemo } from 'react';
import { Heart, MessageCircle, Share2, Store, Search, X, Radio, Volume2, VolumeX, Play, UserPlus, Send, Loader2, ArrowLeft, Users, Sparkles, ShoppingBag, ChevronRight, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { dbFirestore, db, auth } from '../config/firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, increment, addDoc, serverTimestamp, setDoc, where, getDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import Swal from 'sweetalert2';

const CommentSheet = ({ videoId, onClose, isDarkMode }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSubmitting] = useState(false);
  const scrollRef = useRef(null);
  const user = auth.currentUser;

  // Real-time Fetch Comments
  useEffect(() => {
    const q = query(
      collection(dbFirestore, 'niaga_reels', videoId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const loadedComments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(loadedComments);
    }, (error) => {
      console.error("Error listening to comments:", error);
      // Jika muncul error "The query requires an index", klik link yang ada di console browser!
    });
    
    return () => unsub();
  }, [videoId]);

  // Auto Scroll ke bawah tiap ada komen baru
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const handleSend = async (e) => {
    e.preventDefault();
    
    if (!user) {
      Swal.fire('Login Dulu', 'Kamu harus login untuk memberi komentar, Bro!', 'warning');
      return;
    }

    const commentText = newComment.trim();
    if (!commentText || isSending) return;

    setIsSubmitting(true);
    try {
      // 1. Simpan komentar ke sub-koleksi 'comments' di dalam dokumen video
      await addDoc(collection(dbFirestore, 'niaga_reels', videoId, 'comments'), {
        videoId: videoId, // Tambahin videoId sesuai request
        userId: user.uid,
        userName: user.displayName || 'User',
        userPhoto: user.photoURL || '', // Ini userProfile/foto
        text: commentText,
        createdAt: serverTimestamp()
      });

      // 2. Update counter (Gunakan setDoc merge agar aman jika videoId adalah placeholder)
      const videoRef = doc(dbFirestore, 'niaga_reels', videoId);
      await setDoc(videoRef, {
        commentsCount: increment(1)
      }, { merge: true });

      // 3. Reset input field
      setNewComment('');
    } catch (err) { 
      console.error("Gagal kirim komentar:", err);
      Swal.fire({
        icon: 'error',
        title: 'Gagal Kirim',
        text: `Waduh, ada error: ${err.message}. Cek koneksi atau rules database lo, Bro!`,
      });
    }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div 
        onClick={(e) => e.stopPropagation()} // PENTING: Biar klik di area komen gak nge-pause video
        className={`relative w-full h-[65vh] rounded-t-3xl flex flex-col shadow-2xl transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}
      >
        {/* Bar Kecil Atas */}
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-2 opacity-50"></div>
        
        <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 dark:border-slate-800">
          <h3 className="font-bold text-sm">Komentar ({comments.length})</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><X size={20}/></button>
        </div>

        {/* List Komentar */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 scroll-smooth">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 animate-in slide-in-from-bottom-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                <img src={c.userPhoto || `https://ui-avatars.com/api/?name=${c.userName}&background=random`} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                {/* Tambahkan optional chaining ?. agar tidak crash jika userName undefined */}
                <p className="text-[11px] font-black text-gray-500 mb-0.5">@{c.userName?.replace(/\s+/g, '').toLowerCase() || 'user'}</p>
                <p className="text-xs leading-relaxed">{c.text}</p>
              </div>
            </div>
          ))}
          {comments.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-30"><MessageCircle size={48}/><p className="text-xs font-bold mt-2">Belum ada komentar.</p></div>}
        </div>

        {/* Input Field (Sticky) */}
        <form onSubmit={handleSend} className={`p-4 pb-8 border-t dark:border-slate-800 flex gap-2 items-center ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
          <input 
            value={newComment} onChange={e => setNewComment(e.target.value)}
            placeholder="Tambahkan komentar..." autoFocus
            className={`flex-1 py-2.5 px-4 rounded-full text-xs outline-none border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-sky-500' : 'bg-gray-100 border-gray-200 focus:border-sky-500'}`}
          />
          <button 
            type="submit" 
            disabled={!newComment.trim() || isSending} 
            className="p-2.5 bg-sky-600 text-white rounded-full active:scale-90 transition-transform disabled:opacity-50"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18}/>}
          </button>
        </form>
      </div>
    </div>
  );
};

const NiagaLiveCard = ({ stream, onProfileClick, onStoreClick }) => {
  return (
    <div className="h-screen w-screen video-slide relative bg-slate-900 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 z-0"></div>
      
      <div className="flex flex-col items-center justify-center z-10 text-white text-center px-10">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-full border-4 border-red-500 p-1 animate-pulse">
            <img src={`https://ui-avatars.com/api/?name=${stream.sellerName}&background=random`} className="w-full h-full object-cover rounded-full" alt="" />
          </div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">LIVE</span>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">{stream.sellerName} Sedang Live!</h2>
        <p className="text-white/70 text-sm mb-8">{stream.description || 'Yuk gabung sekarang dan serbu promonya!'}</p>
        <button onClick={() => Swal.fire('Coming Soon', 'Fitur Join Live segera hadir!', 'info')} className="px-10 py-3 bg-white text-black font-black rounded-full hover:scale-105 transition-transform active:scale-95">GABUNG LIVE</button>
      </div>

      {/* Live Stats Overlay */}
      <div className="absolute top-24 left-4 z-10 flex items-center gap-2">
        <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded flex items-center gap-1">
          <Radio size={12} className="animate-pulse" /> LIVE
        </div>
        <div className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
          <Users size={12} /> {stream.viewers || 0}
        </div>
      </div>
    </div>
  );
};

const TaggedProductSheet = ({ productIds, onClose, isDarkMode, onProductClick }) => {
  const [taggedProducts, setTaggedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!productIds || productIds.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const results = [];
        for (const id of productIds) {
          const snap = await get(ref(db, `products/${id}`));
          if (snap.exists()) {
            results.push({ id, ...snap.val() });
          }
        }
        setTaggedProducts(results);
      } catch (err) {
        console.error("Gagal ambil detail produk:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [productIds]);

  return (
    <div className="absolute inset-0 z-[210] flex flex-col justify-end animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className={`relative w-full h-[50vh] rounded-t-3xl flex flex-col shadow-2xl transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-2 opacity-50"></div>
        <div className="flex items-center justify-between px-5 py-2 border-b dark:border-slate-800">
          <h3 className="font-bold text-sm flex items-center gap-2 text-yellow-600"><span>🛍️</span> Produk Dalam Video</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><X size={20}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-sky-500" /></div>
          ) : taggedProducts.map(p => (
            <div 
              key={p.id} 
              onClick={() => onProductClick(p)}
              className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer hover:scale-[1.02] transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}
            >
              <img src={p.mediaUrl || p.image} className="w-16 h-16 rounded-xl object-cover" alt="" />
              <div className="flex-1">
                <h4 className="font-bold text-sm line-clamp-1">{p.name}</h4>
                <p className="text-sky-600 font-bold text-sm">Rp {parseInt(p.price).toLocaleString('id-ID')}</p>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const VideoItem = memo(({ video, onProfileClick, onStoreClick, onProductClick, isGlobalMuted, setIsGlobalMuted, hasInteracted, setHasInteracted }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [isProductSheetOpen, setIsProductSheetOpen] = useState(false);
  const { theme } = useTheme();

  // Sinkronkan refs untuk menghindari stale closure di Intersection Observer
  const isGlobalMutedRef = useRef(isGlobalMuted);
  const hasInteractedRef = useRef(hasInteracted);
  useEffect(() => {
    isGlobalMutedRef.current = isGlobalMuted;
    hasInteractedRef.current = hasInteracted;
  }, [isGlobalMuted, hasInteracted]);

  // 1. FORCE SYNC: Pastikan properti DOM .muted selalu sinkron dengan Global State
  // Ini solusi ampuh buat ngilangin bug 'Ghost Muted'
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isGlobalMuted;
    }
  }, [isGlobalMuted]);

  // 1.5 Cek status follow secara real-time
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser && video.userId && currentUser.uid !== video.userId) {
      // Reactive Follow Status: Listen ke dokumen seller untuk cek apakah kita ada di followersList
      const targetUserRef = doc(dbFirestore, 'users', video.userId);
      const unsub = onSnapshot(targetUserRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsFollowing(data.followersList?.includes(currentUser.uid) || false);
        }
      });
      return () => unsub();
    }
  }, [video.userId]);

  // Menangani pemutaran video menggunakan Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting && videoRef.current) {
            // 1. Sinkronkan dengan Shared Audio Context
            videoRef.current.muted = isGlobalMutedRef.current;
            
            try {
              if (video.videoUrl && videoRef.current.readyState >= 2) {
                await videoRef.current.play();
                setIsPlaying(true);

                // 2. Force Audio Logic: Trik 'Mancing' Volume
                // Gunakan ref untuk mendapatkan status interaksi terbaru tanpa re-bind observer
                if (hasInteractedRef.current && !isGlobalMutedRef.current) {
                  videoRef.current.muted = false;
                  videoRef.current.volume = 0.1;
                  setTimeout(() => {
                    if (videoRef.current) videoRef.current.volume = 1.0;
                  }, 150);
                }
              }
            } catch (err) {
              // Autoplay error umum terjadi jika koneksi lambat, abaikan lognya
            }
          } else if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.6 } // Video harus terlihat 60% baru putar
    );

    if (videoRef.current) observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [video.videoUrl]);

  const togglePlayMute = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else { 
        // Safety check: Jangan paksa putar kalau source bermasalah
        if (!video?.videoUrl) {
          console.warn("Gagal putar: URL video kosong.");
          return;
        }
        try {
          // Paksa sinkron properti sebelum play
          videoRef.current.muted = isGlobalMuted;
          await videoRef.current.play(); 
          setIsPlaying(true);
          
          // Jika user klik Play, ini adalah Interaksi!
          if (isGlobalMuted) {
            setIsGlobalMuted(false);
            setHasInteracted(true);
          }
          
        } catch (error) {
          console.warn("Pemutaran terinterupsi:", error.message);
        }
      }
    }
  };

  const handleFollowVideo = async (e) => {
    e.stopPropagation();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return Swal.fire('Login Dulu', 'Silakan login untuk mengikuti seller ini, Bro!', 'warning');
    }
    
    if (currentUser.uid === video.userId) return;

    const batch = writeBatch(dbFirestore);
    const targetUserRef = doc(dbFirestore, 'users', video.userId);
    const currentUserRef = doc(dbFirestore, 'users', currentUser.uid);

    try {
      if (isFollowing) {
        batch.set(targetUserRef, {
          followersList: arrayRemove(currentUser.uid),
          followersCount: increment(-1)
        }, { merge: true });
        batch.set(currentUserRef, {
          followingList: arrayRemove(video.userId),
          followingCount: increment(-1)
        }, { merge: true });
      } else {
        batch.set(targetUserRef, {
          followersList: arrayUnion(currentUser.uid),
          followersCount: increment(1)
        }, { merge: true });
        batch.set(currentUserRef, {
          followingList: arrayUnion(video.userId),
          followingCount: increment(1)
        }, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      console.error("Gagal Follow dari Video:", err);
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    const newLikeStatus = !isLiked;
    setIsLiked(newLikeStatus);
    
    if (newLikeStatus) {
      setShowHeartAnim(true);
      setTimeout(() => setShowHeartAnim(null), 1000);
    }

    try {
      const videoRef = doc(dbFirestore, 'niaga_reels', video.id);
      await updateDoc(videoRef, {
        likes: increment(newLikeStatus ? 1 : -1)
      });
    } catch (error) {
      console.error("Gagal update like:", error);
    }
  };

  const handleShare = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(window.location.href);
    Swal.fire({
      icon: 'success',
      title: 'Link Video Disalin!',
      toast: true,
      position: 'top',
      showConfirmButton: false,
      timer: 1500
    });
  };

  const handleVideoError = (e) => {
    console.error(`Video ID ${video.id} Error:`, e.target.error);
    console.warn(`Tips:
    1. Matikan 'Tracking Prevention' (Incognito Mode biasanya lebih ketat).
    2. Pastikan koneksi internet stabil (detected slow network).
    3. Gunakan URL Cloudinary yang sudah diproses (q_auto,f_auto).
    4. Link video saat ini: ${video.videoUrl}
    `);
  };

  return (
    <div className="h-screen w-screen video-slide relative bg-black flex items-center justify-center overflow-hidden" onClick={togglePlayMute}>
      <video 
        ref={videoRef}
        src={video.videoUrl} 
        className="absolute inset-0 w-full h-full object-cover" 
        loop
        muted={isGlobalMuted} // Panggil variabel isGlobalMuted yang benar
        playsInline // WAJIB untuk iOS Safari
        autoPlay // Tambahkan autoPlay eksplisit biar browser yakin ini video background
        onError={handleVideoError}
        onEnded={() => { if(videoRef.current) videoRef.current.play(); }} // Smooth Loop Fallback
      />
      
      {/* Status Indicators Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {!isPlaying && <Play size={64} className="text-white opacity-50" />}
        {showHeartAnim && <Heart size={100} className="text-red-500 fill-red-500 animate-ping opacity-75" />}
      </div>

      {/* Bottom Sheet Komentar */}
      {isCommentOpen && <CommentSheet videoId={video.id} onClose={() => setIsCommentOpen(false)} isDarkMode={theme === 'dark'} />}

      {/* Keranjang Kuning (Rounded Shopping Bag - Modern Style) */}
      {video.taggedProducts && video.taggedProducts.length > 0 && (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsProductSheetOpen(true); }}
          className="absolute left-4 bottom-36 z-10 w-12 h-12 bg-[#FFD700] backdrop-blur-sm rounded-full shadow-xl flex items-center justify-center border-2 border-white/20 active:scale-95 transition-all"
        >
          {/* Ikon Tas Belanja Emoji 🛍️ sesuai request user */}
          <span className="text-2xl drop-shadow-sm">🛍️</span>
          
          {/* Badge Jumlah Produk (Hanya muncul jika produk > 1) */}
          {video.taggedProducts.length > 1 && (
            <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-md animate-in zoom-in duration-300">
              {video.taggedProducts.length}
            </div>
          )}
        </button>
      )}

      {/* Bottom Sheet Produk */}
      {isProductSheetOpen && (
        <TaggedProductSheet 
          productIds={video.taggedProducts} 
          onClose={() => setIsProductSheetOpen(false)} 
          isDarkMode={theme === 'dark'}
          onProductClick={onProductClick}
        />
      )}

      {/* Side Action Buttons (Kanan) */}
      <div className="absolute right-4 bottom-6 flex flex-col items-center gap-6 z-10 animate-in fade-in slide-in-from-right-4 duration-500">
        <button onClick={handleLike} className="flex flex-col items-center gap-1 group">
          <div className="p-3 bg-black/30 backdrop-blur-md rounded-full text-white transition-all active:scale-150">
            <Heart size={28} className={isLiked ? 'fill-red-500 text-red-500' : 'text-white'} />
          </div>
          <span className="text-white text-xs font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{(video.likes || 0).toLocaleString()}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); setIsCommentOpen(true); }} className="flex flex-col items-center gap-1">
          <div className="p-3 bg-black/30 backdrop-blur-md rounded-full text-white"><MessageCircle size={28} /></div>
          <span className="text-white text-xs font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{video.commentsCount || video.comments || '0'}</span>
        </button>
        <button onClick={handleShare} className="flex flex-col items-center gap-1">
          <div className="p-3 bg-black/30 backdrop-blur-md rounded-full text-white"><Share2 size={28} /></div>
          <span className="text-white text-xs font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{video.shares || '0'}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onStoreClick(video.userId); }} className="flex flex-col items-center gap-1">
          <div className="p-3 bg-black/30 backdrop-blur-md rounded-full text-white border-2 border-white overflow-hidden w-12 h-12 shadow-lg">
            <Store size={24} />
          </div>
          <span className="text-[10px] text-white font-black uppercase drop-shadow-md mt-1">Toko</span>
        </button>
      </div>

      {/* Video Info Section (Kiri Bawah) */}
      <div className="absolute left-4 bottom-6 z-10 max-w-[75%] pointer-events-none animate-in fade-in slide-in-from-left-4 duration-500 pb-2">
        <div 
          className="flex items-center gap-3 mb-3 pointer-events-auto cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onProfileClick(video.userId); }}
        >
          <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden shadow-xl">
            <img src={`https://ui-avatars.com/api/?name=${video.sellerName || 'S'}&background=random`} alt="" className="w-full h-full object-cover" />
          </div>
          <h3 className="text-white font-bold text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">@{video.sellerName?.replace(/\s+/g, '').toLowerCase() || 'seller'}</h3>
          
          {auth.currentUser?.uid !== video.userId && (
            <button 
              onClick={handleFollowVideo}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-300 border flex items-center gap-1 active:scale-90 ${
                isFollowing 
                  ? 'bg-white text-gray-500 border-gray-300' 
                  : 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20'
              }`}
            >
              {isFollowing ? <><Check size={12}/> Mengikuti</> : <><UserPlus size={12}/> Ikuti</>}
            </button>
          )}
        </div>
        <p className="text-white text-sm line-clamp-3 leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,1)] font-medium">
          {video.description}
        </p>
      </div>

      {/* Mute/Unmute Label Overlay */}
      <button 
        onClick={(e) => { 
          e.stopPropagation(); 
          const nextMuteState = !isGlobalMuted;
          setIsGlobalMuted(nextMuteState); 
          // Refactor Toggle: Ubah properti video secara langsung (Direct DOM Access)
          if (videoRef.current) videoRef.current.muted = nextMuteState;
          setHasInteracted(true); 
        }}
        className="absolute top-24 right-4 z-10 p-3 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/20 active:scale-90 transition-all"
      >
        {isGlobalMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
});

const NiagaVideo = ({ onBack, onProfileClick, onStoreClick, onProductClick, initialVideos = null, initialIndex = 0 }) => {
  const [activeTab, setActiveTab] = useState('foryou'); // 'foryou' | 'reels' | 'live'
  const [videos, setVideos] = useState(initialVideos || []);
  const [liveStreams, setLiveStreams] = useState([]);
  const [loading, setLoading] = useState(!initialVideos);
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(!!initialVideos); // Anggap interaksi klik thumbnail sebagai gerbang audio

  // Algoritma Campuran: Merge Video & Live untuk Tab "Untuk Anda"
  const forYouFeed = useMemo(() => {
    const combined = [
      ...videos.map(v => ({ ...v, type: 'video' })),
      ...liveStreams.map(l => ({ ...l, type: 'live' }))
    ];
    
    // Sort berdasarkan timestamp terbaru, tapi kasih sedikit bumbu acak (Math.random) 
    // biar urutan Live vs Video bervariasi setiap masuk
    return combined.sort((a, b) => {
      const timeA = a.timestamp?.seconds || 0;
      const timeB = b.timestamp?.seconds || 0;
      return (timeB - timeA) + (Math.random() * 10 - 5); 
    });
  }, [videos, liveStreams]);

  const handleGlobalInteraction = () => {
    if (!hasInteracted) setHasInteracted(true);
  };

  const videoContainerRef = useRef(null);

  // Fetch Videos from Firestore secara Real-time
  useEffect(() => {
    if (initialVideos) return;

    // 1. Fetch Niaga Reels (Video)
    const q = query(collection(dbFirestore, 'niaga_reels'), orderBy('timestamp', 'desc'));
    const unsubVideos = onSnapshot(q, (snapshot) => {
      const videoData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVideos(videoData);
      setLoading(false);
    }, (error) => { 
      console.error("Gagal ambil video:", error); 
      setLoading(false); 
    });

    // 2. Fetch Live Streams (Hanya yang statusnya 'live')
    const qLive = query(collection(dbFirestore, 'live_streams'), where('status', '==', 'live'));
    const unsubLive = onSnapshot(qLive, (snapshot) => {
      const liveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLiveStreams(liveData);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Firestore Rules Error: Akses ke 'live_streams' ditolak. Cek tab Rules di Firestore Console!");
      } else {
        console.error("Gagal ambil live streams:", error);
      }
    });

    return () => {
      unsubVideos();
      unsubLive();
    };
  }, [initialVideos]);

  // Auto Scroll ke index yang diklik dari profil
  useLayoutEffect(() => {
    if (initialIndex > 0 && videoContainerRef.current) {
      // Beri sedikit delay agar DOM siap
      const timer = setTimeout(() => {
        if (videoContainerRef.current) {
          videoContainerRef.current.scrollTop = initialIndex * videoContainerRef.current.clientHeight;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialIndex, videos]);

  return (
    <div 
      onClick={handleGlobalInteraction}
      onScroll={handleGlobalInteraction}
      className="fixed inset-0 z-[150] bg-black overflow-hidden flex flex-col w-screen h-screen"
    >
      {/* CSS Khusus untuk Snap Scrolling & Hidden Bar */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .video-container { scroll-snap-type: y mandatory; height: 100vh; width: 100vw; }
        .video-slide { scroll-snap-align: start; height: 100vh; width: 100vw; }
      `}</style>

      {/* User Interaction Bridge Overlay */}
      {!hasInteracted && !initialVideos && (
        <div 
          onClick={() => { 
            // Sekali klik di awal, buka 'pintu' audio buat semua video
            setIsGlobalMuted(false); 
            setHasInteracted(true); 
            // Berikan sedikit feedback suara biar user tau audio sudah aktif
            console.debug("Audio gate opened by user interaction.");
          }}
          className="absolute inset-0 z-[250] bg-transparent cursor-pointer"
        />
      )}

      {/* Transparent Header Over Video */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 pt-12 pb-10 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        {!initialVideos ? (
          <div className="flex items-center gap-5 pointer-events-auto">
            <button onClick={() => setActiveTab('foryou')} className={`text-sm font-black transition-all ${activeTab === 'foryou' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
              Untuk Anda
            </button>
            <button onClick={() => setActiveTab('reels')} className={`text-sm font-black transition-all ${activeTab === 'reels' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
              Video
            </button>
            <button onClick={() => setActiveTab('live')} className={`text-lg font-bold transition-all ${activeTab === 'live' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
              LIVE
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto"><button onClick={onBack} className="text-white p-2 bg-black/20 backdrop-blur-md rounded-full"><ArrowLeft size={24}/></button></div>
        )}
        <div className="flex items-center gap-5 text-white pointer-events-auto">
          {!initialVideos && <Search size={24} className="cursor-pointer" />}
          <X size={28} className="cursor-pointer" onClick={onBack} />
        </div>
      </div>

      {/* Video Content with Snap Scroll */}
      <div ref={videoContainerRef} className="flex-1 w-full overflow-y-scroll video-container no-scrollbar">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center bg-black">
            <Loader2 size={40} className="text-sky-500 animate-spin" />
          </div>
        ) : activeTab === 'foryou' ? (
          forYouFeed.length > 0 ? (
            forYouFeed.map((item) => (
              item.type === 'live' ? (
                <NiagaLiveCard key={item.id} stream={item} onProfileClick={onProfileClick} onStoreClick={onStoreClick} />
              ) : (
                <VideoItem 
                  key={item.id} 
                  video={item} 
                  onProfileClick={onProfileClick} 
                  onStoreClick={onStoreClick}
                  onProductClick={onProductClick}
                  isGlobalMuted={isGlobalMuted}
                  setIsGlobalMuted={setIsGlobalMuted}
                  hasInteracted={hasInteracted}
                  setHasInteracted={setHasInteracted}
                />
              )
            ))
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-white bg-black px-10 text-center">
              <p className="text-white/60 text-sm mt-2">Belum ada konten nih, Bro!</p>
            </div>
          )
        ) : activeTab === 'reels' ? (
          videos.length > 0 ? (
            videos.map((video) => (
              <VideoItem 
                key={video.id} 
                video={video} 
                onProfileClick={onProfileClick} 
                onStoreClick={onStoreClick} 
                onProductClick={onProductClick}
                isGlobalMuted={isGlobalMuted} 
                setIsGlobalMuted={setIsGlobalMuted} 
                hasInteracted={hasInteracted} 
                setHasInteracted={setHasInteracted} 
              />
            ))
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-white bg-black px-10 text-center">
              <p className="text-white/60 text-sm mt-2">Belum ada video nih, yuk jadi yang pertama upload!</p>
              <button onClick={onBack} className="mt-8 px-8 py-3 bg-white text-black font-black rounded-full text-sm">Kembali Ke Home</button>
            </div>
          )
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