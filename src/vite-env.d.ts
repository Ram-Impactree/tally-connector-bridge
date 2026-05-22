interface ConnectorSettings {
  cloudBaseUrl: string;
  accessToken: string;
  tallyHost: string;
  tallyPort: number;
}

interface TallyDetectionResult {
  status: "installed" | "likelyInstalled" | "notFound" | "error";
  foundPaths: string[];
  checks: string[];
  errorMessage?: string;
  isRunning?: boolean;
}

interface TallyConnectionResult {
  ok: boolean;
  endpoint: string;
  latencyMs?: number;
  message: string;
  httpStatus?: number;
}

interface TallyListItem {
  name: string;
  closingBalance?: string;
  openingBalance?: string;
  guid?: string;
  parent?: string;
  [key: string]: unknown;
}

interface TallyListResult {
  ok: boolean;
  message: string;
  items: TallyListItem[];
}

interface SystemStatus {
  tally: TallyDetectionResult;
  settings: ConnectorSettings;
}

interface ConnectorApi {
  getSystemStatus: () => Promise<SystemStatus>;
  saveSettings: (settings: ConnectorSettings) => Promise<ConnectorSettings>;
  testTallyEndpoint: (host: string, port: number) => Promise<TallyConnectionResult>;
  listTallyCompanies: (host: string, port: number) => Promise<TallyListResult>;
  listTallyLedgers: (host: string, port: number) => Promise<TallyListResult>;
  syncCompaniesToCloud: (companies: string[], cloudBaseUrl: string, accessToken: string) => Promise<{
    ok: boolean;
    data?: any;
    error?: string;
  }>;
  syncLedgersToCloud: (ledgers: TallyListItem[], cloudBaseUrl: string, accessToken: string) => Promise<{
    ok: boolean;
    data?: any;
    error?: string;
  }>;
}

declare global {
  interface Window {
    connectorApi: ConnectorApi;
  }
}

export {};
