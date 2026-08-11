// ========================================================================== 
// External Website Calendar JS Engine (API Connected)
// ==========================================================================

// 🔴 นำ URL Web App ของ Google Apps Script มาใส่ที่นี่ 🔴
const API_URL = 'https://script.google.com/macros/s/AKfycbyKGFMWUkA92MMtjCAtgCIRIXkw3gPBdPeeEC9QePWABViQAEAMQtUN9NUGLnv8zEJi2g/exec';

// Global Application State
let currentDate = new Date();
let currentView = 'month'; // 'month' or 'week'
let events = [];
let filteredEvents = [];
let isAdmin = false;
let adminPassword = '';
let selectedEvent = null;

// ตัวแปรเก็บ Instance ปฏิทิน Flatpickr สำหรับฟอร์มควบคุม
let startPicker = null;
let endPicker = null;

// File Upload State
let selectedFile = null;
let deleteExistingAttachment = false;

document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

/**
 * ตั้งค่าเริ่มต้นแอป และโหลดปฏิทิน (พร้อมตั้งค่า Flatpickr ปี พ.ศ.)
 */
function initApp() {
  console.log("🚀 [System] เริ่มต้นระบบปฏิทินงานประสานผ่าน API...");
  showLoader(true, 'กำลังเชื่อมต่อฐานข้อมูล...');
  
  const flatpickrConfig = {
    enableTime: true,
    dateFormat: "Y-m-d H:i:S",
    altInput: true,
    altInputClass: "form-control",
    locale: "th",
    time_24hr: true,
    formatDate: function(date, formatStr, locale) {
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
  
  // โหลดสิทธิ์ Admin จาก LocalStorage ของเบราว์เซอร์
  const savedPwd = localStorage.getItem('gas_calendar_admin_pwd') || '';
  if (savedPwd) {
    setAdminState(true, savedPwd);
  }
  
  loadEventsFromServer();
  setupDragAndDrop();
}

/**
 * 🌐 GET API: โหลดข้อมูลกิจกรรมทั้งหมดจาก Server
 */
function loadEventsFromServer() {
  console.log("🌐 [API] 1. เริ่มกระบวนการดึงข้อมูลจาก API: ", API_URL);
  showLoader(true, 'กำลังโหลดตารางงาน...');
  
  fetch(`${API_URL}?action=getEvents`)
    .then(response => {
      console.log("📥 [API] 2. ได้รับการตอบกลับจาก Server, HTTP Status:", response.status);
      return response.json();
    })
    .then(result => {
      console.log("📦 [API] 3. แกะกล่องข้อมูล JSON ที่ได้จาก Server:", result);
      showLoader(false);
      
      if (result.status === 'success') {
        console.log(`✅ [API] 4. โหลดข้อมูลสำเร็จ พบกิจกรรมทั้งหมด ${result.data.length} รายการ`);
        events = result.data;
        
        // --- ส่วนพิเศษสำหรับ Debug การแปลงวันที่ (เช็ค 3 รายการแรก) ---
        console.log("🕵️‍♂️ [Debug] ตรวจสอบการอ่านวันที่ (เช็คจาก 3 รายการแรก):");
        events.slice(0, 3).forEach((evt, idx) => {
            console.log(`   [รายการที่ ${idx+1}] ID: ${evt.ID} | ชื่อ: ${evt.Title}`);
            console.log(`     - Start Date (ดิบจากชีต): "${evt['Start Date']}" => แปลงผลลัพธ์ได้:`, parseSheetDate(evt['Start Date']));
            console.log(`     - End Date (ดิบจากชีต): "${evt['End Date']}" => แปลงผลลัพธ์ได้:`, parseSheetDate(evt['End Date']));
        });
        // --------------------------------------------------------

        filterEvents();
        showToast('โหลดข้อมูลกิจกรรมเรียบร้อยแล้ว', 'success');
      } else {
        console.error("❌ [API] Server แจ้งเตือน Error:", result.message);
        throw new Error(result.message);
      }
    })
    .catch(err => {
      console.error("🚨 [API] เกิดข้อผิดพลาดร้ายแรงในการเชื่อมต่อ:", err);
      showLoader(false);
      showToast('การเชื่อมต่อล้มเหลว: ' + err.message, 'error');
    });
}

function showLoader(show, text) {
  const loaderTextValue = text || 'กำลังทำงาน...';
  const loader = document.getElementById('loading-overlay');
  const loaderText = loader.querySelector('.loading-text');
  if (show) {
    loaderText.innerText = loaderTextValue;
    loader.classList.add('active');
  } else {
    loader.classList.remove('active');
  }
}

function showToast(message, type) {
  const toastType = type || 'info';
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + toastType;
  
  let icon = '<i class="fa-solid fa-info-circle toast-icon"></i>';
  if (toastType === 'success') icon = '<i class="fa-solid fa-circle-check toast-icon"></i>';
  if (toastType === 'error') icon = '<i class="fa-solid fa-circle-exclamation toast-icon"></i>';
  
  toast.innerHTML = icon + '\n<span class="toast-message">' + message + '</span>';
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================================================
// Admin Authorization Sessions
// ==========================================================================
function openAdminModal() {
  document.getElementById('admin-password-input').value = '';
  document.getElementById('admin-login-error').classList.add('hidden');
  document.getElementById('admin-modal').classList.add('active');
}
function closeAdminModal() {
  document.getElementById('admin-modal').classList.remove('active');
}

function setAdminState(adminLogged, password) {
  isAdmin = adminLogged;
  adminPassword = password;
  
  const statusBadge = document.getElementById('admin-status');
  const statusText = document.getElementById('admin-status-text');
  const actionBtn = document.getElementById('admin-action-btn');
  
  if (adminLogged) {
    statusBadge.className = 'admin-badge admin-badge-logged';
    statusText.innerHTML = '<i class="fa-solid fa-shield-check"></i> โหมดผู้ดูแลระบบ (Admin)';
    actionBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> ออกจากระบบ Admin';
    actionBtn.setAttribute('onclick', 'logoutAdmin()');
  } else {
    statusBadge.className = 'admin-badge admin-badge-guest';
    statusText.innerText = 'โหมดผู้ใช้งานทั่วไป';
    actionBtn.innerHTML = '<i class="fa-solid fa-lock"></i> เข้าสู่ระบบ Admin';
    actionBtn.setAttribute('onclick', 'openAdminModal()');
  }
  
  updateAdminActionButtonsVisibility();
}

function submitAdminPassword() {
  const pwdInput = document.getElementById('admin-password-input').value;
  if (!pwdInput) return;
  
  // บันทึกรหัสผ่านไว้ชั่วคราว ถ้ารหัสผิดระบบจะแจ้งเตือนตอนพยายามลบ/แก้ไขข้อมูล
  localStorage.setItem('gas_calendar_admin_pwd', pwdInput);
  setAdminState(true, pwdInput);
  closeAdminModal();
  showToast('สแตนด์บายสิทธิ์ผู้ดูแลระบบ (ระบบจะตรวจสอบอีกครั้งเมื่อมีการแก้ไข)', 'info');
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
    deleteBtn.classList.remove('hidden');
    editBtn.classList.remove('hidden');
  } else {
    deleteBtn.classList.add('hidden');
    editBtn.classList.add('hidden');
  }
}

// ==========================================================================
// Date Utility & Parse Engine (ลบวงเล็บภาษาไทยทิ้งก่อนประมวลผล)
// ==========================================================================
function parseSheetDate(dateStr) {
  if (!dateStr) return null;
  
  // 1. ลบข้อความในวงเล็บ เช่น (เวลาอินโดจีน) ออก เพื่อไม่ให้เบราว์เซอร์สับสน
  let cleanStr = String(dateStr).replace(/\(.*?\)/g, '').trim();

  // 2. ลองให้ Javascript ประมวลผลแบบอัตโนมัติ 
  // (หลังจากตัดวงเล็บทิ้ง จะเหลือแค่ "Thu Jun 18 2026 13:00:00 GMT+0700" ซึ่งอ่านได้ 100%)
  const autoDate = new Date(cleanStr);
  if (!isNaN(autoDate.getTime())) {
      return autoDate;
  }

  // 3. Fallback เผื่อเจอรูปแบบอื่นๆ (เช่น 18 มิถุนายน 2569)
  try {
    cleanStr = cleanStr.replace('T', ' ');
    const parts = cleanStr.split(' ');

    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    let thaiMonthIndex = -1;
    for (let i = 0; i < thaiMonths.length; i++) {
        if (cleanStr.includes(thaiMonths[i])) {
            thaiMonthIndex = i;
            break;
        }
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
            } else if (dParts[2].length === 4) { 
                year = parseInt(dParts[2], 10); let p0 = parseInt(dParts[0], 10); let p1 = parseInt(dParts[1], 10);
                if (p0 > 12) { day = p0; month = p1 - 1; } else { month = p0 - 1; day = p1; }
            } else { 
                day = parseInt(dParts[0], 10); month = parseInt(dParts[1], 10) - 1; year = parseInt(dParts[2], 10);
            }

            const h = parseInt(tParts[0], 10) || 0;
            const m = parseInt(tParts[1], 10) || 0;
            const s = parseInt(tParts[2], 10) || 0;

            return new Date(year, month, day, h, m, s);
        }
    }
  } catch (e) {
    console.error("Parse Error Date:", dateStr);
  }
  
  return null; 
}

function formatToSheetDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
}

function formatDisplayDate(dateStr) {
  const date = parseSheetDate(dateStr);
  if (!date) return '-';
  
  const day = date.getDate();
  const month = THAI_MONTHS_FULL[date.getMonth()];
  const year = date.getFullYear() + 543;
  const time = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') + ' น.';
  
  return day + ' ' + month + ' ' + year + ' เวลา ' + time;
}

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// ==========================================================================
// Filtering & Search mechanics
// ==========================================================================
function getSelectedCategoryFilters() {
  const checkboxes = document.querySelectorAll('.category-filter-checkbox');
  const selected = [];
  checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
  return selected;
}

function handleSearchFilter() { filterEvents(); }

function filterEvents() {
  console.log("🔍 [Filter] เริ่มคัดกรองข้อมูลกิจกรรม...");
  
  const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  const selectedCategories = getSelectedCategoryFilters();
  
  console.log(`   - คำค้นหา: "${searchQuery}"`);
  console.log(`   - หมวดหมู่ที่ติ๊กเลือก:`, selectedCategories);
  
  filteredEvents = events.filter(evt => {
    const matchText = !searchQuery || 
      evt.Title.toLowerCase().includes(searchQuery) || 
      evt.Description.toLowerCase().includes(searchQuery);
      
    const eventCats = evt.Categories ? evt.Categories.split(',').map(c => c.trim()) : [];
    const matchCategory = eventCats.some(cat => selectedCategories.includes(cat)) || 
      (eventCats.length === 0 && selectedCategories.length === 0);
      
    return matchText && matchCategory;
  });
  
  console.log(`✅ [Filter] คัดกรองเสร็จสิ้น: นำไปแสดงผล ${filteredEvents.length} รายการ (จากทั้งหมด ${events.length})`);
  renderCalendar();
}

