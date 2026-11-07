/**
 * Minimal safe Markdown → HTML: everything is escaped first; only headings,
 * paragraphs, lists, bold/italic and https/relative links are produced.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^\s)]+)\)/g, (_m, text: string, href: string) => `<a href="${href}" rel="noopener noreferrer">${text}</a>`);
}

export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((i) => `<li>${i}</li>`).join("")}</ul>`); list = []; } };
  for (const block of md.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*] /.test(l))) { list.push(...lines.map((l) => inline(l.replace(/^\s*[-*] /, "")))); continue; }
    flush();
    const h = block.match(/^(#{1,3}) (.+)$/);
    if (h && lines.length === 1) out.push(`<h${h[1]!.length + 1}>${inline(h[2]!)}</h${h[1]!.length + 1}>`);
    else if (block.trim()) out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  flush();
  return out.join("\n");
}
