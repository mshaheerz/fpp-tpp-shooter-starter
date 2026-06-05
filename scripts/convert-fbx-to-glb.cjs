#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
const DEFAULT_WATCH_DIR = process.env.FBX_WATCH_DIR || path.join(HOME, 'Downloads');
const DEFAULT_OUT_DIR = path.join(process.cwd(), 'public', 'assets', 'kenney', 'converted');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// The `fbx2gltf` npm package ships a native binary (it has no CLI `bin`, so
// `npx fbx2gltf` fails with "could not determine executable"). Resolve the
// platform binary directly from the installed package.
function resolveFbx2gltfBinary() {
  const platformDir = { Linux: 'Linux', Darwin: 'Darwin', Windows_NT: 'Windows_NT' }[require('os').type()];
  const exe = process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
  try {
    const pkgDir = path.dirname(require.resolve('fbx2gltf/package.json'));
    const bin = path.join(pkgDir, 'bin', platformDir || '', exe);
    if (fs.existsSync(bin)) {
      try { fs.chmodSync(bin, 0o755); } catch {}
      return bin;
    }
  } catch {}
  return null;
}
const FBX2GLTF_BIN = resolveFbx2gltfBinary();

function convert(inputFile, explicitOutputFile, outDir) {
  const base = path.basename(inputFile, path.extname(inputFile));
  const outFile = explicitOutputFile || path.join(outDir, base + '.glb');
  ensureDir(path.dirname(outFile));

  const tryCommands = [];
  if (FBX2GLTF_BIN) tryCommands.push([FBX2GLTF_BIN, ['-b', '-i', inputFile, '-o', outFile]]);
  // Fallbacks in case a global install exposes a CLI.
  tryCommands.push(['fbx2gltf', ['-b', '-i', inputFile, '-o', outFile]]);
  tryCommands.push(['FBX2glTF', ['-b', '-i', inputFile, '-o', outFile]]);

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

const argv = process.argv.slice(2);
const options = {
  once: false,
  help: false,
  inputFile: null,
  outputFile: null,
  outDir: DEFAULT_OUT_DIR,
  watchDir: DEFAULT_WATCH_DIR,
};

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--once') {
    options.once = true;
  } else if (arg === '--help' || arg === '-h') {
    options.help = true;
  } else if (arg === '--out-dir') {
    options.outDir = path.resolve(argv[i + 1]);
    i += 1;
  } else if (arg === '--watch-dir') {
    options.watchDir = path.resolve(argv[i + 1]);
    i += 1;
  } else if (arg === '--output' || arg === '-o') {
    options.outputFile = path.resolve(argv[i + 1]);
    i += 1;
  } else if (!options.inputFile) {
    options.inputFile = path.resolve(arg);
  } else if (!options.outputFile) {
    options.outputFile = path.resolve(arg);
  }
}

ensureDir(options.outDir);

function convertLatestFromWatchDir() {
  const files = fs.readdirSync(options.watchDir).filter((f) => f.toLowerCase().endsWith('.fbx'));
  if (!files.length) {
    console.log('No .fbx files found in', options.watchDir);
    process.exit(0);
  }
  const latest = files
    .map((f) => ({ f, t: fs.statSync(path.join(options.watchDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
  convert(path.join(options.watchDir, latest), options.outputFile, options.outDir);
}

if (options.help) {
  console.log('\nUsage:');
  console.log('  node scripts/convert-fbx-to-glb.cjs ./model.fbx');
  console.log('  node scripts/convert-fbx-to-glb.cjs ./model.fbx ./public/assets/model.glb');
  console.log('  node scripts/convert-fbx-to-glb.cjs --once [--watch-dir ./folder]');
  console.log('  node scripts/convert-fbx-to-glb.cjs [--watch-dir ./folder]');
  console.log('\nOptions:');
  console.log('  --once                 Convert the newest .fbx in the watch folder once');
  console.log('  --watch-dir <dir>      Folder to watch or scan (default: ~/Downloads or FBX_WATCH_DIR)');
  console.log('  --out-dir <dir>        Output folder for generated .glb files');
  console.log('  --output, -o <file>    Explicit output .glb path');
  console.log('\nExamples:');
  console.log('  npm run convert-fbx -- ./player.fbx');
  console.log('  npm run convert-fbx -- ./player.fbx ./public/assets/player.glb');
  console.log('  npm run convert-fbx:once');
  console.log('  npm run convert-fbx:watch -- --watch-dir ~/Downloads');
  process.exit(0);
}

if (options.inputFile) {
  convert(options.inputFile, options.outputFile, options.outDir);
} else if (options.once) {
  convertLatestFromWatchDir();
} else {
  console.log('Watching for .fbx files in', options.watchDir);
  const watcher = chokidar.watch(path.join(options.watchDir, '*.fbx'), {
    persistent: true,
    ignoreInitial: false,
    depth: 0,
  });

  watcher.on('add', (file) => {
    console.log('Detected new FBX:', file);
    setTimeout(() => convert(file, null, options.outDir), 1500);
  });
}
