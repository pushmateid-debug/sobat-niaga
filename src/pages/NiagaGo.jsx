import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Bike, MapPin, Navigation, Phone, User, Clock, Wallet, AlertCircle, Upload, Shield, CheckSquare, DollarSign, Star, FileText, X, MessageCircle,
  Image as ImageIcon, LocateFixed, Globe, Layers, Loader2, Car, Download, Camera, Trash2, ArrowLeft, Eye, Utensils,
  Share2, ChevronRight, ChevronDown, Award, TrendingUp, Calendar
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Swal from 'sweetalert2';
import { auth, db as realDb, dbFirestore, functions } from '../config/firebase';
import { uploadToCloudinary as uploadCloudinaryFile } from '../utils/cloudinaryUpload';
import { ref, onValue, update, get, push, runTransaction, query as realQuery, orderByChild, equalTo } from 'firebase/database';
import { collection, addDoc, query, where, onSnapshot, updateDoc, getDoc, getDocs, writeBatch, doc, orderBy, serverTimestamp, arrayUnion, runTransaction as runFirestoreTransaction } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import NiagaGoChat from '../components/NiagaGoChat';
import { getNiagaGoFare, getOsrmRoute } from '../utils/niagaGoPricing';
// import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const OFFER_DURATION_MS = 60 * 1000;
const INITIAL_SEARCH_DURATION_MS = 2 * 60 * 1000;
const SEARCH_EXPANSION_STEP_MS = 60 * 1000;
const DEFAULT_SEARCH_EXPIRY_MS = 10 * 60 * 1000;
const DRIVER_LOCATION_MAX_AGE_MS = 2 * 60 * 1000;
const TRIP_COMPLETION_RADIUS_METERS = 150;
const INITIAL_SEARCH_RADIUS_METERS = 2000;
const MAX_SEARCH_RADIUS_METERS = 4000;
const ZONE_RADIUS = MAX_SEARCH_RADIUS_METERS;

