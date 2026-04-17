---
layout: ../layouts/Layout.astro
title: Markdown
---

# Markdown page

Middleware transforms apply to plain Markdown-generated HTML too.

## Strip Link Suffix

- [Internal .html link](/about.html)
- [Nested .html link](/blog/post.html)
- [Already clean link (unchanged)](/already-clean)

## External link annotation

- [Example.com](https://www.example.com) — should get data annotation
- [GitHub](https://github.com) — should get data annotation
- [Internal link](/markdown) — should be unchanged

## Void element handling

---

Text before break.<br />Text after break.
