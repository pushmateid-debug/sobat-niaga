import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Star, ShoppingCart, MessageCircle, Loader2, Share2, Tag, Store, User, ArrowLeft, ShoppingBag } from 'lucide-react';
import { db, auth } from '../config/firebase';
import { ref, get, push } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const ProductDetail = ({ product: initialProduct, onBack, onGoToCart, onVisitStore, onChatWithProduct }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  const [product, setProduct] = useState(initialProduct || null);
  const [loading, setLoading] = useState(!initialProduct);
  const [user, setUser] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(null);

  // 1. Auth Listener (Biar fitur belanja jalan meskipun masuk via Link Langsung)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Data Produk Berdasarkan ID dari URL
  useEffect(() => {
    if (initialProduct) {
        setProduct(initialProduct);
        setActiveImage(initialProduct.mediaUrl || initialProduct.image);
        setLoading(false);
        return;
    }

    const fetchProduct = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const productRef = ref(db, `products/${id}`);
        const snapshot = await get(productRef);
        
        if (snapshot.exists()) {
          const data = snapshot.val();
          const productData = { id, ...data };
          setProduct(productData);
          setActiveImage(productData.mediaUrl || productData.image);
        } else {
          Swal.fire('Gagal', 'Produk tidak ditemukan, Bro!', 'error');
          navigate('/');
        }
      } catch (error) {
        console.error("Gagal load produk via URL:", error);
        Swal.fire('Error', 'Gagal memuat produk. Cek koneksi lo, Bro!', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, initialProduct, navigate]);

  // 3. Fungsi Salin Link Produk (Share)
  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/product/${id}`;
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

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50'}`}>
        <Loader2 className="animate-spin text-sky-500 mb-4" size={48} />
        <p className="font-bold animate-pulse">Loading Produk Ganteng...</p>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Header Sticky Mobile */}
      <div className={`sticky top-0 z-50 border-b md:hidden backdrop-blur-md ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-gray-100'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-sm font-bold truncate max-w-[200px]">{product.name}</h1>
          <button onClick={handleCopyShareLink} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-sky-600">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row">
        
        {/* Sisi Kiri: Foto Produk */}
        <div className="w-full md:w-1/2 p-4 md:p-10">
          <div className={`relative aspect-square w-full rounded-3xl overflow-hidden shadow-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
            <img 
              src={activeImage || product.mediaUrl || product.image} 
              className="w-full h-full object-cover" 
              alt={product.name} 
            />
          </div>
          {/* Thumbnail Gallery (Jika ada) */}
          {(product.gallery && product.gallery.length > 0) && (
            <div className="flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hide">
              {[product.mediaUrl || product.image, ...product.gallery].map((img, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setActiveImage(img)}
                  className={`w-16 h-16 rounded-xl border-2 flex-shrink-0 overflow-hidden transition-all ${activeImage === img ? 'border-sky-500 scale-95' : 'border-transparent opacity-60'}`}
                >
                  <img src={img} className="w-full h-full object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sisi Kanan: Detail & Info */}
        <div className="w-full md:w-1/2 p-6 md:p-10 md:pt-14">
          <div className="flex flex-col h-full">
            <span className={`text-[11px] font-black uppercase tracking-[0.4em] mb-2 block ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
              {product.category} Official
            </span>
            
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tighter">
                {product.name}
              </h1>
              <button 
                onClick={handleCopyShareLink}
                className="hidden md:flex p-3 rounded-2xl border transition-all hover:bg-sky-50 dark:hover:bg-slate-800 text-sky-600 border-sky-100 dark:border-slate-700"
              >
                <Share2 size={24} />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1.5 rounded-xl border border-yellow-400/20">
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
                <span className="text-base font-black text-yellow-700">{product.rating || '4.8'}</span>
              </div>
              <span className="text-sm font-bold text-gray-400">{product.sold || 0} Terjual</span>
            </div>

            <div className="mb-8">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Harga Terbaik</p>
              <h2 className={`text-4xl md:text-5xl font-black tracking-tighter ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                Rp {parseInt(product.price).toLocaleString('id-ID')}
              </h2>
            </div>

            {/* Info Toko */}
            <div className={`flex items-center justify-between p-4 rounded-2xl border mb-8 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                  <Store size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">{product.storeName || 'Sobat Store'}</h3>
                  <p className="text-[10px] uppercase font-black text-gray-400">Verificated Seller</p>
                </div>
              </div>
              <button 
                onClick={() => navigate(`/store-profile/${product.sellerId}`)}
                className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-xs font-bold shadow-sm"
              >
                Kunjungi Toko
              </button>
            </div>

            {/* Deskripsi */}
            <div className="mb-10">
              <h4 className="text-sm font-black uppercase tracking-widest mb-3 border-b pb-2 dark:border-slate-800">Deskripsi Produk</h4>
              <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {product.description || 'Tidak ada deskripsi untuk produk ini.'}
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

      {/* Mobile Floating Action Bar */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 p-4 border-t z-[100] flex gap-3 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
        <button 
          onClick={() => navigate('/chat')} // Atau sesuaikan dengan fungsi chat penjual lo, Bro
          className="p-4 bg-gray-100 dark:bg-slate-800 rounded-2xl text-gray-600 dark:text-gray-400"
        >
          <MessageCircle size={24} />
        </button>
        <button 
          onClick={() => handleAddToCart(false)}
          disabled={isAdding}
          className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          {isAdding ? <Loader2 className="animate-spin" /> : <ShoppingCart size={24} />}
        </button>
        <button 
          onClick={() => handleAddToCart(true)}
          disabled={isAdding}
          className="flex-[2] py-4 bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg"
        >
          Pesan Sekarang
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;