import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, ShoppingCart, User, Zap, Utensils, Sparkles, ShoppingBag, ChevronRight, Wrench, Package, CheckCircle, Loader2, ArrowLeft, Info, AlertTriangle, XCircle, Trash2, Gamepad2 } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import ProductCard from '../components/ProductCard';
import TopUp from './TopUp';
import FoodOrder from './FoodOrder';
import SkinCare from './SkinCare';
import Fashion from './Fashion';
import Jasa from './Jasa';
import Cart from './Cart';
import Login from './Login';
import Profile from './Profile';
import DashboardSeller from './DashboardSeller';
import Address from './Address';
import ProductDetail from './ProductDetail';
import Payment from './Payment';
import TransactionHistory from './TransactionHistory';
import AdminDashboard from './AdminDashboard';
import StoreProfile from './StoreProfile';
import DigitalCenter from './DigitalCenter'; // Import halaman baru
import TopUpModal from '../components/TopUpModal'; // Import modal baru
import SearchResults from './SearchResults'; // Import halaman hasil pencarian
// Import Banner Assets
import banner1 from '../assets/banner1.png';
import banner2 from '../assets/banner2.png';
import banner3 from '../assets/banner3.png';
import { auth } from '../config/firebase';
import { db } from '../config/firebase';
import { ref, onValue, push, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useTheme } from '../context/ThemeContext'; // Import Context

