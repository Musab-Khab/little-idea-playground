import { format, parseISO } from "date-fns";

export const formatPKR = (n: number) =>
  `Rs ${Math.round(n).toLocaleString("en-US")}`;

export const formatCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

export const formatDate = (d: string) => format(parseISO(d), "dd MMM yyyy");
