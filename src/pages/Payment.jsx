import React, { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard, Upload, CheckCircle, Loader2, Copy, Clock, ShieldCheck, ZoomIn, X, Banknote } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, get, update } from 'firebase/database';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const calculateAdminFee = (amount) => {
  if (amount < 15000) return 500;
  return 2000;
};

const Payment = ({ order, onBack, onPaymentSuccess }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [orderData, setOrderData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('transfer'); // 'transfer' | 'qris'
  const [isZoomed, setIsZoomed] = useState(false);
  const [adminPaymentInfo, setAdminPaymentInfo] = useState(null);

  useEffect(() => {
    if (order?.id) {
      const fetchOrder = async () => {
        try {
          const snapshot = await get(ref(db, `orders/${order.id}`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            setOrderData(data);
          }
        } catch (error) {
          console.error("Error fetching order:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchOrder();
    }
  }, [order]);

  // Fetch Data Rekening Pusat (Admin Rekber) dari Firebase
  useEffect(() => {
    const fetchAdminInfo = async () => {
      const snapshot = await get(ref(db, 'admin/paymentInfo'));
      if (snapshot.exists()) {
        setAdminPaymentInfo(snapshot.val());
      }
    };
    fetchAdminInfo();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const uploadToCloudinary = async (file) => {
    const cloudName = 'djqnnguli';
    const apiKey = '156244598362341';
    const apiSecret = 'INGJr-KgmBPNwqwBYFZy9w7Fa18';
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
    if (!proofFile) {
      Swal.fire('Bukti Transfer Kosong', 'Mohon upload screenshot bukti transfer dulu ya.', 'warning');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload Bukti
      const proofUrl = await uploadToCloudinary(proofFile);

      // 2. Update Status ke 'waiting_verification'
      await update(ref(db, `orders/${order.id}`), {
        status: 'waiting_verification',
        proofUrl: proofUrl,
        paidAt: new Date().toISOString()
      });

      Swal.fire({
        icon: 'success',
        title: 'Bukti Terkirim!',
        text: 'Sistem sedang memverifikasi pembayaranmu...',
        timer: 2000,
        showConfirmButton: false
      });

      onPaymentSuccess();
    } catch (error) {
      console.error("Payment error:", error);
      Swal.fire('Gagal', 'Terjadi kesalahan saat upload bukti.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) return <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}><Loader2 className="animate-spin text-sky-600" /></div>;
  if (!orderData) return null;

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
          
          <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Transfer ke Rekening Pusat:</p>

          {/* Pilihan Metode Bayar */}
          <div className="grid grid-cols-2 gap-3 mb-6">
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
          </div>

          {/* Detail Pembayaran Dinamis */}
          <div className={`rounded-xl p-4 border transition-colors ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
            {paymentMethod === 'transfer' ? (
              <div className="flex justify-between items-center">
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
              <div className="flex flex-col items-center">
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
                    QRIS Admin belum tersedia.<br/>Silakan gunakan Transfer Bank.
                  </div>
                )}
                <p className={`text-xs mt-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Scan menggunakan GoPay, OVO, Dana, dll</p>
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <p className={`text-sm mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Tagihan</p>
            <h2 className={`font-price text-3xl font-bold ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>Rp {orderData.totalPrice?.toLocaleString('id-ID')}</h2>
            <div className={`mt-2 text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Harga: Rp {(orderData.totalPrice - calculateAdminFee(orderData.totalPrice)).toLocaleString('id-ID')} + 
              Admin: Rp {calculateAdminFee(orderData.totalPrice).toLocaleString('id-ID')}
            </div>
            <div className={`flex items-center justify-center gap-2 mt-2 text-xs py-1 px-3 rounded-full inline-flex ${isDarkMode ? 'bg-orange-900/30 text-orange-300' : 'bg-orange-50 text-orange-600'}`}>
              <Clock size={12} /> Bayar sebelum 23:59 WIB
            </div>
          </div>
        </div>

        {/* Upload Bukti */}
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
      </div>

      {/* Bottom Action */}
      <div className={`fixed bottom-0 left-0 right-0 border-t p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="max-w-3xl mx-auto">
          <button onClick={handleConfirmPayment} disabled={isUploading} className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${isUploading ? (isDarkMode ? 'bg-sky-800 cursor-wait' : 'bg-sky-400 cursor-wait') : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200')}`}>
            {isUploading ? <><Loader2 size={20} className="animate-spin" /> Mengirim Bukti...</> : 'Konfirmasi Pembayaran'}
          </button>
        </div>
      </div>

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