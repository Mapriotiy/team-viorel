# Game mode tile art

Drop the artwork here and it appears on the mode picker in `CreateLobbyModal`.
No code change is needed — a missing file just leaves the tile on its flat
background.

| File                  | Mode         |
| --------------------- | ------------ |
| `free-for-all.webp`   | Free for All |
| `team-battle.webp`    | Team Battle  |
| `bingo.webp`          | Bingo        |

## Spec

- **Square, 512x512.** The tile is `aspect-square` and roughly 120px wide on a
  desktop modal, so it's rendered far below native size — detail smaller than
  about 8px at 512 disappears.
- **Keep the subject in the top two thirds.** The bottom ~40% sits under a
  `black/80 -> transparent` scrim that carries the mode label.
- **Dark and low-contrast at the edges.** The tile sits on `#1f1f1f` with a
  `#3a3a3a` border; bright corners make the border look broken.
- **Match the accent.** `#ffa116` is the app's orange. Art that leans warm reads
  as part of the UI; art that leans blue fights the selected-state border.
- **WebP, under ~60KB each.** These load on the dashboard's first modal open.

## Licensing

Whatever the source, it has to be redistributable — this repo deploys to GitHub
Pages, so the files are public. Record the source and license below when you add
art.

All three current tiles were generated with Canva's AI design generation on
2026-07-31 and exported at 1024x1024 PNG, then downsampled to 512x512 WebP
(quality 82). Usage rights follow the Canva AI Product Terms for the account
that generated them — worth confirming before this repo goes commercial.

| File                | Source                        | Canva design ID |
| ------------------- | ----------------------------- | --------------- |
| `free-for-all.webp` | Canva AI, "Campaign Table"    | `DAHQ-yC3Nps`   |
| `team-battle.webp`  | Canva AI, "Cinematic Army"    | `DAHQ-zhTyIw`   |
| `bingo.webp`        | Canva AI, "Close-Up Bingo"    | `DAHQ-_iUqWA`   |

The originals stay editable in Canva under those IDs, so a re-export at a
different crop or lighting doesn't mean regenerating from scratch.
