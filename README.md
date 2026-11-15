🛒 SobatNiaga - E-Commerce Organisasi

Selamat datang di project SobatNiaga! Platform ini dikembangkan untuk divisi KWU.

📁 Struktur Utama
- `components/`: UI kit (Navbar, Footer, Card).
- `pages/`: Halaman utama & kategori (Pulsa, Makan, Jasa, Gaya).
- `config/`: Koneksi Firebase & Cloudinary.

🛠️ Tech Stack
- Frontend: React.js
- Database: Firebase Firestore
- Images: Cloudinary for existing uploads; Firebase Storage for private NiagaGo chat media.

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

### Chat dan tarif NiagaGo

Jarak perjalanan dan estimasi waktu dihitung dari rute jalan melalui endpoint OSRM publik; koordinat pickup dan tujuan dikirim ke endpoint tersebut. Tarif membulatkan jarak ke kilometer penuh berikutnya, lalu memakai tabel NiagaGo sampai 30 km. Rute yang lebih jauh tidak diberi tarif otomatis dan tetap memerlukan penawaran driver yang disetujui penumpang.

Ruang chat memakai satu path Realtime Database per ID order Firestore. Cloud Functions memvalidasi peserta order dan mengatur status kirim; Realtime Database Rules membatasi pesan ke peserta tersebut. Gambar disimpan privat di Firebase Storage dan hanya disajikan melalui URL bertanda tangan singkat setelah validasi peserta. Chat aktif setelah penumpang menyetujui penawaran driver; chat order selesai/batal hanya dapat dibaca.

Setelah frontend dan Functions siap, deploy backend serta rules dengan:

```powershell
npm install --prefix functions
firebase deploy --only functions,database,storage --project sobatniaga
```

Pastikan service account Cloud Functions mempunyai izin menandatangani URL Storage (`iam.serviceAccounts.signBlob`). Sebelum rilis, uji alur dengan dua akun Firebase berbeda, termasuk pemblokiran chat akun ketiga, chat read-only setelah order ditutup, upload gambar, dan lokasi GPS.

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
