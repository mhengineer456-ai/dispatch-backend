const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const getFilePath = (collection) => path.join(DATA_DIR, `${collection}.json`);

const readCollection = (collection) => {
  const filePath = getFilePath(collection);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error(`Error reading collection ${collection}:`, err);
    return [];
  }
};

const writeCollection = (collection, data) => {
  const filePath = getFilePath(collection);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing collection ${collection}:`, err);
    return false;
  }
};

const db = {
  // Bills CRUD
  getBills: () => readCollection('bills'),
  saveBill: (billData) => {
    const bills = readCollection('bills');
    const billNumber = billData.packingNumber || billData.billNumber;
    const existingIndex = bills.findIndex(b => (b.packingNumber || b.billNumber) === billNumber);

    const record = {
      ...billData,
      billNumber,
      packingNumber: billNumber,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      bills[existingIndex] = record;
    } else {
      record.createdAt = record.createdAt || new Date().toISOString();
      bills.push(record);
    }
    writeCollection('bills', bills);
    return record;
  },

  // Drafts CRUD
  getDrafts: () => readCollection('drafts'),
  saveDraft: (draftData) => {
    const drafts = readCollection('drafts');
    const draftId = draftData.draftId || draftData.packingNumber || draftData.billNumber || `DRAFT-${Date.now()}`;
    const existingIndex = drafts.findIndex(d => (d.draftId || d.packingNumber || d.billNumber) === draftId);

    const record = {
      ...draftData,
      draftId,
      status: 'DRAFT',
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      drafts[existingIndex] = record;
    } else {
      record.createdAt = record.createdAt || new Date().toISOString();
      drafts.push(record);
    }
    writeCollection('drafts', drafts);
    return record;
  },

  deleteDraft: (draftId) => {
    let drafts = readCollection('drafts');
    const initialLength = drafts.length;
    drafts = drafts.filter(d => (d.draftId || d.packingNumber || d.billNumber) !== draftId);
    if (drafts.length !== initialLength) {
      writeCollection('drafts', drafts);
      return true;
    }
    return false;
  },

  // Gatepass Updates
  updateGatepassInfo: (billNumbers, gatepassNumber, gatepassData = {}) => {
    const bills = readCollection('bills');
    let updatedCount = 0;
    const targetBills = Array.isArray(billNumbers) ? billNumbers : [billNumbers];

    bills.forEach(bill => {
      const bNum = bill.packingNumber || bill.billNumber;
      if (targetBills.includes(bNum)) {
        bill.gatepassNumber = gatepassNumber;
        bill.gatepassData = { ...(bill.gatepassData || {}), ...gatepassData };
        bill.updatedAt = new Date().toISOString();
        updatedCount++;
      }
    });

    writeCollection('bills', bills);

    // Save gatepass log
    const gatepasses = readCollection('gatepasses');
    const existingGp = gatepasses.findIndex(g => g.gatepassNumber === gatepassNumber);
    const gpRecord = {
      gatepassNumber,
      billNumbers: targetBills,
      gatepassData,
      updatedAt: new Date().toISOString()
    };

    if (existingGp >= 0) {
      gatepasses[existingGp] = gpRecord;
    } else {
      gpRecord.createdAt = new Date().toISOString();
      gatepasses.push(gpRecord);
    }
    writeCollection('gatepasses', gatepasses);

    return { success: true, updatedCount };
  },

  getGatepasses: () => readCollection('gatepasses'),

  // Lot Barcode Storage CRUD
  getLots: () => readCollection('lots'),
  saveLots: (lotsData) => writeCollection('lots', lotsData)
};

module.exports = db;
