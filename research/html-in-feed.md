# Feed HTML Sanitizer Allowlist Research

Research for building an HTML sanitizer for feed content (RSS 2.0, Atom, JSON Feed 1.1). Sources cited inline.

## 1. RSS 2.0 Spec

Source: <https://www.rssboard.org/rss-specification>

The spec itself is extremely thin: it says entity-encoded HTML is allowed in `<description>`, and that's essentially it. No allowlist, no blocklist, no security guidance. `content:encoded` comes from the separate RSS Content module (Purl) with the same posture — "must be suitable for presentation as HTML," encoded as entities or inside CDATA.

Source: <https://www.rssboard.org/rss-profile> (RSS Advisory Board Best Practices Profile)

The Best Practices Profile also declines to enumerate tags. It prescribes encoding (entities or CDATA) but punts on which HTML elements are appropriate. Security is treated as the implementer's problem.

**Takeaway:** RSS gives you zero specification-level constraints. Every sanitization decision is policy, not conformance.

## 2. Atom Spec (RFC 4287)

Source: <https://datatracker.ietf.org/doc/html/rfc4287> (Section 3.1.1 and security considerations)

- `<content type="html">`: MUST NOT contain child elements; markup MUST be escaped (entities or CDATA). Treated opaquely until rendered.
- `<content type="xhtml">`: MUST be a single XHTML `<div>`; the `<div>` itself is not part of content. Markup SHOULD "validly appear directly within an HTML `<DIV>` element" — so no `<html>`, `<body>`, `<head>`, etc.
- Security section explicitly calls out unsafe elements: **IMG, SCRIPT, EMBED, OBJECT, FRAME, FRAMESET, IFRAME, META, LINK**. The RFC says implementers must "carefully consider their handling of every type of element" and references RFC 2854 and HTML 4.01.

**Takeaway:** Atom is the only feed spec with any real security guidance, and it names specific unsafe tags. Note: IMG is on its unsafe list (because of tracking pixels / referrer leaks), though every real-world sanitizer allows it.

## 3. JSON Feed 1.1

Source: <https://www.jsonfeed.org/version/1.1/>

One constraint: HTML is only allowed in `content_html` (not in `title`, `summary`, `content_text`, etc.). No tag/attribute guidance whatsoever. Security is entirely the reader's problem.

## 4. Real-World Feed Reader Behavior

Sources:

- <https://github.com/Ranchero-Software/NetNewsWire/blob/main/Shared/Article%20Rendering/main.js>
- <https://timotijhof.net/posts/2025/youtube-in-a-feed-reader-is-better/>
- <https://datamation.com/columns/executive_tech/article.php/3617901/CSS-Support-is-Poor-in-RSS-Feed-Readers.htm>
- <https://github.com/Ranchero-Software/NetNewsWire/issues/3683>

**NetNewsWire:** Renders in WKWebView. Doesn't heavily sanitize — runs a post-processing JS pass (`main.js`) that makes iframes responsive, clamps percentage-height iframes, and rewrites Feedbin proxy image URLs. Effectively permissive: iframes, images, tables all pass through. Inline `<script>` won't execute in the way you'd expect because WebKit renders after DOM injection, but it's still a concern.

**Feedbin / NewsBlur / FreshRSS / Inoreader / Tiny Tiny RSS:** Documented to _inject_ iframe embeds for YouTube feeds (augmenting the feed content). So iframes are rendered, at least from known providers.

**Feedly:** Does not appear in the list of readers that enhance YouTube with iframes, and anecdotally is more aggressive about stripping embeds and scripts.

**CSS support:** Historically poor and inconsistent. Inline `style` attributes are often dropped; `<style>` blocks are almost always dropped. Tables with old-HTML attributes (`border`, `cellpadding`, `width`) survive; tables that rely on CSS for layout often render broken. This is the NewsGator rule cited in Datamation: old-style HTML table attributes pass; inline CSS gets stripped.

**Tables specifically:** Modern readers render `<table>` fine. The historic "tables don't work" problem is resolved in every actively-maintained reader. The remaining issue is narrow viewports (phones) where wide tables overflow — a layout problem, not a sanitization problem.

## 5. Established Sanitizer Allowlists

### sanitize-html (npm, apostrophecms)

Source: <https://github.com/apostrophecms/sanitize-html>

Defaults (from `index.js`):

