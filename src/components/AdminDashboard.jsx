import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, FileCheck, Users, Wallet, LogOut, 
  Search, Filter, CheckCircle, XCircle, Eye, ArrowLeft,
  MoreHorizontal, AlertCircle, Loader2, TrendingUp, Download, Ban, ShieldCheck, Settings, CreditCard, Upload, Image as ImageIcon, Trophy, Calendar as CalendarIcon, Power, RefreshCw, Save, Crop, Wallet as WalletIcon
} from 'lucide-react';
import { Sun, Moon } from 'lucide-react';
import Cropper from 'react-easy-crop'; // Pastikan install: npm install react-easy-crop
import { db } from '../config/firebase';
import { ref, onValue, update, get, push } from 'firebase/database';
import Swal from 'sweetalert2';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const calculateAdminFee = (amount, isCompetitor = false) => {
  if (!isCompetitor) return 2000; // Flat fee for non-competitors

  if (amount < 50000) return 2000;
  if (amount <= 250000) return 5000;
  
  // > 250k: 1% (Max 20k)
  const fee = amount * 0.01;
  return Math.min(fee, 20000);
};

// Helper: Hitung Keuangan Order (Gross, Voucher, Net, Fee)
const calculateOrderFinancials = (order, sellerId = null, sellerMap = {}) => {
  const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
  let gross = 0;
  let voucherDed = 0;

  items.forEach(item => {
    if (!sellerId || item.sellerId === sellerId) {
      gross += (item.price * item.quantity);
    }
  });

  // Cek Voucher
  if (order.appliedVoucher && order.appliedVoucher.itemId) {
    const voucherItem = items.find(i => i.id === order.appliedVoucher.itemId);
    if (voucherItem && (!sellerId || voucherItem.sellerId === sellerId)) {
       voucherDed = order.appliedVoucher.amount || 0;
    }
  }

  const net = Math.max(0, gross - voucherDed);
  
  // Cek status competitor seller
  const isCompetitor = sellerId ? sellerMap[sellerId]?.isCompetitor : false;
  const fee = calculateAdminFee(net, isCompetitor); 
  
  return { gross, voucherDed, net, fee, payout: net - fee };
};

// Helper: Image Processing for Cropper
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(data, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((file) => {
      resolve(file);
    }, 'image/jpeg', 0.8); // Auto-Compress: Quality 0.8
  });
};

const readFile = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), false);
    reader.readAsDataURL(file);
  });
};

// Konfigurasi Slot Banner
const BANNER_SLOTS = [
  { id: 'home_bg_static', label: 'Background Slider Statis', ratio: 16 / 9, desc: 'Background di belakang slider utama', rec: '1920x1080 px' },
  { id: 'chat_icon', label: 'Floating Chat Icon', ratio: 1 / 1, desc: 'Icon tombol chat melayang (PNG Transparan)', rec: '512x512 px (Circle)' },
  { id: 'home_slider_1', label: 'Home Slider 1', ratio: 21 / 9, desc: 'Banner Utama Home (Urutan 1)', rec: '1200x500 px' },
  { id: 'home_slider_2', label: 'Home Slider 2', ratio: 21 / 9, desc: 'Banner Utama Home (Urutan 2)', rec: '1200x500 px' },
  { id: 'home_slider_3', label: 'Home Slider 3', ratio: 21 / 9, desc: 'Banner Utama Home (Urutan 3)', rec: '1200x500 px' },
  { id: 'home_slider_4', label: 'Home Slider 4', ratio: 21 / 9, desc: 'Banner Utama Home (Urutan 4)', rec: '1200x500 px' },
  { id: 'home_slider_5', label: 'Home Slider 5', ratio: 21 / 9, desc: 'Banner Utama Home (Urutan 5)', rec: '1200x500 px' },
  { id: 'fashion_hero', label: 'Fashion Hero', ratio: 16 / 9, desc: 'Halaman Fashion (Header)', rec: '1200x600 px' },
  { id: 'fashion_promo_1', label: 'Fashion Promo 1', ratio: 4 / 1, desc: 'Halaman Fashion (Promo 1)', rec: '1200x300 px' },
  { id: 'fashion_promo_2', label: 'Fashion Promo 2', ratio: 4 / 1, desc: 'Halaman Fashion (Promo 2)', rec: '1200x300 px' },
];

