import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Upload, Plus, Edit, Trash2, Package, DollarSign, Award, TrendingUp, Image as ImageIcon, Video, Loader2, MoreHorizontal, Users, Calendar, Tag, Sparkles, Lock, CheckCircle, CreditCard, X, Trophy, Timer, Save, Info, Gamepad2, Menu, ChevronDown, ChevronUp, Settings, HelpCircle, Megaphone, Eye, ListOrdered, Wallet, BarChart2, Grid, PlusSquare, RotateCcw, ShoppingBag, Store, ChevronRight, XCircle } from 'lucide-react';
import { db } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { ref, get, set, push, remove, onValue, query, orderByChild, equalTo, update } from 'firebase/database';
import confetti from 'canvas-confetti';
import SellerVerification from './SellerVerification';
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

// Registrasi Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const calculateAdminFee = (amount, isCompetitor = false) => {
  if (!isCompetitor) return 2000; // Flat fee for non-competitors

  if (amount < 50000) return 2000;
  if (amount <= 250000) return 5000;
  
  // > 250k: 1% (Max 20k)
  const fee = amount * 0.01;
  return Math.min(fee, 20000);
};

const DashboardSeller = ({ user, onBack }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [isVerifiedSeller, setIsVerifiedSeller] = useState(false);
  const [sellerInfo, setSellerInfo] = useState(null);
  
  // State Produk & Form
  const [products, setProducts] = useState([]); // State untuk menyimpan daftar produk
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
        fieldInputType: 'ID Only', // nilai default
    stock: '',
    category: 'Makan', // Default Category
    subCategory: '', // Sub-Kategori Dinamis
    skinProblem: '', // Masalah Kulit (Skin Care)
    estimation: '', // Estimasi Pengerjaan (Jasa)
    serviceType: '', // Metode Pengiriman Jasa
    voucherCode: '', // Kode Voucher Penjual
    voucherAmount: '', // Nominal Potongan
    isActive: true, // Status Produk (Aktif/Arsip)
  });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState('image');
  const [isUploading, setIsUploading] = useState(false);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const toLocalISO = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };
    return { startDate: toLocalISO(start), endDate: toLocalISO(end) };
  });
  const [sellerOrders, setSellerOrders] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]); // State Riwayat Penarikan
  const [incomingOrdersCount, setIncomingOrdersCount] = useState(0);
  const [saldoTertahan, setSaldoTertahan] = useState(0);
  const [saldoSiapCair, setSaldoSiapCair] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlySalesCount, setMonthlySalesCount] = useState(0);
  const [monthlyQty, setMonthlyQty] = useState(0); // Track Total Barang Terjual
  const [leaderboard, setLeaderboard] = useState([]);
  const [daysLeft, setDaysLeft] = useState(0);
  const [compSettings, setCompSettings] = useState({ isActive: false, startDate: '', endDate: '' });
  const prevIncomingCountRef = useRef(0);
  const isFirstLoad = useRef(true);
  const isCompetitorRef = useRef(false); // Ref untuk akses status di dalam listener
  
  // State Pembayaran Toko
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    bankName: '', bankAccount: '', accountHolder: '', qrisUrl: ''
  });
  const [qrisFile, setQrisFile] = useState(null);
  const [qrisPreview, setQrisPreview] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null); // State Mode Edit
  const [selectedWithdrawalProof, setSelectedWithdrawalProof] = useState(null); // State Modal Bukti Transfer
  const [mobileView, setMobileView] = useState('menu'); // 'menu', 'add_product', 'product_list', 'finance', 'stats', 'orders'
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChartExpanded, setIsChartExpanded] = useState(false); // Default collapsed di HP
  const [chartFilter, setChartFilter] = useState('1W'); // '1D', '1W', '1M', 'ALL'
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load data seller saat komponen di-mount
  useEffect(() => {
    if (user?.uid) {
      // 1. Cek Status Seller (REALTIME LISTENER)
      const sellerRef = ref(db, `users/${user.uid}/sellerInfo`);
      const compRef = ref(db, 'admin/competitionSettings');

      const unsubscribeSeller = onValue(sellerRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setIsVerifiedSeller(data.isVerifiedSeller || false);
          setSellerInfo(data);
          isCompetitorRef.current = data.isCompetitor || false; // Sync Ref
          setSaldoSiapCair(data.balance || 0); // Real-time Balance dari TransactionHistory
          
          // Sync Progress Bar & Stats dari Database (Bukan Hitung Manual)
          setMonthlyRevenue(data.competitionRevenue || 0);
          setMonthlyQty(data.competitionQty || 0);

          // Load Payment Details jika ada
          if (data.paymentDetails) {
            setPaymentForm({
              bankName: data.paymentDetails.bankName || '',
              bankAccount: data.paymentDetails.bankAccount || '',
              accountHolder: data.paymentDetails.accountHolder || '',
              qrisUrl: data.paymentDetails.qrisUrl || ''
            });
            setQrisPreview(data.paymentDetails.qrisUrl || null);
          }
        }
      });

      const unsubscribeComp = onValue(compRef, (snapshot) => {
        if (snapshot.exists()) {
          setCompSettings(snapshot.val());
        }
      });

      // 1.5 Load Leaderboard dari Users (Biar Sinkron sama Reset)
      const usersRef = ref(db, 'users');
      const unsubscribeUsers = onValue(usersRef, (snap) => {
        const usersData = snap.val();
        if (usersData) {
            const sellers = Object.values(usersData).filter(u => u.sellerInfo && u.sellerInfo.isCompetitor).map(u => u.sellerInfo);
            // Sort by points_event (Poin Kompetisi)
            const sorted = sellers.sort((a, b) => (b.points_event || 0) - (a.points_event || 0)).slice(0, 5);
            setLeaderboard(sorted.map(s => ({ name: s.storeName, revenue: s.competitionRevenue || 0, qty: s.competitionQty || 0, points: s.points_event || 0 })));
        }
      });

      // 2. Load Produk Realtime (Query dari Global Products by sellerId)
      const productsRef = query(ref(db, 'products'), orderByChild('sellerId'), equalTo(user.uid));
      const unsubscribeProducts = onValue(productsRef, (snap) => {
        const prodData = snap.val();
        const loadedProducts = prodData ? Object.keys(prodData).map(key => ({ id: key, ...prodData[key] })) : [];
        // Sort by createdAt descending (Terbaru paling atas)
        setProducts(loadedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      });

      // 3. Load Pesanan Masuk (Filter client-side sederhana)
      const ordersRef = ref(db, 'orders');
      const unsubscribeOrders = onValue(ordersRef, (snap) => {
        const orderData = snap.val();
        if (orderData) {
            const myOrders = Object.keys(orderData)
                .map(key => ({ id: key, ...orderData[key] }))
                // Cek apakah order mengandung item dari seller ini
                .filter(order => {
                    if (!order.items) return false;
                    const itemsArray = Array.isArray(order.items) ? order.items : Object.values(order.items);
                    return itemsArray.some(item => item && item.sellerId === user.uid);
                });
            
            // Sort: Prioritaskan 'processed' (Perlu Dikirim), lalu tanggal terbaru
            myOrders.sort((a, b) => {
                if (a.status === 'processed' && b.status !== 'processed') return -1;
                if (a.status !== 'processed' && b.status === 'processed') return 1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            setSellerOrders(myOrders);

            // Hitung Pesanan yang "Perlu Dikirim" (Processed)
            const processedCount = myOrders.filter(o => o.status === 'processed').length;

            // Hitung Saldo Virtual (Rekber Logic)
            // Saldo Tertahan: Pesanan 'Proses', 'Dikirim', atau 'Selesai' (tapi belum dicairkan Admin)
            // UPDATE: Hanya 'processed' dan 'shipped'. Kalau 'completed', masuk ke Siap Cair (Balance).
            const pendingAmount = myOrders
              .filter(o => ['processed', 'shipped'].includes(o.status))
              .reduce((acc, curr) => acc + (curr.totalPrice || 0), 0);
            setSaldoTertahan(pendingAmount);

            // --- LOGIKA MONTHLY CHALLENGE ---
            if (compSettings.isActive && compSettings.startDate && compSettings.endDate) {
              const start = new Date(compSettings.startDate);
              const end = new Date(compSettings.endDate);
              const now = new Date();
              
              // 1. Hitung Sisa Hari
              const diffTime = end - now;
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              setDaysLeft(diffDays > 0 ? diffDays : 0);

              // 2. Hitung Pendapatan (Sekarang ambil dari sellerInfo di atas, jadi blok ini bisa dihapus atau dikosongkan)
              const thisMonthOrders = myOrders.filter(o => {
                const d = new Date(o.createdAt);
                return d >= start && d <= end && ['processed', 'shipped', 'completed'].includes(o.status);
              });
              setMonthlySalesCount(thisMonthOrders.length); // Sales Count tetap dari order history lokal
            }
            
            // Notifikasi Real-time (Bunyi Ting!)
            if (!isFirstLoad.current && processedCount > prevIncomingCountRef.current) {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play().catch(e => console.log("Audio play failed", e));
                
                Swal.fire({
                    title: 'Ting! Pesanan Baru Masuk 📦',
                    text: 'Ada pesanan yang sudah diverifikasi admin. Segera kirim ya!',
                    icon: 'success',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 4000,
                    background: '#f0fdf4',
                    color: '#166534'
                });
            }

            setIncomingOrdersCount(processedCount);
            prevIncomingCountRef.current = processedCount;
            isFirstLoad.current = false;
        } else {
            setSellerOrders([]);
            setIncomingOrdersCount(0);
        }
      });

      // 4. Load Riwayat Penarikan (Withdrawals)
      const withdrawalsRef = query(ref(db, 'withdrawals'), orderByChild('sellerId'), equalTo(user.uid));
      const unsubscribeWithdrawals = onValue(withdrawalsRef, (snap) => {
        const data = snap.val();
        const loaded = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        setWithdrawals(loaded.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      });

      return () => {
        unsubscribeSeller();
        unsubscribeProducts();
        unsubscribeOrders();
        unsubscribeComp();
        unsubscribeWithdrawals();
        unsubscribeUsers();
      };
    }
  }, [user, compSettings.isActive, compSettings.startDate, compSettings.endDate]);

  // Fungsi Upload ke Cloudinary
  const uploadToCloudinary = async (file) => {
    const cloudName = 'djqnnguli';
    const apiKey = '156244598362341';
    const apiSecret = 'INGJr-KgmBPNwqwBYFZy9w7Fa18';
    
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    // Generate Signature
    const params = { folder: 'sobatniaga/products', timestamp: timestamp };
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
    formData.append('folder', 'sobatniaga/products');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');
    
    // Auto-Compress: Quality Auto & Format Auto
    return { url: data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/'), type: type };
  };

  // Callback function dari SellerVerification
  const handleVerificationSuccess = (sellerData) => {
    setIsVerifiedSeller(true);
    setSellerInfo(sellerData);
  };

  // Handle File Select (Image Picker Estetik)
  const handleMediaChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
      setMediaType(type);
    }
  };

  // Handle Simpan / Update Produk
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setIsUploading(true);

    if (parseInt(productForm.price) < 10000) {
        Swal.fire({ icon: 'warning', title: 'Harga Terlalu Rendah', text: 'Minimal harga produk adalah Rp 10.000 agar sesuai dengan kebijakan biaya admin.' });
        setIsUploading(false);
        return;
    }

    try {
      // Gunakan media lama jika tidak ada file baru yang diupload saat edit
      let mediaData = { url: productForm.mediaUrl || '', type: productForm.mediaType || 'image' };
      
      if (mediaFile) {
        mediaData = await uploadToCloudinary(mediaFile);
      }

      const productData = {
        ...productForm,
        mediaUrl: mediaData.url,
        mediaType: mediaData.type,
        voucherAmount: productForm.voucherAmount ? parseInt(productForm.voucherAmount) : 0, // Ensure number
        // --- LOGIKA INPUT FIELDS GAME ---
        fieldInputType: productForm.fieldInputType || 'ID Only', // Tambahkan tipe input
        inputFields: (() => {
          if (productForm.category === 'Game') {
            switch (productForm.subCategory) {
              case 'Mobile Legends': return ['userId', 'zoneId'];
              case 'Free Fire': return ['userId']; // Label: Player ID
              case 'Valorant': return ['riotId']; // Label: Riot ID
              case 'PUBG Mobile': return ['userId']; // Label: Character ID
              case 'Genshin Impact': return ['userId', 'server'];
              case 'Arena of Valor': return ['userId'];
              default: return ['userId'];
            }
          }
          return null;
        })(),
        sellerId: user.uid, // Penting buat query
        storeName: sellerInfo?.storeName || 'Toko',
        updatedAt: new Date().toISOString(),
        isActive: productForm.isActive !== undefined ? productForm.isActive : true
      };

      if (editingProductId) {
        // Mode Update
        await update(ref(db, `products/${editingProductId}`), productData);
        Swal.fire({ icon: 'success', title: 'Produk Diperbarui!', timer: 1500, showConfirmButton: false });
        setEditingProductId(null);
      } else {
        // Mode Create
        productData.createdAt = new Date().toISOString();
        await push(ref(db, 'products'), productData);
        Swal.fire({ icon: 'success', title: 'Produk Ditambahkan!', timer: 1500, showConfirmButton: false });
      }

      // Reset Form
      setProductForm({ name: '', description: '', price: '', stock: '', category: 'Makan', subCategory: '', skinProblem: '', estimation: '', serviceType: '', voucherCode: '', voucherAmount: '', isActive: true });
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType('image');

    } catch (error) {
      Swal.fire({ icon: 'error', title: 'Gagal', text: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Klik Tombol Edit (Isi Form)
  const handleEditClick = (product) => {
    setEditingProductId(product.id);
    setProductForm({
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        category: product.category,
        subCategory: product.subCategory || '',
        skinProblem: product.skinProblem || '',
        estimation: product.estimation || '',
        fieldInputType: product.fieldInputType || 'ID Only', // penting
        serviceType: product.serviceType || '',
        voucherCode: product.voucherCode || '',
        voucherAmount: product.voucherAmount || '',
        isActive: product.isActive !== undefined ? product.isActive : true,
        mediaUrl: product.mediaUrl, // Simpan URL lama
        mediaType: product.mediaType
    });
    setMediaPreview(product.mediaUrl);
    setMediaType(product.mediaType || 'image');
    setMediaFile(null);
    
    // Scroll ke atas biar user sadar form sudah terisi
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle Batal Edit
  const handleCancelEdit = () => {
    setEditingProductId(null);
    setProductForm({ name: '', description: '', price: '', stock: '', category: 'Makan', subCategory: '', skinProblem: '', estimation: '', serviceType: '', voucherCode: '', voucherAmount: '', isActive: true });
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType('image');
  };

  // Handle Redeem Fitur Video
  const handleRedeemVideo = async () => {
    const currentPoints = sellerInfo?.points_loyalty || 0;
    if (currentPoints < 50) return;

    // Animasi Confetti
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#0ea5e9', '#fbbf24', '#ffffff']
    });

    try {
      await update(ref(db, `users/${user.uid}/sellerInfo`), {
        canUploadVideo: true
      });
      
      Swal.fire({
        icon: 'success',
        title: 'Selamat! Fitur Video Terbuka! 🎥',
        text: 'Sekarang kamu bisa upload video produk untuk menarik pembeli.',
        confirmButtonColor: '#0ea5e9'
      });
    } catch (error) {
      console.error("Error redeeming:", error);
    }
  };

  // Handle Redeem Badge
  const handleRedeemBadge = async () => {
    const currentPoints = sellerInfo?.points_loyalty || 0;
    if (currentPoints < 100) return;

    // Animasi Confetti
    confetti({
      particleCount: 200,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#3b82f6', '#60a5fa', '#ffffff']
    });

    try {
      await update(ref(db, `users/${user.uid}/sellerInfo`), {
        isTrustedSeller: true
      });
      
      Swal.fire({
        icon: 'success',
        title: 'Selamat! Toko Terpercaya! 🏅',
        text: 'Badge centang biru telah ditambahkan ke profil tokomu.',
        confirmButtonColor: '#3b82f6'
      });
    } catch (error) {
      console.error("Error redeeming badge:", error);
    }
  };

  // Handle Join Competition
  const handleJoinCompetition = async () => {
    Swal.fire({
      title: '🏆 PANDUAN LENGKAP: SOBATNIAGA MONTHLY RACE',
      width: '650px',
      html: `
        <div class="text-left text-sm text-gray-600 space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <p class="font-medium text-gray-800 text-center italic">"Tingkatkan Transaksi, Raih Predikat Top Seller, dan Bawa Pulang Hadiahnya!"</p>
          <p>Selamat datang di ajang bulanan paling bergengsi untuk para Seller SobatNiaga. Ini bukan cuma soal jualan, tapi soal siapa yang paling dipercaya oleh pelanggan!</p>

          <div>
            <h4 class="font-bold text-gray-800 flex items-center gap-2 mb-2">💰 HADIAH PEMENANG (TOTAL RP300.000)</h4>
            <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-100 space-y-2 text-xs">
              <p>🥇 <b>Juara 1:</b> Rp150.000 + Badge Golden Seller + Promo Banner Depan.</p>
              <p>🥈 <b>Juara 2:</b> Rp100.000 + Badge Silver Seller + Promo Banner Depan.</p>
              <p>🥉 <b>Juara 3:</b> Rp50.000 + Badge Bronze Seller.</p>
            </div>
          </div>

          <div>
            <h4 class="font-bold text-gray-800 flex items-center gap-2 mb-2">📊 ATURAN MAIN & SISTEM POIN</h4>
            <p class="mb-2 text-xs">Pemenang ditentukan berdasarkan Skor Kumulatif:</p>
            <table class="w-full text-xs border-collapse mb-2">
              <tr class="bg-gray-100"><th class="p-2 border text-left">Kategori</th><th class="p-2 border text-left">Perhitungan Poin</th></tr>
              <tr><td class="p-2 border">Omzet (Pendapatan)</td><td class="p-2 border">Setiap Rp10.000 = 1 Poin</td></tr>
              <tr><td class="p-2 border">Volume (Terjual)</td><td class="p-2 border">Setiap 1 Produk = 5 Poin</td></tr>
              <tr><td class="p-2 border">Loyalitas</td><td class="p-2 border">Target Tercapai = 10 Poin Bonus</td></tr>
            </table>
            <div class="text-xs italic bg-gray-50 p-2 rounded border border-gray-200">
              <b>Contoh:</b><br/>
              Seller A (1 HP Rp1jt) = 100 Poin.<br/>
              Seller B (50 Aksesoris Rp500rb) = 50 (Omzet) + 250 (Volume) = 300 Poin.<br/>
              <b>Pemenang: Seller B!</b>
            </div>
          </div>

          <div>
            <h4 class="font-bold text-gray-800 flex items-center gap-2 mb-2">📝 SYARAT & KETENTUAN PESERTA</h4>
            <ul class="list-disc pl-5 space-y-1 text-xs">
              <li><b>Target Minimal:</b> Pendapatan Rp500.000 & 10 Transaksi Sukses.</li>
              <li><b>Status Transaksi:</b> Hanya pesanan "Selesai" yang dihitung.</li>
              <li><b>Kuota Kompetisi:</b> Hadiah cair jika minimal 10 Seller aktif berkompetisi.</li>
            </ul>
          </div>

          <div class="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <h4 class="font-bold text-blue-800 flex items-center gap-2 mb-2">⚖️ Biaya Admin Khusus Peserta:</h4>
            <ul class="list-disc pl-5 space-y-1 text-blue-900 text-xs">
              <li>Transaksi &lt; Rp50.000: <b>Biaya Admin Rp2.000</b>.</li>
              <li>Transaksi Rp50.000 - Rp250.000: <b>Biaya Admin Rp5.000</b>.</li>
              <li>Transaksi &gt; Rp250.000: <b>Biaya Admin hanya 1% (Maksimal Rp20.000)</b>.</li>
            </ul>
          </div>

          <div>
            <h4 class="font-bold text-gray-800 mb-2">💡 KENAPA HARUS IKUT?</h4>
            <table class="w-full text-xs border-collapse text-center">
              <tr class="bg-gray-100">
                <th class="p-2 border">Fitur</th>
                <th class="p-2 border">Reguler</th>
                <th class="p-2 border bg-blue-50 text-blue-800">Peserta Race</th>
              </tr>
              <tr><td class="p-2 border text-left">Biaya Admin</td><td class="p-2 border">Flat Rp2.000</td><td class="p-2 border font-bold text-blue-600">Dinamis (Untung di Barang Mahal)</td></tr>
              <tr><td class="p-2 border text-left">Posisi Web</td><td class="p-2 border">Standar</td><td class="p-2 border font-bold text-blue-600">Prioritas Halaman Depan</td></tr>
              <tr><td class="p-2 border text-left">Hadiah Tunai</td><td class="p-2 border">-</td><td class="p-2 border font-bold text-blue-600">s/d Rp150.000</td></tr>
            </table>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#0ea5e9',
      confirmButtonText: 'Saya Setuju, Join!',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        await update(ref(db, `users/${user.uid}/sellerInfo`), { isCompetitor: true });
        Swal.fire('Berhasil Join!', 'Anda sekarang terdaftar sebagai peserta kompetisi.', 'success');
      }
    });
  };

  // Handle Hapus Produk
  const handleDeleteProduct = async (id) => {
    Swal.fire({
      title: 'Hapus Produk?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Hapus!'
    }).then(async (result) => {
      if (result.isConfirmed) {
        await remove(ref(db, `products/${id}`));
        Swal.fire('Terhapus!', '', 'success');
      }
    });
  };

  // Helper: Generate Resi Internal
  const generateResi = () => {
      const date = new Date();
      // Format: DDMMYY
      const dateString = ('0' + date.getDate()).slice(-2) +
                         ('0' + (date.getMonth() + 1)).slice(-2) +
                         date.getFullYear().toString().slice(-2);
      // Timestamp (Base36) 5 digit terakhir + 2 digit Random
      const uniqueTime = Date.now().toString(36).toUpperCase().slice(-5);
      const randomPart = Math.random().toString(36).substring(2, 4).toUpperCase();
      return `SN-${dateString}-${uniqueTime}${randomPart}`;
  };

  // Handle Proses Pesanan & Generate Resi
  const handleProcessOrder = async (orderId, isJasa = false) => {
    const newResi = isJasa ? 'JASA-INTERNAL' : generateResi();

    Swal.fire({
      title: isJasa ? 'Tandai Jasa Selesai?' : 'Proses & Kirim Pesanan?',
      html: isJasa 
        ? "Status akan diubah menjadi 'Menunggu Konfirmasi Pembeli'."
        : `Akan membuat No. Resi Internal: <br/><b class="font-mono text-lg text-sky-600">${newResi}</b><br/><p class="text-sm mt-2">Pastikan barang sudah siap dikirim.</p>`,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Ya, Lanjutkan',
      confirmButtonColor: '#0284c7',
      cancelButtonColor: '#6b7280',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await update(ref(db, `orders/${orderId}`), {
            status: 'shipped',
            resi: newResi,
            shippedAt: new Date().toISOString()
          });

          const order = sellerOrders.find(o => o.id === orderId);
          if (order) {
            await push(ref(db, 'notifications'), {
              userId: order.buyerId,
              title: isJasa ? 'Jasa Selesai Dikerjakan' : 'Paket Dikirim',
              message: isJasa ? `Seller menandai jasa selesai. Silakan cek hasil dan konfirmasi pesanan!` : `Paketmu sudah diserahkan ke kurir. Lacak dengan resi internal: ${newResi}`,
              type: 'info',
              targetView: 'history',
              targetTab: 'shipped',
              orderId: orderId,
              createdAt: new Date().toISOString(),
              isRead: false
            });
          }
          Swal.fire('Berhasil!', 'Status pesanan telah diupdate.', 'success');
        } catch (error) {
          console.error("Error processing order:", error);
          Swal.fire('Error', 'Gagal mengupdate status pesanan.', 'error');
        }
      }
    });
  };

  // Handle Lihat Riwayat Saldo
  const handleShowHistory = () => {
    const historyOrders = sellerOrders.filter(o => o.payoutCompleted);
    const historyHtml = historyOrders.length > 0 
        ? `<div class="space-y-2 text-left max-h-60 overflow-y-auto pr-1">
            ${historyOrders.map(o => `
                <div class="flex justify-between items-center border-b border-gray-100 pb-2">
                    <div>
                        <p class="text-xs text-gray-500">${new Date(o.payoutAt || Date.now()).toLocaleDateString('id-ID')}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-green-600">+ Rp ${(() => {
                            const items = Array.isArray(o.items) ? o.items : Object.values(o.items);
                            const revenue = items.filter(i => i.sellerId === user.uid).reduce((sum, item) => sum + (item.price * item.quantity), 0);
                            return (revenue - calculateAdminFee(revenue, isCompetitorRef.current)).toLocaleString('id-ID');
                        })()}</p>
                        <p class="text-[10px] text-gray-400">Sudah Cair</p>
                    </div>
                </div>
            `).join('')}
           </div>`
        : '<p class="text-gray-500 text-sm text-center py-4">Belum ada riwayat pencairan dana.</p>';

    Swal.fire({
        title: 'Riwayat Saldo Cair',
        html: historyHtml,
        showCancelButton: true,
        cancelButtonText: 'Tutup',
        confirmButtonText: 'Hubungi Admin (WA)',
        confirmButtonColor: '#0ea5e9',
        footer: '<div class="text-center"><p class="text-xs text-gray-400 mb-1">Dana "Siap Cair" adalah total yang sudah ditransfer Admin.</p><p class="text-[10px] text-orange-500 font-bold">⚠️ Pencairan saldo menggunakan kurs nasional. Biaya admin pihak ketiga (Bank/E-Wallet) ditanggung oleh Seller.</p></div>'
    }).then((result) => {
        if (result.isConfirmed) {
            const storeName = sellerInfo?.storeName || 'Toko Saya';
            const message = `Halo Admin SobatNiaga, saya Seller ${storeName} ingin mencairkan saldo Rp________.\n\n(Saya memahami bahwa biaya admin transfer antar bank/e-wallet ditanggung sepenuhnya oleh Seller dan akan dipotong langsung oleh pihak penyedia layanan).`;
            window.open(`https://wa.me/6289517587498?text=${encodeURIComponent(message)}`, '_blank');
        }
    });
  };

  // Handle Save Payment Settings
  const handleSavePaymentSettings = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      let finalQrisUrl = paymentForm.qrisUrl;

      if (qrisFile) {
        const uploadData = await uploadToCloudinary(qrisFile);
        finalQrisUrl = uploadData.url;
      }

      const updatedPaymentDetails = {
        bankName: paymentForm.bankName,
        bankAccount: paymentForm.bankAccount,
        accountHolder: paymentForm.accountHolder,
        qrisUrl: finalQrisUrl
      };

      await update(ref(db, `users/${user.uid}/sellerInfo/paymentDetails`), updatedPaymentDetails);
      
      setSellerInfo(prev => ({ ...prev, paymentDetails: updatedPaymentDetails }));
      setIsPaymentModalOpen(false);
      Swal.fire('Berhasil', 'Info pencairan dana berhasil disimpan!', 'success');
    } catch (error) {
      Swal.fire('Gagal', error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleQrisChange = (e) => {
    const file = e.target.files[0];
    if (file) { setQrisFile(file); setQrisPreview(URL.createObjectURL(file)); }
  };

  // Logic Grafik Real-time (Zeroing Data + Smart Date Filter)
  const chartData = useMemo(() => {
    const labels = [];
    const dataPoints = [];
    
    // Gunakan dateRange sebagai sumber kebenaran (Single Source of Truth)
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Cek apakah rentang waktu cuma 1 hari (Mode Harian/1D)
    const isSingleDay = start.getTime() >= new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();

    if (isSingleDay) {
        // Hourly Loop
        for(let i=0; i<24; i++) {
            labels.push(`${i}:00`);
            const hStart = new Date(start); hStart.setHours(i);
            const hEnd = new Date(start); hEnd.setHours(i, 59, 59, 999);
            
            const hourlyRevenue = sellerOrders.filter(o => {
                const d = new Date(o.createdAt);
                return d >= hStart && d <= hEnd && ['processed', 'shipped', 'completed'].includes(o.status);
            }).reduce((acc, order) => {
                const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
                const rev = items.filter(item => item.sellerId === user.uid).reduce((sum, i) => sum + (i.price * i.quantity), 0);
                return acc + rev;
            }, 0);
            dataPoints.push(hourlyRevenue);
        }
    } else {
        // Daily Loop
        const current = new Date(start);
    
        while (current <= end) {
            // Format Label Sumbu X (Mobile Optimized)
            let label = current.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            if (isMobile && chartFilter === '1W') {
                label = current.toLocaleDateString('id-ID', { weekday: 'short' }); // Sen, Sel, Rab
            }
            labels.push(label);

            const dayStart = new Date(current); dayStart.setHours(0,0,0,0);
            const dayEnd = new Date(current); dayEnd.setHours(23,59,59,999);

            const dailyRevenue = sellerOrders.filter(o => {
                const d = new Date(o.createdAt);
                return d >= dayStart && d <= dayEnd && ['processed', 'shipped', 'completed'].includes(o.status);
            }).reduce((acc, order) => {
                const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
                const rev = items.filter(item => item.sellerId === user.uid).reduce((sum, i) => sum + (i.price * i.quantity), 0);
                return acc + rev;
            }, 0);
            dataPoints.push(dailyRevenue);
            current.setDate(current.getDate() + 1);
        }
    }

    // Tentukan Warna Tren (Hari Ini vs Kemarin)
    const lastValue = dataPoints[dataPoints.length - 1];
    const prevValue = dataPoints[dataPoints.length - 2] || 0;
    const isUp = lastValue >= prevValue;
    // Warna Hijau (Cuan) Default
    const mainColor = isMobile ? '#10b981' : '#0ea5e9'; // Hijau di HP, Biru di Web
    const gradientStart = isMobile ? 'rgba(16, 185, 129, 0.2)' : 'rgba(14, 165, 233, 0.2)';
    const gradientEnd = isMobile ? 'rgba(16, 185, 129, 0)' : 'rgba(14, 165, 233, 0)';

    return {
      labels,
      datasets: [{
        label: 'Pendapatan Toko',
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
        tension: 0.3, // Smooth curve (Stockbit style)
        pointRadius: 3, // Tampilkan titik data sesuai request
        pointHoverRadius: 5,
        pointBackgroundColor: mainColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      }],
    };
  }, [sellerOrders, dateRange, user.uid, isMobile, chartFilter]);

  // Handle Filter Desktop (Minggu Ini / Bulan Ini)
  const handleDatePreset = (type) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    const toLocalISO = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    if (type === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Senin
        start.setDate(diff);
    } else if (type === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    setDateRange({ startDate: toLocalISO(start), endDate: toLocalISO(end) });
    setChartFilter(type === 'week' ? '1W' : '1M'); // Sync visual mobile filter
  };

  // Handle Filter Mobile (1D, 1W, 1M, ALL)
  const handleMobileFilter = (f) => {
    setChartFilter(f);
    const now = new Date();
    let start = new Date();
    let end = new Date();
    const toLocalISO = (d) => {
         const offset = d.getTimezoneOffset() * 60000;
         return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    if (f === '1D') {
        // Start = End = Today
    } else if (f === '1W') {
        start.setDate(now.getDate() - 6);
    } else if (f === '1M') {
        start.setDate(now.getDate() - 29);
    } else if (f === 'ALL') {
        start.setFullYear(now.getFullYear() - 1);
    }
    setDateRange({ startDate: toLocalISO(start), endDate: toLocalISO(end) });
  };

  const totalRevenueForPeriod = useMemo(() => {
      if (!chartData?.datasets?.[0]?.data) return 0;
      return chartData.datasets[0].data.reduce((a, b) => a + b, 0);
  }, [chartData]);

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
        grid: { display: false, drawBorder: false },
        ticks: { font: { size: 10 }, color: isDarkMode ? '#9ca3af' : '#9ca3af', maxTicksLimit: 6, maxRotation: 0 }
      },
      y: {
        display: true, // Tampilkan Sumbu Y di Desktop & Mobile
        grid: { display: !isMobile, drawBorder: false, color: isDarkMode ? '#334155' : '#f1f5f9', borderDash: [4, 4] },
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
  }), [isDarkMode, isMobile]);

  // Helper untuk format tanggal di HP
  const getMobileDateDisplay = () => {
    const now = new Date();
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    
    if (chartFilter === '1D') {
        return now.toLocaleDateString('id-ID', options);
    } else if (chartFilter === '1W') {
        const start = new Date();
        start.setDate(now.getDate() - 6);
        return `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString('id-ID', options)}`;
    } else if (chartFilter === '1M') {
        return now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else {
        return now.getFullYear();
    }
  };

  const points = sellerInfo?.points_loyalty || 0; // Poin Seller (Loyalitas)

  // Logic Saklar Otomatis (Date Range + Active Status)
  const statusKompetisi = useMemo(() => {
    if (!compSettings.isActive) return false;
    
    // Cek Tanggal Otomatis
    if (compSettings.startDate && compSettings.endDate) {
        const now = new Date();
        const start = new Date(compSettings.startDate);
        start.setHours(0, 0, 0, 0); // Reset ke 00:00 waktu lokal
        
        const end = new Date(compSettings.endDate);
        end.setHours(23, 59, 59, 999); // Sampai akhir hari waktu lokal
        return now >= start && now <= end;
    }
    
    return compSettings.isActive;
  }, [compSettings]);

  // Helper Status Badge (Biar warna-warni sesuai status)
  const getOrderStatusBadge = (status) => {
    switch (status) {
      case 'waiting_payment': return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold">Belum Bayar</span>;
      case 'waiting_verification': return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold">Verifikasi Admin</span>;
      case 'processed': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">Perlu Dikirim</span>;
      case 'shipped': return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">Dikirim</span>;
      case 'completed': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Selesai</span>;
      case 'cancelled': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold">Batal</span>;
      default: return <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  // Handle Back Button di Mobile
  const handleMobileBack = () => {
    if (mobileView !== 'menu') {
      setMobileView('menu');
    } else {
      onBack();
    }
  };

  return (
    <div className={`min-h-screen pb-20 font-sans transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      {/* Header Biru Muda - Konsisten */}
      {mobileView !== 'stats' && (
      <div className={`shadow-sm sticky top-0 z-50 border-b transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-sky-100 border-sky-200'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={window.innerWidth < 768 ? handleMobileBack : onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-sky-600'}`}>
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-2 flex-1">
              <h1 className={`text-lg md:text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                {mobileView === 'menu' ? (sellerInfo?.storeName || 'Toko Anda') : 
                 mobileView === 'add_product' ? 'Tambah Produk' :
                 mobileView === 'product_list' ? 'Produk Saya' :
                 mobileView === 'finance' ? 'Keuangan' :
                 mobileView === 'stats' ? 'Statistik' : 'Pesanan'}
              </h1>
              {sellerInfo?.isTrustedSeller && <CheckCircle size={20} className="text-blue-500 fill-blue-100" />}
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4 md:space-y-6">
        {/* Kondisi: Belum Verifikasi */}
        {!isVerifiedSeller && (
          <SellerVerification user={user} onVerificationSuccess={handleVerificationSuccess} />
        )}

        {/* Kondisi: Sudah Verifikasi */}
        {isVerifiedSeller && (
          <div className="space-y-6">

            {/* Banner Join Competition (Jika Belum Join) */}
            {statusKompetisi && !sellerInfo?.isCompetitor && (
              <div className="bg-gradient-to-r from-indigo-900 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in duration-700">
                <div className="relative z-10">
                  <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Trophy className="text-yellow-400" /> SobatNiaga Monthly Race</h2>
                  <p className="text-indigo-200 text-sm">Jadilah Top Seller dan menangkan Total Hadiah <strong>Rp 300.000</strong> + Promosi Gratis!</p>
                </div>
                <button onClick={handleJoinCompetition} className="relative z-10 bg-yellow-400 text-indigo-900 px-6 py-3 rounded-xl font-bold hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-400/20 whitespace-nowrap">
                  Join Kompetisi
                </button>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
              </div>
            )}

            {/* 0. Event Card (Competition Banner) */}
            {statusKompetisi && sellerInfo?.isCompetitor && (
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden animate-in fade-in duration-700">
              <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="text-yellow-300" size={24} />
                    <h2 className="text-xl font-bold">🔥 EVENT SEDANG BERLANGSUNG! 🔥</h2>
                  </div>
                  <p className="text-indigo-100 text-sm mb-4">
                    Rumus Skor: <b>(Omzet / 10rb) + (Qty x 5)</b>. Kejar target <b>Rp 500.000</b> & 10 Transaksi!
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full max-w-md">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Progress Anda</span>
                      <span>{Math.min((monthlyRevenue / 500000) * 100, 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-black/20 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-yellow-400 h-full rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.min((monthlyRevenue / 500000) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs mt-1 text-indigo-200">
                      <span>Rp {monthlyRevenue.toLocaleString('id-ID')}</span>
                      <span>Target: Rp 500.000</span>
                    </div>
                    {monthlyRevenue >= 500000 && monthlySalesCount >= 10 && (
                      <div className="mt-2 bg-green-500/20 border border-green-400/50 text-green-100 px-3 py-1 rounded-lg text-xs font-bold inline-block">
                        🎉 Selamat! Anda masuk kualifikasi reward!
                      </div>
                    )}
                  </div>
                </div>

                {/* Countdown & Leaderboard Mini */}
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20 min-w-[200px]">
                  <div className="flex items-center gap-2 text-sm font-bold mb-3"><Timer size={16}/> Sisa Waktu: {daysLeft} Hari</div>
                  <div className="text-xs space-y-2">
                    <p className="font-bold text-yellow-300 border-b border-white/10 pb-1">🏆 Live Leaderboard</p>
                    {leaderboard.map((l, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{idx + 1}. {l.name}</span>
                        <span className="font-mono font-bold text-yellow-200">{Math.floor(l.points)} Poin</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* --- MOBILE DASHBOARD MENU (Shopee Style) --- */}
            <div className={`md:hidden ${mobileView === 'menu' ? 'block' : 'hidden'}`}>
                {/* 1. Header Card */}
                <div className="bg-gradient-to-r from-sky-600 to-blue-600 rounded-xl p-4 text-white mb-4 shadow-lg relative overflow-hidden">
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center border border-white/30">
                            <Store size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg leading-tight">{sellerInfo?.storeName}</h2>
                            <p className="text-xs text-sky-100 flex items-center gap-1"><Users size={10}/> {points} Pengikut</p>
                        </div>
                    </div>
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-white/5 skew-x-12 transform translate-x-8"></div>
                </div>

                {/* 2. Order Status Row */}
                <div className={`rounded-xl p-4 shadow-sm border mb-4 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className={`text-xs font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Status Pesanan</h3>
                        <button onClick={() => setMobileView('orders')} className="text-[10px] text-gray-500 flex items-center gap-1">Riwayat <ChevronRight size={12}/></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div onClick={() => setMobileView('orders')} className="flex flex-col items-center gap-1 cursor-pointer">
                            <div className="relative p-2 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400">
                                <Package size={18} />
                                {incomingOrdersCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">{incomingOrdersCount}</span>}
                            </div>
                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Perlu Dikirim</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-full text-red-600 dark:text-red-400"><XCircle size={18} /></div>
                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Dibatalkan</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-full text-orange-600 dark:text-orange-400"><RotateCcw size={18} /></div>
                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Pengembalian</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-full text-green-600 dark:text-green-400"><CheckCircle size={18} /></div>
                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Selesai</span>
                        </div>
                    </div>
                </div>

                {/* 3. Main Menu Grid */}
                <div className={`rounded-xl p-4 shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                    <h3 className={`text-xs font-bold mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Menu Toko</h3>
                    <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                        <button onClick={() => setMobileView('add_product')} className="flex flex-col items-center gap-2 group"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 group-active:scale-95 transition-transform"><PlusSquare size={20}/></div><span className="text-[10px] font-medium text-center leading-tight">Tambah Produk</span></button>
                        <button onClick={() => setMobileView('product_list')} className="flex flex-col items-center gap-2 group"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 group-active:scale-95 transition-transform"><Package size={20}/></div><span className="text-[10px] font-medium text-center leading-tight">Produk Saya</span></button>
                        <button onClick={() => setMobileView('finance')} className="flex flex-col items-center gap-2 group"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 group-active:scale-95 transition-transform"><Wallet size={20}/></div><span className="text-[10px] font-medium text-center leading-tight">Keuangan</span></button>
                        <button onClick={() => setMobileView('stats')} className="flex flex-col items-center gap-2 group"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 group-active:scale-95 transition-transform"><BarChart2 size={20}/></div><span className="text-[10px] font-medium text-center leading-tight">Statistik</span></button>
                        <button onClick={() => setMobileView('stats')} className="flex flex-col items-center gap-2 group"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 group-active:scale-95 transition-transform"><Award size={20}/></div><span className="text-[10px] font-medium text-center leading-tight">Poin Seller</span></button>
                        <button className="flex flex-col items-center gap-2 cursor-default opacity-80"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-400 dark:text-gray-500"><Megaphone size={20}/></div><span className="text-[10px] font-medium text-center leading-tight text-gray-400">Promosi</span></button>
                        <button onClick={() => setIsPaymentModalOpen(true)} className="flex flex-col items-center gap-2 group"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 group-active:scale-95 transition-transform"><Settings size={20}/></div><span className="text-[10px] font-medium text-center leading-tight">Pengaturan</span></button>
                        <button className="flex flex-col items-center gap-2 cursor-default opacity-80"><div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700 text-gray-400 dark:text-gray-500"><HelpCircle size={20}/></div><span className="text-[10px] font-medium text-center leading-tight text-gray-400">Bantuan</span></button>
                    </div>
                </div>
            </div>

            {/* 1. Header Stats (Grid 2x2) */}
            {/* Tampil di Mobile jika view='overview', Tampil Selalu di Desktop */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${mobileView === 'finance' ? 'block' : 'hidden md:grid'}`}>
              {/* Card 1: Total Pendapatan */}
              <div className={`p-4 md:p-5 rounded-2xl shadow-sm border flex flex-col justify-between transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                <div>
                  <p className="text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Saldo Virtual (Rekber)</p>
                  <div className="flex flex-col mt-3 space-y-3">
                    <div className="flex justify-between items-center border-b border-dashed border-gray-100 dark:border-slate-700 pb-2">
                        <span className="text-xs font-bold text-gray-400">Tertahan</span>
                        <span className="font-price text-sm md:text-lg font-bold text-orange-500 tracking-wide whitespace-nowrap">Rp {saldoTertahan.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400">Siap Cair</span>
                        <span className="font-price text-lg md:text-2xl font-bold text-green-600 tracking-wide whitespace-nowrap">Rp {saldoSiapCair.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>
                <button 
                    onClick={handleShowHistory}
                    className="mt-3 w-full py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm flex items-center justify-center gap-1"
                >
                    <DollarSign size={14} /> Tarik Saldo
                </button>
              </div>

              {/* Card 2: Pesanan Masuk */}
              <div className={`p-4 md:p-5 rounded-2xl shadow-sm border flex items-center justify-between transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'stats' ? 'block' : 'hidden md:flex'}`}>
                <div>
                  <p className="text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Pesanan Masuk</p>
                  <h3 className={`text-xl md:text-3xl font-extrabold mt-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{incomingOrdersCount} <span className="text-xs md:text-sm font-medium text-gray-400">Perlu Dikirim</span></h3>
                </div>
                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl"><Package size={24} /></div>
              </div>

              {/* Card 3: Pengunjung Toko (Slot Kosong Diisi) */}
              <div className={`p-4 md:p-5 rounded-2xl shadow-sm border flex items-center justify-between transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'stats' ? 'block' : 'hidden md:flex'}`}>
                <div>
                  <p className="text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Pengunjung Toko</p>
                  <h3 className={`text-xl md:text-3xl font-extrabold mt-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>0 <span className="text-xs md:text-sm font-medium text-gray-400">Orang</span></h3>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Users size={24} /></div>
              </div>

              {/* Card 4: Poin Seller */}
              <div className={`p-4 md:p-5 rounded-2xl shadow-md border-2 flex flex-col justify-between relative overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-800 border-sky-900' : 'bg-white border-sky-100'} ${mobileView === 'stats' ? 'block' : 'hidden md:flex'}`}>
                <div className="flex justify-between items-start w-full mb-3">
                  <div>
                    <p className="text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Poin Seller</p>
                    <h3 className="font-price text-xl md:text-3xl font-extrabold text-sky-600 mt-1">{points} <span className="text-xs md:text-sm font-medium text-gray-400">Poin</span></h3>
                  </div>
                  <div className="p-3 bg-sky-50 text-sky-600 rounded-xl"><Award size={24} /></div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden">
                  <div 
                    className="bg-yellow-400 h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
                    style={{ width: `${Math.min(points, 100)}%` }}
                  ></div>
                </div>

                {/* Reward Text */}
                <div className="space-y-1">
                  <p className={`text-[10px] font-bold flex items-center gap-1 ${points >= 50 ? 'text-sky-600' : 'text-gray-400'}`}>
                    {points >= 50 ? <CheckCircle size={10} /> : <Lock size={10} />} 50 Poin: Buka Fitur Video
                  </p>
                  <p className={`text-[10px] font-bold flex items-center gap-1 ${points >= 100 ? 'text-sky-600' : 'text-gray-400'}`}>
                    {points >= 100 ? <CheckCircle size={10} /> : <Lock size={10} />} 100 Poin: Badge Toko Terpercaya
                  </p>
                </div>

                {/* Tombol Redeem */}
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  {!sellerInfo?.canUploadVideo ? (
                    <button 
                      onClick={handleRedeemVideo}
                      disabled={points < 50}
                      className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${points >= 50 ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-md shadow-sky-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    >
                      {points >= 50 ? 'Tukarkan Fitur Video' : 'Butuh 50 Poin'}
                    </button>
                  ) : (
                    <div className="w-full py-2 rounded-lg bg-green-50 text-green-600 text-sm font-bold text-center flex items-center justify-center gap-2">
                      <CheckCircle size={16} /> Fitur Video Aktif
                    </div>
                  )}

                  {/* Redeem Badge */}
                  {!sellerInfo?.isTrustedSeller ? (
                     <button 
                      onClick={handleRedeemBadge}
                      disabled={points < 100}
                      className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${points >= 100 ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    >
                      {points >= 100 ? 'Tukarkan Badge Terpercaya' : 'Butuh 100 Poin (Badge)'}
                    </button>
                  ) : (
                    <div className="w-full py-2 rounded-lg bg-blue-50 text-blue-600 text-sm font-bold text-center flex items-center justify-center gap-2">
                      <CheckCircle size={16} /> Badge Terpercaya Aktif
                    </div>
                  )}
                </div>
              </div>

              {/* Card 5: Informasi Pembayaran Toko (New) */}
              <div className={`p-4 md:p-5 rounded-2xl shadow-sm border flex flex-col justify-between transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'finance' ? 'block' : 'hidden md:flex'}`}>
                <div>
                  <div className="flex justify-between items-start">
                    <p className="text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Rekening Pencairan</p>
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CreditCard size={20} /></div>
                  </div>
                  <h3 className={`font-bold mt-2 text-base md:text-lg ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    {sellerInfo?.paymentDetails?.bankName ? `${sellerInfo.paymentDetails.bankName} & QRIS` : 'Belum Diatur'}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">Rekening tujuan transfer dana dari Admin.</p>
                </div>
                <button onClick={() => setIsPaymentModalOpen(true)} className={`mt-4 w-full py-2 text-sm font-bold rounded-lg transition-colors border ${isDarkMode ? 'bg-slate-700 text-gray-200 border-slate-600 hover:bg-slate-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                  Atur Info Pencairan
                </button>
              </div>
            </div>

            {/* 2. Grafik Penjualan (Bar Chart + Filter) */}
            {/* Collapsible on Mobile */}
            <div className={`p-4 md:p-6 rounded-2xl shadow-sm border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'stats' ? 'block' : 'hidden md:block'}`}>
              
              {/* Mobile Header for Stats (Visible only on Mobile) */}
              {mobileView === 'stats' && (
                <div className="flex items-center gap-3 mb-6 md:hidden">
                    <button onClick={handleMobileBack} className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Statistik Penjualan</h2>
                </div>
              )}

              {/* Desktop Header (Visible only on Desktop) */}
              <div className="hidden md:flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-sky-900 text-sky-300' : 'bg-sky-50 text-sky-600'}`}><TrendingUp size={20} /></div>
                  <div>
                    <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Statistik Penjualan</h3>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1"><Info size={10}/> Grafik menampilkan Total Transaksi Masuk (Gross)</p>
                  </div>
                </div>
                
                {/* Desktop Date Filter */}
                <div className="flex items-center gap-3">
                  <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                    <button onClick={() => handleDatePreset('week')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isDarkMode ? 'text-gray-300 hover:bg-slate-600' : 'text-gray-600 hover:bg-white hover:shadow-sm'}`}>Minggu Ini</button>
                    <button onClick={() => handleDatePreset('month')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isDarkMode ? 'text-gray-300 hover:bg-slate-600' : 'text-gray-600 hover:bg-white hover:shadow-sm'}`}>Bulan Ini</button>
                  </div>
                  <div className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 shadow-sm ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}>
                    <input type="date" value={dateRange.startDate} onChange={e => setDateRange({...dateRange, startDate: e.target.value})} className={`text-xs font-bold outline-none bg-transparent ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} />
                    <span className="text-gray-400">-</span>
                    <input type="date" value={dateRange.endDate} onChange={e => setDateRange({...dateRange, endDate: e.target.value})} className={`text-xs font-bold outline-none bg-transparent ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} />
                  </div>
                </div>
              </div>

              {/* Total Sales Info */}
              {totalRevenueForPeriod > 0 && (
              <div className="mb-6 text-center md:text-left">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Total Pendapatan</p>
                <h3 className={`text-3xl md:text-4xl font-extrabold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {totalRevenueForPeriod.toLocaleString('id-ID')}</h3>
              </div>
              )}

              {/* Mobile Date Display */}
              <div className="md:hidden text-center mb-4">
                  <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {getMobileDateDisplay()}
                  </p>
              </div>

              {/* Stockbit Style Filter (Mobile Only) */}
              <div className="flex justify-center gap-2 mb-6 md:hidden">
                {['1D', '1W', '1M', 'ALL'].map(f => (
                    <button 
                        key={f} 
                        onClick={() => handleMobileFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${chartFilter === f ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : (isDarkMode ? 'bg-slate-700 text-gray-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}`}
                    >
                        {f}
                    </button>
                ))}
              </div>
              
              <div className={`h-64 md:h-80 w-full`}>
                <Line options={chartOptions} data={chartData} />
              </div>
            </div>

            {/* 3. Split Screen: Input Produk & List Produk */}
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6`}>
              
              {/* Kolom Kiri: Tambah Produk */}
              <div className={`p-4 md:p-6 rounded-2xl shadow-sm border h-fit transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'add_product' ? 'block' : 'hidden md:block'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className={`font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        {editingProductId ? <Edit size={18} className="text-orange-500" /> : <Plus size={18} />} 
                        {editingProductId ? `Edit: ${productForm.name}` : 'Tambah Produk Baru'}
                    </h3>
                    {editingProductId && <button onClick={handleCancelEdit} className="text-xs text-red-500 font-bold hover:underline">Batal Edit</button>}
                </div>
                <form onSubmit={handleSaveProduct} className="space-y-4">
                  
                  {/* Split Media Input */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Input Foto */}
                    <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-gray-400 hover:border-sky-500 transition-all cursor-pointer relative h-32 ${isDarkMode ? 'border-slate-600 bg-slate-700/50 hover:bg-slate-700' : 'border-gray-300 bg-gray-50 hover:bg-sky-50'}`}>
                      <input type="file" accept="image/*" onChange={(e) => handleMediaChange(e, 'image')} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      {mediaType === 'image' && mediaPreview ? (
                        <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <>
                          <ImageIcon size={24} className="mb-2 text-sky-600" />
                          <span className="text-xs font-bold">Upload Foto</span>
                        </>
                      )}
                    </div>

                    {/* Input Video (Locked/Unlocked) */}
                    {sellerInfo?.canUploadVideo ? (
                      <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-gray-400 hover:border-purple-500 transition-all cursor-pointer relative h-32 ${isDarkMode ? 'border-slate-600 bg-slate-700/50 hover:bg-slate-700' : 'border-gray-300 bg-gray-50 hover:bg-purple-50'}`}>
                        <input type="file" accept="video/*" onChange={(e) => handleMediaChange(e, 'video')} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                        {mediaType === 'video' && mediaPreview ? (
                          <video src={mediaPreview} className="w-full h-full object-cover rounded-lg" controls />
                        ) : (
                          <>
                            <Video size={24} className="mb-2 text-purple-600" />
                            <span className="text-xs font-bold">Upload Video</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-gray-300 h-32 cursor-not-allowed ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
                        <Lock size={24} className="mb-2" />
                        <span className="text-xs font-bold">Video Terkunci</span>
                      </div>
                    )}
                  </div>

                  {/* Dropdown Kategori */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Tag size={18} className="text-gray-400" />
                    </div>
                    <select 
                      value={productForm.category} 
                      onChange={e => setProductForm({...productForm, category: e.target.value, subCategory: '', skinProblem: ''})}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                    >
                      <option value="Makan">Makan</option>
                      <option value="Skin Care">Skin Care</option>
                      <option value="Fashion">Fashion</option>
                      <option value="Isi Pulsa">Isi Pulsa</option>
                      <option value="Game">Top Up Game</option>
                      <option value="Jasa">Jasa</option>
                    </select>
                  </div>

                  {/* Dropdown Sub-Kategori (Khusus Makan) */}
                  {productForm.category === 'Makan' && (
                    <div className="relative animate-pulse">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Tag size={18} className="text-gray-400" />
                      </div>
                      <select 
                        value={productForm.subCategory} 
                        onChange={e => setProductForm({...productForm, subCategory: e.target.value})}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                      >
                        <option value="">Pilih Sub-Kategori Makanan</option>
                        <option value="Ayam">Ayam</option>
                        <option value="Minuman">Minuman</option>
                        <option value="Snack">Snack</option>
                        <option value="Mie">Mie</option>
                      </select>
                    </div>
                  )}

                  {/* Dropdown Sub-Kategori & Masalah Kulit (Khusus Skin Care) */}
                  {productForm.category === 'Skin Care' && (
                    <div className="space-y-4">
                      <div className="relative animate-pulse">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Tag size={18} className="text-gray-400" />
                        </div>
                        <select 
                          value={productForm.subCategory} 
                          onChange={e => setProductForm({...productForm, subCategory: e.target.value})}
                          className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                        >
                          <option value="">Pilih Jenis Produk</option>
                          <option value="Face Wash / Sabun">Face Wash / Sabun</option>
                          <option value="Serum / Essence">Serum / Essence</option>
                          <option value="Moisturizer / Cream">Moisturizer / Cream</option>
                          <option value="Sunscreen">Sunscreen</option>
                          <option value="Kosmetik / Makeup">Kosmetik / Makeup</option>
                        </select>
                      </div>

                      <div className="relative animate-pulse">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Sparkles size={18} className="text-gray-400" />
                        </div>
                        <select 
                          value={productForm.skinProblem} 
                          onChange={e => setProductForm({...productForm, skinProblem: e.target.value})}
                          className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                        >
                          <option value="">Pilih Masalah Kulit</option>
                          <option value="Berjerawat">Berjerawat</option>
                          <option value="Kusam">Kusam</option>
                          <option value="Kering">Kering</option>
                          <option value="Berminyak">Berminyak</option>
                          <option value="Sensitif / Lainnya">Sensitif / Lainnya</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Dropdown Sub-Kategori (Khusus Fashion) */}
                  {productForm.category === 'Fashion' && (
                    <div className="relative animate-pulse">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Tag size={18} className="text-gray-400" />
                      </div>
                      <select 
                        value={productForm.subCategory} 
                        onChange={e => setProductForm({...productForm, subCategory: e.target.value})}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                      >
                        <option value="">Pilih Sub-Kategori Fashion</option>
                        <option value="Pria">Pria</option>
                        <option value="Wanita">Wanita</option>
                        <option value="Hijab">Hijab</option>
                        <option value="Sepatu">Sepatu</option>
                        <option value="Aksesoris">Aksesoris</option>
                      </select>
                    </div>
                  )}

                  {/* Dropdown Sub-Kategori (Khusus Game) */}
                  {productForm.category === 'Game' && (
                    <div className="relative animate-pulse">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Gamepad2 size={18} className="text-gray-400" />
                      </div>
                      <select 
                        value={productForm.subCategory} 
                        onChange={e => setProductForm({...productForm, subCategory: e.target.value})}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                      >
                        <option value="">Pilih Game</option>
                        <option value="Mobile Legends">Mobile Legends</option>
                        <option value="Free Fire">Free Fire</option>
                        <option value="Valorant">Valorant</option>
                        <option value="PUBG Mobile">PUBG Mobile</option>
                        <option value="Genshin Impact">Genshin Impact</option>
                        <option value="Arena of Valor">Arena of Valor</option>
                      </select>
                    </div>
                  )}

                  {/* Tipe Input (Khusus Game) */}
                  {productForm.category === 'Game' && (
                    <div className="relative animate-pulse">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Tag size={18} className="text-gray-400" />
                      </div>
                      <select 
                        value={productForm.fieldInputType} 
                        onChange={e => setProductForm({...productForm, fieldInputType: e.target.value})}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                      >
                        <option value="ID Only">ID Only</option>
                        <option value="ID + Zone">ID + Zone</option>
                        <option value="Riot ID">Riot ID</option>
                        <option value="UID + Server">UID + Server</option>
                      </select>
                    </div>
                  )}



                  {/* Input Estimasi (Khusus Jasa) */}
                  {productForm.category === 'Jasa' && (
                    <div className="space-y-4 animate-pulse">
                        <div className="space-y-1">
                            <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Estimasi Pengerjaan</label>
                            <input type="text" placeholder="Contoh: 3 Hari" value={productForm.estimation} onChange={e => setProductForm({...productForm, estimation: e.target.value})} className={`w-full px-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} />
                        </div>
                        <div className="space-y-1">
                            <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Metode Pengiriman Jasa</label>
                            <select 
                                value={productForm.serviceType} 
                                onChange={e => setProductForm({...productForm, serviceType: e.target.value})}
                                className={`w-full px-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none appearance-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                            >
                                <option value="">Pilih Metode</option>
                                <option value="Online/WhatsApp">Online / WhatsApp</option>
                                <option value="COD/Ketemu">COD / Ketemu Langsung</option>
                            </select>
                        </div>
                    </div>
                  )}

                  <input required type="text" placeholder="Nama Produk" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} className={`w-full px-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} />
                  <div className="grid grid-cols-2 gap-4">
                    <input required type="number" placeholder="Harga (Rp)" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} className={`w-full px-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} />
                    <input required type="number" placeholder={productForm.category === 'Jasa' ? "Kuota Antrean" : "Stok"} value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} className={`w-full px-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} />
                  </div>
                  <textarea required placeholder="Deskripsi Singkat" value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} className={`w-full px-4 py-3 rounded-xl border text-sm focus:border-sky-500 outline-none resize-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} rows="3"></textarea>
                  
                  {/* Voucher Penjual */}
                  <div className={`p-4 rounded-xl border space-y-3 ${isDarkMode ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-100'}`}>
                    <p className="text-xs font-bold text-orange-800 flex items-center gap-1"><Tag size={14}/> Buat Voucher Diskon (Opsional)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="text" placeholder="Kode (Misal: DISKON5RB)" value={productForm.voucherCode} onChange={e => setProductForm({...productForm, voucherCode: e.target.value.toUpperCase()})} className={`w-full px-4 py-2 rounded-lg border text-sm uppercase focus:border-orange-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-orange-200'}`} />
                      <input type="number" placeholder="Nominal Potongan (Rp)" value={productForm.voucherAmount} onChange={e => setProductForm({...productForm, voucherAmount: e.target.value})} className={`w-full px-4 py-2 rounded-lg border text-sm focus:border-orange-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-orange-200'}`} />
                    </div>
                  </div>
                  
                  {/* Toggle Status Produk (Arsip) */}
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div>
                        <p className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Status Produk</p>
                        <p className="text-[10px] text-gray-500">{productForm.isActive ? 'Produk Tampil di Toko' : 'Produk Disembunyikan (Arsip)'}</p>
                    </div>
                    <button 
                        type="button"
                        onClick={() => setProductForm({...productForm, isActive: !productForm.isActive})}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${productForm.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${productForm.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <button disabled={isUploading} type="submit" className={`w-full py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all flex items-center justify-center gap-2 ${isDarkMode ? 'shadow-none' : ''}`}>
                    {isUploading ? <Loader2 size={20} className="animate-spin" /> : <>{editingProductId ? <Save size={20} /> : <Plus size={20} />} {editingProductId ? 'Update Produk' : 'Simpan Produk'}</>}
                  </button>
                </form>
              </div>

              {/* Kolom Kanan: Produk Anda */}
              <div className={`p-4 md:p-6 rounded-2xl shadow-sm border h-[600px] overflow-y-auto transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'product_list' ? 'block' : 'hidden md:block'}`}>
                <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Produk Anda ({products.length})</h3>
                <div className="space-y-3">
                  {products.map((prod) => (
                    <div key={prod.id} className={`flex gap-3 p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'} ${!prod.isActive ? 'opacity-60 grayscale' : 'hover:border-sky-200'}`}>
                      <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                        {prod.mediaType === 'video' ? <video src={prod.mediaUrl} className="w-full h-full object-cover" /> : <img src={prod.mediaUrl} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-bold text-sm line-clamp-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{prod.name}</h4>
                        <p className="font-price text-sky-600 font-bold text-xs tracking-wide">Rp {parseInt(prod.price).toLocaleString('id-ID')}</p>
                        <p className="text-xs text-gray-500">Stok: {prod.stock}</p>
                        {!prod.isActive && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Diarsipkan</span>}
                      </div>
                      <div className="flex flex-col gap-1 justify-center">
                        <button onClick={() => handleEditClick(prod)} className={`p-1.5 rounded-lg shadow-sm border ${isDarkMode ? 'bg-slate-600 border-slate-500 text-gray-300 hover:text-blue-400' : 'bg-white border-gray-100 text-gray-400 hover:text-blue-500'}`}><Edit size={14} /></button>
                        <button onClick={() => handleDeleteProduct(prod.id)} className={`p-1.5 rounded-lg shadow-sm border ${isDarkMode ? 'bg-slate-600 border-slate-500 text-gray-300 hover:text-red-400' : 'bg-white border-gray-100 text-gray-400 hover:text-red-500'}`}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Row Bawah: Daftar Pesanan Masuk */}
            <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'orders' ? 'block' : 'hidden md:block'}`}>
              <div className={`p-4 md:p-6 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Pesanan Masuk Terbaru</h3>
                <button className="text-sm text-sky-600 font-bold hover:underline">Lihat Semua</button>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                <table className="w-full text-sm text-left relative">
                  <thead className={`font-bold sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-slate-700 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>
                    <tr>
                      <th className="px-6 py-4">ID Pesanan</th>
                      <th className="px-6 py-4">Pembeli</th>
                      <th className="px-6 py-4">Produk</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700 text-gray-300' : 'divide-gray-100'}`}>
                    {sellerOrders.length === 0 ? (
                        <tr>
                            <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                <div className="flex flex-col items-center justify-center">
                                    <Package size={48} className="text-gray-300 mb-2" />
                                    <p>Belum ada pesanan masuk.</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        sellerOrders.map(order => (
                            <tr key={order.id} className={`hover:transition-colors ${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50'}`}>
                                {(() => {
                                    const isJasa = (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).some(i => i.category === 'Jasa');
                                    return (
                                <>
                                <td className="px-6 py-4 font-medium text-xs">#{order.id.slice(-6)}</td>
                                <td className="px-6 py-4">{order.buyerName}</td>
                                <td className="px-6 py-4">
                                  <div className="space-y-1">
                                    {(Array.isArray(order.items) ? order.items : Object.values(order.items || {}))
                                      .filter(i => i.sellerId === user.uid)
                                      .map((item, idx) => (
                                        <div key={idx} className={`text-xs border-b pb-1 last:border-0 ${isDarkMode ? 'border-slate-600' : 'border-gray-100'}`}>
                                            <p className={`font-bold line-clamp-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.name}</p>
                                            <p className="text-gray-500">{item.quantity} x Rp {parseInt(item.price).toLocaleString('id-ID')}</p>
                                        </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                    {isJasa && order.status === 'processed' ? (
                                        <div className="flex flex-col gap-1">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold w-fit">Perlu Dikerjakan</span>
                                            {order.verifiedAt && (
                                                <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                                                    <Timer size={10} /> Deadline: {(() => {
                                                        const item = (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).find(i => i.category === 'Jasa');
                                                        const days = parseInt(item?.estimation) || 3;
                                                        const deadline = new Date(new Date(order.verifiedAt).getTime() + (days * 24 * 60 * 60 * 1000));
                                                        return deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                    ) : (isJasa && order.status === 'shipped' ? <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">Menunggu Konfirmasi</span> : getOrderStatusBadge(order.status))}
                                </td>
                                <td className="px-6 py-4 font-price font-bold text-[#333333]">Rp {order.totalPrice.toLocaleString('id-ID')}</td>
                                <td className="px-6 py-4">
                                    {order.status === 'processed' && (
                                        <button onClick={() => handleProcessOrder(order.id, isJasa)} className="text-white bg-sky-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-sky-700 shadow-sm transition-colors">{isJasa ? 'Tandai Selesai' : 'Proses & Kirim'}</button>
                                    )}
                                    {order.status === 'waiting_verification' && <span className="text-xs text-gray-400 italic">Menunggu Admin</span>}
                                </td>
                                </>
                                )})()}
                            </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. Riwayat Penarikan Dana (Withdrawal History) */}
            <div className={`rounded-2xl shadow-sm border overflow-hidden mt-6 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} ${mobileView === 'finance' ? 'block' : 'hidden md:block'}`}>
              <div className={`p-4 md:p-6 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Riwayat Penarikan Dana</h3>
              </div> 
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                <table className="w-full text-sm text-left relative">
                  <thead className={`font-bold sticky top-0 z-10 shadow-sm ${isDarkMode ? 'bg-slate-700 text-gray-200' : 'bg-gray-50 text-gray-600'}`}>
                    <tr>
                      <th className="px-6 py-4">Tanggal</th>
                      <th className="px-6 py-4">Nominal</th>
                      <th className="px-6 py-4">Metode</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Bukti Transfer</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700 text-gray-300' : 'divide-gray-100'}`}>
                    {withdrawals.length === 0 ? (
                        <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Belum ada riwayat penarikan.</td></tr>
                    ) : (
                        withdrawals.map(wd => (
                            <tr key={wd.id} className={`hover:transition-colors ${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50'}`}>
                                <td className="px-6 py-4">{new Date(wd.createdAt).toLocaleDateString('id-ID')}</td>
                                <td className="px-6 py-4 font-bold text-green-600">Rp {wd.amount.toLocaleString('id-ID')}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded border text-xs font-bold ${isDarkMode ? 'bg-slate-600 border-slate-500 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                                    {wd.note || 'Otomatis'}
                                  </span>
                                </td>
                                <td className="px-6 py-4"><span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Berhasil</span></td>
                                <td className="px-6 py-4">
                                    <button onClick={() => setSelectedWithdrawalProof(wd)} className="text-sky-600 hover:underline text-xs font-bold flex items-center gap-1">
                                      <ImageIcon size={14}/> Lihat Bukti
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Pengaturan Pembayaran */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <button onClick={() => setIsPaymentModalOpen(false)} className={`absolute top-4 right-4 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}><X size={24} /></button>
            
            <h2 className={`text-xl font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Atur Info Pencairan</h2>
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Dana penjualan akan ditransfer Admin ke sini.</p>

            <form onSubmit={handleSavePaymentSettings} className="space-y-4">
              {/* Upload QRIS */}
              <div className="space-y-2">
                <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Upload QRIS (Opsional)</label>
                <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer relative h-40 ${isDarkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-50'}`}>
                  <input type="file" accept="image/*" onChange={handleQrisChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  {qrisPreview ? (
                    <img src={qrisPreview} alt="QRIS Preview" className="h-full object-contain" />
                  ) : (
                    <div className="text-gray-400">
                      <ImageIcon size={32} className="mx-auto mb-2" />
                      <span className="text-xs">Klik untuk upload QRIS</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Bank */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Nama Bank</label>
                  <input type="text" placeholder="Contoh: BCA" value={paymentForm.bankName} onChange={e => setPaymentForm({...paymentForm, bankName: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} required />
                </div>
                <div className="space-y-1">
                  <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Atas Nama</label>
                  <input type="text" placeholder="Nama Pemilik" value={paymentForm.accountHolder} onChange={e => setPaymentForm({...paymentForm, accountHolder: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Nomor Rekening</label>
                <input type="number" placeholder="Contoh: 1234567890" value={paymentForm.bankAccount} onChange={e => setPaymentForm({...paymentForm, bankAccount: e.target.value})} className={`w-full px-3 py-2 rounded-lg border text-sm focus:border-sky-500 outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-200'}`} required />
              </div>

              <button disabled={isUploading} type="submit" className="w-full py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 mt-4 flex items-center justify-center gap-2">
                {isUploading ? <Loader2 size={20} className="animate-spin" /> : 'Simpan Pengaturan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Bukti Transfer Penarikan */}
      {selectedWithdrawalProof && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <button onClick={() => setSelectedWithdrawalProof(null)} className={`absolute top-4 right-4 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}><X size={24} /></button>
            
            <h3 className={`text-lg font-bold mb-4 text-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Bukti Transfer Penarikan</h3>
            
            <div className="bg-gray-100 rounded-xl overflow-hidden mb-4 flex-shrink-0 relative h-64 border border-gray-200">
              <img 
                src={selectedWithdrawalProof.proofUrl} 
                alt="Bukti Transfer" 
                className="w-full h-full object-contain" 
              />
            </div>

            <div className="space-y-3 overflow-y-auto">
              <div className={`flex justify-between items-center border-b pb-2 ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Nominal</span>
                <span className="text-lg font-bold text-green-600">Rp {selectedWithdrawalProof.amount.toLocaleString('id-ID')}</span>
              </div>
              <div className={`flex justify-between items-center border-b pb-2 ${isDarkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tanggal</span>
                <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{new Date(selectedWithdrawalProof.createdAt).toLocaleDateString('id-ID')}</span>
              </div>
              
              <div className={`p-3 rounded-lg text-xs border ${isDarkMode ? 'bg-blue-900/30 text-blue-200 border-blue-800/50' : 'bg-blue-50 text-blue-800 border-blue-100'}`}>
                <p className="font-bold mb-1">Info Transfer:</p>
                <p>Uang ditransfer ke Rekening <b>{sellerInfo?.paymentDetails?.bankName || 'Bank'}</b> a.n <b>{sellerInfo?.paymentDetails?.accountHolder || 'Seller'}</b></p>
              </div>
            </div>

            <button 
              onClick={() => setSelectedWithdrawalProof(null)} 
              className={`w-full mt-6 py-3 font-bold rounded-xl transition-colors ${isDarkMode ? 'bg-slate-700 text-gray-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardSeller;