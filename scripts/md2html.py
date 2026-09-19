#!/usr/bin/env python3
"""Minimal Markdown -> HTML renderer for the CitCat docs site.

Deliberately dependency-free: the marketing site is vanilla HTML/CSS/JS and we do
not want a Python package or a JS bundler in the deploy path. Handles exactly the
subset used by docs/manual.md: ATX headings, fenced code, tables, lists, blockquotes,
horizontal rules, paragraphs, and inline code/bold/italic/links.
"""
import html
import re
import sys

INLINE_CODE = re.compile(r"`([^`]+)`")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<![*\w])\*([^*\n]+)\*(?!\*)")
LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def inline(text):
    """Escape, then re-apply the inline markup. Code spans are protected first."""
    spans = []

    def stash(m):
        spans.append(m.group(1))
        return "\x00%d\x00" % (len(spans) - 1)

    text = INLINE_CODE.sub(stash, text)
    text = html.escape(text, quote=False)
    text = LINK.sub(lambda m: '<a href="%s">%s</a>' % (html.escape(m.group(2), quote=True), m.group(1)), text)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: "<code>%s</code>" % html.escape(spans[int(m.group(1))], quote=False), text)
    return text


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", text).lower()).strip("-")
    return s or "section"


def render(md):
    lines = md.replace("\r\n", "\n").split("\n")
    out, toc = [], []
    i, n = 0, len(lines)
    list_stack = []  # list of ('ul'|'ol', indent)

    def close_lists(to_indent=-1):
        while list_stack and list_stack[-1][1] > to_indent:
            out.append("</%s>" % list_stack.pop()[0])

    while i < n:
        line = lines[i]

        # Fenced code
        if line.lstrip().startswith("```"):
            close_lists()
            lang = line.strip().strip("`").strip()
            i += 1
            buf = []
            while i < n and not lines[i].lstrip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            cls = ' class="lang-%s"' % html.escape(lang, quote=True) if lang else ""
            out.append("<pre><code%s>%s</code></pre>" % (cls, html.escape("\n".join(buf), quote=False)))
            continue

        stripped = line.strip()

        if not stripped:
            close_lists()
            i += 1
            continue

        # Horizontal rule
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            close_lists()
            out.append("<hr>")
            i += 1
            continue

        # Heading
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            close_lists()
            level = len(m.group(1))
            body = inline(m.group(2).strip())
            anchor = slug(m.group(2))
            out.append('<h%d id="%s">%s</h%d>' % (level, anchor, body, level))
            if level == 2:
                toc.append((anchor, re.sub(r"<[^>]+>", "", body)))
            i += 1
            continue

        # Table
        if stripped.startswith("|") and i + 1 < n and re.fullmatch(r"\|[\s:|-]+\|", lines[i + 1].strip()):
            close_lists()

            def cells(row):
                return [c.strip() for c in row.strip().strip("|").split("|")]

            head = cells(stripped)
            i += 2
            out.append("<table><thead><tr>%s</tr></thead><tbody>"
                       % "".join("<th>%s</th>" % inline(c) for c in head))
            while i < n and lines[i].strip().startswith("|"):
                out.append("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in cells(lines[i])))
                i += 1
            out.append("</tbody></table>")
            continue

        # Blockquote
        if stripped.startswith(">"):
            close_lists()
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append("<blockquote><p>%s</p></blockquote>" % inline(" ".join(buf)))
            continue

        # List item
        m = re.match(r"^(\s*)([-*+]|\d+\.)\s+(.*)$", line)
        if m:
            indent = len(m.group(1))
            kind = "ol" if m.group(2).endswith(".") else "ul"
            close_lists(indent)
            if not list_stack or list_stack[-1][1] < indent:
                list_stack.append((kind, indent))
                out.append("<%s>" % kind)
            out.append("<li>%s</li>" % inline(m.group(3)))
            i += 1
            continue

        # Paragraph
        close_lists()
        buf = []
        while i < n and lines[i].strip() and not re.match(r"^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>|\||```)", lines[i]) \
                and not re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        if buf:
            out.append("<p>%s</p>" % inline(" ".join(buf)))
        else:
            i += 1

    close_lists()
    return "\n".join(out), toc


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="CitCat manual — how to use the visual timeline editor, data binding and export.">
<link rel="canonical" href="https://citcat.mirjam-block.eu/manual.html">
{analytics}
<style>
  *, *::before, *::after {{ margin: 0; padding: 0; box-sizing: border-box; }}
  :root {{
    --bg-deep: #0a0a12; --bg-card: rgba(255,255,255,0.04);
    --accent: #a78bfa; --accent-bright: #c4b5fd; --accent-deep: #7c3aed;
    --text: #e8e6f0; --text-dim: #9892a6; --text-muted: #5e576e;
    --border: rgba(255,255,255,0.08); --radius-sm: 10px;
  }}
  html {{ scroll-behavior: smooth; }}
  body {{
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-deep); color: var(--text); line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }}
  .topbar {{
    position: sticky; top: 0; z-index: 10;
    background: rgba(10,10,18,0.85); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border); padding: 14px 24px;
  }}
  .topbar .inner {{ max-width: 1120px; margin: 0 auto; display: flex; gap: 20px; align-items: center; }}
  .topbar a {{ color: var(--text-dim); text-decoration: none; font-size: 14px; }}
  .topbar a:hover {{ color: var(--text); }}
  .topbar .brand {{ color: var(--text); font-weight: 700; letter-spacing: -0.01em; margin-right: auto; }}
  .wrap {{ max-width: 860px; margin: 0 auto; padding: 48px 24px 96px; }}
  h1 {{ font-size: 2.4rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 8px; }}
  h2 {{
    font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em;
    margin: 48px 0 14px; padding-top: 20px; border-top: 1px solid var(--border);
  }}
  h3 {{ font-size: 1.12rem; font-weight: 650; margin: 28px 0 8px; color: var(--accent-bright); }}
  h4 {{ font-size: 1rem; font-weight: 650; margin: 20px 0 6px; }}
  p {{ color: var(--text-dim); margin-bottom: 14px; }}
  a {{ color: var(--accent); }}
  strong {{ color: var(--text); font-weight: 650; }}
  ul, ol {{ color: var(--text-dim); margin: 0 0 16px 22px; }}
  li {{ margin-bottom: 6px; }}
  hr {{ border: 0; border-top: 1px solid var(--border); margin: 32px 0; }}
  code {{
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.88em; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 5px; padding: 1px 5px; color: var(--accent-bright);
  }}
  pre {{
    background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: 16px 18px; overflow-x: auto; margin-bottom: 18px; line-height: 1.5;
  }}
  pre code {{ background: none; border: 0; padding: 0; color: var(--text-dim); font-size: 0.82rem; }}
  blockquote {{
    border-left: 3px solid var(--accent-deep); padding: 4px 0 4px 16px;
    margin-bottom: 16px; color: var(--text-dim);
  }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.93rem; }}
  th, td {{ text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }}
  th {{ color: var(--text); font-weight: 650; background: var(--bg-card); }}
  td {{ color: var(--text-dim); }}
  .toc {{
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 20px 24px; margin: 28px 0 8px;
  }}
  .toc strong {{ display: block; font-size: 13px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 10px; }}
  .toc ul {{ list-style: none; margin: 0; columns: 2; column-gap: 32px; }}
  .toc li {{ margin-bottom: 4px; break-inside: avoid; }}
  .toc a {{ text-decoration: none; font-size: 0.93rem; }}
  .toc a:hover {{ text-decoration: underline; }}
  footer {{ border-top: 1px solid var(--border); padding: 32px 24px; text-align: center;
    color: var(--text-muted); font-size: 13px; }}
  footer a {{ color: var(--text-dim); }}
  @media (max-width: 680px) {{ .toc ul {{ columns: 1; }} h1 {{ font-size: 1.9rem; }} }}
