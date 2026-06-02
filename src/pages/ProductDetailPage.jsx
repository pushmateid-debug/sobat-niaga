import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, ShoppingCart, MessageCircle, Loader2, Share2, Store, ArrowLeft, Check, UserPlus } from 'lucide-react';
import { db, dbFirestore, auth } from '../config/firebase';
import { ref, get, push, update, serverTimestamp } from 'firebase/database';
import { doc, onSnapshot, writeBatch, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const ProductDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme() || { theme: 'light' };
  const isDarkMode = theme === 'dark';

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState(null);

  // 1. Auth Listener (Biar fitur belanja jalan meskipun masuk via Link Langsung)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Logika Ambil Data Berdasarkan ID URL
  useEffect(() => {
    const getProductData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const productRef = ref(db, `products/${id}`);
        const snapshot = await get(productRef);
        
        if (snapshot.exists()) {
          const data = snapshot.val();
          setProduct({ id, ...data });
          setActiveImage(data.mediaUrl || data.image);
        } else {
          Swal.fire('Gagal', 'Produk tidak ditemukan, Bro!', 'error');
          navigate('/');
        }
      } catch (error) {
        console.error("Gagal load produk:", error);
        Swal.fire('Error', 'Gagal memuat produk. Cek koneksi lo, Bro!', 'error');
      } finally {
        setLoading(false);
      }
    };

    getProductData();
  }, [id, navigate]);

  // 2.5 Fetch Data Seller untuk mendapatkan Foto Profil Gmail
  useEffect(() => {
    if (product?.sellerId) {
      const sellerRef = ref(db, `users/${product.sellerId}`);
      get(sellerRef).then((snapshot) => {
        if (snapshot.exists()) {
          setSellerProfile(snapshot.val());
        }
      });
    }
  }, [product?.sellerId]);

  // 3. Fetch Follow Status (Firestore Sync)
  useEffect(() => {
    const sid = product?.sellerId;
    if (!sid || !user?.uid) return;

    const userFirestoreRef = doc(dbFirestore, 'users', sid);
    const unsubFollow = onSnapshot(userFirestoreRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const isUserFollowing = user.uid && 
                               Array.isArray(data.followersList) && 
                               data.followersList.includes(user.uid);
        setIsFollowing(Boolean(isUserFollowing));
      } else {
        setIsFollowing(false);
      }
    });

    return () => unsubFollow();
  }, [product?.sellerId, user?.uid]);

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/product/${product?.id}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        Swal.fire({
          icon: 'success', title: 'Link Produk Disalin!', text: 'Siap di-share ke WhatsApp, Bro! 🚀',
          toast: true, position: 'top', showConfirmButton: false, timer: 2500, timerProgressBar: true,
        });
      })
      .catch(err => console.error("Gagal copy:", err));
  };

  const handleShareWhatsApp = () => {
    const shareUrl = `${window.location.origin}/product/${product?.id}`;
    const message = `Halo! Cek produk keren ini di SobatNiaga: ${product?.name} 🚀\n\nKlik link di bawah:\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShareOptions = () => {
    Swal.fire({
      title: 'Bagikan Produk',
      html: `
        <div class="flex flex-col gap-3">
          <button id="btnShareWA" class="w-full py-3.5 bg-green-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2">
             🟢 Bagikan ke WhatsApp
          </button>
          <button id="btnCopyLink" class="w-full py-3.5 bg-sky-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2">
             🚀 Salin Link Produk
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      didOpen: () => {
        document.getElementById('btnShareWA').onclick = () => { handleShareWhatsApp(); Swal.close(); };
        document.getElementById('btnCopyLink').onclick = () => { handleCopyShareLink(); Swal.close(); };
      }
    });
  };

  const handleFollow = async () => {
    if (!user) return Swal.fire('Login Dulu', 'Silakan login untuk mengikuti penjual ini.', 'warning');
    if (String(product.sellerId) === String(user.uid)) return;
    if (followLoading) return;

    setFollowLoading(true);
    const batch = writeBatch(dbFirestore);
    const targetStoreRef = doc(dbFirestore, 'users', product.sellerId);
    const currentUserRef = doc(dbFirestore, 'users', user.uid);

    try {
      if (isFollowing) {
        batch.update(targetStoreRef, { followersList: arrayRemove(user.uid), followersCount: increment(-1) });
        batch.update(currentUserRef, { followingList: arrayRemove(product.sellerId), followingCount: increment(-1) });
      } else {
        batch.update(targetStoreRef, { followersList: arrayUnion(user.uid), followersCount: increment(1) });
        batch.update(currentUserRef, { followingList: arrayUnion(product.sellerId), followingCount: increment(1) });
      }
      await batch.commit();
    } catch (error) {
      Swal.fire('Gagal', 'Terjadi kesalahan saat memproses permintaan.', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleAddToCart = async (redirect = false) => {
    if (!user) {
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk belanja, Bro!', confirmButtonColor: '#0ea5e9' });
      return;
    }

    setIsAdding(true);
    try {
      const cartRef = ref(db, `users/${user.uid}/cart`);
      await push(cartRef, {
        productId: product.id, name: product.name, price: parseInt(product.price),
        image: product.mediaUrl || product.image, quantity: 1, storeName: product.storeName,
        sellerId: product.sellerId, selected: true, createdAt: new Date().toISOString()
      });

      if (redirect) navigate('/cart');
      else Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Masuk keranjang 🛒', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
    } catch (error) {
      Swal.fire('Error', 'Gagal masuk keranjang.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleChatWithProduct = async () => {
    if (!user || !product) {
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk menghubungi penjual.', confirmButtonColor: '#0ea5e9' });
      return;
    }
    const sellerId = product?.sellerId;
    const roomId = user.uid < sellerId ? `${user.uid}_${sellerId}` : `${sellerId}_${user.uid}`;
    
    // Siapkan data produk untuk context chat (Attached Product)
    const attachedProduct = {
      id: product?.id,
      title: product?.name || product?.title || "Produk",
      price: product?.price,
      image: product?.mediaUrl || product?.image || 'https://via.placeholder.com/150'
    };

    try {
      const messagesRef = ref(db, `seller_chats/${roomId}/messages`);
      await push(messagesRef, {
        senderId: user.uid, senderName: user.displayName || 'Buyer',
        text: `Halo, saya tertarik dengan produk ini.`, timestamp: serverTimestamp(),
        sender: 'buyer', status: 'sent',
        attachedProduct: attachedProduct
      });
      await update(ref(db, `seller_chats/${roomId}`), {
        buyerId: user.uid, userName: user.displayName || '', userPhoto: user.photoURL || '',
        userEmail: user.email || '', sellerId: sellerId, storeName: product?.storeName || 'Toko',
        lastMessageText: `Halo, saya tertarik dengan produk ini.`, lastMessageTime: serverTimestamp(), hasUnreadSeller: true
      });
      // Kirim state produk ke halaman chat
      navigate('/chat', { state: { attachedProduct } });
    } catch (err) { console.error("Gagal attach produk:", err); }
  };

  // 🛡️ 2. Loading Guard Super Ketat (Anti-Crash Layar Biru Tua)
  if (loading || !product) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          {loading ? (
            <>
              <Loader2 className="animate-spin text-sky-500" size={40} />
              <p className="text-sm font-medium animate-pulse">Memuat data produk...</p>
            </>
          ) : (
            <p className="text-sm font-medium text-red-400">Produk tidak ditemukan atau terhapus.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-900'}`}>
      {/* Header Sticky Mobile */}
      <div className={`sticky top-0 z-50 border-b md:hidden backdrop-blur-md ${isDarkMode ? 'bg-[#0f172a]/80 border-slate-800' : 'bg-white/80 border-gray-100'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><ArrowLeft size={24} /></button>
          <h1 className="text-sm font-bold truncate max-w-[200px]">{product?.name}</h1>
          <button onClick={handleShareOptions} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-sky-600"><Share2 size={20} /></button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row min-h-[calc(100vh-64px)]">
        {/* Sisi Kiri: Foto Produk */}
        <div className={`w-full md:w-1/2 p-4 md:p-10 flex flex-col items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-[#1e293b]/50' : 'bg-gray-50'}`}>
          <div className={`relative aspect-square w-full max-w-[500px] rounded-[2.5rem] overflow-hidden shadow-2xl border transition-all duration-500 ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-gray-100'}`}>
            <img src={activeImage || product?.mediaUrl || product?.image} className="w-full h-full object-cover hover:scale-110 transition-transform duration-700" alt={product?.name} />
          </div>
          <div className="flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hide">
            {[...new Set([product?.mediaUrl || product?.image, ...(product?.gallery || [])])].filter(Boolean).map((img, idx) => (
              <button key={idx} onClick={() => setActiveImage(img)} className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 flex-shrink-0 overflow-hidden transition-all ${activeImage === img ? 'border-sky-500 scale-95 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={img} className="w-full h-full object-cover" alt="" /></button>
            ))}
          </div>
        </div>

        {/* Sisi Kanan: Detail & Info */}
        <div className="w-full md:w-1/2 p-6 md:p-10 md:pt-14">
          <div className="flex flex-col h-full">
            <span className={`text-[11px] font-black uppercase tracking-[0.4em] mb-3 block ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{product?.category} Official</span>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-3xl md:text-6xl font-black leading-tight tracking-tighter">{product?.name}</h1>
              <button onClick={handleShareOptions} className="hidden md:flex p-4 rounded-3xl border transition-all hover:bg-sky-50 dark:hover:bg-slate-800 text-sky-600 border-sky-100 dark:border-slate-700 shadow-sm active:scale-90"><Share2 size={24} /></button>
            </div>
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1.5 rounded-xl border border-yellow-400/20"><Star size={18} className="fill-yellow-400 text-yellow-400" /><span className="text-base font-black text-yellow-700">{product.rating || '4.8'}</span></div>
              <span className="text-sm font-bold text-gray-400">{product?.sold || 0} Terjual</span>
            </div>
            <div className="mb-10">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Harga Terbaik</p>
              <h2 className="text-5xl md:text-6xl font-black tracking-tighter text-[#FFD662]">Rp {parseInt(product?.price || 0).toLocaleString('id-ID')}</h2>
            </div>

            {/* Tabs */}
            <div className={`flex border-b mb-6 transition-colors duration-300 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                {['about', 'review'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === tab ? (isDarkMode ? 'text-sky-400' : 'text-sky-600') : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600')}`}>
                        {tab}{activeTab === tab && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-sky-600 rounded-t-full"></div>}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1">
                {activeTab === 'about' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* JANGAN LUPA GANTI YANG DI BAGIAN DESKTOP VIEW JUGA, BRO! */}
                    <div className={`flex items-center justify-between p-4 rounded-2xl border mb-6 transition-all w-full ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                      
                      {/* SISI KIRI: Foto Profil Lingkaran Gmail & Nama Toko */}
                      <div className="flex items-center gap-3">
                        <img 
                          src={sellerProfile?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"} 
                          alt="Store Profile" 
                          className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border border-slate-600 shadow-sm"
                        />
                        <div className="min-w-0">
                          <h4 className={`font-bold text-base md:text-lg truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {product?.storeName || "Nama Toko"}
                          </h4>
                          <p className="text-[10px] text-green-500 font-bold uppercase tracking-wider mt-0.5">Verified Seller</p>
                        </div>
                      </div>

                      {/* SISI KANAN: Tombol Aksi Vertikal Pendek Tanpa Icon */}
                      <div className="flex flex-col gap-1.5 min-w-[125px]">
                        <button 
                          onClick={handleChatWithProduct}
                          className={`w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-center transition-all active:scale-95 ${isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          Chat Penjual
                        </button>
                        
                        <button 
                          onClick={() => navigate(`/store-profile/${product?.sellerId}`)}
                          className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg text-center transition-all active:scale-95 shadow-sm"
                        >
                          Kunjungi Toko
                        </button>
                      </div>
                    </div>
                    <div className="mb-10">
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-4 opacity-50">Deskripsi Produk</h4>
                      <div className={`text-sm leading-relaxed relative ${!isDescExpanded ? 'max-h-24 overflow-hidden' : ''} ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                        {product.description || 'Barang original kualitas bintang 5, Bro!'}
                        {!isDescExpanded && <div className={`absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t ${isDarkMode ? 'from-[#0f172a]' : 'from-white'} to-transparent`}></div>}
                      </div>
                      <button onClick={() => setIsDescExpanded(!isDescExpanded)} className="mt-2 text-xs font-bold text-sky-600 hover:text-sky-500 uppercase tracking-widest">{isDescExpanded ? 'Sembunyikan' : 'Baca Selengkapnya'}</button>
                    </div>
                  </div>
                )}
                {activeTab === 'review' && (
                  <div className="py-10 text-center opacity-30 animate-in fade-in duration-300"><Star size={48} className="mx-auto mb-2" /><p className="font-bold text-sm uppercase tracking-widest">Belum Ada Ulasan</p><p className="text-xs mt-1">Jadilah yang pertama memberikan ulasan, Bro!</p></div>
                )}
            </div>

            {/* Footer Action - Desktop */}
            <div className="hidden md:flex gap-4 mt-10">
              <button onClick={() => handleAddToCart(false)} disabled={isAdding} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">{isAdding ? <Loader2 className="animate-spin" /> : <><ShoppingCart size={20} /> Keranjang</>}</button>
              <button onClick={() => handleAddToCart(true)} disabled={isAdding} className="flex-[2] py-4 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-sky-700 shadow-lg shadow-sky-200 dark:shadow-none transition-all">Pesan Sekarang</button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Action Bar */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 p-4 border-t z-[100] flex gap-3 backdrop-blur-lg ${isDarkMode ? 'bg-[#0f172a]/90 border-slate-800' : 'bg-white/90 border-gray-100'}`}>
        <button onClick={() => handleAddToCart(false)} disabled={isAdding} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2">{isAdding ? <Loader2 className="animate-spin" /> : <ShoppingCart size={24} />}</button>
        <button onClick={() => handleAddToCart(true)} disabled={isAdding} className="flex-[2] py-4 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Pesan Sekarang</button>
      </div>
    </div>
  );
};

export default ProductDetailPage;