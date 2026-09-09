import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "./services/configStore";
import { detectTallyInstallation } from "./services/tallyDetector";
import { listTallyCompanies, listTallyLedgers, listTallyMasters, testTallyConnection } from "./services/tallyConnection";
import type { ConnectorSettings } from "./types";
import express from "express";
import cors from "cors";
import { XMLParser } from "fast-xml-parser";

const deviceId = crypto.randomUUID();

// let localApp = express();
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
localApp.use(express.text({ type: 'text/xml' }));

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
 * GET / (health probe used by the frontend)
 * Any HTTP response means the bridge is running.
 * -----------------------------------
 */
localApp.get("/", (_req, res) => {
  res.json({
    installed: true,
    running: true,
    paired: bridgeState.paired,
    tenantId: bridgeState.tenantId,
    deviceId,
  });
});

/**
 * -----------------------------------
 * GET /status
 * -----------------------------------
 */
localApp.get("/status", async (_req, res) => {
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
// localApp.post("/pair", async (req, res) => {
//   try {
//     const { pairingToken } = req.body;
//     console.log("pairingToken", pairingToken)
//     if (!pairingToken) {
//       return res.status(400).json({
//         success: false,
//         message: "pairingToken required",
//       });
//     }

//     /**
//      * Verify token with backend
//      */
//     const backendResponse = await fetch(
//       "https://api.mockapi.com/bridge/register",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json"
//         },
//         body: JSON.stringify({ token: pairingToken })
//       }
//     );
//     const resData = await backendResponse.json();
//     const data = resData.data[0];
//     console.log("Backend pairing response", data);

//     /**
//      * Save pairing info
//      */
//     bridgeState = {
//       paired: true,
//       tenantId: data.tenantId,
//       bridgeToken: data.bridgeToken,
//     };

//     return res.json({
//       success: true,
//       tenantId: data.tenantId,
//       message: "Pairing successful",
//     });
//   } catch (error: any) {
//     return res.status(500).json({
//       success: false,
//       message:
//         error?.response?.data?.message ||
//         "Pairing failed",
//     });
//   }
// });

// localApp.post('/pair', async (req, res) => {
//   try {
//     const { hostname, port, company } = req.body;

//     const xml = `
//       <ENVELOPE>
//         <HEADER>
//           <VERSION>1</VERSION>
//           <TALLYREQUEST>Export</TALLYREQUEST>
//           <TYPE>Collection</TYPE>
//           <ID>List of Companies</ID>
//         </HEADER>
//         <BODY>
//           <DESC>
//             <STATICVARIABLES>
//               <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
//             </STATICVARIABLES>
//           </DESC>
//         </BODY>
//       </ENVELOPE>
//     `;

//     const response = await fetch(`http://${hostname}:${port}`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'text/xml' },
//       body: xml,
//     });

//     const text = await response.text();
//     if (!text) {
//       return res.json({ success: false, message: 'Tally not responding' });
//     }

//     const parser = new XMLParser({ ignoreAttributes: false });
//     const json = parser.parse(text);
//     console.log("Tally response JSON:", json);
//     const companies = json?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY || [];
//     const companyList = Array.isArray(companies) ? companies : [companies];

//     const companyExists = companyList.some((c: any) => {
//       const companyName = typeof c.NAME === 'object' ? c.NAME['#text'] : c.NAME;
//       return String(companyName || '').trim().toLowerCase() === company?.trim().toLowerCase();
//     });

//     if (!companyExists) {
//       return res.status(400).json({
//         success: false,
//         message: `Company '${company}' not found in Tally`,
//       });
//     }

//     bridgeState.paired = true;
//     bridgeState.tenantId = hostname;
//     bridgeState.bridgeToken = `${hostname}:${port}:${company}`;

//     const configStore = new ConfigStore(app.getPath('userData'));
//     const settings = await configStore.getSettings();
//     const connectionString = settings.connectionString || '';
// const modules = ['Ledger', 'Voucher', 'Company', 'Group', 'Stock Item', 'Cost Centre'];
//     await fetch(`${process.env.NEXT_PUBLIC_BE}/v1/tally/modules`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-tenant-id': connectionString,
//         'x-slug': connectionString,
//       },
//       body: JSON.stringify({ records: modules }),
//     });

//     return res.json({ success: true, message: 'Paired successfully' });
//   } catch (error) {
//     console.log(error);
//     return res.json({ success: false, message: 'Unable to connect to Tally' });
//   }
// });

localApp.post('/pair', async (req, res) => {
  try {
    const { hostname, port, company } = req.body;

    // ---------------------------------------------------------
    // 1. Validate request
    // ---------------------------------------------------------
    if (!hostname || !port || !company) {
      return res.status(400).json({
        success: false,
        message: 'Hostname, port and company are required',
      });
    }

    const requestedCompany = String(company)
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

    console.log('======================================');
    console.log('TALLY PAIR REQUEST');
    console.log('======================================');
    console.log('Hostname:', hostname);
    console.log('Port:', port);
    console.log('Requested company:', company);
    console.log('Normalized company:', requestedCompany);

    // ---------------------------------------------------------
    // 2. Tally XML request
    // ---------------------------------------------------------
    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>List of Companies</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    console.log('Sending request to Tally...');

    // ---------------------------------------------------------
    // 3. Connect to Tally
    // ---------------------------------------------------------
    const response = await fetch(`http://${hostname}:${port}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: xml,
    });

    console.log('Tally HTTP status:', response.status);

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Tally returned HTTP ${response.status}`,
      });
    }

    // ---------------------------------------------------------
    // 4. Read Tally response
    // ---------------------------------------------------------
    const text = await response.text();

    console.log('======================================');
    console.log('TALLY RAW RESPONSE');
    console.log('======================================');
    console.log(text);

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tally not responding',
      });
    }

    // ---------------------------------------------------------
    // 5. Parse XML
    // ---------------------------------------------------------
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
    });

    const json = parser.parse(text);

    console.log('======================================');
    console.log('TALLY PARSED RESPONSE');
    console.log('======================================');
    console.dir(json, { depth: null });

    // ---------------------------------------------------------
    // 6. Recursively find COMPANY nodes
    // ---------------------------------------------------------
    const findCompanyNodes = (obj: unknown): any[] => {
      if (!obj || typeof obj !== 'object') {
        return [];
      }

      const result: any[] = [];

      const currentObject = obj as Record<string, unknown>;

      if (currentObject.COMPANY) {
        const companies = currentObject.COMPANY;

        if (Array.isArray(companies)) {
          result.push(...companies);
        } else {
          result.push(companies);
        }
      }

      Object.values(currentObject).forEach((value) => {
        if (value && typeof value === 'object') {
          result.push(...findCompanyNodes(value));
        }
      });

      return result;
    };

    const companyList = findCompanyNodes(json);

    console.log('======================================');
    console.log('COMPANIES FOUND');
    console.log('======================================');

    console.dir(companyList, { depth: null });

    // ---------------------------------------------------------
    // 7. Remove duplicate COMPANY nodes
    // ---------------------------------------------------------
    const uniqueCompanies = companyList.filter(
      (companyNode, index, array) =>
        array.findIndex(
          (item) => JSON.stringify(item) === JSON.stringify(companyNode),
        ) === index,
    );

    console.log('Unique company count:', uniqueCompanies.length);

    // ---------------------------------------------------------
    // 8. Extract company name
    // ---------------------------------------------------------
    const getCompanyName = (companyNode: any): string => {
      if (!companyNode) {
        return '';
      }

      // Normal case:
      // <COMPANY>
      //   <NAME>Ramco Infotech</NAME>
      // </COMPANY>
      if (typeof companyNode.NAME === 'string') {
        return companyNode.NAME.trim();
      }

      // XML parser object case:
      // NAME: {
      //   '#text': 'Ramco Infotech'
      // }
      if (
        companyNode.NAME &&
        typeof companyNode.NAME === 'object'
      ) {
        return String(
          companyNode.NAME['#text'] ??
            companyNode.NAME['_'] ??
            '',
        ).trim();
      }

      // Sometimes NAME can be represented directly as #text
      if (companyNode['#text']) {
        return String(companyNode['#text']).trim();
      }

      return '';
    };

    // ---------------------------------------------------------
    // 9. Create available company list
    // ---------------------------------------------------------
    const availableCompanies = uniqueCompanies
      .map(getCompanyName)
      .map((name) => name.trim())
      .filter(Boolean);

    console.log('======================================');
    console.log('AVAILABLE COMPANIES');
    console.log('======================================');

    console.log(availableCompanies);

    // ---------------------------------------------------------
    // 10. Find requested company
    // ---------------------------------------------------------
    const companyExists = uniqueCompanies.some((companyNode) => {
      const tallyCompanyName = getCompanyName(companyNode)
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

      console.log('--------------------------------------');
      console.log('Company comparison');
      console.log('Requested:', requestedCompany);
      console.log('Tally:', tallyCompanyName);
      console.log(
        'Matches:',
        tallyCompanyName === requestedCompany,
      );

      return tallyCompanyName === requestedCompany;
    });

    // ---------------------------------------------------------
    // 11. Company not found
    // ---------------------------------------------------------
    if (!companyExists) {
      console.log('======================================');
      console.log('COMPANY NOT FOUND');
      console.log('======================================');

      return res.status(400).json({
        success: false,
        message: `Company '${company}' not found in Tally`,
        availableCompanies,
      });
    }

    console.log('======================================');
    console.log('COMPANY FOUND');
    console.log('======================================');

    // ---------------------------------------------------------
    // 12. Pair bridge
    // ---------------------------------------------------------
    bridgeState.paired = true;
    bridgeState.tenantId = hostname;
    bridgeState.bridgeToken = `${hostname}:${port}:${company}`;

    console.log('Bridge state updated');

    // ---------------------------------------------------------
    // 13. Get local configuration
    // ---------------------------------------------------------
    const configStore = new ConfigStore(
      app.getPath('userData'),
    );

    const settings = await configStore.getSettings();

    const connectionString =
      settings.connectionString || '';

    console.log('Connection string available:', !!connectionString);

    // ---------------------------------------------------------
    // 14. Register Tally modules
    // ---------------------------------------------------------
    const modules = [
      'Ledger',
      'Voucher',
      'Company',
      'Group',
      'Stock Item',
      'Cost Centre',
    ];

    const backendUrl =
      `https://api.rubicr.in/v1/tally/modules`;

    console.log('Registering Tally modules...');
    console.log('Backend URL:', backendUrl);

    const moduleResponse = await fetch(backendUrl, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': connectionString,
        'x-slug': connectionString,
      },

      body: JSON.stringify({
        records: modules,
      }),
    });

    console.log(
      'Module registration status:',
      moduleResponse.status,
    );

    if (!moduleResponse.ok) {
      const moduleError =
        await moduleResponse.text();

      console.error(
        'Module registration failed:',
        moduleError,
      );

      return res.status(500).json({
        success: false,
        message:
          'Tally company paired, but module registration failed',
      });
    }

    // ---------------------------------------------------------
    // 15. Success
    // ---------------------------------------------------------
    return res.json({
      success: true,
      message: 'Paired successfully',
      company,
      availableCompanies,
    });
  } catch (error) {
    // ---------------------------------------------------------
    // 16. Error handling
    // ---------------------------------------------------------
    console.error('======================================');
    console.error('TALLY PAIR ERROR');
    console.error('======================================');

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Unable to connect to Tally',
    });
  }
});

