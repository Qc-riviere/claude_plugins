export interface MdTable {
  header: string[];
  rows: string[][];
}

// Parse all GitHub-style markdown tables in a document. A table = consecutive
// lines starting with "|", where the 2nd line is a separator (---). Returns one
// MdTable per table with header cells and data rows (separator excluded).
export function parseMarkdownTables(md: string): MdTable[] {
  const tables: MdTable[] = [];
  let block: string[][] = [];

  const flush = () => {
    if (
      block.length >= 2 &&
      block[1].length > 0 &&
      block[1].every((c) => /^:?-+:?$/.test(c))
    ) {
      tables.push({ header: block[0], rows: block.slice(2) });
    }
    block = [];
  };

  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("|")) {
      block.push(line.split("|").slice(1, -1).map((c) => c.trim()));
    } else {
      flush();
    }
  }
  flush();
  return tables;
}

// Strip markdown decoration + status emoji for display titles.
export function cleanCell(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/[✅❌⏳⏸⚠🔄⬜]/g, "")
    .replace(/️/g, "") // variation selector
    .replace(/\s+/g, " ")
    .trim();
}
