#!/usr/bin/env node
/**
 * Bundles src/ into two Apps Script files:
 *   Code    all logic (replace on every update)
 *   Config  settings (edit once, keep across updates)
 *
 *   node scripts/build.js           → dist/Code.gs + dist/Config.gs (release; Config is the template)
 *   node scripts/build.js --deploy  → build/ for `clasp push` (Config is your src/Config.js)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['ConfigLoader.js', 'Ical.js', 'Sync.js', 'Main.js'];
const REPO = 'https://github.com/andrewmacheret/google-cal-lead-time';

const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const header = (lines) => ['/**', ...lines.map((l) => (l ? ` * ${l}` : ' *')), ' */', ''].join('\n');

function build() {
  const { version } = JSON.parse(read('package.json'));
  const code =
    header([
      `google-cal-lead-time v${version}`,
      REPO,
      '',
      'Generated file: to update, replace this whole file with Code.gs from the latest release.',
      'Your settings live in Config.gs, which you should keep.',
    ]) +
    SOURCES.map((file) => `\n// ---- ${file} ----\n\n${read('src', file).trim()}\n`).join('');

  const config =
    header([`google-cal-lead-time v${version} settings template`, REPO, '', 'Fill this in. Keep it when you update Code.gs.']) +
    '\n' +
    read('Config.example.js').replace(/^\/\*\*[\s\S]*?\*\/\n/, '');

  return { version, files: { 'Code.gs': code, 'Config.gs': config } };
}

function write(dir, files) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return Object.keys(files).map((f) => path.relative(ROOT, path.join(dir, f)));
}

if (require.main === module) {
  const { version, files } = build();
  let written;
  if (process.argv.includes('--deploy')) {
    if (!fs.existsSync(path.join(ROOT, 'src', 'Config.js'))) {
      console.error('Missing src/Config.js. Run: cp Config.example.js src/Config.js');
      process.exit(1);
    }
    written = write(path.join(ROOT, 'build'), {
      'Code.js': files['Code.gs'],
      'Config.js': read('src', 'Config.js'),
      'appsscript.json': read('src', 'appsscript.json'),
    });
  } else {
    written = write(path.join(ROOT, 'dist'), files);
  }
  console.log(`Built v${version}: ${written.join(', ')}`);
}

module.exports = { build };
