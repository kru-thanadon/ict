// ========================================================================== 
// External Website Calendar JS Engine (GAS Backend + Optimistic Cache Engine)
// With Detailed Performance & Step Tracking Logs
// ==========================================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbw5ufgADxQXqvm40HfAmKfoE4d5S1DvddgZ5ZgXIQwGYhFng5iKz3Ykhuvps6c1Kygt/exec';
const CACHE_KEY = 'gas_calendar_events_cache';

let currentDate = new Date();
let currentView = 'month';
let events = [];
let filteredEvents = [];
let isAdmin = false;
let adminPassword = '';
let selectedEvent = null;

let startPicker = null;
let endPicker = null;
let selectedFile = null;
let deleteExistingAttachment = false;

document.addEventListener('DOMContentLoaded', function () {
  console.log(`[${new Date().toLocaleTimeString()}] 🚀 [App Init] DOM Content Loaded -> Starting Application...`);
  initApp();
  if (typeof initTheme === 'function') initTheme();
});

function initApp() {
  console.time('⏱️ App Initialization Time');
  
  const flatpickrConfig = {
    enableTime: true,
    dateFormat: "Y-m-d H:i:S",
    altInput: true,
    altInputClass: "form-control",
    locale: "th",
    time_24hr: true,
    formatDate: function (date) {
      const day = date.getDate();
      const month = THAI_MONTHS_FULL[date.getMonth()];
      const year = date.getFullYear() + 543;
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return day + ' ' + month + ' ' + year + ' เวลา ' + hours + ':' + minutes + ' น.';
    }
  };

  console.log(`[${new Date().toLocaleTimeString()}] ⚙️ [Init Step 1/4] Binding Flatpickr date pickers...`);
  startPicker = flatpickr("#form-start-input", flatpickrConfig);
  endPicker = flatpickr("#form-end-input", flatpickrConfig);

  console.log(`[${new Date().toLocaleTimeString()}] 🔑 [Init Step 2/4] Checking saved admin session...`);
  const savedPwd = localStorage.getItem('gas_calendar_admin_pwd') || '';
  if (savedPwd) setAdminState(true, savedPwd);

  // ⚡ 1. อ่าน Cache ขึ้นมาแสดงผลบน UI ทันที (Instant Load)
  console.log(`[${new Date().toLocaleTimeString()}] ⚡ [Init Step 3/4] Triggering Instant Cache Load...`);
  loadFromCache();

  // 📡 2. ยิง Silent Fetch ไปเทียบข้อมูลกับ GAS เบื้องหลัง
  console.log(`[${new Date().toLocaleTimeString()}] 📡 [Init Step 4/4] Triggering Background Server Sync...`);
  syncWithServer();

  setupDragAndDrop();
  console.timeEnd('⏱️ App Initialization Time');
}

/**
 * ⚡ ดึงข้อมูลจาก LocalStorage แสดงผลบนหน้าเว็บทันที
 */
function loadFromCache() {
  console.time('⚡ Cache Load Time');
  const cachedRaw = localStorage.getItem(CACHE_KEY);
  if (cachedRaw) {
    try {
      events = JSON.parse(cachedRaw);
      console.log(`[${new Date().toLocaleTimeString()}] 📦 [Cache] Loaded ${events.length} events from LocalStorage.`);
      filterEvents();
    } catch (e) {
      console.error(`[${new Date().toLocaleTimeString()}] ⚠️ [Cache Corrupt] Failed to parse cached data:`, e);
    }
  } else {
    console.log(`[${new Date().toLocaleTimeString()}] ℹ️ [Cache] No existing cache found in LocalStorage.`);
  }
  console.timeEnd('⚡ Cache Load Time');
}

/**
 * 💾 บันทึกสเตทปัจจุบันลง Cache พร้อม Re-render หน้าเว็บ
 */
function updateCacheAndRender(newEvents) {
  console.time('💾 Local Cache & UI Render Time');
  events = newEvents;
  localStorage.setItem(CACHE_KEY, JSON.stringify(events));
  console.log(`[${new Date().toLocaleTimeString()}] 💾 [Cache Saved] Updated ${events.length} events to LocalStorage.`);
  filterEvents();
  console.timeEnd('💾 Local Cache & UI Render Time');
}

/**
 * 📡 Silent Fetch: ดึงข้อมูลสดจาก GAS แล้ว Compare เพื่ออัปเดตเฉพาะส่วนที่ต่าง
 */
