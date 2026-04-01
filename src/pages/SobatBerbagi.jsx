import React, { useState, useEffect } from 'react';
import { ArrowLeft, HeartHandshake, QrCode, Loader2, Info, AlertCircle } from 'lucide-react';
import { db, dbFirestore } from '../config/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, update } from 'firebase/database';
import Swal from 'sweetalert2';
import QRCode from 'react-qr-code'; // Install: npm install react-qr-code

const SobatBerbagi = ({ user, onBack }) => {
  const [points, setPoints] = useState(0);
  const [activeVoucher, setActiveVoucher] = useState(null);
  const [config, setConfig] = useState({ packageA_price: 15000, packageB_price: 10000 });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    // Listen Emergency Points
    const userRef = ref(db, `users/${user.uid}`);
    onValue(userRef, (snap) => {
      if(snap.exists()) setPoints(snap.val().emergencyPoints ?? 20);
    });

    // Get Config
    getDoc(doc(dbFirestore, 'sharing_configs', 'global')).then(s => {
      if (s.exists()) setConfig(s.data());
    });
  }, [user]);

  const handleClaim = async (type) => {
    // Langsung tentukan biaya poin (A=5, B=2)
    const cost = type === 'A' ? 5 : 2;
    if (points < cost) {
      return Swal.fire('Poin Kurang', 'Poin kamu tidak cukup, Bro!', 'warning');
    }

    setIsLoading(true);
    try {
      // Buat voucher di Firestore
      const docRef = await addDoc(collection(dbFirestore, 'sobat_berbagi'), {
        studentId: user.uid,
        userName: user.displayName,
        packageType: type,
        price: type === 'A' ? (config.packageA_price || 15000) : (config.packageB_price || 10000),
        isUsed: false,
        createdAt: serverTimestamp()
      });

      // Potong Poin
      await update(ref(db, `users/${user.uid}`), { emergencyPoints: points - cost });

      setActiveVoucher({ id: docRef.id, type, qrData: `${docRef.id}|${type}` });
      Swal.fire('Berhasil Klaim!', 'Tunjukkan QR Code ke Toko Mitra.', 'success');
    } catch (e) {
      console.error(e);
      Swal.fire('Error', e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <button onClick={onBack} className="mb-4"><ArrowLeft /></button>
        
        <div className="bg-sky-600 rounded-2xl p-6 text-white shadow-lg mb-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2"><HeartHandshake /> Sobat Berbagi</h2>
            <div className="text-right">
              <p className="text-[10px] opacity-80">Poin Darurat</p>
              <p className="text-2xl font-black">{points}</p>
            </div>
          </div>
        </div>

        {activeVoucher ? (
          <div className="bg-white rounded-2xl p-8 text-center border shadow-sm animate-in zoom-in">
            <h3 className="font-bold mb-2">Voucher Paket {activeVoucher.type}</h3>
            <div className="bg-white p-4 inline-block rounded-xl border-4 border-sky-100 mb-4">
              <QRCode value={activeVoucher.qrData} size={200} />
            </div>
            <p className="text-xs text-gray-500 font-mono mb-4">ID: {activeVoucher.id}</p>
            <button onClick={() => setActiveVoucher(null)} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm cursor-pointer hover:bg-gray-200">Tutup</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between">
              <div>
                <h4 className="font-bold text-gray-800">Paket A (Sembako)</h4>
                <p className="text-xs text-gray-500">Beras 1kg, Telur, Mie Instan</p>
                <span className="inline-block mt-2 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">-5 Poin</span>
              </div>
              <button onClick={() => handleClaim('A')} disabled={isLoading} className="bg-sky-600 text-white px-4 py-2 rounded-xl font-bold text-sm cursor-pointer hover:bg-sky-700 transition-colors">Klaim</button>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between">
              <div>
                <h4 className="font-bold text-gray-800">Paket B (Makanan)</h4>
                <p className="text-xs text-gray-500">Nasi Kotak + Minum</p>
                <span className="inline-block mt-2 text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">-2 Poin</span>
              </div>
              <button onClick={() => handleClaim('B')} disabled={isLoading} className="bg-sky-600 text-white px-4 py-2 rounded-xl font-bold text-sm cursor-pointer hover:bg-sky-700 transition-colors">Klaim</button>
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-100 rounded-2xl flex gap-3">
          <Info className="text-yellow-600 shrink-0" size={20} />
          <div>
            <p className="text-xs font-bold text-yellow-800">Cara Klaim:</p>
            <ol className="text-[10px] text-yellow-700 list-decimal pl-4 mt-1">
              <li>Pilih paket bantuan yang sedang kamu butuhkan saat ini.</li>
              <li>Pastikan Kasir sudah men-scan voucher Anda.</li>
              <li>Poin akan terpotong otomatis setelah klaim berhasil.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SobatBerbagi;