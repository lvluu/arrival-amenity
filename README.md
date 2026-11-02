# Arrival Fruit

PWA that reads the Opera "Enhanced Pre Arrival Report" PDF and lists fruit to order per villa:
villa -> room type -> bedrooms -> fruit (bedrooms x "fruit per bedroom", default 1).

- Bedrooms = digit in the room type code (RL3 = 3, RD2 = 2, VM1B = 1); no digit = 1 (VK, VDK, VKF).
- Sharer rows are merged per villa. Standby villas (0 nights) are skipped and listed.
- Evidence: every counted row is boxed red on the rendered PDF page, with the room type and the result.
- The PDF never leaves the device (pdf.js in the browser). Report PDFs are git-ignored: they hold guest data.

Run: `python3 -m http.server 8765`, open http://localhost:8765. Test: `node --test`.
After changing a file, bump `VERSION` in `sw.js` so installed apps pick it up.
