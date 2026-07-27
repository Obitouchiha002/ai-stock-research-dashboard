/**
 * Turn an uploaded file into prompt records for the Prompt Library.
 *
 * Supported: JSON (array or {prompts:[…]}), CSV/TSV with a header row,
 * Markdown split on ## headings, and plain text split on --- rules.
 * Field names are matched loosely so exports from other tools drop straight in.
 */

import type { SavedPrompt } from "./storage";

/** Parse an uploaded file into prompt records. */
export function parseImport(name: string, text: string): Partial<SavedPrompt>[] {
  const ext = (name.split(".").pop() || "").toLowerCase();

  if (ext === "json") {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : Array.isArray(data?.prompts) ? data.prompts : [data];
    return arr.map((r: any) => ({
      title: r.title ?? r.name ?? r.label ?? "",
      body: r.body ?? r.prompt ?? r.text ?? r.content ?? "",
      category: r.category ?? r.cat ?? "",
      subcategory: r.subcategory ?? r.subCategory ?? r.sub ?? "",
      tags: Array.isArray(r.tags) ? r.tags : String(r.tags || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean),
    }));
  }

  if (ext === "csv" || ext === "tsv") {
    const sep = ext === "tsv" ? "\t" : ",";
    // Minimal RFC-4180 splitter — handles quoted fields containing separators.
    const splitRow = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') q = false;
          else cur += c;
        } else if (c === '"') q = true;
        else if (c === sep) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const head = splitRow(lines[0]).map((h) => h.toLowerCase());
    const at = (row: string[], ...names: string[]) => {
      for (const n of names) {
        const i = head.indexOf(n);
        if (i >= 0 && row[i] != null) return row[i];
      }
      return "";
    };
    return lines.slice(1).map(splitRow).map((row) => ({
      title: at(row, "title", "name", "label"),
      body: at(row, "prompt", "body", "text", "content"),
      category: at(row, "category", "cat"),
      subcategory: at(row, "subcategory", "sub category", "sub"),
      tags: at(row, "tags").split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
    }));
  }

  // Markdown / plain text: split on `## heading` blocks, else on `---` rules.
  if (/^#{1,3}\s/m.test(text)) {
    const blocks = text.split(/^#{1,3}\s+/m).slice(1);
    return blocks.map((b) => {
      const nl = b.indexOf("\n");
      return {
        title: (nl < 0 ? b : b.slice(0, nl)).trim(),
        body: (nl < 0 ? "" : b.slice(nl + 1)).trim(),
      };
    }).filter((p) => p.body);
  }
  return text
    .split(/\n-{3,}\n|\n={3,}\n|\n\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const nl = b.indexOf("\n");
      const first = (nl < 0 ? b : b.slice(0, nl)).trim();
      // A short first line reads as a title; otherwise the whole block is the prompt.
      return first.length <= 80 && nl > 0
        ? { title: first, body: b.slice(nl + 1).trim() }
        : { title: b.slice(0, 60), body: b };
    });
}
