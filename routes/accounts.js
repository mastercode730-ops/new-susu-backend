const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

// GET /api/accounts/latest-date
router.get('/latest-date', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const r = await executeQuery(`SELECT MAX(Date) AS MsgDate FROM Accounts WHERE CreatedBy=@uid`, { uid });
    let date = null;
    if (r && r[0] && r[0].MsgDate) {
      date = new Date(r[0].MsgDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    res.json({ success: true, date });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/accounts/customers (subusers see the same full list as admin)
router.get('/customers', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const qry = `SELECT Customers.CustomerName + ' ' + RIGHT(Customers.Mobile, 5) AS Name, Users.UID
             FROM Customers INNER JOIN Users ON Customers.Mobile = Users.Mobile
             WHERE Customers.fUID = @uid`;
    const data = await executeQuery(qry, { uid });
    res.json({ success: true, data: data || [] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/accounts/subusers
router.get('/subusers', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeQuery(
      `SELECT SubUserID, subusername FROM subusers WHERE fcreatedUID = @uid`,
      { uid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/accounts/list
router.get('/list', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { fromDate, toDate, staffUID, custUID } = req.query;
    const params = { fUID: uid, FDate: fromDate || '', TDate: toDate || '' };
    if (staffUID && staffUID !== '0' && staffUID !== 'All') params.fStaff = staffUID;
    if (custUID && custUID !== '0' && custUID !== 'All') params.fCID = custUID;
    const data = await executeStoredProcedure('ShowAllTransaction', params);
    res.json({ success: true, data: data || [] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/accounts/selected-balance
router.get('/selected-balance', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { customerUID } = req.query;
    const data = await executeStoredProcedure('SelectedUserBalance', { fUID: uid, UID: customerUID });
    const balance = data && data[0] ? (data[0].WinAmount || data[0].balance || 0) : 0;
    res.json({ success: true, balance });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/accounts (Create Transaction)
router.post('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    // Support both customerUID (mobile app) and cusID (old format)
    const customerUID = req.body.customerUID || req.body.cusID;
    const { date, type, amount, narration, staffID } = req.body;
    if (!amount || !type) return res.status(400).json({ success: false, message: 'Amount and Type required' });
    await executeStoredProcedure('CreateTransaction', {
      fCusID: customerUID === 'Self' ? 0 : customerUID,
      date: date, Type: type, Amount: amount,
      CreatedBy: uid, Narration: narration || '',
      fStaff: (type === 'Paid' || type === 'Received') && staffID ? staffID : 0
    });
    res.json({ success: true, message: 'Transaction created' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Narration column is only Varchar(50) (confirmed from CreateTransaction SP
// text) — leave room for the `~tx<AID>` pairing tag we append so a Transfer's
// two entries can be found and deleted together.
function buildNarration(userNote, label, pairedAid) {
  const tag = ` ~tx${pairedAid != null ? pairedAid : '0'}`;
  const prefix = (userNote && userNote.trim()) ? userNote.trim() : label;
  return (prefix.slice(0, 50 - tag.length) + tag).slice(0, 50);
}

// POST /api/accounts/transfer — customer-to-customer settlement in one action:
// "Received" from customer A + "Paid" to customer B, same amount/date.
// (Mirror of the website backend's /api/accounts/transfer.) The two entries
// are cross-linked via a `~tx<AID>` tag in Narration (CreateTransaction has
// no OUTPUT/identity return, so this is how the paired row gets found again
// for one-click delete-both).
router.post('/transfer', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { fromUID, toUID, date, amount, narration, staffID, fromName, toName } = req.body;

    if (!fromUID || !toUID) return res.status(400).json({ success: false, message: 'Both customers required' });
    if (String(fromUID) === String(toUID)) return res.status(400).json({ success: false, message: 'From and To customer must be different' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ success: false, message: 'Valid amount required' });

    const fStaff = staffID && staffID !== '0' ? staffID : 0;
    const label1 = `Transfer To ${toName || toUID}`;
    const label2 = `Transfer From ${fromName || fromUID}`;

    // Entry 1: Received from A — placeholder tag (~tx0) until we know entry 2's AID
    await executeStoredProcedure('CreateTransaction', {
      fCusID: fromUID, date, Type: 'Received', Amount: amount,
      CreatedBy: uid, Narration: buildNarration(narration, label1, 0), fStaff
    });
    const row1 = await executeQuery(
      `SELECT TOP 1 AID FROM Accounts WHERE CreatedBy=@uid AND fCustID=@fromUID AND [Date]=@date
       AND EntryType='Received' AND Received=@amount ORDER BY AID DESC`,
      { uid, fromUID, date, amount }
    );
    const aid1 = row1?.[0]?.AID;

    // Entry 2: Paid to B — tagged with entry 1's real AID.
    // Not wrapped in a DB transaction (SP-per-call API) — if this second
    // insert fails, surface it loudly so the lone Received entry gets
    // corrected manually from the Accounts list.
    let aid2;
    try {
      await executeStoredProcedure('CreateTransaction', {
        fCusID: toUID, date, Type: 'Paid', Amount: amount,
        CreatedBy: uid, Narration: buildNarration(narration, label2, aid1), fStaff
      });
      const row2 = await executeQuery(
        `SELECT TOP 1 AID FROM Accounts WHERE CreatedBy=@uid AND fCustID=@toUID AND [Date]=@date
         AND EntryType='Paid' AND Paid=@amount ORDER BY AID DESC`,
        { uid, toUID, date, amount }
      );
      aid2 = row2?.[0]?.AID;
    } catch (err2) {
      console.error('accounts/transfer: Paid leg failed after Received leg saved:', err2);
      return res.status(500).json({
        success: false,
        message: 'Received entry saved but Paid entry FAILED — delete the Received entry from the list and retry'
      });
    }

    // Patch entry 1's tag now that entry 2's real AID is known (best-effort).
    if (aid1 && aid2) {
      try {
        await executeQuery(
          `UPDATE Accounts SET Narration=@n WHERE AID=@aid1`,
          { n: buildNarration(narration, label1, aid2), aid1 }
        );
      } catch (err3) { console.error('accounts/transfer: pair-tag patch failed (non-fatal):', err3); }
    }

    res.json({ success: true, message: 'Transfer saved' });
  } catch (err) {
    console.error('accounts/transfer:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/accounts/:aid — if this entry is one leg of a Transfer (tagged
// `~tx<pairedAID>` in Narration), delete its paired leg too so the ledger
// never ends up with an orphaned half of a transfer.
router.delete('/:aid', requireAuth, async (req, res) => {
  try {
    const aid = parseInt(req.params.aid);
    const row = await executeQuery(`SELECT Narration FROM Accounts WHERE AID=@aid`, { aid });
    const m = row?.[0]?.Narration && row[0].Narration.match(/~tx(\d+)\s*$/);
    const pairedAid = m && m[1] !== '0' ? parseInt(m[1]) : null;

    await executeQuery(`DELETE FROM Accounts WHERE AID=@aid`, { aid });
    if (pairedAid) {
      await executeQuery(`DELETE FROM Accounts WHERE AID=@pairedAid`, { pairedAid });
    }
    res.json({ success: true, pairedDeleted: !!pairedAid });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
