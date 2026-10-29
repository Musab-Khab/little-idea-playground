import { format, parseISO } from "date-fns";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const money2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rs 1,234 or Rs 1,234.5 — negatives shown in brackets as accountants expect. */
/** Normalises null/NaN/-0 and sub-paisa noise to a clean number. */
const clean = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && Math.abs(v) >= 0.005 ? v : 0;
};

export const formatPKR = (n: number | null | undefined) => {
  const v = clean(n);
  return v < 0 ? `(Rs ${money.format(-v)})` : `Rs ${money.format(v)}`;
};

/** Plain amount with 2 decimals for ledgers and statements; blank for zero when `blankZero`. */
export const formatAmount = (n: number | null | undefined, blankZero = false) => {
  const v = clean(n);
  if (blankZero && v === 0) return "";
  return v < 0 ? `(${money2.format(-v)})` : money2.format(v);
};

export const formatQty = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("en-US");

export const formatCompact = (n: number) => {
  if (Math.abs(n) >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

export const formatDate = (d: string | null | undefined) => {
  if (!d) return "";
  try {
    return format(parseISO(d), "dd MMM yyyy");
  } catch {
    return d;
  }
};

export const formatDateTime = (d: string | null | undefined) => {
  if (!d) return "";
  try {
    return format(parseISO(d), "dd MMM yyyy, HH:mm");
  } catch {
    return d;
  }
};
