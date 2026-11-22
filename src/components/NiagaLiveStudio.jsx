import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Loader2, Radio, Users, X } from 'lucide-react';
import { auth, dbFirestore } from '../config/firebase';
import {
  addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc
} from 'firebase/firestore';

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const NiagaLiveStudio = ({ user, storeName, onClose }) => {
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const peersRef = useRef(new Map());
  const handledViewersRef = useRef(new Set());
  const [description, setDescription] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [starting, setStarting] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [error, setError] = useState('');

  const stopLive = async () => {
    peersRef.current.forEach(({ pc, unsubs = [] }) => {
      unsubs.forEach((unsub) => unsub());
      pc.close();
    });
    peersRef.current.clear();
    handledViewersRef.current.clear();
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (sessionId) {
      try {
        await updateDoc(doc(dbFirestore, 'live_streams', sessionId), {
          status: 'ended', endedAt: serverTimestamp()
        });
      } catch (stopError) {
        console.error('Gagal menutup sesi live:', stopError);
      }
    }
    setSessionId(null);
  };

  useEffect(() => () => {
    peersRef.current.forEach(({ pc, unsubs = [] }) => {
      unsubs.forEach((unsub) => unsub());
      pc.close();
    });
    mediaRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!sessionId || !mediaRef.current) return undefined;
    const viewersRef = collection(dbFirestore, 'live_streams', sessionId, 'viewers');
    return onSnapshot(viewersRef, (snapshot) => {
      const active = snapshot.docs.filter((item) => ['waiting', 'connected'].includes(item.data().status));
      setViewerCount(active.length);
      snapshot.docs.forEach((viewerSnap) => {
        const viewerId = viewerSnap.id;
        const viewerData = viewerSnap.data();
        if (viewerData.status === 'left') {
          const peer = peersRef.current.get(viewerId);
          if (peer) {
            peer.unsubs.forEach((unsub) => unsub());
            peer.pc.close();
            peersRef.current.delete(viewerId);
          }
          handledViewersRef.current.delete(viewerId);
          return;
        }
        if (viewerData.status !== 'waiting' || handledViewersRef.current.has(viewerId)) return;
        if (peersRef.current.size >= 2) {
          updateDoc(viewerSnap.ref, { status: 'full' }).catch(console.error);
          return;
        }
        handledViewersRef.current.add(viewerId);
        const connectViewer = async () => {
          const pc = new RTCPeerConnection(rtcConfig);
          mediaRef.current.getTracks().forEach((track) => pc.addTrack(track, mediaRef.current));
          const callerCandidates = collection(viewerSnap.ref, 'callerCandidates');
          const calleeCandidates = collection(viewerSnap.ref, 'calleeCandidates');
          const queuedCandidates = [];
          let remoteReady = false;
          pc.onicecandidate = (event) => {
            if (event.candidate) addDoc(calleeCandidates, event.candidate.toJSON()).catch(console.error);
          };
          const unsubs = [];
          unsubs.push(onSnapshot(callerCandidates, (candidateSnap) => {
            candidateSnap.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                if (remoteReady) pc.addIceCandidate(candidate).catch(console.error);
                else queuedCandidates.push(candidate);
              }
            });
          }));
          peersRef.current.set(viewerId, { pc, unsubs });
          await pc.setRemoteDescription(new RTCSessionDescription(viewerData.offer));
          remoteReady = true;
          await Promise.all(queuedCandidates.splice(0).map((candidate) => pc.addIceCandidate(candidate)));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateDoc(viewerSnap.ref, { answer: { type: answer.type, sdp: answer.sdp }, status: 'connected' });
        };
        connectViewer().catch((connectError) => {
          console.error('Gagal menyambungkan penonton:', connectError);
          handledViewersRef.current.delete(viewerId);
        });
      });
    }, (snapshotError) => setError(snapshotError.message));
  }, [sessionId]);

  const requestCameraPermission = async () => {
    setStarting(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak menyediakan akses kamera. Buka situs melalui HTTPS dan izinkan kamera serta mikrofon.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      mediaRef.current = media;
      if (videoRef.current) videoRef.current.srcObject = media;
      setMediaReady(true);
    } catch (permissionError) {
      const denied = permissionError.name === 'NotAllowedError' || permissionError.name === 'PermissionDeniedError';
      setError(denied
        ? 'Izin kamera/mikrofon diblokir. Ubah izin situs ke Izinkan di browser, lalu tekan tombol coba lagi di bawah.'
        : permissionError.name === 'NotFoundError'
          ? 'Kamera atau mikrofon tidak ditemukan. Sambungkan perangkat lalu coba lagi.'
          : permissionError.message || 'Akses kamera belum tersedia.');
    } finally {
      setStarting(false);
    }
  };

  const startLive = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user?.uid) {
      setError('Sesi akun tidak valid. Muat ulang lalu coba lagi.');
      return;
    }
    setStarting(true);
    setError('');
    try {
      if (!mediaRef.current) throw new Error('Izinkan kamera dan mikrofon terlebih dahulu.');
      const streamDoc = await addDoc(collection(dbFirestore, 'live_streams'), {
        hostId: user.uid,
        sellerName: storeName || user.displayName || 'Toko SobatNiaga',
        description: description.trim().slice(0, 160),
        status: 'live',
        startedAt: serverTimestamp(),
        viewerLimit: 2
      });
      setSessionId(streamDoc.id);
    } catch (startError) {
      const message = startError.code === 'permission-denied'
        ? 'Akses database live ditolak. Aturan Firestore lokal perlu dipublikasikan terlebih dahulu.'
          : startError.message || 'Live belum dapat dimulai.';
      setError(message);
    } finally {
      setStarting(false);
    }
  };

  const handleClose = async () => {
    await stopLive();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl border border-white/10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 font-bold"><Radio className="text-red-500" /> Studio Live SobatNiaga</div>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Tutup studio"><X size={20} /></button>
        </div>
        <div className="grid md:grid-cols-[1.4fr_1fr]">
          <div className="relative bg-black aspect-video md:aspect-auto md:min-h-[420px] flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            {sessionId ? (
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="rounded bg-red-600 px-2 py-1 text-xs font-black animate-pulse">LIVE</span>
                <span className="rounded bg-black/60 px-2 py-1 text-xs flex items-center gap-1"><Users size={13} /> {viewerCount}/2</span>
              </div>
            ) : mediaReady ? (
              <div className="absolute left-3 top-3 rounded bg-emerald-700 px-2 py-1 text-xs font-bold">Kamera siap</div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60 text-sm px-6 text-center">
                <Camera size={36} />
                Kamera akan muncul setelah kamu mengizinkan akses.
              </div>
            )}
          </div>
          <div className="p-5 sm:p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-black">Siaran langsung</h2>
              <p className="text-xs text-white/60 mt-1">Mode uji langsung antar pengguna. Maksimal dua penonton; kualitas tergantung jaringan dan kemampuan browser.</p>
            </div>
            <label className="text-xs font-bold text-white/70">Judul atau catatan live
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} disabled={!!sessionId} rows={3} placeholder="Contoh: Live produk hari ini" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white outline-none focus:border-sky-500" />
            </label>
            <div className="rounded-xl bg-slate-900 p-3 text-xs text-white/65 leading-relaxed">
              <p className="font-bold text-white mb-1">Sebelum mulai</p>
              <p>Gunakan situs HTTPS. Tekan tombol izin di bawah dan pilih Izinkan pada pop-up browser. Setelah kamera siap, tekan Mulai Siaran. Biarkan halaman tetap terbuka selama live.</p>
            </div>
            {error && <div className="rounded-lg bg-red-950/70 border border-red-500/30 p-3 text-xs text-red-200">{error}</div>}
            {error.toLowerCase().includes('diblokir') && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/40 p-3 text-xs leading-relaxed text-amber-100">
                <p className="font-bold mb-1">Cara membuka izin kamera</p>
                <p><b>Laptop:</b> klik ikon pengaturan di kiri alamat situs → Setelan situs → Kamera dan Mikrofon → Izinkan, lalu muat ulang halaman.</p>
                <p className="mt-2"><b>HP:</b> buka menu browser → Setelan situs/Izin → Kamera dan Mikrofon → Izinkan. Jika masih ditolak, izinkan juga aplikasi browser di Setelan HP.</p>
              </div>
            )}
            {!sessionId ? (
              mediaReady ? (
                <button onClick={startLive} disabled={starting} className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-black hover:bg-red-500 disabled:opacity-60">
                  {starting ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}{starting ? 'Menyiapkan siaran…' : 'Mulai Siaran'}
                </button>
              ) : (
                <button onClick={requestCameraPermission} disabled={starting} className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 font-black hover:bg-sky-500 disabled:opacity-60">
                  {starting ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}{starting ? 'Meminta izin kamera…' : error.toLowerCase().includes('diblokir') ? 'Coba Lagi Setelah Mengizinkan' : 'Izinkan Kamera & Mikrofon'}
                </button>
              )
            ) : (
              <button onClick={handleClose} className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-slate-700 py-3 font-black hover:bg-slate-600"><CameraOff size={18} /> Akhiri Siaran</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NiagaLiveStudio;
