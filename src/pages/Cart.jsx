import React, { useState, useEffect } from 'react';
import { Trash2, Minus, Plus, ShoppingBag, TicketPercent, Loader2, ChevronLeft, ChevronRight, MapPin, NotebookPen } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, onValue, remove, update, push } from 'firebase/database';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const SummaryComponent = ({ 
  isDarkMode, 
  promoCode, 
  setPromoCode, 
  handleApplyVoucher, 
  totalItems, 
  totalPrice, 
  appliedVoucher, 
  orderNote, 
  setOrderNote, 
  handleFinalCheckout,
  isNiagaFoodInCart, // Prop baru
  deliveryAddress,    // Prop baru
  setDeliveryAddress,  // Prop baru
  onBackToStep1,
  selectedItems
}) => (
  <>
      <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Ringkasan Belanja</h3>
      
      {/* Promo Code */}
      <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <TicketPercent size={16} className="text-gray-400" />
              </div>
              <input 
                  type="text" 
                  placeholder="Kode Promo" 
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-gray-200 focus:border-indigo-400' : 'border-gray-200 focus:border-indigo-500'}`}
              />
          </div>
          <button onClick={handleApplyVoucher} className={`px-3 py-2 text-white text-sm font-medium rounded-lg ${isDarkMode ? 'bg-slate-600 hover:bg-slate-500' : 'bg-gray-800 hover:bg-gray-900'}`}>
              Pakai
          </button>
      </div>

      {/* Alamat Pengiriman (Khusus Niaga Food) */}
      {isNiagaFoodInCart && (
        <div className="mb-4">
          <label className={`block text-xs font-bold mb-2 flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}><MapPin size={14}/> Alamat Pengiriman</label>
          <input 
            type="text" 
            placeholder="Cth: Kamar 203, Gedung Rusunawa B" 
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-gray-200 focus:border-indigo-400' : 'border-gray-200 focus:border-indigo-500'}`}
            required
          />
        </div>
      )}
      <div className="space-y-2 mb-4 text-sm">
          <div className={`flex justify-between ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <span>Produk Selektif</span>
              <span className={`font-bold ${isDarkMode ? 'text-gray-100' : ''}`}>{totalItems} Barang</span>
          </div>
          <div className={`flex justify-between ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <span>Total Harga ({totalItems} barang)</span>
              <span className={`font-price font-bold ${isDarkMode ? 'text-gray-100' : ''}`}>Rp {totalPrice.toLocaleString('id-ID')}</span>
          </div>
          <div className={`flex justify-between ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <span className="flex items-center gap-1"><NotebookPen size={14}/> Catatan</span>
              <div className="w-full max-w-[150px] text-right">
                  <input 
                      type="text" 
                      placeholder="Contoh: Pedas ya.." 
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className={`w-full text-right text-xs border-b focus:border-indigo-500 outline-none bg-transparent ${isDarkMode ? 'border-slate-600' : 'border-gray-300'}`}
                  />
              </div>
          </div>
          <div className={`flex justify-between ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <span>Ongkos Kirim</span>
              <span className={`font-price font-bold ${isDarkMode ? 'text-gray-100' : ''}`}>
                Rp {isNiagaFoodInCart ? (3000).toLocaleString('id-ID') : 0}
              </span>
          </div>
          <div className={`flex justify-between ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <span>Total Diskon Barang</span>
              <span className={`${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>-Rp {appliedVoucher ? appliedVoucher.amount.toLocaleString('id-ID') : 0}</span>
          </div>
      </div>

      <div className={`border-t pt-4 mb-6 ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          <div className="flex justify-between items-center">
              <span className={`font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Total Belanja</span>
              <span className={`font-price font-bold text-lg tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {totalPrice.toLocaleString('id-ID')}</span>
          </div>
      </div>

      <div className="flex gap-3">
          <button 
              onClick={onBackToStep1}
              className={`flex-1 py-3 rounded-xl font-bold border transition-all ${isDarkMode ? 'border-slate-600 text-gray-300 hover:bg-slate-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
              Kembali
          </button>
          <button 
              className={`flex-[2] py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
                  totalItems > 0 
                  ? (isDarkMode ? 'bg-indigo-500 hover:bg-indigo-600 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200') 
                  : (isDarkMode ? 'bg-slate-700 text-gray-500 cursor-not-allowed shadow-none' : 'bg-gray-300 cursor-not-allowed shadow-none')
              }`}
              disabled={totalItems === 0}
              onClick={handleFinalCheckout}
          >
              Beli Sekarang
          </button>
      </div>
  </>
);

const Cart = ({ onBack, user, onCheckout }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [cartItems, setCartItems] = useState([]);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1: List, 2: Summary
  const [isLoading, setIsLoading] = useState(true);
  const [selectAll, setSelectAll] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [orderNote, setOrderNote] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState(''); // State untuk alamat pengiriman

  // Fetch cart data from Firebase
  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    const cartRef = ref(db, `users/${user.uid}/cart`);
    const unsubscribe = onValue(cartRef, (snapshot) => {
      const data = snapshot.val();
      const loadedItems = data ? Object.keys(data).map(key => ({
        id: key,
        ...data[key],
        selected: data[key].selected !== undefined ? data[key].selected : true,
      })) : [];
      setCartItems(loadedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setSelectAll(loadedItems.length > 0 && loadedItems.every(item => item.selected));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Select All
  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    const updates = {};
    cartItems.forEach(item => {
      updates[`users/${user.uid}/cart/${item.id}/selected`] = newSelectAll;
    });
    if (Object.keys(updates).length > 0) {
      update(ref(db), updates);
    }
  };

  // Handle Single Select
  const handleSelect = (id, currentSelectedState) => {
    const updates = {};
    updates[`users/${user.uid}/cart/${id}/selected`] = !currentSelectedState;
    update(ref(db), updates);
  };

  // Handle Quantity Change
  const updateQuantity = (id, change) => {
    const item = cartItems.find(i => i.id === id);
    if (!item) return;
    
    const newQuantity = Math.max(1, item.quantity + change);
    if (newQuantity === item.quantity) return;

    const updates = {};
    updates[`users/${user.uid}/cart/${id}/quantity`] = newQuantity;
    update(ref(db), updates);
  };

  // Handle Remove Item
  const removeItem = (id) => {
    remove(ref(db, `users/${user.uid}/cart/${id}`));
  };

  // Handle Clear Cart (Hapus Semua)
  const handleClearCart = () => {
    Swal.fire({
      title: 'Kosongkan Keranjang?',
      text: 'Apakah Anda yakin ingin menghapus semua produk dari keranjang?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Semua',
      cancelButtonText: 'Batal',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 transition-all !opacity-100',
        cancelButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all mr-3 !opacity-100'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        remove(ref(db, `users/${user.uid}/cart`));
        Swal.fire({
          icon: 'success',
          title: 'Keranjang Dikosongkan',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top'
        });
      }
    });
  };

  // Handle Apply Voucher
  const handleApplyVoucher = () => {
    // Cek apakah ada produk di keranjang yang punya kode voucher ini
    const validItem = cartItems.find(item => item.voucherCode === promoCode && item.selected);
    
    if (validItem) {
      setAppliedVoucher({
        code: promoCode,
        amount: parseInt(validItem.voucherAmount),
        itemId: validItem.id
      });
      Swal.fire({
        icon: 'success',
        title: 'Berhasil!',
        text: `Voucher ${promoCode} berhasil digunakan.`,
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: 'Kode voucher tidak valid atau produk belum dicentang.',
        confirmButtonColor: '#0284c7'
      });
      setAppliedVoucher(null);
    }
  };

  // Calculate Total
  const isNiagaFoodInCart = cartItems.some(item => item.category === 'Niaga Food');
  const deliveryFee = isNiagaFoodInCart ? 3000 : 0; // Ongkir flat 3rb jika ada Niaga Food

  const totalItems = cartItems.filter(item => item.selected).reduce((acc, item) => acc + item.quantity, 0);
  let subtotal = cartItems.filter(item => item.selected).reduce((acc, item) => acc + (item.price * item.quantity), 0);
  let totalPrice = totalItems > 0 ? subtotal + deliveryFee : 0;
  
  // Kurangi total dengan voucher jika ada
  if (appliedVoucher && totalItems > 0) {
    // Pastikan item yang punya voucher masih ada dan dipilih
    const isVoucherItemStillValid = cartItems.some(item => item.id === appliedVoucher.itemId && item.selected);
    if (isVoucherItemStillValid) {
      totalPrice -= appliedVoucher.amount;
    }
  }

  const handleFinalCheckout = async () => {
    const selectedItems = cartItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Keranjang Kosong',
        text: 'Pilih minimal satu barang untuk dibeli.',
        confirmButtonColor: '#0284c7'
      });
      return;
    }
    if (isNiagaFoodInCart && !deliveryAddress.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Alamat Kosong',
        text: 'Mohon isi alamat pengiriman untuk pesanan Niaga Food.',
        confirmButtonColor: '#0284c7'
      });
      return;
    }

    const orderData = {
        buyerId: user.uid,
        buyerName: user.displayName,
        items: selectedItems,
        deliveryFee: deliveryFee,
        deliveryAddress: isNiagaFoodInCart ? deliveryAddress : null,
        totalPrice: totalPrice,
        appliedVoucher: appliedVoucher, // Simpan info voucher yang dipakai
        note: orderNote, // Simpan Catatan
        status: 'waiting_payment', // Status awal
        createdAt: new Date().toISOString(),
    };

    // Simpan ke Firebase
    const newOrderRef = await push(ref(db, 'orders'), orderData);
    
    // Pindah ke halaman pembayaran
    onCheckout(newOrderRef.key);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 size={48} className="text-sky-600 animate-spin mb-4" />
        <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'} font-medium`}>Memuat Keranjang...</p>
      </div>
    );
  }

  // Empty State
  if (cartItems.length === 0) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className={`p-8 rounded-2xl shadow-sm text-center max-w-md w-full border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${isDarkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                <ShoppingBag size={48} className={isDarkMode ? 'text-blue-400' : 'text-blue-500'} />
            </div>
            <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Keranjangmu Kosong</h2>
            <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mb-8`}>Wah, keranjangmu masih sepi nih. Yuk isi dengan barang-barang impianmu!</p>
            <button
                onClick={onBack}
                className={`w-full text-white py-3 rounded-xl font-bold transition-colors shadow-lg ${isDarkMode ? 'bg-indigo-500 hover:bg-indigo-600 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
            >
                Mulai Belanja
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-80 lg:pb-6 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className="max-w-5xl mx-auto p-4 lg:p-6">
        
        {/* Breadcrumbs Header */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto whitespace-nowrap py-2 scrollbar-hide">
            <button onClick={onBack} className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}><ChevronLeft size={24}/></button>
            <h1 className={`text-xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                <span className={checkoutStep === 1 ? 'text-sky-600' : 'text-gray-400'}>Keranjang</span>
                <ChevronRight size={16} className="text-gray-300" />
                <span className={checkoutStep === 2 ? 'text-sky-600' : 'text-gray-400'}>Konfirmasi</span>
            </h1>
        </div>

        {checkoutStep === 1 ? (
            /* STEP 1: FULL LIST KERANJANG */
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                {/* Info Bar */}
                <div className={`p-4 rounded-2xl flex items-center justify-between border ${isDarkMode ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                    <div className="flex items-center gap-2 text-sm font-bold">
                        <ShoppingBag size={18}/>
                        <span>{totalItems} barang terpilih</span>
                    </div>
                    <div className="text-sm font-bold">
                        Total: Rp {totalPrice.toLocaleString('id-ID')}
                    </div>
                </div>

                {/* Select All Header */}
                <div className={`p-4 rounded-xl shadow-sm border flex items-center justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={selectAll}
                            onChange={handleSelectAll}
                            className={`w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'border-gray-300'}`}
                        />
                        <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Pilih Semua ({cartItems.length})</span>
                    </div>
                    {cartItems.length > 0 && (
                        <button 
                            onClick={handleClearCart}
                            className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                        >
                            <Trash2 size={14} /> Hapus Semua
                        </button>
                    )}
                </div>

                {/* Items List */}
                {cartItems.map((item) => (
                    <div key={item.id} className={`p-4 rounded-xl shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                        {/* Store Name */}
                        <div className={`flex items-center gap-2 mb-3 pb-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-50'}`}>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                                {item.storeName?.charAt(0) || 'T'}
                            </div>
                            <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{item.storeName || 'Toko'}</span>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={item.selected}
                                    onChange={() => handleSelect(item.id, item.selected)}
                                    className={`w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'border-gray-300'}`}
                                />
                            </div>
                            
                            {/* Product Image */}
                            <div className={`w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                                <img src={item.image || 'https://via.placeholder.com/150'} alt={item.name} className="w-full h-full object-cover" />
                            </div>

                            {/* Product Details */}
                            <div className="flex-1">
                                <h3 className={`text-sm font-medium line-clamp-2 mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{item.name}</h3>
                                {item.variant && <p className={`text-xs mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Varian: {item.variant}</p>}
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`font-price font-bold tracking-wide ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {item.price.toLocaleString('id-ID')}</span>
                                    {item.originalPrice && (
                                        <span className={`font-price text-xs line-through ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Rp {item.originalPrice.toLocaleString('id-ID')}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions (Mobile Friendly Layout) */}
                        <div className={`flex justify-end items-center gap-4 mt-3 pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-gray-50'}`}>
                            <button 
                                onClick={() => removeItem(item.id)}
                                className={`transition-colors ${isDarkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                            >
                                <Trash2 size={18} />
                            </button>
                            
                            <div className={`flex items-center border rounded-lg ${isDarkMode ? 'border-slate-600' : 'border-gray-200'}`}>
                                <button 
                                    onClick={() => updateQuantity(item.id, -1)}
                                    className={`p-1.5 transition-colors ${item.quantity <= 1 ? (isDarkMode ? 'text-slate-500' : 'text-gray-300') : (isDarkMode ? 'text-gray-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-50')}`}
                                    disabled={item.quantity <= 1}
                                >
                                    <Minus size={16} />
                                </button>
                                <span className={`w-8 text-center text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{item.quantity}</span>
                                <button 
                                    onClick={() => updateQuantity(item.id, 1)}
                                    className={`p-1.5 transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                
                {/* Bottom Sticky Action Step 1 */}
                <div className={`fixed bottom-0 left-0 right-0 p-4 border-t z-50 transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]'}`}>
                    <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                        <div className="hidden md:block">
                            <p className="text-xs text-gray-400">Total Harga</p>
                            <p className="text-lg font-bold text-sky-600">Rp {totalPrice.toLocaleString('id-ID')}</p>
                        </div>
                        <button 
                            onClick={() => setCheckoutStep(2)}
                            disabled={totalItems === 0}
                            className="flex-1 md:flex-none md:px-12 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all disabled:opacity-50 disabled:grayscale"
                        >
                            Lanjut ke Ringkasan
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            /* STEP 2: SUMMARY & DETAIL */
            <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex-1 space-y-4">
                    <h3 className={`font-bold px-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Produk yang dibeli:</h3>
                    {cartItems.filter(i => i.selected).map(item => (
                        <div key={item.id} className={`flex items-center gap-4 p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                            <img src={item.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{item.name}</p>
                                <p className="text-xs text-gray-500">{item.quantity} x Rp {item.price.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-sky-600">Rp {(item.price * item.quantity).toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="lg:w-96">
                    <div className={`p-5 rounded-2xl shadow-sm border sticky top-24 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                        <SummaryComponent 
                            {...{ 
                                isDarkMode, promoCode, setPromoCode, handleApplyVoucher, 
                                totalItems, totalPrice, appliedVoucher, orderNote, 
                                setOrderNote, handleFinalCheckout, isNiagaFoodInCart, 
                                deliveryAddress, setDeliveryAddress, 
                                onBackToStep1: () => setCheckoutStep(1) 
                            }} 
                        />
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Cart;