import React, { useState, useEffect } from 'react';
import { X, Star, ShoppingCart, MessageCircle, Loader2, Forward, Tag, Store, User, PlayCircle, Image as ImageIcon, UserPlus, Check, Heart } from 'lucide-react';
import { db, dbFirestore } from '../config/firebase';
import { ref, push, get, query, orderByChild, equalTo, onValue } from 'firebase/database';
import { doc, onSnapshot, writeBatch, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const ProductDetailModal = ({ product, isOpen, onClose, user, onGoToCart, onVisitStore, onChatClick, onChatWithProduct }) => {
  const navigate = useNavigate();
  const { theme } = useTheme() || { theme: 'light' };
  const isDarkMode = theme === 'dark';

  const [isAdding, setIsAdding] = useState(false);
  const [reviews, setReviews] = useState([]);
   const [activeImage, setActiveImage] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Tentukan displayImage di atas agar bisa digunakan sebagai dependency hook
  const displayImage = product?.mediaUrl || product?.image || 'https://via.placeholder.com/400';

  // Hook untuk mensinkronkan activeImage saat product/displayImage berubah
  useEffect(() => {
    if (displayImage && isOpen) {
      setActiveImage(displayImage);
    }
  }, [displayImage, isOpen]);

  // Fetch Follow Status from Firestore
  useEffect(() => {
    const sid = product?.sellerId;
    if (!sid || !user?.uid || !isOpen) {
      if (!isOpen) setIsFollowing(false); // Reset status saat modal tutup
      return;
    }

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
    }, (err) => {
      console.error("Modal Follow Error:", err);
    });

    return () => unsubFollow();
  }, [product?.sellerId, user?.uid, isOpen]);

  // Fetch Seller Profile untuk mendapatkan Foto Profil Gmail (Sinkron dengan Mobile)
  useEffect(() => {
    if (product?.sellerId && isOpen) {
      const sellerRef = ref(db, `users/${product.sellerId}`);
      get(sellerRef).then((snapshot) => {
        if (snapshot.exists()) {
          setSellerProfile(snapshot.val());
        }
      });
    } else if (!isOpen) {
      setSellerProfile(null); // Reset saat modal ditutup
    }
  }, [product?.sellerId, isOpen]);

  // !!! PENTING: Early return HANYA boleh ada setelah SEMUA hooks didefinisikan !!!
  if (!isOpen || !product) return null;

  const {
    name = 'Nama Produk',
    price = 0,
    description = 'Tidak ada deskripsi produk.',
    mediaUrl,
    image, 
    storeName = 'Toko',
    rating = 4.8,
    category = 'Kategori',
    sold = 0,
    sellerId,
    voucherCode,
    voucherAmount
  } = product;

  // Logic: Cek apakah user yang login adalah pemilik produk
  const isOwner = user?.uid === sellerId;

  const handleFollow = async () => {
    if (!user) return Swal.fire('Login Dulu', 'Silakan login untuk mengikuti penjual ini.', 'warning');
    if (String(sellerId) === String(user.uid)) return;
    if (followLoading) return;

    setFollowLoading(true);
    const batch = writeBatch(dbFirestore);
    const targetStoreRef = doc(dbFirestore, 'users', sellerId);
    const currentUserRef = doc(dbFirestore, 'users', user.uid);

    try {
      if (isFollowing) {
        batch.update(targetStoreRef, { followersList: arrayRemove(user.uid), followersCount: increment(-1) });
        batch.update(currentUserRef, { followingList: arrayRemove(sellerId), followingCount: increment(-1) });
      } else {
        batch.update(targetStoreRef, { followersList: arrayUnion(user.uid), followersCount: increment(1) });
        batch.update(currentUserRef, { followingList: arrayUnion(sellerId), followingCount: increment(1) });
      }
      await batch.commit();
    } catch (error) {
      console.error("Error toggling follow:", error);
      Swal.fire('Gagal', 'Terjadi kesalahan saat memproses permintaan.', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleToggleFavorite = () => {
    const nextState = !isFavorite;
    setIsFavorite(nextState);
    
    Swal.fire({
      icon: 'success',
      title: nextState ? 'Masuk Favorit! ❤️' : 'Dihapus dari Favorit',
      toast: true, position: 'top', showConfirmButton: false, timer: 1500
    });
  };

  // Fungsi Salin Link Produk untuk Viralitas (Deep Linking)
  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/product/${product.id}`;

    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        Swal.fire({
          icon: 'success',
          title: 'Link Produk Disalin!',
          text: 'Siap di-share ke WhatsApp, Bro! 🚀',
          toast: true,
          position: 'top',
          showConfirmButton: false,
          timer: 2500,
          timerProgressBar: true,
        });
      })
      .catch((err) => {
        console.error("Gagal menyalin link:", err);
        Swal.fire('Gagal', 'Waduh, fitur copy diblokir browser kamu.', 'error');
      });
  };

  // Fungsi Bagikan ke WhatsApp
  const handleShareWhatsApp = () => {
    const shareUrl = `${window.location.origin}/product/${product.id}`;
    const message = `Halo! Cek produk keren ini di SobatNiaga: ${name} 🚀\n\nLihat detailnya di sini, Bro:\n${shareUrl}`;
    
    // Encode URL agar aman dikirim lewat chat
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    
    window.open(waUrl, '_blank');
  };

  // Fungsi Menu Share & Laporkan (Pop-up) - Disamakan dengan Mobile
  const handleShareOptions = () => {
    Swal.fire({
      title: 'Bagikan Produk',
      html: `
        <div class="flex flex-col gap-3">
          <button id="btnShareWA" class="w-full py-3.5 bg-[#25D366] text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-green-200">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.353-.883-.788-1.48-1.76-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03c0 2.12.553 4.189 1.606 6.06L0 24l4.073-1.068a11.826 11.825 0 005.975 1.587h.005c6.637 0 12.032-5.396 12.035-12.031a11.764 11.764 0 00-3.614-8.508z"/></svg> Bagikan ke WhatsApp
          </button>
          <button id="btnCopyLink" class="w-full py-3.5 bg-sky-600 text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-sky-200">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Salin Link Produk
          </button>
          <button id="btnReport" class="w-full py-3.5 bg-red-50 text-red-600 font-bold rounded-2xl flex items-center justify-center gap-3 border border-red-100">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg> Laporkan Produk
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      customClass: {
        popup: `rounded-[2rem] ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800'}`,
        title: 'text-lg font-bold mb-4'
      },
      didOpen: () => {
        const waBtn = document.getElementById('btnShareWA');
        const copyBtn = document.getElementById('btnCopyLink');
        const reportBtn = document.getElementById('btnReport');
        
        if (waBtn) {
          waBtn.onclick = () => {
            handleShareWhatsApp();
            Swal.close();
          };
        }
        if (copyBtn) {
          copyBtn.onclick = () => {
            handleCopyShareLink();
            Swal.close();
          };
        }
        if (reportBtn) {
          reportBtn.onclick = () => {
            Swal.fire({
              title: 'Laporkan Produk?',
              text: 'Laporan kamu akan segera diproses oleh Admin.',
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'Kirim Laporan',
              cancelButtonText: 'Batal',
              confirmButtonColor: '#ef4444',
              cancelButtonColor: '#6b7280',
            }).then((res) => { if (res.isConfirmed) Swal.fire('Berhasil', 'Terima kasih atas laporannya!', 'success'); });
          };
        }
      }
    });
  };

  const handleChatInternal = () => {
    Swal.fire('Info', 'Fitur chat langsung sedang disiapkan. Silakan kunjungi toko untuk diskusi lebih lanjut!', 'info');
  };

  const maskName = (name) => (name ? name.charAt(0) + '***' + name.charAt(name.length - 1) : 'Pembeli');

  const displayPrice = parseInt(price).toLocaleString('id-ID');

  const handleAddToCart = async (redirect = false) => {
    if (!user) {
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk belanja', confirmButtonColor: '#0284c7' });
      return;
    }

    setIsAdding(true);
    try {
      const cartRef = ref(db, `users/${user.uid}/cart`);
      const cartSnap = await get(cartRef);
      
      if (cartSnap.exists()) {
        const currentCart = cartSnap.val();
        const existingItemKey = Object.keys(currentCart).find(key => currentCart[key].productId === product.id);
        if (existingItemKey) {
          Swal.fire({ 
            title: 'Sudah di Keranjang', 
            text: 'Produk ini sudah ada di keranjangmu.', 
            icon: 'info', showCancelButton: true, confirmButtonText: 'Lihat Keranjang' }).then((res) => {
            if (res.isConfirmed) onGoToCart();
            else Swal.close(); // Tutup modal SweetAlert jika dibatalkan
          });
          setIsAdding(false);
          return;
        }
      }

      await push(cartRef, { productId: product.id, name, price: parseInt(price), image: displayImage, quantity: 1, storeName, sellerId: product.sellerId, selected: true, createdAt: new Date().toISOString() });
      
      if (redirect && onGoToCart) {
        onGoToCart();
      } else {
        Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Masuk keranjang 🛒', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
        onClose();
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      Swal.fire({ icon: 'error', title: 'Gagal', text: 'Terjadi kesalahan.' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleBuyNow = async () => {
    try {
      await handleAddToCart(true); // Tambahkan ke keranjang lalu redirect
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className={`w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col md:flex-row max-h-[90vh] transition-colors duration-300 ${
        isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-900'
      }`}>
        
        {/* Close Button */}
        <button onClick={onClose} className={`absolute top-6 right-6 z-10 p-2 rounded-full transition-all shadow-sm ${isDarkMode ? 'bg-slate-800 text-gray-400 hover:text-red-400' : 'bg-gray-100 text-gray-500 hover:text-red-500'}`}>
          <X size={24} />
        </button>

        {/* Sisi Kiri: Konten Visual */}
        <div className={`w-full md:w-1/2 p-10 flex flex-col items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-[#1e293b]/50' : 'bg-gray-50'}`}>
          {/* Frame Foto Utama Square 1:1 */}
          <div className={`relative w-full aspect-square max-w-[420px] rounded-3xl shadow-xl flex items-center justify-center p-6 overflow-hidden group transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}`}>
            <img src={activeImage || displayImage} alt={name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
          </div>

          {/* Thumbnail Gallery di Bawah Foto Utama */}
          <div className="w-full max-w-[420px] mt-8">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center">
              {/* FIX: Filter gambar unik */}
              {[...new Set([displayImage, ...(product?.gallery || [])])].filter(Boolean).map((imgUrl, index) => (
                <button
                  key={index}
                  onClick={() => setActiveImage(imgUrl)}
                  className={`w-14 h-14 md:w-16 md:h-16 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    activeImage === imgUrl ? 'border-sky-500 scale-95 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={imgUrl} className="w-full h-full object-cover" alt={`thumb-${index}`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sisi Kanan: Konten Informasi */}
        <div className={`w-full md:w-1/2 flex flex-col transition-colors duration-300 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          <div className="flex-1 overflow-y-auto p-10 md:p-14 md:pb-6 scrollbar-hide">
            <span className={`text-[11px] font-black uppercase tracking-[0.4em] mb-3 block font-sans ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{category} Official</span>
            
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className={`text-4xl font-black leading-tight font-sans tracking-tighter ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{name}</h1>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={handleToggleFavorite}
                  className={`p-3 rounded-2xl border transition-all active:scale-125 ${
                    isFavorite ? 'bg-red-50 border-red-100 text-red-500' : (isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700' : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-gray-100')
                  }`}
                >
                  <Heart size={24} className={isFavorite ? 'fill-red-500' : ''} />
                </button>
                <button 
                  onClick={handleShareOptions}
                  className={`p-3 rounded-2xl border transition-all active:scale-95 ${
                    isDarkMode ? 'bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700' : 'bg-sky-50 border-sky-100 text-sky-600 hover:bg-sky-100'
                  }`}
                >
                  <Forward size={24} />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mb-8">
              <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1.5 rounded-xl border border-yellow-400/20">
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
                <span className="text-base font-black text-yellow-700">{rating}</span>
              </div>
              <span className={`text-sm font-bold ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>{sold} Terjual</span>
            </div>

            <div className="mb-10">
              <div className={`flex items-baseline font-black ${isDarkMode ? 'text-[#FFD662]' : 'text-sky-600'}`}>
                <span className="text-lg font-medium mr-1">Rp</span>
                <span className="text-5xl tracking-tighter">{displayPrice}</span>
              </div>
              {voucherCode && (
                <div className={`flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl border font-sans ${
                  isDarkMode ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-green-50 text-green-700 border-green-100'
                }`}>
                  <Tag size={16} />
                  <span className="text-xs font-bold tracking-tight">Diskon Rp {parseInt(voucherAmount).toLocaleString('id-ID')} dengan kode <span className="font-mono">{voucherCode}</span></span>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className={`flex border-b mb-4 font-sans transition-colors duration-300 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                {['about', 'review'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 pb-2 text-xs font-black uppercase tracking-widest transition-all relative ${
                            activeTab === tab 
                              ? (isDarkMode ? 'text-sky-400' : 'text-sky-600') 
                              : (isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')
                        }`}
                    >
                        {tab}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-sky-600 rounded-t-full"></div>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[200px]">
                {activeTab === 'about' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 font-sans">
                        {/* Operated By */}
                        <div className={`flex items-center justify-between p-5 md:p-6 rounded-xl border transition-colors duration-300 ${isDarkMode ? 'bg-[#1e293b] border-slate-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                            {/* SISI KIRI: Foto Profil Gmail & Nama Toko (Bisa diklik untuk kunjungi toko) */}
                            <div 
                                className="flex items-center gap-4 cursor-pointer group/store"
                                onClick={() => { onClose(); onVisitStore && onVisitStore(sellerId); }}
                            >
                                {sellerProfile?.photoURL ? (
                                    <img 
                                        src={sellerProfile.photoURL} 
                                        alt="Store Profile" 
                                        className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border border-slate-600 shadow-sm animate-fade-in group-hover/store:scale-105 transition-transform"
                                    />
                                ) : (
                                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-slate-700 animate-pulse border border-slate-600" />
                                )}
                                <div className="text-left">
                                    <h3 className={`font-black text-sm tracking-tight transition-colors duration-300 ${isDarkMode ? 'text-gray-200' : 'text-gray-900'} group-hover/store:text-sky-500`}>{storeName}</h3>
                                    <p className="text-[10px] text-green-500 font-bold uppercase tracking-wider mt-0.5">Verified Seller</p>
                                </div>
                            </div>

                            {/* Sisi Kanan: Tombol Kotak Atas-Bawah */}
                            <div className="flex flex-col gap-2 w-32 md:w-44">
                                {!isOwner && (
                                    <>
                                        <button
                                            onClick={() => { onClose(); onVisitStore && onVisitStore(sellerId); }}
                                            className={`w-full py-2 border rounded-xl text-[10px] font-black uppercase tracking-tighter shadow-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            Kunjungi Toko
                                        </button>
                                        <button
                                            onClick={() => onChatWithProduct(product)}
                                            className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all active:scale-95 ${isDarkMode ? 'bg-sky-600 text-white shadow-lg shadow-sky-200/50 hover:bg-sky-700' : 'bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100'}`}
                                        >
                                            Chat Penjual
                                        </button>
                                    </>
                                )}
                                {isOwner && (
                                    <button
                                        onClick={() => { onClose(); onVisitStore && onVisitStore(sellerId); }}
                                        className={`w-full py-2 border rounded-xl text-[10px] font-black uppercase tracking-tighter shadow-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-200 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        Kunjungi Toko
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <h3 className={`text-sm mb-1 font-black uppercase tracking-tighter transition-colors duration-300 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Deskripsi Produk</h3>
                            <div className={`text-xs leading-relaxed tracking-tight relative transition-colors duration-300 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} ${!isDescExpanded ? 'max-h-[3.6em] overflow-hidden' : ''}`}>
                                {description}
                                {!isDescExpanded && description && (
                                    <div className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t ${isDarkMode ? 'from-[#0f172a]' : 'from-white'} to-transparent`}></div>
                                )}
                            </div>
                            <button
                                onClick={() => setIsDescExpanded(!isDescExpanded)}
                                className="mt-1 text-xs font-black text-sky-600 hover:text-sky-700 transition-colors uppercase tracking-tighter"
                            >
                                {isDescExpanded ? 'Sembunyikan' : 'Baca selengkapnya'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'review' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 font-sans">
                        {reviews.length === 0 ? (
                            <p className={`text-center py-10 font-bold text-sm tracking-tight italic ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Belum ada ulasan.</p>
                        ) : (
                            reviews.map((review, idx) => (
                                <div key={idx} className={`flex gap-4 border-b pb-4 last:border-0 transition-colors duration-300 ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                                    <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 transition-colors duration-300 ${isDarkMode ? 'bg-slate-800' : 'bg-gray-200'}`}>
                                        {review.buyerPhoto ? <img src={review.buyerPhoto} alt="Buyer" className="w-full h-full object-cover" /> : <User size={20} className="m-2 text-gray-400" />}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm font-black tracking-tight transition-colors duration-300 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{maskName(review.buyerName)}</p>
                                        <div className="flex items-center gap-1 mt-0.5 mb-1">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={10} className={`${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                            ))}
                                        </div>
                                        <p className={`text-sm transition-colors duration-300 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>{review.comment}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`flex gap-4 p-10 md:px-14 py-6 border-t font-sans transition-colors duration-300 sticky bottom-0 z-10 ${isDarkMode ? 'bg-[#0f172a] border-slate-700' : 'bg-white border-gray-100'} shadow-[0_-10px_40px_rgba(0,0,0,0.03)]`}>
            <button 
              onClick={() => handleAddToCart(false)} 
              disabled={isAdding} 
              className={`flex-1 py-5 rounded-[1.25rem] transition-all flex items-center justify-center transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-slate-800 text-gray-400 hover:bg-slate-700' 
                  : 'bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100'
              }`}
              title="Tambah ke Keranjang"
            >
              {isAdding ? <Loader2 className="animate-spin" size={24} /> : <ShoppingCart size={24} />}
            </button>
            <button 
              onClick={handleBuyNow} 
              disabled={isAdding}
              className="flex-[3] bg-sky-600 hover:bg-sky-700 text-white font-black py-5 rounded-[1.25rem] shadow-2xl shadow-sky-200 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-[0.1em] text-sm"
            >
              {isAdding ? <Loader2 className="animate-spin" size={20} /> : 'Pesan Sekarang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;