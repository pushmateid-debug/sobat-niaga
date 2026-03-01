import React, { useState } from 'react';
import { User, Mail, Lock, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set, serverTimestamp } from 'firebase/database';
import Swal from 'sweetalert2';

const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        // Login Logic
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
        Swal.fire({
          icon: 'success',
          title: 'Login Berhasil!',
          text: 'Selamat datang kembali.',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        // Register Logic
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;

        // Update Profile (Display Name)
        await updateProfile(user, { displayName: formData.username });

        // Save to Realtime DB
        await set(ref(db, `users/${user.uid}`), {
          email: user.email,
          displayName: formData.username,
          role: 'user',
          saldo: 0,
          createdAt: serverTimestamp()
        });

        Swal.fire({
          icon: 'success',
          title: 'Akun Berhasil Dibuat!',
          text: 'Silakan login.',
          timer: 1500,
          showConfirmButton: false
        });
        setIsLogin(true);
      }
    } catch (error) {
      console.error("Auth Error:", error);
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4 relative overflow-hidden">
      
      {/* Background Decoration (Glows) */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center z-10">
        
        {/* Left Column: Branding Text */}
        <div className="text-white space-y-6 text-center lg:text-left animate-in slide-in-from-left-10 duration-700 fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md w-fit mx-auto lg:mx-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <span className="text-xs font-medium tracking-wide text-gray-300">SobatNiaga System v2.0</span>
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-extrabold leading-tight tracking-tight">
            Hey, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Hello!</span>
          </h1>
          
          <p className="text-gray-400 text-lg max-w-lg mx-auto lg:mx-0 leading-relaxed">
            Selamat datang kembali! Kelola bisnismu dengan lebih efisien, pantau analitik real-time, dan nikmati kemudahan transaksi dalam satu platform.
          </p>

          <div className="flex items-center justify-center lg:justify-start gap-4 pt-4">
             <div className="flex -space-x-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-gray-700 flex items-center justify-center text-xs text-white font-bold">
                    U{i}
                  </div>
                ))}
             </div>
             <div className="text-sm text-gray-400">
               <span className="text-white font-bold">1.2k+</span> Pebisnis telah bergabung
             </div>
          </div>
        </div>

        {/* Right Column: Floating Auth Card */}
        <div className="flex justify-center lg:justify-end animate-in slide-in-from-right-10 duration-700 fade-in delay-100">
          <div className="relative w-full max-w-[450px] bg-slate-900 rounded-[2rem] shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] border border-white/10 overflow-hidden group">
            
            {/* Diagonal Split Background Effect */}
            <div className="absolute inset-0 bg-slate-900 z-0"></div>
            <div className="absolute top-0 right-0 w-[120%] h-full bg-gradient-to-bl from-purple-900/40 via-purple-900/10 to-transparent transform -skew-x-12 translate-x-20 z-0 pointer-events-none"></div>
            
            {/* Top Glow Line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50"></div>

            <div className="p-8 relative z-10">
              
              {/* Toggle Switch */}
              <div className="flex bg-slate-950/50 p-1 rounded-xl mb-8 border border-white/5">
                <button 
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${isLogin ? 'bg-slate-800 text-white shadow-lg shadow-purple-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Login
                </button>
                <button 
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${!isLogin ? 'bg-slate-800 text-white shadow-lg shadow-purple-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Sign Up
                </button>
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  {isLogin ? 'Welcome Back!' : 'Create Account'}
                </h2>
                <p className="text-sm text-gray-400">
                  {isLogin ? 'Masuk dengan akun yang sudah terdaftar.' : 'Isi data diri untuk mulai bergabung.'}
                </p>
              </div>

              {/* Form */}
              <form className="space-y-5" onSubmit={handleSubmit}>
                
                {!isLogin && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                    <label htmlFor="username" className="text-xs font-bold text-gray-400 ml-1">Username</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                      </div>
                      <input 
                        id="username"
                        name="username"
                        type="text" 
                        value={formData.username}
                        onChange={handleChange}
                        required={!isLogin}
                        placeholder="ex: sobatcuan" 
                        className="w-full bg-slate-950/50 border border-gray-700/50 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-bold text-gray-400 ml-1">Email Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                    </div>
                    <input 
                      id="email"
                      name="email"
                      type="email" 
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="name@example.com" 
                      className="w-full bg-slate-950/50 border border-gray-700/50 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-xs font-bold text-gray-400 ml-1">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                    </div>
                    <input 
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"} 
                      value={formData.password}
                      onChange={handleChange}
                      required
                      placeholder="••••••••" 
                      className="w-full bg-slate-950/50 border border-gray-700/50 rounded-xl py-3.5 pl-11 pr-12 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="flex justify-end">
                    <a href="#" className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors">Forgot Password?</a>
                  </div>
                )}

                <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-bold py-2.5 rounded-xl shadow-lg shadow-purple-900/30 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 group/btn disabled:opacity-70 disabled:cursor-not-allowed">
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : (isLogin ? 'Sign In' : 'Create Account')}
                  {!isLoading && <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />}
                </button>

              </form>
            </div>
            
            {/* Bottom Decorative Bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600"></div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AuthForm;