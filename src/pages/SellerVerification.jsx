import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { Loader2 } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, set } from 'firebase/database';
import { useTheme } from '../context/ThemeContext';

const SellerVerification = ({ user, onVerificationSuccess }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // Validasi form (sederhana)
    if (!storeName || !storeAddress || !bankName || !bankAccountNumber) {
      Swal.fire({
        icon: 'warning',
        title: 'Data Belum Lengkap',
        text: 'Mohon isi semua data toko dengan benar.',
        confirmButtonColor: '#0284c7',
      });
      setIsLoading(false);
      return;
    }

    try {
      // Simpan data seller ke Firebase Realtime Database
      const sellerData = {
        storeName,
        storeAddress,
        bankName,
        bankAccountNumber,
        isVerifiedSeller: true, // Tandai sudah verifikasi
      };

      await set(ref(db, `users/${user.uid}/sellerInfo`), sellerData);

      // Tampilkan SweetAlert2 notifikasi sukses
      Swal.fire({
        icon: 'success',
        title: 'Wih, Toko Lo Resmi Buka!',
        text: 'Selamat ber jualan di SobatNiaga!',
        timer: 2000,
        showConfirmButton: false,
      });

      // Callback ke parent (DashboardSeller) biar UI di-update
      onVerificationSuccess(sellerData);
    } catch (error) {
      console.error('Gagal menyimpan data seller:', error);
      Swal.fire({
        icon: 'error',
        title: 'Gagal Mendaftar',
        text: 'Terjadi kesalahan saat menyimpan data. Coba lagi nanti ya.',
        confirmButtonColor: '#0284c7',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl shadow-sm border p-6 space-y-6 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
      <h2 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Verifikasi Data Seller</h2>
      <form onSubmit={handleVerificationSubmit} className="space-y-4">
        <div>
          <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Nama Toko</label>
          <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} placeholder="Nama brand kamu" required />
        </div>
        <div>
          <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Alamat Toko</label>
          <textarea value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} placeholder="Alamat lengkap toko" rows="3" required></textarea>
        </div>
        <div>
          <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Nomor Rekening</label>
          <div className="flex gap-4">
            <select value={bankName} onChange={(e) => setBankName(e.target.value)} className={`flex-1 px-4 py-3 rounded-xl border outline-none transition-all appearance-none ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} required>
              <option value="">Pilih Bank</option>
              <option value="BCA">BCA</option>
              <option value="Mandiri">Mandiri</option>
              <option value="BRI">BRI</option>
            </select>
            <input type="number" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className={`flex-1 px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} placeholder="Nomor rekening" required />
          </div>
        </div>
        <button type="submit" disabled={isLoading} className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${isLoading ? (isDarkMode ? 'bg-sky-800 cursor-wait' : 'bg-sky-400 cursor-wait') : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200')}`}>
          {isLoading ? <><Loader2 size={20} className="animate-spin" /> Mendaftar...</> : 'Daftar Jadi Seller Sekarang'}
        </button>
      </form>
    </div>
  );
};

export default SellerVerification;