import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Save, Loader2, Home, Briefcase, Building2, User, Phone } from 'lucide-react';
import { db } from '../config/firebase';
import { ref, push, set, get, update } from 'firebase/database';
import Swal from 'sweetalert2';
import { useTheme } from '../context/ThemeContext';

const Address = ({ user, onBack }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [isLoading, setIsLoading] = useState(false);
  const [addressId, setAddressId] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    label: 'Rumah', // Default
    recipientName: user?.displayName || '',
    phoneNumber: user?.phoneNumber || '',
    provinceId: '',
    provinceName: '',
    cityId: '',
    cityName: '',
    districtId: '',
    districtName: '',
    fullAddress: '',
    postalCode: '',
  });

  // 0. Load Alamat Terakhir (Biar data gak ilang pas dibuka lagi)
  useEffect(() => {
    if (user?.uid) {
      const fetchAddress = async () => {
        try {
          const snapshot = await get(ref(db, `users/${user.uid}/addresses`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            // Ambil alamat yang paling terakhir dibuat/diupdate
            const keys = Object.keys(data);
            const lastKey = keys[keys.length - 1];
            const lastData = data[lastKey];
            
            setAddressId(lastKey);
            setFormData(prev => ({ ...prev, ...lastData }));
          }
        } catch (err) {
          console.error("Gagal memuat alamat:", err);
        }
      };
      fetchAddress();
    }
  }, [user]);

  // 1. Fetch Provinsi saat component mount
  useEffect(() => {
    fetch('https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json')
      .then(response => response.json())
      .then(data => setProvinces(data))
      .catch(err => console.error("Gagal ambil provinsi:", err));
  }, []);

  // 2. Fetch Kota saat Provinsi dipilih
  useEffect(() => {
    if (formData.provinceId) {
      fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${formData.provinceId}.json`)
        .then(response => response.json())
        .then(data => setCities(data))
        .catch(err => console.error("Gagal ambil kota:", err));
    } else {
      setCities([]);
    }
  }, [formData.provinceId]);

  // 3. Fetch Kecamatan saat Kota dipilih
  useEffect(() => {
    if (formData.cityId) {
      fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${formData.cityId}.json`)
        .then(response => response.json())
        .then(data => setDistricts(data))
        .catch(err => console.error("Gagal ambil kecamatan:", err));
    } else {
      setDistricts([]);
    }
  }, [formData.cityId]);

  // Handle Perubahan Input
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle Dropdown Wilayah (Simpan ID dan Nama sekaligus)
  const handleRegionChange = (e, type, list) => {
    const selectedId = e.target.value;
    const selectedItem = list.find(item => item.id === selectedId);
    
    if (type === 'province') {
      setFormData(prev => ({
        ...prev,
        provinceId: selectedId,
        provinceName: selectedItem?.name || '',
        cityId: '', cityName: '', // Reset anak-anaknya
        districtId: '', districtName: ''
      }));
    } else if (type === 'city') {
      setFormData(prev => ({
        ...prev,
        cityId: selectedId,
        cityName: selectedItem?.name || '',
        districtId: '', districtName: ''
      }));
    } else if (type === 'district') {
      setFormData(prev => ({
        ...prev,
        districtId: selectedId,
        districtName: selectedItem?.name || ''
      }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // Validasi Sederhana
    if (!formData.provinceId || !formData.cityId || !formData.fullAddress) {
      Swal.fire({
        icon: 'warning',
        title: 'Belum Lengkap',
        text: 'Mohon lengkapi alamat, provinsi, dan kota.',
        confirmButtonColor: '#0284c7'
      });
      setIsLoading(false);
      return;
    }

    try {
      if (addressId) {
        // Update alamat yang sudah ada (biar gak numpuk baru terus)
        await update(ref(db, `users/${user.uid}/addresses/${addressId}`), {
          ...formData,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Buat alamat baru pertama kali
        const newAddressRef = push(ref(db, `users/${user.uid}/addresses`));
        await set(newAddressRef, {
          ...formData,
          createdAt: new Date().toISOString()
        });
      }

      await Swal.fire({
        icon: 'success',
        title: 'Sip!',
        text: 'Alamat Berhasil Disimpan',
        timer: 2000,
        showConfirmButton: false
      });
      onBack(); // Kembali ke menu sebelumnya
    } catch (error) {
      console.error("Error saving address:", error);
      
      let errorMsg = 'Waduh, koneksi lagi bermasalah nih';
      if (error.message.includes('PERMISSION_DENIED')) errorMsg = '❌ Waduh! Firebase Lagi Dikunci';

      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: errorMsg,
        confirmButtonColor: '#0284c7'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)' }}>
      {/* Header */}
      <div className={`shadow-sm sticky top-0 z-50 border-b transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-sky-100 border-sky-200'}`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className={`transition-colors ${isDarkMode ? 'text-gray-300 hover:text-sky-400' : 'text-gray-600 hover:text-sky-600'}`}>
            <ArrowLeft size={24} />
          </button>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>Tambah Alamat Baru</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 lg:p-8">
        <form onSubmit={handleSave} className={`rounded-2xl shadow-sm border p-6 space-y-6 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          
          {/* Label Alamat */}
          <div>
            <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Label Alamat</label>
            <div className="flex gap-3">
              {['Rumah', 'Kantor', 'Kost'].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFormData({ ...formData, label })}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                    formData.label === label
                      ? (isDarkMode ? 'bg-sky-900/50 border-sky-500 text-sky-400' : 'bg-sky-50 border-sky-500 text-sky-600')
                      : (isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-400 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')
                  }`}
                >
                  {label === 'Rumah' && <Home size={16} />}
                  {label === 'Kantor' && <Building2 size={16} />}
                  {label === 'Kost' && <Briefcase size={16} />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Informasi Penerima */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <User size={16} className="text-gray-400" /> Nama Penerima
              </label>
              <input
                type="text"
                name="recipientName"
                value={formData.recipientName}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`}
                placeholder="Nama Lengkap"
                required
              />
            </div>
            <div className="space-y-2">
              <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <Phone size={16} className="text-gray-400" /> Nomor Telepon
              </label>
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`}
                placeholder="08xx-xxxx-xxxx"
                required
              />
            </div>
          </div>

          <div className="border-t border-gray-100 my-2"></div>

          {/* Detail Lokasi (Dropdown Dinamis) */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Provinsi</label>
              <div className="relative">
                <select
                  value={formData.provinceId}
                  onChange={(e) => handleRegionChange(e, 'province', provinces)}
                  className={`w-full px-4 py-3 rounded-xl border outline-none appearance-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`}
                  required
                >
                  <option value="">Pilih Provinsi</option>
                  {provinces.map(prov => (
                    <option key={prov.id} value={prov.id}>{prov.name}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">▼</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Kota / Kabupaten</label>
                <div className="relative">
                  <select
                    value={formData.cityId}
                    onChange={(e) => handleRegionChange(e, 'city', cities)}
                    disabled={!formData.provinceId}
                    className={`w-full px-4 py-3 rounded-xl border outline-none appearance-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50 disabled:bg-slate-800 disabled:text-gray-500' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-gray-100 disabled:text-gray-400'}`}
                    required
                  >
                    <option value="">Pilih Kota/Kabupaten</option>
                    {cities.map(city => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">▼</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Kecamatan</label>
                <div className="relative">
                  <select
                    value={formData.districtId}
                    onChange={(e) => handleRegionChange(e, 'district', districts)}
                    disabled={!formData.cityId}
                    className={`w-full px-4 py-3 rounded-xl border outline-none appearance-none transition-all ${isDarkMode ? 'bg-slate-700 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50 disabled:bg-slate-800 disabled:text-gray-500' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-gray-100 disabled:text-gray-400'}`}
                    required
                  >
                    <option value="">Pilih Kecamatan</option>
                    {districts.map(dist => (
                      <option key={dist.id} value={dist.id}>{dist.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">▼</div>
                </div>
              </div>
            </div>
          </div>

          {/* Alamat Lengkap */}
          <div className="space-y-2">
            <label className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              <MapPin size={16} className="text-gray-400" /> Alamat Lengkap
            </label>
            <textarea
              name="fullAddress"
              value={formData.fullAddress}
              onChange={handleChange}
              rows="3"
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`}
              placeholder="Nama Jalan, No. Rumah, RT/RW, Patokan..."
              required
            ></textarea>
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Kode Pos</label>
            <input
              type="number"
              name="postalCode"
              value={formData.postalCode}
              onChange={handleChange}
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-600 text-gray-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-900/50' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'}`}
              placeholder="Contoh: 12345"
            />
          </div>

          {/* Tombol Simpan */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${
                isLoading 
                  ? (isDarkMode ? 'bg-sky-800 cursor-wait' : 'bg-sky-400 cursor-wait') 
                  : (isDarkMode ? 'bg-sky-500 hover:bg-sky-600 shadow-none' : 'bg-sky-600 hover:bg-sky-700 shadow-sky-200')
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Save size={20} /> Simpan Alamat
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default Address;