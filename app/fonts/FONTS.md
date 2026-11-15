# Fonts · 字体 · Polices

| Font | Used for | License |
|---|---|---|
| **MaxRIous** (`maxrious-400.woff2`, `maxrious-700.woff2`) | Latin letters, digits, punctuation — the whole UI | © 2026 C0curic Studio. Our own typeface, included so the snapshot looks as designed. You may use, copy and redistribute it **as part of Hugluno Snapshot** (including your forks and self-hosted deployments of it). Any other use, or selling the font on its own, needs written permission from C0curic Studio. |
| **MaxCN** (`cn/*.woff2`) | Simplified Chinese (GB2312 subset) paired with MaxRIous | Subset of *Noto Sans CJK SC*, © Adobe, **SIL Open Font License 1.1** — see `OFL-1.1.txt` |
| **KaTeX_\*** (`../vendor/fonts/`) | Math formulas only (rendered by KaTeX) | KaTeX fonts, MIT / SIL OFL — the one exception to "own fonts only": MaxRIous has no math glyphs |

The UI never falls back to a system font family: `tools/audit.mjs` fails the build if any CSS names another font.
界面绝不回落到系统字体：`tools/audit.mjs` 发现 CSS 里写了别的字体就会报错。L’interface ne retombe jamais sur une police système.
