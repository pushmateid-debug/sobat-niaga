import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ref, onValue } from 'firebase/database';
import { db as realDb } from '../config/firebase';
import { User, Phone, Clock, Loader2 } from 'lucide-react';

// Komponen Internal untuk Marker yang Bergerak Halus (Interpolasi)
const MovingMarker = ({ position, iconUrl }) => {
  const [currentPos, setCurrentPos] = useState(position);
  const [rotation, setRotation] = useState(0);
  const prevPosRef = useRef(position);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    // Jika posisi tidak berubah signifikan, abaikan
    if (prevPosRef.current && prevPosRef.current[0] === position[0] && prevPosRef.current[1] === position[1]) return;

    const startPos = prevPosRef.current || position;
    const endPos = position;
    const startTime = performance.now();
    const duration = 2500; // Durasi animasi 2.5 detik agar transisi antar update GPS terasa mengalir

    // Hitung Heading/Arah (Rotation) berdasarkan selisih koordinat
    const angle = Math.atan2(endPos[1] - startPos[1], endPos[0] - startPos[0]) * (180 / Math.PI) + 90;
    setRotation(angle);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic untuk pergerakan yang lebih 'mahal' dan sinematik
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const lat = startPos[0] + (endPos[0] - startPos[0]) * easeProgress;
      const lng = startPos[1] + (endPos[1] - startPos[1]) * easeProgress;

      setCurrentPos([lat, lng]);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        prevPosRef.current = endPos;
      }
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);
    
    return () => cancelAnimationFrame(animationRef.current);
  }, [position]);

  // Custom DivIcon agar kita bisa memutar element di dalamnya dengan CSS
  const icon = L.divIcon({
    className: 'moving-driver-icon-container',
    html: `<div style="transform: rotate(${rotation}deg); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); filter: drop-shadow(0 10px 15px rgba(0,0,0,0.4))">
             <img src="${iconUrl}" style="width: 50px; height: 50px;" />
           </div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  return <Marker position={currentPos} icon={icon} />;
};

// Helper untuk smooth-panning kamera mengikuti driver
const MapAutoPan = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.panTo(center, { animate: true, duration: 2.0 });
    }
  }, [center, map]);
  return null;
};

const NiagaGoMap = ({ driverId, vehicleType = 'motor' }) => {
  const [driverData, setDriverData] = useState(null);
  const [location, setLocation] = useState(null);
  
  const iconUrl = vehicleType === 'mobil' 
    ? 'https://cdn-icons-png.flaticon.com/512/1048/1048314.png' 
    : 'https://cdn-icons-png.flaticon.com/512/1986/1986937.png';

  useEffect(() => {
    if (!driverId) return;

    // Hubungkan ke path Realtime DB sesuai request
    const driverLocRef = ref(realDb, `drivers/${driverId}/location`);
    const unsubscribe = onValue(driverLocRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.lat && data.lng) {
        setLocation([data.lat, data.lng]);
        setDriverData(data);
      }
    });

    return () => unsubscribe();
  }, [driverId]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-[3rem] shadow-2xl bg-slate-950 niagago-3d-map-frame">
      <style>{`
        .niagago-3d-map-frame { perspective: 1500px; }
        .niagago-3d-map-frame .leaflet-container { 
          transform: rotateX(25deg); 
          transform-origin: bottom; 
          background: #0f172a;
        }
        .niagago-3d-map-frame .leaflet-tile-pane { 
          filter: grayscale(25%) contrast(110%) brightness(80%) saturate(130%) hue-rotate(10deg);
        }
      `}</style>

      {location ? (
        <MapContainer center={location} zoom={18} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MovingMarker position={location} iconUrl={iconUrl} />
          <MapAutoPan center={location} />
        </MapContainer>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-white gap-4 bg-slate-900">
          <Loader2 className="animate-spin text-sky-500" size={48} />
          <p className="text-xs font-black tracking-[0.2em] uppercase opacity-40">Connecting to Driver GPS...</p>
        </div>
      )}

      {/* UI OVERLAY: INFORMASI DRIVER (GLASSMORPHISM) */}
      <div className="absolute bottom-10 left-6 right-6 z-[1000] flex items-center gap-5 bg-white/10 dark:bg-slate-900/40 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/20 shadow-[0_30px_60px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-12 duration-1000">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center text-white shadow-2xl shadow-sky-500/50">
          <User size={36} strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <h4 className="font-black text-white text-lg leading-none uppercase tracking-tighter">
            {driverData?.name || 'Driver NiagaGo'}
          </h4>
          <div className="flex items-center gap-3 mt-3">
            <span className="bg-white/10 px-3 py-1 rounded-xl text-xs font-black font-mono tracking-widest text-sky-200 border border-white/10">
              {driverData?.plate || 'P 1234 SN'}
            </span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
              <Clock size={14} />
              <span>3 Mnt</span>
            </div>
          </div>
        </div>
        <button className="w-16 h-16 flex items-center justify-center bg-green-500 text-white rounded-3xl shadow-xl shadow-green-500/40 active:scale-90 transition-all hover:bg-green-400">
          <Phone size={30} fill="currentColor" />
        </button>
      </div>
    </div>
  );
};

export default NiagaGoMap;