const db = require('./db');
const dayjs = require('dayjs');

function seed() {
  console.log('开始生成模拟数据...');

  db.exec('DELETE FROM data_corrections');
  db.exec('DELETE FROM temp_occupations');
  db.exec('DELETE FROM check_outs');
  db.exec('DELETE FROM check_ins');
  db.exec('DELETE FROM reservations');
  db.exec('DELETE FROM seats');
  db.exec('DELETE FROM areas');

  const areas = [
    { name: '静音区A', description: '单人独立空间，极致安静' },
    { name: '静音区B', description: '双人座位，适合讨论' },
    { name: '沉浸区', description: '沉浸式学习舱位' },
    { name: '休闲区', description: '沙发座位，轻松氛围' }
  ];

  const areaIds = [];
  const insertArea = db.prepare('INSERT INTO areas (name, description) VALUES (?, ?)');
  areas.forEach(area => {
    const result = insertArea.run(area.name, area.description);
    areaIds.push(result.lastInsertRowid);
  });

  const seatTypes = ['standard', 'premium', 'single', 'double'];
  const insertSeat = db.prepare('INSERT INTO seats (seat_code, area_id, seat_type) VALUES (?, ?, ?)');

  let seatId = 1;
  for (let a = 0; a < areaIds.length; a++) {
    const seatCount = a < 2 ? 20 : 15;
    for (let i = 1; i <= seatCount; i++) {
      const code = `${String.fromCharCode(65 + a)}${String(i).padStart(2, '0')}`;
      const type = seatTypes[(a + i) % seatTypes.length];
      insertSeat.run(code, areaIds[a], type);
      seatId++;
    }
  }

  const totalSeats = seatId - 1;
  console.log(`已生成 ${totalSeats} 个座位`);

  const today = dayjs().startOf('day');
  const startDate = today.subtract(30, 'day');

  const checkInStmt = db.prepare(`
    INSERT INTO check_ins (seat_id, customer_name, customer_phone, check_in_time, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  const checkOutStmt = db.prepare(`
    INSERT INTO check_outs (check_in_id, seat_id, check_out_time, duration_minutes, is_abnormal, abnormal_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const reservationStmt = db.prepare(`
    INSERT INTO reservations (seat_id, customer_name, customer_phone, reserve_start, reserve_end, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let checkInCount = 0;
  let checkOutCount = 0;
  let reservationCount = 0;

  const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十', '郑一', '冯二', '陈三', '楚四'];

  let current = startDate;
  while (current.isBefore(today) || current.isSame(today, 'day')) {
    const dayOfWeek = current.day();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseCount = isWeekend ? 60 : 40;
    const dailyCount = baseCount + Math.floor(Math.random() * 20);

    for (let i = 0; i < dailyCount; i++) {
      const seat_id = Math.floor(Math.random() * totalSeats) + 1;
      const name = names[Math.floor(Math.random() * names.length)];
      const phone = `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;

      const hour = 7 + Math.floor(Math.random() * 14);
      const minute = Math.floor(Math.random() * 60);
      const checkInTime = current.hour(hour).minute(minute).second(0);

      const duration = 60 + Math.floor(Math.random() * 300);
      const checkOutTime = checkInTime.add(duration, 'minute');

      const source = Math.random() > 0.4 ? 'reservation' : 'walk_in';

      if (source === 'reservation') {
        const reserveStart = checkInTime.subtract(10 + Math.floor(Math.random() * 50), 'minute');
        const reserveEnd = checkOutTime.add(10 + Math.floor(Math.random() * 20), 'minute');
        reservationStmt.run(seat_id, name, phone, reserveStart.format('YYYY-MM-DD HH:mm:ss'), reserveEnd.format('YYYY-MM-DD HH:mm:ss'), 'completed');
        reservationCount++;
      }

      const ciResult = checkInStmt.run(seat_id, name, phone, checkInTime.format('YYYY-MM-DD HH:mm:ss'), source);
      checkInCount++;

      const isAbnormal = Math.random() < 0.05;
      const abnormalReason = isAbnormal ? (Math.random() > 0.5 ? '设备故障' : '临时有事') : '';

      const finalDuration = isAbnormal ? Math.floor(duration * 0.3) : duration;
      const finalCheckOut = checkInTime.add(finalDuration, 'minute');

      checkOutStmt.run(
        ciResult.lastInsertRowid,
        seat_id,
        finalCheckOut.format('YYYY-MM-DD HH:mm:ss'),
        finalDuration,
        isAbnormal ? 1 : 0,
        abnormalReason
      );
      checkOutCount++;
    }

    current = current.add(1, 'day');
  }

  const tempOccStmt = db.prepare(`
    INSERT INTO temp_occupations (seat_id, start_time, end_time, customer_name, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < 15; i++) {
    const seat_id = Math.floor(Math.random() * totalSeats) + 1;
    const daysAgo = Math.floor(Math.random() * 20);
    const start = today.subtract(daysAgo, 'day').hour(10 + Math.floor(Math.random() * 6)).minute(Math.floor(Math.random() * 60));
    const end = start.add(15 + Math.floor(Math.random() * 30), 'minute');

    tempOccStmt.run(
      seat_id,
      start.format('YYYY-MM-DD HH:mm:ss'),
      end.format('YYYY-MM-DD HH:mm:ss'),
      names[Math.floor(Math.random() * names.length)],
      'ended'
    );
  }

  const activeTempSeat = Math.floor(Math.random() * totalSeats) + 1;
  tempOccStmt.run(
    activeTempSeat,
    today.hour(14).minute(30).format('YYYY-MM-DD HH:mm:ss'),
    null,
    '临时用户',
    'active'
  );

  console.log(`已生成 ${checkInCount} 条签到记录`);
  console.log(`已生成 ${checkOutCount} 条离场记录`);
  console.log(`已生成 ${reservationCount} 条预约记录`);
  console.log('数据生成完成！');
}

seed();
