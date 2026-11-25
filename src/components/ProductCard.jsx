import React, { useState } from 'react';
import { Star, ImageOff } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ProductCard = ({ product, onClick, className }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [imageError, setImageError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div 
      onClick={onClick} 
      className={`rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group ${className || ''} ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
    >
      <div className={`relative aspect-square overflow-hidden flex items-center justify-center ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
        {!isLoaded && !imageError && (
          <div className="absolute inset-0 bg-gray-200/50 dark:bg-slate-700 animate-pulse pointer-events-none" />
        )}
        
        {imageError ? (
          <div className="flex flex-col items-center justify-center p-2 text-center text-gray-400">
            <ImageOff size={24} className="mb-1 opacity-60" />
            <span className="text-[10px]">Gambar offline</span>
          </div>
        ) : (
          <img 
            src={product.image} 
            alt={product.name || 'Produk'} 
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setImageError(true)}
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`} 
          />
        )}
      </div>
      <div className="p-3">
        <h3 className={`text-sm font-bold line-clamp-2 mb-1 h-10 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{product.name}</h3>
        <p className={`font-price text-sm font-black tracking-wide mb-2 ${isDarkMode ? 'text-[#FFD662]' : 'text-sky-600'}`}>{product.price}</p>
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
