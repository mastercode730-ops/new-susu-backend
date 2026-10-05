const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');
const { getAssignedClients } = require('../utils/assignedClients');

function getIST() { return new Date(Date.now() + 5.5 * 3600000); }

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

function parseAnyDate(str) {
  if (!str) return new Date();
  const s = String(str).trim();
  const mo = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const m1 = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})/);
  if (m1 && mo[m1[2]] !== undefined) return new Date(Date.UTC(+m1[3], mo[m1[2]], +m1[1]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3]));
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2]-1, +dmy[1]));
  return new Date(s);
}

function fmtDT() {
  const d = getIST();
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(d.getDate()).padStart(2,'0')}-${mo[d.getMonth()]}-${d.getFullYear()} ${String(h).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${ampm}`;
}

// GET /api/yantri/games
router.get('/games', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const data = await executeStoredProcedure('GetAllGames', { UID: uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/yantri/data
router.get('/data', requireAuth, async (req, res) => {
  try {
    const { gid, date, mode, negSale, agentUID, rates } = req.query;
    const uid = String(req.user.UID);
    const negCond = negSale === 'true' ? '' : 'AND (TotalAmount > 0)';
    const parsedDate = parseAnyDate(date);
    let sql = '';
    let params = {};

    if (mode === 'actual' || mode === 'daily') {
      sql = `SELECT Message, D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm, HissaPerc
             FROM Chat WHERE IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
             AND CAST(MsgDate AS date)=CAST(@date AS date) AND fReceiverID=@uid AND fGameID=@gid ${negCond}`;
      params = { date: parsedDate, uid, gid };
    } else if (mode === 'special') {
      sql = `SELECT Chat.Message, Chat.D_PComm, Chat.D_Amt, Chat.A_PComm, Chat.A_Amt, Chat.Pati_PComm, Chat.HissaPerc
             FROM Chat
             INNER JOIN Users ON Chat.fSenderID=Users.UID
             INNER JOIN Customers ON Users.Mobile=Customers.Mobile AND Customers.fUID=@uid
             WHERE Chat.IsAccepted='Accepted' AND Chat.IsTextChat='True' AND Chat.IsYantriStyle='True'
             AND CAST(Chat.MsgDate AS date)=CAST(@date AS date) AND Chat.fReceiverID=@uid
             AND Chat.fGameID=@gid AND Customers.IsYantriTo='True' ${negCond}`;
      params = { date: parsedDate, uid, gid };
    } else if (mode === 'agent') {
      if (!agentUID || agentUID === '' || agentUID === '0')
        return res.json({ success: true, data: [] });
      params = { date: parsedDate, uid, gid, agentUID };
      if (rates && rates.trim() !== '') {
        params.rates = rates;
        sql = `SELECT Message, D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm, HissaPerc
               FROM Chat WHERE IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
               AND CAST(MsgDate AS date)=CAST(@date AS date) AND fReceiverID=@uid AND fGameID=@gid
               AND fSenderID=@agentUID ${negCond}
               AND (cast(cast(D_PComm as float) as varchar)+'/'+cast(cast(D_Amt as float) as varchar)+'-'+cast(cast(A_PComm as float) as varchar)+'/'+cast(cast(A_Amt as float) as varchar)+'-'+cast(cast(Pati_PComm as float) as varchar)=@rates)`;
      } else {
        sql = `SELECT Message, D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm, HissaPerc
               FROM Chat WHERE IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
               AND CAST(MsgDate AS date)=CAST(@date AS date) AND fReceiverID=@uid AND fGameID=@gid
               AND fSenderID=@agentUID ${negCond}`;
      }
    } else if (mode === 'total') {
      sql = `SELECT Message, D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm, HissaPerc
             FROM Chat WHERE IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
             AND CAST(MsgDate AS date)=CAST(@date AS date) AND fReceiverID=@uid AND fGameID=@gid ${negCond}`;
      params = { date: parsedDate, uid, gid };
    }

    if (!sql) return res.json({ success: true, data: [] });
    const data = await executeQuery(sql, params);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/yantri/latest-date
router.get('/latest-date', requireAuth, async (req, res) => {
  try {
    const { gid } = req.query;
    const uid = String(req.user.UID);
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let rows = null;
    if (gid && !isNaN(parseInt(gid))) {
      rows = await executeQuery(
        `SELECT MAX(MsgDate) AS MsgDate FROM Chat
         WHERE (fReceiverID=@uid OR fSenderID=@uid) AND fGameID=@gid
           AND CAST(MsgDate AS date) <= CAST(DATEADD(minute, 330, GETUTCDATE()) AS date)`,
        { uid, gid: parseInt(gid) }
      );
    }
    if (!rows?.[0]?.MsgDate) {
      rows = await executeQuery(
        `SELECT MAX(d) AS MsgDate FROM (
           SELECT MAX(MsgDate) AS d FROM Chat
           WHERE (fReceiverID=@uid OR fSenderID=@uid)
             AND CAST(MsgDate AS date) <= CAST(DATEADD(minute, 330, GETUTCDATE()) AS date)
           UNION ALL
           SELECT MAX(Date) AS d FROM Accounts
           WHERE CreatedBy=@uid
             AND CAST(Date AS date) <= CAST(DATEADD(minute, 330, GETUTCDATE()) AS date)
         ) AS T`,
        { uid }
      );
    }
    let d = rows?.[0]?.MsgDate ? new Date(rows[0].MsgDate) : getIST();
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const mon = MONTHS[d.getUTCMonth()];
    const yyyy = d.getUTCFullYear();
    const dateStr = `${dd}/${mon}/${yyyy}`;
    const dmy = `${dd}/${mm}/${yyyy}`;
    res.json({ success: true, date: dateStr, dmy, data: dmy, iso: `${yyyy}-${mm}-${dd}` });
  } catch (err) {
    const ist = getIST();
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd = String(ist.getUTCDate()).padStart(2, '0');
    const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const mon = MONTHS[ist.getUTCMonth()];
    const yyyy = ist.getUTCFullYear();
    res.json({ success: true, date: `${dd}/${mon}/${yyyy}`, dmy: `${dd}/${mm}/${yyyy}`, data: `${dd}/${mm}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` });
  }
});

// GET /api/yantri/agents?gid=X&date=X
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const assigned = await getAssignedClients(uid, req.user.SubUID);
    let list = [];
    try {
      list = await executeStoredProcedure('FetchReceiverList', { fUID: uid, Filter: '' });
    } catch (e) {}

    // Also get all customers from Customers table to cover all customers
    try {
      const allCust = await executeQuery(
        `SELECT DISTINCT c.CustomerName, ISNULL(u.UID, c.CID) AS UID, c.CID, c.Mobile
         FROM Customers c
         LEFT JOIN Users u ON u.Mobile = c.Mobile
         WHERE c.fUID = @uid AND c.CustomerName IS NOT NULL AND LTRIM(RTRIM(c.CustomerName)) <> ''`,
        { uid }
      );
      const seen = new Set((list || []).map(r => String(r.UID || r.fSenderID || r.CID)));
      (allCust || []).forEach(c => {
        const id = String(c.UID || c.CID);
        if (!seen.has(id)) {
          seen.add(id);
          list.push(c);
        }
      });
    } catch (e) {}

    if (assigned && list && list.length) {
      list = list.filter(r => assigned.isMatch(r));
    }

    list.sort((a, b) => (a.CustomerName || '').localeCompare(b.CustomerName || ''));

    const formatted = list.map(r => {
      const sendId = (r.UID && String(r.UID) !== '0') ? r.UID : ((r.fSenderID && String(r.fSenderID) !== '0') ? r.fSenderID : r.CID);
      return {
        fSenderID: sendId,
        UID: sendId,
        CustomerName: r.CustomerName || r.Name || r.Mobile || 'Unknown',
        Mobile: r.Mobile || ''
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/yantri/uttar-clients
router.get('/uttar-clients', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const mobile = req.user.Mobile || '';
    let data = [];
    if (mobile) {
      try {
        data = await executeStoredProcedure('GetMySendMessage', { fSenderID: mobile, Filter: '' });
      } catch (e) {}
    }
    if (!data || data.length === 0) {
      data = await executeQuery(
        `SELECT DISTINCT c.CID, c.CustomerName, c.Mobile, ISNULL(u.UID,0) AS UID
         FROM Customers c LEFT JOIN Users u ON u.Mobile=c.Mobile
         WHERE c.fUID=@uid ORDER BY c.CustomerName`,
        { uid }
      );
    }
    for (const row of data || []) {
      if ((!row.UID || row.UID == 0) && row.Mobile) {
        try {
          const ur = await executeQuery(`SELECT UID FROM Users WHERE Mobile=@mobile`, { mobile: row.Mobile });
          if (ur?.[0]?.UID) row.UID = ur[0].UID;
        } catch (e) {}
      }
    }
    const filtered = (data || []).filter(c => c.CustomerName && c.CustomerName.trim() !== '');
    res.json({ success: true, data: filtered });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

// GET /api/yantri/uttar-rates?cid=X
router.get('/uttar-rates', requireAuth, async (req, res) => {
  try {
    const { cid } = req.query;
    const data = await executeQuery(
      `SELECT ISNULL(CAST(CAST(CustomersRates.D_PComm AS float) AS varchar)+'/'+CAST(CAST(CustomersRates.D_Amt AS float) AS varchar)+'-'+CAST(CAST(CustomersRates.A_PComm AS float) AS varchar)+'/'+CAST(CAST(CustomersRates.A_Amt AS float) AS varchar)+'-'+CAST(CAST(CustomersRates.Patti AS float) AS varchar),'0/100-0/10-0') AS Rate,
              CustomersRates.fUID, CustomersRates.RateID, CustomersRates.MobileNo,
              CustomersRates.D_PComm, CustomersRates.D_Amt, CustomersRates.A_PComm, CustomersRates.A_Amt, CustomersRates.Patti,
              ISNULL(Customers.ThirdPartyHissaID,0) AS ThirdPartyHissaID,
              ISNULL(Customers.ThirdPartyHissaPer,0) AS ThirdPartyHissaPer,
              ISNULL(Customers.ThirdPartyCommID,0) AS ThirdPartyCommID,
              ISNULL(Customers.ThirdPartyDaraComm,0) AS ThirdPartyDaraComm,
              ISNULL(Customers.ThirdPartyAkharComm,0) AS ThirdPartyAkharComm
       FROM CustomersRates INNER JOIN Customers ON CustomersRates.CID=Customers.CID WHERE CustomersRates.CID=@cid`,
      { cid: parseInt(cid) }
    );
    let games = [];
    if (data?.length) {
      try { games = await executeStoredProcedure('GetAllGames', { UID: String(data[0].fUID) }); } catch (e) {}
    }
    res.json({ success: true, data: data || [], games: games || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/yantri/all-clients
router.get('/all-clients', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const data = await executeQuery(
      `SELECT CID, CustomerName, Mobile, IsYantriTo, (SELECT UID FROM Users WHERE Mobile=Customers.Mobile) AS UID
       FROM Customers WHERE fUID=@uid ORDER BY CustomerName`,
      { uid }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/yantri/forward
router.post('/forward', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const subUID = req.user.SubUID || '';
    const {
      message, totalAmount, gameID, rateID,
      D_PComm, D_Amt, A_PComm, A_Amt, Patti,
      fReceiverUID,
      ThirdPartyHissaID, ThirdPartyHissaPer,
      ThirdPartyCommID, ThirdPartyDaraComm, ThirdPartyAkharComm
    } = req.body;

    let receiverUID = fReceiverUID;
    if (!receiverUID && rateID) {
      const rateData = await executeQuery(`SELECT fUID FROM CustomersRates WHERE RateID=@rateID`, { rateID });
      receiverUID = rateData?.[0]?.fUID;
    }
    if (!receiverUID) return res.status(400).json({ success: false, message: 'Receiver not found' });

    await executeStoredProcedure('InsertChatMessageWhatsappLike', {
      fSenderID: uid,
      fReceiverID: parseInt(receiverUID),
      fGameID: parseInt(gameID),
      Message: message,
      MessageDateTime: fmtDT(),
      IsTextChat: 'True',
      IsYantriStyle: 'True',
      TotalAmount: parseFloat(totalAmount) || 0,
      CheckAcceptedStatus: true,
      IsSendByReceiver: false,
      SUID: subUID,
      D_PComm: parseFloat(D_PComm) || 0,
      D_Amt: parseFloat(D_Amt) || 100,
      A_PComm: parseFloat(A_PComm) || 0,
      A_Amt: parseFloat(A_Amt) || 10,
      Pati_PComm: parseFloat(Patti) || 0,
      fHissaPartyID: parseInt(ThirdPartyHissaID) || 0,
      HissaPerc: parseFloat(ThirdPartyHissaPer) || 0,
      ThirdPartyCommID: parseInt(ThirdPartyCommID) || 0,
      ThirdPartyDaraComm: parseFloat(ThirdPartyDaraComm) || 0,
      ThirdPartyAkharComm: parseFloat(ThirdPartyAkharComm) || 0
    });
    res.json({ success: true, message: 'Forward successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/yantri/negative-sale
router.post('/negative-sale', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const subUID = req.user.SubUID || '';
    const {
      message, totalAmount, gameID, rateID,
      D_PComm, D_Amt, A_PComm, A_Amt, Patti,
      fReceiverUID,
      ThirdPartyHissaID, ThirdPartyHissaPer,
      ThirdPartyCommID, ThirdPartyDaraComm, ThirdPartyAkharComm
    } = req.body;

    let receiverUID = fReceiverUID;
    if (!receiverUID && rateID) {
      const rateData = await executeQuery(`SELECT fUID FROM CustomersRates WHERE RateID=@rateID`, { rateID });
      receiverUID = rateData?.[0]?.fUID;
    }
    if (!receiverUID) return res.status(400).json({ success: false, message: 'Receiver not found' });

    await executeStoredProcedure('InsertChatMessageWhatsappLike', {
      fSenderID: uid,
      fReceiverID: parseInt(receiverUID),
      fGameID: parseInt(gameID),
      Message: message,
      MessageDateTime: fmtDT(),
      IsTextChat: 'True',
      IsYantriStyle: 'True',
      TotalAmount: parseFloat(totalAmount) || 0,
      CheckAcceptedStatus: true,
      IsSendByReceiver: false,
      SUID: subUID,
      D_PComm: parseFloat(D_PComm) || 0,
      D_Amt: parseFloat(D_Amt) || 100,
      A_PComm: parseFloat(A_PComm) || 0,
      A_Amt: parseFloat(A_Amt) || 10,
      Pati_PComm: parseFloat(Patti) || 0,
      fHissaPartyID: parseInt(ThirdPartyHissaID) || 0,
      HissaPerc: parseFloat(ThirdPartyHissaPer) || 0,
      ThirdPartyCommID: parseInt(ThirdPartyCommID) || 0,
      ThirdPartyDaraComm: parseFloat(ThirdPartyDaraComm) || 0,
      ThirdPartyAkharComm: parseFloat(ThirdPartyAkharComm) || 0
    });
    res.json({ success: true, message: 'Negative sale saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/yantri/save-clients
router.post('/save-clients', requireAuth, async (req, res) => {
  try {
    const uid = String(req.user.UID);
    const { customerIDs } = req.body;
    // Reset all to False first
    await executeQuery(`UPDATE Customers SET IsYantriTo='False' WHERE fUID=@uid`, { uid });
    // Set selected ones to True
    if (customerIDs && customerIDs.length > 0) {
      for (const cid of customerIDs) {
        await executeQuery(
          `UPDATE Customers SET IsYantriTo='True' WHERE CID=@cid AND fUID=@uid`,
          { cid: parseInt(cid), uid }
        );
      }
    }
    res.json({ success: true, message: 'Clients saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
