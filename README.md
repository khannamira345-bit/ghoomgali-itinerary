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

## How the agency uses it

The maker is for the Ghoom Gali team, who prepare itineraries for many
customers. The customer only ever sees the exported PDF or Word file.

**Itineraries.** The app opens on a list of every itinerary saved on this
computer: customer, travel dates, travelers, quotation total and when it was
last edited. Search it, open one to keep working, or use the ••• menu to
duplicate it for another customer (everything is copied except the name),
download its PDF, or delete it. Itineraries are stored in the browser's
IndexedDB, so they survive closing the tab but stay on this one computer.

**Agency settings.** Advisor name and phone; payment details (UPI QR image,
UPI ID, bank account, payment terms); and the standard inclusions, exclusions
and terms. Saved once and used on every itinerary. The Document tab can also
save the current lists as the new default.

**New itinerary** takes two steps, a page each:

1. **Who is this trip for?** Customer, destination, travel dates, duration
   (a list from 1 night / 2 days to 13 nights / 14 days), travelers, children.
2. **How do you want to build it?**
   - **A · Paste text or upload a PDF.** Paste the plan, or upload its PDF (the
     text is read in the browser and put in the box to check), or try one of
     the samples. **Create itinerary** lays it out.
   - **B · Build it day by day.** Day 1 to the last day are created from the
     duration, ready to fill from the cost sheet or with custom items.

**Trip length.** An itinerary never has more days than its duration. If
pasted text has more days, the app asks: keep the first days, or lengthen
the duration. Shortening the duration below the days already built asks
before removing any.

**The workspace** is two tabs beside a live preview:

- **1 · Itinerary.** Paste chat (rebuild from a new paste), Days (stays and
  days; every item has Edit, Replace and Remove in view, and removing offers
  Undo), Trip details, and Document (inclusions, exclusions, terms, payment
  page on or off).
- **2 · Quotation.** Cost sheet (pick a country, search: type `pickup` to see
  every pickup with its prices, click a price to add it to a day; or add a
  custom item that isn't on the sheet) and Pricing (layout, GST, TCS,
  discount, a fixed package price, "prices already include GST", and the
  internal margin).

**Replacing an item.** Replace on any activity or stay opens the cost sheet
with a banner; the next price clicked (or a custom item) takes its place in
the same day and position.

**Flights.** Add one from a day's **+ Add to this day** menu, or write
`Flight 6E-2043 DEL to HAN 09:40 - 15:10 | 18000` in the text. It prints as
its own strip between the day's activities; the plane glides along the route
in the app and stands still in the PDF.

**Samples.** Four built-in trips, each written a different way, are under
**Try a sample**. **Save this text as a sample** adds the agency's own, kept
in this browser.

**Nothing is lost.** Lines the text reader can't place land under Good to
know, where they can be edited or deleted.

### What the customer sees

The PDF, Word and web-page exports are for the customer, so they carry one
package price only: item prices, the cost working behind them, day totals,
hotel prices and the margin never print. The agency sees all of those in the
app (the Days panel and Quotation tab).

**GST.** When the text says a price is "incl. GST" (or the **Prices already
include GST** box is ticked), GST is not added on top: the total stays as
quoted and the pricing page says "Inclusive of GST". A line such as
`Total | 72,000 incl. GST` sets the package price the customer pays.

**Cover colour.** Each new itinerary's cover takes the next brand colour in
turn (Abyss, Mint, Deep Canopy, Lantern, Chai, Paper), with dark or light type
to suit. Trip details › Cover colour locks one for a single itinerary.

**Live preview.** Real A4 pages: cover, trip overview with the
accommodation list, day-by-day cards two days to a page, optional notes, and a
cost summary. Click any text to edit it in place. Hover a card for its
toolbar: edit it in the Days panel, replace it, add a photo, reorder, add a
bullet, or remove it. An empty Morning, Afternoon or Evening slot on the Trip
summary reads "At leisure"; click it to write something else.

**Photos.** Every activity card and hotel card carries a photo slot, the cover
takes a full-bleed image, and each day can take a wide banner via the
`+ Day photo` button on its heading. Click a slot or drag an image onto it.
Images are downscaled to 1600px before storage so drafts and PDFs stay small.

Empty slots cost the layout nothing and disappear on export, so the page
breaks you see in the preview are the ones the PDF gets.

Work autosaves as you type.

### Cost sheets

The rates are **not** part of the app. It is a public page, and anything
bundled into it could be read by anyone with the link, so each staff computer
imports the agency's Excel workbook once (Quotation → Cost sheet → Import
Excel file). It is read in the browser and saved in that browser only. To
update rates, import the newer file; countries in it replace the old ones.

The reader understands the agency's existing layout:

- **Rate tables.** Any row with two or more price headings side by side
  starts a table: vehicle sizes (`4 SEATER`, `Small Car (2-4)`, `Innova (4-7)`),
  traveler types (`Adult`, `Child (3-5)`) or `SIC Price` / `Private Price`.
  Each heading becomes one clickable rate on the item. A `0` means not
  offered; text like `400 NP` is shown as a note, never added up.
- **Country and city** come from the sheet name (`vietnam hanoi pvt`,
  `DAD SIC`, `SGN PVT`, `PQC PVT`, `SAPA SIC`, `Thailand`), or a `City` column.
  A sheet named only `PVT SIC` takes the city of the sheet before it.
- **Season.** A line like `1 Jan 2025 - 31 Mar 2026` is kept with each rate;
  once that date passes, results show a "rate season ended" warning.
- Sheets with no rate table, such as a leads list or a hotel roster, are
  skipped and listed after the import.

When a rate is added to a day, vehicle rates count once, adult and child rates
multiply by the travelers in Trip details, and the itinerary shows the working,
for example `INR 2,205 × 2 adults`.

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
| `title \| 2100` | a card title and its cost (kept in the app, never printed) |
| plain line | the card's description |
| `- ...` | a bullet |
| `= ...` | the cost working, e.g. `INR 2,318 × 5 adults` (kept in the app) |

A `Breakfast included` bullet under a hotel is promoted to a pill
automatically. Timing lines like `Full day`, `On arrival` or `15:30 – 21:00`
are recognised as labels even without the brackets.

**Every total is computed for you** — day totals from the card prices, then
base cost, subtotal, GST, TCS, grand total and cost per person. Change a cost
in the Days panel and the totals re-settle when you leave the field.

Nothing the parser decides is final — every value is editable in the preview.

---

## Exports

| Format | What it is |
|---|---|
| **PDF** | Print-ready A4, ~240dpi, page for page identical to the preview. |
| **DOCX** | A real Word file. Text and images editable in Word or Google Docs. |
| **HTML** | Self-contained page, still click-to-edit, prints to a fresh PDF. |

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
index.html    interface shell: itineraries list, setup, workspace
app.css       application chrome
doc.css       the itinerary document; also inlined into the HTML export
brand.js      palette, type and logo constants
parser.js     raw text to model
render.js     model to paginated A4 pages
export.js     PDF, DOCX, HTML
library.js    reads the agency's Excel cost sheets, stores them in the browser
samples.js    the built-in sample plans
app.js        itineraries list, state, editing, photos, autosave
vendor/       jsPDF, html2canvas, JSZip, SheetJS, pdf.js 3.11 (pinned, offline)
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
