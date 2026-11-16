# Demo sample page

A local page with labelled sample images that shows every verdict the extension can give (REQ-F-013).

```bash
npm run demo
```

Then open http://localhost:8080/ in Chrome with the extension loaded (`extension/dist/`).

| Section | Folder | Expected | Samples now |
| --- | --- | --- | --- |
| Definite | `images/definite/` | Square **AI** badge, "AI-generated (Content Credentials)" or "AI-edited (Content Credentials)" | 7 (ChatGPT, Gemini, Firefly and an Adobe Photoshop edit) |
| Likely | `images/likely/` | Round **AI?** badge with a percentage | 6 (DALL-E, Stable Diffusion, Midjourney, Leonardo AI) |
| None | `images/none/` | No badge | 6 photographs |

## Adding more signed samples

Generate an image in a tool that signs its output and use its **Download** button. Do not screenshot it, send it through a chat or social app, or re-save it in an editor: each of those strips or breaks the Content Credentials. Drop the file into `demo/images/definite/`; the page lists whatever is in the folders. Then run `npm run e2e:demo --workspace extension` to confirm the badge. If a download shows no badge, check it at https://contentcredentials.org/verify.

## Checking the page

`extension/e2e/demo.mjs` opens this page with the extension and checks each image against its section. Image sources and licences are in `CREDITS.md`.
