const db = require('./db');
const dayjs = require('dayjs');

function getDateRange(startDate, endDate) {
  const start = startDate ? dayjs(startDate).startOf('day') : dayjs().subtract(7, 'day').startOf('day');
  const end = endDate ? dayjs(endDate).endOf('day') : dayjs().endOf('day');
  return { start: start.format('YYYY-MM-DD HH:mm:ss'), end: end.format('YYYY-MM-DD HH:mm:ss'), startDate: start, endDate: end };
}

function getDailyStats(startDate, endDate) {
  const range = getDateRange(startDate, endDate);
  const days = [];
  let current = range.startDate;
  while (current.isBefore(range.endDate) || current.isSame(range.endDate, 'day')) {
    days.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  const totalSeats = db.prepare('SELECT COUNT(*) as count FROM seats WHERE status = ?').get('active').count;

  const dailyData = days.map(date => {
    const dayStart = dayjs(date).startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const dayEnd = dayjs(date).endOf('day').format('YYYY-MM-DD HH:mm:ss');

    const checkInCount = db.prepare(`
      SELECT COUNT(*) as count FROM check_ins 
      WHERE check_in_time >= ? AND check_in_time <= ?
    `).get(dayStart, dayEnd).count;

    const reservationsCount = db.prepare(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE reserve_start >= ? AND reserve_start <= ?
      AND status != 'cancelled'
    `).get(dayStart, dayEnd).count;

    const checkouts = db.prepare(`
      SELECT duration_minutes FROM check_outs 
      WHERE check_out_time >= ? AND check_out_time <= ?
      AND is_abnormal = 0
    `).all(dayStart, dayEnd);

    const avgDuration = checkouts.length > 0
      ? Math.round(checkouts.reduce((sum, c) => sum + c.duration_minutes, 0) / checkouts.length)
      : 0;

    const totalMinutes = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total FROM check_outs 
      WHERE check_out_time >= ? AND check_out_time <= ?
      AND is_abnormal = 0
    `).get(dayStart, dayEnd).total;

    const utilizationRate = totalSeats > 0
      ? Math.round((totalMinutes / (totalSeats * 24 * 60)) * 10000) / 100
      : 0;

    return {
      date,
      checkInCount,
      reservationsCount,
      avgDuration,
      utilizationRate,
      totalMinutes
    };
  });

  return dailyData;
}

function getPeakHours(startDate, endDate) {
  const range = getDateRange(startDate, endDate);

  const hourlyData = db.prepare(`
    SELECT 
      CAST(strftime('%H', check_in_time) AS INTEGER) as hour,
      COUNT(*) as count
    FROM check_ins
    WHERE check_in_time >= ? AND check_in_time <= ?
    GROUP BY strftime('%H', check_in_time)
    ORDER BY hour
  `).all(range.start, range.end);

  const result = [];
  for (let i = 6; i <= 23; i++) {
    const found = hourlyData.find(h => h.hour === i);
    result.push({
      hour: `${i.toString().padStart(2, '0')}:00`,
      hourNum: i,
      count: found ? found.count : 0
    });
  }

  const maxCount = Math.max(...result.map(r => r.count), 1);
  const peakHour = result.reduce((max, curr) => curr.count > max.count ? curr : max, result[0]);

  return {
    hourlyData: result,
    peakHour: peakHour.hour,
    peakCount: peakHour.count
  };
}

function getAreaStats(startDate, endDate) {
  const range = getDateRange(startDate, endDate);

  const areas = db.prepare('SELECT * FROM areas').all();

  const areaStats = areas.map(area => {
    const seatsInArea = db.prepare('SELECT COUNT(*) as count FROM seats WHERE area_id = ? AND status = ?').get(area.id, 'active').count;

    const checkIns = db.prepare(`
      SELECT COUNT(*) as count FROM check_ins ci
      JOIN seats s ON ci.seat_id = s.id
      WHERE s.area_id = ? AND ci.check_in_time >= ? AND ci.check_in_time <= ?
    `).get(area.id, range.start, range.end).count;

    const totalMinutes = db.prepare(`
      SELECT COALESCE(SUM(co.duration_minutes), 0) as total
      FROM check_outs co
      JOIN seats s ON co.seat_id = s.id
      WHERE s.area_id = ? AND co.check_out_time >= ? AND co.check_out_time <= ?
      AND co.is_abnormal = 0
    `).get(area.id, range.start, range.end).total;

    const dayCount = range.endDate.diff(range.startDate, 'day') + 1;
    const utilizationRate = seatsInArea > 0
      ? Math.round((totalMinutes / (seatsInArea * dayCount * 24 * 60)) * 10000) / 100
      : 0;

    return {
      areaId: area.id,
      areaName: area.name,
      seatCount: seatsInArea,
      checkInCount: checkIns,
      totalMinutes,
      utilizationRate
    };
  });

  return areaStats;
}

function getSeatTypeStats(startDate, endDate) {
  const range = getDateRange(startDate, endDate);

  const seatTypes = db.prepare(`
    SELECT DISTINCT seat_type FROM seats WHERE status = ?
  `).all('active');

  const typeStats = seatTypes.map(type => {
    const seatsOfType = db.prepare('SELECT COUNT(*) as count FROM seats WHERE seat_type = ? AND status = ?').get(type.seat_type, 'active').count;

    const checkIns = db.prepare(`
      SELECT COUNT(*) as count FROM check_ins ci
      JOIN seats s ON ci.seat_id = s.id
      WHERE s.seat_type = ? AND ci.check_in_time >= ? AND ci.check_in_time <= ?
    `).get(type.seat_type, range.start, range.end).count;

    const totalMinutes = db.prepare(`
      SELECT COALESCE(SUM(co.duration_minutes), 0) as total
      FROM check_outs co
      JOIN seats s ON co.seat_id = s.id
      WHERE s.seat_type = ? AND co.check_out_time >= ? AND co.check_out_time <= ?
      AND co.is_abnormal = 0
    `).get(type.seat_type, range.start, range.end).total;

    const dayCount = range.endDate.diff(range.startDate, 'day') + 1;
    const utilizationRate = seatsOfType > 0
      ? Math.round((totalMinutes / (seatsOfType * dayCount * 24 * 60)) * 10000) / 100
      : 0;

    return {
      seatType: type.seat_type,
      seatCount: seatsOfType,
      checkInCount: checkIns,
      totalMinutes,
      utilizationRate
    };
  });

  return typeStats;
}

function getSummary(startDate, endDate) {
  const range = getDateRange(startDate, endDate);
  const dayCount = range.endDate.diff(range.startDate, 'day') + 1;

  const totalSeats = db.prepare('SELECT COUNT(*) as count FROM seats WHERE status = ?').get('active').count;

  const totalCheckIns = db.prepare(`
    SELECT COUNT(*) as count FROM check_ins
    WHERE check_in_time >= ? AND check_in_time <= ?
  `).get(range.start, range.end).count;

  const totalReservations = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE reserve_start >= ? AND reserve_start <= ?
    AND status != 'cancelled'
  `).get(range.start, range.end).count;

  const checkouts = db.prepare(`
    SELECT duration_minutes FROM check_outs
    WHERE check_out_time >= ? AND check_out_time <= ?
    AND is_abnormal = 0
  `).all(range.start, range.end);

  const avgDuration = checkouts.length > 0
    ? Math.round(checkouts.reduce((sum, c) => sum + c.duration_minutes, 0) / checkouts.length)
    : 0;

  const totalMinutes = checkouts.reduce((sum, c) => sum + c.duration_minutes, 0);

  const utilizationRate = totalSeats > 0
    ? Math.round((totalMinutes / (totalSeats * dayCount * 24 * 60)) * 10000) / 100
    : 0;

  const abnormalCount = db.prepare(`
    SELECT COUNT(*) as count FROM check_outs
    WHERE check_out_time >= ? AND check_out_time <= ?
    AND is_abnormal = 1
  `).get(range.start, range.end).count;

  const tempOccupationCount = db.prepare(`
    SELECT COUNT(*) as count FROM temp_occupations
    WHERE start_time >= ? AND start_time <= ?
  `).get(range.start, range.end).count;

  const avgDailyVisitors = Math.round(totalCheckIns / dayCount);

  return {
    dateRange: { start: range.startDate.format('YYYY-MM-DD'), end: range.endDate.format('YYYY-MM-DD') },
    dayCount,
    totalSeats,
    totalCheckIns,
    totalReservations,
    avgDuration,
    avgDailyVisitors,
    utilizationRate,
    abnormalCount,
    tempOccupationCount
  };
}

function getWeeklyStats(startDate, endDate) {
  const range = getDateRange(startDate, endDate);

  const weeklyData = db.prepare(`
    SELECT 
      strftime('%Y-W%W', check_in_time) as week,
      MIN(date(check_in_time)) as week_start,
      COUNT(*) as check_in_count
    FROM check_ins
    WHERE check_in_time >= ? AND check_in_time <= ?
    GROUP BY strftime('%Y-W%W', check_in_time)
    ORDER BY week
  `).all(range.start, range.end);

  return weeklyData.map(w => ({
    week: w.week,
    weekStart: w.week_start,
    checkInCount: w.check_in_count
  }));
}

module.exports = {
  getDateRange,
  getDailyStats,
  getPeakHours,
  getAreaStats,
  getSeatTypeStats,
  getSummary,
  getWeeklyStats
};
