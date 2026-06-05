import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CreditCard, Upload, CheckCircle, Loader2, Copy, Clock, ShieldCheck, ZoomIn, X, Banknote, Timer, ShieldAlert, Download, Sparkles, Wallet, AlertCircle } from 'lucide-react';
import { db, auth } from '../config/firebase';
import { ref, get, update, onValue, push, serverTimestamp } from 'firebase/database';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';
import { toPng } from 'html-to-image';

const calculateAdminFee = (amount) => {
  if (amount < 15000) return 500;
  return 2000;
};

// Kumpulan kata-kata motivasi random khusus SobatNiaga
const motivations = [
  "Semangat belajarnya, calon orang sukses! 🚀",
  "Usaha tidak akan mengkhianati hasil, teruslah berjuang! 💪",
  "Sobat Niaga percaya kamu bisa jadi yang terbaik! ✨",
  "Jangan lupa istirahat, kesehatanmu itu investasi paling berharga. 🍎",
  "Hari ini belanja di SobatNiaga, besok jadi pengusaha sukses! Amin. 💸",
  "Langkah kecil hari ini adalah awal dari kesuksesan besar besok. 🔥"
];

// Helper: Generate Nomor Resi Internal Otomatis (Booking Resi)
// Format: SN-DDMMYY-XXXXXYY (Contoh: SN-050626-K9X2B7Z)
const generateInstantResi = () => {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear()).slice(-2);
  const dateString = `${d}${m}${y}`;
  const uniqueTime = Date.now().toString(36).toUpperCase().slice(-5);
  const randomPart = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `SN-${dateString}-${uniqueTime}${randomPart}`;
};

