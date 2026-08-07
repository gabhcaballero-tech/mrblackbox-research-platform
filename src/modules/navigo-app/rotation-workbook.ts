import { inflateRawSync } from "node:zlib";
import { normalizeNavigoFolio, normalizeNavigoRotationCode, type NavigoRotationImportRowInput } from "./service";

const CLT_WORKBOOK_SHEET_NAME = "CLT";
const HUT_WORKBOOK_SHEET_NAME = "HUT";
const DEFAULT_FOLIO_PREFIX = "NAV";

type WorkbookCellMap = Map<string, string>;

export type NavigoTriangularRotationInput = {
  triangular1Pr1: string;
  triangular1Pr2: string;
  triangular1Pr3: string;
  triangular1Verify: string;
  triangular2Pr1: string;
  triangular2Pr2: string;
  triangular2Pr3: string;
  triangular2Verify: string;
};

export type NavigoRotationWorkbookRowInput = NavigoRotationImportRowInput & NavigoTriangularRotationInput;

export type NavigoHutRotationWorkbookRowInput = {
  folio: string;
  hutEva1: string;
  hutEva2: string;
};

export type NavigoRotationWorkbookParseResult =
  | {
      cltRows: NavigoRotationWorkbookRowInput[];
      hutRows: NavigoHutRotationWorkbookRowInput[];
      ok: true;
      rows: NavigoRotationWorkbookRowInput[];
    }
  | {
      message: string;
      ok: false;
    };

type ZipEntry = {
  data: Buffer;
  name: string;
};

export function parseNavigoRotationWorkbook({
  bytes,
  filename
}: {
  bytes: ArrayBuffer | Uint8Array;
  filename: string;
}): NavigoRotationWorkbookParseResult {
  if (!filename.trim().toLowerCase().endsWith(".xlsx")) {
    return {
      message: "Selecciona el archivo ROTACIONES NAVIGO.xlsx en formato .xlsx.",
      ok: false
    };
  }

  let files: Map<string, Buffer>;
  try {
    files = readXlsxZip(bytes);
  } catch {
    return {
      message: "No fue posible leer el archivo XLSX. Confirma que no este danado.",
      ok: false
    };
  }

  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "");
  const sheetPath = resolveWorkbookSheetPath(files, CLT_WORKBOOK_SHEET_NAME);
  if (!sheetPath) {
    return {
      message: `El archivo debe incluir la hoja ${CLT_WORKBOOK_SHEET_NAME}.`,
      ok: false
    };
  }

  const sheetXml = files.get(sheetPath)?.toString("utf8");
  if (!sheetXml) {
    return {
      message: `No fue posible leer la hoja ${CLT_WORKBOOK_SHEET_NAME}.`,
      ok: false
    };
  }

  const cells = parseWorksheetCells(sheetXml, sharedStrings);
  if (!hasExpectedWorkbookHeaders(cells)) {
    return {
      message: "La hoja CLT debe incluir FOLIO, PR1-PR6, VERI_1, VERI_2, EVA1 y EVA2.",
      ok: false
    };
  }

  const rows: NavigoRotationWorkbookRowInput[] = [];
  const lastRow = findLastRow(cells);
  for (let rowNumber = 3; rowNumber <= lastRow; rowNumber += 1) {
    const rawFolio = cell(cells, `A${rowNumber}`);
    const rawValues = [
      rawFolio,
      cell(cells, `B${rowNumber}`),
      cell(cells, `C${rowNumber}`),
      cell(cells, `D${rowNumber}`),
      cell(cells, `E${rowNumber}`),
      cell(cells, `F${rowNumber}`),
      cell(cells, `G${rowNumber}`),
      cell(cells, `H${rowNumber}`),
      cell(cells, `I${rowNumber}`),
      cell(cells, `J${rowNumber}`),
      cell(cells, `K${rowNumber}`)
    ];

    if (rawValues.every((value) => value.length === 0)) {
      continue;
    }

    rows.push({
      folio: normalizeWorkbookFolio(rawFolio),
      primeraFragancia: normalizeNavigoRotationCode(cell(cells, `J${rowNumber}`)),
      segundaFragancia: normalizeNavigoRotationCode(cell(cells, `K${rowNumber}`)),
      triangular1Pr1: normalizeNavigoRotationCode(cell(cells, `B${rowNumber}`)),
      triangular1Pr2: normalizeNavigoRotationCode(cell(cells, `C${rowNumber}`)),
      triangular1Pr3: normalizeNavigoRotationCode(cell(cells, `D${rowNumber}`)),
      triangular1Verify: normalizeNavigoRotationCode(cell(cells, `E${rowNumber}`)),
      triangular2Pr1: normalizeNavigoRotationCode(cell(cells, `F${rowNumber}`)),
      triangular2Pr2: normalizeNavigoRotationCode(cell(cells, `G${rowNumber}`)),
      triangular2Pr3: normalizeNavigoRotationCode(cell(cells, `H${rowNumber}`)),
      triangular2Verify: normalizeNavigoRotationCode(cell(cells, `I${rowNumber}`))
    });
  }

  if (rows.length === 0) {
    return {
      message: "La hoja CLT no contiene filas de rotacion.",
      ok: false
    };
  }

  const hutRowsResult = parseHutWorkbookRows(files, sharedStrings);
  if (!hutRowsResult.ok) {
    return hutRowsResult;
  }

  return { cltRows: rows, hutRows: hutRowsResult.rows, ok: true, rows };
}

