# LODGEMATE AI

Frontend-only static website. No build step, no server, no dependencies.

- Open locally: double-click `index.html`.
- Vercel: import the folder, Framework Preset "Other", leave Build Command and Output Directory empty.

Structure
- `index.html`   entry page
- `css/style.css` all styles (light and dark themes)
- `js/data.js`   the bundled workbook, column-encoded
- `js/engine.js` analytics: forecasting, pricing, staffing, inventory, alerts, data checks
- `js/charts.js` SVG chart kit
- `js/ui_core.js` state, approvals, navigation
- `js/views1-4.js` the 19 sections
- `js/main.js`   start-up
- `assets/favicon.svg`

Uploading a new workbook (Data & Quality page) loads SheetJS from cdnjs and needs internet access.
