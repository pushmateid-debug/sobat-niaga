const crypto = require('crypto');
const net = require('net');
const sharp = require('sharp');

const ADMIN_EMAIL = 'pushmate.id@gmail.com';
const ADMIN_FOLDERS = new Set([
  'sobatniaga/admin', 'sobatniaga/assets', 'sobatniaga/banners',
  'sobatniaga/login', 'sobatniaga/payouts',
]);
const USER_FOLDERS = new Set([
  'sobatniaga/drivers', 'sobatniaga/payment_proofs', 'sobatniaga/products',
  'sobatniaga/payments', 'sobatniaga/profiles', 'sobatniaga/reviews',
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function readMultipart(request) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers['content-type'] || '';
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!/^multipart\/form-data/i.test(contentType) || !boundary) {
      reject(Object.assign(new Error('Format upload tidak valid.'), { status: 400 }));
      return;
    }
    const marker = Buffer.from(`--${boundary[1] || boundary[2]}`);
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
        reject(Object.assign(new Error('Ukuran gambar maksimal 10 MB.'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const fields = {};
      let file = null;
      let cursor = body.indexOf(marker);
      while (cursor !== -1) {
        cursor += marker.length;
        if (body.subarray(cursor, cursor + 2).toString() === '--') break;
        if (body.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
        const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor);
        if (headerEnd < 0) break;
        const headers = body.subarray(cursor, headerEnd).toString('utf8');
        const disposition = headers.match(/content-disposition:\s*form-data;[^\r\n]*/i)?.[0] || '';
        const name = disposition.match(/\bname="([^"]+)"/i)?.[1];
        const filename = disposition.match(/\bfilename="([^"]*)"/i)?.[1];
        const dataStart = headerEnd + 4;
        const next = body.indexOf(marker, dataStart);
        if (next < 0) break;
        let dataEnd = next;
        if (body.subarray(dataEnd - 2, dataEnd).toString() === '\r\n') dataEnd -= 2;
        const value = body.subarray(dataStart, dataEnd);
        if (filename !== undefined) file = { bytes: value, filename, contentType: headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || '' };
        else if (name) fields[name] = value.toString('utf8');
        cursor = next;
      }
      if (!file || !fields.folder) {
        reject(Object.assign(new Error('Gambar atau folder upload tidak ditemukan.'), { status: 400 }));
        return;
      }
      if (!file.bytes.length || file.bytes.length > MAX_UPLOAD_BYTES) {
        reject(Object.assign(new Error('Gambar kosong atau melebihi batas 10 MB.'), { status: 413 }));
        return;
      }
      resolve({ file, folder: fields.folder });
    });
  });
}

function scanWithClamAv(bytes) {
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error('Pemindai keamanan gambar belum dikonfigurasi.'), { status: 503 });
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(8000, () => finish(Object.assign(new Error('Pemindaian keamanan gambar kehabisan waktu.'), { status: 503 })));
    socket.on('error', () => finish(Object.assign(new Error('Pemindai keamanan gambar tidak tersedia.'), { status: 503 })));
    socket.on('data', (data) => {
      response += data.toString('utf8');
      if (!response.includes('\0')) return;
      const result = response.replace(/\0/g, '').trim();
      if (result.endsWith('OK')) finish();
      else if (response.includes('FOUND')) finish(Object.assign(new Error('Gambar ditolak karena terdeteksi sebagai ancaman.'), { status: 400 }));
      else finish(Object.assign(new Error('Hasil pemindaian gambar tidak dapat dipastikan.'), { status: 503 }));
    });
    socket.on('connect', () => {
      socket.write('INSTREAM\0');
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const part = bytes.subarray(offset, Math.min(offset + 64 * 1024, bytes.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

module.exports = async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metode tidak diizinkan.' });
  }
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!cloudName || !apiKey || !apiSecret || !firebaseApiKey) {
      return response.status(503).json({ error: 'Konfigurasi upload server belum lengkap.' });
    }
    const idToken = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return response.status(401).json({ error: 'Sesi login tidak ditemukan. Silakan login kembali.' });
    const identityResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    if (!identityResponse.ok) return response.status(401).json({ error: 'Sesi login tidak valid. Silakan login kembali.' });
    const user = (await identityResponse.json()).users?.[0];
    if (!user?.email) return response.status(401).json({ error: 'Sesi login tidak valid. Silakan login kembali.' });

    const { file, folder } = await readMultipart(request);
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    const allowed = isAdmin ? ADMIN_FOLDERS.has(folder) || USER_FOLDERS.has(folder) : USER_FOLDERS.has(folder);
    if (!allowed) return response.status(403).json({ error: 'Akses upload tidak diizinkan.' });

    // Scan the actual bytes, then decode/re-encode to strip metadata and ensure
    // the stored object is a valid WebP regardless of its supplied extension.
    await scanWithClamAv(file.bytes);
    let webp;
    try {
      const image = sharp(file.bytes, { limitInputPixels: 40_000_000 });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'heif'].includes(metadata.format)) {
        return response.status(400).json({ error: 'Format gambar tidak didukung.' });
      }
      webp = await image.rotate().webp({ quality: 82, effort: 5 }).toBuffer();
    } catch {
      return response.status(400).json({ error: 'File yang diunggah bukan gambar yang valid.' });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = crypto.randomUUID();
    const signed = { folder, public_id: publicId, timestamp };
    const signatureBase = Object.keys(signed).sort().map((key) => `${key}=${signed[key]}`).join('&') + apiSecret;
    const signature = crypto.createHash('sha1').update(signatureBase).digest('hex');
    const form = new FormData();
    form.append('file', new Blob([webp], { type: 'image/webp' }), `${publicId}.webp`);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);
    form.append('public_id', publicId);
    const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: 'POST', body: form });
    const uploaded = await cloudResponse.json().catch(() => ({}));
    if (!cloudResponse.ok || !uploaded.secure_url) {
      console.error('Cloudinary image upload failed:', uploaded.error?.message || cloudResponse.status);
      return response.status(502).json({ error: 'Gagal menyimpan gambar yang telah diproses.' });
    }
    return response.status(200).json({ secure_url: uploaded.secure_url, format: 'webp' });
  } catch (error) {
    if (!error.status) console.error('Image upload failed:', error);
    return response.status(error.status || 500).json({ error: error.status ? error.message : 'Gambar gagal diproses.' });
  }
};

module.exports.config = { api: { bodyParser: false } };