const Payment = ({ order, onBack, onPaymentSuccess }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [orderData, setOrderData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [proofFile, setProofFile] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('transfer'); // 'transfer' | 'qris'
  const [isZoomed, setIsZoomed] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [adminPaymentInfo, setAdminPaymentInfo] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [randomMotivation] = useState(() => motivations[Math.floor(Math.random() * motivations.length)]);
  const receiptRef = useRef(null);

  // MENGGUNAKAN onValue AGAR DATA SELALU REAL-TIME (SINKRON DENGAN RESI PENJUAL)
  useEffect(() => {
    if (order?.id) {
      const orderRef = ref(db, `orders/${order.id}`);
      const unsubscribe = onValue(orderRef, (snapshot) => {
        if (snapshot.exists()) {
          setOrderData(snapshot.val());
        }
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching order:", error);
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [order?.id]);

  // Ambil Data Profil Pembeli (Saldo) secara Real-time
  useEffect(() => {
    if (auth.currentUser) {
      const userRef = ref(db, `users/${auth.currentUser.uid}`);
      const unsubscribe = onValue(userRef, (snap) => {
        if (snap.exists()) setUserProfile(snap.val());
      });
      return () => unsubscribe();
    }
  }, []);

  // Fetch Data Rekening Pusat (Admin Rekber) dari Firebase
  useEffect(() => {
    // Gunakan onValue agar data QRIS/Rekening update Real-time saat Admin ganti
    const infoRef = ref(db, 'admin/paymentInfo');
    const unsubscribe = onValue(infoRef, (snapshot) => {
      if (snapshot.exists()) {
        setAdminPaymentInfo(snapshot.val());
      } else {
        setAdminPaymentInfo({}); // Inisialisasi object kosong jika data belum diset Admin
      }
    });
    return () => unsubscribe();
  }, []);

  // Logic Timer 24 Jam
  useEffect(() => {
    // Timer hanya jalan jika status masih 'waiting_payment' atau 'payment_rejected'
    if (!orderData?.createdAt || !['waiting_payment', 'payment_rejected'].includes(orderData?.status)) {
      setCountdown("");
      return;
    }

    // Target: Jam 23:59:59 hari ini (Sesuai instruksi tampilan)
    const targetDate = new Date();
    targetDate.setHours(23, 59, 59, 999);
    
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance < 0) {
        setCountdown("EXPIRED");
        clearInterval(interval);
      } else {
        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        setCountdown(`${h}j ${m}m`); // Hapus 'd' dan fokus ke Jam & Menit saja sesuai request
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [orderData]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const uploadToCloudinary = async (file) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'djqnnguli';
    const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY || '156244598362341';
    const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET || 'INGJr-KgmBPNwqwBYFZy9w7Fa18';
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    const params = { folder: 'sobatniaga/payments', timestamp: timestamp };
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
    formData.append('folder', 'sobatniaga/payments');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Upload failed');
    // Auto-Compress: Quality Auto & Format Auto
    return data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
  };

  const handleConfirmPayment = async () => {
    // --- LOGIKA PEMBAYARAN VIA SALDO (INSTAN) ---
    if (paymentMethod === 'saldo') {
      const currentBalance = parseInt(userProfile?.balance || 0);
      const totalToPay = parseInt(orderData?.totalPrice || 0);

      if (currentBalance < totalToPay) {
        Swal.fire('Saldo Kurang', 'Saldo kamu gak cukup nih, Bro! Top up dulu yuk.', 'error');
        return;
      }

      setIsUploading(true);
      try {
        const instantResi = generateInstantResi();
        
        // 1. Potong Saldo Pembeli
        await update(ref(db, `users/${auth.currentUser.uid}`), {
          balance: currentBalance - totalToPay
        });

        // 2. Update Status Order: Langsung 'processed' (Bypass Admin)
        await update(ref(db, `orders/${order.id}`), {
          status: 'processed',
          paymentMethod: 'saldo',
          resi: instantResi, // Langsung kasih No. Resi booking agar struk tidak kosong
          paidAt: new Date().toISOString()
        });

        // 3. Notifikasi ke Seller (Agar langsung di-ACC/Kirim)
        const sellers = orderData.involvedSellerIds || (orderData.sellerId ? [orderData.sellerId] : []);
        for (const sid of sellers) {
          await push(ref(db, 'notifications'), {
            recipientId: sid,
            title: 'Pesanan Terbayar (Saldo)!',
            message: `Pembayaran pesanan #${order.id.slice(-6)} berhasil via saldo. Silakan langsung proses kirim!`,
            status: 'unread',
            createdAt: serverTimestamp(),
            type: 'success',
            targetView: 'dashboard-seller'
          });
        }

        setShowReceipt(true);
        Swal.fire('Pembayaran Berhasil!', 'Saldo terpotong dan pesanan langsung diteruskan ke penjual, Bro.', 'success');
        return;
      } catch (error) {
        console.error("Saldo payment error:", error);
      } finally { setIsUploading(false); return; }
    }

    if (!proofFile) {
      Swal.fire({
        title: 'Bukti Transfer Kosong',
        text: 'Mohon upload screenshot bukti transfer dulu ya.',
        icon: 'warning',
        buttonsStyling: false,
        customClass: {
          popup: `rounded-[2rem] ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800 shadow-2xl'}`,
          confirmButton: 'px-10 py-3 rounded-xl text-sm font-black text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all !opacity-100 active:scale-95'
        }
      });
      return;
    }

    setIsUploading(true);
    try {
      const instantResi = generateInstantResi();
      
      // 1. Upload Bukti
      const proofUrl = await uploadToCloudinary(proofFile);

      // 2. Update Status ke 'waiting_verification'
      await update(ref(db, `orders/${order.id}`), {
        status: 'waiting_verification',
        proofUrl: proofUrl,
        resi: instantResi, // Tetap kasih resi booking biar struk jernih ada angkanya
        paidAt: new Date().toISOString()
      });

      // --- TRIGGER NOTIFICATION UNTUK ADMIN ---
      await push(ref(db, 'notifications'), {
        recipientId: 'ADMIN_GLOBAL',
        title: 'Bukti Pembayaran Baru!',
        message: `User ${orderData.buyerName} mengunggah bukti transfer untuk pesanan #${order.id.slice(-6)}.`,
        status: 'unread',
        createdAt: serverTimestamp(),
        orderId: order.id,
        targetView: 'admin-dashboard'
      });

      // Langsung munculkan struk untuk di download
      setShowReceipt(true);
      
      Swal.fire({
        icon: 'success',
        title: 'Pembayaran Berhasil Dikirim!',
        text: 'Silakan simpan struk belanja kamu, Bro.',
        confirmButtonText: 'Lihat Struk',
        confirmButtonColor: '#0ea5e9'
      });

    } catch (error) {
      console.error("Payment error:", error);
      Swal.fire({
        title: 'Gagal',
        text: 'Terjadi kesalahan saat upload bukti.',
        icon: 'error',
        buttonsStyling: false,
        customClass: {
          popup: `rounded-[2rem] ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800 shadow-2xl'}`,
          confirmButton: 'px-10 py-3 rounded-xl text-sm font-black text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-200 transition-all !opacity-100 active:scale-95'
        }
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadReceiptImage = async () => {
    if (receiptRef.current === null) return;
    
    try {
      // Kita tambahkan pixelRatio: 3 biar hasilnya super tajam (HD)
      const dataUrl = await toPng(receiptRef.current, { 
        cacheBust: true,
        pixelRatio: 3, // Meningkatkan kepadatan pixel agar gambar jernih
        style: {
          transform: 'scale(1)', // Memastikan tidak ada distorsi saat pengambilan gambar
        }
      });
      const link = document.createElement('a');
      link.download = `Struk-SobatNiaga-${order.id.slice(-6)}.png`;
      link.href = dataUrl;
      link.click();
      
      Swal.fire({
        icon: 'success',
        title: 'Struk Tersimpan!',
        text: 'Gambar struk berhasil di-download.',
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err) {
      console.error('Gagal generate struk:', err);
    }
  };

  if (isLoading) return <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}><Loader2 className="animate-spin text-sky-600" /></div>;
  if (!orderData) return null;

  // TAMPILAN HALAMAN STRUK SETELAH BAYAR
  if (showReceipt) {
    const subtotal = (orderData.totalPrice || 0) - (orderData.deliveryFee || 0) + (orderData.appliedVoucher?.amount || 0);
    const totalBarang = Array.isArray(orderData.items) ? orderData.items.reduce((acc, item) => acc + (item.quantity || 1), 0) : 1;

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-gray-100'}`}>
        <div className="max-w-md w-full animate-in zoom-in duration-300">
          
          {/* KOMPONEN STRUK YANG AKAN DI-CONVERT JADI GAMBAR */}
          <div 
            ref={receiptRef}
            className="bg-white text-slate-800 p-8 shadow-2xl rounded-sm border-t-[12px] border-sky-600 relative overflow-hidden"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {/* Watermark Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] rotate-[-35deg] pointer-events-none whitespace-nowrap text-6xl font-black">
              SOBAT NIAGA OFFICIAL
            </div>

            {/* Header Struk */}
            <div className="text-center border-b-2 border-dashed border-slate-200 pb-6 mb-6">
              <h2 className="text-2xl font-black tracking-tighter text-sky-600 mb-1">SOBAT-NIAGA</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kantin & Marketplace Mahasiswa</p>
              
              <div className="mt-4 space-y-1 text-[11px] font-medium text-slate-600">
                <p><span className="font-bold text-slate-400">PEMBELI:</span> {orderData.buyerName || 'Pelanggan Setia'}</p>
                <p><span className="font-bold text-slate-400">TOKO:</span> {orderData.items?.[0]?.storeName || 'Official Store'}</p>
                <p>
                  <span className="font-bold text-slate-400">STATUS:</span>{" "}
                  <span className={`${paymentMethod === 'saldo' ? 'text-green-600' : 'text-orange-600'} font-black`}>
                    {paymentMethod === 'saldo' ? 'LUNAS' : 'DIPROSES'}
                  </span>
                </p>
              </div>

              <div className="mt-4 flex justify-between items-end text-[10px] font-mono text-slate-500 border-t pt-4 border-slate-50">
                <div className="text-left">
                  <p className="font-bold">ID TRANS: #{order.id.toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p>{new Date().toLocaleDateString('id-ID')}</p>
                  <p>{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</p>
                </div>
              </div>
            </div>

            {/* Isi Struk Utama */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">No. Transaksi</span>
                <span className="text-xs font-mono font-bold text-slate-800 uppercase">#{order.id.toUpperCase().slice(-10)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">No. Resi (Kurir)</span>
                <span className="text-xs font-mono font-bold uppercase text-sky-600">
                  {orderData.resi || 'GENERATING...'}
                </span>
              </div>

              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500">Produk Selektif</span>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-800">{totalBarang} Barang</p>
                  {Array.isArray(orderData.items) && orderData.items.map((item, i) => (
                    <p key={i} className="text-[10px] text-slate-500 italic">{item.name} (x{item.quantity})</p>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-y border-slate-50">
                <span className="text-xs font-bold text-slate-500">Total Harga ({totalBarang} barang)</span>
                <span className="text-xs font-bold text-slate-800">Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>

              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500">Catatan</span>
                <span className="text-xs text-slate-600 italic text-right max-w-[150px]">{orderData.note || '-'}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Ongkos Kirim</span>
                <span className="text-xs font-bold text-slate-800">Rp {(orderData.deliveryFee || 0).toLocaleString('id-ID')}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Total Diskon Barang</span>
                <span className="text-xs font-bold text-green-600">-Rp {(orderData.appliedVoucher?.amount || 0).toLocaleString('id-ID')}</span>
              </div>

              {/* Total Final */}
              <div className="pt-4 border-t-2 border-slate-800 flex justify-between items-center">
                <span className="text-sm font-black uppercase">Total Belanja</span>
                <span className="text-xl font-black text-sky-600 tracking-tight">Rp {orderData.totalPrice.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Footer Struk: Motivasi & QR Code Palsu buat estetik */}
            <div className="mt-8 pt-6 border-t-2 border-dashed border-slate-200">
              <div className="flex flex-col items-center text-center mb-6">
                <CheckCircle className="text-green-600 mb-2" size={32} />
                <p className="text-[10px] text-slate-500 leading-relaxed px-4">
                  Terima kasih telah berbelanja! Pembayaran Anda aman dalam sistem Rekber SobatNiaga.
                </p>
              </div>

              <div className="mb-6 text-[10px] text-slate-400 border-l-2 border-sky-500 pl-3">
                <p className="font-bold text-slate-600">Sobat Niaga Support:</p>
                <p>Admin: 089654568782</p>
                <p>Alamat: Kampus Pusat - Niaga Center</p>
              </div>
              
              {/* RANDOM MOTIVASI SECTION */}
              <div className="p-4 bg-sky-50 rounded-xl border border-sky-100 relative text-center">
                <h4 className="text-[10px] font-black text-sky-600 mb-2 uppercase tracking-tighter flex items-center justify-center gap-1"><Sparkles size={12}/> Pesan Hangat Sobat-Niaga</h4>
                <p className="text-[11px] font-bold text-sky-700 italic">"{randomMotivation}"</p>
              </div>
            </div>
          </div>

          {/* Tombol Aksi Luar Struk */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <button 
              onClick={downloadReceiptImage}
              className="flex items-center justify-center gap-2 py-3.5 bg-sky-600 text-white font-bold rounded-2xl shadow-xl shadow-sky-200 active:scale-95 transition-all"
            >
              <Download size={20} /> Simpan Gambar
            </button>
            <button 
              onClick={() => {
                onPaymentSuccess();
              }}
              className={`py-3.5 font-bold rounded-2xl border transition-all active:scale-95 flex items-center justify-center gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
            >
              Selesai <ArrowLeft size={18} className="rotate-180" />
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-500 mt-6 font-medium uppercase tracking-widest opacity-50">SobatNiaga Digital Receipt System v1.0</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`shadow-sm sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Pembayaran Aman (Rekber)</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 lg:p-8 space-y-6">
        
        {/* Info Rekening SobatNiaga */}
        <div className={`p-6 rounded-2xl shadow-sm border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <div className={`flex items-center gap-2 mb-4 p-3 rounded-xl ${isDarkMode ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-50 text-sky-600'}`}>
            <ShieldCheck size={24} />
            <p className="text-xs font-bold">Pembayaran aman melalui Rekening Bersama SobatNiaga.</p>
          </div>

          {/* CYBERSECURITY WARNING - HARDCODED */}
          <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 flex gap-3 items-start">
            <ShieldAlert className="text-red-600 shrink-0" size={18} />
            <p className="text-[10px] font-extrabold text-red-700 dark:text-red-400 leading-tight uppercase">
              PENTING: Pastikan nama tujuan transfer adalah "SOBAT NIAGA" atau "PUSH MATE". Jika nama berbeda, JANGAN LANJUTKAN PEMBAYARAN!
            </p>
          </div>
          
          <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Transfer ke Rekening Pusat:</p>

          {/* Pilihan Metode Bayar */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <button 
              onClick={() => setPaymentMethod('transfer')}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'transfer' ? (isDarkMode ? 'border-sky-500 bg-sky-900/30 text-sky-400' : 'border-sky-600 bg-sky-50 text-sky-700') : (isDarkMode ? 'border-slate-700 bg-slate-900 text-gray-400 hover:border-slate-600' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200')}`}
            >
              <Banknote size={24} />
              <span className="text-xs font-bold">Transfer Bank</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('qris')}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'qris' ? (isDarkMode ? 'border-sky-500 bg-sky-900/30 text-sky-400' : 'border-sky-600 bg-sky-50 text-sky-700') : (isDarkMode ? 'border-slate-700 bg-slate-900 text-gray-400 hover:border-slate-600' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200')}`}
            >
              <CreditCard size={24} />
              <span className="text-xs font-bold">Scan QRIS</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('saldo')}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'saldo' ? (isDarkMode ? 'border-sky-500 bg-sky-900/30 text-sky-400' : 'border-sky-600 bg-sky-50 text-sky-700') : (isDarkMode ? 'border-slate-700 bg-slate-900 text-gray-400 hover:border-slate-600' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200')}`}
            >
              <Wallet size={24} />
              <span className="text-[10px] font-bold text-center leading-tight">Saldo Profil</span>
            </button>
          </div>

          {/* Detail Pembayaran Dinamis */}
          <div className={`rounded-xl p-4 border min-h-[160px] flex items-center justify-center transition-colors ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
            {orderData?.status === 'waiting_verification' ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 animate-bounce">
                  <CheckCircle size={24} />
                </div>
                <p className="font-bold text-sm text-green-600">Bukti Sudah Terkirim!</p>
                <p className="text-[10px] text-gray-500 mt-1">Pembayaranmu sedang diverifikasi admin.</p>
              </div>
            ) : !adminPaymentInfo ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="animate-spin text-sky-500" />
                <p className="text-[10px] text-gray-400">Memuat data pembayaran...</p>
              </div>
            ) : paymentMethod === 'saldo' ? (
              <div className="text-center animate-in zoom-in duration-300 w-full">
                <div className={`p-4 rounded-2xl border-2 border-dashed ${isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-sky-100 shadow-inner'}`}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Saldo Kamu Saat Ini</p>
                  <h3 className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Rp {(userProfile?.balance || 0).toLocaleString('id-ID')}
                  </h3>
                </div>
                {parseInt(userProfile?.balance || 0) < parseInt(orderData?.totalPrice || 0) ? (
                  <p className="text-[10px] text-red-500 font-bold mt-3 flex items-center justify-center gap-1">
                    <AlertCircle size={12} /> Saldo tidak cukup untuk membayar tagihan ini.
                  </p>
                ) : (
                  <p className="text-[10px] text-green-500 font-bold mt-3 flex items-center justify-center gap-1">
                    <CheckCircle size={12} /> Saldo cukup. Pembayaran akan langsung diverifikasi!
                  </p>
                )}
              </div>
            ) : paymentMethod === 'transfer' ? (
              <div className="flex justify-between items-center w-full animate-in fade-in duration-300">
                <div>
                  <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Transfer ke Bank {adminPaymentInfo?.bankName || '...'}</p>
                  <p className={`text-xl font-mono font-bold tracking-wider ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                    {adminPaymentInfo?.bankAccount || 'Loading...'}
                  </p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>a.n {adminPaymentInfo?.accountHolder || '...'}</p>
                </div>
                <button 
                  onClick={() => navigator.clipboard.writeText(adminPaymentInfo?.bankAccount || '')}
                  className={`p-2 rounded-lg shadow-sm transition-colors ${isDarkMode ? 'bg-slate-800 text-sky-400 hover:bg-slate-600' : 'bg-white text-sky-600 hover:bg-sky-50'}`}
                >
                  <Copy size={20} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center animate-in fade-in duration-300">
                {adminPaymentInfo?.qrisUrl ? (
                  <div className="relative group cursor-pointer" onClick={() => setIsZoomed(true)}>
                    <img
                      src={adminPaymentInfo.qrisUrl} 
                      alt="QRIS Seller" 
                      className="w-48 h-48 object-contain bg-white rounded-lg border border-gray-200" 
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-all rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <ZoomIn className="text-white drop-shadow-md" />
                    </div>
                  </div>
                ) : (
                  <div className={`w-48 h-48 rounded-lg flex items-center justify-center text-xs text-center p-4 ${isDarkMode ? 'bg-slate-600 text-gray-300' : 'bg-gray-200 text-gray-400'}`}>
                    QRIS belum tersedia.<br/>Gunakan Transfer Bank.
                  </div>
                )}
                <p className={`text-xs mt-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Scan menggunakan GoPay, OVO, Dana, dll</p>
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <p className={`text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {orderData?.status === 'waiting_verification' ? 'Total Pembayaran' : 'Total Tagihan'}
            </p>
            <h2 className={`font-price text-3xl font-black tracking-tight ${isDarkMode ? 'text-[#FFD662]' : 'text-sky-600'}`}>Rp {(orderData?.totalPrice || 0).toLocaleString('id-ID')}</h2>
            <div className={`mt-2 text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Harga: Rp {((orderData?.totalPrice || 0) - calculateAdminFee(orderData?.totalPrice || 0)).toLocaleString('id-ID')} +
              Admin: Rp {calculateAdminFee(orderData?.totalPrice || 0).toLocaleString('id-ID')}
            </div>
            {['waiting_payment', 'payment_rejected'].includes(orderData?.status) && (
              <div className={`flex items-center justify-center gap-2 mt-2 text-xs py-1 px-3 rounded-full inline-flex ${isDarkMode ? 'bg-orange-900/30 text-orange-300' : 'bg-orange-50 text-orange-600'}`}>
                <Clock size={12} /> Bayar sebelum 23:59 WIB
              </div>
            )}
          </div>
        </div>

        {/* Upload Bukti */}
        {['waiting_payment', 'payment_rejected'].includes(orderData?.status) && paymentMethod !== 'saldo' && (
        <div className={`p-6 rounded-2xl shadow-sm border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className={`font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Upload Bukti Transfer</h3>
          
          <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all relative ${isDarkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-50'}`}>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {proofPreview ? (
              <div className="relative w-full h-48">
                <img src={proofPreview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-bold opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                  Ganti Foto
                </div>
              </div>
            ) : (
              <>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isDarkMode ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>
                  <Upload size={24} />
                </div>
                <p className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Klik untuk upload foto</p>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Format JPG, PNG (Max 5MB)</p>
              </>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Bottom Action */}
      <div className={`fixed bottom-20 left-0 right-0 z-30 flex justify-center pointer-events-none`}>
          <div className={`px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold animate-bounce pointer-events-auto ${isDarkMode ? 'bg-slate-800 text-yellow-400 border border-slate-700' : 'bg-white text-orange-600 border border-orange-100'}`}>
              <Timer size={14}/>
              <span>Selesaikan dalam:</span>
              <span className="font-mono text-sm">{countdown}</span>
          </div>
      </div>

      {['waiting_payment', 'payment_rejected'].includes(orderData?.status) && (
      <div className={`fixed bottom-0 left-0 right-0 border-t p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-3xl mx-auto">
          <button onClick={handleConfirmPayment} disabled={isUploading} className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${isUploading ? (isDarkMode ? 'bg-sky-800 cursor-wait' : 'bg-sky-400 cursor-wait') : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200')}`}>
            {isUploading ? <><Loader2 size={20} className="animate-spin" /> {paymentMethod === 'saldo' ? 'Memproses...' : 'Mengirim Bukti...'}</> : 
             paymentMethod === 'saldo' ? 'Bayar Sekarang' : 'Konfirmasi Pembayaran'
            }
          </button>
        </div>
      </div>
      )}

      {/* Modal Zoom QRIS */}
      {isZoomed && adminPaymentInfo?.qrisUrl && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setIsZoomed(false)}>
          <button className="absolute top-4 right-4 text-white p-2"><X size={32} /></button>
          <img src={adminPaymentInfo.qrisUrl} alt="QRIS Fullscreen" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default Payment;