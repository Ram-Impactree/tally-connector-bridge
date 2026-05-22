import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { ConfigStore } from "./services/configStore";
import { detectTallyInstallation } from "./services/tallyDetector";
import { listTallyCompanies, listTallyLedgers, testTallyConnection } from "./services/tallyConnection";
import type { ConnectorSettings } from "./types";
import express from "express";
import cors from "cors";
import axios from "axios";

const deviceId = crypto.randomUUID();

// const localApp = express();
// localApp.use(cors());
// localApp.use(express.json());

// localApp.get("/status", (req:any, res:any) => {
//   res.json({
//     installed: true,
//     running: true,
//     deviceId: deviceId,
//   });
// });

// // localApp.listen(47825, () => {
// //   console.log("Bridge running on 47825");
// // });

// localApp.listen(47825, "127.0.0.1", () => {
//   console.log("Bridge running on 47825");
// });


// API STATUS | PAIR | SYNC

const localApp = express();

localApp.use(cors());
localApp.use(express.json());

const PORT = 47825;

/**
 * Local bridge memory storage
 * Replace with secure storage later
 */
let bridgeState = {
  paired: false,
  tenantId: null as string | null,
  bridgeToken: null as string | null,
};

/**
 * -----------------------------------
 * GET /status
 * -----------------------------------
 */
localApp.get("/status", async (req, res) => {
  res.json({
    installed: true,
    running: true,
    paired: bridgeState.paired,
    tenantId: bridgeState.tenantId,
  });
});

/**
 * -----------------------------------
 * POST /pair
 * -----------------------------------
 */
localApp.post("/pair", async (req, res) => {
  try {
    const { pairingToken } = req.body;
    console.log("pairingToken", pairingToken)
    if (!pairingToken) {
      return res.status(400).json({
        success: false,
        message: "pairingToken required",
      });
    }

    /**
     * Verify token with backend
     */
    const backendResponse = await axios.post(
      "https://api.mockapi.com/bridge/register",
      {
        "token": JSON.stringify(pairingToken),
      }
    );

    const data = backendResponse.data[0];
    console.log("Backend pairing response", data);

    /**
     * Save pairing info
     */
    bridgeState = {
      paired: true,
      tenantId: data.tenantId,
      bridgeToken: data.bridgeToken,
    };

    return res.json({
      success: true,
      tenantId: data.tenantId,
      message: "Pairing successful",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.message ||
        "Pairing failed",
    });
  }
});

/**
 * -----------------------------------
 * POST /sync
 * -----------------------------------
 */
localApp.post("/sync", async (req:any, res:any) => {
  try {
    /**
     * Check pairing
     */
    if (!bridgeState.paired) {
      return res.status(401).json({
        success: false,
        message: "Bridge not paired",
      });
    }

    /**
     * Example Tally data
     * Replace with real Tally XML parsing
     */
    const tallyData = {
      companies: [],
      ledgers: [],
      vouchers: [],
    };

    /**
     * Upload to backend
     */
    await axios.post(
      "https://647dab5faf984710854a179a.mockapi.io/tally",
      tallyData,
      {
        headers: {
          Authorization: `Bearer ${bridgeState.bridgeToken}`,
        },
      }
    );

    return res.json({
      success: true,
      message: "Sync completed",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.message ||
        "Sync failed",
    });
  }
});

/**
 * -----------------------------------
 * Start Local Server
 * -----------------------------------
 */
localApp.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Bridge running at http://127.0.0.1:${PORT}`
  );
});

let mainWindow: BrowserWindow | null = null;

async function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function postCloudSync(cloudBaseUrl: string, payload: unknown, accessToken?: string) {
  const url = cloudBaseUrl.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Cloud sync failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function postCloudSyncWithRetry(cloudBaseUrl: string, payload: unknown, accessToken?: string, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await postCloudSync(cloudBaseUrl, payload, accessToken);
    } catch (error) {
      lastError = error;
      const backoffMs = attempt * 1000;
      console.warn(`Cloud sync attempt ${attempt} failed, retrying in ${backoffMs}ms`, error);
      if (attempt < attempts) {
        await delay(backoffMs);
      }
    }
  }

  throw lastError;
}

async function autoSyncTallyCompanies(settings: ConnectorSettings) {
  const cloudBaseUrl = settings.cloudBaseUrl.trim();
  if (!cloudBaseUrl) {
    return;
  }

  const companiesResult = await listTallyCompanies(settings.tallyHost, settings.tallyPort);
  if (!companiesResult.ok) {
    throw new Error(`Failed to load companies from Tally: ${companiesResult.message}`);
  }

  const uniqueRecords = new Map<string, { name: string; guid: string }>();
  for (const item of companiesResult.items) {
    const guid = item.guid?.trim() || item.name.trim();
    if (!guid) {
      continue;
    }

    if (!uniqueRecords.has(guid)) {
      uniqueRecords.set(guid, {
        name: item.name,
        guid
      });
    }
  }

  const records = Array.from(uniqueRecords.values());
  if (records.length === 0) {
    throw new Error("No valid company records found for sync.");
  }

  const payload = {
    source: "tally",
    syncType: "merge",
    deduplicateBy: "guid",
    companyName: "All Companies",
    timestampIso: new Date().toISOString(),
    tallyHost: settings.tallyHost,
    tallyPort: settings.tallyPort,
    records
  };

  return postCloudSyncWithRetry(cloudBaseUrl, payload, settings.accessToken);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: "#f0f4f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

async function bootstrap() {
  await app.whenReady();

  const configStore = new ConfigStore(app.getPath("userData"));

  ipcMain.handle("connector:getSystemStatus", async () => {
    const [tally, settings] = await Promise.all([
      detectTallyInstallation(),
      configStore.getSettings()
    ]);

    // Auto-sync Tally companies when the app starts and Tally is running.
    if (tally.isRunning && settings.cloudBaseUrl) {
      void autoSyncTallyCompanies(settings)
        .then((result) => {
          console.info("Auto-sync completed", result);
        })
        .catch((error) => {
          console.error("Auto-sync failed:", error);
        });
    }

    return { tally, settings };
  });

  ipcMain.handle("connector:saveSettings", async (_, settings: ConnectorSettings) => {
    return configStore.saveSettings(settings);
  });

  ipcMain.handle("connector:testTallyEndpoint", async (_, host: string, port: number) => {
    return testTallyConnection(host, port);
  });

  ipcMain.handle("connector:listTallyCompanies", async (_, host: string, port: number) => {
    return listTallyCompanies(host, port);
  });

  ipcMain.handle("connector:listTallyLedgers", async (_, host: string, port: number) => {
    return listTallyLedgers(host, port);
  });

  ipcMain.handle("connector:syncCompaniesToCloud", async (_, companies: string[], cloudBaseUrl: string, accessToken: string) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const response = await fetch(cloudBaseUrl.trim(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: "tally",
          syncType: "merge",
          deduplicateBy: "name",
          companyName: "All Companies",
          records: companies.map(name => ({ name }))
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return { ok: true, data: result };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle("connector:syncLedgersToCloud", async (_, ledgers: unknown[], cloudBaseUrl: string, accessToken: string) => {
    try {
      const endpoint = cloudBaseUrl.trim() || "https://647dab5faf984710854a179a.mockapi.io/tally";
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: "tally",
          syncType: "merge",
          deduplicateBy: "guid",
          ledgerName: "All Ledgers",
          records: ledgers
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return { ok: true, data: result };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

void bootstrap();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
