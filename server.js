const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const { sendPartyBillEmailWithPDF, sendGatepassEmailWithPDF } = require('./services/emailService');
const { generatePackingListPDF } = require('./services/pdfService');
const lotBarcodeService = require('./services/lotBarcodeService');
const googleSheetsSync = require('./services/googleSheetsSync');
const googleSheetsDirectService = require('./services/googleSheetsDirectService');
const { sendDailyDispatchReport, sendWeeklyDispatchReport, sendMonthlyDispatchReport, initDailyDispatchCron } = require('./services/dailyDispatchReportService');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS with full headers matching Apps Script handleOptions
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware to normalize incoming payloads (handles JSON, urlencoded, payload=..., data=...)
const parsePayload = (req, res, next) => {
  let payload = req.body || {};

  if (typeof payload.payload === 'string') {
    try { payload = JSON.parse(payload.payload); } catch (_) { }
  } else if (typeof payload.data === 'string') {
    try { payload = JSON.parse(payload.data); } catch (_) { }
  }

  req.parsedPayload = payload;
  next();
};

// Universal GET Handler (Matches Apps Script doGet)
const handleGetRequest = (req, res) => {
  const action = req.query.action;
  console.log(`\n📥 === GET Request Received === [Action: ${action}]`);

  if (action === 'getLotData') {
    return res.json(lotBarcodeService.getLotData(req.query.lotNumber));
  } else if (action === 'getBarcodeData') {
    return res.json(lotBarcodeService.getBarcodeData(req.query.barcodeId));
  } else if (action === 'verifyLot') {
    return res.json(lotBarcodeService.verifyLot(req.query.lotNumber));
  } else if (action === 'getAllLots') {
    return res.json(lotBarcodeService.getAllLots());
  } else if (action === 'getAllLotVersions') {
    return res.json(lotBarcodeService.getAllLotVersions(req.query.lotNumber));
  } else if (action === 'getLotDataByConfig') {
    return res.json(lotBarcodeService.getLotDataByConfig(req.query.lotNumber, req.query.config));
  } else if (action === 'test') {
    return res.json({ success: true, message: 'GET test successful', timestamp: new Date().toISOString() });
  }

  return res.json({ success: false, message: `Invalid GET action: ${action}` });
};

