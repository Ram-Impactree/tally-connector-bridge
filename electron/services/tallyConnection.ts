import type { TallyConnectionResult, TallyListItem, TallyListResult } from "../types";
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeTallyValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeTallyValue);
  }

  if (typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const textValue = record["#text"];
  const hasText = textValue !== undefined;
  const nonAttributeKeys = keys.filter((key) => !key.startsWith("@_") && key !== "#text");

  if (nonAttributeKeys.length === 0 && hasText) {
    return textValue;
  }

  const normalized: Record<string, unknown> = {};

  for (const key of keys) {
    if (key === "#text" || key === "@_TYPE") {
      continue;
    }

    if (key === "@_NAME") {
      const nameValue = normalizeTallyValue(record[key]);
      if (typeof nameValue === "string") {
        normalized.NAME = nameValue;
        // normalized.name = nameValue;
      }
      continue;
    }

    const childValue = normalizeTallyValue(record[key]);
    if (childValue !== undefined) {
      normalized[key] = childValue;
    }
  }

  if (hasText && Object.keys(normalized).length === 0) {
    return textValue;
  }

  return normalized;
}

function extractLedgerItemsFromParsedXml(parsedXml: unknown): any[] {
  const ledgers: any[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const record = node as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "LEDGER")) {
      ledgers.push(...normalizeArray(record.LEDGER));
    }

    for (const value of Object.values(record)) {
      walk(value);
    }
  }

  walk(parsedXml);
  return ledgers;
}

function isValidLedgerRecord(candidate: unknown): candidate is Record<string, unknown> {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false;
  }

  const record = candidate as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, "@_NAME") ||
    Object.prototype.hasOwnProperty.call(record, "NAME") ||
    Object.prototype.hasOwnProperty.call(record, "GUID")
  );
}

function parseLedgerItems(xml: string): TallyListItem[] {
  const parsed = parser.parse(xml);
  const ledgerItems = extractLedgerItemsFromParsedXml(parsed).filter(isValidLedgerRecord);

  if (ledgerItems.length === 0) {
    return parseXmlItems(xml, "LEDGER", ["NAME", "PARENT", "OPENINGBALANCE", "CLOSINGBALANCE", "GUID", "ADDRESS"], "LEDGER");
  }

  return ledgerItems.map((rawLedger) => {
    const normalized = normalizeTallyValue(rawLedger);
    const ledger = (typeof normalized === "object" && normalized !== null ? normalized : {}) as TallyListItem;
    return ledger;
  });
}

function extractItemsFromParsedXml(parsedXml: unknown, typeName: string): any[] {
  const items: any[] = [];
  const upperTypeName = typeName.toUpperCase();

  function walk(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const record = node as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, upperTypeName)) {
      items.push(...normalizeArray(record[upperTypeName]));
    }

    for (const value of Object.values(record)) {
      walk(value);
    }
  }

  walk(parsedXml);
  return items;
}

function parseXmlRecords(xml: string, itemTag: string): TallyListItem[] {
  const parsed = parser.parse(xml);
  const records = extractItemsFromParsedXml(parsed, itemTag);

  return records
    .map((record) => normalizeTallyValue(record))
    .filter((record): record is Record<string, unknown> => typeof record === "object" && record !== null)
    .map((record) => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        normalized[k.toLowerCase()] = v;
      }
      if (!normalized.name && typeof record.NAME === "string") {
        normalized.name = record.NAME;
      }
      if (!normalized.guid && typeof record.GUID === "string") {
        normalized.guid = record.GUID;
      }
      return normalized as TallyListItem;
    })
    .filter((item) => !!item.name);
}

