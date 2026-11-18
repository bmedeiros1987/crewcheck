/** An outside navigation control must never bypass an active modal/focus trap. */
export function isHeaderNavigationSuppressed(button: HTMLButtonElement | null): boolean {
  if (!button) return false;
  if (button.closest('[inert], [aria-hidden="true"]')) return true;
  const doc = button.ownerDocument, view = doc.defaultView;
  if (!view) return false;
  const modals = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[aria-modal="true"]'));
  // Native modal dialogs need not carry an explicit ARIA attribute.
  try { for (const modal of Array.from(doc.querySelectorAll<HTMLElement>('dialog:modal'))) if (!modals.includes(modal)) modals.push(modal); } catch { /* Older selector engines lack :modal. */ }
  return modals.some(modal => {
    if (modal.contains(button) || modal.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let node: Element | null = modal; node; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    const rect = modal.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

/** Only an existing, reachable navigation control may replace the header Menu. */
export function isAvailableHeaderAction(button: HTMLButtonElement | null): button is HTMLButtonElement {
  if (!button || !button.isConnected || button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') return false;
  const doc = button.ownerDocument, view = doc.defaultView;
  if (!view || button.closest('[hidden], [inert], [aria-hidden="true"]') || isHeaderNavigationSuppressed(button)) return false;
  for (let node: Element | null = button; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  }
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) return false;
  // A geometrically present footer behind a dialog is not a usable replacement.
  const hit = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(x, y) : null;
  return Boolean(hit && button.contains(hit));
}

export function availableBottomMenu(doc: Document): HTMLButtonElement | null {
  const button = doc.querySelector<HTMLButtonElement>('body > nav.cz-bottom-nav button[data-crewcheck-menu-trigger="true"]');
  return isAvailableHeaderAction(button) ? button : null;
}

export function availablePulseReturnTarget(app: Element | null): HTMLButtonElement | null {
  if (!app) return null;
  const header = app.querySelector<HTMLButtonElement>('.cz-global-header .cz-menu-btn');
  return isAvailableHeaderAction(header) ? header : availableBottomMenu(app.ownerDocument);
}
