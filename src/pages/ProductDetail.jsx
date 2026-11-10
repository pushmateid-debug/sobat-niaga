import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Star, ShoppingCart, MessageCircle, Loader2, Forward, Tag, Store, User, ArrowLeft, ShoppingBag, UserPlus, Check, Heart } from 'lucide-react';
import { db, dbFirestore, auth } from '../config/firebase';
import { ref, get, push } from 'firebase/database';
import { doc, onSnapshot, writeBatch, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const PRODUCT_SHARE_ORIGIN = 'https://sobat-niaga.vercel.app';

const ProductDetail = ({ product: suppliedProduct, productId, isModal = false, isLoading = false, productError = '', onBack, onChatWithProduct, onVisitStore, onGoToCart, onRequireLogin }) => {
  const navigate = useNavigate();
  const { theme } = useTheme() || { theme: 'light' };
  const isDarkMode = theme === 'dark';

  const [fetchedProduct, setFetchedProduct] = useState(null);
  const [isFetchingProduct, setIsFetchingProduct] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const product = suppliedProduct && String(suppliedProduct.id) === String(productId)
    ? suppliedProduct
    : fetchedProduct?.id === productId ? fetchedProduct : null;
  const [user, setUser] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
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

  useEffect(() => {
    let active = true;

    if (!productId) {
      setFetchedProduct(null);
      setIsFetchingProduct(false);
      setFetchError('');
      return () => { active = false; };
    }

    if (suppliedProduct && String(suppliedProduct.id) === String(productId)) {
      setFetchedProduct(suppliedProduct);
      setIsFetchingProduct(false);
      setFetchError('');
      return () => { active = false; };
    }

    setFetchedProduct(null);
    setIsFetchingProduct(true);
    setFetchError('');
    get(ref(db, `products/${productId}`))
      .then((snapshot) => {
        if (!active) return;
        if (snapshot.exists()) {
          setFetchedProduct({ id: productId, ...snapshot.val() });
        } else {
          setFetchError('Produk tidak ditemukan atau sudah tidak tersedia.');
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error('Gagal memuat detail produk:', error);
        setFetchError('Produk tidak dapat dimuat. Periksa koneksi atau coba lagi.');
      })
      .finally(() => {
        if (active) setIsFetchingProduct(false);
      });

    return () => { active = false; };
  }, [productId, suppliedProduct]);

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

  useEffect(() => {
    if (!isModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onBack?.();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModal, onBack]);

  const getProductShareUrl = () => {
    if (!product?.id) return '';
    return `${PRODUCT_SHARE_ORIGIN}/product/${encodeURIComponent(product.id)}`;
  };

  const handleCopyShareLink = async () => {
    const shareUrl = getProductShareUrl();
    if (!shareUrl) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('textarea');
        input.value = shareUrl;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Clipboard tidak mengizinkan penyalinan.');
      }

      Swal.fire({
        icon: 'success',
        title: 'Link Produk Disalin!',
        text: 'Link siap dibagikan.',
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
      });
    } catch (error) {
      console.error('Gagal menyalin link produk:', error);
      Swal.fire('Gagal Menyalin', 'Browser tidak mengizinkan akses clipboard. Silakan salin link secara manual.', 'error');
    }
  };

  // Fungsi Toggle Favorite
  const handleToggleFavorite = () => {
    const nextState = !isFavorite;
    setIsFavorite(nextState);
    
    Swal.fire({
      icon: 'success',
      title: nextState ? 'Masuk Favorit! ❤️' : 'Dihapus dari Favorit',
      toast: true, position: 'top', showConfirmButton: false, timer: 1500
    });
  };

  // Fungsi Bagikan ke WhatsApp
  const handleShareWhatsApp = () => {
    const shareUrl = getProductShareUrl();
    if (!shareUrl) return;
    const message = `Lihat produk ini di Sobat Niaga!\n\n${product?.name || 'Produk SobatNiaga'}\n\n${shareUrl}`;
    
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
      if (onRequireLogin) {
        onRequireLogin();
        return;
      }
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk belanja, Bro!', confirmButtonColor: '#0ea5e9' });
      return;
    }

    setIsAdding(true);
    try {
      const cartRef = ref(db, `users/${user.uid}/cart`);
      
      // 🛡️ CEK PRODUK DUPLIKAT DI KERANJANG
      const cartSnap = await get(cartRef);
      if (cartSnap.exists()) {
        const currentCart = cartSnap.val();
        const existingItemKey = Object.keys(currentCart).find(key => currentCart[key].productId === product?.id);
        if (existingItemKey) {
          Swal.fire({
            title: 'Sudah di Keranjang',
            text: 'Produk ini sudah ada di keranjangmu, Bro!',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Lihat Keranjang',
            cancelButtonText: 'Nanti Saja',
            buttonsStyling: false,
            customClass: {
              popup: `rounded-[2rem] ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800 shadow-2xl'}`,
              confirmButton: 'px-8 py-3 rounded-xl text-sm font-black text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all !opacity-100 mx-2 active:scale-95',
              cancelButton: `px-8 py-3 rounded-xl text-sm font-black !opacity-100 mx-2 transition-all ${isDarkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
            }
          }).then((res) => { if (res.isConfirmed && onGoToCart) onGoToCart(); });
          setIsAdding(false);
          return;
        }
      }

      await push(cartRef, {
        productId: product?.id || '',
        name: product?.name || 'Produk SobatNiaga',
        price: parseInt(product?.price) || 0,
        image: product?.mediaUrl || product?.image || 'https://via.placeholder.com/150',
        quantity: 1,
        storeName: product?.storeName || 'Toko',
        sellerId: product?.sellerId || '',
        selected: true,
        createdAt: new Date().toISOString()
      });

      if (redirect) {
        if (onGoToCart) onGoToCart();
      } else {
        Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Masuk keranjang 🛒', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
      }
    } catch (error) {
      console.error("Cart Error Detail:", error);
      Swal.fire('Error', 'Gagal masuk keranjang.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  // 6. Fungsi Chat Langsung Bawa Produk
  const handleInternalChat = () => {
    if (!user) {
      onRequireLogin?.();
      return;
    }
    if (!product) return;
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

  const isProductLoading = isLoading || isFetchingProduct || (Boolean(productId) && !product && !fetchError);
  const visibleProductError = productError || fetchError;
  const modalOverlay = (children) => (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onBack?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={product?.name || 'Detail produk'}
        className={`relative w-full max-w-6xl overflow-hidden rounded-2xl shadow-2xl md:rounded-3xl ${isDarkMode ? 'bg-slate-950 text-white ring-1 ring-white/10' : 'bg-white text-gray-900 ring-1 ring-black/10'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Tutup detail produk"
          className={`absolute right-3 top-3 z-[120] rounded-full p-2 shadow-md transition-colors ${isDarkMode ? 'bg-slate-800/90 text-white hover:bg-slate-700' : 'bg-white/90 text-slate-700 hover:bg-gray-100'}`}
        >
          <X size={20} />
        </button>
        <div className="max-h-[92vh] overflow-y-auto">{children}</div>
      </section>
    </div>
  );

  // Loading and missing-product states use the same presentation as the detail.
  if (isProductLoading || !product) {
    const statusContent = (
      <div className={`flex min-h-[320px] items-center justify-center p-8 ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
        {isProductLoading ? (
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
            <p className="text-lg font-bold text-red-500 mb-4">{visibleProductError || 'Yah, Produk Gak Ditemukan, Bro! 😢'}</p>
            <button onClick={onBack} className="px-6 py-2 bg-sky-600 text-white rounded-xl font-bold">Kembali</button>
          </div>
        )}
      </div>
    );
    return isModal ? modalOverlay(statusContent) : statusContent;
  }

  const productContent = (
    <div className={`transition-colors duration-300 ${isModal ? 'min-h-0 pb-0' : `min-h-screen pb-32 ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}`}`}>
      {!isModal && <header className={`sticky top-0 z-[100] border-b backdrop-blur-md ${isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-gray-200'}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={onBack} aria-label="Kembali" className={`rounded-full p-2 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}>
            <ArrowLeft size={22} />
          </button>
          <button type="button" onClick={() => navigate('/')} className="text-lg font-black tracking-tight text-sky-600">
            SobatNiaga
          </button>
        </div>
      </header>}
      <div className={`mx-auto flex flex-col md:flex-row relative ${isModal ? 'max-w-none min-h-0' : 'max-w-7xl min-h-[calc(100vh-64px)]'}`}>
        {/* Sisi Kiri: Foto Produk (Mobile Full Screen, Desktop Half) */}
        <div className={`w-full md:w-1/2 flex flex-col items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-slate-900/50' : 'bg-gray-50'} p-0 md:p-10`}>
          {/* Kontainer Foto Utama */}
          <div className={`relative w-full overflow-hidden shadow-2xl transition-all duration-500 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-gray-100'} rounded-none md:rounded-[2.5rem] max-w-[500px] ${isModal ? 'md:aspect-square md:max-h-[62vh]' : ''}`}>
            {/* Logic swipe horizontal / Carousell foto */}
            <div 
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none w-full"
              onScroll={handleScroll}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {allImages.map((img, index) => (
                <div key={index} className={`w-full flex-shrink-0 snap-start ${isModal ? 'h-full' : ''}`}>
                  <img 
                    src={img} 
                    className={`w-full rounded-none ${isModal ? 'h-full object-contain' : 'h-auto object-cover'}`}
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
                <div className={`flex items-baseline font-black ${isDarkMode ? 'text-[#FFD662]' : 'text-sky-600'}`}>
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
                    <Forward size={26} />
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
              onClick={handleShareOptions}
              className="hidden md:flex p-4 rounded-3xl border transition-all hover:bg-sky-50 dark:hover:bg-slate-800 text-sky-600 border-sky-100 dark:border-slate-700 shadow-sm active:scale-90 mt-4 ml-4"
            >
              <Forward size={24} />
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

            {/* Tabs Navigation (Pemisah Deskripsi & Review) */}
            <div className={`flex border-b mb-6 mt-6 transition-colors duration-300 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                {['about', 'review'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === tab ? (isDarkMode ? 'text-sky-400' : 'text-sky-600') : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600')}`}>
                        {tab === 'about' ? 'Tentang' : 'Ulasan'}
                        {activeTab === tab && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-sky-600 rounded-t-full"></div>}
                    </button>
                ))}
            </div>

            {/* Content Berdasarkan Tab yang Dipilih */}
            <div className="flex-1">
                {activeTab === 'about' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all w-full ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        {sellerProfile?.photoURL ? (
                          <img src={sellerProfile.photoURL} alt="Store Profile" className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border border-slate-600 shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-slate-700 animate-pulse border border-slate-600" />
                        )}
                        <div className="min-w-0">
                          <h4 className={`font-bold text-base md:text-lg truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{product?.storeName || "Nama Toko"}</h4>
                          <p className="text-[10px] text-green-500 font-bold uppercase tracking-wider mt-0.5">Verified Seller</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 min-w-[125px]">
                        <button onClick={handleInternalChat} className={`w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-center transition-all active:scale-95 ${isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Chat Penjual</button>
                        <button onClick={() => onVisitStore(product?.sellerId)} className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg text-center transition-all active:scale-95 shadow-sm">Kunjungi Toko</button>
                      </div>
                    </div>
                    <div className="mb-10">
                      <h4 className="text-sm font-black uppercase tracking-widest mb-3 border-b pb-2 dark:border-slate-800">Deskripsi Produk</h4>
                      <p className={`text-sm leading-relaxed px-4 md:p-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{product?.description || 'Tidak ada deskripsi untuk produk ini.'}</p>
                    </div>
                  </div>
                )}
                {activeTab === 'review' && (
                  <div className="py-10 text-center opacity-30 animate-in fade-in duration-300"><Star size={48} className="mx-auto mb-2" /><p className="font-bold text-sm uppercase tracking-widest">Belum Ada Ulasan</p><p className="text-xs mt-1">Jadilah yang pertama memberikan ulasan, Bro!</p></div>
                )}
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
  return isModal ? modalOverlay(productContent) : productContent;
};

export default ProductDetail;