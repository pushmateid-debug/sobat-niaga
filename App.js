import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import { ThemeProvider } from './context/ThemeContext';
import Swal from 'sweetalert2'; // Untuk menampilkan toast

// Import semua "pages" yang sebelumnya di-render secara kondisional oleh Home.jsx
// Pastikan path import ini sesuai dengan struktur folder kamu
import TopUp from './pages/TopUp';
import FoodOrder from './pages/FoodOrder';
import SkinCare from './pages/SkinCare';
import Fashion from './pages/Fashion';
import Jasa from './pages/Jasa';
import Cart from './pages/Cart';
import Login from './pages/Login';
import Profile from './pages/Profile';
import DashboardSeller from './pages/DashboardSeller';
import Address from './pages/Address';
import ProductDetail from './pages/ProductDetail';
import Payment from './pages/Payment';
import TransactionHistory from './pages/TransactionHistory';
import AdminDashboard from './components/AdminDashboard'; // AdminDashboard ada di components
import StoreProfile from './pages/StoreProfile';
import DigitalCenter from './pages/DigitalCenter';
import NiagaGo from './pages/NiagaGo';
import SearchResults from './pages/SearchResults';
import SearchPage from './pages/SearchPage';
import AllCategories from './pages/AllCategories';
import SobatBerbagi from './pages/SobatBerbagi';
import NiagaVideo from './pages/NiagaVideo';
import UserPublicProfile from './pages/UserPublicProfile';

// Komponen ini akan membungkus semua rute dan menangani logika navigasi global
const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false); // State global untuk modal
  const lastBackPressTime = useRef(0);
  const toastId = useRef(null); // Untuk melacak toast "Tekan sekali lagi untuk keluar"

  // --- Event Listener 'PopState' & Logika Tombol Back ---
  useEffect(() => {
    const handlePopState = (event) => {
      // 1. Jika ada modal yang terbuka, tutup modalnya terlebih dahulu
      if (isGlobalModalOpen) {
        setIsGlobalModalOpen(false);
        // Mencegah browser mundur lebih jauh dengan mendorong state saat ini kembali
        // Ini penting agar tombol back hanya menutup modal, bukan halaman
        window.history.pushState(event.state, '', window.location.pathname);
        return; 
      }

      // 2. Penanganan khusus untuk halaman utama (root path '/')
      if (location.pathname === '/') {
        const currentTime = new Date().getTime();
        if (currentTime - lastBackPressTime.current < 2000) { // Jika ditekan kurang dari 2 detik
          // User menekan tombol back dua kali di halaman home, izinkan keluar aplikasi
          if (toastId.current) Swal.close(toastId.current); // Tutup toast jika masih ada
          // Biarkan perilaku default browser (keluar aplikasi)
        } else {
          // Ini adalah penekanan tombol back pertama di halaman home, tampilkan toast
          lastBackPressTime.current = currentTime;
          toastId.current = Swal.fire({
            text: 'Tekan sekali lagi untuk keluar',
            toast: true,
            position: 'bottom',
            showConfirmButton: false,
            timer: 2000,
            customClass: {
              popup: 'bg-gray-800 text-white text-sm rounded-lg shadow-lg',
            }
          });
          // Mencegah perilaku default browser (tetap di halaman home)
          // Ini dilakukan dengan mendorong state saat ini kembali ke history
          window.history.pushState(null, '', window.location.pathname);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (toastId.current) Swal.close(toastId.current); // Pastikan toast ditutup saat komponen unmount
    };
  }, [isGlobalModalOpen, location.pathname]); // Dependensi: state modal dan path saat ini

  // Props yang akan diteruskan ke komponen yang perlu mengelola state modal global
  const globalModalProps = { isGlobalModalOpen, setIsGlobalModalOpen };

  return (
    <ThemeProvider>
      <Routes>
        {/* Rute utama Home */}
        <Route path="/" element={<Home {...globalModalProps} />} />
        {/* Definisikan rute untuk semua sub-halaman yang sebelumnya diatur oleh currentView di Home.jsx */}
        {/* CATATAN PENTING: Kamu perlu membuat/menyesuaikan komponen-komponen ini untuk menerima props dan menggunakan useNavigate */}
        <Route path="/topup" element={<TopUp {...globalModalProps} />} />
        <Route path="/food" element={<FoodOrder {...globalModalProps} />} />
        <Route path="/skincare" element={<SkinCare {...globalModalProps} />} />
        <Route path="/fashion" element={<Fashion {...globalModalProps} />} />
        <Route path="/jasa" element={<Jasa {...globalModalProps} />} />
        <Route path="/cart" element={<Cart {...globalModalProps} />} />
        <Route path="/login" element={<Login {...globalModalProps} />} />
        <Route path="/profile" element={<Profile {...globalModalProps} />} />
        <Route path="/dashboard-seller" element={<DashboardSeller {...globalModalProps} />} />
        <Route path="/address" element={<Address {...globalModalProps} />} />
        <Route path="/product-detail/:id" element={<ProductDetail {...globalModalProps} />} /> {/* Contoh dengan ID produk */}
        <Route path="/payment" element={<Payment {...globalModalProps} />} />
        <Route path="/history" element={<TransactionHistory {...globalModalProps} />} />
        <Route path="/admin-dashboard" element={<AdminDashboard {...globalModalProps} />} />
        <Route path="/store-profile/:id" element={<StoreProfile {...globalModalProps} />} /> {/* Contoh dengan ID toko */}
        <Route path="/digital-center" element={<DigitalCenter {...globalModalProps} />} />
        <Route path="/niagago" element={<NiagaGo {...globalModalProps} />} />
        <Route path="/search-results" element={<SearchResults {...globalModalProps} />} />
        <Route path="/search-page" element={<SearchPage {...globalModalProps} />} />
        <Route path="/all-categories" element={<AllCategories {...globalModalProps} />} />
        <Route path="/sobat-berbagi" element={<SobatBerbagi {...globalModalProps} />} />
        <Route path="/niaga-video" element={<NiagaVideo {...globalModalProps} />} />
        <Route path="/user-public-profile/:id" element={<UserPublicProfile {...globalModalProps} />} />
        {/* Halaman statis - ini juga perlu komponennya sendiri */}
        <Route path="/about" element={<div>Konten Halaman Tentang Kami</div>} />
        <Route path="/terms" element={<div>Konten Halaman Syarat & Ketentuan</div>} />
        <Route path="/privacy" element={<div>Konten Halaman Kebijakan Privasi</div>} />
        <Route path="/help" element={<div>Konten Halaman Pusat Bantuan</div>} />
        <Route path="/chat" element={<div>Konten Halaman Chat</div>} />
        <Route path="/account-menu" element={<div>Konten Halaman Menu Akun</div>} />
        {/* Tambahkan rute lain sesuai kebutuhan */}
      </Routes>
    </ThemeProvider>
  );
};

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}

export default App;