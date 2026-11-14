import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Star, ShoppingCart, MessageCircle, Loader2, Store, User, ShoppingBag, Check, Heart, Bookmark, Copy, Flag, ZoomIn, Send, ChevronRight, BadgeCheck } from 'lucide-react';
import { db, dbFirestore, auth } from '../config/firebase';
import { ref, get, push, set, remove } from 'firebase/database';
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
  const [activeTab, setActiveTab] = useState('about');
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewError, setReviewError] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const allImages = [...new Set([product?.mediaUrl || product?.image, ...(product?.gallery || [])].filter(Boolean))];
  const selectedImage = allImages[currentImageIndex] || allImages[0] || '';

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
      setCurrentImageIndex(0);
    }
  }, [product]);

  // 2.5 Fetch Data Seller untuk mendapatkan Foto Profil Gmail
  useEffect(() => {
    let active = true;
    if (!product?.sellerId || !user?.uid) {
      setSellerProfile(null);
      return () => { active = false; };
    }

    get(ref(db, `users/${product.sellerId}`)).then((snapshot) => {
      if (active && snapshot.exists()) setSellerProfile(snapshot.val());
    }).catch((error) => console.error('Gagal memuat profil penjual:', error));
    return () => { active = false; };
  }, [product?.sellerId, user?.uid]);

  useEffect(() => {
    let active = true;
    if (!product?.id) {
      setReviews([]);
      setReviewError('');
      return () => { active = false; };
    }

    get(ref(db, 'reviews')).then((snapshot) => {
      if (!active) return;
      const data = snapshot.val() || {};
      const productReviews = Object.entries(data)
        .map(([id, review]) => ({ id, ...review }))
        .filter((review) => String(review.productId) === String(product.id))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setReviews(productReviews);
      setReviewError('');
    }).catch((error) => {
      if (!active) return;
      console.error('Gagal memuat ulasan produk:', error);
      setReviews([]);
      setReviewError('Ulasan belum dapat dimuat. Silakan coba lagi nanti.');
    });

    return () => { active = false; };
  }, [product?.id]);

  useEffect(() => {
    let active = true;
    if (!product?.id || !user?.uid) {
      setIsFavorite(false);
      setIsSaved(false);
      return () => { active = false; };
    }

    Promise.all([
      get(ref(db, `users/${user.uid}/likedProducts/${product.id}`)),
      get(ref(db, `users/${user.uid}/savedProducts/${product.id}`))
    ]).then(([likedSnapshot, savedSnapshot]) => {
      if (!active) return;
      setIsFavorite(likedSnapshot.exists());
      setIsSaved(savedSnapshot.exists());
    }).catch((error) => {
      console.error('Gagal memuat status suka/simpan produk:', error);
    });

    return () => { active = false; };
  }, [product?.id, user?.uid]);

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
    if (!isModal && !isShareOpen && !isZoomOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isZoomOpen) setIsZoomOpen(false);
        else if (isShareOpen) setIsShareOpen(false);
        else onBack?.();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModal, isShareOpen, isZoomOpen, onBack]);

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
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2500);
      Swal.fire({
        icon: 'success',
        title: 'Link berhasil disalin',
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 1800
      });
    } catch (error) {
      console.error('Gagal menyalin link produk:', error);
      Swal.fire('Gagal Menyalin', 'Browser tidak mengizinkan akses clipboard. Silakan salin link secara manual.', 'error');
    }
  };

  const handleToggleProductCollection = async (collectionName, isActive, updateState, label) => {
    if (!user?.uid) {
      onRequireLogin?.();
      return;
    }
    if (!product?.id) return;

    const itemRef = ref(db, `users/${user.uid}/${collectionName}/${product.id}`);
    try {
      if (isActive) await remove(itemRef);
      else await set(itemRef, { productId: product.id, updatedAt: Date.now() });
      updateState(!isActive);
      Swal.fire({
        icon: 'success',
        title: isActive ? `${label} dihapus` : `${label} tersimpan`,
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 1500
      });
    } catch (error) {
      console.error(`Gagal memperbarui ${label.toLowerCase()} produk:`, error);
      Swal.fire('Gagal', `Tidak dapat memperbarui ${label.toLowerCase()} produk.`, 'error');
    }
  };

  const handleSocialShare = async (platform) => {
    const shareUrl = getProductShareUrl();
    if (!shareUrl) return;
    const shareText = `Lihat ${product?.name || 'produk ini'} di SobatNiaga`;
    const encodedUrl = encodeURIComponent(shareUrl);
    const targets = {
      WhatsApp: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`,
      Facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      Gmail: `mailto:?subject=${encodeURIComponent(product?.name || 'Produk SobatNiaga')}&body=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`,
      Instagram: 'https://www.instagram.com/',
      TikTok: 'https://www.tiktok.com/'
    };

    if (platform === 'Instagram' || platform === 'TikTok') {
      window.open(targets[platform], '_blank', 'noopener,noreferrer');
      await handleCopyShareLink();
      return;
    }
    if (platform === 'Gmail') {
      window.location.href = targets.Gmail;
      return;
    }
    window.open(targets[platform], '_blank', 'noopener,noreferrer');
  };

  const handleReportProduct = () => {
    setIsShareOpen(false);
    Swal.fire({
      title: 'Laporkan Produk?',
      text: 'Laporan kamu akan segera diproses oleh Admin.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Kirim Laporan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280'
    }).then((result) => {
      if (result.isConfirmed) Swal.fire('Berhasil', 'Terima kasih atas laporannya!', 'success');
    });
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

  const handleShareOptions = () => setIsShareOpen(true);

  const isProductLoading = isLoading || isFetchingProduct || (Boolean(productId) && !product && !fetchError);
  const visibleProductError = productError || fetchError;
  const reviewCount = Number(product?.reviewCount || reviews.length);
  const reviewAverage = Number(product?.rating) > 0
    ? Number(product.rating)
    : reviews.length
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
      : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Number(review.rating) === rating).length
  }));
  const sellerRating = Number(sellerProfile?.sellerInfo?.rating || sellerProfile?.storeRating || sellerProfile?.rating || product?.sellerRating || 0);
  const sellerVerified = sellerProfile?.sellerInfo?.isVerifiedSeller === true ||
    sellerProfile?.isVerifiedSeller === true ||
    product?.sellerInfo?.isVerifiedSeller === true ||
    product?.isVerifiedSeller === true;
  const categoryLabel = product?.category || 'Produk';
  const categoryTrail = /niaga[\s-]*food/i.test(categoryLabel) ? ['GoFood', categoryLabel] : [categoryLabel];
  const modalOverlay = (children) => (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-md sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onBack?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={product?.name || 'Detail produk'}
        className={`relative w-full max-w-7xl overflow-hidden rounded-2xl shadow-2xl md:rounded-3xl ${isDarkMode ? 'bg-slate-950 text-white ring-1 ring-white/10' : 'bg-white text-gray-900 ring-1 ring-black/10'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="max-h-[95vh] overflow-y-auto">{children}</div>
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
    return isModal ? createPortal(modalOverlay(statusContent), document.body) : statusContent;
  }

  const productContent = (
    <div className={`transition-colors duration-300 ${isModal ? 'min-h-0 pb-0' : `min-h-screen pb-32 ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}`}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-gray-200'}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => (isModal ? onBack?.() : navigate('/'))} className="flex shrink-0 items-center gap-2 text-lg font-black tracking-tight text-sky-500">
            <img src="/favicon.png" alt="" className="h-7 w-7 rounded-full" />
            <span>SobatNiaga</span>
          </button>
          <nav aria-label="Breadcrumb produk" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs">
            <button type="button" onClick={() => (isModal ? onBack?.() : navigate('/'))} className="shrink-0 text-slate-400 hover:text-sky-500">Home</button>
            <ChevronRight size={14} className="shrink-0 text-slate-500" />
            {categoryTrail.map((category, index) => (
              <React.Fragment key={`${category}-${index}`}>
                {index > 0 && <ChevronRight size={14} className="shrink-0 text-slate-500" />}
                <button type="button" onClick={() => navigate('/all-categories')} className={`shrink-0 truncate ${index === categoryTrail.length - 1 ? 'font-semibold text-sky-500' : 'text-slate-400 hover:text-sky-500'}`}>{category}</button>
              </React.Fragment>
            ))}
            <ChevronRight size={14} className="shrink-0 text-slate-500" />
            <span className="truncate text-slate-400">{product?.name}</span>
          </nav>
          <button
            type="button"
            onClick={onBack}
            aria-label="Tutup detail produk"
            className={`shrink-0 rounded-full p-2 transition-colors ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            <X size={20} />
          </button>
        </div>
      </header>
      <div className={`mx-auto flex flex-col gap-5 p-4 md:flex-row md:gap-8 md:p-7 ${isModal ? 'max-w-none' : 'max-w-7xl'}`}>
        <div className="w-full shrink-0 md:w-[46%]">
          <div className={`group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-slate-50'}`}>
            {selectedImage ? (
              <img src={selectedImage} className="h-full w-full object-contain" alt={product?.name || 'Foto produk'} />
            ) : (
              <div className="text-sm text-slate-400">Foto produk belum tersedia</div>
            )}
            {selectedImage && (
              <button
                type="button"
                onClick={() => setIsZoomOpen(true)}
                aria-label="Perbesar foto produk"
                className="absolute bottom-3 left-3 rounded-full bg-slate-950/75 p-2 text-white transition hover:bg-sky-600"
              >
                <ZoomIn size={19} />
              </button>
            )}
            {allImages.length > 1 && (
              <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-semibold text-white">
                {currentImageIndex + 1} / {allImages.length}
              </span>
            )}
          </div>
          {allImages.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {allImages.map((imageUrl, index) => (
                <button
                  type="button"
                  key={`${imageUrl}-${index}`}
                  onClick={() => setCurrentImageIndex(index)}
                  aria-label={`Tampilkan foto ${index + 1}`}
                  aria-pressed={currentImageIndex === index}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition sm:h-20 sm:w-20 ${currentImageIndex === index ? 'border-sky-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <img src={imageUrl} className="h-full w-full object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="space-y-4">
            <div>
              <span className="inline-flex rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-500">{product?.category || 'Produk SobatNiaga'}</span>
              <h1 className={`mt-3 text-2xl font-bold leading-tight md:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{product?.name || 'Nama Produk'}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                {(Number(product?.rating) > 0 || reviews.length > 0) && (
                  <span className="flex items-center gap-1 font-semibold text-amber-500">
                    <Star size={16} fill="currentColor" />
                    {Number(product?.rating || (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length)).toFixed(1)}
                    <span className="font-normal text-slate-500">({Number(product?.reviewCount || reviews.length).toLocaleString('id-ID')} ulasan)</span>
                  </span>
                )}
                {Number(product?.sold ?? product?.soldCount ?? product?.totalSold) > 0 && (
                  <span>{Number(product.sold ?? product.soldCount ?? product.totalSold).toLocaleString('id-ID')} terjual</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`text-3xl font-black ${isDarkMode ? 'text-amber-300' : 'text-sky-700'}`}>Rp {Number(product?.price || 0).toLocaleString('id-ID')}</span>
              {Number(product?.originalPrice) > Number(product?.price) && (
                <>
                  <span className="text-sm text-slate-400 line-through">Rp {Number(product.originalPrice).toLocaleString('id-ID')}</span>
                  <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-600">{Math.round((1 - Number(product.price) / Number(product.originalPrice)) * 100)}%</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleShareOptions}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <Send size={17} className="text-sky-500" /> Bagikan Link
              </button>
              <button
                type="button"
                onClick={() => handleToggleProductCollection('likedProducts', isFavorite, setIsFavorite, 'Suka')}
                aria-pressed={isFavorite}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${isFavorite ? 'border-rose-300 bg-rose-50 text-rose-600' : isDarkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} /> Suka
              </button>
              <button
                type="button"
                onClick={() => handleToggleProductCollection('savedProducts', isSaved, setIsSaved, 'Simpan produk')}
                aria-pressed={isSaved}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${isSaved ? 'border-sky-300 bg-sky-50 text-sky-700' : isDarkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <Bookmark size={17} fill={isSaved ? 'currentColor' : 'none'} /> Simpan Produk
              </button>
            </div>

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
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <section>
                      <h2 className="mb-2 text-base font-bold">Deskripsi Produk</h2>
                      <p className={`whitespace-pre-line text-sm leading-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'} ${!isDescExpanded ? 'line-clamp-5' : ''}`}>
                        {product?.description || 'Tidak ada deskripsi untuk produk ini.'}
                      </p>
                      {(product?.description || '').length > 260 && (
                        <button type="button" onClick={() => setIsDescExpanded(!isDescExpanded)} className="mt-2 text-sm font-bold text-sky-500">
                          {isDescExpanded ? 'Lebih Sedikit' : 'Selengkapnya'}
                        </button>
                      )}
                    </section>

                    {(product?.brand || product?.condition || product?.stock !== undefined) && (
                      <section className={`grid grid-cols-2 gap-3 rounded-xl p-3 text-sm ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                        {product?.brand && <div><span className="text-slate-500">Merek</span><p className="font-semibold">{product.brand}</p></div>}
                        {product?.condition && <div><span className="text-slate-500">Kondisi</span><p className="font-semibold">{product.condition}</p></div>}
                        {product?.stock !== undefined && <div><span className="text-slate-500">Stok</span><p className="font-semibold">{product.stock}</p></div>}
                        {product?.category && <div><span className="text-slate-500">Kategori</span><p className="font-semibold">{product.category}</p></div>}
                      </section>
                    )}

                    <section className={`rounded-2xl border p-4 ${isDarkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
                      <h2 className="mb-3 text-sm font-bold">Informasi Penjual</h2>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {sellerProfile?.photoURL || sellerProfile?.sellerInfo?.storeLogo || sellerProfile?.avatarURL || product?.storeLogo || product?.sellerPhoto ? (
                            <img src={sellerProfile?.photoURL || sellerProfile?.sellerInfo?.storeLogo || sellerProfile?.avatarURL || product?.storeLogo || product?.sellerPhoto} alt="" className="h-14 w-14 rounded-full border border-slate-200 object-cover" />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-lg font-bold text-sky-700">
                              {(product?.storeName || sellerProfile?.sellerInfo?.storeName || 'T').trim().slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="flex items-center gap-1 truncate font-bold">
                              {product?.storeName || sellerProfile?.sellerInfo?.storeName || 'Toko SobatNiaga'}
                              {sellerVerified && <BadgeCheck size={16} className="shrink-0 text-sky-500" aria-label="Penjual terverifikasi" />}
                            </h3>
                            {sellerRating > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Star size={13} fill="currentColor" className="text-amber-400" /> {sellerRating.toFixed(1)} Rating Toko</p>}
                            {sellerVerified && <p className="mt-1 text-xs font-semibold text-emerald-500">Penjual Terverifikasi</p>}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:w-40">
                          <button type="button" onClick={handleInternalChat} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700">
                            <MessageCircle size={15} /> Chat Penjual
                          </button>
                          <button type="button" onClick={() => onVisitStore?.(product?.sellerId)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${isDarkMode ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'}`}>
                            Kunjungi Toko
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
                {activeTab === 'review' && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    {reviewError ? (
                      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{reviewError}</p>
                    ) : (
                      <>
                        <section className={`flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                          <div className="min-w-32 text-center">
                            <p className="text-3xl font-black">{reviewAverage > 0 ? reviewAverage.toFixed(1) : '—'}</p>
                            <div className="my-1 flex justify-center text-amber-400">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={14} fill={star <= Math.round(reviewAverage) ? 'currentColor' : 'none'} />)}</div>
                            <p className="text-xs text-slate-500">{reviewCount.toLocaleString('id-ID')} ulasan</p>
                          </div>
                          <div className="flex-1 space-y-1">
                            {reviews.length > 0 && ratingDistribution.map(({ rating, count }) => (
                              <div key={rating} className="flex items-center gap-2 text-xs">
                                <span className="w-8 text-slate-500">{rating} ★</span>
                                <div className={`h-2 flex-1 overflow-hidden rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }} />
                                </div>
                                <span className="w-6 text-right text-slate-500">{count}</span>
                              </div>
                            ))}
                          </div>
                        </section>
                        {reviews.length ? reviews.map((review) => {
                          const reviewImages = [
                            review.imageUrl,
                            review.photoUrl,
                            review.image,
                            ...(Array.isArray(review.images) ? review.images : []),
                            ...(Array.isArray(review.photos) ? review.photos : [])
                          ].filter(Boolean);
                          return (
                            <article key={review.id} className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-3">
                                {review.buyerPhoto ? <img src={review.buyerPhoto} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-600"><User size={17} /></div>}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold">{review.buyerName || 'Pembeli'}</p>
                                  {review.createdAt && <p className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleDateString('id-ID')}</p>}
                                </div>
                                <span className="flex items-center gap-1 text-sm font-bold text-amber-500"><Star size={14} fill="currentColor" /> {Number(review.rating || 0)}</span>
                              </div>
                              {review.comment && <p className="mt-3 whitespace-pre-line text-sm leading-5 text-slate-500">{review.comment}</p>}
                              {reviewImages.length > 0 && <div className="mt-3 flex gap-2">{reviewImages.map((imageUrl, index) => <img key={`${imageUrl}-${index}`} src={imageUrl} alt="Foto ulasan" className="h-16 w-16 rounded-lg object-cover" />)}</div>}
                            </article>
                          );
                        }) : (
                          <div className={`rounded-2xl border border-dashed p-6 text-center ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                            <Star size={30} className="mx-auto mb-2 text-amber-400" />
                            <p className="text-sm font-semibold">Belum ada ulasan produk</p>
                            <p className="mt-1 text-xs text-slate-500">Ulasan pembeli akan muncul di sini setelah tersedia.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
            </div>

            {/* Footer Action - Desktop */}
            <div className="hidden md:flex gap-4 mt-auto">
              <button 
                onClick={() => handleAddToCart(false)}
                disabled={isAdding}
                className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                {isAdding ? <Loader2 className="animate-spin" /> : <><ShoppingCart size={20} /> Tambah ke Keranjang</>}
              </button>
              <button 
                onClick={() => handleAddToCart(true)}
                disabled={isAdding}
                className="flex-[2] py-4 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-sky-700 shadow-lg shadow-sky-200 dark:shadow-none transition-all"
              >
                Beli Sekarang
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
          {isAdding ? <Loader2 className="animate-spin" /> : <><ShoppingCart size={19} /> Tambah ke Keranjang</>}
        </button>
        <button 
          onClick={() => handleAddToCart(true)}
          disabled={isAdding}
          className="flex-[2] py-3 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg"
        >
          Beli Sekarang
        </button>
      </div>
    </div>
  );
  const shareModal = isShareOpen && createPortal(
    <div
      className="fixed inset-0 z-[2600] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsShareOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-product-title"
        className="relative max-h-[90vh] w-[92vw] max-w-[880px] overflow-y-auto rounded-[22px] bg-white p-5 text-slate-900 shadow-2xl sm:p-8 md:p-12"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={() => setIsShareOpen(false)} aria-label="Tutup Bagikan Produk" className="absolute right-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:right-6 sm:top-6">
          <X size={24} />
        </button>
        <h2 id="share-product-title" className="pr-10 text-2xl font-bold sm:text-3xl">Bagikan Produk</h2>

        <div className="mt-6 flex items-center gap-4 border-b border-slate-200 pb-6 sm:gap-7">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-32 sm:w-32">
            {(product?.mediaUrl || product?.image) && <img src={product.mediaUrl || product.image} alt={product?.name || 'Foto produk'} className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-lg font-bold sm:text-2xl">{product?.name || 'Produk SobatNiaga'}</h3>
            <p className="mt-2 text-xl font-bold text-emerald-700 sm:text-2xl">Rp {Number(product?.price || 0).toLocaleString('id-ID')}</p>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="product-share-url" className="mb-2 block text-base font-bold sm:text-lg">Link Produk</label>
          <div className="flex gap-2">
            <input id="product-share-url" readOnly value={getProductShareUrl()} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700 sm:px-4 sm:text-sm" />
            <button type="button" onClick={handleCopyShareLink} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#1e416d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#17365b]">
              {copySuccess ? <Check size={17} /> : <Copy size={17} />}<span className="hidden sm:inline">{copySuccess ? 'Tersalin' : 'Salin'}</span>
            </button>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-base font-bold sm:text-lg">Bagikan ke Media Sosial</h3>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {[
              { name: 'WhatsApp', symbol: <MessageCircle size={25} />, color: 'bg-[#25D366] text-white' },
              { name: 'Instagram', symbol: <span className="text-xl font-black">◎</span>, color: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white' },
              { name: 'TikTok', symbol: <span className="text-xl font-black">♪</span>, color: 'bg-black text-white' },
              { name: 'Facebook', symbol: <span className="text-2xl font-black">f</span>, color: 'bg-[#1877F2] text-white' },
              { name: 'Gmail', symbol: <span className="text-xl font-black text-[#EA4335]">M</span>, color: 'bg-white text-slate-700 border border-slate-200' }
            ].map(({ name, symbol, color }) => (
              <button key={name} type="button" onClick={() => handleSocialShare(name)} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-slate-100 p-2 transition hover:border-slate-300 hover:bg-slate-50 sm:p-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${color}`}>{symbol}</span>
                <span className="text-center text-[10px] font-medium text-slate-600 sm:text-xs">{name}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Instagram dan TikTok akan menyalin link lalu membuka aplikasinya.</p>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
          <button type="button" onClick={handleReportProduct} className="inline-flex items-center gap-2 font-semibold text-red-600 transition hover:text-red-700">
            <Flag size={17} /> Laporkan Produk
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
  const zoomModal = isZoomOpen && selectedImage && createPortal(
    <div className="fixed inset-0 z-[2700] flex items-center justify-center bg-black/90 p-4" onClick={() => setIsZoomOpen(false)}>
      <button type="button" aria-label="Tutup foto produk" onClick={() => setIsZoomOpen(false)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X size={24} /></button>
      <img src={selectedImage} alt={product?.name || 'Foto produk'} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body
  );
  const detailContent = isModal ? modalOverlay(productContent) : productContent;
  const renderedDetail = isModal ? createPortal(detailContent, document.body) : detailContent;
  return <>{renderedDetail}{shareModal}{zoomModal}</>;
};

export default ProductDetail;