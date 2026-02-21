import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { ref, onValue } from 'firebase/database';
import AuthForm from '../components/AuthForm';

const Login = ({ onLogin }) => {
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
            <AuthForm />
        </div>
      </div>
    </div>
  );
};

export default Login;