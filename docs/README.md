# er-web — the project in a browser

A static, fully browsable copy of [ELDEN-RING-Combat-Rewrite](https://github.com/Funny-Bones/ELDEN-RING-Combat-Rewrite),
built from this repository's own source. Everything the upstream project
publishes — docs and code alike — is readable in the browser, no install.

**[Live on GitHub Pages](https://mwimwii.github.io/er-web/)**

## Why a website and not the game

The upstream project is a **native desktop application**: Rust on Bevy, a window,
a GPU, keyboard/gamepad input. It is not a web app, and it cannot be run in a
browser:

1. The build needs `src/sim/extracted.rs`, `assets/player_anims.bin` and the
   sounds — generated from your own copy of Elden Ring by `tools/setup.py`.
   None of it ships in the repo (the fan project is code only).
2. `tools/erfmt.py` loads the game's `oo2core_6_win64.dll` through
   `ctypes.WinDLL`, so even the data extraction is Windows-only.
3. It needs a desktop graphics context; there is no browser build path.

This site is the honest maximum: the whole project, readable everywhere.

## What the site has

- The upstream README rendered in full, with a linked table of contents
- Every file, syntax highlighted, with **clickable line numbers** that copy
  permalinks to exact lines (`#L123`)
- A file tree with live filtering, `[` / `]` to move to the previous/next file
- **Full-text search** across every file (`/`, or `/search.html?q=guard`)
- Light and dark themes (`t`), a mobile drawer layout, copy buttons on every
  code block, friendly 404s
- A status panel documenting the verified build blockers

## Build it locally

```bash
npm ci          # marked + highlight.js, nothing else
node gen.mjs    # writes site/ from this checkout
node server.mjs 8090   # http://localhost:8090
```

`node gen.mjs` reads the current checkout (`ER_SRC` to point elsewhere, `ER_OUT`
to change the output). `site/` is committed so Pages can serve it as-is.

## Verify a build

```bash
bash verify-static.sh http://localhost:8090 site   # JS syntax, anchors, tag balance
bash audit.sh site                                 # every URL returns 200
```

## Continuous deployment

`.github/workflows/pages.yml` rebuilds `site/` on every push to `main` and
deploys it to GitHub Pages.
