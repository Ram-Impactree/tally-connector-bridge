#!/usr/bin/env node
const { spawnSync } = require('child_process');
const os = require('os');

function run(command, args) {
  console.log('> ' + [command].concat(args).join(' '));
  const res = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

const platform = os.platform();

if (platform !== 'darwin' && process.env.FORCE_MAC !== 'true') {
  console.error('macOS builds must be run from a macOS host.');
  console.error('Set FORCE_MAC=true to attempt a build from this host, but macOS builds generally require macOS.');
  process.exit(1);
}

try {
  run('npm', ['run', 'build']);
  run('npx', ['electron-builder', '--mac', '--x64']);
  run('npx', ['electron-builder', '--mac', '--arm64']);
  console.log('macOS x64 and arm64 builds finished.');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
