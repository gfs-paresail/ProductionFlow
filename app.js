/**
 * 감지기 생산현황 관리 시스템 - 코어 비즈니스 로직 (Detector PMS v4.1)
 * (Firestore 무료 플랜 최적화, 수동 저장 및 로컬 임시저장, 이탈 방지,
 *  검정예정일 사이드바 수정/삭제, 10일 기본 복원 및 일정 추가/삭제,
 *  3개 분할 생산일정 및 변동작업자 툴바 통합, 설정 인라인 수정, 빈칸 클린 UX)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. Firebase Cloud Firestore 설정 (gfs-production)
  // =========================================================================
  // [이전 DB 설정 - 백업 보관]
  /*
  const firebaseConfigOld = {
    apiKey: "AIzaSyDw5xFYRJnA4tQF5k6WM2hs0DDv60ad0bo",
    authDomain: "detectordb-c9771.firebaseapp.com",
    projectId: "detectordb-c9771",
    storageBucket: "detectordb-c9771.firebasestorage.app",
    messagingSenderId: "381997617419",
    appId: "1:381997617419:web:6abf156bb56bfd71ae520e",
    measurementId: "G-F528310ENY"
  };
  */

  // [신규 DB 설정 - gfs-production-45bcc]
  const firebaseConfig = {
    apiKey: "AIzaSyBhYih14YjrRz9EM1UWGiBPNOEyz2C6s88",
    authDomain: "gfs-production-45bcc.firebaseapp.com",
    projectId: "gfs-production-45bcc",
    storageBucket: "gfs-production-45bcc.firebasestorage.app",
    messagingSenderId: "854117302527",
    appId: "1:854117302527:web:6b0acd8aab85c810db0cca",
    measurementId: "G-96LKGZ21T9"
  };

  let db = null;
  let isFirestoreActive = false;

  // 로컬 저장소 키
  const STORAGE_KEYS = {
    COMMON_ITEMS: 'pms_common_items_v4',
    ETC_ITEMS: 'pms_etc_items_v4',
    WORKERS: 'pms_workers_v4',
    LAST_INSP_START: 'pms_last_insp_start_v4',
    LAST_INSP_TARGET: 'pms_last_insp_target_v4',
    LAST_PROD_DATE: 'pms_last_prod_date_v4',
    VIEW_MODE: 'pms_view_mode_v4',
    INSP_DATA_PREFIX: 'pms_insp_data_v4_',
    INSP_SCHEDULES: 'pms_insp_schedules_v4',
    PROD_DATA_PREFIX: 'pms_prod_data_v4_',
    // 신규 검정현황 및 확장 마스터 키
    CERT_MASTER_ITEMS: 'pms_cert_master_items_v4',
    CERT_DRAFT_ROWS: 'pms_cert_draft_rows_v4',
    CERT_SAVED_ROWS: 'pms_cert_saved_rows_v4',
    CERT_FILTER_TYPE: 'pms_cert_filter_type_v4',
    CERT_FILTER_DATE: 'pms_cert_filter_date_v4',
    CERT_FILTER_LINE: 'pms_cert_filter_line_v4',
    KFI_DATA_MAP: 'pms_kfi_data_map_v4',
    DEPARTMENTS: 'pms_departments_v4',
    // 품질검사 키
    QUALITY_ROWS: 'pms_quality_rows_v4',
    QUALITY_FILTER_DATE: 'pms_quality_filter_date_v4',
    // 생산계획 키
    PLAN_DATA: 'pms_plan_data_v4',
    // 일정계획 v2 & 생산일보 v2 키
    INSP_V2_PREFIX: 'pms_insp_v2_',
    DAILY_V2_PREFIX: 'pms_daily_v2_',
    LINE_PROC_CONFIG: 'pms_line_proc_config_v4',
    // 근태관리 키
    ATTENDANCE_TYPES: 'pms_attendance_types_v4',
    ATTENDANCE_RECORDS: 'pms_attendance_records_v4',
    ATTENDANCE_HOLIDAYS: 'pms_attendance_holidays_v4'
  };

  const DEFAULT_ATTENDANCE_TYPES = [
    { id: 'att_annual', name: '연차', color: '#2563eb' },
    { id: 'att_half', name: '반차', color: '#f59e0b' },
    { id: 'att_outside', name: '외근', color: '#10b981' },
    { id: 'att_absent', name: '결근', color: '#ef4444' },
    { id: 'att_early', name: '조퇴', color: '#8b5cf6' },
    { id: 'att_out', name: '외출', color: '#06b6d4' }
  ];

  // 기본 공통 품목 (생산현황, 생산일정 조립/검사 공통)
  const DEFAULT_COMMON_ITEMS = [
    { id: 'item_1', name: '일반 차동식_방수형' },
    { id: 'item_2', name: '일반 정온식_방수형' },
    { id: 'item_3', name: '일반 차동식' },
    { id: 'item_4', name: '일반 정온식' },
    { id: 'item_5', name: '일반 광전식' },
    { id: 'item_6', name: 'AN 정온식_방수형' },
    { id: 'item_7', name: 'AN 정온식' },
    { id: 'item_8', name: 'AN 광전식' }
  ];

  // 기본 기타 작업 품목 (생산일정 '기타' 전용)
  const DEFAULT_ETC_ITEMS = [
    { id: 'etc_1', name: '외주 포장 작업' },
    { id: 'etc_2', name: 'PCB 기판 수리' },
    { id: 'etc_3', name: '수입 부품 선별 검사' },
    { id: 'etc_4', name: '시제품 샘플 조립' }
  ];

  // 기본 작업자 (작업반별 고정 및 지원인원)
  const DEFAULT_WORKERS = [
    { id: 'worker_1', name: '김철수', group: '감지기반', type: 'fixed' },
    { id: 'worker_2', name: '이영희', group: '유도등반', type: 'fixed' },
    { id: 'worker_3', name: '박민수', group: '수신기반', type: 'fixed' },
    { id: 'worker_4', name: '정수진', group: '감지기반', type: 'variable' },
    { id: 'worker_5', name: '최동욱', group: '유도등반', type: 'variable' },
    { id: 'worker_6', name: '강현우', group: '수신기반', type: 'variable' }
  ];

  const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  // =========================================================================
  // 2. 전역 상태 (State)
  // =========================================================================
  const state = {
    currentTab: 'tab-inspection',
    viewMode: localStorage.getItem(STORAGE_KEYS.VIEW_MODE) || 'default',

    // 마스터 데이터
    commonItems: [],
    etcItems: [],
    workers: [],

    // 생산현황 상태
    inspectionStartDate: localStorage.getItem(STORAGE_KEYS.LAST_INSP_START) || getTodayDateString(),
    inspectionTargetDate: localStorage.getItem(STORAGE_KEYS.LAST_INSP_TARGET) || addDaysStr(getTodayDateString(), 9),
    inspectionDayCount: 10, // 기본 10일간 표시
    inspectionData: { process: {}, assembly: {} },
    inspectionSchedules: [], // [{ targetDate: 'YYYY-MM-DD', startDate: 'YYYY-MM-DD', dayCount: 10, updatedAt }]
    sidebarYearFilter: 'ALL',
    sidebarMonthFilter: 'ALL',

    // 생산 일정 상태
    productionDate: localStorage.getItem(STORAGE_KEYS.LAST_PROD_DATE) || getTodayDateString(),
    selectedVarWorkerIds: [], // 현재 생산일자에 투입된 변동 작업자 ID 목록
    productionData: {
      assembly: {},    // { [itemId]: { note: '', lotNo: '', qty: 0, workerHours: {} } }
      inspection: {},  // { [itemId]: { note: '', lotNo: '', qty: 0, workerHours: {} } }
      etc: {}          // { [itemId]: { note: '', lotNo: '', qty: 0, workerHours: {} } }
    },

    // 검정현황 상태
    certMasterItems: [],
    certMasterFilterGroup: 'ALL',
    certDraftRows: [],
    certSavedRows: [],
    certFilterType: localStorage.getItem(STORAGE_KEYS.CERT_FILTER_TYPE) || 'writeDate',
    certFilterDate: localStorage.getItem(STORAGE_KEYS.CERT_FILTER_DATE) || '',
    certFilterLine: localStorage.getItem(STORAGE_KEYS.CERT_FILTER_LINE) || 'ALL',
    certMode: 'auto', // 'auto' | 'manual'
    certSelectedWeekId: 'W1',
    certAutoLineFilter: 'ALL',
    kfiDataMap: {},
    departments: [],
    activeModalDraftRowId: null,

    // 품질검사 상태 (검정현황 연동)
    qualityRows: [],
    qualityFilterDate: localStorage.getItem(STORAGE_KEYS.QUALITY_FILTER_DATE) || '',

    // 생산계획 상태
    planData: null,
    planFilterGroup: 'ALL',
    planSearchText: '',

    // 반별 활성 라인 (생산일보: daily=일보작성, workhours=공수집계)
    activeLines: {
      schedule: 'ALL',
      daily: 'daily'
    },

    // 일정계획 v2 & 생산일보 v2 상태
    inspLineFilter: 'ALL',
    inspExpandedIds: [], // 펼쳐진 certRowId 목록
    inspV2Data: { startDate: getTodayDateString(), dayCount: 10, items: {} },
    lineProcConfig: (() => {
      try {
        const raw = localStorage.getItem('pms_line_proc_config_v4');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { '감지기반': 'a_ip', '유도등반': 'inline1', '수신기반': 'ai_p' };
    })(),
    prodLineFilter: 'ALL',
    prodMergeMode: 'merged', // 'merged' | 'split'
    dailyV2Data: { supportByLine: { '감지기반': [], '유도등반': [], '수신기반': [] }, entries: [] },
    whMonth: getTodayDateString().slice(0, 7),
    whLineFilter: 'ALL',

    // 근태관리 상태
    attendanceMonth: getTodayDateString().slice(0, 7),
    attendanceTypes: [],
    attendanceRecords: [],
    attendanceHolidays: {},
    attendanceSidebarGroup: 'ALL',
    attendanceSidebarWorker: 'ALL',
    attendanceExpandedWorkers: [],

    // 미저장 변경사항 플래그
    isDirty: false
  };

  let toastTimer = null;

  // =========================================================================
  // 3. 유틸리티 함수
  // =========================================================================
  function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDaysStr(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d;
  }

  // 0 또는 빈 값은 완전 빈칸("")으로 표시
  function formatNumberDisplay(num) {
    if (num === null || num === undefined || isNaN(num) || num === '' || Number(num) === 0) {
      return '';
    }
    return Number(num).toLocaleString('ko-KR');
  }

  function formatFloatDisplay(num) {
    if (num === null || num === undefined || isNaN(num) || num === '' || Number(num) === 0) {
      return '';
    }
    return Number(num).toFixed(1);
  }

  function parseSafeInt(val) {
    if (val === '' || val === null || val === undefined) return 0;
    const parsed = parseInt(String(val).replace(/,/g, ''), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  function parseSafeFloat(val) {
    if (val === '' || val === null || val === undefined) return 0;
    const parsed = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  function generateUniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // 스마트 로트번호 자동완성 ('1' 입력 시 '26-001'로 변환)
  function formatSmartLotNumber(val) {
    if (!val) return '';
    const raw = String(val).trim().toUpperCase();
    if (/^\d+$/.test(raw)) {
      const currentYear = new Date().getFullYear();
      const yy = String(currentYear).slice(-2);
      const paddedNum = String(parseInt(raw, 10)).padStart(3, '0');
      return `${yy}-${paddedNum}`;
    }
    if (/^\d{2}-\d+$/.test(raw)) {
      const parts = raw.split('-');
      return `${parts[0]}-${parts[1].padStart(3, '0')}`;
    }
    return raw;
  }

  // Toast 알림
  function showToast(message = '저장되었습니다') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastTimestamp = document.getElementById('toast-timestamp');
    if (!toast) return;

    if (toastMsg) toastMsg.textContent = message;
    if (toastTimestamp) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      toastTimestamp.textContent = `${timeStr} 처리 완료`;
    }

    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, 1600);
  }

  function updateDbStatus(isConnected, message = 'DB 연결됨') {
    const badge = document.getElementById('db-status-badge');
    const dot = document.getElementById('db-status-dot');
    const text = document.getElementById('db-status-text');

    if (text) text.textContent = message;
    if (dot) dot.style.backgroundColor = isConnected ? '#10b981' : '#f59e0b';
    if (badge) {
      badge.style.backgroundColor = isConnected ? '#ecfdf5' : '#fffbeb';
      badge.style.borderColor = isConnected ? '#a7f3d0' : '#fde68a';
    }
  }

  function markAsDirty(isDirty = true) {
    state.isDirty = isDirty;
    updateDateStatusPills();
    updateGlobalSaveButton();
  }

  function updateGlobalSaveButton() {
    const btn = document.getElementById('btn-global-save');
    if (!btn) return;
    const iconDisk = btn.querySelector('.disk-icon');
    const iconCheck = btn.querySelector('.check-icon');
    const textSpan = btn.querySelector('.btn-save-text');

    if (state.isDirty) {
      btn.classList.remove('is-saved');
      if (iconDisk) iconDisk.style.display = 'inline-block';
      if (iconCheck) iconCheck.style.display = 'none';
      if (textSpan) textSpan.textContent = '저장';
    } else {
      btn.classList.add('is-saved');
      if (iconDisk) iconDisk.style.display = 'none';
      if (iconCheck) iconCheck.style.display = 'inline-block';
      if (textSpan) textSpan.textContent = '저장됨';
    }
  }

  function updateInspectionLineBanner(lineKey, lineName) {
    const pill = document.getElementById('insp-line-pill');
    const title = document.getElementById('insp-line-title');
    if (pill) {
      pill.className = `line-pill-badge ${lineKey}`;
      pill.textContent = lineName;
    }
    if (title) {
      title.textContent = `${lineName} 일정계획`;
    }
  }

  function updateProductionLineBanner(lineKey, lineName) {
    const pill = document.getElementById('prod-line-pill');
    const title = document.getElementById('prod-line-title');
    if (pill) {
      pill.className = `line-pill-badge ${lineKey}`;
      pill.textContent = lineName;
    }
    if (title) {
      title.textContent = `${lineName} 생산일보`;
    }
  }

  function updateDateStatusPills() {
    // 생산현황 상태 배지
    const inspPill = document.getElementById('insp-date-status-pill');
    if (inspPill) {
      if (state.isDirty && state.currentTab === 'tab-inspection') {
        inspPill.innerHTML = '● 미저장 변경사항<span class="dirty-indicator-dot"></span>';
        inspPill.className = 'date-status-pill';
        inspPill.style.backgroundColor = '#fef2f2';
        inspPill.style.color = '#dc2626';
        inspPill.style.border = '1px solid #fecaca';
      } else {
        const hasInspData = (state.inspectionData.process && Object.keys(state.inspectionData.process).length > 0) ||
                            (state.inspectionData.assembly && Object.keys(state.inspectionData.assembly).length > 0);
        if (hasInspData) {
          inspPill.textContent = '● 데이터 저장됨';
          inspPill.className = 'date-status-pill has-data';
          inspPill.removeAttribute('style');
        } else {
          inspPill.textContent = '○ 새 일정';
          inspPill.className = 'date-status-pill no-data';
          inspPill.removeAttribute('style');
        }
      }
    }

    // 생산일정 상태 배지
    const prodPill = document.getElementById('prod-date-status-pill');
    if (prodPill) {
      if (state.isDirty && state.currentTab === 'tab-production') {
        prodPill.innerHTML = '● 미저장 변경사항<span class="dirty-indicator-dot"></span>';
        prodPill.className = 'date-status-pill';
        prodPill.style.backgroundColor = '#fef2f2';
        prodPill.style.color = '#dc2626';
        prodPill.style.border = '1px solid #fecaca';
      } else {
        const hasProdData = Object.values(state.productionData).some(sec => 
          Object.values(sec).some(r => r && (r.qty > 0 || r.lotNo || r.note || Object.values(r.workerHours || {}).some(h => h > 0)))
        );
        if (hasProdData) {
          prodPill.textContent = '● 데이터 저장됨';
          prodPill.className = 'date-status-pill has-data';
          prodPill.removeAttribute('style');
        } else {
          prodPill.textContent = '○ 새 일정';
          prodPill.className = 'date-status-pill no-data';
          prodPill.removeAttribute('style');
        }
      }
    }
  }

  // =========================================================================
  // 4. Firebase Cloud Firestore 초기화 및 수동 연동 (비용 99% 절감 모드)
  // =========================================================================
  async function initFirebase() {
    loadLocalMasterData();
    loadLocalInspectionSchedules();
    loadLocalInspectionData(state.inspectionTargetDate);
    loadLocalProductionData(state.productionDate);
    loadLocalCertData();

    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        isFirestoreActive = true;
        updateDbStatus(true, 'DB 연결됨');

        // Firestore에서 최신 마스터 데이터 및 일정 인덱스를 1회 get()으로 로드
        await loadMasterDataFromDb();
        await loadInspectionSchedulesFromDb();
        await loadInspectionDataFromDb(state.inspectionTargetDate);
        await loadCertDataFromDb();
        await loadPlanDataFromDb();
      } catch (err) {
        console.warn('Firebase 연결 실패, 로컬 모드로 작동합니다:', err);
        fallbackToLocal();
      }
    } else {
      fallbackToLocal();
    }

    renderAll();
  }

  function fallbackToLocal() {
    isFirestoreActive = false;
    updateDbStatus(false, '로컬 모드');
    loadLocalMasterData();
    loadLocalInspectionSchedules();
    loadLocalInspectionData(state.inspectionTargetDate);
    loadLocalProductionData(state.productionDate);
    loadLocalCertData();
    loadLocalPlanData();
    renderAll();
  }

  // =========================================================================
  // 5. 마스터 데이터 관리 (품목등록 / 기타작업 / 작업자 관리)
  // =========================================================================
  // 과거 구버전 기본 품목인지 확인 (스포트형 감지기 더미 데이터 여부)
  function isLegacyDefaultCommonItems(items) {
    if (!Array.isArray(items) || items.length === 0) return true;
    return items.some(it => it.name && (it.name.includes('스포트형') || it.name.includes('복합형 감지기')));
  }

  function loadLocalMasterData() {
    try {
      const rawCommon = localStorage.getItem(STORAGE_KEYS.COMMON_ITEMS);
      if (rawCommon) {
        const parsed = JSON.parse(rawCommon);
        // 저장된 데이터가 과거 구버전 기본 품목이면 최신 품목으로 자동 마이그레이션
        if (isLegacyDefaultCommonItems(parsed)) {
          state.commonItems = [...DEFAULT_COMMON_ITEMS];
          saveLocalMasterData();
        } else {
          state.commonItems = parsed;
        }
      } else {
        state.commonItems = [...DEFAULT_COMMON_ITEMS];
        saveLocalMasterData();
      }

      const rawEtc = localStorage.getItem(STORAGE_KEYS.ETC_ITEMS);
      state.etcItems = rawEtc ? JSON.parse(rawEtc) : [...DEFAULT_ETC_ITEMS];

      const rawWorkers = localStorage.getItem(STORAGE_KEYS.WORKERS);
      state.workers = rawWorkers ? JSON.parse(rawWorkers) : [...DEFAULT_WORKERS];
    } catch (e) {
      state.commonItems = [...DEFAULT_COMMON_ITEMS];
      state.etcItems = [...DEFAULT_ETC_ITEMS];
      state.workers = [...DEFAULT_WORKERS];
      saveLocalMasterData();
    }
  }

  async function loadMasterDataFromDb() {
    if (!isFirestoreActive || !db) return;
    try {
      const metaRef = db.collection('pms_metadata');

      const [commonDoc, etcDoc, workerDoc] = await Promise.all([
        metaRef.doc('common_items').get(),
        metaRef.doc('etc_items').get(),
        metaRef.doc('master_workers').get()
      ]);

      if (commonDoc.exists && Array.isArray(commonDoc.data().items)) {
        const dbItems = commonDoc.data().items;
        // DB에 저장된 내용이 과거 구버전 기본 품목이면 최신 품목으로 DB 갱신
        if (isLegacyDefaultCommonItems(dbItems)) {
          metaRef.doc('common_items').set({ items: state.commonItems });
        } else {
          state.commonItems = dbItems;
        }
      } else {
        metaRef.doc('common_items').set({ items: state.commonItems });
      }

      if (etcDoc.exists && Array.isArray(etcDoc.data().items)) {
        state.etcItems = etcDoc.data().items;
      } else {
        metaRef.doc('etc_items').set({ items: state.etcItems });
      }

      if (workerDoc.exists && Array.isArray(workerDoc.data().workers)) {
        state.workers = workerDoc.data().workers;
      } else {
        metaRef.doc('master_workers').set({ workers: state.workers });
      }

      saveLocalMasterData();
    } catch (err) {
      console.warn('마스터 데이터 DB 로드 오류 (로컬 유지):', err);
    }
  }

  function saveLocalMasterData() {
    localStorage.setItem(STORAGE_KEYS.COMMON_ITEMS, JSON.stringify(state.commonItems));
    localStorage.setItem(STORAGE_KEYS.ETC_ITEMS, JSON.stringify(state.etcItems));
    localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(state.workers));
  }

  async function saveMasterToDb(silent = false) {
    saveLocalMasterData();

    if (isFirestoreActive && db) {
      try {
        const metaRef = db.collection('pms_metadata');
        await Promise.all([
          metaRef.doc('common_items').set({ items: state.commonItems }),
          metaRef.doc('etc_items').set({ items: state.etcItems }),
          metaRef.doc('master_workers').set({ workers: state.workers })
        ]);
        if (!silent) showToast('설정이 DB에 저장되었습니다');
        markAsDirty(false);
      } catch (err) {
        console.error('설정 DB 저장 실패:', err);
        if (!silent) showToast('로컬에 임시 저장되었습니다 (DB 오류)');
      }
    } else {
      if (!silent) showToast('로컬에 저장되었습니다');
      markAsDirty(false);
    }

    renderAll();
  }

  // =========================================================================
  // 6. 생산현황 데이터 관리 및 사이드바 (검정예정일 키 단위)
  // =========================================================================
  function loadLocalInspectionSchedules() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INSP_SCHEDULES);
      state.inspectionSchedules = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.inspectionSchedules = [];
    }
  }

  function saveLocalInspectionSchedules() {
    localStorage.setItem(STORAGE_KEYS.INSP_SCHEDULES, JSON.stringify(state.inspectionSchedules));
  }

  async function loadInspectionSchedulesFromDb() {
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_metadata').doc('inspection_schedules').get();
      if (doc.exists && Array.isArray(doc.data().schedules)) {
        state.inspectionSchedules = doc.data().schedules;
        saveLocalInspectionSchedules();
      }
    } catch (err) {
      console.warn('검정일정 목록 DB 로드 오류:', err);
    }
  }

  function loadLocalInspectionData(targetDate) {
    if (!targetDate) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INSP_DATA_PREFIX + targetDate);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.inspectionStartDate = parsed.startDate || state.inspectionStartDate;
        state.inspectionTargetDate = parsed.targetDate || targetDate;
        // 저장된 dayCount가 있으면 적용, 없으면 기본 10일
        state.inspectionDayCount = parsed.dayCount ? Number(parsed.dayCount) : 10;
        state.inspectionData = {
          process: parsed.process || {},
          assembly: parsed.assembly || {}
        };
      } else {
        // 새 날짜인 경우 무조건 기본 10일로 초기화!
        state.inspectionDayCount = 10;
        state.inspectionData = { process: {}, assembly: {} };
      }
    } catch (e) {
      state.inspectionDayCount = 10;
      state.inspectionData = { process: {}, assembly: {} };
    }
  }

  function saveLocalInspectionData() {
    const payload = {
      targetDate: state.inspectionTargetDate,
      startDate: state.inspectionStartDate,
      dayCount: state.inspectionDayCount || 10,
      process: state.inspectionData.process || {},
      assembly: state.inspectionData.assembly || {},
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.INSP_DATA_PREFIX + state.inspectionTargetDate, JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEYS.LAST_INSP_START, state.inspectionStartDate);
    localStorage.setItem(STORAGE_KEYS.LAST_INSP_TARGET, state.inspectionTargetDate);
  }

  async function loadInspectionDataFromDb(targetDate) {
    if (!targetDate) return;
    loadLocalInspectionData(targetDate);

    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_inspection').doc(targetDate).get();
      if (doc.exists) {
        const data = doc.data();
        state.inspectionStartDate = data.startDate || state.inspectionStartDate;
        state.inspectionTargetDate = targetDate;
        state.inspectionDayCount = data.dayCount ? Number(data.dayCount) : 10;
        state.inspectionData = {
          process: data.process || {},
          assembly: data.assembly || {}
        };
        saveLocalInspectionData();
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.INSP_DATA_PREFIX + targetDate);
        if (!raw) {
          state.inspectionDayCount = 10;
        }
      }
    } catch (err) {
      console.warn('생산현황 DB 조회 실패 (로컬 유지):', err);
    }
  }

  // [생산현황 - 일정저장] 클릭 시 DB 저장
  async function saveInspectionToDb() {
    const targetDate = state.inspectionTargetDate;
    if (!targetDate) {
      alert('검정예정일을 선택해 주세요.');
      return;
    }

    saveLocalInspectionData();

    // 사이드바 일정 목록 갱신 (최근순 정렬)
    const existingIdx = state.inspectionSchedules.findIndex(s => s.targetDate === targetDate);
    const scheduleItem = {
      targetDate: targetDate,
      startDate: state.inspectionStartDate,
      dayCount: state.inspectionDayCount || 10,
      updatedAt: Date.now()
    };

    if (existingIdx >= 0) {
      state.inspectionSchedules[existingIdx] = scheduleItem;
    } else {
      state.inspectionSchedules.push(scheduleItem);
    }

    // 최신 날짜 내림차순 정렬
    state.inspectionSchedules.sort((a, b) => b.targetDate.localeCompare(a.targetDate));
    saveLocalInspectionSchedules();
    renderSidebarSchedules();

    if (isFirestoreActive && db) {
      try {
        await Promise.all([
          db.collection('pms_inspection').doc(targetDate).set({
            targetDate: targetDate,
            startDate: state.inspectionStartDate,
            dayCount: state.inspectionDayCount || 10,
            process: state.inspectionData.process || {},
            assembly: state.inspectionData.assembly || {},
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }),
          db.collection('pms_metadata').doc('inspection_schedules').set({
            schedules: state.inspectionSchedules
          })
        ]);
        showToast(`[${targetDate}] 일정이 DB에 저장되었습니다`);
        markAsDirty(false);
      } catch (err) {
        console.error('생산현황 DB 저장 실패:', err);
        showToast('로컬에 저장되었습니다 (DB 통신 오류)');
      }
    } else {
      showToast(`[${targetDate}] 로컬에 저장되었습니다`);
      markAsDirty(false);
    }

    updateDateStatusPills();
  }

  // 검정예정일 날짜 수정 기능
  async function editScheduleDate(oldTargetDate) {
    const newTargetDate = prompt('새로운 검정예정일 날짜를 입력하세요 (YYYY-MM-DD):', oldTargetDate);
    if (!newTargetDate || !newTargetDate.trim() || newTargetDate.trim() === oldTargetDate) return;

    const trimmedDate = newTargetDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      alert('올바른 날짜 형식(YYYY-MM-DD)으로 입력해 주세요.');
      return;
    }

    // 기존 데이터 로드
    let dataToMove = state.inspectionData;
    const raw = localStorage.getItem(STORAGE_KEYS.INSP_DATA_PREFIX + oldTargetDate);
    if (raw) {
      try { dataToMove = JSON.parse(raw); } catch(e){}
    }

    // 로컬스토리지 이동
    localStorage.removeItem(STORAGE_KEYS.INSP_DATA_PREFIX + oldTargetDate);
    dataToMove.targetDate = trimmedDate;
    localStorage.setItem(STORAGE_KEYS.INSP_DATA_PREFIX + trimmedDate, JSON.stringify(dataToMove));

    // 일정 인덱스 갱신
    const sItem = state.inspectionSchedules.find(s => s.targetDate === oldTargetDate);
    if (sItem) {
      sItem.targetDate = trimmedDate;
      sItem.updatedAt = Date.now();
    }
    state.inspectionSchedules.sort((a, b) => b.targetDate.localeCompare(a.targetDate));
    saveLocalInspectionSchedules();

    // Firestore 처리
    if (isFirestoreActive && db) {
      try {
        await Promise.all([
          db.collection('pms_inspection').doc(trimmedDate).set({
            ...dataToMove,
            targetDate: trimmedDate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }),
          db.collection('pms_inspection').doc(oldTargetDate).delete(),
          db.collection('pms_metadata').doc('inspection_schedules').set({
            schedules: state.inspectionSchedules
          })
        ]);
      } catch (err) {
        console.warn('DB 날짜 이동 실패 (로컬 적용됨):', err);
      }
    }

    if (state.inspectionTargetDate === oldTargetDate) {
      state.inspectionTargetDate = trimmedDate;
      const targetInput = document.getElementById('inspection-target-date');
      if (targetInput) targetInput.value = trimmedDate;
    }

    renderSidebarSchedules();
    renderInspectionTable();
    showToast(`검정예정일이 [${trimmedDate}]로 수정되었습니다`);
  }

  // 검정예정일 삭제 기능
  async function deleteSchedule(targetDate) {
    if (!confirm(`[${targetDate}] 검정일정을 완전히 삭제하시겠습니까?`)) return;

    // 로컬 삭제
    localStorage.removeItem(STORAGE_KEYS.INSP_DATA_PREFIX + targetDate);
    state.inspectionSchedules = state.inspectionSchedules.filter(s => s.targetDate !== targetDate);
    saveLocalInspectionSchedules();

    // Firestore 삭제
    if (isFirestoreActive && db) {
      try {
        await Promise.all([
          db.collection('pms_inspection').doc(targetDate).delete(),
          db.collection('pms_metadata').doc('inspection_schedules').set({
            schedules: state.inspectionSchedules
          })
        ]);
      } catch (err) {
        console.warn('DB 삭제 오류 (로컬 삭제 완료):', err);
      }
    }

    // 만약 현재 열려있던 일정을 삭제했다면
    if (state.inspectionTargetDate === targetDate) {
      if (state.inspectionSchedules.length > 0) {
        const nextTarget = state.inspectionSchedules[0].targetDate;
        state.inspectionTargetDate = nextTarget;
        const targetInput = document.getElementById('inspection-target-date');
        if (targetInput) targetInput.value = nextTarget;
        await loadInspectionDataFromDb(nextTarget);
      } else {
        state.inspectionTargetDate = addDaysStr(getTodayDateString(), 9);
        state.inspectionDayCount = 10;
        state.inspectionData = { process: {}, assembly: {} };
        const targetInput = document.getElementById('inspection-target-date');
        if (targetInput) targetInput.value = state.inspectionTargetDate;
      }
      markAsDirty(false);
    }

    renderSidebarSchedules();
    renderInspectionTable();
    showToast(`[${targetDate}] 일정이 삭제되었습니다`);
  }

  // [+]로 추가된 일정 삭제(1일 축소) 기능
  function removeAddedInspectionDay(indexToRemove = -1) {
    if (state.inspectionDayCount <= 10) {
      alert('기본 10일간 일정은 삭제할 수 없습니다.');
      return;
    }

    const baseDate = state.inspectionStartDate;
    const count = state.inspectionDayCount;
    const targetIdx = (indexToRemove >= 10 && indexToRemove < count) ? indexToRemove : (count - 1);
    const dateStrToDel = addDaysStr(baseDate, targetIdx);

    // 해당 날짜 입력 데이터 정리
    ['process', 'assembly'].forEach(sec => {
      const secData = state.inspectionData[sec] || {};
      Object.keys(secData).forEach(itemId => {
        if (secData[itemId] && secData[itemId].daily) {
          delete secData[itemId].daily[dateStrToDel];
        }
      });
    });

    state.inspectionDayCount--;
    saveLocalInspectionData();
    markAsDirty(true);
    renderInspectionTable();
    showToast(`일정이 ${state.inspectionDayCount}일로 축소되었습니다`);
  }

  // =========================================================================
  // 7. 생산 일정 데이터 관리 (일자별 조립/검사/기타 3개 분할)
  // =========================================================================
  function loadLocalProductionData(dateStr) {
    if (!dateStr) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROD_DATA_PREFIX + dateStr);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.selectedVarWorkerIds = Array.isArray(parsed.selectedVarWorkerIds) ? parsed.selectedVarWorkerIds : [];
        state.productionData = {
          assembly: parsed.assembly || {},
          inspection: parsed.inspection || {},
          etc: parsed.etc || {}
        };
      } else {
        state.selectedVarWorkerIds = [];
        state.productionData = { assembly: {}, inspection: {}, etc: {} };
      }
    } catch (e) {
      state.selectedVarWorkerIds = [];
      state.productionData = { assembly: {}, inspection: {}, etc: {} };
    }
  }

  function saveLocalProductionData() {
    const payload = {
      date: state.productionDate,
      selectedVarWorkerIds: state.selectedVarWorkerIds,
      assembly: state.productionData.assembly || {},
      inspection: state.productionData.inspection || {},
      etc: state.productionData.etc || {},
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.PROD_DATA_PREFIX + state.productionDate, JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEYS.LAST_PROD_DATE, state.productionDate);
  }

  async function loadProductionDataFromDb(dateStr) {
    if (!dateStr) return;
    loadLocalProductionData(dateStr);

    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_production').doc(dateStr).get();
      if (doc.exists) {
        const data = doc.data();
        state.selectedVarWorkerIds = Array.isArray(data.selectedVarWorkerIds) ? data.selectedVarWorkerIds : [];
        state.productionData = {
          assembly: data.assembly || {},
          inspection: data.inspection || {},
          etc: data.etc || {}
        };
        saveLocalProductionData();
      }
    } catch (err) {
      console.warn('생산일정 DB 조회 실패 (로컬 유지):', err);
    }
  }

  // [생산일정 - 일정저장] 클릭 시 DB 저장
  async function saveProductionToDb() {
    const prodDate = state.productionDate;
    if (!prodDate) {
      alert('생산일자를 선택해 주세요.');
      return;
    }

    saveLocalProductionData();

    if (isFirestoreActive && db) {
      try {
        await db.collection('pms_production').doc(prodDate).set({
          date: prodDate,
          selectedVarWorkerIds: state.selectedVarWorkerIds,
          assembly: state.productionData.assembly || {},
          inspection: state.productionData.inspection || {},
          etc: state.productionData.etc || {},
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`[${prodDate}] 생산 일정이 DB에 저장되었습니다`);
        markAsDirty(false);
      } catch (err) {
        console.error('생산일정 DB 저장 실패:', err);
        showToast('로컬에 저장되었습니다 (DB 통신 오류)');
      }
    } else {
      showToast(`[${prodDate}] 로컬에 저장되었습니다`);
      markAsDirty(false);
    }

    updateDateStatusPills();
  }

  // =========================================================================
  // 8. [생산현황] 렌더링 로직 (10일+동적열, Sticky 고정컬럼, 합계 우측정렬)
  // =========================================================================
  const INSPECTION_TABLE_CONFIGS = [
    {
      key: 'process',
      tbodyId: 'inspection-process-tbody',
      headersId: 'inspection-process-date-headers',
      groupId: 'th-insp-process-group',
      tfootId: 'inspection-process-tfoot',
      sumWeeklyId: 'sum-insp-process-weekly',
      sumCompletedId: 'sum-insp-process-completed',
      sumBalanceId: 'sum-insp-process-balance',
      pillWeeklyId: 'pill-insp-process-weekly',
      pillCompletedId: 'pill-insp-process-completed',
      pillBalanceId: 'pill-insp-process-balance'
    },
    {
      key: 'assembly',
      tbodyId: 'inspection-assembly-tbody',
      headersId: 'inspection-assembly-date-headers',
      groupId: 'th-insp-assembly-group',
      tfootId: 'inspection-assembly-tfoot',
      sumWeeklyId: 'sum-insp-assembly-weekly',
      sumCompletedId: 'sum-insp-assembly-completed',
      sumBalanceId: 'sum-insp-assembly-balance',
      pillWeeklyId: 'pill-insp-assembly-weekly',
      pillCompletedId: 'pill-insp-assembly-completed',
      pillBalanceId: 'pill-insp-assembly-balance'
    }
  ];

  function renderInspectionHeaders() {
    const baseDate = state.inspectionStartDate;
    const count = state.inspectionDayCount || 10;

    const rangeBadge = document.getElementById('insp-date-range-badge');
    if (rangeBadge) rangeBadge.textContent = `${count}일간 일정`;

    // 10일 초과 시 '-' 버튼 표시
    const subBtns = document.querySelectorAll('.btn-remove-day-trigger');
    subBtns.forEach(btn => {
      btn.style.display = (count > 10) ? 'inline-flex' : 'none';
    });

    INSPECTION_TABLE_CONFIGS.forEach(conf => {
      const headerRow = document.getElementById(conf.headersId);
      const groupTh = document.getElementById(conf.groupId);
      if (groupTh) groupTh.colSpan = count;
      if (!headerRow) return;

      headerRow.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const dateObj = addDays(baseDate, i);
        const dayOfWeekIdx = dateObj.getDay();
        const dayName = DAYS_OF_WEEK[dayOfWeekIdx];
        const mm = dateObj.getMonth() + 1;
        const dd = dateObj.getDate();

        const th = document.createElement('th');
        th.className = 'th-date';
        if (dayOfWeekIdx === 6) th.classList.add('is-sat');
        if (dayOfWeekIdx === 0) th.classList.add('is-sun');

        // 10일 이후의 추가된 날짜에는 삭제 x 버튼 제공
        if (i >= 10) {
          th.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:2px;">
              <span class="date-main">${mm}/${dd}</span>
              <button type="button" class="btn-del-col-x btn-remove-col-click" data-date-idx="${i}" title="이 날짜 삭제">×</button>
            </div>
            <span class="date-sub">(${dayName})</span>
          `;
        } else {
          th.innerHTML = `
            <span class="date-main">${mm}/${dd}</span>
            <span class="date-sub">(${dayName})</span>
          `;
        }

        headerRow.appendChild(th);
      }
    });
  }

  function renderInspectionTable() {
    if (typeof renderInspectionV2 === 'function') {
      renderInspectionV2();
      return;
    }
    renderInspectionHeaders();

    const items = state.commonItems;
    const count = state.inspectionDayCount || 10;
    const baseDate = state.inspectionStartDate;

    INSPECTION_TABLE_CONFIGS.forEach(conf => {
      const tbody = document.getElementById(conf.tbodyId);
      if (!tbody) return;

      const secData = state.inspectionData[conf.key] || {};
      tbody.innerHTML = '';

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${5 + count + 1}" style="text-align: center; padding: 25px; color: #94a3b8;">등록된 품목이 없습니다. [설정]에서 품목을 추가해 주세요.</td></tr>`;
        return;
      }

      items.forEach((item, idx) => {
        const itemRecord = secData[item.id] || { weekly: 0, daily: {} };
        const weekly = itemRecord.weekly || 0;
        const dailyMap = itemRecord.daily || {};

        let completed = 0;
        for (let i = 0; i < count; i++) {
          const dStr = addDaysStr(baseDate, i);
          completed += parseSafeInt(dailyMap[dStr]);
        }
        const balance = weekly - completed;

        const tr = document.createElement('tr');
        tr.dataset.itemId = item.id;
        tr.dataset.section = conf.key;

        // 좌측 고정 열들 (NO, 품명 가운데 정렬, 주간/완료/잔량 헤더 가운데/숫자 우측)
        let html = `
          <td class="col-fixed-no col-no" style="text-align: center;">${idx + 1}</td>
          <td class="col-fixed-item col-item" style="text-align: center;" title="${item.name}">${item.name}</td>
          <td class="col-fixed-weekly col-weekly">
            <input type="text" class="cell-input text-right input-weekly-qty num-cell"
                   data-item-id="${item.id}" data-section="${conf.key}"
                   value="${formatNumberDisplay(weekly)}" placeholder="" inputmode="numeric">
          </td>
          <td class="col-fixed-completed col-completed calc-cell completed num-cell" id="completed-${conf.key}-${item.id}">
            ${formatNumberDisplay(completed)}
          </td>
          <td class="col-fixed-balance col-balance calc-cell num-cell text-danger" id="balance-${conf.key}-${item.id}">
            ${formatNumberDisplay(balance)}
          </td>
        `;

        // 10일+ 날짜별 생산량 입력 셀들
        for (let i = 0; i < count; i++) {
          const curDateObj = addDays(baseDate, i);
          const curDateStr = addDaysStr(baseDate, i);
          const dayIdx = curDateObj.getDay();
          const isWeekend = (dayIdx === 0 || dayIdx === 6);
          const val = dailyMap[curDateStr] || 0;

          const cellClass = dayIdx === 6 ? 'td-sat' : (dayIdx === 0 ? 'td-sun' : '');

          if (isWeekend) {
            html += `
              <td class="num-cell ${cellClass}" style="text-align: center;">
                <input type="text" class="cell-input text-right is-weekend-locked num-cell" disabled value="" title="주말 입력 차단">
              </td>
            `;
          } else {
            html += `
              <td class="num-cell ${cellClass}">
                <input type="text" class="cell-input text-right input-daily-qty num-cell"
                       data-item-id="${item.id}" data-section="${conf.key}" data-date="${curDateStr}"
                       value="${formatNumberDisplay(val)}" placeholder="" inputmode="numeric">
              </td>
            `;
          }
        }

        // '+' 헤더 아래 빈 TD
        html += `<td class="summary-empty" style="background-color: #fafafa;"></td>`;

        tr.innerHTML = html;
        tbody.appendChild(tr);
      });
    });

    updateAllInspectionCalculations();
  }

  function updateAllInspectionCalculations() {
    const count = state.inspectionDayCount || 10;
    const baseDate = state.inspectionStartDate;

    INSPECTION_TABLE_CONFIGS.forEach(conf => {
      const secData = state.inspectionData[conf.key] || {};
      let totalWeekly = 0;
      let totalCompleted = 0;
      const dailyTotals = new Array(count).fill(0);

      state.commonItems.forEach(item => {
        const itemRecord = secData[item.id] || { weekly: 0, daily: {} };
        const weekly = parseSafeInt(itemRecord.weekly);
        totalWeekly += weekly;

        let itemCompleted = 0;
        for (let i = 0; i < count; i++) {
          const dStr = addDaysStr(baseDate, i);
          const val = parseSafeInt((itemRecord.daily || {})[dStr]);
          itemCompleted += val;
          dailyTotals[i] += val;
        }

        totalCompleted += itemCompleted;
        const balance = weekly - itemCompleted;

        const compCell = document.getElementById(`completed-${conf.key}-${item.id}`);
        if (compCell) compCell.textContent = formatNumberDisplay(itemCompleted);

        const balCell = document.getElementById(`balance-${conf.key}-${item.id}`);
        if (balCell) balCell.textContent = formatNumberDisplay(balance);
      });

      const totalBalance = totalWeekly - totalCompleted;

      // 합계 푸터 렌더링
      const sumWeeklyEl = document.getElementById(conf.sumWeeklyId);
      if (sumWeeklyEl) sumWeeklyEl.textContent = formatNumberDisplay(totalWeekly);

      const sumCompletedEl = document.getElementById(conf.sumCompletedId);
      if (sumCompletedEl) sumCompletedEl.textContent = formatNumberDisplay(totalCompleted);

      const sumBalanceEl = document.getElementById(conf.sumBalanceId);
      if (sumBalanceEl) sumBalanceEl.textContent = formatNumberDisplay(totalBalance);

      // 상단 요약 알약 배지
      const pillWk = document.getElementById(conf.pillWeeklyId);
      if (pillWk) pillWk.textContent = formatNumberDisplay(totalWeekly);

      const pillComp = document.getElementById(conf.pillCompletedId);
      if (pillComp) pillComp.textContent = formatNumberDisplay(totalCompleted);

      const pillBal = document.getElementById(conf.pillBalanceId);
      if (pillBal) pillBal.textContent = formatNumberDisplay(totalBalance);

      // 동적 일자별 합계 푸터 행 재구성
      const tfootRow = document.getElementById(conf.tfootId);
      if (tfootRow) {
        const staticCells = tfootRow.querySelectorAll('.col-fixed-no, .col-fixed-item, .col-fixed-weekly, .col-fixed-completed, .col-fixed-balance');
        tfootRow.innerHTML = '';
        staticCells.forEach(c => tfootRow.appendChild(c));

        for (let i = 0; i < count; i++) {
          const curDateObj = addDays(baseDate, i);
          const dayIdx = curDateObj.getDay();
          const cellClass = dayIdx === 6 ? 'td-sat' : (dayIdx === 0 ? 'td-sun' : '');

          const td = document.createElement('td');
          td.className = `num-cell font-bold ${cellClass}`;
          td.style.textAlign = 'right';
          td.style.paddingRight = '8px';
          td.textContent = formatNumberDisplay(dailyTotals[i]);
          tfootRow.appendChild(td);
        }

        const emptyTd = document.createElement('td');
        emptyTd.className = 'summary-empty';
        tfootRow.appendChild(emptyTd);
      }
    });
  }

  // =========================================================================
  // 9. [생산 일정] 렌더링 로직 (조립 / 검사 / 기타 3개 분할 및 고정/변동 작업자)
  // =========================================================================
  const PRODUCTION_SECTIONS = [
    {
      key: 'assembly',
      tableId: 'prod-table-assembly',
      tbodyId: 'prod-tbody-assembly',
      headersId: 'prod-worker-headers-assembly',
      groupId: 'th-workers-assembly',
      tfootId: 'prod-tfoot-assembly',
      sumQtyId: 'sum-prod-assembly-qty',
      sumQtyPillId: 'sum-prod-assembly-qty-pill',
      sumHoursPillId: 'sum-prod-assembly-hours-pill'
    },
    {
      key: 'inspection',
      tableId: 'prod-table-inspection',
      tbodyId: 'prod-tbody-inspection',
      headersId: 'prod-worker-headers-inspection',
      groupId: 'th-workers-inspection',
      tfootId: 'prod-tfoot-inspection',
      sumQtyId: 'sum-prod-inspection-qty',
      sumQtyPillId: 'sum-prod-inspection-qty-pill',
      sumHoursPillId: 'sum-prod-inspection-hours-pill'
    },
    {
      key: 'etc',
      tableId: 'prod-table-etc',
      tbodyId: 'prod-tbody-etc',
      headersId: 'prod-worker-headers-etc',
      groupId: 'th-workers-etc',
      tfootId: 'prod-tfoot-etc',
      sumQtyId: 'sum-prod-etc-qty',
      sumQtyPillId: 'sum-prod-etc-qty-pill',
      sumHoursPillId: 'sum-prod-etc-hours-pill'
    }
  ];

  function getActiveWorkersForProduction() {
    const fixedWorkers = state.workers.filter(w => (w.type || 'fixed') === 'fixed');
    const variableWorkers = state.workers.filter(w => w.type === 'variable' && state.selectedVarWorkerIds.includes(w.id));
    return [...fixedWorkers, ...variableWorkers];
  }

  function renderVariableWorkerSelector() {
    const selectEl = document.getElementById('select-add-var-worker');
    const chipContainer = document.getElementById('variable-workers-chip-container');
    if (!selectEl || !chipContainer) return;

    const allVarWorkers = state.workers.filter(w => w.type === 'variable');
    selectEl.innerHTML = '<option value="">+ 변동 작업자 투입...</option>';
    allVarWorkers.forEach(w => {
      const isSelected = state.selectedVarWorkerIds.includes(w.id);
      if (!isSelected) {
        selectEl.innerHTML += `<option value="${w.id}">${w.name}</option>`;
      }
    });

    chipContainer.innerHTML = '';
    state.selectedVarWorkerIds.forEach(id => {
      const worker = state.workers.find(w => w.id === id);
      if (!worker) return;

      const chip = document.createElement('span');
      chip.className = 'worker-chip';
      chip.innerHTML = `
        <span>${worker.name}</span>
        <button type="button" class="chip-remove-btn" data-worker-id="${worker.id}" title="제거">×</button>
      `;
      chipContainer.appendChild(chip);
    });
  }

  function renderProductionTable() {
    if (typeof renderProductionV2 === 'function') {
      renderProductionV2();
      return;
    }
    renderVariableWorkerSelector();

    const activeWorkers = getActiveWorkersForProduction();
    const workerCount = Math.max(activeWorkers.length, 1);

    PRODUCTION_SECTIONS.forEach(sec => {
      const groupTh = document.getElementById(sec.groupId);
      if (groupTh) groupTh.colSpan = workerCount;

      const headersRow = document.getElementById(sec.headersId);
      if (headersRow) {
        headersRow.innerHTML = '';
        if (activeWorkers.length === 0) {
          headersRow.innerHTML = '<th class="col-worker-time" style="color:#94a3b8;">작업자 없음</th>';
        } else {
          activeWorkers.forEach(w => {
            const isVar = w.type === 'variable';
            const badge = isVar ? '<span class="worker-badge-var">변동</span>' : '<span class="worker-badge-fixed">고정</span>';
            const th = document.createElement('th');
            th.className = 'col-worker-time';
            th.innerHTML = `${w.name} ${badge}`;
            headersRow.appendChild(th);
          });
        }
      }

      const tbody = document.getElementById(sec.tbodyId);
      if (!tbody) return;

      tbody.innerHTML = '';
      const items = (sec.key === 'etc') ? state.etcItems : state.commonItems;
      const secData = state.productionData[sec.key] || {};

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${5 + workerCount}" style="text-align: center; padding: 25px; color: #94a3b8;">등록된 품목이 없습니다. [설정]에서 품목을 등록해 주세요.</td></tr>`;
        return;
      }

      items.forEach((item, idx) => {
        const rowData = secData[item.id] || { note: '', lotNo: '', qty: 0, workerHours: {} };
        const tr = document.createElement('tr');
        tr.dataset.itemId = item.id;
        tr.dataset.section = sec.key;

        // 모든 셀의 placeholder를 깨끗한 빈칸("")으로 처리
        let html = `
          <td class="col-no" style="text-align: center;">${idx + 1}</td>
          <td class="col-item-prod font-bold" style="text-align: center;" title="${item.name}">${item.name}</td>
          <td class="col-note">
            <input type="text" class="cell-input input-prod-note"
                   data-section="${sec.key}" data-item-id="${item.id}"
                   value="${rowData.note || ''}" placeholder="">
          </td>
          <td class="col-lot">
            <input type="text" class="cell-input text-center input-prod-lot code-font font-bold text-primary"
                   data-section="${sec.key}" data-item-id="${item.id}"
                   value="${rowData.lotNo || ''}" placeholder="">
          </td>
          <td class="col-qty">
            <input type="text" class="cell-input text-right input-prod-qty num-cell font-bold"
                   data-section="${sec.key}" data-item-id="${item.id}"
                   value="${formatNumberDisplay(rowData.qty)}" placeholder="" inputmode="numeric">
          </td>
        `;

        if (activeWorkers.length === 0) {
          html += '<td class="col-worker-time num-cell" style="background:#fafafa;"></td>';
        } else {
          activeWorkers.forEach(w => {
            const hVal = (rowData.workerHours || {})[w.id] || 0;
            html += `
              <td class="col-worker-time num-cell">
                <input type="text" class="cell-input text-right input-worker-hour num-cell"
                       data-section="${sec.key}" data-item-id="${item.id}" data-worker-id="${w.id}"
                       value="${formatFloatDisplay(hVal)}" placeholder="" inputmode="decimal">
              </td>
            `;
          });
        }

        tr.innerHTML = html;
        tbody.appendChild(tr);
      });
    });

    calculateProductionTotals();
  }

  function calculateProductionTotals() {
    const activeWorkers = getActiveWorkersForProduction();

    PRODUCTION_SECTIONS.forEach(sec => {
      const items = (sec.key === 'etc') ? state.etcItems : state.commonItems;
      const secData = state.productionData[sec.key] || {};

      let totalQty = 0;
      let totalHours = 0;
      const workerHourTotals = {};
      activeWorkers.forEach(w => { workerHourTotals[w.id] = 0; });

      items.forEach(item => {
        const row = secData[item.id] || { qty: 0, workerHours: {} };
        totalQty += parseSafeInt(row.qty);

        activeWorkers.forEach(w => {
          const h = parseSafeFloat((row.workerHours || {})[w.id]);
          workerHourTotals[w.id] += h;
          totalHours += h;
        });
      });

      const sumQtyEl = document.getElementById(sec.sumQtyId);
      if (sumQtyEl) sumQtyEl.textContent = formatNumberDisplay(totalQty);

      const pillQty = document.getElementById(sec.sumQtyPillId);
      if (pillQty) pillQty.textContent = formatNumberDisplay(totalQty);

      const pillHours = document.getElementById(sec.sumHoursPillId);
      if (pillHours) pillHours.textContent = `${totalHours.toFixed(1)}h`;

      const tfootRow = document.getElementById(sec.tfootId);
      if (tfootRow) {
        const staticCells = tfootRow.querySelectorAll('.col-no, .col-item-prod, .col-note, .col-lot, .col-qty');
        tfootRow.innerHTML = '';
        staticCells.forEach(c => tfootRow.appendChild(c));

        if (activeWorkers.length === 0) {
          const td = document.createElement('td');
          td.className = 'summary-empty';
          tfootRow.appendChild(td);
        } else {
          activeWorkers.forEach(w => {
            const td = document.createElement('td');
            td.className = 'col-worker-time num-cell font-bold';
            td.style.textAlign = 'right';
            td.style.paddingRight = '8px';
            td.textContent = formatFloatDisplay(workerHourTotals[w.id]);
            tfootRow.appendChild(td);
          });
        }
      }
    });
  }

  // =========================================================================
  // 10. [설정] 렌더링, 인라인 수정 (그 자리에서 수정) 및 드래그앤드롭
  // =========================================================================
  function renderMasterData() {
    renderMasterCommonItems();
    renderMasterEtcItems();
    renderMasterWorkers();
  }

  function renderMasterCommonItems() {
    const tbody = document.getElementById('master-common-items-tbody');
    const badge = document.getElementById('count-common-items-badge');
    if (badge) badge.textContent = `${state.commonItems.length}개`;
    if (!tbody) return;

    tbody.innerHTML = '';
    state.commonItems.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'draggable-row';
      tr.draggable = true;
      tr.dataset.dragIndex = idx;
      tr.dataset.dragType = 'commonItems';
      tr.dataset.id = item.id;

      tr.innerHTML = `
        <td style="text-align: center; color: #94a3b8; font-weight: 700;">
          <span class="drag-handle" title="끌어서 순서 변경">☰</span>${idx + 1}
        </td>
        <td class="master-name-cell font-bold text-slate-800">${item.name}</td>
        <td style="text-align: center;">
          <div class="action-btn-group">
            <button type="button" class="btn btn-xs btn-outline btn-edit-common" data-id="${item.id}">수정</button>
            <button type="button" class="btn btn-xs btn-ghost text-danger btn-del-common" data-id="${item.id}">삭제</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    bindDragAndDropEvents(tbody, 'commonItems');
  }

  function renderMasterEtcItems() {
    const tbody = document.getElementById('master-etc-items-tbody');
    const badge = document.getElementById('count-etc-items-badge');
    if (badge) badge.textContent = `${state.etcItems.length}개`;
    if (!tbody) return;

    tbody.innerHTML = '';
    state.etcItems.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'draggable-row';
      tr.draggable = true;
      tr.dataset.dragIndex = idx;
      tr.dataset.dragType = 'etcItems';
      tr.dataset.id = item.id;

      tr.innerHTML = `
        <td style="text-align: center; color: #94a3b8; font-weight: 700;">
          <span class="drag-handle" title="끌어서 순서 변경">☰</span>${idx + 1}
        </td>
        <td class="master-name-cell font-bold text-slate-800">${item.name}</td>
        <td style="text-align: center;">
          <div class="action-btn-group">
            <button type="button" class="btn btn-xs btn-outline btn-edit-etc" data-id="${item.id}">수정</button>
            <button type="button" class="btn btn-xs btn-ghost text-danger btn-del-etc" data-id="${item.id}">삭제</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    bindDragAndDropEvents(tbody, 'etcItems');
  }

  function renderMasterWorkers() {
    const tbody = document.getElementById('master-workers-tbody');
    const badge = document.getElementById('count-workers-badge');
    if (badge) badge.textContent = `${state.workers.length}명`;
    if (!tbody) return;

    tbody.innerHTML = '';
    state.workers.forEach((worker, idx) => {
      const wGroup = worker.group || '감지기반';
      const tr = document.createElement('tr');
      tr.className = 'draggable-row';
      tr.draggable = true;
      tr.dataset.dragIndex = idx;
      tr.dataset.dragType = 'workers';
      tr.dataset.id = worker.id;

      tr.innerHTML = `
        <td style="text-align: center; color: #94a3b8; font-weight: 700;">
          <span class="drag-handle" title="끌어서 순서 변경">☰</span>${idx + 1}
        </td>
        <td class="master-name-cell font-bold text-slate-800">${worker.name}</td>
        <td style="text-align: center;">
          <select class="worker-group-select form-select form-select-sm" data-worker-id="${worker.id}" style="height:26px; font-size:12px;">
            <option value="감지기반" ${wGroup === '감지기반' ? 'selected' : ''}>감지기반</option>
            <option value="유도등반" ${wGroup === '유도등반' ? 'selected' : ''}>유도등반</option>
            <option value="수신기반" ${wGroup === '수신기반' ? 'selected' : ''}>수신기반</option>
          </select>
        </td>
        <td style="text-align: center;">
          <div class="action-btn-group">
            <button type="button" class="btn btn-xs btn-outline btn-edit-worker" data-id="${worker.id}">수정</button>
            <button type="button" class="btn btn-xs btn-ghost text-danger btn-del-worker" data-id="${worker.id}">삭제</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // 작업반별 일정 공정 기본설정 동기화
    document.querySelectorAll('.line-proc-select').forEach(sel => {
      const ln = sel.dataset.line;
      if (state.lineProcConfig && state.lineProcConfig[ln]) {
        sel.value = state.lineProcConfig[ln];
      }
    });

    bindDragAndDropEvents(tbody, 'workers');
  }

  // 품명이 등록되어 있는 자리에서 인라인 수정 (팝업창 없이 직접 수정)
  function startMasterInlineEdit(listKey, id, tr) {
    const item = state[listKey].find(x => x.id === id);
    if (!item) return;

    const nameTd = tr.querySelector('.master-name-cell');
    const actionGroup = tr.querySelector('.action-btn-group');
    if (!nameTd || !actionGroup) return;

    const originalName = item.name;
    nameTd.innerHTML = `<input type="text" class="master-edit-input" value="${originalName}">`;
    const input = nameTd.querySelector('input');
    input.focus();
    input.select();

    actionGroup.innerHTML = `
      <button type="button" class="btn btn-xs btn-primary btn-save-inline" data-id="${id}">완료</button>
      <button type="button" class="btn btn-xs btn-ghost btn-cancel-inline" data-id="${id}">취소</button>
    `;

    let isCommitted = false;

    function commit() {
      if (isCommitted) return;
      isCommitted = true;
      const newName = input.value.trim();
      if (newName && newName !== originalName) {
        item.name = newName;
        saveLocalMasterData();
        saveMasterToDb(true);
        markAsDirty(true);
        showToast(`'${newName}'(으)로 수정되었습니다`);
      }
      renderMasterData();
      renderInspectionTable();
      renderProductionTable();
    }

    function cancel() {
      if (isCommitted) return;
      isCommitted = true;
      renderMasterData();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });

    const saveBtn = actionGroup.querySelector('.btn-save-inline');
    if (saveBtn) saveBtn.addEventListener('click', (e) => { e.stopPropagation(); commit(); });

    const cancelBtn = actionGroup.querySelector('.btn-cancel-inline');
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cancel(); });
  }

  // 드래그 앤 드롭
  let draggedElement = null;

  function bindDragAndDropEvents(container, listKey) {
    const rows = container.querySelectorAll('.draggable-row');

    rows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        draggedElement = row;
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.dragIndex);
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetRow = e.currentTarget;
        if (targetRow && targetRow !== draggedElement) {
          const rect = targetRow.getBoundingClientRect();
          const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
          targetRow.classList.toggle('drag-over-bottom', next);
          targetRow.classList.toggle('drag-over-top', !next);
        }
      });

      row.addEventListener('dragleave', (e) => {
        e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
        if (!draggedElement || draggedElement === e.currentTarget) return;

        const fromIdx = parseInt(draggedElement.dataset.dragIndex, 10);
        let toIdx = parseInt(e.currentTarget.dataset.dragIndex, 10);

        const rect = e.currentTarget.getBoundingClientRect();
        const dropBelow = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        if (dropBelow && toIdx < fromIdx) toIdx++;
        if (!dropBelow && toIdx > fromIdx) toIdx--;

        const targetList = state[listKey];
        if (fromIdx !== toIdx && targetList) {
          const movedItem = targetList.splice(fromIdx, 1)[0];
          targetList.splice(toIdx, 0, movedItem);

          saveLocalMasterData();
          saveMasterToDb(true);
          markAsDirty(true);

          if (listKey === 'commonItems') {
            renderMasterCommonItems();
            renderInspectionTable();
            renderProductionTable();
          } else if (listKey === 'etcItems') {
            renderMasterEtcItems();
            renderProductionTable();
          } else if (listKey === 'workers') {
            renderMasterWorkers();
            renderProductionTable();
          }
        }
      });

      row.addEventListener('dragend', () => {
        if (draggedElement) draggedElement.classList.remove('is-dragging');
        rows.forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        draggedElement = null;
      });
    });
  }

  // =========================================================================
  // 11. 사이드바 (연도/월 필터, 최근 일자순, 일정 날짜 수정 및 삭제 기능)
  // =========================================================================
  function renderSidebarSchedules() {
    if (typeof renderSidebarSchedulesV2 === 'function') {
      renderSidebarSchedulesV2();
      return;
    }
    const listContainer = document.getElementById('inspection-schedule-list');
    const countBadge = document.getElementById('insp-schedule-count');
    const yearSelect = document.getElementById('filter-insp-year');
    const monthSelect = document.getElementById('filter-insp-month');
    if (!listContainer) return;

    const schedules = state.inspectionSchedules || [];
    if (countBadge) countBadge.textContent = `${schedules.length}개`;

    // 1. 연도 드롭다운 필터 옵션 구성
    if (yearSelect) {
      const currentYearVal = yearSelect.value || 'ALL';
      const years = Array.from(new Set(schedules.map(s => s.targetDate.split('-')[0]))).sort().reverse();
      const currentYearStr = String(new Date().getFullYear());
      if (!years.includes(currentYearStr)) years.unshift(currentYearStr);

      yearSelect.innerHTML = '<option value="ALL">전체 연도</option>';
      years.forEach(y => {
        yearSelect.innerHTML += `<option value="${y}" ${y === currentYearVal ? 'selected' : ''}>${y}년</option>`;
      });
    }

    // 2. 필터링 (연도 & 월)
    const selYear = yearSelect ? yearSelect.value : 'ALL';
    const selMonth = monthSelect ? monthSelect.value : 'ALL';

    const filtered = schedules.filter(s => {
      const [y, m] = s.targetDate.split('-');
      if (selYear !== 'ALL' && y !== selYear) return false;
      if (selMonth !== 'ALL' && parseInt(m, 10) !== parseInt(selMonth, 10)) return false;
      return true;
    });

    listContainer.innerHTML = '';
    if (filtered.length === 0) {
      listContainer.innerHTML = `<div class="schedule-empty-msg">해당 기간의 일정이 없습니다.<br>[일정저장]을 눌러 추가하세요.</div>`;
      return;
    }

    const todayStr = getTodayDateString();

    filtered.forEach(item => {
      const btn = document.createElement('div');
      btn.className = `schedule-item-btn ${item.targetDate === state.inspectionTargetDate ? 'active' : ''}`;
      btn.dataset.targetDate = item.targetDate;

      const dateObj = new Date(item.targetDate + 'T00:00:00');
      const dayName = DAYS_OF_WEEK[dateObj.getDay()];
      const isToday = item.targetDate === todayStr;

      btn.innerHTML = `
        <div class="schedule-item-wrap">
          <div class="schedule-item-info">
            <div class="schedule-date-text">
              <span>${item.targetDate} (${dayName})</span>
              ${isToday ? '<span class="schedule-badge-today">오늘</span>' : ''}
            </div>
            <div class="schedule-sub-text">
              시작일: ${item.startDate || '-'} (${item.dayCount || 10}일간)
            </div>
          </div>
          <div class="schedule-item-actions">
            <button type="button" class="btn-schedule-action btn-schedule-edit" data-target-date="${item.targetDate}" title="검정예정일 날짜 수정">수정</button>
            <button type="button" class="btn-schedule-action btn-schedule-del" data-target-date="${item.targetDate}" title="일정 삭제">삭제</button>
          </div>
        </div>
      `;

      // 아이템 본체 클릭 시 일정 불러오기
      btn.addEventListener('click', async (e) => {
        if (e.target.closest('.schedule-item-actions')) return; // 수정/삭제 클릭 시 일정 전환 방지

        if (state.isDirty) {
          const conf = confirm('저장되지 않은 변경사항이 있습니다. 저장하지 않고 다른 일정을 불러오시겠습니까?');
          if (!conf) return;
        }

        state.inspectionTargetDate = item.targetDate;
        state.inspectionStartDate = item.startDate || state.inspectionStartDate;
        state.inspectionDayCount = item.dayCount ? Number(item.dayCount) : 10;

        const dateInput = document.getElementById('inspection-date');
        const targetInput = document.getElementById('inspection-target-date');
        if (dateInput) dateInput.value = state.inspectionStartDate;
        if (targetInput) targetInput.value = state.inspectionTargetDate;

        await loadInspectionDataFromDb(item.targetDate);
        markAsDirty(false);
        renderSidebarSchedules();
        renderInspectionTable();
      });

      listContainer.appendChild(btn);
    });
  }

  // =========================================================================
  // 12. 전체 화면 렌더링
  // =========================================================================
  function renderAll() {
    const inspDateEl = document.getElementById('inspection-date');
    if (inspDateEl) inspDateEl.value = state.inspectionStartDate;

    const inspTargetEl = document.getElementById('inspection-target-date');
    if (inspTargetEl) inspTargetEl.value = state.inspectionTargetDate;

    const prodDateEl = document.getElementById('production-date');
    if (prodDateEl) prodDateEl.value = state.productionDate;

    renderSidebarSchedules();
    renderInspectionTable();
    renderProductionTable();
    renderMasterData();
    updateDateStatusPills();

    // 검정현황 및 신규 마스터 렌더링
    renderCertificationModule();
    renderCertMasterTable();
    renderDepartmentSettings();
    updateKfiUploadSummary();
  }

  // =========================================================================
  // 13. 이벤트 리스너 바인딩
  // =========================================================================
  function initEventListeners() {
    // -------------------------------------------------------------
    // (A) 브라우저 이탈 방지 경고 (beforeunload)
    // -------------------------------------------------------------
    window.addEventListener('beforeunload', (e) => {
      if (state.isDirty) {
        e.preventDefault();
        e.returnValue = '저장되지 않은 변경사항이 있습니다. 나가시겠습니까?';
        return e.returnValue;
      }
    });

    // -------------------------------------------------------------
    // (B) 인풋 포커스 시 자동 전체 선택 (기존 값 즉시 덮어쓰기 지원)
    // -------------------------------------------------------------
    document.addEventListener('focusin', (e) => {
      const target = e.target;
      if (target && target.tagName === 'INPUT' && (
        target.classList.contains('input-daily-qty') ||
        target.classList.contains('input-weekly-qty') ||
        target.classList.contains('input-prod-qty') ||
        target.classList.contains('input-worker-hour') ||
        target.classList.contains('input-prod-lot') ||
        target.classList.contains('input-prod-note')
      )) {
        setTimeout(() => {
          target.select();
        }, 30);
      }
    });

    document.addEventListener('mouseup', (e) => {
      const target = e.target;
      if (target && target.tagName === 'INPUT' && (
        target.classList.contains('input-daily-qty') ||
        target.classList.contains('input-weekly-qty') ||
        target.classList.contains('input-prod-qty') ||
        target.classList.contains('input-worker-hour')
      )) {
        if (document.activeElement === target && target.selectionStart === target.selectionEnd) {
          target.select();
        }
      }
    });

    // -------------------------------------------------------------
    // (C) 글로벌 통합 저장 버튼 & 7대 탭 / 트리 네비게이션
    // -------------------------------------------------------------
    const btnGlobalSave = document.getElementById('btn-global-save');
    if (btnGlobalSave) {
      btnGlobalSave.addEventListener('click', async () => {
        if (btnGlobalSave.disabled) return;
        btnGlobalSave.disabled = true;
        const textSpan = btnGlobalSave.querySelector('.btn-save-text');
        if (textSpan) textSpan.textContent = '저장 중...';

        try {
          if (state.currentTab === 'tab-plan') {
            await savePlanToDb();
          } else if (state.currentTab === 'tab-inspection') {
            await saveInspectionV2ToDb();
          } else if (state.currentTab === 'tab-production') {
            await saveDailyV2ToDb();
          } else if (state.currentTab === 'tab-certification') {
            const btnCertSave = document.getElementById('btn-cert-save');
            if (btnCertSave) {
              btnCertSave.click();
            } else {
              showToast('검정현황이 저장되었습니다');
            }
          } else if (state.currentTab === 'tab-quality') {
            await saveQualityRowsToDb();
            showToast('품질검사 내역이 저장되었습니다');
          } else if (state.currentTab === 'tab-settings') {
            const btnSaveMaster = document.getElementById('btn-save-master');
            if (btnSaveMaster) {
              btnSaveMaster.click();
            } else {
              showToast('설정이 저장되었습니다');
            }
          } else {
            showToast('현재 화면 내용이 저장되었습니다');
          }
          markAsDirty(false);
        } catch (err) {
          console.error('글로벌 저장 오류:', err);
          showToast('저장 처리 중 오류가 발생했습니다');
        } finally {
          btnGlobalSave.disabled = false;
          updateGlobalSaveButton();
        }
      });
    }

    async function activateTab(tabId) {
      if (!tabId) return false;

      // 미저장 데이터 확인 (작성 중인 데이터 보호)
      if (state.isDirty && (state.currentTab === 'tab-inspection' || state.currentTab === 'tab-production')) {
        const proceed = confirm('저장되지 않은 변경사항이 있습니다. 다른 탭으로 이동하시겠습니까?');
        if (!proceed) return false;
      }

      // 1) 모든 탭 버튼 상태 리셋
      const allTabBtns = document.querySelectorAll('.nav-tab');
      allTabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });

      // 2) 모든 탭 패널 숨김
      const allPanes = document.querySelectorAll('.tab-pane');
      allPanes.forEach(p => p.classList.remove('active'));

      // 3) 대상 탭 버튼 및 패널 활성화
      const targetBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
      if (targetBtn) {
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-selected', 'true');
      }

      const targetPane = document.getElementById(tabId);
      if (targetPane) {
        targetPane.classList.add('active');
      } else {
        console.warn(`[PMS] 대상 탭 패널을 찾을 수 없습니다: #${tabId}`);
      }

      state.currentTab = tabId;
      markAsDirty(false);

      // 4) 탭별 데이터 렌더링 (예외 발생 시에도 화면 전환 상태는 유지)
      try {
        if (tabId === 'tab-plan') {
          renderPlanModule();
        } else if (tabId === 'tab-production') {
          await loadProductionDataFromDb(state.productionDate);
          await loadDailyV2FromDb(state.productionDate);
          renderProductionTable();
        } else if (tabId === 'tab-inspection') {
          renderSidebarSchedules();
          renderInspectionTable();
        } else if (tabId === 'tab-certification') {
          if ((state.certMode || 'auto') === 'auto' && !(state.certDraftRows || []).some(r => r.sourceWeekId || (r.name && r.name.trim()))) {
            populateCertPlanWeekSelect();
            loadCertDraftFromPlanWeek(state.certSelectedWeekId || 'W1', state.certAutoLineFilter || 'ALL');
          }
          renderCertificationModule();
        } else if (tabId === 'tab-attendance') {
          renderAttendanceModule();
        } else if (tabId === 'tab-quality') {
          renderQualityTable();
        } else if (tabId === 'tab-settings') {
          renderMasterData();
          renderCertMasterTable();
          renderDepartmentSettings();
          updateKfiUploadSummary();
          renderAttendanceTypeSettings();
        }
      } catch (renderErr) {
        console.error(`[PMS] 탭(${tabId}) 렌더링 중 오류 발생:`, renderErr);
      }

      return true;
    }

    // 전역 및 디버그용 노출
    window.activateTab = activateTab;

    // 네비게이션 탭 이벤트 바인딩 (이벤트 위임 방식 도입으로 무결성 보장)
    const navTabsContainer = document.querySelector('.nav-tabs');
    if (navTabsContainer) {
      navTabsContainer.addEventListener('click', async (e) => {
        const tabBtn = e.target.closest('.nav-tab');
        if (!tabBtn) return;
        const tabId = tabBtn.getAttribute('data-tab');
        if (!tabId) return;
        if (state.currentTab === tabId) return;
        await activateTab(tabId);
      });
    }

    // 개별 버튼 직접 바인딩 백업
    const tabBtns = document.querySelectorAll('.nav-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tabId = btn.getAttribute('data-tab');
        if (!tabId || state.currentTab === tabId) return;
        await activateTab(tabId);
      });
    });

    // 드롭다운 호버 및 클릭 유지 처리
    const dropdownWraps = document.querySelectorAll('.nav-dropdown-wrap');
    dropdownWraps.forEach(wrap => {
      wrap.addEventListener('mouseenter', () => {
        wrap.classList.remove('is-closed');
        wrap.classList.add('is-open');
      });
      wrap.addEventListener('mouseleave', () => {
        wrap.classList.remove('is-open');
        wrap.classList.remove('is-closed');
      });
    });

    // 트리 하위 메뉴 (감지기반/유도등반/수신기반/공수집계) 클릭
    const dropdownItems = document.querySelectorAll('.nav-dropdown-item');
    dropdownItems.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wrap = item.closest('.nav-dropdown-wrap');
        if (wrap) {
          // 하위 메뉴 클릭 시 즉시 드롭다운 닫힘 처리
          wrap.classList.remove('is-open');
          wrap.classList.add('is-closed');
          setTimeout(() => wrap.classList.remove('is-closed'), 350);
        }

        const parentTabId = item.getAttribute('data-parent-tab');
        const lineKey = item.getAttribute('data-line');
        const lineName = item.getAttribute('data-line-name');

        if (parentTabId === 'tab-inspection') {
          state.activeLines.schedule = lineKey;
          const chip = document.getElementById('chip-schedule-line');
          if (chip) chip.textContent = lineName;
          updateInspectionLineBanner(lineKey, lineName);
        } else if (parentTabId === 'tab-production') {
          state.activeLines.daily = lineKey;
          const chip = document.getElementById('chip-daily-line');
          if (chip) chip.textContent = lineName;
          updateProductionLineBanner(lineKey, lineName);
        }

        const menu = item.closest('.nav-dropdown-menu');
        if (menu) {
          menu.querySelectorAll('.nav-dropdown-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
        }

        await activateTab(parentTabId);
      });
    });

    // -------------------------------------------------------------
    // (D) 뷰 모드 전환
    // -------------------------------------------------------------
    const btnViewDefault = document.getElementById('btn-view-default');
    const btnViewWide = document.getElementById('btn-view-wide');
    if (btnViewDefault && btnViewWide) {
      if (state.viewMode === 'wide') {
        document.body.className = 'view-mode-wide';
        btnViewWide.classList.add('active');
        btnViewDefault.classList.remove('active');
      }

      btnViewDefault.addEventListener('click', () => {
        document.body.className = 'view-mode-default';
        btnViewDefault.classList.add('active');
        btnViewWide.classList.remove('active');
        state.viewMode = 'default';
        localStorage.setItem(STORAGE_KEYS.VIEW_MODE, 'default');
      });

      btnViewWide.addEventListener('click', () => {
        document.body.className = 'view-mode-wide';
        btnViewWide.classList.add('active');
        btnViewDefault.classList.remove('active');
        state.viewMode = 'wide';
        localStorage.setItem(STORAGE_KEYS.VIEW_MODE, 'wide');
      });
    }

    // -------------------------------------------------------------
    // (E) 생산현황 날짜 변경 및 일정 저장
    // -------------------------------------------------------------
    const inspDateInput = document.getElementById('inspection-date');
    if (inspDateInput) {
      inspDateInput.addEventListener('change', (e) => {
        state.inspectionStartDate = e.target.value;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    const inspPrevDay = document.getElementById('btn-insp-prev-day');
    if (inspPrevDay) {
      inspPrevDay.addEventListener('click', () => {
        state.inspectionStartDate = addDaysStr(state.inspectionStartDate, -1);
        if (inspDateInput) inspDateInput.value = state.inspectionStartDate;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    const inspNextDay = document.getElementById('btn-insp-next-day');
    if (inspNextDay) {
      inspNextDay.addEventListener('click', () => {
        state.inspectionStartDate = addDaysStr(state.inspectionStartDate, 1);
        if (inspDateInput) inspDateInput.value = state.inspectionStartDate;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    const inspTodayBtn = document.getElementById('btn-insp-today');
    if (inspTodayBtn) {
      inspTodayBtn.addEventListener('click', () => {
        state.inspectionStartDate = getTodayDateString();
        if (inspDateInput) inspDateInput.value = state.inspectionStartDate;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    // 검정예정일 날짜 선택기
    const inspTargetInput = document.getElementById('inspection-target-date');
    if (inspTargetInput) {
      inspTargetInput.addEventListener('change', async (e) => {
        if (state.isDirty) {
          const conf = confirm('저장되지 않은 변경사항이 있습니다. 이동하시겠습니까?');
          if (!conf) {
            e.target.value = state.inspectionTargetDate;
            return;
          }
        }
        state.inspectionTargetDate = e.target.value;
        await loadInspectionDataFromDb(state.inspectionTargetDate);
        markAsDirty(false);
        renderSidebarSchedules();
        renderInspectionTable();
      });
    }

    const inspPrevTarget = document.getElementById('btn-insp-prev-target');
    if (inspPrevTarget) {
      inspPrevTarget.addEventListener('click', async () => {
        const nextVal = addDaysStr(state.inspectionTargetDate, -1);
        state.inspectionTargetDate = nextVal;
        if (inspTargetInput) inspTargetInput.value = nextVal;
        await loadInspectionDataFromDb(nextVal);
        markAsDirty(false);
        renderSidebarSchedules();
        renderInspectionTable();
      });
    }

    const inspNextTarget = document.getElementById('btn-insp-next-target');
    if (inspNextTarget) {
      inspNextTarget.addEventListener('click', async () => {
        const nextVal = addDaysStr(state.inspectionTargetDate, 1);
        state.inspectionTargetDate = nextVal;
        if (inspTargetInput) inspTargetInput.value = nextVal;
        await loadInspectionDataFromDb(nextVal);
        markAsDirty(false);
        renderSidebarSchedules();
        renderInspectionTable();
      });
    }

    // [+] 버튼 클릭 시 일정 1일 추가
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('btn-add-day-trigger')) {
        state.inspectionDayCount = (state.inspectionDayCount || 10) + 1;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
        showToast(`일정이 ${state.inspectionDayCount}일로 확장되었습니다`);
      }

      // [-] 버튼 클릭 시 추가된 일정 1일 축소
      if (e.target && e.target.classList.contains('btn-remove-day-trigger')) {
        removeAddedInspectionDay();
      }

      // 날짜 헤더의 개별 [x] 클릭 시 해당 일자 삭제
      if (e.target && e.target.classList.contains('btn-remove-col-click')) {
        const idx = parseInt(e.target.dataset.dateIdx, 10);
        removeAddedInspectionDay(idx);
      }

      // 사이드바 검정일정 날짜 수정 버튼
      if (e.target && e.target.classList.contains('btn-schedule-edit')) {
        e.stopPropagation();
        const tDate = e.target.dataset.targetDate;
        editScheduleDate(tDate);
      }

      // 사이드바 검정일정 삭제 버튼
      if (e.target && e.target.classList.contains('btn-schedule-del')) {
        e.stopPropagation();
        const tDate = e.target.dataset.targetDate;
        deleteSchedule(tDate);
      }
    });

    // [생산현황] 일정저장 버튼 클릭
    const btnInspSave = document.getElementById('btn-insp-save');
    if (btnInspSave) {
      btnInspSave.addEventListener('click', () => {
        saveInspectionToDb();
      });
    }

    // 생산현황 데이터 초기화
    const btnInspClear = document.getElementById('btn-insp-clear-day');
    if (btnInspClear) {
      btnInspClear.addEventListener('click', () => {
        if (confirm(`[${state.inspectionTargetDate}] 생산현황 데이터를 초기화하시겠습니까?`)) {
          state.inspectionData = { process: {}, assembly: {} };
          state.inspectionDayCount = 10;
          saveLocalInspectionData();
          markAsDirty(true);
          renderInspectionTable();
          showToast('초기화되었습니다 (일정저장을 눌러야 DB에 반영됩니다)');
        }
      });
    }

    // 사이드바 연도/월 필터
    const filterYear = document.getElementById('filter-insp-year');
    if (filterYear) {
      filterYear.addEventListener('change', () => {
        renderSidebarSchedules();
      });
    }

    const filterMonth = document.getElementById('filter-insp-month');
    if (filterMonth) {
      filterMonth.addEventListener('change', () => {
        renderSidebarSchedules();
      });
    }

    // -------------------------------------------------------------
    // (F) 생산현황 테이블 입력 처리
    // -------------------------------------------------------------
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target) return;

      if (target.classList.contains('input-weekly-qty')) {
        const itemId = target.dataset.itemId;
        const section = target.dataset.section;
        const rawVal = target.value.replace(/[^0-9]/g, '');
        const numVal = parseSafeInt(rawVal);

        if (!state.inspectionData[section]) state.inspectionData[section] = {};
        if (!state.inspectionData[section][itemId]) state.inspectionData[section][itemId] = { weekly: 0, daily: {} };
        state.inspectionData[section][itemId].weekly = numVal;

        // [공정 1 -> 공정 2 주간물량 자동 동기화]
        // 공정 1(공정검사: 'process')에 주간물량 입력 시, 동일 품명의 공정 2(자동화조립: 'assembly')에도 즉시 동일 수량 자동 반영
        if (section === 'process') {
          if (!state.inspectionData['assembly']) state.inspectionData['assembly'] = {};

          // 현재 입력한 품목 정보 (ID 및 품명) 확인
          const currentItem = (state.commonItems || []).find(it => String(it.id) === String(itemId));
          const currentItemName = currentItem ? currentItem.name : null;

          // 동일 itemId 또는 동일 품명을 가진 공정 2 품목 매칭
          const matchedItems = (state.commonItems || []).filter(it =>
            String(it.id) === String(itemId) || (currentItemName && it.name === currentItemName)
          );
          const targetIds = matchedItems.length > 0 ? matchedItems.map(it => it.id) : [itemId];

          targetIds.forEach(tId => {
            if (!state.inspectionData['assembly'][tId]) {
              state.inspectionData['assembly'][tId] = { weekly: 0, daily: {} };
            }
            state.inspectionData['assembly'][tId].weekly = numVal;

            // 공정 2 화면의 해당 입력 필드 값 즉시 동기화
            const assemblyInput = document.querySelector(`.input-weekly-qty[data-section="assembly"][data-item-id="${tId}"]`);
            if (assemblyInput) {
              assemblyInput.value = target.value;
            }
          });
        }

        saveLocalInspectionData();
        markAsDirty(true);
        updateAllInspectionCalculations();
      }

      if (target.classList.contains('input-daily-qty')) {
        const itemId = target.dataset.itemId;
        const section = target.dataset.section;
        const dateStr = target.dataset.date;
        const rawVal = target.value.replace(/[^0-9]/g, '');
        const numVal = parseSafeInt(rawVal);

        if (!state.inspectionData[section]) state.inspectionData[section] = {};
        if (!state.inspectionData[section][itemId]) state.inspectionData[section][itemId] = { weekly: 0, daily: {} };
        if (!state.inspectionData[section][itemId].daily) state.inspectionData[section][itemId].daily = {};
        state.inspectionData[section][itemId].daily[dateStr] = numVal;

        saveLocalInspectionData();
        markAsDirty(true);
        updateAllInspectionCalculations();
      }
    });

    // -------------------------------------------------------------
    // (G) 생산 일정 날짜 변경 및 변동 작업자 배정, 일정 저장
    // -------------------------------------------------------------
    const prodDateInput = document.getElementById('production-date');
    if (prodDateInput) {
      prodDateInput.addEventListener('change', async (e) => {
        if (state.isDirty) {
          const conf = confirm('저장되지 않은 변경사항이 있습니다. 다른 날짜로 이동하시겠습니까?');
          if (!conf) {
            e.target.value = state.productionDate;
            return;
          }
        }
        state.productionDate = e.target.value;
        await loadProductionDataFromDb(state.productionDate);
        markAsDirty(false);
        renderProductionTable();
      });
    }

    const prodPrevDay = document.getElementById('btn-prod-prev-day');
    if (prodPrevDay) {
      prodPrevDay.addEventListener('click', async () => {
        const nextVal = addDaysStr(state.productionDate, -1);
        state.productionDate = nextVal;
        if (prodDateInput) prodDateInput.value = nextVal;
        await loadProductionDataFromDb(nextVal);
        markAsDirty(false);
        renderProductionTable();
      });
    }

    const prodNextDay = document.getElementById('btn-prod-next-day');
    if (prodNextDay) {
      prodNextDay.addEventListener('click', async () => {
        const nextVal = addDaysStr(state.productionDate, 1);
        state.productionDate = nextVal;
        if (prodDateInput) prodDateInput.value = nextVal;
        await loadProductionDataFromDb(nextVal);
        markAsDirty(false);
        renderProductionTable();
      });
    }

    const prodTodayBtn = document.getElementById('btn-prod-today');
    if (prodTodayBtn) {
      prodTodayBtn.addEventListener('click', async () => {
        const todayStr = getTodayDateString();
        state.productionDate = todayStr;
        if (prodDateInput) prodDateInput.value = todayStr;
        await loadProductionDataFromDb(todayStr);
        markAsDirty(false);
        renderProductionTable();
      });
    }

    // 변동 작업자 투입 드롭다운
    const selectVarWorker = document.getElementById('select-add-var-worker');
    if (selectVarWorker) {
      selectVarWorker.addEventListener('change', (e) => {
        const wId = e.target.value;
        if (!wId) return;

        if (!state.selectedVarWorkerIds.includes(wId)) {
          state.selectedVarWorkerIds.push(wId);
          saveLocalProductionData();
          markAsDirty(true);
          renderProductionTable();
        }
        e.target.value = '';
      });
    }

    // 변동 작업자 칩 제거 버튼
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('chip-remove-btn')) {
        const wId = e.target.dataset.workerId;
        state.selectedVarWorkerIds = state.selectedVarWorkerIds.filter(id => id !== wId);
        saveLocalProductionData();
        markAsDirty(true);
        renderProductionTable();
      }
    });

    // [생산일정] 일정저장 버튼 클릭
    const btnProdSave = document.getElementById('btn-prod-save');
    if (btnProdSave) {
      btnProdSave.addEventListener('click', () => {
        saveProductionToDb();
      });
    }

    // 생산일정 초기화
    const btnProdClear = document.getElementById('btn-prod-clear-day');
    if (btnProdClear) {
      btnProdClear.addEventListener('click', () => {
        if (confirm(`[${state.productionDate}] 생산일정 데이터를 초기화하시겠습니까?`)) {
          state.productionData = { assembly: {}, inspection: {}, etc: {} };
          state.selectedVarWorkerIds = [];
          saveLocalProductionData();
          markAsDirty(true);
          renderProductionTable();
          showToast('초기화되었습니다 (일정저장을 눌러야 DB에 반영됩니다)');
        }
      });
    }

    // -------------------------------------------------------------
    // (H) 생산 일정 입력 처리 (비고, 로트, 수량, 작업시간)
    // -------------------------------------------------------------
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target) return;

      const sec = target.dataset.section;
      const itemId = target.dataset.itemId;
      if (!sec || !itemId) return;

      if (!state.productionData[sec]) state.productionData[sec] = {};
      if (!state.productionData[sec][itemId]) {
        state.productionData[sec][itemId] = { note: '', lotNo: '', qty: 0, workerHours: {} };
      }
      const record = state.productionData[sec][itemId];

      if (target.classList.contains('input-prod-note')) {
        record.note = target.value;
        saveLocalProductionData();
        markAsDirty(true);
      }

      if (target.classList.contains('input-prod-lot')) {
        record.lotNo = target.value;
        saveLocalProductionData();
        markAsDirty(true);
      }

      if (target.classList.contains('input-prod-qty')) {
        const rawVal = target.value.replace(/[^0-9]/g, '');
        record.qty = parseSafeInt(rawVal);
        saveLocalProductionData();
        markAsDirty(true);
        calculateProductionTotals();
      }

      if (target.classList.contains('input-worker-hour')) {
        const wId = target.dataset.workerId;
        const rawVal = target.value.replace(/[^0-9.]/g, '');
        if (!record.workerHours) record.workerHours = {};
        record.workerHours[wId] = parseSafeFloat(rawVal);
        saveLocalProductionData();
        markAsDirty(true);
        calculateProductionTotals();
      }
    });

    document.addEventListener('blur', (e) => {
      const target = e.target;
      if (target && target.classList.contains('input-prod-lot')) {
        const formatted = formatSmartLotNumber(target.value);
        target.value = formatted;
        const sec = target.dataset.section;
        const itemId = target.dataset.itemId;
        if (sec && itemId && state.productionData[sec] && state.productionData[sec][itemId]) {
          state.productionData[sec][itemId].lotNo = formatted;
          saveLocalProductionData();
          markAsDirty(true);
        }
      }
    }, true);

    // -------------------------------------------------------------
    // (I) 스프레드시트 키보드 탐색 (Tab, Enter, 방향키)
    // -------------------------------------------------------------
    document.addEventListener('keydown', (e) => {
      const target = e.target;
      if (!target || target.tagName !== 'INPUT') return;

      const isGridInput = target.classList.contains('cell-input');
      if (!isGridInput) return;

      const currentCell = target.closest('td');
      const currentRow = target.closest('tr');
      if (!currentCell || !currentRow) return;

      const table = currentRow.closest('table');
      if (!table) return;

      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'ArrowDown') {
        e.preventDefault();
        const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const nextCell = nextRow.children[cellIndex];
          const nextInput = nextCell ? nextCell.querySelector('input:not([disabled])') : null;
          if (nextInput) nextInput.focus();
        }
      }

      if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') {
        e.preventDefault();
        const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
        const prevRow = currentRow.previousElementSibling;
        if (prevRow) {
          const prevCell = prevRow.children[cellIndex];
          const prevInput = prevCell ? prevCell.querySelector('input:not([disabled])') : null;
          if (prevInput) prevInput.focus();
        }
      }
    });

    // -------------------------------------------------------------
    // (J) 설정 (마스터 관리) 품목 추가, 수정, 삭제 & 저장
    // -------------------------------------------------------------
    const formAddCommon = document.getElementById('form-add-common-item');
    if (formAddCommon) {
      formAddCommon.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-common-item');
        const name = input ? input.value.trim() : '';
        if (!name) return;

        state.commonItems.push({
          id: generateUniqueId('item'),
          name: name
        });
        input.value = '';
        saveLocalMasterData();
        saveMasterToDb(true);
        markAsDirty(true);
        renderMasterCommonItems();
        renderInspectionTable();
        renderProductionTable();
        showToast('품목이 추가되었습니다');
      });
    }

    const formAddEtc = document.getElementById('form-add-etc-item');
    if (formAddEtc) {
      formAddEtc.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-etc-item');
        const name = input ? input.value.trim() : '';
        if (!name) return;

        state.etcItems.push({
          id: generateUniqueId('etc'),
          name: name
        });
        input.value = '';
        saveLocalMasterData();
        saveMasterToDb(true);
        markAsDirty(true);
        renderMasterEtcItems();
        renderProductionTable();
        showToast('기타작업이 추가되었습니다');
      });
    }

    const formAddWorker = document.getElementById('form-add-worker');
    if (formAddWorker) {
      formAddWorker.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-worker');
        const groupSel = document.getElementById('select-new-worker-group');
        const name = input ? input.value.trim() : '';
        const group = groupSel ? groupSel.value : '감지기반';
        if (!name) return;

        state.workers.push({
          id: generateUniqueId('worker'),
          name: name,
          group: group,
          type: 'fixed'
        });
        input.value = '';
        saveLocalMasterData();
        saveMasterToDb(true);
        markAsDirty(true);
        renderMasterWorkers();
        renderProductionTable();
        showToast(`[${group}] ${name} 작업자가 추가되었습니다`);
      });
    }

    document.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('worker-type-select')) {
        const wId = e.target.dataset.workerId;
        const newType = e.target.value;
        const worker = state.workers.find(w => w.id === wId);
        if (worker) {
          worker.type = newType;
          e.target.className = `worker-type-select ${newType === 'fixed' ? 'type-fixed' : 'type-variable'}`;
          saveLocalMasterData();
          saveMasterToDb(true);
          markAsDirty(true);
          renderProductionTable();
          showToast(`[${worker.name}] 작업자 상태가 '${newType === 'fixed' ? '고정' : '변동'}'으로 변경되었습니다`);
        }
      }
    });

    // 마스터 품목 & 작업자 수정/삭제 (인라인 수정 연계)
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;

      // 1. 공통 품목 인라인 수정
      if (target.classList.contains('btn-edit-common')) {
        const tr = target.closest('tr');
        const id = target.dataset.id;
        startMasterInlineEdit('commonItems', id, tr);
      }

      // 2. 공통 품목 삭제
      if (target.classList.contains('btn-del-common')) {
        const id = target.dataset.id;
        const item = state.commonItems.find(i => i.id === id);
        if (!item) return;
        if (confirm(`'${item.name}' 품목을 삭제하시겠습니까?`)) {
          state.commonItems = state.commonItems.filter(i => i.id !== id);
          saveLocalMasterData();
          saveMasterToDb(true);
          markAsDirty(true);
          renderMasterCommonItems();
          renderInspectionTable();
          renderProductionTable();
        }
      }

      // 3. 기타작업 인라인 수정
      if (target.classList.contains('btn-edit-etc')) {
        const tr = target.closest('tr');
        const id = target.dataset.id;
        startMasterInlineEdit('etcItems', id, tr);
      }

      // 4. 기타작업 삭제
      if (target.classList.contains('btn-del-etc')) {
        const id = target.dataset.id;
        const item = state.etcItems.find(i => i.id === id);
        if (!item) return;
        if (confirm(`'${item.name}' 항목을 삭제하시겠습니까?`)) {
          state.etcItems = state.etcItems.filter(i => i.id !== id);
          saveLocalMasterData();
          saveMasterToDb(true);
          markAsDirty(true);
          renderMasterEtcItems();
          renderProductionTable();
        }
      }

      // 5. 작업자 인라인 수정
      if (target.classList.contains('btn-edit-worker')) {
        const tr = target.closest('tr');
        const id = target.dataset.id;
        startMasterInlineEdit('workers', id, tr);
      }

      // 6. 작업자 삭제
      if (target.classList.contains('btn-del-worker')) {
        const id = target.dataset.id;
        const worker = state.workers.find(w => w.id === id);
        if (!worker) return;
        if (confirm(`'${worker.name}' 작업자를 삭제하시겠습니까?`)) {
          state.workers = state.workers.filter(w => w.id !== id);
          state.selectedVarWorkerIds = state.selectedVarWorkerIds.filter(wId => wId !== id);
          saveLocalMasterData();
          saveMasterToDb(true);
          markAsDirty(true);
          renderMasterWorkers();
          renderProductionTable();
        }
      }
    });

    // [설정 저장] 버튼 클릭
    const btnSaveMaster = document.getElementById('btn-save-master');
    if (btnSaveMaster) {
      btnSaveMaster.addEventListener('click', () => {
        saveMasterToDb();
      });
    }

    // -------------------------------------------------------------
    // (K) CSV 내보내기 & 전체 백업/복원
    // -------------------------------------------------------------
    const btnExportInspCsv = document.getElementById('btn-export-inspection-csv');
    if (btnExportInspCsv) {
      btnExportInspCsv.addEventListener('click', () => exportInspectionToCsv());
    }

    const btnExportProdCsv = document.getElementById('btn-export-production-csv');
    if (btnExportProdCsv) {
      btnExportProdCsv.addEventListener('click', () => exportProductionToCsv());
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => exportAllToJson());
    }

    const inputImportJson = document.getElementById('input-import-json');
    if (inputImportJson) {
      inputImportJson.addEventListener('change', (e) => importAllFromJson(e));
    }

    // 신규 검정현황 이벤트 리스너 바인딩
    initCertEventListeners();
    initPlanEventListeners();
    initInspV2EventListeners();
    initProdV2EventListeners();
  }

  // =========================================================================
  // 14. 데이터 내보내기 (CSV, JSON 백업/복원)
  // =========================================================================
  function exportInspectionToCsv() {
    const baseDate = state.inspectionStartDate;
    const count = state.inspectionDayCount || 10;
    let csv = '\uFEFF공정,No,품명,주간물량,생산완료,잔량';

    for (let i = 0; i < count; i++) {
      const dObj = addDays(baseDate, i);
      const mm = dObj.getMonth() + 1;
      const dd = dObj.getDate();
      const day = DAYS_OF_WEEK[dObj.getDay()];
      csv += `,${mm}/${dd}(${day})`;
    }
    csv += '\n';

    INSPECTION_TABLE_CONFIGS.forEach(conf => {
      const secData = state.inspectionData[conf.key] || {};
      const secTitle = conf.key === 'process' ? '공정검사' : '자동화조립';

      state.commonItems.forEach((item, idx) => {
        const row = secData[item.id] || { weekly: 0, daily: {} };
        const weekly = parseSafeInt(row.weekly);
        let completed = 0;
        const dailyVals = [];

        for (let i = 0; i < count; i++) {
          const dStr = addDaysStr(baseDate, i);
          const v = parseSafeInt((row.daily || {})[dStr]);
          completed += v;
          dailyVals.push(v);
        }
        const balance = weekly - completed;

        csv += `"${secTitle}",${idx + 1},"${item.name}",${weekly},${completed},${balance},${dailyVals.join(',')}\n`;
      });
    });

    downloadFile(csv, `생산현황_${state.inspectionTargetDate}.csv`, 'text/csv;charset=utf-8;');
  }

  function exportProductionToCsv() {
    const activeWorkers = getActiveWorkersForProduction();
    let csv = '\uFEFF공정,No,품명,비고,로트번호,생산수량';
    activeWorkers.forEach(w => {
      csv += `,"${w.name}(${w.type === 'variable' ? '변동' : '고정'})"`;
    });
    csv += '\n';

    PRODUCTION_SECTIONS.forEach(sec => {
      const items = (sec.key === 'etc') ? state.etcItems : state.commonItems;
      const secData = state.productionData[sec.key] || {};
      const secTitle = sec.key === 'assembly' ? '조립' : (sec.key === 'inspection' ? '검사' : '기타');

      items.forEach((item, idx) => {
        const row = secData[item.id] || { note: '', lotNo: '', qty: 0, workerHours: {} };
        const hours = activeWorkers.map(w => parseSafeFloat((row.workerHours || {})[w.id]));
        csv += `"${secTitle}",${idx + 1},"${item.name}","${row.note || ''}","${row.lotNo || ''}",${row.qty || 0},${hours.join(',')}\n`;
      });
    });

    downloadFile(csv, `생산일정_${state.productionDate}.csv`, 'text/csv;charset=utf-8;');
  }

  function exportAllToJson() {
    const backup = {
      version: '4.1',
      exportedAt: new Date().toISOString(),
      commonItems: state.commonItems,
      etcItems: state.etcItems,
      workers: state.workers,
      inspectionSchedules: state.inspectionSchedules,
      currentInspection: {
        startDate: state.inspectionStartDate,
        targetDate: state.inspectionTargetDate,
        dayCount: state.inspectionDayCount || 10,
        data: state.inspectionData
      },
      currentProduction: {
        date: state.productionDate,
        selectedVarWorkerIds: state.selectedVarWorkerIds,
        data: state.productionData
      }
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    downloadFile(jsonStr, `PMS_전체데이터백업_${getTodayDateString()}.json`, 'application/json');
  }

  function importAllFromJson(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (parsed.commonItems) state.commonItems = parsed.commonItems;
        if (parsed.etcItems) state.etcItems = parsed.etcItems;
        if (parsed.workers) state.workers = parsed.workers;
        if (parsed.inspectionSchedules) state.inspectionSchedules = parsed.inspectionSchedules;
        if (parsed.currentInspection) {
          state.inspectionStartDate = parsed.currentInspection.startDate || state.inspectionStartDate;
          state.inspectionTargetDate = parsed.currentInspection.targetDate || state.inspectionTargetDate;
          state.inspectionDayCount = parsed.currentInspection.dayCount || 10;
          state.inspectionData = parsed.currentInspection.data || state.inspectionData;
        }
        if (parsed.currentProduction) {
          state.productionDate = parsed.currentProduction.date || state.productionDate;
          state.selectedVarWorkerIds = parsed.currentProduction.selectedVarWorkerIds || [];
          state.productionData = parsed.currentProduction.data || state.productionData;
        }

        saveLocalMasterData();
        saveLocalInspectionSchedules();
        saveLocalInspectionData();
        saveLocalProductionData();
        markAsDirty(true);
        renderAll();
        showToast('데이터가 성공적으로 복원되었습니다 (DB 저장을 눌러 영구 저장하세요)');
      } catch (err) {
        alert('백업 파일 형식이 올바르지 않습니다.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // 상단 시계 갱신
  function startClock() {
    const clockEl = document.getElementById('clock-display');
    if (!clockEl) return;
    function update() {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    }
    update();
    setInterval(update, 1000);
  }

  // =========================================================================
  // 16. [신규 검정현황] 비즈니스 로직 & 이벤트 핸들링 (PMS v4.2)
  // =========================================================================

  // (1) 새 검정 신청 행 생성 헬퍼
  function createNewDraftRow(base = {}) {
    const defaultDept = (state.departments && state.departments[0]) ? state.departments[0] : '판매팀';
    return {
      id: 'cdraft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      checked: false,
      code: '',
      name: '',
      spec: '',
      formatNo: '',
      type: '',
      writeDate: getTodayDateString(),
      inspectDate: '',
      weekDate: '',
      qty: '',
      lotNo: '',
      from: '',
      to: '',
      passNo: '',
      site: '',
      color: '',
      dept: defaultDept,
      sensor: '',
      ctrl: '',
      gas: '',
      ...base
    };
  }

  function getDisplayItemName(item) {
    if (!item) return '';
    const alt = String(item.altName || '').trim();
    return alt || String(item.name || '');
  }

  function getDisplayNameByCode(code, fallbackName = '') {
    const c = String(code || '').trim();
    if (c) {
      const m = (state.certMasterItems || []).find(it => String(it.code || '').trim() === c);
      if (m) return getDisplayItemName(m) || fallbackName;
    }
    return fallbackName;
  }

  function normalizeCertMasterItems(items) {
    if (!Array.isArray(items)) return [];
    const defs = window.PMS_CERT_DEFAULTS || {};
    const defMap = new Map((defs.DEFAULT_CERT_MASTER_ITEMS || []).map(d => [String(d.code || '').trim().toLowerCase(), d]));
    return items.map((item, idx) => {
      const codeKey = String(item.code || '').trim().toLowerCase();
      const def = defMap.get(codeKey);
      return {
        id: item.id || ('citem_' + (idx + 1)),
        useYn: item.useYn ?? def?.useYn ?? '사용',
        inspectType: item.inspectType ?? def?.inspectType ?? '품질',
        group: item.group ?? def?.group ?? '감지기반',
        itemGroup: item.itemGroup !== undefined ? item.itemGroup : (def?.itemGroup ?? ''),
        code: item.code ?? def?.code ?? '',
        altName: item.altName !== undefined && item.altName !== '' ? item.altName : (def?.altName ?? ''),
        name: item.name ?? def?.name ?? '',
        spec: item.spec ?? def?.spec ?? '',
        formatNo: item.formatNo ?? def?.formatNo ?? '',
        modelName: item.modelName !== undefined ? item.modelName : (def?.modelName ?? ''),
        unitPrice: item.unitPrice !== undefined ? item.unitPrice : (def?.unitPrice ?? ''),
        baseStock: item.baseStock !== undefined ? item.baseStock : (def?.baseStock ?? ''),
        minStock: item.minStock !== undefined ? item.minStock : (def?.minStock ?? ''),
        maxStock: item.maxStock !== undefined ? item.maxStock : (def?.maxStock ?? ''),
        stAssembly: item.stAssembly !== undefined && item.stAssembly !== '' ? item.stAssembly : (def?.stAssembly ?? ''),
        stInspect: item.stInspect !== undefined && item.stInspect !== '' ? item.stInspect : (def?.stInspect ?? ''),
        stPack: item.stPack !== undefined && item.stPack !== '' ? item.stPack : (def?.stPack ?? ''),
        sensor: item.sensor ?? def?.sensor ?? '',
        ctrl: item.ctrl ?? def?.ctrl ?? '',
        gas: item.gas ?? def?.gas ?? ''
      };
    });
  }

  // (2) 로컬 스토리지 데이터 로드 & 저장
  function loadLocalCertData() {
    try {
      const defs = window.PMS_CERT_DEFAULTS || {};

      // 1) 품목 마스터
      const rawMaster = localStorage.getItem(STORAGE_KEYS.CERT_MASTER_ITEMS);
      state.certMasterItems = normalizeCertMasterItems(rawMaster ? JSON.parse(rawMaster) : [...(defs.DEFAULT_CERT_MASTER_ITEMS || [])]);

      // 2) KFI 매핑 데이터
      const rawKfi = localStorage.getItem(STORAGE_KEYS.KFI_DATA_MAP);
      state.kfiDataMap = rawKfi ? JSON.parse(rawKfi) : { ...(defs.DEFAULT_KFI_DATA_MAP || {}) };

      // 3) 요청부서 목록
      const rawDept = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
      state.departments = rawDept ? JSON.parse(rawDept) : [...(defs.DEFAULT_DEPARTMENTS || ['판매팀', '영업팀', '시공팀', '특수사업팀', '금성비나'])];

      // 4) 저장된 검정 내역 (기본 샘플 15건 포함)
      const rawSaved = localStorage.getItem(STORAGE_KEYS.CERT_SAVED_ROWS);
      state.certSavedRows = rawSaved ? JSON.parse(rawSaved) : [...(defs.DEFAULT_CERT_SAMPLE_ROWS || [])];

      // 5) 작성 중인 검정 등록 행
      const rawDraft = localStorage.getItem(STORAGE_KEYS.CERT_DRAFT_ROWS);
      state.certDraftRows = rawDraft ? JSON.parse(rawDraft) : [];
      if (!Array.isArray(state.certDraftRows) || state.certDraftRows.length === 0) {
        state.certDraftRows = [createNewDraftRow()];
      }

      // 6) 필터 설정
      state.certFilterType = localStorage.getItem(STORAGE_KEYS.CERT_FILTER_TYPE) || 'writeDate';
      state.certFilterDate = localStorage.getItem(STORAGE_KEYS.CERT_FILTER_DATE) || '';
      state.certFilterLine = localStorage.getItem(STORAGE_KEYS.CERT_FILTER_LINE) || 'ALL';

      // 7) 품질검사 데이터
      const rawQuality = localStorage.getItem(STORAGE_KEYS.QUALITY_ROWS);
      state.qualityRows = rawQuality ? JSON.parse(rawQuality) : [];
      state.qualityFilterDate = localStorage.getItem(STORAGE_KEYS.QUALITY_FILTER_DATE) || '';

      // 8) 근태관리 데이터
      const rawAttTypes = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_TYPES);
      state.attendanceTypes = rawAttTypes ? JSON.parse(rawAttTypes) : DEFAULT_ATTENDANCE_TYPES.map(t => ({ ...t }));
      if (!Array.isArray(state.attendanceTypes) || state.attendanceTypes.length === 0) {
        state.attendanceTypes = DEFAULT_ATTENDANCE_TYPES.map(t => ({ ...t }));
      }
      const rawAttRecs = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_RECORDS);
      state.attendanceRecords = rawAttRecs ? JSON.parse(rawAttRecs) : [];
      const rawAttHols = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_HOLIDAYS);
      state.attendanceHolidays = rawAttHols ? JSON.parse(rawAttHols) : {};
    } catch (e) {
      console.warn('검정현황 로컬 데이터 로드 실패, 기본값으로 복원:', e);
      const defs = window.PMS_CERT_DEFAULTS || {};
      state.certMasterItems = [...(defs.DEFAULT_CERT_MASTER_ITEMS || [])];
      state.kfiDataMap = { ...(defs.DEFAULT_KFI_DATA_MAP || {}) };
      state.departments = [...(defs.DEFAULT_DEPARTMENTS || ['판매팀', '영업팀', '시공팀', '특수사업팀', '금성비나'])];
      state.certSavedRows = [...(defs.DEFAULT_CERT_SAMPLE_ROWS || [])];
      state.certDraftRows = [createNewDraftRow()];
      state.qualityRows = [];
      state.attendanceTypes = DEFAULT_ATTENDANCE_TYPES.map(t => ({ ...t }));
      state.attendanceRecords = [];
      state.attendanceHolidays = {};
    }

    updateCertBadgeCounts();
  }

  function saveLocalCertData() {
    try {
      localStorage.setItem(STORAGE_KEYS.CERT_MASTER_ITEMS, JSON.stringify(state.certMasterItems));
      localStorage.setItem(STORAGE_KEYS.KFI_DATA_MAP, JSON.stringify(state.kfiDataMap));
      localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(state.departments));
      localStorage.setItem(STORAGE_KEYS.CERT_SAVED_ROWS, JSON.stringify(state.certSavedRows));
      localStorage.setItem(STORAGE_KEYS.CERT_DRAFT_ROWS, JSON.stringify(state.certDraftRows));
      localStorage.setItem(STORAGE_KEYS.CERT_FILTER_TYPE, state.certFilterType || 'writeDate');
      localStorage.setItem(STORAGE_KEYS.CERT_FILTER_DATE, state.certFilterDate || '');
      localStorage.setItem(STORAGE_KEYS.CERT_FILTER_LINE, state.certFilterLine || 'ALL');
      localStorage.setItem(STORAGE_KEYS.QUALITY_ROWS, JSON.stringify(state.qualityRows || []));
      localStorage.setItem(STORAGE_KEYS.QUALITY_FILTER_DATE, state.qualityFilterDate || '');
    } catch (e) {
      console.error('검정현황 로컬 저장 실패:', e);
    }
    updateCertBadgeCounts();
  }

  function saveLocalQualityRows() {
    saveLocalCertData();
  }

  async function saveQualityRowsToDb() {
    saveLocalCertData();
    if (isFirestoreActive && db) {
      try {
        await db.collection('pms_metadata').doc('quality_rows').set({
          rows: state.qualityRows || [],
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error('품질검사 DB 저장 실패:', err);
      }
    }
  }

  function updateCertBadgeCounts() {
    const savedBadge = document.getElementById('badge-cert-saved-count');
    if (savedBadge) savedBadge.textContent = (state.certSavedRows || []).length;

    const masterBadge = document.getElementById('count-cert-master-badge');
    if (masterBadge) masterBadge.textContent = `${(state.certMasterItems || []).length}개 등록됨`;

    const kfiBadge = document.getElementById('count-kfi-records-badge');
    if (kfiBadge) kfiBadge.textContent = `${Object.keys(state.kfiDataMap || {}).length}건 연동됨`;

    const deptBadge = document.getElementById('count-departments-badge');
    if (deptBadge) deptBadge.textContent = `${(state.departments || []).length}개 부서`;
  }

  // (3) Firestore DB 연동
  async function loadCertDataFromDb() {
    if (!isFirestoreActive || !db) return;
    try {
      const metaRef = db.collection('pms_metadata');
      const [masterDoc, kfiDoc, deptDoc, savedDoc, qualDoc, attDoc] = await Promise.all([
        metaRef.doc('cert_master_items').get(),
        metaRef.doc('cert_kfi_map').get(),
        metaRef.doc('departments').get(),
        metaRef.doc('cert_saved_rows').get(),
        metaRef.doc('quality_rows').get(),
        metaRef.doc('attendance_data').get()
      ]);

      if (masterDoc.exists && Array.isArray(masterDoc.data().items)) {
        state.certMasterItems = normalizeCertMasterItems(masterDoc.data().items);
      } else {
        metaRef.doc('cert_master_items').set({ items: state.certMasterItems });
      }

      if (kfiDoc.exists && masterDoc.data && kfiDoc.data().map) {
        state.kfiDataMap = kfiDoc.data().map;
      } else {
        metaRef.doc('cert_kfi_map').set({ map: state.kfiDataMap });
      }

      if (deptDoc.exists && Array.isArray(deptDoc.data().departments)) {
        state.departments = deptDoc.data().departments;
      } else {
        metaRef.doc('departments').set({ departments: state.departments });
      }

      if (savedDoc.exists && Array.isArray(savedDoc.data().rows)) {
        state.certSavedRows = savedDoc.data().rows;
      } else {
        metaRef.doc('cert_saved_rows').set({ rows: state.certSavedRows });
      }

      if (qualDoc.exists && Array.isArray(qualDoc.data().rows)) {
        state.qualityRows = qualDoc.data().rows;
      } else {
        metaRef.doc('quality_rows').set({ rows: state.qualityRows || [] });
      }

      if (attDoc && attDoc.exists) {
        const ad = attDoc.data() || {};
        if (Array.isArray(ad.types) && ad.types.length > 0) state.attendanceTypes = ad.types;
        if (Array.isArray(ad.records)) state.attendanceRecords = ad.records;
        if (ad.holidays && typeof ad.holidays === 'object') state.attendanceHolidays = ad.holidays;
        saveLocalAttendanceData();
      } else {
        metaRef.doc('attendance_data').set({
          types: state.attendanceTypes || [],
          records: state.attendanceRecords || [],
          holidays: state.attendanceHolidays || {}
        });
      }

      saveLocalCertData();
    } catch (err) {
      console.warn('검정현황 DB 로드 실패 (로컬 유지):', err);
    }
  }

  async function saveCertDataToDb(silent = false) {
    saveLocalCertData();
    if (!isFirestoreActive || !db) {
      if (!silent) showToast('로컬에 저장되었습니다');
      return;
    }

    try {
      const metaRef = db.collection('pms_metadata');
      await Promise.all([
        metaRef.doc('cert_master_items').set({ items: state.certMasterItems }),
        metaRef.doc('cert_kfi_map').set({ map: state.kfiDataMap }),
        metaRef.doc('departments').set({ departments: state.departments }),
        metaRef.doc('cert_saved_rows').set({ rows: state.certSavedRows }),
        metaRef.doc('quality_rows').set({ rows: state.qualityRows || [] })
      ]);
      if (!silent) showToast('DB에 안전하게 저장되었습니다');
    } catch (err) {
      console.error('검정현황 DB 저장 실패:', err);
      if (!silent) showToast('로컬에 임시 저장되었습니다 (DB 오류)');
    }
  }

  // (4) 스마트 로트번호 포맷터 및 DB 중복 검증
  function formatSmartLotNumber(rawVal, writeDate) {
    if (!rawVal) return '';
    const cleanStr = String(rawVal).trim();
    if (!cleanStr) return '';

    // 이미 "26-001" 형식인 경우
    if (/^\d{2}-\d{3,}$/.test(cleanStr)) {
      return cleanStr;
    }

    // 숫자만 추출
    const numOnly = cleanStr.replace(/[^0-9]/g, '');
    if (!numOnly) return cleanStr;

    // 연도 끝 2자리 결정 (작성일자가 있으면 작성일자 기준, 없으면 현재 연도)
    let yy = '26';
    if (writeDate && writeDate.length >= 4) {
      yy = writeDate.substring(2, 4);
    } else {
      yy = String(new Date().getFullYear()).slice(-2);
    }

    const padded = String(parseInt(numOnly, 10)).padStart(3, '0');
    return `${yy}-${padded}`;
  }

  // 형식번호 기준 로트번호 중복 검증 (전체 저장 DB + 현재 등록 그리드)
  function checkLotNumberDuplicate(formatNo, lotNo, currentDraftRowId) {
    if (!formatNo || !lotNo) return false;
    const cleanLot = String(lotNo).trim();
    const cleanFmt = String(formatNo).trim();
    if (!cleanLot || !cleanFmt) return false;

    // 1) 저장된 누적 DB 검사
    const existsInSaved = (state.certSavedRows || []).some(r =>
      r.formatNo && String(r.formatNo).trim() === cleanFmt &&
      r.lotNo && String(r.lotNo).trim() === cleanLot
    );
    if (existsInSaved) return true;

    // 2) 현재 등록 그리드 검사 (자신 제외)
    const existsInDraft = (state.certDraftRows || []).some(r =>
      r.id !== currentDraftRowId &&
      r.formatNo && String(r.formatNo).trim() === cleanFmt &&
      r.lotNo && String(r.lotNo).trim() === cleanLot
    );
    return existsInDraft;
  }

  // (5) 제조번호 TO 계산 및 KFI 합격표시번호 매핑 갱신
  function updateDraftRowCalculations(row) {
    const qty = parseSafeInt(row.qty);
    const from = parseSafeInt(row.from);

    // 제조번호 TO = 제조번호 FROM + 신청수량 - 1
    if (qty > 0 && from > 0) {
      row.to = from + qty - 1;
    } else {
      row.to = '';
    }

    // KFI 합격표시번호 매핑 알고리즘: [형식번호_제조번호 FROM - 제조번호 TO]
    if (row.formatNo && row.from && row.to) {
      const kfiKey = `${String(row.formatNo).trim()}_${row.from} - ${row.to}`;
      if (state.kfiDataMap && state.kfiDataMap[kfiKey] && !row.passNo) {
        row.passNo = state.kfiDataMap[kfiKey];
      }
    }
  }

  // (5-B) 대한민국 법정 공휴일 (2025~2027) & 금요일/휴일 자동 보정 + 다음 로트번호 감지 + 생산계획 연계 헬퍼
  const KR_HOLIDAYS = {
    // 2025
    '2025-01-01': '신정', '2025-01-28': '설날', '2025-01-29': '설날', '2025-01-30': '설날',
    '2025-03-01': '삼일절', '2025-03-03': '대체공휴일', '2025-05-05': '어린이날', '2025-05-06': '대체공휴일',
    '2025-06-06': '현충일', '2025-08-15': '광복절', '2025-10-03': '개천절',
    '2025-10-05': '추석', '2025-10-06': '추석', '2025-10-07': '추석', '2025-10-08': '대체공휴일',
    '2025-10-09': '한글날', '2025-12-25': '성탄절',
    // 2026
    '2026-01-01': '신정', '2026-02-16': '설날', '2026-02-17': '설날', '2026-02-18': '설날',
    '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날',
    '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일', '2026-06-06': '현충일',
    '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
    '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석',
    '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
    // 2027
    '2027-01-01': '신정', '2027-02-06': '설날', '2027-02-07': '설날', '2027-02-08': '설날', '2027-02-09': '대체공휴일',
    '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날',
    '2027-06-06': '현충일', '2027-08-15': '광복절', '2027-08-16': '대체공휴일',
    '2027-09-14': '추석', '2027-09-15': '추석', '2027-09-16': '추석',
    '2027-10-03': '개천절', '2027-10-04': '대체공휴일', '2027-10-09': '한글날', '2027-10-11': '대체공휴일', '2027-12-25': '성탄절'
  };

  function formatDateYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function adjustBusinessDayBackward(dateObj) {
    const d = new Date(dateObj.getTime());
    for (let i = 0; i < 31; i++) {
      const dow = d.getDay();
      const ymd = formatDateYMD(d);
      const isClosed = !!(state.attendanceHolidays && state.attendanceHolidays[ymd]);
      if (dow !== 0 && dow !== 6 && !KR_HOLIDAYS[ymd] && !isClosed) {
        return ymd;
      }
      d.setDate(d.getDate() - 1);
    }
    return formatDateYMD(d);
  }

  function getPlanWeekFridayDates(yearStr, weekId) {
    const y = Number(yearStr) || new Date().getFullYear();
    const wNum = parseInt(String(weekId || 'W1').replace(/[^0-9]/g, ''), 10) || 1;
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay();
    const offsetToFri = (5 - dow + 7) % 7;
    const baseFri = new Date(y, 0, 1 + offsetToFri + (wNum - 1) * 7);
    const nextFri = new Date(baseFri.getTime());
    nextFri.setDate(baseFri.getDate() + 7);

    return {
      rawFridayStr: formatDateYMD(baseFri),
      weekDate: adjustBusinessDayBackward(baseFri),
      inspectDate: adjustBusinessDayBackward(nextFri)
    };
  }

  // 동일 형식번호 기준 다음 로트번호 미리보기 감지 (자동 적용하지 않음)
  function getNextLotSuggestionsMap(draftRows) {
    const maxByFormatYear = new Map(); // `${formatNo}__${yy}` -> maxNum
    const yyDefault = String(new Date().getFullYear()).slice(-2);

    const recordLot = (formatNo, lotNo) => {
      if (!formatNo || !lotNo) return;
      const m = String(lotNo).trim().match(/^(\d{2})-(\d+)$/);
      if (!m) return;
      const key = `${String(formatNo).trim()}__${m[1]}`;
      const num = parseInt(m[2], 10);
      const prev = maxByFormatYear.get(key) || 0;
      if (num > prev) maxByFormatYear.set(key, num);
    };

    (state.certSavedRows || []).forEach(r => recordLot(r.formatNo, r.lotNo));

    const result = new Map();
    (draftRows || []).forEach(row => {
      const fmt = String(row.formatNo || '').trim();
      if (!fmt) return;
      const yy = row.writeDate && row.writeDate.length >= 4 ? row.writeDate.slice(2, 4) : yyDefault;
      const key = `${fmt}__${yy}`;

      if (row.lotNo && String(row.lotNo).trim()) {
        recordLot(fmt, row.lotNo);
      }

      const curMax = maxByFormatYear.get(key) || 0;
      const nextNum = curMax + 1;
      const suggestion = `${yy}-${String(nextNum).padStart(3, '0')}`;
      const prevLot = curMax > 0 ? `${yy}-${String(curMax).padStart(3, '0')}` : '없음';
      result.set(row.id, { suggestion, prevLot });

      // 같은 작성 테이블 내 빈 로트 행이 연속될 경우 다음 행에는 +1 순차 추천
      if (!row.lotNo || !String(row.lotNo).trim()) {
        maxByFormatYear.set(key, nextNum);
      }
    });

    return result;
  }

  // 동일 형식번호 기준 제조번호 FROM 다음 번호 예측 (미적용)
  function getNextFromSuggestionsMap(draftRows) {
    const maxToByFormat = new Map();

    const recordSerial = (formatNo, fromVal, toVal, qtyVal) => {
      const fmt = String(formatNo || '').trim();
      const from = parseSafeInt(fromVal);
      if (!fmt || from <= 0) return;
      const qty = parseSafeInt(qtyVal);
      const to = parseSafeInt(toVal) || (qty > 0 ? from + qty - 1 : from);
      const prev = maxToByFormat.get(fmt) || 0;
      if (to > prev) maxToByFormat.set(fmt, to);
    };

    (state.certSavedRows || []).forEach(r => recordSerial(r.formatNo, r.from, r.to, r.qty));

    const result = new Map();
    (draftRows || []).forEach(row => {
      const fmt = String(row.formatNo || '').trim();
      if (!fmt) return;

      if (parseSafeInt(row.from) > 0) {
        recordSerial(fmt, row.from, row.to, row.qty);
      }

      const curMaxTo = maxToByFormat.get(fmt) || 0;
      const nextFrom = curMaxTo + 1;
      result.set(row.id, { suggestion: String(nextFrom), prevTo: curMaxTo > 0 ? String(curMaxTo) : '없음' });

      if (parseSafeInt(row.from) <= 0) {
        const qty = parseSafeInt(row.qty);
        maxToByFormat.set(fmt, curMaxTo + (qty > 0 ? qty : 1));
      }
    });

    return result;
  }

  // 동일 형식번호 내 제조번호 중복 및 사이값(구간 겹침) 검사
  function checkSerialRangeOverlap(formatNo, fromVal, toVal, currentDraftRowId) {
    const fmt = String(formatNo || '').trim();
    const myFrom = parseSafeInt(fromVal);
    if (!fmt || myFrom <= 0) return false;
    const myTo = parseSafeInt(toVal) || myFrom;

    const isOverlapping = (r) => {
      if (String(r.formatNo || '').trim() !== fmt) return false;
      const oFrom = parseSafeInt(r.from);
      if (oFrom <= 0) return false;
      const oQty = parseSafeInt(r.qty);
      const oTo = parseSafeInt(r.to) || (oQty > 0 ? oFrom + oQty - 1 : oFrom);
      return myFrom <= oTo && myTo >= oFrom;
    };

    if ((state.certSavedRows || []).some(isOverlapping)) return true;
    if ((state.certDraftRows || []).some(r => r.id !== currentDraftRowId && isOverlapping(r))) return true;
    return false;
  }

  // 생산계획 대비 검정 등록 수량 집계 (code__weekId -> sumQty)
  function getCertRegisteredQtyMap() {
    const map = {};
    (state.certSavedRows || []).forEach(r => {
      const code = String(r.code || '').trim();
      const wId = String(r.sourceWeekId || '').trim();
      if (!code || !wId) return;
      const key = `${code}__${wId}`;
      map[key] = (map[key] || 0) + parseSafeInt(r.qty);
    });
    return map;
  }

  function populateCertPlanWeekSelect() {
    const sel = document.getElementById('cert-plan-week-select');
    if (!sel) return;
    if (!state.planData) loadLocalPlanData();
    const pd = state.planData || getDefaultPlanData();
    const prevVal = state.certSelectedWeekId || sel.value || 'W1';

    sel.innerHTML = '';
    const { weeks } = getPlanPeriodWeeksAndMonths();
    const list = weeks.length > 0 ? weeks : (pd.weeks || []);
    list.forEach(w => {
      const dates = getPlanWeekFridayDates(pd.year, w.id);
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = `${w.id} (${dates.weekDate})`;
      sel.appendChild(opt);
    });

    if (list.some(w => w.id === prevVal)) {
      sel.value = prevVal;
      state.certSelectedWeekId = prevVal;
    } else if (list.length > 0) {
      sel.value = list[0].id;
      state.certSelectedWeekId = list[0].id;
    }
    syncCustomSelect('cert-plan-week-select');
  }

  function buildDraftRowFromMasterAndPlan(item, qty, weekId, dates, todayStr) {
    const row = createNewDraftRow();
    row.code = item.code || '';
    row.name = getDisplayItemName(item);
    row.spec = item.spec || '';
    row.formatNo = item.formatNo || '';
    row.type = item.inspectType || '품질';
    row.group = item.group || '';
    row.sensor = item.sensor || '';
    row.ctrl = item.ctrl || '';
    row.gas = item.gas || '';
    row.writeDate = todayStr;
    row.weekDate = dates.weekDate;
    row.inspectDate = dates.inspectDate;
    row.qty = qty;
    row.sourceWeekId = weekId;
    return row;
  }

  function loadCertDraftFromPlanWeek(weekId, lineFilter) {
    if (!state.planData) loadLocalPlanData();
    const pd = state.planData || getDefaultPlanData();
    const dates = getPlanWeekFridayDates(pd.year, weekId);
    const todayStr = getTodayDateString();
    const regMap = getCertRegisteredQtyMap();
    const targetLine = lineFilter || state.certAutoLineFilter || 'ALL';

    const newDrafts = [];
    (state.certMasterItems || []).forEach(item => {
      if ((item.useYn || '사용') !== '사용') return;
      if ((item.inspectType || '') === '-') return;
      if (targetLine !== 'ALL' && (item.group || '').trim() !== targetLine) return;

      const savedPlan = pd.rowsByCode[item.code];
      const prodRaw = savedPlan && savedPlan.weeks && savedPlan.weeks[weekId] ? savedPlan.weeks[weekId].prod : '';
      const planQty = parsePlanNum(prodRaw);
      if (planQty <= 0) return;

      const regQty = regMap[`${item.code}__${weekId}`] || 0;
      const remaining = planQty - regQty;
      if (remaining <= 0) return;

      newDrafts.push(buildDraftRowFromMasterAndPlan(item, remaining, weekId, dates, todayStr));
    });

    state.certDraftRows = newDrafts;
    saveLocalCertData();
    renderCertDraftTable();
  }

  // (6) 검정현황 화면 메인 렌더링
  function renderCertificationModule() {
    // 자동/수동 모드 UI 동기화
    const isAuto = (state.certMode || 'auto') === 'auto';
    document.querySelectorAll('.cert-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === (isAuto ? 'auto' : 'manual'));
    });
    const autoControls = document.getElementById('cert-auto-controls');
    const addBtn = document.getElementById('btn-cert-add-row');
    if (autoControls) autoControls.style.display = isAuto ? 'inline-flex' : 'none';
    if (addBtn) addBtn.style.display = isAuto ? 'none' : 'inline-flex';

    const autoLineSel = document.getElementById('cert-auto-line-filter');
    if (autoLineSel) {
      autoLineSel.value = state.certAutoLineFilter || 'ALL';
      syncCustomSelect('cert-auto-line-filter');
    }

    populateCertPlanWeekSelect();

    // [표 2] 조회 필터 동기화 (존재하는 날짜만 드롭다운)
    const typeSelect = document.getElementById('cert-filter-type');
    if (typeSelect) {
      typeSelect.value = state.certFilterType || 'writeDate';
      syncCustomSelect('cert-filter-type');
    }

    const lineSelect = document.getElementById('cert-filter-line');
    if (lineSelect) {
      lineSelect.value = state.certFilterLine || 'ALL';
      syncCustomSelect('cert-filter-line');
    }

    renderCertSavedFilterDates();

    const pill = document.getElementById('cert-filter-status-pill');
    if (pill) {
      if (state.certFilterDate) {
        const typeLabel = state.certFilterType === 'writeDate' ? '작성일자' : (state.certFilterType === 'inspectDate' ? '수검일자' : '생산주차');
        pill.className = 'cert-filter-status-pill is-filtered';
        pill.innerHTML = `
          <span>${typeLabel}: <strong>${state.certFilterDate}</strong></span>
          <button type="button" class="btn-clear-cert-filter" id="btn-clear-cert-filter" title="필터 해제">×</button>
        `;
      } else {
        pill.className = 'cert-filter-status-pill';
        pill.innerHTML = `<span>전체 내역</span>`;
      }
    }

    renderCertDraftTable();
    renderCertSavedTable();
  }

  function renderCertSavedFilterDates() {
    const dateSel = document.getElementById('cert-filter-date');
    if (!dateSel) return;
    const filterType = state.certFilterType || 'writeDate';
    const filterLine = state.certFilterLine || 'ALL';
    const allSaved = state.certSavedRows || [];

    const dateSet = new Set();
    allSaved.forEach(row => {
      if (filterLine !== 'ALL' && (row.group || '').trim() !== filterLine) return;
      const d = String(row[filterType] || '').trim();
      if (d) dateSet.add(d);
    });

    const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
    const currentVal = state.certFilterDate || '';

    dateSel.innerHTML = '<option value="">전체 일자</option>';
    sortedDates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      dateSel.appendChild(opt);
    });

    if (currentVal && dateSet.has(currentVal)) {
      dateSel.value = currentVal;
    } else {
      dateSel.value = '';
      if (state.certFilterDate) {
        state.certFilterDate = '';
        localStorage.setItem(STORAGE_KEYS.CERT_FILTER_DATE, '');
      }
    }
    syncCustomSelect('cert-filter-date');
  }

  // (7) [표 1] 검정 등록 그리드 렌더링
  function renderCertDraftTable() {
    const tbody = document.getElementById('cert-draft-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    let totalQty = 0;

    const rows = state.certDraftRows || [];
    if (rows.length === 0) {
      const emptyMsg = (state.certMode || 'auto') === 'auto'
        ? '선택한 주차에 미신청 생산계획 수량이 없습니다.'
        : '작성 중인 행이 없습니다. [+ 행 추가]를 눌러 작성하세요.';
      tbody.innerHTML = `<tr><td colspan="21" style="text-align: center; padding: 25px; color: #94a3b8;">${emptyMsg}</td></tr>`;
      return;
    }

    const lotSuggestions = getNextLotSuggestionsMap(rows);
    const fromSuggestions = getNextFromSuggestionsMap(rows);

    rows.forEach((row, idx) => {
      updateDraftRowCalculations(row);
      const qtyNum = parseSafeInt(row.qty);
      totalQty += qtyNum;

      // 로트번호 중복 여부 확인
      const isDupLot = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id);
      const lotHint = lotSuggestions.get(row.id);
      const lotPlaceholder = lotHint ? lotHint.suggestion : '';
      const lotTitle = isDupLot
        ? '⚠ 동일 형식번호 내 이미 존재하는 로트번호입니다!'
        : (lotHint ? `최근 로트: ${lotHint.prevLot} → 다음 추천: ${lotHint.suggestion}` : '');

      // 제조번호 FROM/TO 중복·사이값 여부 확인 및 다음 번호 예측
      const isDupSerial = checkSerialRangeOverlap(row.formatNo, row.from, row.to, row.id);
      const fromHint = fromSuggestions.get(row.id);
      const fromPlaceholder = fromHint ? fromHint.suggestion : '';
      const fromTitle = isDupSerial
        ? '⚠ 동일 형식번호 내 중복되거나 겹치는 제조번호 구간(사이값)이 있습니다!'
        : (fromHint ? `최근 제조번호 TO: ${fromHint.prevTo} → 다음 추천 FROM: ${fromHint.suggestion}` : '');

      // 요청부서 옵션
      const deptList = (state.departments && state.departments.length > 0) ? state.departments : ['판매팀', '영업팀', '시공팀', '특수사업팀', '금성비나'];
      const deptOptions = deptList.map(d => `<option value="${d}" ${d === row.dept ? 'selected' : ''}>${d}</option>`).join('');

      const tr = document.createElement('tr');
      tr.dataset.id = row.id;
      tr.dataset.rowIndex = idx;

      tr.innerHTML = `
        <td class="col-cert-check" style="text-align: center;">
          <input type="checkbox" class="cert-draft-row-check" data-id="${row.id}" ${row.checked ? 'checked' : ''}>
        </td>
        <td class="col-cert-no" style="text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
        <td class="col-cert-code cell-readonly">
          <input type="text" class="cell-input" readonly value="${row.code || ''}">
        </td>
        <td class="col-cert-name">
          <div class="cert-name-cell-wrap">
            <input type="text" class="cell-input cert-input-name" data-id="${row.id}" value="${getDisplayNameByCode(row.code, row.name || '')}">
            <button type="button" class="btn-search-item btn-open-cert-modal" data-id="${row.id}" title="품목 검색 팝업 (F2)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.5" y2="16.5"></line>
              </svg>
            </button>
          </div>
        </td>
        <td class="col-cert-spec cell-readonly">
          <input type="text" class="cell-input" readonly value="${row.spec || ''}" title="${row.spec || ''}">
        </td>
        <td class="col-cert-format cell-readonly">
          <input type="text" class="cell-input text-center" readonly value="${row.formatNo || ''}">
        </td>
        <td class="col-cert-type cell-readonly">
          <input type="text" class="cell-input text-center" readonly value="${row.type || ''}">
        </td>
        <td class="col-cert-date">
          <input type="date" class="cell-input cert-input-field" data-field="writeDate" data-id="${row.id}" value="${row.writeDate || ''}">
        </td>
        <td class="col-cert-date">
          <input type="date" class="cell-input cert-input-field" data-field="inspectDate" data-id="${row.id}" value="${row.inspectDate || ''}">
        </td>
        <td class="col-cert-date">
          <input type="date" class="cell-input cert-input-field" data-field="weekDate" data-id="${row.id}" value="${row.weekDate || ''}" title="생산주차 금요일">
        </td>
        <td class="col-cert-qty num-cell">
          <input type="text" class="cell-input text-right cert-input-field font-bold" data-field="qty" data-id="${row.id}" value="${qtyNum ? formatNumberDisplay(qtyNum) : ''}" inputmode="numeric">
        </td>
        <td class="col-cert-lot">
          <input type="text" class="cell-input text-center cert-input-lot ${isDupLot ? 'is-duplicate-lot' : ''}" data-id="${row.id}" value="${row.lotNo || ''}" placeholder="${lotPlaceholder}" title="${lotTitle}">
        </td>
        <td class="col-cert-from num-cell">
          <input type="text" class="cell-input text-right cert-input-field ${isDupSerial ? 'is-duplicate-lot' : ''}" data-field="from" data-id="${row.id}" value="${row.from || ''}" placeholder="${fromPlaceholder}" title="${fromTitle}" inputmode="numeric">
        </td>
        <td class="col-cert-to num-cell cell-readonly">
          <input type="text" class="cell-input text-right font-bold text-slate-700" readonly value="${row.to || ''}">
        </td>
        <td class="col-cert-passno cell-readonly">
          <input type="text" class="cell-input" readonly value="${row.passNo || ''}">
        </td>
        <td class="col-cert-site">
          <input type="text" class="cell-input cert-input-field" data-field="site" data-id="${row.id}" value="${row.site || ''}" title="${row.site || ''}">
        </td>
        <td class="col-cert-color">
          <input type="text" class="cell-input cert-input-field" data-field="color" data-id="${row.id}" value="${row.color || ''}">
        </td>
        <td class="col-cert-dept">
          <select class="cell-input cert-select-dept" data-id="${row.id}" style="padding: 2px 4px; font-size: 11px;">
            <option value=""></option>
            ${deptOptions}
          </select>
        </td>
        <td class="col-cert-sensor cell-readonly">
          <input type="text" class="cell-input text-center" readonly value="${row.sensor || ''}">
        </td>
        <td class="col-cert-ctrl cell-readonly">
          <input type="text" class="cell-input text-center" readonly value="${row.ctrl || ''}">
        </td>
        <td class="col-cert-gas cell-readonly">
          <input type="text" class="cell-input text-center" readonly value="${row.gas || ''}">
        </td>
      `;

      tbody.appendChild(tr);
    });

    // 상단 및 하단 합계 요약
    const pillCount = document.getElementById('pill-cert-draft-count');
    if (pillCount) pillCount.textContent = `${rows.length}건`;

    const pillQty = document.getElementById('pill-cert-draft-qty');
    if (pillQty) pillQty.textContent = formatNumberDisplay(totalQty);

    const sumQtyEl = document.getElementById('sum-cert-draft-qty');
    if (sumQtyEl) sumQtyEl.textContent = formatNumberDisplay(totalQty);
  }

  // (8) [표 2] 검정 등록 내역 (저장된 그리드) 렌더링
  function renderCertSavedTable() {
    const tbody = document.getElementById('cert-saved-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const allSaved = state.certSavedRows || [];

    // 필터링 적용 (작성일자 / 수검일자 / 생산주차 & 작업반)
    const filterType = state.certFilterType || 'writeDate';
    const filterDate = state.certFilterDate || '';
    const filterLine = state.certFilterLine || 'ALL';

    const filteredRows = allSaved.filter(row => {
      if (filterDate && row[filterType] !== filterDate) return false;
      if (filterLine !== 'ALL' && (row.group || '').trim() !== filterLine) return false;
      return true;
    });

    let totalSavedQty = 0;

    if (filteredRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="23" style="text-align: center; padding: 25px; color: #94a3b8;">조건에 맞는 등록 내역이 없습니다. (총 누적: ${allSaved.length}건)</td></tr>`;
    } else {
      filteredRows.forEach((row, idx) => {
        const qtyNum = parseSafeInt(row.qty);
        totalSavedQty += qtyNum;

        const status = row.status || '등록완료';
        const isCompleted = (status === '일정완료');

        let statusBadge = '';
        let rowClass = '';
        if (status === '검정신청') {
          statusBadge = `<span class="cert-status-badge status-applied">검정신청</span>`;
          rowClass = 'row-status-applied';
        } else if (status === '품검요청') {
          statusBadge = `<span class="cert-status-badge status-requested">품검요청</span>`;
          rowClass = 'row-status-requested';
        } else if (status === '일정완료') {
          statusBadge = `<span class="cert-status-badge status-completed">🔒 일정완료</span>`;
          rowClass = 'row-status-completed';
        } else {
          statusBadge = `<span class="cert-status-badge status-registered">등록완료</span>`;
        }

        const checkCell = `<input type="checkbox" class="check-cert-saved-row" data-id="${row.id}" ${isCompleted ? 'disabled title="일정완료된 일정은 선택 불가"' : ''}>`;
        const actionCell = isCompleted 
          ? `<span style="font-size: 11px; color: #16a34a; font-weight: 700;">완료(잠금)</span>`
          : `<button type="button" class="btn btn-xs btn-outline text-danger btn-del-cert-saved" data-id="${row.id}" title="이 내역 삭제">삭제</button>`;

        const tr = document.createElement('tr');
        tr.dataset.id = row.id;
        tr.className = rowClass;

        tr.innerHTML = `
          <td class="col-cert-check" style="text-align: center;">${checkCell}</td>
          <td class="col-cert-no" style="text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
          <td class="col-cert-status" style="text-align: center;">${statusBadge}</td>
          <td class="col-cert-code text-center font-bold text-slate-700">${row.code || '-'}</td>
          <td class="col-cert-name font-bold text-primary">${getDisplayNameByCode(row.code, row.name) || '-'}</td>
          <td class="col-cert-spec text-slate-600" title="${row.spec || ''}">${row.spec || '-'}</td>
          <td class="col-cert-format text-center">${row.formatNo || '-'}</td>
          <td class="col-cert-type text-center"><span class="badge" style="background:#f1f5f9; color:#334155;">${row.type || '-'}</span></td>
          <td class="col-cert-date text-center">${row.writeDate || '-'}</td>
          <td class="col-cert-date text-center">${row.inspectDate || '-'}</td>
          <td class="col-cert-date text-center">${row.weekDate || '-'}</td>
          <td class="col-cert-qty num-cell text-right font-bold text-primary" style="padding-right: 8px;">${formatNumberDisplay(qtyNum)}</td>
          <td class="col-cert-lot text-center font-bold text-slate-800">${row.lotNo || '-'}</td>
          <td class="col-cert-from num-cell text-right" style="padding-right: 8px;">${row.from ? formatNumberDisplay(row.from) : '-'}</td>
          <td class="col-cert-to num-cell text-right" style="padding-right: 8px;">${row.to ? formatNumberDisplay(row.to) : '-'}</td>
          <td class="col-cert-passno font-bold text-emerald-700">${row.passNo || '-'}</td>
          <td class="col-cert-site text-slate-700" title="${row.site || ''}">${row.site || '-'}</td>
          <td class="col-cert-color text-center">${row.color || '-'}</td>
          <td class="col-cert-dept text-center"><span class="badge" style="background:#e0f2fe; color:#0369a1;">${row.dept || '-'}</span></td>
          <td class="col-cert-sensor text-center">${row.sensor || '-'}</td>
          <td class="col-cert-ctrl text-center">${row.ctrl || '-'}</td>
          <td class="col-cert-gas text-center">${row.gas || '-'}</td>
          <td class="col-cert-action" style="text-align: center;">${actionCell}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // 요약 표시
    const pillSavedCount = document.getElementById('pill-cert-saved-count');
    if (pillSavedCount) pillSavedCount.textContent = `${filteredRows.length}건 (전체 ${allSaved.length}건)`;

    const pillSavedQty = document.getElementById('pill-cert-saved-qty');
    if (pillSavedQty) pillSavedQty.textContent = formatNumberDisplay(totalSavedQty);

    const sumSavedQtyEl = document.getElementById('sum-cert-saved-qty');
    if (sumSavedQtyEl) sumSavedQtyEl.textContent = formatNumberDisplay(totalSavedQty);

    updateCertBadgeCounts();
  }

  // (8-B) [품질검사] 그리드 렌더링 (검정현황 품검요청 연동)
  function renderQualityTable() {
    const tbody = document.getElementById('quality-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const allQuality = state.qualityRows || [];
    const filterDate = state.qualityFilterDate || '';

    const filtered = allQuality.filter(row => {
      if (!filterDate) return true;
      return (row.writeDate === filterDate || row.inspectDate === filterDate || row.weekDate === filterDate);
    });

    let totalQty = 0;
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="23" style="text-align: center; padding: 35px; color: #94a3b8; font-size: 13.5px;">
        💡 품검 요청된 일정이 없습니다. [검정현황] 화면에서 일정을 선택 후 <strong>[품검요청]</strong>을 누르면 이 화면에 추가됩니다.
      </td></tr>`;
    } else {
      filtered.forEach((row, idx) => {
        const qtyNum = parseSafeInt(row.qty);
        totalQty += qtyNum;

        const tr = document.createElement('tr');
        tr.dataset.id = row.id;

        tr.innerHTML = `
          <td class="col-cert-check" style="text-align: center;">
            <input type="checkbox" class="check-quality-row" data-id="${row.id}" data-cert-id="${row.certRowId || row.id}">
          </td>
          <td class="col-cert-no" style="text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
          <td class="col-cert-status" style="text-align: center;">
            <span class="cert-status-badge status-requested">품검요청</span>
          </td>
          <td class="col-cert-type text-center"><span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700;">${row.type || '품질'}</span></td>
          <td class="col-cert-group text-center font-bold text-slate-700">${row.group || '-'}</td>
          <td class="col-cert-code text-center font-bold text-slate-700">${row.code || '-'}</td>
          <td class="col-cert-name font-bold text-primary">${getDisplayNameByCode(row.code, row.name) || '-'}</td>
          <td class="col-cert-spec text-slate-600" title="${row.spec || ''}">${row.spec || '-'}</td>
          <td class="col-cert-format text-center">${row.formatNo || '-'}</td>
          <td class="col-cert-date text-center">${row.writeDate || '-'}</td>
          <td class="col-cert-date text-center">${row.inspectDate || '-'}</td>
          <td class="col-cert-date text-center">${row.weekDate || '-'}</td>
          <td class="col-cert-qty num-cell text-right font-bold text-primary" style="padding-right: 8px;">${formatNumberDisplay(qtyNum)}</td>
          <td class="col-cert-lot text-center font-bold text-slate-800">${row.lotNo || '-'}</td>
          <td class="col-cert-from num-cell text-right" style="padding-right: 8px;">${row.from ? formatNumberDisplay(row.from) : '-'}</td>
          <td class="col-cert-to num-cell text-right" style="padding-right: 8px;">${row.to ? formatNumberDisplay(row.to) : '-'}</td>
          <td class="col-cert-passno font-bold text-emerald-700">${row.passNo || '-'}</td>
          <td class="col-cert-site text-slate-700" title="${row.site || ''}">${row.site || '-'}</td>
          <td class="col-cert-color text-center">${row.color || '-'}</td>
          <td class="col-cert-dept text-center"><span class="badge" style="background:#e0f2fe; color:#0369a1;">${row.dept || '-'}</span></td>
          <td class="col-cert-sensor text-center">${row.sensor || '-'}</td>
          <td class="col-cert-ctrl text-center">${row.ctrl || '-'}</td>
          <td class="col-cert-gas text-center">${row.gas || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // 통계 배지
    const pillCount = document.getElementById('pill-quality-count');
    if (pillCount) pillCount.textContent = `${filtered.length}건`;

    const pillQty = document.getElementById('pill-quality-qty');
    if (pillQty) pillQty.textContent = formatNumberDisplay(totalQty);

    const sumQtyEl = document.getElementById('sum-quality-qty');
    if (sumQtyEl) sumQtyEl.textContent = formatNumberDisplay(totalQty);
  }

  function formatOptionalNum(val) {
    if (val === undefined || val === null || String(val).trim() === '') return '-';
    const n = Number(String(val).replace(/,/g, ''));
    return Number.isFinite(n) ? n.toLocaleString() : String(val);
  }

  // (9) 설정 탭: 품목정보 그리드 렌더링
  function renderCertMasterTable() {
    const tbody = document.getElementById('master-cert-items-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const masterItems = state.certMasterItems || [];
    const filterGroup = state.certMasterFilterGroup || 'ALL';
    const mainGroups = ['유도등반', '수신기반', '감지기반'];

    // 작업반별 및 검색 필터링
    const searchQ = (document.getElementById('cert-master-search')?.value || '').trim().toLowerCase();
    const filtered = masterItems.filter(item => {
      if (filterGroup === '기타' && mainGroups.includes(item.group)) return false;
      if (filterGroup !== 'ALL' && filterGroup !== '기타' && item.group !== filterGroup) return false;
      if (searchQ) {
        return (item.code || '').toLowerCase().includes(searchQ) ||
               (item.altName || '').toLowerCase().includes(searchQ) ||
               (item.name || '').toLowerCase().includes(searchQ) ||
               (item.modelName || '').toLowerCase().includes(searchQ);
      }
      return true;
    });

    // 탭 카운트 업데이트
    const countAll = masterItems.length;
    const countGuide = masterItems.filter(i => i.group === '유도등반').length;
    const countReceiver = masterItems.filter(i => i.group === '수신기반').length;
    const countDetector = masterItems.filter(i => i.group === '감지기반').length;
    const countEtc = masterItems.filter(i => !mainGroups.includes(i.group)).length;

    const elAll = document.getElementById('count-cert-tab-all');
    if (elAll) elAll.textContent = countAll;
    const elGuide = document.getElementById('count-cert-tab-guide');
    if (elGuide) elGuide.textContent = countGuide;
    const elRecv = document.getElementById('count-cert-tab-receiver');
    if (elRecv) elRecv.textContent = countReceiver;
    const elDet = document.getElementById('count-cert-tab-detector');
    if (elDet) elDet.textContent = countDetector;
    const elEtc = document.getElementById('count-cert-tab-etc');
    if (elEtc) elEtc.textContent = countEtc;

    const chkAll = document.getElementById('chk-cert-master-all');
    if (chkAll) chkAll.checked = false;
    const btnEdit = document.getElementById('btn-cert-selected-edit');
    const btnDel = document.getElementById('btn-cert-selected-delete');
    const btnSave = document.getElementById('btn-cert-inline-save');
    const btnCancel = document.getElementById('btn-cert-inline-cancel');
    if (btnEdit) btnEdit.style.display = '';
    if (btnDel) btnDel.style.display = '';
    if (btnSave) btnSave.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'none';

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="22" style="text-align: center; padding: 25px; color: #94a3b8;">등록된 품목이 없습니다. 상단 [+ 신규 품목 등록] 또는 [엑셀 업로드]를 이용하세요.</td></tr>`;
      return;
    }

    filtered.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'draggable-row cert-master-row';
      tr.draggable = true;
      tr.dataset.id = item.id;
      tr.dataset.dragIndex = idx;

      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="chk-cert-master-row" data-id="${item.id}"></td>
        <td class="drag-handle-cell" style="text-align: center; cursor: grab; color: #94a3b8;">${idx + 1}</td>
        <td style="text-align: center;"><span class="badge ${item.useYn === '사용' ? 'badge-success' : 'badge-ghost'}">${item.useYn || '사용'}</span></td>
        <td style="text-align: center;"><span class="badge" style="background:#f1f5f9; color:#334155;">${item.inspectType || '-'}</span></td>
        <td style="text-align: center; font-weight:600; color:#0284c7;">${item.group || '-'}</td>
        <td style="text-align: center;">${item.itemGroup || '-'}</td>
        <td class="font-bold text-slate-800">${item.code || '-'}</td>
        <td class="font-bold text-primary">${item.altName || '-'}</td>
        <td class="text-slate-700">${item.name || '-'}</td>
        <td class="text-slate-600" title="${item.spec || ''}">${item.spec || '-'}</td>
        <td style="text-align: center;">${item.formatNo || '-'}</td>
        <td>${item.modelName || '-'}</td>
        <td style="text-align: right;">${formatOptionalNum(item.unitPrice)}</td>
        <td style="text-align: right;">${formatOptionalNum(item.baseStock)}</td>
        <td style="text-align: right;">${formatOptionalNum(item.minStock)}</td>
        <td style="text-align: right;">${formatOptionalNum(item.maxStock)}</td>
        <td style="text-align: right;">${formatOptionalNum(item.stAssembly)}</td>
        <td style="text-align: right;">${formatOptionalNum(item.stInspect)}</td>
        <td style="text-align: right;">${formatOptionalNum(item.stPack)}</td>
        <td style="text-align: center;">${item.sensor || '-'}</td>
        <td style="text-align: center;">${item.ctrl || '-'}</td>
        <td style="text-align: center;">${item.gas || '-'}</td>
      `;

      tbody.appendChild(tr);
    });

    bindCertMasterDragAndDrop(tbody);
    updateCertBadgeCounts();
  }

  // (10) 설정 탭: 요청부서 관리 렌더링
  function renderDepartmentSettings() {
    const tbody = document.getElementById('master-departments-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const depts = state.departments || [];

    if (depts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#94a3b8;">등록된 부서가 없습니다.</td></tr>`;
      return;
    }

    depts.forEach((dept, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td class="font-bold text-slate-800 dept-name-cell">${dept}</td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-xs btn-ghost text-danger btn-del-dept" data-index="${idx}">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    updateCertBadgeCounts();
  }

  // (11) KFI 정보 연동 요약 업데이트
  function updateKfiUploadSummary() {
    const count = Object.keys(state.kfiDataMap || {}).length;
    const summaryBox = document.getElementById('kfi-upload-summary-box');
    const summaryCount = document.getElementById('kfi-summary-count');
    if (summaryBox && summaryCount) {
      if (count > 0) {
        summaryBox.style.display = 'block';
        summaryCount.textContent = formatNumberDisplay(count);
      } else {
        summaryBox.style.display = 'none';
      }
    }
    updateCertBadgeCounts();
  }

  // (12) F2 품목 검색 모달 제어
  function openCertItemModal(draftRowId) {
    state.activeModalDraftRowId = draftRowId;
    const modal = document.getElementById('modal-cert-item-search');
    const searchInput = document.getElementById('cert-modal-search-input');
    if (!modal) return;

    modal.style.display = 'flex';
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 50);
    }

    renderCertModalList('ALL', '');
  }

  function closeCertItemModal() {
    state.activeModalDraftRowId = null;
    const modal = document.getElementById('modal-cert-item-search');
    if (modal) modal.style.display = 'none';
  }

  function renderCertModalList(groupFilter, query) {
    const tbody = document.getElementById('cert-modal-item-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const cleanQ = (query || '').toLowerCase().trim();
    const items = state.certMasterItems || [];

    const filtered = items.filter(it => {
      if (groupFilter !== 'ALL' && it.group !== groupFilter) return false;
      if (!cleanQ) return true;
      const matchCode = (it.code || '').toLowerCase().includes(cleanQ);
      const matchAltName = (it.altName || '').toLowerCase().includes(cleanQ);
      const matchName = (it.name || '').toLowerCase().includes(cleanQ);
      const matchSpec = (it.spec || '').toLowerCase().includes(cleanQ);
      const matchFmt = (it.formatNo || '').toLowerCase().includes(cleanQ);
      return matchCode || matchAltName || matchName || matchSpec || matchFmt;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 25px; color: #94a3b8;">검색 결과가 없습니다.</td></tr>`;
      return;
    }

    filtered.forEach((it, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = it.id;
      tr.innerHTML = `
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="text-align: center; font-weight: 600; color: #0284c7;">${it.group || '-'}</td>
        <td class="font-bold text-slate-800">${it.code || '-'}</td>
        <td class="font-bold text-primary">${getDisplayItemName(it) || '-'}</td>
        <td class="text-slate-600" title="${it.spec || ''}">${it.spec || '-'}</td>
        <td style="text-align: center;">${it.formatNo || '-'}</td>
        <td style="text-align: center;"><span class="badge" style="background:#f1f5f9; color:#334155;">${it.inspectType || '품질'}</span></td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-xs btn-primary btn-select-modal-item" data-id="${it.id}">선택</button>
        </td>
      `;

      // 더블클릭 시 바로 선택
      tr.addEventListener('dblclick', () => {
        applyItemToActiveDraftRow(it);
      });

      tbody.appendChild(tr);
    });
  }

  function applyItemToActiveDraftRow(item) {
    if (!state.activeModalDraftRowId) return;
    const targetRow = (state.certDraftRows || []).find(r => r.id === state.activeModalDraftRowId);
    if (targetRow) {
      targetRow.code = item.code || '';
      targetRow.name = getDisplayItemName(item);
      targetRow.spec = item.spec || '';
      targetRow.formatNo = item.formatNo || '';
      targetRow.type = item.inspectType || '품질';
      targetRow.sensor = item.sensor || '';
      targetRow.ctrl = item.ctrl || '';
      targetRow.gas = item.gas || '';

      updateDraftRowCalculations(targetRow);
      saveLocalCertData();
      renderCertDraftTable();
    }
    closeCertItemModal();
  }

  // 커스텀 드롭다운 UI 헬퍼 (네이티브 <select>를 숨기고 첫 번째 사진과 동일한 세련된 드롭다운으로 래핑)
  function syncCustomSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const wrap = sel.nextElementSibling;
    if (!wrap || !wrap.classList.contains('ui-custom-select-wrap')) return;

    const btnText = wrap.querySelector('.ui-custom-select-label');
    const menu = wrap.querySelector('.ui-custom-select-menu');
    const selectedOpt = sel.options[sel.selectedIndex] || sel.options[0];
    if (btnText) btnText.textContent = selectedOpt ? selectedOpt.textContent : '';

    if (menu) {
      menu.innerHTML = '';
      Array.from(sel.options).forEach(opt => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `ui-custom-select-option ${opt.value === sel.value ? 'is-selected' : ''}`;
        item.textContent = opt.textContent;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          wrap.classList.remove('is-open');
          if (sel.value !== opt.value) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          syncCustomSelect(selectId);
        });
        menu.appendChild(item);
      });
    }
  }

  function enhanceSelectToCustomDropdown(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel || sel.dataset.customized === '1') return;
    sel.dataset.customized = '1';
    sel.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'plan-dropdown-wrap ui-custom-select-wrap';
    wrap.innerHTML = `
      <button type="button" class="ui-custom-select-btn" title="${sel.title || ''}">
        <span class="ui-custom-select-label"></span>
        <span class="ui-caret">▾</span>
      </button>
      <div class="plan-dropdown-menu ui-custom-select-menu"></div>
    `;
    sel.insertAdjacentElement('afterend', wrap);

    const btn = wrap.querySelector('.ui-custom-select-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.plan-dropdown-wrap').forEach(w => {
        if (w !== wrap) w.classList.remove('is-open');
      });
      wrap.classList.toggle('is-open');
    });

    sel.addEventListener('change', () => syncCustomSelect(selectId));
    syncCustomSelect(selectId);
  }

  // (13) 검정현황 전용 이벤트 리스너 바인딩
  function initCertEventListeners() {
    // 검정현황 드롭다운 커스텀 스타일 적용
    enhanceSelectToCustomDropdown('cert-plan-week-select');
    enhanceSelectToCustomDropdown('cert-auto-line-filter');
    enhanceSelectToCustomDropdown('cert-filter-line');
    enhanceSelectToCustomDropdown('cert-filter-type');
    enhanceSelectToCustomDropdown('cert-filter-date');

    // 0. 자동 / 수동 모드 전환 & 주차 / 작업반 연동
    document.querySelectorAll('.cert-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'manual' ? 'manual' : 'auto';
        if (state.certMode === mode) return;
        state.certMode = mode;
        if (mode === 'auto') {
          populateCertPlanWeekSelect();
          loadCertDraftFromPlanWeek(state.certSelectedWeekId || 'W1', state.certAutoLineFilter || 'ALL');
        } else {
          if (!state.certDraftRows || state.certDraftRows.length === 0) {
            state.certDraftRows = [createNewDraftRow()];
          }
        }
        renderCertificationModule();
      });
    });

    document.getElementById('cert-plan-week-select')?.addEventListener('change', (e) => {
      state.certSelectedWeekId = e.target.value;
      if ((state.certMode || 'auto') === 'auto') {
        loadCertDraftFromPlanWeek(state.certSelectedWeekId, state.certAutoLineFilter || 'ALL');
      }
    });

    document.getElementById('cert-auto-line-filter')?.addEventListener('change', (e) => {
      state.certAutoLineFilter = e.target.value;
      if ((state.certMode || 'auto') === 'auto') {
        loadCertDraftFromPlanWeek(state.certSelectedWeekId || 'W1', state.certAutoLineFilter);
      }
    });

    // 0-B. [분할] 모달 로직
    let splitTargetRowId = null;
    let splitMode = 'manual'; // 'manual' | 'lot'

    function renderSplitManualRows(amounts) {
      const wrap = document.getElementById('cert-split-rows-wrap');
      if (!wrap) return;
      wrap.innerHTML = '';
      amounts.forEach((amt, i) => {
        const div = document.createElement('div');
        div.className = 'cert-split-line-row';
        div.innerHTML = `
          <label>분할 ${i + 1}</label>
          <input type="number" class="form-input form-input-sm cert-split-amt-input" data-idx="${i}" min="1" value="${amt || ''}" style="flex: 1; text-align: right;">
          ${amounts.length > 2 ? `<button type="button" class="btn btn-xs btn-ghost text-danger btn-del-split-line" data-idx="${i}">×</button>` : ''}
        `;
        wrap.appendChild(div);
      });
      updateSplitSumStatus();
    }

    function updateSplitSumStatus() {
      const row = (state.certDraftRows || []).find(r => r.id === splitTargetRowId);
      const origQty = row ? parseSafeInt(row.qty) : 0;
      const inputs = Array.from(document.querySelectorAll('#cert-split-rows-wrap .cert-split-amt-input'));
      const sum = inputs.reduce((acc, inp) => acc + parseSafeInt(inp.value), 0);
      const stEl = document.getElementById('cert-split-sum-status');
      if (!stEl) return;
      if (sum === origQty && inputs.every(inp => parseSafeInt(inp.value) > 0)) {
        stEl.style.color = '#16a34a';
        stEl.textContent = `합계 일치: ${sum.toLocaleString()} / ${origQty.toLocaleString()}`;
      } else {
        stEl.style.color = '#dc2626';
        stEl.textContent = `합계: ${sum.toLocaleString()} / 원수량: ${origQty.toLocaleString()}`;
      }
    }

    function updateSplitLotPreview() {
      const row = (state.certDraftRows || []).find(r => r.id === splitTargetRowId);
      const origQty = row ? parseSafeInt(row.qty) : 0;
      const unit = parseSafeInt(document.getElementById('cert-split-lot-unit')?.value);
      const prevEl = document.getElementById('cert-split-lot-preview');
      if (!prevEl) return;
      if (unit <= 0 || origQty <= 0) {
        prevEl.textContent = '1 LOT 기준 수량을 입력하세요.';
        return;
      }
      const parts = [];
      let rem = origQty;
      while (rem > 0) {
        const take = Math.min(rem, unit);
        parts.push(take);
        rem -= take;
      }
      prevEl.textContent = `${parts.length}개 행으로 분할: ${parts.map(p => p.toLocaleString()).join(' / ')}`;
    }

    document.getElementById('btn-cert-split-row')?.addEventListener('click', () => {
      const checked = (state.certDraftRows || []).filter(r => r.checked);
      if (checked.length !== 1) {
        alert('분할할 행을 1개만 체크해 주세요.');
        return;
      }
      const target = checked[0];
      const origQty = parseSafeInt(target.qty);
      if (origQty < 2) {
        alert('신청수량이 2 이상인 행만 분할할 수 있습니다.');
        return;
      }
      splitTargetRowId = target.id;
      splitMode = 'manual';
      document.getElementById('btn-split-tab-manual')?.classList.add('active');
      document.getElementById('btn-split-tab-lot')?.classList.remove('active');
      document.getElementById('cert-split-manual-pane').style.display = 'block';
      document.getElementById('cert-split-lot-pane').style.display = 'none';

      const info = document.getElementById('cert-split-item-info');
      if (info) {
        info.innerHTML = `<strong>${target.name || target.code}</strong> (${target.code || ''})<br>현재 신청수량: <strong style="color:#2563eb;">${origQty.toLocaleString()}</strong>`;
      }
      const half = Math.floor(origQty / 2);
      renderSplitManualRows([half, origQty - half]);
      document.getElementById('cert-split-modal').style.display = 'flex';
    });

    document.getElementById('btn-split-tab-manual')?.addEventListener('click', () => {
      splitMode = 'manual';
      document.getElementById('btn-split-tab-manual')?.classList.add('active');
      document.getElementById('btn-split-tab-lot')?.classList.remove('active');
      document.getElementById('cert-split-manual-pane').style.display = 'block';
      document.getElementById('cert-split-lot-pane').style.display = 'none';
    });

    document.getElementById('btn-split-tab-lot')?.addEventListener('click', () => {
      splitMode = 'lot';
      document.getElementById('btn-split-tab-lot')?.classList.add('active');
      document.getElementById('btn-split-tab-manual')?.classList.remove('active');
      document.getElementById('cert-split-lot-pane').style.display = 'block';
      document.getElementById('cert-split-manual-pane').style.display = 'none';
      updateSplitLotPreview();
    });

    document.getElementById('cert-split-rows-wrap')?.addEventListener('input', (e) => {
      if (!e.target.classList.contains('cert-split-amt-input')) return;
      const inputs = Array.from(document.querySelectorAll('#cert-split-rows-wrap .cert-split-amt-input'));
      const idx = Number(e.target.dataset.idx);
      const row = (state.certDraftRows || []).find(r => r.id === splitTargetRowId);
      const origQty = row ? parseSafeInt(row.qty) : 0;
      if (inputs.length === 2 && idx === 0) {
        const v0 = parseSafeInt(inputs[0].value);
        inputs[1].value = Math.max(0, origQty - v0);
      }
      updateSplitSumStatus();
    });

    document.getElementById('cert-split-rows-wrap')?.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.btn-del-split-line');
      if (!delBtn) return;
      const inputs = Array.from(document.querySelectorAll('#cert-split-rows-wrap .cert-split-amt-input'));
      const idx = Number(delBtn.dataset.idx);
      const vals = inputs.map(i => parseSafeInt(i.value)).filter((_, i) => i !== idx);
      renderSplitManualRows(vals);
    });

    document.getElementById('btn-split-add-line')?.addEventListener('click', () => {
      const inputs = Array.from(document.querySelectorAll('#cert-split-rows-wrap .cert-split-amt-input'));
      const vals = inputs.map(i => parseSafeInt(i.value));
      vals.push('');
      renderSplitManualRows(vals);
    });

    document.getElementById('cert-split-lot-unit')?.addEventListener('input', updateSplitLotPreview);

    const closeSplitModal = () => {
      document.getElementById('cert-split-modal').style.display = 'none';
      splitTargetRowId = null;
    };
    document.getElementById('btn-close-split-modal')?.addEventListener('click', closeSplitModal);
    document.getElementById('btn-cancel-split-modal')?.addEventListener('click', closeSplitModal);

    document.getElementById('btn-confirm-split-modal')?.addEventListener('click', () => {
      const idx = (state.certDraftRows || []).findIndex(r => r.id === splitTargetRowId);
      if (idx === -1) return;
      const origRow = state.certDraftRows[idx];
      const origQty = parseSafeInt(origRow.qty);

      let parts = [];
      if (splitMode === 'lot') {
        const unit = parseSafeInt(document.getElementById('cert-split-lot-unit')?.value);
        if (unit <= 0) {
          alert('1 LOT 기준 수량을 1 이상 입력하세요.');
          return;
        }
        let rem = origQty;
        while (rem > 0) {
          const take = Math.min(rem, unit);
          parts.push(take);
          rem -= take;
        }
      } else {
        const inputs = Array.from(document.querySelectorAll('#cert-split-rows-wrap .cert-split-amt-input'));
        parts = inputs.map(i => parseSafeInt(i.value));
        if (parts.some(p => p <= 0)) {
          alert('모든 분할 수량은 1 이상이어야 합니다.');
          return;
        }
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum !== origQty) {
          alert(`분할 수량 합계(${sum.toLocaleString()})가 원래 수량(${origQty.toLocaleString()})과 일치해야 합니다.`);
          return;
        }
      }

      if (parts.length < 2) {
        alert('2개 이상으로 분할해 주세요.');
        return;
      }

      origRow.qty = parts[0];
      origRow.checked = false;
      updateDraftRowCalculations(origRow);

      const extraRows = parts.slice(1).map((pQty, offset) => {
        const clone = { ...origRow };
        clone.id = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${offset}`;
        clone.qty = pQty;
        clone.lotNo = '';
        clone.from = '';
        clone.to = '';
        clone.passNo = '';
        clone.checked = false;
        return clone;
      });

      state.certDraftRows.splice(idx + 1, 0, ...extraRows);
      saveLocalCertData();
      renderCertDraftTable();
      closeSplitModal();
      showToast(`${parts.length}개 행으로 분할되었습니다.`);
    });

    // 0-C. [기존 로트 합산] 모달 로직
    let mergeDraftRowId = null;
    let mergeSelectedTargetId = null;

    const closeMergeModal = () => {
      document.getElementById('cert-merge-modal').style.display = 'none';
      mergeDraftRowId = null;
      mergeSelectedTargetId = null;
    };
    document.getElementById('btn-close-merge-modal')?.addEventListener('click', closeMergeModal);
    document.getElementById('btn-cancel-merge-modal')?.addEventListener('click', closeMergeModal);

    document.getElementById('btn-cert-merge-lot')?.addEventListener('click', () => {
      const checked = (state.certDraftRows || []).filter(r => r.checked);
      if (checked.length !== 1) {
        alert('기존 로트에 합산할 행을 1개만 체크해 주세요.');
        return;
      }
      const src = checked[0];
      const addQty = parseSafeInt(src.qty);
      if (!src.code || addQty <= 0) {
        alert('품목코드와 수량이 있는 행만 합산할 수 있습니다.');
        return;
      }

      const candidates = (state.certSavedRows || []).filter(r =>
        String(r.code || '').trim() === String(src.code || '').trim() &&
        ((src.sourceWeekId && r.sourceWeekId === src.sourceWeekId) || (src.weekDate && r.weekDate === src.weekDate)) &&
        r.status !== '일정완료' && r.status !== '품검요청'
      );

      if (candidates.length === 0) {
        alert('합산 가능한 기존 등록 로트(동일 품목·생산주차, 대기/등록완료/검정신청 상태)가 없습니다.');
        return;
      }

      mergeDraftRowId = src.id;
      mergeSelectedTargetId = candidates[0].id;

      const info = document.getElementById('cert-merge-source-info');
      if (info) {
        info.innerHTML = `<strong>${src.name || src.code}</strong> (${src.code}) — 추가 수량: <strong style="color:#2563eb;">+${addQty.toLocaleString()}</strong>`;
      }

      const listEl = document.getElementById('cert-merge-target-list');
      listEl.innerHTML = '';
      candidates.forEach(c => {
        const curQty = parseSafeInt(c.qty);
        const div = document.createElement('div');
        div.className = `cert-merge-item ${c.id === mergeSelectedTargetId ? 'is-selected' : ''}`;
        div.dataset.id = c.id;
        div.innerHTML = `
          <div>
            <strong>로트: ${c.lotNo || '(미입력)'}</strong>
            <span style="font-size:11.5px; color:#64748b; margin-left:6px;">[${c.status || '등록완료'}] · 주차 ${c.weekDate || '-'}</span>
          </div>
          <div style="font-family:'JetBrains Mono',monospace; font-weight:700; color:#1e293b;">
            ${curQty.toLocaleString()} → <span style="color:#2563eb;">${(curQty + addQty).toLocaleString()}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          mergeSelectedTargetId = c.id;
          listEl.querySelectorAll('.cert-merge-item').forEach(el => el.classList.toggle('is-selected', el.dataset.id === c.id));
        });
        listEl.appendChild(div);
      });

      document.getElementById('cert-merge-modal').style.display = 'flex';
    });

    document.getElementById('btn-confirm-merge-modal')?.addEventListener('click', async () => {
      const srcIdx = (state.certDraftRows || []).findIndex(r => r.id === mergeDraftRowId);
      const targetRow = (state.certSavedRows || []).find(r => r.id === mergeSelectedTargetId);
      if (srcIdx === -1 || !targetRow) return;

      const src = state.certDraftRows[srcIdx];
      const addQty = parseSafeInt(src.qty);
      const newQty = parseSafeInt(targetRow.qty) + addQty;
      targetRow.qty = newQty;
      if (parseSafeInt(targetRow.from) > 0) {
        targetRow.to = parseSafeInt(targetRow.from) + newQty - 1;
      }

      state.certDraftRows.splice(srcIdx, 1);
      saveLocalCertData();
      await saveCertDataToDb(true);
      closeMergeModal();
      renderCertificationModule();
      showToast(`기존 로트(${targetRow.lotNo || '미입력'})에 ${addQty.toLocaleString()}개가 합산되었습니다 (총 ${newQty.toLocaleString()}개).`);
    });

    // 1. [표 2] 기준일자 드롭다운 및 조회기준 변경
    const filterDateInput = document.getElementById('cert-filter-date');
    if (filterDateInput) {
      filterDateInput.addEventListener('change', (e) => {
        state.certFilterDate = e.target.value;
        saveLocalCertData();
        renderCertificationModule();
      });
    }

    const filterTypeSelect = document.getElementById('cert-filter-type');
    if (filterTypeSelect) {
      filterTypeSelect.addEventListener('change', (e) => {
        state.certFilterType = e.target.value;
        state.certFilterDate = '';
        saveLocalCertData();
        renderCertificationModule();
      });
    }

    // 1-B. 그리드 1 날짜 헤더 옆 [1행 날짜 일괄적용] 아이콘 버튼
    document.querySelectorAll('#cert-draft-table .btn-cert-bulk-date').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const rows = state.certDraftRows || [];
        if (rows.length === 0) return;

        const firstVal = String(rows[0][field] || '').trim();
        if (!firstVal) {
          alert('1행에 날짜를 먼저 입력해 주세요.');
          return;
        }

        const checkedRows = rows.filter(r => r.checked);
        const targets = checkedRows.length > 0 ? checkedRows : rows;
        const fieldLabel = field === 'writeDate' ? '작성일자' : (field === 'inspectDate' ? '수검일자' : '생산주차');
        const scopeLabel = checkedRows.length > 0 ? `선택한 ${targets.length}개 행` : `전체 ${targets.length}개 행`;

        if (!confirm(`${scopeLabel}의 [${fieldLabel}]를 1행 날짜(${firstVal})로 일괄 적용할까요?`)) {
          return;
        }

        targets.forEach(r => { r[field] = firstVal; });
        saveLocalCertData();
        renderCertDraftTable();
        showToast(`${scopeLabel}의 ${fieldLabel}가 ${firstVal}(으)로 일괄 적용되었습니다.`);
      });
    });

    // 2. 검정 등록 그리드 행 추가 / 삭제
    const btnAddDraftRow = document.getElementById('btn-cert-add-row');
    if (btnAddDraftRow) {
      btnAddDraftRow.addEventListener('click', () => {
        state.certDraftRows.push(createNewDraftRow());
        saveLocalCertData();
        renderCertDraftTable();
        // 새로 추가된 행의 품명에 포커스
        setTimeout(() => {
          const names = document.querySelectorAll('#cert-draft-tbody .cert-input-name');
          if (names.length > 0) names[names.length - 1].focus();
        }, 50);
      });
    }

    const btnDelDraftRow = document.getElementById('btn-cert-del-row');
    if (btnDelDraftRow) {
      btnDelDraftRow.addEventListener('click', () => {
        const checkedCount = state.certDraftRows.filter(r => r.checked).length;
        if (checkedCount === 0) {
          alert('삭제할 행의 체크박스를 선택해주세요.');
          return;
        }
        if (confirm(`선택한 ${checkedCount}개 행을 작성 목록에서 삭제하시겠습니까?`)) {
          state.certDraftRows = state.certDraftRows.filter(r => !r.checked);
          if (state.certDraftRows.length === 0) {
            state.certDraftRows = [createNewDraftRow()];
          }
          saveLocalCertData();
          renderCertDraftTable();
        }
      });
    }

    const checkAllDraft = document.getElementById('check-all-cert-draft');
    if (checkAllDraft) {
      checkAllDraft.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        (state.certDraftRows || []).forEach(r => { r.checked = isChecked; });
        const rowChecks = document.querySelectorAll('.cert-draft-row-check');
        rowChecks.forEach(c => { c.checked = isChecked; });
      });
    }

    // 3. [등록] 버튼 클릭 (체크된 행 우선, 미체크 시 전체 유효 행 등록)
    const btnCertSave = document.getElementById('btn-cert-save');
    if (btnCertSave) {
      btnCertSave.addEventListener('click', async () => {
        const draftRows = state.certDraftRows || [];
        const checkedRows = draftRows.filter(r => r.checked && ((r.name && r.name.trim()) || parseSafeInt(r.qty) > 0));
        const allValidRows = draftRows.filter(r => (r.name && r.name.trim()) || parseSafeInt(r.qty) > 0);
        const validRows = checkedRows.length > 0 ? checkedRows : allValidRows;

        if (validRows.length === 0) {
          alert('등록할 검정 신청 데이터가 없습니다. 품명과 수량을 입력해주세요.');
          return;
        }

        // 로트번호 및 제조번호 구간 중복 검사
        for (const row of validRows) {
          if (row.formatNo && row.lotNo) {
            const isDup = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id);
            if (isDup) {
              alert(`[중복 경고] 형식번호 '${row.formatNo}'에 로트번호 '${row.lotNo}'가 이미 등록되어 있습니다.\n로트번호를 수정한 후 다시 등록해주세요.`);
              return;
            }
          }
          if (row.formatNo && parseSafeInt(row.from) > 0) {
            const isDupSer = checkSerialRangeOverlap(row.formatNo, row.from, row.to, row.id);
            if (isDupSer) {
              alert(`[중복 경고] 형식번호 '${row.formatNo}'의 제조번호(${row.from}~${row.to || row.from})가 기존 등록 구간과 겹치거나 사이값입니다.\n제조번호를 수정한 후 다시 등록해주세요.`);
              return;
            }
          }
        }

        const registeredIds = new Set(validRows.map(r => r.id));
        const nowIso = new Date().toISOString();
        validRows.forEach(r => {
          r.savedAt = nowIso;
          r.checked = false;
          r.status = '등록완료';
        });

        state.certSavedRows.unshift(...validRows);

        // 등록된 행만 작성 그리드에서 제거
        state.certDraftRows = draftRows.filter(r => !registeredIds.has(r.id));
        if (state.certDraftRows.length === 0 && (state.certMode || 'auto') === 'manual') {
          state.certDraftRows = [createNewDraftRow()];
        }

        saveLocalCertData();
        await saveCertDataToDb(true);

        btnCertSave.classList.add('is-saved');
        const originalHtml = btnCertSave.innerHTML;
        btnCertSave.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span class="btn-cert-text">등록됨 ✓</span>
        `;

        showToast(`${validRows.length}건의 검정 내역이 성공적으로 등록되었습니다`);
        renderCertificationModule();

        setTimeout(() => {
          btnCertSave.classList.remove('is-saved');
          btnCertSave.innerHTML = originalHtml;
        }, 2500);
      });
    }

    // 3-B. 저장 내역 전체 선택 체크박스
    const checkAllCertSaved = document.getElementById('check-all-cert-saved');
    if (checkAllCertSaved) {
      checkAllCertSaved.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:not(:disabled)').forEach(cb => {
          cb.checked = isChecked;
        });
      });
    }

    // 3-C. [검정신청] 버튼
    const btnApplyInspection = document.getElementById('btn-cert-apply-inspection');
    if (btnApplyInspection) {
      btnApplyInspection.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('검정신청할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const checkedIds = checkedBoxes.map(cb => cb.dataset.id);
        let updatedCount = 0;
        state.certSavedRows.forEach(row => {
          if (checkedIds.includes(row.id) && row.status !== '일정완료') {
            row.status = '검정신청';
            updatedCount++;
          }
        });

        await saveCertDataToDb(true);
        renderCertSavedTable();
        showToast(`선택한 ${updatedCount}건의 일정이 [검정신청] 상태로 변경되었습니다.`);
        if (checkAllCertSaved) checkAllCertSaved.checked = false;
      });
    }

    // 3-D. [품검요청] 버튼 (구분이 '품질'인 것만 품질검사 메뉴로 이관, '생산'은 제외 및 알림)
    const btnRequestQuality = document.getElementById('btn-cert-request-quality');
    if (btnRequestQuality) {
      btnRequestQuality.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('품검요청할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const checkedIds = checkedBoxes.map(cb => cb.dataset.id);
        const selectedRows = state.certSavedRows.filter(r => checkedIds.includes(r.id));

        const qualityTargetRows = selectedRows.filter(r => (r.type || '').trim() === '품질');
        const productionCancelledRows = selectedRows.filter(r => (r.type || '').trim() !== '품질');

        qualityTargetRows.forEach(row => {
          row.status = '품검요청';
          const existingIdx = (state.qualityRows || []).findIndex(q => (q.certRowId === row.id || q.id === row.id));
          const qItem = {
            ...row,
            certRowId: row.id,
            status: '품검요청',
            requestedAt: Date.now()
          };
          if (existingIdx >= 0) {
            state.qualityRows[existingIdx] = qItem;
          } else {
            if (!state.qualityRows) state.qualityRows = [];
            state.qualityRows.push(qItem);
          }
        });

        await saveCertDataToDb(true);
        await saveQualityRowsToDb();

        // 사용자 요청 필수 메시지 형식:
        // "총 4건중. 품질검사요청 3건, 생산제품검사 1건 (요청취소)"
        const total = selectedRows.length;
        const qualCount = qualityTargetRows.length;
        const prodCount = productionCancelledRows.length;
        let msg = `총 ${total}건 중 품질검사요청 ${qualCount}건`;
        if (prodCount > 0) {
          msg += `, 생산제품검사 ${prodCount}건 (요청취소)`;
        }
        alert(msg);

        renderCertSavedTable();
        renderQualityTable();
        if (checkAllCertSaved) checkAllCertSaved.checked = false;
      });
    }

    // 3-E. 저장 내역 [선택 삭제] 버튼
    const btnDelSavedSelected = document.getElementById('btn-cert-del-saved-selected');
    if (btnDelSavedSelected) {
      btnDelSavedSelected.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('삭제할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const checkedIds = checkedBoxes.map(cb => cb.dataset.id);
        const targetRows = state.certSavedRows.filter(r => checkedIds.includes(r.id));
        const validRows = targetRows.filter(r => r.status !== '일정완료');
        const lockedRows = targetRows.filter(r => r.status === '일정완료');

        if (validRows.length === 0) {
          alert('선택한 항목이 모두 [일정완료] 상태이므로 삭제할 수 없습니다.');
          return;
        }

        let confirmMsg = `선택한 ${validRows.length}건을 삭제하시겠습니까?`;
        if (lockedRows.length > 0) {
          confirmMsg += `\n(※ 일정완료된 ${lockedRows.length}건은 삭제 대상에서 제외됩니다.)`;
        }
        if (!confirm(confirmMsg)) return;

        const validIds = validRows.map(r => r.id);
        state.certSavedRows = state.certSavedRows.filter(r => !validIds.includes(r.id));
        state.qualityRows = (state.qualityRows || []).filter(q => !validIds.includes(q.certRowId || q.id));

        await saveCertDataToDb(true);
        await saveQualityRowsToDb();
        renderCertSavedTable();
        renderQualityTable();
        showToast(`${validRows.length}건이 삭제되었습니다.`);
        if (checkAllCertSaved) checkAllCertSaved.checked = false;
      });
    }

    // 3-F. 검정현황 작업반 필터
    const certFilterLineSelect = document.getElementById('cert-filter-line');
    if (certFilterLineSelect) {
      certFilterLineSelect.value = state.certFilterLine || 'ALL';
      certFilterLineSelect.addEventListener('change', (e) => {
        state.certFilterLine = e.target.value;
        saveLocalCertData();
        renderCertSavedTable();
      });
    }

    // 3-G. [품질검사] 화면 이벤트 바인딩
    const checkAllQuality = document.getElementById('check-all-quality');
    if (checkAllQuality) {
      checkAllQuality.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('#quality-tbody .check-quality-row').forEach(cb => {
          cb.checked = isChecked;
        });
      });
    }

    const btnQualityPass = document.getElementById('btn-quality-pass');
    if (btnQualityPass) {
      btnQualityPass.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#quality-tbody .check-quality-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('검사합격 처리할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const certIds = checkedBoxes.map(cb => cb.dataset.certId || cb.dataset.id);
        const qualityIds = checkedBoxes.map(cb => cb.dataset.id);

        if (!confirm(`선택한 ${checkedBoxes.length}건에 대해 [검사합격] 승인하시겠습니까?\n검정현황의 일정이 '일정완료'로 변경되며 잠금 처리됩니다.`)) {
          return;
        }

        // 1) 검정현황 상태 -> '일정완료'
        state.certSavedRows.forEach(row => {
          if (certIds.includes(row.id)) {
            row.status = '일정완료';
            row.completedAt = Date.now();
          }
        });

        // 2) 품질검사 그리드에서 삭제 (완료)
        state.qualityRows = (state.qualityRows || []).filter(q => !qualityIds.includes(q.id) && !certIds.includes(q.certRowId));

        await saveCertDataToDb(true);
        await saveQualityRowsToDb();

        renderQualityTable();
        renderCertSavedTable();

        showToast(`선택한 ${checkedBoxes.length}건이 [검사합격] 처리되어 검정현황의 일정이 완료되었습니다`);
        if (checkAllQuality) checkAllQuality.checked = false;
      });
    }

    const qualFilterDateInput = document.getElementById('quality-filter-date');
    if (qualFilterDateInput) {
      qualFilterDateInput.value = state.qualityFilterDate || '';
      qualFilterDateInput.addEventListener('change', (e) => {
        state.qualityFilterDate = e.target.value;
        saveLocalQualityRows();
        renderQualityTable();
        updateQualityFilterPill();
      });
    }

    const btnQualityToday = document.getElementById('btn-quality-today');
    if (btnQualityToday) {
      btnQualityToday.addEventListener('click', () => {
        state.qualityFilterDate = getTodayDateString();
        if (qualFilterDateInput) qualFilterDateInput.value = state.qualityFilterDate;
        saveLocalQualityRows();
        renderQualityTable();
        updateQualityFilterPill();
      });
    }

    const btnQualityAll = document.getElementById('btn-quality-all');
    if (btnQualityAll) {
      btnQualityAll.addEventListener('click', () => {
        state.qualityFilterDate = '';
        if (qualFilterDateInput) qualFilterDateInput.value = '';
        saveLocalQualityRows();
        renderQualityTable();
        updateQualityFilterPill();
      });
    }

    function updateQualityFilterPill() {
      const pill = document.getElementById('quality-filter-status-pill');
      if (!pill) return;
      if (state.qualityFilterDate) {
        pill.innerHTML = `<span>필터: ${state.qualityFilterDate}</span>`;
        pill.classList.add('active');
      } else {
        pill.innerHTML = `<span>전체 품검 대상 조회</span>`;
        pill.classList.remove('active');
      }
    }

    // 4. 작성 초기화
    const btnClearDraft = document.getElementById('btn-cert-clear-draft');
    if (btnClearDraft) {
      btnClearDraft.addEventListener('click', () => {
        if (confirm('현재 작성 중인 검정 등록 내용을 모두 초기화하시겠습니까?')) {
          state.certDraftRows = [createNewDraftRow()];
          saveLocalCertData();
          renderCertDraftTable();
          showToast('작성 목록이 초기화되었습니다');
        }
      });
    }

    // 5. 검정 내역 CSV 다운로드
    const btnExportCsv = document.getElementById('btn-cert-export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => exportCertSavedToCsv());
    }

    // 6. 작성 그리드 셀 입력 (input 이벤트)
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target) return;

      // (A) 작성 그리드 일반 필드
      if (target.classList.contains('cert-input-field')) {
        const id = target.dataset.id;
        const field = target.dataset.field;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row && field) {
          if (field === 'qty' || field === 'from') {
            const raw = target.value.replace(/[^0-9]/g, '');
            row[field] = raw ? parseInt(raw, 10) : '';
            updateDraftRowCalculations(row);
            // 해당 행의 TO 필드 업데이트
            const tr = target.closest('tr');
            if (tr) {
              const toInput = tr.querySelector('.col-cert-to input');
              if (toInput) toInput.value = row.to || '';
              const passInput = tr.querySelector('.col-cert-passno input');
              if (passInput && row.passNo && !passInput.value) passInput.value = row.passNo;
            }
          } else {
            row[field] = target.value;
          }
          saveLocalCertData();
        }
      }

      // (B) 로트번호 실시간 입력 및 중복 체크
      if (target.classList.contains('cert-input-lot')) {
        const id = target.dataset.id;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row) {
          row.lotNo = target.value;
          const isDup = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id);
          target.classList.toggle('is-duplicate-lot', isDup);
          if (isDup) {
            target.title = '⚠ 동일 형식번호 내 이미 존재하는 로트번호입니다!';
          } else {
            target.title = '';
          }
          saveLocalCertData();
        }
      }

      // (C) 품명 인라인 검색 자동완성
      if (target.classList.contains('cert-input-name')) {
        const id = target.dataset.id;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row) {
          row.name = target.value;
          showCertInlineAutocomplete(target, id, target.value);
          saveLocalCertData();
        }
      }
    });

    // 7. 로트번호 포커스 아웃 시 "26-001" 자동 포맷팅
    document.addEventListener('blur', (e) => {
      const target = e.target;
      if (target && target.classList.contains('cert-input-lot')) {
        const id = target.dataset.id;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row && row.lotNo) {
          const formatted = formatSmartLotNumber(row.lotNo, row.writeDate);
          row.lotNo = formatted;
          target.value = formatted;

          const isDup = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id);
          target.classList.toggle('is-duplicate-lot', isDup);
          saveLocalCertData();
        }
      }
    }, true);

    // 8. 요청부서 선택 change
    document.addEventListener('change', (e) => {
      const target = e.target;
      if (target && target.classList.contains('cert-select-dept')) {
        const id = target.dataset.id;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row) {
          row.dept = target.value;
          saveLocalCertData();
        }
      }

      if (target && target.classList.contains('cert-draft-row-check')) {
        const id = target.dataset.id;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row) {
          row.checked = target.checked;
        }
      }
    });

    // 9. 클릭 이벤트 (팝업 오픈, 행 삭제 등)
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;

      // ❌ 필터 해제 'X' 버튼 클릭
      if (target.id === 'btn-clear-cert-filter' || target.classList.contains('btn-clear-cert-filter')) {
        e.stopPropagation();
        state.certFilterDate = '';
        const dateInput = document.getElementById('cert-filter-date');
        if (dateInput) dateInput.value = '';
        saveLocalCertData();
        renderCertificationModule();
        showToast('필터가 해제되어 전체 내역이 표시됩니다');
        return;
      }

      // 🔍 팝업 버튼 클릭
      if (target.classList.contains('btn-open-cert-modal') || target.closest('.btn-open-cert-modal')) {
        const btn = target.classList.contains('btn-open-cert-modal') ? target : target.closest('.btn-open-cert-modal');
        const id = btn.dataset.id;
        openCertItemModal(id);
      }

      // 모달 내부 선택 버튼
      if (target.classList.contains('btn-select-modal-item')) {
        const itemId = target.dataset.id;
        const it = (state.certMasterItems || []).find(x => x.id === itemId);
        if (it) applyItemToActiveDraftRow(it);
      }

      // 모달 닫기
      if (target.id === 'btn-close-cert-modal' || target.id === 'btn-cancel-cert-modal') {
        closeCertItemModal();
      }

      // 모달 작업반 탭 필터
      if (target.closest('#cert-modal-group-filters button')) {
        const btn = target.closest('#cert-modal-group-filters button');
        const filters = document.querySelectorAll('#cert-modal-group-filters button');
        filters.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const q = (document.getElementById('cert-modal-search-input') || {}).value || '';
        renderCertModalList(btn.dataset.group, q);
      }

      // 저장 그리드 개별 행 삭제
      if (target.classList.contains('btn-del-cert-saved')) {
        const id = target.dataset.id;
        const targetRow = (state.certSavedRows || []).find(r => r.id === id);
        if (targetRow && targetRow.status === '일정완료') {
          alert('일정완료된 일정은 수정 및 삭제할 수 없습니다.');
          return;
        }
        if (confirm('이 검정 등록 내역을 삭제하시겠습니까?')) {
          state.certSavedRows = (state.certSavedRows || []).filter(r => r.id !== id);
          state.qualityRows = (state.qualityRows || []).filter(q => q.certRowId !== id && q.id !== id);
          saveLocalCertData();
          saveCertDataToDb(true);
          saveQualityRowsToDb();
          renderCertSavedTable();
          renderQualityTable();
          showToast('등록 내역이 삭제되었습니다');
        }
      }

      // 설정 탭: 품목 마스터 작업반 탭 필터
      if (target.classList.contains('btn-cert-tab')) {
        const tabs = document.querySelectorAll('#cert-master-tab-filter .btn-cert-tab');
        tabs.forEach(t => t.classList.remove('active'));
        target.classList.add('active');
        state.certMasterFilterGroup = target.dataset.group;
        renderCertMasterTable();
      }

      // 설정 탭: 품목정보 인라인 행 수정 (바로 그 행에서 수정)
      if (target.classList.contains('btn-edit-cert-item')) {
        const id = target.dataset.id;
        const item = (state.certMasterItems || []).find(i => i.id === id);
        const tr = target.closest('tr');
        if (!item || !tr) return;

        tr.draggable = false;
        const esc = (v) => String(v ?? '').replace(/"/g, '&quot;');
        tr.innerHTML = `
          <td style="text-align:center;">
            <div class="action-btn-group">
              <button type="button" class="btn btn-xs btn-primary btn-save-inline-cert" data-id="${item.id}">저장</button>
              <button type="button" class="btn btn-xs btn-outline btn-cancel-inline-cert">취소</button>
            </div>
          </td>
          <td style="text-align:center; color:#2563eb; font-weight:700;">수정</td>
          <td><select class="cert-inline-edit-input" data-f="useYn"><option value="사용" ${item.useYn === '사용' ? 'selected' : ''}>사용</option><option value="미사용" ${item.useYn === '미사용' ? 'selected' : ''}>미사용</option></select></td>
          <td><select class="cert-inline-edit-input" data-f="inspectType"><option value="품질" ${item.inspectType === '품질' ? 'selected' : ''}>품질</option><option value="생산" ${item.inspectType === '생산' ? 'selected' : ''}>생산</option><option value="-" ${item.inspectType === '-' ? 'selected' : ''}>-</option></select></td>
          <td><select class="cert-inline-edit-input" data-f="group"><option value="감지기반" ${item.group === '감지기반' ? 'selected' : ''}>감지기반</option><option value="유도등반" ${item.group === '유도등반' ? 'selected' : ''}>유도등반</option><option value="수신기반" ${item.group === '수신기반' ? 'selected' : ''}>수신기반</option><option value="기타" ${item.group === '기타' ? 'selected' : ''}>기타</option><option value="-" ${item.group === '-' ? 'selected' : ''}>-</option></select></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="itemGroup" value="${esc(item.itemGroup)}"></td>
          <td><input type="text" class="cert-inline-edit-input font-bold" data-f="code" value="${esc(item.code)}"></td>
          <td><input type="text" class="cert-inline-edit-input font-bold" data-f="altName" value="${esc(item.altName)}"></td>
          <td><input type="text" class="cert-inline-edit-input font-bold" data-f="name" value="${esc(item.name)}"></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="spec" value="${esc(item.spec)}"></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="formatNo" value="${esc(item.formatNo)}"></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="modelName" value="${esc(item.modelName)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="unitPrice" value="${esc(item.unitPrice)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="baseStock" value="${esc(item.baseStock)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="minStock" value="${esc(item.minStock)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="maxStock" value="${esc(item.maxStock)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="stAssembly" value="${esc(item.stAssembly)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="stInspect" value="${esc(item.stInspect)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="stPack" value="${esc(item.stPack)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="sensor" value="${esc(item.sensor)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="ctrl" value="${esc(item.ctrl)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="gas" value="${esc(item.gas)}"></td>
        `;
        tr.querySelector('[data-f="name"]')?.focus();
        return;
      }

      if (target.classList.contains('btn-save-inline-cert')) {
        const id = target.dataset.id;
        const item = (state.certMasterItems || []).find(i => i.id === id);
        const tr = target.closest('tr');
        if (!item || !tr) return;
        tr.querySelectorAll('[data-f]').forEach(el => {
          item[el.dataset.f] = el.value.trim();
        });
        saveLocalCertData();
        saveCertDataToDb(true);
        renderCertMasterTable();
        showToast(`'${item.name}' 품목정보가 수정되었습니다.`);
        return;
      }

      if (target.classList.contains('btn-cancel-inline-cert')) {
        renderCertMasterTable();
        return;
      }

      // 설정 탭: 품목 마스터 삭제
      if (target.classList.contains('btn-del-cert-item')) {
        const id = target.dataset.id;
        const item = (state.certMasterItems || []).find(i => i.id === id);
        if (item && confirm(`'${item.name} (${item.code})' 품목을 마스터에서 삭제하시겠습니까?`)) {
          state.certMasterItems = state.certMasterItems.filter(i => i.id !== id);
          saveLocalCertData();
          saveCertDataToDb(true);
          renderCertMasterTable();
          showToast('품목 마스터에서 삭제되었습니다');
        }
      }

      // 설정 탭: 요청부서 삭제
      if (target.classList.contains('btn-del-dept')) {
        const idx = parseInt(target.dataset.index, 10);
        if (confirm(`'${state.departments[idx]}' 부서를 삭제하시겠습니까?`)) {
          state.departments.splice(idx, 1);
          saveLocalCertData();
          saveCertDataToDb(true);
          renderDepartmentSettings();
          renderCertDraftTable();
          showToast('부서가 삭제되었습니다');
        }
      }
    });

    // 10. 모달 실시간 검색 입력
    const modalSearchInput = document.getElementById('cert-modal-search-input');
    if (modalSearchInput) {
      modalSearchInput.addEventListener('input', (e) => {
        const activeTab = document.querySelector('#cert-modal-group-filters button.active');
        const grp = activeTab ? activeTab.dataset.group : 'ALL';
        renderCertModalList(grp, e.target.value);
      });
    }

    // 11. 엑셀 파서 & 양식 다운로드 연동
    const inputCertExcel = document.getElementById('input-cert-excel-upload');
    if (inputCertExcel) {
      inputCertExcel.addEventListener('change', (e) => handleCertExcelUpload(e));
    }

    const inputKfiExcel = document.getElementById('input-kfi-excel-upload');
    if (inputKfiExcel) {
      inputKfiExcel.addEventListener('change', (e) => handleKfiExcelUpload(e));
    }

    const kfiDropzone = document.getElementById('kfi-upload-dropzone');
    if (kfiDropzone && inputKfiExcel) {
      kfiDropzone.addEventListener('click', (e) => {
        if (e.target.closest('label[for="input-kfi-excel-upload"]') || e.target === inputKfiExcel) return;
        inputKfiExcel.click();
      });
      kfiDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        kfiDropzone.style.borderColor = '#9333ea';
        kfiDropzone.style.background = '#faf5ff';
      });
      kfiDropzone.addEventListener('dragleave', () => {
        kfiDropzone.style.borderColor = '#cbd5e1';
        kfiDropzone.style.background = '#f8fafc';
      });
      kfiDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        kfiDropzone.style.borderColor = '#cbd5e1';
        kfiDropzone.style.background = '#f8fafc';
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleKfiExcelUpload({ target: { files: [file], value: '' } });
      });
    }

    const btnTemplate = document.getElementById('btn-cert-download-template');
    if (btnTemplate) {
      btnTemplate.addEventListener('click', () => downloadCertTemplateExcel());
    }

    // 12. 품목정보 수동 등록/수정 폼 submit (중복 품목 등록 방지)
    const formAddCert = document.getElementById('form-add-cert-item');
    if (formAddCert) {
      formAddCert.addEventListener('submit', (e) => {
        e.preventDefault();
        const getVal = (id) => {
          const el = document.getElementById(id);
          return el ? String(el.value).trim() : '';
        };
        const code = getVal('cert-add-code');
        const name = getVal('cert-add-name');
        if (!code || !name) return;

        const editId = formAddCert.dataset.editId || '';
        const normalizedCode = code.toLowerCase();

        // 동일 품목(품목코드) 중복 검사
        const isDuplicate = (state.certMasterItems || []).some(item => {
          if (editId && item.id === editId) return false;
          return String(item.code || '').trim().toLowerCase() === normalizedCode;
        });

        if (isDuplicate) {
          alert(`이미 동일한 품목코드('${code}')가 등록되어 있습니다.\n중복된 품목은 등록할 수 없습니다.`);
          return;
        }

        const itemData = {
          id: editId || ('citem_' + Date.now()),
          useYn: getVal('cert-add-use') || '사용',
          inspectType: getVal('cert-add-type') || '품질',
          group: getVal('cert-add-group') || '감지기반',
          itemGroup: getVal('cert-add-item-group'),
          code: code,
          altName: getVal('cert-add-alt-name'),
          name: name,
          spec: getVal('cert-add-spec'),
          formatNo: getVal('cert-add-format'),
          modelName: getVal('cert-add-model'),
          unitPrice: getVal('cert-add-price'),
          baseStock: getVal('cert-add-base-stock'),
          minStock: getVal('cert-add-min-stock'),
          maxStock: getVal('cert-add-max-stock'),
          stAssembly: getVal('cert-add-st-assembly'),
          stInspect: getVal('cert-add-st-inspect'),
          stPack: getVal('cert-add-st-pack'),
          sensor: getVal('cert-add-sensor'),
          ctrl: getVal('cert-add-ctrl'),
          gas: getVal('cert-add-gas')
        };

        if (editId) {
          const idx = state.certMasterItems.findIndex(i => i.id === editId);
          if (idx >= 0) {
            state.certMasterItems[idx] = itemData;
          } else {
            state.certMasterItems.unshift(itemData);
          }
          delete formAddCert.dataset.editId;
          const submitBtn = formAddCert.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.textContent = '+ 추가';
          showToast(`'${name}' 품목 정보가 수정되었습니다`);
        } else {
          state.certMasterItems.unshift(itemData);
          showToast(`'${name}' 품목이 추가되었습니다`);
        }

        saveLocalCertData();
        saveCertDataToDb(true);
        renderCertMasterTable();
        formAddCert.reset();
      });
    }

    // 13. 요청부서 추가 폼 submit
    const formAddDept = document.getElementById('form-add-department');
    if (formAddDept) {
      formAddDept.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-department');
        const deptName = input ? input.value.trim() : '';
        if (!deptName) return;

        if (!state.departments.includes(deptName)) {
          state.departments.push(deptName);
          saveLocalCertData();
          saveCertDataToDb(true);
          renderDepartmentSettings();
          renderCertDraftTable();
          showToast(`'${deptName}' 부서가 추가되었습니다`);
        }
        input.value = '';
      });
    }

    // 14. 스마트 키보드 탐색 (Tab, Enter, F2, 복사/붙여넣기)
    document.addEventListener('keydown', (e) => {
      const target = e.target;

      // F2 키를 누르면 품목 팝업 오픈
      if (e.key === 'F2') {
        if (target && target.classList.contains('cert-input-name')) {
          e.preventDefault();
          openCertItemModal(target.dataset.id);
          return;
        }
      }

      // ESC 키로 모달 닫기
      if (e.key === 'Escape') {
        const modal = document.getElementById('modal-cert-item-search');
        if (modal && modal.style.display !== 'none') {
          closeCertItemModal();
          return;
        }
      }

      // 검정 등록 그리드 내부 스프레드시트 이동 (Tab, Enter)
      if (target && target.closest('#cert-draft-table') && target.tagName === 'INPUT') {
        const tr = target.closest('tr');
        if (!tr) return;

        // Enter 키: 아래 행 동일 컬럼 이동
        if (e.key === 'Enter') {
          e.preventDefault();
          const currentCell = target.closest('td');
          const cellIndex = Array.from(tr.children).indexOf(currentCell);
          let nextRow = tr.nextElementSibling;

          // 마지막 행에서 엔터 입력 시 자동으로 새 행 생성
          if (!nextRow) {
            state.certDraftRows.push(createNewDraftRow());
            saveLocalCertData();
            renderCertDraftTable();
            const allTrs = document.querySelectorAll('#cert-draft-tbody tr');
            nextRow = allTrs[allTrs.length - 1];
          }

          if (nextRow) {
            const nextCell = nextRow.children[cellIndex];
            const nextInput = nextCell ? nextCell.querySelector('input:not([readonly]):not([disabled]), select') : null;
            if (nextInput) nextInput.focus();
          }
        }
      }
    });

    // 15. 엑셀 호환 붙여넣기 (Ctrl+V) 지원
    document.addEventListener('paste', (e) => {
      const target = e.target;
      if (!target || !target.closest('#cert-draft-table')) return;

      const clipboardData = (e.clipboardData || window.clipboardData);
      if (!clipboardData) return;
      const text = clipboardData.getData('text');
      if (!text || !text.includes('\t') && !text.includes('\n')) return; // 다중 셀 붙여넣기만 처리

      e.preventDefault();
      handleCertClipboardPaste(target, text);
    });
  }

  // (14) 클립보드 다중 셀 붙여넣기 처리
  function handleCertClipboardPaste(startInput, text) {
    const tr = startInput.closest('tr');
    if (!tr) return;
    const startRowIdx = parseInt(tr.dataset.rowIndex, 10);
    const startTd = startInput.closest('td');
    const startColIdx = Array.from(tr.children).indexOf(startTd);

    const rowsData = text.trim().split(/\r?\n/).map(line => line.split('\t'));
    if (rowsData.length === 0) return;

    // 필요 행 수만큼 draftRows 확장
    while (state.certDraftRows.length < startRowIdx + rowsData.length) {
      state.certDraftRows.push(createNewDraftRow());
    }

    // 붙여넣기 대상 필드 순서 매핑
    const editableFields = ['code', 'name', 'spec', 'formatNo', 'type', 'writeDate', 'inspectDate', 'weekDate', 'qty', 'lotNo', 'from', 'to', 'passNo', 'site', 'color', 'dept'];

    rowsData.forEach((rowVals, rOffset) => {
      const curRow = state.certDraftRows[startRowIdx + rOffset];
      if (!curRow) return;

      rowVals.forEach((val, cOffset) => {
        const cleanVal = String(val).trim();
        // 붙여넣기 값 할당
        if (cOffset < editableFields.length) {
          const field = editableFields[cOffset];
          if (field === 'qty' || field === 'from') {
            curRow[field] = parseSafeInt(cleanVal.replace(/[^0-9]/g, ''));
          } else {
            curRow[field] = cleanVal;
          }
        }
      });
      updateDraftRowCalculations(curRow);
    });

    saveLocalCertData();
    renderCertDraftTable();
    showToast(`${rowsData.length}개 행이 붙여넣기 되었습니다`);
  }

  // (15) 인라인 검색 자동완성 팝업
  let activeAutocompleteDropdown = null;

  function showCertInlineAutocomplete(inputEl, rowId, query) {
    removeCertAutocomplete();
    const cleanQ = (query || '').toLowerCase().trim();
    if (!cleanQ || cleanQ.length < 1) return;

    const matched = (state.certMasterItems || []).filter(it => {
      const codeMatch = (it.code || '').toLowerCase().includes(cleanQ);
      const altNameMatch = (it.altName || '').toLowerCase().includes(cleanQ);
      const nameMatch = (it.name || '').toLowerCase().includes(cleanQ);
      const specMatch = (it.spec || '').toLowerCase().includes(cleanQ);
      const fmtMatch = (it.formatNo || '').toLowerCase().includes(cleanQ);
      return codeMatch || altNameMatch || nameMatch || specMatch || fmtMatch;
    }).slice(0, 8); // 상위 8개 표시

    if (matched.length === 0) return;

    const parentWrap = inputEl.closest('.cert-name-cell-wrap');
    if (!parentWrap) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'cert-autocomplete-dropdown';

    matched.forEach(item => {
      const dispName = getDisplayItemName(item);
      const itemEl = document.createElement('div');
      itemEl.className = 'cert-autocomplete-item';
      itemEl.innerHTML = `
        <div>
          <span class="cert-autocomplete-code">[${item.code}]</span>
          <strong>${dispName}</strong>
        </div>
        <span class="cert-autocomplete-spec">${item.formatNo || ''} | ${item.spec || ''}</span>
      `;

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const targetRow = (state.certDraftRows || []).find(r => r.id === rowId);
        if (targetRow) {
          targetRow.code = item.code || '';
          targetRow.name = dispName;
          targetRow.spec = item.spec || '';
          targetRow.formatNo = item.formatNo || '';
          targetRow.type = item.inspectType || '품질';
          targetRow.sensor = item.sensor || '';
          targetRow.ctrl = item.ctrl || '';
          targetRow.gas = item.gas || '';
          updateDraftRowCalculations(targetRow);
          saveLocalCertData();
          renderCertDraftTable();
        }
        removeCertAutocomplete();
      });

      dropdown.appendChild(itemEl);
    });

    parentWrap.appendChild(dropdown);
    activeAutocompleteDropdown = dropdown;
  }

  function removeCertAutocomplete() {
    if (activeAutocompleteDropdown) {
      activeAutocompleteDropdown.remove();
      activeAutocompleteDropdown = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cert-name-cell-wrap')) {
      removeCertAutocomplete();
    }
  });

  // (16) 품목 마스터 드래그 앤 드롭 순서 변경
  function bindCertMasterDragAndDrop(tbody) {
    let draggedRow = null;
    const rows = tbody.querySelectorAll('.cert-master-row');

    rows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        draggedRow = row;
        row.style.opacity = '0.5';
        e.dataTransfer.setData('text/plain', row.dataset.dragIndex);
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedRow || draggedRow === row) return;

        const fromIdx = parseInt(draggedRow.dataset.dragIndex, 10);
        const toIdx = parseInt(row.dataset.dragIndex, 10);

        if (fromIdx !== toIdx) {
          const moved = state.certMasterItems.splice(fromIdx, 1)[0];
          state.certMasterItems.splice(toIdx, 0, moved);
          saveLocalCertData();
          saveCertDataToDb(true);
          renderCertMasterTable();
        }
      });

      row.addEventListener('dragend', () => {
        if (draggedRow) draggedRow.style.opacity = '1';
        draggedRow = null;
      });
    });
  }

  // (17) 엑셀 일괄 업로드 파서 (품목정보)
  async function handleCertExcelUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      showToast('엑셀 파일을 분석 중입니다...');
      const text = await readFileAsTextOrArray(file);
      const rows = parseCsvOrSpreadsheet(text, file.name);

      if (rows.length < 2) {
        alert('유효한 품목 데이터가 없습니다.');
        e.target.value = '';
        return;
      }

      // 헤더 식별 및 인덱스 매핑 (20개 항목)
      const header = rows[0].map(h => String(h).trim());
      const idxUse = header.findIndex(h => h.includes('사용'));
      const idxType = header.findIndex(h => h.includes('제품검사') || h.includes('유형') || h.includes('구분'));
      const idxGroup = header.findIndex(h => h.includes('작업반'));
      const idxItemGroup = header.findIndex(h => h.includes('품목그룹') || h === '그룹');
      const idxCode = header.findIndex(h => h.includes('품목코드') || h === '코드');
      const idxAltName = header.findIndex(h => h.includes('대체품명'));
      const idxName = header.findIndex(h => h === '품명' || h === '품목' || h === '품목명');
      const idxSpec = header.findIndex(h => h.includes('규격'));
      const idxFormat = header.findIndex(h => h.includes('형식번호'));
      const idxModel = header.findIndex(h => h.includes('모델명') || h.includes('모델'));
      const idxPrice = header.findIndex(h => h.includes('단가'));
      const idxBaseStock = header.findIndex(h => h.includes('기초재고'));
      const idxMinStock = header.findIndex(h => h.includes('최소'));
      const idxMaxStock = header.findIndex(h => h.includes('최대'));
      const idxStAssembly = header.findIndex(h => h.includes('조립'));
      const idxStInspect = header.findIndex(h => h.includes('ST 검사') || (h.includes('ST') && h.includes('검사')));
      const idxStPack = header.findIndex(h => h.includes('포장'));
      const idxSensor = header.findIndex(h => h === '감지' || (h.includes('감지') && !h.includes('감지기')));
      const idxCtrl = header.findIndex(h => h.includes('제어'));
      const idxGas = header.findIndex(h => h.includes('가스'));

      const cell = (r, idx, fallback = '') => (idx >= 0 && r[idx] !== undefined && r[idx] !== null) ? String(r[idx]).trim() : fallback;

      const newItems = [];
      const seenCodes = new Set();
      const duplicateCodes = [];

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const nameVal = cell(r, idxName);
        const altNameVal = cell(r, idxAltName);
        const codeVal = cell(r, idxCode);
        if (!nameVal && !altNameVal && !codeVal) continue;

        if (codeVal) {
          const codeKey = codeVal.toLowerCase();
          if (seenCodes.has(codeKey)) {
            if (!duplicateCodes.includes(codeVal)) duplicateCodes.push(codeVal);
            continue;
          }
          seenCodes.add(codeKey);
        }

        newItems.push({
          id: 'citem_' + Date.now() + '_' + i,
          useYn: cell(r, idxUse, '사용') || '사용',
          inspectType: cell(r, idxType, '품질') || '품질',
          group: cell(r, idxGroup, '감지기반') || '감지기반',
          itemGroup: cell(r, idxItemGroup),
          code: codeVal,
          altName: altNameVal,
          name: nameVal,
          spec: cell(r, idxSpec),
          formatNo: cell(r, idxFormat),
          modelName: cell(r, idxModel),
          unitPrice: cell(r, idxPrice),
          baseStock: cell(r, idxBaseStock),
          minStock: cell(r, idxMinStock),
          maxStock: cell(r, idxMaxStock),
          stAssembly: cell(r, idxStAssembly),
          stInspect: cell(r, idxStInspect),
          stPack: cell(r, idxStPack),
          sensor: cell(r, idxSensor),
          ctrl: cell(r, idxCtrl),
          gas: cell(r, idxGas)
        });
      }

      if (duplicateCodes.length > 0) {
        alert(`중복된 품목코드가 있어 등록할 수 없습니다:\n${duplicateCodes.join(', ')}\n\n중복을 제거한 뒤 다시 업로드해 주세요.`);
        e.target.value = '';
        return;
      }

      if (newItems.length > 0) {
        state.certMasterItems = newItems;
        saveLocalCertData();
        await saveCertDataToDb(true);
        renderCertMasterTable();
        showToast(`총 ${newItems.length}개 품목이 품목정보에 성공적으로 등록되었습니다`);
      }
    } catch (err) {
      console.error('품목 엑셀 업로드 오류:', err);
      alert('엑셀 파일 파싱에 실패했습니다. 올바른 양식인지 확인해주세요.');
    }
    e.target.value = '';
  }

  // (18) KFI 정보 엑셀/CSV 업로드 파서 (P열 합격표시번호 매핑)
  async function handleKfiExcelUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      showToast('KFI 결과 데이터를 분석 중입니다...');
      let rows = [];
      if (window.XLSXEngine && typeof window.XLSXEngine.parseSpreadsheetFile === 'function') {
        const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
        rows = parsed && Array.isArray(parsed.data) ? parsed.data : [];
      } else {
        const text = await readFileAsTextOrArray(file);
        rows = parseCsvOrSpreadsheet(text, file.name);
      }

      if (rows.length < 2) {
        alert('유효한 KFI 데이터가 없습니다.');
        if (e.target) e.target.value = '';
        return;
      }

      // 헤더 행 자동 탐색 (상단 메타데이터/빈 행 건너뛰기)
      let headerRowIdx = -1;
      let idxFormat = -1;
      let idxPass = -1;
      let idxMfg = -1;

      for (let rIdx = 0; rIdx < Math.min(rows.length, 30); rIdx++) {
        const cand = (rows[rIdx] || []).map(h => String(h ?? '').trim());
        const pIdx = cand.findIndex(h => h.includes('합격표시번호'));
        const fIdx = cand.findIndex(h => h.includes('인증번호') || h.includes('형식번호'));
        const mIdx = cand.findIndex(h => h.includes('제조번호'));
        if (pIdx >= 0 && (fIdx >= 0 || mIdx >= 0)) {
          headerRowIdx = rIdx;
          idxPass = pIdx;
          idxFormat = fIdx;
          idxMfg = mIdx;
          break;
        }
      }

      // 헤더를 찾지 못한 경우 기본 열(P열 = 15, 인증번호 = 8, 제조번호 = 17) 보정
      if (headerRowIdx < 0) headerRowIdx = 0;
      if (idxPass < 0 && (rows[headerRowIdx] || []).length >= 16) idxPass = 15;
      if (idxFormat < 0) idxFormat = 8;
      if (idxMfg < 0) idxMfg = 17;

      let matchCount = 0;
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length <= idxPass) continue;

        const passNo = String(r[idxPass] ?? '')
          .split(/\r?\n+/)
          .map(s => s.trim())
          .filter(Boolean)
          .join(' / ');
        const formatNo = String(r[idxFormat] ?? '').trim();
        let mfgRange = String(r[idxMfg] ?? '').replace(/\s+/g, ' ').trim();
        const rangeMatch = mfgRange.match(/^(\d+)\s*[-~]\s*(\d+)$/);
        if (rangeMatch) {
          mfgRange = `${rangeMatch[1]} - ${rangeMatch[2]}`;
        }

        if (passNo && formatNo && mfgRange) {
          // 키: "형식번호_제조번호 FROM - 제조번호 TO" (예: "감20-5_1 - 3000")
          const kfiKey = `${formatNo}_${mfgRange}`;
          state.kfiDataMap[kfiKey] = passNo;
          matchCount++;
        }
      }

      saveLocalCertData();
      await saveCertDataToDb(true);
      updateKfiUploadSummary();
      renderCertDraftTable();
      showToast(`총 ${matchCount}건의 KFI 합격표시번호가 성공적으로 연동되었습니다`);
    } catch (err) {
      console.error('KFI 엑셀 업로드 오류:', err);
      alert('KFI 엑셀 파일 파싱에 실패했습니다. (.xlsx, .xls, .csv 지원)');
    }
    if (e.target) e.target.value = '';
  }

  // (19) 엑셀 / CSV 파싱 유틸리티
  async function readFileAsTextOrArray(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, 'utf-8');
    });
  }

  function parseCsvOrSpreadsheet(content, fileName) {
    if (!content) return [];
    // CSV 파서 (따옴표 지원)
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    const result = [];

    lines.forEach(line => {
      const row = [];
      let inQuotes = false;
      let curVal = '';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(curVal.trim());
          curVal = '';
        } else {
          curVal += char;
        }
      }
      row.push(curVal.trim());
      result.push(row);
    });

    return result;
  }

  // (20) 검정현황 저장 그리드 CSV 내보내기
  function exportCertSavedToCsv() {
    const allSaved = state.certSavedRows || [];
    const filterType = state.certFilterType || 'writeDate';
    const filterDate = state.certFilterDate || '';

    const targetRows = allSaved.filter(row => {
      if (!filterDate) return true;
      return row[filterType] === filterDate;
    });

    if (targetRows.length === 0) {
      alert('내보낼 검정 내역이 없습니다.');
      return;
    }

    let csv = '\uFEFFNO,품목코드,품명,규격,형식번호,구분,작성일자,수검일자,생산주차,신청수량,로트번호,제조번호 FROM,제조번호 TO,합격표시번호,현장명(비고),외함색상,요청부서,감지,제어,가스\n';

    targetRows.forEach((r, idx) => {
      const dispName = getDisplayNameByCode(r.code, r.name || '');
      csv += `${idx + 1},"${r.code || ''}","${dispName}","${r.spec || ''}","${r.formatNo || ''}","${r.type || ''}",${r.writeDate || ''},${r.inspectDate || ''},${r.weekDate || ''},${r.qty || 0},"${r.lotNo || ''}",${r.from || ''},${r.to || ''},"${r.passNo || ''}","${r.site || ''}","${r.color || ''}","${r.dept || ''}","${r.sensor || ''}","${r.ctrl || ''}","${r.gas || ''}"\n`;
    });

    const dateTag = filterDate ? `_${filterDate}` : `_전체`;
    downloadFile(csv, `검정현황내역${dateTag}.csv`, 'text/csv;charset=utf-8;');
  }

  // (21) 품목정보 표준 엑셀/CSV 양식 다운로드
  function downloadCertTemplateExcel() {
    const template = '\uFEFF사용여부,제품검사 유형,작업반,품목그룹,품목코드,대체품명,품명,규격,형식번호,모델명,단가,기초재고,적정재고 (최소),적정재고 (최대),ST 조립 (s),ST 검사 (s),ST 포장 (s),감지,제어,가스\n' +
      '사용,품질,감지기반,감지기,PDCRW-0001,일반 차동식-방수,일반차동식-방수형,"(감20-5), DCRW, 차동식 방수형",감20-5,DCRW,5000,913,2000,6000,10,20,30,,,\n' +
      '사용,품질,유도등반,유도등,PLELW-1101,피난구 벽부 대형 단면,"피난구, 벽부, 대형, 단면","(유12-45-1) 피난구, 벽부, 대형, 단면, L1ELW-19",유12-45-1,L1ELW-19,34000,466,200,300,50,50,50,,,\n';

    downloadFile(template, '품목정보_표준양식.csv', 'text/csv;charset=utf-8;');
  }


  // =========================================================================
  // 14-B. 생산계획 (tab-plan) — 엑셀형 그리드, 월/주차/전체, 5색 팔레트, 메모지, ALT+드래그
  // =========================================================================
  function generateYearWeeks(yearStr) {
    const y = Number(yearStr) || 2026;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const weeks = [];
    // 해당 연도 1월 1일이 포함된 주의 화요일/금요일 기준 생성 (2026년 W1 = 12/30(화), 1/2(금))
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay(); // 0=일 .. 5=금
    // 첫 번째 금요일 찾기 (1월 1일 포함 주)
    const offsetToFri = (5 - dow + 7) % 7;
    const firstFri = new Date(y, 0, 1 + offsetToFri);

    for (let w = 0; w < 53; w++) {
      const fri = new Date(firstFri);
      fri.setDate(firstFri.getDate() + w * 7);
      if (fri.getFullYear() > y && w >= 51) break;

      const tue = new Date(fri);
      tue.setDate(fri.getDate() - 3);

      const tStr = `${tue.getMonth() + 1}/${tue.getDate()} (${dayNames[tue.getDay()]})`;
      const fStr = `${fri.getMonth() + 1}/${fri.getDate()} (${dayNames[fri.getDay()]})`;
      const m = fri.getMonth() + 1;
      weeks.push({
        id: `W${w + 1}`,
        weekNum: w + 1,
        month: m,
        label: `[W${w + 1}] ${tStr}, ${fStr}`
      });
    }
    return weeks;
  }

  function getDefaultPlanData() {
    return {
      year: '2026',
      startDate: '2026-01-01',
      startMonth: 1,
      endMonth: 3,
      selectedMonths: [1, 2, 3],
      viewMode: 'week', // 'month' | 'week' | 'all'
      summaryPos: 'bottom', // 'bottom' | 'top'
      hideSpecCols: false,
      hideCompareCols: false,
      shortageOnly: false,
      autoGreenOnMove: true,
      colorFilter: 'ALL',
      mergedItemGroups: [],
      itemGroupOrder: [],
      weeks: generateYearWeeks('2026'),
      rowsByCode: {}
    };
  }

  function normalizePlanData(raw) {
    const def = getDefaultPlanData();
    if (!raw || typeof raw !== 'object') return def;
    const yr = raw.year || (raw.startDate ? raw.startDate.slice(0, 4) : def.year);
    const baseWeeks = Array.isArray(raw.weeks) && raw.weeks.length >= 12
      ? raw.weeks.map((w, idx) => ({
          id: w.id || `W${idx + 1}`,
          weekNum: w.weekNum || (idx + 1),
          month: w.month || Math.min(12, Math.floor(idx / 4.33) + 1),
          label: w.label || `[W${idx + 1}]`
        }))
      : generateYearWeeks(yr);

    const sM = Number(raw.startMonth) || 1;
    const eM = Number(raw.endMonth) || 3;
    let selMonths = Array.isArray(raw.selectedMonths) && raw.selectedMonths.length > 0
      ? raw.selectedMonths.map(Number).filter(m => m >= 1 && m <= 12).sort((a, b) => a - b)
      : [];
    if (selMonths.length === 0) {
      const a = Math.min(sM, eM), b = Math.max(sM, eM);
      for (let m = a; m <= b; m++) selMonths.push(m);
    }

    return {
      year: yr,
      startDate: raw.startDate || `${yr}-01-01`,
      startMonth: selMonths[0],
      endMonth: selMonths[selMonths.length - 1],
      selectedMonths: selMonths,
      viewMode: ['month', 'week', 'all'].includes(raw.viewMode) ? raw.viewMode : 'week',
      summaryPos: raw.summaryPos === 'top' ? 'top' : 'bottom',
      hideSpecCols: Boolean(raw.hideSpecCols),
      hideCompareCols: Boolean(raw.hideCompareCols),
      shortageOnly: Boolean(raw.shortageOnly),
      autoGreenOnMove: raw.autoGreenOnMove !== undefined ? Boolean(raw.autoGreenOnMove) : true,
      colorFilter: raw.colorFilter || 'ALL',
      mergedItemGroups: Array.isArray(raw.mergedItemGroups) ? raw.mergedItemGroups : [],
      itemGroupOrder: Array.isArray(raw.itemGroupOrder) ? raw.itemGroupOrder : [],
      weeks: baseWeeks,
      rowsByCode: raw.rowsByCode && typeof raw.rowsByCode === 'object' ? raw.rowsByCode : {}
    };
  }

  function loadLocalPlanData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PLAN_DATA);
      if (raw) {
        state.planData = normalizePlanData(JSON.parse(raw));
        return;
      }
    } catch (e) {
      console.warn('생산계획 로컬 로드 실패:', e);
    }
    state.planData = getDefaultPlanData();
  }

  function saveLocalPlanData() {
    if (!state.planData) return;
    try {
      localStorage.setItem(STORAGE_KEYS.PLAN_DATA, JSON.stringify(state.planData));
    } catch (e) {
      console.warn('생산계획 로컬 저장 실패:', e);
    }
  }

  async function loadPlanDataFromDb() {
    loadLocalPlanData();
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_data').doc('production_plan').get();
      if (doc.exists) {
        state.planData = normalizePlanData(doc.data());
        saveLocalPlanData();
      }
    } catch (err) {
      console.warn('생산계획 Firestore 로드 오류:', err);
    }
  }

  async function savePlanToDb() {
    if (!state.planData) state.planData = getDefaultPlanData();
    saveLocalPlanData();
    if (isFirestoreActive && db) {
      await db.collection('pms_data').doc('production_plan').set({
        ...state.planData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    markAsDirty(false);
    showToast('생산계획이 저장되었습니다.');
  }

  // 실행 취소 (Ctrl+Z) 히스토리 및 그리드 상태
  const planUndoStack = [];
  function pushPlanUndoSnapshot() {
    if (!state.planData) return;
    planUndoStack.push(JSON.stringify(state.planData.rowsByCode || {}));
    if (planUndoStack.length > 20) planUndoStack.shift();
    updatePlanUndoButton();
  }

  function undoPlanAction() {
    if (planUndoStack.length === 0 || !state.planData) return;
    const prev = planUndoStack.pop();
    try {
      state.planData.rowsByCode = JSON.parse(prev);
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
      showToast('이전 작업으로 되돌렸습니다.');
    } catch (e) { /* ignore */ }
    updatePlanUndoButton();
  }

  function updatePlanUndoButton() {
    const btn = document.getElementById('btn-plan-undo');
    if (btn) btn.disabled = planUndoStack.length === 0;
  }

  const planGridState = {
    columns: [],
    groupHeaders: [],
    rows: [],
    anchor: null,
    focus: null,
    isDragging: false,
    altDrag: null, // { r, fromColIdx, weekId, code }
    editing: null,
    lastCopiedTSV: ''
  };

  function parsePlanNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    const cleaned = String(val).replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function formatPlanCellDisplay(val) {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();
    if (str === '') return '';
    const cleaned = str.replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return Number(cleaned).toLocaleString('ko-KR');
    }
    return str;
  }

  function getPlanPeriodWeeksAndMonths() {
    const pd = state.planData || getDefaultPlanData();
    let months = Array.isArray(pd.selectedMonths) && pd.selectedMonths.length > 0
      ? [...pd.selectedMonths].sort((a, b) => a - b)
      : [];
    if (months.length === 0) {
      const sM = Math.min(pd.startMonth || 1, pd.endMonth || 12);
      const eM = Math.max(pd.startMonth || 1, pd.endMonth || 12);
      for (let m = sM; m <= eM; m++) months.push(m);
    }
    const monthSet = new Set(months);
    const weeks = (pd.weeks || []).filter(w => monthSet.has(w.month));
    return { months, weeks, startMonth: months[0], endMonth: months[months.length - 1] };
  }

  function buildPlanColumnsAndGroups() {
    const pd = state.planData || getDefaultPlanData();
    const baseYearNum = Number(pd.year || 2026) - 1;
    const baseYearShort = String(baseYearNum).slice(-2);

    const fixedCols = [
      { key: 'code', label: '품목코드', fixed: true, editable: false, cls: 'plan-col-code', isNum: false },
      { key: 'name', label: '품명', fixed: true, editable: false, cls: 'plan-col-name', isNum: false }
    ];

    if (!pd.hideSpecCols) {
      fixedCols.push(
        { key: 'formatNo', label: '형식번호', fixed: true, editable: false, cls: 'plan-col-format', isNum: false },
        { key: 'modelName', label: '모델명', fixed: true, editable: false, cls: 'plan-col-model', isNum: false },
        { key: 'unitPrice', label: '단가', fixed: true, editable: false, cls: 'plan-col-price', isNum: true },
        { key: 'baseStock', label: `기초재고<br><small style="font-weight:500;color:#64748b;">[${baseYearShort}년]</small>`, fixed: true, editable: true, cls: 'plan-col-base', isNum: true }
      );
    }

    const { months, weeks } = getPlanPeriodWeeksAndMonths();
    const subCount = pd.hideCompareCols ? 4 : 6;
    const dynamicCols = [];
    const groupHeaders = []; // { type: 'week'|'month', id, label, colspan }

    const pushWeekCols = (w) => {
      groupHeaders.push({ type: 'week', id: w.id, label: w.label, colspan: subCount });
      dynamicCols.push({ key: `${w.id}:prod`, weekId: w.id, field: 'prod', label: '생산', fixed: false, editable: true, cls: 'plan-col-week plan-col-prod', isNum: true });
      dynamicCols.push({ key: `${w.id}:forecast`, weekId: w.id, field: 'forecast', label: '출고예정', fixed: false, editable: false, cls: 'plan-col-week plan-col-forecast plan-cell-readonly', isNum: true });
      dynamicCols.push({ key: `${w.id}:actual`, weekId: w.id, field: 'actual', label: '실출고', fixed: false, editable: false, cls: 'plan-col-week plan-col-actual plan-cell-readonly', isNum: true });
      if (!pd.hideCompareCols) {
        dynamicCols.push({ key: `${w.id}:compare`, weekId: w.id, field: 'compare', label: '입고비교', fixed: false, editable: false, cls: 'plan-col-week plan-col-compare plan-cell-readonly', isNum: true });
        dynamicCols.push({ key: `${w.id}:diff`, weekId: w.id, field: 'diff', label: '차이수량', fixed: false, editable: false, cls: 'plan-col-week plan-col-diff plan-cell-readonly', isNum: true });
      }
      dynamicCols.push({ key: `${w.id}:stock`, weekId: w.id, field: 'stock', label: '재고', fixed: false, editable: false, cls: 'plan-col-week plan-col-stock plan-cell-readonly', isNum: true });
    };

    const pushMonthCols = (m) => {
      const mId = `M${m}`;
      groupHeaders.push({ type: 'month', id: mId, label: `${m}월 합계`, colspan: subCount });
      dynamicCols.push({ key: `${mId}:prod`, month: m, field: 'prod', isMonth: true, label: '생산', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      dynamicCols.push({ key: `${mId}:forecast`, month: m, field: 'forecast', isMonth: true, label: '출고예정', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      dynamicCols.push({ key: `${mId}:actual`, month: m, field: 'actual', isMonth: true, label: '실출고', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      if (!pd.hideCompareCols) {
        dynamicCols.push({ key: `${mId}:compare`, month: m, field: 'compare', isMonth: true, label: '입고비교', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
        dynamicCols.push({ key: `${mId}:diff`, month: m, field: 'diff', isMonth: true, label: '차이수량', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      }
      dynamicCols.push({ key: `${mId}:stock`, month: m, field: 'stock', isMonth: true, label: '기말재고', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-col-stock plan-cell-readonly', isNum: true });
    };

    if (pd.viewMode === 'month') {
      months.forEach(m => pushMonthCols(m));
    } else if (pd.viewMode === 'all') {
      months.forEach(m => {
        const mWeeks = weeks.filter(w => w.month === m);
        mWeeks.forEach(w => pushWeekCols(w));
        pushMonthCols(m);
      });
    } else {
      weeks.forEach(w => pushWeekCols(w));
    }

    return {
      columns: [...fixedCols, ...dynamicCols],
      fixedCount: fixedCols.length,
      groupHeaders
    };
  }

  function getOrderedPlanItemGroups() {
    const pd = state.planData || getDefaultPlanData();
    const groupCounts = new Map();
    (state.certMasterItems || []).filter(it => (it.useYn || '사용') === '사용').forEach(it => {
      const g = (it.itemGroup || '').trim();
      if (g) groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
    });
    const savedOrder = Array.isArray(pd.itemGroupOrder) ? pd.itemGroupOrder : [];
    const ordered = savedOrder.filter(g => groupCounts.has(g));
    const remaining = Array.from(groupCounts.keys())
      .filter(g => !ordered.includes(g))
      .sort((a, b) => a.localeCompare(b, 'ko'));
    return { orderedGroups: [...ordered, ...remaining], groupCounts };
  }

  function getPlanComputedRows(ignoreColorFilter = false) {
    const pd = state.planData || getDefaultPlanData();
    const masterItems = state.certMasterItems || [];
    const groupFilter = state.planFilterGroup || 'ALL';
    const search = (state.planSearchText || '').trim().toLowerCase();
    const mainGroups = ['감지기반', '유도등반', '수신기반'];
    const { months, weeks: periodWeeks } = getPlanPeriodWeeksAndMonths();

    const computedRows = masterItems
      .filter(item => (item.useYn || '사용') === '사용')
      .filter(item => {
        if (groupFilter === 'ALL') return true;
        if (groupFilter === '기타') return !mainGroups.includes(item.group);
        return item.group === groupFilter;
      })
      .filter(item => {
        if (!search) return true;
        return (
          (item.code || '').toLowerCase().includes(search) ||
          (item.altName || '').toLowerCase().includes(search) ||
          (item.name || '').toLowerCase().includes(search) ||
          (item.modelName || '').toLowerCase().includes(search) ||
          (item.formatNo || '').toLowerCase().includes(search)
        );
      })
      .map(item => {
        const saved = pd.rowsByCode[item.code] || {};
        const baseVal = saved.baseStock !== undefined && saved.baseStock !== null ? saved.baseStock : (item.baseStock || '');
        const minStock = item.minStock !== '' && item.minStock !== undefined ? parsePlanNum(item.minStock) : null;
        const maxStock = item.maxStock !== '' && item.maxStock !== undefined ? parsePlanNum(item.maxStock) : null;

        const weekVals = {};
        let prevStock = parsePlanNum(baseVal);
        let hasShortage = false;

        // 연도 전체 주차를 순서대로 계산해야 기간 시작 전 재고가 정확히 이월됨
        (pd.weeks || []).forEach(w => {
          const wSaved = (saved.weeks && saved.weeks[w.id]) || {};
          const prod = wSaved.prod !== undefined ? wSaved.prod : '';
          const forecast = wSaved.forecast !== undefined ? wSaved.forecast : '';
          const actual = wSaved.actual !== undefined ? wSaved.actual : '';
          const compare = wSaved.compare !== undefined ? wSaved.compare : '';

          // 차이수량 = 생산 - 입고비교
          let diff = '';
          if (String(prod).trim() !== '' || String(compare).trim() !== '') {
            diff = String(parsePlanNum(prod) - parsePlanNum(compare));
          }

          const stock = prevStock + parsePlanNum(prod) - parsePlanNum(actual);
          prevStock = stock;

          if (periodWeeks.some(pw => pw.id === w.id)) {
            if (stock < 0 || (minStock !== null && minStock > 0 && stock < minStock)) {
              hasShortage = true;
            }
          }

          weekVals[w.id] = { prod, forecast, actual, compare, diff, stock };
        });

        // 월별 집계 계산
        const monthVals = {};
        months.forEach(m => {
          const mWeeks = (pd.weeks || []).filter(w => w.month === m);
          let sumProd = 0, sumForecast = 0, sumActual = 0, sumCompare = 0, sumDiff = 0;
          let closingStock = 0;
          let anyProdOrComp = false;
          mWeeks.forEach(w => {
            const wv = weekVals[w.id] || {};
            sumProd += parsePlanNum(wv.prod);
            sumForecast += parsePlanNum(wv.forecast);
            sumActual += parsePlanNum(wv.actual);
            sumCompare += parsePlanNum(wv.compare);
            if (wv.diff !== '') {
              sumDiff += parsePlanNum(wv.diff);
              anyProdOrComp = true;
            }
            closingStock = wv.stock !== undefined ? wv.stock : closingStock;
          });
          monthVals[`M${m}`] = {
            prod: sumProd || '',
            forecast: sumForecast || '',
            actual: sumActual || '',
            compare: sumCompare || '',
            diff: anyProdOrComp ? String(sumDiff) : '',
            stock: mWeeks.length > 0 ? closingStock : ''
          };
        });

        const colors = saved.colors || {};
        const memos = saved.memos || {};

        return {
          code: item.code || '',
          name: getDisplayItemName(item),
          itemGroup: (item.itemGroup || '').trim(),
          formatNo: item.formatNo || '',
          modelName: item.modelName || '',
          unitPrice: item.unitPrice || '',
          baseStock: baseVal,
          minStock,
          maxStock,
          hasShortage,
          weeks: weekVals,
          months: monthVals,
          colors,
          memos,
          isGroupRow: false
        };
      });

    // 품목그룹별 ON/OFF 합산 처리 (품목그룹 순서대로 그룹 행 상단 배치 후 미그룹/OFF 품목 표시)
    const mergedSet = new Set(pd.mergedItemGroups || []);
    let finalRows = computedRows;
    if (mergedSet.size > 0) {
      const { orderedGroups } = getOrderedPlanItemGroups();
      const groupBuckets = new Map();
      const ungroupedRows = [];
      const addNumOrEmpty = (a, b) => {
        const sa = String(a ?? '').trim();
        const sb = String(b ?? '').trim();
        if (sa === '' && sb === '') return '';
        return String(parsePlanNum(sa) + parsePlanNum(sb));
      };

      computedRows.forEach(row => {
        if (row.itemGroup && mergedSet.has(row.itemGroup)) {
          let grp = groupBuckets.get(row.itemGroup);
          if (!grp) {
            const cloneWeeks = {};
            Object.keys(row.weeks || {}).forEach(wk => {
              cloneWeeks[wk] = { ...row.weeks[wk] };
            });
            const cloneMonths = {};
            Object.keys(row.months || {}).forEach(mk => {
              cloneMonths[mk] = { ...row.months[mk] };
            });
            grp = {
              code: '[그룹]',
              name: row.itemGroup,
              itemGroup: row.itemGroup,
              formatNo: '-',
              modelName: '그룹합산',
              unitPrice: '',
              baseStock: row.baseStock !== '' ? String(parsePlanNum(row.baseStock)) : '',
              minStock: row.minStock,
              maxStock: row.maxStock,
              hasShortage: row.hasShortage,
              weeks: cloneWeeks,
              months: cloneMonths,
              colors: { ...(row.colors || {}) },
              memos: { ...(row.memos || {}) },
              isGroupRow: true,
              memberCount: 1
            };
            groupBuckets.set(row.itemGroup, grp);
          } else {
            grp.memberCount += 1;
            grp.baseStock = addNumOrEmpty(grp.baseStock, row.baseStock);
            if (row.minStock !== null) grp.minStock = (grp.minStock || 0) + row.minStock;
            if (row.maxStock !== null) grp.maxStock = (grp.maxStock || 0) + row.maxStock;

            Object.keys(row.weeks || {}).forEach(wk => {
              const gw = grp.weeks[wk] || (grp.weeks[wk] = { prod: '', forecast: '', actual: '', compare: '', diff: '', stock: 0 });
              const rw = row.weeks[wk] || {};
              gw.prod = addNumOrEmpty(gw.prod, rw.prod);
              gw.forecast = addNumOrEmpty(gw.forecast, rw.forecast);
              gw.actual = addNumOrEmpty(gw.actual, rw.actual);
              gw.compare = addNumOrEmpty(gw.compare, rw.compare);
              gw.diff = addNumOrEmpty(gw.diff, rw.diff);
              gw.stock = parsePlanNum(gw.stock) + parsePlanNum(rw.stock);
            });

            Object.keys(row.months || {}).forEach(mk => {
              const gm = grp.months[mk] || (grp.months[mk] = { prod: '', forecast: '', actual: '', compare: '', diff: '', stock: '' });
              const rm = row.months[mk] || {};
              gm.prod = addNumOrEmpty(gm.prod, rm.prod);
              gm.forecast = addNumOrEmpty(gm.forecast, rm.forecast);
              gm.actual = addNumOrEmpty(gm.actual, rm.actual);
              gm.compare = addNumOrEmpty(gm.compare, rm.compare);
              gm.diff = addNumOrEmpty(gm.diff, rm.diff);
              gm.stock = addNumOrEmpty(gm.stock, rm.stock);
            });

            Object.keys(row.colors || {}).forEach(ck => {
              if (!grp.colors[ck] && row.colors[ck]) grp.colors[ck] = row.colors[ck];
            });
            Object.keys(row.memos || {}).forEach(mk => {
              if (row.memos[mk]) {
                grp.memos[mk] = grp.memos[mk] ? `${grp.memos[mk]} / ${row.memos[mk]}` : row.memos[mk];
              }
            });

            grp.hasShortage = periodWeeks.some(pw => {
              const st = grp.weeks[pw.id] ? parsePlanNum(grp.weeks[pw.id].stock) : 0;
              return st < 0 || (grp.minStock !== null && grp.minStock > 0 && st < grp.minStock);
            });
          }
          grp.name = `📦 ${row.itemGroup} (${grp.memberCount}종)`;
        } else {
          ungroupedRows.push(row);
        }
      });

      finalRows = [];
      orderedGroups.forEach(gName => {
        if (groupBuckets.has(gName)) finalRows.push(groupBuckets.get(gName));
      });
      groupBuckets.forEach((grp, gName) => {
        if (!orderedGroups.includes(gName)) finalRows.push(grp);
      });
      finalRows.push(...ungroupedRows);
    }

    return finalRows.filter(row => {
      if (pd.shortageOnly && !row.hasShortage) return false;
      if (!ignoreColorFilter && pd.colorFilter && pd.colorFilter !== 'ALL') {
        const vals = Object.values(row.colors || {});
        if (!vals.includes(pd.colorFilter)) return false;
      }
      return true;
    });
  }

  function getPlanCellRawValue(rowObj, col) {
    if (!rowObj || !col) return '';
    if (col.key === 'code') return rowObj.code;
    if (col.key === 'name') return rowObj.name;
    if (col.key === 'formatNo') return rowObj.formatNo;
    if (col.key === 'modelName') return rowObj.modelName;
    if (col.key === 'unitPrice') return rowObj.unitPrice;
    if (col.key === 'baseStock') return rowObj.baseStock;
    if (col.isMonth && col.month) {
      const mv = rowObj.months[`M${col.month}`];
      return mv ? mv[col.field] : '';
    }
    if (col.weekId && col.field) {
      const w = rowObj.weeks[col.weekId];
      return w ? w[col.field] : '';
    }
    return '';
  }

  function setPlanCellValue(code, col, rawVal) {
    if (!state.planData) state.planData = getDefaultPlanData();
    if (!state.planData.rowsByCode[code]) {
      state.planData.rowsByCode[code] = { weeks: {}, colors: {}, memos: {} };
    }
    const entry = state.planData.rowsByCode[code];
    let clean = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();
    const noComma = clean.replace(/,/g, '');
    if (noComma !== '' && /^-?\d+(\.\d+)?$/.test(noComma)) {
      clean = noComma;
    }

    if (col.key === 'baseStock') {
      entry.baseStock = clean;
    } else if (col.weekId && col.field && col.editable) {
      if (!entry.weeks) entry.weeks = {};
      if (!entry.weeks[col.weekId]) entry.weeks[col.weekId] = {};
      entry.weeks[col.weekId][col.field] = clean;
    }
  }

  function setPlanCellColor(code, colKey, colorName) {
    if (!state.planData) return;
    if (!state.planData.rowsByCode[code]) state.planData.rowsByCode[code] = { weeks: {}, colors: {}, memos: {} };
    if (!state.planData.rowsByCode[code].colors) state.planData.rowsByCode[code].colors = {};
    if (!colorName) {
      delete state.planData.rowsByCode[code].colors[colKey];
    } else {
      state.planData.rowsByCode[code].colors[colKey] = colorName;
    }
  }

  function setPlanCellMemo(code, colKey, memoText) {
    if (!state.planData) return;
    if (!state.planData.rowsByCode[code]) state.planData.rowsByCode[code] = { weeks: {}, colors: {}, memos: {} };
    if (!state.planData.rowsByCode[code].memos) state.planData.rowsByCode[code].memos = {};
    const trimmed = (memoText || '').trim();
    if (!trimmed) {
      delete state.planData.rowsByCode[code].memos[colKey];
    } else {
      state.planData.rowsByCode[code].memos[colKey] = trimmed;
    }
  }

  function buildPlanSummaryRowHtml(rows, cols, fixedCount) {
    const pd = state.planData || getDefaultPlanData();
    const totals = new Array(cols.length).fill(0);
    rows.forEach(row => {
      cols.forEach((col, cIdx) => {
        if (col.key === 'baseStock' || col.weekId || col.isMonth) {
          totals[cIdx] += parsePlanNum(getPlanCellRawValue(row, col));
        }
      });
    });

    const pos = pd.summaryPos || 'bottom';
    let html = '<tr class="plan-summary-row">';
    cols.forEach((col, cIdx) => {
      const fixedCls = col.fixed ? ' plan-fixed-col' : '';
      if (cIdx === 0) {
        html += `<td class="${col.cls}${fixedCls} plan-summary-label">
          <select id="plan-summary-pos-inline" class="plan-summary-pos-inline" title="합계 위치 변경">
            <option value="bottom"${pos === 'bottom' ? ' selected' : ''}>합계 ▼(하단)</option>
            <option value="top"${pos === 'top' ? ' selected' : ''}>합계 ▲(상단)</option>
          </select>
        </td>`;
      } else if (cIdx === 1) {
        html += `<td class="${col.cls}${fixedCls}" style="text-align:left; font-family:Pretendard,sans-serif;">${rows.length}개 품목</td>`;
      } else if (cIdx < fixedCount && col.key !== 'baseStock') {
        html += `<td class="${col.cls}${fixedCls}"></td>`;
      } else {
        const negCls = (col.field === 'stock' && totals[cIdx] < 0) ? ' plan-stock-negative' : '';
        const diffCls = (col.field === 'diff')
          ? (totals[cIdx] < 0 ? ' plan-diff-neg' : (totals[cIdx] > 0 ? ' plan-diff-pos' : ''))
          : '';
        html += `<td class="${col.cls}${fixedCls}${negCls}${diffCls}">${totals[cIdx].toLocaleString('ko-KR')}</td>`;
      }
    });
    html += '</tr>';
    return html;
  }

  function formatPlanSelectedMonthsText(months) {
    if (!months || months.length === 0) return '선택 없음';
    const sorted = [...months].sort((a, b) => a - b);
    if (sorted.length === 12) return '전체 (1~12월)';
    if (sorted.length === 1) return `${sorted[0]}월`;
    const isContiguous = sorted.every((m, idx) => idx === 0 || m === sorted[idx - 1] + 1);
    if (isContiguous) return `${sorted[0]}월 ~ ${sorted[sorted.length - 1]}월`;
    return sorted.map(m => `${m}월`).join(', ');
  }

  function syncPlanToolbarControls() {
    const pd = state.planData || getDefaultPlanData();
    const sDateEl = document.getElementById('plan-start-date');
    if (sDateEl) sDateEl.value = pd.startDate || `${pd.year}-01-01`;

    const selMonths = Array.isArray(pd.selectedMonths) && pd.selectedMonths.length > 0
      ? pd.selectedMonths
      : [1, 2, 3];

    const gridEl = document.getElementById('plan-months-checkbox-grid');
    if (gridEl) {
      gridEl.innerHTML = '';
      for (let m = 1; m <= 12; m++) {
        const label = document.createElement('label');
        label.className = 'plan-month-chk-item';
        const checked = selMonths.includes(m) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" class="plan-month-chk" value="${m}" ${checked}><span>${m}월</span>`;
        gridEl.appendChild(label);
      }
    }

    const badgeEl = document.getElementById('plan-months-badge');
    if (badgeEl) {
      badgeEl.textContent = formatPlanSelectedMonthsText(selMonths);
    }

    syncCustomSelect('plan-group-filter');

    document.querySelectorAll('.plan-seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === pd.viewMode);
    });

    const chkSpec = document.getElementById('chk-plan-hide-spec');
    if (chkSpec) chkSpec.checked = Boolean(pd.hideSpecCols);
    const chkComp = document.getElementById('chk-plan-hide-compare');
    if (chkComp) chkComp.checked = Boolean(pd.hideCompareCols);
    const chkShort = document.getElementById('chk-plan-shortage-only');
    if (chkShort) chkShort.checked = Boolean(pd.shortageOnly);
    const chkAutoG = document.getElementById('chk-plan-auto-green');
    if (chkAutoG) chkAutoG.checked = Boolean(pd.autoGreenOnMove);

    document.querySelectorAll('#plan-legend-filters .plan-legend-chip').forEach(ch => {
      ch.classList.toggle('active', ch.dataset.color === (pd.colorFilter || 'ALL'));
    });

    // 품목그룹 ON/OFF 및 순서 변경 체크리스트 동기화
    const igListEl = document.getElementById('plan-item-group-checklist');
    const igBtn = document.getElementById('btn-plan-item-groups');
    const mergedArr = Array.isArray(pd.mergedItemGroups) ? pd.mergedItemGroups : [];
    if (igListEl) {
      const { orderedGroups, groupCounts } = getOrderedPlanItemGroups();
      if (orderedGroups.length === 0) {
        igListEl.innerHTML = `<div style="padding: 8px; font-size: 11.5px; color: #94a3b8; text-align:center;">품목정보에 등록된 품목그룹이 없습니다.</div>`;
      } else {
        igListEl.innerHTML = orderedGroups.map((g, gIdx) => {
          const isOn = mergedArr.includes(g);
          const cnt = groupCounts.get(g);
          const escG = escapeHtmlPlan(g);
          return `
            <div class="plan-ig-row" draggable="true" data-group="${escG}">
              <label class="plan-ig-left">
                <span class="plan-ig-handle" title="드래그하여 순서 변경">⋮⋮</span>
                <input type="checkbox" class="chk-plan-item-group" value="${escG}" ${isOn ? 'checked' : ''}>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escG} <small style="color:#94a3b8;">(${cnt})</small></span>
              </label>
              <div class="plan-ig-move-btns">
                <button type="button" class="plan-ig-move-btn" data-group="${escG}" data-dir="up" title="위로" ${gIdx === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="plan-ig-move-btn" data-group="${escG}" data-dir="down" title="아래로" ${gIdx === orderedGroups.length - 1 ? 'disabled' : ''}>▼</button>
              </div>
            </div>`;
        }).join('');
      }
    }
    if (igBtn) {
      igBtn.textContent = mergedArr.length > 0 ? `품목그룹 (${mergedArr.length}) ▾` : '품목그룹 ▾';
      igBtn.classList.toggle('btn-primary', mergedArr.length > 0);
      igBtn.classList.toggle('btn-outline', mergedArr.length === 0);
    }

    updatePlanUndoButton();
  }

  function renderPlanModule() {
    if (!state.planData) loadLocalPlanData();
    const pd = state.planData;
    syncPlanToolbarControls();

    const { columns: cols, fixedCount, groupHeaders } = buildPlanColumnsAndGroups();
    const rows = getPlanComputedRows();
    const allRowsForColorCounts = getPlanComputedRows(true);
    planGridState.columns = cols;
    planGridState.rows = rows;

    // 상태필터 칩별 개수 계산 및 표시 (예: 증가 ⑤)
    const visibleColKeys = cols.slice(fixedCount).map(c => c.key);
    const colorCounts = { yellow: 0, pink: 0, green: 0, blue: 0, orange: 0 };
    allRowsForColorCounts.forEach(r => {
      const cMap = r.colors || {};
      visibleColKeys.forEach(k => {
        const c = cMap[k];
        if (c && colorCounts[c] !== undefined) colorCounts[c]++;
      });
    });
    const totalColorCount = Object.values(colorCounts).reduce((a, b) => a + b, 0);
    document.querySelectorAll('#plan-legend-filters .plan-legend-chip').forEach(ch => {
      const cKey = ch.dataset.color || 'ALL';
      const cnt = cKey === 'ALL' ? totalColorCount : (colorCounts[cKey] || 0);
      let badge = ch.querySelector('.plan-filter-count-badge');
      if (cnt > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'plan-filter-count-badge';
          ch.appendChild(badge);
        }
        badge.textContent = cnt;
      } else if (badge) {
        badge.remove();
      }
    });

    const tableEl = document.getElementById('plan-excel-table');
    if (tableEl) {
      tableEl.classList.toggle('plan-hide-spec', Boolean(pd.hideSpecCols));
    }

    const thead = document.getElementById('plan-grid-thead');
    const tbody = document.getElementById('plan-grid-tbody');
    const tfoot = document.getElementById('plan-grid-tfoot');
    if (!thead || !tbody || !tfoot) return;

    // 1) THEAD
    let headRow1 = '<tr class="plan-header-row-1">';
    cols.slice(0, fixedCount).forEach(col => {
      headRow1 += `<th rowspan="2" class="${col.cls} plan-fixed-col">${col.label}</th>`;
    });
    groupHeaders.forEach(gh => {
      if (gh.type === 'month') {
        headRow1 += `<th colspan="${gh.colspan}" class="plan-month-header-cell">${escapeHtmlPlan(gh.label)}</th>`;
      } else {
        headRow1 += `<th colspan="${gh.colspan}" class="plan-week-header-cell" data-week-id="${gh.id}" title="클릭하여 주차/날짜 라벨 수정">${escapeHtmlPlan(gh.label)}</th>`;
      }
    });
    headRow1 += '</tr>';

    let headRow2 = '<tr class="plan-header-row-2">';
    cols.slice(fixedCount).forEach(col => {
      let alertHtml = '';
      if (col.weekId && col.field === 'prod' && !col.isMonth) {
        let alertCnt = 0;
        rows.forEach(r => {
          const c = r.colors && r.colors[col.key];
          if (c && (!pd.colorFilter || pd.colorFilter === 'ALL' || c === pd.colorFilter)) {
            alertCnt++;
          }
        });
        if (alertCnt > 0) {
          alertHtml = ` <span class="plan-week-alert-badge" title="상태 표시 ${alertCnt}건">!</span>`;
        }
      }
      headRow2 += `<th class="${col.cls}">${col.label}${alertHtml}</th>`;
    });
    headRow2 += '</tr>';

    const summaryHtml = buildPlanSummaryRowHtml(rows, cols, fixedCount);
    if (pd.summaryPos === 'top') {
      thead.innerHTML = headRow1 + headRow2 + summaryHtml;
      tfoot.innerHTML = '';
    } else {
      thead.innerHTML = headRow1 + headRow2;
      tfoot.innerHTML = summaryHtml;
    }

    // 합계 위치 인라인 셀렉트 바인딩
    const inlinePosSel = document.getElementById('plan-summary-pos-inline');
    if (inlinePosSel) {
      inlinePosSel.addEventListener('change', (e) => {
        state.planData.summaryPos = e.target.value === 'top' ? 'top' : 'bottom';
        saveLocalPlanData();
        markAsDirty(true);
        renderPlanModule();
      });
    }

    // 2) TBODY
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center; padding: 36px; color:#94a3b8;">조건에 맞는 품목이 없습니다.</td></tr>`;
      hidePlanMemoPopover();
      return;
    }

    const regMap = getCertRegisteredQtyMap();
    let bodyHtml = '';
    rows.forEach((row, rIdx) => {
      const grpRowCls = row.isGroupRow ? ' class="plan-group-summary-row"' : '';
      bodyHtml += `<tr data-r="${rIdx}" data-code="${escapeHtmlPlan(row.code)}"${grpRowCls}>`;
      cols.forEach((col, cIdx) => {
        const raw = getPlanCellRawValue(row, col);
        const disp = col.isNum ? formatPlanCellDisplay(raw) : escapeHtmlPlan(raw);
        const fixedCls = col.fixed ? ' plan-fixed-col' : '';

        // 차이수량 음수/양수 색상
        let diffCls = '';
        if (col.field === 'diff' && raw !== '') {
          const dn = parsePlanNum(raw);
          if (dn < 0) diffCls = ' plan-diff-neg';
          else if (dn > 0) diffCls = ' plan-diff-pos';
        }

        // 적정재고 상태 색상 및 툴팁
        let stockCls = '';
        let titleText = col.key === 'name' ? row.name : '';
        if (col.field === 'stock' && raw !== '') {
          const sn = parsePlanNum(raw);
          if (sn < 0) {
            stockCls = ' plan-stock-negative';
            titleText = `결품 (${sn.toLocaleString()})`;
          } else if (row.minStock !== null && row.minStock > 0 && sn < row.minStock) {
            stockCls = ' plan-stock-low';
            titleText = `부족 (최소 ${row.minStock.toLocaleString()} 미만)`;
          } else if (row.maxStock !== null && row.maxStock > 0 && sn > row.maxStock) {
            stockCls = ' plan-stock-high';
            titleText = `과다 (최대 ${row.maxStock.toLocaleString()} 초과)`;
          } else if ((row.minStock !== null && row.minStock > 0) || (row.maxStock !== null && row.maxStock > 0)) {
            stockCls = ' plan-stock-ok';
            titleText = `적정 (${(row.minStock || 0).toLocaleString()} ~ ${(row.maxStock || '-').toLocaleString()})`;
          }
        }

        // 생산 셀 검정 등록 상태 표시 (녹색 점: 전량등록, 주황 점: 부분등록)
        let certCls = '';
        if (col.weekId && col.field === 'prod' && !col.isMonth) {
          const pQty = parsePlanNum(raw);
          const rQty = regMap[`${row.code}__${col.weekId}`] || 0;
          if (pQty > 0 && rQty > 0) {
            if (rQty >= pQty) {
              certCls = ' plan-cert-done';
              titleText = `검정 등록완료 (${rQty.toLocaleString()} / ${pQty.toLocaleString()})`;
            } else {
              certCls = ' plan-cert-partial';
              titleText = `검정 부분등록 (${rQty.toLocaleString()} / ${pQty.toLocaleString()})`;
            }
          }
        }

        const cellColor = row.colors ? row.colors[col.key] : '';
        const colorCls = cellColor ? ` plan-cell-color-${cellColor}` : '';
        const hasMemo = row.memos && row.memos[col.key] ? ' plan-has-memo' : '';
        const titleAttr = titleText ? ` title="${escapeHtmlPlan(titleText)}"` : '';

        bodyHtml += `<td data-r="${rIdx}" data-c="${cIdx}" class="${col.cls}${fixedCls}${diffCls}${stockCls}${certCls}${colorCls}${hasMemo}"${titleAttr}>${disp}</td>`;
      });
      bodyHtml += '</tr>';
    });
    tbody.innerHTML = bodyHtml;

    applyPlanSelectionClasses();
  }

  function escapeHtmlPlan(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPlanSelectedRange() {
    if (!planGridState.anchor || !planGridState.focus) return null;
    const r1 = Math.min(planGridState.anchor.r, planGridState.focus.r);
    const r2 = Math.max(planGridState.anchor.r, planGridState.focus.r);
    const c1 = Math.min(planGridState.anchor.c, planGridState.focus.c);
    const c2 = Math.max(planGridState.anchor.c, planGridState.focus.c);
    return { r1, r2, c1, c2 };
  }

  function showPlanMemoPopoverForActiveCell() {
    const pop = document.getElementById('plan-memo-popover');
    const body = document.getElementById('plan-memo-popover-body');
    if (!pop || !body) return;

    const act = planGridState.anchor;
    if (!act) {
      pop.classList.remove('is-visible');
      return;
    }
    const row = planGridState.rows[act.r];
    const col = planGridState.columns[act.c];
    if (!row || !col || !row.memos || !row.memos[col.key]) {
      pop.classList.remove('is-visible');
      return;
    }

    const tbody = document.getElementById('plan-grid-tbody');
    const td = tbody?.querySelector(`td[data-r="${act.r}"][data-c="${act.c}"]`);
    if (!td) {
      pop.classList.remove('is-visible');
      return;
    }

    body.textContent = row.memos[col.key];
    const rect = td.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top - 4;
    if (left + 240 > window.innerWidth) left = Math.max(10, rect.left - 238);
    if (top + 150 > window.innerHeight) top = Math.max(10, window.innerHeight - 160);

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.classList.add('is-visible');
  }

  function hidePlanMemoPopover() {
    document.getElementById('plan-memo-popover')?.classList.remove('is-visible');
  }

  function applyPlanSelectionClasses() {
    const tbody = document.getElementById('plan-grid-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('td.plan-cell-selected, td.plan-cell-active').forEach(td => {
      td.classList.remove('plan-cell-selected', 'plan-cell-active');
    });

    const range = getPlanSelectedRange();
    const infoEl = document.getElementById('plan-selection-info');
    if (!range) {
      if (infoEl) infoEl.textContent = '선택: -';
      hidePlanMemoPopover();
      return;
    }

    for (let r = range.r1; r <= range.r2; r++) {
      const tr = tbody.querySelector(`tr[data-r="${r}"]`);
      if (!tr) continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const td = tr.querySelector(`td[data-c="${c}"]`);
        if (td) td.classList.add('plan-cell-selected');
      }
    }

    const active = planGridState.anchor;
    if (active) {
      const activeTd = tbody.querySelector(`td[data-r="${active.r}"][data-c="${active.c}"]`);
      if (activeTd) activeTd.classList.add('plan-cell-active');
    }

    if (infoEl) {
      const rCount = range.r2 - range.r1 + 1;
      const cCount = range.c2 - range.c1 + 1;
      const colMeta = planGridState.columns[active.c];
      const rowMeta = planGridState.rows[active.r];
      const label = rowMeta && colMeta ? `${rowMeta.code} · ${colMeta.label.replace(/<[^>]*>/g, ' ')}` : '';
      infoEl.textContent = rCount === 1 && cCount === 1
        ? `선택: ${label}`
        : `범위: ${rCount}행 × ${cCount}열`;
    }

    showPlanMemoPopoverForActiveCell();
  }

  function scrollPlanCellIntoView(r, c) {
    const tbody = document.getElementById('plan-grid-tbody');
    if (!tbody) return;
    const td = tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    if (td && typeof td.scrollIntoView === 'function') {
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  // Tab 키로 입력 가능한 셀(생산/기초재고)로만 이동
  function findNextEditableCell(r, c, reverse) {
    const cols = planGridState.columns;
    const rows = planGridState.rows;
    if (rows.length === 0 || cols.length === 0) return null;

    let cr = r;
    let cc = c;
    const total = rows.length * cols.length;
    for (let step = 0; step < total; step++) {
      cc += reverse ? -1 : 1;
      if (cc >= cols.length) {
        cc = 0;
        cr = (cr + 1) % rows.length;
      } else if (cc < 0) {
        cc = cols.length - 1;
        cr = (cr - 1 + rows.length) % rows.length;
      }
      if (cols[cc] && cols[cc].editable) {
        return { r: cr, c: cc };
      }
    }
    return null;
  }

  function startPlanCellEdit(r, c, initialText, replaceMode) {
    if (planGridState.editing) commitPlanCellEdit(true);

    const col = planGridState.columns[c];
    const row = planGridState.rows[r];
    if (!col || !row || !col.editable) return;
    if (row.isGroupRow) {
      showToast('품목그룹 합산 행은 수정할 수 없습니다. 개별 수정은 품목그룹을 OFF 해주세요.');
      return;
    }

    const tbody = document.getElementById('plan-grid-tbody');
    const td = tbody ? tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`) : null;
    if (!td) return;

    hidePlanMemoPopover();
    const origVal = getPlanCellRawValue(row, col);
    td.classList.add('plan-cell-editing');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'plan-cell-editor';
    input.value = replaceMode ? (initialText !== undefined ? initialText : '') : (origVal !== undefined && origVal !== null ? String(origVal) : '');

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    if (!replaceMode) {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }

    planGridState.editing = { r, c, originalVal: origVal, inputEl: input };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitPlanCellEdit(true);
        const nextR = Math.max(0, Math.min(planGridState.rows.length - 1, r + (e.shiftKey ? -1 : 1)));
        planGridState.anchor = { r: nextR, c };
        planGridState.focus = { r: nextR, c };
        applyPlanSelectionClasses();
        scrollPlanCellIntoView(nextR, c);
        document.getElementById('plan-grid-scroll-wrap')?.focus();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitPlanCellEdit(true);
        const next = findNextEditableCell(r, c, e.shiftKey);
        if (next) {
          planGridState.anchor = next;
          planGridState.focus = next;
          applyPlanSelectionClasses();
          scrollPlanCellIntoView(next.r, next.c);
        }
        document.getElementById('plan-grid-scroll-wrap')?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitPlanCellEdit(false);
        document.getElementById('plan-grid-scroll-wrap')?.focus();
      }
    });

    input.addEventListener('blur', () => {
      if (planGridState.editing && planGridState.editing.inputEl === input) {
        commitPlanCellEdit(true);
      }
    });
  }

  function commitPlanCellEdit(save) {
    const ed = planGridState.editing;
    if (!ed) return;
    planGridState.editing = null;

    const col = planGridState.columns[ed.c];
    const row = planGridState.rows[ed.r];
    if (!col || !row) return;

    if (save) {
      const newVal = ed.inputEl.value;
      if (String(newVal) !== String(ed.originalVal)) {
        pushPlanUndoSnapshot();
        setPlanCellValue(row.code, col, newVal);
        saveLocalPlanData();
        markAsDirty(true);
      }
    }

    renderPlanModule();
  }

  function clearPlanSelectedCells() {
    const range = getPlanSelectedRange();
    if (!range) return;
    pushPlanUndoSnapshot();
    let changed = false;
    for (let r = range.r1; r <= range.r2; r++) {
      const row = planGridState.rows[r];
      if (!row) continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const col = planGridState.columns[c];
        if (col && col.editable) {
          setPlanCellValue(row.code, col, '');
          changed = true;
        }
      }
    }
    if (changed) {
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    } else {
      planUndoStack.pop();
      updatePlanUndoButton();
    }
  }

  function copyPlanSelectionToClipboard(clipboardData) {
    const range = getPlanSelectedRange();
    if (!range) return;

    const lines = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = planGridState.rows[r];
      if (!row) continue;
      const cells = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const col = planGridState.columns[c];
        const raw = getPlanCellRawValue(row, col);
        cells.push(raw === null || raw === undefined ? '' : String(raw));
      }
      lines.push(cells.join('\t'));
    }

    const tsv = lines.join('\r\n');
    planGridState.lastCopiedTSV = tsv;
    if (clipboardData) {
      clipboardData.setData('text/plain', tsv);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).catch(() => {});
    }

    const tbody = document.getElementById('plan-grid-tbody');
    if (tbody) {
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) {
          const td = tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
          if (td) {
            td.classList.remove('plan-cell-copied-flash');
            void td.offsetWidth;
            td.classList.add('plan-cell-copied-flash');
          }
        }
      }
    }
  }

  function pasteTSVToPlanGrid(text) {
    if (text === undefined || text === null || text === '') return;
    const range = getPlanSelectedRange();
    if (!range) return;

    let normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (normalized.endsWith('\n')) normalized = normalized.slice(0, -1);

    const matrix = normalized.split('\n').map(line => line.split('\t'));
    if (matrix.length === 0) return;

    pushPlanUndoSnapshot();
    let changed = false;
    const isSingleSource = matrix.length === 1 && matrix[0].length === 1;
    const isMultiTarget = range.r2 > range.r1 || range.c2 > range.c1;

    if (isSingleSource && isMultiTarget) {
      const val = matrix[0][0];
      for (let r = range.r1; r <= range.r2; r++) {
        const row = planGridState.rows[r];
        if (!row) continue;
        for (let c = range.c1; c <= range.c2; c++) {
          const col = planGridState.columns[c];
          if (col && col.editable) {
            setPlanCellValue(row.code, col, val);
            changed = true;
          }
        }
      }
    } else {
      for (let dr = 0; dr < matrix.length; dr++) {
        const tr = range.r1 + dr;
        const row = planGridState.rows[tr];
        if (!row) break;
        const lineCols = matrix[dr];
        for (let dc = 0; dc < lineCols.length; dc++) {
          const tc = range.c1 + dc;
          const col = planGridState.columns[tc];
          if (!col) break;
          if (col.editable) {
            setPlanCellValue(row.code, col, lineCols[dc]);
            changed = true;
          }
        }
      }
      const endR = Math.min(planGridState.rows.length - 1, range.r1 + matrix.length - 1);
      const maxCols = Math.max(...matrix.map(m => m.length));
      const endC = Math.min(planGridState.columns.length - 1, range.c1 + maxCols - 1);
      planGridState.anchor = { r: range.r1, c: range.c1 };
      planGridState.focus = { r: endR, c: endC };
    }

    if (changed) {
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    } else {
      planUndoStack.pop();
      updatePlanUndoButton();
    }
  }

  // 예정물량조회.xls 업로드 (4행 주차, 5행 예정+조정 -> 출고예정)
  async function handlePlanForecastUpload(file) {
    if (!file || !window.XLSXEngine) return;
    try {
      const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
      const rows = parsed?.data || [];
      if (!rows || rows.length < 5) {
        showToast('예정물량 파일에서 데이터를 찾을 수 없습니다.');
        return;
      }

      // 5행('예정'이 포함된 행)을 헤더 행으로, 바로 위 4행을 주차 행으로 정확히 탐색
      let headerIdx = rows.findIndex((r, idx) => idx < 15 && Array.isArray(r) && r.some(c => String(c || '').trim() === '예정'));
      if (headerIdx === -1) {
        headerIdx = rows.findIndex((r, idx) => idx < 15 && Array.isArray(r) && r.some(c => String(c || '').trim() === '품목' || String(c || '').trim() === '품목코드'));
      }
      if (headerIdx === -1) headerIdx = 4;

      const headerRow = (rows[headerIdx] || []).map(c => String(c || '').trim());
      const weekRow = (rows[headerIdx - 1] || []).map(c => String(c || '').trim());
      let codeIdx = headerRow.findIndex(h => h === '품목' || h === '품목코드');
      if (codeIdx === -1) codeIdx = 0;

      // 4행 주차별 '예정', '조정' 컬럼 인덱스 매핑
      const weekColsMap = {}; // { W1: { planIdx, adjIdx } }
      let currentWeekId = null;
      for (let c = 0; c < headerRow.length; c++) {
        const wText = weekRow[c] || '';
        const wMatch = wText.match(/W\s*(\d+)/i);
        if (wMatch) {
          currentWeekId = 'W' + Number(wMatch[1]);
        } else if (wText.includes('합계')) {
          currentWeekId = null;
        }

        if (currentWeekId) {
          if (!weekColsMap[currentWeekId]) weekColsMap[currentWeekId] = {};
          if (headerRow[c] === '예정') weekColsMap[currentWeekId].planIdx = c;
          if (headerRow[c] === '조정') weekColsMap[currentWeekId].adjIdx = c;
        }
      }

      const weekIds = Object.keys(weekColsMap);
      if (weekIds.length === 0) {
        showToast('4행에서 주차(W1, W2...) 헤더를 찾을 수 없습니다.');
        return;
      }

      pushPlanUndoSnapshot();
      const pd = state.planData || getDefaultPlanData();
      let updatedCount = 0;

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const code = String(rows[r][codeIdx] || '').trim();
        if (!code) continue;
        if (!pd.rowsByCode[code]) pd.rowsByCode[code] = { weeks: {}, colors: {}, memos: {} };
        if (!pd.rowsByCode[code].weeks) pd.rowsByCode[code].weeks = {};

        weekIds.forEach(wId => {
          const { planIdx, adjIdx } = weekColsMap[wId];
          const pVal = planIdx !== undefined ? parsePlanNum(rows[r][planIdx]) : 0;
          const aVal = adjIdx !== undefined ? parsePlanNum(rows[r][adjIdx]) : 0;
          if (!pd.rowsByCode[code].weeks[wId]) pd.rowsByCode[code].weeks[wId] = {};
          pd.rowsByCode[code].weeks[wId].forecast = String(pVal + aVal);
        });
        updatedCount++;
      }

      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
      showToast(`예정물량 업로드 완료 (${updatedCount}개 품목, ${weekIds.join(', ')} 반영)`);
    } catch (err) {
      console.error('예정물량 업로드 오류:', err);
      showToast(err.message || '파일 파싱 중 오류가 발생했습니다.');
    }
  }

  // 기간별재고(W1.xls) 업로드 (5행 총출고수량->실출고, 총입고수량->입고비교)
  async function handlePlanWeeklyUpload(file) {
    if (!file || !window.XLSXEngine) return;
    try {
      const m = file.name.match(/W\s*(\d+)/i);
      let targetWeekId = m ? 'W' + Number(m[1]) : '';
      const pd = state.planData || getDefaultPlanData();
      if (!targetWeekId) {
        const ask = prompt('파일명에서 주차(W1, W01 등)를 찾을 수 없습니다. 적용할 주차를 입력하세요 (예: W1):', 'W1');
        if (!ask) return;
        targetWeekId = ask.trim().toUpperCase();
      }

      const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
      const rows = parsed?.data || [];
      if (!rows || rows.length < 5) {
        showToast('기간별재고 파일에서 데이터를 찾을 수 없습니다.');
        return;
      }

      let headerIdx = rows.findIndex((r, idx) => idx < 15 && Array.isArray(r) && r.some(c => String(c || '').trim() === '총출고수량' || String(c || '').trim() === '총입고수량'));
      if (headerIdx === -1) {
        headerIdx = rows.findIndex((r, idx) => idx < 15 && Array.isArray(r) && r.some(c => String(c || '').trim() === '품목' || String(c || '').trim() === '품목코드'));
      }
      if (headerIdx === -1) headerIdx = 4;

      const headerRow = (rows[headerIdx] || []).map(c => String(c || '').trim());
      const codeIdx = headerRow.findIndex(h => h === '품목' || h === '품목코드');
      const inIdx = headerRow.findIndex(h => h === '총입고수량');
      const outIdx = headerRow.findIndex(h => h === '총출고수량');

      if (codeIdx === -1 || (inIdx === -1 && outIdx === -1)) {
        showToast('5행에서 [품목], [총입고수량], [총출고수량] 컬럼을 찾을 수 없습니다.');
        return;
      }

      const agg = {};
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const code = String(rows[r][codeIdx] || '').trim();
        if (!code) continue;
        if (!agg[code]) agg[code] = { inQty: 0, outQty: 0 };
        if (inIdx !== -1) agg[code].inQty += parsePlanNum(rows[r][inIdx]);
        if (outIdx !== -1) agg[code].outQty += parsePlanNum(rows[r][outIdx]);
      }

      pushPlanUndoSnapshot();
      let updatedCount = 0;
      Object.keys(agg).forEach(code => {
        if (!pd.rowsByCode[code]) pd.rowsByCode[code] = { weeks: {}, colors: {}, memos: {} };
        if (!pd.rowsByCode[code].weeks) pd.rowsByCode[code].weeks = {};
        if (!pd.rowsByCode[code].weeks[targetWeekId]) pd.rowsByCode[code].weeks[targetWeekId] = {};
        if (outIdx !== -1) pd.rowsByCode[code].weeks[targetWeekId].actual = String(agg[code].outQty);
        if (inIdx !== -1) pd.rowsByCode[code].weeks[targetWeekId].compare = String(agg[code].inQty);
        updatedCount++;
      });

      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
      showToast(`${targetWeekId} 기간별재고 반영 완료 (${updatedCount}개 품목)`);
    } catch (err) {
      console.error('기간별재고 업로드 오류:', err);
      showToast(err.message || '파일 파싱 중 오류가 발생했습니다.');
    }
  }

  function exportPlanToExcel() {
    if (!window.XLSXEngine) return;
    const pd = state.planData || getDefaultPlanData();
    const { columns: cols, fixedCount, groupHeaders } = buildPlanColumnsAndGroups();
    const rows = getPlanComputedRows();

    const h1 = cols.slice(0, fixedCount).map(c => ({ text: c.label.replace(/<br>/g, ' ').replace(/<[^>]*>/g, ''), rowspan: 2, colspan: 1 }));
    groupHeaders.forEach(gh => {
      h1.push({ text: gh.label, rowspan: 1, colspan: gh.colspan });
    });
    const h2 = cols.slice(fixedCount).map(c => ({ text: c.label }));

    const exportRows = rows.map(row => cols.map(col => {
      const raw = getPlanCellRawValue(row, col);
      return col.isNum && raw !== '' && !isNaN(Number(String(raw).replace(/,/g, '')))
        ? Number(String(raw).replace(/,/g, ''))
        : raw;
    }));

    window.XLSXEngine.exportToExcelXML('생산계획', [h1, h2], exportRows, `생산계획_${pd.year}.xls`);
  }

  // 우클릭 5색 팔레트 제어
  function openPlanContextPalette(x, y) {
    const pal = document.getElementById('plan-context-palette');
    if (!pal) return;
    let left = x + 12; // 마우스 포인터 오른쪽에서 등장
    let top = y - 10;
    if (left + 205 > window.innerWidth) left = Math.max(10, x - 205);
    if (top + 290 > window.innerHeight) top = Math.max(10, window.innerHeight - 300);

    pal.style.left = `${left}px`;
    pal.style.top = `${top}px`;
    pal.classList.add('is-visible');
    pal.setAttribute('aria-hidden', 'false');
  }

  function closePlanContextPalette() {
    const pal = document.getElementById('plan-context-palette');
    if (pal) {
      pal.classList.remove('is-visible');
      pal.setAttribute('aria-hidden', 'true');
    }
  }

  function applyColorToSelectedCells(colorName) {
    const range = getPlanSelectedRange();
    if (!range) return;
    pushPlanUndoSnapshot();
    for (let r = range.r1; r <= range.r2; r++) {
      const row = planGridState.rows[r];
      if (!row) continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const col = planGridState.columns[c];
        if (col) setPlanCellColor(row.code, col.key, colorName);
      }
    }
    saveLocalPlanData();
    markAsDirty(true);
    renderPlanModule();

    // 주황색(기타) 선택 시 메모 입력 바로 유도
    if (colorName === 'orange') {
      promptMemoForActiveCell();
    }
  }

  function promptMemoForActiveCell() {
    const act = planGridState.anchor;
    if (!act) return;
    const row = planGridState.rows[act.r];
    const col = planGridState.columns[act.c];
    if (!row || !col) return;
    const existing = (row.memos && row.memos[col.key]) || '';
    const nextMemo = prompt(`[${row.code} · ${col.label.replace(/<[^>]*>/g, ' ')}] 메모 내용을 입력하세요:`, existing);
    if (nextMemo === null) return;
    pushPlanUndoSnapshot();
    setPlanCellMemo(row.code, col.key, nextMemo);
    saveLocalPlanData();
    markAsDirty(true);
    renderPlanModule();
  }

  function initPlanEventListeners() {
    const scrollWrap = document.getElementById('plan-grid-scroll-wrap');
    const tbody = document.getElementById('plan-grid-tbody');
    const thead = document.getElementById('plan-grid-thead');
    if (!scrollWrap || !tbody) return;

    // 툴바: 시작일자 & 기간(월 체크박스)
    enhanceSelectToCustomDropdown('plan-group-filter');

    document.getElementById('plan-start-date')?.addEventListener('change', (e) => {
      if (!state.planData) loadLocalPlanData();
      const val = e.target.value;
      if (!val) return;
      const newYear = val.slice(0, 4);
      const newMonth = Number(val.slice(5, 7)) || 1;
      if (newYear !== state.planData.year) {
        state.planData.year = newYear;
        state.planData.weeks = generateYearWeeks(newYear);
      }
      state.planData.startDate = val;
      state.planData.selectedMonths = [newMonth, Math.min(12, newMonth + 1), Math.min(12, newMonth + 2)].filter((v, i, a) => a.indexOf(v) === i);
      state.planData.startMonth = state.planData.selectedMonths[0];
      state.planData.endMonth = state.planData.selectedMonths[state.planData.selectedMonths.length - 1];
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    });

    // 기간(월) 체크박스 드롭다운
    const monthWrap = document.getElementById('plan-month-dropdown-wrap');
    document.getElementById('btn-plan-months')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.plan-dropdown-wrap').forEach(w => {
        if (w !== monthWrap) w.classList.remove('is-open');
      });
      monthWrap?.classList.toggle('is-open');
    });

    document.getElementById('plan-month-dropdown-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.getElementById('plan-months-checkbox-grid')?.addEventListener('change', () => {
      if (!state.planData) loadLocalPlanData();
      const checked = Array.from(document.querySelectorAll('#plan-months-checkbox-grid .plan-month-chk:checked'))
        .map(chk => Number(chk.value))
        .sort((a, b) => a - b);
      if (checked.length === 0) {
        showToast('최소 1개 이상의 월을 선택해야 합니다.');
        syncPlanToolbarControls();
        return;
      }
      state.planData.selectedMonths = checked;
      state.planData.startMonth = checked[0];
      state.planData.endMonth = checked[checked.length - 1];
      saveLocalPlanData();
      renderPlanModule();
    });

    document.getElementById('btn-plan-months-all')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      state.planData.selectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      state.planData.startMonth = 1;
      state.planData.endMonth = 12;
      saveLocalPlanData();
      renderPlanModule();
    });

    document.querySelectorAll('#plan-month-dropdown-menu [data-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!state.planData) loadLocalPlanData();
        const q = Number(btn.dataset.q);
        const start = (q - 1) * 3 + 1;
        state.planData.selectedMonths = [start, start + 1, start + 2];
        state.planData.startMonth = start;
        state.planData.endMonth = start + 2;
        saveLocalPlanData();
        renderPlanModule();
      });
    });

    document.getElementById('plan-group-filter')?.addEventListener('change', (e) => {
      state.planFilterGroup = e.target.value;
      planGridState.anchor = null;
      planGridState.focus = null;
      renderPlanModule();
    });

    document.getElementById('plan-search-input')?.addEventListener('input', (e) => {
      state.planSearchText = e.target.value;
      planGridState.anchor = null;
      planGridState.focus = null;
      renderPlanModule();
    });

    // 월 / 주차 / 전체 세그먼트
    document.querySelectorAll('.plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!state.planData) loadLocalPlanData();
        state.planData.viewMode = btn.dataset.view;
        planGridState.anchor = null;
        planGridState.focus = null;
        saveLocalPlanData();
        renderPlanModule();
      });
    });

    // 드롭다운 토글 (표시옵션 / 파일·주차)
    const setupDropdown = (wrapId, btnId) => {
      const wrap = document.getElementById(wrapId);
      const btn = document.getElementById(btnId);
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.plan-dropdown-wrap').forEach(w => {
          if (w !== wrap) w.classList.remove('is-open');
        });
        wrap?.classList.toggle('is-open');
      });
    };
    setupDropdown('plan-item-group-dropdown-wrap', 'btn-plan-item-groups');
    setupDropdown('plan-opt-dropdown-wrap', 'btn-plan-options');
    setupDropdown('plan-io-dropdown-wrap', 'btn-plan-io-menu');

    // 품목그룹 ON/OFF 체크박스 및 전체 ON/OFF
    document.getElementById('plan-item-group-checklist')?.addEventListener('change', (e) => {
      const chk = e.target.closest('.chk-plan-item-group');
      if (!chk) return;
      const gName = chk.value;
      const cur = new Set(state.planData.mergedItemGroups || []);
      if (chk.checked) cur.add(gName);
      else cur.delete(gName);
      state.planData.mergedItemGroups = Array.from(cur);
      planGridState.anchor = null;
      planGridState.focus = null;
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    });

    document.getElementById('btn-plan-ig-all-on')?.addEventListener('click', () => {
      const allGroups = Array.from(document.querySelectorAll('#plan-item-group-checklist .chk-plan-item-group')).map(c => c.value);
      state.planData.mergedItemGroups = allGroups;
      planGridState.anchor = null;
      planGridState.focus = null;
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    });

    document.getElementById('btn-plan-ig-all-off')?.addEventListener('click', () => {
      state.planData.mergedItemGroups = [];
      planGridState.anchor = null;
      planGridState.focus = null;
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    });

    // 품목그룹 순서 변경 (▲/▼ 버튼 & 드래그 앤 드롭)
    const igChecklistEl = document.getElementById('plan-item-group-checklist');
    if (igChecklistEl) {
      const applyItemGroupOrder = (newOrder) => {
        state.planData.itemGroupOrder = newOrder;
        planGridState.anchor = null;
        planGridState.focus = null;
        saveLocalPlanData();
        markAsDirty(true);
        renderPlanModule();
      };

      igChecklistEl.addEventListener('click', (e) => {
        const moveBtn = e.target.closest('.plan-ig-move-btn');
        if (!moveBtn) return;
        e.stopPropagation();
        const gName = moveBtn.dataset.group;
        const dir = moveBtn.dataset.dir;
        const { orderedGroups } = getOrderedPlanItemGroups();
        const idx = orderedGroups.indexOf(gName);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= orderedGroups.length) return;
        const next = [...orderedGroups];
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        applyItemGroupOrder(next);
      });

      let draggedGroup = null;
      igChecklistEl.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.plan-ig-row');
        if (!row) return;
        draggedGroup = row.dataset.group;
        row.classList.add('is-dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      igChecklistEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const row = e.target.closest('.plan-ig-row');
        igChecklistEl.querySelectorAll('.plan-ig-row').forEach(r => r.classList.remove('is-drag-over'));
        if (row && row.dataset.group !== draggedGroup) row.classList.add('is-drag-over');
      });
      igChecklistEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetRow = e.target.closest('.plan-ig-row');
        igChecklistEl.querySelectorAll('.plan-ig-row').forEach(r => r.classList.remove('is-drag-over', 'is-dragging'));
        if (!targetRow || !draggedGroup || targetRow.dataset.group === draggedGroup) return;
        const { orderedGroups } = getOrderedPlanItemGroups();
        const fromIdx = orderedGroups.indexOf(draggedGroup);
        const toIdx = orderedGroups.indexOf(targetRow.dataset.group);
        if (fromIdx === -1 || toIdx === -1) return;
        const next = [...orderedGroups];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        draggedGroup = null;
        applyItemGroupOrder(next);
      });
      igChecklistEl.addEventListener('dragend', () => {
        draggedGroup = null;
        igChecklistEl.querySelectorAll('.plan-ig-row').forEach(r => r.classList.remove('is-drag-over', 'is-dragging'));
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.plan-dropdown-wrap')) {
        document.querySelectorAll('.plan-dropdown-wrap').forEach(w => w.classList.remove('is-open'));
      }
      if (!e.target.closest('#plan-context-palette')) {
        closePlanContextPalette();
      }
    });

    // 표시 옵션 체크박스
    document.getElementById('chk-plan-hide-spec')?.addEventListener('change', (e) => {
      state.planData.hideSpecCols = e.target.checked;
      saveLocalPlanData();
      renderPlanModule();
    });
    document.getElementById('chk-plan-hide-compare')?.addEventListener('change', (e) => {
      state.planData.hideCompareCols = e.target.checked;
      saveLocalPlanData();
      renderPlanModule();
    });
    document.getElementById('chk-plan-shortage-only')?.addEventListener('change', (e) => {
      state.planData.shortageOnly = e.target.checked;
      planGridState.anchor = null;
      planGridState.focus = null;
      saveLocalPlanData();
      renderPlanModule();
    });
    document.getElementById('chk-plan-auto-green')?.addEventListener('change', (e) => {
      state.planData.autoGreenOnMove = e.target.checked;
      saveLocalPlanData();
    });

    // 색상 범례 필터
    document.getElementById('plan-legend-filters')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.plan-legend-chip');
      if (!chip) return;
      state.planData.colorFilter = chip.dataset.color || 'ALL';
      planGridState.anchor = null;
      planGridState.focus = null;
      renderPlanModule();
    });

    document.getElementById('btn-plan-undo')?.addEventListener('click', undoPlanAction);

    document.getElementById('btn-plan-add-week')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      const nextNum = state.planData.weeks.length + 1;
      const newId = `W${nextNum}`;
      const label = prompt('추가할 주차 헤더명을 입력하세요:', `[${newId}] 신규주차`);
      if (label === null) return;
      state.planData.weeks.push({ id: newId, weekNum: nextNum, month: state.planData.endMonth || 12, label: label.trim() || `[${newId}]` });
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    });

    // 주차 헤더 클릭 시 이름 수정
    thead?.addEventListener('click', (e) => {
      const th = e.target.closest('.plan-week-header-cell');
      if (!th) return;
      const weekId = th.dataset.weekId;
      const week = (state.planData?.weeks || []).find(w => w.id === weekId);
      if (!week) return;
      const nextLabel = prompt(`${weekId} 주차 헤더명을 수정하세요:`, week.label);
      if (nextLabel !== null && nextLabel.trim() !== '') {
        week.label = nextLabel.trim();
        saveLocalPlanData();
        markAsDirty(true);
        renderPlanModule();
      }
    });

    // 파일 업로드 / 다운로드 / 저장
    const forecastInput = document.getElementById('input-plan-forecast-file');
    document.getElementById('btn-plan-upload-forecast')?.addEventListener('click', () => forecastInput?.click());
    forecastInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) await handlePlanForecastUpload(file);
      e.target.value = '';
    });

    const weeklyInput = document.getElementById('input-plan-weekly-file');
    document.getElementById('btn-plan-upload-weekly')?.addEventListener('click', () => weeklyInput?.click());
    weeklyInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) await handlePlanWeeklyUpload(file);
      e.target.value = '';
    });

    document.getElementById('btn-plan-export-xls')?.addEventListener('click', exportPlanToExcel);
    document.getElementById('btn-plan-save')?.addEventListener('click', savePlanToDb);

    // 우클릭 팔레트 & 메모 이벤트
    tbody.addEventListener('contextmenu', (e) => {
      const td = e.target.closest('td[data-r][data-c]');
      if (!td) return;
      e.preventDefault();
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const range = getPlanSelectedRange();
      const inRange = range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
      if (!inRange) {
        planGridState.anchor = { r, c };
        planGridState.focus = { r, c };
        applyPlanSelectionClasses();
      }
      openPlanContextPalette(e.clientX, e.clientY);
    });

    document.querySelectorAll('#plan-context-palette .plan-color-item').forEach(btn => {
      btn.addEventListener('click', () => {
        closePlanContextPalette();
        applyColorToSelectedCells(btn.dataset.color);
      });
    });

    document.getElementById('btn-plan-ctx-clear-color')?.addEventListener('click', () => {
      closePlanContextPalette();
      applyColorToSelectedCells('');
    });

    document.getElementById('btn-plan-ctx-memo')?.addEventListener('click', () => {
      closePlanContextPalette();
      promptMemoForActiveCell();
    });

    document.getElementById('btn-plan-ctx-del-memo')?.addEventListener('click', () => {
      closePlanContextPalette();
      const act = planGridState.anchor;
      if (!act) return;
      const row = planGridState.rows[act.r];
      const col = planGridState.columns[act.c];
      if (!row || !col) return;
      pushPlanUndoSnapshot();
      setPlanCellMemo(row.code, col.key, '');
      saveLocalPlanData();
      markAsDirty(true);
      renderPlanModule();
    });

    // 우클릭 -> [검정 신청으로 보내기] (선택 범위의 생산 셀 이관)
    document.getElementById('btn-plan-ctx-send-cert')?.addEventListener('click', async () => {
      closePlanContextPalette();
      const range = getPlanSelectedRange();
      if (!range) return;

      const pd = state.planData || getDefaultPlanData();
      const regMap = getCertRegisteredQtyMap();
      const todayStr = getTodayDateString();
      const masterByCode = new Map((state.certMasterItems || []).map(i => [i.code, i]));

      const outgoing = [];
      for (let r = range.r1; r <= range.r2; r++) {
        const rowObj = planGridState.rows[r];
        if (!rowObj) continue;
        const masterItem = masterByCode.get(rowObj.code);
        if (!masterItem || (masterItem.inspectType || '') === '-') continue;

        for (let c = range.c1; c <= range.c2; c++) {
          const col = planGridState.columns[c];
          if (!col || !col.weekId || col.field !== 'prod' || col.isMonth) continue;
          const planQty = parsePlanNum(getPlanCellRawValue(rowObj, col));
          if (planQty <= 0) continue;
          const regQty = regMap[`${rowObj.code}__${col.weekId}`] || 0;
          const remaining = planQty - regQty;
          if (remaining <= 0) continue;

          const dates = getPlanWeekFridayDates(pd.year, col.weekId);
          outgoing.push(buildDraftRowFromMasterAndPlan(masterItem, remaining, col.weekId, dates, todayStr));
        }
      }

      if (outgoing.length === 0) {
        alert('선택한 범위에 검정 신청할 수 있는 생산 수량(미신청 잔여량 > 0)이 없습니다.');
        return;
      }

      state.certMode = 'auto';
      state.certDraftRows = outgoing;
      saveLocalCertData();
      await activateTab('tab-certification');
      showToast(`선택한 ${outgoing.length}건이 검정 신청 등록으로 전달되었습니다.`);
    });

    document.getElementById('btn-plan-memo-edit')?.addEventListener('click', promptMemoForActiveCell);
    document.getElementById('btn-plan-memo-close')?.addEventListener('click', hidePlanMemoPopover);

    // 마우스 선택, 범위 드래그 & ALT + 드래그 주차 이동
    tbody.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      closePlanContextPalette();
      const td = e.target.closest('td[data-r][data-c]');
      if (!td) return;
      if (planGridState.editing) {
        if (planGridState.editing.inputEl === e.target) return;
        commitPlanCellEdit(true);
      }

      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const col = planGridState.columns[c];
      const row = planGridState.rows[r];

      // ALT + 드래그: 같은 행 내 생산 셀 주차 이동 시작
      if (e.altKey && col && col.weekId && col.field === 'prod' && col.editable && row) {
        e.preventDefault();
        planGridState.anchor = { r, c };
        planGridState.focus = { r, c };
        planGridState.altDrag = { r, fromColIdx: c, weekId: col.weekId, code: row.code };
        td.classList.add('plan-drag-source');
        applyPlanSelectionClasses();
        return;
      }

      if (e.shiftKey && planGridState.anchor) {
        planGridState.focus = { r, c };
      } else {
        planGridState.anchor = { r, c };
        planGridState.focus = { r, c };
        planGridState.isDragging = true;
      }

      applyPlanSelectionClasses();
      scrollWrap.focus({ preventScroll: true });
    });

    tbody.addEventListener('mouseover', (e) => {
      const td = e.target.closest('td[data-r][data-c]');
      if (!td) return;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);

      if (planGridState.altDrag) {
        tbody.querySelectorAll('td.plan-drag-target').forEach(el => el.classList.remove('plan-drag-target'));
        const col = planGridState.columns[c];
        if (r === planGridState.altDrag.r && c !== planGridState.altDrag.fromColIdx && col && col.weekId && col.field === 'prod' && col.editable) {
          td.classList.add('plan-drag-target');
        }
        return;
      }

      if (!planGridState.isDragging) return;
      if (!planGridState.focus || planGridState.focus.r !== r || planGridState.focus.c !== c) {
        planGridState.focus = { r, c };
        applyPlanSelectionClasses();
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (planGridState.altDrag) {
        const drag = planGridState.altDrag;
        planGridState.altDrag = null;
        tbody.querySelectorAll('td.plan-drag-source, td.plan-drag-target').forEach(el => {
          el.classList.remove('plan-drag-source', 'plan-drag-target');
        });

        const td = e.target.closest('td[data-r][data-c]');
        if (td) {
          const r = Number(td.dataset.r);
          const c = Number(td.dataset.c);
          const targetCol = planGridState.columns[c];
          if (r === drag.r && c !== drag.fromColIdx && targetCol && targetCol.weekId && targetCol.field === 'prod' && targetCol.editable) {
            const srcCol = planGridState.columns[drag.fromColIdx];
            const rowObj = planGridState.rows[r];
            const srcVal = getPlanCellRawValue(rowObj, srcCol);
            if (srcVal !== '' && srcVal !== null && srcVal !== undefined) {
              pushPlanUndoSnapshot();
              setPlanCellValue(drag.code, targetCol, srcVal);
              setPlanCellValue(drag.code, srcCol, '');
              // 메모도 함께 이동
              const srcMemo = rowObj.memos ? rowObj.memos[srcCol.key] : '';
              if (srcMemo) {
                setPlanCellMemo(drag.code, targetCol.key, srcMemo);
                setPlanCellMemo(drag.code, srcCol.key, '');
              }
              if (state.planData?.autoGreenOnMove) {
                setPlanCellColor(drag.code, targetCol.key, 'green');
                setPlanCellColor(drag.code, srcCol.key, '');
              }
              planGridState.anchor = { r, c };
              planGridState.focus = { r, c };
              saveLocalPlanData();
              markAsDirty(true);
              renderPlanModule();
              showToast(`${drag.weekId} → ${targetCol.weekId} 주차 이동 완료`);
            }
          }
        }
      }
      planGridState.isDragging = false;
    });

    tbody.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td[data-r][data-c]');
      if (!td) return;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      startPlanCellEdit(r, c, undefined, false);
    });

    // 키보드 네비게이션, Ctrl+Z, Tab(생산 셀만), Enter(아래) & 직접 입력
    scrollWrap.addEventListener('keydown', (e) => {
      if (planGridState.editing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoPlanAction();
        return;
      }

      if (!planGridState.anchor) {
        if (planGridState.rows.length > 0 && planGridState.columns.length > 0) {
          planGridState.anchor = { r: 0, c: 0 };
          planGridState.focus = { r: 0, c: 0 };
          applyPlanSelectionClasses();
        } else {
          return;
        }
      }

      const maxR = planGridState.rows.length - 1;
      const maxC = planGridState.columns.length - 1;
      const cur = planGridState.focus || planGridState.anchor;

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        let nr = cur.r;
        let nc = cur.c;
        if (e.key === 'ArrowUp') nr = Math.max(0, nr - 1);
        if (e.key === 'ArrowDown') nr = Math.min(maxR, nr + 1);
        if (e.key === 'ArrowLeft') nc = Math.max(0, nc - 1);
        if (e.key === 'ArrowRight') nc = Math.min(maxC, nc + 1);

        if (e.shiftKey) {
          planGridState.focus = { r: nr, c: nc };
        } else {
          planGridState.anchor = { r: nr, c: nc };
          planGridState.focus = { r: nr, c: nc };
        }
        applyPlanSelectionClasses();
        scrollPlanCellIntoView(nr, nc);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const next = findNextEditableCell(planGridState.anchor.r, planGridState.anchor.c, e.shiftKey);
        if (next) {
          planGridState.anchor = next;
          planGridState.focus = next;
          applyPlanSelectionClasses();
          scrollPlanCellIntoView(next.r, next.c);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const nr = Math.max(0, Math.min(maxR, planGridState.anchor.r + (e.shiftKey ? -1 : 1)));
        const nc = planGridState.anchor.c;
        planGridState.anchor = { r: nr, c: nc };
        planGridState.focus = { r: nr, c: nc };
        applyPlanSelectionClasses();
        scrollPlanCellIntoView(nr, nc);
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        startPlanCellEdit(planGridState.anchor.r, planGridState.anchor.c, undefined, false);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        clearPlanSelectedCells();
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Process')) {
        const col = planGridState.columns[planGridState.anchor.c];
        if (col && col.editable) {
          if (e.key !== 'Process') {
            e.preventDefault();
            startPlanCellEdit(planGridState.anchor.r, planGridState.anchor.c, e.key, true);
          } else {
            startPlanCellEdit(planGridState.anchor.r, planGridState.anchor.c, '', true);
          }
        }
      }
    });

    scrollWrap.addEventListener('copy', (e) => {
      if (planGridState.editing) return;
      e.preventDefault();
      copyPlanSelectionToClipboard(e.clipboardData);
    });

    scrollWrap.addEventListener('paste', (e) => {
      if (planGridState.editing) return;
      e.preventDefault();
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : planGridState.lastCopiedTSV;
      pasteTSVToPlanGrid(text);
    });
  }

  // =========================================================================
  // 14-C. 일정계획 v2 (1품목 1행, 공정 다중 선택, ■/◧/□) & 생산일보 v2 & 월별 ST 공수집계
  // =========================================================================
  const INSP_LINES = ['감지기반', '유도등반', '수신기반'];
  const PROC_LABELS = { assembly: '조립', inspect: '검사', pack: '포장' };
  const PROC_SHORT = { assembly: '조', inspect: '검', pack: '포' };

  function loadLocalInspectionV2(weekDate) {
    if (!weekDate) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INSP_V2_PREFIX + weekDate);
      if (raw) {
        const p = JSON.parse(raw);
        state.inspV2Data = {
          startDate: p.startDate || addDaysStr(weekDate, -6),
          dayCount: Number(p.dayCount) || 10,
          items: p.items || {}
        };
        return;
      }
    } catch (e) { /* ignore */ }
    state.inspV2Data = { startDate: addDaysStr(weekDate, -6), dayCount: 10, items: {} };
  }

  function saveLocalInspectionV2() {
    if (!state.inspectionTargetDate || !state.inspV2Data) return;
    localStorage.setItem(STORAGE_KEYS.INSP_V2_PREFIX + state.inspectionTargetDate, JSON.stringify({
      ...state.inspV2Data,
      updatedAt: Date.now()
    }));
  }

  async function loadInspectionV2FromDb(weekDate) {
    if (!weekDate) return;
    loadLocalInspectionV2(weekDate);
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_insp_v2').doc(weekDate).get();
      if (doc.exists) {
        const d = doc.data();
        state.inspV2Data = {
          startDate: d.startDate || state.inspV2Data.startDate,
          dayCount: Number(d.dayCount) || 10,
          items: d.items || {}
        };
        saveLocalInspectionV2();
      }
    } catch (e) {
      console.warn('일정계획 v2 로드 실패:', e);
    }
  }

  async function saveInspectionV2ToDb() {
    const weekDate = state.inspectionTargetDate;
    if (!weekDate) return;
    saveLocalInspectionV2();
    if (isFirestoreActive && db) {
      await db.collection('pms_insp_v2').doc(weekDate).set({
        weekDate,
        startDate: state.inspV2Data.startDate,
        dayCount: state.inspV2Data.dayCount,
        items: state.inspV2Data.items,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    markAsDirty(false);
    showToast(`${weekDate} 일정계획이 저장되었습니다.`);
    renderSidebarSchedulesV2();
  }

  // 생산일보 v2 데이터 로드/저장
  function normalizeDailyV2(p) {
    const defSup = { '감지기반': [], '유도등반': [], '수신기반': [] };
    if (!p || typeof p !== 'object') return { supportByLine: defSup, entries: [] };
    const sbl = p.supportByLine && typeof p.supportByLine === 'object' ? p.supportByLine : {};
    return {
      supportByLine: {
        '감지기반': Array.isArray(sbl['감지기반']) ? sbl['감지기반'] : [],
        '유도등반': Array.isArray(sbl['유도등반']) ? sbl['유도등반'] : [],
        '수신기반': Array.isArray(sbl['수신기반']) ? sbl['수신기반'] : []
      },
      entries: Array.isArray(p.entries) ? p.entries : []
    };
  }

  function loadLocalDailyV2(dateStr) {
    if (!dateStr) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DAILY_V2_PREFIX + dateStr);
      if (raw) {
        state.dailyV2Data = normalizeDailyV2(JSON.parse(raw));
        return;
      }
    } catch (e) { /* ignore */ }
    state.dailyV2Data = normalizeDailyV2(null);
  }

  function saveLocalDailyV2() {
    if (!state.productionDate || !state.dailyV2Data) return;
    localStorage.setItem(STORAGE_KEYS.DAILY_V2_PREFIX + state.productionDate, JSON.stringify({
      ...state.dailyV2Data,
      date: state.productionDate,
      updatedAt: Date.now()
    }));
  }

  async function loadDailyV2FromDb(dateStr) {
    if (!dateStr) return;
    loadLocalDailyV2(dateStr);
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_daily_v2').doc(dateStr).get();
      if (doc.exists) {
        state.dailyV2Data = normalizeDailyV2(doc.data());
        saveLocalDailyV2();
      }
    } catch (e) {
      console.warn('생산일보 v2 로드 실패:', e);
    }
  }

  async function saveDailyV2ToDb() {
    const dateStr = state.productionDate;
    if (!dateStr) return;
    saveLocalDailyV2();
    if (isFirestoreActive && db) {
      await db.collection('pms_daily_v2').doc(dateStr).set({
        date: dateStr,
        supportByLine: state.dailyV2Data.supportByLine || {},
        entries: state.dailyV2Data.entries || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    markAsDirty(false);
    showToast(`${dateStr} 생산일보가 저장되었습니다.`);
  }

  // 모든 저장된 생산일보(로컬)에서 certRowId별 공정 완료 수량 집계
  function aggregateCompletedByCertRow() {
    const map = {}; // certRowId -> { assembly, inspect, pack }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.DAILY_V2_PREFIX)) continue;
      try {
        const d = JSON.parse(localStorage.getItem(k));
        (d.entries || []).forEach(ent => {
          if (!ent.certRowId) return;
          if (!map[ent.certRowId]) map[ent.certRowId] = { assembly: 0, inspect: 0, pack: 0 };
          const qty = parseSafeInt(ent.actualQty);
          if (qty <= 0) return;
          (ent.procs || []).forEach(p => {
            if (map[ent.certRowId][p] !== undefined) {
              map[ent.certRowId][p] += qty;
            }
          });
        });
      } catch (e) { /* ignore */ }
    }
    return map;
  }

  // 좌측 사이드바: 검정현황의 생산주차 통합 목록
  function renderSidebarSchedulesV2() {
    const listContainer = document.getElementById('inspection-schedule-list');
    const countBadge = document.getElementById('insp-schedule-count');
    const yearSelect = document.getElementById('filter-insp-year');
    const monthSelect = document.getElementById('filter-insp-month');
    if (!listContainer) return;

    const weekMap = new Map(); // weekDate -> { weekDate, counts: { 감지기반, 유도등반, 수신기반 } }
    (state.certSavedRows || []).forEach(r => {
      const wd = String(r.weekDate || '').trim();
      if (!wd) return;
      if (!weekMap.has(wd)) weekMap.set(wd, { weekDate: wd, counts: { '감지기반': 0, '유도등반': 0, '수신기반': 0 } });
      const g = (r.group || '').trim();
      if (weekMap.get(wd).counts[g] !== undefined) weekMap.get(wd).counts[g]++;
    });

    const allWeeks = Array.from(weekMap.values()).sort((a, b) => b.weekDate.localeCompare(a.weekDate));
    if (countBadge) countBadge.textContent = `${allWeeks.length}개`;

    // 만약 현재 targetDate가 목록에 없고 목록이 비어있지 않으면 첫 번째 주차 자동 선택
    if (allWeeks.length > 0 && !weekMap.has(state.inspectionTargetDate)) {
      state.inspectionTargetDate = allWeeks[0].weekDate;
      loadLocalInspectionV2(state.inspectionTargetDate);
    }

    if (yearSelect) {
      const years = Array.from(new Set(allWeeks.map(w => w.weekDate.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
      const prevY = state.sidebarYearFilter || 'ALL';
      yearSelect.innerHTML = '<option value="ALL">전체 연도</option>';
      years.forEach(y => yearSelect.add(new Option(`${y}년`, y)));
      yearSelect.value = years.includes(prevY) ? prevY : 'ALL';
    }

    const fYear = state.sidebarYearFilter || 'ALL';
    const fMonth = state.sidebarMonthFilter || 'ALL';
    const filtered = allWeeks.filter(w => {
      if (fYear !== 'ALL' && !w.weekDate.startsWith(fYear)) return false;
      if (fMonth !== 'ALL' && Number(w.weekDate.slice(5, 7)) !== Number(fMonth)) return false;
      return true;
    });

    listContainer.innerHTML = '';
    if (filtered.length === 0) {
      listContainer.innerHTML = '<div class="schedule-empty-msg">검정현황에 등록된 생산주차가 없습니다.</div>';
      return;
    }

    filtered.forEach(w => {
      const isActive = w.weekDate === state.inspectionTargetDate;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `schedule-item-btn ${isActive ? 'active' : ''}`;
      btn.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <span class="font-bold">${w.weekDate}</span>
          <span style="font-size:10.5px; color:#64748b;">감${w.counts['감지기반']} · 유${w.counts['유도등반']} · 수${w.counts['수신기반']}</span>
        </div>
      `;
      btn.addEventListener('click', async () => {
        state.inspectionTargetDate = w.weekDate;
        await loadInspectionV2FromDb(w.weekDate);
        renderSidebarSchedulesV2();
        renderInspectionV2();
      });
      listContainer.appendChild(btn);
    });
  }

  function formatInspDateCellContent(planObj) {
    if (!planObj) return '';
    const a = parseSafeInt(planObj.assembly);
    const i = parseSafeInt(planObj.inspect);
    const p = parseSafeInt(planObj.pack);
    if (a <= 0 && i <= 0 && p <= 0) return '';

    // 같은 수량끼리 묶어서 간결하게 표시 (예: 조·검 30, 포 20)
    const groups = new Map(); // qty -> [procShorts]
    [['assembly', a], ['inspect', i], ['pack', p]].forEach(([k, v]) => {
      if (v > 0) {
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push(PROC_SHORT[k]);
      }
    });

    let html = '';
    groups.forEach((shorts, qty) => {
      html += `<div class="insp-date-tag"><span class="insp-date-tag-badge">${shorts.join('·')}</span>${qty.toLocaleString()}</div>`;
    });
    return html;
  }

  function getLineSubProcesses(lineName) {
    const mode = (state.lineProcConfig && state.lineProcConfig[lineName]) || 'split3';
    if (mode === 'a_ip') {
      return [
        { key: 'a', label: '조립', procs: ['assembly'] },
        { key: 'ip', label: '검사+포장', procs: ['inspect', 'pack'] }
      ];
    }
    if (mode === 'ai_p') {
      return [
        { key: 'ai', label: '조립+검사', procs: ['assembly', 'inspect'] },
        { key: 'p', label: '포장', procs: ['pack'] }
      ];
    }
    if (mode === 'inline1') {
      return [
        { key: 'all', label: '조립+검사+포장', procs: ['assembly', 'inspect', 'pack'] }
      ];
    }
    return [
      { key: 'a', label: '조립', procs: ['assembly'] },
      { key: 'i', label: '검사', procs: ['inspect'] },
      { key: 'p', label: '포장', procs: ['pack'] }
    ];
  }

  function renderInspectionV2() {
    const container = document.getElementById('insp-line-tables-container');
    if (!container) return;

    const targetDate = state.inspectionTargetDate;
    if (!state.inspV2Data || !state.inspV2Data.startDate) {
      loadLocalInspectionV2(targetDate);
    }

    const tInput = document.getElementById('inspection-target-date');
    if (tInput) tInput.value = targetDate || '';
    const sInput = document.getElementById('inspection-date');
    if (sInput) sInput.value = state.inspV2Data.startDate || getTodayDateString();

    document.querySelectorAll('#insp-line-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === (state.inspLineFilter || 'ALL'));
    });

    const subDayBtn = document.getElementById('btn-insp-sub-day');
    if (subDayBtn) subDayBtn.style.display = (state.inspV2Data.dayCount || 10) > 10 ? 'inline-flex' : 'none';

    const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
    const completedMap = aggregateCompletedByCertRow();
    const certRowsForWeek = (state.certSavedRows || []).filter(r => r.weekDate === targetDate);

    const dayCount = state.inspV2Data.dayCount || 10;
    const baseDate = state.inspV2Data.startDate || getTodayDateString();
    const dateCols = [];
    for (let d = 0; d < dayCount; d++) {
      const ds = addDaysStr(baseDate, d);
      const dt = new Date(ds + 'T00:00:00');
      const dow = dt.getDay();
      const mm = dt.getMonth() + 1;
      const dd = dt.getDate();
      const krHol = KR_HOLIDAYS[ds] || '';
      const compHol = (state.attendanceHolidays && state.attendanceHolidays[ds]) || '';
      const isWeekend = dow === 0 || dow === 6;
      const isOffDay = isWeekend || !!krHol || !!compHol;
      dateCols.push({ dateStr: ds, label: `${mm}/${dd}`, isWeekend, isOffDay, offReason: krHol || compHol, dow });
    }

    const visibleLines = (state.inspLineFilter && state.inspLineFilter !== 'ALL')
      ? [state.inspLineFilter]
      : INSP_LINES;

    container.innerHTML = '';

    visibleLines.forEach(lineName => {
      const lineRows = certRowsForWeek.filter(r => (r.group || '').trim() === lineName);
      const card = document.createElement('div');
      card.className = 'table-section-card';

      let sumTarget = 0, sumCompleted = 0, sumBalance = 0;
      const dailyQtySums = new Array(dayCount).fill(0);
      const dailyStSeconds = new Array(dayCount).fill(0);

      let tbodyHtml = '';
      if (lineRows.length === 0) {
        tbodyHtml = `<tr><td colspan="${8 + dayCount}" style="text-align:center; padding: 20px; color:#94a3b8;">해당 생산주차(${targetDate || '-'})에 등록된 [${lineName}] 검정 내역이 없습니다.</td></tr>`;
      } else {
        const procDefs = [
          { key: 'assembly', label: '조립', cls: 'is-assembly', stField: 'stAssembly' },
          { key: 'inspect', label: '검사', cls: 'is-inspect', stField: 'stInspect' },
          { key: 'pack', label: '포장', cls: 'is-pack', stField: 'stPack' }
        ];

        lineRows.forEach((cRow, idx) => {
          const itemState = (state.inspV2Data.items && state.inspV2Data.items[cRow.id]) || { dailyPlans: {}, excludedProcs: {} };
          const excl = itemState.excludedProcs || {};
          const dailyPlans = itemState.dailyPlans || {};
          const targetQty = parseSafeInt(cRow.qty);
          const comp = completedMap[cRow.id] || { assembly: 0, inspect: 0, pack: 0 };

          const activeVals = [];
          ['assembly', 'inspect', 'pack'].forEach(p => {
            if (!excl[p]) activeVals.push(comp[p] || 0);
          });
          const completedQty = activeVals.length > 0 ? Math.min(...activeVals) : 0;
          const balanceQty = Math.max(0, targetQty - completedQty);

          sumTarget += targetQty;
          sumCompleted += completedQty;
          sumBalance += balanceQty;

          const mItem = masterMap.get(cRow.code) || {};
          const stMap = {
            assembly: parseSafeInt(mItem.stAssembly),
            inspect: parseSafeInt(mItem.stInspect),
            pack: parseSafeInt(mItem.stPack)
          };

          // 전체 일자에 입력된 공정별 계획 합계 계산
          const allDateKeys = Object.keys(dailyPlans);

          procDefs.forEach((pd, pIdx) => {
            const isExcl = !!excl[pd.key];
            const isLastProc = pIdx === procDefs.length - 1;
            const rowCls = isLastProc ? 'insp-block-end' : '';

            let plannedSum = 0;
            allDateKeys.forEach(dk => {
              if (dailyPlans[dk] && dailyPlans[dk][pd.key]) {
                plannedSum += parseSafeInt(dailyPlans[dk][pd.key]);
              }
            });
            const remainPlan = targetQty - plannedSum;
            const compProcQty = comp[pd.key] || 0;

            let remainHtml = '<span style="color:#94a3b8;">-</span>';
            if (!isExcl) {
              if (remainPlan === 0 && targetQty > 0) {
                remainHtml = `<span class="insp-remain-red">0 (완료)</span>`;
              } else {
                remainHtml = `<span class="insp-remain-red">${remainPlan.toLocaleString()}</span>`;
              }
            }

            const badgeHtml = `<button type="button" tabindex="-1" class="insp-proc-badge ${isExcl ? 'is-excluded' : pd.cls}" data-row-id="${cRow.id}" data-proc="${pd.key}" title="${isExcl ? '제외됨 (클릭 시 포함)' : '클릭 시 해당 공정 제외'}">${pd.label}</button>`;

            let dateCellsHtml = '';
            dateCols.forEach((dc, dIdx) => {
              if (dc.isOffDay) {
                dateCellsHtml += `<td class="weekend-cell" style="background:${dc.offReason ? '#fef2f2' : '#f8fafc'};" title="${dc.offReason || '주말'}"></td>`;
              } else if (isExcl) {
                dateCellsHtml += `<td style="background:#f8fafc; color:#cbd5e1; text-align:center;">-</td>`;
              } else {
                const pObj = dailyPlans[dc.dateStr];
                const val = pObj ? parseSafeInt(pObj[pd.key]) : 0;
                if (val > 0) {
                  if (pd.key === 'assembly') dailyQtySums[dIdx] += val;
                  dailyStSeconds[dIdx] += (val * stMap[pd.key]);
                }
                dateCellsHtml += `<td class="insp-v2-date-cell"><input type="number" min="0" class="insp-inline-num insp-v2-date-input" data-row-id="${cRow.id}" data-date="${dc.dateStr}" data-proc="${pd.key}" data-line="${lineName}" data-target="${targetQty}" value="${val > 0 ? val : ''}"></td>`;
              }
            });

            const dispName = getDisplayItemName(mItem) || cRow.name || '-';
            const mergedCols = pIdx === 0 ? `
              <td rowspan="3" class="insp-merged-cell text-center" style="color:#64748b; font-weight:600;">${idx + 1}</td>
              <td rowspan="3" class="insp-merged-cell insp-name-cell font-bold text-slate-800" title="${dispName}">${dispName}</td>
              <td rowspan="3" class="insp-merged-cell text-center" style="font-family:'JetBrains Mono',monospace;">${cRow.lotNo || '-'}</td>
              <td rowspan="3" class="insp-merged-cell num-cell text-center font-bold" style="color:#0f172a;">${targetQty.toLocaleString()}</td>
            ` : '';

            tbodyHtml += `
              <tr class="${rowCls}">
                ${mergedCols}
                <td class="text-center">${badgeHtml}</td>
                <td class="num-cell text-center insp-qty-blue" data-prod-sum="${cRow.id}__${pd.key}">${!isExcl && plannedSum > 0 ? plannedSum.toLocaleString() : '-'}</td>
                <td class="num-cell text-center insp-remain-red" data-remain="${cRow.id}__${pd.key}">${remainHtml}</td>
                <td class="num-cell text-center text-primary font-bold">${!isExcl && compProcQty > 0 ? compProcQty.toLocaleString() : ''}</td>
                ${dateCellsHtml}
              </tr>
            `;
          });
        });
      }

      const dateThs = dateCols.map(dc => {
        const cls = (dc.dow === 0 || dc.offReason) ? 'text-danger' : (dc.dow === 6 ? 'text-primary' : '');
        const subTag = dc.offReason ? `<div style="font-size:9px; font-weight:700; color:#dc2626; line-height:1.1;">${dc.offReason}</div>` : '';
        return `<th class="insp-date-th ${cls}" style="width: 64px; text-align:center;" title="${dc.offReason || ''}">${dc.label}${subTag}</th>`;
      }).join('');

      const tfootDateTds = dateCols.map((dc, dIdx) => {
        if (dc.isOffDay) return `<td style="background:${dc.offReason ? '#fef2f2' : '#f1f5f9'};"></td>`;
        const q = dailyQtySums[dIdx];
        const h = dailyStSeconds[dIdx] / 3600;
        return `<td class="num-cell text-center" data-tfoot-date="${lineName}__${dc.dateStr}">
          ${q > 0 ? `<strong>${q.toLocaleString()}</strong>` : ''}
          ${h > 0 ? `<span class="insp-st-hours">${h.toFixed(1)}h</span>` : ''}
        </td>`;
      }).join('');

      const lineRate = sumTarget > 0 ? ((sumCompleted / sumTarget) * 100).toFixed(1) : '0.0';

      card.innerHTML = `
        <div class="table-section-header header-process" style="padding: 10px 14px;">
          <div class="section-title-wrap">
            <span class="section-indicator bar-process"></span>
            <h3 class="section-title">${lineName}</h3>
            <span class="sidebar-count-badge">${lineRows.length}건</span>
          </div>
          <div class="section-summary-pills">
            <span class="summary-pill">목표: <strong>${sumTarget.toLocaleString()}</strong></span>
            <span class="summary-pill pill-primary">완료: <strong>${sumCompleted.toLocaleString()}</strong></span>
            <span class="summary-pill pill-balance-red">잔량: <strong>${sumBalance.toLocaleString()}</strong></span>
            <span class="summary-pill" style="background:#eff6ff; color:#1d4ed8;">달성률: <strong>${lineRate}%</strong></span>
          </div>
        </div>
        <div class="table-container" style="overflow-x: auto;">
          <table class="grid-table inspection-table">
            <thead>
              <tr class="header-row-primary">
                <th style="width: 38px;">No</th>
                <th style="width: 175px;">품명</th>
                <th style="width: 82px;">로트번호</th>
                <th style="width: 72px;">로트수량</th>
                <th style="width: 58px; text-align:center;" title="클릭 시 해당 공정 제외/포함">공정</th>
                <th style="width: 68px; color:#2563eb;">생산수량</th>
                <th style="width: 78px; color:#dc2626;">잔량</th>
                <th style="width: 68px;">실적완료</th>
                ${dateThs}
              </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
            <tfoot>
              <tr class="summary-row">
                <td colspan="3" class="summary-label text-center">합계 / 예상공수</td>
                <td class="num-cell text-center font-bold">${sumTarget.toLocaleString()}</td>
                <td colspan="3"></td>
                <td class="num-cell text-center text-primary font-bold">${sumCompleted.toLocaleString()}</td>
                ${tfootDateTds}
              </tr>
            </tfoot>
          </table>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function initInspV2EventListeners() {
    const container = document.getElementById('insp-line-tables-container');
    if (!container) return;

    document.getElementById('inspection-target-date')?.addEventListener('change', async (e) => {
      state.inspectionTargetDate = e.target.value;
      await loadInspectionV2FromDb(state.inspectionTargetDate);
      renderSidebarSchedulesV2();
      renderInspectionV2();
    });

    document.getElementById('inspection-date')?.addEventListener('change', (e) => {
      state.inspV2Data.startDate = e.target.value;
      saveLocalInspectionV2();
      renderInspectionV2();
    });

    document.getElementById('btn-insp-prev-day')?.addEventListener('click', () => {
      state.inspV2Data.startDate = addDaysStr(state.inspV2Data.startDate, -1);
      saveLocalInspectionV2();
      renderInspectionV2();
    });

    document.getElementById('btn-insp-next-day')?.addEventListener('click', () => {
      state.inspV2Data.startDate = addDaysStr(state.inspV2Data.startDate, 1);
      saveLocalInspectionV2();
      renderInspectionV2();
    });

    document.getElementById('btn-insp-add-day')?.addEventListener('click', () => {
      state.inspV2Data.dayCount = (state.inspV2Data.dayCount || 10) + 1;
      saveLocalInspectionV2();
      renderInspectionV2();
    });

    document.getElementById('btn-insp-sub-day')?.addEventListener('click', () => {
      if ((state.inspV2Data.dayCount || 10) > 10) {
        state.inspV2Data.dayCount -= 1;
        saveLocalInspectionV2();
        renderInspectionV2();
      }
    });

    document.getElementById('btn-insp-save')?.addEventListener('click', saveInspectionV2ToDb);

    document.querySelectorAll('#insp-line-filter-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.inspLineFilter = btn.dataset.line;
        renderInspectionV2();
      });
    });

    // 전체 펼침/접기 토글
    document.getElementById('btn-insp-toggle-expand-all')?.addEventListener('click', () => {
      const certRowsForWeek = (state.certSavedRows || []).filter(r => r.weekDate === state.inspectionTargetDate);
      const curSet = new Set(state.inspExpandedIds || []);
      const anyExp = certRowsForWeek.some(r => curSet.has(r.id));
      state.inspExpandedIds = anyExp ? [] : certRowsForWeek.map(r => r.id);
      renderInspectionV2();
    });

    // 행 펼침/접기, 공정 제외 토글 & 날짜 셀 인라인 입력
    container.addEventListener('click', (e) => {
      const expBtn = e.target.closest('.insp-expand-btn');
      if (expBtn) {
        const rowId = expBtn.dataset.rowId;
        const cur = state.inspExpandedIds || [];
        state.inspExpandedIds = cur.includes(rowId) ? cur.filter(id => id !== rowId) : [...cur, rowId];
        renderInspectionV2();
        return;
      }

      const procBtn = e.target.closest('.insp-proc-badge, .insp-pct-btn');
      if (procBtn) {
        const rowId = procBtn.dataset.rowId;
        const proc = procBtn.dataset.proc;
        if (!state.inspV2Data.items[rowId]) state.inspV2Data.items[rowId] = { dailyPlans: {}, excludedProcs: {} };
        if (!state.inspV2Data.items[rowId].excludedProcs) state.inspV2Data.items[rowId].excludedProcs = {};
        state.inspV2Data.items[rowId].excludedProcs[proc] = !state.inspV2Data.items[rowId].excludedProcs[proc];
        saveLocalInspectionV2();
        markAsDirty(true);
        renderInspectionV2();
        return;
      }
    });

    // 일정계획 날짜 셀 포커스 시 기존 값 전체 선택 (키보드 입력 시 덮어쓰기)
    container.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('insp-v2-date-input')) {
        e.target.select();
        e.target._justFocused = true;
      }
    });
    container.addEventListener('mouseup', (e) => {
      if (e.target.classList.contains('insp-v2-date-input') && e.target._justFocused) {
        e.preventDefault();
        e.target._justFocused = false;
      }
    });

    // 일정계획 날짜 셀 값 변경 시 저장 및 생산수량/잔량/합계 즉시 갱신 (포커스 유지)
    const handleInspInputUpdate = (inp) => {
      const rowId = inp.dataset.rowId;
      const dateStr = inp.dataset.date;
      const proc = inp.dataset.proc;
      const lineName = inp.dataset.line;
      const targetQty = parseSafeInt(inp.dataset.target);
      const val = parseSafeInt(inp.value);

      if (!state.inspV2Data.items[rowId]) state.inspV2Data.items[rowId] = { dailyPlans: {}, excludedProcs: {} };
      if (!state.inspV2Data.items[rowId].dailyPlans) state.inspV2Data.items[rowId].dailyPlans = {};
      if (!state.inspV2Data.items[rowId].dailyPlans[dateStr]) state.inspV2Data.items[rowId].dailyPlans[dateStr] = {};
      state.inspV2Data.items[rowId].dailyPlans[dateStr][proc] = val > 0 ? val : 0;

      saveLocalInspectionV2();
      markAsDirty(true);

      // 해당 행 생산수량 & 잔량 갱신
      const dailyPlans = state.inspV2Data.items[rowId].dailyPlans;
      let plannedSum = 0;
      Object.keys(dailyPlans).forEach(dk => {
        if (dailyPlans[dk] && dailyPlans[dk][proc]) {
          plannedSum += parseSafeInt(dailyPlans[dk][proc]);
        }
      });
      const remainPlan = targetQty - plannedSum;
      const sumTd = container.querySelector(`td[data-prod-sum="${rowId}__${proc}"]`);
      if (sumTd) sumTd.textContent = plannedSum > 0 ? plannedSum.toLocaleString() : '-';
      const remTd = container.querySelector(`td[data-remain="${rowId}__${proc}"]`);
      if (remTd) {
        remTd.innerHTML = (remainPlan === 0 && targetQty > 0)
          ? `<span class="insp-remain-red">0 (완료)</span>`
          : `<span class="insp-remain-red">${remainPlan.toLocaleString()}</span>`;
      }

      // 해당 일자 tfoot 합계 갱신 (조립 기준 수량합)
      const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
      const certRowsForLine = (state.certSavedRows || []).filter(r => r.weekDate === state.inspectionTargetDate && (r.group || '').trim() === lineName);
      let dQty = 0;
      let dSec = 0;
      certRowsForLine.forEach(cr => {
        const itSt = state.inspV2Data.items[cr.id];
        const excl = (itSt && itSt.excludedProcs) || {};
        const pOnDay = itSt && itSt.dailyPlans && itSt.dailyPlans[dateStr];
        if (!pOnDay) return;
        const mIt = masterMap.get(cr.code) || {};
        if (!excl.assembly) {
          const av = parseSafeInt(pOnDay.assembly);
          dQty += av;
          dSec += av * parseSafeInt(mIt.stAssembly);
        }
        if (!excl.inspect) dSec += parseSafeInt(pOnDay.inspect) * parseSafeInt(mIt.stInspect);
        if (!excl.pack) dSec += parseSafeInt(pOnDay.pack) * parseSafeInt(mIt.stPack);
      });
      const tfootTd = container.querySelector(`td[data-tfoot-date="${lineName}__${dateStr}"]`);
      if (tfootTd) {
        const h = dSec / 3600;
        tfootTd.innerHTML = `${dQty > 0 ? `<strong>${dQty.toLocaleString()}</strong>` : ''}${h > 0 ? `<span class="insp-st-hours">${h.toFixed(1)}h</span>` : ''}`;
      }
    };

    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('insp-v2-date-input')) {
        handleInspInputUpdate(e.target);
      }
    });

    // Tab: 우측 셀 이동(브라우저 기본), Enter/Shift+Enter: 아래/위 같은 날짜 셀 이동
    container.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('insp-v2-date-input')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        const table = e.target.closest('table');
        if (!table) return;
        const colDate = e.target.dataset.date;
        const colInputs = Array.from(table.querySelectorAll(`.insp-v2-date-input[data-date="${colDate}"]`));
        const curIdx = colInputs.indexOf(e.target);
        if (curIdx === -1) return;
        const nextIdx = e.shiftKey ? curIdx - 1 : curIdx + 1;
        if (nextIdx >= 0 && nextIdx < colInputs.length) {
          colInputs[nextIdx].focus();
          colInputs[nextIdx].select();
        }
      }
    });
  }

  // =========================================================================
  // 생산일보 v2 (일보작성: 병합/분리 보기, 돌발추가 + 공수집계: 월별 ST 집계)
  // =========================================================================
  function loadPlanEntriesForProductionDate(dateStr) {
    if (!dateStr) return [];
    const certMap = new Map((state.certSavedRows || []).map(r => [r.id, r]));
    const collected = [];

    // 저장된 모든 일정계획 v2에서 해당 dateStr에 배정된 항목 수집
    const seenInspKeys = new Set();
    const scanInspObj = (itemsObj) => {
      Object.keys(itemsObj || {}).forEach(certRowId => {
        const cRow = certMap.get(certRowId);
        if (!cRow) return;
        const planOnDay = itemsObj[certRowId]?.dailyPlans?.[dateStr];
        if (!planOnDay) return;

        // 구글 시트 생산일보 양식에 맞춰 조립 / 검사 / 포장 공정별 1행씩 생성
        const excl = itemsObj[certRowId]?.excludedProcs || {};
        ['assembly', 'inspect', 'pack'].forEach(p => {
          if (excl[p]) return;
          const q = parseSafeInt(planOnDay[p]);
          if (q > 0) {
            const uniqKey = `${certRowId}__${p}`;
            if (seenInspKeys.has(uniqKey)) return;
            seenInspKeys.add(uniqKey);
            collected.push({
              id: `ent_${certRowId}_${p}`,
              line: (cRow.group || '감지기반').trim(),
              certRowId,
              code: cRow.code || '',
              name: getDisplayNameByCode(cRow.code, cRow.name || ''),
              lotNo: cRow.lotNo || '',
              procs: [p],
              targetQty: q,
              actualQty: '',
              workerHours: {},
              note: '',
              isAdhoc: false
            });
          }
        });
      });
    };

    if (state.inspV2Data && state.inspV2Data.items) {
      scanInspObj(state.inspV2Data.items);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.INSP_V2_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        scanInspObj(parsed.items);
      } catch (e) { /* ignore */ }
    }

    return collected;
  }

  function renderProductionV2() {
    const mode = state.activeLines.daily === 'workhours' ? 'workhours' : 'daily';
    const dailyView = document.getElementById('prod-daily-view');
    const whView = document.getElementById('prod-workhours-view');
    if (dailyView) dailyView.style.display = mode === 'daily' ? 'block' : 'none';
    if (whView) whView.style.display = mode === 'workhours' ? 'block' : 'none';

    if (mode === 'workhours') {
      renderWorkhoursView();
      return;
    }

    const dateStr = state.productionDate || getTodayDateString();
    const dateInput = document.getElementById('production-date');
    if (dateInput) dateInput.value = dateStr;

    if (!state.dailyV2Data || !state.dailyV2Data.supportByLine) loadLocalDailyV2(dateStr);

    document.querySelectorAll('#prod-line-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === (state.prodLineFilter || 'ALL'));
    });

    // 구글 시트 양식: 1행 = 품목(또는 유실) + 공정명
    const entries = state.dailyV2Data.entries || [];
    const displayRows = [];
    entries.forEach(ent => {
      if (ent.isLoss) {
        displayRows.push({
          ...ent,
          _procKey: 'loss',
          _procLabel: ent.lossLabel || (ent.procs && ent.procs[0]) || '유실',
          _procCls: 'is-loss'
        });
      } else {
        const procs = ent.procs && ent.procs.length > 0 ? ent.procs : ['assembly'];
        const firstP = procs[0];
        const label = procs.map(p => PROC_LABELS[p] || p).join('+');
        const cls = firstP === 'inspect' ? 'is-inspect' : (firstP === 'pack' ? 'is-pack' : 'is-assembly');
        displayRows.push({
          ...ent,
          _procKey: firstP,
          _procLabel: label,
          _procCls: ent.isAdhoc ? 'is-adhoc' : cls
        });
      }
    });

    const container = document.getElementById('prod-line-cards-container');
    if (!container) return;
    container.innerHTML = '';

    const visibleLines = (state.prodLineFilter && state.prodLineFilter !== 'ALL')
      ? [state.prodLineFilter]
      : INSP_LINES;

    const allWorkers = state.workers || [];

    // 모든 반의 그리드 열 수와 간격을 동일하게 맞추기 위해 최대 작업자 수 계산
    let maxWorkersCount = 0;
    visibleLines.forEach(ln => {
      const fixedCnt = allWorkers.filter(w => (w.group || '감지기반') === ln).length;
      const supCnt = ((state.dailyV2Data.supportByLine && state.dailyV2Data.supportByLine[ln]) || [])
        .filter(id => allWorkers.some(w => w.id === id)).length;
      if (fixedCnt + supCnt > maxWorkersCount) maxWorkersCount = fixedCnt + supCnt;
    });
    if (maxWorkersCount < 1) maxWorkersCount = 1;

    const registeredLossNames = (state.etcItems || []).map(it => (it.name || '').trim()).filter(Boolean);
    const lossNames = registeredLossNames.length > 0
      ? registeredLossNames
      : ['정리정돈', '재작업', '작업준비', '불량수리', '자재결품', '교육', '회의', '반차', '연차', '조퇴', '외출', '기타'];
    const lossOptHtml = lossNames.map(n => `<option value="${n}">${n}</option>`).join('');

    visibleLines.forEach(lineName => {
      const lineRows = displayRows.filter(r => (r.line || '감지기반') === lineName);

      // 해당 반 소속 작업자 + 해당 반에 투입된 타 반 지원인원
      const lineFixedWorkers = allWorkers.filter(w => (w.group || '감지기반') === lineName);
      const supportIds = (state.dailyV2Data.supportByLine && state.dailyV2Data.supportByLine[lineName]) || [];
      const supportWorkers = supportIds.map(id => allWorkers.find(w => w.id === id)).filter(Boolean);
      const activeWorkers = [...lineFixedWorkers, ...supportWorkers];
      const padWorkerCount = Math.max(0, maxWorkersCount - activeWorkers.length);
      const padEmptyTds = '<td></td>'.repeat(padWorkerCount);
      const padEmptyThs = '<th style="min-width: 76px;"></th>'.repeat(padWorkerCount);

      // 지원인원 후보: 다른 반 소속 작업자 중 미투입자
      const candidateSupport = allWorkers.filter(w =>
        !activeWorkers.some(aw => aw.id === w.id) &&
        (w.group || '감지기반') !== lineName
      );

      const card = document.createElement('div');
      card.className = 'table-section-card';

      let sumActual = 0;
      let sumLineHours = 0;
      const workerTotals = {};
      activeWorkers.forEach(w => { workerTotals[w.id] = 0; });

      let tbodyHtml = '';
      if (lineRows.length === 0) {
        tbodyHtml = `<tr><td colspan="${9 + maxWorkersCount}" style="text-align:center; padding: 20px; color:#94a3b8;">[${lineName}] 작업 내역이 없습니다. [📥 일정 불러오기] 또는 [+ 돌발/추가 품목]을 누르세요.</td></tr>`;
      } else {
        lineRows.forEach((row, idx) => {
          const actQty = parseSafeInt(row.actualQty);
          if (!row.isLoss) sumActual += actQty;

          let rowHoursSum = 0;
          const workerTds = activeWorkers.map(w => {
            const hrs = row.workerHours && row.workerHours[w.id] !== undefined ? row.workerHours[w.id] : '';
            const numH = parseFloat(hrs) || 0;
            if (numH > 0) {
              workerTotals[w.id] += numH;
              rowHoursSum += numH;
            }
            const attInfo = getWorkerAttendanceOnDate(w.id, state.productionDate);
            const isFullOff = attInfo && (attInfo.typeName === '연차' || attInfo.typeName === '결근');
            return `<td class="${isFullOff ? 'prod-att-off-cell' : ''}"><input type="number" step="0.5" min="0" class="cell-input text-right prod-v2-hour-input" data-entry-id="${row.id}" data-worker-id="${w.id}" value="${hrs}" ${isFullOff ? `title="${attInfo.typeName} (근태관리 연동)"` : ''}></td>`;
          }).join('');
          sumLineHours += rowHoursSum;

          const dispName = row.isLoss ? (row.name || '-') : (getDisplayNameByCode(row.code, row.name) || '-');
          tbodyHtml += `
            <tr>
              <td class="text-center" style="color:#64748b;">${idx + 1}</td>
              <td class="prod-name-cell font-bold ${row.isLoss ? 'prod-loss-name' : 'text-slate-800'}">${dispName}</td>
              <td class="text-center" style="font-family:'JetBrains Mono',monospace;">${row.lotNo || '-'}</td>
              <td class="text-center"><span class="prod-proc-pill ${row._procCls}">${row._procLabel}</span></td>
              <td><input type="text" class="cell-input text-center prod-v2-note-input" data-entry-id="${row.id}" value="${row.note || ''}" placeholder="${row.isLoss ? '유실내용' : '작업내용'}"></td>
              <td class="num-cell text-center" style="color:#64748b;">${row.targetQty ? parseSafeInt(row.targetQty).toLocaleString() : '-'}</td>
              <td>${row.isLoss ? '<span style="color:#cbd5e1; display:block; text-align:center;">-</span>' : `<input type="text" class="cell-input text-center font-bold text-primary prod-v2-qty-input" data-entry-id="${row.id}" value="${actQty > 0 ? actQty.toLocaleString() : ''}" inputmode="numeric">`}</td>
              ${workerTds}${padEmptyTds}
              <td class="num-cell text-center font-bold" style="color:#0f172a; background:#f8fafc;">${rowHoursSum > 0 ? rowHoursSum.toFixed(1) : ''}</td>
              <td class="text-center"><button type="button" class="btn btn-xs btn-ghost text-danger btn-del-prod-entry" data-entry-id="${row.id}" title="행 삭제">×</button></td>
            </tr>
          `;
        });
      }

      const supportOptHtml = candidateSupport.map(w => `<option value="${w.id}">[${w.group || '감지기반'}] ${w.name}</option>`).join('');
      const supportChipsHtml = supportWorkers.map(w => `
        <span class="prod-support-chip">
          [${w.group || '감지기반'}] ${w.name}
          <button type="button" class="btn-remove-line-support" data-line="${lineName}" data-worker-id="${w.id}" title="지원인원 제외">×</button>
        </span>
      `).join('');

      const workerThs = activeWorkers.map(w => {
        const isSup = supportIds.includes(w.id);
        const attInfo = getWorkerAttendanceOnDate(w.id, state.productionDate);
        const attBadge = attInfo ? `<span class="prod-att-badge" style="background:${attInfo.color};" title="${attInfo.memo || attInfo.typeName}">${attInfo.typeName}</span>` : '';
        return `<th class="${isSup ? 'th-support-worker' : ''}" style="min-width: 76px; text-align:center; white-space:nowrap;" title="${isSup ? `지원인원 (${w.group || ''})` : `${lineName} 소속`}">${w.name}${isSup ? ' <small style="font-weight:600; color:#2563eb;">(지원)</small>' : ''}${attBadge}</th>`;
      }).join('') + padEmptyThs;
      const workerSumTds = activeWorkers.map(w => {
        const tot = workerTotals[w.id];
        const cls = tot >= 8 ? 'prod-hour-ok' : (tot > 0 ? 'prod-hour-warn' : '');
        return `<td class="num-cell text-right font-bold ${cls}">${tot > 0 ? tot.toFixed(1) + 'h' : ''}</td>`;
      }).join('') + padEmptyTds;

      card.innerHTML = `
        <div class="table-section-header header-prod-assembly" style="padding: 10px 14px; flex-wrap: wrap; gap: 8px;">
          <div class="section-title-wrap" style="flex-wrap: wrap;">
            <span class="section-indicator bar-process"></span>
            <h3 class="section-title">${lineName} 일보</h3>
            <span class="sidebar-count-badge">${lineRows.length}건</span>
            <div class="prod-header-support-wrap">
              <select class="select-line-support-worker" data-line="${lineName}">
                <option value="">+ 지원인원 투입</option>
                ${supportOptHtml}
              </select>
              <select class="select-line-add-loss" data-line="${lineName}">
                <option value="">+ 유실항목 추가</option>
                ${lossOptHtml}
              </select>
              ${supportChipsHtml}
            </div>
          </div>
          <div class="section-summary-pills">
            <span class="summary-pill pill-primary">실적합계: <strong>${sumActual.toLocaleString()}</strong></span>
            <span class="summary-pill" style="background:#f1f5f9; color:#334155;">총 작업공수: <strong>${sumLineHours.toFixed(1)}h</strong></span>
          </div>
        </div>
        <div class="table-container" style="overflow-x: auto;">
          <table class="grid-table production-table">
            <thead>
              <tr class="header-row-primary">
                <th style="width: 38px;">No</th>
                <th style="width: 210px;">품목</th>
                <th style="width: 80px;">로트번호</th>
                <th style="width: 115px;">공정명</th>
                <th style="width: 140px;">유실내용 & 비고</th>
                <th style="width: 70px;">계획수량</th>
                <th style="width: 74px;">실적수량</th>
                ${workerThs}
                <th style="width: 68px;">작업공수</th>
                <th style="width: 48px; padding: 4px;">삭제</th>
              </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
            <tfoot>
              <tr class="summary-row">
                <td colspan="6" class="summary-label text-center">일일 합계 (기준 8.0h)</td>
                <td class="num-cell text-center text-primary font-bold">${sumActual.toLocaleString()}</td>
                ${workerSumTds}
                <td class="num-cell text-center font-bold">${sumLineHours.toFixed(1)}h</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // 공수집계 (월별 품목 ST 집계 + 작업자별 공수 집계)
  function renderWorkhoursView() {
    const monthStr = state.whMonth || getTodayDateString().slice(0, 7);
    const mInput = document.getElementById('wh-month-input');
    if (mInput) mInput.value = monthStr;

    document.querySelectorAll('#wh-line-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === (state.whLineFilter || 'ALL'));
    });

    const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
    const itemAgg = {}; // code -> { line, code, name, aQty, iQty, pQty, actualHours }
    const workerAgg = {}; // workerId -> { name, type, aH, iH, pH, mH, totalH, days: Set }

    (state.workers || []).forEach(w => {
      workerAgg[w.id] = { name: w.name, type: w.type === 'fixed' ? '고정' : '변동', aH: 0, iH: 0, pH: 0, mH: 0, totalH: 0, days: new Set() };
    });

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.DAILY_V2_PREFIX)) continue;
      const dateStr = k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length);
      if (!dateStr.startsWith(monthStr)) continue;

      try {
        const d = JSON.parse(localStorage.getItem(k));
        (d.entries || []).forEach(ent => {
          const line = (ent.line || '감지기반').trim();
          if (state.whLineFilter && state.whLineFilter !== 'ALL' && line !== state.whLineFilter) return;

          const code = ent.code || ent.name;
          if (!itemAgg[code]) {
            itemAgg[code] = { line, code: ent.code || '-', name: ent.name || '-', aQty: 0, iQty: 0, pQty: 0, actualHours: 0 };
          }
          const qty = parseSafeInt(ent.actualQty);
          const procs = ent.procs || ['assembly'];
          if (procs.includes('assembly')) itemAgg[code].aQty += qty;
          if (procs.includes('inspect')) itemAgg[code].iQty += qty;
          if (procs.includes('pack')) itemAgg[code].pQty += qty;

          Object.keys(ent.workerHours || {}).forEach(wId => {
            const h = parseFloat(ent.workerHours[wId]) || 0;
            if (h <= 0) return;
            itemAgg[code].actualHours += h;
            if (workerAgg[wId]) {
              workerAgg[wId].totalH += h;
              workerAgg[wId].days.add(dateStr);
              if (procs.length === 1) {
                if (procs[0] === 'assembly') workerAgg[wId].aH += h;
                else if (procs[0] === 'inspect') workerAgg[wId].iH += h;
                else if (procs[0] === 'pack') workerAgg[wId].pH += h;
              } else {
                workerAgg[wId].mH += h;
              }
            }
          });
        });
      } catch (e) { /* ignore */ }
    }

    const stTbody = document.getElementById('wh-st-tbody');
    const stTfoot = document.getElementById('wh-st-tfoot');
    let totalStdH = 0, totalActH = 0;

    if (stTbody) {
      const list = Object.values(itemAgg);
      if (list.length === 0) {
        stTbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 25px; color:#94a3b8;">해당 월에 집계된 생산일보 데이터가 없습니다.</td></tr>';
      } else {
        stTbody.innerHTML = list.map((it, idx) => {
          const m = masterMap.get(it.code) || {};
          const dispName = getDisplayItemName(m) || it.name;
          const stA = parseSafeInt(m.stAssembly);
          const stI = parseSafeInt(m.stInspect);
          const stP = parseSafeInt(m.stPack);
          const stdH = (it.aQty * stA + it.iQty * stI + it.pQty * stP) / 3600;
          totalStdH += stdH;
          totalActH += it.actualHours;
          const eff = it.actualHours > 0 && stdH > 0 ? ((stdH / it.actualHours) * 100).toFixed(1) + '%' : '-';

          return `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="text-center">${it.line}</td>
              <td>${it.code}</td>
              <td class="font-bold">${dispName}</td>
              <td class="num-cell text-right">${it.aQty.toLocaleString()}</td>
              <td class="num-cell text-right">${it.iQty.toLocaleString()}</td>
              <td class="num-cell text-right">${it.pQty.toLocaleString()}</td>
              <td class="text-center" style="font-size:11px; color:#64748b;">${stA} / ${stI} / ${stP}</td>
              <td class="num-cell text-right font-bold" style="color:#7c3aed;">${stdH.toFixed(2)}h</td>
              <td class="num-cell text-right font-bold">${it.actualHours.toFixed(1)}h</td>
              <td class="text-center font-bold">${eff}</td>
            </tr>
          `;
        }).join('');
      }
      if (stTfoot) {
        const totalEff = totalActH > 0 && totalStdH > 0 ? ((totalStdH / totalActH) * 100).toFixed(1) + '%' : '-';
        stTfoot.innerHTML = `<td colspan="8" class="summary-label text-center">월간 합계</td><td class="num-cell text-right font-bold" style="color:#7c3aed;">${totalStdH.toFixed(2)}h</td><td class="num-cell text-right font-bold">${totalActH.toFixed(1)}h</td><td class="text-center font-bold">${totalEff}</td>`;
      }
    }

    const elAct = document.getElementById('wh-kpi-actual');
    const elSt = document.getElementById('wh-kpi-st');
    const elEff = document.getElementById('wh-kpi-eff');
    if (elAct) elAct.textContent = `${totalActH.toFixed(1)}h`;
    if (elSt) elSt.textContent = `${totalStdH.toFixed(2)}h`;
    if (elEff) elEff.textContent = totalActH > 0 && totalStdH > 0 ? `${((totalStdH / totalActH) * 100).toFixed(1)}%` : '-';

    const wTbody = document.getElementById('wh-worker-tbody');
    const wTfoot = document.getElementById('wh-worker-tfoot');
    if (wTbody) {
      const wList = Object.values(workerAgg);
      let sA = 0, sI = 0, sP = 0, sM = 0, sT = 0;
      wTbody.innerHTML = wList.map((w, idx) => {
        sA += w.aH; sI += w.iH; sP += w.pH; sM += w.mH; sT += w.totalH;
        return `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td class="font-bold text-center">${w.name}</td>
            <td class="text-center">${w.type}</td>
            <td class="num-cell text-right">${w.aH.toFixed(1)}</td>
            <td class="num-cell text-right">${w.iH.toFixed(1)}</td>
            <td class="num-cell text-right">${w.pH.toFixed(1)}</td>
            <td class="num-cell text-right">${w.mH.toFixed(1)}</td>
            <td class="num-cell text-right font-bold text-primary">${w.totalH.toFixed(1)}h</td>
            <td class="text-center">${w.days.size}일</td>
          </tr>
        `;
      }).join('');
      if (wTfoot) {
        wTfoot.innerHTML = `<td colspan="3" class="summary-label text-center">합계</td><td class="num-cell text-right font-bold">${sA.toFixed(1)}</td><td class="num-cell text-right font-bold">${sI.toFixed(1)}</td><td class="num-cell text-right font-bold">${sP.toFixed(1)}</td><td class="num-cell text-right font-bold">${sM.toFixed(1)}</td><td class="num-cell text-right font-bold text-primary">${sT.toFixed(1)}h</td><td></td>`;
      }
    }
  }

  function initProdV2EventListeners() {
    const container = document.getElementById('prod-line-cards-container');
    if (!container) return;

    document.getElementById('production-date')?.addEventListener('change', async (e) => {
      state.productionDate = e.target.value;
      await loadDailyV2FromDb(state.productionDate);
      renderProductionV2();
    });

    document.getElementById('btn-prod-prev-day')?.addEventListener('click', async () => {
      state.productionDate = addDaysStr(state.productionDate, -1);
      await loadDailyV2FromDb(state.productionDate);
      renderProductionV2();
    });

    document.getElementById('btn-prod-next-day')?.addEventListener('click', async () => {
      state.productionDate = addDaysStr(state.productionDate, 1);
      await loadDailyV2FromDb(state.productionDate);
      renderProductionV2();
    });

    document.getElementById('btn-prod-today')?.addEventListener('click', async () => {
      state.productionDate = getTodayDateString();
      await loadDailyV2FromDb(state.productionDate);
      renderProductionV2();
    });

    document.querySelectorAll('#prod-line-filter-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.prodLineFilter = btn.dataset.line;
        renderProductionV2();
      });
    });

    document.querySelectorAll('#prod-merge-mode-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.prodMergeMode = btn.dataset.merge;
        renderProductionV2();
      });
    });

    // 작업반별 지원인원 투입 & 유실항목 즉시 추가 (일보 카드 헤더)
    container.addEventListener('change', (e) => {
      const supSel = e.target.closest('.select-line-support-worker');
      if (supSel) {
        const lineName = supSel.dataset.line;
        const wId = supSel.value;
        if (!wId) return;
        if (!state.dailyV2Data.supportByLine) state.dailyV2Data.supportByLine = { '감지기반': [], '유도등반': [], '수신기반': [] };
        if (!state.dailyV2Data.supportByLine[lineName]) state.dailyV2Data.supportByLine[lineName] = [];
        if (!state.dailyV2Data.supportByLine[lineName].includes(wId)) {
          state.dailyV2Data.supportByLine[lineName].push(wId);
          saveLocalDailyV2();
          markAsDirty(true);
          renderProductionV2();
        }
        return;
      }

      const lossSel = e.target.closest('.select-line-add-loss');
      if (lossSel) {
        const lineName = lossSel.dataset.line;
        const lossType = lossSel.value;
        if (!lossType) return;
        state.dailyV2Data.entries.push({
          id: `loss_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          line: lineName,
          certRowId: null,
          code: '',
          name: '유실',
          lotNo: '',
          procs: [lossType],
          lossLabel: lossType,
          targetQty: 0,
          actualQty: '',
          workerHours: {},
          note: '',
          isLoss: true
        });
        saveLocalDailyV2();
        markAsDirty(true);
        renderProductionV2();
      }
    });

    container.addEventListener('click', (e) => {
      const rmBtn = e.target.closest('.btn-remove-line-support');
      if (!rmBtn) return;
      const lineName = rmBtn.dataset.line;
      const wId = rmBtn.dataset.workerId;
      if (state.dailyV2Data.supportByLine && state.dailyV2Data.supportByLine[lineName]) {
        state.dailyV2Data.supportByLine[lineName] = state.dailyV2Data.supportByLine[lineName].filter(id => id !== wId);
        saveLocalDailyV2();
        markAsDirty(true);
        renderProductionV2();
      }
    });

    // 설정: 작업자 소속반 변경 & 작업반별 일정 공정 기본설정 변경
    document.getElementById('master-workers-tbody')?.addEventListener('change', (e) => {
      const grpSel = e.target.closest('.worker-group-select');
      if (!grpSel) return;
      const wId = grpSel.dataset.workerId;
      const w = (state.workers || []).find(x => x.id === wId);
      if (w) {
        w.group = grpSel.value;
        saveLocalMasterData();
        markAsDirty(true);
        showToast(`${w.name} 작업자의 소속반이 [${w.group}]으로 변경되었습니다.`);
      }
    });

    // 설정: 좌측 사이드바 서브메뉴 전환
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.settingsPane || btn.dataset.pane || btn.dataset.target;
        if (!key) return;
        const targetId = key.startsWith('settings-pane-') ? key : `settings-pane-${key}`;
        document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-sub-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetId)?.classList.add('active');
      });
    });

    // 설정: 품목정보 신규 등록 팝업 모달 열기/닫기 & 검색 필터
    const certAddModal = document.getElementById('cert-item-add-modal');
    const closeCertAddModal = () => {
      if (certAddModal) certAddModal.style.display = 'none';
    };
    document.getElementById('btn-open-cert-item-modal')?.addEventListener('click', () => {
      if (certAddModal) certAddModal.style.display = 'flex';
    });
    document.getElementById('btn-close-cert-item-modal')?.addEventListener('click', closeCertAddModal);
    document.getElementById('btn-cancel-cert-item-modal')?.addEventListener('click', closeCertAddModal);
    certAddModal?.addEventListener('click', (e) => {
      if (e.target === certAddModal) closeCertAddModal();
    });
    document.getElementById('form-add-cert-item')?.addEventListener('submit', () => {
      closeCertAddModal();
    });
    document.getElementById('cert-master-search')?.addEventListener('input', () => {
      if (typeof renderCertMasterTable === 'function') renderCertMasterTable();
    });

    // 설정: 품목정보 전체 선택 체크박스 & 상단 선택 수정/삭제/저장/취소
    document.getElementById('chk-cert-master-all')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('#master-cert-items-tbody .chk-cert-master-row').forEach(chk => {
        chk.checked = checked;
      });
    });

    document.getElementById('btn-cert-selected-edit')?.addEventListener('click', () => {
      const checkedBoxes = Array.from(document.querySelectorAll('#master-cert-items-tbody .chk-cert-master-row:checked'));
      if (checkedBoxes.length === 0) {
        showToast('수정할 품목을 좌측 체크박스로 선택해주세요.');
        return;
      }
      const esc = (v) => String(v ?? '').replace(/"/g, '&quot;');
      checkedBoxes.forEach(chk => {
        const id = chk.dataset.id;
        const item = (state.certMasterItems || []).find(i => i.id === id);
        const tr = chk.closest('tr');
        if (!item || !tr) return;
        tr.draggable = false;
        tr.dataset.editing = 'true';
        tr.innerHTML = `
          <td style="text-align:center;"><input type="checkbox" class="chk-cert-master-row" data-id="${item.id}" checked disabled></td>
          <td style="text-align:center; color:#2563eb; font-weight:700;">수정</td>
          <td><select class="cert-inline-edit-input" data-f="useYn"><option value="사용" ${item.useYn === '사용' ? 'selected' : ''}>사용</option><option value="미사용" ${item.useYn === '미사용' ? 'selected' : ''}>미사용</option></select></td>
          <td><select class="cert-inline-edit-input" data-f="inspectType"><option value="품질" ${item.inspectType === '품질' ? 'selected' : ''}>품질</option><option value="생산" ${item.inspectType === '생산' ? 'selected' : ''}>생산</option><option value="-" ${item.inspectType === '-' ? 'selected' : ''}>-</option></select></td>
          <td><select class="cert-inline-edit-input" data-f="group"><option value="감지기반" ${item.group === '감지기반' ? 'selected' : ''}>감지기반</option><option value="유도등반" ${item.group === '유도등반' ? 'selected' : ''}>유도등반</option><option value="수신기반" ${item.group === '수신기반' ? 'selected' : ''}>수신기반</option><option value="기타" ${item.group === '기타' ? 'selected' : ''}>기타</option><option value="-" ${item.group === '-' ? 'selected' : ''}>-</option></select></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="itemGroup" value="${esc(item.itemGroup)}"></td>
          <td><input type="text" class="cert-inline-edit-input font-bold" data-f="code" value="${esc(item.code)}"></td>
          <td><input type="text" class="cert-inline-edit-input font-bold" data-f="altName" value="${esc(item.altName)}"></td>
          <td><input type="text" class="cert-inline-edit-input font-bold" data-f="name" value="${esc(item.name)}"></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="spec" value="${esc(item.spec)}"></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="formatNo" value="${esc(item.formatNo)}"></td>
          <td><input type="text" class="cert-inline-edit-input" data-f="modelName" value="${esc(item.modelName)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="unitPrice" value="${esc(item.unitPrice)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="baseStock" value="${esc(item.baseStock)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="minStock" value="${esc(item.minStock)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="maxStock" value="${esc(item.maxStock)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="stAssembly" value="${esc(item.stAssembly)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="stInspect" value="${esc(item.stInspect)}"></td>
          <td><input type="number" class="cert-inline-edit-input text-right" data-f="stPack" value="${esc(item.stPack)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="sensor" value="${esc(item.sensor)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="ctrl" value="${esc(item.ctrl)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="gas" value="${esc(item.gas)}"></td>
        `;
      });
      document.getElementById('btn-cert-selected-edit').style.display = 'none';
      document.getElementById('btn-cert-selected-delete').style.display = 'none';
      document.getElementById('btn-cert-inline-save').style.display = '';
      document.getElementById('btn-cert-inline-cancel').style.display = '';
    });

    document.getElementById('btn-cert-inline-save')?.addEventListener('click', () => {
      const editingRows = Array.from(document.querySelectorAll('#master-cert-items-tbody tr[data-editing="true"]'));
      let updatedCount = 0;
      editingRows.forEach(tr => {
        const id = tr.dataset.id;
        const item = (state.certMasterItems || []).find(i => i.id === id);
        if (!item) return;
        tr.querySelectorAll('[data-f]').forEach(el => {
          item[el.dataset.f] = el.value.trim();
        });
        updatedCount++;
      });
      if (updatedCount > 0) {
        saveLocalCertData();
        saveCertDataToDb(true);
        showToast(`${updatedCount}개 품목정보가 수정되었습니다.`);
      }
      renderCertMasterTable();
    });

    document.getElementById('btn-cert-inline-cancel')?.addEventListener('click', () => {
      renderCertMasterTable();
    });

    document.getElementById('btn-cert-selected-delete')?.addEventListener('click', () => {
      const checkedBoxes = Array.from(document.querySelectorAll('#master-cert-items-tbody .chk-cert-master-row:checked'));
      if (checkedBoxes.length === 0) {
        showToast('삭제할 품목을 좌측 체크박스로 선택해주세요.');
        return;
      }
      const ids = new Set(checkedBoxes.map(c => c.dataset.id));
      if (!confirm(`선택한 ${ids.size}개 품목을 마스터에서 삭제하시겠습니까?`)) return;
      state.certMasterItems = (state.certMasterItems || []).filter(i => !ids.has(i.id));
      saveLocalCertData();
      saveCertDataToDb(true);
      renderCertMasterTable();
      showToast(`${ids.size}개 품목이 삭제되었습니다.`);
    });

    document.querySelectorAll('.line-proc-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const ln = sel.dataset.line;
        if (!state.lineProcConfig) state.lineProcConfig = {};
        state.lineProcConfig[ln] = e.target.value;
        localStorage.setItem(STORAGE_KEYS.LINE_PROC_CONFIG, JSON.stringify(state.lineProcConfig));
        markAsDirty(true);
        showToast(`[${ln}] 일정 공정 기본설정이 변경되었습니다.`);
      });
    });

    // 일정 불러오기 (신규 추가 + 기존 행 계획수량 동기화 + 계획 취소된 빈 행 정리)
    document.getElementById('btn-prod-load-plan')?.addEventListener('click', () => {
      const planned = loadPlanEntriesForProductionDate(state.productionDate);
      const plannedMap = new Map(planned.map(p => [p.id, p]));
      const entries = state.dailyV2Data.entries || [];

      let added = 0;
      let updated = 0;

      // 기존 행 중 일정계획에서 온 행은 계획수량 동기화, 계획에서 빠졌고 실적/공수가 비어있으면 제거
      state.dailyV2Data.entries = entries.filter(ent => {
        if (ent.isAdhoc || ent.isLoss) return true;
        const matched = plannedMap.get(ent.id);
        if (matched) {
          if (ent.targetQty !== matched.targetQty) {
            ent.targetQty = matched.targetQty;
            updated++;
          }
          return true;
        }
        const hasActual = parseSafeInt(ent.actualQty) > 0;
        const hasHours = Object.values(ent.workerHours || {}).some(v => parseFloat(v) > 0);
        return hasActual || hasHours;
      });

      const existingIds = new Set(state.dailyV2Data.entries.map(e => e.id));
      planned.forEach(p => {
        if (!existingIds.has(p.id)) {
          state.dailyV2Data.entries.push(p);
          added++;
        }
      });

      if (planned.length === 0 && added === 0 && updated === 0) {
        alert(`${state.productionDate} 날짜로 일정계획에 배정된 품목이 없습니다.`);
        return;
      }

      saveLocalDailyV2();
      markAsDirty(true);
      renderProductionV2();
      showToast(`일정계획 동기화 완료 (신규 ${added}건, 계획수량 갱신 ${updated}건)`);
    });

    // 돌발/추가 품목 모달
    const renderAdhocList = (q) => {
      const listEl = document.getElementById('prod-adhoc-list');
      if (!listEl) return;
      const cleanQ = (q || '').trim().toLowerCase();
      const matched = (state.certMasterItems || []).filter(it => (it.useYn || '사용') === '사용').filter(it =>
        !cleanQ || (it.code || '').toLowerCase().includes(cleanQ) || (it.altName || '').toLowerCase().includes(cleanQ) || (it.name || '').toLowerCase().includes(cleanQ)
      ).slice(0, 25);

      listEl.innerHTML = matched.map(it => `
        <button type="button" class="plan-menu-btn prod-adhoc-pick-btn" data-code="${it.code}" style="border:1px solid #e2e8f0; justify-content:space-between;">
          <span><strong>${getDisplayItemName(it)}</strong> <small style="color:#64748b;">(${it.code})</small></span>
          <span style="font-size:11px; color:#2563eb;">${it.group || '감지기반'}</span>
        </button>
      `).join('');
    };

    document.getElementById('btn-prod-add-adhoc')?.addEventListener('click', () => {
      document.getElementById('prod-adhoc-search').value = '';
      renderAdhocList('');
      document.getElementById('prod-adhoc-modal').style.display = 'flex';
    });
    document.getElementById('btn-close-adhoc-modal')?.addEventListener('click', () => {
      document.getElementById('prod-adhoc-modal').style.display = 'none';
    });
    document.getElementById('prod-adhoc-search')?.addEventListener('input', (e) => renderAdhocList(e.target.value));
    document.getElementById('prod-adhoc-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.prod-adhoc-pick-btn');
      if (!btn) return;
      const code = btn.dataset.code;
      const item = (state.certMasterItems || []).find(it => it.code === code);
      if (!item) return;
      const procs = Array.from(document.querySelectorAll('.prod-adhoc-proc:checked')).map(c => c.value);
      if (procs.length === 0) {
        alert('공정을 1개 이상 선택해 주세요.');
        return;
      }
      state.dailyV2Data.entries.push({
        id: `adhoc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        line: (item.group || '감지기반').trim(),
        certRowId: null,
        code: item.code,
        name: getDisplayItemName(item),
        lotNo: '',
        procs,
        targetQty: 0,
        actualQty: '',
        workerHours: {},
        note: '돌발작업',
        isAdhoc: true
      });
      saveLocalDailyV2();
      markAsDirty(true);
      document.getElementById('prod-adhoc-modal').style.display = 'none';
      renderProductionV2();
    });

    // 유실/기타 작업 추가 모달
    const lossModal = document.getElementById('prod-loss-modal');
    const closeLossModal = () => { if (lossModal) lossModal.style.display = 'none'; };
    document.getElementById('btn-prod-add-loss')?.addEventListener('click', () => {
      if (state.prodLineFilter && state.prodLineFilter !== 'ALL') {
        const lineSel = document.getElementById('prod-loss-line');
        if (lineSel) lineSel.value = state.prodLineFilter;
      }
      const noteEl = document.getElementById('prod-loss-note');
      if (noteEl) noteEl.value = '';
      if (lossModal) lossModal.style.display = 'flex';
    });
    document.getElementById('btn-close-loss-modal')?.addEventListener('click', closeLossModal);
    document.getElementById('btn-cancel-loss-modal')?.addEventListener('click', closeLossModal);
    lossModal?.addEventListener('click', (e) => { if (e.target === lossModal) closeLossModal(); });
    document.getElementById('form-prod-loss')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const line = document.getElementById('prod-loss-line')?.value || '감지기반';
      const lossType = document.getElementById('prod-loss-type')?.value || '기타';
      const note = (document.getElementById('prod-loss-note')?.value || '').trim();
      state.dailyV2Data.entries.push({
        id: `loss_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        line,
        certRowId: null,
        code: '',
        name: '유실',
        lotNo: '',
        procs: [lossType],
        lossLabel: lossType,
        targetQty: 0,
        actualQty: '',
        workerHours: {},
        note,
        isLoss: true
      });
      saveLocalDailyV2();
      markAsDirty(true);
      closeLossModal();
      renderProductionV2();
    });

    // 일보 행 삭제
    container.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.btn-del-prod-entry');
      if (!delBtn) return;
      const entryId = delBtn.dataset.entryId;
      state.dailyV2Data.entries = (state.dailyV2Data.entries || []).filter(x => x.id !== entryId);
      saveLocalDailyV2();
      markAsDirty(true);
      renderProductionV2();
    });

    document.getElementById('btn-prod-save')?.addEventListener('click', saveDailyV2ToDb);

    // 일보 입력 셀 포커스 시 기존 값 전체 선택 (키보드 입력 시 바로 덮어쓰기)
    container.addEventListener('focusin', (e) => {
      if (e.target.matches('.prod-v2-qty-input, .prod-v2-hour-input')) {
        e.target.select();
        e.target._justFocused = true;
      }
    });
    container.addEventListener('mouseup', (e) => {
      if (e.target.matches('.prod-v2-qty-input, .prod-v2-hour-input') && e.target._justFocused) {
        e.preventDefault();
        e.target._justFocused = false;
      }
    });

    // 일보 입력 이벤트 (완료수량, 작업자시간, 비고)
    container.addEventListener('change', (e) => {
      const t = e.target;
      const entryId = t.dataset.entryId;
      if (!entryId) return;
      const ent = (state.dailyV2Data.entries || []).find(x => x.id === entryId);
      if (!ent) return;

      if (t.classList.contains('prod-v2-qty-input')) {
        ent.actualQty = parseSafeInt(t.value) || '';
        saveLocalDailyV2();
        markAsDirty(true);
        renderProductionV2();
      } else if (t.classList.contains('prod-v2-hour-input')) {
        const wId = t.dataset.workerId;
        if (!ent.workerHours) ent.workerHours = {};
        const h = parseFloat(t.value);
        ent.workerHours[wId] = h > 0 ? h : '';
        saveLocalDailyV2();
        markAsDirty(true);
        renderProductionV2();
      } else if (t.classList.contains('prod-v2-note-input')) {
        ent.note = t.value;
        saveLocalDailyV2();
        markAsDirty(true);
      }
    });

    // 공수집계 필터
    document.getElementById('wh-month-input')?.addEventListener('change', (e) => {
      state.whMonth = e.target.value;
      renderWorkhoursView();
    });
    document.querySelectorAll('#wh-line-filter-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.whLineFilter = btn.dataset.line;
        renderWorkhoursView();
      });
    });
  }

  // =========================================================================
  // 14-D. 근태관리 (tab-attendance) — 구글 캘린더 스타일, 기간/드래그&드롭, 휴무일 & 설정 연동
  // =========================================================================
  function saveLocalAttendanceData() {
    try {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE_TYPES, JSON.stringify(state.attendanceTypes || []));
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE_RECORDS, JSON.stringify(state.attendanceRecords || []));
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE_HOLIDAYS, JSON.stringify(state.attendanceHolidays || {}));
    } catch (e) {
      console.warn('근태 로컬 저장 실패:', e);
    }
  }

  async function saveAttendanceToDb(silent = false) {
    saveLocalAttendanceData();
    if (!isFirestoreActive || !db) {
      if (!silent) showToast('근태 정보가 로컬에 저장되었습니다.');
      return;
    }
    try {
      await db.collection('pms_metadata').doc('attendance_data').set({
        types: state.attendanceTypes || [],
        records: state.attendanceRecords || [],
        holidays: state.attendanceHolidays || {}
      });
      if (!silent) showToast('근태 정보가 DB에 저장되었습니다.');
    } catch (e) {
      console.error('근태 DB 저장 실패:', e);
      if (!silent) showToast('로컬에 임시 저장되었습니다 (DB 오류)');
    }
  }

  function getAttendanceTypeById(typeId) {
    const types = state.attendanceTypes || DEFAULT_ATTENDANCE_TYPES;
    return types.find(t => t.id === typeId) || types[0] || { id: 'att_annual', name: '연차', color: '#2563eb' };
  }

  function getWorkerAttendanceOnDate(workerId, dateStr) {
    if (!workerId || !dateStr) return null;
    const rec = (state.attendanceRecords || []).find(r => r.workerId === workerId && r.date === dateStr);
    if (!rec) return null;
    const t = getAttendanceTypeById(rec.typeId);
    return {
      ...rec,
      typeName: t.name,
      color: t.color || '#2563eb'
    };
  }

  function getAttendanceDayStatus(dateStr) {
    const dt = new Date(dateStr + 'T00:00:00');
    const dow = dt.getDay();
    const isWeekend = (dow === 0 || dow === 6);
    const holidayName = KR_HOLIDAYS[dateStr] || '';
    const closedReason = (state.attendanceHolidays && state.attendanceHolidays[dateStr]) || '';
    const isOffDay = isWeekend || !!holidayName || !!closedReason;
    return { dow, isWeekend, holidayName, closedReason, isOffDay };
  }

  function getPlanWeekLabelForSunday(sundayStr) {
    // 생산계획(generateYearWeeks)과 동일하게 해당 주 금요일 기준으로 W1~W53 계산
    const friStr = addDaysStr(sundayStr, 5);
    const friDate = new Date(friStr + 'T00:00:00');
    const y = friDate.getFullYear();
    const weeks = generateYearWeeks(String(y));
    for (let i = 0; i < weeks.length; i++) {
      const wDates = getPlanWeekFridayDates(String(y), weeks[i].id);
      if (wDates.rawFridayStr === friStr) {
        return weeks[i].id;
      }
    }
    return `W${Math.max(1, Math.ceil((friDate - new Date(y, 0, 1)) / (7 * 86400000)))}`;
  }

  function getAttendanceTypeDayWeight(typeName) {
    const n = String(typeName || '').trim();
    if (n === '연차') return 1;
    if (n === '반차') return 0.5;
    return 0;
  }

  function renderAttendanceModule() {
    const monthStr = state.attendanceMonth || getTodayDateString().slice(0, 7);
    const [yearNum, monthNum] = monthStr.split('-').map(Number);

    const yearSel = document.getElementById('att-year-select');
    if (yearSel) {
      const baseYear = new Date().getFullYear();
      const minY = Math.min(baseYear - 2, yearNum - 1);
      const maxY = Math.max(baseYear + 2, yearNum + 1);
      let yHtml = '';
      for (let y = minY; y <= maxY; y++) {
        yHtml += `<option value="${y}" ${y === yearNum ? 'selected' : ''}>${y}년</option>`;
      }
      yearSel.innerHTML = yHtml;
      yearSel.value = String(yearNum);
    }
    const monthSel = document.getElementById('att-month-select');
    if (monthSel) {
      monthSel.value = String(monthNum).padStart(2, '0');
    }

    const badgeEl = document.getElementById('att-sidebar-month-badge');
    if (badgeEl) badgeEl.textContent = `${yearNum}년`;

    // 범례 렌더링
    const legendEl = document.getElementById('att-legend-wrap');
    if (legendEl) {
      const typePills = (state.attendanceTypes || []).map(t =>
        `<span class="att-legend-pill"><span class="att-legend-dot" style="background:${t.color};"></span>${t.name}</span>`
      ).join('');
      legendEl.innerHTML = `${typePills}<span class="att-legend-pill" style="background:#fef2f2; color:#b91c1c; border-color:#fecaca;">국경일</span><span class="att-legend-pill" style="background:#f5f3ff; color:#6d28d9; border-color:#ddd6fe;">회사휴무</span>`;
    }

    // 캘린더 그리드 생성 (해당 월 1일 포함 주의 일요일 ~ 말일 포함 주의 토요일)
    const firstOfMonth = new Date(yearNum, monthNum - 1, 1);
    const lastOfMonth = new Date(yearNum, monthNum, 0);
    const startSunday = new Date(firstOfMonth);
    startSunday.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    const endSaturday = new Date(lastOfMonth);
    endSaturday.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

    const todayStr = getTodayDateString();
    const workersMap = new Map((state.workers || []).map(w => [w.id, w]));

    const recByDate = new Map();
    (state.attendanceRecords || []).forEach(r => {
      if (!recByDate.has(r.date)) recByDate.set(r.date, []);
      recByDate.get(r.date).push(r);
    });

    const calBody = document.getElementById('att-cal-body');
    if (calBody) {
      let html = '';
      let weekCount = 0;
      const cursor = new Date(startSunday);
      while (cursor <= endSaturday) {
        weekCount++;
        const sundayStr = formatDateYMD(cursor);
        const weekLabel = getPlanWeekLabelForSunday(sundayStr);

        html += `<div class="att-cal-row">`;
        html += `<div class="att-week-cell"><span class="att-week-badge">${weekLabel}</span></div>`;

        for (let d = 0; d < 7; d++) {
          const ds = formatDateYMD(cursor);
          const isOtherMonth = cursor.getMonth() !== (monthNum - 1);
          const isToday = ds === todayStr;
          const status = getAttendanceDayStatus(ds);

          const classes = ['att-day-cell'];
          if (isOtherMonth) classes.push('is-other-month');
          if (isToday) classes.push('is-today');
          if (status.dow === 0) classes.push('is-sun');
          if (status.dow === 6) classes.push('is-sat');
          if (status.isWeekend) classes.push('is-weekend');
          if (status.holidayName) classes.push('is-holiday');
          if (status.closedReason) classes.push('is-closed');
          if (status.isOffDay) classes.push('is-offday');

          let tagHtml = '';
          if (status.holidayName) {
            tagHtml = `<span class="att-day-tag tag-holiday" title="${status.holidayName}">${status.holidayName}</span>`;
          } else if (status.closedReason) {
            tagHtml = `<span class="att-day-tag tag-closed" title="${status.closedReason}">휴무: ${status.closedReason}</span>`;
          }

          const dayRecs = (recByDate.get(ds) || []).filter(r => {
            const w = workersMap.get(r.workerId);
            if (state.attendanceSidebarGroup !== 'ALL' && (!w || (w.group || '감지기반') !== state.attendanceSidebarGroup)) return false;
            if (state.attendanceSidebarWorker !== 'ALL' && r.workerId !== state.attendanceSidebarWorker) return false;
            return true;
          });

          const eventsHtml = dayRecs.map(r => {
            const w = workersMap.get(r.workerId);
            const t = getAttendanceTypeById(r.typeId);
            const wName = w ? w.name : '미상';
            return `
              <div class="att-event-chip" draggable="true" data-rec-id="${r.id}" data-date="${ds}" style="background:${t.color || '#2563eb'};" title="${wName} - ${t.name}${r.memo ? ' (' + r.memo + ')' : ''}">
                <span class="att-event-chip-label">${wName}</span>
                <span class="att-event-chip-type">${t.name}</span>
              </div>
            `;
          }).join('');

          html += `
            <div class="${classes.join(' ')}" data-date="${ds}">
              <div class="att-day-top">
                <span class="att-day-num">${cursor.getDate()}</span>
                ${tagHtml}
              </div>
              <div class="att-events-wrap">${eventsHtml}</div>
            </div>
          `;
          cursor.setDate(cursor.getDate() + 1);
        }
        html += `</div>`;
      }
      calBody.style.setProperty('--att-weeks', String(Math.max(weekCount, 5)));
      calBody.innerHTML = html;
    }

    renderAttendanceSidebar();
  }

  function renderAttendanceSidebar() {
    const monthStr = state.attendanceMonth || getTodayDateString().slice(0, 7);
    const yearStr = monthStr.slice(0, 4);
    const workers = state.workers || [];
    const mainGroups = ['감지기반', '유도등반', '수신기반'];
    const normalizeGrp = (g) => {
      const s = String(g || '감지기반').trim();
      return s || '감지기반';
    };
    const matchGroupFilter = (wGroup, filterVal) => {
      if (!filterVal || filterVal === 'ALL') return true;
      const g = normalizeGrp(wGroup);
      if (filterVal === '기타') return !mainGroups.includes(g);
      return g === filterVal;
    };

    const grpSelect = document.getElementById('att-filter-group');
    if (grpSelect) grpSelect.value = state.attendanceSidebarGroup || 'ALL';

    const workerSelect = document.getElementById('att-filter-worker');
    if (workerSelect) {
      const grpWorkers = workers.filter(w => matchGroupFilter(w.group, state.attendanceSidebarGroup));
      const curVal = state.attendanceSidebarWorker || 'ALL';
      workerSelect.innerHTML = `<option value="ALL">전체 작업자</option>` +
        grpWorkers.map(w => `<option value="${w.id}" ${w.id === curVal ? 'selected' : ''}>${w.name} (${normalizeGrp(w.group)})</option>`).join('');
      if (curVal !== 'ALL' && !grpWorkers.some(w => w.id === curVal)) {
        state.attendanceSidebarWorker = 'ALL';
        workerSelect.value = 'ALL';
      }
    }

    const filteredWorkers = workers.filter(w => {
      if (!matchGroupFilter(w.group, state.attendanceSidebarGroup)) return false;
      if (state.attendanceSidebarWorker && state.attendanceSidebarWorker !== 'ALL' && w.id !== state.attendanceSidebarWorker) return false;
      return true;
    });

    // 연간 기준 집계 (선택된 연도 전체)
    const yearRecs = (state.attendanceRecords || []).filter(r => (r.date || '').startsWith(yearStr + '-'));
    let totalAnnualDays = 0;
    let totalHalfDays = 0;
    let totalOtherCount = 0;

    // 반별 그룹화
    const groupedMap = new Map();
    const orderGroups = ['감지기반', '유도등반', '수신기반'];
    filteredWorkers.forEach(w => {
      const g = normalizeGrp(w.group);
      const bucket = mainGroups.includes(g) ? g : '기타';
      if (!groupedMap.has(bucket)) groupedMap.set(bucket, []);
      groupedMap.get(bucket).push(w);
    });

    const sortedGroupKeys = [...orderGroups.filter(g => groupedMap.has(g))];
    if (groupedMap.has('기타')) sortedGroupKeys.push('기타');

    const expandedSet = new Set(state.attendanceExpandedWorkers || []);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const sectionsHtml = sortedGroupKeys.map(grpName => {
      const grpWorkers = groupedMap.get(grpName) || [];
      const itemsHtml = grpWorkers.map(w => {
        const wRecs = yearRecs
          .filter(r => r.workerId === w.id)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        let usedDays = 0;
        const typeCounts = new Map();

        wRecs.forEach(r => {
          const t = getAttendanceTypeById(r.typeId);
          const weight = getAttendanceDayWeight(t.name);
          usedDays += weight;
          if (t.name === '연차') totalAnnualDays += 1;
          else if (t.name === '반차') totalHalfDays += 0.5;
          else totalOtherCount += 1;

          const prev = typeCounts.get(t.id) || { name: t.name, color: t.color || '#2563eb', count: 0 };
          prev.count += 1;
          typeCounts.set(t.id, prev);
        });

        const chipsHtml = Array.from(typeCounts.values()).map(tc =>
          `<span class="att-summary-chip" style="background:${tc.color};">${tc.name} ${tc.count}건</span>`
        ).join('');

        const isExpanded = expandedSet.has(w.id);
        let datesHtml = '';
        if (isExpanded) {
          if (wRecs.length === 0) {
            datesHtml = `<div class="att-worker-dates-list"><span style="font-size:11px; color:#94a3b8; padding:2px 4px;">${yearStr}년 사용 기록이 없습니다.</span></div>`;
          } else {
            datesHtml = `<div class="att-worker-dates-list">` + wRecs.map(r => {
              const t = getAttendanceTypeById(r.typeId);
              const dt = new Date(r.date + 'T00:00:00');
              const dow = dayNames[dt.getDay()] || '';
              const labelDate = `${r.date.slice(5).replace('-', '/')} (${dow})`;
              return `
                <div class="att-worker-date-row" data-rec-id="${r.id}" title="클릭하여 일정 수정">
                  <div class="att-worker-date-left">
                    <span class="att-worker-date-dot" style="background:${t.color || '#2563eb'};"></span>
                    <strong>${labelDate}</strong>
                    <span style="color:${t.color || '#2563eb'}; font-weight:700;">${t.name}</span>
                  </div>
                  ${r.memo ? `<span class="att-worker-date-memo">${r.memo}</span>` : ''}
                </div>
              `;
            }).join('') + `</div>`;
          }
        }

        return `
          <div class="att-worker-summary-item is-clickable ${isExpanded ? 'is-expanded' : ''}" data-worker-id="${w.id}">
            <div class="att-worker-summary-top" style="${chipsHtml ? '' : 'margin-bottom:0;'}">
              <div class="att-worker-name-wrap">
                <span>${w.name}</span>
                <span class="att-worker-chevron">▼</span>
              </div>
              <span class="att-worker-days-badge">사용 ${usedDays}일</span>
            </div>
            ${chipsHtml ? `<div class="att-worker-type-chips">${chipsHtml}</div>` : ''}
            ${datesHtml}
          </div>
        `;
      }).join('');

      return `
        <div class="att-group-section">
          <div class="att-group-header">
            <span>${grpName}</span>
            <span class="att-group-count">${grpWorkers.length}명</span>
          </div>
          ${itemsHtml}
        </div>
      `;
    }).join('');

    const kpiEl = document.getElementById('att-sidebar-kpis');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="att-kpi-box">
          <span class="att-kpi-label">총 사용일수</span>
          <span class="att-kpi-val" style="color:#1d4ed8;">${totalAnnualDays + totalHalfDays}일</span>
        </div>
        <div class="att-kpi-box">
          <span class="att-kpi-label">연차 / 반차</span>
          <span class="att-kpi-val" style="font-size:12px;">${totalAnnualDays} / ${totalHalfDays}일</span>
        </div>
        <div class="att-kpi-box">
          <span class="att-kpi-label">기타 근태</span>
          <span class="att-kpi-val" style="color:#475569;">${totalOtherCount}건</span>
        </div>
      `;
    }

    const listEl = document.getElementById('att-sidebar-list');
    if (listEl) {
      listEl.innerHTML = sectionsHtml || '<div style="text-align:center; padding:24px; color:#94a3b8; font-size:12.5px;">조건에 맞는 작업자가 없습니다.</div>';
    }
  }

  let attModalState = {
    mode: 'worker', // 'worker' | 'holiday'
    activeGroup: '감지기반',
    selectedWorkers: new Set(),
    selectedTypeId: 'att_annual'
  };

  function openAttendanceModal({ editId = '', startDate = '', endDate = '', mode = 'worker' } = {}) {
    const overlay = document.getElementById('att-modal-overlay');
    if (!overlay) return;

    const sDate = startDate || getTodayDateString();
    const eDate = endDate || sDate;

    document.getElementById('att-edit-id').value = editId || '';
    document.getElementById('att-start-date').value = sDate;
    document.getElementById('att-end-date').value = eDate;

    const btnDel = document.getElementById('btn-att-delete');
    const btnHolRem = document.getElementById('btn-att-holiday-remove');
    const titleEl = document.getElementById('att-modal-title');
    const multiHint = document.getElementById('att-worker-multi-hint');

    attModalState.selectedWorkers = new Set();
    const defaultType = (state.attendanceTypes || [])[0];
    attModalState.selectedTypeId = defaultType ? defaultType.id : 'att_annual';

    if (editId) {
      const rec = (state.attendanceRecords || []).find(r => r.id === editId);
      if (rec) {
        attModalState.selectedWorkers.add(rec.workerId);
        attModalState.selectedTypeId = rec.typeId;
        const wObj = (state.workers || []).find(w => w.id === rec.workerId);
        const wGrp = String((wObj && wObj.group) || '감지기반').trim() || '감지기반';
        attModalState.activeGroup = ['감지기반', '유도등반', '수신기반'].includes(wGrp) ? wGrp : '기타';
        document.getElementById('att-start-date').value = rec.date;
        document.getElementById('att-end-date').value = rec.date;
        document.getElementById('att-memo').value = rec.memo || '';
      }
      if (titleEl) titleEl.textContent = '✏️ 근태 일정 수정';
      if (btnDel) btnDel.style.display = '';
      if (multiHint) multiHint.style.display = 'none';
      mode = 'worker';
    } else {
      attModalState.activeGroup = (state.attendanceSidebarGroup && state.attendanceSidebarGroup !== 'ALL')
        ? state.attendanceSidebarGroup
        : '감지기반';
      document.getElementById('att-memo').value = '';
      if (titleEl) titleEl.textContent = '📅 근태 · 휴무일 등록';
      if (btnDel) btnDel.style.display = 'none';
      if (multiHint) multiHint.style.display = '';
    }

    const existingHolReason = (state.attendanceHolidays && state.attendanceHolidays[sDate]) || '';
    document.getElementById('att-holiday-reason').value = existingHolReason;
    if (btnHolRem) btnHolRem.style.display = existingHolReason ? '' : 'none';

    setAttModalMode(mode);
    renderAttModalPickers(!!editId);

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAttendanceModal() {
    const overlay = document.getElementById('att-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function setAttModalMode(mode) {
    attModalState.mode = mode;
    document.querySelectorAll('#att-modal-mode-tabs .att-mode-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const secW = document.getElementById('att-section-worker');
    const secH = document.getElementById('att-section-holiday');
    if (secW) secW.style.display = mode === 'worker' ? '' : 'none';
    if (secH) secH.style.display = mode === 'holiday' ? '' : 'none';
  }

  function renderAttModalPickers(isSingleEdit = false) {
    const workers = state.workers || [];
    const mainGroups = ['감지기반', '유도등반', '수신기반'];
    const getBucket = (g) => {
      const s = String(g || '감지기반').trim() || '감지기반';
      return mainGroups.includes(s) ? s : '기타';
    };

    const availableBuckets = [...mainGroups];
    if (workers.some(w => getBucket(w.group) === '기타')) availableBuckets.push('기타');
    if (!availableBuckets.includes(attModalState.activeGroup)) {
      attModalState.activeGroup = availableBuckets[0] || '감지기반';
    }

    const gList = document.getElementById('att-worker-group-list');
    if (gList) {
      gList.innerHTML = availableBuckets.map(grp => {
        const grpWorkers = workers.filter(w => getBucket(w.group) === grp);
        const selCnt = grpWorkers.filter(w => attModalState.selectedWorkers.has(w.id)).length;
        const activeCls = attModalState.activeGroup === grp ? 'active' : '';
        return `
          <button type="button" class="att-worker-group-btn ${activeCls}" data-group="${grp}">
            <span>${grp}</span>
            ${selCnt > 0 ? `<span class="att-worker-group-sel-cnt">${selCnt}</span>` : ''}
          </button>
        `;
      }).join('');
    }

    const wPicker = document.getElementById('att-worker-picker');
    if (wPicker) {
      const grpWorkers = workers.filter(w => getBucket(w.group) === attModalState.activeGroup);
      wPicker.innerHTML = grpWorkers.length > 0
        ? grpWorkers.map(w => {
            const sel = attModalState.selectedWorkers.has(w.id);
            return `<button type="button" class="att-pick-chip ${sel ? 'is-selected' : ''}" data-worker-id="${w.id}">${w.name}</button>`;
          }).join('')
        : `<span style="font-size:12px; color:#94a3b8; padding:6px;">소속 작업자가 없습니다.</span>`;
      wPicker.dataset.single = isSingleEdit ? 'true' : 'false';
    }

    const tPicker = document.getElementById('att-type-picker');
    if (tPicker) {
      tPicker.innerHTML = (state.attendanceTypes || []).map(t => {
        const sel = attModalState.selectedTypeId === t.id;
        const style = sel ? `background:${t.color}; color:#fff;` : `border-color:${t.color};`;
        const dot = sel ? '' : `<span class="att-legend-dot" style="background:${t.color};"></span>`;
        return `<button type="button" class="att-type-chip ${sel ? 'is-selected' : ''}" data-type-id="${t.id}" style="${style}">${dot}${t.name}</button>`;
      }).join('');
    }
  }

  function renderAttendanceTypeSettings() {
    const tbody = document.getElementById('master-att-types-tbody');
    if (!tbody) return;
    const types = state.attendanceTypes || [];
    if (types.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">등록된 근태유형이 없습니다.</td></tr>`;
      return;
    }
    tbody.innerHTML = types.map((t, idx) => {
      const weight = getAttendanceDayWeight(t.name);
      const weightText = weight > 0 ? `${weight}일 차감` : '표시만 (일수 제외)';
      return `
        <tr data-type-id="${t.id}">
          <td style="text-align:center; color:#64748b;">${idx + 1}</td>
          <td><input type="text" class="form-input form-input-sm att-setting-name-input" data-id="${t.id}" value="${String(t.name).replace(/"/g, '&quot;')}"></td>
          <td style="text-align:center;">
            <input type="color" class="att-setting-color-input" data-id="${t.id}" value="${t.color || '#2563eb'}" style="width:44px; height:28px; padding:2px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;">
          </td>
          <td style="text-align:center; font-size:12px; color:#475569; font-weight:600;">${weightText}</td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-xs btn-outline text-danger btn-del-att-type" data-id="${t.id}">삭제</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function navigateToAttendanceTypeSettings() {
    activateTab('tab-settings').then(() => {
      document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-sub-pane').forEach(p => p.classList.remove('active'));
      const targetBtn = document.querySelector('.settings-nav-btn[data-pane="settings-pane-attendance"]');
      if (targetBtn) targetBtn.classList.add('active');
      document.getElementById('settings-pane-attendance')?.classList.add('active');
      renderAttendanceTypeSettings();
    });
  }

  function initAttendanceModule() {
    // 월 이동 버튼
    const shiftMonth = (delta) => {
      const cur = state.attendanceMonth || getTodayDateString().slice(0, 7);
      const [y, m] = cur.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      state.attendanceMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      renderAttendanceModule();
    };
    document.getElementById('btn-att-prev-month')?.addEventListener('click', () => shiftMonth(-1));
    document.getElementById('btn-att-next-month')?.addEventListener('click', () => shiftMonth(1));
    document.getElementById('btn-att-today')?.addEventListener('click', () => {
      state.attendanceMonth = getTodayDateString().slice(0, 7);
      renderAttendanceModule();
    });

    const applyYearMonthSelect = () => {
      const y = document.getElementById('att-year-select')?.value;
      const m = document.getElementById('att-month-select')?.value;
      if (y && m) {
        state.attendanceMonth = `${y}-${m}`;
        renderAttendanceModule();
      }
    };
    document.getElementById('att-year-select')?.addEventListener('change', applyYearMonthSelect);
    document.getElementById('att-month-select')?.addEventListener('change', applyYearMonthSelect);

    document.getElementById('btn-att-new-event')?.addEventListener('click', () => {
      const today = getTodayDateString();
      openAttendanceModal({ startDate: today, endDate: today, mode: 'worker' });
    });

    // 설정 화면 이동 (근태유형 수정)
    document.getElementById('btn-att-goto-settings')?.addEventListener('click', navigateToAttendanceTypeSettings);
    document.getElementById('btn-att-modal-goto-settings')?.addEventListener('click', () => {
      closeAttendanceModal();
      navigateToAttendanceTypeSettings();
    });
    document.getElementById('btn-settings-goto-attendance')?.addEventListener('click', () => {
      activateTab('tab-attendance');
    });

    // 사이드바 필터 & 작업자 클릭 시 사용 날짜 펼침
    document.getElementById('att-filter-group')?.addEventListener('change', (e) => {
      state.attendanceSidebarGroup = e.target.value;
      state.attendanceSidebarWorker = 'ALL';
      renderAttendanceModule();
    });
    document.getElementById('att-filter-worker')?.addEventListener('change', (e) => {
      state.attendanceSidebarWorker = e.target.value;
      renderAttendanceModule();
    });
    document.getElementById('att-sidebar-list')?.addEventListener('click', (e) => {
      const dateRow = e.target.closest('.att-worker-date-row');
      if (dateRow) {
        e.stopPropagation();
        const recId = dateRow.dataset.recId;
        if (recId) openAttendanceModal({ editId: recId });
        return;
      }
      const card = e.target.closest('.att-worker-summary-item');
      if (!card) return;
      const wId = card.dataset.workerId;
      if (!wId) return;
      const arr = state.attendanceExpandedWorkers || [];
      const idx = arr.indexOf(wId);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(wId);
      state.attendanceExpandedWorkers = arr;
      renderAttendanceSidebar();
    });

    // 캘린더: 날짜 드래그 선택(기간 등록) & 일정 칩 클릭 & 드래그&드롭 이동
    const calBody = document.getElementById('att-cal-body');
    if (calBody) {
      let dragSelecting = false;
      let dragStartDate = null;
      let dragEndDate = null;
      let draggingRecId = null;

      const updateDragSelectionUI = () => {
        calBody.querySelectorAll('.att-day-cell').forEach(cell => {
          cell.classList.remove('is-drag-selecting');
          if (dragSelecting && dragStartDate && dragEndDate) {
            const ds = cell.dataset.date;
            const s = dragStartDate <= dragEndDate ? dragStartDate : dragEndDate;
            const e = dragStartDate <= dragEndDate ? dragEndDate : dragStartDate;
            if (ds >= s && ds <= e && !cell.classList.contains('is-offday')) {
              cell.classList.add('is-drag-selecting');
            }
          }
        });
      };

      calBody.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.att-event-chip')) return;
        const cell = e.target.closest('.att-day-cell');
        if (!cell) return;
        dragSelecting = true;
        dragStartDate = cell.dataset.date;
        dragEndDate = cell.dataset.date;
        updateDragSelectionUI();
      });

      calBody.addEventListener('mousemove', (e) => {
        if (!dragSelecting) return;
        const cell = e.target.closest('.att-day-cell');
        if (!cell) return;
        if (cell.dataset.date !== dragEndDate) {
          dragEndDate = cell.dataset.date;
          updateDragSelectionUI();
        }
      });

      window.addEventListener('mouseup', () => {
        if (!dragSelecting) return;
        const s = dragStartDate <= dragEndDate ? dragStartDate : dragEndDate;
        const e = dragStartDate <= dragEndDate ? dragEndDate : dragStartDate;
        dragSelecting = false;
        updateDragSelectionUI();

        if (!s) return;
        const st = getAttendanceDayStatus(s);
        if (s === e && st.isOffDay) {
          if (st.isWeekend || st.holidayName) {
            showToast('주말 및 국경일에는 일정을 생성할 수 없습니다.');
            return;
          }
          // 회사 휴무일 클릭 시에는 휴무 해제/수정 모달로 열기
          openAttendanceModal({ startDate: s, endDate: e, mode: 'holiday' });
          return;
        }
        openAttendanceModal({ startDate: s, endDate: e, mode: 'worker' });
      });

      calBody.addEventListener('click', (e) => {
        const chip = e.target.closest('.att-event-chip');
        if (chip) {
          e.stopPropagation();
          openAttendanceModal({ editId: chip.dataset.recId });
        }
      });

      // 드래그 & 드롭 이동
      calBody.addEventListener('dragstart', (e) => {
        const chip = e.target.closest('.att-event-chip');
        if (!chip) return;
        draggingRecId = chip.dataset.recId;
        chip.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggingRecId);
        }
      });

      calBody.addEventListener('dragend', () => {
        draggingRecId = null;
        calBody.querySelectorAll('.att-event-chip.is-dragging').forEach(el => el.classList.remove('is-dragging'));
        calBody.querySelectorAll('.att-day-cell').forEach(el => el.classList.remove('is-drop-target', 'is-drop-blocked'));
      });

      calBody.addEventListener('dragover', (e) => {
        if (!draggingRecId) return;
        const cell = e.target.closest('.att-day-cell');
        if (!cell) return;
        e.preventDefault();
        calBody.querySelectorAll('.att-day-cell').forEach(el => el.classList.remove('is-drop-target', 'is-drop-blocked'));
        if (cell.classList.contains('is-offday')) {
          cell.classList.add('is-drop-blocked');
        } else {
          cell.classList.add('is-drop-target');
        }
      });

      calBody.addEventListener('drop', (e) => {
        if (!draggingRecId) return;
        e.preventDefault();
        const cell = e.target.closest('.att-day-cell');
        calBody.querySelectorAll('.att-day-cell').forEach(el => el.classList.remove('is-drop-target', 'is-drop-blocked'));
        if (!cell) return;

        const targetDate = cell.dataset.date;
        const status = getAttendanceDayStatus(targetDate);
        if (status.isOffDay) {
          showToast('주말, 국경일, 회사 휴무일로는 이동할 수 없습니다.');
          return;
        }

        const rec = (state.attendanceRecords || []).find(r => r.id === draggingRecId);
        if (!rec || rec.date === targetDate) return;

        const dup = (state.attendanceRecords || []).some(r => r.id !== rec.id && r.workerId === rec.workerId && r.date === targetDate);
        if (dup) {
          showToast('해당 날짜에 이미 동일한 작업자의 근태가 등록되어 있습니다.');
          return;
        }

        rec.date = targetDate;
        saveAttendanceToDb(true);
        renderAttendanceModule();
        showToast(`${targetDate}로 근태 일정이 이동되었습니다.`);
      });
    }

    // 모달 이벤트
    document.getElementById('btn-close-att-modal')?.addEventListener('click', closeAttendanceModal);
    document.getElementById('btn-att-cancel')?.addEventListener('click', closeAttendanceModal);
    document.getElementById('att-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'att-modal-overlay') closeAttendanceModal();
    });

    document.querySelectorAll('#att-modal-mode-tabs .att-mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (document.getElementById('att-edit-id').value) return;
        setAttModalMode(btn.dataset.mode);
      });
    });

    document.getElementById('att-worker-group-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.att-worker-group-btn');
      if (!btn) return;
      attModalState.activeGroup = btn.dataset.group;
      const isSingle = document.getElementById('att-worker-picker')?.dataset.single === 'true';
      renderAttModalPickers(isSingle);
    });

    document.getElementById('att-worker-picker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.att-pick-chip');
      if (!btn) return;
      const wId = btn.dataset.workerId;
      const isSingle = document.getElementById('att-worker-picker').dataset.single === 'true';
      if (isSingle) {
        attModalState.selectedWorkers.clear();
        attModalState.selectedWorkers.add(wId);
      } else {
        if (attModalState.selectedWorkers.has(wId)) attModalState.selectedWorkers.delete(wId);
        else attModalState.selectedWorkers.add(wId);
      }
      renderAttModalPickers(isSingle);
    });

    document.getElementById('att-type-picker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.att-type-chip');
      if (!btn) return;
      attModalState.selectedTypeId = btn.dataset.typeId;
      renderAttModalPickers(document.getElementById('att-worker-picker').dataset.single === 'true');
    });

    document.getElementById('btn-att-delete')?.addEventListener('click', () => {
      const editId = document.getElementById('att-edit-id').value;
      if (!editId) return;
      state.attendanceRecords = (state.attendanceRecords || []).filter(r => r.id !== editId);
      saveAttendanceToDb(true);
      closeAttendanceModal();
      renderAttendanceModule();
      showToast('근태 일정이 삭제되었습니다.');
    });

    document.getElementById('btn-att-holiday-remove')?.addEventListener('click', () => {
      const s = document.getElementById('att-start-date').value;
      const e = document.getElementById('att-end-date').value || s;
      if (!s) return;
      let cur = s;
      let removed = 0;
      while (cur <= e) {
        if (state.attendanceHolidays && state.attendanceHolidays[cur]) {
          delete state.attendanceHolidays[cur];
          removed++;
        }
        cur = addDaysStr(cur, 1);
      }
      if (removed > 0) {
        saveAttendanceToDb(true);
        closeAttendanceModal();
        renderAttendanceModule();
        showToast(`${removed}일의 회사 휴무일이 해제되었습니다.`);
      }
    });

    document.getElementById('form-att-modal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const sDate = document.getElementById('att-start-date').value;
      const eDate = document.getElementById('att-end-date').value || sDate;
      if (!sDate || sDate > eDate) {
        alert('시작일과 종료일을 올바르게 선택해 주세요.');
        return;
      }

      if (attModalState.mode === 'holiday') {
        const reason = (document.getElementById('att-holiday-reason').value || '').trim();
        if (!reason) {
          alert('회사 휴무 사유를 입력해 주세요.');
          return;
        }
        if (!state.attendanceHolidays) state.attendanceHolidays = {};
        let cur = sDate;
        let cnt = 0;
        while (cur <= eDate) {
          const st = getAttendanceDayStatus(cur);
          if (!st.isWeekend && !st.holidayName) {
            state.attendanceHolidays[cur] = reason;
            cnt++;
          }
          cur = addDaysStr(cur, 1);
        }
        if (cnt === 0) {
          alert('선택한 기간에 평일이 없어 휴무일을 지정할 수 없습니다.');
          return;
        }
        saveAttendanceToDb(true);
        closeAttendanceModal();
        renderAttendanceModule();
        showToast(`${cnt}일이 회사 휴무일(${reason})로 지정되었습니다.`);
        return;
      }

      // 작업자 근태 등록 / 수정
      const editId = document.getElementById('att-edit-id').value;
      const workerIds = Array.from(attModalState.selectedWorkers);
      if (workerIds.length === 0) {
        alert('작업자를 1명 이상 선택해 주세요.');
        return;
      }
      const typeId = attModalState.selectedTypeId;
      const memo = (document.getElementById('att-memo').value || '').trim();

      if (editId) {
        const st = getAttendanceDayStatus(sDate);
        if (st.isOffDay) {
          alert('주말, 국경일, 회사 휴무일에는 일정을 등록할 수 없습니다.');
          return;
        }
        const rec = (state.attendanceRecords || []).find(r => r.id === editId);
        if (rec) {
          rec.date = sDate;
          rec.workerId = workerIds[0];
          rec.typeId = typeId;
          rec.memo = memo;
        }
        saveAttendanceToDb(true);
        closeAttendanceModal();
        renderAttendanceModule();
        showToast('근태 일정이 수정되었습니다.');
        return;
      }

      let added = 0;
      let cur = sDate;
      while (cur <= eDate) {
        const st = getAttendanceDayStatus(cur);
        if (!st.isOffDay) {
          workerIds.forEach(wId => {
            const existing = (state.attendanceRecords || []).find(r => r.workerId === wId && r.date === cur);
            if (existing) {
              existing.typeId = typeId;
              existing.memo = memo;
            } else {
              state.attendanceRecords.push({
                id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                date: cur,
                workerId: wId,
                typeId,
                memo
              });
            }
            added++;
          });
        }
        cur = addDaysStr(cur, 1);
      }

      if (added === 0) {
        alert('선택한 기간은 모두 주말·국경일·휴무일이라 일정을 생성할 수 없습니다.');
        return;
      }

      saveAttendanceToDb(true);
      closeAttendanceModal();
      renderAttendanceModule();
      showToast(`${added}건의 근태 일정이 등록되었습니다.`);
    });

    // 설정 화면: 근태유형 추가/수정/삭제
    document.getElementById('form-add-att-type')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('att-type-new-name');
      const colorEl = document.getElementById('att-type-new-color');
      const name = (nameEl?.value || '').trim();
      const color = colorEl?.value || '#0ea5e9';
      if (!name) return;
      if ((state.attendanceTypes || []).some(t => t.name === name)) {
        alert('이미 동일한 근태유형이 있습니다.');
        return;
      }
      state.attendanceTypes.push({
        id: 'att_' + Date.now(),
        name,
        color
      });
      nameEl.value = '';
      saveAttendanceToDb(true);
      renderAttendanceTypeSettings();
      showToast(`'${name}' 근태유형이 추가되었습니다.`);
    });

    const attTypesTbody = document.getElementById('master-att-types-tbody');
    if (attTypesTbody) {
      attTypesTbody.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const item = (state.attendanceTypes || []).find(t => t.id === id);
        if (!item) return;
        if (e.target.classList.contains('att-setting-name-input')) {
          const v = e.target.value.trim();
          if (v) item.name = v;
        } else if (e.target.classList.contains('att-setting-color-input')) {
          item.color = e.target.value;
        }
        saveAttendanceToDb(true);
        showToast('근태유형이 수정되었습니다.');
      });

      attTypesTbody.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-del-att-type');
        if (!delBtn) return;
        const id = delBtn.dataset.id;
        const item = (state.attendanceTypes || []).find(t => t.id === id);
        if (!item) return;
        if ((state.attendanceTypes || []).length <= 1) {
          alert('최소 1개 이상의 근태유형이 필요합니다.');
          return;
        }
        if (confirm(`'${item.name}' 근태유형을 삭제하시겠습니까?`)) {
          state.attendanceTypes = state.attendanceTypes.filter(t => t.id !== id);
          saveAttendanceToDb(true);
          renderAttendanceTypeSettings();
          showToast('근태유형이 삭제되었습니다.');
        }
      });
    }
  }

  // =========================================================================
  // 15. DOM 준비 완료 및 시스템 기동
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initAttendanceModule();
    startClock();
    initFirebase();
  });

})();
