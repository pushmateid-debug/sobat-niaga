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
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        Swal.fire({
          icon: 'success', title: 'Link Produk Disalin!', text: 'Siap di-share ke WhatsApp, Bro! 🚀',
          toast: true, position: 'top', showConfirmButton: false, timer: 2500, timerProgressBar: true,
        });
      })
      .catch(err => console.error("Gagal copy:", err));
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
    if (!user) {
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk menghubungi penjual.', confirmButtonColor: '#0ea5e9' });
      return;
    }
    const sellerId = product.sellerId;
    const roomId = user.uid < sellerId ? `${user.uid}_${sellerId}` : `${sellerId}_${user.uid}`;
    try {
      const messagesRef = ref(db, `seller_chats/${roomId}/messages`);
      await push(messagesRef, {
        senderId: user.uid, senderName: user.displayName || 'Buyer',
        text: `Halo, saya tertarik dengan produk ini.`, timestamp: serverTimestamp(),
        sender: 'buyer', status: 'sent',
        attachedProduct: { id: product.id, name: product.name, price: product.price, image: product.mediaUrl || product.image }
      });
      await update(ref(db, `seller_chats/${roomId}`), {
        buyerId: user.uid, userName: user.displayName || '', userPhoto: user.photoURL || '',
        userEmail: user.email || '', sellerId: sellerId, storeName: product.storeName || 'Toko',
        lastMessageText: `Halo, saya tertarik dengan produk ini.`, lastMessageTime: serverTimestamp(), hasUnreadSeller: true
      });
      navigate('/chat');
    } catch (err) { console.error("Gagal attach produk:", err); }
  };

  if (loading) return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-gray-50'}`}>
      <Loader2 className="animate-spin text-sky-500 mb-4" size={48} /> {/* Ukuran Loader disesuaikan */}
      <p className="text-lg font-medium animate-pulse">Memuat Produk Terbaik SobatNiaga...</p>
    </div>
  );

  if (!product) return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-gray-50'}`}>
      <p className="text-lg font-medium text-red-400">Aduh Bro, Produk Gak Ditemukan!</p>
      <button onClick={() => navigate('/')} className="mt-4 px-6 py-2 bg-sky-600 text-white rounded-xl font-bold">Kembali ke Home</button>
    </div>
  );

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-900'}`}>
      {/* Header Sticky Mobile */}
      <div className={`sticky top-0 z-50 border-b md:hidden backdrop-blur-md ${isDarkMode ? 'bg-[#0f172a]/80 border-slate-800' : 'bg-white/80 border-gray-100'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><ArrowLeft size={24} /></button>
          <h1 className="text-sm font-bold truncate max-w-[200px]">{product.name}</h1>
          <button onClick={handleCopyShareLink} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-sky-600"><Share2 size={20} /></button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row min-h-[calc(100vh-64px)]">
        {/* Sisi Kiri: Foto Produk */}
        <div className={`w-full md:w-1/2 p-4 md:p-10 flex flex-col items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-[#1e293b]/50' : 'bg-gray-50'}`}>
          <div className={`relative aspect-square w-full max-w-[500px] rounded-[2.5rem] overflow-hidden shadow-2xl border transition-all duration-500 ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-gray-100'}`}>
            <img src={activeImage || product.mediaUrl || product.image} className="w-full h-full object-cover hover:scale-110 transition-transform duration-700" alt={product.name} />
          </div>
          <div className="flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hide">
            {[...new Set([product.mediaUrl || product.image, ...(product.gallery || [])])].filter(Boolean).map((img, idx) => (
              <button key={idx} onClick={() => setActiveImage(img)} className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 flex-shrink-0 overflow-hidden transition-all ${activeImage === img ? 'border-sky-500 scale-95 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={img} className="w-full h-full object-cover" alt="" /></button>
            ))}
          </div>
        </div>

        {/* Sisi Kanan: Detail & Info */}
        <div className="w-full md:w-1/2 p-6 md:p-10 md:pt-14">
          <div className="flex flex-col h-full">
            <span className={`text-[11px] font-black uppercase tracking-[0.4em] mb-3 block ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{product.category} Official</span>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-3xl md:text-6xl font-black leading-tight tracking-tighter">{product.name}</h1>
              <button onClick={handleCopyShareLink} className="hidden md:flex p-4 rounded-3xl border transition-all hover:bg-sky-50 dark:hover:bg-slate-800 text-sky-600 border-sky-100 dark:border-slate-700 shadow-sm active:scale-90"><Share2 size={24} /></button>
            </div>
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1.5 rounded-xl border border-yellow-400/20"><Star size={18} className="fill-yellow-400 text-yellow-400" /><span className="text-base font-black text-yellow-700">{product.rating || '4.8'}</span></div>
              <span className="text-sm font-bold text-gray-400">{product.sold || 0} Terjual</span>
            </div>
            <div className="mb-10">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Harga Terbaik</p>
              <h2 className={`text-5xl md:text-6xl font-black tracking-tighter ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {parseInt(product.price).toLocaleString('id-ID')}</h2>
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
                    <div className={`flex items-center justify-between p-5 rounded-3xl border transition-all ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-inner"><Store size={28} /></div>
                        <div><h3 className="font-bold text-sm">{product.storeName || 'Sobat Store'}</h3><p className="text-[10px] uppercase font-black text-gray-400">Verificated Seller</p></div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => navigate(`/store-profile/${product.sellerId}`)} className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase shadow-sm active:scale-95">Kunjungi Toko</button>
                        {user?.uid !== product.sellerId && (
                            <button onClick={handleFollow} disabled={followLoading} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 ${isFollowing ? 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300' : 'bg-sky-600 text-white shadow-lg shadow-sky-200/50'}`}>
                                {followLoading ? <Loader2 size={12} className="animate-spin"/> : (isFollowing ? 'Diikuti' : 'Ikuti')}
                            </button>
                        )}
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
        <button onClick={handleChatWithProduct} className="p-4 bg-gray-100 dark:bg-slate-800 rounded-2xl text-gray-600 dark:text-gray-400"><MessageCircle size={24} /></button>
        <button onClick={() => handleAddToCart(false)} disabled={isAdding} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2">{isAdding ? <Loader2 className="animate-spin" /> : <ShoppingCart size={24} />}</button>
        <button onClick={() => handleAddToCart(true)} disabled={isAdding} className="flex-[2] py-4 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Pesan Sekarang</button>
      </div>
    </div>
  );
};

export default ProductDetailPage;