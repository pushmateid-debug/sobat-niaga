import React, { useState, useEffect } from 'react';
import { Mail, Lock, Facebook } from 'lucide-react';
import { auth, googleProvider, db } from '../config/firebase';
import { signInWithPopup } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';

const Login = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    // Update path ke admin/banners/login_logo agar sinkron dengan Admin Dashboard
    const logoRef = ref(db, 'admin/banners/login_logo');
    onValue(logoRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setLogoUrl(typeof data === 'object' ? data.url : data);
      }
    });
  }, []);

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      onLogin(user);
    } catch (error) {
      // Cek error code biar gak muncul alert kalau cuma dicancel
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log("Login dibatalkan oleh user.");
      } else {
        console.error("Error login Google:", error);
        alert("Gagal login: " + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 via-indigo-600 to-blue-100 relative overflow-hidden p-4 lg:p-0">
      
      {/* Elemen Dekoratif Abstrak (Background) */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-white/10 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-indigo-500/30 blur-3xl"></div>

      {/* Content Container */}
      <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-between px-4 lg:px-12 relative z-10">
        
        {/* Left Side - Branding (Hidden on mobile or adjusted) */}
        <div className="hidden lg:flex flex-col justify-center w-full lg:w-1/2 text-white mb-10 lg:mb-0 pr-10">
            <div className="mb-12">
                {logoUrl ? (
                  <img src={logoUrl} alt="SobatNiaga Logo" className="w-[240px] h-auto max-w-full object-contain object-left mb-4" />
                ) : (
                  <h1 className="text-3xl font-extrabold tracking-tight">SobatNiaga</h1>
                )}
            </div>
            <div>
                <h2 className="text-5xl font-bold mb-6 leading-tight">Hey, Hello!</h2>
                <p className="text-lg text-indigo-100 max-w-md leading-relaxed">
                    Masuk sekarang dan nikmati kemudahan transaksi di ekosistem SobatNiaga.
                </p>
            </div>
        </div>

        {/* Right Side - Login Form Card */}
        <div className="w-full lg:w-1/2 flex justify-center lg:justify-end">
            {/* Kartu Putih Floating */}
            <div className="w-full max-w-[400px] bg-white rounded-3xl p-8 shadow-2xl border border-white/20 relative">
            
            <div className="text-center mb-8 lg:text-left">
                <h3 className="text-2xl font-bold text-gray-800">Login Akun</h3>
                <p className="text-gray-500 text-sm mt-1">Silakan masuk untuk melanjutkan.</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); onLogin({ displayName: 'Pengguna Demo' }); }} className="space-y-5">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Username / Email</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Mail size={20} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input 
                            type="text" 
                            name="username"
                            id="username"
                            placeholder="Masukkan username anda" 
                            className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all placeholder-gray-400 text-gray-800 bg-gray-50/50 focus:bg-white"
                            autoComplete="username"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Password</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Lock size={20} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input 
                            type="password" 
                            name="password"
                            id="password"
                            placeholder="Masukkan password" 
                            className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all placeholder-gray-400 text-gray-800 bg-gray-50/50 focus:bg-white"
                            autoComplete="current-password"
                        />
                    </div>
                    <div className="flex justify-end">
                        <button type="button" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline">Lupa Password?</button>
                    </div>
                </div>

                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-2xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all transform active:scale-[0.98]">
                    Masuk Sekarang
                </button>
            </form>

            <div className="mt-8">
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="px-3 bg-white text-gray-400 font-bold tracking-wider">Atau masuk dengan</span>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button 
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className={`flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-bold text-gray-600 text-sm ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Google
                            </>
                        )}
                    </button>
                    <button className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all font-bold text-gray-600 text-sm">
                        <Facebook size={20} className="text-blue-600" />
                        Facebook
                    </button>
                </div>
            </div>

            <p className="mt-8 text-center text-sm text-gray-500">
                Belum punya akun? <a href="#" className="font-bold text-indigo-600 hover:underline">Daftar Sekarang</a>
            </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Login;