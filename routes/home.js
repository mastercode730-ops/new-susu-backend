const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

router.get('/games', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const games = await executeStoredProcedure('FetchGames', { fId: uid });

    const pendingRows = await executeQuery(
      `SELECT DISTINCT fGameID, fSenderID FROM Chat WHERE fReceiverID=@uid AND IsAccepted='Pending'`,
      { uid }
    );
    const pendingMap = {};
    for (const row of (pendingRows || [])) {
      if (!pendingMap[row.fGameID]) pendingMap[row.fGameID] = new Set();
      pendingMap[row.fGameID].add(row.fSenderID);
    }
    const result = (games || []).map(g => ({
      ...g,
      UnreadCount: pendingMap[g.GID] ? pendingMap[g.GID].size : 0
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/receivers', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('FetchReceiverList', { fUID: uid, Filter: '' });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/messages', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const mobile = req.user.Mobile;
    const { viewAll, fromDate, toDate } = req.query;
    // SP GetMySendMessage takes only fSenderID + Filter
    const data = await executeStoredProcedure('GetMySendMessage', {
      fSenderID: mobile || uid,
      Filter: ''
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/dashboard-stats', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const today = ist.toISOString().split('T')[0];
    const [games, customers, todayMessages] = await Promise.all([
      executeQuery(`SELECT COUNT(*) AS cnt FROM Game WHERE fUID=@uid AND IsActive='True'`, { uid }),
      executeQuery(`SELECT COUNT(*) AS cnt FROM Customers WHERE fUID=@uid`, { uid }),
      executeQuery(`SELECT COUNT(*) AS cnt FROM Chat WHERE fSenderID=@uid AND CAST(MsgDate AS date)=@today`, { uid, today })
    ]);
    res.json({ success: true, data: { totalGames: games?.[0]?.cnt || 0, totalCustomers: customers?.[0]?.cnt || 0, todayMessages: todayMessages?.[0]?.cnt || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/absent-customers', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { gameID, date } = req.query;
    const data = await executeStoredProcedure('CheckAbsentCustomers', { UID: uid, GameID: gameID, MsgDate: date });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/user-by-mobile/:mobile — receiver UID lookup
router.get('/user-by-mobile/:mobile', requireAuth, async (req, res) => {
  try {
    const rows = await executeQuery(
      `SELECT UID, Mobile FROM Users WHERE Mobile = @mobile`,
      { mobile: req.params.mobile }
    );
    if (!rows || rows.length === 0) return res.json({ success: false, message: 'User not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/archive', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { fromDate, toDate } = req.body;
    await executeStoredProcedure('InsertSettledChat', { fUID: uid, FromDate: fromDate, ToDate: toDate });
    res.json({ success: true, message: 'Archive successful' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/receiver-list?filter=
router.get('/receiver-list', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const filter = req.query.filter || '';
    const data = await executeStoredProcedure('FetchReceiverList', { fUID: String(uid), Filter: filter });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/user-games/:uid
router.get('/user-games/:uid', requireAuth, async (req, res) => {
  try {
    const data = await executeStoredProcedure('FetchGames', { fId: req.params.uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/customer-rates/:cid
router.get('/customer-rates/:cid', requireAuth, async (req, res) => {
  try {
    const data = await executeQuery(
      `SELECT ISNULL(CAST(CAST(CustomersRates.D_PComm AS float) AS varchar) + '/' +
        CAST(CAST(CustomersRates.D_Amt AS float) AS varchar) + '-' +
        CAST(CAST(CustomersRates.A_PComm AS float) AS varchar) + '/' +
        CAST(CAST(CustomersRates.A_Amt AS float) AS varchar) + '-' +
        CAST(CAST(CustomersRates.Patti AS float) AS varchar), '0/100-0/10-0') AS Rate,
        CustomersRates.fUID, CustomersRates.RateID, CustomersRates.MobileNo,
        CustomersRates.D_PComm, CustomersRates.D_Amt, CustomersRates.A_PComm,
        CustomersRates.A_Amt, CustomersRates.Patti,
        ISNULL(Customers.ThirdPartyHissaID, 0) AS ThirdPartyHissaID,
        ISNULL(Customers.ThirdPartyHissaPer, 0) AS ThirdPartyHissaPer
       FROM CustomersRates
       INNER JOIN Customers ON CustomersRates.CID = Customers.CID
       WHERE CustomersRates.CID = @cid`,
      { cid: req.params.cid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/all-games
router.get('/all-games', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('GetAllGames', { UID: String(uid), IsActive: 'True' });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/bulk-customers
router.get('/bulk-customers', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeQuery(
      `SELECT CID, CustomerName, Mobile, (SELECT UID FROM Users WHERE Mobile = Customers.Mobile) AS UID
       FROM Customers WHERE fUID = @fUID`,
      { fUID: uid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/bulk-rates/:cid
router.get('/bulk-rates/:cid', requireAuth, async (req, res) => {
  try {
    const data = await executeQuery(
      `SELECT ISNULL(CAST(CAST(CustomersRates.D_PComm AS float) AS varchar) + '/' +
        CAST(CAST(CustomersRates.D_Amt AS float) AS varchar) + '-' +
        CAST(CAST(CustomersRates.A_PComm AS float) AS varchar) + '/' +
        CAST(CAST(CustomersRates.A_Amt AS float) AS varchar) + '-' +
        CAST(CAST(CustomersRates.Patti AS float) AS varchar), '0/100-0/10-0') AS Rate,
        CustomersRates.fUID, CustomersRates.RateID, CustomersRates.MobileNo,
        CustomersRates.D_PComm, CustomersRates.D_Amt, CustomersRates.A_PComm,
        CustomersRates.A_Amt, CustomersRates.Patti,
        ISNULL(Customers.ThirdPartyHissaID, 0) AS ThirdPartyHissaID,
        ISNULL(Customers.ThirdPartyHissaPer, 0) AS ThirdPartyHissaPer
       FROM CustomersRates
       INNER JOIN Customers ON CustomersRates.CID = Customers.CID
       WHERE CustomersRates.CID = @cid`,
      { cid: req.params.cid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/home/bulk-rate-by-id/:rateID
router.get('/bulk-rate-by-id/:rateID', requireAuth, async (req, res) => {
  try {
    const data = await executeQuery(
      `SELECT (SELECT UID FROM Users WHERE Mobile = CustomersRates.MobileNo) AS UID,
        ISNULL(CAST(CAST(CustomersRates.D_PComm AS float) AS varchar) + '/' +
        CAST(CAST(CustomersRates.D_Amt AS float) AS varchar) + '-' +
        CAST(CAST(CustomersRates.A_PComm AS float) AS varchar) + '/' +
        CAST(CAST(CustomersRates.A_Amt AS float) AS varchar) + '-' +
        CAST(CAST(CustomersRates.Patti AS float) AS varchar), '0/100-0/10-0') AS Rate,
        CustomersRates.fUID, CustomersRates.RateID, CustomersRates.MobileNo,
        CustomersRates.D_PComm, CustomersRates.D_Amt, CustomersRates.A_PComm,
        CustomersRates.A_Amt, CustomersRates.Patti,
        ISNULL(Customers.ThirdPartyHissaID, 0) AS ThirdPartyHissaID,
        ISNULL(Customers.ThirdPartyHissaPer, 0) AS ThirdPartyHissaPer,
        ISNULL(Customers.ThirdPartyCommID, 0) AS ThirdPartyCommID,
        ISNULL(Customers.ThirdPartyDaraComm, 0) AS ThirdPartyDaraComm,
        ISNULL(Customers.ThirdPartyAkharComm, 0) AS ThirdPartyAkharComm
       FROM CustomersRates
       INNER JOIN Customers ON CustomersRates.CID = Customers.CID
       WHERE CustomersRates.RateID = @rateID`,
      { rateID: req.params.rateID }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
