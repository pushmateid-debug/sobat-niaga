const idNumberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0
});

/** Format integer-like values with Indonesian grouping, preserving large digit strings exactly. */
export const formatIdNumber = (value) => {
  if (typeof value === 'bigint') return idNumberFormatter.format(value);

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return '0';
    if (/^[+-]?\d+$/.test(normalized)) {
      try {
        return idNumberFormatter.format(BigInt(normalized));
      } catch {
        return normalized;
      }
    }
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? idNumberFormatter.format(numericValue) : '0';
};

export const formatRupiah = (value) => `Rp ${formatIdNumber(value)}`;

export const addIntegerValues = (left, right) => {
  const isIntegerLike = (value) => (
    typeof value === 'bigint' ||
    (typeof value === 'number' && Number.isSafeInteger(value)) ||
    (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim()))
  );

  if (isIntegerLike(left) && isIntegerLike(right)) {
    return (BigInt(left || 0) + BigInt(right || 0)).toString();
  }
  return (Number(left) || 0) + (Number(right) || 0);
};
