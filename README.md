# solnicol.com
My personal site, built with Astro and Markdown content collections.

## Content workflow

- Page routes live in `src/pages`
- Project pages live in `src/content/projects/*.md`
- Project frontmatter is typed in `src/content.config.ts`
- The shared site frame lives in `src/layouts/SiteLayout.astro`

Project frontmatter follows this shape:

```yaml
title: Horologium Quintarum
label: Temperament Clock
thesis: A clock that lets you hear why pure fifths do not close.
liveUrl: https://temperament-clock.vercel.app
repoUrl: https://github.com/solnicol/temperament-clock
year: 2026
tags: [music, web audio, interaction]
```

Run `npm run build` before committing.