function syncWithServer() {
  const syncStartTime = performance.now();
  console.log(`[${new Date().toLocaleTimeString()}] 📡 [Sync Start] Sending HTTP GET to GAS Backend...`);

  fetch(`${API_URL}?action=getEvents`)
    .then(res => {
      console.log(`[${new Date().toLocaleTimeString()}] 📥 [Sync Response] Raw HTTP response received. Status: ${res.status}`);
      return res.text();
    })
    .then(text => {
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        console.warn(`[${new Date().toLocaleTimeString()}] ⚠️ [Sync Warning] Response is not valid JSON. Content:`, text);
        return;
      }
      
      const result = JSON.parse(text);
      const syncEndTime = performance.now();
      console.log(`[${new Date().toLocaleTimeString()}] ⏱️ [Sync Duration] Server responded in ${(syncEndTime - syncStartTime).toFixed(2)} ms`);

      if (result.status === 'success' && Array.isArray(result.data)) {
        const serverEvents = result.data;
        const currentCacheRaw = localStorage.getItem(CACHE_KEY) || '[]';
        const serverRaw = JSON.stringify(serverEvents);

        if (currentCacheRaw !== serverRaw) {
          console.log(`[${new Date().toLocaleTimeString()}] 🔄 [Sync Diff] Data mismatch detected! Updating local cache with ${serverEvents.length} items from server.`);
          updateCacheAndRender(serverEvents);
        } else {
          console.log(`[${new Date().toLocaleTimeString()}] ✅ [Sync In Sync] Local cache is up-to-date with server. No UI re-render required.`);
        }
      } else {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ [Sync Error] API status failed:`, result.message);
      }
    })
    .catch(err => console.error(`[${new Date().toLocaleTimeString()}] 🚨 [Sync Failed] Background network error:`, err));
}

// ==========================================================================
// 🚀 Optimistic CRUD Actions
// ==========================================================================

function handleFormSubmit(e) {
  e.preventDefault();
  const actionType = document.getElementById('form-event-id').value ? 'UPDATE' : 'CREATE';
  console.log(`[${new Date().toLocaleTimeString()}] 📝 [Form Submit] Executing ${actionType} Event Action...`);
  console.time('🚀 Total Optimistic Submit Processing Time');

  const categoryCbs = document.querySelectorAll('.form-category-checkbox');
  const checkedCategories = [];
  categoryCbs.forEach(cb => { if (cb.checked) checkedCategories.push(cb.value); });

  if (checkedCategories.length === 0) {
    console.warn(`[${new Date().toLocaleTimeString()}] ⚠️ [Validation Failed] No category selected.`);
    showToast('กรุณาเลือกประเภทหมวดหมู่บริการอย่างน้อย 1 ประเภท', 'error');
    return;
  }

  const startDateObj = startPicker.selectedDates[0];
  const endDateObj = endPicker.selectedDates[0];

  if (!startDateObj || !endDateObj || endDateObj <= startDateObj) {
    console.warn(`[${new Date().toLocaleTimeString()}] ⚠️ [Validation Failed] Invalid date range.`);
    showToast('ช่วงเวลาไม่ถูกต้อง', 'error');
    return;
  }

  const eventId = document.getElementById('form-event-id').value;
  const tempId = 'TEMP-' + Date.now();
  const eventData = {
    ID: eventId || tempId,
    Title: document.getElementById('form-title-input').value.trim(),
    'Start Date': formatToSheetDate(startDateObj),
    'End Date': formatToSheetDate(endDateObj),
    Categories: checkedCategories.join(', '),
    Description: document.getElementById('form-desc-input').value.trim(),
    Coordinator: document.getElementById('form-coordinator-input') ? document.getElementById('form-coordinator-input').value.trim() : '',
    President: document.getElementById('form-president-input') ? document.getElementById('form-president-input').value.trim() : '',
    Timestamp: formatToSheetDate(new Date())
  };

  closeFormModal();

  // 1. ⚡ Optimistic UI Update ( Render ทันที 0ms )
  console.log(`[${new Date().toLocaleTimeString()}] ⚡ [Optimistic UI] Updating UI locally with ID: ${eventData.ID}...`);
  let updatedEvents = [...events];
  if (eventId) {
    updatedEvents = updatedEvents.map(evt => evt.ID === eventId ? { ...evt, ...eventData } : evt);
  } else {
    updatedEvents.push(eventData);
  }
  updateCacheAndRender(updatedEvents);
  showToast(eventId ? 'แก้ไขข้อมูลเรียบร้อยแล้ว' : 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
  console.timeEnd('🚀 Total Optimistic Submit Processing Time');

  // 2. 📡 Background Network Call
  console.log(`[${new Date().toLocaleTimeString()}] 📡 [Background POST] Sending payload to GAS Backend...`);
  const apiStartTime = performance.now();

  const requestBody = {
    action: eventId ? 'updateEvent' : 'addEvent',
    eventData: {
      id: eventId,
      title: eventData.Title,
      startDate: eventData['Start Date'],
      endDate: eventData['End Date'],
      categories: eventData.Categories,
      description: eventData.Description,
      coordinator: eventData.Coordinator,
      president: eventData.President,
      deleteExistingAttachment: deleteExistingAttachment
    },
    fileData: selectedFile || null
  };

  if (eventId) requestBody.adminPassword = adminPassword;

  fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(requestBody)
  })
    .then(res => res.json())
    .then(result => {
      const apiEndTime = performance.now();
      console.log(`[${new Date().toLocaleTimeString()}] ⏱️ [GAS POST Complete] Background operation finished in ${(apiEndTime - apiStartTime).toFixed(2)} ms`);
      
      if (result.status === 'success') {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ [GAS Success] Event saved to Sheet successfully. Syncing server state...`);
        syncWithServer();
      } else {
        throw new Error(result.message);
      }
    })
    .catch(err => {
      console.error(`[${new Date().toLocaleTimeString()}] 🚨 [GAS Failure] Failed to save to Sheet:`, err.message);
      showToast('เกิดข้อผิดพลาดในการบันทึกไปยัง Sheet: ' + err.message, 'error');
      console.log(`[${new Date().toLocaleTimeString()}] 🔄 [Rollback Sync] Fetching real server state to reconcile UI...`);
      syncWithServer();
    });
}

