import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    label: z.string(),
    thesis: z.string(),
    liveUrl: z.string().optional(),
    repoUrl: z.string().url().optional(),
    year: z.number(),
    tags: z.array(z.string()),
    ogDescription: z.string().optional(),
    // Site-relative path to a social-card image; falls back to /og.jpg.
    ogImage: z.string().optional(),
    // Key into the embed registry in projects/[slug].astro. When set, the
    // project renders its live component in place instead of hero CTAs.
    embed: z.string().optional(),
    embedCaption: z.string().optional(),
  }),
});

export const collections = { projects };
