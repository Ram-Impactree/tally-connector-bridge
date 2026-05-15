export interface SyncPayload {
  source: "tally";
  companyName: string;
  records: Array<Record<string, unknown>>;
}

export interface SyncResponse {
  syncId: string;
  acceptedAtIso: string;
}

export class CloudClient {
  constructor(
    private readonly cloudBaseUrl: string,
    private readonly accessToken: string
  ) {}

  async submitSync(payload: SyncPayload): Promise<SyncResponse> {
    const url = this.cloudBaseUrl.trim();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Cloud sync failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
