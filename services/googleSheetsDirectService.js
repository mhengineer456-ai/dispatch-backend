const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const KEY_FILE_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  ? path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
  : path.join(__dirname, '../service-account.json');

let sheetsClient = null;

const getSheetsClient = async () => {
  if (sheetsClient) return sheetsClient;

  // If key file does not exist on server, but env variable exists, write service-account.json to disk automatically
  if (!fs.existsSync(KEY_FILE_PATH) && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      let credentials;
      if (typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string') {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      } else {
        credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      }

      if (credentials && typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      fs.writeFileSync(KEY_FILE_PATH, JSON.stringify(credentials, null, 2), 'utf8');
      console.log(`📝 Successfully generated ${KEY_FILE_PATH} from environment variable!`);
    } catch (writeErr) {
      console.error('❌ Error creating service-account.json from env variable:', writeErr.message);
    }
  }

  if (!fs.existsSync(KEY_FILE_PATH)) {
    console.log(`⚠️ Google Service Account key file not found at: ${KEY_FILE_PATH}`);
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const authClient = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    console.log('✅ Google Sheets Service Account authenticated successfully');
    return sheetsClient;
  } catch (err) {
    console.error('❌ Error authenticating Google Service Account:', err.message);
    return null;
  }
};

const extractPartNo = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  if (obj.partNo && String(obj.partNo).trim()) return String(obj.partNo).trim();
  if (obj.part_no && String(obj.part_no).trim()) return String(obj.part_no).trim();
  if (obj['PartNo'] && String(obj['PartNo']).trim()) return String(obj['PartNo']).trim();
  if (obj['PART NO.'] && String(obj['PART NO.']).trim()) return String(obj['PART NO.']).trim();
  if (obj['Part No.'] && String(obj['Part No.']).trim()) return String(obj['Part No.']).trim();
  if (obj['Part No'] && String(obj['Part No']).trim()) return String(obj['Part No']).trim();
  if (obj['PART NO'] && String(obj['PART NO']).trim()) return String(obj['PART NO']).trim();
  if (obj['Part Number'] && String(obj['Part Number']).trim()) return String(obj['Part Number']).trim();
  if (obj['PART NUMBER'] && String(obj['PART NUMBER']).trim()) return String(obj['PART NUMBER']).trim();

  for (const key of Object.keys(obj)) {
    const cleanKey = key.trim().toUpperCase().replace(/[\.\_\-\#]/g, ' ').replace(/\s+/g, ' ');
    if (cleanKey === 'PART NO' || cleanKey === 'PARTNO' || cleanKey === 'PART NUMBER' || cleanKey === 'PART') {
      const val = obj[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }
  return '';
};

const extractRate = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  if (obj.rate !== undefined && obj.rate !== null && String(obj.rate).trim() !== '') return String(obj.rate).trim();
  if (obj['RATE'] && String(obj['RATE']).trim()) return String(obj['RATE']).trim();
  if (obj['Rate'] && String(obj['Rate']).trim()) return String(obj['Rate']).trim();

  for (const key of Object.keys(obj)) {
    const cleanKey = key.trim().toUpperCase().replace(/[\.\_\-]/g, ' ').replace(/\s+/g, ' ');
    if (cleanKey === 'RATE' || cleanKey === 'UNIT RATE' || cleanKey === 'PRICE') {
      const val = obj[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }
  return '';
};

const googleSheetsDirectService = {
  // Append single row
  appendValues: async (spreadsheetId, range, values) => {
    const sheets = await getSheetsClient();
    if (!sheets) return null;

    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] }
      });
      console.log(`✅ [DIRECT SHEETS] Appended row to ${range}`);
      return response.data;
    } catch (err) {
      console.error(`❌ [DIRECT SHEETS] Append error on ${range}:`, err.message);
      return null;
    }
  },

  // Append multiple rows (e.g. BillItems)
  appendMultipleRows: async (spreadsheetId, range, rowsArray) => {
    const sheets = await getSheetsClient();
    if (!sheets || !rowsArray || rowsArray.length === 0) return null;

    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rowsArray }
      });
      console.log(`✅ [DIRECT SHEETS] Appended ${rowsArray.length} rows to ${range}`);
      return response.data;
    } catch (err) {
      console.error(`❌ [DIRECT SHEETS] Batch append error on ${range}:`, err.message);
      return null;
    }
  },

  // Save Final Bill & BillItems (18 Columns for BillItems with PartNo at Column 16)
  saveBillData: async (billData) => {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1s8cXaMtG2XSxdOu1Ecve5aLI2MQcbMjVsn6Sih4hItk";
    const billNumber = billData.packingNumber || billData.billNumber;
    const items = Array.isArray(billData.items) ? billData.items : [];

    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const totalSets = items.reduce((sum, i) => sum + (Number(i.sets) || 0), 0);
    const totalAmount = items.reduce((sum, i) => {
      const qty = Number(i.quantity) || 0;
      const rate = Number(i.rate || extractRate(i)) || 0;
      return sum + (qty * rate);
    }, 0);

    const sheets = await getSheetsClient();
    let headers = [];
    if (sheets) {
      try {
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `Bills!A1:AZ1`
        });
        if (headerRes.data.values && headerRes.data.values.length > 0) {
          headers = headerRes.data.values[0].map(h => String(h || '').trim());
        }
      } catch (hErr) {
        console.warn("Could not fetch Bills headers, fallback to standard schema:", hErr.message);
      }
    }

    const mapBillValueToHeader = (headerName) => {
      const clean = headerName.toLowerCase().replace(/[\_\-\s\(\)]/g, '');
      if (clean === 'billnumber' || clean === 'packingnumber' || clean === 'billno' || clean === 'packingno') return billNumber;
      if (clean === 'partyname' || clean === 'party') return billData.partyName || 'N/A';
      if (clean === 'billdate' || clean === 'date') return billData.billDate || new Date().toISOString().split('T')[0];
      if (clean === 'duedate') return billData.dueDate || '';
      if (clean === 'orderreference' || clean === 'orderno' || clean === 'orderref') return billData.orderReference || billData.orderNo || '';
      if (clean === 'itemscount' || clean === 'totalitems') return items.length;
      if (clean === 'totalquantity' || clean === 'totalqty' || clean === 'quantity') return totalQty;
      if (clean === 'totalsets' || clean === 'sets') return totalSets;
      if (clean === 'totalamount' || clean === 'amount') return totalAmount;
      if (clean === 'createddate' || clean === 'timestamp') return billData.createdDate || new Date().toISOString();
      if (clean === 'preparedby') return billData.preparedBy || 'System';
      if (clean === 'preparedbyrole') return billData.preparedByRole || 'User';
      if (clean === 'preparedbyemail') return billData.preparedByEmail || '';
      if (clean === 'status') return billData.status || 'FINAL';
      if (clean === 'documenttype') return billData.documentType || 'FINAL';
      if (clean === 'billdatajson' || clean === 'billdata' || clean === 'jsondata') return JSON.stringify(billData);
      if (clean === 'totalboxes') return billData.totalBoxes || '';
      if (clean === 'totalbags') return billData.totalBags || '';
      if (clean === 'totalpolybags') return billData.totalPolybags || '';
      if (clean === 'gatepasscreated') return billData.hasGatepass ? 'YES' : 'PENDING';
      if (clean === 'gatepasscreationtime') return billData.gatepassTime || '';
      if (clean === 'porter') return billData.porter || '';
      if (clean === 'byhand') return billData.byHand || '';
      if (clean === 'byhandpersonname') return billData.byHandPersonName || '';
      if (clean === 'drivername') return billData.driverName || '';
      if (clean === 'drivercontact') return billData.driverContact || '';
      if (clean === 'drivervehiclenumber' || clean === 'vehiclenumber' || clean === 'vehicleno') return billData.vehicleNo || billData.vehicleNumber || '';
      if (clean === 'gatepassnumber') return billData.gatepassNumber || '';
      if (clean === 'notes') return billData.notes || '';
      return '';
    };

    let billRow = [];
    if (headers.length > 0) {
      billRow = headers.map(h => mapBillValueToHeader(h));
    } else {
      billRow = [
        billNumber,
        billData.partyName || 'N/A',
        billData.billDate || new Date().toISOString().split('T')[0],
        billData.dueDate || '',
        billData.orderReference || billData.orderNo || '',
        items.length,
        totalQty,
        totalSets,
        billData.createdDate || new Date().toISOString(),
        billData.preparedBy || 'System',
        billData.preparedByRole || 'User',
        billData.preparedByEmail || '',
        billData.status || 'FINAL',
        JSON.stringify(billData),
        billData.totalBoxes || '',
        billData.totalBags || '',
        billData.totalPolybags || '',
        billData.hasGatepass ? 'YES' : 'PENDING',
        billData.gatepassTime || '',
        billData.porter || '',
        billData.byHand || '',
        billData.byHandPersonName || '',
        billData.driverName || '',
        billData.driverContact || '',
        billData.vehicleNo || billData.vehicleNumber || '',
        billData.gatepassNumber || ''
      ];
    }

    await googleSheetsDirectService.appendValues(spreadsheetId, `Bills!A1`, billRow);

    // 2. Append all items to BillItems sheet (18 Columns with PartNo guaranteed at col 16)
    if (items.length > 0) {
      const itemRows = items.map(item => {
        let partNo = extractPartNo(item);
        if (!partNo && item.description) {
          const m = String(item.description).match(/^(\d{3,6})\b/);
          if (m) partNo = m[1];
        }
        const rate = extractRate(item) || '1';
        const qty = Number(item.quantity) || 0;
        const amount = (qty * (Number(rate) || 0)) || 0;

        return [
          billNumber,                                                      // 1: Bill Number
          item.id || Date.now(),                                           // 2: Item ID
          item.barcode || item.lotNumber || '',                            // 3: Barcode
          item.lotNumber || '',                                            // 4: Lot Number
          item.brand || '',                                                // 5: Brand
          item.description || item.name || item.itemName || '',            // 6: Item Name
          item.sets || 0,                                                  // 7: Sets
          item.setsPerPcs || item.piecesPerSet || 0,                       // 8: Pieces Per Set
          item.looseOperation || 'add',                                    // 9: Loose Operation
          item.loosePcs || 0,                                              // 10: Loose Pieces
          qty,                                                             // 11: Total Quantity
          billData.createdDate || new Date().toISOString(),                // 12: Created Date
          billData.billDate || '',                                         // 13: Bill Date
          billData.partyName || '',                                        // 14: Party Name
          item.priceList || '',                                            // 15: Price List
          partNo,                                                          // 16: PartNo (GUARANTEED)
          rate,                                                            // 17: RATE
          amount                                                           // 18: AMOUNT
        ];
      });

      await googleSheetsDirectService.appendMultipleRows(spreadsheetId, `BillItems!A1:R`, itemRows);
    }

    return true;
  },

  // Save Draft Packing List to DraftBills and DraftItems tabs directly via Service Account
  saveDraftData: async (draftData) => {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1s8cXaMtG2XSxdOu1Ecve5aLI2MQcbMjVsn6Sih4hItk";
    const draftNumber = draftData.packingNumber || draftData.billNumber || `DL-${Date.now().toString().slice(-4)}`;
    const items = Array.isArray(draftData.items) ? draftData.items : [];

    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const totalSets = items.reduce((sum, i) => sum + (Number(i.sets) || 0), 0);

    // 1. Append to DraftBills sheet (19 columns)
    const draftRow = [
      draftNumber,                                                    // 1: Draft ID
      draftData.partyName || 'N/A',                                   // 2: Party Name
      draftData.billDate || new Date().toISOString().split('T')[0],   // 3: Bill Date
      draftData.dueDate || '',                                        // 4: Due Date
      draftData.orderReference || draftData.orderNo || '',            // 5: Order Reference
      items.length,                                                   // 6: Items Count
      totalQty,                                                       // 7: Total Quantity
      totalSets,                                                      // 8: Total Sets
      draftData.createdDate || new Date().toISOString(),              // 9: Created Date
      new Date().toISOString(),                                       // 10: Last Modified
      draftData.preparedBy || 'System',                               // 11: Prepared By
      draftData.preparedByRole || 'User',                             // 12: Prepared By Role
      draftData.preparedByEmail || '',                                // 13: Prepared By Email
      'DRAFT',                                                        // 14: Status
      'DRAFT',                                                        // 15: Document Type
      JSON.stringify(draftData),                                      // 16: Draft Data (JSON)
      draftData.totalBoxes || '',                                     // 17: Total Boxes
      draftData.totalBags || '',                                      // 18: Total Bags
      draftData.totalPolybags || ''                                   // 19: Total Polybags
    ];

    const isUpdate = draftData.isUpdate === true || draftData.isUpdate === 'true';
    const sheets = await getSheetsClient();
    let existingRowIndex = -1;

    if (sheets && isUpdate) {
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `DraftBills!A1:A500`
        });
        if (res.data.values) {
          const idx = res.data.values.findIndex(r => r[0] && String(r[0]).trim() === String(draftNumber).trim());
          if (idx !== -1) {
            existingRowIndex = idx + 1;
          }
        }
      } catch (err) {
        console.warn("Could not check existing DraftBills rows:", err.message);
      }
    }

    const buildDraftItemRow = (dNum, item, dData) => {
      let partNo = extractPartNo(item);
      if (!partNo && item.description) {
        const m = String(item.description).match(/^(\d{3,6})\b/);
        if (m) partNo = m[1];
      }
      const rate = extractRate(item) || '1';

      return [
        dNum,                                                           // 1: Draft ID
        item.id || Date.now(),                                          // 2: Item ID
        item.barcode || item.lotNumber || '',                           // 3: Barcode
        item.lotNumber || '',                                           // 4: Lot Number
        item.brand || '',                                               // 5: Brand
        item.description || item.name || item.itemName || '',           // 6: Item Name
        item.sets || 0,                                                 // 7: Sets
        item.setsPerPcs || item.piecesPerSet || 0,                      // 8: Pieces Per Set
        item.looseOperation || 'add',                                   // 9: Loose Operation
        item.loosePcs || 0,                                             // 10: Loose Pieces
        Number(item.quantity) || 0,                                     // 11: Total Quantity
        dData.createdDate || new Date().toISOString(),                  // 12: Created Date
        dData.billDate || '',                                           // 13: Bill Date
        dData.partyName || '',                                          // 14: Party Name
        new Date().toISOString(),                                       // 15: Timestamp
        partNo,                                                         // 16: Part No
        rate                                                            // 17: Rate
      ];
    };

    if (existingRowIndex !== -1 && sheets) {
      console.log(`🔄 [DIRECT SHEETS] Updating existing draft ${draftNumber} at row DraftBills!A${existingRowIndex}...`);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `DraftBills!A${existingRowIndex}:S${existingRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [draftRow] }
      });

      if (items.length > 0) {
        try {
          const itemsRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `DraftItems!A1:Q5000`
          });

          if (itemsRes.data.values && itemsRes.data.values.length > 0) {
            const allItemRows = itemsRes.data.values;
            const headerRow = allItemRows[0];
            const otherItems = allItemRows.slice(1).filter(r => r[0] && String(r[0]).trim() !== String(draftNumber).trim());
            const newItemRows = items.map(item => buildDraftItemRow(draftNumber, item, draftData));
            const updatedSheetValues = [headerRow, ...otherItems, ...newItemRows];

            await sheets.spreadsheets.values.clear({
              spreadsheetId,
              range: `DraftItems!A1:Q5000`
            });

            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `DraftItems!A1`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: updatedSheetValues }
            });
            console.log(`✅ [DIRECT SHEETS] Replaced items for draft ${draftNumber} in DraftItems tab (${newItemRows.length} items)`);
          } else {
            const newItemRows = items.map(item => buildDraftItemRow(draftNumber, item, draftData));
            await googleSheetsDirectService.appendMultipleRows(spreadsheetId, `DraftItems!A1:Q`, newItemRows);
          }
        } catch (itemErr) {
          console.warn("Could not replace DraftItems, fallback to append:", itemErr.message);
          const newItemRows = items.map(item => buildDraftItemRow(draftNumber, item, draftData));
          await googleSheetsDirectService.appendMultipleRows(spreadsheetId, `DraftItems!A1:Q`, newItemRows);
        }
      }
    } else {
      console.log(`📦 [DIRECT SHEETS] Appending new draft ${draftNumber} to DraftBills...`);
      await googleSheetsDirectService.appendValues(spreadsheetId, `DraftBills!A1:S`, draftRow);

      if (items.length > 0) {
        const newItemRows = items.map(item => buildDraftItemRow(draftNumber, item, draftData));
        await googleSheetsDirectService.appendMultipleRows(spreadsheetId, `DraftItems!A1:Q`, newItemRows);
      }
    }

    console.log(`✅ [DIRECT SHEETS] Successfully saved draft ${draftNumber} to DraftBills & DraftItems tabs!`);
    return true;
  },

  // Save Barcode Lot (Dynamic Header Column Mapping) directly via Service Account
  saveLotBarcodeData: async (data) => {
    const spreadsheetId = process.env.GOOGLE_PRODUCT_SHEET_ID || "1dOCjNFwaAel5qun0_ZJVIGmREqjI76CJBBFIjM3NHv8";
    const tabName = "LotBarcodeData";

    try {
      const sheets = await getSheetsClient();
      let headers = [];

      if (sheets) {
        try {
          const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${tabName}!A1:AZ1`
          });
          if (headerRes.data.values && headerRes.data.values.length > 0) {
            headers = headerRes.data.values[0].map(h => String(h || '').trim());
          }
        } catch (hErr) {
          console.warn("Could not fetch header row, fallback to default schema:", hErr.message);
        }
      }

      const mapValueToHeader = (headerName) => {
        const cleanHeader = headerName.toLowerCase().replace(/[\_\-\s]/g, '');
        if (cleanHeader.includes('barcodeid') || cleanHeader === 'barcode') return data.barcodeId || `LOT-${data.lotNumber}`;
        if (cleanHeader.includes('lotnumber') || cleanHeader === 'lot') return String(data.lotNumber || '');
        if (cleanHeader.includes('status') && !cleanHeader.includes('quality') && !cleanHeader.includes('print')) return data.status || "Generated";
        if (cleanHeader.includes('generateddate') || cleanHeader.includes('createddate')) return data.generatedDate || new Date().toISOString();
        if (cleanHeader.includes('printeddate')) return data.printedDate || '';
        if (cleanHeader.includes('completeddate')) return data.completedDate || '';
        if (cleanHeader.includes('verificationcode') || cleanHeader.includes('verfication')) return data.verificationCode || '';
        if (cleanHeader.includes('generatedby')) return data.generatedBy || "System";
        if (cleanHeader.includes('brand')) return data.brand || '';
        if (cleanHeader.includes('style')) return data.style || '';
        if (cleanHeader.includes('fabric')) return data.fabric || '';
        if (cleanHeader.includes('garmenttype') || cleanHeader.includes('itemname')) return data.garmentType || data.itemName || '';
        if (cleanHeader.includes('totalpieces') || cleanHeader === 'pieces') return data.totalPieces || 0;
        if (cleanHeader === 'colors') return Array.isArray(data.colors) ? JSON.stringify(data.colors) : (data.colors || '[]');
        if (cleanHeader === 'sizes') return Array.isArray(data.sizes) ? JSON.stringify(data.sizes) : (data.sizes || '[]');
        if (cleanHeader.includes('sizequantities') || cleanHeader.includes('sizequantity')) return typeof data.sizeQuantities === 'object' ? JSON.stringify(data.sizeQuantities) : (data.sizeQuantities || '{}');
        if (cleanHeader.includes('colordetails')) return typeof data.colorDetails === 'object' ? JSON.stringify(data.colorDetails) : (data.colorDetails || '{}');
        if (cleanHeader.includes('cuttingtables')) return Array.isArray(data.cuttingTables) ? JSON.stringify(data.cuttingTables) : (data.cuttingTables || '[]');
        if (cleanHeader.includes('setratio')) return data.setRatio || '';
        if (cleanHeader.includes('piecesperset')) return data.piecesPerSet || 0;
        if (cleanHeader.includes('numberofsets') || cleanHeader.includes('sets')) return data.numberOfSets || 0;
        if (cleanHeader.includes('basestickers')) return data.baseStickers || 0;
        if (cleanHeader.includes('extrapercentage')) return data.extraPercentage || 0;
        if (cleanHeader.includes('totalstickers') || cleanHeader.includes('stickers')) return data.totalStickers || 0;
        if (cleanHeader.includes('packingsupervisor')) return data.packingSupervisor || '';
        if (cleanHeader.includes('packingdate')) return data.packingDate || '';
        if (cleanHeader.includes('totalpacked')) return data.totalPacked || 0;
        if (cleanHeader.includes('qualitystatus')) return data.qualityStatus || "Pending";
        if (cleanHeader.includes('manualgroupingdata')) return data.manualGroupingData ? JSON.stringify(data.manualGroupingData) : '{}';
        if (cleanHeader.includes('version')) return data.version || "v1.0";
        if (cleanHeader.includes('configfingerprint')) return data.configFingerprint || "cfg_default";
        if (cleanHeader.includes('notes')) return data.notes || '';
        return '';
      };

      let rowData = [];
      if (headers.length > 0) {
        rowData = headers.map(h => mapValueToHeader(h));
      } else {
        rowData = data.rowData || [
          data.barcodeId || `LOT-${data.lotNumber}`,
          String(data.lotNumber),
          data.status || "Generated",
          data.generatedDate || new Date().toISOString(),
          data.printedDate || "",
          data.completedDate || "",
          data.verificationCode || "",
          data.generatedBy || "System",
          data.brand || "",
          data.style || "",
          data.fabric || "",
          data.garmentType || data.itemName || "",
          data.totalPieces || 0,
          Array.isArray(data.colors) ? JSON.stringify(data.colors) : (data.colors || '[]'),
          Array.isArray(data.sizes) ? JSON.stringify(data.sizes) : (data.sizes || '[]'),
          typeof data.sizeQuantities === 'object' ? JSON.stringify(data.sizeQuantities) : (data.sizeQuantities || '{}'),
          typeof data.colorDetails === 'object' ? JSON.stringify(data.colorDetails) : (data.colorDetails || '{}'),
          Array.isArray(data.cuttingTables) ? JSON.stringify(data.cuttingTables) : (data.cuttingTables || '[]'),
          data.setRatio || "",
          data.piecesPerSet || 0,
          data.numberOfSets || 0,
          data.baseStickers || 0,
          data.extraPercentage || 0,
          data.totalStickers || 0,
          data.packingSupervisor || "",
          data.packingDate || "",
          data.totalPacked || 0,
          data.qualityStatus || "Pending",
          data.manualGroupingData ? JSON.stringify(data.manualGroupingData) : '{}',
          data.version || "v1.0",
          data.configFingerprint || "cfg_default",
          data.notes || ''
        ];
      }

      return await googleSheetsDirectService.appendValues(spreadsheetId, `${tabName}!A1`, rowData);
    } catch (err) {
      console.error("Error in saveLotBarcodeData:", err);
      return false;
    }
  },

  // Read all bills directly from Google Sheet (Bills and BillItems tabs)
  fetchBillsFromSheet: async () => {
    const sheets = await getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1s8cXaMtG2XSxdOu1Ecve5aLI2MQcbMjVsn6Sih4hItk";
    const billMap = new Map();

    // 1. Fetch BillItems tab (where itemized dispatches are stored)
    try {
      const itemsRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'BillItems!A1:R'
      });

      const itemRows = itemsRes.data.values;
      if (itemRows && itemRows.length > 1) {
        const rows = itemRows.slice(1);
        rows.forEach(r => {
          const billNo = r[0];
          if (!billNo) return;

          let billDate = r[12] || ''; // Col M: Bill Date
          let createdDate = r[11] || ''; // Col L: Created Date
          let partyName = r[13] || ''; // Col N: Party Name
          let partNo = r[15] || ''; // Col P: PartNo
          let rate = r[16] || '1'; // Col Q: RATE

          if (!billDate && createdDate) {
            const match = String(createdDate).match(/\d{4}-\d{2}-\d{2}/);
            if (match) billDate = match[0];
          }

          if (!billMap.has(billNo)) {
            billMap.set(billNo, {
              billNumber: billNo,
              packingNumber: billNo,
              billDate: billDate || new Date().toISOString().split('T')[0],
              partyName: partyName || 'N/A',
              createdDate: createdDate || new Date().toISOString(),
              status: 'FINAL',
              items: []
            });
          }

          const existingBill = billMap.get(billNo);
          if (partyName && (!existingBill.partyName || existingBill.partyName === 'N/A')) {
            existingBill.partyName = partyName;
          }
          if (billDate && !existingBill.billDate) {
            existingBill.billDate = billDate;
          }

          existingBill.items.push({
            id: r[1] || Date.now(),
            barcode: r[2] || '',
            lotNumber: r[3] || '',
            brand: r[4] || '',
            description: r[5] || '',
            sets: Number(r[6]) || 0,
            setsPerPcs: Number(r[7]) || 0,
            looseOperation: r[8] || 'add',
            loosePcs: Number(r[9]) || 0,
            quantity: Number(r[10]) || 0,
            partNo: partNo,
            rate: rate
          });
        });
      }
    } catch (itemErr) {
      console.warn('⚠️ Could not fetch BillItems tab:', itemErr.message);
    }

    // 2. Fetch Bills tab
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Bills!A1:T'
      });

      const rows = response.data.values;
      if (rows && rows.length > 1) {
        rows.slice(1).forEach(row => {
          const billNo = row[0];
          if (!billNo) return;

          let jsonPayload = null;
          if (row[16] && row[16].startsWith('{')) {
            try { jsonPayload = JSON.parse(row[16]); } catch (e) { }
          }

          if (jsonPayload && typeof jsonPayload === 'object') {
            billMap.set(billNo, jsonPayload);
          } else if (!billMap.has(billNo)) {
            billMap.set(billNo, {
              billNumber: billNo,
              packingNumber: billNo,
              billDate: row[1] || new Date().toISOString().split('T')[0],
              partyName: row[2] || 'N/A',
              totalItems: Number(row[3]) || 0,
              totalSets: Number(row[4]) || 0,
              totalQuantity: Number(row[5]) || 0,
              totalAmount: Number(row[6]) || 0,
              preparedBy: row[7] || '',
              status: row[13] || 'FINAL',
              createdDate: row[14] || new Date().toISOString(),
              items: []
            });
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch Bills tab:', err.message);
    }

    return Array.from(billMap.values());
  },

  // Get raw values for any range directly via Service Account
  getSheetValues: async (spreadsheetId, range) => {
    const sheets = await getSheetsClient();
    if (!sheets) return [];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId || process.env.GOOGLE_PRODUCT_SHEET_ID || "1dOCjNFwaAel5qun0_ZJVIGmREqjI76CJBBFIjM3NHv8",
        range: range || "A1:Z5000"
      });
      return res.data.values || [];
    } catch (err) {
      console.error(`Error fetching range ${range} from spreadsheet ${spreadsheetId}:`, err.message);
      return [];
    }
  },

  // Update Gatepass Information in Bills tab directly via Service Account
  updateGatepassData: async (payload) => {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1s8cXaMtG2XSxdOu1Ecve5aLI2MQcbMjVsn6Sih4hItk";
    const billNumbers = Array.isArray(payload.billNumbers) ? payload.billNumbers : [payload.billNumber || payload.packingNumber].filter(Boolean);
    if (billNumbers.length === 0) return false;

    const gData = payload.gatepassData || payload || {};
    const gatepassNumber = payload.gatepassNumber || gData.gatepassNumber || '';
    const creationTime = gData.gatepassTime || gData.creationTime || new Date().toLocaleString();

    const sheets = await getSheetsClient();
    if (!sheets) return false;

    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Bills!A1:AZ5000`
      });

      if (!res.data.values || res.data.values.length <= 1) {
        console.warn("Bills sheet is empty, cannot update gatepass info");
        return false;
      }

      const rows = res.data.values;
      const headers = rows[0].map(h => String(h || '').trim());

      const getColIndex = (headerName) => {
        const clean = headerName.toLowerCase().replace(/[\_\-\s\(\)]/g, '');
        return headers.findIndex(h => h.toLowerCase().replace(/[\_\-\s\(\)]/g, '') === clean);
      };

      const billNoCol = getColIndex('Bill Number');
      const totalBoxesCol = getColIndex('Total Boxes');
      const totalBagsCol = getColIndex('Total Bags');
      const totalPolybagsCol = getColIndex('Total Polybags');
      const gatepassCreatedCol = getColIndex('GATEPASS CREATED');
      const gatepassTimeCol = getColIndex('GATEPASS CREATION TIME');
      const porterCol = getColIndex('PORTER');
      const byHandCol = getColIndex('BY HAND');
      const byHandPersonNameCol = getColIndex('BY HAND PERSON NAME');
      const driverNameCol = getColIndex('DRIVER NAME');
      const driverContactCol = getColIndex('DRIVER CONTACT');
      const driverVehicleCol = getColIndex('DRIVER VEHICLE NUMBER');
      const gatepassNoCol = getColIndex('GATEPASS NUMBER');

      console.log(`📦 [GATEPASS UPDATE] Target bill numbers:`, billNumbers);

      for (const targetBillNo of billNumbers) {
        const cleanTarget = String(targetBillNo).trim();
        const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[billNoCol] && String(r[billNoCol]).trim() === cleanTarget);

        if (rowIndex !== -1) {
          const rowNum = rowIndex + 1;
          const rowData = [...rows[rowIndex]];

          while (rowData.length < headers.length) {
            rowData.push('');
          }

          if (totalBoxesCol !== -1) rowData[totalBoxesCol] = gData.totalBoxes ?? gData.totalPetti ?? '0';
          if (totalBagsCol !== -1) rowData[totalBagsCol] = gData.totalBags ?? gData.totalBora ?? '0';
          if (totalPolybagsCol !== -1) rowData[totalPolybagsCol] = gData.totalPolybags ?? '0';
          if (gatepassCreatedCol !== -1) rowData[gatepassCreatedCol] = 'YES';
          if (gatepassTimeCol !== -1) rowData[gatepassTimeCol] = creationTime;
          if (porterCol !== -1) rowData[porterCol] = gData.porter || (gData.isPorter ? 'YES' : 'NO');
          if (byHandCol !== -1) rowData[byHandCol] = gData.byHand || (gData.isByHand ? 'YES' : 'NO');
          if (byHandPersonNameCol !== -1) rowData[byHandPersonNameCol] = gData.byHandPersonName || gData.personName || '';
          if (driverNameCol !== -1) rowData[driverNameCol] = gData.driverName || '';
          if (driverContactCol !== -1) rowData[driverContactCol] = gData.driverContact || '';
          if (driverVehicleCol !== -1) rowData[driverVehicleCol] = gData.driverVehicleNumber || gData.vehicleNumber || gData.vehicleNo || '';
          if (gatepassNoCol !== -1) rowData[gatepassNoCol] = gatepassNumber;

          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Bills!A${rowNum}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowData] }
          });

          console.log(`✅ [DIRECT SHEETS] Updated Gatepass info for bill ${cleanTarget} at row Bills!A${rowNum}`);
        } else {
          console.warn(`⚠️ Bill ${cleanTarget} not found in Bills sheet for Gatepass update`);
        }
      }

      return true;

    } catch (err) {
      console.error("❌ Error updating Gatepass info in Google Sheets:", err.message);
      return false;
    }
  }
};

module.exports = googleSheetsDirectService;
