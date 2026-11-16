# Demo sample page

A local page with labelled sample images that shows every verdict the extension can give (REQ-F-013).

```bash
npm run demo
```

Then open http://localhost:8080/ in Chrome with the extension loaded (`extension/dist/`).

| Section | Folder | Expected | Samples now |
| --- | --- | --- | --- |
| Definite | `images/definite/` | Square **AI** badge, "AI-generated (Content Credentials)" or "AI-edited (Content Credentials)" | 1 (Adobe Photoshop generative edit) |
| Likely | `images/likely/` | Round **AI?** badge with a percentage | 6 (DALL-E, Stable Diffusion, Midjourney, Leonardo AI) |
| None | `images/none/` | No badge | 6 photographs |

## Still needed: signed AI samples

The Definite section needs at least 5 images downloaded directly from tools that sign their output: ChatGPT, Gemini and Adobe Firefly. Public test repositories do not have such files, so they have to be generated and downloaded by hand.

1. Generate an image in each tool and use its **Download** button. Do not screenshot, do not send it through a chat or social app, and do not re-save it in an editor: each of those strips or breaks the Content Credentials.
2. Drop the files into `demo/images/definite/`. The page lists whatever is in the folders; nothing else needs editing.
3. Run `npm run e2e:demo --workspace extension` to confirm every sample gets the expected badge.

If a download shows no badge, check it at https://contentcredentials.org/verify to see whether the file still carries a manifest.

## Checking the page

`extension/e2e/demo.mjs` opens this page with the extension and checks each image against its section. Image sources and licences are in `CREDITS.md`.
