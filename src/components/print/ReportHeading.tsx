import { createContext, useContext } from "react";
import { format, parse } from "date-fns";

/** True inside a report frame, which prints its own heading (tables inside it do not repeat it). */
export const ReportHeadingContext = createContext(false);
export const useInReport = () => useContext(ReportHeadingContext);

const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const LONG = /\b(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\b/g;

/** "01 Sep 2026 to 30 Sep 2026" or "2026-09-01 to 2026-09-30" → "01-09-2026 - 30-09-2026". */
export function printPeriod(text: string) {
  return text
    .replace(ISO, "$3-$2-$1")
    .replace(LONG, (_, d: string, m: string, y: string) =>
      format(parse(`${d} ${m} ${y}`, "dd MMM yyyy", new Date()), "dd-MM-yyyy"),
    )
    .replace(/ to /g, " - ");
}

/** Splits "Sales by book 2026-09-01 to 2026-09-30" into a title and its period. */
export function splitTitle(text: string): { title: string; period?: string } {
  const m = /^(.*?)\s+((?:as at |as of )?\d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?)$/i.exec(text);
  return m ? { title: m[1]!, period: printPeriod(m[2]!) } : { title: text };
}

export const generatedOn = () => format(new Date(), "dd-MMM-yyyy HH:mm:ss");

/**
 * Heading of every printed report (Turnkey's filing format): "Generated on" at the top right,
 * then the title and period centred and underlined. Hidden on screen unless `screen` is set.
 */
export function ReportHeading({
  title,
  period,
  screen,
}: {
  title: string;
  period?: string;
  screen?: boolean;
}) {
  // "01 Jul 2026 to 30 Sep 2026 · approved invoices net of returns": the note is not underlined.
  const [range, ...notes] = (period ?? "").split(" · ");
  return (
    <div className={screen ? "mb-3" : "mb-3 hidden print:block"}>
      <p className="text-right text-[11px]">Generated on: {generatedOn()}</p>
      <h2 className="text-center text-[17px] font-bold underline">{title}</h2>
      {range && <p className="text-center text-[13px] font-bold underline">{printPeriod(range)}</p>}
      {notes.length > 0 && <p className="text-center text-[11px]">{notes.join(" · ")}</p>}
    </div>
  );
}
