import React, { useState, useEffect } from 'react';
import { ArrowLeft, Star, MapPin, Search, ShoppingBag, CheckCircle, Copy, Ticket, Award, MessageCircle, Loader2, Share2, Clock } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, onValue, query, orderByChild, equalTo, get } from 'firebase/database';
import Swal from 'sweetalert2';

const StoreProfile = ({ sellerId, onBack, onProductClick }) => {
  const [sellerData, setSellerData] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'best_seller'
  const [searchQuery, setSearchQuery] = useState('');
  const [vouchers, setVouchers] = useState([]);

  // Fetch Data Seller & Produk
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Ambil Info Seller (User Profile + Seller Info)
        const userSnap = await get(ref(db, `users/${sellerId}`));
        if (userSnap.exists()) {
          const data = userSnap.val();
          console.log("DEBUG: Data Seller (Cek photoURL):", data); // Debugging: Cek di Console Browser
          setSellerData(data);
        }

        // 2. Ambil Produk Seller Ini
        const productsRef = query(ref(db, 'products'), orderByChild('sellerId'), equalTo(sellerId));
        onValue(productsRef, (snapshot) => {
          const data = snapshot.val();
          const loadedProducts = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
          
          // Filter Produk Aktif Saja
          const activeProducts = loadedProducts.filter(p => p.isActive !== false);

          // Sort Terbaru
          activeProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setProducts(activeProducts);

          // 3. Ekstrak Voucher Unik dari Produk
          const uniqueVouchers = [];
          const seenCodes = new Set();
          
          activeProducts.forEach(p => {
            if (p.voucherCode && p.voucherAmount && !seenCodes.has(p.voucherCode)) {
              seenCodes.add(p.voucherCode);
              uniqueVouchers.push({
                code: p.voucherCode,
                amount: p.voucherAmount,
                minPurchase: 0 // Simplifikasi
              });
            }
          });
          setVouchers(uniqueVouchers);
          setIsLoading(false);
        });
      } catch (error) {
        console.error("Error fetching store data:", error);
        setIsLoading(false);
      }
    };

    if (sellerId) fetchData();
  }, [sellerId]);

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
    const phone = sellerData?.phoneNumber;
    if (phone) {
      const formattedPhone = phone.replace(/^0/, '62');
      const message = `Halo ${displayStoreName}, saya ingin tanya produk di SobatNiaga.`;
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      Swal.fire('Info', 'Nomor penjual tidak tersedia.', 'info');
    }
  };

  // Handle Share Store
  const handleShare = () => {
    const storeLink = `https://sobatniaga.com/store/${sellerId}`; // Simulasi Link
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

  // Helper Variables for Display (Fallback Logic)
  const displayStoreName = sellerData?.sellerInfo?.storeName || (products.length > 0 ? products[0].storeName : 'Nama Toko');
  const displayAddress = sellerData?.sellerInfo?.storeAddress || 'Lokasi tidak tersedia';
  // Fallback ke placeholder jika photoURL kosong/null/undefined
  const displayPhoto = sellerData?.photoURL && sellerData.photoURL !== '' 
    ? sellerData.photoURL 
    : 'https://via.placeholder.com/150?text=SobatNiaga';
  const isTrusted = sellerData?.sellerInfo?.isTrustedSeller || false;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      
      {/* 1. Sticky Header (Navigasi) */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100 transition-all">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600">
            <ArrowLeft size={24} />
          </button>
          
          {/* Nama Toko Muncul Pas Scroll (Bisa di-tweak pake scroll listener, tapi gini aja udah oke buat sticky) */}
          <div className="flex-1 flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border border-gray-200 shadow-[0_0_8px_rgba(14,165,233,0.4)]">
               <img src={displayPhoto} alt="Store" className="w-full h-full object-cover" onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=SobatNiaga'; }} />
            </div>
            <div>
                <h1 className="text-sm font-bold text-gray-800 truncate">{displayStoreName}</h1>
                <p className="text-[10px] text-green-600 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Online
                </p>
            </div>
          </div>

          <button className="p-2 text-gray-500 hover:text-sky-600">
            <Search size={20} />
          </button>
          <button onClick={handleShare} className="p-2 text-gray-500 hover:text-sky-600">
            <Share2 size={20} />
          </button>
          <button onClick={handleChat} className="p-2 text-gray-500 hover:text-sky-600">
            <MessageCircle size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        
        {/* 2. Header Toko (Banner & Info) */}
        <div className="relative bg-white mb-4">
            {/* Banner Background (Gradient Estetik) */}
            <div className="h-32 bg-gradient-to-r from-sky-400 to-indigo-500 relative overflow-hidden">
                <div className="absolute inset-0 bg-black/10"></div>
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
            </div>

            {/* Profile Info */}
            <div className="px-4 pb-6">
                <div className="flex flex-col md:flex-row items-start md:items-end gap-4 -mt-10 relative z-10">
                    {/* Foto Profil Besar */}
                    <div className="w-24 h-24 rounded-full border-4 border-white shadow-[0_0_15px_rgba(14,165,233,0.5)] overflow-hidden bg-white relative group">
                        <img 
                          src={displayPhoto} 
                          alt="Store Profile" 
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=SobatNiaga'; }} 
                        />
                    </div>

                    {/* Detail Toko */}
                    <div className="flex-1 mt-2 md:mt-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-gray-800">{displayStoreName}</h2>
                            {isTrusted && (
                                <CheckCircle size={18} className="text-blue-500 fill-blue-100" />
                            )}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs mt-1">
                            <MapPin size={12} />
                            <span>{displayAddress}</span>
                        </div>
                    </div>

                    {/* Statistik */}
                    <div className="flex gap-6 mt-4 md:mt-0 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="text-center">
                            <p className="text-xs text-gray-500 font-medium">Rating</p>
                            <p className="font-bold text-gray-800 flex items-center gap-1 justify-center">
                                <Star size={12} className="text-yellow-400 fill-yellow-400" /> {avgRating}
                            </p>
                        </div>
                        <div className="w-px bg-gray-200"></div>
                        <div className="text-center">
                            <p className="text-xs text-gray-500 font-medium">Produk</p>
                            <p className="font-bold text-gray-800">{products.length}</p>
                        </div>
                        <div className="w-px bg-gray-200"></div>
                        <div className="text-center">
                            <p className="text-xs text-gray-500 font-medium">Terjual</p>
                            <p className="font-bold text-gray-800">{totalSold}+</p>
                        </div>
                        <div className="w-px bg-gray-200"></div>
                        <div className="text-center">
                            <p className="text-xs text-gray-500 font-medium">Respon</p>
                            <p className="font-bold text-green-600 text-xs mt-1">± 15 Mnt</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* 3. Section Voucher Toko (Floating Horizontal) */}
        {vouchers.length > 0 && (
            <div className="px-4 mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Ticket size={16} className="text-orange-500" /> Voucher Toko
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {vouchers.map((v, idx) => (
                        <div key={idx} className="flex-shrink-0 bg-white border border-orange-200 rounded-lg p-3 flex items-center gap-3 shadow-sm min-w-[240px] relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500"></div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-orange-600">Diskon Rp {parseInt(v.amount).toLocaleString('id-ID')}</p>
                                <p className="text-[10px] text-gray-500">Kode: <span className="font-mono font-bold text-gray-700">{v.code}</span></p>
                            </div>
                            <button 
                                onClick={() => handleCopyVoucher(v.code)}
                                className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-orange-100 transition-colors"
                            >
                                Klaim
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* 4. Katalog Produk */}
        <div className="bg-white min-h-[500px] rounded-t-3xl shadow-sm border-t border-gray-100 px-4 pt-6">
            
            {/* Tabs & Search */}
            <div className="sticky top-[60px] z-40 bg-white pb-4">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-4">
                    {/* Tabs */}
                    <div className="flex p-1 bg-gray-100 rounded-xl w-full md:w-auto">
                        <button 
                            onClick={() => setActiveTab('all')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Semua Produk
                        </button>
                        <button 
                            onClick={() => setActiveTab('best_seller')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'best_seller' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Terlaris 🔥
                        </button>
                    </div>

                    {/* Search Bar Toko */}
                    <div className="relative w-full md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Cari di toko ini..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-sky-500 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Product Grid (Staggered Animation) */}
            {products.length === 0 ? (
                <div className="text-center py-20">
                    <ShoppingBag size={48} className="mx-auto text-gray-300 mb-3" />
                    <h3 className="text-gray-800 font-bold mb-1">Toko ini sedang menyiapkan produk terbaiknya!</h3>
                    <p className="text-gray-500 text-sm">Coba cek lagi nanti ya!</p>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                    <Search size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">Produk tidak ditemukan.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-10">
                    {filteredProducts.map((product, index) => (
                        <div 
                            key={product.id} 
                            onClick={() => onProductClick(product)}
                            className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards"
                            style={{ animationDelay: `${index * 50}ms` }} // Staggered Effect
                        >
                            <div className="relative aspect-square bg-gray-50 overflow-hidden">
                                <img 
                                    src={product.mediaUrl || 'https://via.placeholder.com/150'} 
                                    alt={product.name} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                />
                                {product.voucherCode && (
                                    <div className="absolute bottom-2 left-2 bg-orange-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        <Ticket size={10} /> Diskon
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <h3 className="font-bold text-gray-800 text-sm line-clamp-2 mb-1 h-10 leading-snug">{product.name}</h3>
                                <div className="flex items-center justify-between mt-2">
                                    <p className="font-price text-sm font-bold text-sky-600">Rp {parseInt(product.price).toLocaleString('id-ID')}</p>
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