function parseHutWorkbookRows(
  files: Map<string, Buffer>,
  sharedStrings: string[]
): { ok: true; rows: NavigoHutRotationWorkbookRowInput[] } | { message: string; ok: false } {
  const sheetPath = resolveWorkbookSheetPath(files, HUT_WORKBOOK_SHEET_NAME);
  if (!sheetPath) {
    return { ok: true, rows: [] };
  }

  const sheetXml = files.get(sheetPath)?.toString("utf8");
  if (!sheetXml) {
    return {
      message: `No fue posible leer la hoja ${HUT_WORKBOOK_SHEET_NAME}.`,
      ok: false
    };
  }

  const cells = parseWorksheetCells(sheetXml, sharedStrings);
  const header = findWorkbookHeaderRow(cells, ["FOLIO", "EVA1", "EVA2"]);
  if (!header) {
    return {
      message: "La hoja HUT debe incluir FOLIO, EVA1 y EVA2.",
      ok: false
    };
  }

  const rows: NavigoHutRotationWorkbookRowInput[] = [];
  const lastRow = findLastRow(cells);
  for (let rowNumber = header.row + 1; rowNumber <= lastRow; rowNumber += 1) {
    const rawFolio = cell(cells, `${header.columns.FOLIO}${rowNumber}`);
    const rawEva1 = cell(cells, `${header.columns.EVA1}${rowNumber}`);
    const rawEva2 = cell(cells, `${header.columns.EVA2}${rowNumber}`);

    if ([rawFolio, rawEva1, rawEva2].every((value) => value.length === 0)) {
      continue;
    }

    rows.push({
      folio: normalizeWorkbookFolio(rawFolio),
      hutEva1: normalizeNavigoRotationCode(rawEva1),
      hutEva2: normalizeNavigoRotationCode(rawEva2)
    });
  }

  return { ok: true, rows };
}

function readXlsxZip(bytes: ArrayBuffer | Uint8Array): Map<string, Buffer> {
  const buffer = Buffer.isBuffer(bytes)
    ? bytes
    : bytes instanceof Uint8Array
      ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : Buffer.from(bytes);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = readCentralDirectory(buffer, centralDirectoryOffset, centralDirectorySize);

  return new Map(entries.map((entry) => [entry.name, entry.data]));
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Invalid XLSX zip.");
}

function readCentralDirectory(buffer: Buffer, offset: number, size: number): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let cursor = offset;
  const end = offset + size;

  while (cursor < end) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Invalid XLSX central directory.");
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const filenameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + filenameLength)
      .toString("utf8")
      .replace(/\\/g, "/");

    entries.push({
      data: readLocalFile(buffer, localHeaderOffset, compressedSize, compressionMethod),
      name
    });

    cursor += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

function readLocalFile(buffer: Buffer, offset: number, compressedSize: number, compressionMethod: number): Buffer {
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error("Invalid XLSX local file.");
  }

  const filenameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + filenameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return Buffer.from(compressed);
  }

  if (compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error("Unsupported XLSX compression.");
}

