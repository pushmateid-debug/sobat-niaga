import React from 'react';
import { ArrowLeft, Star, Smartphone, Utensils, Sparkles, ShoppingBag, Wrench, Gamepad2, Bike, HeartHandshake } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const AllCategories = ({ onBack, onNavigate }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  const categories = [
    { id: 'populer', name: 'Populer', icon: <Star size={24} />, color: 'bg-orange-50 text-orange-600 border-orange-100', view: 'home' },
    { id: 'topup', name: 'Isi Pulsa', icon: <Smartphone size={24} />, color: 'bg-blue-50 text-blue-600 border-blue-100', view: 'topup' },
    { id: 'food', name: 'Niaga Food', icon: <Utensils size={24} />, color: 'bg-red-50 text-red-600 border-red-100', view: 'food' },
    { id: 'skincare', name: 'Skin Care', icon: <Sparkles size={24} />, color: 'bg-pink-50 text-pink-600 border-pink-100', view: 'skincare' },
    { id: 'fashion', name: 'Fashion', icon: <ShoppingBag size={24} />, color: 'bg-purple-50 text-purple-600 border-purple-100', view: 'fashion' },
    { id: 'jasa', name: 'Jasa', icon: <Wrench size={24} />, color: 'bg-indigo-50 text-indigo-600 border-indigo-100', view: 'jasa' },
    { id: 'game', name: 'Top Up Game', icon: <Gamepad2 size={24} />, color: 'bg-green-50 text-green-600 border-green-100', view: 'digital-center' },
    { id: 'niagago', name: 'NiagaGo', icon: <Bike size={24} />, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', view: 'niagago' },
    { id: 'sharing', name: 'Sobat Berbagi', icon: <HeartHandshake size={24} />, color: 'bg-orange-100 text-orange-700 border-orange-200', view: 'sobat-berbagi' },
  ];

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header Sticky */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button 
            onClick={onBack} 
            className={`p-2 rounded-full transition-all active:scale-90 ${isDarkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-slate-600'}`}
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Semua Kategori</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 md:p-10">
        {/* Category Grid - 3 Columns on Mobile, 5 on Desktop */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-6 md:gap-8">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                if (cat.id === 'populer') onBack();
                else onNavigate(cat.view);
              }}
              className="flex flex-col items-center gap-3 group animate-in fade-in zoom-in duration-300"
            >
              <div 
                className={`
                  w-16 h-16 md:w-20 md:h-20 rounded-[2rem] border-2 flex items-center justify-center transition-all 
                  shadow-sm group-hover:shadow-lg group-hover:scale-110 group-active:scale-95
                  ${isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-sky-400 group-hover:border-sky-500' 
                    : `${cat.color} group-hover:border-transparent`}
                `}
              >
                {cat.icon}
              </div>
              <span className={`
                text-[11px] md:text-sm font-bold text-center leading-tight 
                ${isDarkMode ? 'text-gray-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'}
              `}>
                {cat.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AllCategories;