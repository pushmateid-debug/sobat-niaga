import React, { useState, useEffect } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingCart, Share2, Star, CheckCircle, MapPin, Tag, Store, User, PlayCircle, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { db } from '../config/firebase';
import { ref, push, query, orderByChild, equalTo, onValue } from 'firebase/database';

const ProductDetail = ({ product, onBack, onGoToCart, user, onVisitStore }) => {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all'); // Filter Ulasan
  const [realtimeProduct, setRealtimeProduct] = useState(product); // State untuk data real-time

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
  const displayPrice = parseInt(price).toLocaleString('id-ID');

  // Reset realtimeProduct saat product prop berubah (Pindah halaman produk)
  useEffect(() => {
    setRealtimeProduct(product);
  }, [product]);

  // Fetch Real-time Product Data (Sync Rating & Sold)
  useEffect(() => {
    if (product?.id) {
        const productRef = ref(db, `products/${product.id}`);
        const unsubscribe = onValue(productRef, (snapshot) => {
            if (snapshot.exists()) {
                setRealtimeProduct({ ...product, ...snapshot.val(), id: product.id });
            }
        });
        return () => unsubscribe();
    }
  }, [product]);

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

  // Filter Logic Ulasan
  const getFilteredReviews = () => {
    if (activeFilter === 'all') return reviews;
    if (activeFilter === 'media') return reviews.filter(r => r.videoUrl);
    return reviews.filter(r => Math.floor(r.rating) === parseInt(activeFilter));
  };

  const filteredReviews = getFilteredReviews();

  // Hitung Statistik Ulasan
  const getReviewStats = () => {
    const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, media: 0, all: reviews.length };
    reviews.forEach(r => {
        const rounded = Math.floor(r.rating);
        if (stats[rounded] !== undefined) stats[rounded]++;
        if (r.videoUrl) stats.media++;
    });
    return stats;
  };
  const stats = getReviewStats();

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
          showConfirmButton: false
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

  if (!product) return null;

  return (
    <div className="min-h-screen pb-10 font-sans pt-6 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)' }}>
      {/* Main Content Card */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="rounded-3xl shadow-sm border overflow-hidden theme-card">
            <div className="p-6 lg:p-8">
                
                {/* Top Section: Side-by-Side Layout */}
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    
                    {/* Left: Compact Image */}
                    <div className="w-full lg:w-1/3 flex-shrink-0">
                        <div className="aspect-square rounded-2xl overflow-hidden border relative group theme-card">
                            <img 
                                src={displayImage} 
                                alt={name} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                            />
                        </div>
                    </div>

                    {/* Right: Product Info */}
                    <div className="flex-1 w-full flex flex-col">
                        <div className="mb-4">
                            <h1 className="text-2xl lg:text-3xl font-semibold theme-text leading-tight mb-2">{name}</h1>
                            <div className="flex items-center gap-3">
                                <h2 className="font-price text-3xl font-bold text-sky-600 tracking-wide">Rp {displayPrice}</h2>
                                <div className="h-6 w-px bg-gray-200"></div>
                                <div className="flex items-center gap-1 text-yellow-500 font-bold text-sm">
                                    <Star size={16} className="fill-yellow-500" /> {rating}
                                </div>
                                {/* Estimasi Pengerjaan (Khusus Jasa) */}
                                {product.category === 'Jasa' && product.estimation && (
                                    <>
                                        <div className="h-6 w-px bg-gray-200"></div>
                                        <div className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">Estimasi: {product.estimation}</div>
                                    </>
                                )}
                            </div>
                            
                            {/* Voucher Display */}
                            {voucherCode && (
                              <div className="mt-2 inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-200 border-dashed">
                                <Tag size={14} /> Gunakan Kode: <span className="font-mono select-all">{voucherCode}</span> (Hemat Rp {parseInt(voucherAmount).toLocaleString('id-ID')})
                              </div>
                            )}
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-2 mb-6">
                            <div className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100 flex items-center gap-1">
                                <CheckCircle size={12} /> Kondisi: Baru
                            </div>
                            <div className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold border border-purple-100">
                                Terjual {sold || '100+'}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="px-3 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold border border-orange-100 flex items-center gap-1">
                                    <MapPin size={12} /> {storeName}
                                </div>
                                {/* Tombol Kunjungi Toko */}
                                <button onClick={() => onVisitStore(product.sellerId)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold border border-gray-200 flex items-center gap-1 hover:bg-gray-200 transition-colors theme-text">
                                    <Store size={12} /> Kunjungi Toko
                                </button>
                            </div>
                        </div>

                        {/* Compact Description */}
                        <div className="mb-6">
                            <h3 className="font-bold theme-text text-sm mb-2">Deskripsi Singkat</h3>
                            <div className="max-h-32 overflow-y-auto pr-2 theme-text-muted text-sm leading-relaxed scrollbar-thin scrollbar-thumb-gray-200">
                                {description}
                            </div>
                        </div>

                        {/* Action Bar (Moved Here) */}
                        <div className="mt-auto pt-6 border-t border-gray-100">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                                {/* Quantity Control */}
                                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold theme-text text-sm">Jumlah:</span>
                                        <div className="flex items-center rounded-xl p-1 border theme-card">
                                            <button 
                                                onClick={() => handleQuantityChange(quantity - 1)} 
                                                disabled={quantity <= 1} 
                                                className="p-2 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50 theme-text"
                                            >
                                                <Minus size={18} />
                                            </button>
                                            <span className="w-10 text-center font-bold theme-text">{quantity}</span>
                                            <button 
                                                onClick={() => handleQuantityChange(quantity + 1)} 
                                                className="p-2 hover:bg-gray-100 rounded-lg transition-all theme-text"
                                            >
                                                <Plus size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <span className="text-xs theme-text-muted font-medium">Stok: {stock || '99+'}</span>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <button 
                                        onClick={() => handleAddToCart(false)}
                                        disabled={isAdding}
                                        className="flex-1 md:flex-none px-6 py-3 rounded-xl border-2 border-sky-600 text-sky-600 font-bold hover:bg-sky-50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <ShoppingCart size={18} />
                                        + Keranjang
                                    </button>
                                    <button 
                                        onClick={() => handleAddToCart(true)}
                                        className="flex-1 md:flex-none px-8 py-3 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all"
                                    >
                                        Beli Sekarang
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section Ulasan Pembeli (Shopee Style) */}
                <div className="mt-12 border-t border-gray-100 pt-8">
                    <h3 className="font-bold theme-text text-lg mb-6">Penilaian Produk</h3>
                    
                    {/* Dashboard Rating */}
                    <div className="p-6 rounded-xl border mb-6 theme-card">
                        <div className="flex flex-col md:flex-row gap-8 items-center">
                            {/* Score */}
                            <div className="text-center md:text-left">
                                <div className="flex items-end gap-2 justify-center md:justify-start">
                                    <span className="text-4xl font-bold text-sky-600">{rating}</span>
                                    <span className="text-lg text-gray-500 mb-1">/ 5.0</span>
                                </div>
                                <div className="flex items-center gap-1 mt-1 justify-center md:justify-start">
                                     {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={16} className={`${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                    ))}
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="flex-1 flex flex-wrap gap-2 justify-center md:justify-start">
                                <button onClick={() => setActiveFilter('all')} className={`px-4 py-2 rounded-lg text-sm border transition-all ${activeFilter === 'all' ? 'bg-sky-600 text-white font-bold shadow-sm' : 'theme-card theme-text hover:opacity-80'}`}>
                                    Semua ({stats.all})
                                </button>
                                <button onClick={() => setActiveFilter('media')} className={`px-4 py-2 rounded-lg text-sm border transition-all ${activeFilter === 'media' ? 'bg-sky-600 text-white font-bold shadow-sm' : 'theme-card theme-text hover:opacity-80'}`}>
                                    Dengan Media ({stats.media})
                                </button>
                                {[5, 4, 3, 2, 1].map(star => (
                                    <button key={star} onClick={() => setActiveFilter(star.toString())} className={`px-4 py-2 rounded-lg text-sm border transition-all ${activeFilter === star.toString() ? 'bg-sky-600 text-white font-bold shadow-sm' : 'theme-card theme-text hover:opacity-80'}`}>
                                        {star} Bintang ({stats[star]})
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Review List (Scrollable) */}
                    <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 space-y-6">
                        {filteredReviews.length === 0 ? (
                            <p className="theme-text-muted text-center py-10 italic">Belum ada ulasan untuk filter ini.</p>
                        ) : (
                            filteredReviews.map((review, idx) => (
                                <div key={idx} className="flex gap-4 border-b border-gray-50 pb-6 last:border-0">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                        {review.buyerPhoto ? (
                                            <img src={review.buyerPhoto} alt="Buyer" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400"><User size={20} /></div>
                                        )}
                                    </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-bold theme-text">
                                                    {maskName(review.buyerName)}
                                                </p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {[...Array(5)].map((_, i) => (
                                                        <Star key={i} size={12} className={`${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                                    ))}
                                                    <span className="text-[10px] text-gray-400 ml-2">{new Date(review.createdAt).toLocaleDateString('id-ID')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-sm theme-text-muted mt-2 leading-relaxed">{review.comment}</p>
                                        
                                        {/* Video Thumbnail */}
                                        {review.videoUrl && (
                                            <div onClick={() => setSelectedVideo(review.videoUrl)} className="mt-3 relative w-24 h-24 bg-black rounded-lg overflow-hidden cursor-pointer group">
                                                <video src={review.videoUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" />
                                                <div className="absolute inset-0 flex items-center justify-center text-white"><PlayCircle size={24} /></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
      </div>

      {/* Modal Video Preview */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4" onClick={() => setSelectedVideo(null)}>
            <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-full"><X size={32} /></button>
            <video src={selectedVideo} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" controls autoPlay />
        </div>
      )}
    </div>
  );
};

export default ProductDetail;