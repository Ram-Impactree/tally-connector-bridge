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

async function main() {
  try {
    // Build renderer and electron first
    run('npm', ['run', 'build']);

    // Always build Windows targets (produce separate exe files)
    run('npx', ['electron-builder', '--win', '--x64']);
    run('npx', ['electron-builder', '--win', '--ia32']);

    const platform = os.platform();
    if (platform === 'linux' || platform === 'darwin') {
      // Build Linux targets on Linux/mac hosts
      try {
        run('npx', ['electron-builder', '--linux', '--x64']);
      } catch (err) {
        console.warn('Linux x64 build failed or requires additional tooling. Skipping Linux x64 build.');
      }
      try {
        run('npx', ['electron-builder', '--linux', '--ia32']);
      } catch (err) {
        console.warn('Linux ia32 build failed or requires additional tooling. Skipping Linux ia32 build.');
      }
    } else {
      console.log('Skipping Linux build on Windows host.');
      console.log('If you want to attempt Linux builds from Windows, set FORCE_LINUX_X64=true or FORCE_LINUX_IA32=true.');
      if (process.env.FORCE_LINUX_X64 === 'true') {
        try {
          run('npx', ['electron-builder', '--linux', '--x64']);
        } catch (err) {
          console.warn('Linux x64 build failed.');
        }
      }
      if (process.env.FORCE_LINUX_IA32 === 'true') {
        try {
          run('npx', ['electron-builder', '--linux', '--ia32']);
        } catch (err) {
          console.warn('Linux ia32 build failed.');
        }
      }
    }

    if (platform === 'darwin') {
      run('npx', ['electron-builder', '--mac', '--x64']);
      run('npx', ['electron-builder', '--mac', '--arm64']);
    } else {
      console.log('Skipping macOS build: not running on macOS host.');
      console.log('If you want to attempt macOS builds from a non-mac host, set FORCE_MAC_X64=true or FORCE_MAC_ARM=true.');
      if (process.env.FORCE_MAC_X64 === 'true') {
        try {
          run('npx', ['electron-builder', '--mac', '--x64']);
        } catch (err) {
          console.warn('macOS x64 build failed. macOS builds generally require a macOS host.');
        }
      }
      if (process.env.FORCE_MAC_ARM === 'true') {
        try {
          run('npx', ['electron-builder', '--mac', '--arm64']);
        } catch (err) {
          console.warn('macOS arm64 build failed. macOS builds generally require a macOS host.');
        }
      }
    }

    console.log('All requested builds finished (some may have been skipped).');
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
