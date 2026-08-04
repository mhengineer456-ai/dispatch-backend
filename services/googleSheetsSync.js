const googleSheetsDirectService = require('./googleSheetsDirectService');

const googleSheetsSync = {
  // Sync Bill / Packing List to Google Sheet via Direct Backend Service Account ONLY
  syncBillToSheet: async (billData) => {
    console.log(`📦 [BACKEND DIRECT SYNC] Saving Final Bill ${billData.packingNumber || billData.billNumber} to Google Sheets...`);
    try {
      const result = await googleSheetsDirectService.saveBillData(billData);
      return { success: !!result, message: 'Bill saved via Backend Service Account' };
    } catch (err) {
      console.error("❌ Direct Service Account Bill save error:", err.message);
      return { success: false, error: err.message };
    }
  },

  // Sync Draft to Google Sheet via Direct Backend Service Account ONLY
  syncDraftToSheet: async (draftData) => {
    console.log(`📦 [BACKEND DIRECT SYNC] Saving Draft ${draftData.packingNumber || draftData.billNumber} to Google Sheets...`);
    try {
      const result = await googleSheetsDirectService.saveDraftData(draftData);
      return { success: !!result, message: 'Draft saved via Backend Service Account' };
    } catch (err) {
      console.error("❌ Direct Service Account Draft save error:", err.message);
      return { success: false, error: err.message };
    }
  },

  // Sync Gatepass Update to Google Sheet via Direct Backend Service Account ONLY
  syncGatepassToSheet: async (payload) => {
    console.log(`📦 [BACKEND DIRECT SYNC] Updating Gatepass info for bills...`);
    try {
      const result = await googleSheetsDirectService.updateGatepassData(payload);
      return { success: !!result, message: 'Gatepass info updated in Google Sheets' };
    } catch (err) {
      console.error("❌ Direct Service Account Gatepass update error:", err.message);
      return { success: false, error: err.message };
    }
  },

  // Sync Barcode Lot Storage to Google Sheet via Direct Backend Service Account ONLY
  syncBarcodeLotToSheet: async (action, lotData) => {
    if (!action || action === 'saveLotData') {
      console.log(`📦 [BACKEND DIRECT SYNC] Saving Lot Barcode Data ${lotData.lotNumber || lotData.barcodeId} to Google Sheets...`);
      try {
        const result = await googleSheetsDirectService.saveLotBarcodeData(lotData);
        return { success: !!result, message: 'Lot saved via Backend Service Account' };
      } catch (err) {
        console.error("❌ Direct Service Account Lot save error:", err.message);
        return { success: false, error: err.message };
      }
    }
    return { success: true };
  }
};

module.exports = googleSheetsSync;
