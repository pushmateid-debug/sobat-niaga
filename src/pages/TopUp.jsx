import React, { useState, useEffect } from 'react';
import { ArrowLeft, Smartphone, Globe } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const TopUp = ({ onBack }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [phoneNumber, setPhoneNumber] = useState('');
  const [operator, setOperator] = useState(null);
  const [activeTab, setActiveTab] = useState('pulsa'); // 'pulsa' | 'data'
  const [selectedItem, setSelectedItem] = useState(null);

  // Logika Cerdas: Auto-Detect Operator
  useEffect(() => {
    if (phoneNumber.length >= 4) {
      const prefix = phoneNumber.substring(0, 4);
      if (/^08(11|12|13|21|22|52|53|23)/.test(prefix)) setOperator('Telkomsel');
      else if (/^08(14|15|16|55|56|57|58)/.test(prefix)) setOperator('Indosat');
      else if (/^08(17|18|19|59|77|78)/.test(prefix)) setOperator('XL');
      else if (/^08(95|96|97|98|99)/.test(prefix)) setOperator('Tri');
      else if (/^08(81|82|83|84|85|86|87|88|89)/.test(prefix)) setOperator('Smartfren');
      else setOperator(null);
    } else {
      setOperator(null);
    }
  }, [phoneNumber]);

  // Data Dummy Harga
  const pulsaOptions = [
    { id: 1, nominal: '5.000', price: '6.500' },
    { id: 2, nominal: '10.000', price: '11.200' },
    { id: 3, nominal: '20.000', price: '21.000' },
    { id: 4, nominal: '50.000', price: '49.500', promo: true },
    { id: 5, nominal: '100.000', price: '98.000', promo: true },
  ];

  const dataOptions = [
    { id: 1, name: '1GB / 3 Hari', price: '15.000' },
    { id: 2, name: '3GB / 7 Hari', price: '25.000' },
    { id: 3, name: '10GB / 30 Hari', price: '45.000' },
    { id: 4, name: '25GB / 30 Hari', price: '80.000' },
  ];

  const options = activeTab === 'pulsa' ? pulsaOptions : dataOptions;

  return (
    <div className={`min-h-screen pb-24 lg:pb-10 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-indigo-100'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-indigo-400' : 'text-gray-600 hover:text-indigo-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <h1 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Isi Pulsa & Paket Data</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sisi Kiri: Input & Summary (Desktop) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Input Nomor Telepon */}
            <div className={`p-6 rounded-2xl shadow-sm border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
              <label className={`text-sm font-bold mb-2 block ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nomor Telepon</label>
              <div className="relative flex items-center">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, ''); // Cuma boleh angka
                    setPhoneNumber(val);
                  }}
                  placeholder="08xx-xxxx-xxxx"
                  className={`w-full text-xl font-bold border-b-2 outline-none py-2 pr-24 bg-transparent transition-colors ${isDarkMode ? 'text-gray-100 border-slate-600 focus:border-indigo-500' : 'text-gray-800 border-gray-200 focus:border-indigo-600'}`}
                />
                {operator && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold text-white bg-indigo-600 px-3 py-1 rounded-full shadow-sm animate-pulse">
                    {operator}
                  </span>
                )}
              </div>
            </div>

            {/* Desktop Sticky Summary */}
            <div className={`hidden lg:block p-6 rounded-2xl shadow-sm border sticky top-24 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
              <h3 className={`font-bold mb-4 text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Ringkasan Pesanan</h3>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Operator</span>
                  <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{operator || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Produk</span>
                  <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    {selectedItem ? (activeTab === 'pulsa' ? `Pulsa ${selectedItem.nominal}` : selectedItem.name) : '-'}
                  </span>
                </div>
                <div className={`border-t pt-3 flex justify-between items-center ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                  <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Total Bayar</span>
                  <span className={`font-price font-bold text-xl tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{selectedItem ? `Rp ${selectedItem.price}` : '-'}</span>
                </div>
              </div>
              <button
                disabled={!selectedItem || phoneNumber.length < 10}
                className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
                  selectedItem && phoneNumber.length >= 10
                    ? (isDarkMode ? 'bg-indigo-500 hover:bg-indigo-600 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200')
                    : (isDarkMode ? 'bg-slate-700 cursor-not-allowed shadow-none text-gray-500' : 'bg-gray-300 cursor-not-allowed shadow-none')
                }`}
              >
                Beli Sekarang
              </button>
            </div>
          </div>

          {/* Sisi Kanan: Tab & Grid */}
          <div className="lg:col-span-8">
            {/* Pilihan Tab */}
            <div className={`flex gap-2 mb-6 p-1.5 rounded-xl border shadow-sm transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
              <button
                onClick={() => { setActiveTab('pulsa'); setSelectedItem(null); }}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'pulsa' ? (isDarkMode ? 'bg-indigo-900/50 text-indigo-300 shadow-sm ring-1 ring-indigo-500/50' : 'bg-indigo-100 text-indigo-600 shadow-sm ring-1 ring-indigo-200') : (isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')
                }`}
              >
                <Smartphone size={18} /> Pulsa
              </button>
              <button
                onClick={() => { setActiveTab('data'); setSelectedItem(null); }}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'data' ? (isDarkMode ? 'bg-indigo-900/50 text-indigo-300 shadow-sm ring-1 ring-indigo-500/50' : 'bg-indigo-100 text-indigo-600 shadow-sm ring-1 ring-indigo-200') : (isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')
                }`}
              >
                <Globe size={18} /> Paket Data
              </button>
            </div>

            {/* Grid Pilihan Harga */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {options.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden group ${
                    selectedItem?.id === item.id
                      ? (isDarkMode ? 'border-indigo-500 bg-indigo-900/30 shadow-md' : 'border-indigo-600 bg-indigo-100 shadow-md')
                      : (isDarkMode ? 'border-transparent bg-slate-800 shadow-sm hover:border-slate-600' : 'border-transparent bg-white shadow-sm hover:border-indigo-200 hover:shadow-md')
                  }`}
                >
                  <h3 className={`font-bold mb-1 text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                    {activeTab === 'pulsa' ? item.nominal : item.name}
                  </h3>
                  <p className={`font-price text-sm font-bold tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {item.price}</p>
                  {item.promo && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold shadow-sm">
                      Promo
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar (Mobile Only) */}
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 border-t p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Bayar</p>
            <p className={`font-price text-lg font-bold tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{selectedItem ? `Rp ${selectedItem.price}` : '-'}</p>
          </div>
          <button
            disabled={!selectedItem || phoneNumber.length < 10}
            className={`px-6 py-3 rounded-full font-bold text-white transition-all ${
              selectedItem && phoneNumber.length >= 10
                ? (isDarkMode ? 'bg-indigo-500 hover:bg-indigo-600 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200')
                : (isDarkMode ? 'bg-slate-700 cursor-not-allowed text-gray-500' : 'bg-gray-300 cursor-not-allowed shadow-none')
            }`}
          >
            Beli Sekarang
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopUp;