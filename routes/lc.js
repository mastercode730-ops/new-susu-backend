const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

function getIST() {
  const d = new Date(new Date().getTime() + 5.5 * 3600000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}/${months[d.getMonth()]}/${d.getFullYear()}`;
}

function firstOfMonth() {
  const d = new Date(new Date().getTime() + 5.5 * 3600000);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(first.getDate()).padStart(2,'0')}/${months[first.getMonth()]}/${first.getFullYear()}`;
}

function toSqlDate(dateStr) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  const ddmmyyyy = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/);
  if (ddmmyyyy) return ddmmyyyy[1].padStart(2, '0') + '/' + ddmmyyyy[2] + '/' + ddmmyyyy[3];
  const ddmmNumeric = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmNumeric) {
    const moIdx = parseInt(ddmmNumeric[2], 10) - 1;
    const moStr = (moIdx >= 0 && moIdx < 12) ? MONTHS[moIdx] : MONTHS[0];
    return ddmmNumeric[1].padStart(2, '0') + '/' + moStr + '/' + ddmmNumeric[3];
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + '/' + MONTHS[parseInt(iso[2], 10)-1] + '/' + iso[1];
  return s;
}

// GET /api/lc/main
router.get('/main', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { dateFrom, dateTo } = req.query;
    const data = await executeStoredProcedure('GetLCPercentage', {
      fUID: uid, Startdate: toSqlDate(dateFrom) || firstOfMonth(), EndDate: toSqlDate(dateTo) || getIST()
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/lc/uttar
router.get('/uttar', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { dateFrom, dateTo } = req.query;
    const data = await executeStoredProcedure('GetLCPercentage', {
      fUID: uid, Startdate: toSqlDate(dateFrom) || firstOfMonth(), EndDate: toSqlDate(dateTo) || getIST(), IsUttar: 'True'
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/lc/reference
router.get('/reference', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { dateFrom, dateTo } = req.query;
    const data = await executeStoredProcedure('GetLCPercentage', {
      fUID: uid, Startdate: toSqlDate(dateFrom) || firstOfMonth(), EndDate: toSqlDate(dateTo) || getIST(), OpType: 1
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/lc/third-party
router.get('/third-party', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { dateFrom, dateTo } = req.query;
    const data = await executeStoredProcedure('GetLCPercentage', {
      fUID: uid, Startdate: toSqlDate(dateFrom) || firstOfMonth(), EndDate: toSqlDate(dateTo) || getIST(), OpType: 2
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/lc/post
router.post('/post', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { dateTo, mainRows, uttarRows, hissaRows, referenceRows } = req.body;
    if (!dateTo) return res.status(400).json({ success: false, message: 'Date required' });

    const sqlDate = toSqlDate(dateTo);
    const check = await executeQuery(
      `SELECT COUNT(*) AS Count FROM Accounts WHERE Date=@date AND EntryType='Commission' AND CreatedBy=@uid`,
      { date: sqlDate, uid }
    );
    if (check?.[0]?.Count > 0)
      return res.status(400).json({ success: false, message: 'LC Already Exits!' });

    if (mainRows?.length) {
      for (const r of mainRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt > 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: sqlDate, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    if (uttarRows?.length) {
      for (const r of uttarRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt < 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: sqlDate, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    if (hissaRows?.length) {
      for (const r of hissaRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt < 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: sqlDate, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    if (referenceRows?.length) {
      for (const r of referenceRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt > 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: sqlDate, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    res.json({ success: true, message: 'LC Posted Successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/lc/delete
router.delete('/delete', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { date } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'Date required' });
    const sqlDate = toSqlDate(date);
    await executeQuery(
      `DELETE FROM Accounts WHERE Date=@date AND EntryType='Commission' AND CreatedBy=@uid`,
      { date: sqlDate, uid }
    );
    res.json({ success: true, message: 'Data Deleted Successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
