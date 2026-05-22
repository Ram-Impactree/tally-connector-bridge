export type DetectionStatus = "installed" | "likelyInstalled" | "notFound" | "error";

export interface ConnectorSettings {
  cloudBaseUrl: string;
  accessToken: string;
  tallyHost: string;
  tallyPort: number;
}

export interface TallyDetectionResult {
  status: DetectionStatus;
  foundPaths: string[];
  checks: string[];
  errorMessage?: string;
  isRunning?: boolean;
}

export interface TallyConnectionResult {
  ok: boolean;
  endpoint: string;
  latencyMs?: number;
  message: string;
  httpStatus?: number;
}

export interface TallyListItem {
  name: string;
  closingBalance?: string;
  openingBalance?: string;
  guid?: string;
  parent?: string;
  [key: string]: unknown;
}

export interface TallyListResult {
  ok: boolean;
  message: string;
  items: TallyListItem[];
}

export interface SystemStatus {
  tally: TallyDetectionResult;
  settings: ConnectorSettings;
}
