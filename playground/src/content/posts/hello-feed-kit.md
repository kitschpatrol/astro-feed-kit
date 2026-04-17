---
title: Hello, feed-kit
date: 2026-04-10
description: First post in the playground — exercises the default resolvers and the MDX renderer.
tags:
  - meta
  - introduction
---

This is a short MDX post used to exercise `astro-feed-kit`'s default resolver
chain. It has frontmatter for `title`, `date`, `description`, and `tags`, and
its rendered body should appear inside `<content:encoded>` in the RSS output.

<!-- excerpt -->

Everything below this line should be **omitted** from the feed because of the
excerpt boundary marker above. If you see it in the feed item content, the
truncation pipeline is broken.

## Past the boundary

Lorem ipsum and so on. None of this should reach a feed reader.
