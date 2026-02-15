import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, ShoppingBag, Star, Heart, Filter } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useTheme } from '../context/ThemeContext';
import { db } from '../config/firebase';
import { ref, onValue } from 'firebase/database';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';

const Fashion = ({ onBack, products, onProductClick }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [bannerImages, setBannerImages] = useState({});

  const categories = ['Semua', 'Pria', 'Wanita', 'Hijab', 'Sepatu', 'Aksesoris'];

  // Fetch Banner Realtime
  useEffect(() => {
    const bannersRef = ref(db, 'admin/banners');
    const unsubscribe = onValue(bannersRef, (snapshot) => {
      if (snapshot.exists()) setBannerImages(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // Banner Fashion (Dinamis: Database > Lokal)
  const banners = [
    { id: 1, image: bannerImages.fashion_hero || 'https://via.placeholder.com/800x400?text=Fashion+Hero', title: 'Koleksi Musim Panas', desc: 'Diskon hingga 50% untuk item terpilih' },
    { id: 2, image: bannerImages.fashion_promo_1 || 'https://via.placeholder.com/800x400?text=Promo+Pria', title: 'Gaya Kasual Pria', desc: 'Tampil keren setiap hari' },
    { id: 3, image: bannerImages.fashion_promo_2 || 'https://via.placeholder.com/800x400?text=Promo+Hijab', title: 'Hijab Modern', desc: "Anggun dan syar'i" },
  ];

  // Filter Produk Kategori 'Fashion' dari Firebase
  const fashionItems = products ? products.filter(p => 
    p.category === 'Fashion' && (activeCategory === 'Semua' || p.subCategory === activeCategory)
  ) : [];

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header Sticky */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Fashion Terkini</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tampil kece tiap hari tanpa bikin kantong kering.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        {/* Highlight Carousel */}
        <section className="rounded-2xl overflow-hidden shadow-md">
           <Swiper
            modules={[Autoplay, Pagination]}
            spaceBetween={16}
            slidesPerView={1}
            loop={banners.length > 1}
            speed={1000}
            autoplay={{ delay: 3500, disableOnInteraction: false }}
            grabCursor={true}
            pagination={{ clickable: true }}
            className="w-full aspect-[3/1] rounded-2xl shadow-md overflow-hidden"
          >
            {banners.map((banner) => (
              <SwiperSlide key={banner.id} className="relative w-full h-full">
                <img src={banner.image} alt="Fashion Banner" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-6">
                  <div className="text-white">
                    <h2 className="text-2xl font-bold mb-1">{banner.title}</h2>
                    <p className="text-sm opacity-90">{banner.desc}</p>
                  </div>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </section>

        {/* Kategori Fashion */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Kategori Pilihan</h2>
            <button className={`p-2 transition-colors ${isDarkMode ? 'text-gray-400 hover:text-sky-400' : 'text-gray-500 hover:text-sky-600'}`}><Filter size={20} /></button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${
                  activeCategory === cat
                    ? (isDarkMode ? 'bg-sky-500 text-white border-sky-500 shadow-md' : 'bg-sky-600 text-white border-sky-600 shadow-md')
                    : (isDarkMode ? 'bg-slate-800 text-gray-300 border-slate-700 hover:border-sky-400' : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300')
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Product Grid (5 Columns Desktop) */}
        <section>
          {fashionItems.length === 0 ? (
            <div className={`text-center py-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Belum ada produk fashion.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {fashionItems.map((product) => (
                <div 
                  key={product.id} 
                  onClick={() => onProductClick(product)}
                  className={`rounded-lg border overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
                >
                  {/* Image Aspect Ratio 3:4 (Portrait) */}
                  <div className={`relative aspect-[3/4] overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                    <img 
                      src={product.mediaUrl || 'https://via.placeholder.com/150'} 
                      alt={product.name} 
                      className="absolute inset-0 w-full h-full object-cover" 
                    />
                    
                    {/* Wishlist Button (Slide in on hover) */}
                    <button className={`absolute top-2 right-2 p-2 backdrop-blur-sm rounded-full transition-all translate-x-10 group-hover:translate-x-0 ${isDarkMode ? 'bg-slate-900/80 text-gray-400 hover:text-red-400 hover:bg-slate-900' : 'bg-white/80 text-gray-400 hover:text-red-500 hover:bg-white'}`}>
                      <Heart size={16} />
                    </button>
                  </div>

                  {/* Info Section */}
                  <div className="p-3">
                    <div className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{product.storeName || 'Toko'}</div>
                    <h3 className={`text-sm font-bold line-clamp-1 mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{product.name}</h3>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`font-price text-sm font-bold tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {(parseInt(product.price) || 0).toLocaleString('id-ID')}</span>
                    </div>

                    {/* Rating */}
                    <div className={`flex items-center gap-1 mt-2 text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <Star size={10} className="text-yellow-400 fill-yellow-400" />
                      <span>5.0</span>
                      <span>(0)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Fashion;