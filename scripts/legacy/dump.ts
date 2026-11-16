/**
 * Reads a phpMyAdmin/mysqldump file and returns each table's rows as objects.
 * Handles multi-row INSERTs, quoted strings with backslash or doubled-quote escapes, and NULL.
 */
import { readFileSync } from "node:fs";

export type Value = string | number | null;
export type Row = Record<string, Value>;

const ESC: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0", Z: "\x1a" };

export function readDump(path: string): Map<string, Row[]> {
  const text = readFileSync(path, "latin1");
  const tables = new Map<string, Row[]>();
  const head = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES\s*/g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(text))) {
    const table = m[1]!;
    const cols = m[2]!.split(",").map((c) => c.trim().replace(/`/g, ""));
    const rows = tables.get(table) ?? [];
    let i = head.lastIndex;
    // Parse "(v, v, ...), (...);"
    for (;;) {
      while (/\s/.test(text[i]!)) i++;
      if (text[i] !== "(") throw new Error(`${table}: expected ( at ${i}`);
      i++;
      const vals: Value[] = [];
      for (;;) {
        while (text[i] === " ") i++;
        if (text[i] === "'") {
          let s = "";
          i++;
          for (;;) {
            const c = text[i]!;
            if (c === "\\") {
              const n = text[i + 1]!;
              s += ESC[n] ?? n;
              i += 2;
            } else if (c === "'") {
              if (text[i + 1] === "'") {
                s += "'";
                i += 2;
              } else {
                i++;
                break;
              }
            } else {
              s += c;
              i++;
            }
          }
          vals.push(s);
        } else {
          let j = i;
          while (text[j] !== "," && text[j] !== ")") j++;
          const raw = text.slice(i, j).trim();
          vals.push(raw === "NULL" ? null : Number(raw));
          i = j;
        }
        while (text[i] === " ") i++;
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === ")") {
          i++;
          break;
        }
        throw new Error(`${table}: unexpected "${text[i]}" at ${i}`);
      }
      if (vals.length !== cols.length) throw new Error(`${table}: column count mismatch at ${i}`);
      rows.push(Object.fromEntries(cols.map((c, k) => [c, vals[k]!])));
      while (/\s/.test(text[i]!)) i++;
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === ";") break;
      throw new Error(`${table}: expected , or ; at ${i}`);
    }
    head.lastIndex = i;
    tables.set(table, rows);
  }
  return tables;
}
