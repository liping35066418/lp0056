const express = require('express');
const cors = require('cors');
const path = require('path');
const dayjs = require('dayjs');
const db = require('./db');
const analytics = require('./analytics');

const app = express();
const PORT = 8716;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/areas', (req, res) => {
  const areas = db.prepare('SELECT * FROM areas ORDER BY id').all();
  res.json(areas);
});

app.post('/api/areas', (req, res) => {
  const { name, description } = req.body;
  const result = db.prepare('INSERT INTO areas (name, description) VALUES (?, ?)').run(name, description || '');
  res.json({ id: result.lastInsertRowid, name, description });
});

app.get('/api/seats', (req, res) => {
  const seats = db.prepare(`
    SELECT s.*, a.name as area_name 
    FROM seats s 
    JOIN areas a ON s.area_id = a.id 
    ORDER BY s.seat_code
  `).all();
  res.json(seats);
});

app.post('/api/seats', (req, res) => {
  const { seat_code, area_id, seat_type } = req.body;
  try {
    const result = db.prepare('INSERT INTO seats (seat_code, area_id, seat_type) VALUES (?, ?, ?)')
      .run(seat_code, area_id, seat_type);
    res.json({ id: result.lastInsertRowid, seat_code, area_id, seat_type });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/analytics/summary', (req, res) => {
  const { startDate, endDate } = req.query;
  const summary = analytics.getSummary(startDate, endDate);
  res.json(summary);
});

app.get('/api/analytics/daily', (req, res) => {
  const { startDate, endDate } = req.query;
  const dailyStats = analytics.getDailyStats(startDate, endDate);
  res.json(dailyStats);
});

app.get('/api/analytics/weekly', (req, res) => {
  const { startDate, endDate } = req.query;
  const weeklyStats = analytics.getWeeklyStats(startDate, endDate);
  res.json(weeklyStats);
});

app.get('/api/analytics/peak-hours', (req, res) => {
  const { startDate, endDate } = req.query;
  const peakHours = analytics.getPeakHours(startDate, endDate);
  res.json(peakHours);
});

app.get('/api/analytics/by-area', (req, res) => {
  const { startDate, endDate } = req.query;
  const areaStats = analytics.getAreaStats(startDate, endDate);
  res.json(areaStats);
});

app.get('/api/analytics/by-seat-type', (req, res) => {
  const { startDate, endDate } = req.query;
  const typeStats = analytics.getSeatTypeStats(startDate, endDate);
  res.json(typeStats);
});

app.get('/api/analytics/full', (req, res) => {
  const { startDate, endDate } = req.query;
  res.json({
    summary: analytics.getSummary(startDate, endDate),
    daily: analytics.getDailyStats(startDate, endDate),
    weekly: analytics.getWeeklyStats(startDate, endDate),
    peakHours: analytics.getPeakHours(startDate, endDate),
    byArea: analytics.getAreaStats(startDate, endDate),
    bySeatType: analytics.getSeatTypeStats(startDate, endDate)
  });
});

app.post('/api/check-in', (req, res) => {
  const { seat_id, customer_name, customer_phone, reservation_id, source } = req.body;
  const check_in_time = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seat_id);
  if (!seat) {
    return res.status(404).json({ error: '座位不存在' });
  }

  const activeCheckIn = db.prepare(`
    SELECT ci.* FROM check_ins ci
    LEFT JOIN check_outs co ON ci.id = co.check_in_id
    WHERE ci.seat_id = ? AND co.id IS NULL
  `).get(seat_id);

  if (activeCheckIn) {
    return res.status(400).json({ error: '该座位当前有人使用' });
  }

  const result = db.prepare(`
    INSERT INTO check_ins (seat_id, reservation_id, customer_name, customer_phone, check_in_time, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(seat_id, reservation_id || null, customer_name || '', customer_phone || '', check_in_time, source || 'walk_in');

  res.json({
    id: result.lastInsertRowid,
    seat_id,
    check_in_time,
    customer_name,
    customer_phone
  });
});

app.post('/api/check-out', (req, res) => {
  const { check_in_id, is_abnormal, abnormal_reason } = req.body;
  const check_out_time = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const checkIn = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(check_in_id);
  if (!checkIn) {
    return res.status(404).json({ error: '签到记录不存在' });
  }

  const existingCheckout = db.prepare('SELECT * FROM check_outs WHERE check_in_id = ?').get(check_in_id);
  if (existingCheckout) {
    return res.status(400).json({ error: '该签到已离场' });
  }

  const duration = dayjs(check_out_time).diff(dayjs(checkIn.check_in_time), 'minute');

  const result = db.prepare(`
    INSERT INTO check_outs (check_in_id, seat_id, check_out_time, duration_minutes, is_abnormal, abnormal_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(check_in_id, checkIn.seat_id, check_out_time, duration, is_abnormal ? 1 : 0, abnormal_reason || '');

  res.json({
    id: result.lastInsertRowid,
    check_in_id,
    check_out_time,
    duration_minutes: duration,
    is_abnormal: is_abnormal ? 1 : 0
  });
});

app.post('/api/reservations', (req, res) => {
  const { seat_id, customer_name, customer_phone, reserve_start, reserve_end } = req.body;

  const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seat_id);
  if (!seat) {
    return res.status(404).json({ error: '座位不存在' });
  }

  const conflict = db.prepare(`
    SELECT * FROM reservations 
    WHERE seat_id = ? AND status != 'cancelled'
    AND ((reserve_start < ? AND reserve_end > ?)
         OR (reserve_start < ? AND reserve_end > ?)
         OR (reserve_start >= ? AND reserve_end <= ?))
  `).get(seat_id, reserve_end, reserve_start, reserve_end, reserve_start, reserve_start, reserve_end);

  if (conflict) {
    return res.status(400).json({ error: '该时段已被预约' });
  }

  const result = db.prepare(`
    INSERT INTO reservations (seat_id, customer_name, customer_phone, reserve_start, reserve_end)
    VALUES (?, ?, ?, ?, ?)
  `).run(seat_id, customer_name || '', customer_phone || '', reserve_start, reserve_end);

  res.json({
    id: result.lastInsertRowid,
    seat_id,
    reserve_start,
    reserve_end,
    customer_name
  });
});

app.get('/api/reservations', (req, res) => {
  const { date } = req.query;
  let query = 'SELECT r.*, s.seat_code, a.name as area_name FROM reservations r JOIN seats s ON r.seat_id = s.id JOIN areas a ON s.area_id = a.id';
  const params = [];

  if (date) {
    query += ' WHERE date(r.reserve_start) = ?';
    params.push(date);
  }

  query += ' ORDER BY r.reserve_start DESC';
  const reservations = db.prepare(query).all(...params);
  res.json(reservations);
});

app.post('/api/temp-occupation', (req, res) => {
  const { seat_id, customer_name } = req.body;
  const start_time = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const seat = db.prepare('SELECT * FROM seats WHERE id = ?').get(seat_id);
  if (!seat) {
    return res.status(404).json({ error: '座位不存在' });
  }

  const active = db.prepare(`
    SELECT * FROM temp_occupations 
    WHERE seat_id = ? AND status = 'active'
  `).get(seat_id);

  if (active) {
    return res.status(400).json({ error: '该座位已有临时占座' });
  }

  const result = db.prepare(`
    INSERT INTO temp_occupations (seat_id, start_time, customer_name, status)
    VALUES (?, ?, ?, 'active')
  `).run(seat_id, start_time, customer_name || '');

  res.json({
    id: result.lastInsertRowid,
    seat_id,
    start_time,
    customer_name
  });
});

app.post('/api/temp-occupation/:id/end', (req, res) => {
  const { id } = req.params;
  const end_time = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const tempOcc = db.prepare('SELECT * FROM temp_occupations WHERE id = ?').get(id);
  if (!tempOcc) {
    return res.status(404).json({ error: '临时占座记录不存在' });
  }

  db.prepare(`
    UPDATE temp_occupations SET end_time = ?, status = 'ended' WHERE id = ?
  `).run(end_time, id);

  res.json({ id, end_time });
});

app.get('/api/temp-occupations', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT t.*, s.seat_code, a.name as area_name 
    FROM temp_occupations t 
    JOIN seats s ON t.seat_id = s.id 
    JOIN areas a ON s.area_id = a.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE t.status = ?';
    params.push(status);
  }

  query += ' ORDER BY t.start_time DESC';
  const records = db.prepare(query).all(...params);
  res.json(records);
});

app.get('/api/abnormal-checkouts', (req, res) => {
  const { startDate, endDate } = req.query;
  const range = analytics.getDateRange(startDate, endDate);

  const abnormals = db.prepare(`
    SELECT co.*, ci.customer_name, ci.customer_phone, s.seat_code, a.name as area_name
    FROM check_outs co
    JOIN check_ins ci ON co.check_in_id = ci.id
    JOIN seats s ON co.seat_id = s.id
    JOIN areas a ON s.area_id = a.id
    WHERE co.is_abnormal = 1 AND co.check_out_time >= ? AND co.check_out_time <= ?
    ORDER BY co.check_out_time DESC
  `).all(range.start, range.end);

  res.json(abnormals);
});

app.post('/api/data-correction', (req, res) => {
  const { correction_type, target_id, original_data, corrected_data, reason, operator } = req.body;

  const result = db.prepare(`
    INSERT INTO data_corrections (correction_type, target_id, original_data, corrected_data, reason, operator)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(correction_type, target_id || null, JSON.stringify(original_data || {}), JSON.stringify(corrected_data || {}), reason || '', operator || '');

  if (correction_type === 'check_in_time' && target_id && corrected_data && corrected_data.check_in_time) {
    const original = db.prepare('SELECT check_in_time FROM check_ins WHERE id = ?').get(target_id);
    if (original) {
      db.prepare('UPDATE check_ins SET check_in_time = ? WHERE id = ?').run(corrected_data.check_in_time, target_id);
      const checkout = db.prepare('SELECT * FROM check_outs WHERE check_in_id = ?').get(target_id);
      if (checkout) {
        const newDuration = dayjs(checkout.check_out_time).diff(dayjs(corrected_data.check_in_time), 'minute');
        db.prepare('UPDATE check_outs SET duration_minutes = ? WHERE check_in_id = ?').run(newDuration, target_id);
      }
    }
  }

  if (correction_type === 'check_out_time' && target_id && corrected_data && corrected_data.check_out_time) {
    const original = db.prepare('SELECT check_out_time, check_in_id FROM check_outs WHERE id = ?').get(target_id);
    if (original) {
      const checkIn = db.prepare('SELECT check_in_time FROM check_ins WHERE id = ?').get(original.check_in_id);
      if (checkIn) {
        const newDuration = dayjs(corrected_data.check_out_time).diff(dayjs(checkIn.check_in_time), 'minute');
        db.prepare('UPDATE check_outs SET check_out_time = ?, duration_minutes = ? WHERE id = ?')
          .run(corrected_data.check_out_time, newDuration, target_id);
      }
    }
  }

  if (correction_type === 'add_usage_record' && corrected_data) {
    const { seat_id, check_in_time, check_out_time, customer_name, customer_phone } = corrected_data;
    const ciResult = db.prepare(`
      INSERT INTO check_ins (seat_id, customer_name, customer_phone, check_in_time, source)
      VALUES (?, ?, ?, ?, 'correction')
    `).run(seat_id, customer_name || '', customer_phone || '', check_in_time);

    const duration = dayjs(check_out_time).diff(dayjs(check_in_time), 'minute');
    db.prepare(`
      INSERT INTO check_outs (check_in_id, seat_id, check_out_time, duration_minutes, is_abnormal)
      VALUES (?, ?, ?, ?, 0)
    `).run(ciResult.lastInsertRowid, seat_id, check_out_time, duration);
  }

  res.json({ id: result.lastInsertRowid, correction_type, target_id });
});

app.get('/api/data-corrections', (req, res) => {
  const corrections = db.prepare('SELECT * FROM data_corrections ORDER BY created_at DESC LIMIT 100').all();
  res.json(corrections.map(c => ({
    ...c,
    original_data: JSON.parse(c.original_data || '{}'),
    corrected_data: JSON.parse(c.corrected_data || '{}')
  })));
});

app.get('/api/report/export', (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  const range = analytics.getDateRange(startDate, endDate);

  const dailyData = analytics.getDailyStats(startDate, endDate);
  const areaStats = analytics.getAreaStats(startDate, endDate);
  const typeStats = analytics.getSeatTypeStats(startDate, endDate);
  const summary = analytics.getSummary(startDate, endDate);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="study_room_report_${range.startDate.format('YYYYMMDD')}_${range.endDate.format('YYYYMMDD')}.json"`);
    return res.json({ summary, dailyData, areaStats, typeStats });
  }

  let csv = '\ufeff';
  csv += '=== 数据汇总 ===\n';
  csv += '统计日期范围,' + summary.dateRange.start + ' 至 ' + summary.dateRange.end + '\n';
  csv += '统计天数,' + summary.dayCount + '\n';
  csv += '总座位数,' + summary.totalSeats + '\n';
  csv += '总客流人次,' + summary.totalCheckIns + '\n';
  csv += '预约数,' + summary.totalReservations + '\n';
  csv += '平均使用时长(分钟),' + summary.avgDuration + '\n';
  csv += '日均客流,' + summary.avgDailyVisitors + '\n';
  csv += '座位使用率,' + summary.utilizationRate + '%\n';
  csv += '异常离场数,' + summary.abnormalCount + '\n';
  csv += '临时占座数,' + summary.tempOccupationCount + '\n';

  csv += '\n=== 每日数据 ===\n';
  csv += '日期,客流人次,预约数,平均使用时长(分钟),座位使用率(%),使用总分钟数\n';
  dailyData.forEach(d => {
    csv += `${d.date},${d.checkInCount},${d.reservationsCount},${d.avgDuration},${d.utilizationRate},${d.totalMinutes}\n`;
  });

  csv += '\n=== 区域数据 ===\n';
  csv += '区域,座位数,客流人次,使用率(%),使用总分钟数\n';
  areaStats.forEach(a => {
    csv += `${a.areaName},${a.seatCount},${a.checkInCount},${a.utilizationRate},${a.totalMinutes}\n`;
  });

  csv += '\n=== 座位类型数据 ===\n';
  csv += '座位类型,座位数,客流人次,使用率(%),使用总分钟数\n';
  typeStats.forEach(t => {
    csv += `${t.seatType},${t.seatCount},${t.checkInCount},${t.utilizationRate},${t.totalMinutes}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="study_room_report_${range.startDate.format('YYYYMMDD')}_${range.endDate.format('YYYYMMDD')}.csv"`);
  res.send(csv);
});

