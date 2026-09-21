const { executeStoredProcedure, executeQuery } = require('../config/database');

/**
 * Calculates winning amounts, commissions, Dara/Akhar sales,
 * and balances for all accepted chats of a game on a given date.
 */
async function calculateGameResult(gameID, dateStr, rawResult, receiverUID) {
  try {
    let cleanResult = String(rawResult || '').trim();
    if (!cleanResult) return false;
    if (cleanResult === '00') cleanResult = '100';
    if (parseInt(cleanResult, 10) < 10) cleanResult = '0' + parseInt(cleanResult, 10);
    const intResult = parseInt(cleanResult, 10);
    const gid = parseInt(gameID, 10);

    // 1. Save or update result in Result table and mark chat as read
    try {
      await executeStoredProcedure('SaveResult', {
        fGameID: gid,
        Date: dateStr,
        Result: cleanResult
      });
    } catch (saveErr) {
      // Fallback direct SQL if stored procedure has any issue
      const existing = await executeQuery(
        `SELECT RID FROM Result WHERE fGameID=@gid AND CAST(Date AS date)=CAST(@date AS date)`,
        { gid, date: dateStr }
      );
      if (existing && existing.length > 0) {
        await executeQuery(
          `UPDATE Result SET Result=@result WHERE fGameID=@gid AND CAST(Date AS date)=CAST(@date AS date)`,
          { result: cleanResult, gid, date: dateStr }
        );
      } else {
        await executeQuery(
          `INSERT INTO Result (fGameID, Result, Date) VALUES (@gid, @result, @date)`,
          { gid, result: cleanResult, date: dateStr }
        );
      }
      await executeQuery(
        `UPDATE Chat SET IsRead = 'True' WHERE fGameID=@gid AND CAST(MsgDate AS date)>=CAST(@date AS date)`,
        { gid, date: dateStr }
      );
    }

    // 2. Fetch all accepted WhatsApp-like chats for this game and date
    let chatData = [];
    try {
      chatData = await executeStoredProcedure('FetchGameResultDataWhatsApp', {
        gameid: gid,
        date: dateStr,
        WinNo: cleanResult,
        fReceiverID: receiverUID
      });
    } catch (fetchErr) {
      console.error('FetchGameResultDataWhatsApp error:', fetchErr.message);
      // Fallback query if SP fails
      await executeQuery(
        `UPDATE Chat SET WinAmount=0, D_Sale=0, A_Sale=0, O_Dara=0, O_Akhar=0, Commision=0, Pati_Amt=0, HissaPercAmt=0, ThirdPartyDaraCommAmt=0, ThirdPartyAkharCommAmt=0
         WHERE fGameID=@gid AND IsSettled='False' AND IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
           AND CAST(MsgDate AS date)=CAST(@date AS date) AND fReceiverID=@uid`,
        { gid, date: dateStr, uid: receiverUID }
      );
      chatData = await executeQuery(
        `SELECT * FROM Chat
         WHERE fGameID=@gid AND IsAccepted='Accepted' AND IsTextChat='True' AND IsYantriStyle='True'
           AND IsSettled='False' AND CAST(MsgDate AS date)=CAST(@date AS date) AND fReceiverID=@uid`,
        { gid, date: dateStr, uid: receiverUID }
      );
    }

    if (!chatData || !chatData.length) return true;

    // 3. Process each chat entry according to rates and numbers bet
    for (const dr of chatData) {
      const D_PComm = parseFloat(dr.D_PComm) || 0;
      const D_Amt   = parseFloat(dr.D_Amt)   || 0;
      const A_PComm = parseFloat(dr.A_PComm) || 0;
      const A_Amt   = parseFloat(dr.A_Amt)   || 0;
      const Pati    = parseFloat(dr.Pati_PComm) || 0;
      const HissaPerc = parseFloat(dr.HissaPerc) || 0;
      const ThirdPartyDaraComm  = parseFloat(dr.ThirdPartyDaraComm)  || 0;
      const ThirdPartyAkharComm = parseFloat(dr.ThirdPartyAkharComm) || 0;
      const Total_Sale = parseFloat(dr.TotalAmount) || 0;

      const grouped = {};
      (dr.Message || '').split(',').forEach(entry => {
        const [ns, vs] = entry.split('=');
        if (ns && vs) {
          const n = parseInt(ns, 10);
          if (!isNaN(n)) grouped[n] = (grouped[n] || 0) + (parseFloat(vs) || 0);
        }
      });

      let D_Amount = 0, A_Amount = 0, D_Sale = 0, A_Sale = 0;

      Object.entries(grouped).forEach(([ns, amt]) => {
        const n = parseInt(ns, 10);
        // Dara: numbers 1 to 100
        if (n === intResult && n >= 1 && n <= 100) D_Amount += amt;
        // Bahar Akhar (units digit): numbers 101-1000 or 1000
        if (((n > 100 && n < 1000) || n === 1000) && (n % 10) === (intResult % 10)) A_Amount += amt;
        // Andar Akhar (tens digit): numbers 1001-10000 or 10000
        if (((n > 1000 && n < 10000) && (n % 10) === Math.floor(intResult / 10)) ||
            (n === 10000 && (intResult === 100 || (n % 10) === Math.floor(intResult / 10)))) A_Amount += amt;

        if (n >= 1 && n <= 100) D_Sale += amt;
        else A_Sale += amt;
      });

      // Calculate totals matching original SUSU9 business rules
      const Total_Commission       = Math.round((D_Sale * D_PComm) / 100 + (A_Sale * A_PComm) / 100);
      const Total_WinAmount        = Math.round((D_Amount * D_Amt) + (A_Amount * A_Amt));
      const Pati_Amount            = Math.round(((Total_Sale - Total_Commission - Total_WinAmount) * Pati) / 100);
      const TotalBalance           = Math.round(Total_Sale - Total_Commission - Total_WinAmount - Pati_Amount);
      const HissaPercAmt           = Math.round((TotalBalance * HissaPerc) / 100);
      const ThirdPartyDaraCommAmt  = Math.round((D_Sale * ThirdPartyDaraComm) / 100);
      const ThirdPartyAkharCommAmt = Math.round((A_Sale * ThirdPartyAkharComm) / 100);

      try {
        await executeStoredProcedure('updateWinAmount', {
          ChatID: dr.ChatID,
          WinAmount: Total_WinAmount,
          Dsale: D_Sale,
          Asale: A_Sale,
          ODsale: D_Amount,
          OAsale: A_Amount,
          Comm: Total_Commission,
          Pati: Pati_Amount,
          HissaPercAmt,
          ThirdPartyDaraCommAmt,
          ThirdPartyAkharCommAmt
        });
      } catch (upErr) {
        // Fallback direct SQL update if stored procedure has issue
        await executeQuery(
          `UPDATE Chat
           SET WinAmount=@WinAmount, D_Sale=@Dsale, A_Sale=@Asale, O_Dara=@ODsale, O_Akhar=@OAsale,
               Commision=@Comm, Pati_Amt=@Pati, HissaPercAmt=@HissaPercAmt,
               ThirdPartyDaraCommAmt=@ThirdPartyDaraCommAmt, ThirdPartyAkharCommAmt=@ThirdPartyAkharCommAmt
           WHERE ChatID=@ChatID`,
          {
            ChatID: dr.ChatID,
            WinAmount: Total_WinAmount,
            Dsale: D_Sale,
            Asale: A_Sale,
            ODsale: D_Amount,
            OAsale: A_Amount,
            Comm: Total_Commission,
            Pati: Pati_Amount,
            HissaPercAmt,
            ThirdPartyDaraCommAmt,
            ThirdPartyAkharCommAmt
          }
        );
      }
    }
    return true;
  } catch (err) {
    console.error('calculateGameResult fatal error:', err);
    return false;
  }
}

module.exports = { calculateGameResult };
