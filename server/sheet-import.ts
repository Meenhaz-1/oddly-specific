const REQUIRED_COLUMNS = [
  'topic',
  'label',
  'context',
  'prompt',
  'answer_short',
  'answer_explanation',
  'source_1_title',
  'source_1_publisher',
  'source_1_url',
] as const;

export interface SheetQuestion {
  rowNumber: string;
  topic: string;
  label: string;
  format: 'open_ended';
  context: string;
  prompt: string;
  answerShort: string;
  answerExplanation: string;
  sources: Array<{ id: string; title: string; publisher: string; url: string }>;
}

export function googleSheetCsvUrl(input: string): { canonicalUrl: string; csvUrl: string; title: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid Google Sheets URL.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
    throw new Error('Only https://docs.google.com Google Sheets URLs are accepted.');
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('The URL does not contain a Google Sheet ID.');
  const gid = url.searchParams.get('gid') || new URLSearchParams(url.hash.replace(/^#/, '')).get('gid') || '0';
  const sheetId = match[1]!;
  return {
    canonicalUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${encodeURIComponent(gid)}`,
    csvUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`,
    title: `Google Sheet ${sheetId.slice(0, 8)}`,
  };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted) throw new Error('The sheet contains an unterminated quoted cell.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseQuestionSheet(csv: string): SheetQuestion[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The sheet must contain a header and at least one question row.');
  const headers = rows[0]!.map((value) => value.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);
  const at = (row: string[], name: string) => (row[headers.indexOf(name)] || '').trim();
  const questions: SheetQuestion[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (row.every((cell) => !cell.trim())) return;
    const requiredValues = REQUIRED_COLUMNS.map((column) => at(row, column));
    if (requiredValues.some((value) => !value)) {
      errors.push(`row ${rowNumber}: one or more required cells are blank`);
      return;
    }
    const sources = [1, 2, 3].flatMap((number) => {
      const title = at(row, `source_${number}_title`);
      const publisher = at(row, `source_${number}_publisher`);
      const url = at(row, `source_${number}_url`);
      if (!title && !publisher && !url) return [];
      if (!title || !publisher || !validHttpUrl(url)) {
        errors.push(`row ${rowNumber}: source ${number} needs a title, publisher, and valid URL`);
        return [];
      }
      return [{ id: `sheet-${rowNumber}-s${number}`, title, publisher, url }];
    });
    if (!sources.length) return;
    questions.push({
      rowNumber: String(rowNumber),
      topic: at(row, 'topic'),
      label: at(row, 'label'),
      format: 'open_ended',
      context: at(row, 'context'),
      prompt: at(row, 'prompt'),
      answerShort: at(row, 'answer_short'),
      answerExplanation: at(row, 'answer_explanation'),
      sources,
    });
  });

  if (errors.length) throw new Error(`Sheet validation failed: ${errors.slice(0, 8).join('; ')}.`);
  if (!questions.length) throw new Error('The sheet did not contain any valid question rows.');
  if (questions.length > 500) throw new Error('Import at most 500 questions at a time.');
  return questions;
}

export const SHEET_TEMPLATE_COLUMNS = REQUIRED_COLUMNS.join(',');
