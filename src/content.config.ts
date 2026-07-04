import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    label: z.string(),
    thesis: z.string(),
    liveUrl: z.string().url().optional(),
    repoUrl: z.string().url().optional(),
    year: z.number(),
    tags: z.array(z.string()),
    ogDescription: z.string().optional(),
  }),
});

export const collections = { projects };
