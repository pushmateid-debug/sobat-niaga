import React from 'react';
import { ArrowLeft, Frown } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import ProductCard from '../components/ProductCard';

const SearchResults = ({ onBack, products = [], query, onProductClick }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Filter products based on the query (case-insensitive, OR logic for multiple words)
  const searchTerms = query.toLowerCase().split(' ').filter(term => term);
  const filteredProducts = products.filter(p => {
    const productName = p.name.toLowerCase();
    // Return true if any of the search terms are included in the product name
    return searchTerms.some(term => productName.includes(term));
  });

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <div>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Hasil pencarian untuk:</p>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>"{query}"</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {filteredProducts.length === 0 ? (
          <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Frown size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-bold">Yah, produk tidak ditemukan</h3>
            <p className="mt-2">Coba gunakan kata kunci lain yang lebih umum.</p>
          </div>
        ) : (
          <>
            <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Menampilkan <strong>{filteredProducts.length}</strong> produk yang cocok.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={{
                    ...product,
                    image: product.mediaUrl || 'https://via.placeholder.com/150',
                    price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`
                  }}
                  className="product-card-home"
                  onClick={() => onProductClick(product)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SearchResults;