const getTimestampMillis = (value) => {
  if (typeof value === 'number') return value;
  if (value?.toMillis) return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getOfferExpiry = (offer, order) => {
  if (typeof offer.expiresAt === 'number') return offer.expiresAt;
  const createdAt = getTimestampMillis(offer.createdAt) || getTimestampMillis(order.createdAt);
  return createdAt ? createdAt + OFFER_DURATION_MS : 0;
};

const getActiveOffers = (order, now = Date.now()) => (
  (Array.isArray(order.offers) ? order.offers : []).filter((offer) =>
    offer.status !== 'rejected' && getOfferExpiry(offer, order) > now
  )
);

const normalizeGpsCoordinates = (coordinates) => {
  if (!coordinates || coordinates.lat == null || coordinates.lng == null ||
      coordinates.lat === '' || coordinates.lng === '') return null;

  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
};

const getGoogleMapsDirectionsUrl = (coordinates) => (
  `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}&travelmode=two-wheeler&dir_action=navigate`
);

// DISABLED: Aturan jarak dinonaktifkan sesuai permintaan user
// Semua driver dapat melihat dan mengirim penawaran ke semua pesanan tanpa batas jarak
const getSearchRadius = (order, now = Date.now()) => {
  return Infinity;
};

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

const summarizeReviews = (reviews) => {
  const entries = Object.values(reviews || {}).filter((review) => Number.isFinite(Number(review?.rating)));
  if (!entries.length) return { average: null, count: 0 };
  const total = entries.reduce((sum, review) => sum + Number(review.rating), 0);
  return { average: Number((total / entries.length).toFixed(2)), count: entries.length };
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

  // Debounce Search Effect (Autocomplete)
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length >= 3) { // Minimal 3 karakter
        setIsSearching(true);
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=id&addressdetails=1`);
          if (!response.ok) throw new Error("Gagal mengambil data lokasi");
          const data = await response.json();
          setResults(data);
        } catch (err) {
          console.debug("Search Error:", err.message);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
      }
    }, 800); // Delay 800ms biar gak spam API

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSelect = (lat, lon) => {
    map.flyTo([lat, lon], 16);
    setResults([]);
    setQuery(''); 
  };

  return (
    <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-2">
      <div className="relative shadow-lg rounded-xl bg-white">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari lokasi (cth: Kampus, Stasiun)..." 
          className="w-full py-2.5 pl-10 pr-10 rounded-xl border-none outline-none text-sm font-medium bg-transparent focus:bg-white transition-all text-gray-800 placeholder:text-gray-400"
        />
        <div className="absolute left-3 top-2.5 text-gray-400">
            {isSearching ? <Loader2 size={18} className="animate-spin text-sky-500" /> : <LocateFixed size={18} />}
        </div>
        {query && (
            <button type="button" onClick={() => {setQuery(''); setResults([]);}} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                <X size={18} />
            </button>
        )}
      </div>
      
      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto border border-gray-100 animate-in fade-in slide-in-from-top-2">
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
const NearbyDrivers = ({ driversLocations, center, filterType }) => {
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

      // 3. Cek Tipe Kendaraan (Filter Penumpang)
      if (filterType && d.vehicleType !== filterType) return false;

      // ATURAN JARAK DINONAKTIFKAN - Tampilkan semua driver tanpa batas jarak
      return true;
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
const TrackingMap = ({ driverId, pickupCoords, status, driversLocations, passengerVehicleType }) => {
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
                <NearbyDrivers driversLocations={driversLocations} center={pickupCoords || userPos} filterType={passengerVehicleType} />
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
const OfferCard = ({ offer, expiresAt: offerExpiresAt, onAccept, onReject, onTimeout, isRetry = false }) => {
  const [now, setNow] = useState(Date.now());
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const createdAt = getTimestampMillis(offer.createdAt);
  const expiresAt = offerExpiresAt || offer.expiresAt || (createdAt + OFFER_DURATION_MS);
  const duration = Math.max(1, expiresAt - createdAt);
  const progress = Math.min(100, Math.max(0, ((duration - Math.max(0, expiresAt - now)) / duration) * 100));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (now >= expiresAt && onTimeout) onTimeout();
  }, [expiresAt, now, onTimeout]);

  if (now >= expiresAt && !isRetry) return null;

  return (
    <div className={`p-3 rounded-xl border shadow-sm mb-2 relative overflow-hidden animate-in slide-in-from-bottom-2 ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-3 relative z-10">
        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
           <img src={offer.driverPhoto || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" alt="Driver" />
        </div>
        <div className="flex-1">
           <h4 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{offer.driverName}</h4>
           <div className="flex items-center gap-1 text-xs text-yellow-500">
              <Star size={10} fill="currentColor" /> {offer.rating ? Number(offer.rating).toFixed(1) : 'Baru'}
              <span className="text-gray-400">• {Number(offer.completedTrips) || 0} perjalanan • {offer.vehicleType === 'mobil' ? 'Mobil' : 'Motor'}</span>
           </div>
           {offer.pickupDistance != null && <p className="text-[11px] text-gray-500">Jarak jemput {Number(offer.pickupDistance).toFixed(1)} km</p>}
           {offer.vehiclePlate && <p className="text-[11px] text-gray-500">Plat terverifikasi: {offer.vehiclePlate}</p>}
        </div>
        <div className="text-right">
           <p className="font-bold text-sky-600">Rp {(offer.price || 0).toLocaleString('id-ID')}</p>
           <p className="text-[11px] text-gray-500">Berlaku {Math.max(0, Math.ceil((expiresAt - now) / 1000))} dtk</p>
        </div>
      </div>
      
      <button 
        onClick={onAccept}
        disabled={now >= expiresAt && !isRetry}
        className="mt-3 w-full relative h-9 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden group"
      >
        {/* Progress Bar Animation */}
        <div 
            className="absolute top-0 left-0 h-full bg-sky-500/20 dark:bg-sky-500/40 transition-all ease-linear"
            style={{ width: `${progress}%`, transitionDuration: '100ms' }}
        ></div>
        <span className="relative z-10 text-xs font-bold text-sky-600 dark:text-sky-400 group-hover:text-sky-700">{isRetry ? 'Lanjutkan Persetujuan' : 'Terima Tawaran'}</span>
      </button>
      {onReject && !isRetry && (
        <button onClick={onReject} className="w-full mt-2 py-2 text-xs font-bold text-gray-500 hover:text-red-500">
          Tolak Penawaran
        </button>
      )}
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
  const [activeVehicle, setActiveVehicle] = useState('motor'); // 'motor' | 'mobil' (Status Driver saat ini)
  const [driverService, setDriverService] = useState('ojek'); // 'ojek' | 'food'
  const [userLocation, setUserLocation] = useState(null); // Lokasi GPS User (Untuk proteksi order jauh)

  // State Form Order
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const createOrderInProgressRef = useRef(false);
  const [searchClock, setSearchClock] = useState(Date.now());
  const [isLocating, setIsLocating] = useState(false); // State loading GPS
  const [vehicleType, setVehicleType] = useState('motor'); // 'motor' | 'mobil'
  const [estDistance, setEstDistance] = useState(null);
  const [estDuration, setEstDuration] = useState(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState(null);
  const [routeEstimateError, setRouteEstimateError] = useState('');
  const [isEstimatingRoute, setIsEstimatingRoute] = useState(false);
  const routeEstimateRequestRef = useRef(0);
  
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
  const [viewMode, setViewMode] = useState('main'); // 'main' | 'register' | 'performa'
  const [regForm, setRegForm] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    plateNumber: '', // Plat nomor
    vehicles: {
      motor: { active: true, plate: '' },
      mobil: { active: false, plate: '' }
    },
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
  const [searchExpiryMs, setSearchExpiryMs] = useState(DEFAULT_SEARCH_EXPIRY_MS);
  const [searchExpiryLoaded, setSearchExpiryLoaded] = useState(false);
  const expiringOrderIdsRef = useRef(new Set());
  const [activeChat, setActiveChat] = useState(null);
  const [openingChatOrderId, setOpeningChatOrderId] = useState(null);

  // --- STATE PERFORMA DRIVER ---
  const [driverEarnings, setDriverEarnings] = useState({}); // { orderId: {...} }
  const [driverReviews, setDriverReviews] = useState({}); // { orderId: {...} }
  const [passengerReviews, setPassengerReviews] = useState({});
  const [passengerReviewSummaries, setPassengerReviewSummaries] = useState({});
  const passengerReviewRequestsRef = useRef(new Set());
  const passengerRatingPromptedRef = useRef(new Set());
  const passengerRatingPromptInFlightRef = useRef(false);
  const [performaTab, setPerformaTab] = useState('hari'); // 'hari' | 'minggu' | 'bulan'
  const [showEarningsDetail, setShowEarningsDetail] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [selectedTripDetail, setSelectedTripDetail] = useState(null); // order untuk detail trip

  const getAuthorizedDriverOrder = async (orderId, allowedStatuses) => {
    if (!isDriverMode || !userProfile?.uid) {
      throw new Error('Navigasi hanya tersedia dalam mode driver.');
    }

    const orderSnapshot = await getDoc(doc(dbFirestore, 'ojek_orders', orderId));
    if (!orderSnapshot.exists()) throw new Error('Pesanan tidak ditemukan.');

    const order = orderSnapshot.data();
    if (order.driverId !== userProfile.uid) {
      throw new Error('Anda tidak berwenang mengakses perjalanan ini.');
    }
    if (!allowedStatuses.includes(order.status)) {
      throw new Error('Status pesanan tidak mengizinkan tindakan ini.');
    }

    return order;
  };

  const handleOpenDriverNavigation = async (order, target) => {
    try {
      if (order.driverId !== userProfile?.uid) {
        throw new Error('Navigasi hanya tersedia untuk pesanan milik Anda.');
      }

      const currentOrder = await getAuthorizedDriverOrder(
        order.id,
        target === 'pickup'
          ? ['verified', 'ongoing']
          : ['ongoing']
      );
      const coordinates = normalizeGpsCoordinates(
        target === 'pickup' ? currentOrder.pickupCoords : currentOrder.destCoords
      );
      if (!coordinates) {
        throw new Error(target === 'pickup'
          ? 'Koordinat penjemputan tidak tersedia pada pesanan ini.'
          : 'Koordinat tujuan tidak tersedia pada pesanan ini.');
      }

      window.location.assign(getGoogleMapsDirectionsUrl(coordinates));
    } catch (error) {
      console.error('Gagal membuka navigasi NiagaGo:', error);
      Swal.fire('Navigasi Tidak Tersedia', error.message || 'Gagal membuka navigasi.', 'error');
    }
  };

  const handleSharePickupLocation = async (order) => {
    try {
      if (order.driverId !== userProfile?.uid) {
        throw new Error('Lokasi hanya dapat dibagikan oleh driver pemilik pesanan.');
      }

      const currentOrder = await getAuthorizedDriverOrder(order.id, ['verified', 'ongoing']);
      const coordinates = normalizeGpsCoordinates(currentOrder.pickupCoords);
      if (!coordinates) throw new Error('Koordinat penjemputan tidak tersedia pada pesanan ini.');

      const mapsUrl = getGoogleMapsDirectionsUrl(coordinates);
      const pickupLabel = currentOrder.pickup || 'Lokasi penjemputan';
      const shareText = [
        'NiagaGo - lokasi penjemputan',
        pickupLabel,
        `Koordinat GPS: ${coordinates.lat}, ${coordinates.lng}`,
        `Google Maps: ${mapsUrl}`
      ].join('\n');

      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Lokasi Penjemputan NiagaGo',
          text: shareText,
          url: mapsUrl
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(mapsUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = mapsUrl;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!copied) throw new Error('Browser tidak dapat menyalin tautan.');
      }
      await Swal.fire('Tautan Disalin', 'Tautan lokasi penjemputan siap dibagikan.', 'success');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Gagal membagikan lokasi penjemputan NiagaGo:', error);
      Swal.fire('Gagal Membagikan Lokasi', error.message || 'Periksa izin berbagi atau clipboard browser.', 'error');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setSearchClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(realDb, 'admin/settings'), (snapshot) => {
      const settings = snapshot.val() || {};
      if (settings.autoExpireOjekOrders === false) {
        setSearchExpiryMs(Infinity);
        setSearchExpiryLoaded(true);
        return;
      }

      const value = Number(settings.niagaGoOrderExpiryValue ?? 10);
      const multiplier = settings.niagaGoOrderExpiryUnit === 'seconds' ? 1000 : 60 * 1000;
      const configuredExpiry = value * multiplier;
      setSearchExpiryMs(Number.isFinite(configuredExpiry) && configuredExpiry > 0
        ? Math.min(configuredExpiry, 7 * 24 * 60 * 60 * 1000)
        : DEFAULT_SEARCH_EXPIRY_MS);
      setSearchExpiryLoaded(true);
    }, (error) => {
      console.error('Gagal memuat pengaturan masa aktif NiagaGo:', error);
      setSearchExpiryMs(DEFAULT_SEARCH_EXPIRY_MS);
      setSearchExpiryLoaded(true);
    });
    return () => unsubscribe();
  }, []);

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
    const infoRef = ref(realDb, 'admin/paymentInfo'); // Sync dengan Marketplace path
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
  }, [isDriverMode, driverService, userProfile?.uid]);

  // --- FETCH ULASAN PENUMPANG UNTUK PERFORMA PRIBADI ---
  useEffect(() => {
    if (!userProfile?.uid) {
      setPassengerReviews({});
      return;
    }
    const passengerReviewsRef = ref(realDb, `passenger_reviews/${userProfile.uid}`);
    return onValue(passengerReviewsRef, (snapshot) => {
      setPassengerReviews(snapshot.exists() ? snapshot.val() : {});
    });
  }, [userProfile?.uid]);

  // Driver dapat melihat rating penumpang pada order yang masuk.
  useEffect(() => {
    if (!isDriverMode) {
      passengerReviewRequestsRef.current.clear();
      setPassengerReviewSummaries({});
      return;
    }
    const passengerIds = [...new Set(orders.filter((order) => order.type !== 'food' && order.userId).map((order) => order.userId))];
    passengerIds.forEach((passengerId) => {
      if (passengerReviewRequestsRef.current.has(passengerId)) return;
      passengerReviewRequestsRef.current.add(passengerId);
      get(ref(realDb, `passenger_reviews/${passengerId}`))
        .then((snapshot) => {
          const summary = summarizeReviews(snapshot.exists() ? snapshot.val() : {});
          setPassengerReviewSummaries((current) => ({ ...current, [passengerId]: summary }));
        })
        .catch((error) => {
          console.warn('Rating penumpang tidak dapat dimuat:', error);
          setPassengerReviewSummaries((current) => ({ ...current, [passengerId]: { average: null, count: 0 } }));
        });
    });
  }, [isDriverMode, orders]);

  // --- FETCH DRIVER EARNINGS & REVIEWS (REALTIME DB) ---
  useEffect(() => {
    if (!isDriverMode || !userProfile?.uid) return;
    const earningsRef = ref(realDb, `driver_earnings/${userProfile.uid}`);
    const unsubEarnings = onValue(earningsRef, (snap) => {
      setDriverEarnings(snap.exists() ? snap.val() : {});
    });
    const reviewsRef = ref(realDb, `driver_reviews/${userProfile.uid}`);
    const unsubReviews = onValue(reviewsRef, (snap) => {
      setDriverReviews(snap.exists() ? snap.val() : {});
    });
    return () => { unsubEarnings(); unsubReviews(); };
  }, [isDriverMode, userProfile?.uid]);

  // --- REALTIME DATA FETCHING ---
  useEffect(() => {
    if (!dbFirestore || !userProfile?.uid) {
      return;
    }

    const ordersRef = collection(dbFirestore, 'ojek_orders');
    const subscriptions = [];
    let pendingDriverOrders = [];
    let assignedDriverOrders = [];
    let hasShownListenerError = false;

    const publishDriverOrders = () => {
      const byId = new Map([...pendingDriverOrders, ...assignedDriverOrders].map((order) => [order.id, order]));
      const visible = Array.from(byId.values()).filter((order) => !order.hiddenForDriver);
      setOrders(visible);
    };

    const listenTo = (ordersQuery, onData) => subscriptions.push(onSnapshot(ordersQuery, (snapshot) => {
      onData(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() })));
    }, (error) => {
      console.error('Gagal ambil data order:', error);
      if (!hasShownListenerError) {
        hasShownListenerError = true;
        Swal.fire('Gagal Memuat Pesanan', error.message || 'Periksa koneksi dan izin database.', 'error');
      }
    }));

    if (isDriverMode) {
      listenTo(query(ordersRef, where('status', '==', 'pending')), (data) => {
        pendingDriverOrders = data;
        publishDriverOrders();
      });
      listenTo(query(ordersRef, where('driverId', '==', userProfile.uid)), (data) => {
        assignedDriverOrders = data;
        publishDriverOrders();

        // Pulihkan riwayat order selesai yang belum sempat tercatat, termasuk order cash lama.
        data.forEach(async (orderItem) => {
          if (orderItem.status !== 'completed') return;

          const completedAt = getTimestampMillis(orderItem.completedAt) || Date.now();
          const price = Number(orderItem.agreedPrice ?? orderItem.price ?? orderItem.fareAmount);
          if (!Number.isSafeInteger(price) || price <= 0) return;
          const appFee = calculateAdminFee(price);
          const netIncome = Math.max(0, price - appFee);
          const nowMs = completedAt;
          const earningsRef = ref(realDb, `driver_earnings/${userProfile.uid}/${orderItem.id}`);
          const earningsSnapshot = await get(earningsRef).catch(() => null);

          try {
            if (orderItem.paymentMethod === 'saldo' && orderItem.driverCredited !== true) {
              const driverRef = ref(realDb, `users/${userProfile.uid}`);
              const payoutResult = await runTransaction(driverRef, (current) => {
                if (!current) return current;
                const payouts = current.niagaGoPayouts || {};
                if (payouts[orderItem.id]) return current;
                return {
                  ...current,
                  balance: (parseInt(current.balance) || 0) + netIncome,
                  niagaGoPayouts: { ...payouts, [orderItem.id]: { amount: netIncome, paidAt: nowMs } }
                };
              });
              if (!payoutResult.committed && !payoutResult.snapshot.child(`niagaGoPayouts/${orderItem.id}`).exists()) {
                throw new Error('Pencairan saldo driver belum dapat dipastikan.');
              }
            }

            if (!earningsSnapshot?.exists()) {
              await update(earningsRef, {
                orderId: orderItem.id,
                date: new Date(completedAt).toISOString().split('T')[0],
                completedAt,
                price,
                netIncome,
                appFee,
                paymentMethod: orderItem.paymentMethod || 'cash',
                pickup: orderItem.pickup || '',
                destination: orderItem.destination || '',
                distance: orderItem.distance || orderItem.routeDistanceKm || 0,
                duration: orderItem.duration || 0,
                pickupTime: orderItem.pickupStartedAt || null,
                driverCredited: true
              });
            }

            if (orderItem.paymentMethod === 'saldo' && orderItem.driverCredited !== true) {
              await updateDoc(doc(dbFirestore, 'ojek_orders', orderItem.id), { driverCredited: true });
            }
          } catch (autoCreditErr) {
            console.warn('Driver earnings recovery error:', autoCreditErr);
          }
        });
      });
    } else {
      listenTo(query(ordersRef, where('userId', '==', userProfile.uid)), (data) => {
        setOrders(data.filter((order) => !order.hiddenForUser));
      });
    }

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [isDriverMode, userProfile?.uid]);

  useEffect(() => {
    if (!searchExpiryLoaded || isDriverMode || !dbFirestore || !userProfile?.uid || !Number.isFinite(searchExpiryMs)) return undefined;

    const expireOwnInactiveOrders = () => {
      orders.forEach((order) => {
        if (!['pending', 'accepting', 'accepted', 'paid'].includes(order.status)) return;
        if (expiringOrderIdsRef.current.has(order.id)) return;
        const createdAt = getTimestampMillis(order.createdAt);
        if (!createdAt || Date.now() - createdAt < searchExpiryMs) return;

        expiringOrderIdsRef.current.add(order.id);
        updateDoc(doc(dbFirestore, 'ojek_orders', order.id), {
          status: 'expired',
          expiredAt: Date.now(),
          expirationReason: 'inactive_timeout'
        }).catch((error) => {
          expiringOrderIdsRef.current.delete(order.id);
          console.error(`Gagal meng-expire pesanan NiagaGo ${order.id}:`, error);
        });
      });
    };

    expireOwnInactiveOrders();
    const timer = setInterval(expireOwnInactiveOrders, 10000);
    return () => clearInterval(timer);
  }, [isDriverMode, orders, searchExpiryLoaded, searchExpiryMs, userProfile?.uid]);

  // --- COMBINED ORDERS (OJEK + FOOD) ---
  // Gabungin orderan Ojek (Firestore) dan Food (Realtime DB) buat ditampilin di list
  const combinedOrders = useMemo(() => {
    const normalizedOjek = orders.map(o => ({...o, type: 'ojek'}));
    const allOrders = [...normalizedOjek, ...activeFoodOrders];
    const driverLocation = driversLocations[userProfile?.uid];
    const hasFreshDriverLocation = driverLocation &&
      driverLocation.status === 'standby' &&
      searchClock - Number(driverLocation.updatedAt || 0) <= DRIVER_LOCATION_MAX_AGE_MS;
    const visibleOrders = isDriverMode
      ? allOrders.filter((order) => {
          if (order.type === 'food') return true;
          if (order.driverId === userProfile?.uid && order.status !== 'pending') return true;
          if (driverService !== 'ojek' || order.status !== 'pending') return false;
          const createdAt = getTimestampMillis(order.createdAt);
          const expiresAt = createdAt ? createdAt + searchExpiryMs : order.searchExpiresAt;
          if (Number.isFinite(searchExpiryMs) && expiresAt && expiresAt <= searchClock) return false;
          // ATURAN JARAK DINONAKTIFKAN - Semua driver bisa lihat semua pesanan
          // if (!hasFreshDriverLocation || order.vehicleType !== activeVehicle) return false;
          // if (!order.pickupCoords) return true;
          // const pickupDistance = L.latLng(driverLocation.lat, driverLocation.lng)
          //   .distanceTo(L.latLng(order.pickupCoords.lat, order.pickupCoords.lng));
          // return pickupDistance <= getSearchRadius(order, searchClock);
          return true;
        })
      : allOrders;

    return visibleOrders.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return timeB - timeA;
    });
  }, [orders, activeFoodOrders, isDriverMode, driverService, activeVehicle, driversLocations, userProfile?.uid, searchClock, searchExpiryMs]);

  // --- DRIVER GPS BROADCASTER (Kirim Lokasi ke DB) ---
  useEffect(() => {
    let watchId;
    if (isDriverMode && userProfile?.uid) {
      // Cek status driver (Busy jika ada order aktif)
      const activeOrder = orders.find(o => 
        o.driverId === userProfile.uid && 
        ['accepting', 'accepted', 'paid', 'verified', 'ongoing'].includes(o.status)
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
              vehicleType: activeVehicle // Kirim tipe kendaraan aktif
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
  }, [isDriverMode, orders, userProfile, activeVehicle]);

  // Helper: Upload ke Cloudinary (Optimasi Upload Gambar)
  const uploadToCloudinary = async (file, folder = 'sobatniaga/drivers') => {
    const secureUrl = await uploadCloudinaryFile(file, folder);
    return secureUrl.replace('/upload/', '/upload/q_auto,f_auto/');
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

  // Route distance comes from OSRM; the public endpoint receives the selected coordinates.
  const calculateEstimatedPrice = async (start, end) => {
    const requestId = ++routeEstimateRequestRef.current;
    if (!start || !end) {
      setRouteDistanceKm(null);
      setEstDistance(null);
      setEstDuration(null);
      setPrice('');
      setRouteEstimateError('');
      setIsEstimatingRoute(false);
      return;
    }

    setIsEstimatingRoute(true);
    setRouteEstimateError('');
    setRouteDistanceKm(null);
    setPrice('');
    try {
      const route = await getOsrmRoute(start, end);
      if (requestId !== routeEstimateRequestRef.current) return;
      const fare = getNiagaGoFare(route.distanceKm);
      setRouteDistanceKm(route.distanceKm);
      setEstDistance(route.distanceKm.toFixed(1));
      setEstDuration(route.durationMinutes);
      setPrice(fare == null ? '' : String(fare));
    } catch (error) {
      if (requestId !== routeEstimateRequestRef.current) return;
      console.error('Gagal menghitung rute perjalanan NiagaGo:', error);
      setRouteEstimateError(error.message || 'Rute tidak dapat dihitung. Coba lagi.');
      setEstDistance(null);
      setEstDuration(null);
      setRouteDistanceKm(null);
    } finally {
      if (requestId === routeEstimateRequestRef.current) setIsEstimatingRoute(false);
    }
  };

  // Handle Konfirmasi Lokasi dari Map Picker
  const handleConfirmLocation = async () => {
    if (!tempPickerCenter) return;
    const { lat, lng } = tempPickerCenter;
    const address = await fetchAddress(lat, lng);

    if (mapPickerMode === 'pickup') {
      setPickup(address);
      setPickupCoords({ lat, lng });
      if (destCoords) calculateEstimatedPrice({ lat, lng }, destCoords);
    } else {
      setDestination(address);
      setDestCoords({ lat, lng });
      if (pickupCoords) calculateEstimatedPrice(pickupCoords, { lat, lng });
    }
    setMapPickerMode(null);
  };

  // Handle Gunakan Lokasi Saat Ini (GPS)
  const handleUseCurrentLocation = () => {
    setIsLocating(true);
    
    // Cek HTTPS (Wajib untuk produksi)
    if (window.location.protocol !== 'https:') {
        Swal.fire({
            title: 'Keamanan Browser',
            text: 'Fitur lokasi butuh koneksi aman (HTTPS). Coba refresh atau gunakan browser lain.',
            icon: 'warning',
            confirmButtonText: 'Oke',
            buttonsStyling: false,
            customClass: {
                popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
                title: 'text-lg font-bold text-gray-800',
                htmlContainer: 'text-sm text-gray-600',
                confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
            }
        });
        setIsLocating(false);
        return;
    }

    if (!("geolocation" in navigator)) {
        Swal.fire({
            title: 'Error',
            text: 'Browser tidak mendukung Geolocation.',
            icon: 'error',
            confirmButtonText: 'Oke',
            buttonsStyling: false,
            customClass: {
                popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
                title: 'text-lg font-bold text-gray-800',
                htmlContainer: 'text-sm text-gray-600',
                confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
            }
        });
        setIsLocating(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            try {
                const { latitude, longitude } = pos.coords;
                const address = await fetchAddress(latitude, longitude);
                
                if (mapPickerMode === 'pickup') {
                    setPickup(address);
                    setPickupCoords({ lat: latitude, lng: longitude });
                    if (destCoords) calculateEstimatedPrice({ lat: latitude, lng: longitude }, destCoords);
                } else {
                    setDestination(address);
                    setDestCoords({ lat: latitude, lng: longitude });
                    if (pickupCoords) calculateEstimatedPrice(pickupCoords, { lat: latitude, lng: longitude });
                }
                setMapPickerMode(null);
            } catch (error) {
                console.error("Error processing location:", error);
                Swal.fire({
                    title: 'Gagal',
                    text: 'Terjadi kesalahan saat memproses lokasi.',
                    icon: 'error',
                    confirmButtonText: 'Oke',
                    buttonsStyling: false,
                    customClass: {
                        popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
                        title: 'text-lg font-bold text-gray-800',
                        htmlContainer: 'text-sm text-gray-600',
                        confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
                    }
                });
            } finally {
                setIsLocating(false);
            }
        },
        (err) => {
            setIsLocating(false);
            console.error(err);
            let msg = 'Gagal mengambil lokasi.';
            if (err.code === 1) msg = 'Izin lokasi ditolak. Aktifkan di pengaturan browser.';
            else if (err.code === 2) msg = 'Sinyal GPS tidak tersedia.';
            else if (err.code === 3) msg = 'Waktu permintaan habis (Timeout).';
            
            Swal.fire({
                title: 'Gagal Ambil Lokasi',
                text: msg,
                icon: 'warning',
                confirmButtonText: 'Oke',
                buttonsStyling: false,
                customClass: {
                    popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
                    title: 'text-lg font-bold text-gray-800',
                    htmlContainer: 'text-sm text-gray-600',
                    confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
                }
            });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // Timeout dinaikkan jadi 15s buat HP
    );
  };

  // Recalculate price when vehicle type changes
  useEffect(() => {
    if (pickupCoords && destCoords) {
      calculateEstimatedPrice(pickupCoords, destCoords);
    }
  }, [vehicleType]);

  // --- ACTIONS ---
  
  // 0. Handle Toggle Driver Mode (Dengan Pilihan Armada)
  const handleToggleDriverMode = async () => {
    if (isDriverMode) {
      setIsDriverMode(false);
      // Set offline di DB
      if (userProfile?.uid) {
        update(ref(realDb, `drivers_locations/${userProfile.uid}`), { status: 'offline' });
      }
      return;
    }

    // Data kendaraan normalnya tersimpan di profil RTDB. Untuk profil lama yang kosong,
    // pulihkan dari pendaftaran driver yang sudah disetujui di Firestore.
    let vehicles = userProfile?.vehicles || {};
    let legacyPlateNumber = userProfile?.plateNumber || '';
    let hasMotor = Boolean(vehicles.motor?.active);
    let hasMobil = Boolean(vehicles.mobil?.active);

    if (!hasMotor && !hasMobil && !legacyPlateNumber && userProfile?.uid) {
      try {
        const registrationsQuery = query(
          collection(dbFirestore, 'driver_registrations'),
          where('userId', '==', userProfile.uid)
        );
        const registrationsSnapshot = await getDocs(registrationsQuery);
        const approvedRegistration = registrationsSnapshot.docs
          .map((registrationDoc) => registrationDoc.data())
          .filter((registration) => registration.status === 'approved')
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .find((registration) =>
            registration.vehicles?.motor?.active ||
            registration.vehicles?.mobil?.active ||
            registration.plateNumber
          );

        if (approvedRegistration) {
          vehicles = approvedRegistration.vehicles || {};
          legacyPlateNumber = approvedRegistration.plateNumber || '';
          hasMotor = Boolean(vehicles.motor?.active);
          hasMobil = Boolean(vehicles.mobil?.active);
        }
      } catch (error) {
        console.error('Gagal memulihkan data kendaraan driver:', error);
      }
    }

    const inputOptions = {};
    if (hasMotor) inputOptions.motor = `Motor (${vehicles.motor.plate || legacyPlateNumber || 'Terdaftar'})`;
    if (hasMobil) inputOptions.mobil = `Mobil (${vehicles.mobil.plate || legacyPlateNumber || 'Terdaftar'})`;

    // Kompatibilitas untuk pendaftaran versi lama yang hanya menyimpan plat nomor.
    if (!hasMotor && !hasMobil) {
      if (legacyPlateNumber) {
        inputOptions.motor = `Kendaraan (${legacyPlateNumber})`;
      } else {
        Swal.fire('Data Kendaraan Tidak Ditemukan', 'Data kendaraan pada pendaftaran driver belum tersedia. Silakan lengkapi pendaftaran atau hubungi admin.', 'error');
        return;
      }
    }

    const { value } = await Swal.fire({
      title: 'Hari ini narik pakai apa?',
      text: 'Pilih kendaraan yang kamu gunakan hari ini.',
      input: 'radio',
      inputOptions: inputOptions,
      inputValue: hasMotor ? 'motor' : (hasMobil ? 'mobil' : 'motor'),
      confirmButtonText: 'Lanjut On-Bid',
      showCancelButton: true,
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0ea5e9'
    });

    if (value) {
      setActiveVehicle(value);
      setIsDriverMode(true);
    }
  };

  // 1. User Membuat Order
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (createOrderInProgressRef.current) return;
    const requiresManualQuote = Number.isFinite(routeDistanceKm) && routeDistanceKm > 30;
    const routeFare = Number.isFinite(routeDistanceKm) ? getNiagaGoFare(routeDistanceKm) : null;
    if (!pickup.trim() || !destination.trim() || !pickupCoords || !destCoords ||
        isEstimatingRoute || !Number.isFinite(routeDistanceKm) ||
        (!requiresManualQuote && (!routeFare || Number(price) !== routeFare))) {
      Swal.fire('Data Rute Belum Siap', 'Pilih koordinat penjemputan dan tujuan, lalu tunggu estimasi rute jalan selesai.', 'warning');
      return;
    }

    createOrderInProgressRef.current = true;
    setIsLoading(true);
    try {
      const activeStatuses = ['pending', 'accepting', 'accepted', 'paid', 'verified', 'ongoing'];
      const hasActiveOrder = orders.some((order) =>
        activeStatuses.includes(order.status) &&
        (order.status !== 'pending' || !Number.isFinite(searchExpiryMs) ||
          (getTimestampMillis(order.createdAt) ? getTimestampMillis(order.createdAt) + searchExpiryMs > Date.now() : !order.searchExpiresAt || order.searchExpiresAt > Date.now()))
      );
      if (hasActiveOrder) {
        await Swal.fire('Pesanan Masih Aktif', 'Selesaikan atau batalkan pesanan yang sedang berjalan sebelum membuat pesanan baru.', 'info');
        return;
      }

      if (!userProfile?.phoneNumber) {
        const result = await Swal.fire({
          title: 'Nomor HP Kosong',
          text: 'Isi nomor HP di Profil agar driver dapat menghubungi kamu setelah dipilih.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Isi Profil Sekarang',
          cancelButtonText: 'Nanti'
        });
        if (result.isConfirmed && onOpenProfile) onOpenProfile();
        return;
      }

      if (pickupCoords && userLocation) {
        const distanceFromUser = L.latLng(userLocation.lat, userLocation.lng).distanceTo(L.latLng(pickupCoords.lat, pickupCoords.lng));
        if (distanceFromUser > 10000) {
          const confirm = await Swal.fire({
            title: 'Pesan untuk Orang Lain?',
            text: 'Lokasi jemput lebih dari 10 km dari posisimu. Pastikan titik jemput sudah benar.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Lanjut',
            cancelButtonText: 'Cek Lagi',
            confirmButtonColor: '#0ea5e9'
          });
          if (!confirm.isConfirmed) return;
        }
      }

      const numericPrice = requiresManualQuote ? null : routeFare;
      const { value: selectedPaymentMethod } = await Swal.fire({
        title: 'Metode Pembayaran',
        html: requiresManualQuote
          ? `<div class="text-left"><p class="text-sm text-gray-600 mb-3">Rute ${routeDistanceKm.toFixed(1)} km melebihi 30 km. Tarif tidak dihitung otomatis; driver akan mengajukan tarif untuk kamu setujui sebelum pesanan diterima.</p></div>`
          : `<div class="text-left"><p class="text-sm text-gray-600 mb-3">Tarif rute ${routeDistanceKm.toFixed(1)} km: <b class="text-gray-800">Rp ${numericPrice.toLocaleString('id-ID')}</b>. Driver mengonfirmasi tarif yang sama saat mengirim penawaran.</p></div>`,
        input: 'radio',
        inputOptions: {
          saldo: `Saldo SobatNiaga (Sisa: Rp ${(userProfile?.balance || 0).toLocaleString('id-ID')})`,
          cash: 'Tunai / Cash (Bayar ke Driver)'
        },
        inputValue: 'saldo',
        confirmButtonText: 'Lanjut Cari Driver',
        confirmButtonColor: '#0ea5e9',
        showCancelButton: true,
        cancelButtonText: 'Batal'
      });
      if (!selectedPaymentMethod) return;

      if (selectedPaymentMethod === 'saldo' && numericPrice !== null) {
        const userBalance = parseInt(userProfile?.balance || 0);
        if (userBalance < numericPrice) {
          Swal.fire({
            title: 'Saldo Tidak Cukup',
            text: `Saldo Anda (Rp ${userBalance.toLocaleString('id-ID')}) tidak mencukupi untuk tarif perjalanan Rp ${numericPrice.toLocaleString('id-ID')}. Silakan isi saldo atau pilih metode tunai.`,
            icon: 'error',
            confirmButtonText: 'Mengerti'
          });
          return;
        }
      }

      if (!dbFirestore) {
        throw new Error('Database belum terhubung.');
      }

      await addDoc(collection(dbFirestore, 'ojek_orders'), {
        userId: userProfile.uid,
        userName: userProfile.displayName || userProfile.username || 'Mahasiswa',
        userPhotoURL: userProfile.photoURL || null,
        pickup: pickup.trim(),
        destination: destination.trim(),
        pickupCoords: pickupCoords || null,
        destCoords: destCoords || null,
        vehicleType,
        distance: Number(routeDistanceKm.toFixed(1)),
        routeDistanceKm,
        duration: estDuration,
        price: numericPrice,
        fareAmount: numericPrice,
        notes: notes.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        searchExpiresAt: Number.isFinite(searchExpiryMs) ? Date.now() + searchExpiryMs : null,
        offers: [],
        driverId: null,
        paymentMethod: selectedPaymentMethod
      });
      
      Swal.fire({
        title: 'Mencari Driver',
        text: 'Pesananmu dibuat. Driver dapat mengirim penawaran selama pencarian aktif.',
        icon: 'success',
        confirmButtonText: 'Oke',
        buttonsStyling: false,
        customClass: {
          popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
          title: 'text-lg font-bold text-gray-800',
          htmlContainer: 'text-sm text-gray-600',
          confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
        }
      });
      setPickup('');
      setDestination('');
      setPrice('');
      setNotes('');
      setPickupCoords(null);
      setDestCoords(null);
      routeEstimateRequestRef.current += 1;
      setRouteDistanceKm(null);
      setEstDistance(null);
      setEstDuration(null);
      setRouteEstimateError('');
    } catch (error) {
      console.error(error);
      Swal.fire('Error', error.message || 'Gagal membuat pesanan.', 'error');
    } finally {
      createOrderInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  // 2. Driver Mengirim Penawaran (Offer)
  const handleTakeOrder = async (order) => {
    if (takingOrderId) return;
    setTakingOrderId(order.id);
    try {
      const location = driversLocations[userProfile?.uid];
      const now = Date.now();
      const locationAge = now - Number(location?.updatedAt || 0);
      if (!location || location.status !== 'standby' || locationAge > DRIVER_LOCATION_MAX_AGE_MS) {
        throw new Error('Lokasi GPS driver belum aktif atau sudah kedaluwarsa. Aktifkan lokasi lalu coba lagi.');
      }

      // Hitung jarak untuk ditampilkan di offer (tidak digunakan untuk validasi)
      const pickupDistance = order.pickupCoords
        ? L.latLng(location.lat, location.lng).distanceTo(L.latLng(order.pickupCoords.lat, order.pickupCoords.lng))
        : null;
      
      // ATURAN JARAK DINONAKTIFKAN - Driver bisa kirim penawaran ke semua pesanan tanpa batas jarak
      // (Tidak ada validasi pickupDistance > getSearchRadius)

      const routeDistanceKm = Number(order.routeDistanceKm ?? order.distance);
      const requiresManualQuote = !Number.isFinite(routeDistanceKm) || routeDistanceKm > 30;
      let priceValue = getNiagaGoFare(routeDistanceKm);
      if (requiresManualQuote) {
        const { value: offeredPrice } = await Swal.fire({
          title: 'Konfirmasi Tarif Manual',
          text: `Rute ${Number.isFinite(routeDistanceKm) ? `${routeDistanceKm.toFixed(1)} km` : ''} tidak memiliki tarif otomatis. Ajukan tarif yang perlu disetujui penumpang.`,
          input: 'number',
          inputAttributes: { min: '1', step: '1000', inputmode: 'numeric' },
          inputValidator: (value) => {
            if (!Number.isInteger(Number(value)) || Number(value) <= 0) return 'Masukkan tarif yang valid.';
            return undefined;
          },
          showCancelButton: true,
          confirmButtonText: 'Ajukan Tarif',
          cancelButtonText: 'Batal'
        });
        if (!offeredPrice) return;
        priceValue = Number(offeredPrice);
      } else if (!priceValue || Number(order.price) !== priceValue) {
        throw new Error('Tarif pesanan tidak cocok dengan jarak rute. Muat ulang pesanan.');
      }

      const [driverReviewsSnapshot, driverEarningsSnapshot] = await Promise.all([
        get(ref(realDb, `driver_reviews/${userProfile.uid}`)),
        get(ref(realDb, `driver_earnings/${userProfile.uid}`))
      ]);
      const driverStats = summarizeReviews(driverReviewsSnapshot.exists() ? driverReviewsSnapshot.val() : {});
      const completedTrips = Object.keys(driverEarningsSnapshot.exists() ? driverEarningsSnapshot.val() : {}).length;
      const offerId = `${userProfile.uid}_${now}`;
      const vehicle = latestReg?.status === 'approved'
        ? latestReg.vehicles?.[activeVehicle]
        : null;
      const offerData = {
        offerId,
        driverId: userProfile.uid,
        driverName: userProfile.displayName || 'Driver NiagaGo',
        driverPhoto: userProfile.photoURL || null,
        vehicleType: activeVehicle,
        vehiclePlate: vehicle?.plate || '',
        rating: driverStats.average,
        ratingCount: driverStats.count,
        completedTrips,
        pickupDistance: pickupDistance == null ? null : Number((pickupDistance / 1000).toFixed(1)),
        price: priceValue,
        status: 'pending',
        createdAt: now,
        expiresAt: now + OFFER_DURATION_MS
      };

      const orderRef = doc(dbFirestore, 'ojek_orders', order.id);
      await runFirestoreTransaction(dbFirestore, async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error('Pesanan sudah tidak tersedia.');
        const currentOrder = orderSnapshot.data();
        if (currentOrder.status !== 'pending') throw new Error('Pesanan sudah tidak mencari driver.');
        if (currentOrder.searchExpiresAt && currentOrder.searchExpiresAt <= Date.now()) {
          throw new Error('Waktu pencarian pesanan sudah habis.');
        }
        const currentDistanceKm = Number(currentOrder.routeDistanceKm ?? currentOrder.distance);
        const expectedFare = getNiagaGoFare(currentDistanceKm);
        const currentNeedsManualQuote = !Number.isFinite(currentDistanceKm) || currentDistanceKm > 30;
        if (!currentNeedsManualQuote && (expectedFare !== priceValue || currentOrder.price !== expectedFare)) {
          throw new Error('Tarif tetap pesanan berubah. Muat ulang sebelum mengirim penawaran.');
        }
        if (currentNeedsManualQuote !== requiresManualQuote) {
          throw new Error('Jenis tarif pesanan berubah. Muat ulang sebelum mengirim penawaran.');
        }
        const existingOffer = getActiveOffers(currentOrder).some((offer) => offer.driverId === userProfile.uid);
        if (existingOffer) throw new Error('Kamu sudah mengirim penawaran untuk pesanan ini.');
        if ((currentOrder.rejectedOfferIds || []).includes(offerId)) {
          throw new Error('Penawaran ini sudah ditutup.');
        }
        transaction.update(orderRef, { offers: arrayUnion(offerData) });
      });

      await Swal.fire('Terkirim!', 'Penawaran berlaku selama 60 detik dan menunggu persetujuan penumpang.', 'success');
    } catch (error) {
      console.error('Gagal mengirim penawaran NiagaGo:', error);
      Swal.fire('Gagal', error.message || 'Terjadi kesalahan saat mengirim penawaran.', 'error');
    } finally {
      setTakingOrderId(null);
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
                  recipientId: itemsArray[0].sellerId,
                  title: 'Driver Ditemukan!',
                  message: `Driver ${userProfile.displayName} sedang menuju ke tokomu untuk mengambil pesanan #${delivery.orderId.slice(-6)}.`,
                  type: 'info',
                  targetView: 'dashboard-seller',
                  createdAt: serverTimestamp(),
                  status: 'unread'
                });
              }

              await push(ref(realDb, 'notifications'), {
                recipientId: orderData.buyerId,
                title: 'Driver OTW ke Resto!',
                message: `Driver ${userProfile.displayName} (${userProfile.plateNumber}) sedang dalam perjalanan mengambil pesananmu.`,
                type: 'info',
                targetView: 'history',
                targetTab: 'ready_for_pickup',
                orderId: delivery.orderId,
                createdAt: serverTimestamp(),
                status: 'unread'
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
            text: "Konfirmasi pesanan sudah diterima pembeli? Ongkos kirim akan dimasukkan ke saldo driver.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Selesai',
            confirmButtonColor: '#10b981'
        });

        if (result.isConfirmed) {
            try {
                const completeDelivery = httpsCallable(functions, 'completeFoodDelivery');
                const response = await completeDelivery({ orderId });
                const deliveryFee = Number(response.data?.deliveryFee || 0);
                const notificationWarning = response.data?.notificationWarnings?.length > 0;
                await Swal.fire(
                    notificationWarning ? 'Pesanan Selesai' : 'Selesai!',
                    notificationWarning
                        ? `Ongkir Rp ${deliveryFee.toLocaleString('id-ID')} sudah masuk ke saldo, tetapi notifikasi pembeli gagal dikirim.`
                        : `Pesanan selesai. Ongkir Rp ${deliveryFee.toLocaleString('id-ID')} masuk ke saldo driver.`,
                    notificationWarning ? 'warning' : 'success'
                );
            } catch (error) {
                console.error("Error finishing order:", error);
                Swal.fire('Gagal Menyelesaikan', error.message || 'Periksa koneksi dan izin Firebase, lalu coba lagi.', 'error');
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
    const agreedPrice = Number(offer.price);
    if (!Number.isInteger(agreedPrice) || agreedPrice <= 0) {
      Swal.fire('Penawaran Tidak Valid', 'Harga penawaran driver tidak valid.', 'error');
      return;
    }

    let paymentMethod = order.paymentMethod;
    let claimed = false;
    let balancePaymentRecorded = false;
    let selectedDriverPhone = '';
    const selectedOfferId = offer.offerId || `${offer.driverId}_${getTimestampMillis(offer.createdAt)}`;
    const orderRef = doc(dbFirestore, 'ojek_orders', order.id);

    try {
      if (!paymentMethod) {
        const currentBalance = Number(userProfile?.balance || 0);
        const inputOptions = {};
        if (currentBalance >= agreedPrice) inputOptions.saldo = `Saldo (Rp ${currentBalance.toLocaleString('id-ID')})`;
        inputOptions.manual = 'Transfer Manual';
        const { value: selected } = await Swal.fire({
          title: 'Pilih Pembayaran',
          input: 'radio',
          inputOptions,
          inputValue: currentBalance >= agreedPrice ? 'saldo' : 'manual',
          confirmButtonText: 'Lanjut',
          showCancelButton: true
        });
        if (!selected) return;
        paymentMethod = selected;
      }

      if (paymentMethod === 'cash') {
        const confirm = await Swal.fire({
          title: 'Konfirmasi Harga',
          text: `Setujui harga Rp ${agreedPrice.toLocaleString('id-ID')} dan pilih driver ${offer.driverName}?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Setujui Penawaran',
          cancelButtonText: 'Batal'
        });
        if (!confirm.isConfirmed) return;
      }

      await runFirestoreTransaction(dbFirestore, async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error('Pesanan tidak ditemukan.');
        const currentOrder = orderSnapshot.data();
        if (currentOrder.userId !== userProfile.uid) throw new Error('Kamu tidak memiliki akses ke pesanan ini.');

        const selectedOffer = (Array.isArray(currentOrder.offers) ? currentOrder.offers : []).find((item) =>
          item.offerId
            ? item.offerId === selectedOfferId
            : item.driverId === offer.driverId && Number(item.price) === agreedPrice
        );
        const isRetry = currentOrder.status === 'accepting' &&
          currentOrder.selectedOfferId === selectedOfferId &&
          currentOrder.driverId === offer.driverId;
        if (!selectedOffer || (!isRetry && getOfferExpiry(selectedOffer, currentOrder) <= Date.now())) {
          throw new Error('Penawaran driver sudah kedaluwarsa. Minta penawaran baru.');
        }
        if (currentOrder.status !== 'pending' && !isRetry) {
          throw new Error('Pesanan sudah dipilih atau tidak tersedia.');
        }
        if (Number(selectedOffer.price) !== agreedPrice) {
          throw new Error('Tarif penawaran berubah. Pilih kembali penawaran terbaru.');
        }
        const routeDistanceKm = Number(currentOrder.routeDistanceKm ?? currentOrder.distance);
        const requiresManualQuote = !Number.isFinite(routeDistanceKm) || routeDistanceKm > 30;
        const fixedFare = getNiagaGoFare(routeDistanceKm);
        if (!requiresManualQuote && agreedPrice !== fixedFare) {
          throw new Error('Tarif tidak sesuai dengan jarak rute pesanan.');
        }

        transaction.update(orderRef, {
          status: 'accepting',
          selectedOfferId,
          driverId: offer.driverId,
          driverName: offer.driverName,
          driverPhoto: offer.driverPhoto || null,
          driverRating: Number(offer.rating) || null,
          driverRatingCount: Number(offer.ratingCount) || 0,
          driverCompletedTrips: Number(offer.completedTrips) || 0,
          price: agreedPrice,
          agreedPrice,
          fareAmount: agreedPrice,
          acceptingAt: Date.now(),
          paymentMethod
        });
      });
      claimed = true;

      try {
        const driverSnapshot = await get(ref(realDb, `users/${offer.driverId}`));
        selectedDriverPhone = driverSnapshot.val()?.phoneNumber || '';
      } catch (contactError) {
        console.error('Nomor kontak driver tidak dapat dimuat setelah dipilih:', contactError);
      }

      if (paymentMethod === 'saldo') {
        const paymentResult = await runTransaction(ref(realDb, `users/${userProfile.uid}`), (currentUser) => {
          if (!currentUser) return;
          const payments = currentUser.niagaGoPayments || {};
          const existingPayment = payments[order.id];
          if (existingPayment) {
            if (existingPayment.offerId !== selectedOfferId || Number(existingPayment.amount) !== agreedPrice) return;
            return {
              ...currentUser,
              niagaGoPayments: {
                ...payments,
                [order.id]: { ...existingPayment, lastConfirmedAt: Date.now() }
              }
            };
          }

          const balance = Number(currentUser.balance || 0);
          if (!Number.isFinite(balance) || balance < agreedPrice) return;
          return {
            ...currentUser,
            balance: balance - agreedPrice,
            niagaGoPayments: {
              ...payments,
              [order.id]: {
                offerId: selectedOfferId,
                amount: agreedPrice,
                paymentMethod: 'saldo',
                paidAt: Date.now()
              }
            }
          };
        });
        if (!paymentResult.committed) throw new Error('Saldo tidak cukup untuk harga penawaran. Pesanan dikembalikan ke pencarian.');
        balancePaymentRecorded = true;
      }

      const shouldStartMatching = paymentMethod === 'saldo' || paymentMethod === 'cash';
      await runFirestoreTransaction(dbFirestore, async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error('Pesanan tidak ditemukan saat menyelesaikan persetujuan.');
        const currentOrder = orderSnapshot.data();
        if (currentOrder.status !== 'accepting' || currentOrder.selectedOfferId !== selectedOfferId) {
          throw new Error('Persetujuan berubah sebelum dapat diselesaikan.');
        }
        transaction.update(orderRef, {
          status: shouldStartMatching ? 'verified' : 'accepted',
          isPaid: paymentMethod === 'saldo',
          paymentStatus: paymentMethod === 'saldo' || paymentMethod === 'cash' ? 'paid' : 'pending',
          acceptedAt: Date.now(),
          driverPhone: selectedDriverPhone,
          userPhone: userProfile.phoneNumber || ''
        });
      });

      let notificationsDelivered = true;
      try {
        const notifications = [push(ref(realDb, 'notifications'), {
          userId: offer.driverId,
          title: 'Penawaran Diterima',
          message: `Penumpang menyetujui harga Rp ${agreedPrice.toLocaleString('id-ID')}.`,
          type: 'success',
          createdAt: new Date().toISOString()
        })];
        if (paymentMethod === 'saldo') {
          notifications.push(push(ref(realDb, 'notifications'), {
            userId: userProfile.uid,
            title: 'Pembayaran Berhasil',
            message: `Saldo terpotong Rp ${agreedPrice.toLocaleString('id-ID')} untuk pembayaran NiagaGo.`,
            type: 'success',
            createdAt: new Date().toISOString()
          }));
        }
        await Promise.all(notifications);
      } catch (notificationError) {
        notificationsDelivered = false;
        console.error('Persetujuan tersimpan, tetapi notifikasi tidak terkirim:', notificationError);
      }

      await Swal.fire({
        title: shouldStartMatching ? 'Driver Dipilih!' : 'Penawaran Disetujui!',
        text: `${shouldStartMatching ? `${offer.driverName} menerima harga Rp ${agreedPrice.toLocaleString('id-ID')} dan dapat menuju lokasi.` : 'Silakan selesaikan pembayaran untuk melanjutkan.'}${notificationsDelivered ? '' : ' Pemberitahuan mungkin terlambat.'}`,
        icon: notificationsDelivered ? 'success' : 'warning',
        confirmButtonText: 'Oke'
      });
    } catch (error) {
      console.error('Gagal menerima penawaran NiagaGo:', error);
      if (claimed && !balancePaymentRecorded) {
        try {
          await runFirestoreTransaction(dbFirestore, async (transaction) => {
            const orderSnapshot = await transaction.get(orderRef);
            if (!orderSnapshot.exists()) return;
            const currentOrder = orderSnapshot.data();
            if (currentOrder.status === 'accepting' && currentOrder.selectedOfferId === selectedOfferId) {
              const routeDistanceKm = Number(currentOrder.routeDistanceKm ?? currentOrder.distance);
              const requiresManualQuote = !Number.isFinite(routeDistanceKm) || routeDistanceKm > 30;
              const fixedFare = getNiagaGoFare(routeDistanceKm);
              transaction.update(orderRef, {
                status: 'pending',
                selectedOfferId: null,
                driverId: null,
                driverName: null,
                driverPhoto: null,
                driverPhone: null,
                price: requiresManualQuote ? null : fixedFare,
                fareAmount: requiresManualQuote ? null : fixedFare,
                agreedPrice: null,
                paymentStatus: 'pending'
              });
            }
          });
        } catch (releaseError) {
          console.error('Gagal melepas kunci persetujuan pesanan:', releaseError);
        }
      }
      Swal.fire('Gagal', error.message || 'Gagal memilih driver.', 'error');
    }
  };

  const handleRejectOffer = async (order, offer) => {
    const offerId = offer.offerId || `${offer.driverId}_${getTimestampMillis(offer.createdAt)}`;
    try {
      await runFirestoreTransaction(dbFirestore, async (transaction) => {
        const orderRef = doc(dbFirestore, 'ojek_orders', order.id);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error('Pesanan tidak ditemukan.');
        const currentOrder = orderSnapshot.data();
        if (currentOrder.userId !== userProfile.uid || currentOrder.status !== 'pending') {
          throw new Error('Penawaran ini sudah tidak dapat ditolak.');
        }
        const remainingOffers = (Array.isArray(currentOrder.offers) ? currentOrder.offers : [])
          .filter((item) => (item.offerId || `${item.driverId}_${getTimestampMillis(item.createdAt)}`) !== offerId);
        transaction.update(orderRef, {
          offers: remainingOffers,
          rejectedOfferIds: arrayUnion(offerId)
        });
      });

      try {
        await push(ref(realDb, 'notifications'), {
          userId: offer.driverId,
          title: 'Penawaran Ditolak',
          message: 'Penumpang memilih untuk tidak melanjutkan penawaran ini.',
          type: 'info',
          createdAt: new Date().toISOString()
        });
      } catch (notificationError) {
        console.error('Penawaran ditolak, tetapi notifikasi driver gagal dikirim:', notificationError);
      }
      await Swal.fire('Penawaran Ditolak', 'Penawaran sudah ditutup.', 'success');
    } catch (error) {
      console.error('Gagal menolak penawaran NiagaGo:', error);
      Swal.fire('Gagal', error.message || 'Penawaran tidak dapat ditolak.', 'error');
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
        Swal.fire({
            title: 'Berhasil',
            text: 'Bukti pembayaran terkirim. Tunggu verifikasi Admin ya!',
            icon: 'success',
            confirmButtonText: 'Oke',
            buttonsStyling: false,
            customClass: {
                popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
                title: 'text-lg font-bold text-gray-800',
                htmlContainer: 'text-sm text-gray-600',
                confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
            }
        });
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
    try {
      if (!isDriverMode || !userProfile?.uid) {
        throw new Error('Hanya driver yang dapat memulai perjalanan.');
      }

      await runFirestoreTransaction(dbFirestore, async (transaction) => {
        const orderRef = doc(dbFirestore, 'ojek_orders', orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error('Pesanan tidak ditemukan.');

        const order = orderSnapshot.data();
        if (order.driverId !== userProfile.uid || order.status !== 'verified') {
          throw new Error('Pesanan ini tidak dapat dimulai oleh akun Anda.');
        }
        transaction.update(orderRef, { status: 'ongoing' });
      });
    } catch (error) {
      console.error('Gagal memulai perjalanan NiagaGo:', error);
      Swal.fire('Tidak Dapat Memulai', error.message || 'Gagal memperbarui status perjalanan.', 'error');
    }
  };

  const handleOpenNiagaGoChat = (order) => {
    const uid = userProfile?.uid || auth.currentUser?.uid;
    const isOrderParticipant = Boolean(
      uid && (isDriverMode ? order.driverId === uid : order.userId === uid)
    );
    if (!isOrderParticipant) {
      Swal.fire('Chat Tidak Tersedia', 'Chat hanya dapat dibuka oleh driver dan penumpang pada pesanan ini.', 'error');
      return;
    }

    const offer = (Array.isArray(order.offers) ? order.offers : [])
      .find((item) => item.driverId === order.driverId);
    const partner = isDriverMode
      ? {
          uid: order.userId,
          name: order.userName || 'Penumpang',
          photoURL: order.userPhotoURL || ''
        }
      : {
          uid: order.driverId,
          name: order.driverName || offer?.driverName || 'Driver NiagaGo',
          photoURL: order.driverPhoto || offer?.driverPhoto || ''
        };

    const isOrderActive = ['accepted', 'paid', 'verified', 'ongoing'].includes(order.status);

    // Langsung buka halaman/modal chat tanpa delay dan tanpa blocking error
    setActiveChat({
      orderId: order.id,
      partner,
      canSend: isOrderActive
    });

    // Inisialisasi metadata room di Realtime DB di background (non-blocking)
    try {
      const roomRef = ref(realDb, `niagago_chats/${order.id}`);
      update(roomRef, {
        [`members/${order.userId}`]: true,
        [`members/${order.driverId}`]: true,
        canSend: isOrderActive
      }).catch((e) => console.debug('Sync room non-blocking error:', e));
    } catch (err) {
      console.debug('Init room silent error:', err);
    }

    // Optional sync jika Cloud Functions aktif
    try {
      const openChat = httpsCallable(functions, 'openNiagaGoChat');
      openChat({ orderId: order.id }).catch(() => {});
    } catch (err) {
      // ignore
    }
  };

  const promptPassengerToRateDriver = async (order) => {
    if (!order?.driverId || !order?.id || !userProfile?.uid || order.userId !== userProfile.uid) return;

    const safeDriverName = String(order.driverName || 'driver').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const reviewRef = ref(realDb, `driver_reviews/${order.driverId}/${order.id}`);
    const existingReview = await get(reviewRef).catch(() => null);
    if (existingReview?.exists()) {
      await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), { passengerRatingSubmitted: true });
      return;
    }

    const { value: review } = await Swal.fire({
      title: 'Perjalanan selesai! 🎉',
      html: `
        <div style="text-align:center">
          <p style="font-size:14px;color:#64748b;margin:0 0 8px">Terima kasih sudah naik NiagaGo.</p>
          <p style="font-size:14px;color:#334155;margin:0 0 14px">Bagaimana perjalananmu bersama <b>${safeDriverName}?</b></p>
          <div id="passenger-driver-stars" style="display:flex;justify-content:center;gap:9px;font-size:38px;cursor:pointer;color:#f59e0b">
            ${[1,2,3,4,5].map((star) => `<span data-value="${star}" style="opacity:.28;transition:opacity .15s">★</span>`).join('')}
          </div>
          <p style="font-size:11px;color:#94a3b8;margin:4px 0 0">Pilih bintang, lalu ceritakan pengalamanmu</p>
          <input id="passenger-driver-rating" type="hidden" value="0" />
          <textarea id="passenger-driver-comment" placeholder="Tulis komentar untuk driver (opsional)" rows="3" style="box-sizing:border-box;margin-top:14px;width:100%;padding:11px 12px;border:1px solid #e2e8f0;border-radius:12px;font-size:13px;resize:vertical"></textarea>
        </div>
      `,
      confirmButtonText: 'Kirim Rating ⭐',
      showCancelButton: true,
      cancelButtonText: 'Nanti saja',
      buttonsStyling: false,
      customClass: {
        popup: 'rounded-3xl w-auto max-w-sm p-6 bg-white',
        title: 'text-xl font-black text-gray-900',
        htmlContainer: 'text-sm text-gray-600',
        confirmButton: 'px-6 py-3 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-lg transition-all !opacity-100',
        cancelButton: 'px-5 py-3 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all ml-2 !opacity-100'
      },
      didOpen: () => {
        const stars = document.querySelectorAll('#passenger-driver-stars span');
        const ratingInput = document.getElementById('passenger-driver-rating');
        stars.forEach((star) => star.addEventListener('click', () => {
          const selected = Number(star.dataset.value);
          ratingInput.value = selected;
          stars.forEach((item) => { item.style.opacity = Number(item.dataset.value) <= selected ? '1' : '.28'; });
        }));
      },
      preConfirm: () => {
        const rating = Number(document.getElementById('passenger-driver-rating')?.value);
        if (!rating) { Swal.showValidationMessage('Pilih jumlah bintang dulu ya!'); return false; }
        return { rating, comment: document.getElementById('passenger-driver-comment')?.value.trim() || '' };
      }
    });

    if (!review) return;
    try {
      await update(reviewRef, {
        orderId: order.id,
        rating: review.rating,
        comment: review.comment,
        passengerName: userProfile.displayName || 'Penumpang',
        passengerUid: userProfile.uid,
        createdAt: Date.now()
      });
      await updateDoc(doc(dbFirestore, 'ojek_orders', order.id), {
        passengerRatingSubmitted: true,
        passengerRatingSubmittedAt: Date.now()
      });
      await Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: 'Terima kasih! Ratingmu membantu driver berkembang 💙',
        showConfirmButton: false,
        timer: 2600
      });
    } catch (error) {
      console.error('Gagal menyimpan rating perjalanan:', error);
      Swal.fire('Rating belum terkirim', error.message || 'Coba kirim rating sekali lagi.', 'error');
    }
  };

  useEffect(() => {
    if (isDriverMode || !userProfile?.uid || passengerRatingPromptInFlightRef.current) return;
    const completedOrder = orders
      .filter((order) => order.status === 'completed' && order.userId === userProfile.uid && order.driverId && !order.passengerRatingSubmitted && !passengerRatingPromptedRef.current.has(order.id))
      .sort((a, b) => getTimestampMillis(b.completedAt) - getTimestampMillis(a.completedAt))[0];
    if (!completedOrder) return;

    passengerRatingPromptedRef.current.add(completedOrder.id);
    passengerRatingPromptInFlightRef.current = true;
    promptPassengerToRateDriver(completedOrder).finally(() => {
      passengerRatingPromptInFlightRef.current = false;
    });
  }, [isDriverMode, orders, userProfile?.uid]);

  // 5. User Konfirmasi Selesai (Dana Cair ke Driver jika digital)
  const handleFinishTrip = async (order) => {
    const currentUid = userProfile?.uid || auth.currentUser?.uid;
    const isDriver = order.driverId === currentUid;
    if (!isDriver) {
      await Swal.fire('Menunggu Driver', 'Perjalanan akan otomatis selesai saat driver tiba di tujuan.', 'info');
      return;
    }

    const driverLocation = driversLocations[currentUid];
    const currentCoordinates = normalizeGpsCoordinates(driverLocation);
    const destinationCoordinates = normalizeGpsCoordinates(order.destCoords);
    const locationIsFresh = driverLocation?.updatedAt && Date.now() - Number(driverLocation.updatedAt) <= DRIVER_LOCATION_MAX_AGE_MS;
    if (!currentCoordinates || !destinationCoordinates || !locationIsFresh) {
      await Swal.fire('Lokasi Driver Belum Siap', 'Pastikan GPS aktif dan tunggu lokasi terbaru sebelum menyelesaikan perjalanan.', 'warning');
      return;
    }
    const distanceToDestination = L.latLng(currentCoordinates.lat, currentCoordinates.lng)
      .distanceTo(L.latLng(destinationCoordinates.lat, destinationCoordinates.lng));
    if (distanceToDestination > TRIP_COMPLETION_RADIUS_METERS) {
      await Swal.fire({
        title: 'Sedikit lagi sampai! 📍',
        text: 'Tombol selesai aktif saat kamu berada maksimal ' + TRIP_COMPLETION_RADIUS_METERS + ' meter dari tujuan. Jarak saat ini ' + Math.round(distanceToDestination) + ' meter.',
        icon: 'info',
        confirmButtonText: 'Lanjutkan Perjalanan'
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Sudah sampai?',
      text: order.paymentMethod === 'saldo'
        ? 'Dana akan otomatis masuk ke dompet driver.'
        : 'Pastikan kamu sudah membayar tunai ke driver.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Selesai',
      cancelButtonText: 'Belum',
      buttonsStyling: false,
      customClass: {
        popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
        title: 'text-lg font-bold text-gray-800',
        htmlContainer: 'text-sm text-gray-600',
        confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 transition-all !opacity-100',
        cancelButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all mr-3 !opacity-100'
      }
    });

    if (!result.isConfirmed) return;

    try {
      const appFee = calculateAdminFee(order.price);
      const netIncome = Math.max(0, order.price - appFee);
      const isDigital = order.paymentMethod === 'saldo';
      const nowMs = Date.now();

      // 1. Update status order di Firestore (atomic)
      await runFirestoreTransaction(dbFirestore, async (transaction) => {
        const orderRef = doc(dbFirestore, 'ojek_orders', order.id);
        const snap = await transaction.get(orderRef);
        if (!snap.exists()) throw new Error('Pesanan tidak ditemukan.');
        const data = snap.data();
        if (data.status === 'completed') return; // sudah selesai, skip
        if (data.status !== 'ongoing') throw new Error('Status pesanan tidak memungkinkan diselesaikan saat ini.');
        const isOrderDriver = data.driverId === currentUid;
        if (!isOrderDriver) throw new Error('Hanya driver yang ditugaskan yang dapat menyelesaikan perjalanan.');
        transaction.update(orderRef, {
          status: 'completed',
          completedAt: serverTimestamp(),
          netIncome,
          appFee,
          driverCredited: isDigital ? isOrderDriver : true
        });
      });

      // 2. Jika digital dan yang menyelesaikan adalah DRIVER: transfer saldo ke dompet driver
      // Catatan: Penumpang tidak boleh menulis ke users/${driverId} karena Realtime Database
      // membatasi auth.uid == $uid (akan menimbulkan PERMISSION_DENIED).
      // Bila penumpang yang menyelesaikan, listener driver akan mengkreditkannya secara otomatis.
      if (isDigital && order.driverId && isDriver) {
        try {
          const driverRef = ref(realDb, `users/${order.driverId}`);
          await runTransaction(driverRef, (current) => {
            if (!current) return current;
            const payouts = current.niagaGoPayouts || {};
            if (payouts[order.id]) return current; // sudah dikreditkan
            return {
              ...current,
              balance: (parseInt(current.balance) || 0) + netIncome,
              niagaGoPayouts: { ...payouts, [order.id]: { amount: netIncome, paidAt: nowMs } }
            };
          });
        } catch (credErr) {
          console.warn('Driver saldo direct credit warning (non-blocking):', credErr);
        }
      }

      // 3. Simpan riwayat pendapatan driver (non-blocking agar tidak menggagalkan order)
      if (order.driverId) {
        try {
          const earningsRef = ref(realDb, `driver_earnings/${order.driverId}/${order.id}`);
          await update(earningsRef, {
            orderId: order.id,
            date: new Date(nowMs).toISOString().split('T')[0],
            completedAt: nowMs,
            price: order.price,
            netIncome,
            appFee,
            paymentMethod: order.paymentMethod || 'cash',
            pickup: order.pickup || '',
            destination: order.destination || '',
            distance: order.distance || 0,
            duration: order.duration || 0,
            pickupTime: order.pickupStartedAt || null,
            driverCredited: isDigital ? isDriver : true
          });
        } catch (earningsErr) {
          console.warn('Driver earnings save warning (non-blocking):', earningsErr);
        }
      }

      // 4. Minta rating dari penumpang (jika yang menyelesaikan adalah penumpang)
      if (!isDriver) {
        const { value: rating } = await Swal.fire({
          title: '⭐ Beri Rating Driver',
          html: `
            <p class="text-sm text-gray-600 mb-4">Bagaimana pengalaman perjalananmu bersama driver?</p>
            <div id="star-rating" style="display:flex;justify-content:center;gap:12px;font-size:36px;cursor:pointer;">
              ${[1,2,3,4,5].map(s => `<span data-val="${s}" style="opacity:0.3;transition:all 0.15s;">★</span>`).join('')}
            </div>
            <input id="rating-val" type="hidden" value="0"/>
            <textarea id="rating-comment" placeholder="Tulis komentar untuk driver (opsional)..." style="margin-top:12px;width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;resize:none;" rows="2"></textarea>
          `,
          confirmButtonText: 'Kirim Rating',
          showCancelButton: true,
          cancelButtonText: 'Lewati',
          buttonsStyling: false,
          customClass: {
            popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
            title: 'text-lg font-bold text-gray-800',
            confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition-all !opacity-100',
            cancelButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all mr-3 !opacity-100'
          },
          didOpen: () => {
            const stars = document.querySelectorAll('#star-rating span');
            const input = document.getElementById('rating-val');
            stars.forEach((star) => {
              star.addEventListener('click', () => {
                const val = parseInt(star.dataset.val);
                input.value = val;
                stars.forEach((s, i) => { s.style.opacity = i < val ? '1' : '0.3'; });
              });
            });
          },
          preConfirm: () => {
            const val = parseInt(document.getElementById('rating-val').value);
            if (!val) { Swal.showValidationMessage('Pilih bintang dulu ya!'); return false; }
            const comment = document.getElementById('rating-comment').value.trim();
            return { rating: val, comment };
          }
        });

        // 5. Simpan rating ke Realtime DB (driver_reviews)
        if (rating && order.driverId) {
          try {
            const reviewRef = ref(realDb, `driver_reviews/${order.driverId}/${order.id}`);
            await update(reviewRef, {
              orderId: order.id,
              rating: rating.rating,
              comment: rating.comment || '',
              passengerName: userProfile?.displayName || 'Penumpang',
              passengerUid: userProfile?.uid || '',
              createdAt: nowMs
            });

          } catch (reviewErr) {
            console.warn('Driver review save warning (non-blocking):', reviewErr);
          }
        }
      } else {
        // Driver menilai penumpang (Sistem Penilaian Dua Arah)
        const targetPassengerId = order.userId;
        if (targetPassengerId) {
          const { value: passengerRating } = await Swal.fire({
            title: '⭐ Beri Rating Penumpang',
            html: `
              <p class="text-sm text-gray-600 mb-4">Bagaimana sikap dan pengalaman dengan penumpang ini?</p>
              <div id="passenger-star-rating" style="display:flex;justify-content:center;gap:12px;font-size:36px;cursor:pointer;">
                ${[1,2,3,4,5].map(s => `<span data-val="${s}" style="opacity:0.3;transition:all 0.15s;">★</span>`).join('')}
              </div>
              <input id="passenger-rating-val" type="hidden" value="0"/>
              <textarea id="passenger-rating-comment" placeholder="Tulis komentar untuk penumpang (opsional)..." style="margin-top:12px;width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;resize:none;" rows="2"></textarea>
            `,
            confirmButtonText: 'Kirim Rating',
            showCancelButton: true,
            cancelButtonText: 'Lewati',
            buttonsStyling: false,
            customClass: {
              popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
              title: 'text-lg font-bold text-gray-800',
              confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition-all !opacity-100',
              cancelButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all mr-3 !opacity-100'
            },
            didOpen: () => {
              const stars = document.querySelectorAll('#passenger-star-rating span');
              const input = document.getElementById('passenger-rating-val');
              stars.forEach((star) => {
                star.addEventListener('click', () => {
                  const val = parseInt(star.dataset.val);
                  input.value = val;
                  stars.forEach((s, i) => { s.style.opacity = i < val ? '1' : '0.3'; });
                });
              });
            },
            preConfirm: () => {
              const val = parseInt(document.getElementById('passenger-rating-val').value);
              if (!val) { Swal.showValidationMessage('Pilih bintang dulu ya!'); return false; }
              const comment = document.getElementById('passenger-rating-comment').value.trim();
              return { rating: val, comment };
            }
          });

          if (passengerRating) {
            try {
              const pReviewRef = ref(realDb, `passenger_reviews/${targetPassengerId}/${order.id}`);
              await update(pReviewRef, {
                orderId: order.id,
                rating: passengerRating.rating,
                comment: passengerRating.comment || '',
                driverName: userProfile?.displayName || 'Driver NiagaGo',
                driverUid: userProfile?.uid || '',
                createdAt: nowMs
              });

            } catch (pReviewErr) {
              console.warn('Passenger review save warning (non-blocking):', pReviewErr);
            }
          }
        }
      }

      Swal.fire({
        title: 'Terima kasih!',
        text: 'Perjalanan selesai. Semoga harimu menyenangkan!',
        icon: 'success',
        confirmButtonText: 'Oke',
        buttonsStyling: false,
        customClass: {
          popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
          title: 'text-lg font-bold text-gray-800',
          htmlContainer: 'text-sm text-gray-600',
          confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
        }
      });
    } catch (error) {
      console.error('handleFinishTrip error:', error);
      Swal.fire('Error', error.message || 'Gagal menyelesaikan order. Coba lagi.', 'error');
    }
  };

  // 6. Driver Tarik Saldo
  const handleWithdraw = async (e) => {
    e.preventDefault();
    if ((userProfile.balance || 0) < parseInt(withdrawData.amount)) {
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
        balance: (userProfile.balance || 0) - parseInt(withdrawData.amount)
      });

      Swal.fire({
        title: 'Permintaan Terkirim',
        text: 'Admin akan memproses penarikanmu.',
        icon: 'success',
        confirmButtonText: 'Oke',
        buttonsStyling: false,
        customClass: {
            popup: 'rounded-2xl w-auto max-w-sm p-6 bg-white',
            title: 'text-lg font-bold text-gray-800',
            htmlContainer: 'text-sm text-gray-600',
            confirmButton: 'px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/30 transition-all !opacity-100'
        }
      });
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
    if (!dbFirestore) {
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

    // --- VALIDASI NOMOR HP (REGEX & UNIQUENESS) ---
    const phoneRegex = /^(08|\+628)[0-9]{8,11}$/;
    if (!phoneRegex.test(regForm.phone)) {
      Swal.fire('Format Salah', 'Format nomor HP tidak valid! (Gunakan 08/628, 10-13 digit)', 'error');
      return;
    }

    // Cek Keunikan Nomor di Database
    const usersRef = ref(realDb, 'users');
    const phoneQuery = realQuery(usersRef, orderByChild('phoneNumber'), equalTo(regForm.phone));
    const phoneSnap = await get(phoneQuery);
    
    if (phoneSnap.exists()) {
      const existingUids = Object.keys(phoneSnap.val());
      if (existingUids.some(uid => uid !== userProfile.uid)) {
        Swal.fire('Gagal Daftar', 'Nomor telepon sudah terdaftar pada akun lain!', 'error');
        return;
      }
    }

    // Validasi Layanan
    if (!regForm.services.niagaGo && !regForm.services.niagaFood) {
      Swal.fire('Pilih Layanan', 'Mohon pilih minimal satu layanan yang ingin diambil (Niaga Go / Niaga Food).', 'warning');
      return;
    }

    // Validasi Kendaraan untuk NiagaGo
    if (regForm.services.niagaGo) {
        if (!regForm.vehicles.motor.active && !regForm.vehicles.mobil.active) {
            Swal.fire('Pilih Kendaraan', 'Untuk layanan Niaga Go, wajib pilih minimal satu kendaraan (Motor/Mobil).', 'warning');
            return;
        }
        if ((regForm.vehicles.motor.active && !regForm.vehicles.motor.plate) || (regForm.vehicles.mobil.active && !regForm.vehicles.mobil.plate)) {
            Swal.fire('Plat Nomor Wajib', 'Mohon isi plat nomor kendaraan yang dipilih.', 'warning');
            return;
        }
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
        plateNumber: regForm.vehicles.motor.active ? regForm.vehicles.motor.plate : regForm.vehicles.mobil.plate, // Legacy fallback
        vehicles: {
          motor: regForm.vehicles.motor.active ? { active: true, plate: regForm.vehicles.motor.plate } : { active: false },
          mobil: regForm.vehicles.mobil.active ? { active: true, plate: regForm.vehicles.mobil.plate } : { active: false }
        },
        services: regForm.services, // Simpan layanan yang dipilih
        ktmUrl: ktmUrl,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      Swal.fire({
        title: 'Pendaftaran Berhasil!',
        text: 'Data kamu sudah masuk. Tunggu verifikasi Admin ya (1x24 Jam).',
        icon: 'success',
        confirmButtonText: 'OK',
        buttonsStyling: false,
        customClass: {
            popup: `rounded-2xl w-auto max-w-sm p-6 bg-white`,
            title: `text-lg font-bold text-gray-900`,
            htmlContainer: `text-sm text-gray-600`,
            confirmButton: 'px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/30 transition-all !opacity-100'
        }
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

  // Helper: Alur Kontak Darurat WhatsApp Bertahap
  // Mengarahkan ke chat in-app terlebih dahulu, lalu verifikasi konfirmasi sebelum membuka WA
  const handleEmergencyContact = async (order, targetRole) => {
    const isTargetDriver = targetRole === 'driver';
    const targetName = isTargetDriver
      ? (order.driverName || 'Driver')
      : (order.type === 'food' ? (order.buyerName || order.userName || 'Pembeli') : (order.userName || 'Penumpang'));
    const targetPhone = isTargetDriver ? order.driverPhone : order.userPhone;

    // Langkah 1: Arahkan ke obrolan dalam aplikasi terlebih dahulu
    const step1 = await Swal.fire({
      title: '🛡️ Hubungi Lawan Bicara',
      html: `
        <div class="text-left text-sm space-y-2">
          <p>Demi privasi dan keamanan bersama, gunakan <b>Chat Dalam Aplikasi</b> terlebih dahulu untuk komunikasi perjalanan.</p>
          <p class="text-xs text-gray-500">Nomor WhatsApp hanya disediakan untuk keadaan mendesak atau darurat.</p>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: '💬 Buka Chat Aplikasi',
      cancelButtonText: '⚠️ Kontak Darurat WhatsApp',
      buttonsStyling: false,
      customClass: {
        popup: 'rounded-2xl max-w-md p-6 bg-white dark:bg-slate-800 dark:text-white',
        title: 'text-lg font-bold text-gray-800 dark:text-white',
        confirmButton: 'px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all mr-2',
        cancelButton: 'px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 transition-all'
      }
    });

    if (step1.isConfirmed) {
      handleOpenNiagaGoChat(order);
      return;
    }

    // Jika memilih opsi kontak darurat WhatsApp, lakukan Langkah 2: Verifikasi
    if (step1.dismiss === Swal.DismissReason.cancel) {
      if (!targetPhone) {
        Swal.fire('Nomor Tidak Tersedia', 'Nomor kontak darurat belum terdaftar pada pesanan ini.', 'warning');
        return;
      }

      const step2 = await Swal.fire({
        title: '⚠️ Verifikasi Kontak Darurat',
        text: `Apakah Anda benar-benar memerlukan kontak darurat langsung dengan ${targetName}? Tindakan ini akan membuka aplikasi WhatsApp.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Tampilkan & Hubungi WA',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#22c55e',
        cancelButtonColor: '#64748b'
      });

      if (step2.isConfirmed) {
        const text = isDriverMode
          ? `Halo ${targetName}, saya Driver NiagaGo untuk pesanan #${(order.id || '').slice(-6)}. Saya menghubungi Anda untuk keperluan mendesak perjalanan.`
          : `Halo ${targetName}, saya Penumpang NiagaGo untuk pesanan #${(order.id || '').slice(-6)}. Saya menghubungi Anda untuk keperluan mendesak perjalanan.`;
        const cleanedPhone = targetPhone.replace(/[^0-9]/g, '');
        const formattedPhone = cleanedPhone.startsWith('0') ? `62${cleanedPhone.slice(1)}` : cleanedPhone;
        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
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

  // Hide completed history only from the current participant's history.
  const handleDeleteSingleHistory = async (order) => {
    const isFinished = ['completed', 'cancelled', 'payment_rejected', 'expired'].includes(order.status);
    if (!isFinished) {
      Swal.fire('Belum Selesai', 'Pesanan aktif tidak dapat dihapus dari riwayat.', 'info');
      return;
    }

    const result = await Swal.fire({
      title: 'Hapus dari Riwayat?',
      text: 'Riwayat ini disembunyikan hanya untuk akun dan mode yang sedang digunakan. Riwayat pihak lain dan catatan admin tetap aman.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Hapus dari Riwayat',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
      try {
        if (order.type === 'food') {
          const foodOrderRef = ref(realDb, `orders/${order.id}`);
          const foodOrderSnapshot = await get(foodOrderRef);
          const foodOrder = foodOrderSnapshot.val();
          const ownerId = isDriverMode ? foodOrder?.driverId : (foodOrder?.buyerId || foodOrder?.userId);
          if (!foodOrder || ownerId !== userProfile.uid || !['completed', 'cancelled', 'payment_rejected', 'expired'].includes(foodOrder.status)) {
            throw new Error('Pesanan tidak ditemukan, bukan milik akun ini, atau belum selesai.');
          }
          await update(foodOrderRef, { [isDriverMode ? 'hiddenForDriver' : 'hiddenForUser']: true });
        } else {
            const orderRef = doc(dbFirestore, 'ojek_orders', order.id);
            const orderSnapshot = await getDoc(orderRef);
            const ownedOrder = orderSnapshot.data();
            if (!ownedOrder ||
              ownedOrder[isDriverMode ? 'driverId' : 'userId'] !== userProfile.uid ||
              !['completed', 'cancelled', 'payment_rejected', 'expired'].includes(ownedOrder.status)) {
              throw new Error('Pesanan tidak ditemukan, bukan milik akun ini, atau belum selesai.');
            }
            await updateDoc(orderRef, { [isDriverMode ? 'hiddenForDriver' : 'hiddenForUser']: true });
        }
        Swal.fire('Terhapus', 'Riwayat disembunyikan dari mode ini saja.', 'success');
      } catch (error) {
        console.error('Error deleting history:', error);
        Swal.fire('Gagal Menghapus', error.message || 'Database menolak penghapusan riwayat.', 'error');
      }
    }
  };

  // Hide all completed history for the current participant without deleting shared order records.
  const handleClearHistory = async () => {
    if (!userProfile?.uid || !dbFirestore) {
      Swal.fire('Tidak Dapat Menghapus', 'Akun atau koneksi database tidak tersedia.', 'error');
      return;
    }

    try {
      const ownerField = isDriverMode ? 'driverId' : 'userId';
      const snapshot = await getDocs(query(
        collection(dbFirestore, 'ojek_orders'),
        where(ownerField, '==', userProfile.uid)
      ));
      const finishedOrders = snapshot.docs.filter((orderDoc) =>
        ['completed', 'cancelled', 'payment_rejected', 'expired'].includes(orderDoc.data().status) &&
        !orderDoc.data()[isDriverMode ? 'hiddenForDriver' : 'hiddenForUser']
      );
      const finishedFoodOrders = combinedOrders.filter((order) =>
        order.type === 'food' &&
        ['completed', 'cancelled', 'payment_rejected', 'expired'].includes(order.status) &&
        !order[isDriverMode ? 'hiddenForDriver' : 'hiddenForUser'] &&
        (isDriverMode ? order.driverId === userProfile.uid : (order.buyerId || order.userId) === userProfile.uid)
      );
      const totalFinishedOrders = finishedOrders.length + finishedFoodOrders.length;
      if (totalFinishedOrders === 0) {
        Swal.fire('Tidak Ada Riwayat', 'Tidak ada riwayat NiagaGo selesai yang bisa dihapus.', 'info');
        return;
      }

      const result = await Swal.fire({
        title: `Hapus Riwayat ${isDriverMode ? 'Driver' : 'Penumpang'}?`,
        text: `${totalFinishedOrders} riwayat selesai/batal akan disembunyikan hanya dari mode ${isDriverMode ? 'driver' : 'penumpang'} akun ini. Pihak lain dan admin tetap dapat melihat catatannya.`,
        icon: 'warning',
        input: 'checkbox',
        inputValue: 0,
        inputPlaceholder: 'Saya paham riwayat hanya dihapus dari tampilan saya',
        inputValidator: (value) => value ? undefined : 'Centang konfirmasi untuk melanjutkan.',
        showCancelButton: true,
        confirmButtonText: 'Hapus dari Riwayat',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626'
      });

      if (!result.isConfirmed) return;

      for (let offset = 0; offset < finishedOrders.length; offset += 450) {
        const batch = writeBatch(dbFirestore);
        finishedOrders.slice(offset, offset + 450).forEach((orderDoc) => {
          batch.update(orderDoc.ref, { [isDriverMode ? 'hiddenForDriver' : 'hiddenForUser']: true });
        });
        await batch.commit();
      }

      if (finishedFoodOrders.length > 0) {
        const updates = {};
        finishedFoodOrders.forEach((order) => {
          updates[`orders/${order.id}/${isDriverMode ? 'hiddenForDriver' : 'hiddenForUser'}`] = true;
        });
        await update(ref(realDb), updates);
      }

      await Swal.fire('Riwayat Dibersihkan', `${totalFinishedOrders} riwayat selesai/batal disembunyikan dari mode ${isDriverMode ? 'driver' : 'penumpang'} ini.`, 'success');
    } catch (error) {
      console.error('Error clearing NiagaGo history:', error);
      Swal.fire('Gagal Menghapus', error.message || 'Periksa izin Firestore dan coba lagi.', 'error');
    }
  };

  // --- HITUNGAN PERFORMA DRIVER ---
  const earningsList = useMemo(() => {
    return Object.values(driverEarnings || {}).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }, [driverEarnings]);

  const reviewsList = useMemo(() => {
    return Object.values(driverReviews || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [driverReviews]);

  const passengerReviewsList = useMemo(() => {
    return Object.values(passengerReviews || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [passengerReviews]);

  const passengerAverageRating = useMemo(() => {
    const summary = summarizeReviews(passengerReviews);
    return summary.average == null ? null : summary.average.toFixed(2);
  }, [passengerReviews]);

  // Rata-rata rating driver dari ulasan yang benar-benar tersimpan
  const averageRating = useMemo(() => {
    if (!reviewsList.length) return null;
    const sum = reviewsList.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    return (sum / reviewsList.length).toFixed(2);
  }, [reviewsList]);

  // Filter pendapatan berdasarkan tab: 'hari' | 'minggu' | 'bulan'
  const filteredEarnings = useMemo(() => {
    const now = new Date();
    return earningsList.filter((item) => {
      const itemDate = new Date(item.completedAt || item.date || 0);
      if (performaTab === 'hari') {
        return itemDate.toDateString() === now.toDateString();
      } else if (performaTab === 'minggu') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return itemDate >= oneWeekAgo;
      } else if (performaTab === 'bulan') {
        return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [earningsList, performaTab]);

  // Ringkasan pendapatan terfilter
  const performanceSummary = useMemo(() => {
    const totalOrders = filteredEarnings.length;
    // Total uang yang dirangkum (digital + cash)
    const totalGross = filteredEarnings.reduce((acc, item) => acc + (Number(item.price) || 0), 0);
    // Total pendapatan bersih setelah potongan admin
    const totalNet = filteredEarnings.reduce((acc, item) => acc + (Number(item.netIncome) || 0), 0);
    // Total jarak yang ditempuh (km)
    const totalDistance = filteredEarnings.reduce((acc, item) => acc + (Number(item.distance) || 0), 0);

    return { totalOrders, totalGross, totalNet, totalDistance: totalDistance.toFixed(1) };
  }, [filteredEarnings]);

  // --- RENDER PERFORMA PENUMPANG (RATING & KOMENTAR SAJA) ---
  if (viewMode === 'performa' && !isDriverMode) {
    return (
      <div className={`min-h-screen p-4 pb-24 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setViewMode('main')} className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-gray-100'} shadow-sm`}>
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><Award className="text-yellow-500" size={24} /> Performa Penumpang</h1>
              <p className="text-xs text-gray-500">Rating dan komentar dari driver</p>
            </div>
          </div>

          <div className={`p-5 rounded-2xl border shadow-sm text-center ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            <Star size={28} className="mx-auto text-yellow-500 mb-2" fill="currentColor" />
            <p className="text-4xl font-black text-yellow-500">{passengerAverageRating || '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{passengerReviewsList.length} ulasan dari driver</p>
          </div>

          <div className="space-y-3">
            <h2 className="font-bold text-sm text-gray-700 dark:text-gray-300">Komentar Driver</h2>
            {passengerReviewsList.length === 0 ? (
              <div className={`p-8 text-center rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} text-gray-400`}>
                <p className="text-xs">Belum ada rating atau komentar dari driver.</p>
              </div>
            ) : passengerReviewsList.map((review) => (
              <div key={review.orderId} className={`p-4 rounded-2xl border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-sm">{review.driverName || 'Driver NiagaGo'}</span>
                  <span className="flex items-center gap-1 text-yellow-500 text-xs font-bold"><Star size={13} fill="currentColor" /> {Number(review.rating) || 0}/5</span>
                </div>
                {review.comment && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">“{review.comment}”</p>}
                <p className="mt-2 text-[10px] text-gray-400">{new Date(review.createdAt || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER PERFORMA DRIVER PAGE (FULL PAGE) ---
  if (viewMode === 'performa' && isDriverMode) {
    return (
      <div className={`min-h-screen p-4 pb-24 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
        <div className="max-w-md mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => { setViewMode('main'); setShowReviews(false); setSelectedTripDetail(null); }}
              className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-gray-100'} shadow-sm`}
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Award className="text-yellow-500" size={24} /> Performa Driver
              </h1>
              <p className="text-xs text-gray-500">Pantau performa & ringkasan pendapatanmu</p>
            </div>
          </div>

          {/* 1. KARTU PERINGKAT / RATING */}
          <div
            onClick={() => setShowReviews(!showReviews)}
            className={`p-4 rounded-2xl border shadow-sm cursor-pointer transition-all ${
              isDarkMode ? 'bg-slate-800 border-slate-700 hover:border-yellow-500/50' : 'bg-white border-gray-100 hover:border-yellow-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-500/10 text-yellow-500 rounded-xl">
                  <Star size={26} fill="currentColor" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-yellow-500">{averageRating || '—'}</span>
                    <span className="text-xs font-bold text-gray-400">/ 5.00</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Berdasarkan {reviewsList.length} ulasan
                  </p>
                </div>
              </div>
              <ChevronRight
                size={20}
                className={`text-gray-400 transition-transform ${showReviews ? 'rotate-90 text-yellow-500' : ''}`}
              />
            </div>

            {/* List Ulasan Penumpang (Saat Kartu Peringkat Diklik) */}
            {showReviews && (
              <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-slate-700 space-y-3 animate-in fade-in">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Ulasan dari Penumpang</h4>
                {reviewsList.length === 0 ? (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 text-center text-xs text-gray-500">
                    Belum ada ulasan tertulis. Terus berikan pelayanan terbaik untuk mendapatkan bintang 5!
                  </div>
                ) : (
                  reviewsList.map((rev, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{rev.passengerName || 'Penumpang'}</span>
                        <div className="flex items-center text-yellow-500 text-xs gap-0.5">
                          {[...Array(Number(rev.rating) || 5)].map((_, i) => (
                            <Star key={i} size={11} fill="currentColor" />
                          ))}
                        </div>
                      </div>
                      {rev.comment && <p className="text-xs text-gray-600 dark:text-gray-300 italic">"{rev.comment}"</p>}
                      <p className="text-[10px] text-gray-400">
                        {new Date(rev.createdAt || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. KARTU PENDAPATAN & FILTER (HARI / MINGGU / BULAN) */}
          <div className={`p-4 rounded-2xl border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            {/* Filter Tab: Hari / Minggu / Bulan */}
            <div className="flex p-1 bg-gray-100 dark:bg-slate-700/60 rounded-xl mb-4">
              {[
                { id: 'hari', label: 'Hari Ini' },
                { id: 'minggu', label: 'Minggu Ini' },
                { id: 'bulan', label: 'Bulan Ini' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPerformaTab(tab.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    performaTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-sky-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Total Pendapatan Merangkum Digital + Cash */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Pendapatan {performaTab === 'hari' ? 'Hari Ini' : performaTab === 'minggu' ? 'Minggu Ini' : 'Bulan Ini'} (Digital + Cash)
                </p>
                <h2 className="text-2xl font-black text-sky-600 mt-0.5">
                  Rp {performanceSummary.totalGross.toLocaleString('id-ID')}
                </h2>
              </div>
              <button
                onClick={() => setShowEarningsDetail(!showEarningsDetail)}
                className={`p-2 rounded-xl transition-all ${
                  showEarningsDetail ? 'bg-sky-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                }`}
                title="Lihat Detail Pendapatan Bersih"
              >
                <ChevronDown size={20} className={`transition-transform ${showEarningsDetail ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Detail Pendapatan Bersih (Muncul saat tombol panah diklik) */}
            {showEarningsDetail && (
              <div className="pt-3 border-t border-dashed border-gray-200 dark:border-slate-700 space-y-3 animate-in fade-in">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-slate-700/50">
                    <p className="text-[10px] text-gray-500">Pendapatan Bersih</p>
                    <p className="text-xs font-bold text-green-600">
                      Rp {performanceSummary.totalNet.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-slate-700/50">
                    <p className="text-[10px] text-gray-500">Jumlah Order</p>
                    <p className="text-sm font-black text-purple-600">
                      {performanceSummary.totalOrders}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-slate-700/50">
                    <p className="text-[10px] text-gray-500">Jarak Tempuh</p>
                    <p className="text-sm font-black text-blue-600">
                      {performanceSummary.totalDistance} <span className="text-[10px] font-normal">km</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. RIWAYAT PERMINTAAN */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Clock size={16} className="text-sky-500" /> Riwayat Permintaan
            </h3>

            {filteredEarnings.length === 0 ? (
              <div className={`p-8 text-center rounded-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} text-gray-400`}>
                <Bike size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">Belum ada riwayat pesanan selesai pada periode ini.</p>
              </div>
            ) : (
              filteredEarnings.map((item, index) => {
                const itemTime = item.completedAt
                  ? new Date(item.completedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                  : '--:--';
                // Ambil nama jalan singkat jika terlalu panjang
                const shortPickup = (item.pickup || 'Jemput').split(',')[0];
                const shortDest = (item.destination || 'Tujuan').split(',')[0];

                return (
                  <div
                    key={item.orderId || index}
                    onClick={() => setSelectedTripDetail(selectedTripDetail?.orderId === item.orderId ? null : item)}
                    className={`p-3.5 rounded-xl border shadow-sm cursor-pointer transition-all ${
                      isDarkMode ? 'bg-slate-800 border-slate-700 hover:border-sky-500/50' : 'bg-white border-gray-100 hover:border-sky-400'
                    }`}
                  >
                    {/* Ringkasan Item: Nama jalan jemput & antar, jam, harga */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1 pr-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold line-clamp-1">
                          <span className="text-gray-800 dark:text-gray-100">{shortPickup}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-sky-600">{shortDest}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                          <span>{itemTime}</span>
                          <span>•</span>
                          <span className={`font-semibold ${item.paymentMethod === 'saldo' ? 'text-indigo-500' : 'text-emerald-500'}`}>
                            {item.paymentMethod === 'saldo' ? 'Digital' : 'Cash'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm text-green-600">
                          Rp {Number(item.price || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Detail Modal / Expand saat diklik */}
                    {selectedTripDetail?.orderId === item.orderId && (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-slate-700 space-y-2 text-xs animate-in fade-in">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-gray-400">Durasi: </span>
                            <span className="font-bold">{item.duration ? `${item.duration} Menit` : '-'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400">Jarak: </span>
                            <span className="font-bold">{item.distance || '-'} km</span>
                          </div>
                        </div>

                        <div className="p-2 rounded-lg bg-gray-50 dark:bg-slate-700/40 space-y-1.5 text-[11px]">
                          <div className="flex items-start gap-2">
                            <MapPin size={12} className="text-red-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-gray-400">Penjemputan:</p>
                              <p className="font-medium text-gray-700 dark:text-gray-200">{item.pickup || '-'}</p>
                              {item.pickupTime && (
                                <p className="text-[10px] text-gray-400">Jam jemput: {new Date(item.pickupTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-start gap-2 pt-1 border-t border-gray-200 dark:border-slate-600">
                            <Navigation size={12} className="text-sky-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-gray-400">Pengantaran:</p>
                              <p className="font-medium text-gray-700 dark:text-gray-200">{item.destination || '-'}</p>
                              <p className="text-[10px] text-gray-400">Tiba jam: {itemTime}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-1 font-bold">
                          <span className="text-gray-500 text-xs">Pendapatan Bersih:</span>
                          <span className="text-sm text-green-600">Rp {Number(item.netIncome || item.price || 0).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

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
                  <input type="tel" value={regForm.phone} onChange={(e) => setRegForm({...regForm, phone: e.target.value.replace(/[^0-9+]/g, '')})} className={`w-full p-3 rounded-xl border outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} placeholder="08xxxxxxxxxx" required />
                  {regForm.phone && !/^(08|\+628)[0-9]{8,11}$/.test(regForm.phone) && (
                    <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                      <AlertCircle size={12} /> Format tidak valid (08... / +628...)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Jenis Armada & Plat Nomor</label>
                  
                  {/* Motor */}
                  <div className={`p-2.5 rounded-xl border transition-all shadow-sm ${regForm.vehicles.motor.active ? 'border-green-500 bg-white ring-1 ring-green-500 dark:bg-slate-800' : 'border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700'}`}>
                    <label className="flex items-center gap-3 mb-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={regForm.vehicles.motor.active} 
                        onChange={e => setRegForm({...regForm, vehicles: {...regForm.vehicles, motor: {...regForm.vehicles.motor, active: e.target.checked}}})} 
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500 accent-green-600" 
                      />
                      <span className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Motor</span>
                    </label>
                    {regForm.vehicles.motor.active && (
                      <input 
                        type="text" 
                        placeholder="Plat Nomor Motor (P 1234 AB)" 
                        value={regForm.vehicles.motor.plate} 
                        onChange={e => setRegForm({...regForm, vehicles: {...regForm.vehicles, motor: {...regForm.vehicles.motor, plate: e.target.value.toUpperCase()}}})} 
                        className={`w-full py-1.5 px-3 rounded-lg border text-xs mt-1 ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`} 
                      />
                    )}
                  </div>

                  {/* Mobil */}
                  <div className={`p-2.5 rounded-xl border transition-all shadow-sm ${regForm.vehicles.mobil.active ? 'border-green-500 bg-white ring-1 ring-green-500 dark:bg-slate-800' : 'border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700'}`}>
                    <label className="flex items-center gap-3 mb-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={regForm.vehicles.mobil.active} 
                        onChange={e => setRegForm({...regForm, vehicles: {...regForm.vehicles, mobil: {...regForm.vehicles.mobil, active: e.target.checked}}})} 
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500 accent-green-600" 
                      />
                      <span className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Mobil</span>
                    </label>
                    {regForm.vehicles.mobil.active && (
                      <input 
                        type="text" 
                        placeholder="Plat Nomor Mobil (P 1234 AB)" 
                        value={regForm.vehicles.mobil.plate} 
                        onChange={e => setRegForm({...regForm, vehicles: {...regForm.vehicles, mobil: {...regForm.vehicles.mobil, plate: e.target.value.toUpperCase()}}})} 
                        className={`w-full py-1.5 px-3 rounded-lg border text-xs mt-1 ${isDarkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`} 
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Layanan yang Diambil</label>
                  <div className="space-y-2 pt-2">
                    <label className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all shadow-sm ${regForm.services.niagaGo ? 'border-green-500 bg-white ring-1 ring-green-500 dark:bg-slate-800' : 'border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700'}`}>
                      <input 
                        type="checkbox" 
                        checked={regForm.services.niagaGo}
                        onChange={(e) => setRegForm({...regForm, services: {...regForm.services, niagaGo: e.target.checked}})}
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500 accent-green-600"
                      />
                      <span className={`font-medium text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Niaga Go (Antar Penumpang)</span>
                    </label>
                    <label className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all shadow-sm ${regForm.services.niagaFood ? 'border-green-500 bg-white ring-1 ring-green-500 dark:bg-slate-800' : 'border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700'}`}>
                      <input 
                        type="checkbox" 
                        checked={regForm.services.niagaFood}
                        onChange={(e) => setRegForm({...regForm, services: {...regForm.services, niagaFood: e.target.checked}})}
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500 accent-green-600"
                      />
                      <span className={`font-medium text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Niaga Food (Antar Makanan)</span>
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

                <button type="submit" disabled={isRegistering || (regForm.phone && !/^(08|\+628)[0-9]{8,11}$/.test(regForm.phone))} className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all mt-4 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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
          
          <div className="flex items-center gap-2">
            {/* Performa Driver atau Penumpang */}
            <button
              onClick={() => setViewMode('performa')}
              className={`text-xs px-3 py-2 rounded-full font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                isDarkMode
                  ? 'bg-slate-800 text-yellow-400 border border-slate-700 hover:bg-slate-700'
                  : 'bg-white text-yellow-600 border border-yellow-200 hover:bg-yellow-50'
              }`}
              title={`Buka Performa ${isDriverMode ? 'Driver' : 'Penumpang'}`}
            >
              <Award size={15} className="text-yellow-500" />
              <span>Performa</span>
            </button>

            {/* Toggle Role Button (Hanya jika user adalah Driver) */}
            {userProfile?.role === 'driver' ? (
              <button 
                onClick={handleToggleDriverMode}
                className={`text-xs px-4 py-2 rounded-full font-bold border transition-all ${isDriverMode ? 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-500/30' : (isDarkMode ? 'border-slate-600 text-gray-400' : 'border-gray-300 text-gray-500 hover:bg-gray-100')}`}
              >
                {isDriverMode ? '👨‍✈️ Mode Driver' : '👤 Penumpang'}
              </button>
            ) : (
            // Tombol Daftar Driver
            latestReg?.status === 'approved' ? (
              <button 
                onClick={handleToggleDriverMode}
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
                {activeVehicle === 'mobil' ? <Car size={16} /> : <Bike size={16} />} Ojek ({activeVehicle === 'mobil' ? 'Mobil' : 'Motor'})
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
                <h2 className="text-2xl font-bold">Rp {(userProfile?.balance || 0).toLocaleString()}</h2>
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
                     <p className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Rp {(userProfile?.balance || 0).toLocaleString('id-ID')}</p>
                  </div>
               </div>
            </div>

            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Navigation size={20} className="text-sky-500"/> Mau kemana hari ini?</h2>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Lokasi Jemput (cth: Gerbang Depan)"
                  value={pickup}
                  onChange={(e) => {
                    setPickup(e.target.value);
                    setPickupCoords(null);
                    calculateEstimatedPrice(null, null);
                  }}
                  className={`w-full pl-9 pr-9 py-2 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`}
                />
                <button type="button" onClick={() => setMapPickerMode('pickup')} className="absolute right-2 top-1.5 p-1 bg-sky-100 text-sky-600 rounded-lg hover:bg-sky-200 transition-colors" title="Pilih di Peta">
                  <LocateFixed size={16} />
                </button>
              </div>
              <div className="relative">
                <Navigation className="absolute left-3 top-3 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Tujuan (cth: Kost Putri)"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setDestCoords(null);
                    calculateEstimatedPrice(null, null);
                  }}
                  className={`w-full pl-9 pr-9 py-2 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`}
                />
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
              {isEstimatingRoute && (
                <p className="text-xs text-sky-600 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Menghitung jarak melalui rute jalan...</p>
              )}
              {routeEstimateError && (
                <p role="alert" className="text-xs text-red-500">{routeEstimateError}</p>
              )}
              {estDistance != null && estDuration != null && (
                <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-sky-50 border-sky-100'}`}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Jarak rute</p>
                      <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{estDistance} km</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Estimasi Waktu</p>
                      <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{formatDuration(estDuration)}</p>
                    </div>
                  </div>
                  {routeDistanceKm > 30 ? (
                    <p className="mt-3 text-sm font-bold text-amber-600">Tarif rute &gt;30 km perlu dikonfirmasi melalui penawaran driver.</p>
                  ) : (
                    <p className="mt-3 text-sm font-bold text-sky-600">
                      Tarif NiagaGo: Rp {Number(price || 0).toLocaleString('id-ID')}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-500">Tarif memakai pembulatan jarak ke kilometer penuh berikutnya.</p>
                  <p className="mt-2 text-[10px] text-gray-500">Jarak jalan dihitung oleh OSRM publik; koordinat rute dikirim ke layanan routing.</p>
                </div>
              )}

              <input type="text" placeholder="Catatan (Cth: Jemput Ibu saya, baju kuning...)" value={notes} onChange={(e) => setNotes(e.target.value)} className={`w-full py-2 px-3 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-200'}`} />
              <button type="submit" disabled={isLoading || isEstimatingRoute || !Number.isFinite(routeDistanceKm)} className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-sky-500/30">
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
            <button
              onClick={handleClearHistory}
              className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={14}/> Hapus Riwayat {isDriverMode ? 'Driver' : 'Penumpang'}
            </button>
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
                  order.status === 'accepting' ? 'bg-blue-500/20 text-blue-600' :
                  order.status === 'paid' ? 'bg-purple-500/20 text-purple-600' :
                  order.status === 'verified' ? 'bg-indigo-500/20 text-indigo-600' :
                  order.status === 'ready_for_pickup' ? 'bg-teal-500/20 text-teal-600' :
                  order.status === 'delivering' ? 'bg-cyan-500/20 text-cyan-600' :
                  order.status === 'ongoing' ? 'bg-orange-500/20 text-orange-600' :
                  'bg-green-500/20 text-green-600'
                }`}>
                  {order.status === 'pending' ? 'Mencari Driver...' : 
                   order.status === 'accepted' ? 'Menunggu Pembayaran' :
                   order.status === 'accepting' ? 'Mengunci Penawaran...' :
                   order.status === 'paid' ? 'Verifikasi Admin' :
                   order.status === 'verified' ? (order.paymentMethod === 'saldo' ? 'Sudah Terbayar via Saldo' : 'Siap Jemput') :
                   order.status === 'ready_for_pickup' ? 'Driver OTW Resto' :
                   order.status === 'delivering' ? 'Diantar ke Kamu' :
                   order.status === 'ongoing' ? 'Dalam Perjalanan' :
                   order.status === 'expired' ? 'Kedaluwarsa' :
                   'Selesai'}
                </div>

                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                    <User size={20} className="text-sky-500" />
                  </div>
                  <div>
                    <h4 className="font-bold">{order.type === 'food' ? (order.buyerName || order.userName) : order.userName}</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> Baru saja</p>
                      {/* Kode Referensi Pesanan untuk Pelacakan Transaksi */}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 font-semibold" title="Kode Referensi Pesanan">
                        Ref: #{String(order.id || '').slice(-6).toUpperCase()}
                      </span>
                      {!isDriverMode && order.driverId && (
                        <p className="mt-1 text-[11px] text-gray-500 flex items-center gap-1.5">
                          <Star size={11} className="text-yellow-500" fill="currentColor" />
                          Driver {order.driverRating ? Number(order.driverRating).toFixed(1) : 'Baru'}
                          <span>• {Number(order.driverCompletedTrips) || 0} perjalanan</span>
                        </p>
                      )}
                      {isDriverMode && order.type !== 'food' && (() => {
                        const stats = passengerReviewSummaries[order.userId];
                        return (
                          <p className="mt-1 text-[11px] text-gray-500 flex items-center gap-1.5">
                            <Star size={11} className="text-yellow-500" fill="currentColor" />
                            Penumpang {stats?.average ? stats.average.toFixed(1) : 'Belum ada rating'}
                            {stats?.count > 0 && <span>• {stats.count} ulasan</span>}
                          </p>
                        );
                      })()}
                    </div>
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
                  {isDriverMode && order.status === 'pending' && order.type !== 'food' && (
                    (() => {
                      const location = driversLocations[userProfile?.uid];
                      const pickupDistance = order.pickupCoords && location
                        ? L.latLng(location.lat, location.lng).distanceTo(L.latLng(order.pickupCoords.lat, order.pickupCoords.lng)) / 1000
                        : null;
                      const pickupMinutes = pickupDistance == null ? null : Math.max(1, Math.ceil((pickupDistance / 20) * 60));
                      return (
                        <div className="text-xs text-gray-500 pl-6">
                          Jemput: {pickupDistance == null ? 'jarak tidak tersedia' : `${pickupDistance.toFixed(1)} km · sekitar ${pickupMinutes} menit`}
                          {order.distance != null && <span> · Rute penumpang: {order.distance} km</span>}
                        </div>
                      );
                    })()
                  )}
                </div>

                {isDriverMode && order.type !== 'food' &&
                  order.driverId === userProfile?.uid &&
                  ['verified', 'ongoing'].includes(order.status) && (
                    <div className="mb-4 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {order.status === 'ongoing' ? (
                          <>
                            <button
                              onClick={() => handleOpenDriverNavigation(order, 'destination')}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                            >
                              <Navigation size={16} /> Navigasi ke Tujuan
                            </button>
                            <button
                              onClick={() => handleOpenDriverNavigation(order, 'pickup')}
                              className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                            >
                              <MapPin size={16} /> Navigasi ke Penjemputan
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleOpenDriverNavigation(order, 'pickup')}
                              className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                            >
                              <MapPin size={16} /> Navigasi ke Penjemputan
                            </button>
                            <button
                              type="button"
                              disabled
                              title="Navigasi ke tujuan tersedia setelah perjalanan dimulai."
                              className="bg-gray-200 dark:bg-slate-700 text-gray-500 px-3 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed"
                            >
                              <Navigation size={16} /> Navigasi ke Tujuan
                            </button>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleSharePickupLocation(order)}
                        className="w-full border border-sky-500 text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                      >
                        <Share2 size={16} /> Bagikan Lokasi Penjemputan
                      </button>
                    </div>
                  )}
                
                <div className="flex items-center gap-2 mb-3 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-slate-700 w-fit px-2 py-1 rounded-lg">
                  <Shield size={12} className="text-green-500" /> Rekber Aman (Admin)
                  {order.paymentMethod === 'saldo' && <span className="text-sky-600 font-bold">• Lunas via Saldo</span>}
                </div>

                {order.type !== 'food' &&
                  order.driverId &&
                  ['accepted', 'paid', 'verified', 'ongoing', 'completed', 'cancelled', 'expired', 'payment_rejected'].includes(order.status) &&
                  (isDriverMode ? order.driverId === (userProfile?.uid || auth.currentUser?.uid) : order.userId === (userProfile?.uid || auth.currentUser?.uid)) && (
                    <button
                      type="button"
                      onClick={() => handleOpenNiagaGoChat(order)}
                      className="mb-3 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                    >
                      <MessageCircle size={16} />
                      Chat
                    </button>
                  )}

                {/* 0. STATUS PENDING: User Cari Driver */}
                {!isDriverMode && ['pending', 'accepting'].includes(order.status) && order.type !== 'food' && (
                    <div className="flex flex-col gap-3 w-full mb-3">
                        <TrackingMap driverId={null} pickupCoords={order.pickupCoords} status="pending" driversLocations={driversLocations} passengerVehicleType={order.vehicleType} />
                        {order.status === 'pending' ? (
                          <p className="text-xs text-center text-gray-500 animate-pulse">
                            {order.searchExpiresAt && order.searchExpiresAt <= searchClock
                              ? 'Waktu pencarian habis. Batalkan pesanan lalu coba cari kembali.'
                              : 'Mencari driver di semua jarak. Penawaran berlaku 60 detik.'}
                          </p>
                        ) : (
                          <p className="text-xs text-center text-sky-600">Menyelesaikan persetujuan harga dan pembayaran dengan aman...</p>
                        )}
                    </div>
                )}

                {/* 0.5 STATUS PENDING: List Penawaran Driver (Fitur Killer) */}
                {(() => {
                  const filteredOffers = !isDriverMode && ['pending', 'accepting'].includes(order.status)
                    ? (order.status === 'accepting'
                      ? (order.offers || []).filter((offer) => offer.offerId === order.selectedOfferId || offer.driverId === order.driverId)
                      : getActiveOffers(order, searchClock))
                    : [];

                  return filteredOffers.length > 0 && (
                    <div className="mt-3 border-t pt-3 border-dashed border-gray-200 dark:border-slate-700">
                      <p className="text-xs font-bold mb-2 text-sky-600">⚡ {filteredOffers.length} Penawaran Driver:</p>
                      <div className="space-y-2">
                        {filteredOffers.slice(0, 5).map((offer, idx) => (
                          <OfferCard
                            key={offer.offerId || `${offer.driverId}-${idx}`}
                            offer={offer}
                            expiresAt={getOfferExpiry(offer, order)}
                            isRetry={order.status === 'accepting'}
                            onAccept={() => handleAcceptOffer(order, offer)}
                            onReject={order.status === 'pending' ? () => handleRejectOffer(order, offer) : null}
                          />
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

                <div className="flex flex-col items-stretch gap-3 pt-3 border-t border-dashed border-gray-300 dark:border-slate-600">
                  <div className="font-bold text-lg text-sky-500">
                    {Number.isFinite(Number(order.price ?? order.totalPrice))
                      ? `Rp ${Number(order.price ?? order.totalPrice).toLocaleString('id-ID')}`
                      : 'Menunggu konfirmasi tarif'}
                  </div>
                  
                  {/* --- LOGIKA TOMBOL BERDASARKAN STATUS --- */}
                  
                  {/* 1. STATUS PENDING: Driver bisa ambil */}
                  {isDriverMode && order.status === 'pending' && (
                    <button 
                      onClick={() => handleTakeOrder(order)}
                      disabled={takingOrderId === order.id}
                      className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-wait text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      {takingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <><Bike size={16} /> Kirim Penawaran</>}
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

                  {/* 4. STATUS VERIFIED: Driver Jemput & Chat In-App / Kontak Darurat */}
                  {order.status === 'verified' && (
                    <div className="flex flex-col gap-3 w-full">
                      {/* Tampilkan Peta Live Tracking (User & Driver) */}
                      <TrackingMap driverId={order.driverId} pickupCoords={order.pickupCoords} driversLocations={driversLocations} />
                      
                      <div className="flex flex-wrap gap-2 justify-end">
                      <button 
                        type="button"
                        onClick={() => handleEmergencyContact(order, isDriverMode ? 'user' : 'driver')}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm transition-all"
                        title="Kontak Darurat Bertahap"
                      >
                        <Phone size={16} /> Kontak Darurat
                      </button>
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
                  {isDriverMode && order.type === 'food' && ['ready_for_pickup', 'delivering', 'completing'].includes(order.status) && (
                    <div className="flex gap-2 justify-end">
                      <button 
                        type="button"
                        onClick={() => handleEmergencyContact(order, 'user')}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5"
                      >
                        <Phone size={16} /> Kontak Darurat
                      </button>
                      {order.status === 'ready_for_pickup' && (
                        <button onClick={() => handleUpdateFoodDeliveryStatus(order.id, 'delivering')} className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold">
                          Mulai Antar
                        </button>
                      )}
                      {['delivering', 'completing'].includes(order.status) && (
                        <button 
                          onClick={() => handleUpdateFoodDeliveryStatus(order.id, 'completed')}
                          className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                        >
                          <CheckSquare size={16} /> {order.status === 'completing' ? 'Lanjutkan Selesai' : 'Selesai'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* 5. STATUS ONGOING: Driver completes after reaching destination */}
                  {order.status === 'ongoing' && (
                    <div className="flex flex-col gap-3 w-full">
                      <TrackingMap driverId={order.driverId} pickupCoords={order.pickupCoords} driversLocations={driversLocations} />
                      {isDriverMode ? (() => {
                        const location = driversLocations[userProfile?.uid];
                        const driverCoordinates = normalizeGpsCoordinates(location);
                        const destinationCoordinates = normalizeGpsCoordinates(order.destCoords);
                        const isFresh = location?.updatedAt && Date.now() - Number(location.updatedAt) <= DRIVER_LOCATION_MAX_AGE_MS;
                        const distance = driverCoordinates && destinationCoordinates
                          ? L.latLng(driverCoordinates.lat, driverCoordinates.lng).distanceTo(L.latLng(destinationCoordinates.lat, destinationCoordinates.lng))
                          : null;
                        const canFinish = Boolean(isFresh && distance !== null && distance <= TRIP_COMPLETION_RADIUS_METERS);
                        return (
                          <div className="flex flex-col items-stretch gap-2">
                            <button
                              type="button"
                              onClick={() => handleFinishTrip(order)}
                              disabled={!canFinish}
                              title={canFinish ? 'Selesaikan perjalanan' : 'Tombol aktif saat GPS berada dalam radius 150 meter dari tujuan'}
                              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-400 disabled:hover:bg-slate-400 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                            >
                              <CheckSquare size={17} /> {canFinish ? 'Selesaikan Perjalanan' : 'Selesaikan saat Tiba'}
                            </button>
                            <p className="text-[11px] text-center text-gray-500">
                              {distance === null || !isFresh
                                ? 'Aktifkan GPS agar jarak ke tujuan bisa diperiksa.'
                                : canFinish
                                  ? 'Kamu sudah dekat tujuan. Perjalanan siap diselesaikan.'
                                  : 'Tombol aktif dalam jarak 150 m. Jarak saat ini ' + Math.round(distance) + ' m.'}
                            </p>
                          </div>
                        );
                      })() : (
                        <p className="text-xs text-center text-sky-600 bg-sky-50 dark:bg-slate-700/60 rounded-xl p-3">
                          Menunggu driver menyelesaikan perjalanan. Setelah selesai, kamu bisa memberi rating dan komentar.
                        </p>
                      )}
                    </div>
                  )}
                  {/* 6. STATUS COMPLETED */}
                  {['completed', 'cancelled', 'payment_rejected', 'expired'].includes(order.status) && (
                    <div className="flex justify-between items-center w-full mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-slate-700">
                        <span className={`text-xs font-bold flex items-center gap-1 ${order.status === 'completed' ? 'text-green-600' : 'text-red-500'}`}>
                          {order.status === 'completed' ? <Star size={12} fill="currentColor" /> : <X size={12} />} 
                          {order.status === 'completed' ? 'Selesai' : (order.status === 'expired' ? 'Kedaluwarsa' : (order.status === 'payment_rejected' ? 'Ditolak' : 'Dibatalkan'))}
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
                    <button 
                      type="button"
                      onClick={() => handleEmergencyContact(order, 'driver')}
                      className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <Phone size={16} /> Kontak Driver
                    </button>
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
              {tempPickerCenter && <NearbyDrivers driversLocations={driversLocations} center={tempPickerCenter} filterType={vehicleType} />}
            </MapContainer>
            
            {/* Center Pin Icon (Overlay) */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[900] pointer-events-none -mt-8">
              <MapPin size={40} className="text-red-600 fill-current drop-shadow-xl" />
            </div>

            <div className="p-3 border-t bg-white flex flex-col gap-2">
              <button 
                onClick={handleUseCurrentLocation} 
                disabled={isLocating}
                className={`w-full py-2 bg-white border border-sky-600 text-sky-600 rounded-lg font-bold shadow-sm flex items-center justify-center gap-2 hover:bg-sky-50 transition-all !opacity-100 ${isLocating ? 'cursor-wait' : ''}`}
              >
                {isLocating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} 
                <span className="text-xs">{isLocating ? 'Mencari Lokasi...' : 'Gunakan Lokasi Saat Ini'}</span>
              </button>
              <div className="flex gap-2">
                <button onClick={() => setMapPickerMode(null)} className="flex-1 py-2 border rounded-lg font-bold text-gray-600 hover:bg-gray-50 text-xs !opacity-100">Batal</button>
                <button onClick={handleConfirmLocation} className="flex-1 py-2 bg-sky-600 text-white rounded-lg font-bold shadow-lg hover:bg-sky-700 text-xs !opacity-100">Konfirmasi Lokasi Ini</button>
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
                 <p className="text-lg font-bold text-green-600">
                   {viewingRouteOrder.price != null && Number.isFinite(Number(viewingRouteOrder.price))
                     ? `Rp ${Number(viewingRouteOrder.price).toLocaleString('id-ID')}`
                     : 'Perlu konfirmasi'}
                 </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CHAT NIAGAGO --- */}
      {activeChat && (userProfile?.uid || auth.currentUser?.uid) && (
        <NiagaGoChat
          orderId={activeChat.orderId}
          currentUser={{
            uid: userProfile?.uid || auth.currentUser?.uid,
            displayName: userProfile?.displayName || auth.currentUser?.displayName || 'Pengguna NiagaGo',
            username: userProfile?.username || '',
            photoURL: userProfile?.photoURL || auth.currentUser?.photoURL || ''
          }}
          partner={activeChat.partner}
          canSend={activeChat.canSend}
          onClose={() => setActiveChat(null)}
        />
      )}

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
                                <p className="font-bold">{adminPaymentInfo.bankName} - {adminPaymentInfo.bankAccount}</p>
                                <p className="text-xs opacity-80">a.n {adminPaymentInfo.accountHolder}</p>
                                <button onClick={() => navigator.clipboard.writeText(adminPaymentInfo.bankAccount)} className="text-xs underline mt-1 hover:text-blue-600">Salin No. Rekening</button>
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
