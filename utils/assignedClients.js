const { executeQuery } = require('../config/database');

/**
 * Returns assigned customer metadata for a subuser.
 * If user is an admin (subUID is null or undefined), returns null.
 */
async function getAssignedClients(uid, subUID) {
  if (!subUID) return null;

  const rows = await executeQuery(
    `SELECT c.CID, c.Mobile, c.CustomerName, u.UID AS CustUID
     FROM AssignClientToStaff a
     INNER JOIN Customers c ON a.fCustID = c.CID
     LEFT JOIN Users u ON c.Mobile = u.Mobile
     WHERE a.fStaffID = @subUID AND a.fUID = @uid AND (a.IsAssigned = 'True' OR a.IsAssigned = 1)`,
    { uid, subUID }
  );

  const list = rows || [];
  const cids = new Set(list.map(r => String(r.CID)));
  const mobiles = new Set(list.map(r => String(r.Mobile || '').replace(/\D/g, '')).filter(Boolean));
  const rawMobiles = new Set(list.map(r => String(r.Mobile || '').trim()).filter(Boolean));
  const uids = new Set(list.map(r => String(r.CustUID)).filter(Boolean));
  const names = new Set(list.map(r => String(r.CustomerName || '').toLowerCase().trim()).filter(Boolean));

  function isMatch(record) {
    if (!record) return false;

    // 1. Direct ID matches (CID, UID, CustUID, fCustID)
    if (record.CID && cids.has(String(record.CID))) return true;
    if (record.UID && uids.has(String(record.UID))) return true;
    if (record.CustUID && uids.has(String(record.CustUID))) return true;
    if (record.fCustID && (cids.has(String(record.fCustID)) || uids.has(String(record.fCustID)))) return true;

    // 2. Customer Name matches
    const cName = String(record.CustomerName1 || record.CustomerName || record.Customer || '').toLowerCase().trim();
    if (cName) {
      if (names.has(cName)) return true;
      const cleanName = cName.replace(/\s+\d+$/, '').trim();
      if (cleanName && names.has(cleanName)) return true;
    }

    // 3. CMobile (e.g. "CustomerName 12345")
    if (record.CMobile) {
      const cmobName = String(record.CMobile).replace(/\s+\d+$/, '').trim().toLowerCase();
      if (cmobName && names.has(cmobName)) return true;
      const cmobDigits = String(record.CMobile).replace(/\D/g, '');
      if (cmobDigits && mobiles.has(cmobDigits)) return true;
    }

    // 4. Exact Mobile match
    const rawMob = String(record.Mobile || '').trim();
    if (rawMob) {
      if (rawMobiles.has(rawMob)) return true;
      const cleanMob = rawMob.replace(/\D/g, '');
      if (cleanMob && mobiles.has(cleanMob)) return true;
    }

    return false;
  }

  return {
    rows: list,
    cids,
    mobiles,
    uids,
    names,
    isMatch
  };
}

module.exports = { getAssignedClients };