// Universal POST Handler (Matches Apps Script doPost)
const handlePostRequest = async (req, res) => {
  const p = req.parsedPayload || {};
  const action = req.query.action || p.action || req.body.action || (req.body.type === 'draft' ? 'saveDraft' : 'createPackingList');

  console.log(`\n📥 === POST Request Received === [Action: ${action}]`);
  console.log("Received data keys:", Object.keys(p));

  try {
    // 1. BARCODE LOT STORAGE ACTIONS
    if (action === 'saveLotData') {
      const lotData = typeof p.data === 'object' ? p.data : (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : p);
      const result = lotBarcodeService.saveLotData(lotData);

      // Asynchronous background Google Sheets sync (non-blocking for fast HTTP response)
      googleSheetsSync.syncBarcodeLotToSheet('saveLotData', lotData)
        .then(sheetSync => console.log("📊 [LOT SAVE SHEET SYNC RESULT]:", sheetSync))
        .catch(err => console.error("❌ [LOT SAVE SHEET SYNC ERROR]:", err.message));

      return res.json(result);
    }

    if (action === 'updateLotStatus') {
      const lotData = typeof p.data === 'object' ? p.data : (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : p);
      const result = lotBarcodeService.updateLotStatus(lotData);
      googleSheetsSync.syncBarcodeLotToSheet('updateLotStatus', lotData);
      return res.json(result);
    }

    if (action === 'updatePrintStatus') {
      const lotData = typeof p.data === 'object' ? p.data : (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : p);
      const result = lotBarcodeService.updatePrintStatus(lotData);
      googleSheetsSync.syncBarcodeLotToSheet('updatePrintStatus', lotData);
      return res.json(result);
    }

    // 2. UPDATE GATEPASS
    if (action === 'updateGatepass') {
      const result = db.updateGatepassInfo(
        p.billNumbers || [],
        p.gatepassNumber || '',
        p.gatepassData || {}
      );

      // Return instant response to frontend (0ms delay)
      res.json({ ...result, success: true });

      // Perform Google Sheets sync in background
      googleSheetsSync.syncGatepassToSheet(p).then(sheetSync => {
        console.log('📊 [GATEPASS SHEET SYNC RESULT]:', sheetSync);
      }).catch(err => {
        console.error('❌ [GATEPASS SHEET SYNC ERROR]:', err.message);
      });
      return;
    }

    // 3. DELETE DRAFT
    if (action === 'deleteDraft' || req.body.type === 'deleteDraft') {
      let draftId = p.draftId || p.packingNumber || p.billNumber || req.body.draftId;
      if (!draftId && req.body.data) {
        try {
          const parsed = JSON.parse(typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data));
          draftId = parsed.draftId || parsed.packingNumber || parsed.billNumber;
        } catch (_) { }
      }
      console.log(`🗑️ Processing Delete Draft for ID: ${draftId}`);
      const success = db.deleteDraft(draftId);
      const sheetSync = await googleSheetsSync.deleteDraftFromSheet(draftId);
      console.log('📊 [DELETE DRAFT SHEET SYNC RESULT]:', sheetSync);
      return res.json({ success: true, message: success ? 'Draft deleted' : 'Draft not found', sheetSync });
    }

    // 4. SEND GATEPASS EMAIL
    if (action === 'sendGatepassEmail') {
      console.log('📧 Processing Gatepass Email...');
      res.json({ success: true, message: 'Gatepass email processing in background' });

      sendGatepassEmailWithPDF(p).then(result => {
        console.log('📧 Gatepass Email result:', result);
      }).catch(err => {
        console.warn('⚠️ Gatepass Email error:', err.message);
      });
      return;
    }

    // 5. CREATE PACKING LIST (DRAFT OR FINAL)
    if (action === 'createPackingList' || action === 'saveDraft' || p.status || p.documentType) {
      const billData = p;
      const isDraft = billData.status === 'DRAFT' || billData.documentType === 'DRAFT' || req.body.type === 'draft';

      if (isDraft) {
        console.log('💾 Saving Draft Packing List to local DB and Google Sheets...');
        const savedDraft = db.saveDraft(billData);

        let sheetSync = null;
        try {
          sheetSync = await googleSheetsSync.syncDraftToSheet(billData);
          console.log('📊 [DRAFT SHEET SYNC RESULT]:', sheetSync);
        } catch (err) {
          console.error('❌ [DRAFT SHEET SYNC ERROR]:', err.message);
        }

        return res.json({
          success: true,
          message: 'Draft saved successfully',
          packingNumber: savedDraft.draftId,
          billNumber: savedDraft.draftId,
          sheetSync
        });
      } else {
        console.log('💾 Saving FINAL Bill to local DB and Google Sheets...');
        const savedBill = db.saveBill(billData);

        let sheetSync = null;
        try {
          sheetSync = await googleSheetsSync.syncBillToSheet(billData);
          console.log('📊 [FINAL BILL SHEET SYNC RESULT]:', sheetSync);
        } catch (e) {
          console.error('❌ [FINAL BILL SHEET SYNC ERROR]:', e.message);
        }

        // Cleanup draft if converted
        const targetDraftId = billData.draftId || billData.originalDraftId || billData.convertedFromDraftId || billData.draftNumber;
        if (targetDraftId) {
          try {
            console.log(`🧹 Cleaning up original draft ${targetDraftId} after converting to final bill...`);
            db.deleteDraft(targetDraftId);
            const draftDeletionResult = await googleSheetsSync.deleteDraftFromSheet(targetDraftId);
            console.log('📊 [AUTOMATIC DRAFT DELETION RESULT]:', draftDeletionResult);
          } catch (e) {
            console.error('❌ [AUTOMATIC DRAFT DELETION ERROR]:', e.message);
          }
        }

        // Dispatch email notification in background
        (async () => {
          try {
            const pdfBuffer = generatePackingListPDF(savedBill);
            const emailSent = await sendPartyBillEmailWithPDF(savedBill, pdfBuffer);
            console.log('📧 Final Bill Email Result:', emailSent);
          } catch (emailErr) {
            console.error('⚠️ Email generation failed:', emailErr.message);
          }
        })();

        return res.json({
          success: true,
          message: 'Bill saved successfully',
          packingNumber: savedBill.packingNumber,
          billNumber: savedBill.billNumber,
          sheetSync
        });
      }
    }

    if (action === 'test') {
      return res.json({ success: true, received: p, timestamp: new Date().toISOString() });
    }

    return res.json({ success: true, message: 'Request processed' });

  } catch (error) {
    console.error('❌ Error handling POST request:', error);
    return res.status(500).json({ success: false, error: error.toString() });
  }
};

