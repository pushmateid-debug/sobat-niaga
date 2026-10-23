const FALLBACK_FAVICON = '/favicon.png';
const FIREBASE_DATABASE_URL = 'https://sobatniaga-default-rtdb.asia-southeast1.firebasedatabase.app';

const sendFallback = (response) => {
  response.statusCode = 302;
  response.setHeader('Location', FALLBACK_FAVICON);
  response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return response.end();
};

module.exports = async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).end();
  }

  try {
    const result = await fetch(`${FIREBASE_DATABASE_URL}/admin/banners/favicon.json`);
    if (!result.ok) {
      console.error('Favicon lookup failed with Firebase status:', result.status);
      return sendFallback(response);
    }

    const data = await result.json();
    const faviconValue = typeof data === 'object' && data !== null ? data.url : data;
    if (typeof faviconValue !== 'string') return sendFallback(response);

    const faviconUrl = new URL(faviconValue);
    const cloudinaryPath = faviconUrl.pathname.match(/^\/([^/]+)\/image\/upload\/(.+)$/);
    if (faviconUrl.protocol !== 'https:' || faviconUrl.hostname !== 'res.cloudinary.com' || !cloudinaryPath) {
      return sendFallback(response);
    }

    const [, cloudName, publicId] = cloudinaryPath;
    const assetPath = publicId.replace(/^(q_auto,f_auto|c_fill,w_256,h_256,r_max,f_png)\//, '');
    faviconUrl.pathname = `/${cloudName}/image/upload/c_fill,w_256,h_256,r_max,f_png/${assetPath}`;
    faviconUrl.search = '';
    faviconUrl.hash = '';

    response.statusCode = 302;
    response.setHeader('Location', faviconUrl.toString());
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return response.end();
  } catch (error) {
    console.error('Favicon lookup failed:', error.message);
    return sendFallback(response);
  }
};
