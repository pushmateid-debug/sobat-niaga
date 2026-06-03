import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Star, MapPin, Search, ShoppingBag, CheckCircle, Copy, Ticket, Award, MessageCircle, Loader2, Share2, Clock, Menu, Flag, HelpCircle, Grid, UserPlus, Check, User, Edit } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { db, dbFirestore } from '../config/firebase'; // Import dbFirestore
import { ref, onValue, query, orderByChild, equalTo, get } from 'firebase/database';
import { doc, onSnapshot, writeBatch, arrayUnion, arrayRemove, increment } from 'firebase/firestore'; // Import Firestore functions
import Swal from 'sweetalert2';

const StoreProfile = ({ sellerId, onBack, onProductClick, currentUserId, onChatClick, onViewMyProfile }) => {
  const params = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme() || { theme: 'light' };
  const isDarkMode = theme === 'dark';
  const effectiveSellerId = sellerId || params?.sellerId; // Ambil dari props atau URL
  
  // 🛡️ PROTEKSI OWNER: Cek apakah user yang login adalah pemilik toko ini
  const isOwner = currentUserId && effectiveSellerId && String(currentUserId) === String(effectiveSellerId);

  const [sellerData, setSellerData] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'best_seller'
  const [searchQuery, setSearchQuery] = useState('');
  const [vouchers, setVouchers] = useState([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // State Hamburger Menu
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Fetch Data Seller & Produk & Follow Status
  useEffect(() => {
    // FIX: Cek effectiveSellerId, jangan sellerId saja biar link langsung gak stuck loading
    if (!effectiveSellerId) return;

    let isMounted = true; // Flag to prevent state updates on unmounted component
    let productsLoaded = false;
    let sellerDataLoaded = false;

    const checkAndSetLoading = () => {
      if (isMounted && productsLoaded && sellerDataLoaded) {
        setIsLoading(false);
      }
    };

    // 1. Ambil Info Seller (Sekali ambil saja)
    get(ref(db, `users/${effectiveSellerId}`)).then(userSnap => {
      if (isMounted) {
        if (userSnap.exists()) {
          setSellerData(userSnap.val());
        } else {
          // Handle case where seller data doesn't exist
          setSellerData(null); // Explicitly set to null
        }
        sellerDataLoaded = true;
        checkAndSetLoading();
      }
    }).catch(err => console.error("Gagal ambil info seller:", err));

    // 2. Realtime listener untuk Produk (Realtime DB)
    const productsRef = query(ref(db, 'products'), orderByChild('sellerId'), equalTo(effectiveSellerId));
    const unsubProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      const loadedProducts = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      
      // Filter Produk Aktif Saja
      const activeProducts = loadedProducts.filter(p => p.isActive !== false);

      // Sort Terbaru
      activeProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setProducts(activeProducts);

      // Ekstrak Voucher Unik dari Produk
      const uniqueVouchers = [];
      const seenCodes = new Set();
      
      activeProducts.forEach(p => {
        if (p.voucherCode && p.voucherAmount && !seenCodes.has(p.voucherCode)) {
          seenCodes.add(p.voucherCode);
          uniqueVouchers.push({
            code: p.voucherCode,
            amount: p.voucherAmount,
            minPurchase: 0
          });
        }
      });
      setVouchers(uniqueVouchers);
      productsLoaded = true;
      checkAndSetLoading();
    });

    // 3. Realtime listener untuk Status Follow (Firestore)
    const userFirestoreRef = doc(dbFirestore, 'users', effectiveSellerId);
    const unsubFollow = onSnapshot(userFirestoreRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const isUserFollowing = currentUserId && Array.isArray(data.followersList) && data.followersList.includes(currentUserId);
            setIsFollowing(!!isUserFollowing);
        } else {
            setIsFollowing(false);
        }
    }, (err) => {
      console.error("Follow Listener Error:", err);
    });

    // Cleanup: Matikan semua listener pas pindah halaman
    return () => {
      unsubProducts();
      isMounted = false; // Prevent state updates
      unsubFollow(); // Cukup panggil fungsi unsubFollow
    };
  }, [sellerId, currentUserId]);

  // Copy Voucher Code
  const handleCopyVoucher = (code) => {
    navigator.clipboard.writeText(code);
    Swal.fire({
      icon: 'success',
      title: 'Kode Disalin!',
      text: `Gunakan kode ${code} saat checkout.`,
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'top'
    });
  };

  // Handle Chat WhatsApp
  const handleChat = () => {
    if (onChatClick) {
      onChatClick(effectiveSellerId, displayStoreName, displayPhoto, sellerData?.email ?? '');
      return;
    }

    const phone = sellerData?.phoneNumber; // Tambah proteksi agar tidak crash
    if (phone) {
      const formattedPhone = phone.replace(/^0/, '62');
      const message = `Halo ${sellerData?.sellerInfo?.storeName || 'Penjual'}, saya ingin tanya produk di SobatNiaga.`;
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      Swal.fire('Info', 'Nomor penjual tidak tersedia.', 'info');
    }
  };

  const handleFollow = async () => {
    if (!currentUserId) return Swal.fire('Login Dulu', 'Silakan login untuk mengikuti toko ini.', 'warning');
    if (isOwner) return Swal.fire('Tidak Bisa', 'Anda tidak bisa mengikuti toko Anda sendiri.', 'warning');
    if (followLoading) return;

    setFollowLoading(true);
    const batch = writeBatch(dbFirestore);
    const targetStoreRef = doc(dbFirestore, 'users', effectiveSellerId); // Seller's user document
    const currentUserRef = doc(dbFirestore, 'users', currentUserId); // Current user's document

    try {
        if (isFollowing) {
            // UNFOLLOW
            batch.update(targetStoreRef, {
                followersList: arrayRemove(currentUserId),
                followersCount: increment(-1)
            });
            batch.update(currentUserRef, {
                followingList: arrayRemove(effectiveSellerId),
                followingCount: increment(-1)
            });
        } else {
            // FOLLOW
            batch.update(targetStoreRef, {
                followersList: arrayUnion(currentUserId),
                followersCount: increment(1)
            });
            batch.update(currentUserRef, {
                followingList: arrayUnion(effectiveSellerId),
                followingCount: increment(1)
            });
        }
        await batch.commit();
        // UI will update via onSnapshot listener
    } catch (error) {
        console.error("Error toggling follow:", error);
        Swal.fire('Gagal', 'Terjadi kesalahan saat memproses permintaan.', 'error');
    } finally {
        setFollowLoading(false);
    }
  };

  // Handle Share Store
  const handleShare = () => {
    const storeLink = window.location.href;
    navigator.clipboard.writeText(storeLink);
    Swal.fire({
      icon: 'success',
      title: 'Link Toko Disalin!',
      text: 'Bagikan ke teman-temanmu ya!',
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'top'
    });
  };

  // Safe Back Logic
  const handleInternalBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  // Filter Produk (Tab & Search)
  const getFilteredProducts = () => {
    let filtered = products;

    // Filter Search
    if (searchQuery) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Filter Tab
    if (activeTab === 'best_seller') {
      // Simulasi logic terlaris (karena data 'sold' masih dummy, kita acak dikit atau filter rating tinggi)
      filtered = filtered.filter(p => (p.sold || 0) > 10 || (p.rating || 0) >= 4.8);
    }

    return filtered;
  };

  const filteredProducts = getFilteredProducts();

  // Hitung Statistik Toko
  const totalSold = products.reduce((acc, curr) => acc + (curr.sold || 0), 0);
  const avgRating = 4.8; // Hardcoded sementara, nanti hitung rata-rata rating produk

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={40} className="animate-spin text-sky-600" />
      </div>
    );
  }

  // Handle case where sellerData is null after loading (e.g., seller doesn't exist)
  if (!sellerData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-700 p-4 text-center">
        <Flag size={48} className="text-gray-400 mb-4" />
        <h2 className="text-xl font-bold">Toko Tidak Ditemukan</h2>
        <p className="mt-2">Profil toko yang lo cari gak ada atau udah dihapus, Bro!</p>
        <button onClick={handleInternalBack} className="mt-6 px-6 py-2 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700">
          Kembali
        </button>
      </div>
    );
  }

  // Helper Variables for Display (Fallback Logic)
  const displayStoreName = sellerData?.sellerInfo?.storeName || (products?.length > 0 ? products[0]?.storeName : 'Nama Toko');
  const displayAddress = sellerData?.sellerInfo?.storeAddress || 'Lokasi tidak tersedia';
  // Fallback ke placeholder jika photoURL kosong/null/undefined
  const displayPhoto = sellerData?.photoURL && sellerData.photoURL !== '' 
    ? sellerData.photoURL
    : '/placeholder.png'; // Ganti ke path lokal
  const isTrusted = sellerData?.sellerInfo?.isTrustedSeller ?? false;

  return (
    <div className={`min-h-screen pb-24 font-sans transition-colors ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'}`}>
      
      {/* 1. Sticky Header (Navigasi) */}
      <div className={`sticky top-0 z-50 backdrop-blur-md shadow-sm border-b transition-all ${isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between h-full">
          <button onClick={handleInternalBack} className="p-1 rounded-full hover:bg-sky-50 transition-colors text-sky-600">
            <ChevronLeft size={32} />
          </button>
          
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Cari produk di toko ini..." 
                className={`w-full pl-10 pr-4 py-2 rounded-full text-sm outline-none focus:ring-2 focus:ring-sky-500 transition-all ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-100'}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 text-sky-600 hover:bg-sky-50 rounded-full">
              <Menu size={24} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        
        {/* 2. Header Toko (Modern Flexbox Style) */}
        <div className={`border-b transition-colors ${isDarkMode ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-slate-800' : 'bg-gradient-to-b from-sky-50 to-white border-gray-100'}`}>
          <div className="max-w-5xl mx-auto p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            {/* Sisi Kiri: Profil Image & Info Utama */}
            <div className="flex items-center gap-4 md:gap-8">
              <div className="relative shrink-0">
                  {sellerData?.photoURL ? (
                    // JIKA FOTO GMAIL ADA: Tampilkan dengan border mewah dan animasi fade-in
                    <img 
                        src={sellerData.photoURL} 
                        alt={displayStoreName || "Store Profile"} 
                        className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-slate-600 shadow-md animate-fade-in"
                    />
                  ) : (
                    // JIKA SEDANG LOADING/KOSONG: Ganti icon orang lama dengan Skeleton Pulse bunder abu-abu
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-700 animate-pulse border-2 border-slate-600" />
                  )}
                  {isTrusted && (
                      <div className="absolute bottom-1 right-1 bg-white rounded-full p-0.5 shadow">
                          <CheckCircle size={20} className="text-blue-500 fill-blue-100" />
                      </div>
                  )}
              </div>

              <div className="text-left min-w-0">
                <div className="flex items-center gap-2">
                    <h2 className={`text-base md:text-2xl font-black leading-tight truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{displayStoreName}</h2>
                    <div className="flex items-center gap-1 bg-yellow-400/10 px-1.5 py-0.5 rounded-lg border border-yellow-400/20">
                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-[10px] md:text-xs font-black text-yellow-700">{avgRating}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-green-600 uppercase tracking-tighter">Online</span>
                    <span className="text-gray-300 hidden sm:inline">•</span>
                    <div className="hidden sm:flex items-center gap-1 text-gray-500 text-xs">
                        <MapPin size={12} />
                        <span className="font-medium truncate max-w-[150px] md:max-w-none">{displayAddress}</span>
                    </div>
                </div>
                <p className="text-[10px] md:text-xs text-gray-500 mt-1 font-bold"><span className="text-gray-900">{totalSold}+</span> Terjual</p>
              </div>
            </div>

            {/* Sisi Kanan: Tombol Aksi Vertikal Ramping */}
            <div className="flex flex-col gap-2 shrink-0 w-32 md:w-44">
                {isOwner ? (
                    // Jika ini toko milik user sendiri
                    <>
                        <button
                            onClick={() => onViewMyProfile ? onViewMyProfile() : navigate('/profile')} // Safety navigation
                            className="px-3 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center justify-center gap-1.5 md:gap-2 transition-all active:scale-95 bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700"
                        >
                            <Edit size={14}/> Edit Profil
                        </button>
                        <button
                            onClick={handleShare} // Fungsi bagikan link toko
                            className="px-3 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center justify-center gap-1.5 md:gap-2 transition-all bg-white border border-sky-600 text-sky-600 hover:bg-sky-50 active:scale-95"
                        >
                            <Share2 size={14}/> Bagikan Profil
                        </button>
                    </>
                ) : (
                    // Jika ini toko orang lain (Pembeli yang lihat)
                    <>
                        <button
                            onClick={handleFollow}
                            disabled={followLoading}
                            className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter shadow-sm transition-all active:scale-95 border ${
                                isFollowing
                                    ? (isDarkMode ? 'bg-slate-700 text-gray-300 border-slate-600 hover:bg-slate-600' : 'bg-slate-100 text-gray-500 border-gray-300 hover:bg-gray-200')
                                    : 'bg-green-600 text-white border-green-500 hover:bg-green-700'
                            }`}
                        >
                            {followLoading ? <Loader2 size={12} className="animate-spin mx-auto" /> : (isFollowing ? 'Diikuti' : 'Ikuti')}
                        </button>
                        <button
                            onClick={handleChat}
                            className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all active:scale-95 ${isDarkMode ? 'bg-sky-600 text-white shadow-lg shadow-sky-200/50 hover:bg-sky-700' : 'bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100'}`}
                        >
                            Chat Penjual
                        </button>
                    </>
                )}
            </div>
          </div>
        </div>

        {/* 3. Section Voucher Toko (Blue Theme) */}
        {vouchers.length > 0 && (
            <div className="px-4 mb-2 mt-1">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {vouchers.map((v, idx) => (
                        <div key={idx} className="flex-shrink-0 bg-sky-50 border border-sky-200 rounded-lg p-2 flex items-center gap-2 min-w-[200px] relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500"></div>
                            <div className="flex-1 ml-2">
                                <p className="text-xs font-bold text-sky-700">Diskon Rp {parseInt(v.amount).toLocaleString('id-ID')}</p>
                                <p className="text-[9px] text-sky-600">Kode: <span className="font-mono font-bold">{v.code}</span></p>
                            </div>
                            <button 
                                onClick={() => handleCopyVoucher(v.code)}
                                className="bg-white text-sky-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-sky-100 transition-colors shadow-sm"
                            >
                                Klaim
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* 4. Katalog Produk */}
        <div className="px-4">
            {/* Tabs */}
            <div className={`flex justify-around items-center border-b mb-2 sticky top-[52px] z-40 py-2 transition-all ${
                isDarkMode 
                    ? 'bg-[#1e293b] border-slate-700 text-gray-300' 
                    : 'bg-white border-gray-200 text-gray-600'
            }`}>
                <button 
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 pb-2 text-xs font-bold transition-all relative ${activeTab === 'all' ? 'text-blue-500' : (isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')}`}
                >
                    Semua Produk
                    {activeTab === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('best_seller')} 
                    className={`flex-1 pb-2 text-xs font-bold transition-all relative ${activeTab === 'best_seller' ? 'text-blue-500' : (isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')}`}
                >
                    Terlaris
                    {activeTab === 'best_seller' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('category')}
                    className={`flex-1 pb-2 text-xs font-bold transition-all relative ${activeTab === 'category' ? 'text-blue-500' : (isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')}`}
                >
                    Kategori
                    {activeTab === 'category' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full"></div>}
                </button>
            </div>

            {/* Product Grid (Staggered Animation) */}
            {products.length === 0 ? (
                <div className="text-center py-20">
                    <ShoppingBag size={48} className="mx-auto text-gray-300 mb-3" />
                    <h3 className="text-gray-800 font-bold mb-1">Toko ini belum memiliki produk.</h3>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                    <Search size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">Produk tidak ditemukan.</p>
                </div>
            ) : activeTab === 'category' ? (
                <div className="text-center py-10">
                    <Grid size={40} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500 text-sm">Kategori produk akan muncul di sini.</p>
                    <p className="text-xs text-gray-400 mt-1">(Fitur Kategori Segera Hadir)</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 pb-12">
                    {filteredProducts.map((product, index) => (
                        <div 
                            key={product.id}
                            onClick={() => onProductClick ? onProductClick(product) : navigate('/')}
                            className={`rounded-2xl p-3 border transition-all cursor-pointer group hover:-translate-y-1 ${isDarkMode ? 'bg-[#1e293b] border-slate-700 shadow-none' : 'bg-white border-gray-100 shadow-sm'}`}
                        >
                            <div className="relative aspect-square bg-gray-50 overflow-hidden">
                                <img 
                                    src={product.mediaUrl || 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=300'}
                                    alt={product.name} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                    loading="lazy"
                                />
                                {product.voucherCode && (
                                    <div className="absolute top-2 right-2 bg-sky-600/90 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        <Ticket size={10} /> Promo
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <h3 className={`text-xs md:text-sm font-bold line-clamp-2 mb-1 leading-snug min-h-[2.5em] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{product.name}</h3>
                                <div className="flex items-end justify-between mt-2">
                                    <div className="text-[#FFD662] font-black text-sm md:text-base mt-1">
                                        <span className="text-xs font-medium mr-0.5">Rp</span>
                                        <span>{parseInt(product.price).toLocaleString('id-ID')}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                        <Star size={10} className="text-yellow-400 fill-yellow-400" /> 4.8
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>

    </div>
  );
};

export default StoreProfile;