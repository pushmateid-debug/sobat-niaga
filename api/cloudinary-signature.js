const crypto = require('crypto');

const ADMIN_EMAIL = 'pushmate.id@gmail.com';
const ADMIN_FOLDERS = new Set([
  'sobatniaga/admin',
  'sobatniaga/assets',
  'sobatniaga/banners',
  'sobatniaga/payouts',
]);
const USER_FOLDERS = new Set([
  'sobatniaga/drivers',
  'sobatniaga/payment_proofs',
  'sobatniaga/products',
  'sobatniaga/payments',
  'sobatniaga/profiles',
  'sobatniaga/reviews',
]);

module.exports = async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metode tidak diizinkan.' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!cloudName || !apiKey || !apiSecret || !firebaseApiKey) {
    return response.status(503).json({ error: 'Konfigurasi upload server belum lengkap.' });
  }

  const authorization = request.headers.authorization || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) {
    return response.status(401).json({ error: 'Sesi login tidak ditemukan. Silakan login kembali.' });
  }

  let user;
  try {
    const verificationResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    const verificationData = await verificationResponse.json();
    if (!verificationResponse.ok) {
      return response.status(401).json({ error: 'Sesi login tidak valid. Silakan login kembali.' });
    }
    user = verificationData.users?.[0];
  } catch {
    return response.status(503).json({ error: 'Tidak dapat memverifikasi sesi login saat ini.' });
  }

  if (!user?.email) {
    return response.status(401).json({ error: 'Sesi login tidak valid. Silakan login kembali.' });
  }

  const { folder, resourceType } = request.body || {};
  const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
  const isAllowedFolder = isAdmin
    ? ADMIN_FOLDERS.has(folder) || USER_FOLDERS.has(folder)
    : USER_FOLDERS.has(folder);
  const allowedResourceType = resourceType === 'image'
    || (resourceType === 'video' && ['sobatniaga/products', 'sobatniaga/reviews'].includes(folder));

  if (!isAllowedFolder || !allowedResourceType) {
    return response.status(403).json({ error: 'Akses upload tidak diizinkan.' });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signatureBase).digest('hex');

  return response.status(200).json({ cloudName, apiKey, folder, timestamp, signature });
};
