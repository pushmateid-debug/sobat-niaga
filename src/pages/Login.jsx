import React, { useState } from 'react';
import { auth, db } from '../config/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  updateProfile 
} from 'firebase/auth';
import { ref, set, get, serverTimestamp } from 'firebase/database';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';

const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Cek apakah user baru di Realtime Database
      const userRef = ref(db, `users/${user.uid}`);
      const snapshot = await get(userRef);
      
      if (!snapshot.exists()) {
        await set(userRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: 'user',
          saldo: 0,
          createdAt: serverTimestamp()
        });
      }
      
      Swal.fire({
        icon: 'success',
        title: 'Berhasil Masuk!',
        text: `Selamat datang, ${user.displayName}`,
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: 'error',
        title: 'Gagal Login',
        text: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      Swal.fire({
        icon: 'success',
        title: 'Login Berhasil',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Login',
        text: 'Email atau password salah.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });
      
      await set(ref(db, `users/${user.uid}`), {
        email: user.email,
        displayName: name,
        role: 'user',
        saldo: 0,
        createdAt: serverTimestamp()
      });

      Swal.fire({
        icon: 'success',
        title: 'Akun Dibuat!',
        text: 'Silakan login dengan akun barumu.',
        timer: 1500,
        showConfirmButton: false
      });
      
      // Reset form or switch to login view if needed, but usually auth state change handles it
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Daftar',
        text: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4 overflow-hidden relative">
        {/* Background Elements - Electric Blue Theme */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px]"></div>

        <div className={`relative bg-slate-900/60 backdrop-blur-xl rounded-[20px] shadow-2xl overflow-hidden w-full max-w-[900px] min-h-[600px] border border-slate-700`}>
            
            {/* Sign Up Form Container (Moves to Right) */}
            <div className={`absolute top-0 h-full transition-all duration-700 ease-in-out left-0 w-full md:w-1/2 ${isSignUp ? 'translate-x-full opacity-100 z-50' : 'opacity-0 z-10'}`}>
                <form onSubmit={handleRegister} className="bg-transparent flex flex-col items-center justify-center h-full px-8 md:px-12 text-center">
                    <h1 className="font-bold text-3xl mb-6 text-white">Buat Akun</h1>
                    
                    <div className="w-full space-y-4">
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-slate-500" size={18} />
                            <input 
                                type="text" 
                                placeholder="Nama Lengkap" 
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                autoComplete="name"
                            />
                        </div>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-slate-500" size={18} />
                            <input 
                                type="email" 
                                placeholder="Email" 
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-500" size={18} />
                            <input 
                                type="password" 
                                placeholder="Password" 
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="mt-8 bg-blue-600 text-white font-bold py-3 px-12 rounded-full uppercase tracking-wider text-xs hover:bg-blue-700 transition-transform active:scale-95 shadow-lg shadow-blue-600/30"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={16} /> : 'Daftar Sekarang'}
                    </button>
                    
                    <div className="mt-6">
                        <span className="text-xs text-slate-500">Atau daftar dengan</span>
                        <div className="flex justify-center mt-2">
                            <button type="button" onClick={handleGoogleLogin} className="w-10 h-10 rounded-full border border-slate-600 flex items-center justify-center hover:bg-slate-800 transition-colors bg-white">
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Sign In Form Container (Default Left) */}
            <div className={`absolute top-0 h-full transition-all duration-700 ease-in-out left-0 w-full md:w-1/2 z-20 ${isSignUp ? 'translate-x-full opacity-0' : ''}`}>
                <form onSubmit={handleEmailLogin} className="bg-transparent flex flex-col items-center justify-center h-full px-8 md:px-12 text-center">
                    <h1 className="font-bold text-3xl mb-6 text-white">Login</h1>
                    
                    <div className="w-full space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-slate-500" size={18} />
                            <input 
                                type="email" 
                                placeholder="Email" 
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-500" size={18} />
                            <input 
                                type="password" 
                                placeholder="Password" 
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    <a href="#" className="text-xs text-slate-400 mt-4 hover:text-blue-400 transition-colors">Lupa password anda?</a>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="mt-8 bg-blue-600 text-white font-bold py-3 px-12 rounded-full uppercase tracking-wider text-xs hover:bg-blue-700 transition-transform active:scale-95 shadow-lg shadow-blue-600/30"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={16} /> : 'Masuk'}
                    </button>

                    <div className="mt-6">
                        <span className="text-xs text-slate-500">Atau masuk dengan</span>
                        <div className="flex justify-center mt-2">
                            <button type="button" onClick={handleGoogleLogin} className="w-10 h-10 rounded-full border border-slate-600 flex items-center justify-center hover:bg-slate-800 transition-colors bg-white">
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Overlay Container */}
            <div 
                className={`hidden md:block absolute top-0 left-1/2 w-1/2 h-full overflow-hidden z-100 drop-shadow-2xl ${isSignUp ? '-translate-x-full' : ''}`}
                style={{ 
                    transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), clip-path 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    clipPath: isSignUp 
                        ? 'polygon(75% 100%, 0% 100%, 0% 0%, 100% 0%)' 
                        : 'polygon(0 0, 100% 0, 100% 100%, 25% 100%)' 
                }}
            >
                <div 
                    className={`bg-gradient-to-br from-purple-800 to-indigo-900 text-white relative -left-full h-full w-[200%] transform ${isSignUp ? 'translate-x-1/2' : 'translate-x-0'}`}
                    style={{ transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
                >
                    
                    {/* Diagonal Line Decoration */}
                    <div className="absolute inset-0 opacity-30">
                        <div className="absolute top-0 left-1/2 w-full h-full bg-black/20 transform -skew-x-12 origin-bottom-left"></div>
                    </div>

                    {/* Overlay Left (For Sign In Context - Visible when Sign Up Form is Active) */}
                    <div className={`absolute top-0 flex flex-col items-center justify-center w-1/2 h-full px-12 text-center transform transition-transform duration-700 ease-in-out ${isSignUp ? 'translate-x-0' : '-translate-x-[20%]'}`}>
                        <h1 className="font-bold text-3xl mb-4">Sudah Punya Akun?</h1>
                        <p className="text-sm mb-8 text-blue-100">
                            Untuk tetap terhubung dengan kami, silakan login dengan info pribadi anda
                        </p>
                        <button 
                            onClick={() => setIsSignUp(false)}
                            className="bg-transparent border border-white text-white font-bold py-3 px-12 rounded-full uppercase tracking-wider text-xs hover:bg-white hover:text-blue-900 transition-colors"
                        >
                            Masuk
                        </button>
                    </div>

                    {/* Overlay Right (For Sign Up Context - Visible when Login Form is Active) */}
                    <div className={`absolute top-0 right-0 flex flex-col items-center justify-center w-1/2 h-full px-12 text-center transform transition-transform duration-700 ease-in-out ${isSignUp ? 'translate-x-[20%]' : 'translate-x-0'}`}>
                        <h1 className="font-bold text-3xl mb-4">Halo, Sobat!</h1>
                        <p className="text-sm mb-8 text-blue-100">
                            Masukkan detail pribadi anda dan mulailah perjalanan bersama kami
                        </p>
                        <button 
                            onClick={() => setIsSignUp(true)}
                            className="bg-transparent border border-white text-white font-bold py-3 px-12 rounded-full uppercase tracking-wider text-xs hover:bg-white hover:text-blue-900 transition-colors"
                        >
                            Daftar
                        </button>
                    </div>

                </div>
            </div>

            {/* Mobile Toggle (Visible only on small screens) */}
            <div className="md:hidden absolute bottom-6 left-0 right-0 text-center z-50">
                <button 
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm text-slate-400 hover:text-white font-medium"
                >
                    {isSignUp ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}
                </button>
            </div>

        </div>
    </div>
  );
};

export default Login;