const Home = () => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notificationRef = useRef(null);
  const searchRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'topup' | 'food'
  const [previousView, setPreviousView] = useState('home');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [products, setProducts] = useState([]); // Real Products State
  const [cartCount, setCartCount] = useState(0);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [historyTab, setHistoryTab] = useState('waiting_payment');
  const [highlightOrderId, setHighlightOrderId] = useState(null);
  const [bannerImages, setBannerImages] = useState({}); // State buat nampung URL banner dari database
  const [selectedSellerId, setSelectedSellerId] = useState(null); // ID Toko yang sedang dilihat
  const [searchQuery, setSearchQuery] = useState(''); // State untuk input pencarian
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // State untuk query yang aktif dicari
  const [selectedGame, setSelectedGame] = useState(null); // State untuk modal top up game
  const { theme } = useTheme(); // Ambil state theme

  // Logic Banner Dinamis (Database > Lokal)
  const banners = [
    { id: 1, image: bannerImages.home_slider_1 || banner1, alt: "Promo Gajian" },
    { id: 2, image: bannerImages.home_slider_2 || banner2, alt: "Makan Hemat" },
    { id: 3, image: bannerImages.home_slider_3 || banner3, alt: "Fashion Week" },
  ];

  const categories = [
    { name: 'Isi Pulsa', icon: <Zap size={24} />, color: 'bg-blue-50 text-blue-600 border border-blue-200' },
    { name: 'Makan', icon: <Utensils size={24} />, color: 'bg-orange-50 text-orange-600 border border-orange-200' },
    { name: 'Skin Care', icon: <Sparkles size={24} />, color: 'bg-rose-50 text-rose-600 border border-rose-200' },
    { name: 'Fashion', icon: <ShoppingBag size={24} />, color: 'bg-indigo-50 text-indigo-600 border border-indigo-200' },
    { name: 'Jasa', icon: <Wrench size={24} />, color: 'bg-teal-50 text-teal-600 border border-teal-200' },
    { name: 'Top Up Game', icon: <Gamepad2 size={24} />, color: 'bg-purple-50 text-purple-600 border border-purple-200' },
  ];

  // Fetch Real Products from Firebase
  useEffect(() => {
    const productsRef = ref(db, 'products');
    onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      const loadedProducts = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      // Filter Produk Aktif (isActive !== false) agar produk arsip tidak muncul
      const activeProducts = loadedProducts.filter(p => p.isActive !== false);
      // Sort by createdAt descending (Terbaru paling atas/kiri)
      setProducts(activeProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
  }, []);

  // Fetch Banner Realtime
  useEffect(() => {
    const bannersRef = ref(db, 'admin/banners');
    const unsubscribe = onValue(bannersRef, (snapshot) => {
      if (snapshot.exists()) setBannerImages(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // Listen to Cart Count
  useEffect(() => {
    if (user?.uid) {
      const cartRef = ref(db, `users/${user.uid}/cart`);
      return onValue(cartRef, (snapshot) => {
        const data = snapshot.val();
        setCartCount(data ? Object.keys(data).length : 0);
      });
    }
  }, [user]);

  // Fetch Notifications Realtime
  useEffect(() => {
    if (user?.uid) {
      const notifRef = query(ref(db, 'notifications'), orderByChild('userId'), equalTo(user.uid));
      const unsubscribe = onValue(notifRef, (snapshot) => {
        const data = snapshot.val();
        const loadedNotifs = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        // Sort by createdAt descending
        setNotifications(loadedNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Click Outside & Escape Key Functionality
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
        setIsNotificationOpen(false);
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [dropdownRef]);

  // Auth Persistence Listener: Cek status login saat refresh
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // Jika user login, ambil data lengkap dari Realtime DB
        const userRef = ref(db, `users/${currentUser.uid}`);
        onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const dbUser = snapshot.val();
            // Gabungkan data Auth dan DB
            setUser({ ...currentUser, ...dbUser });
          } else {
            // User baru, belum ada data di DB
            setUser(currentUser);
          }
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const toggleProfileDropdown = () => {
    setIsProfileOpen(!isProfileOpen);
  };

  const closeProfileDropdown = () => {
    setIsProfileOpen(false);
  };

  const handleProductClick = (product) => {
    setPreviousView(currentView);
    setSelectedProduct(product);
    setCurrentView('product-detail');
  };

  const handleCheckout = (orderId) => {
    setCurrentOrder({ id: orderId }); // Di real app fetch order detail by ID
    setCurrentView('payment');
  };

  const handleVisitStore = (sellerId) => {
    setSelectedSellerId(sellerId);
    setPreviousView(currentView); // Biar bisa back ke halaman sebelumnya
    setCurrentView('store-profile');
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
  };

  // Handle Search Input & Auto-Suggestions
  const handleSearchInput = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim().length > 0) {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5); // Limit to 5 suggestions
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (productName) => {
    setSearchQuery(productName);
    setActiveSearchQuery(productName);
    setPreviousView(currentView);
    setCurrentView('search-results');
    setShowSuggestions(false);
  };

  // Handle Search Submission
  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      setActiveSearchQuery(searchQuery.trim());
      setPreviousView(currentView); // Simpan view saat ini untuk tombol back
      setCurrentView('search-results');
      setShowSuggestions(false);
      e.target.blur(); // Hapus fokus dari input
    }
  };

  // Notification Helpers
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) {
      update(ref(db, `notifications/${notif.id}`), { isRead: true });
    }
    
    // Reset Highlight
    setHighlightOrderId(null);

    // Handle Deep Link Order (Untuk Payment Rejected dll)
    if (notif.orderId) {
      setCurrentOrder({ id: notif.orderId });
      setHighlightOrderId(notif.orderId);
    }

    if (notif.targetView) {
      setCurrentView(notif.targetView);
    }

    // Logic Dynamic Tab untuk TransactionHistory
    if (notif.targetView === 'history') {
      if (notif.targetTab) {
        setHistoryTab(notif.targetTab);
      } else if (notif.title.toLowerCase().includes('dikirim')) {
        setHistoryTab('shipped');
      } else if (notif.title.toLowerCase().includes('selesai')) {
        setHistoryTab('completed');
      }
    }
    setIsNotificationOpen(false);
  };

  const handleMarkAllRead = () => {
    const updates = {};
    notifications.forEach(n => {
      if (!n.isRead) updates[`notifications/${n.id}/isRead`] = true;
    });
    if (Object.keys(updates).length > 0) update(ref(db), updates);
  };

  const handleClearAllNotifications = () => {
    const updates = {};
    notifications.forEach(n => {
      updates[`notifications/${n.id}`] = null;
    });
    if (Object.keys(updates).length > 0) update(ref(db), updates);
  };

  const getTimeAgo = (dateString) => {
    const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
  };

  const getNotifStyle = (type) => {
    switch(type) {
      case 'success': return { icon: <CheckCircle size={16} className="text-white" />, color: 'bg-green-500' };
      case 'warning': return { icon: <AlertTriangle size={16} className="text-white" />, color: 'bg-yellow-500' };
      case 'error': return { icon: <XCircle size={16} className="text-white" />, color: 'bg-red-500' };
      default: return { icon: <Info size={16} className="text-white" />, color: 'bg-blue-500' };
    }
  };

  // Loading Screen: Tahan tampilan sampai Firebase selesai ngecek
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 size={48} className="text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium animate-pulse">Memuat SobatNiaga...</p>
      </div>
    );
  }

  // Auth Check
  if (!user) {
    return <Login onLogin={(userData) => setUser(userData)} />;
  }

  // Render Content Helper
  const renderContent = () => {
    switch (currentView) {
      case 'topup': return <TopUp onBack={() => setCurrentView('home')} />;
      case 'food': return <FoodOrder onBack={() => setCurrentView('home')} products={products} onProductClick={handleProductClick} />;
      case 'skincare': return <SkinCare onBack={() => setCurrentView('home')} products={products} onProductClick={handleProductClick} />;
      case 'fashion': return <Fashion onBack={() => setCurrentView('home')} products={products} onProductClick={handleProductClick} />;
      case 'jasa': return <Jasa onBack={() => setCurrentView('home')} products={products} onProductClick={handleProductClick} />;
      case 'cart': return <Cart onBack={() => setCurrentView('home')} user={user} onCheckout={handleCheckout} />;
      case 'profile': return <Profile user={user} onBack={() => setCurrentView('home')} onUpdateUser={(updatedUser) => setUser({ ...user, ...updatedUser })} onViewHistory={() => setCurrentView('history')} />;
      case 'address': return <Address user={user} onBack={() => setCurrentView('home')} />;
      case 'dashboard-seller': return <DashboardSeller user={user} onBack={() => setCurrentView('home')} />;
      case 'product-detail': return <ProductDetail product={selectedProduct} onBack={() => setCurrentView(previousView)} onGoToCart={() => setCurrentView('cart')} user={user} onVisitStore={handleVisitStore} />;
      case 'payment': return <Payment order={currentOrder} onBack={() => setCurrentView('cart')} onPaymentSuccess={() => setCurrentView('history')} />;
      case 'history': return <TransactionHistory user={user} onBack={() => setCurrentView('home')} onPay={(order) => { setCurrentOrder(order); setCurrentView('payment'); }} initialTab={historyTab} highlightOrderId={highlightOrderId} />;
      case 'admin-dashboard': return <AdminDashboard onBack={() => setCurrentView('home')} />;
      case 'store-profile': return <StoreProfile sellerId={selectedSellerId} onBack={() => setCurrentView(previousView)} onProductClick={handleProductClick} />;
      case 'digital-center': return <DigitalCenter onBack={() => setCurrentView('home')} onGameSelect={handleGameSelect} />;
      case 'search-results': return <SearchResults onBack={() => setCurrentView(previousView)} products={products} query={activeSearchQuery} onProductClick={handleProductClick} />;
      default: return (
        <>
          {/* Hero Section (Auto-Slider) */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        <Swiper
          modules={[Autoplay, Pagination]}
          spaceBetween={16}
          slidesPerView={1}
          loop={true}
          speed={1000}
          autoplay={{ delay: 3500, disableOnInteraction: false }}
          grabCursor={true}
          pagination={{ clickable: true }}
          className="w-full aspect-[3/1] rounded-2xl shadow-md overflow-hidden"
        >
          {banners.map((banner) => (
            <SwiperSlide key={banner.id} className="relative w-full h-full">
              {banner.link ? (
                <a 
                  href={banner.link} 
                  target={banner.link.startsWith('http') ? "_blank" : "_self"} 
                  rel={banner.link.startsWith('http') ? "noopener noreferrer" : undefined}
                  className="block w-full h-full cursor-pointer"
                >
                  <img 
                    src={banner.image} 
                    alt={banner.alt} 
                    className="w-full h-full object-cover"
                  />
                </a>
              ) : (
                <img 
                  src={banner.image} 
                  alt={banner.alt} 
                  className="w-full h-full object-cover"
                />
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Kategori Modifikasi (Floating Style) */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="p-4 rounded-2xl shadow-sm border grid grid-cols-3 sm:grid-cols-6 gap-4 theme-card">
          {categories.map((cat) => (
            <div 
              key={cat.name} 
              onClick={() => {
                if (cat.name === 'Isi Pulsa') setCurrentView('topup');
                if (cat.name === 'Makan') setCurrentView('food');
                if (cat.name === 'Skin Care') setCurrentView('skincare');
                if (cat.name === 'Fashion') setCurrentView('fashion');
                if (cat.name === 'Jasa') setCurrentView('jasa');
                if (cat.name === 'Top Up Game') setCurrentView('digital-center');
              }}
              className="flex flex-col items-center gap-2 cursor-pointer group p-2 rounded-xl hover:bg-opacity-50 transition-all"
            >
              <div className={`${cat.color} p-3 rounded-2xl transition-transform group-hover:scale-110 shadow-sm`}>
                {cat.icon}
              </div>
              <span className="text-xs font-medium theme-text text-center leading-tight w-16">
                {cat.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Product Feed */}
      <div className="max-w-7xl mx-auto px-4 mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold theme-text">Rekomendasi Untukmu</h2>
          <button className="text-indigo-600 text-sm font-medium flex items-center">
            Lihat Semua <ChevronRight size={16} />
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {products.map((product) => (
            <ProductCard 
              key={product.id} 
              product={{
                ...product,
                image: product.mediaUrl || 'https://via.placeholder.com/150', // Map mediaUrl ke image
                price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}` // Format harga aman
              }}
              className="product-card-home" // Class khusus buat Dark Mode Home
              onClick={() => handleProductClick(product)}
            />
          ))}
        </div>
      </div>
        </>
      );
    }
  };

  return (
    <div className="min-h-screen pb-20 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)' }}>
      {/* Global Header (Sticky) */}
      <nav className="sticky top-0 z-[100] shadow-sm border-b theme-nav">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-8">
          {/* Left: Brand or Back Button */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-sky-600 tracking-tight cursor-pointer" onClick={() => setCurrentView('home')}>
              SobatNiaga
            </h1>
          </div>

          {/* Center: Search Bar (Hidden on mobile if needed, or simplified) */}
          <div className="flex-1 relative" ref={searchRef}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border rounded-full text-sm focus:ring-2 focus:ring-sky-500 transition-all theme-card theme-text placeholder:text-gray-400"
              placeholder="Cari di SobatNiaga..."
              value={searchQuery}
              onChange={handleSearchInput}
              onKeyDown={handleSearch}
              onFocus={() => { if(searchQuery.trim().length > 0) setShowSuggestions(true); }}
            />
            
            {/* Auto-Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 rounded-xl shadow-lg border z-50 overflow-hidden theme-card">
                {suggestions.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleSuggestionClick(product.name)}
                    className="px-4 py-3 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-3 transition-colors border-b border-gray-50 dark:border-slate-700 last:border-0"
                  >
                    <Search size={14} className="text-gray-400" />
                    <span className="text-sm theme-text line-clamp-1 font-medium">{product.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Icons */}
          <div className="flex items-center gap-3 theme-text">
            {/* Notifikasi Dropdown */}
            <div className="relative">
              <button 
                onClick={() => {
                  setIsNotificationOpen(!isNotificationOpen);
                  setIsProfileOpen(false);
                }}
                className="hover:text-sky-600 relative flex items-center p-2 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-all"
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-red-500"></span>
                )}
              </button>

              {isNotificationOpen && (
                <div ref={notificationRef} className="absolute right-0 mt-2 w-80 rounded-xl shadow-lg border z-50 overflow-hidden theme-card">
                  <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-white">
                    <h3 className="font-bold theme-text text-sm">Notifikasi</h3>
                    <div className="flex gap-2">
                      <button onClick={handleMarkAllRead} className="text-xs text-sky-600 font-medium hover:underline">Baca Semua</button>
                      <button onClick={handleClearAllNotifications} className="text-xs text-red-500 font-medium hover:underline"><Trash2 size={12}/></button>
                    </div>
                  </div>
                  
                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">Belum ada notifikasi</div>
                    ) : (
                      notifications.map((notif) => {
                        const style = getNotifStyle(notif.type);
                        return (
                        <div 
                          key={notif.id} 
                          onClick={() => handleNotificationClick(notif)}
                          className={`px-4 py-3 flex gap-3 border-b hover:opacity-90 transition-colors cursor-pointer ${!notif.isRead ? 'bg-blue-50/10' : 'theme-card'}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${style.color}`}>
                            {style.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <h4 className={`text-sm ${!notif.isRead ? 'font-bold theme-text' : 'font-medium theme-text-muted'}`}>{notif.title}</h4>
                              {!notif.isRead && <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5"></div>}
                            </div>
                            <p className="text-xs theme-text-muted line-clamp-2 mt-0.5 leading-relaxed">{notif.message}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{getTimeAgo(notif.createdAt)}</p>
                          </div>
                        </div>
                      )})
                    )}
                  </div>

                  <button className="w-full py-3 text-center text-sm font-bold text-sky-600 hover:bg-opacity-10 hover:bg-sky-500 transition-colors border-t theme-card">
                    Lihat Semua Notifikasi
                  </button>
                </div>
              )}
            </div>

            {/* Cart Icon with Badge */}
            <button 
              onClick={() => setCurrentView('cart')}
              className="hover:text-sky-600 relative p-2 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-all"
            >
              <ShoppingCart size={22} />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full ring-2 ring-white">
                  {cartCount}
                </span>
              )}
            </button>
            
            {/* Profil Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="hover:text-sky-600 flex items-center focus:outline-none p-1 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-all"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200 object-cover" />
                ) : (
                  <User size={22} />
                )}
              </button>

              {isProfileOpen && (
                <div ref={dropdownRef} className="absolute right-0 mt-2 w-48 rounded-xl shadow-lg border py-2 z-50 theme-card">
                  <div className="px-4 py-2 border-b border-gray-100 mb-1 ">
                    <p className="text-sm font-bold theme-text">Halo, {user.displayName || 'User'}!</p>
                  </div>
                  <button onClick={() => { setCurrentView('profile'); setIsProfileOpen(false); }} className="block w-full text-left px-4 py-2 text-sm theme-text hover:text-sky-600">Profil Saya</button>
                  <button onClick={() => { setCurrentView('history'); setIsProfileOpen(false); }} className="block w-full text-left px-4 py-2 text-sm theme-text hover:text-sky-600">Pesanan Saya</button>
                  <button onClick={() => { setCurrentView('dashboard-seller'); setIsProfileOpen(false); }} className="block w-full text-left px-4 py-2 text-sm theme-text hover:text-sky-600">Dasbor Seller</button>
                  <button onClick={() => { setCurrentView('admin-dashboard'); setIsProfileOpen(false); }} className="block w-full text-left px-4 py-2 text-sm theme-text hover:text-sky-600">Admin Dashboard</button>
                  <button onClick={() => { setCurrentView('address'); setIsProfileOpen(false); }} className="block w-full text-left px-4 py-2 text-sm theme-text hover:text-sky-600">Alamat Lokasi</button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button onClick={() => signOut(auth)} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-medium">Log Out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      {renderContent()}

      {/* Modal Top Up Game (Global) */}
      {selectedGame && (
        <TopUpModal 
          game={selectedGame} 
          user={user} 
          onClose={() => setSelectedGame(null)} />
      )}
    </div>
  );
};

export default Home;