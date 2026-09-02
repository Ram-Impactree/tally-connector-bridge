import { useEffect, useMemo, useState } from "react";

type DetectionState = "installed" | "likelyInstalled" | "notFound" | "error";

type StatusModel = {
  tally: {
    status: DetectionState;
    foundPaths: string[];
    checks: string[];
    errorMessage?: string;
  };
  settings: {
    cloudBaseUrl: string;
    accessToken: string;
    tallyHost: string;
    tallyPort: number;
  };
};

type LedgerRow = {
  name: string;
  closingBalance?: string;
  [key: string]: unknown;
};

const defaultStatus: StatusModel = {
  tally: {
    status: "notFound",
    foundPaths: [],
    checks: [],
  },
  settings: {
    cloudBaseUrl: "",
    accessToken: "",
    tallyHost: "127.0.0.1",
    tallyPort: 9000,
  },
};

function App() {
  const [status, setStatus] = useState<StatusModel>(defaultStatus);
  const [form, setForm] = useState(defaultStatus.settings);
  const [connectionString, setConnectionString] = useState("");
  const [connectionStringError, setConnectionStringError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connected"
  >("idle");
  const [busy, setBusy] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [masterModules, setMasterModules] = useState<Record<string, unknown[]>>(
    {},
  );
  const [message, setMessage] = useState("Ready");

  const installerDownloadUrl =
    import.meta.env.VITE_EXE_DOWNLOAD_URL ||
    "https://example.com/Tally-Connector-Setup.exe";
  const isElectron = navigator.userAgent.includes("Electron");

  useEffect(() => {
    if (!isElectron) {
      setMessage(
        "Use the installer download button below to install the desktop app. " +
          "After install, launch the native application from the Start menu.",
      );
    }

    void (async () => {
      if (window.connectorApi) {
        const systemStatus = await window.connectorApi.getSystemStatus();
        setStatus(systemStatus);
        setForm(systemStatus.settings);
        const savedCs = await window.connectorApi.getConnectionString();
        if (savedCs) {
          setConnectionString(savedCs);
          setConnectionStatus("connected");
        }
      }
    })();
  }, [isElectron]);

  const statusText = useMemo(() => {
    if (status.tally.status === "installed") {
      return "Tally installation found";
    }
    if (status.tally.status === "likelyInstalled") {
      return "Tally probably installed (partial evidence)";
    }
    if (status.tally.status === "error") {
      return "Tally detection failed";
    }
    return "Tally installation not found";
  }, [status.tally.status]);

  const tallyModuleTypes = [
    "Company",
    "Ledger",
    "Group",
    "VoucherType",
    "Godown",
    "StockItem",
    "StockGroup",
    "Unit",
    "StockCategory",
    "CostCenter",
    "CostCategory",
    "Employee",
    "TaxCategory",
  ];

  const submitConnectionString = async () => {
    if (!connectionString.trim()) {
      setConnectionStringError("Connection string is required.");
      setConnectionStatus("idle");
      return;
    }
    setConnectionStringError("");
    await window.connectorApi.saveConnectionString(connectionString.trim());
    const reg = await window.connectorApi.registerDatabridge(
      connectionString.trim(),
    );
    if (!reg.ok) {
      setConnectionStringError(`Registration failed: ${reg.error}`);
      return;
    }
    setConnectionStatus("connected");
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const saved = await window.connectorApi.saveSettings(form);
      setStatus((prev) => ({ ...prev, settings: saved }));
      setMessage("Settings saved");
    } catch (error) {
      setMessage(`Failed to save settings: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const loadTallyMasterModules = async () => {
    setLoadingMasters(true);
    setMessage("Loading all Tally master modules...");
    try {
      const result = await window.connectorApi.listTallyMasters(
        form.tallyHost,
        form.tallyPort,
        tallyModuleTypes,
      );

      if (result.ok) {
        setMasterModules(result.modules);
        setMessage("Tally master modules loaded successfully");
      } else {
        setMasterModules(result.modules);
        setMessage(
          `Loaded with errors: ${JSON.stringify(result.errors ?? {})}`,
        );
      }
    } catch (error) {
      setMasterModules({});
      setMessage(`Failed to load Tally modules: ${String(error)}`);
    } finally {
      setLoadingMasters(false);
    }
  };

  const syncAllMasterModules = async () => {
    setBusy(true);
    setMessage("Syncing all Tally master modules to cloud...");
    try {
      const result = await window.connectorApi.syncTallyMastersToCloud(
        masterModules,
        form.cloudBaseUrl,
      );

      if (result.ok) {
        setMessage("All Tally master modules synced successfully");
      } else {
        setMessage(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      setMessage(`Sync failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setMessage("Testing Tally endpoint...");
    try {
      const result = await window.connectorApi.testTallyEndpoint(
        form.tallyHost,
        form.tallyPort,
      );
      setMessage(
        result.ok ? `Connected in ${result.latencyMs ?? 0} ms` : result.message,
      );
    } catch (error) {
      setMessage(`Connection test failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    setMessage("Loading companies from Tally...");
    try {
      const result = await window.connectorApi.listTallyCompanies(
        form.tallyHost,
        form.tallyPort,
      );
      if (result.ok) {
        setCompanies(result?.items?.map((item) => item?.name));
        setMessage(result?.message);
      } else {
        setCompanies([]);
        setMessage(result?.message);
      }
    } catch (error) {
      setCompanies([]);
      setMessage(`Failed to load companies: ${String(error)}`);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadLedgers = async () => {
    setLoadingLedgers(true);
    setMessage("Loading ledgers from Tally...");
    try {
      const result = await window.connectorApi.listTallyLedgers(
        form.tallyHost,
        form.tallyPort,
      );
      if (result.ok) {
        setLedgers(result.items);
        setMessage(result.message);
      } else {
        setLedgers([]);
        setMessage(result.message);
      }
    } catch (error) {
      setLedgers([]);
      setMessage(`Failed to load ledgers: ${String(error)}`);
    } finally {
      setLoadingLedgers(false);
    }
  };

  const syncCompanies = async () => {
    setBusy(true);
    setMessage("Syncing companies to cloud...");
    try {
      const result = await window.connectorApi.syncCompaniesToCloud(
        companies,
        form.cloudBaseUrl,
      );
      if (result.ok) {
        setMessage("Companies synced successfully");
      } else {
        setMessage(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      setMessage(`Sync failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const syncLedgers = async () => {
    setBusy(true);
    setMessage("Syncing ledgers to mock API...");
    try {
      const result = await window.connectorApi.syncLedgersToCloud(
        ledgers,
        form.cloudBaseUrl,
      );
      if (result.ok) {
        setMessage("Ledgers synced successfully");
      } else {
        setMessage(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      setMessage(`Sync failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell">
      <section className="hero">
        <h1>Tally Connector</h1>
        <p>Desktop bridge between your local Tally and cloud application.</p>
      </section>

      {!isElectron ? (
        <section className="card download-card">
          <h2>Download Windows Installer</h2>
          <p>
            This page is a browser-based launcher for the desktop app. Install
            the native Windows executable first, then open the app from the
            Start menu for the full desktop experience.
          </p>
          <a
            className="button primary"
            href={installerDownloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            Download Windows Installer (.exe)
          </a>
          <p className="note">
            If the installer URL is not correct, update `VITE_EXE_DOWNLOAD_URL`
            in your frontend deployment environment.
          </p>
        </section>
      ) : null}

      <section className="card">
        <h2>Local Tally Check</h2>
        <p className={`badge badge-${status.tally.status}`}>{statusText}</p>
        {status.tally.errorMessage ? (
          <p className="error">{status.tally.errorMessage}</p>
        ) : null}
        {status.tally.foundPaths.length > 0 ? (
          <ul>
            {status.tally.foundPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card">
        <h2>Connection</h2>
        <label>
          Connection String
          <input
            value={connectionString}
            onChange={(e) => {
              setConnectionString(e.target.value);
              if (connectionStringError) setConnectionStringError("");
              if (connectionStatus === "connected") setConnectionStatus("idle");
            }}
            placeholder="Paste your connection string here"
          />
          {connectionStringError && (
            <span className="error" style={{ fontSize: "0.85rem" }}>
              {connectionStringError}
            </span>
          )}
        </label>
        {connectionStatus === "connected" && (
          <p
            style={{
              color: "var(--ok)",
              fontWeight: 600,
              margin: "0 0 0.75rem",
            }}
          >
            ✓ You are connected successfully.
          </p>
        )}
        <button type="button" onClick={submitConnectionString}>
          Connect
        </button>
      </section>

      <section className="card">
        <h2>Connector Settings</h2>
        <label>
          Cloud API Base URL
          <input
            value={form.cloudBaseUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, cloudBaseUrl: event.target.value }))
            }
            placeholder="https://api.yourcloud.com"
          />
        </label>
        <label>
          Access Token
          <input
            type="password"
            value={form.accessToken}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, accessToken: event.target.value }))
            }
            placeholder="Bearer token for API auth"
          />
        </label>
        <label>
          Tally Host
          <input
            value={form.tallyHost}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, tallyHost: event.target.value }))
            }
            placeholder="127.0.0.1"
          />
        </label>
        <label>
          Tally Port
          <input
            type="number"
            value={form.tallyPort}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                tallyPort: Number(event.target.value) || 0,
              }))
            }
            placeholder="9000"
          />
        </label>

        <div className="actions">
          <button type="button" disabled={busy} onClick={saveSettings}>
            Save Settings
          </button>
          <button type="button" disabled={busy} onClick={testConnection}>
            Test Tally Connection
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Tally Data Explorer</h2>
        <div className="actions">
          <button
            type="button"
            disabled={busy || loadingCompanies}
            onClick={loadCompanies}
          >
            {loadingCompanies ? "Loading Companies..." : "Load Company List"}
          </button>
          <button
            type="button"
            disabled={busy || loadingLedgers}
            onClick={loadLedgers}
          >
            {loadingLedgers ? "Loading Ledgers..." : "Load Ledger List"}
          </button>
          <button
            type="button"
            disabled={busy || loadingMasters}
            onClick={loadTallyMasterModules}
          >
            {loadingMasters
              ? "Loading All Masters..."
              : "Load All Tally Masters"}
          </button>
          <button
            type="button"
            disabled={busy || companies.length === 0 || !form.cloudBaseUrl}
            onClick={syncCompanies}
          >
            Sync Companies to Cloud
          </button>
          <button
            type="button"
            disabled={busy || ledgers.length === 0 || !form.cloudBaseUrl}
            onClick={syncLedgers}
          >
            Sync Ledgers to Cloud
          </button>
          <button
            type="button"
            disabled={
              busy ||
              Object.keys(masterModules).length === 0 ||
              !form.cloudBaseUrl
            }
            onClick={syncAllMasterModules}
          >
            Sync All Master Modules to Cloud
          </button>
        </div>

        <p>Companies found: {companies.length}</p>
        <p>Ledgers found: {ledgers.length}</p>
        <p>Master modules loaded: {Object.keys(masterModules).length}</p>

        {Object.keys(masterModules).length > 0 ? (
          <div>
            <h3>Master Module Counts</h3>
            <ul>
              {Object.entries(masterModules).map(([moduleName, records]) => (
                <li key={moduleName}>
                  {moduleName}: {records.length} records
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {companies.length > 0 ? (
          <div>
            <h3>Company List</h3>
            <ul>
              {companies.map((company) => (
                <li key={company}>{company}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {ledgers.length > 0 ? (
          <div>
            <h3>Ledger Records</h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((ledger) => (
                  <tr key={ledger.name}>
                    <td>{ledger.name}</td>
                    <td>{ledger.closingBalance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card status-card">
        <h2>Status</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}

export default App;
