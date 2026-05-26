#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
const DOWNLOADS = process.env.FBX_WATCH_DIR || path.join(HOME, 'Downloads');
const OUT_DIR = path.join(process.cwd(), 'public', 'assets', 'kenney', 'converted');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function convert(inputFile) {
  const base = path.basename(inputFile, path.extname(inputFile));
  const outFile = path.join(OUT_DIR, base + '.glb');

  const tryCommands = [
    ['npx', ['fbx2gltf', '-b', '-i', inputFile, '-o', outFile]],
    ['fbx2gltf', ['-b', '-i', inputFile, '-o', outFile]],
  ];

  function runCmd(cmd, args, cb) {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', (err) => cb(err));
    p.on('close', (code) => cb(code === 0 ? null : new Error('Exit ' + code)));
  }

  (function next(i) {
    if (i >= tryCommands.length) {
      console.error('Conversion failed: no suitable converter found. Install `fbx2gltf` or use Blender CLI.');
      return;
    }
    const [cmd, args] = tryCommands[i];
    runCmd(cmd, args, (err) => {
      if (!err) {
        console.log('Converted', inputFile, '→', outFile);
      } else {
        console.warn(cmd, 'failed, trying next option...');
        next(i + 1);
      }
    });
  })(0);
}

console.log('Watching for .fbx files in', DOWNLOADS);

const watcher = chokidar.watch(path.join(DOWNLOADS, '*.fbx'), {
  persistent: true,
  ignoreInitial: false,
  depth: 0,
});

watcher.on('add', (file) => {
  console.log('Detected new FBX:', file);
  setTimeout(() => convert(file), 1500);
});

const argv = process.argv.slice(2);
if (argv.includes('--once')) {
  watcher.close();
  const files = fs.readdirSync(DOWNLOADS).filter((f) => f.toLowerCase().endsWith('.fbx'));
  if (!files.length) {
    console.log('No .fbx files found in', DOWNLOADS);
    process.exit(0);
  }
  const latest = files.map((f) => ({ f, t: fs.statSync(path.join(DOWNLOADS, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
  convert(path.join(DOWNLOADS, latest));
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('\nUsage: node scripts/convert-fbx-to-glb.cjs [--once]');
  console.log('Set FBX_WATCH_DIR to change the watched folder.');
}