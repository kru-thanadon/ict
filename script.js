// ========================================================================== 
// External Website Calendar JS Engine (GAS Backend + Optimistic Cache Engine)
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
  initApp();
  if (typeof initTheme === 'function') initTheme();
});

function initApp() {
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

  startPicker = flatpickr("#form-start-input", flatpickrConfig);
  endPicker = flatpickr("#form-end-input", flatpickrConfig);

  const savedPwd = localStorage.getItem('gas_calendar_admin_pwd') || '';
  if (savedPwd) setAdminState(true, savedPwd);

  // ⚡ 1. อ่าน Cache ขึ้นมาแสดงผลบน UI ทันที (Instant Load)
  loadFromCache();

  // 📡 2. ยิง Silent Fetch ไปเทียบข้อมูลกับ GAS เบื้องหลัง
  syncWithServer();

  setupDragAndDrop();
}

/**
 * ⚡ ดึงข้อมูลจาก LocalStorage แสดงผลบนหน้าเว็บทันที
 */
function loadFromCache() {
  const cachedRaw = localStorage.getItem(CACHE_KEY);
  if (cachedRaw) {
    try {
      events = JSON.parse(cachedRaw);
      filterEvents();
    } catch (e) {
      console.error("⚠️ Cache corrupt:", e);
    }
  }
}

/**
 * 💾 บันทึกสเตทปัจจุบันลง Cache พร้อม Re-render หน้าเว็บ
 */
function updateCacheAndRender(newEvents) {
  events = newEvents;
  localStorage.setItem(CACHE_KEY, JSON.stringify(events));
  filterEvents();
}

/**
 * 📡 Silent Fetch: ดึงข้อมูลสดจาก GAS แล้ว Compare เพื่ออัปเดตเฉพาะส่วนที่ต่าง
 */
function syncWithServer() {
  fetch(`${API_URL}?action=getEvents`)
    .then(res => res.text())
    .then(text => {
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return;
      
      const result = JSON.parse(text);
      if (result.status === 'success' && Array.isArray(result.data)) {
        const serverEvents = result.data;
        const currentCacheRaw = localStorage.getItem(CACHE_KEY) || '[]';
        const serverRaw = JSON.stringify(serverEvents);

        // Compare: ถ้าข้อมูลจาก Sheet ไม่ตรงกับ Cache หน้าเว็บ (เช่น มีรายการใหม่จากคนอื่น)
        if (currentCacheRaw !== serverRaw) {
          console.log("🔄 พบข้อมูลใหม่จาก Server! กำลังอัปเดตแคชและหน้าเว็บ...");
          updateCacheAndRender(serverEvents);
        }
      }
    })
    .catch(err => console.error("🚨 Background Sync Failed:", err));
}

// ==========================================================================
// 🚀 Optimistic CRUD Actions (เขียน Cache ก่อน -> ยิง GAS เบื้องหลัง)
// ==========================================================================

/**
 * ➕/✏️ เพิ่มหรือแก้ไขกิจกรรม (Optimistic Update)
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const categoryCbs = document.querySelectorAll('.form-category-checkbox');
  const checkedCategories = [];
  categoryCbs.forEach(cb => { if (cb.checked) checkedCategories.push(cb.value); });

  if (checkedCategories.length === 0) {
    showToast('กรุณาเลือกประเภทหมวดหมู่บริการอย่างน้อย 1 ประเภท', 'error');
    return;
  }

  const startDateObj = startPicker.selectedDates[0];
  const endDateObj = endPicker.selectedDates[0];

  if (!startDateObj || !endDateObj || endDateObj <= startDateObj) {
    showToast('ช่วงเวลาไม่ถูกต้อง', 'error');
    return;
  }

  const eventId = document.getElementById('form-event-id').value;
  const eventData = {
    ID: eventId || 'TEMP-' + Date.now(), // สร้าง ID ชั่วคราวก่อนถ้าเป็นรายการใหม่
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

  // 1. ⚡ อัปเดต Cache + Render UI ทันทีไม่ต้องรอ network
  let updatedEvents = [...events];
  if (eventId) {
    updatedEvents = updatedEvents.map(evt => evt.ID === eventId ? { ...evt, ...eventData } : evt);
  } else {
    updatedEvents.push(eventData);
  }
  updateCacheAndRender(updatedEvents);
  showToast(eventId ? 'แก้ไขข้อมูลเรียบร้อยแล้ว' : 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');

  // 2. 📡 ยิงไปบันทึกลง Google Sheets เบื้องหลัง
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
      if (result.status === 'success') {
        // เมื่อ GAS บันทึกเสร็จ ให้ Sync ข้อมูลจริงกลับมาแทนที่ ID ชั่วคราว
        syncWithServer();
      } else {
        throw new Error(result.message);
      }
    })
    .catch(err => {
      showToast('เกิดข้อผิดพลาดในการบันทึกไปยัง Sheet: ' + err.message, 'error');
      syncWithServer(); // Rollback/Re-sync ข้อมูลจริงหากบันทึกล้มเหลว
    });
}

/**
 * 🗑️ ลบกิจกรรม (Optimistic Delete)
 */
function triggerDeleteEvent() {
  if (!selectedEvent) return;
  if (!confirm('คุณแน่ใจว่าต้องการลบกิจกรรม "' + selectedEvent.Title + '" ใช่หรือไม่?')) return;

  const targetId = selectedEvent.ID;
  closeDetailModal();

  // 1. ⚡ ลบออกจาก Cache + UI ทันที
  const updatedEvents = events.filter(evt => evt.ID !== targetId);
  updateCacheAndRender(updatedEvents);
  showToast('ลบรายการเรียบร้อยแล้ว', 'success');

  // 2. 📡 ส่งคำสั่งลบไป GAS เบื้องหลัง
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
      if (result.status === 'success') {
        syncWithServer();
      } else {
        throw new Error(result.message);
      }
    })
    .catch(err => {
      showToast('ลบใน Sheet ไม่สำเร็จ: ' + err.message, 'error');
      syncWithServer(); // Rollback หากเกิด Error
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
  } catch (e) { console.error("Parse Error Date:", dateStr); }
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

  renderCalendar();
}

function switchView(view) {
  currentView = view;
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
  if (file.size > 10 * 1024 * 1024) {
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
