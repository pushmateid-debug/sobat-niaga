import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Package, ShoppingBag, Store, Users, Sparkles, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

const demoProducts = [
  { name: 'Sepatu Sneaker Demo', category: 'Fashion', price: 'Rp249.000', stock: 18, color: 'bg-sky-100 text-sky-700' },
  { name: 'Tas Kerja Demo', category: 'Fashion', price: 'Rp189.000', stock: 12, color: 'bg-violet-100 text-violet-700' },
  { name: 'Jaket Premium Demo', category: 'Fashion', price: 'Rp325.000', stock: 9, color: 'bg-amber-100 text-amber-700' }
];

const features = [
  { icon: Store, title: 'Kelola Toko', text: 'Atur profil toko, produk, stok, serta informasi penjualan dari satu dashboard.' },
  { icon: ShoppingBag, title: 'Jualan Digital', text: 'Tampilkan katalog, terima pesanan, dan bantu pembeli menemukan produk.' },
  { icon: Sparkles, title: 'Niaga AI', text: 'Gunakan bantuan AI untuk rekomendasi produk, informasi toko, dan dukungan pelanggan.' },
  { icon: ShieldCheck, title: 'Transaksi Aman', text: 'Alur transaksi, chat, pengiriman, dan status pesanan dirancang untuk penggunaan yang terkontrol.' }
];

const PublicPreview = () => {
  const location = useLocation();
  const isDashboard = location.pathname === '/demo/dashboard';
  const isFeatures = location.pathname === '/fitur';
  const isAbout = location.pathname === '/tentang';

  const pageTitle = isDashboard ? 'Dashboard Demo' : isFeatures ? 'Fitur SobatNiaga' : isAbout ? 'Tentang SobatNiaga' : 'Demo Mode';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-black tracking-tight text-sky-600">SobatNiaga</Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Navigasi publik">
            <Link to="/demo" className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Demo</Link>
            <Link to="/demo/dashboard" className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Dashboard</Link>
            <Link to="/fitur" className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Fitur</Link>
            <Link to="/tentang" className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Tentang</Link>
          </nav>
          <Link to="/" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">Buka Aplikasi</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <section className="mb-10 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-6 md:p-10">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-widest text-sky-700 shadow-sm">{pageTitle}</span>
            <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">
              {isDashboard ? 'Lihat contoh dashboard SobatNiaga tanpa login.' : isFeatures ? 'Semua kebutuhan usaha digital dalam satu platform.' : isAbout ? 'Membantu UMKM tumbuh dengan lebih mudah dan terhubung.' : 'Kenali SobatNiaga sebelum masuk ke akun kamu.'}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              Halaman ini menggunakan data demo yang sepenuhnya palsu dan terpisah dari akun, produk, pesanan, serta transaksi pengguna nyata.
            </p>
          </div>
        </section>

        {isDashboard ? (
          <section aria-label="Contoh dashboard demo">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Ringkasan Demo Toko</h2>
                <p className="mt-1 text-sm text-slate-500">Contoh tampilan saja — tidak terhubung ke data asli.</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">DEMO</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric icon={Package} label="Produk Demo" value="24" />
              <Metric icon={ShoppingBag} label="Pesanan Demo" value="8" />
              <Metric icon={BarChart3} label="Penjualan Demo" value="Rp4,8 jt" />
              <Metric icon={Users} label="Pengunjung Demo" value="1.240" />
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-black">Performa Penjualan Demo</h3>
                <div className="mt-6 flex h-44 items-end gap-3 rounded-xl bg-slate-50 px-4 pb-4">
                  {[42, 58, 35, 72, 64, 88, 76].map((height, index) => (
                    <div key={index} className="flex flex-1 flex-col items-center justify-end gap-2">
                      <div className="w-full rounded-t-lg bg-sky-500" style={{ height: `${height}%` }} />
                      <span className="text-[10px] font-bold text-slate-400">H{index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-black">Produk Demo Terbaru</h3>
                <div className="mt-4 space-y-3">
                  {demoProducts.map((product) => (
                    <div key={product.name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${product.color}`}><Package size={20} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{product.name}</p>
                        <p className="text-xs text-slate-500">Stok {product.stock}</p>
                      </div>
                      <p className="text-sm font-black text-sky-600">{product.price}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2" aria-label="Fitur utama">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Icon size={22} /></div>
                  <h2 className="mt-4 text-lg font-black">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </article>
              ))}
            </section>
            {isAbout && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black">Tentang platform</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">SobatNiaga adalah platform bisnis digital untuk UMKM: toko, katalog produk, percakapan, transaksi, dan layanan digital dapat dikelola dalam satu pengalaman aplikasi.</p>
              </section>
            )}
          </>
        )}

        <section className="mt-10 flex flex-col items-start justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:p-8">
          <div>
            <h2 className="text-xl font-black">Ingin melihat alur aplikasi sesungguhnya?</h2>
            <p className="mt-2 text-sm text-slate-300">Masuk dengan akun Google untuk mengakses data dan layanan sesuai izin akun kamu.</p>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-black hover:bg-sky-400">Masuk ke aplikasi <ArrowRight size={18} /></Link>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 size={14} className="text-emerald-500" /> Data pada seluruh halaman demo bersifat publik dan tidak menyimpan informasi pengguna.
        </div>
      </main>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Icon size={20} /></div>
    <p className="mt-4 text-xs font-bold text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black">{value}</p>
  </div>
);

export default PublicPreview;
