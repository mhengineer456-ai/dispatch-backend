const googleSheetsDirectService = require('./googleSheetsDirectService');

const DEFAULT_BILL_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwSOsKfAlKYq-wYGFa4KWnGwryK1T0ViJYigil8pCbZz_xkK3gv0tqtCgB-k54rRVfa/exec";
const DEFAULT_GATEPASS_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxL5iwsTonjFTHTsy1VO0VO-KWTOM9n6eDrfztclMIjb8mPZc2TBsJD1AHcueZOv0LN/exec";
const DEFAULT_DRAFT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyTjq-1ZRF9z5tLgRmsG2KE3yADq1CEHnPlQ6Rf6aYfFWvRbkvbkCnkAE-_WhTfIs2Z/exec";
const DEFAULT_BARCODE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx_oG5Rou1cmyUiJQnpZo6IxW0n_NdSxMk-E3pjk31_IBzmkyKNdggsQ1rKuyFE10pe/exec";

const googleSheetsSync = {
  // Sync Bill / Packing List to Google Sheet via Backend
  syncBillToSheet: async (billData) => {
    const billNum = billData.packingNumber || billData.billNumber;
    console.log(`📦 [BACKEND SYNC] Saving Final Bill ${billNum} to Google Sheets...`);
    
    // 1. Try Direct Google Service Account API
    try {
      const directResult = await googleSheetsDirectService.saveBillData(billData);
      if (directResult) {
        console.log(`✅ [BACKEND SYNC] Saved Bill ${billNum} via Direct Service Account API`);
        return { success: true, message: 'Bill saved via Backend Service Account' };
      }
    } catch (err) {
      console.warn(`⚠️ [BACKEND SYNC] Direct Service Account save error (${err.message}). Using Backend Web Bridge...`);
    }

    // 2. Failover: Backend internal proxy call to Google Sheets web endpoint
    try {
      const targetUrl = process.env.BILL_APPS_SCRIPT_URL || DEFAULT_BILL_APPS_SCRIPT_URL;
      const params = new URLSearchParams();
      params.append('payload', JSON.stringify({
        ...billData,
        action: 'createPackingList',
        status: 'FINAL',
        documentType: 'FINAL'
      }));

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const json = await res.json();
      console.log(`✅ [BACKEND SYNC] Saved Bill ${billNum} to Google Sheets via Backend Web Bridge:`, json);
      return json;
    } catch (fallbackErr) {
      console.error(`❌ [BACKEND SYNC] Failed to save Bill ${billNum} to Google Sheets:`, fallbackErr.message);
      return { success: false, error: fallbackErr.message };
    }
  },

  // Sync Draft to Google Sheet via Backend
  syncDraftToSheet: async (draftData) => {
    const draftNum = draftData.packingNumber || draftData.billNumber;
    console.log(`📦 [BACKEND SYNC] Saving Draft ${draftNum} to Google Sheets...`);
    
    // 1. Try Direct Google Service Account API
    try {
      const directResult = await googleSheetsDirectService.saveDraftData(draftData);
      if (directResult) {
        console.log(`✅ [BACKEND SYNC] Saved Draft ${draftNum} via Direct Service Account API`);
        return { success: true, message: 'Draft saved via Backend Service Account' };
      }
    } catch (err) {
      console.warn(`⚠️ [BACKEND SYNC] Direct Service Account draft error (${err.message}). Using Backend Web Bridge...`);
    }

    // 2. Failover: Backend internal proxy call (JSON body expected by Draft Apps Script)
    try {
      const targetUrl = process.env.DRAFT_APPS_SCRIPT_URL || DEFAULT_DRAFT_APPS_SCRIPT_URL;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draftData,
          action: 'saveDraft',
          status: 'DRAFT',
          documentType: 'DRAFT'
        })
      });
      const json = await res.json();
      console.log(`✅ [BACKEND SYNC] Saved Draft ${draftNum} to Google Sheets via Backend Web Bridge:`, json);
      return json;
    } catch (fallbackErr) {
      console.error(`❌ [BACKEND SYNC] Failed to save Draft ${draftNum} to Google Sheets:`, fallbackErr.message);
      return { success: false, error: fallbackErr.message };
    }
  },

  // Sync Gatepass Update to Google Sheet via Backend
  syncGatepassToSheet: async (payload) => {
    console.log(`📦 [BACKEND SYNC] Updating Gatepass info in Google Sheets...`);
    
    // 1. Try Direct Google Service Account API
    try {
      const directResult = await googleSheetsDirectService.updateGatepassData(payload);
      if (directResult) {
        console.log(`✅ [BACKEND SYNC] Updated Gatepass info via Direct Service Account API`);
        return { success: true, message: 'Gatepass updated via Backend Service Account' };
      }
    } catch (err) {
      console.warn(`⚠️ [BACKEND SYNC] Direct Service Account gatepass error (${err.message}). Using Backend Web Bridge...`);
    }

    // 2. Failover: Backend internal proxy call (JSON body expected by Gatepass Apps Script)
    try {
      const targetUrl = process.env.GATEPASS_APPS_SCRIPT_URL || DEFAULT_GATEPASS_APPS_SCRIPT_URL;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          action: 'updateGatepass'
        })
      });
      const json = await res.json();
      console.log(`✅ [BACKEND SYNC] Updated Gatepass in Google Sheets via Backend Web Bridge:`, json);
      return json;
    } catch (fallbackErr) {
      console.error(`❌ [BACKEND SYNC] Failed to update Gatepass in Google Sheets:`, fallbackErr.message);
      return { success: false, error: fallbackErr.message };
    }
  },

  // Sync Barcode Lot Storage to Google Sheet via Backend
  syncBarcodeLotToSheet: async (action, lotData) => {
    if (!action || action === 'saveLotData') {
      const lotNum = lotData.lotNumber || lotData.barcodeId;
      console.log(`📦 [BACKEND SYNC] Saving Lot Barcode Data ${lotNum} to Google Sheets...`);
      
      // 1. Try Direct Google Service Account API
      try {
        const directResult = await googleSheetsDirectService.saveLotBarcodeData(lotData);
        if (directResult) {
          console.log(`✅ [BACKEND SYNC] Saved Lot ${lotNum} via Direct Service Account API`);
          return { success: true, message: 'Lot saved via Backend Service Account' };
        }
      } catch (err) {
        console.warn(`⚠️ [BACKEND SYNC] Direct Service Account lot save error (${err.message}). Using Backend Web Bridge...`);
      }

      // 2. Failover: Backend internal proxy call ('data' parameter expected by Barcode Apps Script)
      try {
        const targetUrl = process.env.BARCODE_APPS_SCRIPT_URL || DEFAULT_BARCODE_APPS_SCRIPT_URL;
        const params = new URLSearchParams();
        params.append('action', 'saveLotData');
        params.append('data', JSON.stringify(lotData));

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        const json = await res.json();
        console.log(`✅ [BACKEND SYNC] Saved Lot ${lotNum} to Google Sheets via Backend Web Bridge:`, json);
        return json;
      } catch (fallbackErr) {
        console.error(`❌ [BACKEND SYNC] Failed to save Lot ${lotNum} to Google Sheets:`, fallbackErr.message);
        return { success: false, error: fallbackErr.message };
      }
    }
    return { success: true };
  },

  // Delete Draft Packing List from Google Sheet via Backend
  deleteDraftFromSheet: async (draftId) => {
    if (!draftId) return { success: false, error: 'No draft ID provided' };
    const cleanDraftId = String(draftId).trim();
    console.log(`📦 [BACKEND SYNC] Deleting Draft ${cleanDraftId} from Google Sheets...`);
    
    // 1. Try Direct Google Service Account API
    try {
      const directResult = await googleSheetsDirectService.deleteDraftData(cleanDraftId);
      if (directResult) {
        console.log(`✅ [BACKEND SYNC] Deleted Draft ${cleanDraftId} via Direct Service Account API`);
        return { success: true, message: 'Draft deleted via Backend Service Account' };
      }
    } catch (err) {
      console.warn(`⚠️ [BACKEND SYNC] Direct Service Account draft delete error (${err.message}). Using Backend Web Bridge...`);
    }

    // 2. Failover: Backend internal proxy call to Apps Script
    try {
      const targetUrl = process.env.DRAFT_APPS_SCRIPT_URL || DEFAULT_DRAFT_APPS_SCRIPT_URL;
      const encodedData = encodeURIComponent(JSON.stringify({ draftId: cleanDraftId, packingNumber: cleanDraftId, billNumber: cleanDraftId }));
      const bodyString = `data=${encodedData}&type=deleteDraft`;

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyString
      });
      const json = await res.json();
      if (!json.success && ((json.error && String(json.error).includes('not found')) || (json.message && String(json.message).includes('not found')))) {
        console.log(`ℹ️ [BACKEND SYNC] Draft ${cleanDraftId} was already removed from Google Sheets.`);
        return { success: true, message: `Draft ${cleanDraftId} already removed` };
      }
      console.log(`✅ [BACKEND SYNC] Deleted Draft ${cleanDraftId} from Google Sheets via Backend Web Bridge:`, json);
      return json;
    } catch (fallbackErr) {
      console.error(`❌ [BACKEND SYNC] Failed to delete Draft ${cleanDraftId} from Google Sheets:`, fallbackErr.message);
      return { success: false, error: fallbackErr.message };
    }
  }
};

module.exports = googleSheetsSync;
