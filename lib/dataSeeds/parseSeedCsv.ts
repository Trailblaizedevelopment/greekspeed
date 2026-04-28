/**
 * Minimal RFC4180-style CSV parser for seed files (quoted fields, doubled quotes).
 */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = '';
  };

  const pushRow = () => {
    if (row.length === 0) return;
    if (row.every((c) => c === '')) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const c = content[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushCell();
    } else if (c === '\n') {
      pushCell();
      pushRow();
    } else if (c === '\r') {
      /* ignore CR; \n ends row */
    } else {
      cur += c;
    }
  }
  pushCell();
  pushRow();

  return rows;
}

export function csvRowsToObjects(headers: string[], dataRows: string[][]): Record<string, string>[] {
  return dataRows.map((cells) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => {
      o[h] = (cells[idx] ?? '').replace(/\r$/, '').trim();
    });
    return o;
  });
}
