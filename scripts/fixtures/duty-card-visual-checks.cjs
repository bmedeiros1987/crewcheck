const assert = require('node:assert/strict');

function luminance(color) {
  const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
    v /= 255;
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

async function inspectDutyContrast(page) {
  const details = page.locator('.cc-canonical-duty-details');
  const colors = await details.evaluate(el => {
    const summary = el.querySelector('summary'), calculator = el.parentElement.querySelector('.cc-duty-calculator-shortcut');
    return {
      surface: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(summary).color,
      marker: getComputedStyle(summary, '::marker').color,
      reason: getComputedStyle(el.querySelector('p')).color,
      calculator: getComputedStyle(calculator).color,
      calculatorSurface: getComputedStyle(el.parentElement).backgroundColor,
    };
  });
  const ratios = {
    text: contrast(colors.text, colors.surface),
    marker: contrast(colors.marker, colors.surface),
    reason: contrast(colors.reason, colors.surface),
    calculator: contrast(colors.calculator, colors.calculatorSurface),
  };
  for (const key of ['text', 'reason', 'calculator']) assert.ok(ratios[key] >= 4.5, `${key} contrast ${ratios[key]}: ${JSON.stringify(colors)}`);
  assert.ok(ratios.marker >= 3, `marker contrast ${ratios.marker}`);
  return { colors, ratios };
}

async function focusDutyAction(page, selector) {
  const action = page.locator(selector);
  await action.focus();
  await action.evaluate(el => el.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const geometry = await action.evaluate(el => {
    const box = el.getBoundingClientRect(), footer = document.querySelector('body > nav.cz-bottom-nav');
    const footerTop = footer ? footer.getBoundingClientRect().top : innerHeight;
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { top: box.top, bottom: box.bottom, height: box.height, footerTop, focused: document.activeElement === el, unobstructed: el === top || el.contains(top), outline: parseFloat(getComputedStyle(el).outlineWidth) };
  });
  assert.equal(geometry.focused, true);
  assert.equal(geometry.unobstructed, true, JSON.stringify(geometry));
  assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.footerTop, JSON.stringify(geometry));
  assert.ok(geometry.height >= 44 && geometry.outline >= 2, JSON.stringify(geometry));
  return geometry;
}

module.exports = { inspectDutyContrast, focusDutyAction };
