const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

// Whole pounds from pence, e.g. 90000 -> "£900".
export const formatPence = (pence: number) => GBP.format(Math.round(pence / 100));
