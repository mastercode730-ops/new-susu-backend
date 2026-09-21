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

// GET /api/hisab/latest-date
router.get('/latest-date', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rows = await executeQuery(
      `SELECT MAX(MsgDate) AS MsgDate FROM Chat
       WHERE fReceiverID=@uid AND IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
         AND CAST(MsgDate AS date) <= CAST(DATEADD(minute, 330, GETUTCDATE()) AS date)`,
      { uid }
    );
    if (rows?.[0]?.MsgDate) {
      const d = new Date(rows[0].MsgDate);
      return res.json({ success: true, date: String(d.getDate()).padStart(2,'0') + '/' + MONTHS[d.getMonth()] + '/' + d.getFullYear() });
    }
    const ist = getIST();
    res.json({ success: true, date: String(ist.getUTCDate()).padStart(2,'0') + '/' + MONTHS[ist.getUTCMonth()] + '/' + ist.getUTCFullYear() });
  } catch (e) {
    res.json({ success: true, date: null });
  }
});

// GET /api/hisab/customers
router.get('/customers', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeQuery(
      `SELECT CustomerName, Mobile, (SELECT UID FROM Users WHERE Mobile=Customers.Mobile) AS UID
       FROM Customers WHERE fUID=@uid`,
      { uid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/game-hisab?date=&filter=
router.get('/game-hisab', requireAuth, async (req, res) => {
  try {
    const { date, filter } = req.query;
    const uid = req.user.UID;
    const data = await executeStoredProcedure('GetDateWiseMyHisab', {
      fUID: uid, Date: toSqlDate(date), Filter: filter || ''
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/win-amount?date=&filter=
router.get('/win-amount', requireAuth, async (req, res) => {
  try {
    const { date, filter } = req.query;
    const uid = req.user.UID;
    const data = await executeStoredProcedure('GetDateWiseWinAmount', {
      fUID: uid, Date: toSqlDate(date), Filter: filter || ''
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/game-hisab-history?date=&uid= (or customerUID=&fromDate=&toDate=)
router.get('/game-hisab-history', requireAuth, async (req, res) => {
  try {
    const { date, uid: custUID, customerUID, fromDate, toDate } = req.query;
    const myUID = req.user.UID;
    const targetUID = custUID || customerUID;
    const data = await executeStoredProcedure('GetDateWiseMyHisabHistory', {
      fUID: myUID,
      Date: toSqlDate(date || fromDate),
      UID: targetUID
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/win-amount-history?date=&uid= (or customerUID=&fromDate=&toDate=)
router.get('/win-amount-history', requireAuth, async (req, res) => {
  try {
    const { date, uid: custUID, customerUID, fromDate, toDate } = req.query;
    const myUID = req.user.UID;
    const targetUID = custUID || customerUID;
    const data = await executeStoredProcedure('GetDateWiseWinAmountHistory', {
      fUID: myUID,
      date: toSqlDate(date || fromDate),
      UID: targetUID
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/sale-history?date=&filter=
router.get('/sale-history', requireAuth, async (req, res) => {
  try {
    const { date, filter } = req.query;
    const uid = req.user.UID;
    if (!date) return res.json({ success: true, data: [] });
    const data = await executeStoredProcedure('ShowSaleHistory', {
      fUID: uid, Date: toSqlDate(date), Filter: filter || ''
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/summary?startDate=&endDate=&gid=&cid=
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, gid, cid, date } = req.query;
    const uid = req.user.UID;
    // Support both new (startDate/endDate) and old (date) param styles
    const fromDate = startDate || date;
    const toDate = endDate || date;

    const data = await executeStoredProcedure('GetHisabSummary', {
      date: toSqlDate(fromDate),
      date1: toSqlDate(toDate),
      UID: uid,
      GID: gid || null,
      CID: cid || null
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('hisab/summary:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/date-wise-summary?fromDate=&toDate=
router.get('/date-wise-summary', requireAuth, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const uid = req.user.UID;
    const data = await executeStoredProcedure('ShowDateWiseHisabSummary', {
      UID: uid, FromDate: toSqlDate(fromDate), ToDate: toSqlDate(toDate || fromDate)
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/date-wise-user?uid=&fromDate=&toDate=
router.get('/date-wise-user', requireAuth, async (req, res) => {
  try {
    const { uid: custUID, fromDate, toDate } = req.query;
    const myUID = req.user.UID;
    const data = await executeStoredProcedure('ShowDateWiseHisabSummaryUserID', {
      CID: custUID, UID: myUID,
      FromDate: toSqlDate(fromDate), ToDate: toSqlDate(toDate || fromDate)
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/staff-grid
router.get('/staff-grid', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { date, fromDate, toDate } = req.query;
    const data = await executeStoredProcedure('StaffBalanceSheet', {
      fUID: uid, Date: toSqlDate(date || fromDate)
    });
    const total = (data || []).reduce((s, r) => s + (parseFloat(r.Balance) || 0), 0);
    res.json({ success: true, data: data || [], totalBalance: total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hisab/show-results?startDate=&endDate=
router.get('/show-results', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const uid = req.user.UID;
    if (!startDate) return res.json({ success: true, data: [] });
    const sd = new Date(startDate);
    const year = sd.getFullYear();
    const month = sd.getMonth() + 1;
    const days = new Date(year, month, 0).getDate();
    const data = await executeStoredProcedure('ShowResult', {
      Year: year.toString(), Month: month.toString(), Days: days,
      UID: uid, FromDate: startDate, ToDate: endDate || startDate
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
