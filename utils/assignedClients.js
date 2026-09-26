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
  const mobiles = new Set(list.map(r => String(r.Mobile || '').trim()).filter(Boolean));
  const uids = new Set(list.map(r => String(r.CustUID)).filter(Boolean));
  const names = new Set(list.map(r => String(r.CustomerName || '').toLowerCase().trim()).filter(Boolean));

  function isMatch(record) {
    if (!record) return false;
    if (record.CID && cids.has(String(record.CID))) return true;
    if (record.UID && uids.has(String(record.UID))) return true;
    if (record.fCustID && uids.has(String(record.fCustID))) return true;
    const mob = String(record.Mobile || record.CMobile || '').trim();
    if (mob) {
      if (mobiles.has(mob)) return true;
      for (const m of mobiles) {
        if (m && (mob.includes(m) || m.includes(mob))) return true;
        const last5 = m.slice(-5);
        if (last5 && mob.includes(last5)) return true;
      }
    }
    const cName = String(record.CustomerName || '').toLowerCase().trim();
    if (cName && names.has(cName)) return true;
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
