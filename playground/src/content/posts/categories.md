---
title: Plain markdown post
date: 2026-04-08
description: A plain `.md` post — no MDX components, just to confirm the markdown renderer path works alongside MDX.
tags:
  - markdown
  - rendering
---

This post is plain Markdown. It still goes through `astro:content`'s render
pipeline, then the Container, then sanitize. Body text only.