// ==========================================================================
// Calendar Views Rendering engine
// ==========================================================================
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
  console.log(`🎨 [Render] เริ่มวาดตารางปฏิทิน | มุมมอง: ${currentView} | วันอ้างอิง: ${currentDate.toDateString()}`);
  
  const grid = document.getElementById('calendar-grid');
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
  
  console.log(`📊 [Dashboard] อัปเดตตัวเลขสถิติด้านล่าง...`);
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
    const dayNum = prevMonthTotalDays - i;
    const dateObj = new Date(year, month - 1, dayNum);
    createDayCell(gridContainer, dayNum, dateObj, true);
  }
  
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dateObj = new Date(year, month, dayNum);
    const isToday = dateObj.toDateString() === today.toDateString();
    createDayCell(gridContainer, dayNum, dateObj, false, isToday);
  }
  
  const totalCells = gridContainer.children.length;
  const remainingCells = 42 - totalCells;
  
  for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
    const dateObj = new Date(year, month + 1, dayNum);
    createDayCell(gridContainer, dayNum, dateObj, true);
  }
}

function renderWeekView(gridContainer) {
  const sunday = getSundayOfWeek(currentDate);
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const dateObj = new Date(sunday);
    dateObj.setDate(sunday.getDate() + i);
    const isToday = dateObj.toDateString() === today.toDateString();
    createDayCell(gridContainer, dateObj.getDate(), dateObj, false, isToday);
  }
}

function getSundayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  return new Date(date.setDate(diff));
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
  
  const eventsOnDay = getEventsForDate(dateObj);
  
  eventsOnDay.forEach(evt => {
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
    
    chip.onclick = function(e) {
      e.stopPropagation();
      openDetailModal(evt);
    };
    
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

// ==========================================================================
// Modal View detail
// ==========================================================================
function openDetailModal(eventObj) {
  selectedEvent = eventObj;
  
  document.getElementById('detail-title').innerText = eventObj.Title;
  document.getElementById('detail-start').innerText = formatDisplayDate(eventObj['Start Date']);
  document.getElementById('detail-end').innerText = formatDisplayDate(eventObj['End Date']);
  document.getElementById('detail-desc').innerText = eventObj.Description || 'ไม่มีรายละเอียดการจองประสาน';
  document.getElementById('detail-id').innerText = eventObj.ID;
  
  const badgeContainer = document.getElementById('detail-categories');
  badgeContainer.innerHTML = '';
  const categoriesList = eventObj.Categories ? eventObj.Categories.split(',').map(c => c.trim()) : [];
  
  categoriesList.forEach(cat => {
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
    
    const fileUrl = eventObj['Attachment URL'];
    const fileId = eventObj['Attachment ID'];
    const urlLower = fileUrl.toLowerCase();
    
    const isImage = urlLower.includes('drive.google.com/file') || 
                    urlLower.includes('lh3.googleusercontent.com') ||
                    urlLower.startsWith('data:image') || 
                    /\.(jpg|jpeg|png|gif|webp|svg)/.test(urlLower);
                    
    const isAudio = urlLower.startsWith('data:audio') || /\.(mp3|wav|ogg|aac|m4a)/.test(urlLower);
    const isVideo = urlLower.startsWith('data:video') || /\.(mp4|webm|ogg|mov)/.test(urlLower);
    
    if (isImage) {
      let embedUrl = fileId ? 'https://lh3.googleusercontent.com/d/' + fileId + '=w800' : fileUrl;
      previewContainer.innerHTML = 
        '<img class="preview-image" src="' + embedUrl + '" onerror="this.onerror=null; this.src=\'https://placehold.co/400x200?text=Image\';" alt="ภาพแนบ">' +
        '<a href="' + fileUrl + '" class="attachment-link-btn" target="_blank">' +
          '<i class="fa-solid fa-up-right-from-square"></i> เปิดดูรูปภาพเต็ม' +
        '</a>';
    } else if (isAudio) {
      let audioSrc = fileId ? 'https://docs.google.com/uc?export=download&id=' + fileId : fileUrl;
      previewContainer.innerHTML = 
        '<audio controls class="preview-audio" src="' + audioSrc + '"></audio>' +
        '<a href="' + fileUrl + '" class="attachment-link-btn" target="_blank">' +
          '<i class="fa-solid fa-arrow-down"></i> ดาวน์โหลดเสียง' +
        '</a>';
    } else if (isVideo) {
      let videoSrc = fileId ? 'https://docs.google.com/uc?export=download&id=' + fileId : fileUrl;
      previewContainer.innerHTML = 
        '<video controls class="preview-video" src="' + videoSrc + '"></video>' +
        '<a href="' + fileUrl + '" class="attachment-link-btn" target="_blank">' +
          '<i class="fa-solid fa-play"></i> เปิดดูวิดีโอ' +
        '</a>';
    } else {
      previewContainer.innerHTML = 
        '<div class="file-icon-box" style="font-size: 2.5rem;">' +
          '<i class="fa-solid fa-file-pdf text-primary"></i>' +
        '</div>' +
        '<p class="modal-sub">กดเปิดด้านล่างเพื่อดาวน์โหลดเอกสารอ้างอิง</p>' +
        '<a href="' + fileUrl + '" class="attachment-link-btn" target="_blank">' +
          '<i class="fa-solid fa-download"></i> ดาวน์โหลดเอกสารประกอบ' +
        '</a>';
    }
  } else {
    attachmentSection.classList.add('hidden');
  }
  
  updateAdminActionButtonsVisibility();
  document.getElementById('detail-modal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('active');
  const media = document.getElementById('detail-file-preview').querySelectorAll('audio, video');
  media.forEach(m => m.pause());
}

// ==========================================================================
// Admin Action Flows & API Submissions
// ==========================================================================
function triggerDeleteEvent() {
  if (!selectedEvent) return;
  if (!confirm('คุณแน่ใจว่าต้องการลบกิจกรรม "' + selectedEvent.Title + '" ใช่หรือไม่?')) return;
  
  showLoader(true, 'กำลังลบกิจกรรมผ่าน API...');
  closeDetailModal();
  
  const requestBody = {
    action: 'deleteEvent',
    eventId: selectedEvent.ID,
    adminPassword: adminPassword
  };
  
  fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(requestBody)
  })
  .then(res => res.json())
  .then(result => {
    showLoader(false);
    if (result.status === 'success') {
      showToast('ลบรายการกิจกรรมเรียบร้อยแล้ว', 'success');
      loadEventsFromServer();
    } else {
      throw new Error(result.message);
    }
  })
  .catch(err => {
    showLoader(false);
    showToast('ล้มเหลว: ' + err.message, 'error');
    if (err.message.includes('รหัสผ่าน')) logoutAdmin();
  });
}

function triggerEditEvent() {
  if (!selectedEvent) return;
  closeDetailModal();
  
  document.getElementById('form-event-id').value = selectedEvent.ID;
  document.getElementById('form-title-input').value = selectedEvent.Title;
  document.getElementById('form-desc-input').value = selectedEvent.Description || '';
  
  const startDateObj = parseSheetDate(selectedEvent['Start Date']);
  const endDateObj = parseSheetDate(selectedEvent['End Date']);
  
  startPicker.setDate(startDateObj);
  endPicker.setDate(endDateObj);
  
  const categoriesList = selectedEvent.Categories ? selectedEvent.Categories.split(',').map(c => c.trim()) : [];
  const checkboxes = document.querySelectorAll('.form-category-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = categoriesList.includes(cb.value);
  });
  
  clearFileSelection();
  deleteExistingAttachment = false;
  
  const editAttachmentStatus = document.getElementById('edit-attachment-status');
  if (selectedEvent['Attachment URL']) {
    editAttachmentStatus.classList.remove('hidden');
    document.getElementById('edit-attachment-link').href = selectedEvent['Attachment URL'];
  } else {
    editAttachmentStatus.classList.add('hidden');
  }
  
  document.getElementById('form-title').innerText = 'แก้ไขข้อมูลรายการประสาน (แอดมิน)';
  document.getElementById('form-modal').classList.add('active');
}

function markAttachmentForDeletion() {
  deleteExistingAttachment = true;
  document.getElementById('edit-attachment-status').classList.add('marked-deleted');
  showToast('ไฟล์แนบเดิมจะถูกคัดแยกเพื่อลบออกถาวรเมื่อบันทึกรายการ', 'info');
}

// ==========================================================================
// Forms Submissions Engine (POST to API)
// ==========================================================================
function openAddEventModal() {
  document.getElementById('form-event-id').value = '';
  document.getElementById('form-title-input').value = '';
  document.getElementById('form-desc-input').value = '';
  
  const now = new Date();
  now.setMinutes(0);
  now.setSeconds(0);
  
  const startVal = new Date(now);
  const endVal = new Date(now);
  endVal.setHours(endVal.getHours() + 1);
  
  startPicker.setDate(startVal);
  endPicker.setDate(endVal);
  
  const checkboxes = document.querySelectorAll('.form-category-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  
  clearFileSelection();
  deleteExistingAttachment = false;
  document.getElementById('edit-attachment-status').classList.add('hidden');
  
  document.getElementById('form-title').innerText = 'เพิ่มกิจกรรมใหม่ลงปฏิทิน';
  document.getElementById('form-modal').classList.add('active');
}

function closeFormModal() {
  document.getElementById('form-modal').classList.remove('active');
}

function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (file.size > 10 * 1024 * 1024) {
    showToast('ไฟล์มีขนาดเกินข้อกำหนดสูงสุด (ไม่เกิน 10MB)', 'error');
    clearFileSelection();
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const base64Data = dataUrl.split(',')[1];
    
    selectedFile = {
      bytes: base64Data,
      name: file.name,
      mimeType: file.type,
      rawUrl: dataUrl
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
  document.getElementById('form-file-input').value = '';
  document.getElementById('selected-file-display').classList.add('hidden');
  document.querySelector('.dropzone-prompt').classList.remove('hidden');
}

function handleFormSubmit(e) {
  e.preventDefault();
  
  const categoryCbs = document.querySelectorAll('.form-category-checkbox');
  const checkedCategories = [];
  categoryCbs.forEach(cb => {
    if (cb.checked) checkedCategories.push(cb.value);
  });
  
  const categoryError = document.getElementById('form-category-error');
  if (checkedCategories.length === 0) {
    categoryError.classList.remove('hidden');
    showToast('กรุณาเลือกประเภทหมวดหมู่บริการอย่างน้อย 1 ประเภท', 'error');
    return;
  } else {
    categoryError.classList.add('hidden');
  }
  
  const startDateObj = startPicker.selectedDates[0];
  const endDateObj = endPicker.selectedDates[0];
  
  if (!startDateObj || !endDateObj) {
    showToast('กรุณาระบุวันและเวลาของกิจกรรมงานให้ครบถ้วน', 'error');
    return;
  }
  
  if (endDateObj <= startDateObj) {
    showToast('วันและเวลาสิ้นสุดกิจกรรมต้องไม่กำหนดก่อนหรือตรงกับช่วงเวลาเริ่มงาน', 'error');
    return;
  }
  
  const eventId = document.getElementById('form-event-id').value;
  const eventData = {
    title: document.getElementById('form-title-input').value.trim(),
    startDate: formatToSheetDate(startDateObj), 
    endDate: formatToSheetDate(endDateObj),
    categories: checkedCategories.join(', '),
    description: document.getElementById('form-desc-input').value.trim()
  };
  
  closeFormModal();
  showLoader(true, eventId ? 'กำลังแก้ไขข้อมูลผ่าน API...' : 'กำลังบันทึกข้อมูลผ่าน API...');
  
  // สร้าง Payload เพื่อส่งไปยัง Backend
  const requestBody = {
    action: eventId ? 'updateEvent' : 'addEvent',
    eventData: eventData,
    fileData: selectedFile || null
  };
  
  if (eventId) {
    requestBody.adminPassword = adminPassword;
    requestBody.eventData.id = eventId;
    requestBody.eventData.deleteExistingAttachment = deleteExistingAttachment;
  }
  
  fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // กัน CORS Preflight สำหรับ GAS
    body: JSON.stringify(requestBody)
  })
  .then(res => res.json())
  .then(result => {
    showLoader(false);
    if (result.status === 'success') {
      showToast(eventId ? 'แก้ไขข้อมูลกิจกรรมสำเร็จ' : 'เพิ่มกิจกรรมใหม่สำเร็จ', 'success');
      loadEventsFromServer();
    } else {
      throw new Error(result.message);
    }
  })
  .catch(err => {
    showLoader(false);
    showToast('บันทึกล้มเหลว: ' + err.message, 'error');
    if (err.message.includes('รหัสผ่าน')) logoutAdmin();
  });
}

function setupDragAndDrop() {
  const dropzone = document.getElementById('upload-dropzone');
  if (!dropzone) return;
  
  dropzone.addEventListener('click', function(e) {
    if (e.target.closest('.btn-clear-selection')) return;
    document.getElementById('form-file-input').click();
  });
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, function(e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, function(e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });
  
  dropzone.addEventListener('drop', function(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
      const fileInput = document.getElementById('form-file-input');
      fileInput.files = files;
      const event = { target: { files: files } };
      handleFileSelection(event);
    }
  }, false);
}

