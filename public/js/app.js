const API_BASE = '/api';
let charts = {};
let currentCheckinPage = 1;
const pageSize = 20;

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function setQuickRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  document.getElementById('startDate').value = formatDate(start);
  document.getElementById('endDate').value = formatDate(end);
  loadData();
}

function getDateRange() {
  return {
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value
  };
}

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function initDateInputs() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  document.getElementById('startDate').value = formatDate(start);
  document.getElementById('endDate').value = formatDate(end);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  if (tabName === 'records') {
    loadCheckins();
  } else if (tabName === 'operations') {
    loadSeats();
    loadActiveCheckins();
  }
}

function switchRecordTab(tabName) {
  document.querySelectorAll('.record-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.record === tabName);
  });
  document.querySelectorAll('.record-content').forEach(content => {
    content.classList.toggle('active', content.id === `record-${tabName}`);
  });

  if (tabName === 'checkins') loadCheckins();
  else if (tabName === 'abnormal') loadAbnormals();
  else if (tabName === 'tempOcc') loadTempOcc();
  else if (tabName === 'corrections') loadCorrections();
  else if (tabName === 'reservations') loadReservations();
}

async function loadData() {
  const { startDate, endDate } = getDateRange();
  const params = new URLSearchParams({ startDate, endDate });

  try {
    const data = await fetchJSON(`${API_BASE}/analytics/full?${params}`);

    updateSummary(data.summary);
    updateDailyTrendChart(data.daily);
    updatePeakHoursChart(data.peakHours);
    updateAreaPieChart(data.byArea);
    updateSeatTypeChart(data.bySeatType);
    updateAreaUtilChart(data.byArea);
    updateTrendDetailChart(data.daily);
    updateWeeklyChart(data.weekly);
    updateAreaTable(data.byArea);
    updateSeatTypeTable(data.bySeatType);
    updatePeakHeatmap(data.peakHours);
    updateAreaBreakdownChart(data.byArea);
    updateSeatTypeBreakdownChart(data.bySeatType);
  } catch (err) {
    showToast('数据加载失败', 'error');
    console.error(err);
  }
}

function updateSummary(summary) {
  document.getElementById('totalCheckIns').textContent = summary.totalCheckIns.toLocaleString();
  document.getElementById('avgDailyVisitors').textContent = summary.avgDailyVisitors.toLocaleString();
  document.getElementById('avgDuration').textContent = summary.avgDuration.toLocaleString();
  document.getElementById('utilizationRate').textContent = summary.utilizationRate + '%';
  document.getElementById('totalReservations').textContent = summary.totalReservations.toLocaleString();
  document.getElementById('abnormalCount').textContent = summary.abnormalCount.toLocaleString();
}

