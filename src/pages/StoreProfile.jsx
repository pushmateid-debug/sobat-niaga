import React, { useState, useEffect } from 'react';
import { ChevronLeft, Star, MapPin, Search, ShoppingBag, CheckCircle, Copy, Ticket, Award, MessageCircle, Loader2, Share2, Clock, Menu, Flag, HelpCircle, Grid } from 'lucide-react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false); // State Hamburger Menu

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
    <div className="min-h-screen bg-white pb-24 font-sans">
      
      {/* 1. Sticky Header (Navigasi) */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100 transition-all h-[52px]">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between h-full">
          <button onClick={onBack} className="p-1 rounded-full hover:bg-sky-50 transition-colors text-sky-600">
            <ChevronLeft size={32} />
          </button>
          
          <div className="flex items-center gap-1">
             <button className="p-1 text-sky-600 hover:bg-sky-50 rounded-full">
                <Search size={24} />
             </button>
             <div className="relative">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 text-sky-600 hover:bg-sky-50 rounded-full">
                    <Menu size={24} />
                </button>
                {/* Pop-up Menu Hamburger */}
                {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[60] animate-in fade-in slide-in-from-top-2">
                        <button onClick={() => { handleShare(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-3">
                            <Share2 size={16} /> Share Toko
                        </button>
                        <button className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-3">
                            <Flag size={16} /> Laporkan
                        </button>
                        <button className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-3">
                            <HelpCircle size={16} /> Bantuan
                        </button>
                    </div>
                )}
             </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        
        {/* 2. Header Toko (Profile Style - Clean & Centered) */}
        <div className="relative bg-gradient-to-b from-sky-100/50 to-white pt-2 pb-2 px-4 text-center">
            <div className="relative inline-block mb-1">
                <div className="w-16 h-16 rounded-full p-0.5 bg-white shadow-md mx-auto">
                    <img 
                        src={displayPhoto} 
                        alt="Store Profile" 
                        className="w-full h-full object-cover rounded-full"
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=SobatNiaga'; }} 
                    />
                </div>
                {isTrusted && (
                    <div className="absolute bottom-0 right-0 bg-white rounded-full p-0.5">
                        <CheckCircle size={14} className="text-blue-500 fill-blue-100" />
                    </div>
                )}
            </div>

            <h2 className="text-lg font-bold text-gray-900 leading-tight">{displayStoreName}</h2>
            
            {/* Online Indicator & Location */}
            <div className="flex items-center justify-center gap-2 mb-3 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-green-600">Online</span>
                <span className="text-gray-300 text-[10px]">•</span>
                <div className="flex items-center gap-1 text-gray-500 text-[10px]">
                    <MapPin size={10} />
                    <span>{displayAddress}</span>
                </div>
            </div>

            {/* Statistik Bar (Horizontal) */}
            <div className="flex justify-center items-center gap-3 md:gap-12 bg-white rounded-xl shadow-sm border border-gray-100 py-2 px-2 mx-0 md:mx-10">
                <div className="flex-1">
                    <div className="flex items-center justify-center gap-1 font-bold text-gray-900 text-xs">
                        <Star size={12} className="fill-yellow-400 text-yellow-400" /> {avgRating}
                    </div>
                    <p className="text-[9px] text-gray-400">Rating</p>
                </div>
                <div className="w-px h-6 bg-gray-100"></div>
                <div className="flex-1">
                    <p className="font-bold text-gray-900 text-xs">{products.length}</p>
                    <p className="text-[9px] text-gray-400">Produk</p>
                </div>
                <div className="w-px h-6 bg-gray-100"></div>
                <div className="flex-1">
                    <p className="font-bold text-gray-900 text-xs">{totalSold}+</p>
                    <p className="text-[9px] text-gray-400">Terjual</p>
                </div>
                <div className="w-px h-6 bg-gray-100"></div>
                <div className="flex-1">
                    <p className="font-bold text-gray-900 text-xs">± 15 Mnt</p>
                    <p className="text-[9px] text-gray-400">Respon</p>
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
            <div className="flex border-b border-gray-100 mb-2 sticky top-[52px] bg-white z-40 pt-1">
                <button 
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 pb-2 text-xs font-bold transition-all relative ${activeTab === 'all' ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Semua Produk
                    {activeTab === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('best_seller')}
                    className={`flex-1 pb-2 text-xs font-bold transition-all relative ${activeTab === 'best_seller' ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Terlaris
                    {activeTab === 'best_seller' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('category')}
                    className={`flex-1 pb-2 text-xs font-bold transition-all relative ${activeTab === 'category' ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Kategori
                    {activeTab === 'category' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-600 rounded-t-full"></div>}
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
                <div className="grid grid-cols-2 gap-3 pb-4">
                    {filteredProducts.map((product, index) => (
                        <div 
                            key={product.id} 
                            onClick={() => onProductClick(product)}
                            className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer group"
                        >
                            <div className="relative aspect-square bg-gray-50 overflow-hidden">
                                <img 
                                    src={product.mediaUrl || 'https://via.placeholder.com/150'} 
                                    alt={product.name} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                />
                                {product.voucherCode && (
                                    <div className="absolute bottom-2 left-2 bg-sky-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        <Ticket size={10} /> Promo
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1 leading-snug min-h-[2.5em]">{product.name}</h3>
                                <div className="flex items-end justify-between mt-2">
                                    <p className="font-sans text-sm font-bold text-sky-600">Rp {parseInt(product.price).toLocaleString('id-ID')}</p>
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

      {/* Sticky Bottom Bar (Chat) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
         <button 
            onClick={handleChat}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-full shadow-lg shadow-sky-200 transition-all flex items-center justify-center gap-2 active:scale-95"
         >
            <MessageCircle size={20} /> Chat Penjual
         </button>
      </div>

    </div>
  );
};

export default StoreProfile;