- **allowedTags:** `address, article, aside, footer, header, h1, h2, h3, h4, h5, h6, hgroup, main, nav, section, blockquote, dd, div, dl, dt, figcaption, figure, hr, li, main, ol, p, pre, ul, a, abbr, b, bdi, bdo, br, cite, code, data, dfn, em, i, kbd, mark, q, rb, rp, rt, rtc, ruby, s, samp, small, span, strong, sub, sup, time, u, var, wbr, caption, col, colgroup, table, tbody, td, tfoot, th, thead, tr`
- **Explicitly excluded from defaults:** `img`, `iframe`, `script`, `style`, `form`, `input`, `button`, `video`, `audio`, `svg`, headings are in but `hgroup` too.
- **allowedAttributes:** `a: [href, name, target]`, `img: [src, srcset, alt, title, width, height, loading]` (note: img not in default tags, so this only matters if you add it)
- **allowedSchemes:** `http, https, ftp, mailto, tel`
- **allowedSchemesAppliedToAttributes:** `href, src, cite`
- **allowProtocolRelative:** `true`

Note that `img` is NOT in default `allowedTags` — a surprise for feed use cases.

### DOMPurify

Source: <https://github.com/cure53/DOMPurify/blob/main/src/tags.ts>, <https://github.com/cure53/DOMPurify/blob/main/src/attrs.ts>

DOMPurify is aggressive: allows a huge HTML surface by default (including `form`, `input`, `button`, `select`, `textarea`, `video`, `audio`, `picture`, `source`, `track`, `details`, `summary`, `dialog`, `svg`, `math`). It deliberately blocks `script`, `object`, `embed`, and dangerous attributes (`on*`, `srcdoc`, `formaction`). Philosophy: XSS-safe but preserves most content semantics. Not a good starting point for feed content because it's much more permissive than most readers actually render.

### Ruby sanitize gem

Source: <https://github.com/rgrove/sanitize>

- **BASIC:** `a, abbr, b, blockquote, br, cite, code, dd, dfn, dl, dt, em, i, kbd, li, mark, ol, p, pre, q, s, samp, small, strike, strong, sub, sup, time, u, ul, var` + adds `rel="nofollow"` to links. No images, no tables.
- **RELAXED:** BASIC + `address, article, aside, body, div, footer, header, hr, main, nav, section, bdi, bdo, span, h1-h6, caption, col, colgroup, tbody, td, tfoot, th, thead, tr, img, data, del, figcaption, figure, ins, rp, rt, ruby, summary, title, wbr, hgroup`. Tables and images in, iframe/video/audio out. Schemes: ftp, http, https, mailto + relative; img src: http, https + relative.

### Rails sanitize helper

Uses Loofah (on top of Nokogiri). Default allowlist similar to Ruby sanitize BASIC. Rails’ `sanitize` helper is widely deployed and considered the reference for "safe subset of HTML."

### WordPress `wp_kses_post`

Sources: <https://developer.wordpress.org/reference/functions/wp_kses_post/>, <https://developer.wordpress.org/reference/functions/wp_kses_allowed_html/>

`wp_kses_post` is very permissive — it mirrors whatever `the_content` allows for authors. Explicitly removes `<form>` (since 5.0.1). Default allowed protocols: `http, https, ftp, mailto, news, irc, gopher, nntp, feed, telnet` (note `feed:` scheme). Because `wp_kses_post` matches author-editor permissions, it's _too_ permissive as a third-party feed sanitizer baseline — it assumes you trust the author.

## 6. Per-Element Recommendation Table

Verdict key: **ALLOW** = include in allowlist; **OK** = safe but optional; **CONDITIONAL** = allow with strong constraints; **DROP** = strip by default.

### Tables — ALLOW

`table, thead, tbody, tfoot, tr, td, th, caption, colgroup, col`. Spec-neutral, rendered by all modern readers, legitimate content use (data tables, pricing, specs). Historic NewsGator-era problems are resolved. The real risk is layout breakage on narrow viewports, which is your feed UI's problem, not a sanitizer concern. **Tables are fine in RSS feed HTML.**

### Figures / Pictures — ALLOW

`figure, figcaption, picture, source`. Standard semantic markup. `source` inside `picture` is safe (just `srcset`, `media`, `type`). Source inside `video`/`audio` only if you allow those.

### Media — CONDITIONAL

