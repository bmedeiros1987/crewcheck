import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeName(value) {
  return String(value ?? '')
    // Strip symbols before compatibility normalization. Under NFKD, ™ becomes the letters "TM",
    // which would otherwise turn "D2™ Mach" into "D2TM Mach" and break family discovery.
    .replace(/[\u2122\u00ae]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function targetFamily(displayName) {
  const name = normalizeName(displayName).toLowerCase();
  if (/^d2\s+(mach 2 pro|mach 2|mach 1 pro|mach 1|air x15|air x10)\b/.test(name)) return 0;
  if (/^(fenix|epix)\b/.test(name)) return 1;
  if (/^forerunner\b/.test(name)) return 2;
  if (/^venu\b/.test(name)) return 3;
  return null;
}

function familyLabel(priority) {
  return ['d2', 'fenix-epix', 'forerunner', 'venu'][priority] ?? 'other';
}

export function discoverDevices(devicesRoot) {
  if (!devicesRoot) throw new Error('devicesRoot is required');
  const root = path.resolve(devicesRoot);
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const devices = [];
  for (const entry of entries) {
    const compilerPath = path.join(root, entry.name, 'compiler.json');
    if (!fs.existsSync(compilerPath)) continue;

    let compiler;
    try {
      compiler = JSON.parse(fs.readFileSync(compilerPath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid compiler.json for ${entry.name}: ${error.message}`);
    }

    const deviceId = String(compiler.deviceId ?? compiler.deviceID ?? '').trim();
    const displayName = String(compiler.displayName ?? '').trim();
    if (!deviceId || !displayName) continue;
    if (deviceId !== entry.name) {
      throw new Error(`Device id mismatch: folder=${entry.name} compiler.deviceId=${deviceId}`);
    }

    const priority = targetFamily(displayName);
    if (priority === null) continue;

    devices.push({
      deviceId,
      displayName,
      family: familyLabel(priority),
      priority,
    });
  }

  return devices.sort((a, b) =>
    a.priority - b.priority
      || a.displayName.localeCompare(b.displayName)
      || a.deviceId.localeCompare(b.deviceId));
}

export function renderManifestProducts(devices) {
  return devices
    .map(({ deviceId }) => `            <iq:product id="${deviceId}"/>`)
    .join('\n');
}

function parseArgs(argv) {
  let devicesRoot = null;
  let manifestFragment = false;
  for (const arg of argv) {
    if (arg === '--manifest-fragment') manifestFragment = true;
    else if (!devicesRoot) devicesRoot = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return { devicesRoot, manifestFragment };
}

function printUsage() {
  process.stderr.write(
    'Usage: node peripherals/garmin/tools/deviceDiscovery.mjs <ConnectIQ/Devices> [--manifest-fragment]\n',
  );
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  try {
    const { devicesRoot, manifestFragment } = parseArgs(process.argv.slice(2));
    if (!devicesRoot) {
      printUsage();
      process.exitCode = 2;
    } else {
      const devices = discoverDevices(devicesRoot);
      if (manifestFragment) {
        process.stdout.write(`${renderManifestProducts(devices)}${devices.length ? '\n' : ''}`);
      } else {
        process.stdout.write(`${JSON.stringify(devices, null, 2)}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
