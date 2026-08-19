// ========================================================================== 
// External Website Calendar JS Engine (Cloudflare D1 + Supabase Storage)
// With Optimistic Cache Engine & Detailed Logs
// ==========================================================================

document.addEventListener('DOMContentLoaded', function () {
  // 🟢 Config Endpoints
  const WORKER_URL = 'https://ict.deaseler.workers.dev';
  const SUPABASE_URL = 'https://mhukujwmlkmrtirrlcmj.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_QCXKvgYZCsC7iKqa_hAV0w_g7wfCj02';

  // Custom Modal Element Selectors (ตรงตาม index.html)
  const detailModalEl = document.getElementById('detail-modal');
  const formModalEl = document.getElementById('form-modal');
  const eventForm = document.getElementById('event-form');
  const fileInput = document.getElementById('form-file-input');

  let currentFileBase64 = null;
  let currentFileName = null;
  let currentFileMimeType = null;

  // 1. Initialize FullCalendar (ถ้าไม่มี #calendar ใน DOM ให้ใช้ Custom Grid)
  const calendarEl = document.getElementById('calendar');
  let calendar = null;

  if (calendarEl) {
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'th',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listMonth'
      },
      selectable: true,
      editable: false,
      events: fetchEventsForCalendar,

      dateClick: function (info) {
        openAddEventModal(info.dateStr);
      },

      eventClick: function (info) {
        showEventDetails(info.event);
      }
    });

    calendar.render();
  }

  // 2. Fetch Events Logic (สลับ Hot Data & Cold Data)
  async function fetchEventsForCalendar(fetchInfo, successCallback, failureCallback) {
    const viewDate = calendar ? calendar.getDate() : new Date();
    const currentDate = new Date();

    const isCurrentMonth = (
      viewDate.getFullYear() === currentDate.getFullYear() &&
      viewDate.getMonth() === currentDate.getMonth()
    );

    const fetchUrl = isCurrentMonth ? WORKER_URL : `${WORKER_URL}?source=cold`;

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const rawEvents = await response.json();

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

      if (successCallback) successCallback(calendarEvents);
      return calendarEvents;
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      if (failureCallback) failureCallback(error);
    }
  }

  // 3. File Input Change Handling
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        currentFileName = file.name;
        currentFileMimeType = file.type;

        const reader = new FileReader();
        reader.onload = function (evt) {
          currentFileBase64 = evt.target.result.split(',')[1];
        };
        reader.readAsDataURL(file);
      } else {
        clearFileSelection();
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

  // 5. Submit Form Handling
  if (eventForm) {
    eventForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const submitBtn = eventForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

      try {
        const eventId = document.getElementById('form-event-id').value;
        const fileObj = fileInput ? fileInput.files[0] : null;
        let fileUrl = null;

        if (fileObj) {
          fileUrl = await uploadToSupabase(fileObj);
        }

        const payload = {
          id: eventId || null,
          title: document.getElementById('form-title-input').value,
          start_date: document.getElementById('form-start-input').value,
          end_date: document.getElementById('form-end-input').value,
          categories: getSelectedCategories(),
          description: document.getElementById('form-desc-input').value,
          coordinator: document.getElementById('form-coordinator-input').value,
          president: document.getElementById('form-president-input').value,
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
          closeFormModal();
          resetForm();
          if (calendar) calendar.refetchEvents();
        } else {
          alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (result.message || ''));
        }
      } catch (err) {
        console.error('Save error:', err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกรายการ';
      }
    });
  }

  // 6. Helper & Modal Control Functions (Window Scoped)
  window.openAddEventModal = function (dateStr = '') {
    resetForm();
    if (dateStr) {
      document.getElementById('form-start-input').value = dateStr + ' 08:30';
      document.getElementById('form-end-input').value = dateStr + ' 16:30';
    }
    document.getElementById('form-title').textContent = 'เพิ่มกิจกรรมงานปฏิทิน';
    formModalEl.classList.add('active');
  };

  window.closeFormModal = function () {
    formModalEl.classList.remove('active');
    resetForm();
  };

  window.closeDetailModal = function () {
    detailModalEl.classList.remove('active');
  };

  window.triggerDeleteEvent = async function () {
    const eventId = document.getElementById('detail-id').textContent;
    if (!eventId) return;

    if (confirm('คุณต้องการยกเลิก/ลบรายการนี้ใช่หรือไม่?')) {
      try {
        const response = await fetch(`${WORKER_URL}?id=${eventId}`, {
          method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
          closeDetailModal();
          if (calendar) calendar.refetchEvents();
        } else {
          alert('ไม่สามารถลบรายการได้');
        }
      } catch (err) {
        console.error('Delete error:', err);
        alert('เกิดข้อผิดพลาดในการลบรายการ');
      }
    }
  };

  window.triggerEditEvent = function () {
    const eventId = document.getElementById('detail-id').textContent;
    if (!calendar || !eventId) return;

    const event = calendar.getEventById(eventId);

    if (event) {
      closeDetailModal();

      document.getElementById('form-event-id').value = event.id;
      document.getElementById('form-title-input').value = event.title;
      document.getElementById('form-start-input').value = formatDateTimeLocal(event.start);
      document.getElementById('form-end-input').value = formatDateTimeLocal(event.end);
      document.getElementById('form-desc-input').value = event.extendedProps.description || '';
      document.getElementById('form-coordinator-input').value = event.extendedProps.coordinator || '';
      document.getElementById('form-president-input').value = event.extendedProps.president || '';

      setSelectedCategories(event.extendedProps.categories);
      document.getElementById('form-title').textContent = 'แก้ไขกิจกรรมงานปฏิทิน';

      formModalEl.classList.add('active');
    }
  };

  function showEventDetails(event) {
    document.getElementById('detail-id').textContent = event.id;
    document.getElementById('detail-title').textContent = event.title;
    document.getElementById('detail-start').textContent = formatThaiDate(event.start);
    document.getElementById('detail-end').textContent = formatThaiDate(event.end);
    document.getElementById('detail-categories').textContent = event.extendedProps.categories || '-';
    document.getElementById('detail-desc').textContent = event.extendedProps.description || '-';
    document.getElementById('detail-president').textContent = event.extendedProps.president || '-';
    document.getElementById('detail-coordinator').textContent = event.extendedProps.coordinator || '-';

    const filePreview = document.getElementById('detail-file-preview');
    if (event.extendedProps.file_url) {
      filePreview.innerHTML = `<a href="${event.extendedProps.file_url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-paperclip"></i> เปิดดูไฟล์แนบเอกสาร</a>`;
    } else {
      filePreview.innerHTML = '<span class="text-muted">ไม่มีไฟล์แนบ</span>';
    }

    detailModalEl.classList.add('active');
  }

  function resetForm() {
    if (eventForm) eventForm.reset();
    document.getElementById('form-event-id').value = '';
    clearFileSelection();
  }

  window.clearFileSelection = function () {
    if (fileInput) fileInput.value = '';
    currentFileBase64 = null;
    currentFileName = null;
    currentFileMimeType = null;

    const selectedDisplay = document.getElementById('selected-file-display');
    if (selectedDisplay) selectedDisplay.classList.add('hidden');
  };

  function getSelectedCategories() {
    const checkboxes = document.querySelectorAll('input[name="form-categories"]:checked');
    return Array.from(checkboxes).map(cb => cb.value).join(', ');
  }

  function setSelectedCategories(categoriesStr) {
    const checkboxes = document.querySelectorAll('input[name="form-categories"]');
    const selectedList = categoriesStr ? categoriesStr.split(',').map(s => s.trim()) : [];
    checkboxes.forEach(cb => {
      cb.checked = selectedList.includes(cb.value);
    });
  }

  function formatDateTimeLocal(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }

  function formatThaiDate(dateObj) {
    if (!dateObj) return '-';
    return new Date(dateObj).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }
});
