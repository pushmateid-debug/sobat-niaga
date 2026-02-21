import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import Swal from 'sweetalert2';
import { Mail, Lock, Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';

const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true); // Toggle antara Login dan Register
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const auth = getAuth(); // Pastikan firebase app sudah di-init di file lain (misal: firebase.js)

  const validateForm = () => {
    if (!email || !password) {
      Swal.fire({
        icon: 'warning',
        title: 'Data tidak lengkap',
        text: 'Mohon isi email dan password.',
      });
      return false;
    }
    // Validasi Password Minimal 6 Karakter (Sesuai Request)
    if (password.length < 6) {
      Swal.fire({
        icon: 'error',
        title: 'Password Lemah',
        text: 'Password harus memiliki minimal 6 karakter untuk keamanan.',
      });
      return false;
    }
    return true;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (isLogin) {
        // Fungsi Login
        await signInWithEmailAndPassword(auth, email, password);
        Swal.fire({
          icon: 'success',
          title: 'Berhasil Masuk!',
          text: 'Selamat datang kembali di SobatNiaga.',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        // Fungsi Register
        await createUserWithEmailAndPassword(auth, email, password);
        Swal.fire({
          icon: 'success',
          title: 'Akun Dibuat!',
          text: 'Silakan login dengan akun baru Anda.',
        });
        setIsLogin(true); // Pindah ke mode login setelah register sukses
      }
    } catch (error) {
      let errorMessage = 'Terjadi kesalahan pada sistem.';
      if (error.code === 'auth/email-already-in-use') errorMessage = 'Email sudah terdaftar.';
      if (error.code === 'auth/invalid-email') errorMessage = 'Format email tidak valid.';
      if (error.code === 'auth/user-not-found') errorMessage = 'Pengguna tidak ditemukan.';
      if (error.code === 'auth/wrong-password') errorMessage = 'Password salah.';
      
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-center text-gray-800">
        {isLogin ? 'Login SobatNiaga' : 'Daftar Akun Baru'}
      </h2>

      <form onSubmit={handleAuth} className="space-y-4">
        {/* Input Email */}
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            required
          />
        </div>

        {/* Input Password */}
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password (Min. 6 Karakter)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        {/* Tombol Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center items-center gap-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition duration-200 disabled:opacity-50"
        >
          {loading ? (
            'Memproses...'
          ) : isLogin ? (
            <>
              <LogIn className="h-5 w-5" /> Masuk
            </>
          ) : (
            <>
              <UserPlus className="h-5 w-5" /> Daftar
            </>
          )}
        </button>
      </form>

      {/* Toggle Login/Register */}
      <div className="text-center text-sm text-gray-600">
        {isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? '}
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="font-medium text-blue-600 hover:text-blue-500 hover:underline"
        >
          {isLogin ? 'Daftar sekarang' : 'Login di sini'}
        </button>
      </div>
    </div>
  );
};

export default AuthForm;