// Bind GET and POST routes (Apps Script URLs matching)
app.get('/exec', handleGetRequest);
app.get('/api/post', handleGetRequest);
app.get('/api/barcode', handleGetRequest);
app.get('/', handleGetRequest);

app.post('/exec', parsePayload, handlePostRequest);
app.post('/api/post', parsePayload, handlePostRequest);
app.post('/api/barcode', parsePayload, handlePostRequest);
app.post('/', parsePayload, handlePostRequest);

// REST API GET Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'MH Dispatch & Barcode Backend Service Active', timestamp: new Date().toISOString() });
});

app.get('/api/bills', (req, res) => {
  const { startDate, endDate, partyName } = req.query;
  let bills = db.getBills();

  if (partyName) {
    bills = bills.filter(b => b.partyName === partyName);
  }
  if (startDate && endDate) {
    bills = bills.filter(b => {
      const date = b.billDate || b.createdAt;
      return date >= startDate && date <= endDate;
    });
  }

  res.json({ success: true, count: bills.length, data: bills });
});

// GET /api/sheet-data proxy for backend service account reads
app.get('/api/sheet-data', async (req, res) => {
  try {
    const spreadsheetId = req.query.spreadsheetId || req.query.sheetId || process.env.GOOGLE_PRODUCT_SHEET_ID || "1dOCjNFwaAel5qun0_ZJVIGmREqjI76CJBBFIjM3NHv8";
    const range = req.query.range || "A1:Z5000";

    const rows = await googleSheetsDirectService.getSheetValues(spreadsheetId, range);
    return res.json({ success: true, values: rows, rows });
  } catch (err) {
    console.error("❌ Error fetching sheet data in API:", err.message);
    return res.status(500).json({ success: false, error: err.message, values: [] });
  }
});

app.get('/api/lots', (req, res) => {
  const lots = db.getLots();
  res.json({ success: true, count: lots.length, data: lots });
});

app.get('/api/drafts', (req, res) => {
  const drafts = db.getDrafts();
  res.json({ success: true, count: drafts.length, data: drafts });
});

app.get('/api/gatepasses', (req, res) => {
  const gatepasses = db.getGatepasses();
  res.json({ success: true, count: gatepasses.length, data: gatepasses });
});

app.get('/api/dispatches/summary', (req, res) => {
  const bills = db.getBills();
  const totalQuantity = bills.reduce((sum, b) => {
    return sum + (b.items || []).reduce((iSum, item) => iSum + (Number(item.quantity) || 0), 0);
  }, 0);

  res.json({
    success: true,
    totalDispatches: bills.length,
    totalQuantity,
    bills
  });
});

// Trigger Daily Dispatch Summary Report via Email (Manually or On Demand)
app.post('/api/send-daily-dispatch-summary', async (req, res) => {
  const targetDate = req.body.date || req.query.date || null;
  const result = await sendDailyDispatchReport(targetDate);
  res.json(result);
});

app.get('/api/trigger-daily-summary', async (req, res) => {
  const targetDate = req.query.date || null;
  const result = await sendDailyDispatchReport(targetDate);
  res.json(result);
});

// Trigger Weekly Dispatch Summary Report via Email (Manually or On Demand)
app.post('/api/send-weekly-dispatch-summary', async (req, res) => {
  const targetDate = req.body.date || req.query.date || null;
  const result = await sendWeeklyDispatchReport(targetDate);
  res.json(result);
});

app.get('/api/trigger-weekly-summary', async (req, res) => {
  const targetDate = req.query.date || null;
  const result = await sendWeeklyDispatchReport(targetDate);
  res.json(result);
});

// Trigger Monthly Dispatch Summary Report via Email (Manually or On Demand)
app.post('/api/send-monthly-dispatch-summary', async (req, res) => {
  const year = req.body.year || req.query.year || null;
  const month = req.body.month || req.query.month || null;
  const result = await sendMonthlyDispatchReport(year, month);
  res.json(result);
});

app.get('/api/trigger-monthly-summary', async (req, res) => {
  const year = req.query.year || null;
  const month = req.query.month || null;
  const result = await sendMonthlyDispatchReport(year, month);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 MH Dispatch & Barcode Backend Server listening on port ${PORT}`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/exec`);
  console.log(`==================================================\n`);

  // Initialize 10:00 PM Nightly Dispatch Summary Cron Job
  initDailyDispatchCron();
});
