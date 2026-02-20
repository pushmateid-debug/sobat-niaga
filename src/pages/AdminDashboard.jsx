import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, LayoutDashboard, FileText, Users, DollarSign, 
  Image as ImageIcon, MessageCircle, Settings, Bike, Menu, X, 
  Search, Send, Check, Trash2, ShoppingBag, Zap, LayoutTemplate, Save, Shield,
  ChevronRight, LogOut, TrendingUp, CreditCard, Loader2, Clock, User, ZoomIn
} from 'lucide-react';
import { dbFirestore, db as realDb, storage } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { ref, update, onValue, push, serverTimestamp, get, query as realQuery, orderByChild, equalTo } from 'firebase/database';
// import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Swal from 'sweetalert2';
import Cropper from 'react-cropper';
// import 'cropperjs/dist/cropper.css'; // Disable local import to fix build error
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
import { useTheme } from '../context/ThemeContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ImageUploader = ({ label, currentUrl, onFileSelect }) => {
  const imgSrc = typeof currentUrl === 'object' ? currentUrl?.url : currentUrl;
  return (
  <div className="space-y-2">
    <label className="block text-xs font-bold opacity-70">{label}</label>
    <div className="relative aspect-square w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-slate-700 transition-all group">
      <input 
        type="file" 
        accept="image/*" 
        onChange={(e) => {
          if (e.target.files[0]) {
            onFileSelect(e.target.files[0]);
            e.target.value = null; // Reset agar bisa pilih file sama ulang
          }
        }} 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
      />
      {imgSrc ? (
        <>
          <img src={imgSrc} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
            Ganti Gambar
          </div>
        </>
      ) : (
        <div className="text-center text-gray-400">
          <ImageIcon size={24} className="mx-auto mb-2" />
          <span className="text-xs">Upload</span>
        </div>
      )}
    </div>
  </div>
  );
};

// Helper: Hitung Biaya Admin (Sama dengan logic di Seller)
const calculateAdminFee = (amount) => {
  if (amount < 15000) return 500;
  return 2000;
};

