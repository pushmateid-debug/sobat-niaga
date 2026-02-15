import React, { useState } from 'react';
import { ArrowLeft, Search, Star, Plus, MapPin, Clock, Utensils, Coffee, Pizza, Soup } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const FoodOrder = ({ onBack, products, onProductClick }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [activeCategory, setActiveCategory] = useState('Semua');

  const categories = [
    { name: 'Semua', icon: <Utensils size={18} /> },
    { name: 'Ayam', icon: <Utensils size={18} /> },
    { name: 'Minuman', icon: <Coffee size={18} /> },
    { name: 'Snack', icon: <Pizza size={18} /> },
    { name: 'Mie', icon: <Soup size={18} /> },
  ];

  // Filter Produk Kategori 'Makan' dari Firebase
  const foodItems = products ? products.filter(p => 
    p.category === 'Makan' && (activeCategory === 'Semua' || p.subCategory === activeCategory)
  ) : [];

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header Sticky */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-indigo-400' : 'text-gray-600 hover:text-indigo-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Makan Hemat</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Lokasi: Kampus Pusat</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 lg:p-6">
        {/* Filter Kategori (Horizontal Scroll) */}
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide mb-2">
            {categories.map((cat) => (
                <button
                    key={cat.name}
                    onClick={() => setActiveCategory(cat.name)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                        activeCategory === cat.name
                        ? (isDarkMode ? 'bg-indigo-500 text-white shadow-md' : 'bg-indigo-600 text-white shadow-md')
                        : (isDarkMode ? 'bg-slate-800 text-gray-300 border border-slate-700 hover:bg-slate-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50')
                    }`}
                >
                    {cat.icon}
                    {cat.name}
                </button>
            ))}
        </div>

        {/* Promo Section */}
        <div className="mb-6">
            <h2 className={`text-lg font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Promo Terdekat 🔥</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg cursor-pointer hover:scale-[1.02] transition-transform">
                    <div>
                        <h3 className="text-xl font-bold">Diskon 50%</h3>
                        <p className="text-sm opacity-90">Khusus pengguna baru</p>
                        <button className="mt-2 bg-white text-red-500 px-3 py-1 rounded-full text-xs font-bold">Klaim</button>
                    </div>
                    <div className="text-4xl">🍔</div>
                </div>
                 <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg hidden md:flex cursor-pointer hover:scale-[1.02] transition-transform">
                    <div>
                        <h3 className="text-xl font-bold">Gratis Ongkir</h3>
                        <p className="text-sm opacity-90">Min. belanja 20rb</p>
                        <button className="mt-2 bg-white text-indigo-500 px-3 py-1 rounded-full text-xs font-bold">Cek</button>
                    </div>
                    <div className="text-4xl">🛵</div>
                </div>
            </div>
        </div>

        {/* Food Grid */}
        <h2 className={`text-lg font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Rekomendasi Buat Kamu</h2>
        {foodItems.length === 0 ? (
          <div className={`text-center py-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Belum ada menu makanan tersedia.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {foodItems.map((item) => (
                  <div key={item.id} onClick={() => onProductClick(item)} className={`rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all group cursor-pointer ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                      <div className={`relative aspect-square ${isDarkMode ? 'bg-slate-700' : ''}`}>
                          <img src={item.mediaUrl || 'https://via.placeholder.com/150'} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className={`absolute top-2 left-2 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm ${isDarkMode ? 'bg-slate-900/80 text-gray-200' : 'bg-white/90 text-gray-800'}`}>
                              <Star size={10} className="text-yellow-400 fill-yellow-400" /> 4.8
                          </div>
                          <div className={`absolute top-2 right-2 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm ${isDarkMode ? 'bg-slate-900/80 text-gray-300' : 'bg-white/90 text-gray-600'}`}>
                              <Clock size={10} /> 15 min
                          </div>
                      </div>
                      <div className="p-3">
                          <h3 className={`font-bold text-sm line-clamp-1 mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{item.name}</h3>
                          <div className={`flex items-center gap-1 text-xs mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              <MapPin size={12} /> {item.storeName || 'Kantin'}
                          </div>
                          <div className="flex items-center justify-between">
                              <div>
                                  <p className={`font-price text-sm font-bold tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {parseInt(item.price).toLocaleString('id-ID')}</p>
                              </div>
                              <button className={`p-1.5 rounded-lg transition-colors shadow-sm ${isDarkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-600 hover:text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'}`}>
                                  <Plus size={16} />
                              </button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FoodOrder;