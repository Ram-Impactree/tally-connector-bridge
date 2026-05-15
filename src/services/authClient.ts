export interface AuthToken {
  accessToken: string;
  expiresAtIso: string;
}

export interface PairingRequest {
  pairingCode: string;
  deviceName: string;
}

export class AuthClient {
  constructor(private readonly cloudBaseUrl: string) {}

  async pairDevice(_input: PairingRequest): Promise<AuthToken> {
    throw new Error(
      `Not implemented: integrate with ${this.cloudBaseUrl}/connector/auth/pair endpoint`
    );
  }

  async refreshToken(_accessToken: string): Promise<AuthToken> {
    throw new Error(
      `Not implemented: integrate with ${this.cloudBaseUrl}/connector/auth/refresh endpoint`
    );
  }
}
