import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Bell, ShoppingCart, User, Zap, Utensils, Sparkles, ShoppingBag, ChevronRight, Wrench, Package, CheckCircle, Loader2, ArrowLeft, Info, AlertTriangle, XCircle, Trash2, Gamepad2, Instagram, Youtube, Facebook, Twitter, FileText, ShieldCheck, HelpCircle, MessageCircle, Bike, Smartphone, Star, Home as HomeIcon, Store, MapPin, LogOut, LayoutDashboard, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, EffectCoverflow } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
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
import NiagaGo from './NiagaGo'; // Import NiagaGo
import SearchResults from './SearchResults'; // Import halaman hasil pencarian
import { TopUpModal } from '../components/TopUpModal'; // Import modal baru
import { auth, db } from '../config/firebase';
import { ref, onValue, push, update, remove, query, orderByChild, equalTo, serverTimestamp } from 'firebase/database';
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
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [capsuleStyle, setCapsuleStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const tabsRef = useRef([]);
  const { theme } = useTheme(); // Ambil state theme
  const isDarkMode = theme === 'dark';
  const [flashDeal, setFlashDeal] = useState(null);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });
  const [isExpired, setIsExpired] = useState(true); // Default true biar gak flicker
  const [pagesContent, setPagesContent] = useState({}); // Konten Halaman Statis
  const [chatTab, setChatTab] = useState('admin'); // 'admin' | 'seller'

  // Refs for Auto-Scroll Sections
  const populerRef = useRef(null);
  const pulsaRef = useRef(null);
  const makanRef = useRef(null);
  const skincareRef = useRef(null);
  const fashionRef = useRef(null);
  const jasaRef = useRef(null);
  const gameRef = useRef(null);
  const niagaGoRef = useRef(null);

  // Logic Banner Dinamis (Database > Lokal)
  const banners = useMemo(() => {
    const slots = [
      { id: 1, key: 'home_slider_1', alt: "Slide 1" },
      { id: 2, key: 'home_slider_2', alt: "Slide 2" },
      { id: 3, key: 'home_slider_3', alt: "Slide 3" },
      { id: 4, key: 'home_slider_4', alt: "Slide 4" },
      { id: 5, key: 'home_slider_5', alt: "Slide 5" },
    ];

    return slots.map(slot => {
      const data = bannerImages[slot.key];
      if (!data) return null;
      
      const image = typeof data === 'object' ? data.url : data;
      const link = typeof data === 'object' ? data.link : null;
      
      return { ...slot, image, link };
    }).filter(b => b && b.image);
  }, [bannerImages]);

  const footerBg = useMemo(() => {
    const data = bannerImages.footer_bg;
    return typeof data === 'object' ? data?.url : data;
  }, [bannerImages]);

  const chatIcon = useMemo(() => {
    const data = bannerImages.chat_icon;
    return typeof data === 'object' ? data?.url : data;
  }, [bannerImages]);

  const homeBgStatic = useMemo(() => {
    const data = bannerImages.home_bg_static;
    return typeof data === 'object' ? data?.url : data;
  }, [bannerImages]);

  // Kategori Navigasi Baru (Sticky)
  const navCategories = [
    { name: 'Populer', icon: <Star size={20} />, color: 'shadow-orange-500/50' },
    { name: 'Isi Pulsa', icon: <Smartphone size={20} />, color: 'shadow-blue-500/50' },
    { name: 'Makan', icon: <Utensils size={20} />, color: 'shadow-red-500/50' },
    { name: 'Skin Care', icon: <Sparkles size={20} />, color: 'shadow-pink-500/50' },
    { name: 'Fashion', icon: <ShoppingBag size={20} />, color: 'shadow-purple-500/50' },
    { name: 'Jasa', icon: <Wrench size={20} />, color: 'shadow-indigo-500/50' },
    { name: 'Top Up Game', icon: <Gamepad2 size={20} />, color: 'shadow-green-500/50' },
    { name: 'NiagaGo', icon: <Bike size={20} />, color: 'shadow-emerald-500/50' },
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

  // Effect untuk Sliding Capsule Animation
  useEffect(() => {
    const updateCapsule = () => {
      const currentTab = tabsRef.current[activeCategoryIndex];
      if (currentTab) {
        setCapsuleStyle({
          left: currentTab.offsetLeft,
          width: currentTab.offsetWidth,
          opacity: 1
        });
      }
    };
    updateCapsule();
    window.addEventListener('resize', updateCapsule);
    return () => window.removeEventListener('resize', updateCapsule);
  }, [activeCategoryIndex]);

  // Fetch Banner Realtime
  useEffect(() => {
    const bannersRef = ref(db, 'admin/banners');
    const unsubscribe = onValue(bannersRef, (snapshot) => {
      if (snapshot.exists()) setBannerImages(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // Fetch Flash Deal Data
  useEffect(() => {
    const fdRef = ref(db, 'admin/flashDeal');
    onValue(fdRef, (snap) => {
        if (snap.exists()) setFlashDeal(snap.val());
    });
  }, []);

  // Fetch Pages Content (Tentang Kami, dll)
  useEffect(() => {
    const pagesRef = ref(db, 'admin/pages');
    onValue(pagesRef, (snap) => {
        if (snap.exists()) setPagesContent(snap.val());
    });
  }, []);

  // Countdown Timer Logic
  useEffect(() => {
    if (flashDeal?.isActive && flashDeal?.endTime) {
        const calculateTime = () => {
            const now = new Date().getTime();
            const end = new Date(flashDeal.endTime).getTime();
            const distance = end - now;
            
            if (distance <= 0) {
                setTimeLeft({ h: 0, m: 0, s: 0 });
                setIsExpired(true); // Waktu habis -> Sembunyikan
            } else {
                setIsExpired(false); // Waktu ada -> Tampilkan
                setTimeLeft({
                    // Gunakan total jam (tidak di-modulo 24) agar jika > 1 hari tetap terlihat jamnya (misal 30 jam)
                    h: Math.floor(distance / (1000 * 60 * 60)), 
                    m: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
                    s: Math.floor((distance % (1000 * 60)) / 1000)
                });
            }
        };

        calculateTime(); // Hitung langsung saat mount biar gak nunggu 1 detik
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    } else {
        setTimeLeft({ h: 0, m: 0, s: 0 });
        setIsExpired(true); // Kalau tidak aktif/tidak ada data -> Sembunyikan
    }
  }, [flashDeal]);

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

  const scrollToSection = (name) => {
    let ref = null;
    switch (name) {
      case 'Populer': ref = populerRef; break;
      case 'Isi Pulsa': ref = pulsaRef; break;
      case 'Makan': ref = makanRef; break;
      case 'Skin Care': ref = skincareRef; break;
      case 'Fashion': ref = fashionRef; break;
      case 'Jasa': ref = jasaRef; break;
      case 'Top Up Game': ref = gameRef; break;
      case 'NiagaGo': ref = niagaGoRef; break;
      default: ref = null;
    }
    if (ref && ref.current) {
      const offset = 140; // Navbar + Sticky Menu height
      const top = ref.current.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
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

  // Render Halaman Statis (Tentang Kami, dll)
  const renderStaticPage = (pageKey, title) => {
    const content = pagesContent[pageKey] || '<div class="flex flex-col items-center justify-center py-20 text-gray-400"><p class="text-lg font-medium">Konten belum tersedia.</p><p class="text-sm">Admin sedang menyusun halaman ini.</p></div>';
    
    return (
        <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
            {/* Header Sticky */}
            <div className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button onClick={() => setCurrentView('home')} className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className={`text-lg font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h1>
                </div>
            </div>

            {/* Content Container */}
            <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
                <div className={`rounded-3xl shadow-xl overflow-hidden border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                    
                    {/* Decorative Header inside Card */}
                    <div className={`h-32 md:h-48 relative overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/5"></div>
                        <div className="absolute bottom-0 left-0 p-8">
                             <h2 className={`text-3xl md:text-4xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                                {title}
                             </h2>
                             <div className={`h-1.5 w-20 mt-4 rounded-full ${
                                 pageKey === 'about' ? 'bg-sky-500' :
                                 pageKey === 'terms' ? 'bg-orange-500' :
                                 pageKey === 'privacy' ? 'bg-green-500' : 'bg-purple-500'
                             }`}></div>
                        </div>
                    </div>

                    {/* Body Content */}
                    <div className="p-8 md:p-12">
                        <article className={`prose prose-lg max-w-none 
                            ${isDarkMode ? 'prose-invert prose-p:text-slate-300 prose-headings:text-white prose-strong:text-white' : 'prose-slate prose-p:text-slate-600 prose-headings:text-slate-800 prose-strong:text-slate-800'}
                            prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                            prose-a:text-sky-600 hover:prose-a:text-sky-500
                            prose-img:rounded-2xl prose-img:shadow-lg
                        `}>
                            <div dangerouslySetInnerHTML={{ __html: content }} />
                        </article>
                    </div>

                    {/* Footer of Document */}
                    <div className={`px-8 py-6 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                        <span>&copy; {new Date().getFullYear()} SobatNiaga. {title}.</span>
                        {pageKey === 'help' && (
                            <button 
                                onClick={() => window.open('https://wa.me/6289517587498', '_blank')}
                                className="px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors flex items-center gap-2"
                            >
                                <MessageCircle size={16} /> Hubungi CS
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
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
      case 'about': return renderStaticPage('about', 'Tentang Kami');
      case 'terms': return renderStaticPage('terms', 'Syarat & Ketentuan');
      case 'privacy': return renderStaticPage('privacy', 'Kebijakan Privasi');
      case 'help': return renderStaticPage('help', 'Pusat Bantuan');
      case 'niagago': return <NiagaGo user={user} onBack={() => setCurrentView('home')} onOpenProfile={() => setCurrentView('profile')} />;
      
      // --- HALAMAN LIVE CHAT INTERNAL ---
      case 'chat': return (
        <div className={`flex flex-col h-[calc(100vh-64px)] ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
           {/* Chat Header with Tabs */}
           <div className={`flex-none bg-white dark:bg-slate-800 border-b dark:border-slate-700 sticky top-0 z-20`}>
              <div className="p-3 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                    <MessageCircle className="text-sky-600" size={18} />
                 </div>
                 <div>
                    <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Pusat Pesan</h3>
                    <p className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Bantuan & Diskusi</p>
                 </div>
              </div>
              
              <div className="flex border-t dark:border-slate-700">
                 <button 
                    onClick={() => setChatTab('admin')}
                    className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${chatTab === 'admin' ? 'border-sky-600 text-sky-600 bg-sky-50/50 dark:bg-sky-900/20' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                 >
                    Chat Admin
                 </button>
                 <button 
                    onClick={() => setChatTab('seller')}
                    className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${chatTab === 'seller' ? 'border-sky-600 text-sky-600 bg-sky-50/50 dark:bg-sky-900/20' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                 >
                    Chat Seller
                 </button>
              </div>
           </div>

           {/* Messages Area */}
           <div className="flex-1 overflow-y-auto relative">
              {!user ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                  <User size={40} className="mb-2 opacity-50" />
                  <p className="text-sm">Silakan login untuk memulai chat.</p>
                  <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg text-xs font-bold">Login</button>
                </div>
              ) : (
                chatTab === 'admin' ? (
                    <ChatComponent user={user} isDarkMode={isDarkMode} />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center p-6">
                        <Store size={40} className="mb-3 opacity-50" />
                        <p className="text-sm font-bold">Fitur Chat Seller</p>
                        <p className="text-xs mt-1 max-w-xs">Tanya produk langsung ke penjual? Fitur ini segera hadir! Sementara gunakan WhatsApp di halaman produk.</p>
                    </div>
                )
              )}
           </div>
        </div>
      );
      
      // --- HALAMAN MENU PROFIL (MOBILE) ---
      case 'account-menu': return (
        <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
          {/* Header Profil */}
          <div className={`p-6 mb-4 ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-b border-gray-100'}`}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden border-2 border-sky-500 p-0.5">
                <img src={user?.photoURL || 'https://via.placeholder.com/150'} alt="Profile" className="w-full h-full object-cover rounded-full" />
              </div>
              <div>
                <h2 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{user?.displayName || 'Pengguna'}</h2>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user?.email}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-bold rounded-full">Member</span>
                  {user?.role === 'driver' && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">Driver</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Menu List */}
          <div className={`mx-4 rounded-2xl overflow-hidden shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            {[
              { label: 'Profil Saya', icon: <User size={20} />, action: () => setCurrentView('profile') },
              { label: 'Pesanan Saya', icon: <ShoppingBag size={20} />, action: () => setCurrentView('history') },
              { label: 'Alamat & Lokasi', icon: <MapPin size={20} />, action: () => setCurrentView('address') },
              { label: 'Dashboard Seller', icon: <Store size={20} />, action: () => setCurrentView('dashboard-seller') },
              { label: 'Admin Panel', icon: <LayoutDashboard size={20} />, action: () => setCurrentView('admin-dashboard'), hidden: user?.role !== 'admin' },
              { label: 'Pusat Bantuan', icon: <HelpCircle size={20} />, action: () => setCurrentView('help') },
            ].map((item, idx) => (
              !item.hidden && (
                <button 
                  key={idx} 
                  onClick={item.action}
                  className={`w-full flex items-center justify-between p-4 border-b last:border-0 transition-colors ${isDarkMode ? 'border-slate-700 hover:bg-slate-700 text-gray-200' : 'border-gray-50 hover:bg-gray-50 text-gray-700'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{item.icon}</div>
                    <span className="font-medium text-sm">{item.label}</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              )
            ))}
          </div>

          {/* Logout Button */}
          <div className="mx-4 mt-6">
            <button onClick={() => signOut(auth)} className="w-full py-3 rounded-xl bg-red-50 text-red-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
              <LogOut size={18} /> Keluar Akun
            </button>
          </div>
        </div>
      );

      default: return (
        <>
      {/* 1. Hero Section (Coverflow Effect) */}
      <div 
        className="relative w-full overflow-hidden bg-cover bg-center pt-2 pb-4 md:pt-8 md:pb-24"
        style={{ backgroundImage: homeBgStatic ? `url(${homeBgStatic})` : undefined }}
      >
        {/* Overlay Gelap biar konten tetap terbaca di atas background */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 dark:from-black/60 dark:to-slate-900/90 pointer-events-none"></div>

        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <Swiper
            effect={'coverflow'}
            modules={[Autoplay, Pagination, EffectCoverflow]}
            grabCursor={true}
            centeredSlides={true}
            loop={banners.length > 2}
            slidesPerView={'auto'}
            speed={800}
            autoplay={{ delay: 3000, disableOnInteraction: false }}
            slideToClickedSlide={true}
            coverflowEffect={{
              rotate: 0,
              stretch: 0,
              depth: 250, // Tambah kedalaman biar kartu samping makin mundur
              modifier: 1, // Pastiin ini 1 biar gak numpuk berlebihan
              slideShadows: false,
            }}
            pagination={{ clickable: true, dynamicBullets: true }}
          className="w-full py-1 md:py-8"
          >
            {banners.map((banner) => (
            <SwiperSlide key={banner.id} className="!w-[75%] md:!w-[700px] lg:!w-[900px] aspect-[21/9] transition-all duration-500 [&:not(.swiper-slide-active)]:scale-90 [&:not(.swiper-slide-active)]:opacity-70">
                {banner.link ? (
                  banner.link.startsWith('http') ? (
                    <a 
                      href={banner.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block w-full h-full cursor-pointer"
                    >
                      <img 
                        src={banner.image} 
                        alt={banner.alt} 
                        className="w-full h-full object-cover rounded-xl shadow-2xl border border-white/20 dark:border-slate-600"
                      />
                    </a>
                  ) : (
                    <Link 
                      to={banner.link}
                      className="block w-full h-full cursor-pointer"
                    >
                      <img 
                        src={banner.image} 
                        alt={banner.alt} 
                        className="w-full h-full object-cover rounded-xl shadow-2xl border border-white/20 dark:border-slate-600"
                      />
                    </Link>
                  )
                ) : (
                  <img 
                    src={banner.image} 
                    alt={banner.alt} 
                    className="w-full h-full object-cover rounded-xl shadow-2xl border border-white/20 dark:border-slate-600"
                  />
                )}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
        
        {/* Wave SVG Separator */}
        <div className="absolute -bottom-[1px] left-0 w-full overflow-hidden leading-[0] z-20">
          <svg 
            viewBox="0 0 1200 120" 
            preserveAspectRatio="none" 
            className="relative block w-full h-[20px] md:h-[100px]"
          >
            {/* LAYER 1 (HIJAU): Tetap di atas sebagai frame belakang */}
            <path 
              d="M0,30 C200,30 400,110 600,110 C800,110 1000,30 1200,30 L1200,120 L0,120 Z" 
              className="fill-emerald-500/30" 
            />
            
            {/* LAYER 2 (PUTIH): REVISI - Tengah diturunin, Pinggir dibikin lebih bawah */}
            <path 
              d="M0,100 C300,110 400,45 600,45 C800,45 900,110 1200,100 L1200,120 L0,120 Z" 
              style={{ fill: 'var(--bg-main)' }}
            />
          </svg>
        </div>
      </div>

      {/* 3. Category Menu (Mobile Grid & Desktop Sticky) */}
      
      {/* MOBILE: NiagaGo Banner (Tetap di Atas Kategori) */}
      <div className="md:hidden px-4 mt-8 mb-6 max-w-7xl mx-auto">
        <div className={`w-full rounded-xl p-3 flex flex-row items-center justify-between gap-3 shadow-lg relative overflow-hidden ${isDarkMode ? 'bg-emerald-900/50 border border-emerald-800' : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'}`}>
          <div className="relative z-10 text-left flex-1">
            <div className="flex items-center gap-2 mb-0">
              <Bike className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-white'}`} />
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-emerald-100' : 'text-white'}`}>Butuh Tebengan?</h2>
            </div>
            <p className={`text-[10px] max-w-md leading-tight ${isDarkMode ? 'text-emerald-200' : 'text-emerald-100'}`}>
              Ojek mahasiswa hemat & aman!
            </p>
          </div>
          <button onClick={() => setCurrentView('niagago')} className="relative z-10 px-4 py-2 bg-white text-emerald-600 font-bold text-xs rounded-lg shadow-lg hover:bg-gray-100 transition-all whitespace-nowrap">
            Buka NiagaGo
          </button>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-2 translate-y-2">
            <Bike className="w-20 h-20" />
          </div>
        </div>
      </div>

      {/* MOBILE: Grid Menu (4 Columns) */}
      <div className="md:hidden px-4 mt-6 mb-6">
        <div className="grid grid-cols-4 gap-4">
          {navCategories.map((cat, index) => (
            <button
              key={cat.name}
              onClick={() => {
                setActiveCategoryIndex(index);
                scrollToSection(cat.name);
              }}
              className="flex flex-col items-center gap-2 group"
            >
              <div className={`p-3 rounded-2xl shadow-sm transition-transform group-active:scale-95 ${isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-sky-600 border border-gray-100'}`}>
                {cat.icon}
              </div>
              <span className={`text-[10px] font-medium text-center leading-tight ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP: Sticky Horizontal Nav */}
      <div className="hidden md:block sticky top-[68px] z-40 py-2 mt-6 mb-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className={`p-2 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-sky-50 border-sky-100 shadow-sm'}`}>
            <div 
              className="relative flex items-center justify-start gap-4 overflow-x-auto p-1 no-scrollbar"
              style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
            >
              <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar {
                  display: none;
                }
              `}} />
              {/* Sliding Capsule Background */}
              <div
                className={`absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-out shadow-lg ${isDarkMode ? 'bg-slate-700' : 'bg-white'} ${navCategories[activeCategoryIndex].color}`}
                style={{
                  left: capsuleStyle.left,
                  width: capsuleStyle.width,
                  opacity: capsuleStyle.opacity,
                  border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0'
                }}
              />
              
              {navCategories.map((cat, index) => (
                <button
                  key={cat.name}
                  ref={el => tabsRef.current[index] = el}
                  onClick={() => {
                    setActiveCategoryIndex(index);
                    scrollToSection(cat.name);
                  }}
                  className={`relative z-10 px-4 py-2 md:px-6 md:py-3 text-xs md:text-base font-bold whitespace-nowrap transition-colors uppercase tracking-wider font-azonix ${
                    activeCategoryIndex === index
                      ? (isDarkMode ? 'text-white' : 'text-sky-600')
                      : (isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DESKTOP: NiagaGo Banner (Pindah ke Bawah Kategori & Full Width) */}
      <div ref={niagaGoRef} className="hidden md:block scroll-mt-40 px-4 mt-8 max-w-7xl mx-auto">
        <div className={`w-full rounded-2xl p-6 flex flex-row items-center justify-between gap-6 shadow-lg relative overflow-hidden ${isDarkMode ? 'bg-emerald-900/50 border border-emerald-800' : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'}`}>
          <div className="relative z-10 text-left flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Bike className={`w-6 h-6 ${isDarkMode ? 'text-emerald-400' : 'text-white'}`} />
              <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-emerald-100' : 'text-white'}`}>Butuh Tebengan?</h2>
            </div>
            <p className={`text-sm max-w-md leading-tight ${isDarkMode ? 'text-emerald-200' : 'text-emerald-100'}`}>
              Cobain <b>NiagaGo</b>! Ojek khusus mahasiswa dengan harga bersahabat. Bisa jadi driver juga lho buat nambah uang jajan.
            </p>
          </div>
          <button onClick={() => setCurrentView('niagago')} className="relative z-10 px-6 py-3 bg-white text-emerald-600 font-bold text-base rounded-xl shadow-lg hover:bg-gray-100 transition-all whitespace-nowrap">
            Buka NiagaGo
          </button>
          {/* Decor */}
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10">
            <Bike className="w-48 h-48" />
          </div>
        </div>
      </div>

      {/* FLASH DEAL SECTION (New) */}
      {flashDeal?.isActive && !isExpired && (
        <div className="w-full max-w-6xl mx-auto px-4 mt-6 mb-8 relative z-10">
            <div className="rounded-2xl overflow-hidden shadow-lg bg-gradient-to-r from-blue-900 to-sky-600 flex flex-col md:flex-row min-h-[280px]">
                {/* Left: Banner & Countdown */}
                <div className="w-full md:w-1/3 relative p-8 flex flex-col justify-center text-white overflow-hidden">
                    {/* Background Image with Overlay */}
                    <div className="absolute inset-0 z-0">
                        {flashDeal?.bannerUrl ? (
                            <img src={flashDeal.bannerUrl} className="w-full h-full object-cover opacity-40" alt="Flash Deal" />
                        ) : (
                            <div className="w-full h-full bg-blue-800 opacity-50"></div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/90 to-transparent"></div>
                    </div>
                    
                    <div className="relative z-10">
                        <div className="inline-block px-3 py-1 bg-yellow-400 text-blue-900 text-xs font-extrabold rounded-full mb-3 shadow-md">
                            ⚡ LIMITED OFFER
                        </div>
                        <h3 className="text-4xl font-extrabold italic tracking-tighter mb-2 text-white drop-shadow-lg">
                            FLASH <span className="text-yellow-400">SALE</span>
                        </h3>
                        <p className="text-blue-100 text-sm mb-6 font-medium max-w-[200px]">
                            Serbu diskon gila-gilaan sebelum waktu habis!
                        </p>
                        
                        {/* Countdown Box */}
                        <div className="flex items-center gap-2">
                            <div className="bg-slate-900/80 backdrop-blur-md text-white p-3 rounded-xl min-w-[50px] text-center border border-white/10 shadow-lg">
                                <span className="text-xl font-bold block leading-none">{String(timeLeft.h).padStart(2, '0')}</span>
                                <span className="text-[10px] text-gray-400 uppercase">Jam</span>
                            </div>
                            <span className="text-white font-bold text-xl pb-4">:</span>
                            <div className="bg-slate-900/80 backdrop-blur-md text-white p-3 rounded-xl min-w-[50px] text-center border border-white/10 shadow-lg">
                                <span className="text-xl font-bold block leading-none">{String(timeLeft.m).padStart(2, '0')}</span>
                                <span className="text-[10px] text-gray-400 uppercase">Mnt</span>
                            </div>
                            <span className="text-white font-bold text-xl pb-4">:</span>
                            <div className="bg-slate-900/80 backdrop-blur-md text-white p-3 rounded-xl min-w-[50px] text-center border border-white/10 shadow-lg">
                                <span className="text-xl font-bold block leading-none">{String(timeLeft.s).padStart(2, '0')}</span>
                                <span className="text-[10px] text-gray-400 uppercase">Dtk</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Product List (Horizontal Scroll) */}
                <div className={`w-full md:w-2/3 p-6 flex gap-4 overflow-x-auto scrollbar-hide items-center ${isDarkMode ? 'bg-slate-800/50' : 'bg-white/10 backdrop-blur-sm'}`}>
                    {products.filter(p => flashDeal?.selectedProducts && flashDeal.selectedProducts[p.id]).length === 0 ? (
                        <div className="text-white/80 text-sm font-medium w-full text-center">
                            Produk segera hadir...
                        </div>
                    ) : (
                        products.filter(p => flashDeal?.selectedProducts && flashDeal.selectedProducts[p.id]).map(product => (
                            <div key={product.id} onClick={() => handleProductClick(product)} className={`min-w-[160px] w-[160px] rounded-xl p-3 cursor-pointer transition-all hover:scale-105 hover:shadow-xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'} shadow-md group`}>
                                <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-100">
                                    <img src={product.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={product.name} />
                                    <div className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg shadow-sm z-10">
                                        50%
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <p className={`text-sm font-bold line-clamp-2 leading-snug ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{product.name}</p>
                                    <p className="text-sm font-bold text-red-500">Rp {parseInt(product.price).toLocaleString('id-ID')}</p>
                                    
                                    {/* Progress Bar */}
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
                                        <div className="bg-gradient-to-r from-red-500 to-orange-500 h-full rounded-full" style={{ width: '85%' }}></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                                        <span>Terjual 85%</span>
                                        <span className="text-red-500">🔥 Segera Habis</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}

      {/* 3. Content Sections */}
      <div className="max-w-7xl mx-auto px-4 space-y-10 pb-10 mt-6 text-left">
        
        {/* SECTION: Populer */}
        <div ref={populerRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Populer & Rekomendasi</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.slice(0, 12).map((product) => (
              <ProductCard 
                key={product.id} 
                product={{...product, image: product.mediaUrl || 'https://via.placeholder.com/150', price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`}}
                className="product-card-home"
                onClick={() => handleProductClick(product)}
              />
            ))}
            {products.length === 0 && (
               <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

        {/* SECTION: Isi Pulsa */}
        <div ref={pulsaRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Isi Pulsa & Paket Data</h2>
            <button onClick={() => setCurrentView('topup')} className="text-sky-600 text-sm font-bold hover:underline">Buka Menu</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.filter(p => p.category === 'Isi Pulsa').slice(0, 6).map((product) => (
              <ProductCard key={product.id} product={{...product, image: product.mediaUrl, price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`}} className="product-card-home" onClick={() => handleProductClick(product)} />
            ))}
            {products.filter(p => p.category === 'Isi Pulsa').length === 0 && (
                <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

        {/* SECTION: Makan */}
        <div ref={makanRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Makan Hemat</h2>
            <button onClick={() => setCurrentView('food')} className="text-sky-600 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.filter(p => p.category === 'Makan').slice(0, 6).map((product) => (
              <ProductCard key={product.id} product={{...product, image: product.mediaUrl, price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`}} className="product-card-home" onClick={() => handleProductClick(product)} />
            ))}
            {products.filter(p => p.category === 'Makan').length === 0 && (
                <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

        {/* SECTION: Skin Care */}
        <div ref={skincareRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Skin Care Glowing</h2>
            <button onClick={() => setCurrentView('skincare')} className="text-sky-600 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.filter(p => p.category === 'Skin Care').slice(0, 6).map((product) => (
              <ProductCard key={product.id} product={{...product, image: product.mediaUrl, price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`}} className="product-card-home" onClick={() => handleProductClick(product)} />
            ))}
            {products.filter(p => p.category === 'Skin Care').length === 0 && (
                <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

        {/* SECTION: Fashion */}
        <div ref={fashionRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Fashion Terkini</h2>
            <button onClick={() => setCurrentView('fashion')} className="text-sky-600 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.filter(p => p.category === 'Fashion').slice(0, 6).map((product) => (
              <ProductCard key={product.id} product={{...product, image: product.mediaUrl, price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`}} className="product-card-home" onClick={() => handleProductClick(product)} />
            ))}
            {products.filter(p => p.category === 'Fashion').length === 0 && (
                <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

        {/* SECTION: Jasa */}
        <div ref={jasaRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Jasa Mahasiswa</h2>
            <button onClick={() => setCurrentView('jasa')} className="text-sky-600 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.filter(p => p.category === 'Jasa').slice(0, 6).map((product) => (
              <ProductCard key={product.id} product={{...product, image: product.mediaUrl, price: `Rp ${(parseInt(product.price) || 0).toLocaleString('id-ID')}`}} className="product-card-home" onClick={() => handleProductClick(product)} />
            ))}
            {products.filter(p => p.category === 'Jasa').length === 0 && (
                <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

        {/* SECTION: Top Up Game */}
        <div ref={gameRef} className="scroll-mt-40">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm md:text-xl font-azonix font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Top Up Game</h2>
            <button onClick={() => setCurrentView('digital-center')} className="text-sky-600 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.filter(p => p.category === 'Game').slice(0, 6).map((product) => (
              <div 
                key={product.id}
                onClick={() => handleGameSelect({ ...product, fields: product.inputFields })}
                className={`rounded-xl border p-3 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:border-sky-500' : 'bg-white border-gray-100 hover:border-sky-200'}`}
              >
                <div className={`w-full aspect-square rounded-lg overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <img src={product.mediaUrl || 'https://via.placeholder.com/150'} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div className="text-center w-full">
                  <p className={`text-sm font-bold line-clamp-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{product.name}</p>
                  <p className={`text-xs mt-1 font-bold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {parseInt(product.price).toLocaleString('id-ID')}</p>
                </div>
              </div>
            ))}
            {products.filter(p => p.category === 'Game').length === 0 && (
                <p className={`col-span-full text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Produk belum tersedia</p>
            )}
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <footer className="text-white pt-16 pb-8 mt-auto border-t border-slate-800 relative bg-slate-900 overflow-hidden">
        {/* Background Image Layer (Saturated) */}
        {footerBg && (
            <div 
                className="absolute inset-0 bg-cover bg-center z-0"
                style={{ 
                    backgroundImage: `url(${footerBg})`,
                    filter: 'saturate(1.5) contrast(1.1)' // Boost warna biar seger
                }}
            ></div>
        )}
        
        {/* Gradient Overlay (Premium Look) */}
        {footerBg && (
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent z-0"></div>
        )}

        <div className="max-w-7xl mx-auto px-4 relative z-10" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {/* Kolom 1: Brand */}
            <div>
              <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 font-azonix tracking-wider text-white drop-shadow-lg">
                SobatNiaga
              </h3>
              <p className="text-slate-200 text-sm leading-relaxed font-medium">
                SobatNiaga - Solusi Top Up Game, Voucher, dan Fashion Terlengkap & Terpercaya di Indonesia.
              </p>
            </div>

            {/* Kolom 2: Layanan */}
            <div className="border-b border-slate-800 md:border-none pb-4 md:pb-0">
              <h4 className="font-bold text-lg mb-4 text-sky-400 drop-shadow-md">Layanan Kami</h4>
              <ul className="space-y-3 text-sm text-slate-200 font-medium">
                <li><button onClick={() => { setCurrentView('digital-center'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Top Up Game</button></li>
                <li><button onClick={() => { setCurrentView('topup'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Pulsa & Data</button></li>
                <li><button onClick={() => { setCurrentView('fashion'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Fashion Pria & Wanita</button></li>
                <li><button onClick={() => { setCurrentView('food'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Makan Hemat</button></li>
              </ul>
            </div>

            {/* Kolom 3: Informasi */}
            <div className="border-b border-slate-800 md:border-none pb-4 md:pb-0">
              <h4 className="font-bold text-lg mb-4 text-sky-400 drop-shadow-md">Informasi</h4>
              <ul className="space-y-3 text-sm text-slate-200 font-medium">
                <li><button onClick={() => { setCurrentView('about'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Tentang Kami</button></li>
                <li><button onClick={() => { setCurrentView('terms'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Syarat & Ketentuan</button></li>
                <li><button onClick={() => { setCurrentView('privacy'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Kebijakan Privasi</button></li>
                <li><button onClick={() => { setCurrentView('help'); window.scrollTo(0,0); }} className="hover:text-sky-300 transition-colors text-left">Pusat Bantuan</button></li>
              </ul>
            </div>

            {/* Kolom 4: Sosmed */}
            <div className="pb-4 md:pb-0">
              <h4 className="font-bold text-lg mb-4 text-sky-400 drop-shadow-md">Ikuti Kami</h4>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-sky-600 hover:border-sky-600 transition-all shadow-lg">
                  <Instagram size={20} />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-red-600 hover:border-red-600 transition-all shadow-lg">
                  <Youtube size={20} />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-blue-600 hover:border-blue-600 transition-all shadow-lg">
                  <Facebook size={20} />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-sky-400 hover:border-sky-400 transition-all shadow-lg">
                  <Twitter size={20} />
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 text-center">
            <p className="text-slate-300 text-sm font-medium">© 2026 SobatNiaga. All Rights Reserved.</p>
          </div>
        </div>
      </footer>
        </>
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)' }}>
      {/* Global Header (Sticky) */}
      <nav className={`sticky top-0 z-[100] backdrop-blur-md transition-all duration-300 border-b ${isDarkMode ? 'bg-slate-900/50 border-white/5' : 'bg-white/50 border-gray-200/30'}`}>
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-2 md:py-3 flex items-center justify-between gap-2 md:gap-8">
          {/* Left: Brand or Back Button */}
          <div className="flex-shrink-0 flex items-center gap-2 md:gap-3">
            <h1 className="text-lg md:text-2xl font-bold text-sky-600 tracking-tight cursor-pointer" onClick={() => setCurrentView('home')}>
              SobatNiaga
            </h1>
          </div>

          {/* Center: Search Bar (Hidden on mobile if needed, or simplified) */}
          <div className="flex-1 relative" ref={searchRef}>
            <div className="absolute inset-y-0 left-0 pl-2 md:pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400 md:w-[18px] md:h-[18px]" />
            </div>
            <input
              type="text"
              className="block w-full pl-8 md:pl-10 pr-2 md:pr-3 py-1.5 md:py-2 border rounded-full text-xs md:text-sm focus:ring-2 focus:ring-sky-500 transition-all theme-card theme-text placeholder:text-gray-400"
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
          <div className="flex items-center gap-1.5 md:gap-3 theme-text">
            {/* Notifikasi Dropdown */}
            <div className="relative">
              <button 
                onClick={() => {
                  setIsNotificationOpen(!isNotificationOpen);
                  setIsProfileOpen(false);
                }}
                className="hover:text-sky-600 relative flex items-center p-1.5 md:p-2 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-all"
              >
                <Bell size={20} className="md:w-[22px] md:h-[22px]" />
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
              className="hover:text-sky-600 relative p-1.5 md:p-2 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-all"
            >
              <ShoppingCart size={20} className="md:w-[22px] md:h-[22px]" />
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
                className="hover:text-sky-600 flex items-center focus:outline-none p-0.5 md:p-1 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-all"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-gray-200 object-cover" />
                ) : (
                  <User size={20} className="md:w-[22px] md:h-[22px]" />
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
      <main className="flex-1 flex flex-col w-full">
        {renderContent()}
      </main>

      {/* Modal Top Up Game (Global) */}
      {selectedGame && TopUpModal && (
        <TopUpModal 
          game={selectedGame} 
          user={user} 
          onClose={() => setSelectedGame(null)} />
      )}

      {/* Customer Service Chat Widget */}
      {currentView !== 'chat' && <DraggableChatWidget onClick={() => setCurrentView('chat')} icon={chatIcon} />}

      {/* --- BOTTOM NAVIGATION BAR (MOBILE ONLY) --- */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 z-[100] border-t pb-safe transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className="flex justify-around items-center h-16">
          <button onClick={() => setCurrentView('home')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'home' ? 'text-sky-600' : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>
            <HomeIcon size={24} strokeWidth={currentView === 'home' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          
          <button onClick={() => setCurrentView('chat')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'chat' ? 'text-sky-600' : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>
            <MessageCircle size={24} />
            <span className="text-[10px] font-medium">Chat</span>
          </button>

          <button onClick={() => setCurrentView('dashboard-seller')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'dashboard-seller' ? 'text-sky-600' : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>
            <Store size={24} strokeWidth={currentView === 'dashboard-seller' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Seller</span>
          </button>

          <button onClick={() => setCurrentView('account-menu')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'account-menu' ? 'text-sky-600' : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>
            <User size={24} strokeWidth={currentView === 'account-menu' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- DRAGGABLE CHAT WIDGET ---
const DraggableChatWidget = ({ onClick, icon }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 160 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const offset = useRef({ x: 0, y: 0 });

  const handleStart = (clientX, clientY) => {
    setIsDragging(false);
    if (dragRef.current) {
        const rect = dragRef.current.getBoundingClientRect();
        offset.current = { x: clientX - rect.left, y: clientY - rect.top };
    }
  };

  const handleMove = (clientX, clientY) => {
    setIsDragging(true);
    setPosition({
        x: clientX - offset.current.x,
        y: clientY - offset.current.y
    });
  };

  return (
    <div
        ref={dragRef}
        style={{ left: position.x, top: position.y, touchAction: 'none' }}
        className="fixed z-[999] cursor-move"
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => { if(e.buttons === 1) handleMove(e.clientX, e.clientY); }}
        onClick={() => { if (!isDragging) onClick(); }}
    >
        <div className="w-14 h-14 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-lg hover:bg-sky-700 transition-colors border-2 border-white overflow-hidden">
            {icon ? <img src={icon} className="w-full h-full object-cover" alt="Chat" /> : <MessageCircle size={28} />}
        </div>
    </div>
  );
};

// --- INTERNAL CHAT COMPONENT ---
const ChatComponent = ({ user, isDarkMode }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;
    const chatRef = ref(db, `chats/${user.uid}/messages`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    await push(ref(db, `chats/${user.uid}/messages`), {
      text,
      sender: 'user',
      timestamp: serverTimestamp()
    });
    await update(ref(db, `chats/${user.uid}`), {
      userName: user.displayName,
      hasUnreadAdmin: true,
      lastMessageTime: serverTimestamp()
    });
  };

  return (
    <>
      <div className="p-3 space-y-3 pb-20">
          {messages.map(m => (
             <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${m.sender === 'user' ? 'bg-sky-600 text-white rounded-tr-none' : (isDarkMode ? 'bg-slate-800 text-gray-200' : 'bg-white text-gray-800 border') + ' rounded-tl-none'}`}>
                   {m.text}
                   <p className={`text-[9px] mt-1 text-right opacity-70`}>{new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
             </div>
          ))}
          <div ref={bottomRef} />
      </div>
      
      <div className={`fixed bottom-[64px] left-0 right-0 p-2 border-t z-[110] ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 max-w-7xl mx-auto items-center">
             <input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder="Tulis pesan..." 
                className={`flex-1 py-2 px-3 rounded-full border text-xs outline-none ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`}
             />
             <button type="submit" className="p-2 bg-sky-600 text-white rounded-full hover:bg-sky-700 shadow-sm flex-shrink-0"><Send size={16}/></button>
          </form>
       </div>
    </>
  );
};

export default Home;