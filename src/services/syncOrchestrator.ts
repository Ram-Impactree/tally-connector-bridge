import type { SyncPayload } from "./cloudClient";
import { CloudClient } from "./cloudClient";

export interface SyncState {
  status: "idle" | "syncing" | "error" | "success";
  lastSuccessAt?: string;
  lastError?: string;
}

export class SyncOrchestrator {
  private state: SyncState = { status: "idle" };
  private cloudClient?: CloudClient;

  setCloudClient(client: CloudClient) {
    this.cloudClient = client;
  }

  getState(): SyncState {
    return this.state;
  }

  async runManualSync(payload: SyncPayload): Promise<SyncState> {
    if (!this.cloudClient) {
      this.state = {
        ...this.state,
        status: "error",
        lastError: "Cloud client not configured"
      };
      return this.state;
    }

    this.state = { ...this.state, status: "syncing" };

    try {
      await this.cloudClient.submitSync(payload);
      this.state = {
        ...this.state,
        status: "success",
        lastSuccessAt: new Date().toISOString()
      };
    } catch (error) {
      this.state = {
        ...this.state,
        status: "error",
        lastError: String(error)
      };
    }

    return this.state;
  }

  async syncCompaniesData(companies: string[], cloudBaseUrl: string, accessToken: string = ""): Promise<SyncState> {
    const payload: SyncPayload = {
      source: "tally",
      companyName: "All Companies",
      records: companies.map(name => ({ name }))
    };

    this.cloudClient = new CloudClient(cloudBaseUrl, accessToken);
    return this.runManualSync(payload);
  }
}
