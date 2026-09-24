const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

function getIST() { return new Date(Date.now() + 5.5 * 60 * 60 * 1000); }

function toSqlDate(dateStr) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (!dateStr) {
    const ist = getIST();
    return String(ist.getUTCDate()).padStart(2,'0') + '/' + MONTHS[ist.getUTCMonth()] + '/' + ist.getUTCFullYear();
  }
  const s = String(dateStr).trim();
  if (/^\d{2}\/[A-Za-z]{3}\/\d{4}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + '/' + MONTHS[parseInt(iso[2])-1] + '/' + iso[1];
  const ist = getIST();
  return String(ist.getUTCDate()).padStart(2,'0') + '/' + MONTHS[ist.getUTCMonth()] + '/' + ist.getUTCFullYear();
}

// GET /api/balance/latest-date
router.get('/latest-date', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rows = await executeQuery(
      `SELECT MAX(MsgDate) AS MsgDate FROM Chat WHERE fReceiverID=@uid AND IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'`,
      { uid }
    );
    if (rows?.[0]?.MsgDate) {
      const d = new Date(rows[0].MsgDate);
      const fmt = String(d.getDate()).padStart(2,'0') + '/' + MONTHS[d.getMonth()] + '/' + d.getFullYear();
      return res.json({ success: true, date: fmt });
    }
    const ist = getIST();
    const fmt = String(ist.getUTCDate()).padStart(2,'0') + '/' + MONTHS[ist.getUTCMonth()] + '/' + ist.getUTCFullYear();
    res.json({ success: true, date: fmt });
  } catch (e) {
    const ist = getIST();
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    res.json({ success: true, date: String(ist.getUTCDate()).padStart(2,'0') + '/' + MONTHS[ist.getUTCMonth()] + '/' + ist.getUTCFullYear() });
  }
});

// GET /api/balance/my-balance
router.get('/my-balance', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const mobile = req.user.Mobile || '';
    const { date } = req.query;
    const data = await executeStoredProcedure('GetMYBalance', {
      fUID: uid, Date: toSqlDate(date), Filter: '', Mobile: mobile
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/game-balance
router.get('/game-balance', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { date } = req.query;
    let data = await executeStoredProcedure('GetMyGameBalance', {
      fUID: uid, Date: toSqlDate(date), Filter: ''
    });
    data = data || [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/uttar-balance
router.get('/uttar-balance', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { date } = req.query;
    let data = await executeStoredProcedure('GetMyGameBalance', {
      fUID: uid, Date: toSqlDate(date), Filter: '', IsUttar: true
    });
    data = data || [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/staff-grid
router.get('/staff-grid', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { date } = req.query;
    const data = await executeStoredProcedure('StaffBalanceSheet', {
      fUID: uid, Date: toSqlDate(date)
    });
    const total = (data || []).reduce((s, r) => s + (parseFloat(r.Balance) || 0), 0);
    res.json({ success: true, data: data || [], totalBalance: total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/staff-balance
router.get('/staff-balance', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const subUID = req.user.SubUID || null;
    if (!subUID) return res.json({ success: true, balance: 0 });
    const data = await executeStoredProcedure('StaffBalanceSheet', {
      fUID: uid, OPTYPE: 1, FSTAFFID: subUID
    });
    const total = (data || []).reduce((s, r) => s + (parseFloat(r.Balance) || 0), 0);
    res.json({ success: true, balance: total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/my-balance-history
router.get('/my-balance-history', requireAuth, async (req, res) => {
  try {
    const { customerUID, type, fromDate, toDate } = req.query;
    const uid = req.user.UID;
    const data = await executeStoredProcedure('GetMYBalanceHistory', {
      fUID: uid, UID: customerUID,
      FromDate: toSqlDate(fromDate || '01/Jan/2022'),
      ToDate: toSqlDate(toDate)
    });
    let rows = data || [];
    const tLower = (type || '').toLowerCase();
    if (tLower === 'sale') {
      rows = rows.filter(r => {
        const t = (r.Type || '').toLowerCase();
        return ['sale', 'self hissa', 'self comm'].includes(t) || t.includes('adjust');
      });
      let running = 0;
      rows = rows.map((r, idx) => {
        const win = parseFloat(r.WinAmount || 0);
        running += win;
        return {
          ...r,
          SrNo: idx + 1,
          RunningTotal: running,
          Dene: win < 0 ? Math.abs(win) : 0,
          Lene: win > 0 ? win : 0
        };
      });
    } else if (tLower === 'accounts' || tLower === 'account') {
      rows = rows.filter(r => {
        const t = (r.Type || '').toLowerCase();
        return !['sale', 'self hissa', 'self comm', 'opening'].includes(t) && !t.includes('adjust');
      });
      let running = 0;
      rows = rows.map((r, idx) => {
        const win = parseFloat(r.WinAmount || 0);
        running += win;
        return {
          ...r,
          SrNo: idx + 1,
          RunningTotal: running,
          Dene: win < 0 ? Math.abs(win) : 0,
          Lene: win > 0 ? win : 0
        };
      });
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/game-balance-history
router.get('/game-balance-history', requireAuth, async (req, res) => {
  try {
    const { customerUID, type, fromDate, toDate } = req.query;
    const uid = req.user.UID;
    const data = await executeStoredProcedure('GetMyGameBalanceHistory', {
      fUID: uid, UID: customerUID,
      FromDate: toSqlDate(fromDate || '01/Jan/2022'),
      ToDate: toSqlDate(toDate)
    });
    let rows = data || [];
    const tLower = (type || '').toLowerCase();
    if (tLower === 'sale') {
      rows = rows.filter(r => {
        const t = (r.Type || '').toLowerCase();
        return ['sale', 'self hissa', 'self comm'].includes(t) || t.includes('adjust');
      });
      let running = 0;
      rows = rows.map((r, idx) => {
        const win = parseFloat(r.WinAmount || 0);
        running += win;
        return {
          ...r,
          SrNo: idx + 1,
          RunningTotal: running,
          Dene: win < 0 ? Math.abs(win) : 0,
          Lene: win > 0 ? win : 0
        };
      });
    } else if (tLower === 'accounts' || tLower === 'account') {
      rows = rows.filter(r => {
        const t = (r.Type || '').toLowerCase();
        return !['sale', 'self hissa', 'self comm', 'opening'].includes(t) && !t.includes('adjust');
      });
      let running = 0;
      rows = rows.map((r, idx) => {
        const win = parseFloat(r.WinAmount || 0);
        running += win;
        return {
          ...r,
          SrNo: idx + 1,
          RunningTotal: running,
          Dene: win < 0 ? Math.abs(win) : 0,
          Lene: win > 0 ? win : 0
        };
      });
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/balance/hisab-summary
router.get('/hisab-summary', requireAuth, async (req, res) => {
  try {
    const { customerUID, date, mode } = req.query;
    const uid = req.user.UID;
    const spName = mode === '1' ? 'GetDateWiseMyHisabHistory' : 'GetDateWiseWinAmountHistory';
    const data = await executeStoredProcedure(spName, {
      fUID: uid, Date: toSqlDate(date), UID: customerUID
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/balance/add-transaction
router.post('/add-transaction', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const subUID = req.user.SubUID || null;
    const { customerCID, date, type, amount } = req.body;
    await executeStoredProcedure('CreateTransaction', {
      fCusID: customerCID,
      date: toSqlDate(date),
      Type: type,
      Amount: parseFloat(amount) || 0,
      CreatedBy: uid,
      Narration: '',
      fStaff: subUID || 0
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
