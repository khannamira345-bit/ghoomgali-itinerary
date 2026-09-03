# Ghoomgali Itinerary Maker

A day-wise travel itinerary builder that turns pasted notes into a branded,
print-ready PDF. Everything runs in the browser — no server, no API keys,
no per-document cost, and no client data leaves the machine it runs on.

---

## Running it locally

It is a static site. Any static server works:

```
npx serve -l 5173 .
```

Then open <http://localhost:5173/ghoomgali-itinerary/>.

Opening `index.html` by double-clicking also works, with one degradation:
browsers block `fetch` on `file://`, so the logos fall back to linked SVG
instead of inlined data URIs. Serving it over HTTP is preferable.

---

## Putting it in the client's hands (GitHub Pages, free)

1. On <https://github.com> click **New repository**. Name it
   `ghoomgali-itinerary`, set it **Public**, and do **not** add a README.
2. Copy this folder's contents into a new local folder, then:
   ```
   git init
   git add .
   git commit -m "Ghoomgali Itinerary Maker"
   git branch -M main
   git remote add origin https://github.com/<your-user>/ghoomgali-itinerary.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**. Under *Source* pick
   **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. Wait about a minute. The app is live at
   `https://<your-user>.github.io/ghoomgali-itinerary/`.
5. Send the client that link. To point a custom domain such as
   `itinerary.ghoomgali.com` at it, add the domain under Settings → Pages and
   create a CNAME record at the registrar pointing to
   `<your-user>.github.io`.

Updating later is `git add . && git commit -m "..." && git push` — Pages
redeploys on its own.

Netlify Drop (<https://app.netlify.com/drop>) is the no-git alternative: drag
the folder onto the page and it returns a URL immediately.

---

## What the client does

The interface is two panels.

**Left — input.** Trip details at the top (title, guest, dates, destination,
contact). Below it, a textarea for raw notes. Any typed field overrides what
the parser guessed; blank fields are simply hidden in the output.

**Right — live preview.** Real A4 pages: cover, trip overview with the
accommodation list, day-by-day cards two days to a page, optional notes, and a
cost summary. Click any text to edit it in place. Hover a card for its
toolbar: add a photo, reorder, add a bullet, or remove it.

**Photos.** Every activity card and hotel card carries a photo slot, the cover
takes a full-bleed image, and each day can take a wide banner via the
`+ Day photo` button on its heading. Click a slot or drag an image onto it.
Images are downscaled to 1600px before storage so drafts and PDFs stay small.

Empty slots cost the layout nothing and disappear on export, so the page
breaks you see in the preview are the ones the PDF gets.

Work autosaves to the browser's local storage, so a closed tab is not a lost
itinerary.

### Input format

The first two lines are the trip title and subtitle; wrap a word in asterisks
to set it in gold. The third line supplies dates, duration, party size and
destination count.

```
Vietnam *Escape.*
Hanoi · Danang · Phu Quoc — an 8-day journey for 5
Nov 22–29 | 8D / 7N | 5 adults | 3 cities
```

Then any of five sections, in any order: `Hotels`, `Pricing`, `Inclusions`,
`Exclusions`, `Notes`, plus the days themselves.

```
Hotels
Hanoi | Sky Lark Hotel, Hanoi | Nov 22 – 24 | 2 nights | 21533
- 1 x Superior Room, Double Bed (No window)
- Breakfast included

Day 1 | November 22 · Hanoi | Hanoi
[On arrival · coordinated with flight]
HAN Airport Pick-Up | 2100
Arrival and private transfer from Hanoi (HAN) Airport to the hotel.
- Private transfer vehicle
= INR 2,318 × 5 adults

Pricing
Margin | 45000
GST | 5%
TCS | 2%
```

| Mark | Becomes |
|---|---|
| `Day N \| date · place \| title` | a day heading |
| `[...]` | the small label above the next card |
| `title \| 2100` | a card title with its price pill |
| plain line | the card's description |
| `- ...` | a bullet |
| `= ...` | the small grey cost-basis note |

A `Breakfast included` bullet under a hotel is promoted to a pill
automatically. Timing lines like `Full day`, `On arrival` or `15:30 – 21:00`
are recognised as labels even without the brackets.

**Every total is computed for you** — day totals from the card prices, then
base cost, subtotal, GST, TCS, grand total and cost per person. Type a price
in the preview and the totals re-settle when you click away.

Nothing the parser decides is final — every value is editable in the preview.

---

## Exports

| Format | What it is |
|---|---|
| **PDF** | Print-ready A4, ~240dpi, page for page identical to the preview. |
| **DOCX** | A real Word file. Text and images editable in Word or Google Docs. |
| **HTML** | Self-contained page, still click-to-edit, prints to a fresh PDF. |
| **GGI** | The project file. Load it back to duplicate a trip for the next client. |

The PDF is a raster of each page, which is what keeps the layout, fonts and
colours exactly as designed; text in it is not selectable. The DOCX is the
format to hand someone who needs to rewrite copy.

Word cannot embed webfonts, so the DOCX substitutes Georgia, Calibri and
Consolas for Newsreader, Hanken Grotesk and Space Mono. Colours, hierarchy and
images are preserved.

---

## Brand values in use

Taken verbatim from the Ghoom Gali brand guidelines and centralised in
`brand.js`; the stylesheets carry the same values as CSS custom properties.

| Role | Name | Hex |
|---|---|---|
| Primary | Abyss | `#0C2027` |
| Secondary | Mint | `#41BF8F` |
| Accent | Lantern | `#E7C547` |
| Tertiary | Chai | `#C4855A` |
| Neutral | Paper | `#EEE9E3` |
| Support | Deep Canopy | `#1C3A32` |
| Surface | Light Mint | `#EFFAF4` |

Typography, per section 09: **Newsreader** for display, **Hanken Grotesk** for
text and interface, **Space Mono** for technical labels and eyebrows. All three
are vendored as woff2 under `assets/fonts/` so the app works offline.

Logos in `assets/logos/` are the real vector files, copied from
`GG Logo files`. To swap one, replace the SVG at the same filename — nothing
else needs changing.

---

## Files

```
index.html    interface shell
app.css       application chrome
doc.css       the itinerary document; also inlined into the HTML export
brand.js      palette, type and logo constants
parser.js     raw text to model
render.js     model to paginated A4 pages
export.js     PDF, DOCX, HTML, GGI
app.js        state, editing, photos, autosave
vendor/       jsPDF, html2canvas, JSZip (pinned, offline)
assets/       logos and fonts
```

---

## Deliberate limits

Two things in the original brief are not implemented as literally stated, for
reasons worth knowing:

**Automatic hotel and activity photos.** No free, licensed API returns a photo
of a *specific* named hotel; those images are copyrighted. Drag-and-drop was
built instead, which is also what produces a better document — agents already
hold supplier photography. A destination-stock integration (Unsplash, free
tier, attribution required) could be added, but it returns a photo of the
place, not the property.

**LLM parsing.** A Gemini key cannot be embedded in a public page without
exposing it to anyone with the link. The rule-based parser needs no key, works
offline and has no rate limit. If smarter parsing of very messy text is wanted
later, the right shape is a Settings field where the client pastes their own
key, kept in their browser only.
