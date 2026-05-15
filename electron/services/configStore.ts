import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectorSettings } from "../types";

const DEFAULT_SETTINGS: ConnectorSettings = {
  cloudBaseUrl: "https://647dab5faf984710854a179a.mockapi.io/tally",
  accessToken: "",
  tallyHost: "127.0.0.1",
  tallyPort: 9000
};

export class ConfigStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "connector-settings.json");
  }

  async getSettings(): Promise<ConnectorSettings> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ConnectorSettings>;
      return {
        cloudBaseUrl: parsed.cloudBaseUrl ?? DEFAULT_SETTINGS.cloudBaseUrl,
        accessToken: parsed.accessToken ?? DEFAULT_SETTINGS.accessToken,
        tallyHost: parsed.tallyHost ?? DEFAULT_SETTINGS.tallyHost,
        tallyPort: parsed.tallyPort ?? DEFAULT_SETTINGS.tallyPort
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(input: ConnectorSettings): Promise<ConnectorSettings> {
    const normalized: ConnectorSettings = {
      cloudBaseUrl: input.cloudBaseUrl.trim() || DEFAULT_SETTINGS.cloudBaseUrl,
      accessToken: input.accessToken?.trim() || DEFAULT_SETTINGS.accessToken,
      tallyHost: input.tallyHost.trim() || DEFAULT_SETTINGS.tallyHost,
      tallyPort: Number.isFinite(input.tallyPort) ? input.tallyPort : DEFAULT_SETTINGS.tallyPort
    };

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }
}