</style>
</head>
<body>
<div class="topbar"><div class="inner">
  <a class="brand" href="./">CitCat</a>
  <a href="./#demo">Demo</a>
  <a href="./#download">Download</a>
  <a href="https://github.com/mfblock/citcat" rel="noopener">GitHub</a>
</div></div>
<div class="wrap">
{toc}
{body}
</div>
<footer>
  <p>&copy; 2026 Mirjam Block &middot;
  <a href="https://github.com/mfblock/citcat/blob/main/LICENSE" rel="noopener">MIT License</a> &middot;
  <a href="./">citcat.mirjam-block.eu</a></p>
</footer>
</body>
</html>
"""


def main():
    src, dst = sys.argv[1], sys.argv[2]
    analytics = sys.argv[3] if len(sys.argv) > 3 else ""
    with open(src, encoding="utf-8") as f:
        md = f.read()

    body, toc = render(md)
    title = "CitCat Manual"
    m = re.search(r"^#\s+(.+)$", md, re.M)
    if m:
        title = m.group(1).strip()

    toc_html = ""
    if toc:
        toc_html = '<div class="toc"><strong>Contents</strong><ul>%s</ul></div>' % "".join(
            '<li><a href="#%s">%s</a></li>' % (a, t) for a, t in toc
        )

    with open(dst, "w", encoding="utf-8") as f:
        f.write(PAGE.format(title=html.escape(title, quote=True), body=body,
                            toc=toc_html, analytics=analytics))
    print("rendered %s -> %s (%d sections)" % (src, dst, len(toc)))


if __name__ == "__main__":
    main()
