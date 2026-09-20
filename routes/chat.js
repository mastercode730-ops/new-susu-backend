const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

function getIndianTime() {
  const utcNow = new Date();
  return new Date(utcNow.getTime() + (5.5 * 60 * 60 * 1000));
}

function formatDateTime(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = months[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  let h = date.getUTCHours();
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const sec = String(date.getUTCSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d}-${m}-${y} ${String(h).padStart(2,'0')}:${min}:${sec} ${ampm}`;
}

// GET /api/chat/rates
router.get('/rates', requireAuth, async (req, res) => {
  try {
    const { mobileNo, selectedUID } = req.query;
    const data = await executeStoredProcedure('Fetchrates', {
      MobileNo: mobileNo,
      SelectedUserID: selectedUID
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/customer-games
router.get('/customer-games', requireAuth, async (req, res) => {
  try {
    const { mobileNo } = req.query;
    const data = await executeStoredProcedure('FetctCustomerAllGames', { MobileNo: mobileNo });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/messages
router.get('/messages', requireAuth, async (req, res) => {
  try {
    const { gameId, selectedUID, date } = req.query;
    const uid = req.user.UID;
    const data = await executeQuery(
      `SELECT * FROM Chat
       WHERE fGameID = @gameId
       AND (fSenderID = @uid OR fReceiverID = @uid)
       AND (@selectedUID IS NULL OR fSenderID = @selectedUID OR fReceiverID = @selectedUID)
       ORDER BY MessageDateTime ASC`,
      { gameId: parseInt(gameId), uid, selectedUID: selectedUID ? parseInt(selectedUID) : null }
    );
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/received
router.get('/received', requireAuth, async (req, res) => {
  try {
    const { gameId, date, selectedUID, receiverUID, customerMobile, rates } = req.query;
    const uid = req.user.UID;

    // Resolve fReceiverID — same logic as web backend
    let fReceiverID = selectedUID || receiverUID;
    if (!fReceiverID && customerMobile) {
      const uRows = await executeQuery(
        `SELECT UID FROM Users WHERE Mobile = @mobile`,
        { mobile: customerMobile }
      );
      if (uRows && uRows.length > 0) fReceiverID = uRows[0].UID;
    }

    // Parse date — support ISO "YYYY-MM-DD", Indian "20/Sep/2026", and DMY "20/09/2026"
    let parsedDate = '';
    if (date) {
      const iso = String(date).match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      const indian = String(date).match(/^(\d{1,2})[\/-](\w{3})[\/-](\d{4})/i);
      const dmy = String(date).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
      if (iso) parsedDate = `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
      else if (indian && months[indian[2].toLowerCase()]) parsedDate = `${indian[3]}-${months[indian[2].toLowerCase()]}-${String(indian[1]).padStart(2, '0')}`;
      else if (dmy) parsedDate = `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
      else parsedDate = String(date).substring(0, 10);
    }
    if (!parsedDate) {
      const ist = new Date(Date.now() + 5.5 * 3600000);
      parsedDate = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,'0')}-${String(ist.getUTCDate()).padStart(2,'0')}`;
    }

    const data = await executeStoredProcedure('FetchSenderMessageWhatsAppLike', {
      fSenderID: uid,
      fGameID: gameId,
      date: parsedDate,
      fReceiverID: fReceiverID,
      Rates: rates || '0/100-0/10-0',
      IsReceiverPage: true
    });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('chat/received:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/send
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { chat, gameID, totalAmount, dPComm, dAmt, aPComm, aAmt, pati, isYantriStyle } = req.body;
    if (!chat || !gameID) {
      return res.status(400).json({ success: false, message: 'Chat message aur GameID required hai' });
    }
    const indianTime = getIndianTime();
    const msgDateTime = formatDateTime(indianTime);
    const uid = req.user.UID;
    const subUID = req.user.SubUID || '';

    await executeStoredProcedure('InsertChatMessage', {
      fSenderID: uid,
      fGameID: gameID,
      Message: chat,
      MessageDateTime: msgDateTime,
      IsTextChat: 'True',
      IsYantriStyle: isYantriStyle || 'False',
      TotalAmount: totalAmount || 0,
      DPcomm: dPComm || 0,
      DAmt: dAmt || 100,
      APcomm: aPComm || 0,
      AAmt: aAmt || 10,
      Pati_PComm: pati || 0,
      SUID: subUID
    });
    res.json({ success: true, message: 'Message bhej diya' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/save-receiver-message  (same as backend, JWT auth)
router.post('/save-receiver-message', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const subUID = req.user.SubUID || '';
    const {
      gameId, message, totalAmount, isYantriStyle,
      fUserID, date, chatId, btnText,
      D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm,
      fHissaPartyID, HissaPerc,
      ThirdPartyCommID, ThirdPartyDaraComm, ThirdPartyAkharComm
    } = req.body;

    if (!message) return res.json({ success: false, message: 'Message required' });

    const indianTime = getIndianTime();
    const msgDateTime = formatDateTime(indianTime);

    // Resolve receiver UID — use fUserID directly or look up by mobile
    let resolvedReceiverUID = fUserID;
    if (!resolvedReceiverUID && req.body.customerMobile) {
      const userRows = await executeQuery(
        `SELECT UID FROM Users WHERE Mobile = @mobile`,
        { mobile: req.body.customerMobile }
      );
      if (userRows && userRows.length > 0) resolvedReceiverUID = userRows[0].UID;
    }
    if (!resolvedReceiverUID) return res.status(400).json({ success: false, message: 'Could not resolve receiver UID' });

    // Update mode
    if (btnText === 'Update(Insert)' && chatId) {
      await executeStoredProcedure('UpdateChatmsg', {
        ChatID: chatId,
        fSenderID: uid,
        fGameID: gameId,
        Message: message.replace(/\n/g, ','),
        MessageDateTime: msgDateTime,
        IsTextChat: 'True',
        IsYantriStyle: isYantriStyle || 'False',
        TotalAmount: parseFloat(totalAmount) || 0,
        CheckAcceptedStatus: isYantriStyle === 'True',
        IsSendByReceiver: false,
        SUID: subUID,
        fReceiverID: resolvedReceiverUID
      });
      return res.json({ success: true, message: 'SuccessFully' });
    }

    // Check game DrawTime / IsRejectedMsg
    const gameRows = await executeQuery(
      `SELECT DrawTime, IsRejectedMsg, fUID FROM Game WHERE GID=@gid`,
      { gid: gameId }
    );
    if (gameRows && gameRows.length > 0) {
      const game = gameRows[0];
      const isRejected = game.IsRejectedMsg === true || game.IsRejectedMsg === 'True';
      if (isRejected && game.fUID !== uid) {
        const drawTime = new Date(game.DrawTime);
        const nowTime = indianTime;
        if (nowTime.getHours() * 60 + nowTime.getMinutes() >
          drawTime.getHours() * 60 + drawTime.getMinutes()) {
          return res.json({ success: false, message: 'The time to send the Message has Expired' });
        }
      }
    }

    // Format date if provided (YYYY-MM-DD)
    let formattedDate = '';
    if (date) {
      const iso = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
      const dmy = String(date).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if (iso) formattedDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      else if (dmy) formattedDate = `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
      else formattedDate = String(date).substring(0, 10);
    }

    // Insert mode
    await executeStoredProcedure('InsertChatMessageWhatsappLike', {
      fSenderID: uid,
      fGameID: gameId,
      Message: message.replace(/\n/g, ','),
      MessageDateTime: msgDateTime,
      IsTextChat: 'True',
      IsYantriStyle: isYantriStyle || 'False',
      TotalAmount: parseFloat(totalAmount) || 0,
      CheckAcceptedStatus: isYantriStyle === 'True',
      IsSendByReceiver: false,
      SUID: subUID,
      fReceiverID: resolvedReceiverUID,
      D_PComm: parseFloat(D_PComm) || 0,
      D_Amt: parseFloat(D_Amt) || 100,
      A_PComm: parseFloat(A_PComm) || 0,
      A_Amt: parseFloat(A_Amt) || 10,
      Pati_PComm: parseFloat(Pati_PComm) || 0,
      fHissaPartyID: fHissaPartyID || '0',
      HissaPerc: parseFloat(HissaPerc) || 0,
      CurrentMsgDate: formattedDate,
      ThirdPartyCommID: ThirdPartyCommID || '0',
      ThirdPartyDaraComm: parseFloat(ThirdPartyDaraComm) || 0,
      ThirdPartyAkharComm: parseFloat(ThirdPartyAkharComm) || 0
    });
    res.json({ success: true, message: 'SuccessFully' });
  } catch (err) {
    console.error('save-receiver-message:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/chat/update
router.put('/update', requireAuth, async (req, res) => {
  try {
    const { chatID, chat, gameID, totalAmount, dPComm, dAmt, aPComm, aAmt, pati, isYantriStyle } = req.body;
    const indianTime = getIndianTime();
    const msgDateTime = formatDateTime(indianTime);
    const uid = req.user.UID;
    const subUID = req.user.SubUID || '';

    await executeStoredProcedure('UpdateChatmsg', {
      ChatID: chatID,
      fSenderID: uid,
      fGameID: gameID,
      Message: chat,
      MessageDateTime: msgDateTime,
      IsTextChat: 'True',
      IsYantriStyle: isYantriStyle || 'False',
      TotalAmount: totalAmount || 0,
      DPcomm: dPComm || 0,
      DAmt: dAmt || 100,
      APcomm: aPComm || 0,
      AAmt: aAmt || 10,
      Pati_PComm: pati || 0,
      SUID: subUID
    });
    res.json({ success: true, message: 'Message update ho gaya' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/chat/:chatId
router.delete('/:chatId', requireAuth, async (req, res) => {
  try {
    await executeQuery(
      `DELETE FROM Chat WHERE ChatID = @chatID`,
      { chatID: parseInt(req.params.chatId) }
    );
    res.json({ success: true, message: 'Message delete ho gaya' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/accept-reject
router.post('/accept-reject', requireAuth, async (req, res) => {
  try {
    const { chatId, status } = req.body;
    await executeQuery(
      `UPDATE Chat SET IsAccepted=@status WHERE ChatID=@chatId`,
      { chatId: parseInt(chatId), status }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/accept-all
router.post('/accept-all', requireAuth, async (req, res) => {
  try {
    const { gameID, date } = req.body;
    const uid = req.user.UID;
    await executeQuery(
      `UPDATE Chat SET IsAccepted='Accepted' WHERE fGameID=@gameID AND fReceiverID=@uid AND IsAccepted='Pending' AND CAST(MsgDate AS date)=CAST(@date AS date)`,
      { gameID: parseInt(gameID), uid, date }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/date
router.get('/date', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.query;
    const indianTime = getIndianTime();
    if (gameId) {
      const data = await executeStoredProcedure('GetChatDate', {
        fGameID: parseInt(gameId),
        MessageDateTime: indianTime
      });
      const chatDate = data?.[0] ? Object.values(data[0])[0] : indianTime;
      return res.json({ success: true, date: chatDate });
    }
    res.json({ success: true, date: indianTime });
  } catch (err) {
    res.json({ success: true, date: new Date() });
  }
});

// POST /api/chat/forward-accept
router.post('/forward-accept', requireAuth, async (req, res) => {
  try {
    const { chatIDs, gameID } = req.body;
    const indianTime = getIndianTime();
    const msgDateTime = formatDateTime(indianTime);
    const uid = req.user.UID;
    const uniqueIds = [...new Set(chatIDs)];
    for (const chatID of uniqueIds) {
      await executeStoredProcedure('ReceiveChatSendMessage', {
        fSenderID: uid,
        fGameID: gameID,
        ChatID: chatID,
        MessageDateTime: msgDateTime,
        IsTextChat: 'True'
      });
    }
    res.json({ success: true, message: 'Processed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/accept
router.post('/accept', requireAuth, async (req, res) => {
  try {
    const { chatID, isAccepted } = req.body;
    await executeQuery(
      `UPDATE Chat SET IsAccepted = @isAccepted WHERE ChatID = @chatID`,
      { chatID: parseInt(chatID), isAccepted }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/reject-all
router.post('/reject-all', requireAuth, async (req, res) => {
  try {
    const { gameID, date } = req.body;
    const uid = req.user.UID;
    await executeQuery(
      `UPDATE Chat SET IsAccepted='Rejected' WHERE fGameID=@gameID AND fReceiverID=@uid AND IsAccepted='Pending' AND CAST(MsgDate AS date)=CAST(@date AS date)`,
      { gameID: parseInt(gameID), uid, date }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/unread-date
router.get('/unread-date', requireAuth, async (req, res) => {
  try {
    const { gameID, selectedUID } = req.query;
    const uid = req.user.UID;
    const data = await executeQuery(
      `SELECT ISNULL(MIN(MsgDate), GETDATE()) AS SelectedDate FROM Chat
       WHERE (((fSenderID=@uid AND fReceiverID=@selectedUID) OR (fSenderID=@selectedUID AND fReceiverID=@uid)))
         AND fGameID=@gameID AND IsRead='False'`,
      { uid, selectedUID: parseInt(selectedUID), gameID: parseInt(gameID) }
    );
    res.json({ success: true, date: data?.[0]?.SelectedDate || new Date() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/customer-name
router.get('/customer-name', requireAuth, async (req, res) => {
  try {
    const { mobile } = req.query;
    const uid = req.user.UID;
    let rows = await executeQuery(
      `SELECT CustomerName, IsUttar FROM Customers WHERE Mobile=@mobile AND fUID=@uid`,
      { mobile, uid }
    );
    if (!rows || !rows[0]) {
      rows = await executeQuery(
        `SELECT CustomerName, IsUttar FROM Customers WHERE Mobile=@mobile`,
        { mobile }
      );
    }
    res.json({ success: true, data: rows?.[0] || null });
  } catch (err) {
    res.json({ success: true, data: null });
  }
});

// GET /api/chat/refresh-status
router.get('/refresh-status', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const rows = await executeQuery(
      `SELECT IsRefreshStatus FROM Users WHERE UID=@uid`, { uid }
    );
    res.json({ success: true, IsRefreshStatus: rows?.[0]?.IsRefreshStatus?.toString() || 'False' });
  } catch (err) {
    res.json({ success: true, IsRefreshStatus: 'False' });
  }
});

// Helper: normalize any date format to YYYY-MM-DD string
function formatDateStr(s) {
  if (!s) return '';
  if (s instanceof Date) {
    if (isNaN(s.getTime())) return '';
    return s.toISOString().split('T')[0];
  }
  const str = String(s).trim();
  const iso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  const mo = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const m1 = str.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{4})/i);
  if (m1 && mo[m1[2].toLowerCase()]) return `${m1[3]}-${mo[m1[2].toLowerCase()]}-${String(m1[1]).padStart(2, '0')}`;
  return str.substring(0, 10);
}

// POST /api/chat/move-message
router.post('/move-message', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const subUID = req.user.SubUID || '';
    const {
      gameID, selectedUID, mobile, targetUID, msgDate, currentMsgDate, currentGameID,
      src_D_PComm, src_D_Amt, src_A_PComm, src_A_Amt, src_Pati_PComm,
      fHissaPartyID, hissaPerc, D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm
    } = req.body;

    const fromDateStr = formatDateStr(msgDate);
    const toDateStr   = formatDateStr(currentMsgDate);
    const msgDateTime = formatDateTime(getIndianTime());

    // Resolve target customer UID:
    // ALWAYS look up Users by mobile if provided to get the real customer UID (not the dealer UID)
    let toUID = null;
    if (mobile) {
      const cleanMob = String(mobile).replace(/\D/g, '').slice(-10);
      const toUserRows = await executeQuery(
        `SELECT TOP 1 UID FROM Users WHERE Mobile = @mobile OR REPLACE(Mobile, ' ', '') = @cleanMob`,
        { mobile: String(mobile).trim(), cleanMob }
      );
      if (toUserRows && toUserRows.length > 0) toUID = toUserRows[0].UID;
    }
    if (!toUID && targetUID && String(targetUID) !== String(uid)) {
      toUID = targetUID;
    }
    if (!toUID && selectedUID && String(selectedUID) !== String(uid)) {
      toUID = selectedUID;
    }
    if (!toUID) return res.json({ success: false, message: 'TO customer ka UID nahi mila' });

    if (src_D_PComm !== undefined) {
      const tol = 0.01;
      const srcRows = await executeQuery(
        `SELECT ChatID FROM Chat 
         WHERE fGameID = @gameID 
           AND (
             (fSenderID = @selectedUID AND fReceiverID = @uid)
             OR
             (fSenderID = @uid AND fReceiverID = @selectedUID)
           )
           AND CAST(MsgDate AS date) = CAST(@msgDate AS date)
           AND ABS(ISNULL(D_PComm,0) - @dPC) < ${tol} 
           AND ABS(ISNULL(D_Amt,0) - @dA) < ${tol}
           AND ABS(ISNULL(A_PComm,0) - @aPC) < ${tol} 
           AND ABS(ISNULL(A_Amt,0) - @aA) < ${tol}
           AND ABS(ISNULL(Pati_PComm,0) - @pati) < ${tol}`,
        {
          gameID: parseInt(gameID),
          selectedUID: parseInt(selectedUID),
          uid: parseInt(uid),
          msgDate: fromDateStr,
          dPC: parseFloat(src_D_PComm) || 0,
          dA: parseFloat(src_D_Amt) || 100,
          aPC: parseFloat(src_A_PComm) || 0,
          aA: parseFloat(src_A_Amt) || 10,
          pati: parseFloat(src_Pati_PComm) || 0
        }
      );
      if (!srcRows || !srcRows.length)
        return res.json({ success: false, message: 'Is rate ke liye koi message nahi mila' });

      for (const row of srcRows) {
        await executeQuery(
          `UPDATE Chat 
           SET fSenderID = @toUID,
               fReceiverID = @uid,
               fGameID = @newGame,
               MsgDate = @newDate,
               MessageDateTime = @dt,
               D_PComm = @dPC, D_Amt = @dA,
               A_PComm = @aPC, A_Amt = @aA,
               Pati_PComm = @pati,
               fHissaPartyID = @hissaID,
               HissaPerc = @hissaPer
           WHERE ChatID = @chatID`,
          {
            toUID: parseInt(toUID),
            uid: parseInt(uid),
            newGame: parseInt(currentGameID),
            newDate: toDateStr,
            dt: msgDateTime,
            dPC: parseFloat(D_PComm) || 0,
            dA: parseFloat(D_Amt) || 100,
            aPC: parseFloat(A_PComm) || 0,
            aA: parseFloat(A_Amt) || 10,
            pati: parseFloat(Pati_PComm) || 0,
            hissaID: parseInt(fHissaPartyID) || 0,
            hissaPer: parseFloat(hissaPerc) || 0,
            chatID: row.ChatID
          }
        );
      }
    } else {
      await executeStoredProcedure('UpdateMoveChatMessage', {
        UserID: uid, SelectedUID: selectedUID, Mobile: String(mobile),
        SubUID: subUID || '', GameID: gameID, CurrentGameID: currentGameID,
        fHissaPartyID: fHissaPartyID || 0, HissaPerc: parseFloat(hissaPerc) || 0,
        D_PComm: parseFloat(D_PComm) || 0, D_Amt: parseFloat(D_Amt) || 100,
        A_PComm: parseFloat(A_PComm) || 0, A_Amt: parseFloat(A_Amt) || 10,
        Pati_PComm: parseFloat(Pati_PComm) || 0,
        MsgDate: fromDateStr, CurrentMsgDate: toDateStr, MsgdateTime: msgDateTime
      });
    }
    res.json({ success: true, message: 'Data Move Successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/copy-message
router.post('/copy-message', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const subUID = req.user.SubUID || '';
    const {
      selectedUID, gameID, msgDate, currentGameID, currentMsgDate, targetUID, mobile,
      src_D_PComm, src_D_Amt, src_A_PComm, src_A_Amt, src_Pati_PComm,
      D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm,
      fHissaPartyID, hissaPerc,
      ThirdPartyCommID, ThirdPartyDaraComm, ThirdPartyAkharComm
    } = req.body;

    const fromDateStr = formatDateStr(msgDate);
    const toDateStr   = formatDateStr(currentMsgDate);
    const msgDateTime = formatDateTime(getIndianTime());

    let toUID = null;
    if (mobile) {
      const cleanMob = String(mobile).replace(/\D/g, '').slice(-10);
      const toUserRows = await executeQuery(
        `SELECT TOP 1 UID FROM Users WHERE Mobile = @mobile OR REPLACE(Mobile, ' ', '') = @cleanMob`,
        { mobile: String(mobile).trim(), cleanMob }
      );
      if (toUserRows && toUserRows.length > 0) toUID = toUserRows[0].UID;
    }
    if (!toUID && targetUID && String(targetUID) !== String(uid)) {
      toUID = targetUID;
    }
    if (!toUID && selectedUID && String(selectedUID) !== String(uid)) {
      toUID = selectedUID;
    }
    if (!toUID) return res.json({ success: false, message: 'Target customer UID nahi mila' });

    const tol = 0.01;
    let copyRows = [];
    if (src_D_PComm !== undefined) {
      copyRows = await executeQuery(
        `SELECT * FROM Chat 
         WHERE fGameID = @gameID 
           AND (
             (fSenderID = @selectedUID AND fReceiverID = @uid)
             OR
             (fSenderID = @uid AND fReceiverID = @selectedUID)
           )
           AND CAST(MsgDate AS date) = CAST(@msgDate AS date)
           AND ABS(ISNULL(D_PComm,0) - @dPC) < ${tol} 
           AND ABS(ISNULL(D_Amt,0) - @dA) < ${tol}
           AND ABS(ISNULL(A_PComm,0) - @aPC) < ${tol} 
           AND ABS(ISNULL(A_Amt,0) - @aA) < ${tol}
           AND ABS(ISNULL(Pati_PComm,0) - @pati) < ${tol}
           AND (IsSettled = 'False' OR IsSettled = 0)`,
        {
          gameID: parseInt(gameID),
          selectedUID: parseInt(selectedUID),
          uid: parseInt(uid),
          msgDate: fromDateStr,
          dPC: parseFloat(src_D_PComm) || 0,
          dA: parseFloat(src_D_Amt) || 100,
          aPC: parseFloat(src_A_PComm) || 0,
          aA: parseFloat(src_A_Amt) || 10,
          pati: parseFloat(src_Pati_PComm) || 0
        }
      );
    } else {
      copyRows = await executeQuery(
        `SELECT * FROM Chat 
         WHERE fGameID = @gameID 
           AND (
             (fSenderID = @selectedUID AND fReceiverID = @uid)
             OR
             (fSenderID = @uid AND fReceiverID = @selectedUID)
           )
           AND CAST(MsgDate AS date) = CAST(@msgDate AS date)
           AND (IsSettled = 'False' OR IsSettled = 0)`,
        {
          gameID: parseInt(gameID),
          selectedUID: parseInt(selectedUID),
          uid: parseInt(uid),
          msgDate: fromDateStr
        }
      );
    }

    if (!copyRows || !copyRows.length)
      return res.json({ success: false, message: 'Data Not Found — is date/game mein koi message nahi mila' });

    for (const row of copyRows) {
      await executeStoredProcedure('InsertChatMessageWhatsappLike', {
        fSenderID: uid,
        fReceiverID: parseInt(toUID),
        fGameID: parseInt(currentGameID),
        Message: row.Message,
        MessageDateTime: msgDateTime,
        IsTextChat: true,
        IsYantriStyle: true,
        TotalAmount: parseFloat(row.TotalAmount) || 0,
        CheckAcceptedStatus: true,
        IsSendByReceiver: false,
        SUID: subUID || '',
        D_PComm: parseFloat(D_PComm) || 0,
        D_Amt: parseFloat(D_Amt) || 100,
        A_PComm: parseFloat(A_PComm) || 0,
        A_Amt: parseFloat(A_Amt) || 10,
        Pati_PComm: parseFloat(Pati_PComm) || 0,
        fHissaPartyID: parseInt(fHissaPartyID) || 0,
        HissaPerc: parseFloat(hissaPerc) || 0,
        CurrentMsgDate: toDateStr,
        ThirdPartyCommID: parseInt(ThirdPartyCommID) || 0,
        ThirdPartyDaraComm: parseFloat(ThirdPartyDaraComm) || 0,
        ThirdPartyAkharComm: parseFloat(ThirdPartyAkharComm) || 0
      });
    }
    res.json({ success: true, message: 'Data Copy Successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/save-bulk-forward
router.post('/save-bulk-forward', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const subUID = req.user.SubUID || '';
    const {
      chatIDs, gameID,
      D_PComm, D_Amt, A_PComm, A_Amt, Pati_PComm,
      fHissaPartyID, hissaPerc, ThirdPartyCommID, ThirdPartyDaraComm, ThirdPartyAkharComm
    } = req.body;

    const msgDateTime = formatDateTime(getIndianTime());
    const uniqueIds = [...new Set(chatIDs)];

    for (const chatID of uniqueIds) {
      try {
        // Try full params first (newer SP version)
        await executeStoredProcedure('ForWardChatMessage', {
          fSenderID: uid,
          fGameID: gameID,
          ChatID: chatID,
          MessageDateTime: msgDateTime,
          IsTextChat: 'True',
          subuserID: subUID && subUID !== '0' ? subUID : '',
          D_PComm: parseFloat(D_PComm) || 0,
          D_Amt: parseFloat(D_Amt) || 100,
          A_PComm: parseFloat(A_PComm) || 0,
          A_Amt: parseFloat(A_Amt) || 10,
          Pati_PComm: parseFloat(Pati_PComm) || 0,
          fHissaPartyID: fHissaPartyID || '0',
          HissaPerc: parseFloat(hissaPerc) || 0,
          ThirdPartyCommID: ThirdPartyCommID || '0',
          ThirdPartyDaraComm: parseFloat(ThirdPartyDaraComm) || 0,
          ThirdPartyAkharComm: parseFloat(ThirdPartyAkharComm) || 0
        });
      } catch (spErr) {
        // Fallback: basic params only
        await executeStoredProcedure('ForWardChatMessage', {
          fSenderID: uid,
          fGameID: gameID,
          ChatID: chatID,
          MessageDateTime: msgDateTime,
          IsTextChat: 'True',
          subuserID: subUID && subUID !== '0' ? subUID : '',
          D_PComm: parseFloat(D_PComm) || 0,
          D_Amt: parseFloat(D_Amt) || 100,
          A_PComm: parseFloat(A_PComm) || 0,
          A_Amt: parseFloat(A_Amt) || 10,
          Pati_PComm: parseFloat(Pati_PComm) || 0
        });
      }
    }
    res.json({ success: true, message: 'Processed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
