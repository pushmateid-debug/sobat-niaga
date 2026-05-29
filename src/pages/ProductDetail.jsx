import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, ShoppingCart, Share2, Star, CheckCircle, MapPin, Tag, Store, User, PlayCircle, X, MessageCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { db } from '../config/firebase';
import { ref, push, query, orderByChild, equalTo, onValue, get, update } from 'firebase/database';
import { useTheme } from '../context/ThemeContext';

const ProductDetail = ({ product, onBack, onGoToCart, user, onVisitStore, onChatWithProduct }) => {
  const { id } = useParams();
  const { theme } = useTheme() || { theme: 'light' };
  const isDarkMode = theme === 'dark';

  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [activeImage, setActiveImage] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeTab, setActiveTab] = useState('about'); // New Tab State
  const [isDescExpanded, setIsDescExpanded] = useState(false); // New Desc State
  const [realtimeProduct, setRealtimeProduct] = useState(product); // State untuk data real-time
  const [isLoading, setIsLoading] = useState(!product);

  // Fallback data handling
  const {
    name = 'Nama Produk',
    price = 0,
    description = 'Tidak ada deskripsi produk.',
    mediaUrl,
    image,
    storeName = 'Toko',
    stock = 0,
    rating = 4.8,
    sold = 0,
    voucherCode,
    voucherAmount
  } = realtimeProduct || product || {}; // Gunakan data real-time jika ada

  const displayImage = mediaUrl || image || 'https://via.placeholder.com/300';

  useEffect(() => {
    if (displayImage) {
      setActiveImage(displayImage);
    }
  }, [displayImage]);

  const displayPrice = parseInt(price).toLocaleString('id-ID');

  // Layer Proteksi: Cek apakah barang ini milik user yang login
  const isMyProduct = user?.uid && (realtimeProduct?.sellerId || product?.sellerId) === user.uid;

  // Reset realtimeProduct saat product prop berubah (Pindah halaman produk)
  useEffect(() => {
    setRealtimeProduct(product);
  }, [product]);

  // --- LOGIC FETCH DATA BY ID (Mencegah Layar Putih di Laptop) ---
  useEffect(() => {
    const targetId = product?.id || id;
    if (targetId) {
        const productRef = ref(db, `products/${targetId}`);
        
        // Fetch awal jika prop product kosong
        if (!product) {
          get(productRef).then((snapshot) => {
            if (snapshot.exists()) {
              setRealtimeProduct({ ...snapshot.val(), id: targetId });
            }
            setIsLoading(false);
          });
        }

        // Listener Real-time
        const unsubscribe = onValue(productRef, (snapshot) => {
            if (snapshot.exists()) {
                setRealtimeProduct(prev => ({ 
                  ...(prev || product || {}), 
                  ...snapshot.val(), 
                  id: targetId 
                }));
            }
        });
        return () => unsubscribe();
    }
  }, [product, id]);

  // Fetch Reviews
  useEffect(() => {
    if (product?.id) {
        const reviewsRef = query(ref(db, 'reviews'), orderByChild('productId'), equalTo(product.id));
        onValue(reviewsRef, (snapshot) => {
            const data = snapshot.val();
            const loadedReviews = data ? Object.values(data) : [];
            setReviews(loadedReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        });
    }
  }, [product]);

  const handleQuantityChange = (val) => {
    if (val >= 1) {
      setQuantity(val);
    }
  };

  // Helper Masking Nama
  const maskName = (name) => {
    if (!name) return 'Pembeli';
    if (name.length <= 2) return name.substring(0, 1) + '*';
    return name.charAt(0) + '***' + name.charAt(name.length - 1);
  };

  const handleAddToCart = async (redirect = false) => {
    if (!user) {
      Swal.fire({
        icon: 'warning',
        title: 'Login Dulu',
        text: 'Silakan login untuk belanja',
        confirmButtonColor: '#0284c7'
      });
      return;
    }

    setIsAdding(true);
    try {
      const cartRef = ref(db, `users/${user.uid}/cart`);
      
      // LOGIKA ANTI-DUPLICATE
      const cartSnap = await get(cartRef);
      if (cartSnap.exists()) {
        const currentCart = cartSnap.val();
        // Cari apakah produk dengan ID yang sama sudah ada
        const existingItemKey = Object.keys(currentCart).find(key => {
          const item = currentCart[key];
          // Cek ID Produk & Varian (Jika ada sistem varian di masa depan, tambahkan di sini)
          return item.productId === product.id;
        });

        if (existingItemKey) {
          Swal.fire({
            title: 'Sudah di Keranjang',
            text: 'Produk ini sudah ada di keranjangmu. Mau lihat keranjang sekarang?',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Lihat Keranjang',
            cancelButtonText: 'Oke',
            buttonsStyling: false,
            customClass: {
              confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100',
              cancelButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all mr-3 !opacity-100'
            }
          }).then((result) => {
            if (result.isConfirmed && onGoToCart) {
              onGoToCart();
            }
          });
          setIsAdding(false);
          return; // Batalkan proses tambah baru
        }
      }

      await push(cartRef, {
        productId: product.id,
        name,
        category: product.category || 'General', // Save category for Jasa logic
        estimation: product.estimation || '', // Simpan estimasi untuk deadline tracking
        price: parseInt(price),
        image: displayImage,
        quantity,
        storeName,
        sellerId: product.sellerId,
        voucherCode: voucherCode || '', // Simpan info voucher ke cart
        voucherAmount: voucherAmount || 0,
        selected: true,
        createdAt: new Date().toISOString()
      });

      if (redirect && onGoToCart) {
        onGoToCart();
      } else {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil!',
          text: 'Produk masuk keranjang 🛒',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top'
        });
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: 'Terjadi kesalahan saat menyimpan.',
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Loading state biar gak layar putih pas refresh
  if (isLoading && !realtimeProduct && !product) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}`}>
        <Loader2 className={`animate-spin mb-2 ${isDarkMode ? 'text-sky-400' : 'text-sky-500'}`} size={40} />
        <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Memuat Detail Produk...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-24 font-sans transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-gray-900'}`}>
        <div className="max-w-5xl mx-auto md:pt-8 md:px-4">
        {/* Foto Utama - Kunci Kotak Sempurna 1:1 */}
        <div className={`relative w-full aspect-square overflow-hidden md:rounded-3xl shadow-lg group ${isDarkMode ? 'bg-slate-900' : 'bg-gray-100'}`}>
            <img src={activeImage || displayImage} alt={name} className="w-full h-full object-cover" />

            {/* Navigation Buttons */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                <button onClick={onBack} className="p-2 rounded-full bg-black/20 backdrop-blur-md text-white hover:bg-black/30 transition-all">
                    <ArrowLeft size={24} />
                </button>
                <button onClick={() => { 
                    navigator.clipboard.writeText(window.location.href);
                    Swal.fire({ icon: 'success', title: 'Link Disalin!', toast: true, position: 'top', showConfirmButton: false, timer: 1500 });
                }} className="p-2 rounded-full bg-black/20 backdrop-blur-md text-white hover:bg-black/30 transition-all">
                    <Share2 size={24} />
                </button>
            </div>

             {/* Video Indicator */}
             {realtimeProduct?.mediaType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <PlayCircle size={64} className="text-white/80" />
                </div>
            )}
        </div>
        
        {/* Barisan Thumbnail Gallery di Bawah Foto Utama */}
        <div className="px-4 py-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {/* FIX: Filter gambar unik agar tidak ada duplikasi antara mediaUrl dan gallery */}
            {[...new Set([displayImage, ...(realtimeProduct?.gallery || [])])].filter(Boolean).map((imgUrl, index) => (
              <button
                key={index}
                onClick={() => setActiveImage(imgUrl)}
                className={`w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                  activeImage === imgUrl ? 'border-sky-500 scale-95 shadow-md' : 'border-transparent opacity-60'
                }`}
              >
                <img src={imgUrl} className="w-full h-full object-cover" alt={`thumbnail-${index}`} />
              </button>
            ))}
          </div>
        </div>
        </div>

        <div className={`max-w-5xl mx-auto px-4 relative z-20 rounded-t-3xl pt-5 md:mt-0 md:rounded-xl md:p-8 md:shadow-xl md:mb-10 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            
            {/* Title & Add to Cart */}
            <div className="flex justify-between items-start gap-3 mb-3">
                <div className="flex-1">
                    <h1 className={`text-lg font-bold leading-snug font-sans ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{name}</h1>
                    <div className="flex items-center gap-1 mt-1">
                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                        <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{rating}</span>
                        <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>({reviews.length} ulasan)</span>
                    </div>
                </div>
                <button 
                    onClick={() => !isMyProduct && handleAddToCart(false)} 
                    disabled={isAdding || isMyProduct}
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm ${isMyProduct ? (isDarkMode ? 'bg-slate-800 text-gray-600' : 'bg-gray-100 text-gray-400') : 'bg-sky-50 text-sky-600 hover:bg-sky-100'}`}
                    title={isMyProduct ? "Ini barang dagangan Anda" : "Tambah ke Keranjang"}
                >
                    {isAdding ? <span className="animate-spin text-xs">...</span> : (isMyProduct ? <X size={20} /> : <ShoppingCart size={20} />)}
                </button>
            </div>

            {/* Tabs */}
            <div className={`flex border-b mb-4 ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                {['about', 'review'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 pb-2 text-xs font-bold capitalize transition-all relative ${
                            activeTab === tab ? 'text-sky-600' : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600')
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
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Operated By */}
                        <div className={`p-4 rounded-xl border transition-colors ${isDarkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`w-10 h-10 rounded-full border overflow-hidden flex items-center justify-center ${isDarkMode ? 'bg-slate-600 border-slate-500' : 'bg-white border-gray-200'}`}>
                                    <Store size={20} className={isDarkMode ? 'text-sky-400' : 'text-sky-600'} />
                                </div>
                                <div>
                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Operated by</p>
                                    <h3 className={`font-bold text-xs ${isDarkMode ? 'text-slate-100' : 'text-gray-900'}`}>{storeName}</h3>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <button
                                    onClick={() => onVisitStore(product.sellerId)}
                                    className={`flex-1 py-2.5 border rounded-xl text-xs font-bold transition-all text-center shadow-sm ${isDarkMode ? 'bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                >
                                    Kunjungi Toko
                                </button>
                                <button
                                    onClick={() => onChatWithProduct(realtimeProduct || product)}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 ${isDarkMode ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-none' : 'bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100 shadow-sm'}`}
                                >
                                    <MessageCircle size={16} /> Chat Penjual
                                </button>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <h3 className={`font-bold text-sm mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Deskripsi Produk</h3>
                            <div className={`text-xs leading-relaxed relative ${isDarkMode ? 'text-slate-300' : 'text-gray-700'} ${!isDescExpanded ? 'max-h-[3.6em] overflow-hidden' : ''}`}>
                                {description}
                                {!isDescExpanded && (
                                    <div className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t ${isDarkMode ? 'from-slate-800' : 'from-white'} to-transparent`}></div>
                                )}
                            </div>
                            <button 
                                onClick={() => setIsDescExpanded(!isDescExpanded)}
                                className="mt-1 text-xs font-bold text-sky-600 hover:text-sky-700 transition-colors"
                            >
                                {isDescExpanded ? 'Sembunyikan' : 'Baca selengkapnya'}
                            </button>
                        </div>

                    </div>
                )}

                {activeTab === 'review' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {reviews.length === 0 ? (
                            <p className={`text-center py-10 italic text-sm ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>Belum ada ulasan.</p>
                        ) : (
                            reviews.map((review, idx) => (
                                <div key={idx} className={`flex gap-4 border-b pb-4 last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-50'}`}>
                                    <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                                        {review.buyerPhoto ? <img src={review.buyerPhoto} alt="Buyer" className="w-full h-full object-cover" /> : <User size={20} className={`m-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>{maskName(review.buyerName)}</p>
                                        <div className="flex items-center gap-1 mt-0.5 mb-1">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={10} className={`${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                            ))}
                                        </div>
                                        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>{review.comment}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Sticky Bottom Bar */}
        <div className={`fixed bottom-0 left-0 right-0 border-t px-4 py-3 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                <div>
                    <p className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Total Harga</p>
                    <h2 className={`text-xl font-bold font-sans ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {displayPrice}</h2>
                </div>
                <button 
                    onClick={() => !isMyProduct && handleAddToCart(true)}
                    disabled={isMyProduct}
                    className={`flex-1 max-w-[180px] h-10 text-white text-sm font-bold rounded-full transition-all active:scale-95 ${isMyProduct ? 'bg-gray-400 cursor-not-allowed' : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200')}`}
                >
                    {isMyProduct ? 'Ini Barang Anda' : 'Beli Sekarang'}
                </button>
            </div>
        </div>

      {/* Modal Video Preview */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedVideo(null)}>
            <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-full"><X size={32} /></button>
            <video src={selectedVideo} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" controls autoPlay />
        </div>
      )}
    </div>
  );
};

export default ProductDetail;