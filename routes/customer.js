const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

router.get('/list', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('FetchCustomers', { fUID: uid, Filter: '' });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('FetchReceiverList', { fUID: uid, Filter: '' });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const {
      customerName, mobileNo, mobile, city,
      d_PComm, d_Amt, a_PComm, a_Amt, patti, lc,
      isSelfComm, isYantriTo, isLimit, isUttar,
      thirdPartyHissaID, thirdPartyHissaPer,
      thirdPartyCommID, thirdPartyDaraComm, thirdPartyAkharComm,
      thirdPartyLCID, thirdPartyLCPer
    } = req.body;
    const mob = mobileNo || mobile;
    if (!customerName || !mob) return res.status(400).json({ success: false, message: 'Name and mobile required' });
    await executeStoredProcedure('CreateCustomers', {
      CustomerName: customerName, Mobile: mob,
      D_PComm: parseFloat(d_PComm) || 0, D_Amt: parseFloat(d_Amt) || 100, A_PComm: parseFloat(a_PComm) || 0, A_Amt: parseFloat(a_Amt) || 10,
      Patti: parseInt(patti) || 0, LC: parseInt(lc) || 0,
      IsSelfComm: isSelfComm ? true : false,
      IsYantriTo: isYantriTo ? true : false,
      fId: uid, CID: 0, UserID: uid, RateID: 0,
      ThirdPartyHissaID: parseInt(thirdPartyHissaID) || 0, ThirdPartyHissaPer: parseFloat(thirdPartyHissaPer) || 0,
      IsLimit: isLimit ? true : false, IsUttar: isUttar ? true : false,
      ThirdPartyCommID: parseInt(thirdPartyCommID) || 0, ThirdPartyDaraComm: parseFloat(thirdPartyDaraComm) || 0,
      ThirdPartyAkharComm: parseFloat(thirdPartyAkharComm) || 0,
      ThirdPartyLCID: parseInt(thirdPartyLCID) || 0, ThirdPartyLCPer: parseFloat(thirdPartyLCPer) || 0
    });
    res.json({ success: true, message: 'Customer added' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/update', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const {
      cid, customerName, mobileNo, mobile, city,
      d_PComm, d_Amt, a_PComm, a_Amt, patti, lc,
      isSelfComm, isYantriTo, isLimit, isUttar,
      thirdPartyHissaID, thirdPartyHissaPer,
      thirdPartyCommID, thirdPartyDaraComm, thirdPartyAkharComm,
      thirdPartyLCID, thirdPartyLCPer
    } = req.body;
    const mob = mobileNo || mobile;
    if (!cid) return res.status(400).json({ success: false, message: 'CID required' });
    await executeStoredProcedure('UpdateCustomers', {
      CustomerName: customerName, Mobile: mob,
      D_PComm: parseFloat(d_PComm) || 0, D_Amt: parseFloat(d_Amt) || 100, A_PComm: parseFloat(a_PComm) || 0, A_Amt: parseFloat(a_Amt) || 10,
      Patti: parseInt(patti) || 0, LC: parseInt(lc) || 0,
      IsSelfComm: isSelfComm ? true : false,
      IsYantriTo: isYantriTo ? true : false,
      fId: uid, CID: parseInt(cid), UserID: uid, RateID: 0,
      ThirdPartyHissaID: parseInt(thirdPartyHissaID) || 0, ThirdPartyHissaPer: parseFloat(thirdPartyHissaPer) || 0,
      IsLimit: isLimit ? true : false, IsUttar: isUttar ? true : false,
      ThirdPartyCommID: parseInt(thirdPartyCommID) || 0, ThirdPartyDaraComm: parseFloat(thirdPartyDaraComm) || 0,
      ThirdPartyAkharComm: parseFloat(thirdPartyAkharComm) || 0,
      ThirdPartyLCID: parseInt(thirdPartyLCID) || 0, ThirdPartyLCPer: parseFloat(thirdPartyLCPer) || 0
    });
    res.json({ success: true, message: 'Customer updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/customer/:cid/rates (mobile app calls this format)
router.get('/:cid/rates', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeQuery(`SELECT * FROM CustomersRates WHERE CID=@cid AND fUID=@uid`, { cid: parseInt(req.params.cid), uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/customer/rates/:cid (alternate format)
router.get('/rates/:cid', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeQuery(`SELECT * FROM CustomersRates WHERE CID=@cid AND fUID=@uid`, { cid: parseInt(req.params.cid), uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:cid', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    await executeQuery(`DELETE FROM Customers WHERE CID=@cid AND fUID=@uid`, { cid: parseInt(req.params.cid), uid });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/customer/delete (mobile app calls this)
router.post('/delete', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { cid } = req.body;
    await executeQuery(`DELETE FROM Customers WHERE CID=@cid AND fUID=@uid`, { cid: parseInt(cid), uid });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/customer/toggle
router.post('/toggle', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { cid, field, value } = req.body;
    const allowed = ['IsActive', 'IsYantriTo', 'IsUttar'];
    if (!allowed.includes(field)) return res.status(400).json({ success: false, message: 'Invalid field' });
    await executeQuery(
      `UPDATE Customers SET ${field}=@value WHERE CID=@cid AND fUID=@uid`,
      { cid: parseInt(cid), uid, value: value === 'True' ? 'True' : 'False' }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/customer/active-status — SuperAdmin-only column on the contacts
// page: for each of the caller's customers that also has its own login
// (Users row matched by Mobile), report whether that login is active.
router.get('/active-status', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeQuery(
      `SELECT C.Mobile, U.UID, U.Status AS IsActive
       FROM Customers C
       JOIN Users U ON U.Mobile = C.Mobile
       WHERE C.fUID = @uid`,
      { uid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/customer/toggle-active — flips that customer's own Users.Status.
router.post('/toggle-active', requireAuth, async (req, res) => {
  try {
    const { mobile, isActive } = req.body;
    if (!mobile) return res.status(400).json({ success: false, message: 'Mobile required' });
    await executeQuery(
      `UPDATE Users SET Status=@isActive WHERE Mobile=@mobile`,
      { mobile, isActive: !!isActive }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/customer/rates (save/update rates)
router.post('/rates', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { cid, rateID, d_PComm, d_Amt, a_PComm, a_Amt, patti, type } = req.body;

    if (rateID && type === 'update') {
      await executeQuery(
        `UPDATE CustomersRates SET D_PComm=@dPC, D_Amt=@dA, A_PComm=@aPC, A_Amt=@aA, Patti=@patti
         WHERE RateID=@rateID`,
        { rateID: parseInt(rateID), dPC: d_PComm||0, dA: d_Amt||100, aPC: a_PComm||0, aA: a_Amt||10, patti: patti||0 }
      );
    } else {
      // Get Mobile for this CID
      const cRow = await executeQuery(`SELECT Mobile FROM Customers WHERE CID=@cid AND fUID=@uid`, { cid: parseInt(cid), uid });
      if (!cRow || !cRow[0]) return res.status(404).json({ success: false, message: 'Customer not found' });
      await executeQuery(
        `INSERT INTO CustomersRates (CID, fUID, MobileNo, D_PComm, D_Amt, A_PComm, A_Amt, Patti)
         VALUES (@cid, @uid, @mobile, @dPC, @dA, @aPC, @aA, @patti)`,
        { cid: parseInt(cid), uid, mobile: cRow[0].Mobile, dPC: d_PComm||0, dA: d_Amt||100, aPC: a_PComm||0, aA: a_Amt||10, patti: patti||0 }
      );
    }
    res.json({ success: true, message: 'Rates saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
