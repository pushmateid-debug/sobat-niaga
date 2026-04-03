import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, MessageCircle, UserPlus, UserMinus, Grid, PlayCircle, Loader2, Users, Video, AlertCircle, Edit, Trash2, Save, X, MoreVertical, Flag, Share2, Volume2, VolumeX, Check, ShoppingBag } from 'lucide-react';
import { db, dbFirestore } from '../config/firebase';
import { ref, onValue, update, get, query as realQuery, orderByChild, equalTo } from 'firebase/database';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, updateDoc, setDoc, serverTimestamp, increment, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';
import Swal from 'sweetalert2';
import NiagaVideo from './NiagaVideo'; // Import untuk modal player

const UserPublicProfile = ({ userId, currentUserId, onBack, onVideoClick, onChatClick, onProductClick }) => {
  const { theme } = useTheme() || { theme: 'light' }; // Safety check agar tidak blank jika context error
  const isDarkMode = theme === 'dark';
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    followersCount: 0, 
    followingCount: 0 
  });
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('posts'); // 'posts' | 'products'
  const [sellerProducts, setSellerProducts] = useState([]);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  // Owner Control States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [newDescription, setNewDescription] = useState('');
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(null);
  const isOwner = currentUserId === userId;

  useEffect(() => {
    if (!userId) return;

    // 1. Fetch User Profile & Stats (Realtime DB)
    const userRef = ref(db, `users/${userId}`);
    const unsubUser = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setProfile(data);
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    // 2. Fetch User's Videos (Firestore)
    const vQuery = query(
      collection(dbFirestore, 'niaga_reels'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    const unsubVideos = onSnapshot(vQuery, (snap) => {
      setVideos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setError(null);
    }, (err) => {
      console.error("Gagal ambil video profil:", err);
      // Klik link yang muncul di console log untuk membuat composite index!
      // Cek apakah error karena indeks belum dibuat
      if (err.code === 'failed-precondition') setError('index-missing');
    });

    // 3. Listen to Profile Stats & Follow Status (Firestore Real-time)
    const statsRef = doc(dbFirestore, 'users', userId);
    const unsubStats = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStats({
          followersCount: data.followersCount || 0,
          followingCount: data.followingCount || 0
        });
        // Cek status follow
        // FIX: Pastikan currentUserId ada sebelum update status follow agar tidak flicker
        if (currentUserId) {
          const isUserFollowing = data.followersList?.includes(currentUserId) || false;
          setIsFollowing(isUserFollowing);
        }
      } else {
        // Reset jika dokumen tidak ada (user belum punya follower sama sekali)
        setStats({ followersCount: 0, followingCount: 0 });
        setIsFollowing(false);
      }
    });

    // 4. Fetch User's Products (Realtime DB)
    const productsRef = realQuery(ref(db, 'products'), orderByChild('sellerId'), equalTo(userId));
    const unsubProducts = onValue(productsRef, (snap) => {
      const data = snap.val();
      const loaded = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      setSellerProducts(loaded.filter(p => p.isActive !== false));
    });

    return () => {
      unsubUser();
      unsubVideos();
      unsubStats();
      unsubProducts();
    };
  }, [userId, currentUserId]);

  const handleFollow = async () => {
    if (!currentUserId) return Swal.fire('Login Dulu', 'Silakan login untuk mengikuti, Bro!', 'warning');
    if (!userId || userId === currentUserId) return;
    if (followLoading) return; // Anti-spam click

    setFollowLoading(true);
    const batch = writeBatch(dbFirestore);
    const targetUserRef = doc(dbFirestore, 'users', userId);
    const currentUserRef = doc(dbFirestore, 'users', currentUserId);

    try {
      if (isFollowing) {
        // UNFOLLOW: Hapus ID dari list dan kurangi counter
        batch.set(targetUserRef, {
          followersList: arrayRemove(currentUserId),
          followersCount: increment(-1)
        }, { merge: true });
        batch.set(currentUserRef, {
          followingList: arrayRemove(userId),
          followingCount: increment(-1)
        }, { merge: true });
      } else {
        // FOLLOW: Tambah ID ke list dan tambah counter (Auto-create doc jika belum ada)
        batch.set(targetUserRef, {
          followersList: arrayUnion(currentUserId),
          followersCount: increment(1)
        }, { merge: true });
        batch.set(currentUserRef, {
          followingList: arrayUnion(userId),
          followingCount: increment(1)
        }, { merge: true });
      }
      await batch.commit();
      // UI akan terupdate otomatis via onSnapshot listener di useEffect
    } catch (err) {
      console.error("DEBUG_FOLLOW_ERROR:", {
        code: err.code,
        message: err.message,
        collection: 'users',
        targetId: userId,
        currentId: currentUserId
      });

      let errorTitle = 'Gagal';
      let errorText = 'Waduh, gagal memproses permintaan follow. Cek koneksi lo, Bro!';
      
      if (err.code === 'permission-denied') {
        errorTitle = 'Akses Ditolak';
        errorText = 'Firebase Rules lo melarang tulis ke koleksi "users". Cek firestore.rules, Bro!';
      }

      Swal.fire({
        icon: 'error',
        title: errorTitle,
        text: errorText,
      });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    const confirm = await Swal.fire({
      title: 'Hapus Video?',
      text: "Video jualan lo bakal hilang selamanya dari profil, Bro!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Ya, Hapus!',
      cancelButtonText: 'Batal'
    });

    if (confirm.isConfirmed) {
      try {
        await deleteDoc(doc(dbFirestore, 'niaga_reels', videoId));
        // Catatan: Penghapusan file fisik di Cloudinary sebaiknya via Backend API 
        // atau Admin SDK untuk keamanan maksimal.
        Swal.fire('Terhapus!', 'Video udah beres dihapus.', 'success');
      } catch (error) {
        console.error("Gagal hapus video:", error);
        Swal.fire('Gagal', 'Ada masalah pas mau hapus video, Bro.', 'error');
      }
    }
  };

  const handleEditClick = (video) => {
    setEditingVideo(video);
    setNewDescription(video.description || '');
    setIsEditModalOpen(true);
  };

  const handleUpdateDescription = async () => {
    if (!editingVideo) return;
    try {
      await updateDoc(doc(dbFirestore, 'niaga_reels', editingVideo.id), { description: newDescription });
      setIsEditModalOpen(false);
      Swal.fire('Berhasil!', 'Deskripsi video jualan lo udah diupdate.', 'success');
    } catch (error) {
      Swal.fire('Gagal', 'Gagal update deskripsi, Bro.', 'error');
    }
  };

  const handleReportVideo = async (videoId) => {
    setIsActionSheetOpen(false); // Tutup action sheet
    const { value: reason } = await Swal.fire({
      title: 'Laporkan Video Ini?',
      input: 'textarea',
      inputLabel: 'Apa yang salah dengan video ini?',
      inputPlaceholder: 'Contoh: Konten tidak pantas, penipuan, spam, dll.',
      inputValidator: (value) => {
        if (!value) return 'Alasan wajib diisi!';
      },
      showCancelButton: true,
      confirmButtonText: 'Kirim Laporan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#ef4444',
    });

    if (reason) {
      // Logika untuk menyimpan laporan ke Firestore/Realtime DB
      // Contoh: addDoc(collection(dbFirestore, 'reports'), { videoId, reporterId: currentUserId, reason, timestamp: new Date() });
      Swal.fire('Terima Kasih!', 'Laporan Anda sudah kami terima dan akan segera kami tindak lanjuti.', 'success');
    }
  };

  const handleShareVideo = async (videoUrl) => {
    setIsActionSheetOpen(false); // Tutup action sheet
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Lihat video jualan ini di SobatNiaga!',
          url: videoUrl,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      navigator.clipboard.writeText(videoUrl);
      Swal.fire('Link Disalin!', 'Link video sudah disalin ke clipboard. Kamu bisa share manual di WhatsApp.', 'success');
    }
  };

  // UI SKELETON / LOADING STATE: Mencegah layar putih saat data belum sampai
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black min-h-screen">
        <Loader2 size={40} className="text-sky-500 animate-spin mb-4" />
        <p className="text-gray-400 text-xs font-bold animate-pulse">Memuat Profil...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black text-white p-10 text-center min-h-screen">
        <AlertCircle size={48} className="text-gray-600 mb-4" />
        <p className="font-bold">User tidak ditemukan.</p>
        <button onClick={onBack} className="mt-6 px-8 py-2 bg-white/10 rounded-full text-sky-500 font-bold">Kembali</button>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen transition-colors ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Header Navigation */}
      <div className="p-4 flex items-center gap-4 sticky top-0 z-10 backdrop-blur-md bg-transparent">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h2 className="font-bold text-lg">@{profile.sellerInfo?.storeName?.replace(/\s+/g, '').toLowerCase() || profile.username || 'user'}</h2>
      </div>

      {/* Profile Info */}
      <div className="px-6 py-4 flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-full border-2 border-sky-500 p-1 overflow-hidden shadow-xl">
            <img 
              src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}&background=random`} 
              className="w-full h-full object-cover rounded-full" 
              alt="Profile"
            />
          </div>
          {profile.sellerInfo?.isTrustedSeller && (
            <div className="absolute bottom-0 right-0 bg-white rounded-full p-0.5 shadow-md">
              <CheckCircle size={20} className="text-blue-500 fill-blue-100" />
            </div>
          )}
        </div>

        <h1 className="text-xl font-black">{profile.displayName}</h1>
        <p className="text-xs text-gray-500 mt-1 mb-4 leading-relaxed max-w-xs">
          {profile.sellerInfo?.storeAddress || 'Mahasiswa SobatNiaga'}
        </p>

        {/* Stats Row */}
        <div className="flex gap-8 mb-6">
          <div className="text-center">
            <p className="font-black text-lg">{videos.length}</p>
            <p className="text-[10px] uppercase font-bold text-gray-400">Postingan</p>
          </div>
          <div className="text-center">
            <p className="font-black text-lg">{stats.followersCount.toLocaleString()}</p>
            <p className="text-[10px] uppercase font-bold text-gray-400">Pengikut</p>
          </div>
          <div className="text-center">
            <p className="font-black text-lg">{stats.followingCount.toLocaleString()}</p>
            <p className="text-[10px] uppercase font-bold text-gray-400">Diikuti</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full max-w-sm">
          {currentUserId !== userId && (
            <button 
              onClick={handleFollow}
              disabled={followLoading}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 ${
                isFollowing 
                  ? 'bg-white text-gray-500 border border-gray-300' 
                  : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              } ${followLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {followLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isFollowing ? (
                <><Check size={18}/> Mengikuti</>
              ) : (
                <><UserPlus size={18}/> Ikuti</>
              )}
            </button>
          )}
          <button 
            onClick={() => onChatClick(userId)}
            className={`flex-1 px-6 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border active:scale-95 ${isDarkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-200 bg-white text-gray-800'}`}
          >
            <MessageCircle size={18}/> Chat
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="mt-6 flex border-t border-gray-100 dark:border-slate-800">
        <button 
          onClick={() => setActiveTab('posts')}
          className={`flex-1 py-3 flex items-center justify-center gap-2 transition-all relative ${activeTab === 'posts' ? (isDarkMode ? 'text-white border-t-2 border-white' : 'text-black border-t-2 border-black') : 'text-gray-400'}`}
        >
          <Video size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Postingan</span>
        </button>
        <button 
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-3 flex items-center justify-center gap-2 transition-all relative ${activeTab === 'products' ? (isDarkMode ? 'text-white border-t-2 border-white' : 'text-black border-t-2 border-black') : 'text-gray-400'}`}
        >
          <ShoppingBag size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Produk</span>
        </button>
      </div>

      {/* Video Grid (3 Columns) */}
      {activeTab === 'posts' ? (
        error === 'index-missing' ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-10 text-center opacity-50">
          <AlertCircle size={48} className="mb-2 text-orange-500" />
          <p className="text-sm font-bold">Video profil sedang disiapkan...</p>
          <p className="text-[10px] mt-1 italic">Firestore sedang membangun indeks data. Mohon tunggu 5-10 menit ya, Bro!</p>
        </div>
      ) : videos.length > 0 ? (
        <div className="grid grid-cols-3 gap-0.5 pb-24">
          {videos.map((v, index) => (
            <div 
              key={v.id} 
              className="aspect-[9/16] relative bg-slate-200 dark:bg-slate-800 group cursor-pointer overflow-hidden"
              onClick={() => setSelectedVideoIndex(index)}
            >
              {/* FIX 1: Video Cover (Thumbnail) */}
              <video 
                src={`${v.videoUrl}#t=0.1`} 
                poster={v.thumbnailUrl || ''} // Gunakan thumbnailUrl sebagai poster
                className="w-full h-full object-cover" 
                muted 
                playsInline 
              />
              
              {/* FIX 2: Pindahkan Kontrol ke Titik Tiga (Three Dots Menu) */}
              <div className="absolute bottom-2 right-2 z-20">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); // PENTING: Mencegah modal video terbuka pas klik menu
                    setEditingVideo(v); 
                    setIsActionSheetOpen(true); 
                  }}
                  className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all border border-white/20"
                >
                  <MoreVertical size={14} />
                </button>

                {/* Action Sheet / Dropdown */}
                {isActionSheetOpen && editingVideo?.id === v.id && (
                  <div className={`absolute bottom-full right-0 mb-2 w-40 rounded-xl shadow-lg border py-1 z-30 animate-in fade-in zoom-in duration-200 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    {isOwner ? (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEditClick(v); setIsActionSheetOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <Edit size={16} /> Edit Video
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteVideo(v.id); setIsActionSheetOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20`}
                        >
                          <Trash2 size={16} /> Hapus Video
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReportVideo(v.id); }}
                          className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <Flag size={16} /> Laporkan Video
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleShareVideo(v.videoUrl); }}
                          className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <Share2 size={16} /> Bagikan ke WhatsApp
                        </button>
                      </>
                    )}
                  </div>
              )}
              </div>

              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <PlayCircle size={32} className="text-white shadow-xl" />
              </div>
              {v.likes > 0 && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-[10px] font-bold drop-shadow-md">
                  <PlayCircle size={12} /> {v.likes}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-30">
          <Video size={48} />
          <p className="text-sm font-bold mt-2">Belum ada video.</p>
        </div>
      )
      ) : (
        /* Product Grid (2 Columns) */
        <div className="grid grid-cols-2 gap-3 p-4 pb-24">
          {sellerProducts.length > 0 ? (
            sellerProducts.map((p) => (
              <div 
                key={p.id} 
                onClick={() => onProductClick(p)}
                className={`rounded-2xl border overflow-hidden transition-all active:scale-95 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}
              >
                <div className="aspect-square relative bg-gray-100">
                  <img src={p.mediaUrl || p.image} className="w-full h-full object-cover" alt="" />
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold ${p.stock > 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {p.stock > 0 ? 'Stok Ada' : 'Habis'}
                  </div>
                </div>
                <div className="p-3">
                  <h4 className={`text-xs font-bold line-clamp-1 mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.name}</h4>
                  <p className="text-sky-600 font-black text-sm">Rp {parseInt(p.price).toLocaleString('id-ID')}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 py-20 text-center opacity-30">
              <ShoppingBag size={48} className="mx-auto mb-2" />
              <p className="text-sm font-bold">Belum ada produk yang dijual.</p>
            </div>
          )}
        </div>
      )}

      {/* Full Screen Player Modal */}
      {selectedVideoIndex !== null && (
        <div className="fixed inset-0 z-[300] bg-black animate-in fade-in duration-300">
          <NiagaVideo 
            initialVideos={videos} 
            initialIndex={selectedVideoIndex} 
            onBack={() => setSelectedVideoIndex(null)}
            onProfileClick={(id) => { if(id === userId) setSelectedVideoIndex(null); }}
            onStoreClick={() => setSelectedVideoIndex(null)}
          />
        </div>
      )}

      {/* Edit Video Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Edit Deskripsi Video</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            
            <div className="space-y-4">
              <div className="aspect-video rounded-xl overflow-hidden bg-black/10">
                <video src={editingVideo?.videoUrl} className="w-full h-full object-cover" muted />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Deskripsi Video</label>
                <textarea 
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className={`w-full mt-1 p-3 rounded-xl border outline-none text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50'}`}
                  rows="3"
                />
              </div>
              <button onClick={handleUpdateDescription} className="w-full py-3 bg-sky-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"><Save size={18}/> Simpan Perubahan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserPublicProfile;