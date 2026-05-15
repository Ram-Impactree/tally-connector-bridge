import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { TallyDetectionResult, DetectionStatus } from "../types";

const execAsync = promisify(exec);

const DEFAULT_PATHS = [
  "C:/Program Files/TallyPrime/TallyPrime.exe",
  "C:/Program Files (x86)/Tally.ERP9/Tally.ERP9.exe",
  "C:/TallyPrime/TallyPrime.exe",
  "C:/Tally.ERP9/Tally.ERP9.exe"
];

const TALLY_PROCESS_NAMES = [
  "TallyPrime.exe",
  "Tally.ERP9.exe"
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(path.normalize(filePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isTallyRunning(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq TallyPrime.exe" /NH');
    if (stdout.includes("TallyPrime.exe")) {
      return true;
    }

    const { stdout: stdout2 } = await execAsync('tasklist /FI "IMAGENAME eq Tally.ERP9.exe" /NH');
    return stdout2.includes("Tally.ERP9.exe");
  } catch {
    return false;
  }
}

async function detectFromRegistry(): Promise<string[]> {
  if (process.platform !== "win32") {
    return [];
  }

  const regTargets = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
  ];

  const found: string[] = [];
  for (const target of regTargets) {
    try {
      const { stdout } = await execAsync(`reg query ${target} /s /f Tally /d`);
      const installLocationMatches = stdout.match(/InstallLocation\s+REG_\w+\s+(.+)/g) ?? [];
      for (const line of installLocationMatches) {
        const cleaned = line.replace(/InstallLocation\s+REG_\w+\s+/, "").trim();
        if (cleaned.length > 0) {
          found.push(cleaned);
        }
      }
    } catch {
      // Ignore registry read failures and continue with other probes.
    }
  }

  return [...new Set(found)];
}

export async function detectTallyInstallation(): Promise<TallyDetectionResult> {
  const checks: string[] = [];
  const foundPaths: string[] = [];

  try {
    const registryPaths = await detectFromRegistry();
    if (registryPaths.length > 0) {
      checks.push("registry-match");
      foundPaths.push(...registryPaths);
    }

    for (const possiblePath of DEFAULT_PATHS) {
      if (await exists(possiblePath)) {
        checks.push(`path-found:${possiblePath}`);
        foundPaths.push(possiblePath);
      }
    }

    const isRunning = await isTallyRunning();
    if (isRunning) {
      checks.push("process-running");
    }

    let status: DetectionStatus;
    if (checks.length >= 2 || isRunning) {
      status = "installed";
    } else if (checks.length === 1) {
      status = "likelyInstalled";
    } else {
      status = "notFound";
    }

    return {
      status,
      foundPaths: [...new Set(foundPaths)],
      checks,
      isRunning
    };
  } catch (error) {
    return {
      status: "error",
      foundPaths: [...new Set(foundPaths)],
      checks,
      errorMessage: String(error),
      isRunning: false
    };
  }
}
