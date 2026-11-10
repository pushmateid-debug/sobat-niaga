const FIREBASE_DATABASE_URL = 'https://sobatniaga-default-rtdb.asia-southeast1.firebasedatabase.app';
const SITE_ORIGIN = 'https://sobat-niaga.vercel.app';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getSafeImageUrl = (value) => {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

const replaceMeta = (html, pattern) => html.replace(pattern, '');

module.exports = async (req, res) => {
  const productId = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(productId)) {
    return res.status(400).send('Tautan produk tidak valid.');
  }

  try {
    const [productResponse, pageResponse] = await Promise.all([
      fetch(`${FIREBASE_DATABASE_URL}/products/${encodeURIComponent(productId)}.json`, {
        signal: AbortSignal.timeout(8000)
      }),
      fetch(`${SITE_ORIGIN}/`, { signal: AbortSignal.timeout(8000) })
    ]);

    if (!productResponse.ok || !pageResponse.ok) {
      console.error('Gagal mengambil data produk atau template HTML untuk preview.');
      return res.status(502).send('Detail produk sementara tidak tersedia.');
    }

    const product = await productResponse.json();
    let html = await pageResponse.text();
    const title = product?.isActive === false
      ? 'Produk tidak tersedia | SobatNiaga'
      : `${product?.name || 'Produk SobatNiaga'} | SobatNiaga`;
    const description = String(product?.isActive === false
      ? 'Produk ini sudah tidak tersedia di SobatNiaga.'
      : product?.description || 'Lihat detail produk ini di SobatNiaga.')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    const image = getSafeImageUrl(product?.mediaUrl || product?.image);
    const productUrl = `${SITE_ORIGIN}/product/${encodeURIComponent(productId)}`;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
    html = replaceMeta(html, /<meta\s+name=["']description["'][^>]*>/gi, '');
    html = replaceMeta(html, /<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');
    html = replaceMeta(html, /<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '');
    const metadata = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}">`,
      '<meta property="og:type" content="product">',
      `<meta property="og:site_name" content="SobatNiaga">`,
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      `<meta property="og:url" content="${escapeHtml(productUrl)}">`,
      image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${escapeHtml(title)}">`,
      `<meta name="twitter:description" content="${escapeHtml(description)}">`,
      image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''
    ].filter(Boolean).join('\n    ');
    html = html.replace('</head>', `    ${metadata}\n  </head>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('X-Robots-Tag', 'index, follow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Gagal menyiapkan metadata preview produk:', error);
    return res.status(502).send('Detail produk sementara tidak tersedia.');
  }
};
