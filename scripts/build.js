#!/usr/bin/env node
/**
 * Builds release files for copy-paste installs into the Apps Script editor:
 *   dist/Code.gs    all logic (replace on every update)
 *   dist/Config.gs  settings template (edit once, keep across updates)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['ConfigLoader.js', 'Ical.js', 'Sync.js', 'Main.js'];
const REPO = 'https://github.com/andrewmacheret/google-cal-lead-time';

function build() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const header = (lines) => ['/**', ...lines.map((l) => (l ? ` * ${l}` : ' *')), ' */', ''].join('\n');

  const code =
    header([
      `google-cal-lead-time v${version}`,
      REPO,
      '',
      'Generated file: to update, replace this whole file with Code.gs from the latest release.',
      'Your settings live in Config.gs, which you should keep.',
    ]) +
    SOURCES.map((file) => `\n// ---- ${file} ----\n\n${fs.readFileSync(path.join(ROOT, 'src', file), 'utf8').trim()}\n`).join('');

  const config =
    header([`google-cal-lead-time v${version} settings template`, REPO, '', 'Fill this in. Keep it when you update Code.gs.']) +
    '\n' +
    fs.readFileSync(path.join(ROOT, 'Config.example.js'), 'utf8').replace(/^\/\*\*[\s\S]*?\*\/\n/, '');

  return { version, files: { 'Code.gs': code, 'Config.gs': config } };
}

if (require.main === module) {
  const { version, files } = build();
  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dist, name), text);
  console.log(`Built v${version}: ${Object.keys(files).map((f) => `dist/${f}`).join(', ')}`);
}

module.exports = { build };
