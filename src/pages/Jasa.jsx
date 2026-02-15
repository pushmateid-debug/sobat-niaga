import React from 'react';
import { ArrowLeft, Wrench, Star, Clock } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const Jasa = ({ onBack, products = [], onProductClick }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  // Filter Produk Kategori 'Jasa' dari Database
  const jasaItems = products.filter(p => p.category === 'Jasa');

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header Biru Muda - Konsisten */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-sky-100'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Layanan Jasa Mahasiswa</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Solusi praktis untuk kebutuhan kuliahmu.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        {/* Grid Jasa */}
        {jasaItems.length === 0 ? (
            <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Wrench size={48} className={`mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`}/>
                <p>Belum ada layanan jasa tersedia.</p>
                <p className="text-xs mt-2">Jadilah yang pertama membuka jasa di sini!</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {jasaItems.map((item) => (
                <div
                    key={item.id}
                    onClick={() => onProductClick(item)}
                    className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
                >
                    <div className={`relative h-48 overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <img src={item.mediaUrl || 'https://via.placeholder.com/300'} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className={`absolute top-2 right-2 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-slate-900/80 text-gray-200' : 'bg-white/90 text-gray-800'}`}>
                            <Star size={12} className="text-yellow-500 fill-yellow-500"/> {item.rating || '5.0'}
                        </div>
                    </div>
                    <div className="p-4">
                        <h3 className={`text-lg font-bold mb-1 line-clamp-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{item.name}</h3>
                        <p className={`text-sm mb-3 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.description}</p>
                        
                        {/* Estimasi Pengerjaan (Pengganti Stok) */}
                        {item.estimation ? (
                            <div className={`flex items-center gap-1 text-xs font-bold mb-3 w-fit px-2 py-1 rounded-md ${isDarkMode ? 'bg-orange-900/30 text-orange-300' : 'bg-orange-50 text-orange-600'}`}>
                                <Clock size={12} /> Estimasi: {item.estimation}
                            </div>
                        ) : (
                             <div className={`flex items-center gap-1 text-xs mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                <Clock size={12} /> Estimasi: -
                            </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                            <div>
                                <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Mulai dari</p>
                                <p className={`font-price font-bold text-lg ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {parseInt(item.price).toLocaleString('id-ID')}</p>
                            </div>
                            <button className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isDarkMode ? 'bg-sky-900/50 text-sky-300 hover:bg-sky-800' : 'bg-sky-100 text-sky-600 hover:bg-sky-200'}`}>
                                Pesan
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

export default Jasa;