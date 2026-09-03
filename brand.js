/* Ghoom Gali brand constants — the single source of truth for every output.
   Values taken verbatim from the brand guidelines, section 01 (Colour palette)
   and section 09 (Typography). Reproduce only with the exact values shown. */
window.GG = {
  colour: {
    abyss:      '#0C2027',   // PRIMARY
    mint:       '#41BF8F',   // SECONDARY
    lantern:    '#E7C547',   // ACCENT
    chai:       '#C4855A',   // TERTIARY
    paper:      '#EEE9E3',   // NEUTRAL
    deepCanopy: '#1C3A32',   // support
    lightMint:  '#EFFAF4',   // surface
    black:      '#000000',
    white:      '#FFFFFF'
  },
  type: {
    display: "'Newsreader', Georgia, 'Times New Roman', serif",
    text:    "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    mono:    "'Space Mono', 'Courier New', monospace"
  },
  // Word cannot embed webfonts; these are the closest safe substitutes.
  docxFonts: { display: 'Georgia', text: 'Calibri', mono: 'Consolas' },
  tagline: 'Explore every gali',
  logos: {
    lockupAbyss:  'assets/logos/lockup-abyss.svg',
    lockupWhite:  'assets/logos/lockup-white.svg',
    lockupMint:   'assets/logos/lockup-mint.svg',
    lockupPlane:  'assets/logos/lockup-plane-mint.svg',
    wordmarkStack:'assets/logos/wordmark-stacked-paper.svg',
    markAbyss:    'assets/logos/mark-abyss.svg',
    markPaper:    'assets/logos/mark-paper.svg',
    markChai:     'assets/logos/mark-chai.svg',
    markPlane:    'assets/logos/mark-plane-mint.svg'
  },
  // Entry kinds. Icons are inline SVG paths drawn on a 24x24 grid.
  kinds: {
    flight:   { label: 'Flight',   colour: 'mint'    },
    transfer: { label: 'Transfer', colour: 'chai'    },
    hotel:    { label: 'Stay',     colour: 'abyss'   },
    activity: { label: 'Activity', colour: 'mint'    },
    meal:     { label: 'Meal',     colour: 'lantern' },
    note:     { label: 'Note',     colour: 'chai'    }
  }
};
