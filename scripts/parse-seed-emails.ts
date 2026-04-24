/**
 * Parses Owen's PRIORITY + FINAL .eml files into CSV + XLSX under data/seeds/.
 * Run: npx tsx scripts/parse-seed-emails.ts [path-to-priority.eml] [path-to-final.eml]
 */
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

const DEFAULT_PRIORITY =
  'C:\\Users\\Devin\\Downloads\\PRIORITY_ Hardcoded Data — Universities + Schools + National Greek Orgs (Import First).eml';
const DEFAULT_FINAL =
  'C:\\Users\\Devin\\Downloads\\FINAL_ 4,500+ NEW Spaces to Hardcode — From 500-Person Simulation (Deduped).eml';

function decodeQuotedPrintable(input: string): string {
  let s = input.replace(/=\r?\n/g, '');
  s = s.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return s;
}

function extractPlainBody(raw: string): string {
  const m = raw.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\nContent-Transfer-Encoding:\s*quoted-printable\r?\n\r?\n([\s\S]*)$/im
  );
  if (!m) {
    const m2 = raw.match(/Content-Transfer-Encoding:\s*quoted-printable\r?\n\r?\n([\s\S]*)$/im);
    if (!m2) throw new Error('Could not find quoted-printable text body');
    return m2[1];
  }
  return m[1];
}

