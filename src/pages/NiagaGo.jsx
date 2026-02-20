import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bike, MapPin, Navigation, Phone, User, Clock, Wallet, AlertCircle, Upload, Shield, CheckSquare, DollarSign, Star, FileText, X,
  Image as ImageIcon, LocateFixed, Globe, Layers, Loader2, Car, Download, Camera, Trash2, ArrowLeft, Eye, Utensils 
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Swal from 'sweetalert2';
import { auth, db as realDb, dbFirestore } from '../config/firebase';
import { ref, onValue, update, get, push, runTransaction, query as realQuery, orderByChild, equalTo } from 'firebase/database';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, orderBy, serverTimestamp, arrayUnion } from 'firebase/firestore';
// import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- KONSTANTA ZONA (RADIUS) ---
const ZONE_RADIUS = 5000; // 5000 meter (5 KM). Ubah ke 50 jika ingin sangat dekat.

// --- KONFIGURASI PETA & ICON ---

// Fix bug icon default Leaflet di React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper: Hitung Biaya Admin
const calculateAdminFee = (amount) => {
  if (amount < 15000) return 500;
  return 2000;
};

// Custom Icon Motor (Biar Keren!)
const motorIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1986/1986937.png', 
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

const carIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1048/1048314.png', 
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

// Custom Radar Icon (CSS Animation)
const radarIcon = L.divIcon({
  className: 'custom-radar',
  html: '<div class="radar-pin"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// Inject CSS for Radar
const RadarStyle = () => (
  <style>{`
    @keyframes pulse-ring {
      0% { transform: scale(0.33); opacity: 0.8; }
      80%, 100% { opacity: 0; transform: scale(2.5); }
    }
    .radar-pin {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #0ea5e9;
      position: relative;
      box-shadow: 0 0 0 10px rgba(14, 165, 233, 0.2);
    }
    .radar-pin::after {
      content: '';
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #0ea5e9;
      animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    }
    /* Smooth Marker Movement */
    .leaflet-marker-icon {
      transition: transform 0.5s linear;
    }
  `}</style>
);

// Helper: Format Duration (Menit -> Jam Menit)
const formatDuration = (minutes) => {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h} Jam ${m} Menit`;
  return `${m} Menit`;
};

// Helper to identify Niaga Food orders
const isNiagaFood = (order) => (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).some(i => i.category === 'Niaga Food');

// Helper: Auto Recenter Peta pas Driver Gerak
const RecenterMap = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center);
  }, [center, map]);
  return null;
};

// Helper: Component untuk menangkap center map saat digeser (Picker Mode)
const MapPickerCenter = ({ onChange }) => {
  const map = useMap();
  useEffect(() => {
    onChange(map.getCenter()); // Init center saat map dibuka
    const onMove = () => onChange(map.getCenter());
    map.on('move', onMove);
    return () => map.off('move', onMove);
  }, [map, onChange]);
  return null;
};

// Helper: Layer Control (Satellite/Street)
const MapLayerControl = () => {
  const [isSatellite, setIsSatellite] = useState(false);

  return (
    <>
      <TileLayer
        attribution={isSatellite ? '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' : '&copy; OpenStreetMap'}
        url={isSatellite 
          ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        }
      />
      <button 
        onClick={() => setIsSatellite(!isSatellite)}
        className="absolute bottom-20 right-4 z-[1000] bg-white p-3 rounded-full shadow-lg text-gray-600 hover:text-sky-600 hover:bg-gray-50 transition-all border border-gray-100"
        title={isSatellite ? "Mode Jalan" : "Mode Satelit"}
      >
        {isSatellite ? <Layers size={24} /> : <Globe size={24} />}
      </button>
    </>
  );
};

// Helper: Search Control (Custom Overlay)
const MapSearchControl = () => {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=id&addressdetails=1`);
      if (!response.ok) throw new Error("Gagal mengambil data lokasi");
      const data = await response.json();
      setResults(data);
    } catch (err) {
      console.debug("Search Error (Nominatim):", err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (lat, lon) => {
    map.flyTo([lat, lon], 16);
    setResults([]);
    setQuery(''); 
  };

  return (
    <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-2">
      <form onSubmit={handleSearch} className="relative shadow-lg rounded-xl">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari lokasi (cth: Kampus, Stasiun)..." 
          className="w-full p-3 pl-10 pr-10 rounded-2xl border-none outline-none text-sm font-medium bg-white/95 backdrop-blur-sm focus:bg-white transition-all text-gray-800 shadow-lg placeholder:text-gray-400"
        />
        <div className="absolute left-3 top-3 text-gray-400"><LocateFixed size={18} /></div>
        {query && (
            <button type="button" onClick={() => {setQuery(''); setResults([]);}} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                <X size={18} />
            </button>
        )}
      </form>
      
      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto border border-gray-100">
          {results.map((res, idx) => (
            <div 
              key={idx} 
              onClick={() => handleSelect(res.lat, res.lon)}
              className="p-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer text-xs text-gray-700 flex items-center gap-2"
            >
              <MapPin size={14} className="text-red-500 shrink-0" />
              <span className="line-clamp-2">{res.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper: My Location Button
const MyLocationControl = () => {
  const map = useMap();
  
  const handleLocate = () => {
    map.locate({setView: true, maxZoom: 16});
  };

  return (
    <button 
      onClick={handleLocate}
      className="absolute bottom-6 right-4 z-[1000] bg-white p-3 rounded-full shadow-lg text-gray-600 hover:text-sky-600 hover:bg-gray-50 transition-all border border-gray-100"
      title="Lokasi Saya"
    >
      <Navigation size={24} className="fill-sky-600 text-sky-600" />
    </button>
  );
};

// Helper: Auto Locate on Mount (If Permission Granted)
const AutoLocate = () => {
  const map = useMap();
  useEffect(() => {
    if ("geolocation" in navigator && "permissions" in navigator) {
        navigator.permissions.query({ name: 'geolocation' }).then((result) => {
            if (result.state === 'granted') {
                map.locate({ setView: true, maxZoom: 16 });
            }
        });
    }
  }, [map]);
  return null;
};

// Helper: Nearby Drivers Layer (Live Standby Drivers)
const NearbyDrivers = ({ driversLocations, center }) => {
  if (!driversLocations || !center) return null;

  const activeDrivers = Object.keys(driversLocations).map(key => ({
    id: key,
    ...driversLocations[key]
  })).filter(d => {
      // 1. Cek Driver Aktif (Update < 15 menit lalu)
      const lastUpdate = d.updatedAt || 0;
      const isActive = (Date.now() - lastUpdate) < 15 * 60 * 1000; 
      if (!isActive) return false;

      // Check valid coordinates
      if (!d.lat || !d.lng) return false;

      // 2. Cek Jarak (Zona)
      // Pastikan icon motor hanya muncul jika dalam radius ZONE_RADIUS
      const dist = L.latLng(d.lat, d.lng).distanceTo(L.latLng(center));
      return dist <= ZONE_RADIUS;
  });

  return (
    <>
      {activeDrivers.map(driver => (
        <Marker 
            key={driver.id} 
            position={[driver.lat, driver.lng]} 
            icon={driver.vehicleType === 'mobil' ? carIcon : motorIcon}
        >
            <Tooltip direction="top" offset={[0, -30]} opacity={1} permanent>
               <span className="font-bold text-xs">{driver.name || 'Driver'}</span>
            </Tooltip>
            <Popup>{driver.status === 'busy' ? 'Driver Sedang Mengantar' : 'Driver Siap (Standby)'}</Popup>
        </Marker>
      ))}
    </>
  );
};

// --- KOMPONEN LIVE TRACKING MAP ---
const TrackingMap = ({ driverId, pickupCoords, status, driversLocations }) => {
  const [driverPos, setDriverPos] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [showNearby, setShowNearby] = useState(false);

  useEffect(() => {
    // 1. Ambil Lokasi User (Sekali aja buat patokan)
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        (err) => {
            // Suppress common errors (1: Denied, 2: Unavailable, 3: Timeout)
            if (err.code !== 1 && err.code !== 2 && err.code !== 3) console.debug("Gagal ambil lokasi user:", err.message);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }

    // 2. Listen Lokasi Driver Realtime dari Firebase
    const driverLocRef = ref(realDb, `drivers_locations/${driverId}`);
    const unsubscribe = onValue(driverLocRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.lat && data.lng) {
        setDriverPos([data.lat, data.lng]);
        setDriverInfo(data);
      }
    });
    return () => unsubscribe();
  }, [driverId]);

  // Center logic
  const center = driverPos || pickupCoords || userPos;
  if (!center) return <div className="p-4 text-center text-xs text-gray-500 bg-gray-100 rounded-lg animate-pulse">📡 Memuat Peta...</div>;

  return (
    <div className="h-56 w-full rounded-xl overflow-hidden mt-3 border border-gray-200 shadow-inner relative z-0">
       <RadarStyle />
       <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} dragging={true}>
        <MapLayerControl />
        
        {/* Pickup Marker */}
        {(pickupCoords || userPos) && <Marker position={pickupCoords || userPos}><Popup>Titik Jemput</Popup></Marker>}

        {/* Radar & Nearby Drivers for Pending Status */}
        {((status === 'pending' && (pickupCoords || userPos)) || showNearby) && (
            <>
                {status === 'pending' && (
                  <>
                    <Marker position={pickupCoords || userPos} icon={radarIcon} />
                    <Circle center={pickupCoords || userPos} radius={2000} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.1, weight: 1 }} />
                  </>
                )}
                <NearbyDrivers driversLocations={driversLocations} center={pickupCoords || userPos} />
            </>
        )}

        {/* Assigned Driver */}
        {driverPos && (
          <Marker position={driverPos} icon={driverInfo?.vehicleType === 'mobil' ? carIcon : motorIcon}>
             <Tooltip direction="top" offset={[0, -30]} opacity={1} permanent>
                <span className="font-bold text-xs">{driverInfo?.name || 'Driver Anda'}</span>
             </Tooltip>
             <Popup>Driver NiagaGo</Popup>
          </Marker>
        )}
        
        <RecenterMap center={driverPos || (status === 'pending' ? (pickupCoords || userPos) : null)} />
      </MapContainer>

      {/* Tombol Lihat Driver Sekitar (Fitur Baru) */}
      <button 
        onClick={() => setShowNearby(!showNearby)}
        className="absolute top-4 right-4 z-[400] bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-md text-xs font-bold text-gray-700 flex items-center gap-1 hover:bg-white border border-gray-200"
      >
        <Eye size={14} className={showNearby ? "text-sky-500" : "text-gray-500"} />
        {showNearby ? 'Sembunyikan Driver' : 'Lihat Driver Sekitar'}
      </button>
    </div>
  );
};

// --- KOMPONEN KARTU PENAWARAN DRIVER (InDrive Style) ---
const OfferCard = ({ offer, onAccept, onTimeout }) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  useEffect(() => {
    const duration = 15000; // 15 Detik
    const interval = 100; // Update tiap 100ms biar smooth
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const pct = (currentStep / steps) * 100;
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        setVisible(false); // Hilangkan kartu jika waktu habis
        if (onTimeout) onTimeout();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [onTimeout]);

  if (!visible) return null;

  return (
    <div className={`p-3 rounded-xl border shadow-sm mb-2 relative overflow-hidden animate-in slide-in-from-bottom-2 ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-3 relative z-10">
        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
           <img src={offer.driverPhoto || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" alt="Driver" />
        </div>
        <div className="flex-1">
           <h4 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{offer.driverName}</h4>
           <div className="flex items-center gap-1 text-xs text-yellow-500">
              <Star size={10} fill="currentColor" /> 5.0 <span className="text-gray-400">• {offer.vehicleType === 'mobil' ? 'Mobil' : 'Motor'}</span>
           </div>
        </div>
        <div className="text-right">
           <p className="font-bold text-sky-600">Rp {(offer.price || 0).toLocaleString('id-ID')}</p>
        </div>
      </div>
      
      <button 
        onClick={onAccept}
        className="mt-3 w-full relative h-9 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden group"
      >
        {/* Progress Bar Animation */}
        <div 
            className="absolute top-0 left-0 h-full bg-sky-500/20 dark:bg-sky-500/40 transition-all ease-linear"
            style={{ width: `${progress}%`, transitionDuration: '100ms' }}
        ></div>
        <span className="relative z-10 text-xs font-bold text-sky-600 dark:text-sky-400 group-hover:text-sky-700">Terima Tawaran</span>
      </button>
    </div>
  );
};

const NiagaGo = ({ onOpenProfile }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();
  
  // State User & Role
  const [userProfile, setUserProfile] = useState(null);
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverService, setDriverService] = useState('ojek'); // 'ojek' | 'food'
  const [userLocation, setUserLocation] = useState(null); // Lokasi GPS User (Untuk proteksi order jauh)

  // State Form Order
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false); // State loading GPS
  const [vehicleType, setVehicleType] = useState('motor'); // 'motor' | 'mobil'
  const [estDistance, setEstDistance] = useState(null);
  const [estDuration, setEstDuration] = useState(null);
  
  // State Map Picker & Coordinates
  const [pickupCoords, setPickupCoords] = useState(null); // {lat, lng}
  const [destCoords, setDestCoords] = useState(null); // {lat, lng}
  const [mapPickerMode, setMapPickerMode] = useState(null); // 'pickup' | 'destination'
  const [tempPickerCenter, setTempPickerCenter] = useState(null); // Center sementara saat geser map

  // State Data
  const [orders, setOrders] = useState([]);
  const [driversLocations, setDriversLocations] = useState({});
  const [foodDeliveries, setFoodDeliveries] = useState([]); // State untuk orderan Niaga Food
  const [activeFoodOrders, setActiveFoodOrders] = useState([]); // State untuk orderan Food yang SEDANG diambil driver

  // State Withdrawal
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawData, setWithdrawData] = useState({ bank: '', number: '', name: '', amount: '' });

  // State Registration Driver
  const [viewMode, setViewMode] = useState('main'); // 'main' | 'register'
  const [regForm, setRegForm] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    plateNumber: '', // Plat nomor
    services: { niagaGo: true, niagaFood: false } // Default NiagaGo dicentang
  });
  const [ktmFile, setKtmFile] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [latestReg, setLatestReg] = useState(null);
  const [viewingRouteOrder, setViewingRouteOrder] = useState(null); // State untuk Driver lihat rute
  const [adminPaymentInfo, setAdminPaymentInfo] = useState(null); // Info Rekber Admin
  
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // State untuk loading tombol aksi driver
  const [takingOrderId, setTakingOrderId] = useState(null); // State untuk loading ambil order
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState(null);
  const [showQrisModal, setShowQrisModal] = useState(false);

  // Prefill Form Pendaftaran saat User Profile dimuat
  useEffect(() => {
    if (userProfile) {
      setRegForm(prev => ({
        ...prev,
        name: userProfile.displayName || '',
        email: userProfile.email || '',
        phone: userProfile.phoneNumber || ''
      }));
    }

    // Cek Status Pendaftaran Terakhir
    if (userProfile?.uid) {
      const q = query(collection(dbFirestore, 'driver_registrations'), where('userId', '==', userProfile.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => doc.data());
        if (docs.length > 0) {
          // Ambil yang paling baru
          docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setLatestReg(docs[0]);
        }
      });
      return () => unsubscribe();
    }
  }, [userProfile]);

  // Fetch Admin Payment Info (Rekber)
  useEffect(() => {
    const infoRef = ref(realDb, 'admin/settings');
    onValue(infoRef, (snap) => {
        if(snap.exists()) setAdminPaymentInfo(snap.val());
    });
  }, []);

  // --- GET USER LOCATION (GPS) ---
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.debug("GPS User Error:", err.message)
      );
    }
  }, []);

  // --- 1. FETCH USER DATA (REALTIME DB) ---
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Ganti ke onValue agar saldo update realtime
        const userRef = ref(realDb, `users/${user.uid}`);
        onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserProfile({ uid: user.uid, ...snapshot.val() });
          } else {
            // Fallback jika data belum lengkap di DB
            setUserProfile({ uid: user.uid, displayName: user.displayName, phoneNumber: user.phoneNumber });
          }
        });
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- FETCH DRIVERS LOCATIONS (GLOBAL) ---
  useEffect(() => {
    const driversRef = ref(realDb, 'drivers_locations');
    const unsubscribe = onValue(driversRef, (snapshot) => {
      if (snapshot.exists()) {
        setDriversLocations(snapshot.val());
      } else {
        setDriversLocations({});
      }
    });
    return () => unsubscribe();
  }, []);

  // --- FETCH FOOD DELIVERIES (REALTIME DB) ---
  useEffect(() => {
    if (isDriverMode) {
      const poolRef = ref(realDb, 'food_delivery_pool');
      const unsubscribe = onValue(poolRef, (snapshot) => {
        const data = snapshot.val();
        const availableDeliveries = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        setFoodDeliveries(availableDeliveries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      });
      return () => unsubscribe();
    }
  }, [isDriverMode]);

  // --- FETCH ACTIVE FOOD ORDERS (DRIVER) ---
  useEffect(() => {
    if (isDriverMode && userProfile?.uid) {
      const ordersRef = query(ref(realDb, 'orders'), orderByChild('driverId'), equalTo(userProfile.uid));
      const unsubscribe = onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const myOrders = Object.keys(data).map(key => ({ id: key, ...data[key], type: 'food' }));
            setActiveFoodOrders(myOrders.filter(o => !o.hiddenForDriver));
        } else {
            setActiveFoodOrders([]);
        }
      });
      return () => unsubscribe();
    }
  }, [isDriverMode, userProfile?.uid]);

  // --- FETCH ACTIVE FOOD ORDERS (DRIVER) ---
  useEffect(() => {
    if (isDriverMode && userProfile?.uid) {
      // FIX: Gunakan realQuery (alias) untuk Realtime DB, bukan query (Firestore)
      const ordersRef = realQuery(ref(realDb, 'orders'), orderByChild('driverId'), equalTo(userProfile.uid));
      const unsubscribe = onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const myOrders = Object.keys(data).map(key => ({ id: key, ...data[key], type: 'food' }));
            setActiveFoodOrders(myOrders.filter(o => !o.hiddenForDriver));
        } else {
            setActiveFoodOrders([]);
        }
      });
      return () => unsubscribe();
    }
  }, [isDriverMode, userProfile?.uid]);

  // --- REALTIME DATA FETCHING ---
  useEffect(() => {
    if (!dbFirestore || !userProfile?.uid) {
      return;
    }

    const ordersRef = collection(dbFirestore, 'ojek_orders');
    let q;

    if (isDriverMode) {
      // Driver melihat:
      // 1. Ojek: orderan pending (cari penumpang) ATAU orderan yang dia ambil
      // 2. Food: orderan makanan yang dia ambil
      // Untuk simplicity, kita fetch semua orderan yang relevan dengan driver ini
      // Note: Idealnya query dipisah, tapi untuk demo kita filter di client side saja biar simpel
      q = query(ordersRef); 
    } else {
      // User melihat orderan miliknya sendiri (history)
      q = query(ordersRef, where('userId', '==', userProfile.uid));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter khusus Driver
      let filteredData = isDriverMode 
        ? data.filter(o => {
            const isMyOjekOrder = o.driverId === userProfile.uid;
            const isPendingOjek = driverService === 'ojek' && o.status === 'pending';
            return isMyOjekOrder || isPendingOjek; // Tampilkan orderan sendiri ATAU orderan pending (kalau lagi mode ojek)
        })
        : data;

      // Filter Soft Delete (Sembunyikan yang sudah dihapus user/driver)
      if (isDriverMode) {
        filteredData = filteredData.filter(o => !o.hiddenForDriver);
      } else {
        filteredData = filteredData.filter(o => !o.hiddenForUser);
      }
      
      // SORTING MANUAL DI CLIENT (JAVASCRIPT)
      // Mengurutkan dari yang terbaru ke terlama tanpa butuh Index Firestore
      filteredData.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setOrders(filteredData);
    }, (error) => {
      console.error("Gagal ambil data order:", error);
    });

    return () => unsubscribe();
  }, [isDriverMode, userProfile?.uid]);

  // --- COMBINED ORDERS (OJEK + FOOD) ---
  // Gabungin orderan Ojek (Firestore) dan Food (Realtime DB) buat ditampilin di list
  const combinedOrders = useMemo(() => {
    const normalizedOjek = orders.map(o => ({...o, type: 'ojek'}));
    // Gabung dan sort berdasarkan waktu terbaru
    return [...normalizedOjek, ...activeFoodOrders].sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return timeB - timeA;
    });
  }, [orders, activeFoodOrders]);

  // --- DRIVER GPS BROADCASTER (Kirim Lokasi ke DB) ---
  useEffect(() => {
    let watchId;
    if (isDriverMode && userProfile?.uid) {
      // Cek status driver (Busy jika ada order aktif)
      const activeOrder = orders.find(o => 
        o.driverId === userProfile.uid && 
        ['verified', 'ongoing'].includes(o.status)
      );
      const isBusy = !!activeOrder;

      if ("geolocation" in navigator) {
        // Kirim koordinat tiap kali HP Driver bergerak (Broadcast Location)
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            update(ref(realDb, `drivers_locations/${userProfile.uid}`), {
              lat: latitude,
              lng: longitude,
              status: isBusy ? 'busy' : 'standby', // Kirim status driver
              updatedAt: Date.now(),
              name: userProfile.displayName || 'Driver',
              vehicleType: 'motor' // Default
            });
          }, 
          (err) => { 
            if (err.code !== 1 && err.code !== 2 && err.code !== 3) console.debug("GPS Error:", err.message); 
          }, 
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
        );
      }
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isDriverMode, orders, userProfile]);

  // Helper: Upload ke Cloudinary (Optimasi Upload Gambar)
  const uploadToCloudinary = async (file, folder = 'sobatniaga/drivers') => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
    const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;
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
    return data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
  };

  // Helper: Reverse Geocoding (Koordinat -> Alamat)
  const fetchAddress = async (lat, lng) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      // Ambil nama jalan/tempat utama biar gak kepanjangan
      return data.display_name ? data.display_name.split(',').slice(0, 3).join(',') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch (e) {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  };

  // Helper: Hitung Estimasi Harga (Jarak Lurus)
  const calculateEstimatedPrice = (start, end, type = vehicleType) => {
    if (!start || !end) return;
    // Rumus Haversine / Leaflet distanceTo
    const distMeters = L.latLng(start.lat, start.lng).distanceTo(L.latLng(end.lat, end.lng));
    const distKm = distMeters / 1000;
    
    // Pricing Logic
    const ratePerKm = type === 'mobil' ? 5000 : 2500; 
    const minPrice = type === 'mobil' ? 10000 : 5000;
    const estPrice = Math.ceil(distKm * ratePerKm); 
    const finalPrice = Math.max(minPrice, estPrice); 
    
    // Time Logic (Simple)
    const speed = type === 'mobil' ? 40 : 30; // km/h
    const durationMinutes = Math.ceil((distKm / speed) * 60) + 5; // +5 mins buffer
    
    setPrice(finalPrice.toString());
    setEstDistance(distKm.toFixed(1));
    setEstDuration(durationMinutes);
  };

  // Handle Konfirmasi Lokasi dari Map Picker
  const handleConfirmLocation = async () => {
    if (!tempPickerCenter) return;
    const { lat, lng } = tempPickerCenter;
    const address = await fetchAddress(lat, lng);

    if (mapPickerMode === 'pickup') {
      setPickup(address);
      setPickupCoords({ lat, lng });
      if (destCoords) calculateEstimatedPrice({ lat, lng }, destCoords, vehicleType);
    } else {
      setDestination(address);
      setDestCoords({ lat, lng });
      if (pickupCoords) calculateEstimatedPrice(pickupCoords, { lat, lng }, vehicleType);
    }
    setMapPickerMode(null);
  };

  // Handle Gunakan Lokasi Saat Ini (GPS)
  const handleUseCurrentLocation = () => {
    setIsLocating(true);
    if (!("geolocation" in navigator)) {
        Swal.fire('Error', 'Browser tidak mendukung Geolocation.', 'error');
        setIsLocating(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const address = await fetchAddress(latitude, longitude);
            
            if (mapPickerMode === 'pickup') {
                setPickup(address);
                setPickupCoords({ lat: latitude, lng: longitude });
                if (destCoords) calculateEstimatedPrice({ lat: latitude, lng: longitude }, destCoords, vehicleType);
            } else {
                setDestination(address);
                setDestCoords({ lat: latitude, lng: longitude });
                if (pickupCoords) calculateEstimatedPrice(pickupCoords, { lat: latitude, lng: longitude }, vehicleType);
            }
            setMapPickerMode(null);
            setIsLocating(false);
        },
        (err) => {
            setIsLocating(false);
            console.error(err);
            if (err.code === 1) { // PERMISSION_DENIED
                Swal.fire({
                    title: 'Izin Lokasi Ditolak',
                    text: 'Mohon aktifkan izin lokasi di pengaturan browser (klik icon gembok di address bar) agar fitur ini bisa berjalan.',
                    icon: 'warning',
                    confirmButtonText: 'Oke, Paham',
                    confirmButtonColor: '#0ea5e9'
                });
            } else if (err.code === 2) { // POSITION_UNAVAILABLE
                 Swal.fire('Gagal', 'Sinyal GPS lemah atau tidak tersedia.', 'error');
            } else if (err.code === 3) { // TIMEOUT
                 Swal.fire('Timeout', 'Waktu permintaan lokasi habis. Coba lagi.', 'error');
            } else {
                Swal.fire('Gagal', 'Terjadi kesalahan saat mengambil lokasi.', 'error');
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Recalculate price when vehicle type changes
  useEffect(() => {
    if (pickupCoords && destCoords) {
      calculateEstimatedPrice(pickupCoords, destCoords, vehicleType);
    }
  }, [vehicleType]);

  // --- ACTIONS ---
  
  // 1. User Membuat Order
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!pickup || !destination || !price) {
      Swal.fire('Data Kurang', 'Mohon isi lokasi jemput, tujuan, dan harga.', 'warning');
      return;
    }

    if (!userProfile?.phoneNumber) {
      Swal.fire({
        title: 'Nomor HP Kosong',
        text: 'Wajib isi nomor HP di Profil dulu biar driver bisa WhatsApp kamu.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Isi Profil Sekarang',
        cancelButtonText: 'Nanti'
      }).then((res) => {
        if (res.isConfirmed) {
            if (onOpenProfile) onOpenProfile();
        }
      });
      return;
    }

    // Proteksi Order Jauh (Pesan buat orang lain)
    if (pickupCoords && userLocation) {
      const dist = L.latLng(userLocation.lat, userLocation.lng).distanceTo(L.latLng(pickupCoords.lat, pickupCoords.lng));
      if (dist > 10000) { // > 10 KM
        const confirm = await Swal.fire({
          title: 'Pesan untuk Orang Lain?',
          text: 'Lokasi jemput jauh dari posisimu (>10km). Pastikan titik jemput sudah sesuai dengan lokasi orang yang akan dijemput.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Ya, Lanjut',
          cancelButtonText: 'Cek Lagi',
          confirmButtonColor: '#0ea5e9'
        });
        if (!confirm.isConfirmed) return;
      }
    }

    // Cek Saldo (Proteksi Cekak)
    if ((userProfile?.saldo || 0) < parseInt(price)) {
      Swal.fire({
        title: 'Saldo Tidak Cukup',
        text: `Saldo Anda kurang dari Rp ${parseInt(price).toLocaleString('id-ID')}. Silakan isi saldo dulu.`,
        icon: 'warning',
        confirmButtonText: 'Isi Saldo Sekarang',
        cancelButtonText: 'Nanti Saja',
        showCancelButton: true
      }).then((result) => {
        if (result.isConfirmed) {
           if (onOpenProfile) onOpenProfile(); // Arahkan ke profil/topup
        }
      });
      return;
    }

    if (!dbFirestore) {
      Swal.fire('System Error', 'Database belum terhubung. Cek console untuk detail.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      await addDoc(collection(dbFirestore, 'ojek_orders'), {
        userId: userProfile.uid,
        userName: userProfile.displayName || userProfile.username || 'Mahasiswa',
        userPhone: userProfile.phoneNumber,
        pickup,
        destination,
        pickupCoords: pickupCoords || null, // Kirim koordinat
        destCoords: destCoords || null,     // Kirim koordinat
        vehicleType,
        distance: estDistance,
        duration: estDuration,
        price: parseInt(price),
        notes,
        status: 'pending',
        createdAt: serverTimestamp(),
        driverId: null
      });
      
      Swal.fire('Order Terkirim!', 'Tunggu driver mengambil pesananmu.', 'success');
      setPickup('');
      setDestination('');
      setPrice('');
      setNotes('');
      setPickupCoords(null);
      setDestCoords(null);
      setEstDistance(null);
      setEstDuration(null);
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Gagal membuat pesanan.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Driver Mengirim Penawaran (Offer)
  const handleTakeOrder = async (order) => {
    const result = await Swal.fire({
      title: 'Tawarkan Jasa?',
      text: `Kirim penawaran ke user untuk rute ini? Harga: Rp ${order.price.toLocaleString()}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Gas, Tawarkan!',
      cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
      try {
        if (!dbFirestore) {
          Swal.fire('System Error', 'Database belum terhubung.', 'error');
          return;
        }

        // Tambahkan Driver ke List Penawaran (Offers)
        const offerData = {
            driverId: userProfile.uid,
            driverName: userProfile.displayName || 'Driver NiagaGo',
            driverPhone: userProfile.phoneNumber,
            driverPhoto: userProfile.photoURL || null,
            vehicleType: 'motor', // Bisa diambil dari profil driver nanti
            price: order.price,
            createdAt: Date.now()
        };

        const orderRef = doc(dbFirestore, 'ojek_orders', order.id);
        await updateDoc(orderRef, {
          offers: arrayUnion(offerData)
        });

        Swal.fire('Terkirim!', 'Penawaran dikirim ke user. Tunggu konfirmasi ya!', 'success');

      } catch (error) {
        Swal.fire('Gagal', 'Terjadi kesalahan saat mengirim penawaran.', 'error');
      }
    }
  };

  // 2. Driver Mengambil Orderan Niaga Food
  const handleTakeFoodDelivery = async (delivery) => {
    // Prevent double-click
    if (takingOrderId) return;

    // --- FIX: Validasi Nama Driver ---
    const driverName = userProfile?.displayName || auth.currentUser?.displayName;
    if (!driverName) {
        Swal.fire('Profil Belum Lengkap', 'Nama driver tidak ditemukan. Silakan lengkapi profil Anda terlebih dahulu.', 'error');
        return;
    }

    setTakingOrderId(delivery.id);

    const result = await Swal.fire({
      title: 'Ambil Orderan Makanan?',
      html: `Ambil pengantaran dari <b>${delivery.storeName}</b> ke <b>${delivery.buyerName}</b>?<br/>Ongkir: <b>Rp ${delivery.deliveryFee.toLocaleString()}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Ambil!',
      cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
      const deliveryPoolRef = ref(realDb, `food_delivery_pool/${delivery.id}`);
      
      // Gunakan Transaction untuk mencegah race condition
      runTransaction(deliveryPoolRef, (currentData) => {
        if (currentData === null) {
          return; // Abort transaction, order sudah diambil
        }
        return null; // Ambil order dengan set data jadi null
      }).then(async (transactionResult) => {
        if (!transactionResult.committed) {
          Swal.fire('Gagal', 'Orderan ini sudah diambil driver lain!', 'warning');
        } else {
          // Jika transaksi berhasil, update data order
          try {
            await update(ref(realDb, `orders/${delivery.orderId}`), {
              driverId: userProfile.uid,
              driverName: driverName,
              driverPlate: userProfile.plateNumber || 'N/A',
              status: 'ready_for_pickup', // Driver OTW Resto
              storeName: delivery.storeName,
              storeLocation: delivery.storeLocation
            });

            // Kirim notifikasi ke Seller & Pembeli
            const orderSnap = await get(ref(realDb, `orders/${delivery.orderId}`));
            if (orderSnap.exists()) {
              const orderData = orderSnap.val();
              const itemsArray = orderData.items ? (Array.isArray(orderData.items) ? orderData.items : Object.values(orderData.items)) : [];

              if (itemsArray.length > 0 && itemsArray[0].sellerId) {
                await push(ref(realDb, 'notifications'), {
                  userId: itemsArray[0].sellerId,
                  title: 'Driver Ditemukan!',
                  message: `Driver ${userProfile.displayName} sedang menuju ke tokomu untuk mengambil pesanan #${delivery.orderId.slice(-6)}.`,
                  type: 'info',
                  targetView: 'dashboard-seller',
                  createdAt: new Date().toISOString(),
                  isRead: false
                });
              }

              await push(ref(realDb, 'notifications'), {
                userId: orderData.buyerId,
                title: 'Driver OTW ke Resto!',
                message: `Driver ${userProfile.displayName} (${userProfile.plateNumber}) sedang dalam perjalanan mengambil pesananmu.`,
                type: 'info',
                targetView: 'history',
                targetTab: 'ready_for_pickup',
                orderId: delivery.orderId,
                createdAt: new Date().toISOString(),
                isRead: false
              });
            }

            Swal.fire('Berhasil!', 'Segera menuju ke resto untuk mengambil pesanan.', 'success').then(() => {
              setDriverService('ojek'); // Pindah ke tab pesanan aktif
            });
          } catch (updateError) {
            console.error("Error updating order after transaction:", updateError);
            Swal.fire('Error', `Gagal memproses order: ${updateError.message}`, 'error');
          }
        }
      }).catch((error) => {
        console.error("Food delivery transaction failed: ", error);
        Swal.fire('Error', `Gagal mengambil orderan: ${error.message}`, 'error');
      }).finally(() => {
        setTakingOrderId(null); // Reset loading state
      });
    } else {
      setTakingOrderId(null); // Reset jika user batal
    }
  };

  // 2.1 Driver Update Status Pengantaran Makanan
  const handleUpdateFoodDeliveryStatus = async (orderId, newStatus) => {
    if (newStatus === 'completed') {
        const result = await Swal.fire({
            title: 'Pesanan Sampai?',
            text: "Konfirmasi pesanan telah diterima pembeli? Dana akan diteruskan.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Selesai',
            confirmButtonColor: '#10b981'
        });

        if (result.isConfirmed) {
            try {
                const orderRef = ref(realDb, `orders/${orderId}`);
                const snapshot = await get(orderRef);
                if (!snapshot.exists()) throw new Error("Order tidak ditemukan");
                
                const orderData = snapshot.val();
                const updates = {};
                
                // 1. Update Status
                updates[`orders/${orderId}/status`] = 'completed';
                updates[`orders/${orderId}/completedAt`] = new Date().toISOString();

                // 2. Trigger Saldo Driver (Ongkir)
                const driverId = userProfile.uid;
                const deliveryFee = parseInt(orderData.deliveryFee || 3000);
                
                const driverRef = ref(realDb, `users/${driverId}`);
                const driverSnap = await get(driverRef);
                const currentDriverSaldo = driverSnap.exists() ? (parseInt(driverSnap.val().saldo) || 0) : 0;
                updates[`users/${driverId}/saldo`] = currentDriverSaldo + deliveryFee;

                // 3. Trigger Saldo Seller (Harga Makanan)
                let sellerId = null;
                let foodPrice = 0;
                if (orderData.items) {
                    const items = Array.isArray(orderData.items) ? orderData.items : Object.values(orderData.items);
                    if (items.length > 0) {
                        sellerId = items[0].sellerId;
                        foodPrice = items.reduce((acc, item) => acc + (parseInt(item.price) * parseInt(item.quantity)), 0);
                    }
                }

                if (sellerId) {
                    const sellerRef = ref(realDb, `users/${sellerId}/sellerInfo`);
                    const sellerSnap = await get(sellerRef);
                    if (sellerSnap.exists()) {
                        const currentSellerBalance = parseInt(sellerSnap.val().balance) || 0;
                        updates[`users/${sellerId}/sellerInfo/balance`] = currentSellerBalance + foodPrice;
                    }
                }

                await update(ref(realDb), updates);

                // Notifikasi Selesai
                await push(ref(realDb, 'notifications'), {
                    userId: orderData.buyerId,
                    title: 'Pesanan Selesai',
                    message: 'Selamat menikmati makanannya! Jangan lupa beri ulasan.',
                    type: 'success',
                    targetView: 'history',
                    createdAt: new Date().toISOString(),
                    isRead: false
                });

                Swal.fire('Selesai!', 'Pesanan selesai & Saldo cair.', 'success');
            } catch (error) {
                console.error("Error finishing order:", error);
                Swal.fire('Error', 'Gagal menyelesaikan pesanan.', 'error');
            }
        }
    } else {
        // Status: Delivering (Mulai Antar)
        try {
            await update(ref(realDb, `orders/${orderId}`), { status: newStatus });
            
            // Notifikasi Pembeli: Driver OTW
            if (newStatus === 'delivering') {
                 const snapshot = await get(ref(realDb, `orders/${orderId}`));
                 if (snapshot.exists()) {
                     const orderData = snapshot.val();
                     await push(ref(realDb, 'notifications'), {
                        userId: orderData.buyerId,
                        title: 'Driver Menuju Lokasi!',
                        message: 'Driver sedang mengantarkan pesananmu. Siap-siap ya!',
                        type: 'info',
                        targetView: 'history',
                        targetTab: 'delivering',
                        orderId: orderId,
                        createdAt: new Date().toISOString(),
                        isRead: false
                    });
                 }
            }
            Swal.fire('Status Updated', 'Status berubah jadi Diantar.', 'success');
        } catch (error) {
            console.error("Update status failed:", error);
            Swal.fire('Error', 'Gagal update status.', 'error');
        }
    }
  };

  // 2.5 User Menerima Tawaran Driver
  const handleAcceptOffer = async (order, offer) => {
      try {
        // 1. Potong Saldo User (Escrow / Locking)
        const currentSaldo = userProfile?.saldo || 0;
        let useSaldo = false;

        // Cek Cukup Saldo atau Tidak
        if (currentSaldo >= order.price) {
            useSaldo = true;
        } else {
            // Fallback ke Manual jika saldo kurang
            const confirm = await Swal.fire({
                title: 'Saldo Tidak Cukup',
                text: 'Saldo Anda kurang. Lanjutkan dengan pembayaran manual (Transfer/QRIS)?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Ya, Bayar Manual',
                cancelButtonText: 'Batal'
            });
            if (!confirm.isConfirmed) return;
        }

        if (useSaldo) {
            await update(ref(realDb, `users/${userProfile.uid}`), { saldo: currentSaldo - order.price });
        }

        // 2. Update Status Order
        await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), {
            status: useSaldo ? 'verified' : 'accepted', // Verified = Langsung jalan (Saldo), Accepted = Bayar dulu (Manual)
            driverId: offer.driverId,
            driverName: offer.driverName,
            driverPhone: offer.driverPhone,
            isPaid: useSaldo, // Tandai sudah dibayar jika pakai saldo
            paymentMethod: useSaldo ? 'saldo' : 'manual'
        });
        
        Swal.fire(
            useSaldo ? 'Pembayaran Berhasil!' : 'Driver Dipilih!', 
            useSaldo ? `Saldo terpotong. ${offer.driverName} akan segera menjemputmu.` : 'Silakan selesaikan pembayaran agar driver menjemput.', 
            useSaldo ? 'success' : 'info'
        );
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal memilih driver.', 'error');
      }
  };

  // Handle Open Payment Modal
  const handleOpenPayment = (order) => {
    setSelectedOrderForPayment(order);
    setPaymentModalOpen(true);
    setPaymentProofFile(null);
    setPaymentProofPreview(null);
  };

  // Handle File Change in Modal
  const handlePaymentFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
        setPaymentProofFile(file);
        setPaymentProofPreview(URL.createObjectURL(file));
    }
  };

  // 3. Submit Payment from Modal
  const handleSubmitPayment = async () => {
    if (!paymentProofFile || !selectedOrderForPayment) {
         Swal.fire('Bukti Kosong', 'Mohon upload bukti transfer.', 'warning');
         return;
    }
    
    setIsLoading(true);
    try {
        const url = await uploadToCloudinary(paymentProofFile, 'sobatniaga/payment_proofs');
        await updateDoc(doc(dbFirestore, 'ojek_orders', selectedOrderForPayment.id), {
            paymentProof: url,
            status: 'paid'
        });
        Swal.fire('Berhasil', 'Bukti pembayaran terkirim. Tunggu verifikasi Admin ya!', 'success');
        setPaymentModalOpen(false);
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal upload bukti.', 'error');
    } finally {
        setIsLoading(false);
    }
  };

  // 4. Driver Mulai Perjalanan
  const handleStartTrip = async (orderId) => {
    await updateDoc(doc(dbFirestore, 'ojek_orders', orderId), {
      status: 'ongoing'
    });
  };

  // 5. User Konfirmasi Selesai (Dana Cair ke Driver)
  const handleFinishTrip = async (order) => {
    const result = await Swal.fire({
      title: 'Sudah sampai?',
      text: "Dana akan diteruskan ke dompet Driver.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Selesai',
      cancelButtonText: 'Belum'
    });

    if (result.isConfirmed) {
      try {
        // Update Status Order
        await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), {
          status: 'completed',
          completedAt: serverTimestamp()
        });

        // Tambah Saldo Driver (Final Transfer)
        const driverRef = ref(realDb, `users/${order.driverId}`);
        
        // Ambil saldo driver saat ini
        const driverSnap = await get(driverRef);
        if (driverSnap.exists()) {
            const driverData = driverSnap.val();
            const currentDriverSaldo = parseInt(driverData.saldo || 0);
            
            // Hitung Pendapatan Bersih (Potong Fee Admin)
            const appFee = calculateAdminFee(order.price);
            const netIncome = Math.max(0, order.price - appFee);

            // Update Saldo Driver
            await update(driverRef, {
                saldo: currentDriverSaldo + netIncome
            });
        }
        
        Swal.fire('Terima kasih!', 'Perjalanan selesai. Jangan lupa kasih bintang 5!', 'success');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Gagal menyelesaikan order.', 'error');
      }
    }
  };

  // 6. Driver Tarik Saldo
  const handleWithdraw = async (e) => {
    e.preventDefault();
    if ((userProfile.saldo || 0) < parseInt(withdrawData.amount)) {
      Swal.fire('Gagal', 'Saldo tidak cukup.', 'error');
      return;
    }
    
    try {
      await addDoc(collection(dbFirestore, 'withdrawals'), {
        userId: userProfile.uid,
        userName: userProfile.displayName,
        ...withdrawData,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      // Kurangi saldo (Simulasi)
      await update(ref(realDb, `users/${userProfile.uid}`), {
        saldo: (userProfile.saldo || 0) - parseInt(withdrawData.amount)
      });

      Swal.fire('Permintaan Terkirim', 'Admin akan memproses penarikanmu.', 'success');
      setShowWithdraw(false);
      setWithdrawData({ bank: '', number: '', name: '', amount: '' });
    } catch (error) {
      Swal.fire('Error', 'Gagal request withdraw.', 'error');
    }
  };

  // 7. Handle Register Driver (Submit Form)
  const handleRegisterDriver = async (e) => {
    e.preventDefault();
    
    // Cek Koneksi Database
    if (!storage || !dbFirestore) {
      Swal.fire('System Error', 'Koneksi ke database terputus. Coba refresh halaman.', 'error');
      return;
    }

    if (!ktmFile) {
      Swal.fire('Foto KTM Wajib', 'Mohon upload foto KTM kamu untuk verifikasi.', 'warning');
      return;
    }

    // Validasi Ukuran File (Max 5MB)
    if (ktmFile.size > 5 * 1024 * 1024) {
      Swal.fire('File Terlalu Besar', 'Ukuran foto maksimal 5MB. Mohon kompres atau pilih foto lain.', 'warning');
      return;
    }

    if (!regForm.phone) {
       Swal.fire('Nomor HP Wajib', 'Mohon isi nomor HP yang aktif (WhatsApp).', 'warning');
       return;
    }

    // Validasi Layanan
    if (!regForm.services.niagaGo && !regForm.services.niagaFood) {
      Swal.fire('Pilih Layanan', 'Mohon pilih minimal satu layanan yang ingin diambil (Niaga Go / Niaga Food).', 'warning');
      return;
    }

    setIsRegistering(true);
    try {
      console.log("Memulai proses pendaftaran...");
      
      // 1. Upload KTM ke Cloudinary (Optimasi Kompresi Otomatis)
      const ktmUrl = await uploadToCloudinary(ktmFile);
      console.log("Upload KTM Berhasil:", ktmUrl);

      // Simpan Data Pendaftaran ke Firestore
      await addDoc(collection(dbFirestore, 'driver_registrations'), {
        userId: userProfile.uid,
        name: regForm.name,
        email: regForm.email,
        phone: regForm.phone,
        plateNumber: regForm.plateNumber,
        services: regForm.services, // Simpan layanan yang dipilih
        ktmUrl: ktmUrl,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      Swal.fire({
        title: 'Pendaftaran Berhasil!',
        text: 'Data kamu sudah masuk. Tunggu verifikasi Admin ya (1x24 Jam).',
        icon: 'success',
        confirmButtonColor: '#0ea5e9'
      });
      setViewMode('main');
      setKtmFile(null);
    } catch (error) {
      console.error("Error Register Driver:", error);
      Swal.fire('Gagal Daftar', `Terjadi kesalahan: ${error.message}`, 'error');
    } finally {
      setIsRegistering(false);
    }
  };

  // 8. Cancel Order (User)
  const handleCancelOrder = async (order) => {
    const result = await Swal.fire({
      title: 'Batalkan Pesanan?',
      text: order.status === 'accepted' ? 'Driver sudah menuju lokasi. Yakin batalkan?' : 'Pesanan akan dihapus dari antrian.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Batalkan',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Tidak'
    });

    if (result.isConfirmed) {
      try {
        await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), {
          status: 'cancelled',
          cancelledAt: serverTimestamp()
        });
        Swal.fire('Dibatalkan', 'Pesanan berhasil dibatalkan.', 'success');
      } catch (error) {
        Swal.fire('Error', 'Gagal membatalkan pesanan.', 'error');
      }
    }
  };

  // Helper: WA Link Generator
  const getWALink = (phone, role) => {
    const text = role === 'driver' 
      ? "Halo, saya Driver NiagaGo. Mohon kirimkan Live Location (15-30 Menit) via WA ini agar saya bisa menuju posisi Anda."
      : "Halo, saya Penumpang NiagaGo. Posisi saya sesuai map, mohon segera jemput.";
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };

  // 9. Hapus Riwayat (Soft Delete) - Satuan
  const handleDeleteSingleHistory = async (order) => {
    const result = await Swal.fire({
      title: 'Hapus Riwayat?',
      text: "Riwayat ini akan disembunyikan dari daftar.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
      try {
        if (order.type === 'food') {
            await update(ref(realDb, `orders/${order.id}`), {
                [isDriverMode ? 'hiddenForDriver' : 'hiddenForUser']: true
            });
        } else {
            const updateData = isDriverMode ? { hiddenForDriver: true } : { hiddenForUser: true };
            await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), updateData);
        }
        Swal.fire('Terhapus', 'Riwayat berhasil disembunyikan.', 'success');
      } catch (error) {
        console.error("Error deleting history:", error);
        Swal.fire('Error', 'Gagal menghapus riwayat.', 'error');
      }
    }
  };

  // 10. Bersihkan Semua Riwayat Selesai (Bulk Soft Delete)
  const handleClearHistory = async () => {
    const targetOrders = combinedOrders.filter(o => {
      const isFinished = ['completed', 'cancelled', 'payment_rejected'].includes(o.status);
      // Driver hanya bisa hapus history miliknya, bukan order pending di pool
      return isFinished && (isDriverMode ? o.driverId === userProfile.uid : true);
    });

    if (targetOrders.length === 0) return;

    const result = await Swal.fire({
      title: 'Bersihkan Semua?',
      text: `Yakin ingin menghapus ${targetOrders.length} riwayat yang sudah selesai/batal? Data di Admin tetap aman.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Bersihkan',
      confirmButtonColor: '#ef4444'
    });

    if (result.isConfirmed) {
      const updateData = isDriverMode ? { hiddenForDriver: true } : { hiddenForUser: true };
      
      const promises = targetOrders.map(o => {
          if (o.type === 'food') {
              return update(ref(realDb, `orders/${o.id}`), {
                  [isDriverMode ? 'hiddenForDriver' : 'hiddenForUser']: true
              });
          } else {
              return updateDoc(doc(dbFirestore, 'ojek_orders', o.id), updateData);
          }
      });

      Promise.all(promises)
        .then(() => Swal.fire('Bersih!', 'Riwayat perjalanan telah dibersihkan.', 'success'))
        .catch(() => Swal.fire('Error', 'Gagal membersihkan riwayat.', 'error'));
    }
  };

  // Cek apakah ada order yang bisa dibersihkan untuk tombol "Bersihkan Selesai"
  const hasClearableOrders = combinedOrders.some(o => {
    const isFinished = ['completed', 'cancelled', 'payment_rejected'].includes(o.status);
    return isFinished && (isDriverMode ? o.driverId === userProfile.uid : true);
  });

  // --- RENDER REGISTRATION PAGE (FULL PAGE) ---
  if (viewMode === 'register') {
    return (
      <div className={`min-h-screen p-4 pb-24 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setViewMode('main')} className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-gray-100'} shadow-sm`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold">Pendaftaran Driver</h1>
          </div>

          <div className={`rounded-2xl shadow-lg overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 p-6 text-white">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Bike size={28} /> Gabung NiagaGo
              </h2>
              <p className="text-sky-100 text-sm mt-1">Nambah uang jajan sambil kuliah!</p>
            </div>

            <div className="p-6">
              <form onSubmit={handleRegisterDriver} className="space-y-4">
                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nama Lengkap</label>
                  <input type="text" value={regForm.name} onChange={(e) => setRegForm({...regForm, name: e.target.value})} className={`w-full p-3 rounded-xl border outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} placeholder="Nama sesuai KTM" required />
                </div>

                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email Kampus/Pribadi</label>
                  <input type="email" value={regForm.email} onChange={(e) => setRegForm({...regForm, email: e.target.value})} className={`w-full p-3 rounded-xl border outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} placeholder="email@student.ac.id" required />
                </div>

                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nomor WhatsApp</label>
                  <input type="tel" value={regForm.phone} onChange={(e) => setRegForm({...regForm, phone: e.target.value})} className={`w-full p-3 rounded-xl border outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} placeholder="08xxxxxxxxxx" required />
                </div>

                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Plat Nomor Kendaraan</label>
                  <input type="text" value={regForm.plateNumber} onChange={(e) => setRegForm({...regForm, plateNumber: e.target.value.toUpperCase()})} className={`w-full p-3 rounded-xl border outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} placeholder="Contoh: P 1234 AA" required />
                </div>

                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Layanan yang Diambil</label>
                  <div className="space-y-2 pt-2">
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${regForm.services.niagaGo ? 'border-sky-500 bg-sky-50 dark:bg-slate-700' : 'dark:border-slate-600'}`}>
                      <input 
                        type="checkbox" 
                        checked={regForm.services.niagaGo}
                        onChange={(e) => setRegForm({...regForm, services: {...regForm.services, niagaGo: e.target.checked}})}
                        className="w-5 h-5 text-sky-600 rounded focus:ring-sky-500"
                      />
                      <span className="font-medium text-sm">Niaga Go (Antar Penumpang)</span>
                    </label>
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${regForm.services.niagaFood ? 'border-sky-500 bg-sky-50 dark:bg-slate-700' : 'dark:border-slate-600'}`}>
                      <input 
                        type="checkbox" 
                        checked={regForm.services.niagaFood}
                        onChange={(e) => setRegForm({...regForm, services: {...regForm.services, niagaFood: e.target.checked}})}
                        className="w-5 h-5 text-sky-600 rounded focus:ring-sky-500"
                      />
                      <span className="font-medium text-sm">Niaga Food (Antar Makanan)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Upload Foto KTM</label>
                  <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${isDarkMode ? 'border-slate-600 hover:border-sky-500 bg-slate-700/50' : 'border-sky-200 hover:border-sky-500 bg-sky-50'}`}>
                    <input type="file" accept="image/*" onChange={(e) => setKtmFile(e.target.files[0])} className="hidden" id="ktm-upload" />
                    <label htmlFor="ktm-upload" className="cursor-pointer w-full flex flex-col items-center">
                      {ktmFile ? (
                        <div className="flex items-center gap-2 text-sky-600 font-bold"><CheckSquare size={24} /> {ktmFile.name}</div>
                      ) : (
                        <><ImageIcon size={32} className="text-sky-500 mb-2" /><span className="text-sm text-gray-500">Klik untuk upload foto KTM</span></>
                      )}
                    </label>
                  </div>
                </div>

                <button type="submit" disabled={isRegistering} className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all mt-4 flex justify-center items-center gap-2">
                  {isRegistering ? 'Mengirim Data...' : 'Kirim Pendaftaran 🚀'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 pb-24 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      <div className="max-w-md mx-auto">
        
        {/* Header Section */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bike className="text-sky-500" size={28} />
            <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">NiagaGo</span>
          </h1>
          
          {/* Toggle Role Button (Hanya jika user adalah Driver) */}
          {userProfile?.role === 'driver' ? (
            <button 
              onClick={() => setIsDriverMode(!isDriverMode)}
              className={`text-xs px-4 py-2 rounded-full font-bold border transition-all ${isDriverMode ? 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-500/30' : (isDarkMode ? 'border-slate-600 text-gray-400' : 'border-gray-300 text-gray-500 hover:bg-gray-100')}`}
            >
              {isDriverMode ? '👨‍✈️ Mode Driver Aktif' : '👤 Mode Penumpang'}
            </button>
          ) : (
            // Tombol Daftar Driver
            latestReg?.status === 'approved' ? (
              <button 
                onClick={() => setIsDriverMode(true)}
                className={`text-xs px-4 py-2 rounded-full font-bold border transition-all ${isDarkMode ? 'border-slate-600 text-gray-400' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}
              >
                Masuk Mode Driver
              </button>
            ) :
            latestReg?.status === 'pending' ? (
              <button 
                disabled
                className="text-xs px-4 py-2 rounded-full font-bold border border-yellow-500 text-yellow-600 bg-yellow-50 cursor-not-allowed"
              >
                ⏳ Menunggu Verifikasi
              </button>
            ) : (
            <button 
              onClick={() => {
                if (latestReg?.status === 'rejected') Swal.fire('Pendaftaran Ditolak', `Alasan: ${latestReg.rejectionReason}. Silakan perbaiki data.`, 'info');
                setViewMode('register');
              }}
              className="text-xs px-4 py-2 rounded-full font-bold border border-sky-500 text-sky-600 hover:bg-sky-50 transition-all"
            >
              {latestReg?.status === 'rejected' ? '❌ Daftar Ulang' : '📝 Daftar Driver'}
            </button>
            )
          )}
        </div>

        {/* --- DRIVER DASHBOARD (SALDO & WITHDRAW) --- */}
        {isDriverMode && (
          <div className="mb-6">
            {/* Service Toggle */}
            <div className={`flex gap-2 mb-4 p-1.5 rounded-xl border shadow-sm transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
              <button
                onClick={() => setDriverService('ojek')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  driverService === 'ojek' ? (isDarkMode ? 'bg-sky-900/50 text-sky-300' : 'bg-sky-100 text-sky-600') : (isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-50')
                }`}
              >
                <Bike size={16} /> Ojek
              </button>
              <button
                onClick={() => setDriverService('food')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  driverService === 'food' ? (isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-600') : (isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-50')
                }`}
              >
                <Utensils size={16} /> Food
              </button>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sky-100 text-xs font-medium">Saldo Niaga (Virtual)</p>
                <h2 className="text-2xl font-bold">Rp {(userProfile?.saldo || 0).toLocaleString()}</h2>
              </div>
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Wallet size={24} className="text-white" />
              </div>
            </div>
            
            {!showWithdraw ? (
              <button onClick={() => setShowWithdraw(true)} className="w-full py-2 bg-white text-sky-700 font-bold rounded-xl text-sm hover:bg-sky-50 transition-colors">
                Tarik Saldo (Cash Out)
              </button>
            ) : (
              <form onSubmit={handleWithdraw} className="bg-white/10 p-3 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2">
                <input placeholder="Nama Bank / E-Wallet" value={withdrawData.bank} onChange={e => setWithdrawData({...withdrawData, bank: e.target.value})} className="w-full p-2 rounded-lg text-sm text-gray-800 outline-none" required />
                <input placeholder="Nomor Rekening" value={withdrawData.number} onChange={e => setWithdrawData({...withdrawData, number: e.target.value})} className="w-full p-2 rounded-lg text-sm text-gray-800 outline-none" required />
                <input placeholder="Atas Nama" value={withdrawData.name} onChange={e => setWithdrawData({...withdrawData, name: e.target.value})} className="w-full p-2 rounded-lg text-sm text-gray-800 outline-none" required />
                <input type="number" placeholder="Nominal" value={withdrawData.amount} onChange={e => setWithdrawData({...withdrawData, amount: e.target.value})} className="w-full p-2 rounded-lg text-sm text-gray-800 outline-none" required />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowWithdraw(false)} className="flex-1 py-2 bg-white/20 text-white text-xs rounded-lg">Batal</button>
                  <button type="submit" className="flex-1 py-2 bg-green-500 text-white font-bold text-xs rounded-lg">Kirim Request</button>
                </div>
              </form>
            )}
            </div>
          </div>
        )}

        {/* --- TAMPILAN USER: FORM ORDER --- */}
        {!isDriverMode && (
          <div className={`p-4 rounded-2xl shadow-lg mb-8 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
            {/* Balance Display (Saldo Anda) */}
            <div className={`flex justify-between items-center mb-4 p-3 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-sky-50 border-sky-100'}`}>
               <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-600' : 'bg-white'}`}>
                    <Wallet className="text-sky-500" size={20} />
                  </div>
                  <div>
                     <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Saldo Anda</p>
                     <p className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Rp {(userProfile?.saldo || 0).toLocaleString('id-ID')}</p>
                  </div>
               </div>
            </div>

            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Navigation size={20} className="text-sky-500"/> Mau kemana hari ini?</h2>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-gray-400" size={16} />
                <input type="text" placeholder="Lokasi Jemput (cth: Gerbang Depan)" value={pickup} onChange={(e) => setPickup(e.target.value)} className={`w-full pl-9 pr-9 py-2 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} />
                <button type="button" onClick={() => setMapPickerMode('pickup')} className="absolute right-2 top-1.5 p-1 bg-sky-100 text-sky-600 rounded-lg hover:bg-sky-200 transition-colors" title="Pilih di Peta">
                  <LocateFixed size={16} />
                </button>
              </div>
              <div className="relative">
                <Navigation className="absolute left-3 top-3 text-gray-400" size={16} />
                <input type="text" placeholder="Tujuan (cth: Kost Putri)" value={destination} onChange={(e) => setDestination(e.target.value)} className={`w-full pl-9 pr-9 py-2 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} />
                <button type="button" onClick={() => setMapPickerMode('destination')} className="absolute right-2 top-1.5 p-1 bg-sky-100 text-sky-600 rounded-lg hover:bg-sky-200 transition-colors" title="Pilih di Peta">
                  <LocateFixed size={16} />
                </button>
              </div>
              
              {/* Vehicle Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVehicleType('motor')}
                  className={`p-2 rounded-xl border flex flex-row justify-center items-center gap-2 transition-all ${vehicleType === 'motor' ? 'bg-sky-50 border-sky-500 text-sky-600 ring-1 ring-sky-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <Bike size={20} />
                  <span className="text-xs font-bold">Motor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVehicleType('mobil')}
                  className={`p-2 rounded-xl border flex flex-row justify-center items-center gap-2 transition-all ${vehicleType === 'mobil' ? 'bg-sky-50 border-sky-500 text-sky-600 ring-1 ring-sky-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <Car size={20} />
                  <span className="text-xs font-bold">Mobil</span>
                </button>
              </div>

              {/* Estimation Info */}
              {estDistance && estDuration && (
                <div className={`p-3 rounded-xl border flex justify-between items-center ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-sky-50 border-sky-100'}`}>
                  <div>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Jarak</p>
                    <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{estDistance} km</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Estimasi Waktu</p>
                    <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{formatDuration(estDuration)}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Harga (Rp)" value={price} onChange={(e) => setPrice(e.target.value)} className={`w-full py-2 px-3 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} />
                <input type="text" placeholder="Catatan (Cth: Jemput Ibu saya, baju kuning...)" value={notes} onChange={(e) => setNotes(e.target.value)} className={`w-full py-2 px-3 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} />
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-sky-500/30">
                {isLoading ? 'Memproses...' : 'Cari Driver Sekarang 🚀'}
              </button>
            </form>
          </div>
        )}

        {/* --- LIST ORDER (DRIVER & USER HISTORY) --- */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className={`font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {isDriverMode ? 'Antrian & Riwayat' : 'Riwayat Perjalanan'}
            </h3>
            {hasClearableOrders && (
              <button onClick={handleClearHistory} className="text-xs font-bold text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors">
                <Trash2 size={14}/> Bersihkan Selesai
              </button>
            )}
          </div>

          {/* --- TAMPILAN DRIVER: NIAGA FOOD DELIVERY POOL --- */}
          {isDriverMode && driverService === 'food' && (
            foodDeliveries.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <Utensils size={48} className="mx-auto mb-2 opacity-20" />
                <p>Belum ada orderan makanan tersedia.</p>
              </div>
            ) : (
              foodDeliveries.map((delivery) => (
                <div key={delivery.id} className={`p-4 rounded-xl border relative overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                      <Utensils size={20} className="text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-bold">{delivery.storeName}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> {new Date(delivery.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={16} className="text-red-500" />
                      <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{delivery.storeLocation}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Navigation size={16} className="text-blue-500" />
                      <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{delivery.buyerLocation}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-dashed border-gray-300 dark:border-slate-600">
                    <div>
                      <p className="text-xs text-gray-400">Ongkir</p>
                      <div className="font-bold text-lg text-green-500">
                        Rp {(delivery.deliveryFee || 0).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleTakeFoodDelivery(delivery)}
                      disabled={takingOrderId === delivery.id}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 w-24 h-10 transition-all"
                    >
                      {takingOrderId === delivery.id ? <Loader2 size={16} className="animate-spin"/> : <><Bike size={16} /> Ambil</>}
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {/* --- TAMPILAN DRIVER: OJEK & USER: HISTORY --- */}
          {!(isDriverMode && driverService === 'food') && (combinedOrders.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <Bike size={48} className="mx-auto mb-2 opacity-20" />
              <p>Belum ada orderan nih.</p>
            </div>
          ) : (
            combinedOrders.map((order) => (
              <div key={order.id} className={`p-4 rounded-xl border relative overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                {/* Status Badge */}
                <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold rounded-bl-xl ${
                  order.status === 'pending' ? 'bg-yellow-500/20 text-yellow-600' : 
                  order.status === 'accepted' ? 'bg-blue-500/20 text-blue-600' :
                  order.status === 'paid' ? 'bg-purple-500/20 text-purple-600' :
                  order.status === 'verified' ? 'bg-indigo-500/20 text-indigo-600' :
                  order.status === 'ready_for_pickup' ? 'bg-teal-500/20 text-teal-600' :
                  order.status === 'delivering' ? 'bg-cyan-500/20 text-cyan-600' :
                  order.status === 'ongoing' ? 'bg-orange-500/20 text-orange-600' :
                  'bg-green-500/20 text-green-600'
                }`}>
                  {order.status === 'pending' ? 'Mencari Driver...' : 
                   order.status === 'accepted' ? 'Menunggu Pembayaran' :
                   order.status === 'paid' ? 'Verifikasi Admin' :
                   order.status === 'verified' ? (order.paymentMethod === 'saldo' ? 'Sudah Terbayar via Saldo' : 'Siap Jemput') :
                   order.status === 'ready_for_pickup' ? 'Driver OTW Resto' :
                   order.status === 'delivering' ? 'Diantar ke Kamu' :
                   order.status === 'ongoing' ? 'Dalam Perjalanan' :
                   'Selesai'}
                </div>

                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                    <User size={20} className="text-sky-500" />
                  </div>
                  <div>
                    <h4 className="font-bold">{order.type === 'food' ? (order.buyerName || order.userName) : order.userName}</h4>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> Baru saja</p>
                  </div>
                  {/* Vehicle Icon Badge */}
                  <div className={`ml-auto p-1.5 rounded-lg ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    {order.vehicleType === 'mobil' ? <Car size={16} /> : <Bike size={16} />}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={16} className="text-red-500" />
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{order.type === 'food' ? (order.storeName || 'Restoran') : order.pickup}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Navigation size={16} className="text-blue-500" />
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{order.type === 'food' ? (order.deliveryAddress || 'Lokasi Pembeli') : order.destination}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mb-3 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-slate-700 w-fit px-2 py-1 rounded-lg">
                  <Shield size={12} className="text-green-500" /> Rekber Aman (Admin)
                  {order.paymentMethod === 'saldo' && <span className="text-sky-600 font-bold">• Lunas via Saldo</span>}
                </div>

                {/* 0. STATUS PENDING: User Cari Driver */}
                {!isDriverMode && order.status === 'pending' && order.type !== 'food' && (
                    <div className="flex flex-col gap-3 w-full mb-3">
                        <TrackingMap driverId={null} pickupCoords={order.pickupCoords} status="pending" driversLocations={driversLocations} />
                        <p className="text-xs text-center text-gray-500 animate-pulse">Sedang mencari driver di sekitarmu...</p>
                    </div>
                )}

                {/* 0.5 STATUS PENDING: List Penawaran Driver (Fitur Killer) */}
                {(() => {
                  const filteredOffers = !isDriverMode && order.status === 'pending' && order.offers 
                    ? order.offers.filter(offer => {
                        const driverLoc = driversLocations[offer.driverId];
                        if (!driverLoc) return false;
                        const pickupLat = order.pickupCoords?.lat;
                        const pickupLng = order.pickupCoords?.lng;
                        if (!pickupLat || !pickupLng) return true;
                        const dist = L.latLng(driverLoc.lat, driverLoc.lng).distanceTo(L.latLng(pickupLat, pickupLng));
                        return dist <= ZONE_RADIUS;
                      })
                    : [];

                  return filteredOffers.length > 0 && (
                    <div className="mt-3 border-t pt-3 border-dashed border-gray-200 dark:border-slate-700">
                      <p className="text-xs font-bold mb-2 text-sky-600 animate-pulse">⚡ {filteredOffers.length} Driver Menawarkan Jasa:</p>
                      <div className="space-y-2">
                        {filteredOffers.slice(0, 5).map((offer, idx) => (
                          <OfferCard key={idx} offer={offer} onAccept={() => handleAcceptOffer(order, offer)} />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* User Cancel Button */}
                {!isDriverMode && ['pending', 'accepted'].includes(order.status) && (
                  <div className="flex justify-end mb-2">
                    <button onClick={() => handleCancelOrder(order)} className="text-red-500 hover:text-red-600 text-xs font-bold underline flex items-center gap-1">
                      <X size={12} /> Batalkan Pesanan
                    </button>
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-dashed border-gray-300 dark:border-slate-600">
                  <div className="font-bold text-lg text-sky-500">
                    Rp {(order.price || order.totalPrice || 0).toLocaleString('id-ID')}
                  </div>
                  
                  {/* --- LOGIKA TOMBOL BERDASARKAN STATUS --- */}
                  
                  {/* 1. STATUS PENDING: Driver bisa ambil */}
                  {isDriverMode && order.status === 'pending' && (
                    <button 
                      onClick={() => handleTakeOrder(order)}
                      className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <Bike size={16} /> Ambil
                    </button>
                  )}
                  
                  {/* Driver: Lihat Rute (Jika ada koordinat) */}
                  {isDriverMode && order.status === 'pending' && order.pickupCoords && order.destCoords && (
                    <button 
                      onClick={() => setViewingRouteOrder(order)}
                      className="text-sky-500 hover:text-sky-600 text-xs font-bold underline ml-2"
                    >
                      Lihat Rute
                    </button>
                  )}

                  {/* 2. STATUS ACCEPTED: User Upload Bukti */}
                  {!isDriverMode && order.status === 'accepted' && (
                    <button 
                        onClick={() => handleOpenPayment(order)}
                        className="w-full mt-3 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-200 transition-all flex items-center justify-center gap-2"
                    >
                        <Wallet size={18} /> Bayar Sekarang
                    </button>
                  )}
                  {isDriverMode && order.status === 'accepted' && (
                    <span className="text-xs text-gray-500 italic">Menunggu user bayar...</span>
                  )}

                  {/* 3. STATUS PAID: Menunggu Admin (Bisa disimulasikan approve di sini untuk dev) */}
                  {order.status === 'paid' && order.type !== 'food' && (
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-orange-500 font-bold flex items-center gap-1"><Clock size={12}/> Verifikasi Admin</span>
                      {/* Tombol Rahasia Dev untuk Approve (Biar flow jalan) */}
                      <button 
                        onClick={() => updateDoc(doc(dbFirestore, 'ojek_orders', order.id), { status: 'verified' })}
                        className="text-[10px] text-gray-400 underline mt-1"
                      >
                        (Dev: Approve)
                      </button>
                    </div>
                  )}

                  {/* 4. STATUS VERIFIED: Driver Jemput & Chat WA */}
                  {order.status === 'verified' && (
                    <div className="flex flex-col gap-3 w-full">
                      {/* Tampilkan Peta Live Tracking (User & Driver) */}
                      <TrackingMap driverId={order.driverId} pickupCoords={order.pickupCoords} driversLocations={driversLocations} />
                      
                      <div className="flex gap-2 justify-end">
                      <a 
                        href={getWALink(isDriverMode ? order.userPhone : order.driverPhone, isDriverMode ? 'driver' : 'user')}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                      >
                        <Phone size={16} /> WA
                      </a>
                      {isDriverMode && (
                        <button 
                          onClick={() => handleStartTrip(order.id)}
                          className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                        >
                          <Bike size={16} /> Mulai
                        </button>
                      )}
                      </div>
                    </div>
                  )}

                  {/* 4.5 STATUS PENGANTARAN MAKANAN (DRIVER) */}
                  {isDriverMode && order.type === 'food' && ['ready_for_pickup', 'delivering'].includes(order.status) && (
                    <div className="flex gap-2 justify-end">
                      <a href={`https://wa.me/${order.userPhone}`} target="_blank" rel="noreferrer" className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                        <Phone size={16} /> WA Pembeli
                      </a>
                      {order.status === 'ready_for_pickup' && (
                        <button onClick={() => handleUpdateFoodDeliveryStatus(order.id, 'delivering')} className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold">
                          Mulai Antar
                        </button>
                      )}
                      {order.status === 'delivering' && (
                        <button 
                          onClick={() => handleUpdateFoodDeliveryStatus(order.id, 'completed')}
                          className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                        >
                          <CheckSquare size={16} /> Selesai
                        </button>
                      )}
                    </div>
                  )}

                  {/* 5. STATUS ONGOING: User Konfirmasi Selesai */}
                  {order.status === 'ongoing' && (
                    <div className="flex flex-col gap-3 w-full">
                      {/* Tampilkan Peta Live Tracking (User & Driver) */}
                      <TrackingMap driverId={order.driverId} pickupCoords={order.pickupCoords} driversLocations={driversLocations} />
                      
                      <div className="flex justify-end">
                        {isDriverMode ? (
                          <span className="text-xs text-orange-500 font-bold animate-pulse">Sedang Mengantar...</span>
                        ) : (
                          <button 
                            onClick={() => handleFinishTrip(order)}
                            className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                          >
                            <CheckSquare size={16} /> Selesai
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 6. STATUS COMPLETED */}
                  {['completed', 'cancelled', 'payment_rejected'].includes(order.status) && (
                    <div className="flex justify-between items-center w-full mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-slate-700">
                        <span className={`text-xs font-bold flex items-center gap-1 ${order.status === 'completed' ? 'text-green-600' : 'text-red-500'}`}>
                          {order.status === 'completed' ? <Star size={12} fill="currentColor" /> : <X size={12} />} 
                          {order.status === 'completed' ? 'Selesai' : (order.status === 'payment_rejected' ? 'Ditolak' : 'Dibatalkan')}
                        </span>
                        <button 
                            onClick={() => handleDeleteSingleHistory(order)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Hapus Riwayat Ini"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                  )}

                  {/* Fallback Chat untuk status lama */}
                  {!isDriverMode && order.status === 'accepted_legacy' && (
                    <a 
                      href={`https://wa.me/${order.driverPhone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <Phone size={16} /> Chat Driver
                    </a>
                  )}
                </div>
              </div>
            ))
          ))}
        </div>
      </div>

      {/* --- MODAL MAP PICKER (PENUMPANG) --- */}
      {mapPickerMode && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg h-[80vh] rounded-2xl overflow-hidden flex flex-col relative">
            <MapContainer center={[-8.172, 113.700]} zoom={15} style={{ height: '100%', width: '100%' }}>
              <MapLayerControl />
              <MapPickerCenter onChange={setTempPickerCenter} />
              <AutoLocate />
              <MapSearchControl />
              <MyLocationControl />
              {/* Scan Driver di Lokasi Pilihan (Visual Feedback) */}
              {tempPickerCenter && <NearbyDrivers driversLocations={driversLocations} center={tempPickerCenter} />}
            </MapContainer>
            
            {/* Center Pin Icon (Overlay) */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[900] pointer-events-none -mt-8">
              <MapPin size={40} className="text-red-600 fill-current drop-shadow-xl" />
            </div>

            <div className="p-4 border-t bg-white flex flex-col gap-3">
              <button 
                onClick={handleUseCurrentLocation} 
                disabled={isLocating}
                className={`w-full py-3 bg-white border-2 border-sky-600 text-sky-600 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 hover:bg-sky-50 ${isLocating ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isLocating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />} 
                {isLocating ? 'Mencari Lokasi...' : 'Gunakan Lokasi Saat Ini'}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setMapPickerMode(null)} className="flex-1 py-3 border rounded-xl font-bold text-gray-600 hover:bg-gray-50">Batal</button>
                <button onClick={handleConfirmLocation} className="flex-1 py-3 bg-sky-600 text-white rounded-xl font-bold shadow-lg hover:bg-sky-700">Konfirmasi Lokasi Ini</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL LIHAT RUTE (DRIVER) --- */}
      {viewingRouteOrder && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg h-[60vh] rounded-2xl overflow-hidden flex flex-col relative">
            <button onClick={() => setViewingRouteOrder(null)} className="absolute top-4 right-4 z-[1000] bg-white text-gray-800 p-2 rounded-full shadow-lg hover:bg-gray-100"><X size={20}/></button>
            
            <MapContainer 
              bounds={L.latLngBounds([viewingRouteOrder.pickupCoords, viewingRouteOrder.destCoords])} 
              style={{ height: '100%', width: '100%' }}
            >
              <MapLayerControl />
              
              {/* Marker Jemput */}
              <Marker position={viewingRouteOrder.pickupCoords}>
                <Popup>Titik Jemput: {viewingRouteOrder.pickup}</Popup>
              </Marker>
              
              {/* Marker Tujuan */}
              <Marker position={viewingRouteOrder.destCoords}>
                <Popup>Tujuan: {viewingRouteOrder.destination}</Popup>
              </Marker>

              {/* Garis Rute (Lurus) */}
              <Polyline positions={[viewingRouteOrder.pickupCoords, viewingRouteOrder.destCoords]} color="blue" dashArray="10, 10" />
            </MapContainer>
            
            {/* Route Summary Card (Floating Bottom) */}
            <div className="absolute bottom-6 left-4 right-4 z-[900] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-gray-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1 flex items-center gap-1"><Navigation size={10}/> Estimasi Rute</p>
                <div className="flex items-center gap-4">
                    <div><p className="text-xs text-gray-400">Jarak</p><p className="text-sm font-bold text-gray-800">{viewingRouteOrder.distance || '-'} km</p></div>
                    <div className="w-px h-6 bg-gray-200"></div>
                    <div><p className="text-xs text-gray-400">Waktu</p><p className="text-sm font-bold text-sky-600">{formatDuration(viewingRouteOrder.duration)}</p></div>
                </div>
              </div>
              <div className="text-right">
                 <p className="text-xs text-gray-400">Tarif {viewingRouteOrder.vehicleType === 'mobil' ? 'Mobil' : 'Motor'}</p>
                 <p className="text-lg font-bold text-green-600">Rp {(viewingRouteOrder.price || 0).toLocaleString('id-ID')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL PEMBAYARAN USER --- */}
      {paymentModalOpen && selectedOrderForPayment && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
                {/* Header */}
                <div className="p-5 border-b dark:border-slate-700 bg-gradient-to-r from-sky-600 to-blue-600 text-white relative">
                    <button onClick={() => setPaymentModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"><X size={24}/></button>
                    <h3 className="font-bold text-lg flex items-center gap-2"><Wallet size={20}/> Konfirmasi Pembayaran</h3>
                    <div className="mt-4 flex justify-between items-end">
                        <div>
                            <p className="text-sky-100 text-xs">Total Tagihan</p>
                            <p className="text-3xl font-extrabold">Rp {selectedOrderForPayment.price.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sky-100 text-xs">{selectedOrderForPayment.distance} km • {selectedOrderForPayment.vehicleType === 'mobil' ? 'Mobil' : 'Motor'}</p>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Rute Summary */}
                    <div className={`p-3 rounded-xl border flex items-center gap-3 ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                            <div className="w-0.5 h-6 bg-gray-300 dark:bg-slate-500"></div>
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        </div>
                        <div className="flex-1 text-sm">
                            <p className={`font-bold line-clamp-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedOrderForPayment.pickup}</p>
                            <p className="text-xs text-gray-400 my-1">ke</p>
                            <p className={`font-bold line-clamp-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedOrderForPayment.destination}</p>
                        </div>
                    </div>

                    {/* QRIS Section */}
                    {adminPaymentInfo && (
                        <div className="text-center space-y-3">
                            <p className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Scan QRIS atau Transfer Bank</p>
                            
                            {adminPaymentInfo.qrisUrl ? (
                                <button 
                                    onClick={() => setShowQrisModal(true)}
                                    className={`w-full py-3 border rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${isDarkMode ? 'bg-slate-700 border-slate-600 text-sky-400 hover:bg-slate-600' : 'bg-white border-gray-200 text-sky-600 hover:bg-sky-50'}`}
                                >
                                    <ImageIcon size={18} /> Lihat QRIS / Detail Pembayaran
                                </button>
                            ) : (
                                <div className="w-48 h-48 mx-auto bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs">QRIS Tidak Tersedia</div>
                            )}

                            <div className={`p-3 rounded-xl text-sm ${isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-blue-50 text-blue-800'}`}>
                                <p className="font-bold">{adminPaymentInfo.bankName} - {adminPaymentInfo.accountNumber}</p>
                                <p className="text-xs opacity-80">a.n {adminPaymentInfo.accountHolder}</p>
                                <button onClick={() => navigator.clipboard.writeText(adminPaymentInfo.accountNumber)} className="text-xs underline mt-1 hover:text-blue-600">Salin No. Rekening</button>
                            </div>
                        </div>
                    )}

                    {/* Upload Proof */}
                    <div>
                        <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Upload Bukti Transfer</label>
                        <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative h-32 ${isDarkMode ? 'border-slate-600 hover:border-sky-500 bg-slate-700/50' : 'border-gray-300 hover:border-sky-500 bg-gray-50'}`}>
                            <input type="file" accept="image/*" onChange={handlePaymentFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            {paymentProofPreview ? (
                                <img src={paymentProofPreview} alt="Preview" className="h-full object-contain rounded-lg" />
                            ) : (
                                <><div className="p-3 bg-sky-100 text-sky-600 rounded-full mb-2 dark:bg-sky-900/30 dark:text-sky-400"><Camera size={20} /></div><p className="text-xs text-gray-500">Ketuk untuk ambil foto / upload</p></>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className={`p-5 border-t ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-100 bg-gray-50'}`}>
                    <button onClick={handleSubmitPayment} disabled={isLoading} className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2">
                        {isLoading ? <Loader2 size={20} className="animate-spin"/> : <><CheckSquare size={20}/> Konfirmasi Pembayaran</>}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- MODAL QRIS POPUP --- */}
      {showQrisModal && adminPaymentInfo?.qrisUrl && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowQrisModal(false)}>
            <div className={`p-4 rounded-2xl max-w-sm w-full relative shadow-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowQrisModal(false)} className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${isDarkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><X size={20}/></button>
                <h3 className={`text-center font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Scan QRIS</h3>
                <div className="bg-white p-2 rounded-xl">
                    <img src={adminPaymentInfo.qrisUrl} alt="QRIS" className="w-full h-auto rounded-lg" />
                </div>
                <div className="mt-4 text-center">
                    <a href={adminPaymentInfo.qrisUrl} download="QRIS_SobatNiaga.jpg" className="text-sky-500 text-sm font-bold hover:underline flex items-center justify-center gap-1">
                        <Download size={16}/> Download Gambar
                    </a>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default NiagaGo;