# Morrow

A demo café website that Trizen Technologies uses to pitch cafés and café chains. Morrow is a fictional London café.

## Run it

```
npm install
npm run dev       # work on the site at http://localhost:5174
npm run build     # create the finished site in dist/
npm run preview   # view the finished site
```

## How the opening works

The opening is one continuous film of a walk into the café: from above the clouds, down to the street, through the door, past the host and the reservation book, to a table and its menu. The film follows the scroll. Scroll and the camera moves, stop and it rests, scroll up and it goes back. It plays towards the scroll position rather than jumping frame to frame, using a reversed copy of the film for going back, which keeps it smooth. Along the way there are nine stops where the scroll lingers and a line of text appears.

Some moments are made in code rather than film, because they react to the visitor:

- rain, drifting dust in the lamplight, and the shot turning slightly with the pointer
- extra cloud and warm light layered over the two places where the film passes through cloud and through the door's light
- the handwriting in the book, which uses today's date and the next free half hour in London
- the page turn from the book to the table, which follows the scroll
- the menu that lifts off the table and opens, which also follows the scroll

How far you scroll for each second of film and at each stop is set at the top of `src/hero/hero.js`.

## Where things live

| Path | What it holds |
| --- | --- |
| `index.html` | All the page content |
| `src/styles/main.css` | Colours, fonts and layout, with the colours and fonts at the top |
| `src/hero/` | The opening: the stops, the films, the effects, the book and the menu card |
| `src/sections/` | The menu, reservations and visit sections |
| `src/data/menu.js` | Dishes, prices, allergens and opening hours |
| `media/flow/` | Source films, kept exactly as they came from Google Flow |
| `media/concept/` | Source stills, kept exactly as they came from ChatGPT |
| `public/media/` | Web-ready media, generated from `media/` |
| `scripts/prepare_media.py` | Builds `public/media/` from the sources |

## Changing media

Replace a file in `media/flow` or `media/concept`, then run `npm run media`. This needs ffmpeg, and Python with numpy, Pillow, scipy and scikit-image. It takes about twenty minutes. It:

- removes the Veo watermark
- cuts the clips into one film, rendered frame by frame:
  - the first aerial shot is left inside the cloud and the second comes out of it, so the descent happens once
  - holds where a clip slowed to a stop are trimmed
  - shots hand over with morph dissolves: the outgoing shot is zoomed and shifted to sit on the incoming one, then optical flow slides any remaining differences (a turned head, a table seen from a little higher) into place as they blend, so nothing ever shows twice
  - the camera pushes into the open doorway as warm light fills the lens, and comes out of it inside
- uses only the part of the door clip without the hand
- paints out the second shop sign that appears in C3
- grades the door clips to the same blue-hour colour as the street
- writes the film forwards and reversed in two sizes, with `film.json` recording where each stop falls

It rebuilds everything in `public/media` (the favicon sits outside it), so never edit that folder by hand. To check a change to the edit quickly, `python scripts/prepare_media.py --preview <folder>` renders the film at half size in about five minutes, without publishing anything.

Some things are measured from particular frames and need updating if those clips change:

- where each clip is cut, and the alignments between neighbouring shots: the edit section at the top of `scripts/prepare_media.py`
- the second sign's position over time: `SECOND_SIGN` in `scripts/prepare_media.py`
- the book's pages: `BOOK_PAGES` in `src/hero/hero.js`
- the menu on the table: `ON_TABLE` in `src/hero/card.js`

## Re-skinning for a client

The colours and fonts are set in one block at the top of `src/styles/main.css`. To make the site look like a client's café, change those values, the name in `index.html`, the menu in `src/data/menu.js`, and the media.
