import React, { useState } from 'react';
import { X, Loader2, Wallet } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Swal from 'sweetalert2';
import { dbFirestore as db } from '../config/firebase';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';

export const TopUpModal = ({ game, user, onClose }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [formData, setFormData] = useState({});
  const [selectedDenom, setSelectedDenom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    // Validasi
    for (const field of (game.fields || [])) {
      if (!formData[field] || formData[field].trim() === '') {
        Swal.fire('Data Tidak Lengkap', `Mohon isi ${field}.`, 'warning');
        return;
      }
    }
    if (!selectedDenom) {
      Swal.fire('Pilih Nominal', 'Mohon pilih nominal top up.', 'warning');
      return;
    }
    if ((user.saldo || 0) < selectedDenom.price) {
      Swal.fire('Saldo Tidak Cukup', 'Saldo Anda tidak mencukupi. Silakan top up dulu di menu Profil.', 'error');
      return;
    }

    setIsLoading(true);
    
    // --- SIMULASI LOGIKA BACKEND ---
    // Di aplikasi nyata, bagian ini akan memanggil API backend Anda.
    // Backend kemudian akan memanggil API VocaGame/Digiflazz.
    try {
      // 1. Panggil API (Simulasi)
      console.log('Mencoba top up:', { game: game.id, ...formData, item: selectedDenom.id });
      
      if (!db) {
        throw new Error("Database (db) is undefined. Cek export di firebase.js");
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Delay simulasi

      // 2. Jika API sukses, potong saldo user & catat transaksi
      const newSaldo = (user.saldo || 0) - selectedDenom.price;
      const userUpdate = { saldo: newSaldo };
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, userUpdate);

      const transactionData = {
        userId: user.uid,
        type: 'digital_purchase',
        product: `${game.name} - ${selectedDenom.label}`,
        amount: selectedDenom.price,
        status: 'completed',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'transactions'), transactionData);

      Swal.fire('Top Up Berhasil!', `${selectedDenom.label} untuk ${game.name} akan segera masuk.`, 'success');
      onClose();

    } catch (error) {
      console.error("Top up error:", error);
      Swal.fire('Error', 'Terjadi kesalahan saat memproses transaksi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const renderField = (field) => {
    switch(field) {
      case 'userId': return <input key={field} type="number" name="userId" onChange={handleInputChange} placeholder="Masukkan User ID" className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`} />;
      case 'zoneId': return <input key={field} type="number" name="zoneId" onChange={handleInputChange} placeholder="Masukkan Zone ID" className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`} />;
      case 'riotId': return <input key={field} type="text" name="riotId" onChange={handleInputChange} placeholder="Contoh: Nama#TAG" className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`} />;
      case 'server': return ( <select key={field} name="server" onChange={handleInputChange} className={`w-full px-4 py-3 rounded-xl border text-sm outline-none appearance-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`}><option value="">Pilih Server</option><option value="asia">Asia</option><option value="america">America</option><option value="europe">Europe</option></select> );
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <button onClick={onClose} className={`absolute top-4 right-4 p-1 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-100'}`}><X size={24} /></button>
        <div className="flex items-center gap-4 mb-6"><img src={game.logo} alt={game.name} className="w-16 h-16 rounded-lg" /><div><h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Top Up {game.name}</h3><p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Proses instan 24 jam.</p></div></div>
        <div className={`flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-rounded-full ${isDarkMode ? 'scrollbar-thumb-slate-600' : 'scrollbar-thumb-gray-300'}`}>
          <div className="space-y-2"><label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Lengkapi Data</label><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(game.fields || []).map(field => renderField(field))}</div></div>
          <div className="space-y-2"><label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Pilih Nominal</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{(game.denominations || []).map(denom => (<div key={denom.id} onClick={() => setSelectedDenom(denom)} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedDenom?.id === denom.id ? 'border-sky-500 bg-sky-500/10' : (isDarkMode ? 'border-slate-700 hover:border-slate-600' : 'border-gray-200 hover:border-gray-300')}`}><p className={`font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{denom.label}</p><p className={`text-sm font-bold font-price ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {denom.price.toLocaleString('id-ID')}</p></div>))}</div></div>
        </div>
        <div className={`mt-6 pt-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex justify-between items-center mb-4">
            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}><Wallet size={18} className="text-green-500" /><span>Saldo Anda:</span><span className="font-bold font-price">Rp {(user.saldo || 0).toLocaleString('id-ID')}</span></div>
            <div className="text-right"><p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Bayar</p><p className={`text-xl font-bold font-price ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{selectedDenom ? `Rp ${selectedDenom.price.toLocaleString('id-ID')}` : 'Rp 0'}</p></div>
          </div>
          <button onClick={handleSubmit} disabled={isLoading || !selectedDenom} className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${isLoading || !selectedDenom ? (isDarkMode ? 'bg-slate-700 text-gray-500 cursor-not-allowed' : 'bg-gray-300 cursor-not-allowed') : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200')}`}>{isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Beli Sekarang'}</button>
        </div>
      </div>
    </div>
  );
};

export default TopUpModal;