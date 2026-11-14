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

const formatReviewCount = (value) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
}).format(value);

const formatSoldCount = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}jt+`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}rb+`;
  return value.toLocaleString('id-ID');
};

const socialPlatformIcons = {
  WhatsApp: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="currentColor">
      <path d="M12.04 2a9.92 9.92 0 0 0-8.48 15.07L2 22l5.1-1.34A9.93 9.93 0 1 0 12.04 2Zm0 18.06a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.03.8.81-2.95-.2-.31a8.12 8.12 0 1 1 6.85 3.77Zm4.45-6.08c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.1-.49.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.15 1.51.09.46-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.4v13.67a2.9 2.9 0 0 1-2.9 2.9 2.9 2.9 0 0 1-2.9-2.9 2.9 2.9 0 0 1 2.9-2.9c.3 0 .6.05.88.14V9.44a6.3 6.3 0 0 0-.88-.06 6.3 6.3 0 0 0-6.3 6.3A6.3 6.3 0 0 0 9.6 21.98a6.3 6.3 0 0 0 6.3-6.3V8.7a8.2 8.2 0 0 0 4.8 1.54V6.85a4.8 4.8 0 0 1-1.11-.16Z" />
    </svg>
  ),
  Facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="currentColor">
      <path d="M13.5 21v-8.2h2.76l.41-3.2H13.5V7.56c0-.93.26-1.56 1.59-1.56h1.7V3.14c-.3-.04-1.34-.14-2.55-.14-2.53 0-4.26 1.54-4.26 4.37V9.6H7.12v3.2h2.86V21h3.52Z" />
    </svg>
  ),
  Gmail: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18V6l9 7 9-7v12" stroke="#4285F4" />
      <path d="M3 6l9 7 9-7" stroke="#EA4335" />
      <path d="M3 6v12" stroke="#34A853" />
      <path d="M21 6v12" stroke="#FBBC04" />
    </svg>
  )
};

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
  const [quantity, setQuantity] = useState(1);
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
  const sellerPhoto = sellerProfile?.photoURL ||
    sellerProfile?.sellerInfo?.storeLogo ||
    sellerProfile?.sellerInfo?.photoURL ||
    product?.sellerPhoto ||
    product?.sellerInfo?.storeLogo ||
    product?.sellerInfo?.photoURL ||
    product?.storeLogo ||
    '';

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
      setQuantity(1);
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
        quantity,
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
  const soldCount = Number(product?.sold ?? product?.soldCount ?? product?.totalSold ?? 0);
  const hasProductRating = Number(product?.rating) > 0 || reviews.length > 0;
  const categoryLabel = product?.category || 'Produk';
  const categoryTrail = /niaga[\s-]*food/i.test(categoryLabel) ? ['GoFood', categoryLabel] : [categoryLabel];
  const productHighlights = [product?.highlights, product?.advantages, product?.features].find(Array.isArray) || [];
  const availableStock = Number(product?.stock);
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
    <div className={`transition-colors duration-300 ${isModal ? 'min-h-0 pb-0' : `min-h-screen ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}`}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-gray-200'}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => (isModal ? onBack?.() : navigate('/'))} className="flex shrink-0 items-center gap-2 text-lg font-black tracking-tight text-sky-500">
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
      <div className={`mx-auto grid grid-cols-1 gap-5 p-4 md:grid-cols-2 md:gap-x-8 md:gap-y-6 md:p-7 ${isModal ? 'max-w-none' : 'max-w-7xl'}`}>
        <div className="min-w-0">
          <div className="flex flex-col gap-3 md:flex-row">
            {allImages.length > 0 && (
              <div className="order-2 flex gap-2 overflow-x-auto pb-1 md:order-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pb-0">
              {allImages.map((imageUrl, index) => (
                <button
                  type="button"
                  key={`${imageUrl}-${index}`}
                  onClick={() => setCurrentImageIndex(index)}
                  aria-label={`Tampilkan foto ${index + 1}`}
                  aria-pressed={currentImageIndex === index}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition sm:h-20 sm:w-20 md:h-[4.5rem] md:w-[4.5rem] ${currentImageIndex === index ? 'border-sky-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <img src={imageUrl} className="h-full w-full object-cover" alt="" />
                </button>
              ))}
              </div>
            )}
            <div className="group relative order-1 flex aspect-square min-w-0 flex-1 items-center justify-center overflow-hidden md:order-2">
              {selectedImage ? (
                <img src={selectedImage} className="h-full w-full rounded-2xl object-contain" alt={product?.name || 'Foto produk'} />
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
          </div>
        </div>

        <div className="min-w-0">
          <div className="space-y-4">
            <div>
              <span className="inline-flex rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-500">{product?.category || 'Produk SobatNiaga'}</span>
              <h1 className={`mt-3 text-2xl font-bold leading-tight md:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{product?.name || 'Nama Produk'}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
                {hasProductRating && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-500">
                    <Star size={16} fill="currentColor" />
                    <span>{Number(product?.rating || (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length)).toFixed(1)}</span>
                    <span className="font-normal text-slate-500">({formatReviewCount(reviewCount)} Ulasan)</span>
                  </span>
                )}
                {hasProductRating && soldCount > 0 && <span aria-hidden="true" className="h-4 border-l border-slate-600" />}
                {soldCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <ShoppingCart size={15} className="text-slate-400" />
                    Terjual {formatSoldCount(soldCount)}
                  </span>
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

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-400">Jumlah</span>
              <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1">
                <button
                  type="button"
                  aria-label="Kurangi jumlah produk"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white transition hover:bg-slate-700 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                >−</button>
                <span aria-live="polite" className="min-w-12 text-center text-sm font-bold text-white">{quantity}</span>
                <button
                  type="button"
                  aria-label="Tambah jumlah produk"
                  onClick={() => setQuantity((current) => current + 1)}
                  disabled={availableStock > 0 && quantity >= availableStock}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white transition hover:bg-slate-700 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                >+</button>
              </div>
              {Number.isFinite(availableStock) && availableStock > 0 && <span className="text-xs text-slate-500">Stok {availableStock}</span>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button 
                onClick={() => handleAddToCart(false)}
                disabled={isAdding}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${isDarkMode ? 'border-slate-700 bg-slate-900 hover:bg-slate-800' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
              >
                {isAdding ? <Loader2 className="animate-spin" /> : <><ShoppingCart size={20} /> Tambah ke Keranjang</>}
              </button>
              <button 
                onClick={() => handleAddToCart(true)}
                disabled={isAdding}
                className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-3 text-sm font-black text-white transition hover:bg-sky-700"
              >
                Pesan Sekarang
              </button>
            </div>
          </div>
        </div>

        <section className={`min-w-0 overflow-hidden rounded-2xl border md:col-span-2 ${isDarkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white'}`}>
          <div className={`flex border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`} role="tablist" aria-label="Detail produk">
            {['about', 'review'].map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-5 py-3 text-sm font-bold transition ${activeTab === tab ? 'text-sky-500' : 'text-slate-500 hover:text-sky-500'}`}
              >
                {tab === 'about' ? 'Tentang' : `Ulasan${reviewCount ? ` (${formatReviewCount(reviewCount)})` : ''}`}
                {activeTab === tab && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-sky-500" />}
              </button>
            ))}
          </div>
          <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
            <div className="min-w-0">
            {activeTab === 'about' ? (
              <div className="space-y-4">
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
                {productHighlights.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-bold">Keunggulan Produk</h3>
                    <ul className="space-y-2">
                      {productHighlights.map((highlight, index) => (
                        <li key={`${index}-${typeof highlight === 'string' ? highlight : highlight?.title || highlight?.label || ''}`} className={`flex gap-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          <Check size={16} className="mt-0.5 shrink-0 text-sky-500" />
                          <span>{typeof highlight === 'string' ? highlight : highlight?.title || highlight?.label || highlight?.name || highlight?.description}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {reviewError ? (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{reviewError}</p>
                ) : (
                  <>
                    <section className={`flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
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
                      <div className={`rounded-xl border border-dashed p-6 text-center ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <p className="text-sm font-semibold">Belum ada ulasan produk</p>
                        <p className="mt-1 text-xs text-slate-500">Ulasan pembeli akan muncul di sini setelah tersedia.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            </div>
            <section className={`min-w-0 self-start rounded-2xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
              <h2 className="text-base font-bold">Informasi Penjual</h2>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                {sellerPhoto && (
                  <img
                    src={sellerPhoto}
                    alt={`Foto ${product?.storeName || sellerProfile?.sellerInfo?.storeName || 'penjual'}`}
                    className="h-14 w-14 shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1 truncate font-bold">
                    {product?.storeName || sellerProfile?.sellerInfo?.storeName || 'Toko SobatNiaga'}
                    {sellerVerified && <BadgeCheck size={16} className="shrink-0 text-sky-500" aria-label="Penjual terverifikasi" />}
                  </h3>
                  {sellerRating > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Star size={13} fill="currentColor" className="text-amber-400" /> {sellerRating.toFixed(1)} Rating Toko</p>}
                  {sellerVerified && <p className="mt-1 text-xs font-semibold text-emerald-500">Penjual Terverifikasi</p>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleInternalChat}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500 bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  <MessageCircle size={15} className="text-sky-400" /> Chat Penjual
                </button>
                <button
                  type="button"
                  onClick={() => onVisitStore?.(product?.sellerId)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500 bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  <Store size={15} className="text-sky-400" /> Kunjungi Toko
                </button>
              </div>
            </section>
          </div>
        </section>
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
              { name: 'WhatsApp', color: 'bg-[#25D366] text-white' },
              { name: 'Instagram', color: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white' },
              { name: 'TikTok', color: 'bg-black text-white' },
              { name: 'Facebook', color: 'bg-[#1877F2] text-white' },
              { name: 'Gmail', color: 'bg-white text-slate-700 border border-slate-200' }
            ].map(({ name, color }) => (
              <button key={name} type="button" onClick={() => handleSocialShare(name)} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-slate-100 p-2 transition hover:border-slate-300 hover:bg-slate-50 sm:p-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${color}`}>{socialPlatformIcons[name]}</span>
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