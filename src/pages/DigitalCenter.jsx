import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Gamepad2, Loader2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { db } from '../config/firebase';
import { ref, onValue } from 'firebase/database';

const DigitalCenter = ({ onBack, onGameSelect }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Produk Kategori 'Game' dari Firebase
  useEffect(() => {
    const productsRef = ref(db, 'products');
    const unsubscribe = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      const loadedProducts = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      // Filter hanya kategori Game dan Aktif
      setProducts(loadedProducts.filter(p => p.category === 'Game' && p.isActive !== false));
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.subCategory && p.subCategory.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Top Up Game & Digital</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Cepat, aman, dan terpercaya.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {/* Search Bar */}
        <div className="relative mb-6">
          <Search size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari game favoritmu..."
            className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm focus:outline-none transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`}
          />
        </div>

        {/* Game Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={40} className="animate-spin text-sky-600" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Gamepad2 size={48} className="mx-auto mb-3 opacity-50" />
            <p>Belum ada produk game tersedia.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredProducts.map(product => (
              <div 
                key={product.id}
                onClick={() => onGameSelect({ ...product, fields: product.inputFields })} // Pass fields dari DB
                className={`rounded-xl border p-3 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:border-sky-500' : 'bg-white border-gray-100 hover:border-sky-200'}`}
              >
                <div className={`w-full aspect-square rounded-lg overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <img src={product.mediaUrl || 'https://via.placeholder.com/150'} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div className="text-center w-full">
                  <p className={`text-sm font-bold line-clamp-2 leading-tight ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{product.name}</p>
                  <p className={`text-xs mt-1 font-bold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {parseInt(product.price).toLocaleString('id-ID')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
  );
};

export default DigitalCenter;