function csvEscape(cell: string): string {
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function rowToCsv(cells: string[]): string {
  return cells.map(csvEscape).join(',');
}

type SchoolRow = {
  name: string;
  short_name: string;
  location: string;
  domain: string;
  logo_url: string;
  source_subsection: string;
  conference: string;
  division: string;
  institution_type: string;
};

type NatOrgRow = {
  name: string;
  short_name: string;
  type: string;
  website_url: string;
  logo_url: string;
  source_section: string;
};

type RefSpaceRow = {
  raw_name: string;
  category: string;
  profile_weight: string;
  source: string;
};

function pipeRowToCells(line: string): string[] {
  if (!line.trim().startsWith('|')) return [];
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
}

function parseSchoolTables(text: string): SchoolRow[] {
  const lines = text.split(/\r?\n/);
  const rows: SchoolRow[] = [];
  let subsection = '';

  const flushCells = (cells: string[]) => {
    if (cells.length < 6) return;
    const [name, city, state, conference, division, instType] = cells;
    if (name === 'School Name' || name.includes('---')) return;
    if (!name || !city || !state) return;
    rows.push({
      name,
      short_name: '',
      location: `${city}, ${state}`,
      domain: '',
      logo_url: '',
      source_subsection: subsection,
      conference,
      division,
      institution_type: instType,
    });
  };

  let carryCells: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith('#### ')) {
      subsection = line
        .replace(/^####\s+/, '')
        .trim()
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-');
      carryCells = [];
      continue;
    }

    // Join quoted-printable soft line breaks (= at EOL) inside markdown tables.
    while (/\s*=\s*$/.test(line.trimEnd()) && i + 1 < lines.length) {
      line = line.replace(/\s*=\s*$/, '').trimEnd() + lines[++i].trimStart();
    }

    const trimmed = line.trim();
    if (!trimmed.includes('|')) continue;

    let effectiveLine = trimmed;
    if (!trimmed.startsWith('|') && carryCells.length > 0 && carryCells.length < 6) {
      effectiveLine = '| ' + trimmed;
    } else if (!trimmed.startsWith('|')) {
      continue;
    }

    const lineCells = pipeRowToCells(effectiveLine).map((c) => c.replace(/\s*=\s*$/g, '').trim());
    if (carryCells.length >= 4 && lineCells.length >= 4) {
      carryCells = [];
    }
    let merged = carryCells.length ? [...carryCells, ...lineCells] : [...lineCells];

    while (merged.length >= 6) {
      const rowCells = merged.slice(0, 6);
      merged = merged.slice(6);
      flushCells(rowCells);
    }
    carryCells = merged;
  }

  const seen = new Map<string, SchoolRow>();
  for (const r of rows) {
    const key = r.name.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

function stripOrgDescription(line: string): string {
  let s = line.replace(/^\s*\d+\.\s+/, '').trim();
  const splitDesc = /\s*(?:[—–]|-)\s+/;
  if (splitDesc.test(s)) s = s.split(splitDesc)[0].trim();
  s = s.replace(/\s*\*[^*]+\*\s*$/g, '').trim();
  if (/listed above|see #/i.test(s)) return '';
  return s.trim();
}

function parseNationalOrgsPriority(text: string): NatOrgRow[] {
  const lines = text.split(/\r?\n/);
  const rows: NatOrgRow[] = [];
  let section = '';
  let nphcMode: 'fraternity' | 'sorority' | null = null;
  let mgcMode: 'fraternity' | 'sorority' | null = null;

  const push = (name: string, type: string, src: string) => {
    const n = name.trim();
    if (!n || n.length < 2) return;
    rows.push({
      name: n,
      short_name: '',
      type,
      website_url: '',
      logo_url: '',
      source_section: src,
    });
  };

  const section2Start = lines.findIndex((l) => l.includes('## SECTION 2:'));
  const section3Start = lines.findIndex((l) => l.includes('## SECTION 3:'));
  if (section2Start < 0) return rows;

  for (let i = section2Start; i < (section3Start > 0 ? section3Start : lines.length); i++) {
    const line = lines[i];
    if (line.startsWith('### 2A')) {
      section = '2A_NIC';
      nphcMode = null;
      continue;
    }
    if (line.startsWith('### 2B')) {
      section = '2B_NPC';
      nphcMode = null;
      continue;
    }
    if (line.startsWith('### 2C')) {
      section = '2C_NPHC';
      nphcMode = null;
      continue;
    }
    if (line.includes('**Fraternities:**')) {
      nphcMode = 'fraternity';
      continue;
    }
    if (line.includes('**Sororities:**')) {
      nphcMode = 'sorority';
      continue;
    }
    if (line.startsWith('### 2D')) {
      section = '2D_MGC';
      nphcMode = null;
      mgcMode = null;
      continue;
    }
    if (line.startsWith('### 2E')) {
      section = '2E_professional';
      nphcMode = null;
      mgcMode = null;
      continue;
    }

    if (section === '2D_MGC' && line.includes('**Fraternities:**')) {
      mgcMode = 'fraternity';
      continue;
    }
    if (section === '2D_MGC' && line.includes('**Sororities:**')) {
      mgcMode = 'sorority';
      continue;
    }

    const num = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (num && section === '2A_NIC') {
      push(stripOrgDescription(line), 'nic_fraternity', section);
      continue;
    }
    if (num && section === '2B_NPC') {
      push(stripOrgDescription(line), 'npc_sorority', section);
      continue;
    }
    if (num && section === '2C_NPHC') {
      const t = nphcMode === 'sorority' ? 'nphc_sorority' : 'nphc_fraternity';
      push(stripOrgDescription(line), t, section);
      continue;
    }
    if (num && section === '2D_MGC') {
      const t = mgcMode === 'sorority' ? 'mgc_sorority' : 'mgc_fraternity';
      push(stripOrgDescription(line), t, section);
      continue;
    }
    if (num && section === '2E_professional') {
      push(stripOrgDescription(line), 'professional_service', section);
      continue;
    }
  }

  const s6Start = lines.findIndex((l) => l.includes('## SECTION 6:'));
  const s7Start = lines.findIndex((l) => l.includes('## SECTION 7:'));
  if (s6Start >= 0 && s7Start > s6Start) {
    let sub = '6_misc';
    let honorSection: boolean | null = null;
    for (let i = s6Start; i < s7Start; i++) {
      const line = lines[i];
      if (line.startsWith('### 6A')) {
        sub = '6A_university_professional';
        honorSection = false;
        continue;
      }
      if (line.startsWith('### 6B')) {
        sub = '6B_honor_society';
        honorSection = true;
        continue;
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        sub = line.replace(/\*\*/g, '').trim();
        continue;
      }
      const num = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (num) {
        const typ =
          honorSection === true
            ? 'honor_society'
            : honorSection === false
              ? 'professional_association'
              : 'professional_association';
        push(stripOrgDescription(line), typ, sub);
      }
    }
  }

  const seen = new Map<string, NatOrgRow>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

function parseSpaceTypeTaxonomy(text: string): { slug: string; label: string; description: string }[] {
  const s7 = text.indexOf('## SECTION 7:');
  if (s7 < 0) return [];
  const chunk = text.slice(s7, s7 + 8000);
  const out: { slug: string; label: string; description: string }[] = [];
  const rowRe = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(chunk)) !== null) {
    const label = m[2].trim().replace(/\s+/g, ' ');
    const desc = m[3].trim().replace(/\s+/g, ' ');
    if (label.includes('---') || label === 'Type Label') continue;
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    out.push({ slug, label, description: desc });
  }
  return out;
}

function parseFinalReferenceSpaces(text: string): RefSpaceRow[] {
  const lines = text.split(/\r?\n/);
  const out: RefSpaceRow[] = [];
  let category = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      category = line.replace(/^##\s+/, '').trim();
      continue;
    }
    const m = line.match(/^-\s+(.+?)\s*\((\d+)\)\s*$/);
    if (m) {
      out.push({
        raw_name: m[1].trim().replace(/^["']|["']$/g, ''),
        category,
        profile_weight: m[2],
        source: 'FINAL_500_person_simulation_deduped.eml',
      });
    }
  }

  const seen = new Map<string, RefSpaceRow>();
  for (const r of out) {
    const key = `${r.category}::${r.raw_name.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

async function main() {
  const priorityPath = process.argv[2] || DEFAULT_PRIORITY;
  const finalPath = process.argv[3] || DEFAULT_FINAL;
  const outDir = path.join(process.cwd(), 'data', 'seeds');

  if (!fs.existsSync(priorityPath)) {
    console.error('Missing PRIORITY file:', priorityPath);
    process.exit(1);
  }
  if (!fs.existsSync(finalPath)) {
    console.error('Missing FINAL file:', finalPath);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const priorityRaw = fs.readFileSync(priorityPath, 'utf8');
  const finalRaw = fs.readFileSync(finalPath, 'utf8');

  const priorityText = decodeQuotedPrintable(extractPlainBody(priorityRaw));
  const finalText = decodeQuotedPrintable(extractPlainBody(finalRaw));

  const schools = parseSchoolTables(priorityText);
  const natOrgs = parseNationalOrgsPriority(priorityText);
  const spaceTypes = parseSpaceTypeTaxonomy(priorityText);
  const refSpaces = parseFinalReferenceSpaces(finalText);

  const schoolsCsv = [
    rowToCsv([
      'name',
      'short_name',
      'location',
      'domain',
      'logo_url',
      'source_subsection',
      'source_conference',
      'source_division',
      'source_institution_type',
    ]),
    ...schools.map((r) =>
      rowToCsv([
        r.name,
        r.short_name,
        r.location,
        r.domain,
        r.logo_url,
        r.source_subsection,
        r.conference,
        r.division,
        r.institution_type,
      ])
    ),
  ].join('\n');

  const natCsv = [
    rowToCsv(['name', 'short_name', 'type', 'website_url', 'logo_url', 'source_section']),
    ...natOrgs.map((r) =>
      rowToCsv([r.name, r.short_name, r.type, r.website_url, r.logo_url, r.source_section])
    ),
  ].join('\n');

  const refCsv = [
    rowToCsv(['raw_name', 'category', 'profile_weight', 'source']),
    ...refSpaces.map((r) => rowToCsv([r.raw_name, r.category, r.profile_weight, r.source])),
  ].join('\n');

  const taxCsv = [
    rowToCsv(['slug', 'label', 'description']),
    ...spaceTypes.map((r) => rowToCsv([r.slug, r.label, r.description])),
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'schools_seed.csv'), schoolsCsv, 'utf8');
  fs.writeFileSync(path.join(outDir, 'national_organizations_seed.csv'), natCsv, 'utf8');
  fs.writeFileSync(path.join(outDir, 'reference_spaces_simulation_seed.csv'), refCsv, 'utf8');
  fs.writeFileSync(path.join(outDir, 'space_type_taxonomy_reference.csv'), taxCsv, 'utf8');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Trailblaize seed parser';
  wb.created = new Date();

  const sh1 = wb.addWorksheet('schools_seed', {});
  sh1.addRow(['name', 'short_name', 'location', 'domain', 'logo_url', 'source_subsection', 'source_conference', 'source_division', 'source_institution_type']);
  schools.forEach((r) =>
    sh1.addRow([
      r.name,
      r.short_name,
      r.location,
      r.domain,
      r.logo_url,
      r.source_subsection,
      r.conference,
      r.division,
      r.institution_type,
    ])
  );

  const sh2 = wb.addWorksheet('national_organizations_seed', {});
  sh2.addRow(['name', 'short_name', 'type', 'website_url', 'logo_url', 'source_section']);
  natOrgs.forEach((r) => sh2.addRow([r.name, r.short_name, r.type, r.website_url, r.logo_url, r.source_section]));

  const sh3 = wb.addWorksheet('reference_spaces', {});
  sh3.addRow(['raw_name', 'category', 'profile_weight', 'source']);
  refSpaces.forEach((r) => sh3.addRow([r.raw_name, r.category, r.profile_weight, r.source]));

  const sh4 = wb.addWorksheet('space_type_taxonomy', {});
  sh4.addRow(['slug', 'label', 'description']);
  spaceTypes.forEach((r) => sh4.addRow([r.slug, r.label, r.description]));

  await wb.xlsx.writeFile(path.join(outDir, 'data_seeds_bundle.xlsx'));

  console.log('Wrote:', path.join(outDir, 'schools_seed.csv'), `(${schools.length} rows)`);
  console.log('Wrote:', path.join(outDir, 'national_organizations_seed.csv'), `(${natOrgs.length} rows)`);
  console.log('Wrote:', path.join(outDir, 'reference_spaces_simulation_seed.csv'), `(${refSpaces.length} rows)`);
  console.log('Wrote:', path.join(outDir, 'space_type_taxonomy_reference.csv'), `(${spaceTypes.length} rows)`);
  console.log('Wrote:', path.join(outDir, 'data_seeds_bundle.xlsx'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
