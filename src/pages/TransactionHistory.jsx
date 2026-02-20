import React, { useState, useEffect } from 'react';
import { ArrowLeft, Package, Clock, CheckCircle, Truck, XCircle, ShoppingBag, Video, ShieldAlert, Trash2, Star, Upload, X, PlayCircle, MessageCircle, Wrench, AlertTriangle, Copy, ChefHat, Bike, Home, MapPin, Utensils } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, onValue, query, orderByChild, equalTo, update, get, push, set } from 'firebase/database';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

// Helper: Hitung Biaya Admin (Logic Math.min)
const calculateAdminFee = (amount) => {
  if (amount < 15000) return 500;
  return 2000;
};

const isNiagaFood = (order) => (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).some(i => i.category === 'Niaga Food');

const TransactionHistory = ({ user, onBack, onPay, initialTab, highlightOrderId }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab || 'waiting_payment');
  const [mainTab, setMainTab] = useState('products'); // 'products' | 'food'
  const [flashingOrderId, setFlashingOrderId] = useState(null);
  const [compSettings, setCompSettings] = useState({ isActive: false, startDate: '', endDate: '' });
  
  // State Review Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedOrderForReview, setSelectedOrderForReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', videoFile: null, videoPreview: null });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Fetch Competition Settings
  useEffect(() => {
    const compRef = ref(db, 'admin/competitionSettings');
    onValue(compRef, (snap) => {
      if(snap.exists()) setCompSettings(snap.val());
    });
  }, []);

  // Efek Pindah Tab Otomatis
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Efek Flash Highlight
  useEffect(() => {
    if (highlightOrderId) {
      setFlashingOrderId(highlightOrderId);
      const timer = setTimeout(() => setFlashingOrderId(null), 3000); // Highlight 3 detik
      return () => clearTimeout(timer);
    }
  }, [highlightOrderId]);

  useEffect(() => {
    if (user?.uid) {
      const ordersRef = query(ref(db, 'orders'), orderByChild('buyerId'), equalTo(user.uid));
      const unsubscribe = onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        const loadedOrders = data ? Object.keys(data)
          .map(key => ({ id: key, ...data[key] }))
          .filter(order => !order.hiddenForBuyer) : [];
        setOrders(loadedOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Fungsi Upload ke Cloudinary (Reused)
  const uploadToCloudinary = async (file) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
    const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    const params = { folder: 'sobatniaga/reviews', timestamp: timestamp };
    const sortedKeys = Object.keys(params).sort();
    const stringToSign = sortedKeys.map(key => `${key}=${params[key]}`).join('&') + apiSecret;
    const msgBuffer = new TextEncoder().encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const signature = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'sobatniaga/reviews');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
  };

  const handleCopyResi = (resi) => {
    navigator.clipboard.writeText(resi);
    Swal.fire({
      icon: 'success',
      title: 'Resi Disalin!',
      toast: true,
      position: 'top',
      showConfirmButton: false,
      timer: 1500,
      background: isDarkMode ? '#1e293b' : '#ffffff',
      color: isDarkMode ? '#ffffff' : '#000000'
    });
  };

  const handleOpenReviewModal = (order) => {
    setSelectedOrderForReview(order);
    setReviewForm({ rating: 5, comment: '', videoFile: null, videoPreview: null });
    setIsReviewModalOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!reviewForm.comment) {
        Swal.fire('Isi Komentar', 'Ceritakan pengalamanmu sedikit ya.', 'warning');
        return;
    }

    setIsSubmittingReview(true);
    try {
        let videoUrl = '';
        if (reviewForm.videoFile) {
            videoUrl = await uploadToCloudinary(reviewForm.videoFile);
        }

        const items = Array.isArray(selectedOrderForReview.items) ? selectedOrderForReview.items : Object.values(selectedOrderForReview.items || {});
        
        // Loop setiap item dalam order untuk memberikan ulasan (Simplifikasi: 1 Review per Order untuk semua item, atau ambil item pertama)
        // Idealnya review per produk, tapi untuk MVP kita ambil produk pertama atau loop.
        // Disini kita akan update rating produk untuk setiap item yang ada di order.
        
        for (const item of items) {
            // 1. Simpan Review ke Database
            // FIX: Pastikan productId ada. Jika tidak, coba gunakan item.id (tapi ini berisiko jika item.id adalah cart ID)
            const targetProductId = item.productId || item.id;
            
            if (!targetProductId) {
                console.error("Product ID not found for item:", item);
                continue; 
            }

            const reviewData = {
                orderId: selectedOrderForReview.id,
                productId: targetProductId,
                productName: item.name,
                buyerId: user.uid,
                buyerName: user.displayName || 'Pembeli',
                buyerPhoto: user.photoURL || '',
                rating: reviewForm.rating,
                comment: reviewForm.comment,
                videoUrl: videoUrl,
                createdAt: new Date().toISOString()
            };
            await push(ref(db, 'reviews'), reviewData);

            // 2. Update Rating Produk (Real-time Average)
            const productRef = ref(db, `products/${targetProductId}`);
            const productSnap = await get(productRef);
            if (productSnap.exists()) {
                const pData = productSnap.val();
                // Jika belum ada reviewCount, anggap rating awal (4.8) sebagai placeholder dan jangan dihitung
                const currentRating = pData.reviewCount ? (pData.rating || 0) : 0;
                const currentCount = pData.reviewCount || 0;
                
                // Rumus Average Baru
                const newCount = currentCount + 1;
                const newRating = ((currentRating * currentCount) + reviewForm.rating) / newCount;
                
                await update(productRef, {
                    rating: parseFloat(newRating.toFixed(1)),
                    reviewCount: newCount
                });
            }
        }

        // 3. Tandai Order Sudah Direview
        await update(ref(db, `orders/${selectedOrderForReview.id}`), { isReviewed: true });

        // 4. Bonus Poin jika ada Video
        if (videoUrl) {
            const userRef = ref(db, `users/${user.uid}`);
            const userSnap = await get(userRef);
            const currentPoints = userSnap.val()?.points || 0;
            await update(userRef, { points: currentPoints + 5 });
            Swal.fire('Review Terkirim!', 'Terima kasih! Kamu dapat +5 Poin karena upload video.', 'success');
        } else {
            Swal.fire('Review Terkirim!', 'Terima kasih atas ulasanmu.', 'success');
        }

        setIsReviewModalOpen(false);
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setIsSubmittingReview(false);
    }
  };

  // Logic Inti Penyelesaian Pesanan (Dipisah biar bisa dipanggil Auto-Update)
  const completeOrderTransaction = async (order, isAuto = false) => {
      try {
          // 1. Update Status Order
          await update(ref(db, `orders/${order.id}`), { 
            status: 'completed',
            fundsReleased: true, // Tandai dana sudah cair
            completedAt: new Date().toISOString() 
          });

          // 2. Distribusi Dana & Poin ke Penjual (Otomatis)
          const sellerRevenue = {};
          const sellerQty = {}; // Tracker Qty per Seller

          if (order.items) {
            const itemsArray = Array.isArray(order.items) ? order.items : Object.values(order.items);
            itemsArray.forEach(item => {
              if(item && item.sellerId) {
                sellerRevenue[item.sellerId] = (sellerRevenue[item.sellerId] || 0) + (item.price * item.quantity);
                sellerQty[item.sellerId] = (sellerQty[item.sellerId] || 0) + item.quantity;

                // UPDATE SOLD COUNT PRODUK (Real-time Sync)
                const targetProductId = item.productId || item.id;
                if (targetProductId) {
                    const productRef = ref(db, `products/${targetProductId}`);
                    get(productRef).then((snap) => {
                        if (snap.exists()) {
                            const currentSold = parseInt(snap.val().sold) || 0;
                            update(productRef, { sold: currentSold + item.quantity });
                        }
                    });
                }
              }
            });
          }

          for (const [sellerId, amount] of Object.entries(sellerRevenue)) {
            const sellerRef = ref(db, `users/${sellerId}/sellerInfo`);
            const snap = await get(sellerRef);
            if(snap.exists()) {
              const data = snap.val();
              const currentBalance = data.balance || 0;
              const isCompetitor = data.isCompetitor || false;

              // Hitung Potongan Admin
              const adminFee = calculateAdminFee(amount);
              const netIncome = amount - adminFee;

              // Cek Kompetisi Aktif untuk Poin
              const now = new Date();
              const start = new Date(compSettings.startDate);
              const end = new Date(compSettings.endDate);
              const isCompActive = compSettings.isActive && now >= start && now <= end;
              
              // RUMUS BARU: (Omzet / 10.000) + (Qty * 5)
              const qtySold = sellerQty[sellerId] || 0;
              const eventPointsToAdd = isCompActive ? Math.floor((amount / 10000) + (qtySold * 5)) : 0;
              const loyaltyPointsToAdd = 10; // Flat 10 Poin per Transaksi Selesai
              
              await update(sellerRef, { 
                  balance: currentBalance + netIncome, 
                  points_loyalty: (data.points_loyalty || 0) + loyaltyPointsToAdd,
                  points_event: (data.points_event || 0) + eventPointsToAdd,
                  competitionRevenue: (data.competitionRevenue || 0) + amount,
                  competitionQty: (data.competitionQty || 0) + (sellerQty[sellerId] || 0)
              });

              // Kirim Notifikasi ke Seller
              await push(ref(db, 'notifications'), {
                  userId: sellerId,
                  title: 'Saldo Masuk',
                  message: `Saldo Rp ${netIncome.toLocaleString('id-ID')} masuk! (+${loyaltyPointsToAdd} Poin Seller)`,
                  type: 'success',
                  targetView: 'dashboard-seller',
                  createdAt: new Date().toISOString(),
                  isRead: false
              });
            }
          }

          // 2.5 Distribusi Dana ke Driver (Jika ini orderan Niaga Food)
          if (order.deliveryFee && order.driverId) {
            const driverRef = ref(db, `users/${order.driverId}`);
            const driverSnap = await get(driverRef);
            if (driverSnap.exists()) {
                const driverData = driverSnap.val();
                const currentDriverSaldo = parseInt(driverData.saldo || 0);
                const ongkir = parseInt(order.deliveryFee || 0);
                
                await update(driverRef, {
                    saldo: currentDriverSaldo + ongkir
                });

                await push(ref(db, 'notifications'), {
                    userId: order.driverId,
                    title: 'Ongkir Masuk',
                    message: `Ongkir sebesar Rp ${ongkir.toLocaleString('id-ID')} dari order #${order.id.slice(-6)} telah masuk ke saldo.`,
                    type: 'success',
                    createdAt: new Date().toISOString(),
                    isRead: false
                });
            }
          }

          if (!isAuto) {
            // 3. Notifikasi Sukses & Opsi Rating (Hanya jika manual klik)
            Swal.fire({
                title: 'Selesai!',
                text: 'Transaksi berhasil. Dana & Poin telah diteruskan ke penjual.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                handleOpenReviewModal(order); // Buka Modal Review Custom
            });
          }
      } catch (error) {
          console.error("Error completing order:", error);
          if (!isAuto) Swal.fire('Error', 'Gagal memproses data.', 'error');
      }
  };

  const handleOrderReceived = async (order) => {
    Swal.fire({
      title: 'Pesanan Diterima?',
      text: "Pastikan barang/jasa sudah sesuai. Dana akan diteruskan ke penjual.",
      icon: 'question',
      showCancelButton: true,
      showConfirmButton: true,
      confirmButtonColor: '#16a34a', // Hijau Green-600 (Solid)
      cancelButtonColor: '#dc2626', // Merah Red-600
      confirmButtonText: 'Ya, Terima',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        await completeOrderTransaction(order, false);
      }
    });
  };

  // CRON JOB SIMULATION (Auto-Update)
  useEffect(() => {
    if (orders.length > 0) {
        orders.forEach(order => {
            if (order.status === 'shipped' && order.shippedAt) {
                const shippedTime = new Date(order.shippedAt).getTime();
                const now = Date.now();
                
                // Cek Tipe Order
                const isJasa = (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).some(i => i.category === 'Jasa');
                
                // Durasi Auto-Close: Jasa (24 Jam), Fisik (3 Hari)
                const autoCloseDuration = isJasa ? 24 * 60 * 60 * 1000 : 3 * 24 * 60 * 60 * 1000;

                if (now > shippedTime + autoCloseDuration) {
                    console.log(`Auto-completing order ${order.id}`);
                    completeOrderTransaction(order, true);
                }
            }
        });
    }
  }, [orders]);

  // Handle Request Refund (Jasa Telat)
  const handleRequestRefund = (order) => {
    Swal.fire({
        title: 'Ajukan Refund?',
        text: "Seller melewati batas waktu estimasi. Lapor ke Admin untuk pengembalian dana?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Hubungi Admin',
        confirmButtonColor: '#ef4444'
    }).then((result) => {
        if (result.isConfirmed) {
            const message = `Halo Admin, saya ingin mengajukan refund untuk Order #${order.id} karena Seller melewati batas waktu pengerjaan.`;
            window.open(`https://wa.me/6289517587498?text=${encodeURIComponent(message)}`, '_blank');
        }
    });
  };

  const handleDeleteHistory = async (orderId) => {
    Swal.fire({
      title: 'Hapus Riwayat?',
      text: "Riwayat pesanan ini akan disembunyikan dari daftar.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await update(ref(db, `orders/${orderId}`), { hiddenForBuyer: true });
          Swal.fire({ icon: 'success', title: 'Terhapus!', text: 'Riwayat disembunyikan.', timer: 1500, showConfirmButton: false });
        } catch (error) {
          console.error("Error hiding order:", error);
          Swal.fire('Error', 'Gagal menghapus riwayat.', 'error');
        }
      }
    });
  };

  const hasDeletableOrders = orders.some(o => ['completed', 'cancelled'].includes(o.status));

  const handleDeleteAllHistory = () => {
    const deletableOrders = orders.filter(o => ['completed', 'cancelled'].includes(o.status));
    
    if (deletableOrders.length === 0) return;

    Swal.fire({
      title: 'Bersihkan Riwayat?',
      text: "Hapus semua riwayat pesanan yang sudah selesai? Tindakan ini tidak bisa dibatalkan.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Ya, Bersihkan',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const updates = {};
          // SOFT DELETE: Hanya sembunyikan dari pandangan pembeli.
          // Data asli tetap AMAN di database untuk laporan Admin & Seller.
          deletableOrders.forEach(order => {
            updates[`orders/${order.id}/hiddenForBuyer`] = true;
          });
          
          await update(ref(db), updates);
          
          Swal.fire({ 
            icon: 'success', 
            title: 'Bersih!', 
            text: 'Riwayat transaksi telah dibersihkan.', 
            timer: 1500, 
            showConfirmButton: false 
          });
        } catch (error) {
          console.error("Error clearing history:", error);
          Swal.fire('Error', 'Gagal membersihkan riwayat.', 'error');
        }
      }
    });
  };

  // Handle Chat Seller (Khusus Jasa)
  const handleChatSeller = async (sellerId, storeName, orderId, itemName) => {
    Swal.fire({
        title: 'Hubungi Seller?',
        text: "Dilarang melakukan transaksi di luar SobatNiaga demi keamanan dana Anda!",
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Lanjut Chat WA',
        confirmButtonColor: '#25D366'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const snap = await get(ref(db, `users/${sellerId}`));
            const phone = snap.val()?.phoneNumber;
            if (phone) {
                const formatted = phone.replace(/^0/, '62');
                const message = `Halo ${storeName}, saya sudah bayar jasa ${itemName} di SobatNiaga dengan ID Pesanan #${orderId}. Yuk diskusikan detailnya!`;
                window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(message)}`, '_blank');
            } else {
                Swal.fire('Info', 'Nomor seller tidak tersedia.', 'info');
            }
        }
    });
  };

  // Handle Chat Driver (Khusus Niaga Food)
  const handleChatDriver = async (driverId) => {
    if (!driverId) return;
    try {
        const snap = await get(ref(db, `users/${driverId}`));
        if (snap.exists()) {
            const phone = snap.val().phoneNumber;
            if (phone) {
                const formatted = phone.replace(/^0/, '62');
                window.open(`https://wa.me/${formatted}`, '_blank');
            } else {
                Swal.fire('Info', 'Nomor driver tidak tersedia.', 'info');
            }
        }
    } catch (error) {
        console.error("Error fetching driver info:", error);
    }
  };

  const getStatusBadge = (status, isFood = false) => {
    if (isFood) {
        switch (status) {
            case 'waiting_payment': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700'}`}><Clock size={12} /> Belum Bayar</span>;
            case 'waiting_verification': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}><Clock size={12} /> Verifikasi</span>;
            case 'processed': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'}`}><CheckCircle size={12} /> Diterima</span>;
            case 'being_prepared': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}><ChefHat size={12} /> Dimasak</span>;
            case 'ready_for_pickup': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700'}`}><Bike size={12} /> Ambil</span>;
            case 'delivering': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-sky-900/50 text-sky-300' : 'bg-sky-100 text-sky-700'}`}><Package size={12} /> Antar</span>;
            case 'completed': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'}`}><Home size={12} /> Selesai</span>;
            default: return <span className={`px-2 py-1 rounded-lg text-xs font-bold ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>{status}</span>;
        }
    }
    switch (status) {
      case 'waiting_payment': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700'}`}><Clock size={12} /> Belum Bayar</span>;
      case 'being_prepared': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}><Clock size={12} /> Sedang Disiapkan</span>;
      case 'ready_for_pickup': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-teal-900/50 text-teal-300' : 'bg-teal-100 text-teal-700'}`}><Package size={12} /> Siap Diambil</span>;
      case 'payment_rejected': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'}`}><XCircle size={12} /> Ditolak (Upload Ulang)</span>;
      case 'waiting_verification': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}><Clock size={12} /> Verifikasi Admin</span>;
      case 'processed': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'}`}><Package size={12} /> Dikemas</span>;
      case 'shipped': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'}`}><Truck size={12} /> Dikirim</span>;
      case 'completed': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'}`}><CheckCircle size={12} /> Selesai</span>;
      case 'cancelled': return <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'}`}><XCircle size={12} /> Dibatalkan</span>;
      default: return <span className={`px-2 py-1 rounded-lg text-xs font-bold ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>{status}</span>;
    }
  };

  // Filter Pesanan Berdasarkan Tab
  const getFilteredOrders = () => {
    if (mainTab === 'food') {
        // Tab Niaga Food: Filter berdasarkan status tab
        const foodOrders = orders.filter(o => isNiagaFood(o));
        if (activeTab === 'waiting_payment') {
             return foodOrders.filter(o => o.status === 'waiting_payment' || o.status === 'payment_rejected');
        }
        return foodOrders.filter(o => o.status === activeTab);
    }
    
    // Tab Produk/Paket
    const productOrders = orders.filter(o => !isNiagaFood(o));
    if (activeTab === 'waiting_payment') {
      return productOrders.filter(o => o.status === 'waiting_payment' || o.status === 'payment_rejected');
    }
    return productOrders.filter(o => o.status === activeTab);
  };

  const filteredOrders = getFilteredOrders();

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white'}`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}><ArrowLeft size={24} /></button>
            <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Riwayat Transaksi</h1>
          </div>
          {hasDeletableOrders && (
            <button 
              onClick={handleDeleteAllHistory}
              className={`text-xs font-bold flex items-center gap-1 transition-colors px-3 py-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 bg-slate-700 hover:bg-red-900/50 hover:text-red-400' : 'text-gray-500 bg-gray-100 hover:bg-red-50 hover:text-red-600'}`}
            >
              <Trash2 size={14} /> Bersihkan
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs (Produk vs Food) */}
      <div className="max-w-3xl mx-auto px-4 mt-4">
        <div className={`flex p-1 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <button onClick={() => { setMainTab('products'); setActiveTab('waiting_payment'); }} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mainTab === 'products' ? (isDarkMode ? 'bg-slate-700 text-white shadow-sm' : 'bg-sky-50 text-sky-600 shadow-sm') : 'text-gray-400'}`}>
                📦 Produk / Paket
            </button>
            <button onClick={() => { setMainTab('food'); setActiveTab('waiting_payment'); }} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mainTab === 'food' ? (isDarkMode ? 'bg-slate-700 text-white shadow-sm' : 'bg-orange-50 text-orange-600 shadow-sm') : 'text-gray-400'}`}>
                🍔 Niaga Food
            </button>
        </div>
      </div>

      {/* Tabs Filter Status */}
      {mainTab === 'products' && (
      <div className={`shadow-sm mb-4 mt-2 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white'}`}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide">
            {[
              { id: 'waiting_payment', label: 'Belum Bayar' },
              { id: 'waiting_verification', label: 'Diverifikasi' },
              { id: 'processed', label: 'Proses' },
              { id: 'shipped', label: 'Dikirim' },
              { id: 'completed', label: 'Selesai' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors px-4 ${activeTab === tab.id ? 'border-sky-600 text-sky-600' : (isDarkMode ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-700')}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Tabs Filter Status (Niaga Food) */}
      {mainTab === 'food' && (
      <div className={`shadow-sm mb-4 mt-2 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white'}`}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide">
            {[
              { id: 'waiting_payment', label: 'Belum Bayar' },
              { id: 'waiting_verification', label: 'Verifikasi' },
              { id: 'processed', label: 'Diterima' },
              { id: 'being_prepared', label: 'Dimasak' },
              { id: 'ready_for_pickup', label: 'Ambil' },
              { id: 'delivering', label: 'Antar' },
              { id: 'completed', label: 'Selesai' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors px-4 ${activeTab === tab.id ? 'border-orange-500 text-orange-600' : (isDarkMode ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-700')}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className={`max-w-3xl mx-auto p-4 lg:p-6 space-y-4 ${mainTab === 'food' ? 'mt-0' : ''}`}>
        {/* Visual Indicator untuk Tab Diverifikasi */}
        {mainTab === 'products' && activeTab === 'waiting_verification' && (
          <div className={`p-4 rounded-xl flex gap-3 items-start mb-2 border ${isDarkMode ? 'bg-blue-900/30 border-blue-800/50' : 'bg-blue-50 border-blue-200'}`}>
            <ShieldAlert className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} size={20} />
            <div>
              <p className={`text-sm font-bold ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Sedang Diverifikasi Admin</p>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>Admin sedang mengecek bukti transfermu. Mohon tunggu sebentar ya, status akan berubah otomatis.</p>
            </div>
          </div>
        )}

        {/* Warning Video Unboxing */}
        {mainTab === 'products' && (
        <div className={`p-4 rounded-xl flex gap-3 items-start border mb-4 ${isDarkMode ? 'bg-yellow-900/30 border-yellow-800/50' : 'bg-yellow-50 border-yellow-200'}`}>
          <Video className={isDarkMode ? 'text-yellow-500' : 'text-yellow-600'} size={20} />
          <div>
            <p className={`text-sm font-bold ${isDarkMode ? 'text-yellow-200' : 'text-yellow-800'}`}>Wajib Video Unboxing!</p>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>Rekam video saat membuka paket. Tanpa video, klaim garansi/retur tidak akan diproses.</p>
          </div>
        </div>
        )}

        {isLoading ? (
          <div className={`text-center py-10 animate-pulse ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Memuat riwayat...</div>
        ) : filteredOrders.length === 0 ? (
          <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {mainTab === 'food' ? (
                <Utensils size={48} className="mx-auto mb-3 opacity-20" />
            ) : (
                <ShoppingBag size={48} className="mx-auto mb-3 opacity-20" />
            )}
            <p>Tidak ada pesanan di tab ini.</p>
          </div>
        ) : (
          <div className={`max-h-[500px] overflow-y-auto space-y-4 pr-1 scrollbar-thin ${isDarkMode ? 'scrollbar-thumb-slate-700' : 'scrollbar-thumb-gray-200'}`}>
            {filteredOrders.map((order) => (
            <div 
              key={order.id} 
              className={`p-4 rounded-xl shadow-sm border transition-all duration-500 relative overflow-hidden ${flashingOrderId === order.id ? 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-100 scale-[1.02]' : (isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100')}`}
            >
              {/* Cek apakah ini order Jasa */}
              {/* Cek apakah ini order Niaga Food */}
              {(() => {
                  const isJasa = (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).some(i => i.category === 'Jasa');
                  const isNiagaFoodOrder = (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).some(i => i.category === 'Niaga Food');
                  return (
                    <>
              <div 
                className={`flex justify-between items-start mb-3 border-b pb-3 ${isDarkMode ? 'border-slate-700' : 'border-gray-50'}`}
              >
                <div className="flex items-center gap-2">
                    {isNiagaFoodOrder ? <Utensils size={16} className="text-orange-500" /> : <ShoppingBag size={16} className="text-sky-600" />}
                    <div>
                        <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{isNiagaFoodOrder ? 'Niaga Food' : 'Belanja'}</p>
                        <p className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>{new Date(order.createdAt).toLocaleDateString('id-ID')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                  {isJasa && order.status === 'processed' ? <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'}`}><Wrench size={12} /> Jasa Sedang Dikerjakan</span> : (isJasa && order.status === 'shipped' ? <span className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'}`}><CheckCircle size={12} /> Menunggu Konfirmasi</span> : getStatusBadge(order.status, isNiagaFoodOrder))}
                  {['completed', 'cancelled'].includes(order.status) && (
                    <button 
                      onClick={() => handleDeleteHistory(order.id)}
                      className={`p-1.5 text-rose-400 hover:text-rose-600 rounded-full transition-colors ${isDarkMode ? 'hover:bg-rose-900/50' : 'hover:bg-rose-50'}`}
                      title="Hapus Riwayat"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {(Array.isArray(order.items) ? order.items : Object.values(order.items || {})).map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                        <img src={item.image || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" alt={item.name} />
                    </div>
                    <div className="flex-1">
                        <h4 className={`font-bold text-sm line-clamp-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{item.name}</h4>
                        <div className="flex justify-between items-center mt-1">
                           <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.quantity}x @ Rp {parseInt(item.price).toLocaleString('id-ID')}</p>
                           <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Rp {(item.quantity * item.price).toLocaleString('id-ID')}</p>
                        </div>
                    </div>
                    
                    {/* Deadline Tracking (Khusus Jasa & Status Processed) */}
                    {item.category === 'Jasa' && order.status === 'processed' && order.verifiedAt && item.estimation && (
                        <div className="mt-2 space-y-2">
                            {/* Logic Cek Deadline */}
                            {(() => {
                                const days = parseInt(item.estimation) || 3;
                                const deadline = new Date(new Date(order.verifiedAt).getTime() + (days * 24 * 60 * 60 * 1000));
                                const isOverdue = Date.now() > deadline.getTime();

                                if (isOverdue) {
                                    return (
                                        <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${isDarkMode ? 'bg-red-900/30 border-red-800/50' : 'bg-red-50 border-red-100'}`}>
                                            <div className={`text-xs font-bold flex items-center gap-1 ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}><AlertTriangle size={12}/> Lewat Deadline!</div>
                                            <button onClick={() => handleRequestRefund(order)} className={`text-[10px] text-white px-2 py-1 rounded font-bold ${isDarkMode ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700'}`}>Ajukan Refund</button>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div className={`p-2 rounded-lg border flex items-center gap-2 ${isDarkMode ? 'bg-blue-900/30 border-blue-800/50' : 'bg-blue-50 border-blue-100'}`}>
                                <Clock size={14} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                                <div className="text-xs">
                                    <p className={`font-bold ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Batas Waktu Pengerjaan</p>
                                    <p className={isDarkMode ? 'text-blue-300' : 'text-blue-600'}>
                                    {(() => {
                                        const days = parseInt(item.estimation) || 3;
                                        const deadline = new Date(new Date(order.verifiedAt).getTime() + (days * 24 * 60 * 60 * 1000));
                                        return deadline.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
                                    })()}
                                </p>
                            </div>
                            </div>
                        </div>
                    )}
                  </div>
                ))}
                
                {/* Resi Display */}
                {order.resi && (
                  <div className={`mt-2 p-2 rounded-lg flex items-center justify-between gap-3 max-w-xs ${isDarkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                    <div>
                        <p className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>No. Resi:</p>
                        <p className={`text-xs font-mono font-bold select-all ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{order.resi}</p>
                    </div>
                    <button 
                        onClick={() => handleCopyResi(order.resi)}
                        className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-slate-600 text-sky-400' : 'hover:bg-gray-200 text-sky-600'}`}
                        title="Salin Resi"
                    >
                        <Copy size={14} />
                    </button>
                  </div>
                )}

                {order.note && (
                    <div className={`p-2 rounded-lg text-xs italic border ${isDarkMode ? 'bg-yellow-900/30 text-yellow-200 border-yellow-800/50' : 'bg-yellow-50 text-gray-600 border-yellow-100'}`}>Catatan: "{order.note}"</div>
                )}
              </div>

              {/* Driver Info (Khusus Niaga Food) */}
              {isNiagaFoodOrder && order.driverId && ['ready_for_pickup', 'delivering', 'completed'].includes(order.status) && (
                <div className={`mt-3 p-3 rounded-lg flex items-center gap-3 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                  <div className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-600' : 'bg-gray-200'}`}><Bike size={16} className="text-gray-500" /></div>
                  <div>
                    <p className="text-[10px] text-gray-400">Driver Anda</p>
                    <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{order.driverName}</p>
                    <p className={`text-xs font-mono font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{order.driverPlate}</p>
                  </div>
                </div>
              )}

              {/* Rincian Harga (termasuk ongkir jika ada) */}
              {(() => {
                const subtotal = (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).reduce((sum, item) => sum + (item.price * item.quantity), 0);
                return (
                  <div className="text-xs space-y-1 mt-3">
                      <div className="flex justify-between"><span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Subtotal Produk</span><span>Rp {subtotal.toLocaleString('id-ID')}</span></div>
                      {order.deliveryFee > 0 && (
                        <div className="flex justify-between"><span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Ongkos Kirim</span><span>Rp {order.deliveryFee.toLocaleString('id-ID')}</span></div>
                      )}
                      <div className="flex justify-between"><span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Biaya Admin</span><span>Rp {calculateAdminFee(subtotal).toLocaleString('id-ID')}</span></div>
                  </div>);
              })()}

              <div className={`mt-4 pt-3 border-t flex justify-between items-center ${isDarkMode ? 'border-slate-700' : 'border-gray-50'}`}>
                <div>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Belanja</p>
                    <p className="font-price font-bold text-sky-600">Rp {order.totalPrice?.toLocaleString('id-ID')}</p>
                </div>
                
                {/* Tombol Aksi Berdasarkan Status */}
                {(order.status === 'waiting_payment' || order.status === 'payment_rejected') && (
                    <button onClick={() => onPay(order)} className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-colors ${isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-200'}`}>
                        {order.status === 'payment_rejected' ? 'Upload Ulang Bukti' : 'Bayar Sekarang'}
                    </button>
                )}

                {order.status === 'completed' && !order.isReviewed && (
                    <button onClick={() => handleOpenReviewModal(order)} className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${isDarkMode ? 'bg-yellow-600 hover:bg-yellow-700 shadow-none' : 'bg-yellow-500 hover:bg-yellow-600 shadow-sm shadow-yellow-200'}`}>
                        <Star size={14} /> Beri Ulasan
                    </button>
                )}

                {/* Tombol Chat Seller (Khusus Jasa) */}
                {isJasa && ['processed'].includes(order.status) && (
                    <button onClick={() => handleChatSeller(order.items[0].sellerId, order.items[0].storeName, order.id, order.items[0].name)} className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${isDarkMode ? 'bg-green-600 hover:bg-green-700 shadow-none' : 'bg-green-500 hover:bg-green-600 shadow-sm shadow-green-200'}`}>
                        <MessageCircle size={14} /> Chat Seller
                    </button>
                )}

                {/* Tombol Chat Driver (Khusus Niaga Food - Ambil & Antar) */}
                {isNiagaFoodOrder && ['ready_for_pickup', 'delivering'].includes(order.status) && order.driverId && (
                    <button onClick={() => handleChatDriver(order.driverId)} className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${isDarkMode ? 'bg-green-600 hover:bg-green-700 shadow-none' : 'bg-green-500 hover:bg-green-600 shadow-sm shadow-green-200'}`}>
                        <MessageCircle size={14} /> Chat Driver
                    </button>
                )}

                {((order.status && order.status.toLowerCase() === 'shipped') || (isNiagaFoodOrder && order.status === 'delivering')) && (
                    <button onClick={() => handleOrderReceived(order)} className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-colors ${isDarkMode ? 'bg-green-500 hover:bg-green-600 shadow-none' : 'bg-green-600 hover:bg-green-700 shadow-sm shadow-green-200'}`}>
                        {isJasa ? 'Konfirmasi Selesai' : 'Pesanan Diterima'}
                    </button>
                )}
              </div>
              </>
              );
              })()}
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Modal Beri Ulasan */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                <button onClick={() => setIsReviewModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={24} /></button>
                
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1 text-center">Beri Ulasan Produk</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">Bagikan pengalamanmu dan dapatkan poin!</p>

                {/* Star Rating */}
                <div className="flex justify-center gap-2 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button 
                            key={star} 
                            onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                            className="transition-transform hover:scale-110 focus:outline-none"
                        >
                            <Star 
                                size={32} 
                                className={`${star <= reviewForm.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-slate-600'} transition-colors`} 
                            />
                        </button>
                    ))}
                </div>

                {/* Comment */}
                <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Komentar</label>
                    <textarea 
                        value={reviewForm.comment}
                        onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-transparent dark:text-gray-100 focus:border-sky-500 outline-none text-sm resize-none"
                        rows="3"
                        placeholder="Barangnya bagus, pengiriman cepat..."
                    ></textarea>
                </div>

                {/* Video Upload */}
                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 flex justify-between">
                        <span>Video Unboxing (Opsional)</span>
                        <span className="text-green-600 text-xs bg-green-50 px-2 py-0.5 rounded-full">+5 Poin</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-4 flex flex-col items-center justify-center text-gray-400 hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-slate-700 transition-all cursor-pointer relative h-32 bg-gray-50 dark:bg-slate-700/50">
                        <input type="file" accept="video/*" onChange={(e) => {
                            if(e.target.files[0]) setReviewForm({...reviewForm, videoFile: e.target.files[0], videoPreview: URL.createObjectURL(e.target.files[0])});
                        }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                        {reviewForm.videoPreview ? (
                            <video src={reviewForm.videoPreview} className="w-full h-full object-cover rounded-lg" controls />
                        ) : (
                            <div className="flex flex-col items-center">
                                <Video size={24} className="mb-2 text-sky-600" />
                                <span className="text-xs font-bold">Upload Video</span>
                            </div>
                        )}
                    </div>
                </div>

                <button onClick={handleSubmitReview} disabled={isSubmittingReview} className="w-full py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 shadow-lg shadow-sky-200 dark:shadow-none transition-all flex items-center justify-center gap-2">
                    {isSubmittingReview ? 'Mengirim...' : 'Kirim Ulasan'}
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;