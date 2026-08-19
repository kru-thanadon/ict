// ========================================================================== 
// External Website Calendar JS Engine (Cloudflare D1 + Supabase Storage)
// With Optimistic Cache Engine & Detailed Logs
// ==========================================================================

document.addEventListener('DOMContentLoaded', function () {
  // 🟢 Config Endpoints (ตรวจสอบให้แน่ใจว่าปิดคำสั่งด้วย ; และไม่มี : เกิน)
  const WORKER_URL = 'https://ict.deaseler.workers.dev';
  const SUPABASE_URL = 'https://mhukujwmlkmrtirrlcmj.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_QCXKvgYZCsC7iKqa_hAV0w_g7wfCj02';

  // Element Selectors
  const calendarEl = document.getElementById('calendar');
  const eventModal = new bootstrap.Modal(document.getElementById('eventModal'));
  const detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
  const eventForm = document.getElementById('eventForm');

  let currentFileBase64 = null;
  let currentFileName = null;
  let currentFileMimeType = null;

  // 1. Initialize FullCalendar
  const calendar = new FullCalendar.Calendar(calendarEl, {[cite: 3]
    initialView: 'dayGridMonth',[cite: 3]
    locale: 'th',[cite: 3]
    headerToolbar: {[cite: 3]
      left: 'prev,next today',[cite: 3]
      center: 'title',[cite: 3]
      right: 'dayGridMonth,timeGridWeek,listMonth'[cite: 3]
    },
    selectable: true,[cite: 3]
    editable: false,[cite: 3]
    events: fetchEventsForCalendar, // ดึงข้อมูลผ่านฟังก์ชันที่ตรวจสอบ Hot/Cold Storage[cite: 3]
    
    dateClick: function (info) {[cite: 3]
      resetForm();[cite: 3]
      document.getElementById('startDate').value = info.dateStr + 'T08:30';[cite: 3]
      document.getElementById('endDate').value = info.dateStr + 'T16:30';[cite: 3]
      document.getElementById('modalTitle').textContent = 'เพิ่มรายการประสานงาน';[cite: 3]
      eventModal.show();[cite: 3]
    },

    eventClick: function (info) {[cite: 3]
      showEventDetails(info.event);[cite: 3]
    }
  });

  calendar.render();[cite: 3]

  // 2. Fetch Events Logic (สลับ Hot Data & Cold Data)
  async function fetchEventsForCalendar(fetchInfo, successCallback, failureCallback) {[cite: 3]
    const viewDate = calendar.getDate(); // วันที่ที่แสดงอยู่บน Calendar[cite: 3]
    const currentDate = new Date();[cite: 3]

    const isCurrentMonth = ([cite: 3]
      viewDate.getFullYear() === currentDate.getFullYear() &&[cite: 3]
      viewDate.getMonth() === currentDate.getMonth()[cite: 3]
    );

    // 🚀 ถ้าเป็นเดือนปัจจุบัน ดึงจาก Cloudflare D1 (Hot Storage)[cite: 3]
    // 🐢 ถ้าเป็นเดือนอื่น ดึงย้อนหลังผ่าน Cold Storage Endpoint[cite: 3]
    const fetchUrl = isCurrentMonth ? WORKER_URL : `${WORKER_URL}?source=cold`;[cite: 3]

    try {[cite: 3]
      const response = await fetch(fetchUrl);[cite: 3]
      if (!response.ok) throw new Error('Network response was not ok');[cite: 3]
      const rawEvents = await response.json();[cite: 3]

      // แปลงข้อมูลให้เข้ากับ Format ของ FullCalendar
      const calendarEvents = rawEvents.map(evt => ({[cite: 3]
        id: evt.id,[cite: 3]
        title: evt.title,[cite: 3]
        start: evt.start_date,[cite: 3]
        end: evt.end_date,[cite: 3]
        extendedProps: {[cite: 3]
          categories: evt.categories,[cite: 3]
          description: evt.description,[cite: 3]
          coordinator: evt.coordinator,[cite: 3]
          president: evt.president,[cite: 3]
          file_url: evt.file_url[cite: 3]
        }
      }));

      successCallback(calendarEvents);[cite: 3]
    } catch (error) {[cite: 3]
      console.error('Error fetching calendar events:', error);[cite: 3]
      failureCallback(error);[cite: 3]
    }
  }

  // 3. File Input Change Handling (แปลงไฟล์เป็น Base64 สำหรับ Backup ลง Google Drive)
  const fileInput = document.getElementById('fileInput');[cite: 3]
  if (fileInput) {[cite: 3]
    fileInput.addEventListener('change', function (e) {[cite: 3]
      const file = e.target.files[0];[cite: 3]
      if (file) {[cite: 3]
        currentFileName = file.name;[cite: 3]
        currentFileMimeType = file.type;[cite: 3]

        const reader = new FileReader();[cite: 3]
        reader.onload = function (evt) {[cite: 3]
          // เก็บเฉพาะสาย Data ไม่เอา Header Base64 Prefix
          currentFileBase64 = evt.target.result.split(',')[1];[cite: 3]
        };
        reader.readAsDataURL(file);[cite: 3]
      } else {[cite: 3]
        currentFileBase64 = null;[cite: 3]
        currentFileName = null;[cite: 3]
        currentFileMimeType = null;[cite: 3]
      }
    });
  }

  // 4. Supabase Storage Direct Upload
  async function uploadToSupabase(file) {[cite: 3]
    if (!file) return null;[cite: 3]
    const cleanFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;[cite: 3]
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/calendar-files/${cleanFileName}`;[cite: 3]

    const response = await fetch(uploadUrl, {[cite: 3]
      method: 'POST',[cite: 3]
      headers: {[cite: 3]
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,[cite: 3]
        'apikey': SUPABASE_ANON_KEY,[cite: 3]
        'Content-Type': file.type[cite: 3]
      },
      body: file[cite: 3]
    });

    if (!response.ok) {[cite: 3]
      throw new Error('Supabase Storage Upload Failed');[cite: 3]
    }

    return `${SUPABASE_URL}/storage/v1/object/public/calendar-files/${cleanFileName}`;[cite: 3]
  }

  // 5. Submit Form Handling (Create & Update)
  eventForm.addEventListener('submit', async function (e) {[cite: 3]
    e.preventDefault();[cite: 3]

    const submitBtn = document.getElementById('btnSaveEvent');[cite: 3]
    submitBtn.disabled = true;[cite: 3]
    submitBtn.innerText = 'กำลังบันทึก...';[cite: 3]

    try {[cite: 3]
      const eventId = document.getElementById('eventId').value;[cite: 3]
      const fileObj = fileInput ? fileInput.files[0] : null;[cite: 3]
      let fileUrl = document.getElementById('existingFileUrl').value || null;[cite: 3]

      // ถ้ามีการเลือกไฟล์ใหม่ ให้อัปโหลดเข้า Supabase Storage
      if (fileObj) {[cite: 3]
        fileUrl = await uploadToSupabase(fileObj);[cite: 3]
      }

      // เตรียม Payload ส่งไปยัง Cloudflare Worker
      const payload = {[cite: 3]
        id: eventId || null,[cite: 3]
        title: document.getElementById('eventTitle').value,[cite: 3]
        start_date: document.getElementById('startDate').value,[cite: 3]
        end_date: document.getElementById('endDate').value,[cite: 3]
        categories: getSelectedCategories(),[cite: 3]
        description: document.getElementById('eventDescription').value,[cite: 3]
        coordinator: document.getElementById('coordinator').value,[cite: 3]
        president: document.getElementById('president').value,[cite: 3]
        file_url: fileUrl,[cite: 3]
        file_data: currentFileBase64 ? {[cite: 3]
          bytes: currentFileBase64,[cite: 3]
          name: currentFileName,[cite: 3]
          mimeType: currentFileMimeType[cite: 3]
        } : null[cite: 3]
      };

      const response = await fetch(WORKER_URL, {[cite: 3]
        method: 'POST',[cite: 3]
        headers: { 'Content-Type': 'application/json' },[cite: 3]
        body: JSON.stringify(payload)[cite: 3]
      });

      const result = await response.json();[cite: 3]

      if (result.success) {[cite: 3]
        eventModal.hide();[cite: 3]
        resetForm();[cite: 3]
        calendar.refetchEvents(); // โหลดข้อมูลบน Calendar ใหม่[cite: 3]
      } else {[cite: 3]
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (result.message || ''));[cite: 3]
      }
    } catch (err) {[cite: 3]
      console.error('Save error:', err);[cite: 3]
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');[cite: 3]
    } finally {[cite: 3]
      submitBtn.disabled = false;[cite: 3]
      submitBtn.innerText = 'บันทึกข้อมูล';[cite: 3]
    }
  });

  // 6. Delete Event Handling
  document.getElementById('btnDeleteEvent').addEventListener('click', async function () {[cite: 3]
    const eventId = document.getElementById('detailEventId').value;[cite: 3]
    if (!eventId) return;[cite: 3]

    if (confirm('คุณต้องการยกเลิก/ลบรายการนี้ใช่หรือไม่?')) {[cite: 3]
      try {[cite: 3]
        const response = await fetch(`${WORKER_URL}?id=${eventId}`, {[cite: 3]
          method: 'DELETE'[cite: 3]
        });
        const result = await response.json();[cite: 3]

        if (result.success) {[cite: 3]
          detailModal.hide();[cite: 3]
          calendar.refetchEvents();[cite: 3]
        } else {[cite: 3]
          alert('ไม่สามารถลบรายการได้');[cite: 3]
        }
      } catch (err) {[cite: 3]
        console.error('Delete error:', err);[cite: 3]
        alert('เกิดข้อผิดพลาดในการลบรายการ');[cite: 3]
      }
    }
  });

  // 7. Edit Button Handling (เปิด Modal แก้ไข)
  document.getElementById('btnEditEvent').addEventListener('click', function () {[cite: 3]
    const eventId = document.getElementById('detailEventId').value;[cite: 3]
    const event = calendar.getEventById(eventId);[cite: 3]

    if (event) {[cite: 3]
      detailModal.hide();[cite: 3]

      document.getElementById('eventId').value = event.id;[cite: 3]
      document.getElementById('eventTitle').value = event.title;[cite: 3]
      document.getElementById('startDate').value = formatDateTimeLocal(event.start);[cite: 3]
      document.getElementById('endDate').value = formatDateTimeLocal(event.end);[cite: 3]
      document.getElementById('eventDescription').value = event.extendedProps.description || '';[cite: 3]
      document.getElementById('coordinator').value = event.extendedProps.coordinator || '';[cite: 3]
      document.getElementById('president').value = event.extendedProps.president || '';[cite: 3]
      document.getElementById('existingFileUrl').value = event.extendedProps.file_url || '';[cite: 3]

      setSelectedCategories(event.extendedProps.categories);[cite: 3]
      document.getElementById('modalTitle').textContent = 'แก้ไขรายการประสานงาน';[cite: 3]

      eventModal.show();[cite: 3]
    }
  });

  // 8. Helper Functions
  function showEventDetails(event) {[cite: 3]
    document.getElementById('detailEventId').value = event.id;[cite: 3]
    document.getElementById('detailTitle').textContent = event.title;[cite: 3]
    document.getElementById('detailTime').textContent = `${formatThaiDate(event.start)} - ${formatThaiDate(event.end)}`;[cite: 3]
    document.getElementById('detailCategories').textContent = event.extendedProps.categories || '-';[cite: 3]
    document.getElementById('detailDescription').textContent = event.extendedProps.description || '-';[cite: 3]
    document.getElementById('detailPresident').textContent = event.extendedProps.president || '-';[cite: 3]
    document.getElementById('detailCoordinator').textContent = event.extendedProps.coordinator || '-';[cite: 3]

    const fileContainer = document.getElementById('detailFileContainer');[cite: 3]
    if (event.extendedProps.file_url) {[cite: 3]
      fileContainer.innerHTML = `<a href="${event.extendedProps.file_url}" target="_blank" class="btn btn-sm btn-outline-primary">📎 เปิดแนบไฟล์เอกสาร</a>`;[cite: 3]
    } else {
      fileContainer.innerHTML = '<span class="text-muted">ไม่มีไฟล์แนบ</span>';[cite: 3]
    }

    detailModal.show();[cite: 3]
  }

  function resetForm() {[cite: 3]
    eventForm.reset();[cite: 3]
    document.getElementById('eventId').value = '';[cite: 3]
    document.getElementById('existingFileUrl').value = '';[cite: 3]
    currentFileBase64 = null;[cite: 3]
    currentFileName = null;[cite: 3]
    currentFileMimeType = null;[cite: 3]
  }

  function getSelectedCategories() {[cite: 3]
    const checkboxes = document.querySelectorAll('input[name="category"]:checked');[cite: 3]
    return Array.from(checkboxes).map(cb => cb.value).join(', ');[cite: 3]
  }

  function setSelectedCategories(categoriesStr) {[cite: 3]
    const checkboxes = document.querySelectorAll('input[name="category"]');[cite: 3]
    const selectedList = categoriesStr ? categoriesStr.split(',').map(s => s.trim()) : [];[cite: 3]
    checkboxes.forEach(cb => {[cite: 3]
      cb.checked = selectedList.includes(cb.value);[cite: 3]
    });
  }

  function formatDateTimeLocal(dateObj) {[cite: 3]
    if (!dateObj) return '';[cite: 3]
    const d = new Date(dateObj);[cite: 3]
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());[cite: 3]
    return d.toISOString().slice(0, 16);[cite: 3]
  }

  function formatThaiDate(dateObj) {[cite: 3]
    if (!dateObj) return '-';[cite: 3]
    return new Date(dateObj).toLocaleString('th-TH', {[cite: 3]
      dateStyle: 'short',[cite: 3]
      timeStyle: 'short'[cite: 3]
    });
  }
});
