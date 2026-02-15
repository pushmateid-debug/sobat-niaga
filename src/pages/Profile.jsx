import React, { useState, useEffect } from 'react';
import { ArrowLeft, Camera, Save, User, Mail, Phone, AtSign, Loader2, ShoppingBag, Moon, Sun, Wallet, PlusCircle } from 'lucide-react';
import { auth, db, storage } from '../config/firebase';
import { updateProfile } from 'firebase/auth';
import { ref as dbRef, set, get, update } from 'firebase/database';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext'; // Import Context

const Profile = ({ user, onBack, onUpdateUser, onViewHistory }) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [imageFile, setImageFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saldo, setSaldo] = useState(0); // State untuk saldo
  const { theme, toggleTheme } = useTheme(); // Pakai Theme Context
  const isDarkMode = theme === 'dark'; // Helper variable biar kodingan lebih bersih

  // Load data tambahan dari Realtime Database
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid) {
        try {
          const snapshot = await get(dbRef(db, `users/${user.uid}`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.username) setUsername(data.username);
            if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
            if (data.saldo) setSaldo(data.saldo); // Ambil data saldo
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
    };
    fetchUserData();
  }, [user]);

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPhotoURL(URL.createObjectURL(file)); // Preview lokal
    }
  };

  // Helper: Generate Signature untuk Cloudinary (SHA-1)
  const generateSignature = async (params, apiSecret) => {
    const sortedKeys = Object.keys(params).sort();
    const stringToSign = sortedKeys.map(key => `${key}=${params[key]}`).join('&') + apiSecret;
    const msgBuffer = new TextEncoder().encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Fungsi Upload ke Cloudinary
  const uploadToCloudinary = async (file) => {
    const cloudName = 'djqnnguli';
    const apiKey = '156244598362341';
    const apiSecret = 'INGJr-KgmBPNwqwBYFZy9w7Fa18';

    // Debugging: Cek apakah variabel environment terbaca
    console.log("DEBUG CLOUDINARY (HARDCODED):", { cloudName, apiKey, apiSecret: apiSecret ? '***' : 'undefined' });

    const timestamp = Math.round((new Date()).getTime() / 1000);
    const params = {
      folder: 'sobatniaga/profiles',
      timestamp: timestamp,
    };

    const signature = await generateSignature(params, apiSecret);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'sobatniaga/profiles');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');

    // Optimization: Auto-crop (Face detection) & Auto-quality
    // Inject parameter transformasi ke URL
    return data.secure_url.replace('/upload/', '/upload/c_fill,g_face,w_500,h_500,q_auto,f_auto/');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let newPhotoURL = user.photoURL;

      // 1. Upload Foto ke Cloudinary (jika ada perubahan)
      if (imageFile) {
        try {
          newPhotoURL = await uploadToCloudinary(imageFile);
        } catch (uploadErr) {
          throw new Error(`Gagal upload foto: ${uploadErr.message}`);
        }
      }

      // 2. Update Auth Profile (Nama & Foto di sistem Auth)
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: displayName,
          photoURL: newPhotoURL
        });
      }

      // 3. Simpan Data Lengkap ke Realtime Database
      // FIX: Sanitasi data agar tidak ada 'undefined' yang bikin error palsu
      const userData = {
        displayName: displayName || '',
        email: user.email || '',
        photoURL: newPhotoURL || '',
        username: username || '',
        phoneNumber: phoneNumber || '',
        updatedAt: new Date().toISOString()
      };

      try {
        await update(dbRef(db, `users/${user.uid}`), userData);
      } catch (dbError) {
        console.warn("Database permission denied (diabaikan agar UI tetap update):", dbError);
        // Kita lanjut aja, karena update foto & nama di Auth sudah berhasil
      }

      // 4. Update State di Home biar langsung berubah tanpa refresh
      const updatedUser = {
        ...user,
        displayName,
        photoURL: newPhotoURL,
      };
      
      onUpdateUser(updatedUser);
      
      // 5. Update Local State (Visual Feedback & Reset)
      setPhotoURL(newPhotoURL);
      setImageFile(null); // Reset input file biar gak upload ulang kalau klik simpan lagi
      
      Swal.fire({
        icon: 'success',
        title: 'Mantap!',
        text: 'Profil Kamu Makin Keren! 🥳',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Error saving profile:", error);
      
      let errorMsg = 'Waduh, koneksi lagi bermasalah nih';
      let iconType = 'error';

      if (error.message.includes('API key')) {
        errorMsg = '⚠️ Kabel Cloudinary Putus, Bro! Cek API Key.';
        iconType = 'warning';
      }

      Swal.fire({
        icon: iconType,
        title: 'Gagal!',
        text: errorMsg,
        confirmButtonColor: '#0284c7'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTopUpSaldo = () => {
    Swal.fire({
      title: 'Top Up Saldo',
      text: 'Untuk top up saldo, silakan hubungi Admin SobatNiaga melalui WhatsApp.',
      icon: 'info',
      confirmButtonText: 'Hubungi Admin',
    }).then((result) => { if (result.isConfirmed) window.open('https://wa.me/6289517587498', '_blank'); });
  };

  return (
    <div className="min-h-screen pb-20 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)' }}>
      {/* Header Biru Muda - Konsisten */}
      <div className={`shadow-sm sticky top-0 z-50 border-b transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Profil Saya</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 lg:p-8">
        <div className={`rounded-2xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          
          {/* Foto Profil Section */}
          <div className={`flex flex-col items-center justify-center p-8 bg-gradient-to-b ${isDarkMode ? 'from-slate-800 to-slate-900' : 'from-sky-50 to-white'}`}>
            <div className="relative group">
              <div className={`w-32 h-32 rounded-full border-4 shadow-md overflow-hidden ${isDarkMode ? 'border-slate-800 bg-slate-700' : 'border-white bg-gray-200'}`}>
                {photoURL ? (
                  <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    <User size={48} />
                  </div>
                )}
              </div>
              <label className={`absolute bottom-0 right-0 text-white p-2 rounded-full cursor-pointer transition-colors shadow-sm ${isDarkMode ? 'bg-sky-500 hover:bg-sky-600' : 'bg-sky-600 hover:bg-sky-700'}`}>
                <Camera size={18} />
                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
              </label>
            </div>
            <h2 className={`mt-4 text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{displayName || 'User SobatNiaga'}</h2>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user?.email}</p>
          </div>

          {/* Menu Tambahan */}
          <div className={`px-6 pt-4 space-y-3 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            {/* Saldo Card */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-600'}`}><Wallet size={20} /></div>
                <div>
                  <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Saldo SobatNiaga</p>
                  <p className={`text-lg font-bold font-price ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Rp {saldo.toLocaleString('id-ID')}</p>
                </div>
              </div>
              <button onClick={handleTopUpSaldo} className={`flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'bg-sky-500 text-white hover:bg-sky-600' : 'bg-sky-600 text-white hover:bg-sky-700'}`}>
                <PlusCircle size={14} /> Top Up
              </button>
            </div>
            {/* Tombol Dark Mode */}
            <button onClick={toggleTheme} className={`w-full py-3 mb-3 border rounded-xl flex items-center justify-between px-4 transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 hover:bg-slate-600' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <span className={`font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  {theme === 'dark' ? <Moon size={18} className="text-yellow-400"/> : <Sun size={18} className="text-orange-500"/>} 
                  Mode Tampilan
                </span>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${isDarkMode ? 'bg-slate-600 text-slate-200' : 'bg-gray-200 text-gray-700'}`}>
                  {theme === 'dark' ? 'Gelap' : 'Terang'}
                </span>
            </button>

            <button onClick={onViewHistory} className={`w-full py-3 border rounded-xl flex items-center justify-between px-4 transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 hover:bg-slate-600' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <span className={`font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}><ShoppingBag size={18} className={isDarkMode ? 'text-sky-400' : 'text-sky-600'}/> Riwayat Transaksi</span>
            </button>
          </div>

          {/* Form Edit Data */}
          <form onSubmit={handleSave} className={`p-6 space-y-6 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="space-y-2">
              <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}><User size={16} className={isDarkMode ? 'text-sky-400' : 'text-sky-600'} /> Nama Lengkap</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-900/20' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} placeholder="Nama Lengkap Anda" />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}><AtSign size={16} className={isDarkMode ? 'text-sky-400' : 'text-sky-600'} /> Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-900/20' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} placeholder="Buat username unik" />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}><Mail size={16} className="text-gray-400" /> Email</label>
              <input type="email" value={user?.email} disabled className={`w-full px-4 py-3 rounded-xl border cursor-not-allowed ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-gray-200 text-slate-500'}`} />
              <p className={`text-xs ml-1 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>*Email tidak dapat diubah karena terhubung dengan Google.</p>
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}><Phone size={16} className={isDarkMode ? 'text-sky-400' : 'text-sky-600'} /> Nomor HP</label>
              <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-900/20' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`} placeholder="08xx-xxxx-xxxx" />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading} className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${isLoading ? (isDarkMode ? 'bg-sky-800 cursor-wait' : 'bg-sky-400 cursor-wait') : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200')}`}>
                {isLoading ? <><Loader2 size={20} className="animate-spin" /> Menyimpan...</> : <><Save size={20} /> Simpan Perubahan</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;