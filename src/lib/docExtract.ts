/**
 * Server-side document text extraction for the Research Dashboard.
 *
 * Everything downstream (analysis, multi-AI verification) works on plain text,
 * so each supported format is reduced to text here and nowhere else.
 *
 * Research support only. Extraction is best-effort: scanned/image-only PDFs
 * carry no text layer and are reported as unavailable rather than guessed at.
 */

export type ExtractKind = "pdf" | "docx" | "xlsx" | "csv" | "json" | "text" | "unknown";

export type ExtractResult = {
  ok: boolean;
  name: string;
  kind: ExtractKind;
  bytes: number;
  text: string;
  chars: number;
  words: number;
  pages: number | null;
  /** Present when ok is false — why the text could not be read. */
  reason?: string;
  /** Non-fatal notes (e.g. truncation, partial sheets). */
  notes: string[];
};

/**
 * Hard cap on stored text per document.
 *
 * Sized against what is actually usable: the analysis and chat routes pack at
 * most ~60,000 characters per request, so this leaves generous headroom while
 * not hoarding text no model will ever read. The old 400,000 cap stored ~7x
 * more than could be used and pushed browser localStorage past its quota,
 * which silently dropped whole projects.
 */
export const MAX_CHARS = 150_000;

export function kindFor(name: string, mime?: string): ExtractKind {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  if (ext === "pdf" || m.includes("pdf")) return "pdf";
  if (ext === "docx" || m.includes("wordprocessingml")) return "docx";
  if (ext === "xlsx" || ext === "xls" || m.includes("spreadsheetml") || m.includes("ms-excel")) return "xlsx";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "json") return "json";
  if (["txt", "md", "markdown", "log", "rtf"].includes(ext) || m.startsWith("text/")) return "text";
  return "unknown";
}

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractPdf(buf: Buffer): Promise<{ text: string; pages: number | null }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text: String(text || ""), pages: totalPages ?? null };
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const res = await mammoth.extractRawText({ buffer: buf });
  return String(res?.value || "");
}

async function extractXlsx(buf: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim()) parts.push(`### Sheet: ${sheetName}\n${csv.trim()}`);
  }
  return parts.join("\n\n");
}

export async function extractDocument(
  name: string,
  buf: Buffer,
  mime?: string,
): Promise<ExtractResult> {
  const kind = kindFor(name, mime);
  const notes: string[] = [];
  const base = { name, kind, bytes: buf.byteLength, notes };

  let raw = "";
  let pages: number | null = null;

  try {
    switch (kind) {
      case "pdf": {
        const r = await extractPdf(buf);
        raw = r.text;
        pages = r.pages;
        break;
      }
      case "docx":
        raw = await extractDocx(buf);
        break;
      case "xlsx":
        raw = await extractXlsx(buf);
        break;
      case "json": {
        const s = buf.toString("utf8");
        try {
          raw = JSON.stringify(JSON.parse(s), null, 2);
        } catch {
          raw = s;
          notes.push("File is not valid JSON — read as plain text.");
        }
        break;
      }
      case "csv":
      case "text":
        raw = buf.toString("utf8");
        break;
      default:
        return {
          ...base,
          ok: false,
          text: "",
          chars: 0,
          words: 0,
          pages: null,
          reason:
            "Unsupported file type. Supported: PDF, DOCX, XLSX/XLS, CSV, TSV, JSON, TXT and Markdown.",
        };
    }
  } catch (e: any) {
    return {
      ...base,
      ok: false,
      text: "",
      chars: 0,
      words: 0,
      pages: null,
      reason: `Could not read this ${kind.toUpperCase()} file: ${e?.message || String(e)}`,
    };
  }

  let text = tidy(raw);

  if (!text) {
    return {
      ...base,
      ok: false,
      text: "",
      chars: 0,
      words: 0,
      pages,
      reason:
        kind === "pdf"
          ? "No text layer found. This looks like a scanned or image-only PDF — text extraction is unavailable for it."
          : "The file contains no readable text.",
    };
  }

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    notes.push(
      `Document is very large — only the first ${MAX_CHARS.toLocaleString()} characters were kept.`,
    );
  }

  return {
    ...base,
    ok: true,
    text,
    chars: text.length,
    words: text.split(/\s+/).filter(Boolean).length,
    pages,
  };
}
