import React, { useState } from 'react';
import { X, Star, ShoppingCart, MessageCircle, ShieldCheck, Zap, Cpu, Battery, Smartphone, Loader2 } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, get } from 'firebase/database';
import Swal from 'sweetalert2';

const ProductDetailModal = ({ product, isOpen, onClose, user, onGoToCart }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedColor, setSelectedColor] = useState('Titanium Grey');
  const [selectedSize, setSelectedVariant] = useState('256GB');

  if (!isOpen || !product) return null;

  const {
    name = 'Nama Produk',
    price = 0,
    description = 'Tidak ada deskripsi produk.',
    mediaUrl,
    image,
    storeName = 'Toko',
    rating = 4.8,
    category = 'Kategori',
  } = product;

  const displayImage = mediaUrl || image || 'https://via.placeholder.com/400';
  const displayPrice = parseInt(price).toLocaleString('id-ID');

  const handleAddToCart = async () => {
    if (!user) {
      Swal.fire({ icon: 'warning', title: 'Login Dulu', text: 'Silakan login untuk belanja', confirmButtonColor: '#0284c7' });
      return;
    }

    setIsAdding(true);
    try {
      const cartRef = ref(db, `users/${user.uid}/cart`);
      const cartSnap = await get(cartRef);
      
      if (cartSnap.exists()) {
        const currentCart = cartSnap.val();
        const existingItemKey = Object.keys(currentCart).find(key => currentCart[key].productId === product.id);
        if (existingItemKey) {
          Swal.fire({ title: 'Sudah di Keranjang', text: 'Produk ini sudah ada di keranjangmu.', icon: 'info', showCancelButton: true, confirmButtonText: 'Lihat Keranjang' }).then((res) => { if (res.isConfirmed) onGoToCart(); });
          setIsAdding(false);
          return;
        }
      }

      await push(cartRef, { productId: product.id, name, price: parseInt(price), image: displayImage, quantity: 1, storeName, sellerId: product.sellerId, selected: true, createdAt: new Date().toISOString() });
      Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Masuk keranjang 🛒', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'Gagal', text: 'Terjadi kesalahan.' });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col md:flex-row max-h-[90vh]">
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-6 right-6 z-10 p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-500 hover:text-red-500 transition-all shadow-sm">
          <X size={24} />
        </button>

        {/* Sisi Kiri: Konten Visual */}
        <div className="w-full md:w-1/2 p-10 flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-800/30">
          <div className="relative w-full aspect-square max-w-[420px] rounded-[3rem] bg-white dark:bg-slate-800 shadow-xl flex items-center justify-center p-12 overflow-hidden group">
            <img src={displayImage} alt={name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700" />
          </div>
          <p className="mt-8 text-sm font-bold text-gray-400 uppercase tracking-widest">
            Pilihan: <span className="text-sky-600">{selectedColor}</span>
          </p>
        </div>

        {/* Sisi Kanan: Konten Informasi */}
        <div className="w-full md:w-1/2 p-10 md:p-14 overflow-y-auto flex flex-col">
          <div className="mb-auto">
            <span className="text-[11px] font-black text-sky-600 uppercase tracking-[0.3em] mb-3 block">{category} Official</span>
            <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white leading-tight mb-4">{name}</h1>
            
            <div className="flex items-center gap-3 mb-8">
              <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1.5 rounded-xl border border-yellow-400/20">
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
                <span className="text-base font-black text-yellow-700 dark:text-yellow-500">{rating}</span>
              </div>
              <span className="text-sm font-bold text-gray-400">1.5k Terjual</span>
            </div>

            <div className="mb-10">
              <span className="text-4xl font-black text-sky-600 tracking-tighter">Rp {displayPrice}</span>
              <p className="text-xs text-gray-400 mt-2 font-medium line-clamp-3">{description}</p>
            </div>

            {/* Varian Warna */}
            <div className="mb-6">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Warna</label>
                <div className="flex gap-3">
                    {['Titanium Grey', 'Midnight', 'Silver'].map(c => (
                        <button key={c} onClick={() => setSelectedColor(c)} className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedColor === c ? 'bg-sky-600 border-sky-600 text-white shadow-lg shadow-sky-200' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500'}`}>{c}</button>
                    ))}
                </div>
            </div>

            {/* Spek Unggulan */}
            <div className="bg-gray-50 dark:bg-slate-800/80 rounded-3xl p-6 border border-gray-100 dark:border-slate-700 grid grid-cols-2 gap-6 mb-10">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white dark:bg-slate-700 rounded-xl shadow-sm"><Cpu size={20} className="text-sky-500" /></div>
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Processor</p>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">A17 Pro Chip</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white dark:bg-slate-700 rounded-xl shadow-sm"><Battery size={20} className="text-green-500" /></div>
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Battery</p>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Video up to 29h</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white dark:bg-slate-700 rounded-xl shadow-sm"><Smartphone size={20} className="text-purple-500" /></div>
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Camera</p>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">48MP Main</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white dark:bg-slate-700 rounded-xl shadow-sm"><ShieldCheck size={20} className="text-emerald-500" /></div>
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Security</p>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Face ID</p>
                    </div>
                </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-6 border-t dark:border-slate-800">
            <button onClick={handleAddToCart} disabled={isAdding} className="flex-[3] bg-sky-600 hover:bg-sky-700 text-white font-black py-5 rounded-[1.25rem] shadow-2xl shadow-sky-200 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-wider text-sm">
              {isAdding ? <Loader2 className="animate-spin" size={20} /> : <><ShoppingCart size={20} /> Tambah Ke Keranjang</>}
            </button>
            <button className="flex-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 py-5 rounded-[1.25rem] hover:bg-gray-200 transition-all flex items-center justify-center"><MessageCircle size={24} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;