import React, { useState, useEffect } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingCart, Share2, Star, CheckCircle, MapPin, Tag, Store, User, PlayCircle, X, MessageCircle, Image as ImageIcon } from 'lucide-react';
import Swal from 'sweetalert2';
import { db } from '../config/firebase';
import { ref, push, query, orderByChild, equalTo, onValue } from 'firebase/database';

const ProductDetail = ({ product, onBack, onGoToCart, user, onVisitStore }) => {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeTab, setActiveTab] = useState('about'); // New Tab State
  const [isDescExpanded, setIsDescExpanded] = useState(false); // New Desc State
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

  if (!product) return null;

  return (
    <div className="min-h-screen pb-24 font-sans transition-colors duration-300 bg-white">
        {/* Image Section with Navigation */}
        <div className="relative w-full h-[45vh] md:h-[50vh] bg-gray-100 overflow-hidden group">
            <img src={displayImage} alt={name} className="w-full h-full object-cover" />
            
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

            {/* Photo Indicator */}
            <div className="absolute bottom-4 right-4 px-2 py-0.5 bg-black/30 backdrop-blur-md rounded-full text-white text-[10px] font-bold">
                1/1
            </div>
             {/* Video Indicator */}
             {realtimeProduct?.mediaType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <PlayCircle size={64} className="text-white opacity-80" />
                </div>
            )}
        </div>

        <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-20 bg-white rounded-t-3xl pt-5 md:mt-0 md:rounded-none md:pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            
            {/* Title & Add to Cart */}
            <div className="flex justify-between items-start gap-3 mb-3">
                <div className="flex-1">
                    <h1 className="text-lg font-bold text-gray-900 leading-snug font-sans">{name}</h1>
                    <div className="flex items-center gap-1 mt-1">
                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-bold text-gray-700">{rating}</span>
                        <span className="text-xs text-gray-400">({reviews.length} ulasan)</span>
                    </div>
                </div>
                <button 
                    onClick={() => handleAddToCart(false)} 
                    disabled={isAdding}
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-100 transition-colors shadow-sm"
                >
                    {isAdding ? <span className="animate-spin text-xs">...</span> : <ShoppingCart size={20} />}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 mb-4">
                {['about', 'gallery', 'review'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 pb-2 text-xs font-bold capitalize transition-all relative ${
                            activeTab === tab ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'
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
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                                    <Store size={16} className="text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500">Operated by</p>
                                    <h3 className="font-bold text-gray-900 text-xs">{storeName}</h3>
                                </div>
                            </div>
                            <button 
                                onClick={() => onVisitStore(product.sellerId)}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[10px] font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Kunjungi
                            </button>
                        </div>

                        {/* Description */}
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm mb-1">Description</h3>
                            <div className={`text-xs text-gray-600 leading-relaxed relative ${!isDescExpanded ? 'max-h-[3.6em] overflow-hidden' : ''}`}>
                                {description}
                                {!isDescExpanded && (
                                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent"></div>
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

                {activeTab === 'gallery' && (
                    <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                            <img src={displayImage} className="w-full h-full object-cover" alt="Gallery 1" />
                        </div>
                        {/* Placeholder for more images */}
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center text-gray-300">
                            <ImageIcon size={24} />
                        </div>
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center text-gray-300">
                            <ImageIcon size={24} />
                        </div>
                    </div>
                )}

                {activeTab === 'review' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {reviews.length === 0 ? (
                            <p className="text-gray-500 text-center py-10 italic text-sm">Belum ada ulasan.</p>
                        ) : (
                            reviews.map((review, idx) => (
                                <div key={idx} className="flex gap-4 border-b border-gray-50 pb-4 last:border-0">
                                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                        {review.buyerPhoto ? <img src={review.buyerPhoto} alt="Buyer" className="w-full h-full object-cover" /> : <User size={20} className="m-2 text-gray-400" />}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-gray-800">{maskName(review.buyerName)}</p>
                                        <div className="flex items-center gap-1 mt-0.5 mb-1">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={10} className={`${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                            ))}
                                        </div>
                                        <p className="text-sm text-gray-600">{review.comment}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Sticky Bottom Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                <div>
                    <p className="text-[10px] text-gray-400">Total Harga</p>
                    <h2 className="text-xl font-bold text-sky-600 font-sans">Rp {displayPrice}</h2>
                </div>
                <button 
                    onClick={() => handleAddToCart(true)}
                    className="flex-1 max-w-[180px] h-10 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-full shadow-lg shadow-sky-200 transition-all active:scale-95"
                >
                    Beli Sekarang
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