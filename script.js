// ========================================================================== 
// External Website Calendar JS Engine (Cloudflare D1 + Supabase Storage)
// With Optimistic Cache Engine & Detailed Logs
// ==========================================================================

  // 🟢 Config Endpoints
  const WORKER_URL = 'https://ict.deaseler.workers.dev'; // URL ของ Cloudflare Worker
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
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'th',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,listMonth'
    },
    selectable: true,
    editable: false,
    events: fetchEventsForCalendar, // ดึงข้อมูลผ่านฟังก์ชันที่ตรวจสอบ Hot/Cold Storage
    
    dateClick: function (info) {
      resetForm();
      document.getElementById('startDate').value = info.dateStr + 'T08:30';
      document.getElementById('endDate').value = info.dateStr + 'T16:30';
      document.getElementById('modalTitle').textContent = 'เพิ่มรายการประสานงาน';
      eventModal.show();
    },

    eventClick: function (info) {
      showEventDetails(info.event);
    }
  });

  calendar.render();

  // 2. Fetch Events Logic (สลับ Hot Data & Cold Data)
  async function fetchEventsForCalendar(fetchInfo, successCallback, failureCallback) {
    const viewDate = calendar.getDate(); // วันที่ที่แสดงอยู่บน Calendar
    const currentDate = new Date();

    const isCurrentMonth = (
      viewDate.getFullYear() === currentDate.getFullYear() &&
      viewDate.getMonth() === currentDate.getMonth()
    );

    // 🚀 ถ้าเป็นเดือนปัจจุบัน ดึงจาก Cloudflare D1 (Hot Storage)
    // 🐢 ถ้าเป็นเดือนอื่น ดึงย้อนหลังผ่าน Cold Storage Endpoint
    const fetchUrl = isCurrentMonth ? WORKER_URL : `${WORKER_URL}?source=cold`;

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const rawEvents = await response.json();

      // แปลงข้อมูลให้เข้ากับ Format ของ FullCalendar
      const calendarEvents = rawEvents.map(evt => ({
        id: evt.id,
        title: evt.title,
        start: evt.start_date,
        end: evt.end_date,
        extendedProps: {
          categories: evt.categories,
          description: evt.description,
          coordinator: evt.coordinator,
          president: evt.president,
          file_url: evt.file_url
        }
      }));

      successCallback(calendarEvents);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      failureCallback(error);
    }
  }

  // 3. File Input Change Handling (แปลงไฟล์เป็น Base64 สำหรับ Backup ลง Google Drive)
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        currentFileName = file.name;
        currentFileMimeType = file.type;

        const reader = new FileReader();
        reader.onload = function (evt) {
          // เก็บเฉพาะสาย Data ไม่เอา Header Base64 Prefix
          currentFileBase64 = evt.target.result.split(',')[1];
        };
        reader.readAsDataURL(file);
      } else {
        currentFileBase64 = null;
        currentFileName = null;
        currentFileMimeType = null;
      }
    });
  }

  // 4. Supabase Storage Direct Upload
  async function uploadToSupabase(file) {
    if (!file) return null;
    const cleanFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/calendar-files/${cleanFileName}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': file.type
      },
      body: file
    });

    if (!response.ok) {
      throw new Error('Supabase Storage Upload Failed');
    }

    return `${SUPABASE_URL}/storage/v1/object/public/calendar-files/${cleanFileName}`;
  }

  // 5. Submit Form Handling (Create & Update)
  eventForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const submitBtn = document.getElementById('btnSaveEvent');
    submitBtn.disabled = true;
    submitBtn.innerText = 'กำลังบันทึก...';

    try {
      const eventId = document.getElementById('eventId').value;
      const fileObj = fileInput ? fileInput.files[0] : null;
      let fileUrl = document.getElementById('existingFileUrl').value || null;

      // ถ้ามีการเลือกไฟล์ใหม่ ให้อัปโหลดเข้า Supabase Storage
      if (fileObj) {
        fileUrl = await uploadToSupabase(fileObj);
      }

      // เตรียม Payload ส่งไปยัง Cloudflare Worker
      const payload = {
        id: eventId || null,
        title: document.getElementById('eventTitle').value,
        start_date: document.getElementById('startDate').value,
        end_date: document.getElementById('endDate').value,
        categories: getSelectedCategories(),
        description: document.getElementById('eventDescription').value,
        coordinator: document.getElementById('coordinator').value,
        president: document.getElementById('president').value,
        file_url: fileUrl,
        file_data: currentFileBase64 ? {
          bytes: currentFileBase64,
          name: currentFileName,
          mimeType: currentFileMimeType
        } : null
      };

      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        eventModal.hide();
        resetForm();
        calendar.refetchEvents(); // โหลดข้อมูลบน Calendar ใหม่
      } else {
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (result.message || ''));
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'บันทึกข้อมูล';
    }
  });

  // 6. Delete Event Handling
  document.getElementById('btnDeleteEvent').addEventListener('click', async function () {
    const eventId = document.getElementById('detailEventId').value;
    if (!eventId) return;

    if (confirm('คุณต้องการยกเลิก/ลบรายการนี้ใช่หรือไม่?')) {
      try {
        const response = await fetch(`${WORKER_URL}?id=${eventId}`, {
          method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
          detailModal.hide();
          calendar.refetchEvents();
        } else {
          alert('ไม่สามารถลบรายการได้');
        }
      } catch (err) {
        console.error('Delete error:', err);
        alert('เกิดข้อผิดพลาดในการลบรายการ');
      }
    }
  });

  // 7. Edit Button Handling (เปิด Modal แก้ไข)
  document.getElementById('btnEditEvent').addEventListener('click', function () {
    const eventId = document.getElementById('detailEventId').value;
    const event = calendar.getEventById(eventId);

    if (event) {
      detailModal.hide();

      document.getElementById('eventId').value = event.id;
      document.getElementById('eventTitle').value = event.title;
      document.getElementById('startDate').value = formatDateTimeLocal(event.start);
      document.getElementById('endDate').value = formatDateTimeLocal(event.end);
      document.getElementById('eventDescription').value = event.extendedProps.description || '';
      document.getElementById('coordinator').value = event.extendedProps.coordinator || '';
      document.getElementById('president').value = event.extendedProps.president || '';
      document.getElementById('existingFileUrl').value = event.extendedProps.file_url || '';

      setSelectedCategories(event.extendedProps.categories);
      document.getElementById('modalTitle').textContent = 'แก้ไขรายการประสานงาน';

      eventModal.show();
    }
  });

  // 8. Helper Functions
  function showEventDetails(event) {
    document.getElementById('detailEventId').value = event.id;
    document.getElementById('detailTitle').textContent = event.title;
    document.getElementById('detailTime').textContent = `${formatThaiDate(event.start)} - ${formatThaiDate(event.end)}`;
    document.getElementById('detailCategories').textContent = event.extendedProps.categories || '-';
    document.getElementById('detailDescription').textContent = event.extendedProps.description || '-';
    document.getElementById('detailPresident').textContent = event.extendedProps.president || '-';
    document.getElementById('detailCoordinator').textContent = event.extendedProps.coordinator || '-';

    const fileContainer = document.getElementById('detailFileContainer');
    if (event.extendedProps.file_url) {
      fileContainer.innerHTML = `<a href="${event.extendedProps.file_url}" target="_blank" class="btn btn-sm btn-outline-primary">📎 เปิดแนบไฟล์เอกสาร</a>`;
    } else {
      fileContainer.innerHTML = '<span class="text-muted">ไม่มีไฟล์แนบ</span>';
    }

    detailModal.show();
  }

  function resetForm() {
    eventForm.reset();
    document.getElementById('eventId').value = '';
    document.getElementById('existingFileUrl').value = '';
    currentFileBase64 = null;
    currentFileName = null;
    currentFileMimeType = null;
  }

  function getSelectedCategories() {
    const checkboxes = document.querySelectorAll('input[name="category"]:checked');
    return Array.from(checkboxes).map(cb => cb.value).join(', ');
  }

  function setSelectedCategories(categoriesStr) {
    const checkboxes = document.querySelectorAll('input[name="category"]');
    const selectedList = categoriesStr ? categoriesStr.split(',').map(s => s.trim()) : [];
    checkboxes.forEach(cb => {
      cb.checked = selectedList.includes(cb.value);
    });
  }

  function formatDateTimeLocal(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function formatThaiDate(dateObj) {
    if (!dateObj) return '-';
    return new Date(dateObj).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }
});