function triggerDeleteEvent() {
  if (!selectedEvent) return;
  if (!confirm('คุณแน่ใจว่าต้องการลบกิจกรรม "' + selectedEvent.Title + '" ใช่หรือไม่?')) return;

  const targetId = selectedEvent.ID;
  console.log(`[${new Date().toLocaleTimeString()}] 🗑️ [Delete Initiated] ID: ${targetId} ("${selectedEvent.Title}")`);
  console.time('🚀 Optimistic Delete Processing Time');

  closeDetailModal();

  // 1. ⚡ Optimistic Delete UI
  const updatedEvents = events.filter(evt => evt.ID !== targetId);
  updateCacheAndRender(updatedEvents);
  showToast('ลบรายการเรียบร้อยแล้ว', 'success');
  console.timeEnd('🚀 Optimistic Delete Processing Time');

  // 2. 📡 Background Network Delete Call
  console.log(`[${new Date().toLocaleTimeString()}] 📡 [Background POST] Requesting deletion on GAS Backend...`);
  const apiStartTime = performance.now();

  fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'deleteEvent',
      eventId: targetId,
      adminPassword: adminPassword
    })
  })
    .then(res => res.json())
    .then(result => {
      const apiEndTime = performance.now();
      console.log(`[${new Date().toLocaleTimeString()}] ⏱️ [GAS Delete Complete] Deletion finished in ${(apiEndTime - apiStartTime).toFixed(2)} ms`);

      if (result.status === 'success') {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ [GAS Success] Item removed from Sheet & Drive. Re-verifying state...`);
        syncWithServer();
      } else {
        throw new Error(result.message);
      }
    })
    .catch(err => {
      console.error(`[${new Date().toLocaleTimeString()}] 🚨 [Delete Failed] Could not delete on Sheet:`, err.message);
      showToast('ลบใน Sheet ไม่สำเร็จ: ' + err.message, 'error');
      console.log(`[${new Date().toLocaleTimeString()}] 🔄 [Rollback Sync] Restoring previous events from server...`);
      syncWithServer();
    });
}

// ==========================================================================
// Utility Helper & UI Rendering functions
// ==========================================================================

function showLoader(show, text) {
  const loader = document.getElementById('loading-overlay');
  if (!loader) return;
  const loaderText = loader.querySelector('.loading-text');
  if (show) {
    if (loaderText) loaderText.innerText = text || 'กำลังทำงาน...';
    loader.classList.add('active');
  } else {
    loader.classList.remove('active');
  }
}

function showToast(message, type = 'info') {
  console.log(`[${new Date().toLocaleTimeString()}] 🔔 [Toast Notification] (${type.toUpperCase()}): ${message}`);
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  let icon = '<i class="fa-solid fa-info-circle toast-icon"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check toast-icon"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation toast-icon"></i>';

  toast.innerHTML = icon + '\n<span class="toast-message">' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function openAdminModal() {
  document.getElementById('admin-password-input').value = '';
  document.getElementById('admin-login-error').classList.add('hidden');
  document.getElementById('admin-modal').classList.add('active');
}
function closeAdminModal() { document.getElementById('admin-modal').classList.remove('active'); }

function setAdminState(adminLogged, password) {
  isAdmin = adminLogged;
  adminPassword = password;
  console.log(`[${new Date().toLocaleTimeString()}] 🔒 [Admin Auth State] Logged in: ${isAdmin}`);
  
  const statusBadge = document.getElementById('admin-status');
  const statusText = document.getElementById('admin-status-text');
  const actionBtn = document.getElementById('admin-action-btn');

  if (adminLogged) {
    if (statusBadge) statusBadge.className = 'admin-badge admin-badge-logged';
    if (statusText) statusText.innerHTML = '<i class="fa-solid fa-shield-check"></i> โหมดผู้ดูแลระบบ (Admin)';
    if (actionBtn) {
      actionBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> ออกจากระบบ Admin';
      actionBtn.setAttribute('onclick', 'logoutAdmin()');
    }
  } else {
    if (statusBadge) statusBadge.className = 'admin-badge admin-badge-guest';
    if (statusText) statusText.innerText = 'โหมดผู้ใช้งานทั่วไป';
    if (actionBtn) {
      actionBtn.innerHTML = '<i class="fa-solid fa-lock"></i> เข้าสู่ระบบ Admin';
      actionBtn.setAttribute('onclick', 'openAdminModal()');
    }
  }
  updateAdminActionButtonsVisibility();
}

function submitAdminPassword() {
  const pwdInput = document.getElementById('admin-password-input').value;
  if (!pwdInput) return;
  localStorage.setItem('gas_calendar_admin_pwd', pwdInput);
  setAdminState(true, pwdInput);
  closeAdminModal();
  showToast('ยืนยันสิทธิ์ผู้ดูแลระบบแล้ว', 'info');
}

function logoutAdmin() {
  localStorage.removeItem('gas_calendar_admin_pwd');
  setAdminState(false, '');
  showToast('ออกจากระบบผู้ดูแลระบบแล้ว', 'info');
}

function updateAdminActionButtonsVisibility() {
  const deleteBtn = document.getElementById('admin-delete-btn');
  const editBtn = document.getElementById('admin-edit-btn');
  if (isAdmin) {
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    if (editBtn) editBtn.classList.remove('hidden');
  } else {
    if (deleteBtn) deleteBtn.classList.add('hidden');
    if (editBtn) editBtn.classList.add('hidden');
  }
}

function parseSheetDate(dateStr) {
  if (!dateStr) return null;
  let cleanStr = String(dateStr).replace(/\(.*?\)/g, '').trim();
  const autoDate = new Date(cleanStr);
  if (!isNaN(autoDate.getTime())) return autoDate;

  try {
    cleanStr = cleanStr.replace('T', ' ');
    const parts = cleanStr.split(' ');
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    let thaiMonthIndex = -1;
    for (let i = 0; i < thaiMonths.length; i++) {
      if (cleanStr.includes(thaiMonths[i])) { thaiMonthIndex = i; break; }
    }

    if (thaiMonthIndex !== -1) {
      let day = parseInt(parts[0], 10);
      let year = parseInt(parts[2], 10);
      if (year > 2500) year -= 543;
      return new Date(year, thaiMonthIndex, day, 0, 0, 0);
    }

    if (parts.length > 0) {
      const datePart = parts[0];
      const timePart = parts[1] || '00:00:00';
      const separator = datePart.includes('-') ? '-' : (datePart.includes('/') ? '/' : null);
      if (separator) {
        const dParts = datePart.split(separator);
        const tParts = timePart.split(':');
        let year, month, day;
        if (dParts[0].length === 4) {
          year = parseInt(dParts[0], 10); month = parseInt(dParts[1], 10) - 1; day = parseInt(dParts[2], 10);
        } else {
          day = parseInt(dParts[0], 10); month = parseInt(dParts[1], 10) - 1; year = parseInt(dParts[2], 10);
        }
        return new Date(year, month, day, parseInt(tParts[0], 10) || 0, parseInt(tParts[1], 10) || 0, parseInt(tParts[2], 10) || 0);
      }
    }
  } catch (e) { console.error(`[${new Date().toLocaleTimeString()}] Parse Error Date:`, dateStr); }
  return null;
}

function formatToSheetDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatDisplayDate(dateStr) {
  const date = parseSheetDate(dateStr);
  if (!date) return '-';
  const day = date.getDate();
  const month = THAI_MONTHS_FULL[date.getMonth()];
  const year = date.getFullYear() + 543;
  const time = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') + ' น.';
  return `${day} ${month} ${year} เวลา ${time}`;
}

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function getSelectedCategoryFilters() {
  const checkboxes = document.querySelectorAll('.category-filter-checkbox');
  const selected = [];
  checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
  return selected;
}

function handleSearchFilter() { filterEvents(); }

function filterEvents() {
  const searchQuery = document.getElementById('search-input') ? document.getElementById('search-input').value.toLowerCase().trim() : '';
  const selectedCategories = getSelectedCategoryFilters();

  filteredEvents = events.filter(evt => {
    const matchText = !searchQuery ||
      (evt.Title && evt.Title.toLowerCase().includes(searchQuery)) ||
      (evt.Description && evt.Description.toLowerCase().includes(searchQuery)) ||
      (evt.Coordinator && evt.Coordinator.toLowerCase().includes(searchQuery)) ||
      (evt.President && evt.President.toLowerCase().includes(searchQuery));

    const eventCats = evt.Categories ? evt.Categories.split(',').map(c => c.trim()) : [];
    const matchCategory = eventCats.some(cat => selectedCategories.includes(cat)) || (eventCats.length === 0 && selectedCategories.length === 0);

    return matchText && matchCategory;
  });

  console.log(`[${new Date().toLocaleTimeString()}] 🔍 [Filter Events] ${filteredEvents.length}/${events.length} events matched criteria.`);
  renderCalendar();
}

function switchView(view) {
  currentView = view;
  console.log(`[${new Date().toLocaleTimeString()}] 👁️ [View Switch] Changed calendar view to: ${view}`);
  document.getElementById('view-month-btn').classList.toggle('active', view === 'month');
  document.getElementById('view-week-btn').classList.toggle('active', view === 'week');
  document.getElementById('calendar-grid').classList.toggle('week-view', view === 'week');
  renderCalendar();
}

function navigateCalendar(direction) {
  if (currentView === 'month') {
    currentDate.setMonth(currentDate.getMonth() + direction);
  } else {
    currentDate.setDate(currentDate.getDate() + (direction * 7));
  }
  renderCalendar();
}

function navigateToday() {
  currentDate = new Date();
  renderCalendar();
}

function renderCalendar() {
  console.time('🎨 Calendar Render Time');
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const currentMonthName = THAI_MONTHS_FULL[currentDate.getMonth()];
  const currentYearBE = currentDate.getFullYear() + 543;

  if (currentView === 'month') {
    document.getElementById('calendar-title-display').innerText = currentMonthName + ' ' + currentYearBE;
    document.getElementById('sidebar-month-display').innerText = currentMonthName + ' ' + currentYearBE;
    renderMonthView(grid);
  } else {
    const sunDate = getSundayOfWeek(currentDate);
    const satDate = new Date(sunDate);
    satDate.setDate(sunDate.getDate() + 6);
    const startStr = sunDate.getDate() + ' ' + THAI_MONTHS_FULL[sunDate.getMonth()] + ' ' + (sunDate.getFullYear() + 543);
    const endStr = satDate.getDate() + ' ' + THAI_MONTHS_FULL[satDate.getMonth()] + ' ' + (satDate.getFullYear() + 543);

    document.getElementById('calendar-title-display').innerText = 'ช่วงสัปดาห์: ' + startStr + ' - ' + endStr;
    document.getElementById('sidebar-month-display').innerText = currentMonthName + ' ' + currentYearBE;
    renderWeekView(grid);
  }
  updateDashboard();
  console.timeEnd('🎨 Calendar Render Time');
}

function renderMonthView(gridContainer) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  const today = new Date();

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    createDayCell(gridContainer, prevMonthTotalDays - i, new Date(year, month - 1, prevMonthTotalDays - i), true);
  }
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dateObj = new Date(year, month, dayNum);
    createDayCell(gridContainer, dayNum, dateObj, false, dateObj.toDateString() === today.toDateString());
  }
  const remainingCells = 42 - gridContainer.children.length;
  for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
    createDayCell(gridContainer, dayNum, new Date(year, month + 1, dayNum), true);
  }
}

function renderWeekView(gridContainer) {
  const sunday = getSundayOfWeek(currentDate);
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const dateObj = new Date(sunday);
    dateObj.setDate(sunday.getDate() + i);
    createDayCell(gridContainer, dateObj.getDate(), dateObj, false, dateObj.toDateString() === today.toDateString());
  }
}

function getSundayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  return new Date(date.setDate(date.getDate() - day));
}

function createDayCell(container, dayNumber, dateObj, isOtherMonth, isToday) {
  const cell = document.createElement('div');
  cell.className = 'day-cell';
  if (isOtherMonth) cell.classList.add('other-month');
  if (isToday) cell.classList.add('today');

  const header = document.createElement('div');
  header.className = 'day-header';
  const numSpan = document.createElement('span');
  numSpan.className = 'day-number';
  numSpan.innerText = dayNumber;
  header.appendChild(numSpan);
  cell.appendChild(header);

  const eventsList = document.createElement('div');
  eventsList.className = 'day-events-container';

  getEventsForDate(dateObj).forEach(evt => {
    const chip = document.createElement('div');
    chip.className = 'event-chip';
    const categoriesList = evt.Categories ? evt.Categories.split(',').map(c => c.trim()) : [];

    if (categoriesList.length === 1) {
      const cat = categoriesList[0];
      if (cat === 'ถ่ายภาพ') chip.classList.add('chip-photo');
      else if (cat === 'ถ่ายวิดีโอ') chip.classList.add('chip-video');
      else if (cat === 'เครื่องเสียง(ห้องเฟื่องฟ้า)') chip.classList.add('chip-audio-ff');
      else if (cat === 'เครื่องเสียง(อบจ)') chip.classList.add('chip-audio-obj');
    } else if (categoriesList.length > 1) {
      chip.classList.add('chip-multi');
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'chip-categories-dots';
      categoriesList.forEach(cat => {
        const dot = document.createElement('span');
        dot.className = 'dot-indicator';
        if (cat === 'ถ่ายภาพ') dot.style.backgroundColor = 'var(--color-photo)';
        else if (cat === 'ถ่ายวิดีโอ') dot.style.backgroundColor = 'var(--color-video)';
        else if (cat === 'เครื่องเสียง(ห้องเฟื่องฟ้า)') dot.style.backgroundColor = 'var(--color-audio-ff)';
        else if (cat === 'เครื่องเสียง(อบจ)') dot.style.backgroundColor = 'var(--color-audio-obj)';
        dotsContainer.appendChild(dot);
      });
      chip.appendChild(dotsContainer);
    }

    const titleText = document.createElement('span');
    titleText.innerText = evt.Title;
    chip.appendChild(titleText);
    chip.onclick = (e) => { e.stopPropagation(); openDetailModal(evt); };
    eventsList.appendChild(chip);
  });

  cell.appendChild(eventsList);
  container.appendChild(cell);
}

function getEventsForDate(targetDate) {
  const compareDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  return filteredEvents.filter(evt => {
    const sDate = parseSheetDate(evt['Start Date']);
    const eDate = parseSheetDate(evt['End Date']);
    if (!sDate || !eDate) return false;
    const startDateClean = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    const endDateClean = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    return compareDate >= startDateClean && compareDate <= endDateClean;
  });
}

function openDetailModal(eventObj) {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 [View Detail] Opening modal for event ID: ${eventObj.ID}`);
  selectedEvent = eventObj;
  document.getElementById('detail-title').innerText = eventObj.Title;
  document.getElementById('detail-start').innerText = formatDisplayDate(eventObj['Start Date']);
  document.getElementById('detail-end').innerText = formatDisplayDate(eventObj['End Date']);
  document.getElementById('detail-desc').innerText = eventObj.Description || 'ไม่มีรายละเอียด';
  document.getElementById('detail-id').innerText = eventObj.ID;

  if (document.getElementById('detail-coordinator')) document.getElementById('detail-coordinator').innerText = eventObj.Coordinator || '-';
  if (document.getElementById('detail-president')) document.getElementById('detail-president').innerText = eventObj.President || '-';
  if (document.getElementById('detail-timestamp')) document.getElementById('detail-timestamp').innerText = eventObj.Timestamp ? formatDisplayDate(eventObj.Timestamp) : '-';

  const badgeContainer = document.getElementById('detail-categories');
  badgeContainer.innerHTML = '';
  (eventObj.Categories ? eventObj.Categories.split(',').map(c => c.trim()) : []).forEach(cat => {
    const badge = document.createElement('span');
    badge.className = 'detail-tag';
    if (cat === 'ถ่ายภาพ') badge.className += ' tag-photo';
    else if (cat === 'ถ่ายวิดีโอ') badge.className += ' tag-video';
    else if (cat === 'เครื่องเสียง(ห้องเฟื่องฟ้า)') badge.className += ' tag-audio-ff';
    else if (cat === 'เครื่องเสียง(อบจ)') badge.className += ' tag-audio-obj';
    badge.innerText = cat;
    badgeContainer.appendChild(badge);
  });

  const previewContainer = document.getElementById('detail-file-preview');
  const attachmentSection = document.getElementById('detail-attachment-section');
  previewContainer.innerHTML = '';

  if (eventObj['Attachment URL']) {
    attachmentSection.classList.remove('hidden');
    previewContainer.innerHTML = `<a href="${eventObj['Attachment URL']}" class="attachment-link-btn" target="_blank"><i class="fa-solid fa-up-right-from-square"></i> เปิดดูไฟล์แนบ</a>`;
  } else {
    attachmentSection.classList.add('hidden');
  }

  updateAdminActionButtonsVisibility();
  document.getElementById('detail-modal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('active');
}

function triggerEditEvent() {
  if (!selectedEvent) return;
  console.log(`[${new Date().toLocaleTimeString()}] ✏️ [Edit Triggered] Preparing form for ID: ${selectedEvent.ID}`);
  closeDetailModal();

  document.getElementById('form-event-id').value = selectedEvent.ID;
  document.getElementById('form-title-input').value = selectedEvent.Title;
  document.getElementById('form-desc-input').value = selectedEvent.Description || '';
  if (document.getElementById('form-coordinator-input')) document.getElementById('form-coordinator-input').value = selectedEvent.Coordinator || '';
  if (document.getElementById('form-president-input')) document.getElementById('form-president-input').value = selectedEvent.President || '';

  startPicker.setDate(parseSheetDate(selectedEvent['Start Date']));
  endPicker.setDate(parseSheetDate(selectedEvent['End Date']));

  const categoriesList = selectedEvent.Categories ? selectedEvent.Categories.split(',').map(c => c.trim()) : [];
  document.querySelectorAll('.form-category-checkbox').forEach(cb => { cb.checked = categoriesList.includes(cb.value); });

  clearFileSelection();
  deleteExistingAttachment = false;
  document.getElementById('form-title').innerText = 'แก้ไขข้อมูลรายการประสาน';
  document.getElementById('form-modal').classList.add('active');
}

function openAddEventModal() {
  console.log(`[${new Date().toLocaleTimeString()}] ➕ [Add Event] Opening new event modal...`);
  document.getElementById('form-event-id').value = '';
  document.getElementById('form-title-input').value = '';
  document.getElementById('form-desc-input').value = '';

  const now = new Date();
  now.setMinutes(0); now.setSeconds(0);
  const endVal = new Date(now); endVal.setHours(endVal.getHours() + 1);

  startPicker.setDate(now);
  endPicker.setDate(endVal);

  document.querySelectorAll('.form-category-checkbox').forEach(cb => cb.checked = false);
  clearFileSelection();
  deleteExistingAttachment = false;

  document.getElementById('form-title').innerText = 'เพิ่มกิจกรรมใหม่ลงปฏิทิน';
  document.getElementById('form-modal').classList.add('active');
}

function closeFormModal() { document.getElementById('form-modal').classList.remove('active'); }

function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;
  console.log(`[${new Date().toLocaleTimeString()}] 📁 [File Selected] File Name: ${file.name}, Size: ${(file.size / 1024).toFixed(1)} KB`);

  if (file.size > 10 * 1024 * 1024) {
    console.warn(`[${new Date().toLocaleTimeString()}] ⚠️ [File Oversized] Selected file exceeds 10MB limit.`);
    showToast('ไฟล์มีขนาดเกินข้อกำหนดสูงสุด (10MB)', 'error');
    clearFileSelection();
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    selectedFile = {
      bytes: e.target.result.split(',')[1],
      name: file.name,
      mimeType: file.type
    };
    console.log(`[${new Date().toLocaleTimeString()}] 📁 [Base64 Conversion] File converted to Base64 stream.`);
    document.getElementById('selected-file-name').innerText = file.name;
    document.getElementById('selected-file-size').innerText = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('selected-file-display').classList.remove('hidden');
    document.querySelector('.dropzone-prompt').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function clearFileSelection() {
  selectedFile = null;
  if (document.getElementById('form-file-input')) document.getElementById('form-file-input').value = '';
  if (document.getElementById('selected-file-display')) document.getElementById('selected-file-display').classList.add('hidden');
  if (document.querySelector('.dropzone-prompt')) document.querySelector('.dropzone-prompt').classList.remove('hidden');
}

function setupDragAndDrop() {
  const dropzone = document.getElementById('upload-dropzone');
  if (!dropzone) return;
  dropzone.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-clear-selection')) document.getElementById('form-file-input').click();
  });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      document.getElementById('form-file-input').files = e.dataTransfer.files;
      handleFileSelection({ target: { files: e.dataTransfer.files } });
    }
  });
}