app.get('/api/check-ins', (req, res) => {
  const { startDate, endDate, page = 1, pageSize = 20 } = req.query;
  const range = analytics.getDateRange(startDate, endDate);
  const offset = (page - 1) * pageSize;

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM check_ins 
    WHERE check_in_time >= ? AND check_in_time <= ?
  `).get(range.start, range.end).count;

  const records = db.prepare(`
    SELECT ci.*, s.seat_code, a.name as area_name,
           CASE WHEN co.id IS NOT NULL THEN 1 ELSE 0 END as has_checked_out,
           co.check_out_time, co.duration_minutes, co.is_abnormal
    FROM check_ins ci
    JOIN seats s ON ci.seat_id = s.id
    JOIN areas a ON s.area_id = a.id
    LEFT JOIN check_outs co ON ci.id = co.check_in_id
    WHERE ci.check_in_time >= ? AND ci.check_in_time <= ?
    ORDER BY ci.check_in_time DESC
    LIMIT ? OFFSET ?
  `).all(range.start, range.end, parseInt(pageSize), offset);

  res.json({
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    list: records
  });
});

app.listen(PORT, () => {
  console.log(`付费自习室数据分析平台已启动，端口: ${PORT}`);
  console.log(`访问地址: http://localhost:${PORT}`);
});

module.exports = app;
