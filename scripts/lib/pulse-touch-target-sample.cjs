// Browser-serializable DOM reader shared by the live gate and synthetic fixtures.
// Read rendered dimensions directly; never substitute CSS/offset sizes or wait
// for a passing value. Offscreen is valid for the separate size-only contract.
function samplePulseTouchTarget(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    connected: element.isConnected,
    hasClientRects: element.getClientRects().length > 0,
    visible: getComputedStyle(element).visibility === 'visible',
    semanticHidden: Boolean(element.closest('[hidden], [inert], [aria-hidden="true"]')),
  };
}

function meetsPulseTouchMinimum(target) {
  return target.connected && target.hasClientRects && target.visible
    && !target.semanticHidden && target.width >= 44 && target.height >= 44;
}

module.exports = { samplePulseTouchTarget, meetsPulseTouchMinimum };