function resolveWorkbookSheetPath(files: Map<string, Buffer>, sheetName: string): string | null {
  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8");
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbookXml || !relsXml) {
    return null;
  }

  const sheetRegex = /<sheet\b[^>]*>/g;
  let sheetMatch: RegExpExecArray | null;
  let relationId: string | null = null;
  while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
    const tag = sheetMatch[0] ?? "";
    if (readXmlAttribute(tag, "name") === sheetName) {
      relationId = readXmlAttribute(tag, "r:id");
      break;
    }
  }

  if (!relationId) {
    return null;
  }

  const relRegex = /<Relationship\b[^>]*>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    const tag = relMatch[0] ?? "";
    if (readXmlAttribute(tag, "Id") === relationId) {
      const target = readXmlAttribute(tag, "Target");
      if (!target) {
        return null;
      }

      return normalizeXlsxPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }
  }

  return null;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) {
    return [];
  }

  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXmlText([...String(match[1] ?? "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => textMatch[1] ?? "").join(""))
  );
}

function parseWorksheetCells(xml: string, sharedStrings: string[]): WorkbookCellMap {
  const cells: WorkbookCellMap = new Map();
  const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  let match: RegExpExecArray | null;

  while ((match = cellRegex.exec(xml)) !== null) {
    const attributes = String(match[1] ?? match[3] ?? "");
    const reference = readXmlAttribute(attributes, "r");
    if (!reference) {
      continue;
    }

    const type = readXmlAttribute(attributes, "t");
    const body = String(match[2] ?? "");
    const value = readCellValue(body, type, sharedStrings);
    cells.set(reference, value);
  }

  return cells;
}

function readCellValue(body: string, type: string | null, sharedStrings: string[]): string {
  if (type === "inlineStr") {
    return decodeXmlText([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1] ?? "").join(""));
  }

  const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (type === "s") {
    return sharedStrings[Number(rawValue)] ?? "";
  }

  return decodeXmlText(rawValue);
}

function hasExpectedWorkbookHeaders(cells: WorkbookCellMap): boolean {
  const expected = new Map([
    ["A1", "FOLIO"],
    ["B2", "PR1"],
    ["C2", "PR2"],
    ["D2", "PR3"],
    ["E2", "VERI_1"],
    ["F2", "PR4"],
    ["G2", "PR5"],
    ["H2", "PR6"],
    ["I2", "VERI_2"],
    ["J2", "EVA1"],
    ["K2", "EVA2"]
  ]);

  return [...expected].every(([reference, value]) => normalizeHeaderCell(cell(cells, reference)) === value);
}

function findLastRow(cells: WorkbookCellMap): number {
  let lastRow = 0;
  for (const reference of cells.keys()) {
    const row = Number(reference.match(/\d+$/)?.[0] ?? 0);
    lastRow = Math.max(lastRow, row);
  }

  return lastRow;
}

function findWorkbookHeaderRow(
  cells: WorkbookCellMap,
  expectedHeaders: string[]
): { columns: Record<string, string>; row: number } | null {
  const lastRow = Math.min(findLastRow(cells), 10);

  for (let row = 1; row <= lastRow; row += 1) {
    const columns: Record<string, string> = {};
    for (const [reference, value] of cells.entries()) {
      const match = reference.match(/^([A-Z]+)(\d+)$/);
      if (!match || Number(match[2]) !== row) {
        continue;
      }

      const normalized = normalizeHeaderCell(value);
      if (expectedHeaders.includes(normalized)) {
        columns[normalized] = match[1] ?? "";
      }
    }

    if (expectedHeaders.every((header) => Boolean(columns[header]))) {
      return { columns, row };
    }
  }

  return null;
}

function cell(cells: WorkbookCellMap, reference: string): string {
  return String(cells.get(reference) ?? "").trim();
}

function normalizeWorkbookFolio(value: string): string {
  const normalized = normalizeNavigoFolio(value);
  if (/^\d+$/.test(normalized)) {
    return `${DEFAULT_FOLIO_PREFIX}-${normalized.padStart(3, "0")}`;
  }

  return normalized;
}

function normalizeHeaderCell(value: string): string {
  return value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

function normalizeXlsxPath(path: string): string {
  const segments: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return segments.join("/");
}

function readXmlAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}="([^"]*)"`));
  return match ? decodeXmlText(match[1] ?? "") : null;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
