import React, { useState } from 'react';
import { ArrowLeft, Search, Star, ShieldCheck, Sparkles, Zap, Sun, Droplets } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const SkinCare = ({ onBack, products, onProductClick }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [activeSkinType, setActiveSkinType] = useState('Semua');
  const [activeSubCategory, setActiveSubCategory] = useState('Semua');

  // Filter Masalah Kulit (Fitur Khusus)
  const skinTypes = [
    { id: 'Semua', label: 'Semua', icon: <Sparkles size={16} /> },
    { id: 'Berjerawat', label: 'Berjerawat', icon: <Zap size={16} /> },
    { id: 'Kusam', label: 'Kusam', icon: <Sun size={16} /> },
    { id: 'Kering', label: 'Kering', icon: <Droplets size={16} /> },
    { id: 'Berminyak', label: 'Berminyak', icon: <Sparkles size={16} /> },
    { id: 'Sensitif / Lainnya', label: 'Sensitif', icon: <ShieldCheck size={16} /> },
  ];

  const subCategories = ['Semua', 'Face Wash / Sabun', 'Serum / Essence', 'Moisturizer / Cream', 'Sunscreen', 'Kosmetik / Makeup'];

  // Filter Produk Kategori 'Skin Care' dari Firebase
  const skincareItems = products ? products.filter(p => 
    p.category === 'Skin Care' && 
    (activeSkinType === 'Semua' || p.skinProblem === activeSkinType) &&
    (activeSubCategory === 'Semua' || p.subCategory === activeSubCategory)
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
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Pusat Kecantikan</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Cari skincare yang cocok buat kulitmu.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-8">
        {/* Jenis Produk Filter */}
        <section>
          <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Jenis Produk</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {subCategories.map((sub, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSubCategory(sub)}
                className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${
                  activeSubCategory === sub
                    ? (isDarkMode ? 'bg-sky-500 text-white border-sky-500 shadow-md' : 'bg-sky-600 text-white border-sky-600 shadow-md')
                    : (isDarkMode ? 'bg-slate-800 text-gray-300 border-slate-700 hover:border-sky-400' : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300')
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </section>

        {/* Filter Masalah Kulit */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Berdasarkan Masalah Kulit</h2>
            <button className="text-sm text-sky-600 font-medium hover:underline">Lihat Semua</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {skinTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setActiveSkinType(type.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                  activeSkinType === type.id
                    ? (isDarkMode ? 'bg-sky-500 text-white shadow-lg shadow-sky-900/50' : 'bg-sky-500 text-white shadow-lg shadow-sky-200')
                    : (isDarkMode ? 'bg-slate-800 text-gray-300 border border-slate-700 hover:bg-slate-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-sky-50 hover:border-sky-200')
                }`}
              >
                {type.icon}
                {type.label}
              </button>
            ))}
          </div>
        </section>

        {/* Product Grid Presisi */}
        <section>
          <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Rekomendasi Skincare</h2>
          {skincareItems.length === 0 ? (
            <div className={`text-center py-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Belum ada produk Skin Care.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {skincareItems.map((product) => (
                <div 
                  key={product.id} 
                  onClick={() => onProductClick(product)}
                  className={`rounded-xl border overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-300 cursor-pointer group ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
                >
                  {/* Image Section */}
                  <div className={`relative aspect-square ${isDarkMode ? 'bg-white' : 'bg-white'}`}>
                    <img 
                      src={product.mediaUrl || 'https://via.placeholder.com/150'} 
                      alt={product.name} 
                      className="w-full h-full object-cover mix-blend-multiply" 
                    />
                    
                    {/* Tag Original */}
                    <div className="absolute top-2 left-2 bg-green-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                      <ShieldCheck size={10} /> Original 100%
                    </div>
                  </div>

                  {/* Info Section */}
                  <div className="p-3">
                    <div className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{product.storeName || 'Toko'}</div>
                    <h3 className={`text-sm font-bold line-clamp-2 mb-1 leading-snug h-10 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      {product.name}
                    </h3>
                    <div className={`text-xs mb-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Stok: {product.stock}</div>
                    
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <p className={`font-price text-sm font-bold tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {(parseInt(product.price) || 0).toLocaleString('id-ID')}</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-1 text-[10px] border-t pt-2 ${isDarkMode ? 'text-gray-400 border-slate-700' : 'text-gray-500 border-gray-50'}`}>
                      <Star size={10} className="text-yellow-400 fill-yellow-400" />
                      <span className={`font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>5.0</span>
                      <span>•</span>
                      <span>Terjual 0</span>
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

export default SkinCare;