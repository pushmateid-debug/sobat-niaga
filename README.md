🛒 SobatNiaga - E-Commerce Organisasi

Selamat datang di project SobatNiaga! Platform ini dikembangkan untuk divisi KWU.

📁 Struktur Utama
- `components/`: UI kit (Navbar, Footer, Card).
- `pages/`: Halaman utama & kategori (Pulsa, Makan, Jasa, Gaya).
- `config/`: Koneksi Firebase & Cloudinary.

🛠️ Tech Stack
- Frontend: React.js
- Database: Firebase Firestore
- Storage: Cloudinary (API)

💰 Monetisasi
Setiap transaksi akan dikenakan `REACT_APP_SERVICE_FEE` untuk maintenance sistem.

### Konfigurasi upload Cloudinary di Vercel

Endpoint `/api/cloudinary-signature` menandatangani upload di server setelah memverifikasi Firebase ID token. Tambahkan variabel berikut pada **Project Settings → Environment Variables** di Vercel untuk setiap environment yang digunakan, lalu deploy ulang:

- `CLOUDINARY_CLOUD_NAME` — Cloud name dari Cloudinary.
- `CLOUDINARY_API_KEY` — API key dari Cloudinary.
- `CLOUDINARY_API_SECRET` — API secret Cloudinary; simpan hanya sebagai environment variable server, jangan gunakan awalan `REACT_APP_` atau `VITE_`.
- `FIREBASE_WEB_API_KEY` — Web API key dari Firebase Project Settings → General.

API secret Cloudinary lama pernah tertanam di source code frontend. Rotasi API secret tersebut di dashboard Cloudinary sebelum mengisi nilai baru di Vercel. Jangan kirim secret melalui chat atau log.

Untuk menguji endpoint lokal, jalankan aplikasi melalui `vercel dev` dengan environment variable di atas; `npm start` saja tidak menjalankan fungsi `/api`.

### Penyelesaian pesanan dan pencairan saldo seller

Konfirmasi pesanan, pencairan ongkir driver Niaga Food, dan perubahan status oleh seller diproses melalui Firebase Cloud Functions tepercaya. Jangan melonggarkan Realtime Database Rules untuk mengizinkan browser mengubah saldo seller atau menandai pencairan. Deploy Functions sebelum frontend, lalu deploy rules setelah frontend terbaru aktif.

Setelah perubahan ini digabung, deploy dengan urutan berikut agar frontend terbaru sudah memakai Cloud Functions sebelum rules membatasi penulisan langsung dari browser:

```powershell
npm install --prefix functions
firebase deploy --only functions --project sobatniaga
npm run build
```

Setelah frontend hasil build di-deploy ke hosting, deploy Realtime Database Rules:

```powershell
firebase deploy --only database --project sobatniaga
```

Cloud Functions deployment memerlukan akses deploy Firebase dan project yang mendukung Cloud Functions (paket Blaze dapat diperlukan). Riwayat yang sudah berstatus selesai sebelum `settlementStatus` tersedia perlu diverifikasi Admin; pencairan lama tidak bisa dipastikan otomatis dengan aman. Pesanan yang sedang berjalan tetap bisa diproses: endpoint seller memverifikasi penjual lewat produk, sedangkan checkout baru menyimpan daftar seller untuk validasi tambahan.
