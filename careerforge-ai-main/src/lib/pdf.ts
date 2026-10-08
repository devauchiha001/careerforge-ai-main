const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Extracts plain text from a PDF or text file entirely in the browser. */
export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is larger than 8 MB. Please upload a smaller resume.");

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);

  if (isText) return file.text();
  if (!isPdf) throw new Error("Unsupported file type. Upload a PDF or .txt resume, or paste the text instead.");

  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pages: string[] = [];
  try {
    let pdf;
    try {
      pdf = await task.promise;
    } catch {
      throw new Error("We couldn't read that PDF. It may be corrupted or password-protected.");
    }
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        } else if (item.str && !item.str.endsWith(" ")) {
          line += " ";
        }
      }
      if (line) lines.push(line);
      pages.push(lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
    }
  } finally {
    await task.destroy();
  }

  const text = pages.join("\n\n").trim();
  if (text.length < 50) {
    throw new Error("This PDF has little or no selectable text (it may be a scanned image). Paste your resume text instead.");
  }
  return text;
}
