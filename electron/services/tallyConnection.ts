import type { TallyConnectionResult, TallyListItem, TallyListResult } from "../types";
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
});

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
            <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>

          </COLLECTION>

        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`;

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
  const items = parseXmlItems(result.rawXml, "LEDGER", ["NAME", "CLOSINGBALANCE"], "Ledger");
  console.log("Parsed ledgers:", items);

  return {
    ok: true,
    message: `Ledger list loaded (${items.length} ledgers)`,
    items
  };
}