const ENTITY_FIELDS: Record<string, string[]> = {
  Company:       ["Name", "GUID", "StartingFrom", "BooksFrom"],
  Ledger:        ["Name", "GUID", "Parent", "OpeningBalance", "ClosingBalance", "Address", "PhoneNumber", "Email", "GSTIN", "IncomeTaxNumber"],
  Group:         ["Name", "GUID", "Parent", "Nature"],
  VoucherType:   ["Name", "GUID", "Parent", "NumberingMethod", "IsDeemedPositive"],
  Godown:        ["Name", "GUID", "Parent", "Address"],
  StockItem:     ["Name", "GUID", "Parent", "Category", "BaseUnits", "OpeningBalance", "ClosingBalance", "OpeningRate", "ClosingRate"],
  StockGroup:    ["Name", "GUID", "Parent"],
  Unit:          ["Name", "GUID", "UQCName", "IsSIMPLEUnit"],
  StockCategory: ["Name", "GUID", "Parent"],
  CostCenter:    ["Name", "GUID", "Parent", "Category"],
  CostCategory:  ["Name", "GUID", "AllocateRevenue", "AllocateNonRevenue"],
  Employee:      ["Name", "GUID", "Parent", "EmployeeNumber", "Designation", "Function", "DateOfJoining"],
  TaxCategory:   ["Name", "GUID"],
};

function buildCollectionXml(typeName: string): string {
  const fields = ENTITY_FIELDS[typeName] ?? ["Name", "GUID"];
  const fetchXml = fields.map((f) => `              <FETCH>${f}</FETCH>`).join("\n");

  return `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>${typeName} Collection</ID>
    </HEADER>
    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="${typeName} Collection" ISMODIFY="No">
              <TYPE>${typeName}</TYPE>
<FETCH>*</FETCH>
            </COLLECTION>
          </TDLMESSAGE>
        </TDL>
      </DESC>
    </BODY>
  </ENVELOPE>
  `;
}

export async function listTallyMaster(host: string, port: number, typeName: string): Promise<TallyListResult> {
  const result = await sendXml(host, port, buildCollectionXml(typeName));
  if (!result.ok || !result.rawXml) {
    return { ok: false, message: result.message, items: [] };
  }

  const items = parseXmlRecords(result.rawXml, typeName);
  return {
    ok: true,
    message: `${typeName} list loaded (${items.length} records)`,
    items
  };
}

export async function listTallyMasters(host: string, port: number, types: string[]): Promise<{ ok: boolean; message: string; modules: Record<string, TallyListItem[]>; errors?: Record<string, string>; }> {
  const modules: Record<string, TallyListItem[]> = {};
  const errors: Record<string, string> = {};

  await Promise.all(types.map(async (typeName) => {
    const result = await listTallyMaster(host, port, typeName);
    if (result.ok) {
      modules[typeName] = result.items;
    } else {
      errors[typeName] = result.message;
      modules[typeName] = [];
    }
  }));

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    message: ok ? "Tally master modules loaded successfully" : "Tally master modules loaded with errors",
    modules,
    errors: Object.keys(errors).length > 0 ? errors : undefined
  };
}

