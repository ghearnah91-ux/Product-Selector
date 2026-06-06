# Brooke Air Product Selector V2

Static HTML prototype designed for GitHub Pages hosting.

## What is included

- Product selector based on engineering intent
- Product recommendations with reasons and warnings
- Product configurator using the grille compatibility matrix
- Product library browser
- Engineering rules, common mistakes and data gaps view
- Exportable plain-text selection summary

## Files

- `index.html` – main page
- `style.css` – styling
- `app.js` – application logic
- `data.js` – structured product, rules and compatibility data
- `.nojekyll` – allows GitHub Pages to serve files without Jekyll processing

## Run locally

Open `index.html` in a modern browser.

## Host on GitHub Pages

1. Create a GitHub repository, for example `brookeair-product-selector`.
2. Upload the files in this folder to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/root` folder.
6. Save and wait for GitHub Pages to publish.

## Current limitations

- This is a static app, so there is no login, database or saved history.
- Technical selections still require datasheet review before issue.
- 4-way diffuser is included as a V1 placeholder and needs datasheet/performance data.
- Compatibility validation currently uses the grille compatibility matrix only.
- Nomogram data has been treated as approximate where converted into visible points.

## Suggested next build steps

1. Add the missing 4-way diffuser data.
2. Expand compatibility validation beyond grilles.
3. Add admin-friendly JSON editing or CSV import.
4. Add specification text generation.
5. Add print/PDF output.
