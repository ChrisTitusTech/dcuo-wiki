# DCUO Wiki visual system

Reference captured October 20, 2026: [official DC Universe Online homepage](https://www.dcuniverseonline.com/home). Firecrawl returned branding, HTML, and screenshot metadata. The live homepage and its key artwork were also inspected visually in the browser. The root URL redirects to registration, so the homepage is the design reference.

## Observed reference

The official site uses dark blue navigation, an official game logo, prominent comic/game character art, orange calls to action, condensed uppercase headings, and neutral content panels. Its stylesheet loads Oswald and Roboto. Firecrawl reported primary blue #094290, secondary #2E3845, link blue #337AB7, background #E5E5E5, and text #2A2A2A. The registration page also exposes navy #081E44 and orange #FF9933. Extracted heading sizes were inconsistent and were not used as authoritative measurements.

## Wiki adaptation

The wiki uses a dark navy default theme and optional light theme, Oswald headings, Roboto body text, blue rules and links, and restrained orange emphasis. These are adaptations, not a pixel copy of the marketing site.

- Persistent 74px desktop header with search, profile access, and theme control.
- 184px category sidebar; collapsible navigation below 650px.
- Shallow 166px homepage artwork banner, reduced to 138px on mobile.
- Dense guide cards and a 248px supporting column; no marketing carousel or oversized empty hero.
- Article contents alongside the text on wide screens, above it on narrow screens.
- Compact tables and account forms, visible keyboard focus, reduced-motion support.

Exact implementation tokens and responsive breakpoints live in `src/styles/global.css`. Guide counts and categories come from published content rather than static placeholders.

## Art inventory and provenance

| Local asset                      | Official source                                                                  | Use                                  |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| `public/images/dcuo-logo.png`    | https://www.dcuniverseonline.com/images/v4/global/logo/nav-logo.png?v=2755286430 | Header logo with separate WIKI label |
| `public/images/dcuo-key-art.jpg` | https://www.dcuniverseonline.com/images/v4/global/fb-share.jpg?v=3073712053      | Homepage banner, cropped with CSS    |

These are game artwork and trademarks belonging to their respective owners, not original wiki artwork or CC-BY-SA text. The footer and sources page identify the site as an independent community reference. Map images continue to link to source file pages. Fonts load from Google Fonts with local system fallbacks; layout remains usable if that service is unavailable.

## Validation

Desktop homepage and mobile articles were visually inspected. Browser coverage exercises global search from articles, category links, mobile navigation, theme persistence, horizontal overflow, source links, and content tables. Account integration checks cover the shared layout and player forms. Screenshot artifacts are generated under `test-results/` and are not committed.