// const REQUEST_XML = `<?xml version="1.0" encoding="utf-8"?>
// <ENVELOPE>
//   <HEADER>
//     <VERSION>1</VERSION>
//     <TALLYREQUEST>Export</TALLYREQUEST>
//     <TYPE>Data</TYPE>
//     <ID>Company Collection</ID>
//   </HEADER>
//   <BODY>
//     <DESC>
//       <STATICVARIABLES>
//         <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
//       </STATICVARIABLES>
//       <TDL>
//         <TDLMESSAGE>
//           <COLLECTION NAME="Company Collection" ISMODIFY="No">
//             <TYPE>Company</TYPE>
//             <FETCH>Name</FETCH>
//           </COLLECTION>
//         </TDLMESSAGE>
//       </TDL>
//     </DESC>
//   </BODY>
// </ENVELOPE>`;

   const REQUEST_XML = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>Company Collection</ID>
    </HEADER>

    <BODY>
      <DESC>
        <TDL>
          <TDLMESSAGE>

            <COLLECTION NAME="Company Collection">
              <TYPE>Company</TYPE>

              <NATIVEMETHOD>Name</NATIVEMETHOD>
              <NATIVEMETHOD>GUID</NATIVEMETHOD>
              <NATIVEMETHOD>StartingFrom</NATIVEMETHOD>
              <NATIVEMETHOD>BooksFrom</NATIVEMETHOD>

            </COLLECTION>

          </TDLMESSAGE>
        </TDL>
      </DESC>
    </BODY>
  </ENVELOPE>
  `;

  const LEDGER_XML = `
 <ENVELOPE>

    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>Export</TALLYREQUEST>
      <TYPE>Collection</TYPE>
      <ID>Ledger Collection</ID>
    </HEADER>

    <BODY>
      <DESC>

        <TDL>
          <TDLMESSAGE>

            <COLLECTION NAME="Ledger Collection">
              <TYPE>Ledger</TYPE>

              <NATIVEMETHOD>Name</NATIVEMETHOD>
              <NATIVEMETHOD>Parent</NATIVEMETHOD>
              <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
              <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
              <NATIVEMETHOD>GUID</NATIVEMETHOD>
              <NATIVEMETHOD>Address</NATIVEMETHOD>
              <NATIVEMETHOD>PhoneNumber</NATIVEMETHOD>
              <NATIVEMETHOD>Email</NATIVEMETHOD>
              <NATIVEMETHOD>IncomeTaxNumber</NATIVEMETHOD>
              <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
              <NATIVEMETHOD>LanguageName</NATIVEMETHOD>

            </COLLECTION>

          </TDLMESSAGE>
        </TDL>

      </DESC>
    </BODY>

  </ENVELOPE>
`;

// const LEDGER_XML = `
// <ENVELOPE>
//   <HEADER>
//     <VERSION>1</VERSION>
//     <TALLYREQUEST>Export</TALLYREQUEST>
//     <TYPE>Collection</TYPE>
//     <ID>Ledger Collection</ID>
//   </HEADER>

//   <BODY>
//     <DESC>
//       <TDL>
//         <TDLMESSAGE>

//           <COLLECTION NAME="Ledger Collection">
//             <TYPE>Ledger</TYPE>

//             <NATIVEMETHOD>Name</NATIVEMETHOD>
//             <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>

//           </COLLECTION>

//         </TDLMESSAGE>
//       </TDL>
//     </DESC>
//   </BODY>
// </ENVELOPE>
// `;

function getEndpoint(host: string, port: number) {
  const safeHost = host.trim() || "127.0.0.1";
  const safePort = Number.isFinite(port) && port > 0 ? port : 9000;
  return `http://${safeHost}:${safePort}`;
}

async function sendXml(host: string, port: number, xml: string) {
  const endpoint = getEndpoint(host, port);
  const started = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8"
      },
      body: xml
    });

    const body = await response.text();
    const latencyMs = Date.now() - started;
    const looksLikeTally = body.includes("<ENVELOPE>") || body.includes("<LINEERROR>");

    if (!response.ok) {
      return {
        ok: false,
        endpoint,
        latencyMs,
        message: `HTTP ${response.status} from Tally endpoint`,
        httpStatus: response.status
      };
    }

    if (!looksLikeTally) {
      return {
        ok: false,
        endpoint,
        latencyMs,
        message: "Endpoint responded, but payload does not look like Tally XML",
        httpStatus: response.status
      };
    }

    return {
      ok: true,
      endpoint,
      latencyMs,
      message: "Tally endpoint reachable",
      rawXml: body
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      latencyMs: Date.now() - started,
      message: `Unable to connect: ${String(error)}`
    };
  }
}

function buildTagRegex(tag: string) {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
}

function buildFieldRegex(field: string) {
  return new RegExp(`<${field}\\b[^>]*>([\\s\\S]*?)<\\/${field}>`, "i");
}

