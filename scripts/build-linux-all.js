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
const isLinuxCapable = platform === 'linux' || platform === 'darwin';

if (!isLinuxCapable && process.env.FORCE_LINUX !== 'true') {
  console.error('Linux builds must be run from a Linux or macOS host.');
  console.error('Set FORCE_LINUX=true to attempt a build from this host, but it may still fail.');
  process.exit(1);
}

try {
  run('npm', ['run', 'build']);
  run('npx', ['electron-builder', '--linux', '--x64']);
  if (process.env.FORCE_LINUX_IA32 === 'true') {
    run('npx', ['electron-builder', '--linux', '--ia32']);
  } else {
    console.log('Skipping Linux ia32 build. Set FORCE_LINUX_IA32=true to attempt it.');
  }
  console.log('Linux x64 build finished.');
  if (process.env.FORCE_LINUX_IA32 === 'true') {
    console.log('Linux ia32 build attempted.');
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