localApp.post('/execute', async (req, res) => {
  try {
    if (!bridgeState.paired || !bridgeState.bridgeToken) {
      return res.status(400).json({ success: false, message: 'Not paired with Tally' });
    }

    const [hostname, port] = bridgeState.bridgeToken.split(':');

    const tallyResponse = await fetch(
      `http://${hostname}:${port}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: req.body,
      }
    );

    const data = await tallyResponse.text();
    res.send(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: 'Execute failed' });
  }
});

/**
 * -----------------------------------
 * POST /sync
 * -----------------------------------
 */
// localApp.post("/sync", async (req:any, res:any) => {
//   try {
//     /**
//      * Check pairing
//      */
//     if (!bridgeState.paired) {
//       return res.status(401).json({
//         success: false,
//         message: "Bridge not paired",
//       });
//     }

//     /**
//      * Example Tally data
//      * Replace with real Tally XML parsing
//      */
//     const tallyData = {
//       companies: [],
//       ledgers: [],
//       vouchers: [],
//     };

//     /**
//      * Upload to backend
//      */
//      const backendResponse = await fetch(
//       // "https://647dab5faf984710854a179a.mockapi.io/tally",
//       "https://api.rubicr.in/v1/tally/modules",
//       {
//         method: "POST",
//         headers: {  
//           "Content-Type": "application/json"
//         },
//         body: JSON.stringify(tallyData)
//       }
//     );
//     const resData = await backendResponse.json();

//     return res.json({
//       success: true,
//       message: "Sync completed",
//     });
//   } catch (error: any) {
//     return res.status(500).json({
//       success: false,
//       message:
//         error?.response?.data?.message ||
//         "Sync failed",
//     });
//   }
// });

localApp.post('/sync', async (req, res) => {
  try {
    const {
      hostname,
      port,
    } = req.body;

    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>List of Ledgers</ID>
        </HEADER>

        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    const response = await fetch(
      `http://${hostname}:${port}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
        },
        body: xml,
      }
    );

    const xmlText = await response.text();

    // Convert XML -> JSON

    const parser = new XMLParser({
      ignoreAttributes: false,
    });

    const json = parser.parse(xmlText);

    res.json({
      success: true,
      records:
        json?.ENVELOPE?.BODY?.DATA?.COLLECTION
          ?.LEDGER || [],
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: 'Sync failed',
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
let tray: Tray | null = null;
let isQuitting = false;

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

const DATABRIDGE_REGISTER_URL = `https://api.rubicr.in/v1/tally/databridge/register`;

function buildTenantHeaders(connectionString: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-tenant-id": connectionString,
    "x-slug": connectionString
  };
}

async function callDatabridgeRegister(connectionString: string, status: "ACTIVE" | "INACTIVE") {
  const hostname = os.hostname();
  const platform = os.platform();
  const osName = platform === "win32" ? "Windows" : platform === "darwin" ? "Mac" : "Linux";
  const owner = os.userInfo().username;
  const version = app.getVersion();

  const response = await fetch(DATABRIDGE_REGISTER_URL, {
    method: "POST",
    headers: buildTenantHeaders(connectionString),
    body: JSON.stringify({
      databridge_name: hostname,
      host_name: `${hostname}_${osName}`,
      version,
      status,
      owner
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Databridge register failed: ${response.status} ${errText}`);
  }

  return response.json();
}

function createTray() {
  // Point this at a real tray icon asset if you have one; otherwise it uses an empty icon.
  const iconPath = path.join(__dirname, "..", "resources", "tray-icon.png");
  const trayIcon = nativeImage.createFromPath(iconPath);

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip("Tally Data Connector Bridge");

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Bridge", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
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

  // Keep the bridge serving when the user clicks the X: hide to tray, don't quit.
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
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

  // Start with the OS so the bridge is always available after login.
  app.setLoginItemSettings({ openAtLogin: true });

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

  ipcMain.handle("connector:saveConnectionString", async (_, connectionString: string) => {
    const current = await configStore.getSettings();
    return configStore.saveSettings({ ...current, connectionString: connectionString.trim() });
  });

  ipcMain.handle("connector:getConnectionString", async () => {
    const settings = await configStore.getSettings();
    return settings.connectionString ?? "";
  });

  ipcMain.handle("connector:registerDatabridge", async (_, slug: string) => {
    try {
      const data = await callDatabridgeRegister(slug, "ACTIVE");
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    void configStore.getSettings().then((settings) => {
      if (settings.connectionString) {
        void callDatabridgeRegister(settings.connectionString, "INACTIVE").catch((err) => {
          console.error("Failed to mark databridge INACTIVE on quit:", err);
        });
      }
    });
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

  ipcMain.handle("connector:listTallyMasters", async (_, host: string, port: number, types: string[]) => {
    return listTallyMasters(host, port, types);
  });

  ipcMain.handle("connector:syncCompaniesToCloud", async (_, companies: string[], cloudBaseUrl: string) => {
    try {
      const { connectionString } = await configStore.getSettings();
      const response = await fetch(cloudBaseUrl.trim(), {
        method: 'POST',
        headers: buildTenantHeaders(connectionString),
        body: JSON.stringify({
          source: "tally",
          syncType: "merge",
          deduplicateBy: "name",
          companyName: "All Companies",
          records: companies.map(name => ({ name }))
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return { ok: true, data: await response.json() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle("connector:syncLedgersToCloud", async (_, ledgers: unknown[], cloudBaseUrl: string) => {
    try {
      const { connectionString } = await configStore.getSettings();
      const endpoint = cloudBaseUrl.trim() || `https://api.rubicr.in/v1/tally/modules`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildTenantHeaders(connectionString),
        body: JSON.stringify({ records: ledgers })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return { ok: true, data: await response.json() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle("connector:syncTallyMastersToCloud", async (_, modulesData: Record<string, unknown[]>, cloudBaseUrl: string) => {
    try {
      const { connectionString } = await configStore.getSettings();
      const endpoint = cloudBaseUrl.trim();
      const headers = buildTenantHeaders(connectionString);
      const results: Record<string, unknown> = {};
      const timestampIso = new Date().toISOString();

      for (const [moduleName, records] of Object.entries(modulesData)) {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < Math.max(records.length, 1); i += CHUNK_SIZE) {
          const chunk = records.slice(i, i + CHUNK_SIZE);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              source: "tally",
              syncType: "merge",
              timestampIso,
              modules: { [moduleName]: chunk }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText} (module: ${moduleName}, chunk: ${i / CHUNK_SIZE + 1})`);
          }
          results[`${moduleName}_chunk_${i / CHUNK_SIZE + 1}`] = await response.json();
        }
      }

      return { ok: true, data: results };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

void bootstrap();

// Keep the app (and the local bridge) alive when the window is closed.
// Quitting only happens via the tray menu ("Quit") or the OS.
app.on("window-all-closed", () => {
  // Intentionally do nothing: the bridge must stay available at :47825.
});