import { contextBridge, ipcRenderer } from "electron";
import type { ConnectorSettings } from "./types";

const api = {
  getSystemStatus: () => ipcRenderer.invoke("connector:getSystemStatus"),
  saveSettings: (settings: ConnectorSettings) => ipcRenderer.invoke("connector:saveSettings", settings),
  testTallyEndpoint: (host: string, port: number) =>
    ipcRenderer.invoke("connector:testTallyEndpoint", host, port),
  listTallyCompanies: (host: string, port: number) =>
    ipcRenderer.invoke("connector:listTallyCompanies", host, port),
  listTallyLedgers: (host: string, port: number) =>
    ipcRenderer.invoke("connector:listTallyLedgers", host, port),
  syncCompaniesToCloud: (companies: string[], cloudBaseUrl: string, accessToken: string) =>
    ipcRenderer.invoke("connector:syncCompaniesToCloud", companies, cloudBaseUrl, accessToken),
  syncLedgersToCloud: (ledgers: unknown[], cloudBaseUrl: string, accessToken: string) =>
    ipcRenderer.invoke("connector:syncLedgersToCloud", ledgers, cloudBaseUrl, accessToken)
};

contextBridge.exposeInMainWorld("connectorApi", api);
