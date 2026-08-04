const db = require('../db');

const generateVerificationCode = (lotNumber) => {
  const cleanLot = String(lotNumber || '').replace(/[^0-9]/g, '');
  let sum = 0;
  for (let i = 0; i < cleanLot.length; i++) {
    sum += parseInt(cleanLot[i], 10) || 0;
  }
  return (sum % 97).toString().padStart(2, '0');
};

const generateConfigFingerprint = (data) => {
  const configString = JSON.stringify({
    brand: data.brand,
    style: data.style,
    piecesPerSet: data.piecesPerSet,
    extraPercentage: data.extraPercentage,
    manualGroups: data.manualGroupingData ? Object.keys(data.manualGroupingData).length : 0
  });

  let hash = 0;
  for (let i = 0; i < configString.length; i++) {
    const char = configString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `cfg_${Math.abs(hash).toString(16)}`;
};

const generateVersionNumber = (lotNumber) => {
  const lots = db.getLots();
  const cleanLotNumber = String(lotNumber || '').trim();
  let maxVersion = 0;

  lots.forEach(item => {
    const rowLotNumber = String(item.lotNumber || '').trim();
    if (rowLotNumber === cleanLotNumber && item.version) {
      const match = String(item.version).match(/v(\d+)\.(\d+)/);
      if (match) {
        const vNum = parseInt(match[1], 10);
        if (vNum > maxVersion) maxVersion = vNum;
      }
    }
  });

  return `v${maxVersion + 1}.0`;
};

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      return JSON.parse(value);
    }
    return value;
  } catch (e) {
    return value;
  }
};

const formatResponse = (success, data, message) => ({
  success: !!success,
  data: data || null,
  message: message || '',
  timestamp: new Date().toISOString()
});