function updateDashboard() {
  const now = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  let monthTotal = 0, todayTotal = 0, countPhoto = 0, countVideo = 0, countAudioFF = 0, countAudioObj = 0;
  const upcomingEvents = [];

  events.forEach(evt => {
    const sDate = parseSheetDate(evt['Start Date']);
    const eDate = parseSheetDate(evt['End Date']);
    if (!sDate || !eDate) return;

    if ((sDate.getFullYear() === currentYear && sDate.getMonth() === currentMonth) || (eDate.getFullYear() === currentYear && eDate.getMonth() === currentMonth)) {
      monthTotal++;
      (evt.Categories ? evt.Categories.split(',').map(c => c.trim()) : []).forEach(cat => {
        if (cat === 'ถ่ายภาพ') countPhoto++;
        else if (cat === 'ถ่ายวิดีโอ') countVideo++;
        else if (cat === 'เครื่องเสียง(ห้องเฟื่องฟ้า)') countAudioFF++;
        else if (cat === 'เครื่องเสียง(อบจ)') countAudioObj++;
      });
    }

    const checkToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (checkToday >= new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate()) && checkToday <= new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate())) {
      todayTotal++;
    }
    if (eDate >= now) upcomingEvents.push(evt);
  });

  if (document.getElementById('stat-month-total')) document.getElementById('stat-month-total').innerText = monthTotal;
  if (document.getElementById('stat-today-total')) document.getElementById('stat-today-total').innerText = todayTotal;
  if (document.getElementById('stat-cat-photo')) document.getElementById('stat-cat-photo').innerText = countPhoto;
  if (document.getElementById('stat-cat-video')) document.getElementById('stat-cat-video').innerText = countVideo;
  if (document.getElementById('stat-cat-audio-ff')) document.getElementById('stat-cat-audio-ff').innerText = countAudioFF;
  if (document.getElementById('stat-cat-audio-obj')) document.getElementById('stat-cat-audio-obj').innerText = countAudioObj;

  upcomingEvents.sort((a, b) => (parseSheetDate(a['Start Date']) || 0) - (parseSheetDate(b['Start Date']) || 0));
  const upcomingList = document.getElementById('upcoming-list');
  if (upcomingList) {
    upcomingList.innerHTML = '';
    const topUpcoming = upcomingEvents.slice(0, 4);
    if (topUpcoming.length === 0) {
      upcomingList.innerHTML = '<div class="upcoming-empty">ไม่มีกิจกรรมเร็ว ๆ นี้</div>';
    } else {
      topUpcoming.forEach(evt => {
        const card = document.createElement('div');
        card.className = 'upcoming-card';
        card.onclick = () => openDetailModal(evt);
        card.innerHTML = `<div class="upcoming-info"><span class="upcoming-title">${evt.Title}</span><span class="upcoming-time"><i class="fa-regular fa-clock"></i> ${formatDisplayDate(evt['Start Date'])}</span></div><i class="fa-solid fa-chevron-right text-muted" style="font-size:0.75rem;"></i>`;
        upcomingList.appendChild(card);
      });
    }
  }
}

function initTheme() {
  const isDark = (localStorage.getItem('theme') === 'dark');
  document.body.classList.toggle('dark-mode', isDark);
  updateThemeButtonUI(isDark);
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeButtonUI(isDark);
}

function updateThemeButtonUI(isDark) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i> โหมดสว่าง' : '<i class="fa-solid fa-moon"></i> โหมดมืด';
}
