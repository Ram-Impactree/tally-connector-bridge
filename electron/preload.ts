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
  listTallyMasters: (host: string, port: number, types: string[]) =>
    ipcRenderer.invoke("connector:listTallyMasters", host, port, types),
  syncCompaniesToCloud: (companies: string[], cloudBaseUrl: string) =>
    ipcRenderer.invoke("connector:syncCompaniesToCloud", companies, cloudBaseUrl),
  syncLedgersToCloud: (ledgers: unknown[], cloudBaseUrl: string) =>
    ipcRenderer.invoke("connector:syncLedgersToCloud", ledgers, cloudBaseUrl),
  syncTallyMastersToCloud: (modulesData: Record<string, unknown[]>, cloudBaseUrl: string) =>
    ipcRenderer.invoke("connector:syncTallyMastersToCloud", modulesData, cloudBaseUrl),
  saveConnectionString: (connectionString: string) =>
    ipcRenderer.invoke("connector:saveConnectionString", connectionString),
  getConnectionString: () =>
    ipcRenderer.invoke("connector:getConnectionString"),
  registerDatabridge: (slug: string) =>
    ipcRenderer.invoke("connector:registerDatabridge", slug)
};

contextBridge.exposeInMainWorld("connectorApi", api);
