const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

// GET /api/received/games — FetchGames (same as home/games)
router.get('/games', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('FetchGames', { fId: uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/received/contacts?gid=X&viewAll=bool&filter=Y&date=Z
router.get('/contacts', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    let { gid, viewAll, filter, date } = req.query;
    let gameId = parseInt(gid) || 0;

    // Fallback: If no gid provided, get first game of user
    if (!gameId) {
      const userGames = await executeStoredProcedure('FetchGames', { fId: uid });
      if (userGames && userGames.length > 0) {
        gameId = parseInt(userGames[0].GID);
      }
    }

    const isViewAll = (viewAll === 'true' || viewAll === 'True');

    let parsedDate = null;
    if (date) {
      const iso = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
      const indian = String(date).match(/^(\d{1,2})[\/-](\w{3})[\/-](\d{4})/i);
      const dmy = String(date).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
      if (iso) {
        parsedDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      } else if (indian && months[indian[2].toLowerCase()]) {
        const mon = String(months[indian[2].toLowerCase()]).padStart(2, '0');
        parsedDate = `${indian[3]}-${mon}-${String(indian[1]).padStart(2, '0')}`;
      } else if (dmy) {
        parsedDate = `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) {
        parsedDate = String(date).trim().substring(0, 10);
      }
    }

    let data;
    try {
      data = await executeStoredProcedure('GetMyReceivedMessageWhatsAppLike', {
        fSenderID: parseInt(uid),
        GID: gameId,
        Filter: filter || '',
        ViewAll: isViewAll,
        Date: parsedDate
      });
    } catch (spErr) {
      if (spErr.message && spErr.message.includes('too many arguments')) {
        data = await executeStoredProcedure('GetMyReceivedMessageWhatsAppLike', {
          fSenderID: parseInt(uid),
          GID: gameId,
          Filter: filter || '',
          ViewAll: isViewAll
        });
      } else {
        throw spErr;
      }
    }
    res.json({ success: true, data: data || [], gameId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/received/receiver-list
router.get('/receiver-list', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const filter = req.query.filter || '';
    const data = await executeStoredProcedure('FetchReceiverList', {
      fUID: String(uid), Filter: filter
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/received/customer-rates?cid=X
router.get('/customer-rates', requireAuth, async (req, res) => {
  try {
    const { cid } = req.query;
    if (!cid) return res.json({ success: true, data: [] });
    const data = await executeQuery(
      `SELECT CR.RateID, CR.CID, CR.fUID, CR.MobileNo, CR.D_PComm, CR.D_Amt, CR.A_PComm, CR.A_Amt, CR.Patti,
              ISNULL(CAST(CAST(CR.D_PComm AS float) AS varchar)+'/'+CAST(CAST(CR.D_Amt AS float) AS varchar)+'-'+CAST(CAST(CR.A_PComm AS float) AS varchar)+'/'+CAST(CAST(CR.A_Amt AS float) AS varchar)+'-'+CAST(CAST(CR.Patti AS float) AS varchar),'0/100-0/10-0') AS Rate,
              COALESCE((SELECT TOP 1 UID FROM Users WHERE Mobile=CR.MobileNo), (SELECT TOP 1 UID FROM Users WHERE Mobile=REPLACE(CR.MobileNo,' ','')), C.fUID, CR.fUID) AS fUserUID,
              ISNULL(C.ThirdPartyHissaID,0) AS ThirdPartyHissaID,
              ISNULL(C.ThirdPartyHissaPer,0) AS ThirdPartyHissaPer,
              ISNULL(C.ThirdPartyCommID,0) AS ThirdPartyCommID,
              ISNULL(C.ThirdPartyDaraComm,0) AS ThirdPartyDaraComm,
              ISNULL(C.ThirdPartyAkharComm,0) AS ThirdPartyAkharComm
       FROM CustomersRates CR
       INNER JOIN Customers C ON CR.CID = C.CID
       WHERE CR.CID = @cid`,
      { cid: parseInt(cid) }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/received/today-rates?gid=X&customerUID=Y&cid=Z
router.get('/today-rates', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { gid, customerUID, cid } = req.query;
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const today = ist.toISOString().split('T')[0];

    // Get single rate for this customer from their latest accepted message
    const rateRow = await executeQuery(
      `SELECT TOP 1 D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm
       FROM Chat
       WHERE fReceiverID=@uid AND fSenderID=@customerUID AND fGameID=@gid
         AND IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
         AND CAST(MsgDate AS date)=CAST(@today AS date)
       ORDER BY ChatID DESC`,
      { uid, customerUID: parseInt(customerUID), gid: parseInt(gid), today }
    );

    res.json({ success: true, singleRate: rateRow?.[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/received/accept-status
router.post('/accept-status', requireAuth, async (req, res) => {
  try {
    const { gid, status } = req.body;
    await executeQuery(
      `UPDATE Game SET IsAcceptedStatus=@status WHERE GID=@gid`,
      { gid: parseInt(gid), status: status ? 'True' : 'False' }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/received/accept-reject (batch update)
router.post('/accept-reject', requireAuth, async (req, res) => {
  try {
    const { chatIds, status } = req.body;
    const ids = Array.isArray(chatIds) ? chatIds : [chatIds];
    for (const id of ids) {
      await executeQuery(`UPDATE Chat SET IsAccepted=@status WHERE ChatID=@id`, { status, id: parseInt(id) });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/received/result?gid=X&date=X
router.get('/result', requireAuth, async (req, res) => {
  try {
    const { gid, date } = req.query;
    const data = await executeQuery(
      `SELECT Result FROM Result WHERE fGameID=@gid AND Date=@date`,
      { gid: parseInt(gid), date }
    );
    res.json({ success: true, data: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
