#!/usr/bin/env python3
"""Builds the install site's privacy page from PRIVACY.md, so the two never drift (run by .github/workflows/pages.yml).

Handles the Markdown PRIVACY.md uses: headings, paragraphs, bullet lists, tables, **bold**, `code` and [links](url).
Usage: python3 scripts/privacy-page.py PRIVACY.md > _site/privacy.html
"""
import html
import re
import sys


def inline(text: str) -> str:
    out = html.escape(text, quote=True)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    # Only http(s) and relative links; anything else stays plain text.
    out = re.sub(r"\[([^\]]+)\]\(((?:https?://|\./|[A-Za-z0-9_.-]+\.(?:md|html))[^)\s]*)\)", r'<a href="\2">\1</a>', out)
    return out


def body(markdown: str) -> str:
    blocks: list[str] = []
    lines = markdown.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
        elif line.startswith("#"):
            level = min(len(line) - len(line.lstrip("#")), 3)
            blocks.append(f"<h{level}>{inline(line.lstrip('#').strip())}</h{level}>")
            i += 1
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{inline(lines[i][2:].strip())}</li>")
                i += 1
            blocks.append("<ul>" + "".join(items) + "</ul>")
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, rest = rows[0], [r for r in rows[1:] if not all(set(c) <= set("-: ") for c in r)]
            th = "".join(f"<th scope=\"col\">{inline(c)}</th>" for c in head)
            trs = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rest)
            blocks.append(f"<div class=\"table\"><table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "- ", "|")):
                para.append(lines[i].strip())
                i += 1
            blocks.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(blocks)


PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Study Duo privacy</title>
  <meta name="description" content="What Study Duo records, where it stays, and what each optional connection sends.">
  <link rel="stylesheet" href="tokens.css">
  <style>
    @font-face { font-family: 'Atkinson Hyperlegible Next'; src: url('fonts/atkinson-next-latin.woff2') format('woff2'); font-weight: 200 800; font-display: swap; }
    @font-face { font-family: 'Atkinson Hyperlegible Mono'; src: url('fonts/atkinson-mono-latin.woff2') format('woff2'); font-weight: 200 800; font-display: swap; }
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: var(--color-bg-canvas); color: var(--color-text-primary); font: 400 16px/1.55 var(--font-family-ui); }
    main { max-inline-size: 720px; margin: 0 auto; padding: 40px 16px 56px; }
    .brand { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; font-weight: 700; font-size: 18px; }
    .brand span { inline-size: 10px; block-size: 10px; background: var(--color-bg-plate-focus); }
    h1 { margin: 0 0 16px; font-size: clamp(28px, 7vw, 36px); line-height: 1.15; font-weight: 800; }
    h2 { margin: 32px 0 8px; font-size: 20px; line-height: 26px; font-weight: 700; }
    p, ul { margin: 0 0 12px; }
    ul { padding-inline-start: 1.25em; }
    li + li { margin-block-start: 6px; }
    code { font: 500 0.92em var(--font-family-mono); }
    a { color: inherit; text-underline-offset: 3px; }
    a:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
    .table { overflow-x: auto; margin: 0 0 12px; }
    table { border-collapse: collapse; inline-size: 100%; font-size: 14px; }
    th, td { padding: 8px 10px; border-block-end: 1px solid var(--color-border-subtle); text-align: start; vertical-align: top; }
    th { font-weight: 700; }
    .links { margin-block-start: 32px; font-size: 14px; color: var(--color-text-secondary); }
  </style>
</head>
<body>
  <main>
    <p class="brand"><span aria-hidden="true"></span>Study Duo</p>
BODY
    <p class="links"><a href="./">Install Study Duo</a> · <a href="https://github.com/Coflazo/study-duo/blob/main/PRIVACY.md">This page on GitHub</a> · <a href="https://github.com/Coflazo/study-duo">Source code</a></p>
  </main>
</body>
</html>
"""

if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        sys.stdout.write(PAGE.replace("BODY", body(f.read())))
