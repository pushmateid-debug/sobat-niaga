import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, Users, DollarSign, 
  Image as ImageIcon, MessageCircle, Settings, Bike, Menu, X, 
  Send, Check, ShoppingBag, Zap, LayoutTemplate, Save, Shield,
  LogOut, TrendingUp, CreditCard, Loader2, ZoomIn, User, ArrowLeft, Search,
  Info, FileText, Lock, HelpCircle, Trophy, Crown, Target, ChevronDown,
  Eye, Mail, HeartHandshake, UtensilsCrossed
} from 'lucide-react';
import { dbFirestore, db as realDb, auth } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit, setDoc, getDoc } from 'firebase/firestore';
import { ref, update, onValue, push, serverTimestamp, get, query as realQuery, orderByChild, equalTo, remove, runTransaction } from 'firebase/database';
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

const ImageUploader = ({ label, currentUrl, onFileSelect, rounded = false, isIcon = false }) => {
  const imgSrc = typeof currentUrl === 'object' ? currentUrl?.url : currentUrl;
  
  // Pola checkerboard untuk preview transparansi (hanya tampil jika ada gambar)
  const checkerboardStyle = imgSrc ? {
    backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
    backgroundSize: '10px 10px',
    backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
    backgroundColor: '#ffffff'
  } : {};

    return (
  <div className="space-y-2">
    <label className="block text-xs font-bold opacity-70">{label}</label>
    <div 
      style={checkerboardStyle}
      className={`relative aspect-square w-full ${rounded ? 'rounded-full' : 'rounded-xl'} ${imgSrc ? 'border-none' : 'border-2 border-dashed border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'} overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-sky-500 transition-all group`}
    >
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
          {/* Gunakan object-contain dan padding p-2 agar ikon terlihat melayang dan tidak kepentok pinggir */}
          <img src={imgSrc} alt="Preview" className={`w-full h-full ${rounded || isIcon ? 'object-contain p-2' : 'object-cover'}`} />
          <img src={imgSrc} alt="Preview" className={`w-full h-full bg-transparent ${rounded || isIcon ? 'object-contain p-2' : 'object-cover'}`} />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
            Ganti Gambar
          </div>
        </>
      ) : (
        <div className="text-center text-gray-400">
          <ImageIcon size={20} className="mx-auto mb-1" />
          <span className="text-[10px]">Upload</span>
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
  
  // State Stats (Dipindahkan ke paling atas agar tidak ReferenceError)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalSales: 0,
    totalProfit: 0, // Profit Bersih Admin
    pendingDrivers: 0,
    unreadMessages: 0,
    pendingTransactions: 0 // Badge Verifikasi Transaksi
  });

  const prevPendingTrxRef = useRef(0);
  const isFirstLoadTrx = useRef(true);
  const prevPendingNiagaRef = useRef(0);
  const isFirstLoadNiaga = useRef(true);
  const prevUnreadMessagesRef = useRef(0);
  const [showSmartNotif, setShowSmartNotif] = useState(null);
  const notifTimeoutRef = useRef(null);

  // NOTIFIKASI SUARA PESAN BARU
  useEffect(() => {
    if (stats?.unreadMessages > prevUnreadMessagesRef.current) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.play().catch(e => console.debug("Sound blocked by browser", e));
    }
    prevUnreadMessagesRef.current = stats?.unreadMessages || 0;
  }, [stats?.unreadMessages]);

  // State Drivers
  const [driverRequests, setDriverRequests] = useState([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]); // State Antrean Pencairan
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
  const [flashDeal, setFlashDeal] = useState({ isActive: false, endTime: '', bannerUrl: '', selectedProducts: {}, discountLabel: '' });
  const [transactions, setTransactions] = useState([]);
  const [niagaOrdersToVerify, setNiagaOrdersToVerify] = useState([]); // Order NiagaGo status 'paid'
  const [verificationQueue, setVerificationQueue] = useState([]); // State khusus untuk verifikasi marketplace

  // State Chat
  const [chatList, setChatList] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [selectedChatName, setSelectedChatName] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Derived state for mobile chat view
  const isMobileChatOpen = activeTab === 'chat' && selectedChat;

  // State Image Editor (Crop & Resize)
  const [editingImage, setEditingImage] = useState(null);
  const [cropper, setCropper] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  // State Laporan Keuangan
  const [marketplaceSales, setMarketplaceSales] = useState([]);
  const [niagaSales, setNiagaSales] = useState([]);
  const [financeFilter, setFinanceFilter] = useState('today'); // today, week, month
  
  const [expandedGroup, setExpandedGroup] = useState(null); // State Expand Detail Transaksi
  const [saldoSearch, setSaldoSearch] = useState(''); // State Pencarian Saldo
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
  const [settingsView, setSettingsView] = useState('menu'); // 'menu', 'flash_deal', 'rekber', 'niagago'
  
  // State Event Kompetisi
  const [competitionSettings, setCompetitionSettings] = useState({
    isActive: false,
    ticketPrice: 25000,
    quota: 20,
    prizes: { first: 0, second: 0, third: 0 },
    startDate: '',
    endDate: ''
  });

  const [pagesContent, setPagesContent] = useState({}); // State Konten Halaman Statis
  // State All Products (For Flash Deal Selection)
  const [allProducts, setAllProducts] = useState([]);

  // Fetch All Products for Flash Deal
  useEffect(() => {
    const productsRef = ref(realDb, 'products');
    const unsubscribe = onValue(productsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setAllProducts(list);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Competition Settings
  useEffect(() => {
    const compRef = ref(realDb, 'admin/competitionSettings');
    const unsubscribe = onValue(compRef, (snapshot) => {
      if (snapshot.exists()) setCompetitionSettings(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // Fetch Pages Content (Tentang Kami, dll)
  useEffect(() => {
    const pagesRef = ref(realDb, 'admin/pages');
    const unsubscribe = onValue(pagesRef, (snapshot) => {
      if (snapshot.exists()) {
        setPagesContent(snapshot.val());
      }
    });
    return () => unsubscribe();
  }, []);

  const [sharingConfig, setSharingConfig] = useState({ packageA: 15000, packageB: 10000, fund: 0 });
  const [storeQuotas, setStoreQuotas] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(doc(dbFirestore, 'sharing_configs', 'global'), (s) => {
      if(s.exists()) setSharingConfig(s.data());
    });
    return () => unsub();
  }, []);

  // Fetch Marketplace Orders (Realtime DB) untuk Laporan Keuangan
  // Menggabungkan listener untuk 'transactions' dan 'marketplaceSales' untuk efisiensi
  useEffect(() => {
    const ordersRef = ref(realDb, 'orders');
    const unsubscribe = onValue(ordersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const allOrders = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        
        // Urutkan dan set ke state utama
        const sortedOrders = [...allOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setTransactions(sortedOrders);

        // Filter untuk antrean verifikasi
        const queue = allOrders.filter(o => o.status === 'waiting_verification').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setVerificationQueue(queue);

        // Filter untuk pesanan selesai (Laporan Keuangan)
        const completedOrders = allOrders.filter(o => o.status === 'completed');
        setMarketplaceSales(completedOrders.map(o => ({ ...o, type: 'Marketplace' })));

        // Update Stats
        const total = completedOrders.reduce((acc, curr) => acc + (parseInt(curr.totalPrice) || 0), 0);
        const pending = queue.length;
        setStats(prev => ({ ...prev, totalSales: total, pendingTransactions: pending }));

        // --- NOTIFIKASI SUARA (CTING!) ---
        if (!isFirstLoadTrx.current && pending > prevPendingTrxRef.current) {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => console.log("Audio play failed", e));

            // Pemicu Smart Notification
            if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
            setShowSmartNotif({ type: 'Marketplace', count: pending });
            notifTimeoutRef.current = setTimeout(() => setShowSmartNotif(null), 5000);
        }
        prevPendingTrxRef.current = pending;
        isFirstLoadTrx.current = false;
      } else {
        setTransactions([]);
        setVerificationQueue([]);
        setMarketplaceSales([]);
        setStats(prev => ({ ...prev, totalSales: 0, pendingTransactions: 0 }));
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
    // OPTIMASI: Query hanya user yang merupakan seller terverifikasi
    const usersRef = realQuery(ref(realDb, 'users'), orderByChild('sellerInfo/isVerifiedSeller'), equalTo(true));
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const sellerList = Object.keys(data)
          .map(key => ({
            uid: key,
            ...data[key],
            ...data[key].sellerInfo // Flatten sellerInfo biar gampang akses balance
          }));
        setSellers(sellerList);
      } else {
        setSellers([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Drivers (Realtime DB - Users with role driver)
  useEffect(() => {
    // OPTIMASI: Query hanya user yang memiliki role 'driver'
    const usersRef = realQuery(ref(realDb, 'users'), orderByChild('role'), equalTo('driver'));
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const driverList = Object.keys(data).map(key => ({
          uid: key,
          ...data[key]
        }));
        setDrivers(driverList);
      } else {
        setDrivers([]);
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

  // Fetch Withdrawal Requests (Antrean Pencairan)
  useEffect(() => {
    const wdRef = ref(realDb, 'withdrawal_requests');
    const unsubscribe = onValue(wdRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setWithdrawalRequests(list.sort((a, b) => a.createdAt - b.createdAt));
      } else {
        setWithdrawalRequests([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Gabung & Filter Data Keuangan (Termasuk Payouts)
  const financialRecords = useMemo(() => {
    let records = [];
    
    // 1. Marketplace Sales (Masuk)
    marketplaceSales.forEach(s => {
        // Extract Seller Info
        let sellerId = null;
        let storeName = 'Unknown';
        if (s.items) {
             const items = Array.isArray(s.items) ? s.items : Object.values(s.items);
             if (items.length > 0) {
                 sellerId = items[0].sellerId;
                 storeName = items[0].storeName || 'Toko';
             }
        }

        records.push({
            id: s.id,
            title: s.items ? (Array.isArray(s.items) ? s.items[0].name : Object.values(s.items)[0].name) : 'Order Marketplace',
            amount: parseInt(s.totalPrice || 0),
            date: s.createdAt,
            type: 'in',
            category: 'Marketplace',
            adminFee: calculateAdminFee(parseInt(s.totalPrice || 0)),
            sellerId, 
            storeName
        });
    });

    // 2. NiagaGo Sales (Masuk)
    niagaSales.forEach(s => {
        records.push({
            id: s.id,
            title: `Trip: ${s.pickup?.split(',')[0] || '...'} -> ${s.destination?.split(',')[0] || '...'}`,
            amount: parseInt(s.price || 0),
            date: s.createdAt,
            type: 'in',
            category: 'NiagaGo',
            adminFee: s.adminFee ? parseInt(s.adminFee) : 2000,
            sellerId: s.driverId,
            storeName: s.driverName || 'Driver'
        });
    });

    // 3. Payouts (Keluar)
    payouts.forEach(p => {
        records.push({
            id: p.id,
            title: `Pencairan: ${p.storeName}`,
            amount: parseInt(p.amount || 0),
            date: p.createdAt,
            type: 'out',
            category: 'Payout',
            adminFee: 0
        });
    });

    const now = new Date();
    return records.filter(item => {
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
  }, [marketplaceSales, niagaSales, payouts, financeFilter]);

  // Hitung Ringkasan Keuangan
  const financeSummary = useMemo(() => {
    const totalIn = financialRecords.filter(r => r.type === 'in').reduce((acc, curr) => acc + curr.amount, 0);
    const totalOut = financialRecords.filter(r => r.type === 'out').reduce((acc, curr) => acc + curr.amount, 0);
    const totalProfit = financialRecords.filter(r => r.type === 'in').reduce((acc, curr) => acc + curr.adminFee, 0);
    return { totalIn, totalOut, totalProfit };
  }, [financialRecords]);

  // NEW: Grouped Income Logic (Smart Table per Toko)
  const groupedIncomeRecords = useMemo(() => {
    const incomeRecords = financialRecords.filter(r => r.type === 'in');
    const groups = {};

    incomeRecords.forEach(record => {
        const key = record.sellerId || 'unknown';
        if (!groups[key]) {
            groups[key] = {
                sellerId: record.sellerId,
                storeName: record.storeName,
                lastDate: record.date,
                transactionCount: 0,
                details: []
            };
        }
        if (new Date(record.date) > new Date(groups[key].lastDate)) {
            groups[key].lastDate = record.date;
        }
        groups[key].transactionCount += 1;
        groups[key].details.push(record);
    });

    return Object.values(groups).map(group => {
        let currentBalance = 0;
        let sellerData = null;

        const seller = sellers.find(s => s.uid === group.sellerId);
        if (seller) {
            currentBalance = parseInt(seller.balance || 0); // Unified Balance
            sellerData = seller;
        } else {
            const driver = drivers.find(d => d.uid === group.sellerId);
            if (driver) {
                currentBalance = parseInt(driver.balance || 0); // Unified Balance
                sellerData = driver;
            }
        }

        group.details.sort((a, b) => new Date(b.date) - new Date(a.date));
        return { ...group, currentBalance, sellerData };
    }).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
  }, [financialRecords, sellers, drivers]);

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

      // --- NOTIFIKASI SUARA NIAGAGO (DING!) ---
      const pendingCount = data.length;
      if (!isFirstLoadNiaga.current && pendingCount > prevPendingNiagaRef.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log("Audio play failed", e));

          // Pemicu Smart Notification
          if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
          setShowSmartNotif({ type: 'NiagaGo', count: pendingCount });
          notifTimeoutRef.current = setTimeout(() => setShowSmartNotif(null), 5000);
      }
      prevPendingNiagaRef.current = pendingCount;
      isFirstLoadNiaga.current = false;
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

  // Reset Settings View when Tab Changes
  useEffect(() => {
    if (activeTab !== 'settings') setSettingsView('menu');
  }, [activeTab]);

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
      setSelectedChatName(selectedChat.userName)
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
      html: `<p class="text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}">Yakin ingin menerima <b>${req.name}</b> sebagai driver?</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Terima',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      buttonsStyling: false,
      customClass: {
        popup: `rounded-2xl w-auto max-w-sm p-6 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`,
        title: `text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`,
        confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 transition-all !opacity-100 z-50',
        cancelButton: `px-6 py-2.5 rounded-xl text-sm font-bold ${isDarkMode ? 'text-gray-300 bg-slate-700 hover:bg-slate-600' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'} transition-all mr-3 !opacity-100 z-50`
      }
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
          plateNumber: req.plateNumber || 'N/A', // Simpan plat nomor
          vehicles: req.vehicles || null // Simpan data armada (Motor/Mobil)
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
    // Modal Konfirmasi Anti-Ngumpet
    const confirmResult = await Swal.fire({
      title: isApproved ? 'Setujui Pembayaran?' : 'Tolak Pembayaran?',
      text: isApproved ? "Pastikan dana sudah masuk ke mutasi rekening." : "Tulis alasan penolakan untuk user:",
      icon: isApproved ? 'question' : 'warning',
      input: isApproved ? undefined : 'text',
      inputPlaceholder: 'Contoh: Bukti transfer tidak jelas',
      inputValidator: (value) => {
        if (!isApproved && !value) return 'Alasan wajib diisi!';
      },
      showCancelButton: true,
      confirmButtonText: isApproved ? 'YA, SETUJU' : 'YA, TOLAK',
      cancelButtonText: 'BATAL',
      buttonsStyling: false,
      customClass: {
        popup: `rounded-2xl p-8 ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800 shadow-2xl'}`,
        title: 'text-xl font-black mb-2',
        htmlContainer: 'text-sm font-medium opacity-70',
        confirmButton: `px-10 py-4 rounded-xl text-sm font-black text-white shadow-xl !opacity-100 mx-2 transition-transform active:scale-95 ${isApproved ? 'bg-green-600' : 'bg-rose-600'}`,
        cancelButton: `px-10 py-4 rounded-xl text-sm font-black !opacity-100 mx-2 transition-transform active:scale-95 ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`
      }
    });

    if (!confirmResult.isConfirmed) return;

    try {
      const newStatus = isApproved ? 'processed' : 'payment_rejected';
      const reason = !isApproved ? confirmResult.value : null;
      
      await update(ref(realDb, `orders/${order.id}`), {
        status: newStatus,
        verifiedAt: serverTimestamp(),
        rejectionReason: reason
      });

      // Kirim Notifikasi ke User
      await push(ref(realDb, 'notifications'), {
        userId: order.buyerId,
        title: isApproved ? 'Pembayaran Diterima' : 'Pembayaran Ditolak',
        message: isApproved ? 'Pesananmu sedang diproses seller.' : `Alasan: ${reason}`,
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
    const confirmResult = await Swal.fire({
      title: isApproved ? 'Setujui Order NiagaGo?' : 'Tolak Order NiagaGo?',
      text: isApproved ? "Dana akan diteruskan ke saldo driver." : "Tulis alasan penolakan:",
      icon: isApproved ? 'question' : 'warning',
      input: isApproved ? undefined : 'text',
      inputPlaceholder: 'Contoh: Nominal transfer salah',
      inputValidator: (value) => {
        if (!isApproved && !value) return 'Alasan wajib diisi!';
      },
      showCancelButton: true,
      confirmButtonText: isApproved ? 'YA, SETUJU' : 'YA, TOLAK',
      cancelButtonText: 'BATAL',
      buttonsStyling: false,
      customClass: {
        popup: `rounded-2xl p-8 ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800 shadow-2xl'}`,
        title: 'text-xl font-black mb-2',
        confirmButton: `px-10 py-4 rounded-xl text-sm font-black text-white shadow-xl !opacity-100 mx-2 transition-transform active:scale-95 ${isApproved ? 'bg-green-600' : 'bg-rose-600'}`,
        cancelButton: `px-10 py-4 rounded-xl text-sm font-black !opacity-100 mx-2 transition-transform active:scale-95 ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`
      }
    });

    if (!confirmResult.isConfirmed) return;

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
          const currentBalance = parseInt(driverSnap.val().balance) || 0;
          await update(driverRef, {
            balance: currentBalance + netIncome
          });
        }

        Swal.fire('Berhasil', `Pembayaran diverifikasi. Saldo Rp ${netIncome.toLocaleString()} masuk ke driver.`, 'success');
      } else {
        // Reject
        await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), { 
          status: 'payment_rejected',
          rejectionReason: confirmResult.value
        });
        Swal.fire('Ditolak', 'Pembayaran ditolak.', 'info');
      }
      setSelectedNiagaOrder(null);
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Gagal memproses verifikasi.', 'error');
    }
  };

  // Fungsi Setujui Pencairan (Admin)
  const handleApproveWithdrawal = async (req) => {
      const result = await Swal.fire({
          title: 'Setujui Pencairan?',
          text: `Transfer Rp ${req.amount.toLocaleString()} ke ${req.storeName}? Saldo seller akan dipotong.`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Ya, Selesaikan',
          confirmButtonColor: '#10b981'
      });

      if (result.isConfirmed) {
          try {
              // 1. Cek Saldo Seller Lagi (Double Check)
              const userRef = ref(realDb, `users/${req.sellerId}`);
              const snapshot = await get(userRef);
              const currentBalance = snapshot.val()?.balance || 0;

              if (currentBalance < req.amount) {
                  Swal.fire('Gagal', 'Saldo seller tidak cukup saat ini.', 'error');
                  return;
              }

              // 2. Potong Saldo
              await update(userRef, { balance: currentBalance - req.amount });

              // 3. Masukkan ke Riwayat Payouts
              await push(ref(realDb, 'admin/payouts'), {
                  sellerId: req.sellerId,
                  storeName: req.storeName,
                  amount: req.amount,
                  createdAt: serverTimestamp(),
                  adminId: 'admin',
                  note: 'Pencairan via Request'
              });

              // FIX: Masukkan ke Riwayat Penarikan Seller (agar muncul di dashboard seller)
              // Untuk saat ini, proofUrl diisi catatan teks karena belum ada UI upload bukti transfer dari admin
              const proofNote = `Dana ditransfer oleh Admin pada ${new Date().toLocaleString('id-ID')}`;
              await push(ref(realDb, 'withdrawals'), {
                  sellerId: req.sellerId,
                  amount: req.amount,
                  createdAt: serverTimestamp(),
                  note: 'Otomatis by Admin',
                  proofUrl: proofNote 
              });

              // 4. Hapus dari Antrean Request
              await remove(ref(realDb, `withdrawal_requests/${req.id}`));

              // 5. Notifikasi ke Seller
              await push(ref(realDb, 'notifications'), {
                  userId: req.sellerId,
                  title: 'Dana Cair',
                  message: `Penarikan Rp ${req.amount.toLocaleString()} berhasil diproses Admin.`,
                  type: 'success',
                  createdAt: serverTimestamp()
              });

              Swal.fire('Berhasil', 'Pencairan disetujui & saldo dipotong.', 'success');
          } catch (error) {
              console.error(error);
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

  // Fungsi Tolak Pencairan
  const handleRejectWithdrawal = async (req) => {
      const result = await Swal.fire({
          title: 'Tolak Pencairan?',
          text: "Permintaan akan dihapus dan saldo seller tidak dipotong.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Tolak',
          confirmButtonColor: '#ef4444'
      });

      if (result.isConfirmed) {
          try {
              await remove(ref(realDb, `withdrawal_requests/${req.id}`));
              
              await push(ref(realDb, 'notifications'), {
                  userId: req.sellerId,
                  title: 'Penarikan Ditolak',
                  message: `Permintaan penarikan Rp ${req.amount.toLocaleString()} ditolak. Hubungi admin untuk info lebih lanjut.`,
                  type: 'error',
                  createdAt: serverTimestamp()
              });
              
              Swal.fire('Ditolak', 'Permintaan dihapus.', 'info');
          } catch (error) {
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

  // Fungsi Buka Modal Pencairan
  const handlePayout = (seller) => {
    setPayoutModal(seller);
    setPayoutAmount('');
  };

  // Fungsi Shortcut Cairkan dari Tabel Keuangan
  const handlePayoutFromRecord = async (record) => {
    if (!record.sellerId) return;
    
    // Cari data seller di state yang sudah ada
    let seller = sellers.find(s => s.uid === record.sellerId);
    if (!seller) seller = drivers.find(d => d.uid === record.sellerId);
    
    if (seller) {
        handlePayout(seller);
    } else {
        // Fallback fetch jika tidak ada di list
        const snap = await get(ref(realDb, `users/${record.sellerId}`));
        if (snap.exists()) {
            const data = snap.val();
            handlePayout({ uid: record.sellerId, ...data, ...data.sellerInfo });
        }
    }
  };

  // Fungsi Proses Pencairan (Logic Baru)
  const handleProcessPayout = async (e) => {
    e.preventDefault();
    if (!payoutModal) return;

    const withdrawAmount = parseInt(payoutAmount);
    // Cek apakah ini Seller (balance) atau Driver (saldo)
    const currentBalance = parseInt(payoutModal.balance || 0);

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

        // 1. Potong Saldo (Unified)
        await update(ref(realDb, `users/${payoutModal.uid}`), { balance: remainingBalance });

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

    // Cek Auth Admin
    if (!auth.currentUser) {
        Swal.fire('Error', 'Sesi admin kadaluarsa. Silakan refresh halaman.', 'error');
        return;
    }
    
    if (!topUpProof) {
        Swal.fire('Bukti Wajib', 'Harap upload bukti transfer/mutasi untuk dokumentasi admin.', 'warning');
        return;
    }

    // Konfirmasi Top Up (Fix UI & Transparansi Tombol)
    const confirmResult = await Swal.fire({
        title: 'Konfirmasi Top Up',
        html: `
            <div class="text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}">
                Top up saldo ke <b>${topUpForm.email}</b><br/>
                Sebesar: <b class="text-green-600">Rp ${parseInt(topUpForm.amount).toLocaleString('id-ID')}</b>?
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Proses',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#8b5cf6', // Purple
        cancelButtonColor: '#64748b',
        buttonsStyling: false, // PENTING: Matikan style bawaan SweetAlert biar Tailwind jalan
        customClass: {
            popup: `rounded-2xl w-auto max-w-sm p-6 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`,
            title: `text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`,
            confirmButton: 'px-6 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md transition-colors mr-2 !opacity-100',
            cancelButton: `px-4 py-2 rounded-lg text-xs font-bold ${isDarkMode ? 'text-gray-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'} transition-colors`
        }
    });

    if (!confirmResult.isConfirmed) return;

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
            const amount = parseInt(topUpForm.amount);

            // Gunakan Transaction untuk update saldo (Lebih aman & atomik)
            await runTransaction(ref(realDb, `users/${uid}/balance`), (currentBalance) => {
                return (currentBalance || 0) + amount;
            });

            // Log Transaksi (Arsip Admin)
            await push(ref(realDb, 'admin/topup_logs'), {
                userId: uid,
                userEmail: topUpForm.email,
                amount: amount,
                proofUrl: proofUrl,
                adminId: auth.currentUser.uid, // Fix Permission Denied (Use Real UID)
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

            Swal.fire({
                title: 'Berhasil',
                text: `Saldo masuk & Email notifikasi terkirim ke ${topUpForm.email}`,
                icon: 'success',
                    iconColor: '#8b5cf6',
                confirmButtonText: 'OK',
                buttonsStyling: false,
                customClass: {
                    popup: `rounded-2xl w-auto max-w-sm p-6 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`,
                    title: `text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`,
                    htmlContainer: `text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`,
                    confirmButton: 'px-6 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md transition-colors !opacity-100'
                }
            });
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
    // Filter Ekstensi & MIME: Cuma boleh JPG dan PNG untuk keamanan
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      Swal.fire({
        title: 'Format Ditolak',
        text: 'Hanya file .jpg atau .png yang diperbolehkan demi keamanan sistem!',
        icon: 'error',
        confirmButtonText: 'Oke Sip',
        buttonsStyling: false,
        customClass: {
          confirmButton: 'px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-all !opacity-100'
        }
      });
      return;
    }

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
        const isIcon = editingImage.key.includes('icon') || editingImage.key.includes('logo') || editingImage.key.includes('favicon');
        
        const canvas = cropper.getCroppedCanvas({
            maxWidth: 1920,
            maxHeight: 1080,
            fillColor: isIcon ? null : '#fff', // Support transparency for icons
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        // --- FITUR WATERMARK OTOMATIS ---
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // 0. Logika Lingkaran (Circular Clip) Khusus Favicon
        if (editingImage.key === 'favicon') {
          ctx.globalCompositeOperation = 'destination-in';
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }

        // 1. Watermark Pojok Kanan Bawah (Branding)
        if (!isIcon) {
        const fontSize = Math.round(width * 0.025);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Warna hitam transparan soft
        ctx.textAlign = 'right';
        ctx.fillText('SobatNiaga Official', width - 20, height - 20);

        // 2. Watermark Menyilang Tengah (Khusus QRIS untuk cegah fraud)
        if (editingImage.key === 'qrisUrl') {
          ctx.translate(width / 2, height / 2);
          ctx.rotate(-45 * Math.PI / 180);
          ctx.font = `bold ${Math.round(width * 0.08)}px Arial`;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; // Sangat transparan agar tidak ganggu scan
          ctx.textAlign = 'center';
          ctx.fillText('SOBAT NIAGA QRIS', 0, 0);
          ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset posisi canvas
        }
        }

        canvas.toBlob((blob) => {
            if (blob) {
                handleFileUpload(blob, editingImage.key, editingImage.type);
                setEditingImage(null); // Close modal
            }
        }, (isIcon) ? 'image/png' : 'image/jpeg', 0.85); 
        // Pakai PNG untuk icon/logo supaya transparansi tetap aman
    }
  };

  // Helper: Upload ke Cloudinary (Pengganti Firebase Storage)
  const uploadToCloudinary = async (file) => {
    const cloudName = 'djqnnguli';
    const apiKey = '156244598362341';
    const apiSecret = 'INGJr-KgmBPNwqwBYFZy9w7Fa18';
    
    const type = file.type.startsWith('video/') ? 'video' : 'image';
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

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');

    // Optimasi: Gunakan auto-quality dan auto-format agar file enteng
    return data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
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
        
        // Auto-sync QRIS ke paymentInfo agar langsung muncul di sisi pembeli
        if (key === 'qrisUrl') {
          await update(ref(realDb, 'admin/paymentInfo'), { qrisUrl: url });
        }
      }

      Swal.fire({
        title: 'Berhasil',
        text: 'Gambar berhasil diupload',
        icon: 'success',
        confirmButtonText: 'Mantap',
        buttonsStyling: false,
        customClass: {
          confirmButton: 'px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all !opacity-100'
        }
      });
    } catch (error) {
      console.error("Upload error:", error);
      Swal.fire({
        title: 'Gagal',
        text: `Terjadi kesalahan: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'Coba Lagi',
        buttonsStyling: false,
        customClass: {
          confirmButton: 'px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-gray-600 hover:bg-gray-700 shadow-lg transition-all !opacity-100'
        }
      });
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
      Swal.fire({
        title: 'Sukses',
        text: 'Banner berhasil diperbarui!',
        icon: 'success',
        confirmButtonText: 'Oke',
        buttonsStyling: false,
        customClass: {
          confirmButton: 'px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all !opacity-100'
        }
      });
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

  // Fungsi Simpan Halaman Statis
  const handleSavePage = async (key, content) => {
    try {
        await update(ref(realDb, 'admin/pages'), { [key]: content });
        Swal.fire('Sukses', 'Halaman berhasil diperbarui!', 'success');
    } catch (error) {
        Swal.fire('Error', 'Gagal menyimpan halaman.', 'error');
    }
  };

  // Fungsi Simpan Pengaturan Kompetisi
  const handleSaveCompetition = async (e) => {
    e.preventDefault();
    try {
        await update(ref(realDb, 'admin/competitionSettings'), competitionSettings);
        Swal.fire('Sukses', 'Pengaturan Event Disimpan!', 'success');
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
  };

  // Fungsi Reset Kompetisi (Kick-off Bulan Baru)
  const handleResetCompetition = async () => {
    const result = await Swal.fire({
        title: 'Reset Musim Baru?',
        text: "Poin semua peserta akan di-reset ke 0. Pastikan data pemenang sudah dicatat.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Reset & Kick-off',
        confirmButtonColor: '#ef4444'
    });

    if (result.isConfirmed) {
        try {
            const updates = {};
            sellers.forEach(seller => {
                if (seller.isCompetitor) {
                    updates[`users/${seller.uid}/sellerInfo/points_event`] = 0;
                    updates[`users/${seller.uid}/sellerInfo/competitionRevenue`] = 0;
                    updates[`users/${seller.uid}/sellerInfo/competitionQty`] = 0;
                }
            });
            await update(ref(realDb), updates);
            Swal.fire('Selesai', 'Musim baru dimulai! Poin telah di-reset.', 'success');
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
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
    { id: 'sharing', label: 'Sobat Berbagi', icon: <HeartHandshake size={20} /> },
  ];

  return (
    <div className={`h-[100dvh] flex overflow-hidden ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      {/* Custom Styles for Drop & Shake Animation */}
      <style>{`
        @keyframes dropAndShake {
          0% { transform: translate(-50%, -100%) scale(0.8); opacity: 0; }
          50% { transform: translate(-50%, 24px) scale(1.05); opacity: 1; }
          60% { transform: translate(-52%, 20px) rotate(-1deg); }
          70% { transform: translate(-48%, 20px) rotate(1deg); }
          80% { transform: translate(-51%, 20px) rotate(-0.5deg); }
          90% { transform: translate(-49%, 20px) rotate(0.5deg); }
          100% { transform: translate(-50%, 20px) rotate(0); }
        }
        .animate-drop-shake {
          animation: dropAndShake 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      {/* SMART NOTIFICATION OVERLAY */}
      {showSmartNotif && (
        <div 
          className="fixed top-0 left-1/2 z-[9999] w-[90%] max-w-md pointer-events-none"
          style={{ perspective: '1000px' }}
        >
          <div className="animate-drop-shake pointer-events-auto bg-white dark:bg-slate-800 border-2 border-sky-500 shadow-[0_20px_50px_rgba(14,165,233,0.3)] rounded-2xl p-4 flex items-center gap-4">
            <div className="relative">
              <div className="p-3 bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded-xl">
                {showSmartNotif.type === 'NiagaGo' ? <Bike size={24} /> : <ShoppingBag size={24} />}
              </div>
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ring-2 ring-white dark:ring-slate-800">
                {showSmartNotif.count}
              </span>
            </div>
            <div className="flex-1">
              <h4 className="font-black text-sm text-gray-900 dark:text-white leading-tight">
                ADA DUIT MASUK! 💸
              </h4>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                {showSmartNotif.count} Antrean Verifikasi {showSmartNotif.type}
              </p>
            </div>
            <button onClick={() => setShowSmartNotif(null)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      
      {/* MOBILE OVERLAY FOR SIDEBAR */}
      {isSidebarOpen && !isMobileChatOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[75%] max-w-[260px] md:w-64 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 border-r ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} ${isMobileChatOpen ? 'hidden md:block' : ''}`}>
        <div className="h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 md:p-6 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-sky-600 flex items-center gap-2">
              <Shield size={20} className="md:w-6 md:h-6" /> Admin
            </h2>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
              <X size={20} />
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all ${
                  activeTab === item.id 
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-200 dark:shadow-none' 
                    : (isDarkMode ? 'text-gray-400 hover:bg-slate-700 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                }`}
              >
                <div className="flex items-center gap-3">
                  {React.cloneElement(item.icon, { size: 18 })}
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
          <div className="p-3 border-t border-gray-100 dark:border-slate-700">
            <button onClick={onBack} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              <LogOut size={18} />
              <span>Keluar Dashboard</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header (Mobile Toggle) */}
        {!isMobileChatOpen && (
        <header className={`md:hidden flex items-center justify-between p-3 border-b ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <Menu size={20} />
          </button>
          <h1 className="font-bold text-sm">Admin Dashboard</h1>
          <div className="w-10"></div>
        </header>
        )}

        {/* Content Area */}
        <main className={`flex-1 overflow-y-auto ${isMobileChatOpen ? 'p-0' : 'p-4 md:p-8'}`}>
          
          {/* --- DASHBOARD OVERVIEW --- */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Ringkasan Hari Ini</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400"><ShoppingBag size={20} /></div>
                  </div>
                  <p className="text-xs text-gray-500">Total Transaksi</p>
                  <h3 className="text-lg font-bold">{transactions.length}</h3>
                </div>
                <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg dark:bg-green-900/30 dark:text-green-400"><DollarSign size={20} /></div>
                  </div>
                  <p className="text-xs text-gray-500">Profit Admin</p>
                  <h3 className="text-lg font-bold text-green-600">Rp {financeSummary.totalProfit.toLocaleString('id-ID')}</h3>
                </div>
                <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg dark:bg-orange-900/30 dark:text-orange-400"><Bike size={20} /></div>
                    {driverRequests.length > 0 && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{driverRequests.length}</span>}
                  </div>
                  <p className="text-xs text-gray-500">Driver Pending</p>
                  <h3 className="text-lg font-bold">{driverRequests.length}</h3>
                </div>
                <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-900/30 dark:text-purple-400"><MessageCircle size={20} /></div>
                  </div>
                  <p className="text-xs text-gray-500">Pesan Baru</p>
                  <h3 className="text-lg font-bold">{stats.unreadMessages}</h3>
                </div>
              </div>

              {/* Grafik Penjualan (Stockbit Style) */}
              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
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
                                className="bg-sky-50 hover:bg-sky-100 text-sky-600 p-2 rounded-lg transition-colors"
                                title="Lihat Detail"
                              >
                                <Eye size={18} />
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
                  <ImageUploader label="Logo Menu Login" currentUrl={banners['login_logo']} onFileSelect={(file) => handleFileSelect(file, 'login_logo')} isIcon />
                  <ImageUploader label="Favicon (Icon Browser)" currentUrl={banners['favicon']} onFileSelect={(file) => handleFileSelect(file, 'favicon')} rounded={true} />
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
                    isIcon
                  />
                  <ImageUploader 
                    label="Banner Flash Deal" 
                    currentUrl={flashDeal.bannerUrl} 
                    onFileSelect={(file) => handleFileSelect(file, 'bannerUrl', 'flashDeal')} 
                  />
                </div>
              </div>

              {/* 5. ICON MENU UTAMA (HOME) */}
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><LayoutTemplate size={20} className="text-emerald-500"/> Icon Menu Utama (Home)</h3>
                <div className="grid grid-cols-3 md:grid-cols-9 gap-4">
                  <ImageUploader label="Populer" currentUrl={banners['icon_populer']} onFileSelect={(file) => handleFileSelect(file, 'icon_populer')} isIcon />
                  <ImageUploader label="Isi Pulsa" currentUrl={banners['icon_pulsa']} onFileSelect={(file) => handleFileSelect(file, 'icon_pulsa')} isIcon />
                  <ImageUploader label="Fashion" currentUrl={banners['icon_fashion']} onFileSelect={(file) => handleFileSelect(file, 'icon_fashion')} isIcon />
                  <ImageUploader label="Makanan" currentUrl={banners['icon_makanan']} onFileSelect={(file) => handleFileSelect(file, 'icon_makanan')} isIcon />
                  <ImageUploader label="Jasa / Cetak" currentUrl={banners['icon_jasa']} onFileSelect={(file) => handleFileSelect(file, 'icon_jasa')} isIcon />
                  <ImageUploader label="NiagaGo / Niagaku" currentUrl={banners['icon_niagago']} onFileSelect={(file) => handleFileSelect(file, 'icon_niagago')} isIcon />
                  <ImageUploader label="Skin Care" currentUrl={banners['icon_skincare']} onFileSelect={(file) => handleFileSelect(file, 'icon_skincare')} isIcon />
                  <ImageUploader label="Top Up Game" currentUrl={banners['icon_game']} onFileSelect={(file) => handleFileSelect(file, 'icon_game')} isIcon />
                  <ImageUploader label="Lainnya" currentUrl={banners['icon_lainnya']} onFileSelect={(file) => handleFileSelect(file, 'icon_lainnya')} isIcon />
                  <ImageUploader label="Sobat Berbagi" currentUrl={banners['icon_sharing']} onFileSelect={(file) => handleFileSelect(file, 'icon_sharing')} isIcon />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">*Gunakan format PNG Transparan atau WebP agar tampilan rapi di Mobile.</p>
              </div>
            </div>
          )}

          {/* --- SOBAT BERBAGI (ADMIN CONTROL) --- */}
          {activeTab === 'sharing' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Program Sobat Berbagi</h2>
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold">
                  Total Dana Donasi: Rp {sharingConfig.donationFund?.toLocaleString()}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={cardClass}>
                  <h3 className="font-bold mb-4 flex items-center gap-2"><Settings size={18}/> Harga Paket Bantuan</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Harga Paket A (Sembako)</label>
                      <input type="number" value={sharingConfig.packageA_price} onChange={e => setSharingConfig({...sharingConfig, packageA_price: parseInt(e.target.value)})} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Harga Paket B (Makanan)</label>
                      <input type="number" value={sharingConfig.packageB_price} onChange={e => setSharingConfig({...sharingConfig, packageB_price: parseInt(e.target.value)})} className={inputClass} />
                    </div>
                    <button onClick={() => setDoc(doc(dbFirestore, 'sharing_configs', 'global'), sharingConfig)} className="w-full py-2 bg-sky-600 text-white font-bold rounded-lg">Update Harga</button>
                  </div>
                </div>

                <div className={cardClass}>
                  <h3 className="font-bold mb-4 flex items-center gap-2"><UtensilsCrossed size={18}/> Kuota Harian Toko Mitra</h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {sellers.map(s => (
                      <div key={s.uid} className="flex items-center justify-between p-2 border-b">
                        <span className="text-xs font-bold">{s.storeName}</span>
                        <input 
                          type="number" 
                          placeholder="Kuota" 
                          className="w-20 p-1 border rounded text-xs"
                          onBlur={async (e) => {
                            const date = new Date().toISOString().split('T')[0];
                            await setDoc(doc(dbFirestore, 'sharing_quotas', `${s.uid}_${date}`), {
                              storeId: s.uid,
                              date,
                              maxQuota: parseInt(e.target.value),
                              usedQuota: 0
                            }, { merge: true });
                            Swal.fire('Kuota Diset!', '', 'success');
                          }}
                        />
                      </div>
                    ))}
                  </div>
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
                    <thead className={`text-xs uppercase sticky top-0 z-10 ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        <th className="px-3 md:px-6 py-4 text-left">Produk</th>
                        <th className="px-3 md:px-6 py-4 text-left hidden sm:table-cell">User</th>
                        <th className="px-3 md:px-6 py-4 text-left">Harga</th>
                        <th className="px-3 md:px-6 py-4 text-left">Status</th>
                        <th className="px-3 md:px-6 py-4 text-left hidden md:table-cell">Waktu</th>
                        <th className="px-3 md:px-6 py-4 text-left">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                      {transactions.map(trx => (
                        <tr key={trx.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                          {/* 1. PRODUK */}
                          <td className="px-3 md:px-6 py-4 align-middle font-medium">
                            <div className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                {trx.items ? (Array.isArray(trx.items) ? trx.items[0].name : Object.values(trx.items)[0].name) : 'Produk'}
                                {trx.items && (Array.isArray(trx.items) ? trx.items.length : Object.values(trx.items).length) > 1 && <span className="text-gray-400 font-normal"> +lainnya</span>}
                            </div>
                            <div className="text-[9px] text-gray-400 font-mono mt-0.5">#{trx.id.slice(-6).toUpperCase()}</div>
                          </td>
                          {/* 2. USER */}
                          <td className="px-3 md:px-6 py-4 align-middle hidden sm:table-cell">
                            <div className="text-xs font-bold">{trx.buyerName || 'User'}</div>
                          </td>
                          {/* 3. HARGA */}
                          <td className="px-3 md:px-6 py-4 align-middle font-bold text-sky-600 whitespace-nowrap text-xs">
                            Rp {(parseInt(trx.totalPrice) || 0).toLocaleString('id-ID')}
                          </td>
                          {/* 4. STATUS */}
                          <td className="px-3 md:px-6 py-4 align-middle">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                              trx.status === 'waiting_verification' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              trx.status === 'payment_rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                              trx.status === 'processed' ? 'bg-blue-50 text-blue-600' :
                              trx.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {trx.status === 'waiting_verification' ? 'PENDING' : 
                               trx.status === 'payment_rejected' ? 'DITOLAK' : 
                               trx.status?.replace('_', ' ')}
                            </span>
                          </td>
                          {/* 5. WAKTU */}
                          <td className="px-3 md:px-6 py-4 align-middle text-[10px] md:text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">
                            {trx.paidAt ? new Date(trx.paidAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 
                             (trx.createdAt ? new Date(trx.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-')}
                          </td>
                          {/* 6. AKSI */}
                          <td className="px-3 md:px-6 py-4 align-middle">
                            <div className="flex items-center gap-2">
                              {/* Thumbnail Bukti */}
                              {trx.proofUrl ? (
                                <div 
                                  onClick={() => setSelectedImage(trx.proofUrl)}
                                  className="w-10 h-10 rounded-lg border dark:border-slate-600 overflow-hidden cursor-pointer hover:ring-2 hover:ring-sky-500 transition-all bg-gray-50 flex-shrink-0 shadow-sm"
                                  title="Zoom Bukti"
                                >
                                  <img src={trx.proofUrl} className="w-full h-full object-cover" alt="Proof" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg border border-dashed flex items-center justify-center text-[8px] text-gray-400 flex-shrink-0">No Proof</div>
                              )}

                              {/* Tombol Cepat */}
                              {trx.status === 'waiting_verification' && (
                                <div className="flex gap-1.5">
                                  <button 
                                    onClick={() => handleVerifyTransaction(trx, true)} 
                                    className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md active:scale-90 transition-all"
                                    title="Setujui"
                                  >
                                    <Check size={14} strokeWidth={3} />
                                  </button>
                                  <button 
                                    onClick={() => handleVerifyTransaction(trx, false)} 
                                    className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md active:scale-90 transition-all"
                                    title="Tolak"
                                  >
                                    <X size={14} strokeWidth={3} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))} 
                      {transactions.length === 0 && (
                      <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-500">Hore! Semua transaksi sudah diverifikasi.</td></tr>
                      )}
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
                    <thead className={`text-xs uppercase sticky top-0 z-10 ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                        <tr>
                        <th className="px-3 md:px-6 py-4 text-left">Rute</th>
                        <th className="px-3 md:px-6 py-4 text-left hidden sm:table-cell">Driver</th>
                        <th className="px-3 md:px-6 py-4 text-left">Harga</th>
                        <th className="px-3 md:px-6 py-4 text-left hidden md:table-cell">Waktu</th>
                        <th className="px-3 md:px-6 py-4 text-left">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                        {niagaOrdersToVerify.map(order => (
                          <tr key={order.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                            <td className="px-3 md:px-6 py-4 align-middle">
                                <div className="font-bold text-xs">{order.pickup}</div>
                                <div className="text-[10px] text-gray-500">Ke: {order.destination}</div>
                            </td>
                            <td className="px-3 md:px-6 py-4 align-middle text-xs hidden sm:table-cell">{order.driverName}</td>
                            <td className="px-3 md:px-6 py-4 align-middle font-bold text-sky-500 text-xs">Rp {order.price.toLocaleString('id-ID')}</td>
                            <td className="px-3 md:px-6 py-4 align-middle text-[10px] text-gray-500 whitespace-nowrap hidden md:table-cell">
                                {new Date(order.verifiedAt || order.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-3 md:px-6 py-4 align-middle">
                                <div className="flex items-center gap-2">
                                    {order.paymentProof ? (
                                        <div 
                                            onClick={() => setSelectedImage(order.paymentProof)}
                                            className="w-10 h-10 rounded-lg border dark:border-slate-600 overflow-hidden cursor-pointer hover:ring-2 hover:ring-sky-500 transition-all bg-gray-50 flex-shrink-0 shadow-sm"
                                            title="Zoom Bukti"
                                        >
                                            <img src={order.paymentProof} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg border border-dashed flex items-center justify-center text-[8px] text-gray-400 flex-shrink-0">No Proof</div>
                                    )}
                                    <div className="flex gap-1.5">
                                        <button onClick={() => handleVerifyNiagaOrder(order, true)} className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md active:scale-90 transition-all" title="Setujui"><Check size={14} strokeWidth={3}/></button>
                                        <button onClick={() => handleVerifyNiagaOrder(order, false)} className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md active:scale-90 transition-all" title="Tolak"><X size={14} strokeWidth={3}/></button>
                                    </div>
                                </div>
                            </td>
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
            <div className={`flex flex-col md:flex-row relative ${selectedChat ? 'fixed inset-0 z-[9999] w-full h-[100dvh] overflow-hidden bg-white dark:bg-slate-900 md:static md:z-auto md:h-[calc(100dvh-100px)] md:rounded-2xl md:border' : 'h-[calc(100dvh-100px)] rounded-2xl border'} ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              {/* Chat List */}
              <div className={`w-full md:w-1/3 border-r flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'} ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className={`p-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Pesan Masuk</h3>
                </div>
                <div className={`flex-1 overflow-y-auto ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
                  {chatList.map(chat => (
                    <div 
                      key={chat.uid}
                      onClick={() => setSelectedChat(chat)}
                      className={`p-3 border-b cursor-pointer transition-colors flex items-center gap-3 ${
                        isDarkMode 
                          ? 'hover:bg-slate-700 border-slate-700' 
                          : 'hover:bg-sky-50 border-gray-100'
                      } ${
                        selectedChat?.uid === chat.uid 
                          ? (isDarkMode ? 'bg-slate-700' : 'bg-sky-50 border-l-4 border-l-sky-500') 
                          : (isDarkMode ? '' : 'bg-white')
                      }`}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                         {chat.userPhoto ? <img src={chat.userPhoto} className="w-full h-full object-cover" /> : <User size={18} className="text-gray-500" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <h4 className={`font-bold text-xs md:text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{chat.userName || 'User'}</h4>
                            {chat.hasUnreadAdmin && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></span>}
                        </div>
                        <p className={`text-[10px] md:text-xs truncate mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Klik untuk lihat pesan</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat Window */}
              <div className={`flex-1 flex flex-col ${selectedChat ? 'flex' : 'hidden md:flex'} ${isDarkMode ? 'bg-slate-900' : 'bg-white'} w-full h-full overflow-hidden`}>
                {selectedChat ? (
                  <>
                    <div className={`p-3 border-b flex items-center gap-3 shadow-sm z-10 flex-none ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-100'}`}>
                      <button onClick={() => setSelectedChat(null)} className={`md:hidden p-1 rounded-full ${isDarkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-100 text-slate-800'}`}>
                        <ArrowLeft size={24} />
                      </button>
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                         {selectedChat.userPhoto ? <img src={selectedChat.userPhoto} className="w-full h-full object-cover" /> : <User size={16} className="m-2 text-gray-500" />}
                      </div>
                      <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{selectedChat.userName}</h3>
                    </div>
                    <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                            msg.sender === 'admin' 
                              ? 'bg-sky-600 text-white rounded-tr-none' 
                              : (isDarkMode ? 'bg-slate-800 text-gray-200 border border-slate-700' : 'bg-white text-gray-900 border border-gray-100') + ' rounded-tl-none'
                          }`}>
                            {msg.text}
                            <p className={`text-[9px] mt-1 text-right ${msg.sender === 'admin' ? 'text-sky-100' : 'text-gray-400'}`}>
                              {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={handleSendAdminMessage} className={`p-3 border-t flex gap-2 items-center flex-none ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-100'}`}>
                      <input 
                        type="text" 
                        value={adminMessage}
                        onChange={(e) => setAdminMessage(e.target.value)}
                        placeholder="Tulis pesan..."
                        className={`flex-1 py-2.5 px-4 rounded-full border text-sm outline-none transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white placeholder-gray-500' : 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500'}`}
                      />
                      <button type="submit" className="p-2.5 bg-sky-600 text-white rounded-full hover:bg-sky-700 shadow-sm flex-shrink-0 transition-transform active:scale-95">
                        <Send size={18} />
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
              {/* Sticky Header Area */}
              <div className={`sticky top-0 z-20 pb-2 -mt-4 pt-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
                  <h2 className="text-2xl font-bold mb-4">Manajemen Saldo</h2>
                  
                  <div className={`flex w-full rounded-xl p-1 mb-4 border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                      <button 
                          onClick={() => setSellerTabMode('sellers')} 
                          className={`w-1/2 py-3 text-sm font-semibold rounded-lg transition-all ${sellerTabMode === 'sellers' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                          Seller Barang
                      </button>
                      <button 
                          onClick={() => setSellerTabMode('drivers')} 
                          className={`w-1/2 py-3 text-sm font-semibold rounded-lg transition-all ${sellerTabMode === 'drivers' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                          Driver NiagaGo
                      </button>
                  </div>

                  {/* Search Bar */}
                  <div className="relative shadow-sm">
                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} size={20} />
                    <input 
                        type="text" 
                        placeholder={sellerTabMode === 'sellers' ? "Cari Nama Toko / Owner..." : "Cari Nama Driver..."}
                        value={saldoSearch}
                        onChange={(e) => setSaldoSearch(e.target.value)}
                        className={`w-full pl-11 pr-4 py-3.5 rounded-xl border outline-none text-sm font-medium transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-sky-500' : 'bg-white border-gray-200 focus:border-sky-500'}`}
                    />
                  </div>
              </div>

              {/* Form Manual Top Up (Inject Saldo) */}
              <div className={`p-5 rounded-2xl border mb-6 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><DollarSign className="text-green-500" size={18}/> Inject Saldo User (Manual Top Up)</h3>
                <form onSubmit={handleManualTopUp} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="w-full">
                        <label className={labelClass}>Email User</label>
                        <input type="email" placeholder="user@example.com" value={topUpForm.email} onChange={e => setTopUpForm({...topUpForm, email: e.target.value})} className={inputClass} required />
                    </div>
                    <div className="w-full">
                        <label className={labelClass}>Jumlah (Rp)</label>
                        <input type="number" placeholder="50000" value={topUpForm.amount} onChange={e => setTopUpForm({...topUpForm, amount: e.target.value})} className={inputClass} required />
                    </div>
                    <div className="w-full">
                        <label className={labelClass}>Bukti Transfer</label>
                        <div className={`relative w-full border rounded-xl overflow-hidden ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}>
                            <input type="file" accept="image/*" onChange={e => setTopUpProof(e.target.files[0])} className="w-full text-xs p-2 cursor-pointer" required />
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        className="w-full md:w-auto py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors h-[46px] flex items-center justify-center gap-2 text-sm"
                    >
                        <DollarSign size={16} /> Top Up
                    </button>
                </form>
              </div>

              {/* Table View for Sellers/Drivers */}
              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="overflow-auto max-h-[400px]">
                  <table className="w-full text-sm text-left relative">
                    <thead className={`text-xs uppercase sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        {sellerTabMode === 'sellers' && <th className="px-6 py-3 whitespace-nowrap">Nama Toko</th>}
                        <th className="px-6 py-3 whitespace-nowrap">Pemilik</th>
                        <th className="px-6 py-3 whitespace-nowrap">Saldo Aktif</th>
                        <th className="px-6 py-3 whitespace-nowrap">Status</th>
                        <th className="px-6 py-3 whitespace-nowrap text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                      {(sellerTabMode === 'sellers' ? sellers : drivers)
                        .filter(item => {
                            const name = item.storeName || item.displayName || 'Tanpa Nama';
                            const email = item.email || '';
                            return name.toLowerCase().includes(saldoSearch.toLowerCase()) || email.toLowerCase().includes(saldoSearch.toLowerCase());
                        })
                        .map((item) => (
                        <tr key={item.uid} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                          {sellerTabMode === 'sellers' && (
                            <td className="px-6 py-4 whitespace-nowrap font-bold">{item.storeName || 'Tanpa Nama'}</td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium">{item.displayName || 'User'}</div>
                            <div className="text-xs text-gray-500">{item.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-green-600">
                            Rp {(item.balance || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {sellerTabMode === 'sellers' ? (
                                item.isVerifiedSeller 
                                ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold"><Check size={10}/> Verified</span>
                                : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold">Pending</span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold"><Bike size={10}/> Driver</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button 
                                onClick={() => handlePayout(item)} 
                                className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors"
                            >
                                Cairkan Dana
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(sellerTabMode === 'sellers' ? sellers : drivers).length === 0 && (
                        <tr><td colSpan={sellerTabMode === 'sellers' ? 5 : 4} className="px-6 py-8 text-center text-gray-500">Tidak ada data ditemukan.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- LAPORAN KEUANGAN (Placeholder) --- */}
          {activeTab === 'finance' && (
            <div className="space-y-6 pb-32">
              {/* Header: Summary & Filter (Relative agar ikut scroll) */}
              <div className={`relative pb-4 pt-2 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Laporan Keuangan</h2>
                    <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-slate-800' : 'bg-white border border-gray-200'}`}>
                        {['today', 'week', 'month'].map(f => (
                            <button 
                                key={f}
                                onClick={() => setFinanceFilter(f)}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${financeFilter === f ? 'bg-sky-600 text-white shadow-sm' : (isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800')}`}
                            >
                                {f === 'today' ? 'Hari Ini' : (f === 'week' ? '7 Hari' : 'Bulan Ini')}
                            </button>
                        ))}
                    </div>
                  </div>

                  {/* Grid Summary (Compact) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Masuk</p>
                        <h3 className="text-sm md:text-lg font-bold text-green-500 truncate">Rp {financeSummary.totalIn.toLocaleString('id-ID')}</h3>
                    </div>
                    <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Keluar</p>
                        <h3 className="text-sm md:text-lg font-bold text-red-500 truncate">Rp {financeSummary.totalOut.toLocaleString('id-ID')}</h3>
                    </div>
                    <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Profit Bersih</p>
                        <h3 className="text-sm md:text-lg font-bold text-sky-500 truncate">Rp {financeSummary.totalProfit.toLocaleString('id-ID')}</h3>
                    </div>
                  </div>
              </div>

              {/* Content Tables (Normal Flow) */}
              <div className="space-y-8">
                  
                  {/* 1. Rincian Pemasukan (Income) - TABLE */}
                  <div>
                    <h3 className={`font-bold text-sm mb-3 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        <div className="p-1 bg-green-100 text-green-600 rounded-lg"><TrendingUp size={14}/></div>
                        Rincian Pemasukan (Uang Masuk)
                    </h3>
                    <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="overflow-auto max-h-[300px]">
                            <table className="w-full text-sm text-left relative">
                                <thead className={`text-xs uppercase sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                                    <tr>
                                        <th className="px-4 py-3 whitespace-nowrap">Tanggal Terakhir</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Nama Toko</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Detail</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Total Saldo</th>
                                        <th className="px-4 py-3 whitespace-nowrap text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                                    {groupedIncomeRecords.length === 0 ? (
                                        <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500 text-xs">Belum ada pemasukan periode ini.</td></tr>
                                    ) : (
                                        groupedIncomeRecords.map((item, idx) => (
                                            <React.Fragment key={idx}>
                                            <tr className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer`} onClick={() => setExpandedGroup(expandedGroup === (item.sellerId || idx) ? null : (item.sellerId || idx))}>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                                    {new Date(item.lastDate).toLocaleDateString('id-ID')} <br/>
                                                    <span className="text-[10px] opacity-70">{new Date(item.lastDate).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
                                                </td>
                                                <td className={`px-4 py-3 whitespace-nowrap font-bold text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                                    {item.storeName}
                                                </td>
                                                <td className={`px-4 py-3 whitespace-nowrap text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    <button 
                                                        className={`px-2 py-1 rounded font-bold flex items-center gap-1 transition-colors ${isDarkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                                    >
                                                        {item.transactionCount} Transaksi
                                                        <ChevronDown size={12} className={`transition-transform duration-200 ${expandedGroup === (item.sellerId || idx) ? 'rotate-180' : ''}`}/>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap font-bold text-green-600 text-xs">
                                                    Rp {item.currentBalance.toLocaleString('id-ID')}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                                    {item.currentBalance > 0 ? (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); item.sellerData && handlePayout(item.sellerData); }}
                                                            className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm"
                                                        >
                                                            Cairkan
                                                        </button>
                                                    ) : (
                                                        <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 cursor-default">
                                                            LUNAS
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                            {expandedGroup === (item.sellerId || idx) && (
                                                <tr>
                                                    <td colSpan="5" className="p-0">
                                                        <div className={`px-4 py-3 border-b border-dashed ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                                                            <table className="w-full text-xs">
                                                                <thead className={`text-[10px] uppercase opacity-70 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                    <tr>
                                                                        <th className="py-1 text-left">Waktu</th>
                                                                        <th className="py-1 text-left">Produk</th>
                                                                        <th className="py-1 text-right">Nominal</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                                                    {item.details.map((detail, dIdx) => (
                                                                        <tr key={dIdx} className="border-b border-dashed border-gray-200 dark:border-slate-700 last:border-0">
                                                                            <td className="py-2">
                                                                                {new Date(detail.date).toLocaleDateString('id-ID')} <span className="opacity-60">| {new Date(detail.date).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
                                                                            </td>
                                                                            <td className="py-2 font-medium">{detail.title}</td>
                                                                            <td className="py-2 text-right font-mono">Rp {detail.amount.toLocaleString('id-ID')}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  </div>

                  {/* 2. Riwayat Pencairan (Outcome) - TABLE */}
                  <div>
                    <h3 className={`font-bold text-sm mb-3 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        <div className="p-1 bg-red-100 text-red-600 rounded-lg"><CreditCard size={14}/></div>
                        Riwayat Pencairan Dana (Keluar)
                    </h3>
                    <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                         <div className="overflow-auto max-h-[300px]">
                             <table className="w-full text-sm text-left relative">
                                 <thead className={`text-xs uppercase sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                                    <tr>
                                        <th className="px-4 py-3 whitespace-nowrap">Tanggal</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Toko / Driver</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Catatan</th>
                                        <th className="px-4 py-3 whitespace-nowrap text-right">Nominal</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                                    {financialRecords.filter(r => r.type === 'out').length === 0 ? (
                                        <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 text-xs">Belum ada pencairan dana.</td></tr>
                                    ) : (
                                        financialRecords.filter(r => r.type === 'out').map((item) => (
                                            <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                                    {new Date(item.date).toLocaleDateString('id-ID')}
                                                </td>
                                                <td className={`px-4 py-3 whitespace-nowrap font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                                    {item.title.replace('Pencairan: ', '')}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 italic">
                                                    {item.note || '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-red-600">
                                                    - Rp {item.amount.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  </div>

              </div>
            </div>
          )}

          {/* --- PENGATURAN ADMIN --- */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {settingsView === 'menu' ? (
                <>
                  <h2 className="text-2xl font-bold mb-4">Menu Pengaturan</h2>
                  <div className="grid grid-cols-3 gap-3 mb-8">
                    <button 
                      onClick={() => setSettingsView('flash_deal')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-4 bg-yellow-100 text-yellow-600 rounded-full dark:bg-yellow-900/30 dark:text-yellow-400">
                        <Zap size={28} />
                      </div>
                      <span className="font-bold text-xs text-center">Flash Deal</span>
                    </button>

                    <button 
                      onClick={() => setSettingsView('rekber')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-4 bg-sky-100 text-sky-600 rounded-full dark:bg-sky-900/30 dark:text-sky-400">
                        <CreditCard size={28} />
                      </div>
                      <span className="font-bold text-xs text-center">Rekening Pusat</span>
                    </button>

                    <button 
                      onClick={() => setSettingsView('niagago')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-4 bg-orange-100 text-orange-600 rounded-full dark:bg-orange-900/30 dark:text-orange-400">
                        <Bike size={28} />
                      </div>
                      <span className="font-bold text-xs text-center">Tarif NiagaGo</span>
                    </button>

                    <button 
                      onClick={() => setSettingsView('competition')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-4 bg-indigo-100 text-indigo-600 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400">
                        <Trophy size={28} />
                      </div>
                      <span className="font-bold text-xs text-center">Event Juara</span>
                    </button>
                  </div>

                  {/* Grup Informasi & Legalitas */}
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2 opacity-70 uppercase tracking-wider">
                    <Info size={16}/> Informasi & Legalitas
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <button 
                      onClick={() => setSettingsView('about')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
                        <Info size={20} />
                      </div>
                      <span className="font-bold text-[10px] text-center leading-tight">Tentang<br/>Kami</span>
                    </button>

                    <button 
                      onClick={() => setSettingsView('terms')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-2 bg-orange-50 text-orange-600 rounded-lg dark:bg-orange-900/30 dark:text-orange-400">
                        <FileText size={20} />
                      </div>
                      <span className="font-bold text-[10px] text-center leading-tight">Syarat &<br/>Ketentuan</span>
                    </button>

                    <button 
                      onClick={() => setSettingsView('privacy')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-2 bg-green-50 text-green-600 rounded-lg dark:bg-green-900/30 dark:text-green-400">
                        <Lock size={20} />
                      </div>
                      <span className="font-bold text-[10px] text-center leading-tight">Kebijakan<br/>Privasi</span>
                    </button>

                    <button 
                      onClick={() => setSettingsView('help')} 
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md hover:-translate-y-1 ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="p-2 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-900/30 dark:text-purple-400">
                        <HelpCircle size={20} />
                      </div>
                      <span className="font-bold text-[10px] text-center leading-tight">Pusat<br/>Bantuan</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setSettingsView('menu')} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-sky-600 mb-4 transition-colors">
                    <ArrowLeft size={18} /> Kembali ke Menu
                  </button>
              
              {/* --- PENGATURAN FLASH DEAL (NEW) --- */}
              {settingsView === 'flash_deal' && (
              <div className={`p-6 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Zap size={20} className="text-yellow-500"/> Pengaturan Flash Deal</h3>
                      <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">Status:</span>
                          <button 
                              type="button" 
                              onClick={() => setFlashDeal({...flashDeal, isActive: !flashDeal.isActive})} 
                              className={`w-12 h-6 rounded-full transition-colors relative ${flashDeal.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${flashDeal.isActive ? 'left-7' : 'left-1'}`}></div>
                          </button>
                      </div>
                  </div>
                  
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveFlashDeal(); }} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className={labelClass}>Waktu Berakhir (Countdown)</label>
                              <input 
                                  type="datetime-local" 
                                  value={flashDeal.endTime || ''} 
                                  onChange={e => setFlashDeal({...flashDeal, endTime: e.target.value})} 
                                  className={inputClass} 
                              />
                          </div>
                          <div>
                              <label className={labelClass}>Label Diskon (Global)</label>
                              <input 
                                  type="text" 
                                  placeholder="Contoh: 50%" 
                                  value={flashDeal.discountLabel || ''} 
                                  onChange={e => setFlashDeal({...flashDeal, discountLabel: e.target.value})} 
                                  className={inputClass} 
                              />
                          </div>
                      </div>

                      <div>
                          <label className={labelClass}>Pilih Produk Flash Deal</label>
                          <div className={`h-60 overflow-y-auto border rounded-xl p-2 ${isDarkMode ? 'border-slate-600 bg-slate-900' : 'border-gray-200 bg-gray-50'}`}>
                              {allProducts.length === 0 ? (
                                  <p className="text-center text-gray-500 text-xs py-4">Memuat produk...</p>
                              ) : (
                                  allProducts.map(product => (
                                      <div key={product.id} className={`flex items-center gap-3 p-2 border-b last:border-0 ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                                          <input 
                                              type="checkbox" 
                                              checked={flashDeal.selectedProducts?.[product.id] ? true : false}
                                              onChange={(e) => {
                                                  const newSelected = { ...(flashDeal.selectedProducts || {}) };
                                                  if (e.target.checked) {
                                                      newSelected[product.id] = true;
                                                  } else {
                                                      delete newSelected[product.id];
                                                  }
                                                  setFlashDeal({...flashDeal, selectedProducts: newSelected});
                                              }}
                                              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                                          />
                                          <div className="w-10 h-10 rounded overflow-hidden bg-gray-200 flex-shrink-0">
                                              <img src={product.mediaUrl} className="w-full h-full object-cover" alt="" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                              <p className={`text-xs font-bold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{product.name}</p>
                                              <p className="text-[10px] text-gray-500">Rp {parseInt(product.price).toLocaleString('id-ID')}</p>
                                          </div>
                                      </div>
                                  ))
                              )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">*Produk yang diceklis akan muncul di section Flash Deal Home.</p>
                      </div>

                      <button type="submit" className="w-full py-3 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-lg shadow-sky-200 dark:shadow-none">
                          Simpan Pengaturan Flash Deal
                      </button>
                  </form>
              </div>
              )}
              
                {/* Identitas Rekber */}
                {settingsView === 'rekber' && (
                <div className={`p-6 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
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
                )}

                {/* Pengaturan Tarif NiagaGo */}
                {settingsView === 'niagago' && (
                <div className={`p-6 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
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
                )}

                {/* Pengaturan Event Kompetisi (Sobat Juara) */}
                {settingsView === 'competition' && (
                <div className={`p-6 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Trophy size={20} className="text-yellow-500"/> Pengaturan Event 'Sobat Juara'</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">Status Event:</span>
                            <button 
                                type="button" 
                                onClick={() => setCompetitionSettings({...competitionSettings, isActive: !competitionSettings.isActive})} 
                                className={`w-12 h-6 rounded-full transition-colors relative ${competitionSettings.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${competitionSettings.isActive ? 'left-7' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSaveCompetition} className="space-y-6">
                        {/* Parameter Utama */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className={labelClass}>Biaya Tiket (Rp)</label>
                                <input type="number" value={competitionSettings.ticketPrice} onChange={e => setCompetitionSettings({...competitionSettings, ticketPrice: parseInt(e.target.value)})} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Target Kuota Peserta</label>
                                <input type="number" value={competitionSettings.quota} onChange={e => setCompetitionSettings({...competitionSettings, quota: parseInt(e.target.value)})} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Periode Event</label>
                                <div className="flex gap-2">
                                    <input type="date" value={competitionSettings.startDate} onChange={e => setCompetitionSettings({...competitionSettings, startDate: e.target.value})} className={`${inputClass} text-xs`} />
                                    <input type="date" value={competitionSettings.endDate} onChange={e => setCompetitionSettings({...competitionSettings, endDate: e.target.value})} className={`${inputClass} text-xs`} />
                                </div>
                            </div>
                        </div>

                        {/* Hadiah */}
                        <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-yellow-50 border-yellow-100'}`}>
                            <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><Crown size={16} className="text-yellow-600"/> Alokasi Hadiah</h4>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold mb-1 block">Juara 1</label>
                                    <input type="number" value={competitionSettings.prizes?.first} onChange={e => setCompetitionSettings({...competitionSettings, prizes: {...competitionSettings.prizes, first: parseInt(e.target.value)}})} className={inputClass} placeholder="Rp" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold mb-1 block">Juara 2</label>
                                    <input type="number" value={competitionSettings.prizes?.second} onChange={e => setCompetitionSettings({...competitionSettings, prizes: {...competitionSettings.prizes, second: parseInt(e.target.value)}})} className={inputClass} placeholder="Rp" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold mb-1 block">Juara 3</label>
                                    <input type="number" value={competitionSettings.prizes?.third} onChange={e => setCompetitionSettings({...competitionSettings, prizes: {...competitionSettings.prizes, third: parseInt(e.target.value)}})} className={inputClass} placeholder="Rp" />
                                </div>
                            </div>
                        </div>

                        {/* Live Leaderboard */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className={labelClass}>Live Leaderboard (Top 5)</label>
                                <button type="button" onClick={handleResetCompetition} className="text-xs text-red-500 font-bold hover:underline flex items-center gap-1">
                                    <Target size={14}/> Reset & Kick-off Bulan Baru
                                </button>
                            </div>
                            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-200'}`}>
                                <table className="w-full text-xs text-left">
                                    <thead className={`uppercase ${isDarkMode ? 'bg-slate-800 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>
                                        <tr>
                                            <th className="px-4 py-2">Rank</th>
                                            <th className="px-4 py-2">Toko</th>
                                            <th className="px-4 py-2">Poin</th>
                                            <th className="px-4 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                                        {sellers.filter(s => s.isCompetitor).sort((a, b) => (b.points_event || 0) - (a.points_event || 0)).slice(0, 5).map((s, idx) => (
                                            <tr key={s.uid}>
                                                <td className="px-4 py-2 font-bold">#{idx + 1}</td>
                                                <td className="px-4 py-2">{s.storeName}</td>
                                                <td className="px-4 py-2 font-mono text-yellow-600 font-bold">{Math.floor(s.points_event || 0)}</td>
                                                <td className="px-4 py-2">
                                                    {s.hasPaidTicket ? <span className="text-green-500 font-bold">Paid</span> : <span className="text-gray-400">Free</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {sellers.filter(s => s.isCompetitor).length === 0 && (
                                            <tr><td colSpan="4" className="px-4 py-4 text-center text-gray-500">Belum ada peserta.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-3 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-lg shadow-sky-200 dark:shadow-none">
                            Simpan Pengaturan Event
                        </button>
                    </form>
                </div>
                )}

                {/* Editor Halaman Statis (CMS) */}
                {['about', 'terms', 'privacy', 'help'].includes(settingsView) && (
                <div className={`p-6 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        {settingsView === 'about' && <><Info size={20} className="text-sky-500"/> Edit Tentang Kami</>}
                        {settingsView === 'terms' && <><FileText size={20} className="text-orange-500"/> Edit Syarat & Ketentuan</>}
                        {settingsView === 'privacy' && <><Lock size={20} className="text-green-500"/> Edit Kebijakan Privasi</>}
                        {settingsView === 'help' && <><HelpCircle size={20} className="text-purple-500"/> Edit Pusat Bantuan</>}
                    </h3>
                    <form onSubmit={(e) => { e.preventDefault(); handleSavePage(settingsView, e.target.elements.content.value); }} className="space-y-4">
                        <div>
                            <label className={labelClass}>Konten Halaman (Support HTML)</label>
                            <textarea 
                                name="content"
                                defaultValue={pagesContent[settingsView] || ''}
                                className={`w-full p-4 rounded-xl border outline-none text-sm transition-all min-h-[300px] font-mono ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white focus:border-sky-500' : 'bg-gray-50 border-gray-200 focus:border-sky-500'}`}
                                placeholder="Tulis konten di sini... Gunakan tag <p>, <b>, <br> untuk format."
                            ></textarea>
                        </div>
                        <button type="submit" className="w-full py-3 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-lg shadow-sky-200 dark:shadow-none">Simpan Perubahan</button>
                    </form>
                </div>
                )}
                </>
              )}
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
                  {/* <div className="flex justify-between border-b dark:border-slate-700 pb-2">
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
                   <div className="flex justify-between"> */}
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
                <div className={`p-3 rounded-2xl border ${isDarkMode ? 'bg-slate-700/30 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
                  <p className="text-xs font-bold mb-3 text-gray-500 uppercase tracking-wider ml-1">Foto KTM / KTP</p>
                  <div className={`w-full h-56 rounded-xl overflow-hidden border flex items-center justify-center cursor-pointer group relative shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`} onClick={() => setSelectedImage(selectedDriverRequest.ktmUrl)}>
                    <img src={selectedDriverRequest.ktmUrl} alt="KTM" className="w-full h-full object-contain p-2" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>

                {/* Data Driver */}
                <div className={`p-5 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                  <h4 className={`text-sm font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Informasi Pendaftar</h4>
                  <div className="space-y-4">
                    
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-full flex-shrink-0 ${isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                            <User size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Nama Lengkap</p>
                            <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedDriverRequest.name}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-full flex-shrink-0 ${isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                            <Mail size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Email</p>
                            <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedDriverRequest.email}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-full flex-shrink-0 ${isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                            <Bike size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Plat Nomor</p>
                            <p className={`text-sm font-bold font-mono uppercase ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedDriverRequest.plateNumber || '-'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-full flex-shrink-0 ${isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                            <MessageCircle size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">WhatsApp</p>
                            <a 
                                href={`https://wa.me/${selectedDriverRequest.phone.replace(/^0/, '62')}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-sm font-bold text-green-500 hover:underline flex items-center gap-1"
                            >
                                {selectedDriverRequest.phone}
                            </a>
                        </div>
                    </div>

                  </div>
                </div>
              </div>
              </div>
          
            {/* Footer Actions */}
            <div className="p-4 border-t dark:border-slate-700 flex gap-3 bg-gray-50 dark:bg-slate-800/50">
              <button 
                onClick={() => { handleRejectDriver(selectedDriverRequest); setSelectedDriverRequest(null); }} 
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-500/20 transition-colors"
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
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
              <h3 className="font-bold text-base">Pencairan Dana Seller</h3>
              <button onClick={() => setPayoutModal(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"><X size={20}/></button>
              </div>
            
            <form onSubmit={handleProcessPayout} className="p-5 space-y-3">
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-[10px] text-gray-500 mb-0.5 font-bold uppercase tracking-wider">Saldo Tersedia</p>
                <p className="text-xl font-bold font-mono text-green-600">Rp {(payoutModal.balance || 0).toLocaleString('id-ID')}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 truncate">{payoutModal.storeName || payoutModal.displayName}</p>
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block text-gray-500">Nominal Pencairan</label>
                <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold text-xs">Rp</span>
                    <input 
                        type="number" 
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        className={`w-full pl-9 pr-4 py-2 rounded-xl border outline-none font-bold text-sm ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-200 text-gray-800'}`}
                        placeholder="0"
                        autoFocus
                    />
                </div>
              </div>

              <div className="flex justify-end">
                <button 
                    type="button"
                    onClick={() => setPayoutAmount(payoutModal.balance || 0)}
                    className="text-[10px] font-bold text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200 transition-colors"
                >
                    ⚡ Cairkan Semua
                </button>
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                    type="button"
                    onClick={() => setPayoutModal(null)}
                    className="flex-1 py-2 rounded-xl border font-bold text-xs hover:bg-gray-50 transition-colors dark:border-slate-600 dark:hover:bg-slate-700"
                >
                    Batal
                </button>
                <button 
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-green-600 text-white font-bold text-xs hover:bg-green-700 shadow-sm transition-colors"
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