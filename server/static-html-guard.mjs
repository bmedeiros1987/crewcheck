// Shared by the canonical static handler and build sealing. Preserve this guard
// exactly once so the sealed HTML bytes equal both static and SPA responses.
export const FLOATING_SHORTCUT_GUARD = '<style id="cc-no-floating-shortcuts">a[aria-label="Conectar Telegram"],a[aria-label="Gerenciar contas de parceiros"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}</style>';
export function guardStaticHtml(html) {
  return html.includes(FLOATING_SHORTCUT_GUARD) ? html : html.replace('</head>', FLOATING_SHORTCUT_GUARD + '</head>');
}