const AdminDashboard = ({ onBack }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // State Drivers
  const [driverRequests, setDriverRequests] = useState([]);
  const [drivers, setDrivers] = useState([]); // State Daftar Driver (Saldo)
  const [sellers, setSellers] = useState([]); // State Daftar Penjual
  const [payouts, setPayouts] = useState([]); // State Riwayat Pencairan
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedNiagaOrder, setSelectedNiagaOrder] = useState(null); // Modal Verifikasi NiagaGo
  const [selectedDriverRequest, setSelectedDriverRequest] = useState(null); // Modal Detail Driver
  const [payoutModal, setPayoutModal] = useState(null); // State Modal Payout
  const [payoutAmount, setPayoutAmount] = useState('');

  const [topUpForm, setTopUpForm] = useState({ email: '', amount: '' }); // State Top Up Saldo
  const [topUpProof, setTopUpProof] = useState(null); // State Bukti Transfer Top Up

  // State Banners & Flash Deal
  const [banners, setBanners] = useState({});
  const [flashDeal, setFlashDeal] = useState({ isActive: false, endTime: '', bannerUrl: '' });
  const [transactions, setTransactions] = useState([]);
  const [niagaOrdersToVerify, setNiagaOrdersToVerify] = useState([]); // Order NiagaGo status 'paid'

  // State Chat
  const [chatList, setChatList] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const messagesEndRef = useRef(null);

  // State Image Editor (Crop & Resize)
  const [editingImage, setEditingImage] = useState(null);
  const [cropper, setCropper] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  // State Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalSales: 0,
    totalProfit: 0, // Profit Bersih Admin
    pendingDrivers: 0,
    unreadMessages: 0,
    pendingTransactions: 0 // Badge Verifikasi Transaksi
  });

  // State Laporan Keuangan
  const [marketplaceSales, setMarketplaceSales] = useState([]);
  const [niagaSales, setNiagaSales] = useState([]);
  const [financeFilter, setFinanceFilter] = useState('today'); // today, week, month
  
  // State Tabs Internal
  const [sellerTabMode, setSellerTabMode] = useState('sellers'); // 'sellers' | 'drivers'
  const [trxTabMode, setTrxTabMode] = useState('marketplace'); // 'marketplace' | 'niagago'

  // State Settings
  const [adminSettings, setAdminSettings] = useState({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    qrisUrl: '',
    motorRate: 2500,
    carRate: 5000,
    appFee: 2000,
    isMaintenance: false
  });

  // Fetch Marketplace Orders (Realtime DB) untuk Laporan Keuangan
  useEffect(() => {
    const ordersRef = ref(realDb, 'orders');
    const unsubscribe = onValue(ordersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const completedOrders = Object.keys(data)
          .map(key => ({ id: key, ...data[key], type: 'Marketplace' }))
          .filter(o => o.status === 'completed');
        setMarketplaceSales(completedOrders);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch NiagaGo Orders (Firestore) untuk Laporan Keuangan
  useEffect(() => {
    const q = query(collection(dbFirestore, 'ojek_orders'), where('status', '==', 'completed'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          type: 'NiagaGo',
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : new Date().toISOString()
      }));
      setNiagaSales(data);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Sellers (Realtime DB - Users with sellerInfo)
  useEffect(() => {
    const usersRef = ref(realDb, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const sellerList = Object.keys(data)
          .filter(key => data[key].sellerInfo)
          .map(key => ({
            uid: key,
            ...data[key],
            ...data[key].sellerInfo // Flatten sellerInfo biar gampang akses balance
          }));
        setSellers(sellerList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Drivers (Realtime DB - Users with role driver)
  useEffect(() => {
    const usersRef = ref(realDb, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const driverList = Object.keys(data)
          .filter(key => data[key].role === 'driver')
          .map(key => ({
            uid: key,
            ...data[key]
          }));
        setDrivers(driverList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Payouts (Riwayat Pencairan)
  useEffect(() => {
    const payoutsRef = ref(realDb, 'admin/payouts');
    const unsubscribe = onValue(payoutsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setPayouts(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      } else {
        setPayouts([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Gabung & Filter Data Keuangan
  const filteredFinance = useMemo(() => {
    let combined = [
        ...marketplaceSales.map(s => ({
            id: s.id,
            item: s.items ? (Array.isArray(s.items) ? s.items[0].name : Object.values(s.items)[0].name) + (s.items.length > 1 ? '...' : '') : 'Order',
            amount: s.totalPrice || 0,
            date: s.createdAt,
            type: 'Marketplace',
            status: 'Sukses'
        })),
        ...niagaSales.map(s => ({
            id: s.id,
            item: `Trip: ${s.pickup} -> ${s.destination}`,
            amount: s.price || 0,
            date: s.createdAt,
            type: 'NiagaGo',
            status: 'Sukses',
            adminFee: s.adminFee
        }))
    ];

    const now = new Date();
    return combined.filter(item => {
        const d = new Date(item.date);
        if (financeFilter === 'today') {
            return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } else if (financeFilter === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            return d >= weekAgo;
        } else if (financeFilter === 'month') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [marketplaceSales, niagaSales, financeFilter]);

  // Hitung Ringkasan Keuangan
  // REVISI: Gunakan logic calculateAdminFee yang konsisten
  const financeSummary = useMemo(() => {
    const totalIn = filteredFinance.reduce((acc, curr) => acc + curr.amount, 0);
    
    const totalProfit = filteredFinance.reduce((acc, curr) => {
        if (curr.type === 'Marketplace') {
            return acc + calculateAdminFee(curr.amount); 
        } else {
            const fee = curr.adminFee !== undefined ? parseInt(curr.adminFee) : 2000;
            return acc + fee;
        }
    }, 0);
    
    return { totalIn, totalProfit };
  }, [filteredFinance]); // Note: Idealnya dependency ke sellers juga kalau mau cek competitor status

  // Inject Cropper CSS via CDN (Solusi Error Module Not Found)
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { if(document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  // Konfigurasi Data Grafik (Real-time dari Transactions)
  const chartData = useMemo(() => {
    const labels = [];
    const dataPoints = [];
    const today = new Date();
    
    // Generate 7 Hari Terakhir
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
      
      // Filter transaksi per hari
      const dayStart = new Date(d);
      dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23,59,59,999);
      
      const dailyTotal = transactions
        .filter(t => {
            const tDate = new Date(t.createdAt);
            return t.status === 'completed' && tDate >= dayStart && tDate <= dayEnd;
        })
        .reduce((acc, curr) => acc + (parseInt(curr.totalPrice) || 0), 0);
        
      dataPoints.push(dailyTotal);
    }

    return {
      labels,
      datasets: [
        {
          label: 'Pendapatan',
          data: dataPoints,
          fill: true,
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, isDarkMode ? 'rgba(14, 165, 233, 0.5)' : 'rgba(14, 165, 233, 0.2)');
            gradient.addColorStop(1, isDarkMode ? 'rgba(14, 165, 233, 0)' : 'rgba(14, 165, 233, 0)');
            return gradient;
          },
          borderColor: '#0ea5e9', // Sky-500
          tension: 0.4, // Lengkungan halus ala Stockbit
          pointRadius: 4,
          pointBackgroundColor: '#0ea5e9',
          pointBorderColor: '#fff',
          pointHoverRadius: 6,
        },
      ],
    };
  }, [transactions, isDarkMode]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDarkMode ? '#f1f5f9' : '#1e293b',
        bodyColor: isDarkMode ? '#cbd5e1' : '#475569',
        borderColor: isDarkMode ? '#475569' : '#e2e8f0',
        borderWidth: 1,
        callbacks: {
          label: (context) => `Rp ${context.raw.toLocaleString('id-ID')}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 11 } }
      },
      y: {
        grid: { color: isDarkMode ? '#334155' : '#f1f5f9', borderDash: [4, 4] },
        ticks: { 
          color: isDarkMode ? '#94a3b8' : '#64748b',
          font: { size: 11 },
          maxTicksLimit: 8, // Batasi jumlah angka di sumbu Y biar rapi
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
  };

  // Fetch Data Pendaftaran Driver (Pending)
  useEffect(() => {
    const q = query(collection(dbFirestore, 'driver_registrations'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDriverRequests(data);
      setStats(prev => ({ ...prev, pendingDrivers: data.length }));
    });
    return () => unsubscribe();
  }, []);

  // Fetch NiagaGo Orders Pending Verification (Firestore)
  useEffect(() => {
    const q = query(collection(dbFirestore, 'ojek_orders'), where('status', '==', 'paid'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNiagaOrdersToVerify(data);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Admin Settings
  useEffect(() => {
    const settingsRef = ref(realDb, 'admin/settings');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setAdminSettings(prev => ({ ...prev, ...snapshot.val() }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Banners (Realtime DB)
  useEffect(() => {
    if (activeTab === 'images') {
      const bannersRef = ref(realDb, 'admin/banners');
      const unsubscribe = onValue(bannersRef, (snapshot) => {
        if (snapshot.exists()) setBanners(snapshot.val());
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  // Fetch Flash Deal (Realtime DB)
  useEffect(() => {
    if (activeTab === 'images') {
      const fdRef = ref(realDb, 'admin/flashDeal');
      const unsubscribe = onValue(fdRef, (snapshot) => {
        if (snapshot.exists()) setFlashDeal(snapshot.val());
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  // Fetch Transactions (Realtime DB - Orders) - FIX BUG FETCH DATA
  useEffect(() => {
    const ordersRef = ref(realDb, 'orders');
    const unsubscribe = onValue(ordersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loadedOrders = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        setTransactions(loadedOrders);
        
        // Update Stats (Sales & Pending)
        const total = loadedOrders.filter(o => o.status === 'completed').reduce((acc, curr) => acc + (parseInt(curr.totalPrice) || 0), 0);
        const pending = loadedOrders.filter(o => o.status === 'waiting_verification').length;

        // Note: totalProfit di-update via financeSummary di render atau effect terpisah
        setStats(prev => ({ ...prev, totalSales: total, pendingTransactions: pending }));
      } else {
        setTransactions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Chat List
  useEffect(() => {
    const chatsRef = ref(realDb, 'chats');
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map(key => ({
          uid: key,
          ...data[key]
        })).sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
        setChatList(list);

        // Count unread
        const unread = list.filter(c => c.hasUnreadAdmin).length;
        setStats(prev => ({ ...prev, unreadMessages: unread }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Selected Chat Messages
  useEffect(() => {
    if (selectedChat) {
      const msgsRef = ref(realDb, `chats/${selectedChat.uid}/messages`);
      const unsubscribe = onValue(msgsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const msgs = Object.keys(data).map(key => ({ id: key, ...data[key] }))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          setChatMessages(msgs);
        } else {
          setChatMessages([]);
        }
      });

      // Mark as read
      if (selectedChat.hasUnreadAdmin) {
        update(ref(realDb, `chats/${selectedChat.uid}`), { hasUnreadAdmin: false });
      }

      return () => unsubscribe();
    }
  }, [selectedChat]);

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Fungsi Verifikasi Driver
  const handleApproveDriver = async (req) => {
    const result = await Swal.fire({
      title: 'Verifikasi Driver?',
      text: `Yakin ingin menerima ${req.name} sebagai driver?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Terima',
      confirmButtonColor: '#10b981'
    });

    if (result.isConfirmed) {
      try {
        // 1. Update status registrasi di Firestore
        await updateDoc(doc(dbFirestore, 'driver_registrations', req.id), {
          status: 'approved',
          approvedAt: new Date().toISOString()
        });

        // 2. Update role user di Realtime Database (Biar tombol Mode Driver muncul di user)
        await update(ref(realDb, `users/${req.userId}`), {
          role: 'driver',
          plateNumber: req.plateNumber || 'N/A' // Simpan plat nomor
        });

        Swal.fire('Berhasil', 'Driver berhasil diverifikasi!', 'success');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal verifikasi driver.', 'error');
      }
    }
  };

  // Fungsi Tolak Driver
  const handleRejectDriver = async (req) => {
    const { value: reason } = await Swal.fire({
      title: 'Tolak Pendaftaran?',
      input: 'text',
      inputLabel: 'Alasan Penolakan',
      inputPlaceholder: 'Contoh: Foto KTM buram / Data tidak sesuai',
      showCancelButton: true,
      confirmButtonText: 'Tolak',
      confirmButtonColor: '#ef4444'
    });

    if (reason) {
      try {
        await updateDoc(doc(dbFirestore, 'driver_registrations', req.id), {
          status: 'rejected',
          rejectionReason: reason,
          rejectedAt: new Date().toISOString()
        });
        Swal.fire('Ditolak', 'Pendaftaran driver ditolak.', 'success');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal menolak pendaftaran.', 'error');
      }
    }
  };

  // Fungsi Verifikasi Transaksi (Approve/Reject)
  const handleVerifyTransaction = async (order, isApproved) => {
    try {
      const newStatus = isApproved ? 'processed' : 'payment_rejected';
      
      await update(ref(realDb, `orders/${order.id}`), {
        status: newStatus,
        verifiedAt: serverTimestamp()
      });

      // Kirim Notifikasi ke User
      await push(ref(realDb, 'notifications'), {
        userId: order.buyerId,
        title: isApproved ? 'Pembayaran Diterima' : 'Pembayaran Ditolak',
        message: isApproved ? 'Pesananmu sedang diproses seller.' : 'Bukti pembayaran tidak valid. Silakan upload ulang.',
        type: isApproved ? 'success' : 'error',
        targetView: 'history',
        orderId: order.id,
        createdAt: serverTimestamp(),
        isRead: false
      });

      Swal.fire({
        title: 'Berhasil',
        text: `Transaksi ${isApproved ? 'disetujui' : 'ditolak'}`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Gagal memproses transaksi', 'error');
    }
  };

  // Fungsi Verifikasi Order NiagaGo (Logika Saldo Driver)
  const handleVerifyNiagaOrder = async (order, isApproved) => {
    try {
      if (isApproved) {
        // 1. Hitung Pendapatan Bersih Driver & Admin Fee
        const adminFee = calculateAdminFee(parseInt(order.price) || 0);
        const netIncome = (parseInt(order.price) || 0) - adminFee;

        // 2. Update Status di Firestore
        await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), {
          status: 'verified',
          verifiedAt: new Date().toISOString(),
          adminFee: adminFee,
          driverIncome: netIncome
        });

        // 3. Tambah Saldo Driver di Realtime DB
        const driverRef = ref(realDb, `users/${order.driverId}`);
        const driverSnap = await get(driverRef);
        
        if (driverSnap.exists()) {
          const currentSaldo = parseInt(driverSnap.val().saldo) || 0;
          await update(driverRef, {
            saldo: currentSaldo + netIncome
          });
        }

        Swal.fire('Berhasil', `Pembayaran diverifikasi. Saldo Rp ${netIncome.toLocaleString()} masuk ke driver.`, 'success');
      } else {
        // Reject
        await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), { status: 'payment_rejected' });
        Swal.fire('Ditolak', 'Pembayaran ditolak.', 'info');
      }
      setSelectedNiagaOrder(null);
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Gagal memproses verifikasi.', 'error');
    }
  };

  // Fungsi Buka Modal Pencairan
  const handlePayout = (seller) => {
    setPayoutModal(seller);
    setPayoutAmount('');
  };

  // Fungsi Proses Pencairan (Logic Baru)
  const handleProcessPayout = async (e) => {
    e.preventDefault();
    if (!payoutModal) return;

    const withdrawAmount = parseInt(payoutAmount);
    // Cek apakah ini Seller (balance) atau Driver (saldo)
    const currentBalance = payoutModal.balance !== undefined ? payoutModal.balance : (payoutModal.saldo || 0);

    if (!withdrawAmount || withdrawAmount <= 0) {
        Swal.fire('Error', 'Masukkan nominal yang valid', 'warning');
        return;
    }

    if (withdrawAmount > currentBalance) {
        Swal.fire('Gagal', 'Saldo seller tidak mencukupi!', 'error');
        return;
    }

    try {
        const remainingBalance = currentBalance - withdrawAmount;

        // 1. Potong Saldo Seller
        if (payoutModal.balance !== undefined) {
            await update(ref(realDb, `users/${payoutModal.uid}/sellerInfo`), { balance: remainingBalance });
        } else {
            // Potong Saldo Driver
            await update(ref(realDb, `users/${payoutModal.uid}`), { saldo: remainingBalance });
        }

        // 2. Catat di Riwayat Pencairan (Admin Payouts)
        await push(ref(realDb, 'admin/payouts'), {
            sellerId: payoutModal.uid,
            storeName: payoutModal.storeName || payoutModal.displayName || 'Driver',
            amount: withdrawAmount,
            createdAt: serverTimestamp(),
            adminId: 'admin',
            note: `Dicairkan Rp${withdrawAmount.toLocaleString('id-ID')}, Sisa Rp${remainingBalance.toLocaleString('id-ID')}`
        });

        setPayoutModal(null);
        Swal.fire('Berhasil', `Pencairan sukses. Sisa saldo: Rp ${remainingBalance.toLocaleString('id-ID')}`, 'success');
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal memproses pencairan.', 'error');
    }
  };

  // Fungsi Kirim Pesan Admin
  const handleSendAdminMessage = async (e) => {
    e.preventDefault();
    if (!adminMessage.trim() || !selectedChat) return;

    try {
      await push(ref(realDb, `chats/${selectedChat.uid}/messages`), {
        text: adminMessage,
        sender: 'admin',
        timestamp: serverTimestamp(),
        status: 'sent'
      });
      
      // Notify user
      await update(ref(realDb, `chats/${selectedChat.uid}`), {
        hasUnreadUser: true,
        lastMessageTime: serverTimestamp()
      });

      setAdminMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Fungsi Manual Top Up Saldo User
  const handleManualTopUp = async (e) => {
    e.preventDefault();
    if (!topUpForm.email || !topUpForm.amount) return;
    
    if (!topUpProof) {
        Swal.fire('Bukti Wajib', 'Harap upload bukti transfer/mutasi untuk dokumentasi admin.', 'warning');
        return;
    }

    try {
        Swal.fire({ title: 'Memproses...', didOpen: () => Swal.showLoading() });
        
        const proofUrl = await uploadToCloudinary(topUpProof); // Upload bukti dulu

        // Cari User by Email di Realtime DB
        const usersRef = ref(realDb, 'users');
        const q = realQuery(usersRef, orderByChild('email'), equalTo(topUpForm.email));
        const snapshot = await get(q);

        if (snapshot.exists()) {
            const data = snapshot.val();
            const uid = Object.keys(data)[0];
            const userData = data[uid];
            const currentSaldo = parseInt(userData.saldo || 0);
            const amount = parseInt(topUpForm.amount);

            await update(ref(realDb, `users/${uid}`), {
                saldo: currentSaldo + amount
            });

            // Log Transaksi (Arsip Admin)
            await push(ref(realDb, 'admin/topup_logs'), {
                userId: uid,
                userEmail: topUpForm.email,
                amount: amount,
                proofUrl: proofUrl,
                adminId: 'admin',
                createdAt: serverTimestamp()
            });

            // Kirim Notifikasi ke User (In-App)
            await push(ref(realDb, 'notifications'), {
                userId: uid,
                title: 'Top Up Berhasil',
                message: `Top Up Berhasil! Saldo sebesar Rp ${amount.toLocaleString('id-ID')} telah ditambahkan oleh Admin.`,
                type: 'success',
                image: proofUrl,
                createdAt: serverTimestamp(),
                isRead: false
            });

            Swal.fire('Berhasil', `Saldo masuk & Email notifikasi terkirim ke ${topUpForm.email}`, 'success');
            setTopUpForm({ email: '', amount: '' });
            setTopUpProof(null);
        } else {
            Swal.fire('Gagal', 'User dengan email tersebut tidak ditemukan.', 'error');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error', error.message, 'error');
    }
  };

  // Fungsi Handle File Select (Buka Editor)
  const handleFileSelect = (file, key, type = 'banners') => {
    const url = URL.createObjectURL(file);
    setEditingImage({ 
        file, 
        key, 
        type, 
        previewUrl: url 
    });

    // Auto-detect Aspect Ratio
    if (key.includes('logo') || key.includes('icon') || key.includes('favicon')) {
        setAspectRatio(1);
    } else if (key.includes('slider') || key.includes('banner')) {
        setAspectRatio(16 / 9);
    } else {
        setAspectRatio(NaN); // Free
    }
  };

  // Fungsi Proses & Upload (Canvas)
  const handleProcessAndUpload = () => {
    if (typeof cropper !== "undefined" && cropper !== null) {
        const canvas = cropper.getCroppedCanvas({
            maxWidth: 1920,
            maxHeight: 1080,
            fillColor: '#fff',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        canvas.toBlob((blob) => {
            if (blob) {
                handleFileUpload(blob, editingImage.key, editingImage.type);
                setEditingImage(null); // Close modal
            }
        }, 'image/jpeg', 0.85); // Quality 85% (Optimization)
    }
  };

  // Helper: Upload ke Cloudinary (Pengganti Firebase Storage)
  const uploadToCloudinary = async (file) => {
    const cloudName = 'djqnnguli';
    const apiKey = '156244598362341';
    const apiSecret = 'INGJr-KgmBPNwqwBYFZy9w7Fa18';
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    // Signature Generation
    const params = {
      folder: 'sobatniaga/admin',
      timestamp: timestamp,
    };
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
    formData.append('folder', 'sobatniaga/admin');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url;
  };

  // Fungsi Upload File
  const handleFileUpload = async (file, key, type = 'banners') => {
    if (!file) return;
    
    try {
      Swal.fire({
        title: 'Mengupload...',
        didOpen: () => Swal.showLoading()
      });

      // Ganti uploadBytes (Firebase) dengan Cloudinary biar lebih stabil
      const url = await uploadToCloudinary(file);

      if (type === 'banners') {
        // Cek apakah data lama berupa object (ada link) atau string
        const currentData = banners[key];
        const newValue = (typeof currentData === 'object' && currentData !== null) 
          ? { ...currentData, url: url } 
          : url;

        await update(ref(realDb, 'admin/banners'), { [key]: newValue });
        setBanners(prev => ({ ...prev, [key]: newValue }));
      } else if (type === 'flashDeal') {
        await update(ref(realDb, 'admin/flashDeal'), { [key]: url });
        setFlashDeal(prev => ({ ...prev, [key]: url }));
      }
      else if (type === 'settings') {
        await update(ref(realDb, 'admin/settings'), { [key]: url });
        setAdminSettings(prev => ({ ...prev, [key]: url }));
      }

      Swal.fire('Berhasil', 'Gambar berhasil diupload', 'success');
    } catch (error) {
      console.error("Upload error:", error);
      Swal.fire('Gagal', `Terjadi kesalahan: ${error.message}`, 'error');
    }
  };

  // Helper untuk update state banner
  const handleBannerChange = (key, value) => {
    setBanners(prev => ({ ...prev, [key]: value }));
  };

  // Fungsi Simpan Banner
  const handleSaveBanners = async () => {
    try {
      await update(ref(realDb, 'admin/banners'), banners);
      Swal.fire('Sukses', 'Banner berhasil diperbarui!', 'success');
    } catch (error) {
      Swal.fire('Error', 'Gagal menyimpan banner.', 'error');
    }
  };

  // Fungsi Simpan Flash Deal
  const handleSaveFlashDeal = async () => {
    try {
      await update(ref(realDb, 'admin/flashDeal'), flashDeal);
      Swal.fire('Sukses', 'Flash Deal diperbarui!', 'success');
    } catch (error) {
      Swal.fire('Error', 'Gagal menyimpan Flash Deal.', 'error');
    }
  };

  // Fungsi Simpan Pengaturan Admin
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
        await update(ref(realDb, 'admin/settings'), adminSettings);
        // Sync ke paymentInfo agar kompatibel dengan halaman Payment user
        await update(ref(realDb, 'admin/paymentInfo'), {
            bankName: adminSettings.bankName,
            bankAccount: adminSettings.accountNumber,
            accountHolder: adminSettings.accountHolder,
            qrisUrl: adminSettings.qrisUrl
        });
        Swal.fire('Sukses', 'Pengaturan tersimpan!', 'success');
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
  };

  const inputClass = `w-full p-3 rounded-xl border outline-none text-sm transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`;
  const labelClass = `block text-xs font-bold mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`;
  const cardClass = `p-6 rounded-2xl border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`;
  
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'transactions', label: 'Verifikasi Transaksi', icon: <ShoppingBag size={20} />, badge: stats.pendingTransactions + niagaOrdersToVerify.length },
    { id: 'drivers', label: 'Verifikasi Driver', icon: <Bike size={20} />, badge: driverRequests.length },
    { id: 'sellers', label: 'Manajemen Saldo', icon: <Users size={20} /> },
    { id: 'finance', label: 'Laporan Keuangan', icon: <TrendingUp size={20} /> },
    { id: 'images', label: 'Manajemen Gambar', icon: <ImageIcon size={20} /> },
    { id: 'chat', label: 'Pesan Pelanggan', icon: <MessageCircle size={20} />, badge: stats.unreadMessages },
    { id: 'settings', label: 'Pengaturan', icon: <Settings size={20} /> },
  ];

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 border-r ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-bold text-sky-600 flex items-center gap-2">
              <Shield size={24} /> Admin Panel
            </h2>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
              <X size={20} />
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.id 
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-200 dark:shadow-none' 
                    : (isDarkMode ? 'text-gray-400 hover:bg-slate-700 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-100 dark:border-slate-700">
            <button onClick={onBack} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              <LogOut size={20} />
              <span>Keluar Dashboard</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header (Mobile Toggle) */}
        <header className={`md:hidden flex items-center justify-between p-4 border-b ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <Menu size={24} />
          </button>
          <h1 className="font-bold">Admin Dashboard</h1>
          <div className="w-10"></div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          
          {/* --- DASHBOARD OVERVIEW --- */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Ringkasan Hari Ini</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl dark:bg-blue-900/30 dark:text-blue-400"><ShoppingBag size={24} /></div>
                    <span className="text-xs font-bold text-green-500 bg-green-100 px-2 py-1 rounded-lg">+12%</span>
                  </div>
                  <p className="text-sm text-gray-500">Total Transaksi</p>
                  <h3 className="text-2xl font-bold">{transactions.length}</h3>
                </div>
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-green-100 text-green-600 rounded-xl dark:bg-green-900/30 dark:text-green-400"><DollarSign size={24} /></div>
                  </div>
                  <p className="text-sm text-gray-500">Profit Bersih Admin</p>
                  <h3 className="text-2xl font-bold text-green-600">Rp {financeSummary.totalProfit.toLocaleString('id-ID')}</h3>
                </div>
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-xl dark:bg-orange-900/30 dark:text-orange-400"><Bike size={24} /></div>
                    {driverRequests.length > 0 && <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-1 rounded-lg">{driverRequests.length} Baru</span>}
                  </div>
                  <p className="text-sm text-gray-500">Driver Pending</p>
                  <h3 className="text-2xl font-bold">{driverRequests.length}</h3>
                </div>
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-purple-100 text-purple-600 rounded-xl dark:bg-purple-900/30 dark:text-purple-400"><MessageCircle size={24} /></div>
                  </div>
                  <p className="text-sm text-gray-500">Pesan Belum Dibaca</p>
                  <h3 className="text-2xl font-bold">{stats.unreadMessages}</h3>
                </div>
              </div>

              {/* Grafik Penjualan (Stockbit Style) */}
              <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-lg">Tren Pendapatan</h3>
                    <p className="text-xs text-gray-500">Statistik penjualan 7 hari terakhir</p>
                  </div>
                  <div className={`px-3 py-1 rounded-lg text-xs font-bold ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    7 Hari Terakhir
                  </div>
                </div>
                <div className="h-80 w-full">
                  <Line options={chartOptions} data={chartData} />
                </div>
              </div>
            </div>
          )}

          {/* --- VERIFIKASI DRIVER --- */}
          {activeTab === 'drivers' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-4">Verifikasi Driver NiagaGo</h2>
              {driverRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-2xl">
                  <Shield size={48} className="mx-auto mb-3 opacity-20" />
                  <p>Tidak ada permintaan verifikasi driver saat ini.</p>
                </div>
              ) : (
                <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className={`text-xs uppercase ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                        <tr>
                          <th className="px-6 py-3">Nama Driver</th>
                          <th className="px-6 py-3">Gmail</th>
                          <th className="px-6 py-3">No. WA</th>
                          <th className="px-6 py-3">Waktu Daftar</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                        {driverRequests.map((req) => (
                          <tr key={req.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                            <td className="px-6 py-4 font-bold">{req.name}</td>
                            <td className="px-6 py-4 text-gray-500">{req.email}</td>
                            <td className="px-6 py-4 text-gray-500">{req.phone}</td>
                            <td className="px-6 py-4 text-xs text-gray-400">
                              {req.createdAt ? new Date(req.createdAt.seconds ? req.createdAt.seconds * 1000 : req.createdAt).toLocaleDateString('id-ID') : '-'}
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-lg">Pending</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setSelectedDriverRequest(req)} 
                                className="bg-sky-100 hover:bg-sky-200 text-sky-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                              >
                                Lihat Detail
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- MANAJEMEN GAMBAR (Banners & Flash Deal) --- */}
          {activeTab === 'images' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold">Manajemen Gambar & Aset</h2>
              
              {/* 1. SLIDE HOME (BANNER UTAMA) */}
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><LayoutTemplate size={20} className="text-sky-500"/> Banner Slider Utama (Home)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4, 5].map(num => (
                    <ImageUploader 
                      key={num} 
                      label={`Slide ${num}`} 
                      currentUrl={banners[`home_slider_${num}`]} 
                      onFileSelect={(file) => handleFileSelect(file, `home_slider_${num}`)} 
                    />
                  ))}
                </div>
              </div>

              {/* 2. BRANDING (LOGO & FAVICON) */}
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Shield size={20} className="text-purple-500"/> Branding (Logo & Icon)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <ImageUploader label="Logo Menu Login" currentUrl={banners['login_logo']} onFileSelect={(file) => handleFileSelect(file, 'login_logo')} />
                  <ImageUploader label="Favicon (Icon Browser)" currentUrl={banners['favicon']} onFileSelect={(file) => handleFileSelect(file, 'favicon')} />
                </div>
              </div>

              {/* 3. LAYOUT (BACKGROUNDS) */}
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><LayoutDashboard size={20} className="text-indigo-500"/> Background Layout</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <ImageUploader label="Background Banner" currentUrl={banners['home_bg_static']} onFileSelect={(file) => handleFileSelect(file, 'home_bg_static')} />
                  <ImageUploader label="Background Footer" currentUrl={banners['footer_bg']} onFileSelect={(file) => handleFileSelect(file, 'footer_bg')} />
                </div>
              </div>

              {/* 4. SUPPORT & PROMOTION */}
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Zap size={20} className="text-yellow-500"/> Support & Promotion</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <ImageUploader 
                    label="Icon Chat / Admin" 
                    currentUrl={banners['chat_icon']} 
                    onFileSelect={(file) => handleFileSelect(file, 'chat_icon')} 
                  />
                  <ImageUploader 
                    label="Banner Flash Deal" 
                    currentUrl={flashDeal.bannerUrl} 
                    onFileSelect={(file) => handleFileSelect(file, 'bannerUrl', 'flashDeal')} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* --- VERIFIKASI TRANSAKSI --- */}
          {activeTab === 'transactions' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Verifikasi Transaksi</h2>
                <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <button onClick={() => setTrxTabMode('marketplace')} className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${trxTabMode === 'marketplace' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500'}`}>Marketplace</button>
                    <button onClick={() => setTrxTabMode('niagago')} className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${trxTabMode === 'niagago' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500'}`}>NiagaGo {niagaOrdersToVerify.length > 0 && `(${niagaOrdersToVerify.length})`}</button>
                </div>
              </div>

              {/* TAB MARKETPLACE */}
              {trxTabMode === 'marketplace' && (
              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        <th className="px-6 py-3">Produk</th>
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3">Harga</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Waktu</th>
                        <th className="px-6 py-3">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(trx => (
                        <tr key={trx.id} className={`border-b ${isDarkMode ? 'border-slate-700 hover:bg-slate-700/50' : 'border-gray-100 hover:bg-gray-50'}`}>
                          <td className="px-6 py-4 font-medium">
                            <div className="text-xs">
                                {trx.items ? (Array.isArray(trx.items) ? trx.items[0].name : Object.values(trx.items)[0].name) : 'Produk'}
                                {trx.items && (Array.isArray(trx.items) ? trx.items.length : Object.values(trx.items).length) > 1 && <span className="text-gray-400"> +lainnya</span>}
                            </div>
                            <div className="text-[10px] text-gray-400">#{trx.id.slice(-6)}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold">{trx.buyerName || 'User'}</div>
                          </td>
                          <td className="px-6 py-4 font-bold text-sky-500">Rp {parseInt(trx.totalPrice || 0).toLocaleString('id-ID')}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${trx.status === 'waiting_verification' ? 'bg-yellow-100 text-yellow-700' : trx.status === 'processed' ? 'bg-blue-100 text-blue-700' : trx.status === 'completed' ? 'bg-green-100 text-green-700' : trx.status === 'payment_rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {trx.status === 'waiting_verification' ? 'Perlu Cek' : trx.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">{new Date(trx.createdAt).toLocaleDateString('id-ID')}</td>
                          <td className="px-6 py-4">
                            {trx.status === 'waiting_verification' ? (
                                <div className="flex gap-2">
                                    {trx.proofUrl && (
                                        <button onClick={() => setSelectedTransaction(trx)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600" title="Lihat Bukti"><ImageIcon size={16} /></button>
                                    )}
                                    <button onClick={() => handleVerifyTransaction(trx, true)} className="p-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded font-bold text-xs">Terima</button>
                                    <button onClick={() => handleVerifyTransaction(trx, false)} className="p-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold text-xs">Tolak</button>
                                </div>
                            ) : (<span className="text-xs text-gray-400">-</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* TAB NIAGAGO */}
              {trxTabMode === 'niagago' && (
                <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className={`text-xs uppercase ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                        <tr>
                          <th className="px-6 py-3">Rute</th>
                          <th className="px-6 py-3">Driver</th>
                          <th className="px-6 py-3">Harga</th>
                          <th className="px-6 py-3">Bukti</th>
                          <th className="px-6 py-3">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                        {niagaOrdersToVerify.map(order => (
                          <tr key={order.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                            <td className="px-6 py-4">
                                <div className="font-bold text-xs">{order.pickup}</div>
                                <div className="text-[10px] text-gray-500">Ke: {order.destination}</div>
                            </td>
                            <td className="px-6 py-4 text-xs">{order.driverName}</td>
                            <td className="px-6 py-4 font-bold text-sky-500">Rp {order.price.toLocaleString('id-ID')}</td>
                            <td className="px-6 py-4">
                                <button onClick={() => setSelectedNiagaOrder(order)} className="text-sky-600 hover:underline text-xs font-bold flex items-center gap-1"><ImageIcon size={14}/> Cek Bukti</button>
                            </td>
                            <td className="px-6 py-4"><span className="text-xs text-orange-500 font-bold">Perlu Verifikasi</span></td>
                          </tr>
                        ))}
                        {niagaOrdersToVerify.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Tidak ada pesanan NiagaGo yang perlu diverifikasi.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- PESAN PELANGGAN (CHAT) --- */}
          {activeTab === 'chat' && (
            <div className="h-[calc(100vh-100px)] flex rounded-2xl border overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
              {/* Chat List */}
              <div className={`w-1/3 border-r flex flex-col ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                  <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Pesan Masuk</h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {chatList.map(chat => (
                    <div 
                      key={chat.uid}
                      onClick={() => setSelectedChat(chat)}
                      className={`p-4 border-b cursor-pointer transition-colors ${
                        isDarkMode 
                          ? 'hover:bg-slate-700 border-slate-700' 
                          : 'hover:bg-sky-50 border-gray-100'
                      } ${
                        selectedChat?.uid === chat.uid 
                          ? (isDarkMode ? 'bg-slate-700' : 'bg-sky-50 border-l-4 border-l-sky-500') 
                          : (isDarkMode ? '' : 'bg-white')
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{chat.userName || 'User'}</h4>
                        {chat.hasUnreadAdmin && <span className="w-2 h-2 bg-red-500 rounded-full"></span>}
                      </div>
                      <p className={`text-xs truncate mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Klik untuk lihat pesan</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat Window */}
              <div className={`flex-1 flex flex-col ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
                {selectedChat ? (
                  <>
                    <div className="p-4 bg-white dark:bg-slate-800 border-b dark:border-slate-700 flex justify-between items-center">
                      <h3 className="font-bold">{selectedChat.userName}</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] p-3 rounded-2xl text-sm shadow-sm ${
                            msg.sender === 'admin' 
                              ? 'bg-sky-600 text-white rounded-tr-none' 
                              : (isDarkMode ? 'bg-slate-800 text-gray-200 border border-slate-700' : 'bg-white text-gray-800 border') + ' rounded-tl-none'
                          }`}>
                            {msg.text}
                            <p className={`text-[10px] mt-1 text-right ${msg.sender === 'admin' ? 'text-sky-200' : 'text-gray-400'}`}>
                              {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={handleSendAdminMessage} className="p-4 bg-white dark:bg-slate-800 border-t dark:border-slate-700 flex gap-2">
                      <input 
                        type="text" 
                        value={adminMessage}
                        onChange={(e) => setAdminMessage(e.target.value)}
                        placeholder="Balas pesan..."
                        className={`flex-1 px-4 py-2 rounded-full border outline-none focus:ring-2 focus:ring-sky-500 ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-gray-100 border-gray-200'}`}
                      />
                      <button type="submit" className="p-2 bg-sky-600 text-white rounded-full hover:bg-sky-700">
                        <Send size={20} />
                      </button>
                    </form>
                  </>
                ) : (
                  <div className={`flex-1 flex flex-col items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <MessageCircle size={48} className={`mb-3 ${isDarkMode ? 'text-gray-600' : 'text-sky-500'}`} />
                    <p className="font-medium">Pilih percakapan untuk mulai membalas.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- DAFTAR PENJUAL & SALDO --- */}
          {activeTab === 'sellers' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Manajemen Saldo</h2>
                <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <button onClick={() => setSellerTabMode('sellers')} className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${sellerTabMode === 'sellers' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500'}`}>Seller Barang</button>
                    <button onClick={() => setSellerTabMode('drivers')} className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${sellerTabMode === 'drivers' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500'}`}>Driver NiagaGo</button>
                </div>
              </div>

              {/* Form Manual Top Up (Inject Saldo) */}
              <div className={`p-6 rounded-2xl border mb-6 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><DollarSign className="text-green-500"/> Inject Saldo User (Manual Top Up)</h3>
                <form onSubmit={handleManualTopUp} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="w-full">
                        <label className={labelClass}>Email User</label>
                        <input type="email" placeholder="user@example.com" value={topUpForm.email} onChange={e => setTopUpForm({...topUpForm, email: e.target.value})} className={inputClass} required />
                    </div>
                    <div className="w-full">
                        <label className={labelClass}>Jumlah Saldo (Rp)</label>
                        <input type="number" placeholder="50000" value={topUpForm.amount} onChange={e => setTopUpForm({...topUpForm, amount: e.target.value})} className={inputClass} required />
                    </div>
                    <div className="w-full">
                        <label className={labelClass}>Bukti Transfer (Admin)</label>
                        <div className={`relative w-full border rounded-xl overflow-hidden ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}>
                            <input type="file" accept="image/*" onChange={e => setTopUpProof(e.target.files[0])} className="w-full text-xs p-2 cursor-pointer" required />
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        className="w-full md:w-auto py-3 px-6 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors h-[46px]"
                    >
                        + Tambah Saldo
                    </button>
                </form>
              </div>

              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        <th className="px-6 py-3">{sellerTabMode === 'sellers' ? 'Nama Toko' : 'Nama Driver'}</th>
                        <th className="px-6 py-3">Pemilik</th>
                        <th className="px-6 py-3">Saldo Aktif</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                      {sellerTabMode === 'sellers' ? sellers.map((seller) => (
                        <tr key={seller.uid} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                          <td className="px-6 py-4 font-bold">{seller.storeName || 'Tanpa Nama'}</td>
                          <td className="px-6 py-4 text-gray-500">{seller.displayName || seller.email}</td>
                          <td className="px-6 py-4 font-mono font-bold text-green-600">Rp {(seller.balance || 0).toLocaleString('id-ID')}</td>
                          <td className="px-6 py-4">
                            {seller.isVerifiedSeller ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">Verified</span> : <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">Pending</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handlePayout(seller)} className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Cairkan Dana</button>
                          </td>
                        </tr>
                      )) : drivers.map((driver) => (
                        <tr key={driver.uid} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                          <td className="px-6 py-4 font-bold">{driver.displayName}</td>
                          <td className="px-6 py-4 text-gray-500">{driver.email}</td>
                          <td className="px-6 py-4 font-mono font-bold text-green-600">Rp {(driver.saldo || 0).toLocaleString('id-ID')}</td>
                          <td className="px-6 py-4">
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">Aktif</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handlePayout(driver)} className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Cairkan Dana</button>
                          </td>
                        </tr>
                      ))}
                      {sellerTabMode === 'sellers' && sellers.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Belum ada penjual.</td></tr>}
                      {sellerTabMode === 'drivers' && drivers.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Belum ada driver.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- LAPORAN KEUANGAN (Placeholder) --- */}
          {activeTab === 'finance' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-2xl font-bold">Laporan Keuangan</h2>
                <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    {['today', 'week', 'month'].map(f => (
                        <button 
                            key={f}
                            onClick={() => setFinanceFilter(f)}
                            className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${financeFilter === f ? 'bg-sky-600 text-white shadow-sm' : (isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800')}`}
                        >
                            {f === 'today' ? 'Hari Ini' : (f === 'week' ? '7 Hari' : 'Bulan Ini')}
                        </button>
                    ))}
                </div>
              </div>

              {/* Ringkasan Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                    <p className="text-xs text-gray-500 font-bold uppercase">Total Masuk (Omzet)</p>
                    <h3 className="text-2xl font-bold text-sky-500 mt-1">Rp {financeSummary.totalIn.toLocaleString('id-ID')}</h3>
                </div>
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                    <p className="text-xs text-gray-500 font-bold uppercase">Total Pencairan (Keluar)</p>
                    <h3 className="text-2xl font-bold text-red-500 mt-1">Rp {payouts.reduce((acc, curr) => acc + (parseInt(curr.amount)||0), 0).toLocaleString('id-ID')}</h3>
                </div>
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                    <p className="text-xs text-gray-500 font-bold uppercase">Profit Admin (Bersih)</p>
                    <h3 className="text-2xl font-bold text-green-500 mt-1">Rp {financeSummary.totalProfit.toLocaleString('id-ID')}</h3>
                </div>
              </div>

              {/* Tabel Detail Transaksi Masuk */}
              <h3 className="font-bold text-lg mt-4">Rincian Pemasukan</h3>
              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        <th className="px-6 py-3">Tanggal</th>
                        <th className="px-6 py-3">Keterangan</th>
                        <th className="px-6 py-3">Tipe</th>
                        <th className="px-6 py-3 text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                      {filteredFinance.map((item, idx) => (
                        <tr key={idx} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                          <td className="px-6 py-4 text-gray-500">{new Date(item.date).toLocaleDateString('id-ID')}</td>
                          <td className="px-6 py-4 font-medium">{item.item}</td>
                          <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${item.type === 'Marketplace' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{item.type}</span></td>
                          <td className="px-6 py-4 text-right font-bold text-green-600">+ Rp {item.amount.toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                      {filteredFinance.length === 0 && (
                        <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">Belum ada data keuangan untuk periode ini.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabel Riwayat Pencairan */}
              <h3 className="font-bold text-lg mt-4">Riwayat Pencairan Dana (Keluar)</h3>
              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        <th className="px-6 py-3">Tanggal</th>
                        <th className="px-6 py-3">Toko</th>
                        <th className="px-6 py-3">Catatan</th>
                        <th className="px-6 py-3 text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                      {payouts.map((pay, idx) => (
                        <tr key={idx} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                          <td className="px-6 py-4 text-gray-500">{new Date(pay.createdAt).toLocaleDateString('id-ID')}</td>
                          <td className="px-6 py-4 font-bold">{pay.storeName}</td>
                          <td className="px-6 py-4 text-xs text-gray-500">{pay.note || 'Pencairan Saldo'}</td>
                          <td className="px-6 py-4 text-right font-bold text-red-500">- Rp {parseInt(pay.amount).toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                      {payouts.length === 0 && (
                        <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">Belum ada riwayat pencairan.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- PENGATURAN ADMIN --- */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Pengaturan Admin & Rekber</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Identitas Rekber */}
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><CreditCard size={20} className="text-sky-500"/> Identitas Rekening Bersama</h3>
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div className="flex gap-4">
                            <div className="w-1/3">
                                <ImageUploader label="Foto QRIS / Buku Tabungan" currentUrl={adminSettings.qrisUrl} onFileSelect={(file) => handleFileSelect(file, 'qrisUrl', 'settings')} />
                            </div>
                            <div className="flex-1 space-y-3">
                                <div>
                                    <label className={labelClass}>Nama Bank</label>
                                    <input type="text" value={adminSettings.bankName} onChange={e => setAdminSettings({...adminSettings, bankName: e.target.value})} className={inputClass} placeholder="Contoh: BCA" />
                                </div>
                                <div>
                                    <label className={labelClass}>Nomor Rekening</label>
                                    <input type="text" value={adminSettings.accountNumber} onChange={e => setAdminSettings({...adminSettings, accountNumber: e.target.value})} className={inputClass} placeholder="1234567890" />
                                </div>
                                <div>
                                    <label className={labelClass}>Atas Nama</label>
                                    <input type="text" value={adminSettings.accountHolder} onChange={e => setAdminSettings({...adminSettings, accountHolder: e.target.value})} className={inputClass} placeholder="PT Sobat Niaga" />
                                </div>
                            </div>
                        </div>
                        <button type="submit" className="w-full py-3 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors">Simpan Identitas Rekber</button>
                    </form>
                </div>

                {/* Pengaturan Tarif NiagaGo */}
                <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Bike size={20} className="text-orange-500"/> Tarif NiagaGo & Biaya Layanan</h3>
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Tarif Motor / KM</label>
                                <input type="number" value={adminSettings.motorRate} onChange={e => setAdminSettings({...adminSettings, motorRate: e.target.value})} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Tarif Mobil / KM</label>
                                <input type="number" value={adminSettings.carRate} onChange={e => setAdminSettings({...adminSettings, carRate: e.target.value})} className={inputClass} />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Biaya Admin (Potongan per Order)</label>
                            <input type="number" value={adminSettings.appFee} onChange={e => setAdminSettings({...adminSettings, appFee: e.target.value})} className={inputClass} />
                            <p className="text-[10px] text-gray-400 mt-1">Nominal ini akan dipotong dari pendapatan driver setiap order selesai.</p>
                        </div>
                        <div className="flex items-center justify-between p-3 border rounded-xl">
                            <span className="text-sm font-bold">Mode Maintenance</span>
                            <button type="button" onClick={() => setAdminSettings({...adminSettings, isMaintenance: !adminSettings.isMaintenance})} className={`w-12 h-6 rounded-full transition-colors relative ${adminSettings.isMaintenance ? 'bg-red-500' : 'bg-gray-300'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${adminSettings.isMaintenance ? 'left-7' : 'left-1'}`}></div>
                            </button>
                        </div>
                        <button type="submit" className="w-full py-3 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors">Simpan Pengaturan Tarif</button>
                    </form>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {selectedImage && (<div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}><img src={selectedImage} alt="Preview" className="max-w-full max-h-full rounded-lg" /><button className="absolute top-4 right-4 text-white p-2 bg-white/10 rounded-full"><X size={24} /></button></div>)}
      
      {/* MODAL CROP & RESIZE (EDITOR GAMBAR) */}
      {editingImage && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg">Edit Gambar (Crop & Resize)</h3>
              <button onClick={() => setEditingImage(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex flex-col lg:flex-row gap-6">
                {/* Cropper Area */}
                <div className="flex-1 bg-black/5 rounded-xl overflow-hidden min-h-[300px] lg:min-h-[400px] relative">
                    <Cropper
                        style={{ height: 400, width: "100%" }}
                        initialAspectRatio={aspectRatio}
                        aspectRatio={aspectRatio}
                        src={editingImage.previewUrl}
                        viewMode={1}
                        guides={true}
                        minCropBoxHeight={10}
                        minCropBoxWidth={10}
                        background={false}
                        responsive={true}
                        autoCropArea={1}
                        checkOrientation={false}
                        onInitialized={(instance) => setCropper(instance)}
                        dragMode="move"
                    />
                </div>

                {/* Controls */}
                <div className="w-full lg:w-64 space-y-6">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-3 block">Rasio Potongan</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setAspectRatio(16 / 9)}
                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${aspectRatio === 16/9 ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                        16:9 (Banner)
                      </button>
                      <button 
                        onClick={() => setAspectRatio(4 / 3)}
                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${aspectRatio === 4/3 ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                        4:3 (Standar)
                      </button>
                      <button 
                        onClick={() => setAspectRatio(1)}
                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${aspectRatio === 1 ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                        1:1 (Persegi)
                      </button>
                      <button 
                        onClick={() => setAspectRatio(NaN)}
                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${isNaN(aspectRatio) ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                        Bebas
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t dark:border-slate-700">
                    <button 
                      onClick={handleProcessAndUpload}
                      className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-200 dark:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} /> Simpan & Upload
                    </button>
                    <p className="text-[10px] text-center text-gray-400 mt-3">
                        Gambar akan otomatis dikompres & dioptimalkan.
                    </p>
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VERIFIKASI TRANSAKSI (POP-UP) */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            
            {/* Header */}
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg">Verifikasi Pembayaran</h3>
              <button onClick={() => setSelectedTransaction(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X size={20}/></button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="flex flex-col gap-6">
                {/* Image Preview (Small/Medium) */}
                <div 
                  className="w-full h-48 bg-gray-100 dark:bg-slate-900 rounded-xl overflow-hidden border dark:border-slate-700 flex items-center justify-center cursor-pointer group relative"
                  onClick={() => setSelectedImage(selectedTransaction.proofUrl)}
                >
                  {selectedTransaction.proofUrl ? (
                    <>
                      <img src={selectedTransaction.proofUrl} alt="Bukti" className="h-full object-contain" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-400 text-sm">Tidak ada bukti</span>
                  )}
                </div>

                {/* Details List */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b dark:border-slate-700 pb-2">
                    <span className="text-gray-500">Produk</span>
                    <span className="font-bold text-right max-w-[60%] truncate">
                       {selectedTransaction.items ? (Array.isArray(selectedTransaction.items) ? selectedTransaction.items[0].name : Object.values(selectedTransaction.items)[0].name) : 'Produk'}
                       {selectedTransaction.items && (Array.isArray(selectedTransaction.items) ? selectedTransaction.items.length : Object.values(selectedTransaction.items).length) > 1 && ' +lainnya'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b dark:border-slate-700 pb-2">
                    <span className="text-gray-500">User</span>
                    <span className="font-bold">{selectedTransaction.buyerName || 'User'}</span>
                  </div>
                  <div className="flex justify-between border-b dark:border-slate-700 pb-2">
                    <span className="text-gray-500">Harga</span>
                    <span className="font-bold text-sky-500">Rp {parseInt(selectedTransaction.totalPrice || 0).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between border-b dark:border-slate-700 pb-2">
                    <span className="text-gray-500">Waktu</span>
                    <span className="font-bold">{new Date(selectedTransaction.createdAt).toLocaleString('id-ID')}</span>
                  </div>
                   <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded text-xs">Sedang Dicek</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t dark:border-slate-700 flex gap-3 bg-gray-50 dark:bg-slate-800/50">
              <button 
                onClick={() => { handleVerifyTransaction(selectedTransaction, false); setSelectedTransaction(null); }} 
                className="flex-1 py-3 rounded-xl border border-red-100 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <X size={18} /> Tolak
              </button>
              <button 
                onClick={() => {
                  Swal.fire({
                    title: 'Setujui Transaksi?',
                    text: "Pastikan dana sudah masuk ke rekening.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#6b7280',
                    confirmButtonText: 'Ya, Setujui',
                    cancelButtonText: 'Batal'
                  }).then((result) => {
                    if (result.isConfirmed) {
                      handleVerifyTransaction(selectedTransaction, true);
                      setSelectedTransaction(null);
                    }
                  });
                }} 
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} /> Terima
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VERIFIKASI NIAGAGO */}
      {selectedNiagaOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg">Verifikasi Order NiagaGo</h3>
              <button onClick={() => setSelectedNiagaOrder(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh]">
                <div className="w-full h-64 bg-gray-100 dark:bg-slate-900 rounded-xl overflow-hidden border dark:border-slate-700 mb-4">
                    <img src={selectedNiagaOrder.paymentProof} alt="Bukti" className="w-full h-full object-contain" />
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b pb-2 dark:border-slate-700">
                        <span className="text-gray-500">Total Bayar</span>
                        <span className="font-bold text-sky-500">Rp {selectedNiagaOrder.price.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2 dark:border-slate-700">
                        <span className="text-gray-500">Driver Dapat</span>
                        <span className="font-bold text-green-500">Rp {(selectedNiagaOrder.price - (parseInt(adminSettings.appFee)||2000)).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Admin Fee</span>
                        <span className="font-bold text-orange-500">Rp {calculateAdminFee(selectedNiagaOrder.price).toLocaleString('id-ID')}</span>
                    </div>
                </div>
            </div>
            <div className="p-4 border-t dark:border-slate-700 flex gap-3 bg-gray-50 dark:bg-slate-800/50">
              <button onClick={() => handleVerifyNiagaOrder(selectedNiagaOrder, false)} className="flex-1 py-3 rounded-xl border border-red-100 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors">Tolak</button>
              <button onClick={() => handleVerifyNiagaOrder(selectedNiagaOrder, true)} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-colors">Terima & Cairkan</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETAIL DRIVER (POP-UP) */}
      {selectedDriverRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            
            {/* Header */}
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg">Detail Pendaftaran Driver</h3>
              <button onClick={() => setSelectedDriverRequest(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X size={20}/></button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="space-y-6">
                {/* Foto KTM */}
                <div>
                  <p className="text-xs font-bold mb-2 text-gray-500 uppercase">Foto KTM</p>
                  <div className="w-full h-64 bg-gray-100 dark:bg-slate-900 rounded-xl overflow-hidden border dark:border-slate-700 flex items-center justify-center cursor-pointer group relative" onClick={() => setSelectedImage(selectedDriverRequest.ktmUrl)}>
                    <img src={selectedDriverRequest.ktmUrl} alt="KTM" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>

                {/* Data Driver */}
                <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b dark:border-slate-600 pb-2">
                      <span className="text-gray-500">Nama Lengkap</span>
                      <span className="font-bold">{selectedDriverRequest.name}</span>
                    </div>
                    <div className="flex justify-between border-b dark:border-slate-600 pb-2">
                      <span className="text-gray-500">Gmail</span>
                      <span className="font-bold">{selectedDriverRequest.email}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">WhatsApp</span>
                      <a 
                        href={`https://wa.me/${selectedDriverRequest.phone.replace(/^0/, '62')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="font-bold text-green-500 hover:underline flex items-center gap-1"
                      >
                        {selectedDriverRequest.phone} <MessageCircle size={14}/>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t dark:border-slate-700 flex gap-3 bg-gray-50 dark:bg-slate-800/50">
              <button 
                onClick={() => { handleRejectDriver(selectedDriverRequest); setSelectedDriverRequest(null); }} 
                className="flex-1 py-3 rounded-xl border border-red-100 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors"
              >
                Tolak
              </button>
              <button 
                onClick={() => { handleApproveDriver(selectedDriverRequest); setSelectedDriverRequest(null); }} 
                className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 shadow-lg shadow-green-500/20 transition-colors"
              >
                Verifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PENCAIRAN DANA (PAYOUT) */}
      {payoutModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-lg">Pencairan Dana Seller</h3>
              <button onClick={() => setPayoutModal(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleProcessPayout} className="p-6 space-y-4">
              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-xs text-gray-500 mb-1">Saldo Tersedia</p>
                <p className="text-2xl font-bold font-mono text-green-500">Rp {(payoutModal.balance !== undefined ? payoutModal.balance : (payoutModal.saldo || 0)).toLocaleString('id-ID')}</p>
                <p className="text-xs text-gray-400 mt-1">{payoutModal.storeName || payoutModal.displayName}</p>
              </div>

              <div>
                <label className="text-sm font-bold mb-2 block">Nominal Pencairan</label>
                <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500 font-bold">Rp</span>
                    <input 
                        type="number" 
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none font-bold ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-200 text-gray-800'}`}
                        placeholder="0"
                        autoFocus
                    />
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                    type="button"
                    onClick={() => setPayoutAmount(payoutModal.balance !== undefined ? payoutModal.balance : (payoutModal.saldo || 0))}
                    className="text-xs font-bold text-sky-600 hover:bg-sky-50 px-3 py-2 rounded-lg border border-sky-200 transition-colors w-full"
                >
                    ⚡ Cairkan Semua
                </button>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                    type="button"
                    onClick={() => setPayoutModal(null)}
                    className="flex-1 py-3 rounded-xl border font-bold text-sm hover:bg-gray-50 transition-colors dark:border-slate-600 dark:hover:bg-slate-700"
                >
                    Batal
                </button>
                <button 
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 shadow-lg shadow-green-500/20 transition-colors"
                >
                    Proses Pencairan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;