function parseXmlItemsByTag(
  xml: string,
  itemTag: string,
  fields: string[],
  typeAttribute?: string
): TallyListItem[] {
  const itemRegex = buildTagRegex(itemTag);
  const items: TallyListItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const fullMatch = match[0];
    const content = match[1];

    // Check TYPE attribute if specified
    if (typeAttribute) {
      const typeRegex = new RegExp(`TYPE\\s*=\\s*"${typeAttribute}"`, "i");
      if (!typeRegex.test(fullMatch)) {
        continue;
      }
    }

    const item: TallyListItem = { name: "" };

    // Try to get name from nested element first, then from attribute
    let nameValue = "";
    const nameFieldRegex = buildFieldRegex("NAME");
    const nameFieldMatch = nameFieldRegex.exec(content);
    if (nameFieldMatch?.[1]?.trim()) {
      nameValue = nameFieldMatch[1].trim();
    } else {
      // Try to get name from attribute
      const nameAttrRegex = /NAME\s*=\s*"([^"]*)"/i;
      const nameAttrMatch = nameAttrRegex.exec(fullMatch);
      if (nameAttrMatch?.[1]) {
        nameValue = nameAttrMatch[1];
      }
    }

    if (nameValue) {
      item.name = nameValue;
    }

    // Handle other fields
    for (const field of fields) {
      const fieldUpper = field.toUpperCase();
      if (fieldUpper === "CLOSINGBALANCE") {
        const fieldRegex = buildFieldRegex(field);
        const fieldMatch = fieldRegex.exec(content);
        const value = fieldMatch?.[1]?.trim() ?? "";
        item.closingBalance = value;
      } else if (fieldUpper === "GUID") {
        const fieldRegex = buildFieldRegex(field);
        const fieldMatch = fieldRegex.exec(content);
        const value = fieldMatch?.[1]?.trim() ?? "";
        item.guid = value;
      }
    }

    if (item.name) {
      items.push(item);
    }
  }

  return items;
}

function parseXmlItems(xml: string, itemTag: string, fields: string[], typeAttribute?: string): TallyListItem[] {
  const items: TallyListItem[] = [];

  // First try to find items directly
  const directItems = parseXmlItemsByTag(xml, itemTag, fields, typeAttribute);
  if (directItems.length > 0) {
    return directItems;
  }

  // If no direct items found, look inside COLLECTION wrapper
  const collectionRegex = /<COLLECTION[^>]*>([\s\S]*?)<\/COLLECTION>/gi;
  const collectionMatch = collectionRegex.exec(xml);

  if (collectionMatch) {
    const collectionContent = collectionMatch[1];
    const collectionItems = parseXmlItemsByTag(collectionContent, itemTag, fields, typeAttribute);
    if (collectionItems.length > 0) {
      return collectionItems;
    }
  }

  // If still no items, try OBJECT fallback
  if (itemTag !== "OBJECT") {
    const objectItems = parseXmlItemsByTag(xml, "OBJECT", fields, typeAttribute);
    if (objectItems.length > 0) {
      return objectItems;
    }
  }

  return items;
}

export async function testTallyConnection(host: string, port: number): Promise<TallyConnectionResult> {
  const result = await sendXml(host, port, REQUEST_XML);
  return {
    ok: result.ok,
    endpoint: result.endpoint,
    latencyMs: result.latencyMs,
    message: result.message,
    httpStatus: result.httpStatus
  };
}

export async function listTallyCompanies(host: string, port: number): Promise<TallyListResult> {
  const result = await sendXml(host, port, REQUEST_XML);
  if (!result.ok || !result.rawXml) {
    return {
      ok: false,
      message: result.message,
      items: []
    };
  }

  console.log("Company XML Response:", result.rawXml);
  const items = parseXmlItems(result.rawXml, "COMPANY", ["NAME", "GUID"]);
  console.log("Parsed companies:", items);

  return {
    ok: true,
    message: `Company list loaded (${items.length} companies)`,
    items
  };
}

export async function listTallyLedgers(host: string, port: number): Promise<TallyListResult> {
  const result = await sendXml(host, port, LEDGER_XML);
  if (!result.ok || !result.rawXml) {
    return {
      ok: false,
      message: result.message,
      items: []
    };
  }

  console.log("Ledger XML Response:", result.rawXml);
  const items = parseLedgerItems(result.rawXml);
  console.log("Parsed ledgers:", items);

  return {
    ok: true,
    message: `Ledger list loaded (${items.length} ledgers)`,
    items
  };
}
