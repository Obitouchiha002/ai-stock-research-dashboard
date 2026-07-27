import { NextRequest, NextResponse } from "next/server";
import { extractDocument } from "@/lib/docExtract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Multipart upload -> extracted plain text per file. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: "Upload at most 10 files at a time." }, { status: 400 });

    const results = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        results.push({
          ok: false,
          name: file.name,
          kind: "unknown",
          bytes: file.size,
          text: "",
          chars: 0,
          words: 0,
          pages: null,
          notes: [],
          reason: "File is larger than 25 MB.",
        });
        continue;
      }
      const buf = Buffer.from(await file.arrayBuffer());
      results.push(await extractDocument(file.name, buf, file.type));
    }
    return NextResponse.json({ files: results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