function updateDashboard() {
  const now = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  let monthTotal = 0;
  let todayTotal = 0;
  let countPhoto = 0;
  let countVideo = 0;
  let countAudioFF = 0;
  let countAudioObj = 0;
  
  const upcomingEvents = [];
  
  events.forEach(evt => {
    const sDate = parseSheetDate(evt['Start Date']);
    const eDate = parseSheetDate(evt['End Date']);
    if (!sDate || !eDate) return;
    
    const inCurrentMonth = (sDate.getFullYear() === currentYear && sDate.getMonth() === currentMonth) ||
                           (eDate.getFullYear() === currentYear && eDate.getMonth() === currentMonth) ||
                           (currentDate >= sDate && currentDate <= eDate);
    
    if (inCurrentMonth) {
      monthTotal++;
      const categoriesList = evt.Categories ? evt.Categories.split(',').map(c => c.trim()) : [];
      categoriesList.forEach(cat => {
        if (cat === 'ถ่ายภาพ') countPhoto++;
        else if (cat === 'ถ่ายวิดีโอ') countVideo++;
        else if (cat === 'เครื่องเสียง(ห้องเฟื่องฟ้า)') countAudioFF++;
        else if (cat === 'เครื่องเสียง(อบจ)') countAudioObj++;
      });
    }
    
    const checkToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDateClean = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    const endDateClean = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    
    if (checkToday >= startDateClean && checkToday <= endDateClean) {
      todayTotal++;
    }
    
    if (eDate >= now) {
      upcomingEvents.push(evt);
    }
  });
  
  document.getElementById('stat-month-total').innerText = monthTotal;
  document.getElementById('stat-today-total').innerText = todayTotal;
  document.getElementById('stat-cat-photo').innerText = countPhoto;
  document.getElementById('stat-cat-video').innerText = countVideo;
  document.getElementById('stat-cat-audio-ff').innerText = countAudioFF;
  document.getElementById('stat-cat-audio-obj').innerText = countAudioObj;
  
  upcomingEvents.sort((a, b) => {
    const aDate = parseSheetDate(a['Start Date']) || new Date();
    const bDate = parseSheetDate(b['Start Date']) || new Date();
    return aDate - bDate;
  });
  
  const upcomingList = document.getElementById('upcoming-list');
  upcomingList.innerHTML = '';
  
  const topUpcoming = upcomingEvents.slice(0, 4);
  
  if (topUpcoming.length === 0) {
    upcomingList.innerHTML = '<div class="upcoming-empty">ไม่มีกิจกรรมประสานงานที่กำลังจะมาถึงเร็ว ๆ นี้</div>';
  } else {
    topUpcoming.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'upcoming-card';
      card.onclick = function() { openDetailModal(evt); };
      
      card.innerHTML = 
        '<div class="upcoming-info">' +
          '<span class="upcoming-title">' + evt.Title + '</span>' +
          '<span class="upcoming-time"><i class="fa-regular fa-clock"></i> ' + formatDisplayDate(evt['Start Date']) + '</span>' +
        '</div>' +
        '<i class="fa-solid fa-chevron-right text-muted" style="font-size:0.75rem;"></i>';
        
      upcomingList.appendChild(card);
    });
  }
}









