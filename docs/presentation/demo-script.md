# Demo script

About 4 minutes. Everything runs locally except the optional second opinion.

## Set-up (before the talk)

1. `npm install && npm run build` (add `AID_BACKEND_URL=https://...` if the backend is deployed).
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extension/dist/`.
3. `npm run demo`, open http://localhost:8080/ once and scroll to the bottom so the model downloads and every result is cached. Then click "Clear" in the popup only if you want to show checks happening live.
4. Open the tabs in this order: demo page, one real news article, `chrome://extensions` (to show the permissions).
5. Zoom the browser to 125% so badges are visible from the back of the room.
6. Have the fallback recording open in a video player, paused at 0:00.

## Script

| Step | Do | Say | Requirement shown |
| --- | --- | --- | --- |
| 1 (0:30) | Demo page, top section. Point at the square **AI** badge. Hover it. | "This image was downloaded straight from an AI tool. The badge says Content Credentials, which means a valid signature from a signer on the C2PA trust list." | REQ-F-005 row 1, REQ-UI-001/002 |
| 2 (0:45) | Click the badge. Walk down the popover: signer, tool, date, "Declares". | "Here is the evidence, not just a verdict. These strings come from inside the file, so they are treated as hostile input: sanitized and rendered as plain text." | REQ-F-008, REQ-SEC-001/002 |
| 3 (0:20) | Read the caveat aloud. Press Esc. | "It never claims an image is real. No mark means nothing." | REQ-UI-003, REQ-UI-005 |
| 4 (0:40) | Scroll to the Likely section. Point at the round **AI?** badges and a percentage. Open one popover. | "Same kind of image after the metadata was stripped, as a screenshot or a social upload would do. Now there is nothing to verify, so a neural network running on this laptop's GPU scores it. Different shape, different words: this is a guess, and it says so." | REQ-F-005 row 3, REQ-F-006 |
| 5 (0:20) | Scroll to the None section. | "Real photos: nothing. The threshold was calibrated so that none of 128 real photos in the test set was flagged." | REQ-F-007, REQ-NF-006 |
| 6 (0:30) | Open DevTools → Network, reload the page. | "Watch the network panel: the page loads its images and that is all. No image goes to a server." | REQ-PRV-001, REQ-PRV-003 |
| 7 (0:30) | Open the toolbar popup. Switch on "Cloud second opinion". Reload, open a Likely popover, click "Get a second opinion". | "The one exception is opt-in and one image per click. The image is shrunk and stripped of metadata first, and the API key lives on a small backend, never in the extension." | REQ-F-009, REQ-PRV-002, REQ-SEC-004 |
| 8 (0:20) | Switch to the news article tab and scroll. | "On a real site it stays quiet: no layout shift, and it adds a few milliseconds of work." | REQ-NF-001, REQ-UI-004 |
| 9 (0:15) | `chrome://extensions` → Details → permissions. | "Storage, an offscreen document, and reading images. No tabs, history or cookies." | REQ-SEC-008 |

## If something goes wrong

| Problem | Fallback |
| --- | --- |
| No badges at all | Check the extension is enabled and the popup's "Check images" is on; reload the page. Otherwise switch to the recording. |
| Definite images show no badge | The file lost its credentials (re-saved or sent through a chat app). Use the Adobe sample, which is committed in the repository. |
| Likely badges are slow to appear | The model is still downloading (popup shows a percentage). Talk through slide 5 while it finishes, or play the recording. |
| Second opinion says "Unavailable" | The backend is down or over quota. Say so: it demonstrates that the rest keeps working (REQ-NF-002). |
| No network in the room | Everything except the second opinion works offline once the model is cached. |

## Recording the fallback

Record the script above once at 1080p with the browser at 125% zoom, with narration off (talk over it live). Keep it under 4 minutes. Store the file outside the repository.
