import React, { useEffect, useState } from 'react';

/**
 * Validasi URL Cloudinary agar tidak merender gambar yang sudah
 * tidak ada di server (mencegah error 404 di konsol).
 * URL valid harus dari res.cloudinary.com dengan https.
 */
const isValidCloudinaryUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
};

const ImageWithFallback = ({ src, alt, className, style, fallback }) => {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [src]);

  // Jika src kosong, bukan URL valid, atau sudah error — langsung tampilkan fallback
  // tanpa mencoba merender <img> sama sekali (cegah 404 di konsol)
  const isCloudinary = src && src.includes('res.cloudinary.com');
  if (!src || hasLoadError || (isCloudinary && !isValidCloudinaryUrl(src))) {
    return fallback ?? null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setHasLoadError(true)}
    />
  );
};

export default ImageWithFallback;
