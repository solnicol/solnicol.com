# solnicol.com
My personal site + /now page – built with HTML, Markdown, or Jekyll

## Content workflow

- Homepage copy lives in `_data/home.yml`
- `/now` copy lives in `_data/now.yml`

Update those YAML files (hero text, bios, build blurbs, links) and run `bundle exec jekyll build` before committing. Avoid editing `index.md` or `now.md` directly for text changes—they just render the data.

This branch (`lab`) tracks experimental motion/layout work before it graduates to main.