/**
 * ฟังก์ชันเริ่มต้นธีม (เรียกใช้เมื่อโหลดหน้าเว็บเสร็จ)
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  // จะเปิดโหมดมืด เฉพาะเมื่อผู้ใช้เคยเปิดทิ้งไว้ก่อนหน้านี้เท่านั้น นอกนั้นเริ่มด้วยโหมดสว่างเสมอ
  const isDark = (savedTheme === 'dark');
  
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  updateThemeButtonUI(isDark);
  console.log(`🌓 [Theme] ธีมเริ่มต้นถูกกำหนดเป็น: ${isDark ? 'โหมดมืด (Dark)' : 'โหมดสว่าง (Light)'}`);
}

/**
 * ฟังก์ชันสำหรับคลิกสลับธีม
 */
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  
  // บันทึกตัวเลือกเก็บไว้ในเบราว์เซอร์
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  
  updateThemeButtonUI(isDark);
  console.log(`🌓 [Theme] สลับธีมผู้ใช้เป็น: ${isDark ? 'โหมดมืด' : 'โหมดสว่าง'}`);
}

/**
 * อัปเดตไอคอนและข้อความบนปุ่มกดตามสถานะจริง
 */
function updateThemeButtonUI(isDark) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  
  if (isDark) {
    btn.innerHTML = '<i class="fa-solid fa-sun"></i> โหมดสว่าง';
  } else {
    btn.innerHTML = '<i class="fa-solid fa-moon"></i> โหมดมืด';
  }
}

// และเพิ่มการเรียกใช้ initTheme(); ไว้ในส่วนของการเริ่มระบบงานเช่นเคยครับ