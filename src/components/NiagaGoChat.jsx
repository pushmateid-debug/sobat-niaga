import React, { useEffect, useRef, useState } from 'react';
import {
  Check, CheckCheck, ExternalLink, ImagePlus, Loader2, MapPin, MessageCircle, Send, X
} from 'lucide-react';
import { onValue, push, ref, serverTimestamp, set, update } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from '../config/firebase';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';
import { useTheme } from '../context/ThemeContext';

const CHAT_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const CHAT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const NiagaGoChat = ({ orderId, currentUser, partner, canSend, onClose }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [messages, setMessages] = useState([]);
  const [imageUrls, setImageUrls] = useState({});
  const [roomCanSend, setRoomCanSend] = useState(canSend);
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const galleryInputRef = useRef(null);
  const roomPath = `niagago_chats/${orderId}`;

  useEffect(() => {
    setRoomCanSend(canSend);
  }, [canSend]);

  useEffect(() => {
    const unsubscribe = onValue(ref(db, roomPath), (snapshot) => {
      const room = snapshot.val();
      if (room?.canSend !== undefined) {
        setRoomCanSend(room.canSend === true);
      } else {
        setRoomCanSend(canSend);
      }

      const loaded = room?.messages
        ? Object.entries(room.messages).map(([id, message]) => ({ id, ...message }))
        : [];
      loaded.sort((first, second) => Number(first.createdAt || 0) - Number(second.createdAt || 0));
      setMessages(loaded);
      setError('');
      setIsLoading(false);

      const readUpdates = {};
      loaded.forEach((message) => {
        if (message.senderId !== currentUser.uid && message.status !== 'read') {
          readUpdates[`${roomPath}/messages/${message.id}/status`] = 'read';
        }
      });
      if (Object.keys(readUpdates).length > 0) {
        update(ref(db), readUpdates).catch((readError) => {
          console.debug('Gagal memperbarui status pesan NiagaGo:', readError);
        });
      }
    }, (listenerError) => {
      console.warn('Gagal memuat chat NiagaGo:', listenerError);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser.uid, roomPath, canSend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let active = true;
    const imagesToResolve = messages.filter((message) =>
      message.type === 'image' && (message.imageUrl || message.imagePath) &&
      !Object.prototype.hasOwnProperty.call(imageUrls, message.id)
    );
    if (imagesToResolve.length === 0) return undefined;

    Promise.all(imagesToResolve.map(async (message) => {
      if (message.imageUrl) {
        return [message.id, message.imageUrl];
      }
      if (message.imagePath) {
        try {
          const directUrl = await getDownloadURL(storageRef(storage, message.imagePath));
          return [message.id, directUrl];
        } catch (storageErr) {
          console.debug('Storage direct URL fallback:', storageErr);
        }
      }
      try {
        const getImageUrl = httpsCallable(functions, 'getNiagaGoChatImageUrl');
        const response = await getImageUrl({
          orderId,
          messageId: message.id,
          storagePath: message.imagePath
        });
        if (response.data?.url) return [message.id, response.data.url];
      } catch (imageError) {
        console.debug('Gagal memuat gambar chat NiagaGo via cloud function:', imageError);
      }
      // Fallback: pastikan tidak loading selamanya
      return [message.id, null];
    })).then((entries) => {
      if (active) {
        setImageUrls((current) => ({
          ...current,
          ...Object.fromEntries(entries)
        }));
      }
    });

    return () => {
      active = false;
    };
  }, [functions, imageUrls, messages, orderId]);

  const writeMessage = async (payload) => {
    const isAllowedToSend = roomCanSend ?? canSend ?? true;
    if (!isAllowedToSend) throw new Error('Chat hanya dapat digunakan selama pesanan aktif.');
    const messageRef = push(ref(db, `${roomPath}/messages`));
    const message = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.username || 'Pengguna NiagaGo',
      type: payload.type,
      createdAt: serverTimestamp(),
      status: 'sent',
      ...(currentUser.photoURL ? { senderPhoto: currentUser.photoURL } : {}),
      ...payload
    };
    await set(messageRef, message);
    update(ref(db, roomPath), {
      [`members/${currentUser.uid}`]: true,
      ...(partner?.uid ? { [`members/${partner.uid}`]: true } : {}),
      lastMessageText: payload.type === 'image' ? '[Gambar]' : (payload.type === 'location' ? '[Lokasi GPS]' : (payload.text || '')),
      lastMessageTime: serverTimestamp()
    }).catch(() => {});
  };

  const handleSendText = async (event) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError('');
    try {
      await writeMessage({ type: 'text', text });
      setMessageText('');
    } catch (sendError) {
      console.error('Gagal mengirim pesan NiagaGo:', sendError);
      setError(sendError.message || 'Pesan tidak dapat dikirim.');
    } finally {
      setIsSending(false);
    }
  };

  const handleUploadImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!CHAT_IMAGE_TYPES.has(file.type)) {
      setError('Gunakan gambar JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_SIZE) {
      setError('Ukuran gambar maksimal 5 MB.');
      return;
    }

    setIsSending(true);
    setError('');
    try {
      const isAllowedToSend = roomCanSend ?? canSend ?? true;
      if (!isAllowedToSend) throw new Error('Chat hanya dapat digunakan selama pesanan aktif.');
      const messageRef = push(ref(db, `${roomPath}/messages`));

      // All new chat images go through malware scanning and WebP conversion.
      const uploadedUrl = await uploadToCloudinary(file, 'sobatniaga/reviews', 'image');

      await set(messageRef, {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.username || 'Pengguna NiagaGo',
        type: 'image',
        imageUrl: uploadedUrl,
        createdAt: serverTimestamp(),
        status: 'sent',
        ...(currentUser.photoURL ? { senderPhoto: currentUser.photoURL } : {})
      });

      // Langsung simpan di local preview imageUrls state agar tidak loading terus
      if (uploadedUrl) {
        setImageUrls((prev) => ({ ...prev, [messageRef.key]: uploadedUrl }));
      }

      update(ref(db, roomPath), {
        [`members/${currentUser.uid}`]: true,
        ...(partner?.uid ? { [`members/${partner.uid}`]: true } : {}),
        lastMessageText: '[Gambar]',
        lastMessageTime: serverTimestamp()
      }).catch(() => {});
    } catch (uploadError) {
      console.error('Gagal mengirim gambar chat NiagaGo:', uploadError);
      setError(uploadError.message || 'Gambar tidak dapat dikirim.');
    } finally {
      setIsSending(false);
    }
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setError('Browser ini tidak mendukung akses lokasi.');
      return;
    }

    setIsSending(true);
    setError('');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        await writeMessage({
          type: 'location',
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        });
      } catch (locationError) {
        console.error('Gagal membagikan lokasi chat NiagaGo:', locationError);
        setError(locationError.message || 'Lokasi tidak dapat dikirim.');
      } finally {
        setIsSending(false);
      }
    }, (locationError) => {
      setIsSending(false);
      setError(locationError.code === 1
        ? 'Izin lokasi ditolak. Izinkan lokasi di browser lalu coba lagi.'
        : 'Lokasi tidak tersedia. Periksa GPS dan koneksi perangkat.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(Number(timestamp));
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const locationLinks = (location) => ({
    google: `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`,
    osm: `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`
  });

  return (
    <div className="fixed inset-0 z-[1200] bg-black/60 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Chat perjalanan NiagaGo">
      <section className={`w-full h-[100dvh] sm:h-[min(760px,90vh)] sm:max-w-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'}`}>
        <header className="bg-sky-600 px-4 py-3 text-white flex items-center gap-3">
          {partner?.photoURL ? (
            <img src={partner.photoURL} alt="" className="w-10 h-10 rounded-full object-cover bg-white/20" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><MessageCircle size={20} /></div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-bold truncate">{partner?.name || 'Lawan bicara'}</h2>
            <p className="text-xs text-sky-100">NiagaGo · Pesanan #{orderId.slice(-6)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/20" aria-label="Tutup chat">
            <X size={20} />
          </button>
        </header>

        <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-sky-600"><Loader2 className="animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-sm text-gray-500">
              <MessageCircle size={36} className="mb-2 opacity-50" />
              Mulai percakapan dengan {partner?.name || 'lawan bicara'}.
            </div>
          ) : messages.map((message) => {
            const isOwnMessage = message.senderId === currentUser.uid;
            const links = message.type === 'location' ? locationLinks(message.location) : null;
            return (
              <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <article className={`max-w-[84%] rounded-2xl px-3 py-2 shadow-sm ${
                  isOwnMessage
                    ? 'bg-sky-600 text-white rounded-br-sm'
                    : isDarkMode ? 'bg-slate-800 text-white rounded-bl-sm' : 'bg-white text-gray-800 rounded-bl-sm'
                }`}>
                  {message.type === 'image' && (
                    imageUrls[message.id] ? (
                      <a href={imageUrls[message.id]} target="_blank" rel="noreferrer">
                        <img src={imageUrls[message.id]} alt="Gambar dari chat" loading="lazy" className="max-h-64 rounded-xl object-contain" />
                      </a>
                    ) : Object.prototype.hasOwnProperty.call(imageUrls, message.id) ? (
                      <p className="p-3 text-xs">Gambar tidak dapat dimuat.</p>
                    ) : (
                      <div className="p-8 flex items-center justify-center"><Loader2 size={20} className="animate-spin" /></div>
                    )
                  )}
                  {message.type === 'location' && links && (
                    <div className="space-y-2 min-w-48">
                      <p className="flex items-center gap-2 text-sm font-bold"><MapPin size={16} /> Lokasi GPS</p>
                      <p className="text-xs opacity-80">{Number(message.location.lat).toFixed(6)}, {Number(message.location.lng).toFixed(6)}</p>
                      <div className="flex flex-wrap gap-3 text-xs underline">
                        <a href={links.google} target="_blank" rel="noreferrer" className="flex items-center gap-1"><ExternalLink size={12} /> Google Maps</a>
                        <a href={links.osm} target="_blank" rel="noreferrer" className="flex items-center gap-1"><ExternalLink size={12} /> OpenStreetMap</a>
                      </div>
                    </div>
                  )}
                  {message.type === 'text' && <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>}
                  <footer className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isOwnMessage ? 'text-sky-100' : 'text-gray-400'}`}>
                    <span>{formatMessageTime(message.createdAt)}</span>
                    {isOwnMessage && (message.status === 'read' ? <CheckCheck size={13} /> : <Check size={13} />)}
                  </footer>
                </article>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {error && <p role="alert" className="px-4 py-2 text-xs text-red-500 bg-red-50 dark:bg-red-950/30">{error}</p>}
        {roomCanSend && canSend ? (
          <form onSubmit={handleSendText} className={`p-3 border-t flex items-center gap-2 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
            <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadImage} className="hidden" />
            <button type="button" disabled={isSending} onClick={() => galleryInputRef.current?.click()} className="p-2 rounded-full text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-800 disabled:opacity-50" aria-label="Kirim gambar / foto">
              <ImagePlus size={20} />
            </button>
            <button type="button" disabled={isSending} onClick={handleShareLocation} className="p-2 rounded-full text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-800 disabled:opacity-50" aria-label="Bagikan lokasi">
              <MapPin size={20} />
            </button>
            <input
              type="text"
              maxLength={2000}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Tulis pesan..."
              className={`flex-1 min-w-0 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-900'}`}
            />
            <button type="submit" disabled={!messageText.trim() || isSending} className="p-2.5 rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50" aria-label="Kirim pesan">
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        ) : (
          <div className={`p-4 text-center text-sm ${isDarkMode ? 'bg-slate-900 text-gray-400' : 'bg-white text-gray-500'}`}>
            Perjalanan sudah ditutup. Riwayat chat hanya dapat dibaca.
          </div>
        )}
      </section>
    </div>
  );
};

export default NiagaGoChat;
