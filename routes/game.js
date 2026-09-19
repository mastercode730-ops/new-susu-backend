const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { executeStoredProcedure, executeQuery } = require('../config/database');

router.get('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('FetchGames', { fId: uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const { gameName, drawTime, isActive, isNextDay, isNextDayResult, isAcceptedStatus, isRejectedMsg } = req.body;
    if (!gameName) return res.status(400).json({ success: false, message: 'Game name required' });
    await executeStoredProcedure('CreateGames', {
      fId: uid,
      GameName: gameName,
      DrawTime: drawTime || null,
      IsActive: isActive !== undefined ? isActive : true,
      IsNextDay: isNextDay || isNextDayResult || false,
      IsAcceptedStatus: isAcceptedStatus || false,
      IsRejectedMsg: isRejectedMsg || false
    });
    res.json({ success: true, message: 'Game created' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:gid', requireAuth, async (req, res) => {
  try {
    const { gameName, drawTime, isActive, isNextDayResult, isAcceptedStatus, isRejectedMsg } = req.body;
    await executeQuery(
      `UPDATE Game SET GameName=@gameName, DrawTime=@drawTime, IsActive=@isActive, IsNextDayResult=@isNextDayResult, IsAcceptedStatus=@isAcceptedStatus, IsRejectedMsg=@isRejectedMsg WHERE GID=@gid`,
      { gid: parseInt(req.params.gid), gameName, drawTime: drawTime || null, isActive: isActive ? 'True' : 'False', isNextDayResult: isNextDayResult ? 'True' : 'False', isAcceptedStatus: isAcceptedStatus ? 'True' : 'False', isRejectedMsg: isRejectedMsg ? 'True' : 'False' }
    );
    res.json({ success: true, message: 'Game updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:gid', requireAuth, async (req, res) => {
  try {
    await executeQuery(`DELETE FROM Game WHERE GID=@gid`, { gid: parseInt(req.params.gid) });
    res.json({ success: true, message: 'Game deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/toggle', requireAuth, async (req, res) => {
  try {
    const { gid, field, value } = req.body;
    const allowed = ['IsActive', 'IsNextDayResult', 'IsAcceptedStatus', 'IsRejectedMsg'];
    if (!allowed.includes(field)) return res.status(400).json({ success: false, message: 'Invalid field' });
    await executeQuery(`UPDATE Game SET ${field}=@value WHERE GID=@gid`, { gid: parseInt(gid), value: value ? 'True' : 'False' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/game/list
router.get('/list', requireAuth, async (req, res) => {
  try {
    const uid = req.user.UID;
    const data = await executeStoredProcedure('FetchGames', { fId: uid });
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/game/result?gid=X&date=X
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

// POST /api/game/save-result
router.post('/save-result', requireAuth, async (req, res) => {
  try {
    const { gameID, result, date } = req.body;
    const uid = req.user.UID;
    const existing = await executeQuery(
      `SELECT ResultID FROM Result WHERE fGameID=@gid AND Date=@date`,
      { gid: parseInt(gameID), date }
    );
    if (existing && existing.length > 0) {
      await executeQuery(
        `UPDATE Result SET Result=@result WHERE fGameID=@gid AND Date=@date`,
        { result, gid: parseInt(gameID), date }
      );
    } else {
      await executeQuery(
        `INSERT INTO Result (fGameID, Result, Date, fUID) VALUES (@gid, @result, @date, @uid)`,
        { gid: parseInt(gameID), result, date, uid }
      );
    }
    res.json({ success: true, message: 'Result saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/game/auto-accept-status?gid=X
router.get('/auto-accept-status', requireAuth, async (req, res) => {
  try {
    const { gid } = req.query;
    const data = await executeQuery(
      `SELECT IsAcceptedStatus FROM Game WHERE GID=@gid`,
      { gid: parseInt(gid) }
    );
    res.json({ success: true, data: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