function updateDailyTrendChart(dailyData) {
  const ctx = document.getElementById('dailyTrendChart');
  if (!ctx) return;

  if (charts.dailyTrend) charts.dailyTrend.destroy();

  charts.dailyTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dailyData.map(d => d.date.slice(5)),
      datasets: [
        {
          label: '客流人次',
          data: dailyData.map(d => d.checkInCount),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          fill: true,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: '使用率(%)',
          data: dailyData.map(d => d.utilizationRate),
          borderColor: '#52c41a',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { type: 'linear', position: 'left', title: { display: true, text: '人次' } },
        y1: { type: 'linear', position: 'right', title: { display: true, text: '使用率(%)' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function updatePeakHoursChart(peakData) {
  const ctx = document.getElementById('peakHoursChart');
  if (!ctx) return;

  if (charts.peakHours) charts.peakHours.destroy();

  charts.peakHours = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: peakData.hourlyData.map(d => d.hour),
      datasets: [{
        label: '签到人次',
        data: peakData.hourlyData.map(d => d.count),
        backgroundColor: peakData.hourlyData.map(d =>
          d.hour === peakData.peakHour ? '#667eea' : 'rgba(102, 126, 234, 0.5)'
        ),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function updateAreaPieChart(areaData) {
  const ctx = document.getElementById('areaPieChart');
  if (!ctx) return;

  if (charts.areaPie) charts.areaPie.destroy();

  const colors = ['#667eea', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];

  charts.areaPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: areaData.map(function(d) { return d.areaName; }),
      datasets: [{
        data: areaData.map(function(d) { return d.checkInCount; }),
        backgroundColor: colors.slice(0, areaData.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: function(ctxItem) {
              return ctxItem.label + ': ' + ctxItem.parsed + ' 人次';
            }
          }
        }
      }
    }
  });
}

function updateSeatTypeChart(typeData) {
  const ctx = document.getElementById('seatTypeChart');
  if (!ctx) return;

  if (charts.seatType) charts.seatType.destroy();

  const colors = ['#667eea', '#52c41a', '#faad14', '#ff4d4f'];

  charts.seatType = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: typeData.map(d => d.seatType),
      datasets: [
        {
          label: '客流人次',
          data: typeData.map(d => d.checkInCount),
          backgroundColor: colors[0],
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          label: '使用率(%)',
          data: typeData.map(d => d.utilizationRate),
          backgroundColor: colors[1],
          borderRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: '人次' } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: '使用率(%)' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function updateAreaUtilChart(areaData) {
  const ctx = document.getElementById('areaUtilChart');
  if (!ctx) return;

  if (charts.areaUtil) charts.areaUtil.destroy();

  const sorted = [...areaData].sort((a, b) => b.utilizationRate - a.utilizationRate);
  const colors = ['#667eea', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];

  charts.areaUtil = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.areaName),
      datasets: [{
        label: '使用率(%)',
        data: sorted.map(d => d.utilizationRate),
        backgroundColor: sorted.map((_, i) => colors[i % colors.length]),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, title: { display: true, text: '使用率(%)' } } }
    }
  });
}

function updateTrendDetailChart(dailyData) {
  const ctx = document.getElementById('trendDetailChart');
  if (!ctx) return;

  if (charts.trendDetail) charts.trendDetail.destroy();

  charts.trendDetail = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dailyData.map(d => d.date.slice(5)),
      datasets: [
        {
          label: '客流人次',
          data: dailyData.map(d => d.checkInCount),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: '预约数',
          data: dailyData.map(d => d.reservationsCount),
          borderColor: '#52c41a',
          backgroundColor: 'rgba(82, 196, 26, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: '平均时长(分)',
          data: dailyData.map(d => d.avgDuration),
          borderColor: '#faad14',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: '数量' } },
        y1: { type: 'linear', position: 'right', title: { display: true, text: '分钟' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function updateWeeklyChart(weeklyData) {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;

  if (charts.weekly) charts.weekly.destroy();

  charts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeklyData.map(d => d.week),
      datasets: [{
        label: '周客流',
        data: weeklyData.map(d => d.checkInCount),
        backgroundColor: '#764ba2',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: '人次' } } }
    }
  });
}

function updatePeakHeatmap(peakData) {
  const container = document.getElementById('peakHeatmap');
  if (!container) return;

  const maxCount = Math.max(...peakData.hourlyData.map(d => d.count), 1);

  const hours = peakData.hourlyData.filter(d => d.hourNum >= 6 && d.hourNum <= 23);
  const colors = hours.map(d => {
    const ratio = d.count / maxCount;
    if (ratio < 0.25) return '#e6f7ff';
    if (ratio < 0.5) return '#91d5ff';
    if (ratio < 0.75) return '#40a9ff';
    return '#1890ff';
  });

  container.innerHTML = `
    <div class="heatmap-row">
      <div class="heatmap-label">客流</div>
      ${hours.map((d, i) => `<div class="heatmap-cell" style="background:${colors[i]}" data-count="${d.hour}: ${d.count}人"></div>`).join('')}
    </div>
    <div class="heatmap-row">
      <div class="heatmap-label">时段</div>
      ${hours.map(d => `<div class="heatmap-cell" style="background:transparent;color:#888;font-size:10px;display:flex;align-items:center;justify-content:center;">${d.hour.slice(0,2)}</div>`).join('')}
    </div>
  `;
}

function updateAreaTable(areaData) {
  const tbody = document.querySelector('#areaTable tbody');
  if (!tbody) return;

  tbody.innerHTML = areaData.map(d => `
    <tr>
      <td>${d.areaName}</td>
      <td>${d.seatCount}</td>
      <td>${d.checkInCount}</td>
      <td>${d.utilizationRate}%</td>
      <td>${Math.floor(d.totalMinutes / 60)}小时${d.totalMinutes % 60}分</td>
    </tr>
  `).join('');
}

function updateSeatTypeTable(typeData) {
  const tbody = document.querySelector('#seatTypeTable tbody');
  if (!tbody) return;

  const typeNames = { standard: '标准座', premium: '豪华座', single: '单人座', double: '双人座' };

  tbody.innerHTML = typeData.map(d => `
    <tr>
      <td>${typeNames[d.seatType] || d.seatType}</td>
      <td>${d.seatCount}</td>
      <td>${d.checkInCount}</td>
      <td>${d.utilizationRate}%</td>
      <td>${Math.floor(d.totalMinutes / 60)}小时${d.totalMinutes % 60}分</td>
    </tr>
  `).join('');
}

function updateAreaBreakdownChart(areaData) {
  const ctx = document.getElementById('areaBreakdownChart');
  if (!ctx) return;

  if (charts.areaBreakdown) charts.areaBreakdown.destroy();

  const colors = ['#667eea', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];
  const total = areaData.reduce(function(s, d) { return s + d.checkInCount; }, 0);

  charts.areaBreakdown = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: areaData.map(function(d) { return d.areaName; }),
      datasets: [{
        data: areaData.map(function(d) { return d.checkInCount; }),
        backgroundColor: colors.slice(0, areaData.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ctx.label + ': ' + ctx.parsed + ' 人次 (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

function updateSeatTypeBreakdownChart(typeData) {
  const ctx = document.getElementById('seatTypeBreakdownChart');
  if (!ctx) return;

  if (charts.seatTypeBreakdown) charts.seatTypeBreakdown.destroy();

  const typeNames = { standard: '标准座', premium: '豪华座', single: '单人座', double: '双人座' };
  const colors = ['#667eea', '#52c41a', '#faad14', '#ff4d4f'];
  const total = typeData.reduce(function(s, d) { return s + d.checkInCount; }, 0);

  charts.seatTypeBreakdown = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: typeData.map(function(d) { return typeNames[d.seatType] || d.seatType; }),
      datasets: [{
        data: typeData.map(function(d) { return d.checkInCount; }),
        backgroundColor: colors.slice(0, typeData.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ctx.label + ': ' + ctx.parsed + ' 人次 (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

async function loadCheckins() {
  const { startDate, endDate } = getDateRange();
  const params = new URLSearchParams({ startDate, endDate, page: currentCheckinPage, pageSize });

  try {
    const data = await fetchJSON(`${API_BASE}/check-ins?${params}`);
    const tbody = document.getElementById('checkinTableBody');
    tbody.innerHTML = data.list.map(item => `
      <tr>
        <td>${item.seat_code}</td>
        <td>${item.area_name}</td>
        <td>${item.customer_name || '-'}</td>
        <td>${formatDateTime(item.check_in_time)}</td>
        <td>${item.has_checked_out ? formatDateTime(item.check_out_time) : '<span style="color:#52c41a;">使用中</span>'}</td>
        <td>${item.has_checked_out ? item.duration_minutes : '-'}</td>
        <td>${item.source === 'reservation' ? '预约' : '散客'}</td>
        <td>${item.is_abnormal ? '<span style="color:#ff4d4f;">异常</span>' : '<span style="color:#52c41a;">正常</span>'}</td>
      </tr>
    `).join('');

    const totalPages = Math.ceil(data.total / data.pageSize);
    const pagination = document.getElementById('checkinPagination');
    let html = `<button onclick="changePage(${currentCheckinPage - 1})" ${currentCheckinPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    for (let i = 1; i <= totalPages && i <= 10; i++) {
      html += `<button class="${i === currentCheckinPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }
    html += `<button onclick="changePage(${currentCheckinPage + 1})" ${currentCheckinPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    pagination.innerHTML = html;
  } catch (err) {
    console.error(err);
  }
}

function changePage(page) {
  currentCheckinPage = page;
  loadCheckins();
}

async function loadAbnormals() {
  const { startDate, endDate } = getDateRange();
  const params = new URLSearchParams({ startDate, endDate });

  try {
    const data = await fetchJSON(`${API_BASE}/abnormal-checkouts?${params}`);
    const tbody = document.getElementById('abnormalTableBody');
    tbody.innerHTML = data.map(item => `
      <tr>
        <td>${item.seat_code}</td>
        <td>${item.area_name}</td>
        <td>${item.customer_name || '-'}</td>
        <td>${formatDateTime(item.check_in_time)}</td>
        <td>${formatDateTime(item.check_out_time)}</td>
        <td>${item.duration_minutes}</td>
        <td style="color:#ff4d4f;">${item.abnormal_reason || '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadTempOcc() {
  try {
    const data = await fetchJSON(`${API_BASE}/temp-occupations`);
    const tbody = document.getElementById('tempOccTableBody');
    tbody.innerHTML = data.map(item => `
      <tr>
        <td>${item.seat_code}</td>
        <td>${item.area_name}</td>
        <td>${item.customer_name || '-'}</td>
        <td>${formatDateTime(item.start_time)}</td>
        <td>${item.end_time ? formatDateTime(item.end_time) : '-'}</td>
        <td>${item.status === 'active' ? '<span style="color:#52c41a;">进行中</span>' : '已结束'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadCorrections() {
  try {
    const data = await fetchJSON(`${API_BASE}/data-corrections`);
    const tbody = document.getElementById('correctionsTableBody');

    const typeNames = {
      'add_usage_record': '补录记录',
      'check_in_time': '修正签到',
      'check_out_time': '修正离场'
    };

    tbody.innerHTML = data.map(item => `
      <tr>
        <td>${typeNames[item.correction_type] || item.correction_type}</td>
        <td>${item.target_id || '-'}</td>
        <td>${JSON.stringify(item.original_data)}</td>
        <td>${JSON.stringify(item.corrected_data)}</td>
        <td>${item.reason || '-'}</td>
        <td>${item.operator || '-'}</td>
        <td>${formatDateTime(item.created_at)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

const reservationStatusMap = {
  reserved: { text: '已预约', color: '#1890ff' },
  completed: { text: '已完成', color: '#52c41a' },
  cancelled: { text: '已取消', color: '#ff4d4f' },
  expired: { text: '已过期', color: '#faad14' }
};

async function loadReservations() {
  try {
    const data = await fetchJSON(`${API_BASE}/reservations`);
    const tbody = document.getElementById('reservationTableBody');
    tbody.innerHTML = data.map(item => {
      const status = reservationStatusMap[item.status] || { text: item.status, color: '#999' };
      return `
      <tr>
        <td>${item.seat_code}</td>
        <td>${item.area_name}</td>
        <td>${item.customer_name || '-'}</td>
        <td>${formatDateTime(item.reserve_start)}</td>
        <td>${formatDateTime(item.reserve_end)}</td>
        <td><span style="color:${status.color};">${status.text}</span></td>
      </tr>
    `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadSeats() {
  try {
    const seats = await fetchJSON(`${API_BASE}/seats`);
    const selects = ['checkinSeat', 'tempOccSeat', 'reservationSeat', 'correctionSeat'];
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (sel) {
        sel.innerHTML = seats.map(s => `<option value="${s.id}">${s.seat_code} - ${s.area_name}</option>`).join('');
      }
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadActiveCheckins() {
  try {
    const { startDate, endDate } = getDateRange();
    const params = new URLSearchParams({ startDate, endDate, page: 1, pageSize: 100 });
    const data = await fetchJSON(`${API_BASE}/check-ins?${params}`);
    const active = data.list.filter(item => !item.has_checked_out);
    const sel = document.getElementById('checkoutRecord');
    if (sel) {
      sel.innerHTML = active.map(item =>
        `<option value="${item.id}">${item.seat_code} - ${item.customer_name || '匿名'} - ${formatDateTime(item.check_in_time)}</option>`
      ).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function doCheckIn() {
  const seat_id = document.getElementById('checkinSeat').value;
  const customer_name = document.getElementById('checkinName').value;
  const customer_phone = document.getElementById('checkinPhone').value;
  const source = document.getElementById('checkinSource').value;

  try {
    const res = await fetch(`${API_BASE}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat_id, customer_name, customer_phone, source })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('签到成功', 'success');
      loadData();
      loadActiveCheckins();
    } else {
      showToast(data.error || '签到失败', 'error');
    }
  } catch (err) {
    showToast('签到失败', 'error');
  }
}

async function doCheckOut() {
  const check_in_id = document.getElementById('checkoutRecord').value;
  const is_abnormal = document.getElementById('isAbnormal').checked;
  const abnormal_reason = document.getElementById('abnormalReason').value;

  if (!check_in_id) {
    showToast('请选择签到记录', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_in_id, is_abnormal, abnormal_reason })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('离场登记成功', 'success');
      loadData();
      loadActiveCheckins();
    } else {
      showToast(data.error || '离场失败', 'error');
    }
  } catch (err) {
    showToast('离场失败', 'error');
  }
}

async function startTempOcc() {
  const seat_id = document.getElementById('tempOccSeat').value;
  const customer_name = document.getElementById('tempOccName').value;

  try {
    const res = await fetch(`${API_BASE}/temp-occupation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat_id, customer_name })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('临时占座已开始', 'success');
      loadData();
    } else {
      showToast(data.error || '操作失败', 'error');
    }
  } catch (err) {
    showToast('操作失败', 'error');
  }
}

async function endTempOcc() {
  try {
    const tempOccs = await fetchJSON(`${API_BASE}/temp-occupations?status=active`);
    if (tempOccs.length === 0) {
      showToast('没有进行中的临时占座', 'warning');
      return;
    }
    const id = tempOccs[0].id;
    const res = await fetch(`${API_BASE}/temp-occupation/${id}/end`, { method: 'POST' });
    if (res.ok) {
      showToast('临时占座已结束', 'success');
      loadData();
    } else {
      showToast('操作失败', 'error');
    }
  } catch (err) {
    showToast('操作失败', 'error');
  }
}

async function createReservation() {
  const seat_id = document.getElementById('reservationSeat').value;
  const customer_name = document.getElementById('reservationName').value;
  const reserve_start = document.getElementById('reservationStart').value;
  const reserve_end = document.getElementById('reservationEnd').value;

  if (!reserve_start || !reserve_end) {
    showToast('请填写预约时间', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seat_id,
        customer_name,
        reserve_start: reserve_start.replace('T', ' ') + ':00',
        reserve_end: reserve_end.replace('T', ' ') + ':00'
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('预约创建成功', 'success');
      loadData();
    } else {
      showToast(data.error || '创建失败', 'error');
    }
  } catch (err) {
    showToast('创建失败', 'error');
  }
}

function onCorrectionTypeChange() {
  const type = document.getElementById('correctionType').value;
  document.getElementById('addRecordForm').style.display = type === 'add_usage_record' ? 'grid' : 'none';
  document.getElementById('timeCorrectForm').style.display = (type === 'check_in_time' || type === 'check_out_time') ? 'grid' : 'none';
}

async function submitCorrection() {
  const correction_type = document.getElementById('correctionType').value;
  const operator = document.getElementById('correctionOperator').value;
  const reason = document.getElementById('correctionReason').value;

  let body = { correction_type, operator, reason };

  if (correction_type === 'add_usage_record') {
    const seat_id = document.getElementById('correctionSeat').value;
    const customer_name = document.getElementById('correctionName').value;
    const check_in_time = document.getElementById('correctionCheckIn').value;
    const check_out_time = document.getElementById('correctionCheckOut').value;

    if (!check_in_time || !check_out_time) {
      showToast('请填写签到和离场时间', 'warning');
      return;
    }

    body.corrected_data = {
      seat_id: parseInt(seat_id),
      customer_name,
      check_in_time: check_in_time.replace('T', ' ') + ':00',
      check_out_time: check_out_time.replace('T', ' ') + ':00'
    };
  } else {
    const target_id = document.getElementById('correctionTargetId').value;
    const time = document.getElementById('correctionTime').value;

    if (!target_id || !time) {
      showToast('请填写记录ID和修正时间', 'warning');
      return;
    }

    body.target_id = parseInt(target_id);
    body.corrected_data = {};
    body.corrected_data[correction_type === 'check_in_time' ? 'check_in_time' : 'check_out_time'] = time.replace('T', ' ') + ':00';
  }

  try {
    const res = await fetch(`${API_BASE}/data-correction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      showToast('数据补录成功', 'success');
      loadData();
    } else {
      showToast(data.error || '操作失败', 'error');
    }
  } catch (err) {
    showToast('操作失败', 'error');
  }
}

async function exportReport() {
  const { startDate, endDate } = getDateRange();
  const url = `${API_BASE}/report/export?startDate=${startDate}&endDate=${endDate}&format=csv`;
  window.open(url, '_blank');
}

document.getElementById('isAbnormal').addEventListener('change', function() {
  document.getElementById('abnormalReasonGroup').style.display = this.checked ? 'block' : 'none';
});

document.addEventListener('DOMContentLoaded', () => {
  initDateInputs();
  loadData();
});
