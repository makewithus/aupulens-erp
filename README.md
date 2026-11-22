# Aupulens UI Kit

Developer reference for the Aupulens ERP design system: brandbook, theme tokens (light and dark), navigation, containers, buttons, forms, overlays, data display, and the zoomable analytics chart.

The components here are copied as-is from the ERP. Keep them in sync when the ERP versions change.

## Run

```bash
npm install
npm run dev      # http://localhost:3000 → redirects to /ui-kit
npm test         # chart data / zoom-pan logic tests
```

## Where things live

| What | Path |
| --- | --- |
| UI kit page | `app/ui-kit/page.tsx` |
| Theme tokens (light `:root`, dark `.dark`) | `app/globals.css` |
| Fonts (Roboto, Roboto Mono, bundled) | `app/fonts.ts`, `app/fonts/` |
| Shared UI primitives | `components/ui/` |
| Analytics explorer chart | `components/charts/AnalyticsExplorerChart.tsx` |
| Chart dummy data + zoom/pan logic | `lib/charts/flowExplorer.ts` |
| Theme toggle state | `store/themeStore.ts` |

## Chart controls

- Scroll to zoom around the cursor.
- Drag, Shift+scroll, or ←/→ to move through time; `+`/`-` to zoom; `0` or double-click to reset.
- Use the navigator strip under the chart to jump to any part of the history.
