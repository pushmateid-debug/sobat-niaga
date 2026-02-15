import React from 'react';
import { Star } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ProductCard = ({ product, onClick, className }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  return (
    <div 
      onClick={onClick} 
      className={`rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group ${className} ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
    >
      <div className={`relative aspect-square overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
        <img 
          src={product.image} 
          alt={product.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
        />
      </div>
      <div className="p-3">
        <h3 className={`text-sm font-bold line-clamp-2 mb-1 h-10 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{product.name}</h3>
        <p className={`font-price text-sm font-bold tracking-wide mb-2 ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{product.price}</p>
        <div className={`flex items-center gap-1 text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <Star size={12} className="text-yellow-400 fill-yellow-400" />
          <span>{product.rating || '4.8'}</span>
          <span className="mx-1">•</span>
          <span>Terjual {product.sold || '0'}</span>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;