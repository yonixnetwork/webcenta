/** Minimal, safe email templates (all interpolations are escaped). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f7fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#12131a">
<div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="font-weight:800;font-size:20px;margin-bottom:20px">Web<span style="color:#4f46e5">centa</span></div>
<div style="background:#fff;border:1px solid #e3e5ee;border-radius:16px;padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${bodyHtml}</div>
<p style="font-size:12px;color:#676c80;margin-top:16px">You received this email because of activity on your Webcenta account.</p></div></body></html>`;
}

export function actionEmail(opts: { title: string; intro: string; actionLabel: string; url: string; outro?: string }) {
  const { title, intro, actionLabel, url, outro } = opts;
  const html = layout(
    title,
    `<p style="line-height:1.6">${escapeHtml(intro)}</p>
<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#4f46e5;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(actionLabel)}</a></p>
<p style="font-size:13px;color:#5b6072;word-break:break-all">Or open: ${escapeHtml(url)}</p>${outro ? `<p style="font-size:13px;color:#5b6072">${escapeHtml(outro)}</p>` : ""}`,
  );
  const text = `${title}\n\n${intro}\n\n${actionLabel}: ${url}\n${outro ? `\n${outro}\n` : ""}`;
  return { html, text };
}