- `video, audio`: Render in most modern readers but can autoplay/track. Allow with `controls` only, no `autoplay`, no `src` to non-http(s).
- `iframe`: Controversial. Atom RFC names it unsafe. Real readers (Inoreader, Feedbin, NetNewsWire) render iframes. Recommend: **host-allowlist only** (youtube.com, youtube-nocookie.com, vimeo.com, player.vimeo.com, player.twitch.tv, bandcamp.com, soundcloud.com, open.spotify.com, codepen.io). Strip `srcdoc` always. Require `sandbox` if you're paranoid.
- `embed, object`: DROP. Legacy Flash-era plugin embedding. No legitimate feed use.

### Scripts / styles / meta — DROP (all)

`script, style, link, meta, base`. Obvious XSS / exfiltration vectors. Non-negotiable.

### Forms — DROP (all)

`form, input, button, select, textarea, option, optgroup, fieldset, legend, label`. No legitimate use in a feed item. Forms in feeds = phishing surface. WordPress removed `<form>` from `wp_kses_post` in 5.0.1 for this reason.

### SVG / MathML — CONDITIONAL

- `svg`: Can contain `<script>`, `<foreignObject>` (hosting HTML), event handlers, external `<use href>` references. If you allow SVG, you need an SVG-aware sanitizer (DOMPurify does this; most others don't). **Recommendation: DROP for feeds** unless you add SVG-aware sanitization. The minority of feeds that use SVG (diagram-heavy tech blogs) can degrade to images.
- `math`: Safe in principle, rarely used, no reader renders it reliably. DROP.

### Interactive disclosure — ALLOW

`details, summary`. Safe, semantic, widely rendered.
`dialog`: DROP. Modal dialogs in feed content are a dark pattern; modern readers won't render it as a modal anyway.

### Semantic sectioning — ALLOW

`article, section, aside, nav, header, footer, main, hgroup, address`. All safe. `main` is technically supposed to be document-unique, but sanitizers don't enforce that.

### Quotations — ALLOW

`blockquote, q, cite`. Safe. Allow `cite` attribute on `blockquote` and `q`.

### Code / keyboard — ALLOW

`pre, code, kbd, samp, var`. Safe. Essential for tech blogs.

### Text marking — ALLOW

`mark, ins, del, s, strike, small, sub, sup, b, i, u, em, strong`. All safe. `strike` is deprecated but harmless.

### Semantic inline — ALLOW

`abbr, dfn, time, data, ruby, rt, rp, rb, rtc, bdi, bdo, wbr`. All safe, all rarely used but not harmful.

### Breaks / lists — ALLOW

`hr, br, ul, ol, li, dl, dt, dd, menu`. Obviously safe.

### Images — ALLOW (with constraints)

`img`. Universally expected in feeds. Allow `src, srcset, sizes, alt, title, width, height, loading, decoding`. Constrain `src` to http/https. Note sanitize-html's default _excludes_ `img` — override this for feed use.

## 7. Attribute Allowlist

### Global safe attributes (apply to all allowed elements)

`class, id, lang, dir, title, translate`

Controversial:

- `style`: Feed readers inconsistently honor it. If allowed, must CSS-parse and allowlist properties (no `expression()`, no `url()` except to http/https data:image, no `behavior`, no `position: fixed`). If you don't want to write a CSS sanitizer, **DROP `style`**. Most feed readers strip it anyway.
- `data-*`: Inert unless JS references them. Generally safe to allow, but not useful in feed context since no JS runs. Neutral — allow if you want to preserve author intent, drop for minimalism.
- `role`, `aria-*`: Safe, accessibility-positive. ALLOW.
- `itemprop`, `itemscope`, `itemtype`, `itemid`, `itemref` (microdata): Inert metadata. Safe to ALLOW.

### Element-specific

- `a`: `href, hreflang, title, rel, target, download, type`. Force `rel="noopener noreferrer nofollow ugc"` (or at least `noopener noreferrer`) when `target="_blank"`. Consider adding `rel="nofollow"` or `rel="ugc"` unconditionally (Ruby sanitize does).
- `img`: `src, srcset, sizes, alt, title, width, height, loading, decoding, referrerpolicy`
- `video`, `audio`: `src, controls, poster, preload, width, height, muted, loop` (NOT `autoplay`)
- `source`: `src, srcset, type, media, sizes`
- `iframe` (if allowed): `src, width, height, allow, allowfullscreen, loading, referrerpolicy, sandbox, title` (NEVER `srcdoc`)
- `table`: `summary`
- `td, th`: `colspan, rowspan, headers, scope, abbr, align, valign`
- `col, colgroup`: `span`
- `ol`: `reversed, start, type`
- `li`: `value`
- `q, blockquote`: `cite`
- `time`: `datetime`
- `ins, del`: `cite, datetime`
- `details`: `open`
- `abbr, dfn`: `title`

### Always strip

- All event handlers: `on*` (onclick, onload, onerror, onmouseover, onfocus, onanimationstart, etc.)
- `srcdoc`, `formaction`, `xlink:href` (in SVG contexts)
- `javascript:`, `vbscript:`, `data:` (except `data:image/*` for `img[src]` if you want inline images — decide based on feed size concerns)

## 8. URL Schemes

Recommended allowlist:

- `href`: `http, https, mailto, tel, feed` (feed is WP default; rare but harmless)
- `src`: `http, https` (and `data:image/*` if you want to support inline images — warn that this inflates feed size)
- `cite` (blockquote, q, ins, del): `http, https`

Block in all contexts: `javascript:, vbscript:, data:text/html, data:application/*, file:, about:, blob:`

Allow protocol-relative URLs (`//example.com`): defensible either way; sanitize-html defaults to allowing. Prefer to disallow — feeds are consumed over many transports and protocol-relative is an anti-pattern now that HTTPS is universal.

## 9. Direct Answer: Are Tables OK in RSS Feed HTML?

**Yes, with nuance.**

- **Spec:** RSS 2.0 says nothing. Atom says nothing specific about tables (only flags IMG/SCRIPT/EMBED/OBJECT/FRAME/FRAMESET/IFRAME/META/LINK as unsafe — tables are fine). JSON Feed says nothing.
- **Historical reality (pre-2010):** Tables rendered inconsistently; NewsGator and Bloglines had partial support. This is where the "tables don't work in RSS" folk wisdom comes from.
- **Current reality (2026):** Every maintained reader (Feedly, NetNewsWire, Reeder, Inoreader, NewsBlur, Feedbin, Miniflux) renders HTML tables correctly. They're standard HTML in a WKWebView/browser DOM.
- **Sanitizer precedent:** sanitize-html includes all table elements in defaults. DOMPurify includes them. Ruby sanitize RELAXED includes them. Rails sanitize allows them. WordPress `wp_kses_post` allows them.
- **Caveats:** (1) Wide tables overflow narrow phone viewports — a UX issue, not a safety issue. (2) Tables that rely on CSS for layout (display: grid, fixed widths via style attribute) may break if the reader strips `style`. (3) Tables used for layout (as opposed to tabular data) are an anti-pattern.

**Verdict: Include all table elements in your allowlist. Allow semantic attributes (`colspan`, `rowspan`, `scope`, `headers`, `summary`). Drop `style` attribute separately if you don't want to write a CSS sanitizer.**

## 10. Concrete Recommended Allowlist for Feed HTML Sanitizer

### Tier 1: tags (allow by default)

```txt
Content sectioning:
  article, section, aside, nav, header, footer, main, address, hgroup,
  h1, h2, h3, h4, h5, h6

Text flow:
  p, div, blockquote, pre, hr, br,
  ul, ol, li, dl, dt, dd, menu,
  figure, figcaption, details, summary

Tables:
  table, caption, colgroup, col, thead, tbody, tfoot, tr, td, th

Inline text:
  a, span, strong, em, b, i, u, s, strike, small, mark,
  code, kbd, samp, var, pre,
  sub, sup, ins, del,
  abbr, dfn, cite, q, time, data,
  ruby, rt, rp, rb, rtc, bdi, bdo, wbr,
  br

Media:
  img, picture, source,
  audio, video, track,
  figure, figcaption
```

### Tier 2: iframe (opt-in, with host allowlist)

Allow only with strict host allowlist. Recommend starting with:
`www.youtube.com, www.youtube-nocookie.com, player.vimeo.com, player.twitch.tv, bandcamp.com, w.soundcloud.com, open.spotify.com, codepen.io, codesandbox.io, gist.github.com`

Required attributes when allowed: `src, width, height, title, allow, allowfullscreen, loading, referrerpolicy, sandbox`. Strip `srcdoc` unconditionally.

### Drop always

```txt
script, style, link, meta, base,
form, input, button, select, textarea, option, optgroup, fieldset, legend, label,
object, embed, applet, frame, frameset, noframes,
svg, math,
dialog,
canvas, noscript, template, slot, portal
```

(SVG moves to Tier 2 if you ship an SVG-aware sanitizer. Same for math.)

### Attributes

Global (on all allowed tags): `class, id, lang, dir, title, translate, role, aria-*, itemscope, itemtype, itemprop, itemid, itemref`

Per-tag (beyond global):

```txt
a:          href, hreflang, rel, target, download, type
img:        src, srcset, sizes, alt, width, height, loading, decoding, referrerpolicy
picture:    (global only)
source:     src, srcset, sizes, media, type
video:      src, controls, poster, preload, width, height, muted, loop, playsinline
audio:      src, controls, preload, muted, loop
track:      src, kind, srclang, label, default
iframe:     src, width, height, title, allow, allowfullscreen, loading, referrerpolicy, sandbox
table:      summary
td, th:     colspan, rowspan, headers, scope, abbr
col/colgroup: span
ol:         reversed, start, type
li:         value
q:          cite
blockquote: cite
time:       datetime
ins, del:   cite, datetime
details:    open
abbr, dfn:  title
```

Drop everywhere: all `on*` handlers, `srcdoc`, `formaction`, `style` (unless you ship a CSS sanitizer), `xlink:href`.

### URL schemes

```txt
href (a):      http, https, mailto, tel
src (img):     http, https, (optionally data:image/*)
src (others):  http, https
cite:          http, https
```

Reject: `javascript:, vbscript:, data:text/html, data:application/*, file:, about:, blob:`

### Link rewrites (recommended)

- `<a target="_blank">` → force `rel="noopener noreferrer"` (append if missing).
- Consider forcing `rel="nofollow ugc"` on all outbound links (Ruby sanitize BASIC does this; conservative default).

## 11. Controversial Choices

1. **`style` attribute**: Most feed readers strip it; I recommend dropping it unless you write a proper CSS property allowlist. Rails/Loofah allows it with CSS sanitization; sanitize-html does not.
2. **`iframe`**: The spec (Atom) says unsafe; real readers render it from known providers. Host-allowlist gives you the ergonomics of embeds with bounded risk. Alternative: strip entirely and let feed readers inject their own embeds (what Feedbin/NewsBlur do for YouTube).
3. **`img` with `data:` URLs**: Enables inline images (no network request, no tracking pixels). Inflates feed size significantly. Defensible either way; I recommend _not_ allowing `data:` in img src unless you have a reason — inline images in feeds are rare and bloat payloads.
4. **`svg`**: Dangerous without dedicated SVG sanitization. Drop unless you pull in DOMPurify or equivalent.
5. **`target="_blank"`**: Harmless if you force `rel="noopener"`. Some feed readers override link targets anyway.
6. **Micro data attrs (`itemprop` etc.)**: Inert, harmless, occasionally preserved by readers doing schema.org extraction. Allow.

## Sources

Specs:

- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)
- [RSS Best Practices Profile](https://www.rssboard.org/rss-profile)
- [RFC 4287 — Atom Syndication Format](https://datatracker.ietf.org/doc/html/rfc4287)
- [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)

Sanitizers:

- [apostrophecms/sanitize-html](https://github.com/apostrophecms/sanitize-html)
- [DOMPurify tags.ts](https://github.com/cure53/DOMPurify/blob/main/src/tags.ts) and [attrs.ts](https://github.com/cure53/DOMPurify/blob/main/src/attrs.ts)
- [Ruby sanitize gem](https://github.com/rgrove/sanitize)
- [WordPress wp_kses_post](https://developer.wordpress.org/reference/functions/wp_kses_post/)
- [wp_kses_allowed_html](https://developer.wordpress.org/reference/functions/wp_kses_allowed_html/)

Reader behavior:

- [NetNewsWire article rendering main.js](https://github.com/Ranchero-Software/NetNewsWire/blob/main/Shared/Article%20Rendering/main.js)
- [NetNewsWire issue #3683 — YouTube Inline Video Support](https://github.com/Ranchero-Software/NetNewsWire/issues/3683)
- [YouTube in a feed reader is... better? (2025)](https://timotijhof.net/posts/2025/youtube-in-a-feed-reader-is-better/)
- [Datamation — CSS Support is Poor in RSS Feed Readers](https://datamation.com/columns/executive_tech/article.php/3617901/CSS-Support-is-Poor-in-RSS-Feed-Readers.htm)
