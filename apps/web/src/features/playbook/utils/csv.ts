import type { PlaybookImportRow } from '@/lib/api/endpoints/playbook';

// A small CSV reader: quoted fields, doubled quotes inside them, CRLF or LF.
function parseCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field || row.length) endRow();
  return rows.filter((r) => r.some((c) => c.trim()));
}

// The header names each import field is read from, case and spacing ignored.
const COLUMNS: Record<keyof PlaybookImportRow, string[]> = {
  client: ['client'],
  deliverable: ['deliverable', 'task', 'title'],
  price: ['price', 'price_£', 'value'],
  billing: ['billing', 'billable'],
  cadence: ['cadence', 'frequency'],
  quarterMonth: ['quarter_month'],
  estimateHours: ['estimate_hours', 'estimate', 'hours'],
};

// The rows of a playbook CSV, and the lines whose cells outnumber the header: an
// unquoted comma (£1,200) has shifted their fields, so they are left out.
export function readPlaybookCsv(text: string): { rows: PlaybookImportRow[]; shifted: string[] } {
  const [header, ...body] = parseCells(text);
  const keys = (header ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const index = (field: keyof PlaybookImportRow) =>
    keys.findIndex((k) => COLUMNS[field].includes(k));
  const at = Object.fromEntries(
    (Object.keys(COLUMNS) as (keyof PlaybookImportRow)[]).map((f) => [f, index(f)]),
  ) as Record<keyof PlaybookImportRow, number>;
  const rows: PlaybookImportRow[] = [];
  const shifted: string[] = [];
  for (const cells of body) {
    if (cells.length > keys.length) {
      shifted.push(cells.join(','));
      continue;
    }
    const get = (f: keyof PlaybookImportRow) => (at[f] >= 0 ? (cells[at[f]] ?? '').trim() : '');
    rows.push({
      client: get('client'),
      deliverable: get('deliverable'),
      price: get('price'),
      billing: get('billing'),
      cadence: get('cadence'),
      quarterMonth: get('quarterMonth'),
      estimateHours: get('estimateHours'),
    });
  }
  return { rows, shifted };
}
