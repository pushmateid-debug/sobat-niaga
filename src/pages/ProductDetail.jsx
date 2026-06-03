import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Star, ShoppingCart, MessageCircle, Loader2, Share2, Tag, Store, User, ArrowLeft, ShoppingBag, UserPlus, Check, Heart } from 'lucide-react';
import { db, dbFirestore, auth } from '../config/firebase';
import { ref, get, push } from 'firebase/database';
import { doc, onSnapshot, writeBatch, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const ProductDetail = ({ product, onBack, onChatWithProduct, onVisitStore }) => {
  const navigate = useNavigate();
  const { theme } = useTheme() || { theme: 'light' };
  const isDarkMode = theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const allImages = [product?.mediaUrl || product?.image, ...(product?.gallery || [])].filter(Boolean);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.clientWidth;
    if (width > 0) {
      setCurrentImageIndex(Math.round(scrollLeft / width));
    }
  };

  // 1. Auth Listener (Biar fitur belanja jalan meskipun masuk via Link Langsung)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Inisialisasi Gambar Utama
  useEffect(() => {
    if (product) {
      setActiveImage(product.mediaUrl || product.image);
    }
  }, [product]);

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

  // 3. Fetch Follow Status (Firestore)
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
    }, (err) => {
      console.error("Follow Detail Error:", err);
    });

    return () => unsubFollow();
  }, [product?.sellerId, user?.uid]);

  // 4. Fungsi Salin Link Produk (Share)
  const handleCopyShareLink = () => {
    // DIPAKSA: Menggunakan format /product/[id] agar pembeli langsung diarahkan ke produk ini
    const shareUrl = `${window.location.origin}/product/${product?.id}`;
    
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
      .catch(err => console.error("Gagal copy:", err));
  };

  // Fungsi Bagikan ke WhatsApp
  const handleShareWhatsApp = () => {
    const shareUrl = `${window.location.origin}/product/${product?.id}`;
    const message = `Halo! Cek produk keren ini di SobatNiaga: ${product?.name} 🚀\n\nLihat detailnya di sini, Bro:\n${shareUrl}`;
    
    // Encode URL agar aman dikirim lewat chat
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    
    window.open(waUrl, '_blank');
  };

  // 5. Fungsi Follow Seller
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
        productId: product.id,
        name: product.name,
        price: parseInt(product.price),
        image: product.mediaUrl || product.image,
        quantity: 1,
        storeName: product.storeName,
        sellerId: product.sellerId,
        selected: true,
        createdAt: new Date().toISOString()
      });

      if (redirect) {
        navigate('/cart');
      } else {
        Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Masuk keranjang 🛒', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
      }
    } catch (error) {
      Swal.fire('Error', 'Gagal masuk keranjang.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  // 6. Fungsi Chat Langsung Bawa Produk
  const handleInternalChat = () => {
    if (!user || !product) {
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk menghubungi penjual.', confirmButtonColor: '#0ea5e9' });
      return;
    }
    // Panggil fungsi stabil dari props (Home.jsx)
    onChatWithProduct(product);
  };

  // 7. Fungsi Menu Share & Laporkan (Pop-up)
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

  // 🛡️ 2. Loading Guard Super Ketat (Anti-Crash)
  if (loading || !product) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-sky-100 border-t-sky-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <ShoppingBag size={24} className="text-sky-500" />
              </div>
            </div>
            <p className="text-sm font-bold animate-pulse text-sky-500">Memuat data produk...</p>
          </div>
        ) : (
          <div className="text-center px-6">
            <p className="text-lg font-bold text-red-500 mb-4">Yah, Produk Gak Ditemukan, Bro! 😢</p>
            <button onClick={onBack} className="px-6 py-2 bg-sky-600 text-white rounded-xl font-bold">Kembali</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}`}> {/* Main container */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row min-h-[calc(100vh-64px)] relative">
        {/* Sisi Kiri: Foto Produk (Mobile Full Screen, Desktop Half) */}
        <div className={`w-full md:w-1/2 flex flex-col items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-slate-900/50' : 'bg-gray-50'} p-0 md:p-10`}>
          {/* Kontainer Foto Utama */}
          <div className={`relative w-full overflow-hidden shadow-2xl transition-all duration-500 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-gray-100'} rounded-none md:rounded-[2.5rem] max-w-[500px]`}>
            {/* Logic swipe horizontal / Carousell foto */}
            <div 
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none w-full"
              onScroll={handleScroll}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {allImages.map((img, index) => (
                <div key={index} className="w-full flex-shrink-0 snap-start">
                  <img 
                    src={img} 
                    className="w-full h-auto object-cover rounded-none"
                    alt={`${product?.name} ${index + 1}`}
                  />
                </div>
              ))}
            </div>

            {/* Indikator Angka Foto ala TikTok Shop di Pojok Kanan Bawah Foto */}
            {allImages.length > 1 && (
              <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                {currentImageIndex + 1}/{allImages.length}
              </div>
            )}
          </div>
          {/* Thumbnail Gallery (Hanya tampil di Desktop, atau di bawah info produk untuk Mobile) */}
          <div className="hidden md:flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hide">
            {[product?.mediaUrl || product?.image, ...(product?.gallery || [])].filter(Boolean).map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImage(img)}
                className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 flex-shrink-0 overflow-hidden transition-all ${activeImage === img ? 'border-sky-500 scale-95 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
              >
                <img src={img} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>
        </div>

        {/* Sisi Kanan: Detail & Info (Mobile di bawah foto, Desktop di samping) */}
        <div className="w-full md:w-1/2 p-6 md:p-10 md:pt-14">
          <div className="flex flex-col h-full">
            {/* SEKSI HARGA DAN JUDUL ALA TIKTOK SHOP */}
            <div className="px-4 mt-2 md:p-0 md:mt-0">
              <div className="flex justify-between items-center">
                {/* Format Harga: Rp kecil, Angka besar dengan warna #FFD662 */}
                <div className="flex items-baseline text-[#FFD662] font-black">
                  <span className="text-sm md:text-lg font-medium mr-0.5">Rp</span>
                  <span className="text-3xl md:text-5xl">
                    {parseInt(product?.price || 0).toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Tombol Aksi Kanan (Share & Favorite) */}
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleShareOptions}
                    className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-500 hover:text-sky-600'}`}
                  >
                    <Share2 size={22} />
                  </button>
                  <button 
                    onClick={() => Swal.fire({ icon: 'success', title: 'Ditambahkan ke Wishlist!', toast: true, position: 'top', showConfirmButton: false, timer: 1500 })}
                    className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-red-500' : 'text-gray-500 hover:text-red-600'}`}
                  >
                    <Heart size={22} />
                  </button>
                </div>
              </div>

              {/* Judul diletakkan tepat di bawah harga */}
              <h1 className={`text-lg md:text-2xl font-bold mt-2 leading-snug ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {product?.name || "Nama Produk"}
              </h1>
            </div>

            {/* Kontainer Komponen Rating Mini */}
            <div className="flex items-center gap-1 mt-1.5 px-4 text-gray-400 text-xs md:text-sm">
              <span className="text-[#FFD662]">★</span>
              <span className="font-semibold text-white">{product?.rating || '4.8'}</span>
              <span className="text-gray-500">|</span>
              <span>{product?.sold || 0} Terjual</span>
            </div>

            {/* Kategori Official (Pindah ke bawah rating atau sesuaikan) */}
            <span className={`text-[11px] font-black uppercase tracking-[0.4em] mt-4 px-4 block ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
              {product?.category} Official
            </span>

            {/* Share Button (Desktop Only) */}
            <button
              onClick={handleCopyShareLink}
              className="hidden md:flex p-4 rounded-3xl border transition-all hover:bg-sky-50 dark:hover:bg-slate-800 text-sky-600 border-sky-100 dark:border-slate-700 shadow-sm active:scale-90 mt-4 ml-4"
            >
              <Share2 size={24} />
            </button>

            {/* Thumbnail Gallery (Mobile: di bawah info produk) */}
            {(product?.gallery && product?.gallery?.length > 0) && (
              <div className="flex md:hidden gap-3 mt-4 px-4 overflow-x-auto pb-2 scrollbar-hide">
                {[product?.mediaUrl || product?.image, ...product?.gallery].filter(Boolean).map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(img)}
                    className={`w-16 h-16 rounded-2xl border-2 flex-shrink-0 overflow-hidden transition-all ${activeImage === img ? 'border-sky-500 scale-95 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={img} className="w-full h-full object-cover" alt="" />
                  </button>
                ))}
              </div>
            )}

            {/* JANGAN LUPA GANTI YANG DI BAGIAN DESKTOP VIEW JUGA, BRO! */}
            <div className={`flex items-center justify-between p-4 rounded-2xl border mb-6 transition-all w-full ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
              
              {/* SISI KIRI: Foto Profil Lingkaran Gmail & Nama Toko */}
              <div className="flex items-center gap-3">
                {sellerProfile?.photoURL ? ( // Proteksi Skeleton
                  // Jika data foto Gmail sudah sukses diambil dari Firebase, langsung tampilkan
                  <img 
                    src={sellerProfile.photoURL} 
                    alt="Store Profile" 
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border border-slate-600 shadow-sm animate-fade-in"
                  />
                ) : (
                  // JIKA DATA BELUM SELESAI DIMUAT: Hapus icon orang lama, ganti pake bulatan abu-abu berkedip (Skeleton Loading)
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-slate-700 animate-pulse border border-slate-600" />
                )}
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
                  onClick={handleInternalChat}
                  className={`w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-center transition-all active:scale-95 ${isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Chat Penjual
                </button>
                
                <button 
                  onClick={() => onVisitStore(product?.sellerId)}
                  className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg text-center transition-all active:scale-95 shadow-sm"
                >
                  Kunjungi Toko
                </button>
              </div>
            </div>

            {/* Deskripsi */}
            <div className="mb-10">
              <h4 className="text-sm font-black uppercase tracking-widest mb-3 border-b pb-2 dark:border-slate-800">Deskripsi Produk</h4>
              <p className={`text-sm leading-relaxed px-4 md:p-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {product?.description || 'Tidak ada deskripsi untuk produk ini.'}
              </p>
            </div>

            {/* Footer Action - Desktop */}
            <div className="hidden md:flex gap-4 mt-auto">
              <button 
                onClick={() => handleAddToCart(false)}
                disabled={isAdding}
                className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                {isAdding ? <Loader2 className="animate-spin" /> : <><ShoppingCart size={20} /> Keranjang</>}
              </button>
              <button 
                onClick={() => handleAddToCart(true)}
                disabled={isAdding}
                className="flex-[2] py-4 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-sky-700 shadow-lg shadow-sky-200 dark:shadow-none transition-all"
              >
                Pesan Sekarang
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Action Bar - Shopee Style */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 p-4 border-t z-[100] flex gap-3 backdrop-blur-lg ${isDarkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-gray-100'}`}>
        <button 
          onClick={() => handleAddToCart(false)}
          disabled={isAdding}
          className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          {isAdding ? <Loader2 className="animate-spin" /> : <ShoppingCart size={24} />}
        </button>
        <button 
          onClick={() => handleAddToCart(true)}
          disabled={isAdding}
          className="flex-[2] py-3 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg"
        >
          Pesan Sekarang
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;