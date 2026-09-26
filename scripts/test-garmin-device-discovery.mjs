import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverDevices,
  renderManifestProducts,
} from '../peripherals/garmin/tools/deviceDiscovery.mjs';

function addDevice(root, folder, displayName, deviceId = folder) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'compiler.json'),
    JSON.stringify({ deviceId, displayName }),
  );
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-garmin-devices-'));
try {
  addDevice(root, 'fenix8', 'fēnix® 8 47mm');
  addDevice(root, 'd2mach2pro', 'D2™ Mach 2 Pro');
  addDevice(root, 'fr965', 'Forerunner® 965');
  addDevice(root, 'venu3', 'Venu® 3');
  addDevice(root, 'edge1050', 'Edge® 1050');
  addDevice(root, 'd2airx10', 'D2™ Air X10');

  const devices = discoverDevices(root);
  assert.deepEqual(
    devices.map(({ deviceId, family }) => [deviceId, family]),
    [
      ['d2airx10', 'd2'],
      ['d2mach2pro', 'd2'],
      ['fenix8', 'fenix-epix'],
      ['fr965', 'forerunner'],
      ['venu3', 'venu'],
    ],
    'D2 must qualify first, followed by fenix/epix, Forerunner and Venu; unrelated devices stay out',
  );

  assert.equal(
    renderManifestProducts(devices),
    [
      '            <iq:product id="d2airx10"/>',
      '            <iq:product id="d2mach2pro"/>',
      '            <iq:product id="fenix8"/>',
      '            <iq:product id="fr965"/>',
      '            <iq:product id="venu3"/>',
    ].join('\n'),
    'manifest fragment must use exact IDs read from installed compiler.json files',
  );

  const mismatchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-garmin-mismatch-'));
  try {
    addDevice(mismatchRoot, 'd2mach2', 'D2™ Mach 2', 'invented-id');
    assert.throws(
      () => discoverDevices(mismatchRoot),
      /Device id mismatch/,
      'folder/compiler disagreement must fail closed instead of guessing a product id',
    );
  } finally {
    fs.rmSync(mismatchRoot, { recursive: true, force: true });
  }

  console.log(`PASS Garmin device discovery (${devices.length} qualified fixtures)`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
