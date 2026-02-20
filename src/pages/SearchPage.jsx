import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, X, Frown, TrendingUp, ArrowUpLeft } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const SearchPage = ({ onBack, products = [], onProductClick, onSearch }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      onSearch(query);
    }
  };

  // Trending (Empty Query) - Ambil 6 produk teratas sebagai contoh trending
  const trendingProducts = products.slice(0, 6);

  // Filter products based on the query
  const filteredProducts = query.trim() === ''
    ? [] // Don't show anything if input is empty
    : products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase())
      );

  return (
    <div className={`fixed inset-0 z-[101] flex flex-col transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Header */}
      <div className={`flex-none shadow-sm border-b ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className={`p-2 rounded-full transition-all active:scale-90 active:opacity-70 ${isDarkMode ? 'text-gray-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            <ArrowLeft size={24} />
          </button>
          <div className="relative flex-1">
            <Search size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cari produk atau jasa..."
              className={`w-full pl-11 pr-10 py-2.5 rounded-full border text-sm focus:outline-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:border-sky-500' : 'bg-gray-50 border-gray-200 focus:border-sky-500'}`}
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          
          {/* 1. Trending Section (Muncul pas belum ngetik) */}
          {query.trim() === '' && (
            <div className="p-4">
              <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Sering Diminati</h3>
              <div className="space-y-1">
                {trendingProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => onSearch(product.name)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-gray-200' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    <TrendingUp size={18} className="text-gray-400" />
                    <span className="flex-1 text-sm font-medium line-clamp-1">{product.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Search Suggestions (Muncul pas ngetik) */}
          {query.trim() !== '' && filteredProducts.length === 0 && (
            <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Frown size={48} className="mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-bold">Produk tidak ditemukan</h3>
              <p className="mt-1 text-sm">Coba kata kunci lain.</p>
            </div>
          )}

          {query.trim() !== '' && (
            <div className="py-2">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => onSearch(product.name)}
                  className={`flex items-center gap-3 px-4 py-3.5 border-b cursor-pointer transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-slate-800 text-gray-200' : 'border-gray-50 hover:bg-gray-50 text-gray-700'}`}
                >
                  <Search size={18} className="text-gray-400" />
                  {/* Highlight Text Logic */}
                  <span className="flex-1 text-sm font-medium line-clamp-1" dangerouslySetInnerHTML={{ 
                      __html: product.name.replace(/</g, "&lt;").replace(/>/g, "&gt;") // Sanitasi dasar XSS
                        .replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="font-bold text-sky-500">$1</span>') 
                  }} />
                  <div className="text-gray-300">
                      <ArrowUpLeft size={18} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchPage;