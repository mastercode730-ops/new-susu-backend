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

// GET /api/lc/main
router.get('/main', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { dateFrom, dateTo } = req.query;
    const data = await executeStoredProcedure('GetLCPercentage', {
      fUID: uid, Startdate: dateFrom || firstOfMonth(), EndDate: dateTo || getIST()
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
      fUID: uid, Startdate: dateFrom || firstOfMonth(), EndDate: dateTo || getIST(), IsUttar: 'True'
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
      fUID: uid, Startdate: dateFrom || firstOfMonth(), EndDate: dateTo || getIST(), OpType: 1
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
      fUID: uid, Startdate: dateFrom || firstOfMonth(), EndDate: dateTo || getIST(), OpType: 2
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

    const check = await executeQuery(
      `SELECT COUNT(*) AS Count FROM Accounts WHERE Date=@date AND EntryType='Commission' AND CreatedBy=@uid`,
      { date: dateTo, uid }
    );
    if (check?.[0]?.Count > 0)
      return res.status(400).json({ success: false, message: 'LC Already Exits!' });

    if (mainRows?.length) {
      for (const r of mainRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt > 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: dateTo, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    if (uttarRows?.length) {
      for (const r of uttarRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt < 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: dateTo, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    if (hissaRows?.length) {
      for (const r of hissaRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt < 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: dateTo, Type: 'Commission', Amount: amt, CreatedBy: uid });
      }
    }
    if (referenceRows?.length) {
      for (const r of referenceRows) {
        const amt = parseFloat(r.LCAmount || 0);
        if (amt > 0) await executeStoredProcedure('CreateTransaction', { fCusID: r.fCusID, date: dateTo, Type: 'Commission', Amount: amt, CreatedBy: uid });
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
    await executeQuery(
      `DELETE FROM Accounts WHERE Date=@date AND EntryType='Commission' AND CreatedBy=@uid`,
      { date, uid }
    );
    res.json({ success: true, message: 'Data Deleted Successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
