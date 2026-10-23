import React, { useEffect, useState } from 'react';

const ImageWithFallback = ({ src, alt, className, style, fallback }) => {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [src]);

  if (!src || hasLoadError) return fallback;

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
