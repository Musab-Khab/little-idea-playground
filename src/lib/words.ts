const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const h = Math.floor(n / 100),
    r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r)
    parts.push(
      r < 20 ? ONES[r]! : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`,
    );
  return parts.join(" ");
}

/** Amount in words using the Pakistani system (lakh, crore): "Rupees One Lakh Twenty Thousand Only". */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paisa === 0) return "Rupees Zero Only";
  const units: [number, string][] = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
  ];
  let rest = rupees;
  const parts: string[] = [];
  for (const [size, name] of units) {
    const q = Math.floor(rest / size);
    if (q) {
      parts.push(
        `${q >= 1000 ? amountInWords(q).replace(/^Rupees |\sOnly$/g, "") : belowThousand(q)} ${name}`,
      );
      rest %= size;
    }
  }
  if (rest) parts.push(belowThousand(rest));
  return `Rupees ${parts.join(" ") || "Zero"}${paisa ? ` and ${belowThousand(paisa)} Paisa` : ""} Only`;
}
