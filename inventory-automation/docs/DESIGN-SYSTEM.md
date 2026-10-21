# Design System — Typography, spacing, colour

Light-only product UI. Tokens live at the top of `app/src/styles.css`.

## Type scale

| Token | Size | Used for |
|---|---|---|
| `--text-xs` | 11px | table headers, stat labels, field labels, badges |
| `--text-sm` | 12.5px | hints, helper copy, page subtitles (13px) |
| `--text-base` | 14px | body text, inputs, menus |
| `--text-md` | 15px | card titles |
| `--text-lg` | 18px | large dialog headings |
| `--text-xl` | 20px | **topbar page header** (the single header) |
| `--text-2xl` | 28px | KPI values |
| `--text-3xl` | 32px | login heading |

Weights: body 400, nav 600, labels 700, card titles 700, KPI/header 800.

## Spacing

| Area | Value |
|---|---|
| Content gutter | 4px |
| Card grid gap | 4px |
| Stack gap | 6px |
| Card header / body padding | 10×12 / 12px |
| Table cell padding | 8×10px |
| Card radius | 6px |

## Colour

- Brand: **#0078FF** (strong `#0062D6`, soft `rgba(0,120,255,.10)`)
- Canvas: `#EEF2F7`
- Cards: `#FFFFFF`, border `#E3E8EF`
- Text: `#0B1220`; muted `#5B6B7F`
- No dark theme (light-only).
