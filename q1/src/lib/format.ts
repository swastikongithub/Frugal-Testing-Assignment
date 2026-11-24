export const formatPrice = (price: number, decimals: number) =>
  price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const formatQuantity = (quantity: number) =>
  quantity.toLocaleString('en-US', { maximumFractionDigits: 8 });

export const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export const formatMs = (ms: number | null | undefined) => (ms == null ? '—' : `${ms.toFixed(1)} ms`);