const AdminDashboard = ({ onBack }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, verification, sellers, finance
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]); // State Riwayat Pembayaran
  const [selectedProof, setSelectedProof] = useState(null); // State Modal Bukti Transfer Log
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null); // Untuk Modal Verifikasi
  const [verificationTab, setVerificationTab] = useState('all'); // Tab Filter Transaksi
  const [payoutOrder, setPayoutOrder] = useState(null); // Untuk Modal Pencairan
  const [payoutProofFile, setPayoutProofFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [payoutSellerInfo, setPayoutSellerInfo] = useState(null); // Info Rekening Seller di Modal
  const [adminPaymentForm, setAdminPaymentForm] = useState({
    bankName: '', bankAccount: '', accountHolder: '', qrisUrl: ''
  });
  const [adminQrisFile, setAdminQrisFile] = useState(null);
  const [adminQrisPreview, setAdminQrisPreview] = useState(null);
  const [showSellerQris, setShowSellerQris] = useState(false); // State untuk Modal QRIS Seller
  const [bulkPayoutData, setBulkPayoutData] = useState(null); // State untuk Bulk Payout
  const [bulkProofFile, setBulkProofFile] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState(''); // State untuk Nominal WD Manual/Bulk
  const [payoutNote, setPayoutNote] = useState(''); // State untuk Catatan Transfer
  const [rewardCandidates, setRewardCandidates] = useState([]); // Kandidat Reward
  const [compSettings, setCompSettings] = useState({
    isActive: false,
    startDate: '',
    endDate: ''
  });
  const [adminVoucherEnabled, setAdminVoucherEnabled] = useState(false); // Master Switch Voucher Admin
  const [adminVoucherSettings, setAdminVoucherSettings] = useState({
    amount: '',
    minPurchase: '',
    quota: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  
  // State Banner Management
  const [bannerSlots, setBannerSlots] = useState({});
  const [editingBanner, setEditingBanner] = useState(null); // Slot yang sedang diedit
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [bannerImageSrc, setBannerImageSrc] = useState(null);
  const [bannerLink, setBannerLink] = useState(''); // State untuk Link Banner

  // Persist Dark Mode
  useEffect(() => {
    localStorage.setItem('adminDarkMode', isDarkMode);
  }, [isDarkMode]);

  // Load Semua Pesanan Realtime
  useEffect(() => {
    const ordersRef = ref(db, 'orders');
    const usersRef = ref(db, 'users');
    const productsRef = ref(db, 'products');
    const adminPaymentRef = ref(db, 'admin/paymentInfo');
    const compRef = ref(db, 'admin/competitionSettings');
    const settingsRef = ref(db, 'admin/masterSettings');
    const bannersRef = ref(db, 'admin/banners');
    const withdrawalsRef = ref(db, 'withdrawals');

    const unsubOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      const loadedOrders = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      // Sort: Yang butuh verifikasi paling atas, lalu berdasarkan tanggal terbaru
      setOrders(loadedOrders.sort((a, b) => {
        if (a.status === 'waiting_verification' && b.status !== 'waiting_verification') return -1;
        if (a.status !== 'waiting_verification' && b.status === 'waiting_verification') return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      }));

      setIsLoading(false);
    });

    const unsubUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      setUsers(data ? Object.keys(data).map(key => ({ uid: key, ...data[key] })) : []);
    });

    const unsubProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      setProducts(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
    });

    const unsubAdminPayment = onValue(adminPaymentRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setAdminPaymentForm(data);
        setAdminQrisPreview(data.qrisUrl);
      }
    });

    const unsubComp = onValue(compRef, (snapshot) => {
      if (snapshot.exists()) {
        setCompSettings(snapshot.val());
      }
    });

    const unsubSettings = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setAdminVoucherEnabled(data.voucherEnabled || false);
        setAdminVoucherSettings({
          amount: data.voucherAmount || '',
          minPurchase: data.minPurchase || '',
          quota: data.quota || ''
        });
        if (data.logoUrl) setLogoPreview(data.logoUrl);
      }
    });

    const unsubBanners = onValue(bannersRef, (snapshot) => {
      if (snapshot.exists()) setBannerSlots(snapshot.val());
    });

    const unsubWithdrawals = onValue(withdrawalsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      setWithdrawals(loaded.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });

    return () => { unsubOrders(); unsubUsers(); unsubProducts(); unsubAdminPayment(); unsubComp(); unsubSettings(); unsubBanners(); unsubWithdrawals(); };
  }, []);

  // --- DERIVED STATE ---
  
  // Map Seller Info untuk Lookup Cepat
  const sellerMap = useMemo(() => {
    return users.reduce((acc, user) => {
      if (user.sellerInfo) {
        acc[user.uid] = user.sellerInfo;
      }
      return acc;
    }, {});
  }, [users]);

  // Hitung Kandidat Reward (Dipisah ke useEffect agar sinkron dengan users & orders)
  useEffect(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const sellerStats = {}; 

    orders.forEach(order => {
        const d = new Date(order.createdAt);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && ['processed', 'shipped', 'completed'].includes(order.status)) {
              const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
              const uniqueSellers = new Set();
              items.forEach(item => {
                  if (item.sellerId) {
                      if (!sellerStats[item.sellerId]) sellerStats[item.sellerId] = { id: item.sellerId, name: item.storeName, sales: 0, revenue: 0, qty: 0, points: 0 };
                      sellerStats[item.sellerId].revenue += (item.price * item.quantity);
                      sellerStats[item.sellerId].qty += item.quantity;
                      if (!uniqueSellers.has(item.sellerId)) {
                          uniqueSellers.add(item.sellerId);
                          sellerStats[item.sellerId].sales += 1;
                      }
                  }
              });
        }
    });
    
    Object.values(sellerStats).forEach(stat => {
        // RUMUS BARU: (Omzet / 10.000) + (Qty * 5)
        stat.points = (stat.revenue / 10000) + (stat.qty * 5);
    });

    // Filter: Min 10 Sales & > 500rb Revenue & IS COMPETITOR
    const candidates = Object.values(sellerStats)
        .filter(s => s.sales >= 10 && s.revenue > 500000 && sellerMap[s.id]?.isCompetitor)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);
    setRewardCandidates(candidates);
  }, [orders, sellerMap]);

  // --- LOGIC HELPERS ---

  // Hitung Statistik Dashboard
  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalRevenue = completedOrders.reduce((acc, curr) => acc + (curr.totalPrice || 0), 0);
  
  // Hitung Profit Admin (Dinamis)
  const totalProfit = completedOrders.reduce((acc, order) => {
      // Ambil semua seller unik di order ini
      const items = Array.isArray(order.items) ? order.items : Object.values(order.items);
      const sellers = [...new Set(items.map(i => i.sellerId).filter(Boolean))];
      const orderTotalFee = sellers.reduce((sum, sellerId) => {
          return sum + calculateOrderFinancials(order, sellerId, sellerMap).fee;
      }, 0);
      return acc + orderTotalFee;
  }, 0);
  
  // Data Grafik Real-time (Stockbit Style)
  const chartData = useMemo(() => {
    const days = 7;
    const labels = [];
    const dataPoints = [];
    const today = new Date();
    
    // Generate last 7 days data
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
      
      const startOfDay = new Date(d.setHours(0,0,0,0)).getTime();
      const endOfDay = new Date(d.setHours(23,59,59,999)).getTime();
      
      const dailyRevenue = completedOrders
        .filter(o => {
          const t = new Date(o.createdAt).getTime();
          return t >= startOfDay && t <= endOfDay;
        })
        .reduce((acc, curr) => acc + (curr.totalPrice || 0), 0);
        
      dataPoints.push(dailyRevenue);
    }

    // Determine Trend Color (Today vs Yesterday)
    const lastValue = dataPoints[dataPoints.length - 1];
    const prevValue = dataPoints[dataPoints.length - 2] || 0;
    const isUp = lastValue >= prevValue;
    
    const mainColor = isUp ? '#10b981' : '#ef4444'; // Emerald-500 vs Red-500
    const gradientStart = isUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    const gradientEnd = isUp ? 'rgba(16, 185, 129, 0)' : 'rgba(239, 68, 68, 0)';

    return {
      labels,
      datasets: [{
        label: 'Pendapatan',
        data: dataPoints,
        fill: true,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, gradientStart);
          gradient.addColorStop(1, gradientEnd);
          return gradient;
        },
        borderColor: mainColor,
        borderWidth: 2,
        tension: 0.4, // Smooth curve
        pointRadius: 0, // Hide points by default like stock charts
        pointHoverRadius: 6,
        pointBackgroundColor: mainColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      }]
    };
  }, [completedOrders]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDarkMode ? '#f3f4f6' : '#1f2937',
        bodyColor: isDarkMode ? '#f3f4f6' : '#1f2937',
        borderColor: isDarkMode ? '#374151' : '#e5e7eb',
        borderWidth: 1,
        callbacks: {
          label: (context) => `Rp ${context.raw.toLocaleString('id-ID')}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: isDarkMode ? '#9ca3af' : '#9ca3af' }
      },
      y: {
        grid: { color: isDarkMode ? '#374151' : '#f3f4f6', borderDash: [4, 4] },
        ticks: { 
          font: { size: 10 }, 
          color: isDarkMode ? '#9ca3af' : '#9ca3af',
          callback: (value) => `Rp ${value >= 1000 ? value/1000 + 'k' : value}`
        },
        beginAtZero: true
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  }), [isDarkMode]);

  // Helper: Hitung Saldo Pending per Seller
  const getSellerPendingData = (sellerId) => {
    const pendingOrders = orders.filter(o => 
      o.status === 'completed' && 
      !o.payoutCompleted && 
      o.items
    );

    let sellerOrders = [];
    let totalRevenue = 0;
    let totalFee = 0;

    pendingOrders.forEach(order => {
        const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
        // Cek apakah seller terlibat dalam order ini
        if (items.some(i => i.sellerId === sellerId)) {
             const financials = calculateOrderFinancials(order, sellerId, sellerMap);
             if (financials.net > 0) {
                 sellerOrders.push(order);
                 totalRevenue += financials.net; // Net Revenue (After Voucher)
                 totalFee += financials.fee;
             }
        }
    });

    return { orders: sellerOrders, totalRevenue, totalFee };
  };

  // Fungsi Upload ke Cloudinary (Sama dengan di file lain)
  const uploadToCloudinary = async (file, folder = 'sobatniaga/payouts') => {
    const cloudName = 'djqnnguli';
    const apiKey = '156244598362341';
    const apiSecret = 'INGJr-KgmBPNwqwBYFZy9w7Fa18';
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    const params = { folder: folder, timestamp: timestamp };
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
    formData.append('folder', folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');
    // Auto-Compress: Quality Auto & Format Auto
    return data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
  };

  // Logika Approve (Verifikasi Pembayaran)
  const handleApprovePayment = async (orderId) => {
    try {
      await update(ref(db, `orders/${orderId}`), {
        status: 'processed', // Lanjut ke Penjual
        verifiedAt: new Date().toISOString()
      });

      // Cek apakah ini order Jasa
      const isJasa = (Array.isArray(selectedOrder.items) ? selectedOrder.items : Object.values(selectedOrder.items || {})).some(i => i.category === 'Jasa');

      // Notifikasi ke Pembeli
      await push(ref(db, 'notifications'), {
        userId: selectedOrder.buyerId,
        title: 'Pembayaran Diverifikasi',
        message: isJasa ? `Pembayaran Valid! Jasa sedang dikerjakan. Yuk chat seller buat diskusi detailnya!` : `Pembayaranmu Rp ${selectedOrder.totalPrice.toLocaleString('id-ID')} sudah diverifikasi! Penjual akan segera mengemas barangmu.`,
        type: 'success',
        targetView: 'history',
        targetTab: 'processed', // Arahkan ke tab Proses
        orderId: selectedOrder.id, // Untuk highlight
        createdAt: new Date().toISOString(),
        isRead: false
      });

      setSelectedOrder(null);
      Swal.fire('Berhasil', 'Pembayaran diverifikasi. Pesanan diteruskan ke penjual.', 'success');
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  // Logika Reject (Tolak Bukti)
  const handleRejectPayment = async (orderId) => {
    const { value: reason } = await Swal.fire({
      title: 'Tolak Pembayaran?',
      input: 'text',
      inputLabel: 'Alasan Penolakan',
      inputPlaceholder: 'Contoh: Bukti buram / Nominal tidak sesuai',
      showCancelButton: true,
      confirmButtonColor: '#ef4444'
    });

    if (reason) {
      await update(ref(db, `orders/${orderId}`), {
        status: 'payment_rejected', // Status khusus Ditolak
        proofUrl: null, // Hapus bukti lama
        rejectionReason: reason
      });

      // Notifikasi ke Pembeli
      await push(ref(db, 'notifications'), {
        userId: selectedOrder.buyerId,
        title: 'Pembayaran Ditolak',
        message: `Mohon upload ulang bukti transfer. Alasan: ${reason}`,
        type: 'error',
        targetView: 'payment', // Arahkan langsung ke form upload
        orderId: selectedOrder.id, // Bawa ID pesanan
        createdAt: new Date().toISOString(),
        isRead: false
      });

      setSelectedOrder(null);
      Swal.fire('Ditolak', 'Status diubah menjadi Pembayaran Ditolak.', 'info');
    }
  };

  // Handle Buka Modal Payout & Fetch Info Seller
  const handleOpenPayout = async (order) => {
    setPayoutOrder(order);
    const sellerId = order.items?.[0]?.sellerId;
    if (sellerId) {
      const snap = await get(ref(db, `users/${sellerId}/sellerInfo`));
      if (snap.exists()) setPayoutSellerInfo(snap.val());
    }
    setPayoutNote(''); // Reset note saat buka modal
  };

  // Logika Release Dana (Manual oleh Admin)
  const handleConfirmPayout = async () => {
    if (!payoutProofFile) {
      Swal.fire('Bukti Transfer Kosong', 'Mohon upload bukti transfer ke penjual.', 'warning');
      return;
    }

    setIsUploading(true);
    try {
      const proofUrl = await uploadToCloudinary(payoutProofFile, 'sobatniaga/payouts');

      // FIX: Pastikan items dibaca dengan benar (Array/Object) untuk dapat Seller ID
      const items = Array.isArray(payoutOrder.items) ? payoutOrder.items : Object.values(payoutOrder.items || {});
      const sellerId = items[0]?.sellerId;

      if (!sellerId) {
          throw new Error("Data Seller tidak ditemukan dalam pesanan.");
      }

      // 1. Update Status Order
      await update(ref(db, `orders/${payoutOrder.id}`), { 
        payoutCompleted: true, // Tandai sudah ditransfer ke seller
        payoutProofUrl: proofUrl,
        payoutAt: new Date().toISOString(),
        completedBy: 'admin'
      });

      // 2. DEBIT SALDO SELLER & Tambah Poin (Bonus)
      const financials = calculateOrderFinancials(payoutOrder, sellerId, sellerMap);
      const singlePayoutAmount = financials.payout;

      const sellerRef = ref(db, `users/${sellerId}/sellerInfo`);
      const snap = await get(sellerRef);
      if(snap.exists()) {
        const data = snap.val();
        const currentBalance = data.balance || 0;
        const newBalance = currentBalance - singlePayoutAmount;

        await update(sellerRef, { 
          balance: newBalance < 0 ? 0 : newBalance, // Cegah minus
        });
      }

      // 3. Catat di Riwayat Penarikan (Withdrawals Log)
      const withdrawalData = { 
          sellerId, 
          amount: singlePayoutAmount, 
          proofUrl, 
          status: 'success', 
          createdAt: new Date().toISOString(), 
          orderIds: [payoutOrder.id], 
          type: 'single',
          note: payoutNote || 'Pencairan Order Satuan'
      };
      await push(ref(db, 'withdrawals'), withdrawalData);

      setPayoutOrder(null);
      setPayoutProofFile(null);
      setPayoutNote('');
      Swal.fire('Selesai', 'Dana berhasil dicairkan ke penjual.', 'success');
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Simpan Pengaturan Admin
  const handleSaveAdminSettings = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      let finalQrisUrl = adminPaymentForm.qrisUrl;
      if (adminQrisFile) {
        finalQrisUrl = await uploadToCloudinary(adminQrisFile, 'sobatniaga/admin');
      }

      await update(ref(db, 'admin/paymentInfo'), {
        ...adminPaymentForm,
        qrisUrl: finalQrisUrl
      });
      Swal.fire('Berhasil', 'Pengaturan pembayaran admin disimpan.', 'success');
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Save Competition Settings
  const handleSaveCompSettings = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      await update(ref(db, 'admin/competitionSettings'), compSettings);
      Swal.fire('Berhasil', 'Pengaturan kompetisi diperbarui.', 'success');
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Save Logo
  const handleSaveLogo = async () => {
    if (!logoFile && !logoPreview) return;
    setIsUploading(true);
    try {
      let url = logoPreview;
      if (logoFile) {
        url = await uploadToCloudinary(logoFile, 'sobatniaga/assets');
      }
      await update(ref(db, 'admin/masterSettings'), { logoUrl: url });
      Swal.fire('Berhasil', 'Logo website diperbarui!', 'success');
      setLogoFile(null);
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Toggle Admin Voucher
  const handleToggleAdminVoucher = async () => {
    const newState = !adminVoucherEnabled;
    setAdminVoucherEnabled(newState);
    try {
      await update(ref(db, 'admin/masterSettings'), {
        voucherEnabled: newState
      });
    } catch (error) {
      console.error("Gagal update setting:", error);
    }
  };

  // Handle Save Voucher Settings
  const handleSaveVoucherSettings = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      await update(ref(db, 'admin/masterSettings'), {
        voucherAmount: Number(adminVoucherSettings.amount),
        minPurchase: Number(adminVoucherSettings.minPurchase),
        quota: Number(adminVoucherSettings.quota)
      });
      Swal.fire('Berhasil', 'Konfigurasi Voucher Admin disimpan.', 'success');
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // --- BANNER LOGIC ---
  const handleBannerFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const imageDataUrl = await readFile(file);
      setBannerImageSrc(imageDataUrl);
    }
  };

  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSaveBanner = async () => {
    if (!editingBanner) return;
    
    setIsUploading(true);
    try {
      let url;
      // 1. Cek apakah ada gambar baru yang diupload
      if (bannerImageSrc) {
        const croppedBlob = await getCroppedImg(bannerImageSrc, croppedAreaPixels);
        url = await uploadToCloudinary(croppedBlob, 'sobatniaga/banners');
      } else {
        // Gunakan URL lama jika tidak ada gambar baru
        const currentData = bannerSlots[editingBanner.id];
        url = typeof currentData === 'object' ? currentData?.url : currentData;
      }

      if (!url) throw new Error("Gambar wajib ada!");

      // 3. Simpan URL ke Database
      await update(ref(db, 'admin/banners'), {
        [editingBanner.id]: { url, link: bannerLink }
      });

      Swal.fire('Berhasil', `Banner ${editingBanner.label} diperbarui!`, 'success');
      setEditingBanner(null);
      setBannerImageSrc(null);
      setBannerLink('');
    } catch (error) {
      Swal.fire('Error', 'Gagal menyimpan banner: ' + error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Reset Points
  const handleResetPoints = async () => {
    Swal.fire({
      title: 'Reset Poin Kompetisi?',
      text: "Semua poin seller akan kembali ke 0. Tindakan ini tidak bisa dibatalkan!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Reset Poin'
    }).then(async (result) => {
      if (result.isConfirmed) {
        setIsUploading(true);
        try {
          const updates = {};
          users.forEach(user => {
            if (user.sellerInfo) {
                updates[`users/${user.uid}/sellerInfo/points_event`] = 0; // Reset Poin Event Saja
                updates[`users/${user.uid}/sellerInfo/competitionRevenue`] = 0;
                updates[`users/${user.uid}/sellerInfo/competitionQty`] = 0;
            }
          });
          if (Object.keys(updates).length > 0) await update(ref(db), updates);
          Swal.fire('Selesai', 'Poin semua seller telah di-reset.', 'success');
        } catch (error) {
          Swal.fire('Error', error.message, 'error');
        } finally {
          setIsUploading(false);
        }
      }
    });
  };

  // Handle Buka Modal Bulk Payout
  const handleOpenBulkPayout = (seller) => {
    const { orders, totalRevenue, totalFee } = getSellerPendingData(seller.uid);
    const currentBalance = seller.sellerInfo?.balance || 0;
    
    // Buka modal jika ada order pending ATAU ada saldo yang bisa ditarik
    if (orders.length === 0 && currentBalance <= 0) return;
    
    const netTransfer = totalRevenue - totalFee;

    setBulkPayoutData({
        seller,
        orders,
        totalRevenue,
        totalFee,
        netTransfer,
        currentBalance
    });
    // Default nominal: Jika ada order, pakai netTransfer. Jika tidak, pakai saldo saat ini.
    setPayoutAmount(orders.length > 0 ? netTransfer : currentBalance);
    setPayoutNote(''); // Reset note
    setPayoutSellerInfo(seller.sellerInfo); // Reuse state info seller untuk QRIS modal
  };

  // Logika Konfirmasi Bulk Payout
  const handleConfirmBulkPayout = async () => {
    if (!bulkProofFile) {
        Swal.fire('Bukti Transfer Kosong', 'Mohon upload bukti transfer.', 'warning');
        return;
    }
    
    const amountToDeduct = parseInt(payoutAmount);
    if (isNaN(amountToDeduct) || amountToDeduct <= 0) {
        Swal.fire('Invalid Amount', 'Masukkan nominal yang valid.', 'warning');
        return;
    }
    if (amountToDeduct > bulkPayoutData.currentBalance) {
         Swal.fire('Saldo Tidak Cukup', 'Nominal melebihi saldo seller.', 'warning');
         return;
    }
    
    setIsUploading(true);
    try {
        const proofUrl = await uploadToCloudinary(bulkProofFile, 'sobatniaga/payouts');
        const timestamp = new Date().toISOString();

        const updates = {};
        
        // Update SEMUA order yang terlibat
        bulkPayoutData.orders.forEach(order => {
            updates[`orders/${order.id}/payoutCompleted`] = true;
            updates[`orders/${order.id}/payoutProofUrl`] = proofUrl;
            updates[`orders/${order.id}/payoutAt`] = timestamp;
            updates[`orders/${order.id}/completedBy`] = 'admin';
        });

        // 2. DEBIT SALDO SELLER (Sesuai Input Admin)
        const sellerRef = ref(db, `users/${bulkPayoutData.seller.uid}/sellerInfo`);
        const newBalance = bulkPayoutData.currentBalance - amountToDeduct;
        
        await update(sellerRef, { balance: newBalance < 0 ? 0 : newBalance });

        // 3. Catat di Riwayat Penarikan (Withdrawals Log)
        const withdrawalData = { 
            sellerId: bulkPayoutData.seller.uid, 
            amount: amountToDeduct, 
            proofUrl, 
            status: 'success', 
            createdAt: timestamp, 
            orderIds: bulkPayoutData.orders.map(o => o.id), 
            type: 'bulk',
            note: payoutNote || 'Transfer Manual'
        };
        await push(ref(db, 'withdrawals'), withdrawalData);

        if (Object.keys(updates).length > 0) await update(ref(db), updates);

        setBulkPayoutData(null);
        setBulkProofFile(null);
        setPayoutAmount('');
        setPayoutNote('');
        Swal.fire('Pencairan Berhasil', `Dana Rp ${amountToDeduct.toLocaleString('id-ID')} telah dicairkan.`, 'success');

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setIsUploading(false);
    }
  };

  const handleBlockSeller = (uid, currentStatus) => {
    Swal.fire({
      title: currentStatus ? 'Buka Blokir?' : 'Blokir Seller Ini?',
      text: currentStatus ? 'Seller bisa berjualan lagi.' : 'Seller tidak akan bisa login.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: currentStatus ? '#3b82f6' : '#ef4444',
      confirmButtonText: currentStatus ? 'Buka Blokir' : 'Blokir'
    }).then(async (result) => {
      if (result.isConfirmed) {
        await update(ref(db, `users/${uid}`), { isBlocked: !currentStatus });
        Swal.fire('Berhasil', 'Status seller diperbarui.', 'success');
      }
    });
  };

  const handleAddSaldo = (user) => {
    Swal.fire({
      title: `Tambah Saldo untuk ${user.displayName}`,
      input: 'number',
      inputLabel: 'Masukkan nominal saldo yang ditambahkan',
      inputPlaceholder: 'Contoh: 50000',
      showCancelButton: true,
      confirmButtonText: 'Tambah Saldo',
    }).then(async (result) => {
      if (result.value) {
        const currentSaldo = user.saldo || 0;
        await update(ref(db, `users/${user.uid}`), { saldo: currentSaldo + parseInt(result.value) });
        Swal.fire('Berhasil!', `Saldo berhasil ditambahkan.`, 'success');
      }
    });
  };

  const downloadReport = () => {
    const csvContent = [
      ['Tanggal', 'ID Order', 'Nama Seller', 'Nominal', 'Admin Fee', 'Netto Seller'],
      ...completedOrders.map(order => {
        const sellerId = order.items?.[0]?.sellerId;
        const sellerName = order.items?.[0]?.storeName || 'Unknown'; // Simplifikasi: Ambil seller pertama
        const financials = calculateOrderFinancials(order, sellerId, sellerMap);
        
        const nominal = financials.net;
        const fee = financials.fee;
        
        const netto = nominal - fee;
        return [
          new Date(order.createdAt).toLocaleDateString('id-ID'),
          order.id,
          sellerName,
          nominal,
          fee,
          netto
        ];
      })
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_Keuangan_SobatNiaga_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const downloadWithdrawalReport = () => {
    const csvContent = [
      ['Tanggal', 'Nama Toko', 'Nominal Transfer', 'Metode/Catatan', 'Status', 'Link Bukti'],
      ...withdrawals.map(wd => {
        const seller = users.find(u => u.uid === wd.sellerId);
        const storeName = seller?.sellerInfo?.storeName || 'Unknown Seller';
        return [
          new Date(wd.createdAt).toLocaleString('id-ID'),
          `"${storeName}"`,
          wd.amount,
          `"${wd.note || (wd.type === 'manual' ? 'Manual WD' : 'Pencairan Order')}"`,
          'Selesai',
          wd.proofUrl
        ];
      })
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Riwayat_Pembayaran_Seller_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  // Helper Status Badge
  const getStatusBadge = (status) => {
    switch (status) {
      case 'waiting_payment': return <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold">Belum Bayar</span>;
      case 'waiting_verification': return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold animate-pulse">Perlu Verifikasi</span>;
      case 'processed': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">Diproses</span>;
      case 'shipped': return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">Dikirim</span>;
      case 'completed': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Selesai</span>;
      case 'cancelled': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold">Batal</span>;
      default: return <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  // --- RENDERERS ---

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Reward Candidates Card */}
      {rewardCandidates.length > 0 && (
        <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-yellow-900/30' : 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-100'}`}>
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="text-yellow-600" size={24} />
            <h3 className={`font-bold text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Kandidat Reward Bulan Ini</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rewardCandidates.map((cand, idx) => (
              <div key={cand.id} className={`p-4 rounded-xl border shadow-sm flex items-center gap-3 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-yellow-200'}`}>
                <div className="w-8 h-8 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center font-bold">{idx + 1}</div>
                <div>
                  <p className={`font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{cand.name}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Skor: {Math.floor(cand.points)} | Rp {cand.revenue.toLocaleString('id-ID')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Total Omzet</p>
          <h3 className="text-3xl font-bold text-sky-600 mt-2">Rp {totalRevenue.toLocaleString('id-ID')}</h3>
        </div>
        <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Profit Admin</p>
          <h3 className="text-3xl font-bold text-green-600 mt-2">Rp {totalProfit.toLocaleString('id-ID')}</h3>
          <p className="text-xs text-gray-400 mt-1">Dari {completedOrders.length} transaksi selesai</p>
        </div>
        <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <p className="text-gray-500 text-xs font-bold uppercase">Total Transaksi</p>
          <h3 className={`text-3xl font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{orders.length}</h3>
        </div>
      </div>

      {/* Chart & Top Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-2 p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Grafik Pendapatan (7 Hari)</h3>
          <div className="h-64"><Line data={chartData} options={chartOptions} /></div>
        </div>
        <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Top Seller</h3>
          <div className="space-y-4">
            {/* Dummy Top Sellers Logic - Realnya perlu agregasi */}
            {users.filter(u => u.sellerInfo).slice(0, 5).map((seller, idx) => (
              <div key={seller.uid} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>{idx + 1}</div>
                <div>
                  <p className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{seller.sellerInfo?.storeName}</p>
                  <p className="text-xs text-gray-500">{Math.floor(seller.sellerInfo?.points_event || 0)} Poin Race</p>
                  <p className="text-xs text-gray-500">{seller.sellerInfo?.points_loyalty || 0} Poin Loyalty</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderVerification = () => {
    // Filter Logic berdasarkan Tab
    let filteredOrders = orders;
    if (verificationTab !== 'all') {
      filteredOrders = orders.filter(o => o.status === verificationTab);
    }
    // Sort terbaru
    filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return (
      <div className="space-y-4">
        {/* Tab Filter */}
        <div className={`p-2 rounded-xl shadow-sm border flex overflow-x-auto scrollbar-hide ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          {[
            { id: 'all', label: 'Semua' },
            { id: 'waiting_verification', label: 'Menunggu Verifikasi' },
            { id: 'processed', label: 'Proses' },
            { id: 'shipped', label: 'Dikirim' },
            { id: 'completed', label: 'Selesai' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setVerificationTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                verificationTab === tab.id ? 'bg-sky-600 text-white shadow-md' : (isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-50')
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={`rounded-2xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <div className={`p-6 border-b flex justify-between items-center ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <h3 className={`font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Daftar Transaksi ({filteredOrders.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={`font-bold ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>
                <tr>
                  <th className="px-6 py-4">ID Order</th>
                  <th className="px-6 py-4">Pembeli</th>
                  <th className="px-6 py-4">Penjual</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700 text-gray-300' : 'divide-gray-100'}`}>
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Tidak ada data transaksi.</td></tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className={`hover:transition-colors ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-6 py-4 font-mono">#{order.id.slice(-6)}</td>
                      <td className="px-6 py-4">{order.buyerName}</td>
                      <td className="px-6 py-4">{order.items?.[0]?.storeName || '-'}</td>
                      <td className="px-6 py-4 font-bold text-sky-600">Rp {order.totalPrice?.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                      <td className="px-6 py-4 text-right">
                        {order.status === 'waiting_verification' && (
                          <button onClick={() => setSelectedOrder(order)} className="bg-sky-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-sky-700 shadow-sm">Validasi Pembayaran</button>
                        )}
                        {order.status === 'processed' && (
                          <span className="text-xs text-gray-500 italic">Menunggu Seller Input Resi</span>
                        )}
                        {order.status === 'shipped' && (
                          <div className="text-xs">
                              <span className="block text-gray-500">Dalam Perjalanan</span>
                              <span className={`font-mono font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>Resi: {order.resi || '-'}</span>
                          </div>
                        )}
                        {order.status === 'completed' && !order.payoutCompleted && (
                          <button onClick={() => handleOpenPayout(order)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-green-700 shadow-sm">Cairkan Dana</button>
                        )}
                        {order.status === 'completed' && order.payoutCompleted && (
                          <span className="text-xs text-green-600 font-bold flex items-center justify-end gap-1"><CheckCircle size={12}/> Dana Cair</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderSellers = () => {
    const sellers = users.filter(u => u.sellerInfo);
    return (
      <div className={`rounded-2xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className={`p-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Database Penjual ({sellers.length})</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className={`font-bold ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>
            <tr>
              <th className="px-6 py-4">Nama Toko</th>
              <th className="px-6 py-4">Pemilik</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Saldo Siap Cair</th>
              <th className="px-6 py-4">Saldo Digital</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700 text-gray-300' : 'divide-gray-100'}`}>
            {sellers.map(seller => {
              const { totalRevenue, totalFee, orders: pendingOrders } = getSellerPendingData(seller.uid);
              const netBalance = totalRevenue - totalFee;

              return (
              <tr key={seller.uid} className={`hover:transition-colors ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}>
                <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{seller.sellerInfo.storeName}</td>
                <td className="px-6 py-4">{seller.displayName || 'User'}</td>
                <td className="px-6 py-4">
                  {seller.sellerInfo.isTrustedSeller ? (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><ShieldCheck size={12}/> Terpercaya</span>
                  ) : (
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold">Regular</span>
                  )}
                </td>
                <td className="px-6 py-4">
                    <div>
                        <p className="font-bold text-green-600">Rp {(seller.sellerInfo.balance || 0).toLocaleString('id-ID')}</p>
                        {pendingOrders.length > 0 && (
                            <p className="text-xs text-gray-400">{pendingOrders.length} Order Pending</p>
                        )}
                    </div>
                </td>
                <td className="px-6 py-4">
                  <p className="font-bold text-sky-600">Rp {(seller.saldo || 0).toLocaleString('id-ID')}</p>
                </td>
                <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                  {(pendingOrders.length > 0 || (seller.sellerInfo.balance || 0) > 0) && (
                      <button 
                        onClick={() => handleOpenBulkPayout(seller)}
                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-green-700 shadow-sm whitespace-nowrap"
                      >
                        Cairkan Saldo
                      </button>
                  )}
                  <button onClick={() => handleAddSaldo(seller)} className="text-sky-500 hover:bg-sky-50 p-2 rounded-lg" title="Tambah Saldo Digital">
                    <WalletIcon size={18} />
                  </button>
                  <button onClick={() => handleBlockSeller(seller.uid, seller.isBlocked)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
                    <Ban size={18} />
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFinance = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Laporan Pendapatan (Order)</h3>
        <button onClick={downloadReport} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-700 shadow-lg shadow-green-200">
          <Download size={18} /> Export Order
        </button>
      </div>

      <div className={`rounded-2xl shadow-sm border overflow-hidden mb-8 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="overflow-x-auto overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-gray-200">
        <table className="w-full text-left text-sm relative">
          <thead className={`font-bold sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>
            <tr>
              <th className="px-6 py-4">Tanggal</th>
              <th className="px-6 py-4">ID Order</th>
              <th className="px-6 py-4">Seller</th>
              <th className="px-6 py-4">Nominal</th>
              <th className="px-6 py-4 text-red-500">Admin Fee</th>
              <th className="px-6 py-4 text-green-600">Netto Seller</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700 text-gray-300' : 'divide-gray-100'}`}>
            {completedOrders.map(order => {
              // Simplifikasi: Asumsi 1 order 1 seller utama untuk display list
              const sellerId = order.items?.[0]?.sellerId;
              const financials = calculateOrderFinancials(order, sellerId, sellerMap);
              const fee = financials.fee;

              return (
              <tr key={order.id} className={`hover:transition-colors ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}>
                <td className="px-6 py-4 text-gray-500">{new Date(order.createdAt).toLocaleDateString('id-ID')}</td>
                <td className="px-6 py-4 font-mono text-xs">#{order.id.slice(-6)}</td>
                <td className="px-6 py-4">{order.items?.[0]?.storeName || '-'}</td>
                <td className="px-6 py-4 font-bold">Rp {financials.net.toLocaleString('id-ID')}</td>
                <td className="px-6 py-4 text-red-500 font-bold">- Rp {fee.toLocaleString('id-ID')}</td>
                <td className="px-6 py-4 text-green-600 font-bold">Rp {financials.payout.toLocaleString('id-ID')}</td>
              </tr>
            )})}
          </tbody>
        </table>
        </div>
        <div className={`p-3 border-t text-xs text-right font-medium ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
            Total: {completedOrders.length} Transaksi Selesai
        </div>
      </div>

      {/* Tabel Log Pembayaran Sukses */}
      <div className={`flex justify-between items-center pt-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h3 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Log Pembayaran Sukses (Withdrawal)</h3>
        <button onClick={downloadWithdrawalReport} className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-sky-700 shadow-lg shadow-sky-200">
          <Download size={18} /> Export Log
        </button>
      </div>

      <div className={`rounded-2xl shadow-sm border overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="overflow-x-auto overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-gray-200">
        <table className="w-full text-left text-sm relative">
          <thead className={`font-bold sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>
            <tr>
              <th className="px-6 py-4">Tanggal</th>
              <th className="px-6 py-4">Nama Toko</th>
              <th className="px-6 py-4">Nominal Transfer</th>
              <th className="px-6 py-4">Metode / Catatan</th>
              <th className="px-6 py-4">Bukti</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700 text-gray-300' : 'divide-gray-100'}`}>
            {withdrawals.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Belum ada riwayat pembayaran.</td></tr>
            ) : (
                withdrawals.map(wd => {
                const seller = users.find(u => u.uid === wd.sellerId);
                const storeName = seller?.sellerInfo?.storeName || 'Unknown Seller';
                return (
                <tr key={wd.id} className={`hover:transition-colors ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}>
                    <td className="px-6 py-4 text-gray-500">{new Date(wd.createdAt).toLocaleString('id-ID')}</td>
                    <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{storeName}</td>
                    <td className="px-6 py-4 font-bold text-red-600 cursor-pointer hover:text-red-800 transition-colors" onClick={() => { navigator.clipboard.writeText(wd.amount); Swal.fire({ icon: 'success', title: 'Nominal Disalin!', toast: true, position: 'top', showConfirmButton: false, timer: 1000 }); }} title="Klik untuk salin nominal">
                        - Rp {wd.amount.toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-xs">
                        <span className={`px-2 py-1 rounded border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                            {wd.note || (wd.type === 'manual' ? 'Manual WD' : 'Pencairan Order')}
                        </span>
                    </td>
                    <td className="px-6 py-4">
                        <button onClick={() => setSelectedProof({ url: wd.proofUrl, storeName, amount: wd.amount })} className="text-sky-600 hover:underline text-xs font-bold flex items-center gap-1">
                            <ImageIcon size={14}/> Lihat
                        </button>
                    </td>
                    <td className="px-6 py-4">
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Selesai</span>
                    </td>
                </tr>
                )})
            )}
          </tbody>
        </table>
        </div>
        <div className={`p-3 border-t text-xs text-right font-medium ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
            Total: {withdrawals.length} Riwayat Pembayaran
        </div>
      </div>
    </div>
  );

  const renderBanners = () => {
    // Helper untuk render card slot
    const renderSlotCard = (slot) => {
      const slotData = bannerSlots[slot.id];
      const imageUrl = typeof slotData === 'object' ? slotData?.url : slotData;
      const linkUrl = typeof slotData === 'object' ? slotData?.link : '';

      return (
      <div key={slot.id} className={`rounded-2xl shadow-sm border overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="relative aspect-video bg-gray-100 flex items-center justify-center overflow-hidden group">
          {imageUrl ? (
            <img src={imageUrl} alt={slot.label} className={`w-full h-full object-cover ${slot.id === 'chat_icon' ? 'object-contain p-4' : ''}`} />
          ) : (
            <div className="text-gray-400 flex flex-col items-center">
              <ImageIcon size={32} className="mb-2" />
              <span className="text-xs">Kosong</span>
            </div>
          )}
          
          {/* Overlay Edit */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button 
              onClick={() => { 
                setEditingBanner(slot); 
                setBannerImageSrc(null); 
                setZoom(1);
                setBannerLink(linkUrl || '');
              }}
              className="bg-white text-gray-800 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-gray-100"
            >
              <Crop size={16} /> Ganti
            </button>
          </div>
        </div>
        <div className="p-4">
          <h4 className={`font-bold text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{slot.label}</h4>
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{slot.desc}</p>
          {linkUrl && (
             <p className="text-[10px] text-sky-600 mt-1 truncate flex items-center gap-1">
               <span className="font-bold">Link:</span> {linkUrl}
             </p>
          )}
          <p className="text-[10px] text-sky-600 mt-2 font-mono bg-sky-50 dark:bg-sky-900/30 w-fit px-2 py-0.5 rounded">Rek: {slot.rec}</p>
        </div>
      </div>
    )};

    return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Manajemen Gambar</h3>
        <p className="text-sm text-gray-500">Command Center Visual: Atur semua aset gambar di sini.</p>
      </div>

      {/* 1. Logo Website (Top Priority) */}
      <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <h4 className={`font-bold mb-4 flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <ImageIcon size={20} className="text-sky-500" /> Logo Website
        </h4>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className={`w-32 h-32 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden relative ${isDarkMode ? 'border-gray-600 bg-gray-900' : 'border-gray-300 bg-gray-50'}`}>
            {logoPreview ? (
              <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain p-2" />
            ) : (
              <span className="text-xs text-gray-400">No Logo</span>
            )}
          </div>
          <div className="flex-1 w-full">
            <p className={`text-sm mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Logo utama yang muncul di navigasi atas (Navbar).
            </p>
            <p className="text-xs text-sky-600 mb-4 font-mono">Rekomendasi: PNG Transparan, Max 2MB.</p>
            <div className="flex gap-3">
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => { if(e.target.files[0]) { setLogoFile(e.target.files[0]); setLogoPreview(URL.createObjectURL(e.target.files[0])); } }} 
                className={`block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:cursor-pointer ${isDarkMode ? 'text-gray-300 file:bg-gray-700 file:text-sky-400 hover:file:bg-gray-600' : 'text-gray-500 file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100'}`} 
              />
              <button 
                onClick={handleSaveLogo} 
                disabled={isUploading || !logoFile} 
                className="px-6 py-2 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 disabled:bg-gray-400 transition-all shadow-lg shadow-sky-200/50"
              >
                {isUploading ? 'Saving...' : 'Simpan Logo'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Aset Global */}
      <div>
        <h4 className={`font-bold mb-4 text-lg ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Aset Global</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BANNER_SLOTS.filter(s => ['home_bg_static', 'chat_icon'].includes(s.id)).map(renderSlotCard)}
        </div>
      </div>

      {/* 3. Home Slider */}
      <div>
        <h4 className={`font-bold mb-4 text-lg ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Home Slider (Banner Utama)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BANNER_SLOTS.filter(s => s.id.startsWith('home_slider')).map(renderSlotCard)}
        </div>
      </div>

      {/* 4. Fashion Hero */}
      <div>
        <h4 className={`font-bold mb-4 text-lg ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Kategori Fashion</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BANNER_SLOTS.filter(s => s.id.startsWith('fashion')).map(renderSlotCard)}
        </div>
      </div>

      {/* Modal Cropper */}
      {editingBanner && (
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Edit {editingBanner.label}</h3>
              <button onClick={() => setEditingBanner(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={24}/></button>
            </div>

            <div className="flex-1 bg-gray-900 relative rounded-xl overflow-hidden min-h-[300px] mb-4">
              {bannerImageSrc ? (
                <Cropper
                  image={bannerImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={editingBanner.ratio}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  {/* Tampilkan gambar lama jika ada */}
                  {(() => {
                     const currentData = bannerSlots[editingBanner.id];
                     const currentUrl = typeof currentData === 'object' ? currentData?.url : currentData;
                     if (currentUrl) return <img src={currentUrl} className="w-full h-full object-contain opacity-50" alt="Current" />;
                     return null;
                  })()}
                  <label className="cursor-pointer flex flex-col items-center hover:text-white transition-colors absolute z-10">
                    <Upload size={48} className="mb-2" />
                    <span className="font-bold">Klik untuk Upload Gambar Baru</span>
                    <input type="file" accept="image/*" onChange={handleBannerFileChange} className="hidden" />
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-4">
                {bannerImageSrc && (
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-gray-500">Zoom</span>
                  <input 
                    type="range" 
                    value={zoom} 
                    min={1} 
                    max={3} 
                    step={0.1} 
                    aria-labelledby="Zoom" 
                    onChange={(e) => setZoom(e.target.value)} 
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                )}

                {/* Input Link */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">Link Tujuan (Opsional)</label>
                  <input 
                    type="text" 
                    value={bannerLink} 
                    onChange={(e) => setBannerLink(e.target.value)}
                    placeholder="https://... atau /halaman"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-sky-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-500">Masukkan URL lengkap (https://) untuk link luar, atau path (/produk) untuk link dalam.</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setBannerImageSrc(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">
                    Reset Gambar
                  </button>
                  <button 
                    onClick={handleSaveBanner} 
                    disabled={isUploading}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 size={20} className="animate-spin" /> : 'Simpan & Terapkan'}
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className={`max-w-2xl mx-auto p-8 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
      
      {/* Dark Mode Toggle */}
      <div className={`mb-10 border-b pb-10 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-xl font-bold mb-1 flex items-center gap-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
              {isDarkMode ? <Moon size={24} className="text-sky-400" /> : <Sun size={24} className="text-orange-500" />} Tampilan Dashboard
            </h3>
            <p className="text-sm text-gray-500">Sesuaikan kenyamanan mata Anda.</p>
          </div>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${isDarkMode ? 'bg-sky-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Master Control Panel */}
      <div className={`mb-10 border-b pb-10 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
          <Settings size={24} className="text-gray-600" /> Master Settings
        </h3>

        <div className={`flex items-center justify-between p-4 rounded-xl border mb-4 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            <div>
              <p className={`font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Voucher Admin Global</p>
              <p className="text-xs text-gray-500">{adminVoucherEnabled ? 'Aktif (Semua user bisa pakai)' : 'Nonaktif (Disabled)'}</p>
            </div>
            <button onClick={handleToggleAdminVoucher} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${adminVoucherEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${adminVoucherEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>

        {/* Form Konfigurasi Voucher Admin */}
        {adminVoucherEnabled && (
            <form onSubmit={handleSaveVoucherSettings} className={`p-4 rounded-xl border space-y-4 animate-in fade-in slide-in-from-top-2 ${isDarkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-100'}`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                        <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Nominal Potongan (Rp)</label>
                        <input 
                            type="number" 
                            value={adminVoucherSettings.amount} 
                            onChange={e => setAdminVoucherSettings({...adminVoucherSettings, amount: e.target.value})} 
                            className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-blue-200'}`} 
                            placeholder="Contoh: 5000" 
                            required 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Min. Belanja (Rp)</label>
                        <input 
                            type="number" 
                            value={adminVoucherSettings.minPurchase} 
                            onChange={e => setAdminVoucherSettings({...adminVoucherSettings, minPurchase: e.target.value})} 
                            className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-blue-200'}`} 
                            placeholder="Contoh: 20000" 
                            required 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Kuota Voucher</label>
                        <input 
                            type="number" 
                            value={adminVoucherSettings.quota} 
                            onChange={e => setAdminVoucherSettings({...adminVoucherSettings, quota: e.target.value})} 
                            className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-blue-200'}`} 
                            placeholder="Contoh: 50" 
                            required 
                        />
                    </div>
                </div>
                <button disabled={isUploading} type="submit" className="w-full py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 text-sm">
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Simpan Konfigurasi Voucher</>}
                </button>
            </form>
        )}
      </div>

      {/* Competition Control Panel */}
      <div className={`mb-10 border-b pb-10 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
          <Trophy size={24} className="text-yellow-500" /> Panel Kendali Kompetisi
        </h3>
        <form onSubmit={handleSaveCompSettings} className="space-y-6">
          <div className={`flex items-center justify-between p-4 rounded-xl border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            <div>
              <p className={`font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Status Kompetisi</p>
              <p className="text-xs text-gray-500">{compSettings.isActive ? 'Sedang Berlangsung' : 'Tidak Aktif'}</p>
            </div>
            <button 
              type="button"
              onClick={() => setCompSettings({...compSettings, isActive: !compSettings.isActive})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${compSettings.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${compSettings.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tanggal Mulai</label>
              <input type="date" value={compSettings.startDate} onChange={e => setCompSettings({...compSettings, startDate: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} required />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tanggal Selesai</label>
              <input type="date" value={compSettings.endDate} onChange={e => setCompSettings({...compSettings, endDate: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} required />
            </div>
          </div>

          <div className="flex gap-3">
            <button disabled={isUploading} type="submit" className="flex-1 py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 flex items-center justify-center gap-2">
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : <><Save size={18} /> Simpan Pengaturan</>}
            </button>
            <button type="button" onClick={handleResetPoints} className="px-4 py-3 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center justify-center gap-2" title="Reset Poin">
              <RefreshCw size={18} /> Reset Poin
            </button>
          </div>
        </form>
      </div>

      {/* Payment Settings */}
      <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
        <CreditCard size={24} className="text-sky-600" /> Pengaturan Rekening Pusat (Admin)
      </h3>
      <p className="text-sm text-gray-500 mb-6">Data ini akan ditampilkan kepada pembeli saat melakukan pembayaran.</p>

      <form onSubmit={handleSaveAdminSettings} className="space-y-6">
        {/* Upload QRIS Admin */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">QRIS Pusat</label>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 cursor-pointer relative h-48">
            <input type="file" accept="image/*" onChange={(e) => {
              if(e.target.files[0]) {
                setAdminQrisFile(e.target.files[0]);
                setAdminQrisPreview(URL.createObjectURL(e.target.files[0]));
              }
            }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            {adminQrisPreview ? (
              <img src={adminQrisPreview} alt="QRIS Admin" className="h-full object-contain" />
            ) : (
              <div className="text-gray-400">
                <ImageIcon size={32} className="mx-auto mb-2" />
                <span className="text-xs">Klik untuk upload QRIS Admin</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Nama Bank</label>
            <input type="text" value={adminPaymentForm.bankName} onChange={e => setAdminPaymentForm({...adminPaymentForm, bankName: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} placeholder="BCA" required />
          </div>
          <div className="space-y-1">
            <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Atas Nama</label>
            <input type="text" value={adminPaymentForm.accountHolder} onChange={e => setAdminPaymentForm({...adminPaymentForm, accountHolder: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} placeholder="PT SobatNiaga" required />
          </div>
        </div>
        <div className="space-y-1">
          <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Nomor Rekening</label>
          <input type="text" value={adminPaymentForm.bankAccount} onChange={e => setAdminPaymentForm({...adminPaymentForm, bankAccount: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} placeholder="1234567890" required />
        </div>

        <button disabled={isUploading} type="submit" className="w-full py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 flex items-center justify-center gap-2">
          {isUploading ? <Loader2 size={20} className="animate-spin" /> : 'Simpan Pengaturan'}
        </button>
      </form>
    </div>
  );

  return (
    <div className={`min-h-screen flex font-sans text-[#333333] ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50'}`}>
      
      {/* Sidebar */}
      <aside className={`w-64 fixed h-full hidden lg:flex flex-col ${isDarkMode ? 'bg-gray-800 text-gray-100 border-r border-gray-700' : 'bg-sky-900 text-white'}`}>
        <div className="p-6 border-b border-sky-800">
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-xs text-sky-300 mt-1">SobatNiaga Escrow System</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-sky-700 text-white shadow-lg' : 'text-sky-200 hover:bg-sky-800'}`}>
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button onClick={() => setActiveTab('verification')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'verification' ? 'bg-sky-700 text-white shadow-lg' : 'text-sky-200 hover:bg-sky-800'}`}>
            <FileCheck size={20} /> Verifikasi Transaksi
            {orders.filter(o => o.status === 'waiting_verification').length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {orders.filter(o => o.status === 'waiting_verification').length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('sellers')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'sellers' ? 'bg-sky-700 text-white shadow-lg' : 'text-sky-200 hover:bg-sky-800'}`}>
            <Users size={20} /> Daftar Penjual
          </button>
          <button onClick={() => setActiveTab('finance')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'finance' ? 'bg-sky-700 text-white shadow-lg' : 'text-sky-200 hover:bg-sky-800'}`}>
            <Wallet size={20} /> Laporan Keuangan
          </button>
          <button onClick={() => setActiveTab('banners')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'banners' ? 'bg-sky-700 text-white shadow-lg' : 'text-sky-200 hover:bg-sky-800'}`}>
            <ImageIcon size={20} /> Manajemen Gambar
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-sky-700 text-white shadow-lg' : 'text-sky-200 hover:bg-sky-800'}`}>
            <Settings size={20} /> Pengaturan
          </button>
        </nav>
        
        {/* Sidebar Footer */}
        <div className="p-4 border-t border-sky-800">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-sky-200 hover:bg-sky-800 transition-all mb-2">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />} {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={onBack} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-300 hover:bg-sky-800 transition-all">
            <LogOut size={20} /> Keluar Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 p-8">
        {/* Header Mobile */}
        <div className="lg:hidden mb-6 flex items-center justify-between">
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Admin Panel</h1>
          <button onClick={onBack} className={`p-2 rounded-lg shadow-sm ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white'}`}><ArrowLeft size={20}/></button>
        </div>

        {/* Content Area */}
        <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'verification' && renderVerification()}
          {activeTab === 'sellers' && renderSellers()}
          {activeTab === 'finance' && renderFinance()}
          {activeTab === 'banners' && renderBanners()}
          {activeTab === 'settings' && renderSettings()}
        </div>
      </main>

      {/* Modal Verifikasi */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
            
            {/* Kiri: Bukti Transfer */}
            <div className="w-full md:w-1/2 bg-gray-900 flex items-center justify-center p-4 relative">
              <img 
                src={selectedOrder.proofUrl} 
                alt="Bukti Transfer" 
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
              <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">
                Bukti Upload Pembeli
              </div>
            </div>

            {/* Kanan: Detail & Aksi */}
            <div className="w-full md:w-1/2 p-8 flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Verifikasi Pembayaran</h2>
                <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Total yang harus dibayar</p>
                  <p className="text-3xl font-bold text-sky-600">Rp {selectedOrder.totalPrice?.toLocaleString('id-ID')}</p>
                </div>

                {/* Rincian Produk */}
                <div className="space-y-2">
                  <h4 className="font-bold text-gray-800 text-sm">Rincian Produk</h4>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                    {(Array.isArray(selectedOrder.items) ? selectedOrder.items : Object.values(selectedOrder.items || {})).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start text-sm border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                        <div>
                          <p className="font-bold text-gray-700">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.quantity} x Rp {parseInt(item.price).toLocaleString('id-ID')}</p>
                          <p className="text-[10px] text-gray-400">Toko: {item.storeName}</p>
                        </div>
                        <p className="font-bold text-gray-800">Rp {(item.quantity * item.price).toLocaleString('id-ID')}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">ID Pesanan</span>
                    <span className="font-mono font-bold">#{selectedOrder.id}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Nama Pembeli</span>
                    <span className="font-bold">{selectedOrder.buyerName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Waktu Upload</span>
                    <span className="font-bold">{new Date(selectedOrder.paidAt).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-gray-100">
                <button 
                  onClick={() => handleRejectPayment(selectedOrder.id)}
                  className="py-3 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
                >
                  Tolak (Salah)
                </button>
                <button 
                  onClick={() => handleApprovePayment(selectedOrder.id)}
                  className="py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 transition-all"
                >
                  Valid (Setujui)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pencairan Dana */}
      {payoutOrder && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-800">Cairkan Dana ke Penjual</h2>
              <button onClick={() => setPayoutOrder(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
              {(() => {
                const sellerId = payoutOrder.items?.[0]?.sellerId;
                const financials = calculateOrderFinancials(payoutOrder, sellerId, sellerMap);
                return (
                  <>
                    <p className="text-xs text-gray-500 flex justify-between"><span>Total Order (Net):</span> <span>Rp {financials.net.toLocaleString('id-ID')}</span></p>
                    {financials.voucherDed > 0 && <p className="text-xs text-orange-500 flex justify-between"><span>Voucher Seller:</span> <span>- Rp {financials.voucherDed.toLocaleString('id-ID')}</span></p>}
                    <p className="text-xs text-red-500 flex justify-between"><span>Admin Fee:</span> <span>- Rp {financials.fee.toLocaleString('id-ID')}</span></p>
                    <div className="border-t border-gray-200 my-2"></div>
                    <p className="text-sm font-bold text-gray-600">Total Transfer ke Seller:</p>
                    <p className="text-2xl font-bold text-green-600">Rp {financials.payout.toLocaleString('id-ID')}</p>
                  </>
                );
              })()}
            </div>

            {/* Info Rekening Seller */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
              <h4 className="text-xs font-bold text-blue-800 mb-2 uppercase">Tujuan Transfer (Seller)</h4>
              {payoutSellerInfo?.paymentDetails ? (
                <div className="text-sm text-gray-700 space-y-1">
                  <p><span className="font-semibold">Bank:</span> {payoutSellerInfo.paymentDetails.bankName}</p>
                  <p><span className="font-semibold">No. Rek:</span> <span className="font-mono bg-white px-1 rounded">{payoutSellerInfo.paymentDetails.bankAccount}</span></p>
                  <p><span className="font-semibold">A.N:</span> {payoutSellerInfo.paymentDetails.accountHolder}</p>
                  {payoutSellerInfo.paymentDetails.qrisUrl && (
                    <button onClick={() => setShowSellerQris(true)} className="text-xs text-blue-600 underline block mt-1 hover:text-blue-800 font-bold">Lihat QRIS Seller</button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-red-500 italic">Seller belum mengatur info pencairan.</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">Upload Bukti Transfer Balik</label>
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setPayoutProofFile(e.target.files[0])}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
              />
            </div>

            {/* Input Catatan Transfer (Single Payout) */}
            <div className="mb-4">
              <input 
                type="text" 
                value={payoutNote} 
                onChange={(e) => setPayoutNote(e.target.value)} 
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 focus:border-sky-500 outline-none"
                placeholder="Catatan (Misal: Transfer via BCA)"
              />
            </div>

            <button 
              onClick={handleConfirmPayout}
              disabled={isUploading}
              className="w-full py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
            >
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : 'Konfirmasi Pencairan'}
            </button>
          </div>
        </div>
      )}

      {/* Modal Bulk Payout */}
      {bulkPayoutData && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-800">Pencairan Dana - {bulkPayoutData.seller.sellerInfo.storeName}</h2>
              <button onClick={() => { setBulkPayoutData(null); setBulkProofFile(null); }} className="text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total {bulkPayoutData.orders.length} Pesanan</span>
                  <span className="font-bold">Rp {bulkPayoutData.totalRevenue.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-sm text-red-500">
                  <span>Total Admin Fee</span>
                  <span>- Rp {bulkPayoutData.totalFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="border-t border-gray-200 my-2"></div>
              <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-600">Total Transfer</span>
                  <span className="text-2xl font-bold text-green-600">Rp {bulkPayoutData.netTransfer.toLocaleString('id-ID')}</span>
              </div>
              
              {/* Input Nominal Manual */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <label className="block text-xs font-bold text-gray-700 mb-1">Nominal yang Dicairkan (Editable)</label>
                <input 
                  type="number" 
                  value={payoutAmount} 
                  onChange={(e) => setPayoutAmount(e.target.value)} 
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-bold text-gray-800 focus:border-sky-500 outline-none"
                  placeholder="Masukkan nominal"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Sisa Saldo: Rp {(bulkPayoutData.currentBalance - (parseInt(payoutAmount) || 0)).toLocaleString('id-ID')}
                </p>
              </div>

              {/* Input Catatan Transfer */}
              <div className="mt-2">
                <input 
                  type="text" 
                  value={payoutNote} 
                  onChange={(e) => setPayoutNote(e.target.value)} 
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 focus:border-sky-500 outline-none"
                  placeholder="Catatan (Misal: Transfer via BCA)"
                />
              </div>
            </div>

            {/* Info Rekening Seller */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
              <h4 className="text-xs font-bold text-blue-800 mb-2 uppercase">Tujuan Transfer</h4>
              {bulkPayoutData.seller.sellerInfo.paymentDetails ? (
                <div className="text-sm text-gray-700 space-y-1">
                  <p><span className="font-semibold">Bank:</span> {bulkPayoutData.seller.sellerInfo.paymentDetails.bankName}</p>
                  <p><span className="font-semibold">No. Rek:</span> <span className="font-mono bg-white px-1 rounded">{bulkPayoutData.seller.sellerInfo.paymentDetails.bankAccount}</span></p>
                  <p><span className="font-semibold">A.N:</span> {bulkPayoutData.seller.sellerInfo.paymentDetails.accountHolder}</p>
                  {bulkPayoutData.seller.sellerInfo.paymentDetails.qrisUrl && (
                    <button onClick={() => setShowSellerQris(true)} className="text-xs text-blue-600 underline block mt-1 hover:text-blue-800 font-bold">Lihat QRIS Seller</button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-red-500 italic">Seller belum mengatur info pencairan.</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">Upload Bukti Transfer Bulk</label>
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setBulkProofFile(e.target.files[0])}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
              />
            </div>

            <button 
              onClick={handleConfirmBulkPayout}
              disabled={isUploading}
              className="w-full py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
            >
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : 'Konfirmasi Pencairan'}
            </button>
          </div>
        </div>
      )}

      {/* Modal Lihat QRIS Seller */}
      {showSellerQris && payoutSellerInfo?.paymentDetails?.qrisUrl && (
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowSellerQris(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSellerQris(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
            
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Scan QRIS Penjual</h3>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex justify-center mb-4">
              <img src={payoutSellerInfo.paymentDetails.qrisUrl} alt="QRIS Seller" className="max-w-[250px] max-h-[350px] object-contain rounded-lg shadow-sm" />
            </div>

            <div className="text-center space-y-1 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
              <p className="font-bold text-blue-800">{payoutSellerInfo.storeName || 'Nama Toko'}</p>
              <p>{payoutSellerInfo.paymentDetails.bankName} - {payoutSellerInfo.paymentDetails.bankAccount}</p>
              <p>a.n {payoutSellerInfo.paymentDetails.accountHolder}</p>
            </div>

            <button onClick={() => setShowSellerQris(false)} className="w-full mt-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition-colors">
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal Lihat Bukti Transfer Log (Admin) */}
      {selectedProof && (
        <div className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedProof(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedProof(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
            
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Bukti Transfer</h3>
            
            <div className="bg-gray-100 rounded-xl overflow-hidden mb-4 flex-shrink-0 relative border border-gray-200 flex items-center justify-center min-h-[200px]">
              <img 
                src={selectedProof.url} 
                alt="Bukti Transfer" 
                className="w-full h-full object-contain max-h-[50vh]" 
              />
            </div>

            <div className="text-center space-y-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500">Bukti Transfer untuk <span className="font-bold text-gray-800">{selectedProof.storeName}</span></p>
              <p className="text-lg font-bold text-green-600">Nominal: Rp {selectedProof.amount.toLocaleString('id-ID')}</p>
            </div>

            <button onClick={() => setSelectedProof(null)} className="w-full mt-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;