const lotBarcodeService = {
  saveLotData: (data) => {
    try {
      console.log('📝 Saving lot barcode data:', data.lotNumber, 'Barcode:', data.barcodeId);

      const lots = db.getLots();
      const barcodeIdStr = String(data.barcodeId);

      const colorsJson = Array.isArray(data.colors) ? JSON.stringify(data.colors) : (data.colors || '[]');
      const sizesJson = Array.isArray(data.sizes) ? JSON.stringify(data.sizes) : (data.sizes || '[]');
      const sizeQuantitiesJson = typeof data.sizeQuantities === 'object' ? JSON.stringify(data.sizeQuantities) : (data.sizeQuantities || '{}');
      const colorDetailsJson = typeof data.colorDetails === 'object' ? JSON.stringify(data.colorDetails) : (data.colorDetails || '{}');
      const cuttingTablesJson = Array.isArray(data.cuttingTables) ? JSON.stringify(data.cuttingTables) : (data.cuttingTables || '[]');
      const manualGroupingDataJson = data.manualGroupingData ? JSON.stringify(data.manualGroupingData) : (data.notes || '{}');

      const version = data.version || generateVersionNumber(data.lotNumber);
      const configFingerprint = data.configFingerprint || generateConfigFingerprint(data);
      const verificationCode = data.verificationCode || generateVerificationCode(data.lotNumber);

      const existingIndex = lots.findIndex(l => String(l.barcodeId) === barcodeIdStr);

      const record = {
        barcodeId: data.barcodeId,
        lotNumber: String(data.lotNumber),
        status: data.status || "Generated",
        generatedDate: data.generatedDate || new Date().toISOString(),
        printedDate: data.printedDate || null,
        completedDate: data.completedDate || null,
        verificationCode: verificationCode,
        generatedBy: data.generatedBy || "System",
        brand: data.brand || "",
        style: data.style || "",
        fabric: data.fabric || "",
        garmentType: data.garmentType || "",
        totalPieces: data.totalPieces || 0,
        colors: colorsJson,
        sizes: sizesJson,
        sizeQuantities: sizeQuantitiesJson,
        colorDetails: colorDetailsJson,
        cuttingTables: cuttingTablesJson,
        setRatio: data.setRatio || "",
        piecesPerSet: data.piecesPerSet || 0,
        numberOfSets: data.numberOfSets || 0,
        baseStickers: data.baseStickers || 0,
        extraPercentage: data.extraPercentage || 0,
        totalStickers: data.totalStickers || 0,
        packingSupervisor: data.packingSupervisor || "",
        packingDate: data.packingDate || null,
        totalPacked: data.totalPacked || 0,
        qualityStatus: data.qualityStatus || "Pending",
        notes: manualGroupingDataJson,
        version: version,
        configFingerprint: configFingerprint,
        manualGroupingData: typeof data.manualGroupingData === 'object' ? JSON.stringify(data.manualGroupingData) : '{}',

        // 32-column raw array format matching Google Apps Script exact schema
        rowData: [
          data.barcodeId,
          String(data.lotNumber),
          data.status || "Generated",
          data.generatedDate || new Date().toISOString(),
          data.printedDate || null,
          data.completedDate || null,
          verificationCode,
          data.generatedBy || "System",
          data.brand || "",
          data.style || "",
          data.fabric || "",
          data.garmentType || "",
          data.totalPieces || 0,
          colorsJson,
          sizesJson,
          sizeQuantitiesJson,
          colorDetailsJson,
          cuttingTablesJson,
          data.setRatio || "",
          data.piecesPerSet || 0,
          data.numberOfSets || 0,
          data.baseStickers || 0,
          data.extraPercentage || 0,
          data.totalStickers || 0,
          data.packingSupervisor || "",
          data.packingDate || null,
          data.totalPacked || 0,
          data.qualityStatus || "Pending",
          manualGroupingDataJson,
          version,
          configFingerprint,
          typeof data.manualGroupingData === 'object' ? JSON.stringify(data.manualGroupingData) : '{}'
        ]
      };

      // ALWAYS append as a new lot entry to preserve historical lot versions & entries
      lots.push(record);
      const rowIndex = lots.length + 1;

      db.saveLots(lots);

      return formatResponse(true, {
        barcodeId: data.barcodeId,
        lotNumber: data.lotNumber,
        version: version,
        rowIndex: rowIndex
      }, `Saved ${data.barcodeId} (${version}) successfully`);

    } catch (error) {
      console.error('❌ Save error:', error);
      return formatResponse(false, null, error.toString());
    }
  },

  updateLotStatus: (data) => {
    try {
      console.log('📝 Updating lot status:', data.lotNumber);
      const lots = db.getLots();
      const cleanLot = String(data.lotNumber).trim();
      const itemIndex = lots.findIndex(l => String(l.lotNumber).trim() === cleanLot);

      if (itemIndex === -1) {
        return formatResponse(false, null, `Lot ${data.lotNumber} not found in database`);
      }

      if (data.status) {
        lots[itemIndex].status = data.status;
        lots[itemIndex].rowData[2] = data.status;
      }
      if (data.status === 'Completed') {
        const completedDate = new Date().toISOString();
        lots[itemIndex].completedDate = completedDate;
        lots[itemIndex].rowData[5] = completedDate;
      }

      db.saveLots(lots);

      return formatResponse(true, {
        lotNumber: data.lotNumber,
        status: data.status
      }, `Lot status updated to: ${data.status}`);
    } catch (error) {
      console.error('❌ Update lot status error:', error);
      return formatResponse(false, null, error.toString());
    }
  },

  updatePrintStatus: (data) => {
    try {
      console.log('📝 Updating print status:', data.lotNumber);
      const lots = db.getLots();
      const cleanLot = String(data.lotNumber).trim();
      const itemIndex = lots.findIndex(l => String(l.lotNumber).trim() === cleanLot);

      if (itemIndex === -1) {
        return formatResponse(false, null, `Lot ${data.lotNumber} not found in database`);
      }

      const printedDate = new Date().toISOString();
      lots[itemIndex].printedDate = printedDate;
      lots[itemIndex].status = "Printed";
      lots[itemIndex].rowData[4] = printedDate;
      lots[itemIndex].rowData[2] = "Printed";

      db.saveLots(lots);

      return formatResponse(true, {
        lotNumber: data.lotNumber,
        printedDate: printedDate,
        status: "Printed"
      }, "Print status updated successfully");
    } catch (error) {
      console.error('❌ Update print status error:', error);
      return formatResponse(false, null, error.toString());
    }
  },

  getLotData: (lotNumber) => {
    try {
      if (!lotNumber) return formatResponse(false, null, "No lot number provided");

      const lots = db.getLots();
      const cleanLotNumber = String(lotNumber).trim();
      const item = lots.find(l => String(l.lotNumber).trim() === cleanLotNumber);

      if (item) {
        const lotData = {
          exists: true,
          barcodeId: item.barcodeId,
          lotNumber: item.lotNumber,
          status: item.status,
          generatedDate: item.generatedDate,
          printedDate: item.printedDate,
          completedDate: item.completedDate,
          verificationCode: item.verificationCode,
          generatedBy: item.generatedBy,
          brand: item.brand,
          style: item.style,
          fabric: item.fabric,
          garmentType: item.garmentType,
          totalPieces: item.totalPieces,
          colors: parseJson(item.colors) || [],
          sizes: parseJson(item.sizes) || [],
          sizeQuantities: parseJson(item.sizeQuantities) || {},
          colorDetails: parseJson(item.colorDetails) || {},
          cuttingTables: parseJson(item.cuttingTables) || [],
          setRatio: item.setRatio,
          piecesPerSet: item.piecesPerSet,
          numberOfSets: item.numberOfSets,
          baseStickers: item.baseStickers,
          extraPercentage: item.extraPercentage,
          totalStickers: item.totalStickers,
          packingSupervisor: item.packingSupervisor,
          packingDate: item.packingDate,
          totalPacked: item.totalPacked,
          qualityStatus: item.qualityStatus,
          notes: item.notes,
          version: item.version,
          configFingerprint: item.configFingerprint,
          manualGroupingData: parseJson(item.manualGroupingData) || {}
        };
        return formatResponse(true, lotData, "Lot data retrieved");
      }

      return formatResponse(true, { exists: false }, `Lot ${lotNumber} not found in database`);
    } catch (error) {
      return formatResponse(false, null, error.toString());
    }
  },

  getBarcodeData: (barcodeId) => {
    try {
      if (!barcodeId) return formatResponse(false, null, "No barcode ID provided");

      const lots = db.getLots();
      const cleanBarcode = String(barcodeId).trim();
      const item = lots.find(l => String(l.barcodeId).trim() === cleanBarcode);

      if (item) {
        return formatResponse(true, {
          exists: true,
          barcodeId: item.barcodeId,
          lotNumber: item.lotNumber,
          status: item.status,
          brand: item.brand,
          style: item.style,
          totalStickers: item.totalStickers,
          version: item.version,
          configFingerprint: item.configFingerprint
        }, "Barcode data retrieved");
      }

      return formatResponse(false, null, `Barcode "${barcodeId}" not found`);
    } catch (error) {
      return formatResponse(false, null, error.toString());
    }
  },

  verifyLot: (lotNumber) => {
    try {
      const lots = db.getLots();
      const cleanLotNumber = String(lotNumber || '').trim();
      const item = lots.find(l => String(l.lotNumber).trim() === cleanLotNumber);

      if (item) {
        const storedCode = item.verificationCode;
        const expectedCode = generateVerificationCode(lotNumber);
        const isValid = storedCode === expectedCode;

        return formatResponse(true, {
          valid: isValid,
          lotNumber: lotNumber,
          verificationStatus: isValid ? "VALID" : "INVALID"
        }, isValid ? "Lot verified successfully" : "Verification failed");
      }

      return formatResponse(false, null, `Lot ${lotNumber} not found`);
    } catch (error) {
      return formatResponse(false, null, error.toString());
    }
  },

  getAllLots: () => {
    try {
      const lots = db.getLots();
      const result = lots.map(item => ({
        barcodeId: item.barcodeId,
        lotNumber: item.lotNumber,
        status: item.status,
        brand: item.brand,
        totalStickers: item.totalStickers,
        generatedDate: item.generatedDate,
        version: item.version
      }));

      return formatResponse(true, {
        total: result.length,
        lots: result
      }, "All lots retrieved");
    } catch (error) {
      return formatResponse(false, null, error.toString());
    }
  },

  getAllLotVersions: (lotNumber) => {
    try {
      const lots = db.getLots();
      const cleanLotNumber = String(lotNumber || '').trim();
      const versions = [];

      lots.forEach((item, index) => {
        if (String(item.lotNumber || '').trim() === cleanLotNumber) {
          versions.push({
            version: item.version || `v${index + 1}`,
            barcodeId: item.barcodeId,
            totalStickers: item.totalStickers,
            piecesPerSet: item.piecesPerSet,
            generatedDate: item.generatedDate,
            status: item.status,
            configFingerprint: item.configFingerprint,
            rowIndex: index + 2
          });
        }
      });

      return formatResponse(true, {
        lotNumber: lotNumber,
        versions: versions,
        totalVersions: versions.length
      }, `Retrieved ${versions.length} version(s)`);
    } catch (error) {
      return formatResponse(false, null, error.toString());
    }
  },

  getLotDataByConfig: (lotNumber, configFingerprint) => {
    try {
      const lots = db.getLots();
      const cleanLotNumber = String(lotNumber || '').trim();

      const found = lots.find((item, index) => {
        return String(item.lotNumber || '').trim() === cleanLotNumber && String(item.configFingerprint || '').trim() === String(configFingerprint || '').trim();
      });

      if (found) {
        return formatResponse(true, {
          exists: true,
          config: configFingerprint
        }, "Config exists");
      }

      return formatResponse(true, { exists: false }, "Config not found");
    } catch (error) {
      return formatResponse(false, null, error.toString());
    }
  }
};

module.exports = lotBarcodeService;
