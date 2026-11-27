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
    KFI_RECORDS: 'pms_kfi_records_v1',
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
    ATTENDANCE_HOLIDAYS: 'pms_attendance_holidays_v4',
    WORK_GROUPS: 'pms_work_groups_v4',
    THEME_MODE: 'pms_theme_mode_v4',
    RECEIVER_PLAN: 'pms_receiver_plan_v1',
    ST_CONFIG: 'pms_st_config_v1',
    AUTH_USERS: 'pms_auth_users_v1',
    AUTH_CONFIG: 'pms_auth_config_v1',
    AUTH_SESSION: 'pms_auth_session_v1',
    AUTH_SAVED_ID: 'pms_auth_saved_id_v1',
    REPORT_TEMPLATES: 'pms_report_templates_v1',
    REPORT_PRINTED: 'pms_report_printed_v1',
    REPORT_DEFAULT_POS: 'pms_report_default_pos_v1',
    ADMIN_AUDIT_LOGS: 'pms_admin_audit_logs_v1'
  };

  const DEFAULT_WORK_GROUPS = [
    { name: '감지기반', category: '직접제조' },
    { name: '유도등반', category: '직접제조' },
    { name: '수신기반', category: '직접제조' },
    { name: '생산관리', category: '제조지원' },
    { name: '제조기술', category: '제조지원' },
    { name: 'SMT반', category: '제조지원' },
    { name: '물류지원', category: '제조지원' }
  ];

  const DEFAULT_WORK_GROUP_CATEGORY_MAP = DEFAULT_WORK_GROUPS.reduce((acc, g) => {
    acc[g.name] = g.category;
    return acc;
  }, {});

  function normalizeWorkGroups(raw) {
    const source = Array.isArray(raw) ? raw : [];
    const normalized = [];
    const seen = new Set();

    source.forEach(item => {
      let name = '';
      let category = '';
      if (typeof item === 'string') {
        name = item.trim();
        category = DEFAULT_WORK_GROUP_CATEGORY_MAP[name] || '직접제조';
      } else if (item && typeof item === 'object') {
        name = String(item.name || '').trim();
        category = (item.category === '제조지원' || item.category === '직접제조')
          ? item.category
          : (DEFAULT_WORK_GROUP_CATEGORY_MAP[name] || '직접제조');
      }
      if (!name || seen.has(name)) return;
      seen.add(name);
      normalized.push({ name, category });
    });

    if (normalized.length === 0) {
      return DEFAULT_WORK_GROUPS.map(g => ({ ...g }));
    }

    // 기존 string[] 데이터에서 제조지원 그룹이 하나도 없는 경우 기본 제조지원 4개 그룹을 자동 병합
    const hasSupportGroup = normalized.some(g => g.category === '제조지원');
    if (!hasSupportGroup) {
      DEFAULT_WORK_GROUPS.filter(g => g.category === '제조지원').forEach(g => {
        if (!seen.has(g.name)) {
          seen.add(g.name);
          normalized.push({ ...g });
        }
      });
    }

    return normalized;
  }

  function getWorkGroupCategory(groupName) {
    const targetName = String(groupName || '').trim();
    if (!targetName) return '직접제조';
    const list = (typeof state !== 'undefined' && Array.isArray(state.workGroups) && state.workGroups.length > 0)
      ? state.workGroups
      : DEFAULT_WORK_GROUPS;
    const found = list.find(g => g && g.name === targetName);
    if (found && (found.category === '제조지원' || found.category === '직접제조')) {
      return found.category;
    }
    return DEFAULT_WORK_GROUP_CATEGORY_MAP[targetName] || '직접제조';
  }

  function getDirectWorkGroupNames() {
    const list = (typeof state !== 'undefined' && Array.isArray(state.workGroups) && state.workGroups.length > 0)
      ? state.workGroups
      : DEFAULT_WORK_GROUPS;
    return list.filter(g => g && g.category !== '제조지원').map(g => g.name);
  }

  function isDirectManufacturingWorker(worker) {
    if (!worker) return false;
    return getWorkGroupCategory(worker.group) === '직접제조';
  }

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
    workGroups: DEFAULT_WORK_GROUPS.map(g => ({ ...g })),

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
    certMasterEditMode: false,
    certDraftRows: [],
    certSavedRows: [],
    certFilterType: localStorage.getItem(STORAGE_KEYS.CERT_FILTER_TYPE) || 'writeDate',
    certFilterDate: localStorage.getItem(STORAGE_KEYS.CERT_FILTER_DATE) || '',
    certFilterLine: localStorage.getItem(STORAGE_KEYS.CERT_FILTER_LINE) || 'ALL',
    certFilterCategory: 'ALL',
    certFilterYear: String(new Date().getFullYear()),
    certFilterWeek: 'ALL',
    certFilterStatus: 'ALL',
    certFilterSearch: '',
    certMode: 'auto', // 'auto' | 'manual'
    certSelectedWeekId: 'W1',
    certAutoLineFilter: 'ALL',
    kfiDataMap: {},
    kfiRecords: [],
    csView: 'spec',
    csFilterYear: String(new Date().getFullYear()),
    csFilterApplyTypes: [],
    csFilterReceiptDate: 'ALL',
    departments: [],
    activeModalDraftRowId: null,

    // 품질검사 상태 (검정현황 연동)
    qualityRows: [],
    qualityViewMode: 'pending', // 'pending' | 'passed'
    qualityFilterDate: localStorage.getItem(STORAGE_KEYS.QUALITY_FILTER_DATE) || '',

    // 생산계획 상태
    planData: null,
    planFilterGroup: 'ALL',
    planSearchText: '',

    // 수신기계획 상태
    receiverPlanRows: [],
    rpSelectedIds: new Set(),
    rpStatusFilter: 'ALL',
    rpFilterYear: String(new Date().getFullYear()),
    rpUndoStack: [],

    // 공정검사 보고서 양식 & 출력 상태
    reportTemplates: [],
    activeReportTemplateId: null,
    reportPrintedMap: {},

    // 반별 활성 라인 (생산일보: daily=일보작성, workhours=공수집계)
    activeLines: {
      schedule: 'ALL',
      daily: 'daily'
    },

    // 일정계획 v2 & 생산일보 v2 상태
    inspLineFilter: 'ALL',
    inspStatusFilter: 'ALL',
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
    dailyProcLinks: (() => {
      try {
        const raw = localStorage.getItem('pms_daily_proc_link_v1');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {
        '감지기반': [['assembly'], ['inspect'], ['pack']],
        '유도등반': [['assembly'], ['inspect'], ['pack']],
        '수신기반': [['assembly'], ['inspect'], ['pack']]
      };
    })(),
    dailyProcLinkSelected: { '감지기반': [], '유도등반': [], '수신기반': [] },
    dailyV2Data: { supportByLine: { '감지기반': [], '유도등반': [], '수신기반': [] }, entries: [] },
    whMonth: getTodayDateString().slice(0, 7),
    whLineFilter: 'ALL',
    whUnit: 'H', // 'H' | 'M' | 'S'
    whIncludeAttLoss: false,
    whItemSearch: '',
    whExpandedGroups: new Set(),
    whSyncedMonths: new Set(),
    stConfig: { items: [], excludedCodes: [] },
    authUsers: [],
    currentUser: null,

    // 근태관리 & 캘린더 상태
    calendarMode: 'attendance', // 'attendance' | 'schedule'
    calSchedLineFilter: 'ALL',  // 'ALL' | '감지기반' | '유도등반' | '수신기반'
    calSchedStatusFilter: 'ALL', // 'ALL' | '등록완료' | '검정신청' | '품검요청' | '일정완료'
    calSchedExpandedWeekIdx: null,
    calSchedSelectedDate: null,
    attendanceMonth: getTodayDateString().slice(0, 7),
    attendanceTypes: [],
    attendanceRecords: [],
    attendanceHolidays: {},
    attendanceSidebarGroup: 'ALL',
    attendanceSidebarWorker: 'ALL',
    attendanceExpandedWorkers: [],

    // 미저장 변경사항 플래그
    isDirty: false,
    dirtyTabs: new Set()
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
  function updateFooterLastSaved() {
    const el = document.getElementById('footer-last-saved');
    if (!el) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    el.textContent = `최근 저장: ${timeStr}`;
  }

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
    if (typeof message === 'string' && (message.includes('저장') || message.includes('동기화') || message.includes('승인') || message.includes('삭제'))) {
      updateFooterLastSaved();
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
      badge.classList.toggle('is-offline', !isConnected);
      badge.classList.toggle('is-connected', isConnected);
      badge.style.backgroundColor = '';
      badge.style.borderColor = '';
    }
  }

  function markAsDirty(isDirty = true, clearAll = false) {
    if (!(state.dirtyTabs instanceof Set)) state.dirtyTabs = new Set();
    if (isDirty) {
      if (state.currentTab) state.dirtyTabs.add(state.currentTab);
      state.isDirty = true;
    } else if (clearAll) {
      state.dirtyTabs.clear();
      state.isDirty = false;
    } else {
      if (state.currentTab) state.dirtyTabs.delete(state.currentTab);
      state.isDirty = state.dirtyTabs.size > 0;
    }
    updateDateStatusPills();
    updateGlobalSaveButton();
  }

  function updateGlobalSaveButton() {
    const pill = document.getElementById('global-dirty-status-pill');
    if (!pill) return;

    if (state.isDirty) {
      pill.className = 'global-dirty-status-pill is-dirty';
      pill.innerHTML = '<span class="status-dot-left"></span><span>미저장</span>';
    } else {
      pill.className = 'global-dirty-status-pill is-saved';
      pill.innerHTML = '<span class="status-dot-left"></span><span>저장됨</span>';
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
        inspPill.innerHTML = '<span class="status-dot-left is-pulsing"></span><span>미저장</span>';
        inspPill.className = 'date-status-pill';
        inspPill.style.backgroundColor = '#fef2f2';
        inspPill.style.color = '#dc2626';
        inspPill.style.border = '1px solid #fecaca';
      } else {
        const hasInspData = (state.inspectionData.process && Object.keys(state.inspectionData.process).length > 0) ||
                            (state.inspectionData.assembly && Object.keys(state.inspectionData.assembly).length > 0);
        if (hasInspData) {
          inspPill.textContent = '● 저장됨';
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
        prodPill.innerHTML = '<span class="status-dot-left is-pulsing"></span><span>미저장</span>';
        prodPill.className = 'date-status-pill';
        prodPill.style.backgroundColor = '#fef2f2';
        prodPill.style.color = '#dc2626';
        prodPill.style.border = '1px solid #fecaca';
      } else {
        const hasProdData = Object.values(state.productionData).some(sec => 
          Object.values(sec).some(r => r && (r.qty > 0 || r.lotNo || r.note || Object.values(r.workerHours || {}).some(h => h > 0)))
        );
        if (hasProdData) {
          prodPill.textContent = '● 저장됨';
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
    if (typeof loadLocalInspectionV2 === 'function') loadLocalInspectionV2(state.inspectionTargetDate);
    loadLocalProductionData(state.productionDate);
    loadLocalCertData();

    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        isFirestoreActive = true;

        // Firestore에서 최신 마스터 데이터 및 일정 인덱스를 1회 get()으로 로드
        const masterLoaded = await loadMasterDataFromDb();
        if (masterLoaded) {
          updateDbStatus(true, 'DB 연결됨');
        }
        await loadInspectionSchedulesFromDb();
        await loadInspectionDataFromDb(state.inspectionTargetDate);
        await loadCertDataFromDb();
        if (typeof syncAllInspectionV2FromDb === 'function') await syncAllInspectionV2FromDb();
        await loadPlanDataFromDb();
        await loadReceiverPlanDataFromDb();
      } catch (err) {
        console.warn('Firebase 연결 실패, 로컬 모드로 작동합니다:', err);
        fallbackToLocal();
      }
    } else {
      fallbackToLocal();
    }

    renderAll();
    if (typeof syncAuthAfterDbLoad === 'function') syncAuthAfterDbLoad();
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
    if (typeof syncAuthAfterDbLoad === 'function') syncAuthAfterDbLoad();
  }

  // =========================================================================
  // 5. 마스터 데이터 관리 (품목등록 / 기타작업 / 작업자 관리)
  // =========================================================================
  // 과거 구버전 기본 품목인지 확인 (스포트형 감지기 더미 데이터 여부)
  function isLegacyDefaultCommonItems(items) {
    if (!Array.isArray(items)) return true;
    if (items.length === 0) return false;
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

      const rawWorkGroups = localStorage.getItem(STORAGE_KEYS.WORK_GROUPS);
      const parsedWG = rawWorkGroups ? JSON.parse(rawWorkGroups) : null;
      state.workGroups = normalizeWorkGroups(parsedWG);

      state.stConfig = loadLocalStConfig();
    } catch (e) {
      state.commonItems = [...DEFAULT_COMMON_ITEMS];
      state.etcItems = [...DEFAULT_ETC_ITEMS];
      state.workers = [...DEFAULT_WORKERS];
      state.workGroups = DEFAULT_WORK_GROUPS.map(g => ({ ...g }));
      state.stConfig = getDefaultStConfig();
      saveLocalMasterData();
    }
  }

  const WH_VALID_LINES = new Set(['감지기반', '유도등반', '수신기반']);

  function applyAutoExcludeUnassignedLines(cfg) {
    if (!cfg || !Array.isArray(cfg.items)) return cfg;
    const mapped = new Set();
    cfg.items.forEach(it => (it.codes || []).forEach(c => mapped.add(c)));
    const excluded = new Set(cfg.excludedCodes || []);
    const unexcluded = new Set(cfg.unexcludedCodes || []);
    const masterList = (typeof state !== 'undefined' && Array.isArray(state.certMasterItems) && state.certMasterItems.length > 0)
      ? state.certMasterItems
      : (window.PMS_CERT_DEFAULTS?.DEFAULT_CERT_MASTER_ITEMS || []);

    masterList.forEach(m => {
      const code = String(m.code || '').trim();
      if (!code || mapped.has(code) || unexcluded.has(code)) return;
      const grp = String(m.group || '').trim();
      if (!WH_VALID_LINES.has(grp)) {
        excluded.add(code);
      }
    });
    cfg.excludedCodes = Array.from(excluded);
    return cfg;
  }

  function getDefaultStConfig() {
    const defs = window.PMS_CERT_DEFAULTS || {};
    const items = Array.isArray(defs.DEFAULT_ST_ITEMS) ? defs.DEFAULT_ST_ITEMS.map(it => ({ ...it, codes: [...(it.codes || [])] })) : [];
    const excludedCodes = Array.isArray(defs.DEFAULT_ST_EXCLUDED_CODES) ? [...defs.DEFAULT_ST_EXCLUDED_CODES] : [];
    return applyAutoExcludeUnassignedLines({ items, excludedCodes, unexcludedCodes: [] });
  }

  function normalizeStConfig(raw) {
    if (!raw || !Array.isArray(raw.items) || (raw.items.length === 0 && (!Array.isArray(raw.excludedCodes) || raw.excludedCodes.length === 0))) {
      return getDefaultStConfig();
    }
    return {
      ...applyAutoExcludeUnassignedLines({
        items: raw.items.map(it => ({
          id: it.id || `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          line: (it.line || '감지기반').trim(),
          name: (it.name || '').trim(),
          mode: it.mode === 'group' ? 'group' : 'single',
          codes: Array.isArray(it.codes) ? Array.from(new Set(it.codes.map(c => String(c).trim()).filter(Boolean))) : [],
          stAssembly: parseFloat(it.stAssembly) || 0,
          stInspect: parseFloat(it.stInspect) || 0,
          stPack: parseFloat(it.stPack) || 0
        })).filter(it => it.name),
        excludedCodes: Array.isArray(raw.excludedCodes) ? Array.from(new Set(raw.excludedCodes.map(c => String(c).trim()).filter(Boolean))) : [],
        unexcludedCodes: Array.isArray(raw.unexcludedCodes) ? Array.from(new Set(raw.unexcludedCodes.map(c => String(c).trim()).filter(Boolean))) : []
      }),
      targetEff: (Number(raw.targetEff) >= 10 && Number(raw.targetEff) <= 300) ? Number(raw.targetEff) : 100
    };
  }

  function loadLocalStConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ST_CONFIG);
      if (raw) {
        const norm = normalizeStConfig(JSON.parse(raw));
        if (norm.items.length > 0) return norm;
      }
    } catch (e) { /* ignore */ }
    const def = getDefaultStConfig();
    if (def.items.length > 0) {
      localStorage.setItem(STORAGE_KEYS.ST_CONFIG, JSON.stringify(def));
    }
    return def;
  }

  async function saveStConfigToDb(silent = false) {
    const norm = normalizeStConfig(state.stConfig);
    state.stConfig = norm;
    localStorage.setItem(STORAGE_KEYS.ST_CONFIG, JSON.stringify(norm));
    if (isFirestoreActive && db) {
      try {
        await db.collection('pms_metadata').doc('st_config').set(norm);
        if (!silent) showToast('공수/ST 기준 설정이 저장되었습니다.');
      } catch (err) {
        console.warn('ST 설정 DB 저장 오류:', err);
        if (!silent) showToast('로컬에 저장되었습니다 (DB 오류)');
      }
    } else if (!silent) {
      showToast('공수/ST 기준 설정이 로컬에 저장되었습니다.');
    }
  }

  async function loadMasterDataFromDb() {
    if (!isFirestoreActive || !db) return;
    try {
      const metaRef = db.collection('pms_metadata');

      const [commonDoc, etcDoc, workerDoc, stDoc, authDoc, rptPrintedDoc, rptTplSnap] = await Promise.all([
        metaRef.doc('common_items').get(),
        metaRef.doc('etc_items').get(),
        metaRef.doc('master_workers').get(),
        metaRef.doc('st_config').get(),
        metaRef.doc('auth_users').get(),
        metaRef.doc('report_printed').get(),
        db.collection('pms_report_templates').get()
      ]);

      if (rptPrintedDoc.exists && rptPrintedDoc.data()?.printedMap) {
        state.reportPrintedMap = rptPrintedDoc.data().printedMap;
        localStorage.setItem(STORAGE_KEYS.REPORT_PRINTED, JSON.stringify(state.reportPrintedMap));
      }
      if (rptTplSnap && !rptTplSnap.empty) {
        state.reportTemplates = rptTplSnap.docs.map(d => d.data()).filter(t => t && t.id);
        localStorage.setItem(STORAGE_KEYS.REPORT_TEMPLATES, JSON.stringify(state.reportTemplates));
        if (typeof renderReportTemplatesPane === 'function') renderReportTemplatesPane();
      } else {
        try {
          const fallbackSnap = await metaRef.where('__isReportTemplate', '==', true).get();
          if (fallbackSnap && !fallbackSnap.empty) {
            state.reportTemplates = fallbackSnap.docs.map(d => d.data()).filter(t => t && t.id);
            localStorage.setItem(STORAGE_KEYS.REPORT_TEMPLATES, JSON.stringify(state.reportTemplates));
            if (typeof renderReportTemplatesPane === 'function') renderReportTemplatesPane();
          }
        } catch (e) { /* ignore */ }
      }

      if (authDoc.exists && Array.isArray(authDoc.data().users) && authDoc.data().users.length > 0) {
        normalizeAuthConfig(authDoc.data().depts, authDoc.data().rolePresets);
        localStorage.setItem(STORAGE_KEYS.AUTH_CONFIG, JSON.stringify({ depts: state.authDepts, rolePresets: state.authRolePresets }));
        syncAuthDeptDropdown();
        state.authUsers = normalizeAuthUsers(authDoc.data().users);
        localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(state.authUsers));
      } else {
        const initUsers = (state.authUsers && state.authUsers.length > 0) ? state.authUsers : getDefaultAuthUsers();
        state.authUsers = initUsers;
        localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(initUsers));
        metaRef.doc('auth_users').set({
          users: initUsers,
          depts: getAuthDeptsList(),
          rolePresets: getAuthRolePresetsMap()
        });
      }

      if (stDoc.exists && Array.isArray(stDoc.data().items) && stDoc.data().items.length > 0) {
        state.stConfig = normalizeStConfig(stDoc.data());
        localStorage.setItem(STORAGE_KEYS.ST_CONFIG, JSON.stringify(state.stConfig));
      } else {
        const initSt = (state.stConfig && state.stConfig.items && state.stConfig.items.length > 0) ? state.stConfig : getDefaultStConfig();
        state.stConfig = initSt;
        if (initSt.items.length > 0) {
          localStorage.setItem(STORAGE_KEYS.ST_CONFIG, JSON.stringify(initSt));
          metaRef.doc('st_config').set(initSt);
        }
      }

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
        if (Array.isArray(workerDoc.data().workGroups) && workerDoc.data().workGroups.length > 0) {
          state.workGroups = normalizeWorkGroups(workerDoc.data().workGroups);
        } else {
          state.workGroups = normalizeWorkGroups(state.workGroups);
        }
      } else {
        metaRef.doc('master_workers').set({ workers: state.workers, workGroups: state.workGroups });
      }

      saveLocalMasterData();
      return true;
    } catch (err) {
      console.warn('마스터 데이터 DB 로드 오류 (로컬 유지):', err);
      updateDbStatus(false, 'DB 연결 오류');
      return false;
    }
  }

  function saveLocalMasterData() {
    localStorage.setItem(STORAGE_KEYS.COMMON_ITEMS, JSON.stringify(state.commonItems));
    localStorage.setItem(STORAGE_KEYS.ETC_ITEMS, JSON.stringify(state.etcItems));
    localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(state.workers));
    localStorage.setItem(STORAGE_KEYS.WORK_GROUPS, JSON.stringify(state.workGroups || DEFAULT_WORK_GROUPS));
  }

  async function saveMasterToDb(silent = false) {
    if (isGuestReadOnly(!silent)) return;
    saveLocalMasterData();
    if (typeof saveLocalCertData === 'function') saveLocalCertData();
    if (typeof saveLocalAttendanceData === 'function') saveLocalAttendanceData();

    if (isFirestoreActive && db) {
      try {
        const metaRef = db.collection('pms_metadata');
        await Promise.all([
          metaRef.doc('common_items').set({ items: state.commonItems }),
          metaRef.doc('etc_items').set({ items: state.etcItems }),
          metaRef.doc('master_workers').set({ workers: state.workers, workGroups: state.workGroups || DEFAULT_WORK_GROUPS }),
          metaRef.doc('cert_master_items').set({ items: state.certMasterItems || [] }),
          metaRef.doc('cert_kfi_map').set({ map: state.kfiDataMap || {} }),
          metaRef.doc('departments').set({ departments: state.departments || [] }),
          metaRef.doc('attendance_data').set({
            types: state.attendanceTypes || [],
            records: state.attendanceRecords || [],
            holidays: state.attendanceHolidays || {}
          })
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
    if (typeof syncAuthAfterDbLoad === 'function') syncAuthAfterDbLoad();
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
        html += `<td class="summary-empty" style="background-color: var(--bg-subtle);"></td>`;

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
    const directWorkers = (state.workers || []).filter(w => isDirectManufacturingWorker(w));
    const fixedWorkers = directWorkers.filter(w => (w.type || 'fixed') === 'fixed');
    const variableWorkers = directWorkers.filter(w => w.type === 'variable' && state.selectedVarWorkerIds.includes(w.id));
    return [...fixedWorkers, ...variableWorkers];
  }

  function renderVariableWorkerSelector() {
    const selectEl = document.getElementById('select-add-var-worker');
    const chipContainer = document.getElementById('variable-workers-chip-container');
    if (!selectEl || !chipContainer) return;

    const allVarWorkers = (state.workers || []).filter(w => isDirectManufacturingWorker(w) && w.type === 'variable');
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

  function findMissingDailyReportDates() {
    const todayStr = getTodayDateString();
    const monthStart = todayStr.slice(0, 7) + '-01';
    const yesterday = addDaysStr(todayStr, -1);
    if (yesterday < monthStart) return [];

    const schedDateMap = typeof collectScheduleCalendarData === 'function'
      ? collectScheduleCalendarData()
      : new Map();
    const prodLines = ['감지기반', '유도등반', '수신기반'];
    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const results = [];

    let cur = monthStart;
    while (cur <= yesterday) {
      const dayStatus = typeof getAttendanceDayStatus === 'function'
        ? getAttendanceDayStatus(cur)
        : { isOffDay: false, dow: new Date(cur + 'T00:00:00').getDay() };

      const planItems = schedDateMap.get(cur) || [];
      if (!dayStatus.isOffDay && planItems.length > 0) {
        let entries = [];
        if (state.productionDate === cur && state.dailyV2Data && Array.isArray(state.dailyV2Data.entries)) {
          entries = state.dailyV2Data.entries;
        } else {
          try {
            const rawD = localStorage.getItem(STORAGE_KEYS.DAILY_V2_PREFIX + cur);
            if (rawD) entries = JSON.parse(rawD).entries || [];
          } catch (e) { /* ignore */ }
        }

        const missingLines = prodLines.filter(ln => {
          const lineEntries = entries.filter(ent => ent && String(ent.line || '').trim() === ln);
          if (lineEntries.length === 0) return true;
          return !lineEntries.some(ent => {
            if (parseSafeInt(ent.qty) > 0) return true;
            if (ent.workerHours && Object.values(ent.workerHours).some(v => parseFloat(v) > 0)) return true;
            if (ent.isLoss && parseFloat(ent.lossHours || ent.hours || 0) > 0) return true;
            if (String(ent.note || ent.itemName || '').trim()) return true;
            return false;
          });
        });

        if (missingLines.length > 0) {
          results.push({
            dateStr: cur,
            dowLabel: dowLabels[dayStatus.dow] || '',
            missingLines,
            isAllMissing: missingLines.length === prodLines.length
          });
        }
      }
      cur = addDaysStr(cur, 1);
    }

    // 최근 날짜가 위로 오도록 역순 정렬
    results.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    return results;
  }

  function renderProdMissingDropdown() {
    const btn = document.getElementById('btn-prod-missing-days');
    const labelEl = document.getElementById('prod-missing-label');
    const popEl = document.getElementById('prod-missing-popover');
    if (!btn || !labelEl || !popEl) return;

    const missingList = findMissingDailyReportDates();
    const count = missingList.length;

    btn.classList.toggle('has-missing', count > 0);
    btn.classList.toggle('all-clear', count === 0);
    labelEl.textContent = count > 0 ? `미작성 ${count}일` : '미작성 없음';

    let html = `
      <div class="prod-missing-pop-head">
        <span>이번 달 미작성 일자</span>
        <span class="prod-missing-pop-sub">1일 ~ 어제 (계획 있는 날)</span>
      </div>
      <div class="prod-missing-pop-list">
    `;
    if (count === 0) {
      html += `<div class="prod-missing-empty">누락된 일보가 없습니다.</div>`;
    } else {
      html += missingList.map(item => {
        const shortDate = item.dateStr.slice(5);
        const lineText = item.isAllMissing
          ? '전체 반 미작성'
          : `${item.missingLines.map(l => l.replace('반', '')).join(', ')} 미작성`;
        const isCurrent = state.productionDate === item.dateStr;
        return `
          <button type="button" class="prod-missing-item ${isCurrent ? 'is-current' : ''}" data-missing-date="${item.dateStr}">
            <span class="prod-missing-item-date">${shortDate} (${item.dowLabel})</span>
            <span class="prod-missing-item-lines">${lineText}</span>
          </button>
        `;
      }).join('');
    }
    html += `</div>`;
    popEl.innerHTML = html;
  }

  function renderProductionTable() {
    if (typeof updateNavTabBadges === 'function') updateNavTabBadges();
    if (typeof renderProdMissingDropdown === 'function') renderProdMissingDropdown();
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
          html += '<td class="col-worker-time num-cell" style="background:var(--bg-subtle);"></td>';
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

  function getWorkGroupEntries() {
    return normalizeWorkGroups(state.workGroups);
  }

  function getWorkGroupsList() {
    return getWorkGroupEntries().map(g => g.name);
  }

  function renderWorkGroupSelectOptions() {
    const entries = getWorkGroupEntries();
    const catSel = document.getElementById('select-new-worker-category');
    const selectedCategory = catSel ? catSel.value : '';
    const filtered = selectedCategory
      ? entries.filter(g => g.category === selectedCategory)
      : entries;
    const groups = (filtered.length > 0 ? filtered : entries).map(g => g.name);
    const newWorkerSel = document.getElementById('select-new-worker-group');
    if (newWorkerSel) {
      const prev = newWorkerSel.value;
      newWorkerSel.innerHTML = groups.map(g => `<option value="${g}">${g}</option>`).join('');
      if (groups.includes(prev)) newWorkerSel.value = prev;
      else if (groups.length > 0) newWorkerSel.value = groups[0];
      if (typeof syncCustomSelect === 'function') syncCustomSelect(newWorkerSel);
    }
  }

  function renderMasterWorkers() {
    renderWorkGroupSelectOptions();
    const groups = getWorkGroupsList();
    const tbody = document.getElementById('master-workers-tbody');
    const badge = document.getElementById('count-workers-badge');
    if (badge) badge.textContent = `${state.workers.length}명`;
    if (!tbody) return;

    tbody.innerHTML = '';
    state.workers.forEach((worker, idx) => {
      const wGroup = worker.group || groups[0] || '감지기반';
      const wCategory = getWorkGroupCategory(wGroup);
      const isSupport = wCategory === '제조지원';
      const categoryBadgeHtml = isSupport
        ? '<span class="worker-cat-badge is-support">제조지원</span>'
        : '<span class="worker-cat-badge is-direct">직접제조</span>';
      const rowGroups = groups.includes(wGroup) ? groups : [...groups, wGroup];
      const optionsHtml = rowGroups.map(g => `<option value="${g}" ${wGroup === g ? 'selected' : ''}>${g}</option>`).join('');

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
        <td style="text-align: center;">${categoryBadgeHtml}</td>
        <td style="text-align: center;">
          <select class="worker-group-select form-select form-select-sm" data-worker-id="${worker.id}" style="height:26px; font-size:12px;">
            ${optionsHtml}
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

    if (typeof enhanceAllSelects === 'function') enhanceAllSelects(tbody);
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
    if (typeof renderInspectionV2 !== 'function') {
      const inspDateEl = document.getElementById('inspection-date');
      if (inspDateEl) inspDateEl.value = state.inspectionStartDate;
    }

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

    // 현재 활성화된 탭(생산계획/수신기계획/검정정산/근태관리)도 DB 로드 후 최신 데이터로 재렌더링
    if (state.currentTab === 'tab-plan' && typeof renderPlanModule === 'function') {
      renderPlanModule();
    } else if (state.currentTab === 'tab-receiver-plan' && typeof renderReceiverPlanModule === 'function') {
      renderReceiverPlanModule();
    } else if (state.currentTab === 'tab-cert-settlement' && typeof renderCertSettlementModule === 'function') {
      renderCertSettlementModule();
    } else if (state.currentTab === 'tab-attendance' && typeof renderAttendanceModule === 'function') {
      renderAttendanceModule();
    }
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
    // (C) 7대 탭 / 트리 네비게이션 (저장은 각 페이지별 저장 버튼 사용)
    // -------------------------------------------------------------

    async function activateTab(tabId) {
      if (!tabId) return false;

      // 미저장 데이터 확인: 다른 탭으로 이동 시 실제 변경된 탭만 자동 저장
      const isPlanDirty = state.dirtyTabs instanceof Set && state.dirtyTabs.has('tab-plan');
      const isRpDirty = state.dirtyTabs instanceof Set && state.dirtyTabs.has('tab-receiver-plan');
      const isInspDirty = state.currentTab === 'tab-inspection' &&
        (state.isDirty || (state.dirtyTabs instanceof Set && state.dirtyTabs.has('tab-inspection')));
      const isProdDirty = state.currentTab === 'tab-production' &&
        (state.isDirty || (state.dirtyTabs instanceof Set && state.dirtyTabs.has('tab-production')));

      if (state.isDirty || isPlanDirty || isRpDirty || isInspDirty || isProdDirty) {
        if (typeof isGuestReadOnly === 'function' && isGuestReadOnly(false)) {
          if (state.dirtyTabs instanceof Set) state.dirtyTabs.clear();
          state.isDirty = false;
        } else {
          let didAutoSave = false;
          try {
            if (isPlanDirty || (state.currentTab === 'tab-plan' && state.isDirty)) {
              await savePlanToDb(true);
              if (state.dirtyTabs instanceof Set) state.dirtyTabs.delete('tab-plan');
              didAutoSave = true;
            }
            if (isRpDirty || (state.currentTab === 'tab-receiver-plan' && state.isDirty)) {
              await saveReceiverPlanToDb(true);
              if (state.dirtyTabs instanceof Set) state.dirtyTabs.delete('tab-receiver-plan');
              didAutoSave = true;
            }
            if (isInspDirty) {
              if (typeof saveInspectionV2ToDb === 'function') await saveInspectionV2ToDb();
              else await saveInspectionToDb();
              if (state.dirtyTabs instanceof Set) state.dirtyTabs.delete('tab-inspection');
              didAutoSave = true;
            }
            if (isProdDirty) {
              if (typeof saveDailyV2ToDb === 'function') await saveDailyV2ToDb();
              else await saveProductionToDb();
              if (state.dirtyTabs instanceof Set) state.dirtyTabs.delete('tab-production');
              didAutoSave = true;
            }
          } catch (err) {
            console.warn('[PMS] 탭 전환 자동 저장 중 오류:', err);
          }
          if (didAutoSave) {
            showToast('변경사항이 자동 저장되었습니다');
          }
        }
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
      const navTabId = tabId === 'tab-receiver-plan'
        ? 'tab-plan'
        : (tabId === 'tab-cert-settlement' ? 'tab-certification' : tabId);
      const targetBtn = document.querySelector(`.nav-tab[data-tab="${navTabId}"]`);
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
      try {
        localStorage.setItem('pms_last_active_tab', tabId);
        localStorage.setItem('pms_last_cal_mode', state.calendarMode || 'attendance');
        localStorage.setItem('pms_last_daily_mode', (state.activeLines && state.activeLines.daily) || 'daily');
      } catch (e) { /* ignore */ }
      state.isDirty = state.dirtyTabs instanceof Set ? state.dirtyTabs.size > 0 : false;
      updateDateStatusPills();
      updateGlobalSaveButton();

      // 4) 탭별 데이터 렌더링 (예외 발생 시에도 화면 전환 상태는 유지)
      try {
        if (tabId === 'tab-plan') {
          renderPlanModule();
        } else if (tabId === 'tab-receiver-plan') {
          renderReceiverPlanModule();
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
            loadCertDraftFromPlanWeek(state.certSelectedWeekId || '', state.certAutoLineFilter || 'ALL');
          }
          renderCertificationModule();
        } else if (tabId === 'tab-cert-settlement') {
          renderCertSettlementModule();
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
          try { localStorage.setItem('pms_last_daily_mode', lineKey); } catch (e) {}
          const chip = document.getElementById('chip-daily-line');
          if (chip) chip.textContent = lineName;
          updateProductionLineBanner(lineKey, lineName);
        } else if (parentTabId === 'tab-plan' || parentTabId === 'tab-receiver-plan') {
          const chip = document.getElementById('chip-plan-mode');
          if (chip) chip.textContent = lineName;
        } else if (parentTabId === 'tab-certification' || parentTabId === 'tab-cert-settlement') {
          const chip = document.getElementById('chip-cert-mode');
          if (chip) chip.textContent = lineName;
        } else if (parentTabId === 'tab-attendance') {
          state.calendarMode = lineKey === 'schedule' ? 'schedule' : 'attendance';
          try { localStorage.setItem('pms_last_cal_mode', state.calendarMode); } catch (e) {}
          state.calSchedExpandedWeekIdx = null;
          state.calSchedSelectedDate = null;
          const chip = document.getElementById('chip-cal-mode');
          if (chip) chip.textContent = lineName;
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
    function applyViewMode(mode) {
      const isWide = mode === 'wide';
      document.body.className = isWide ? 'view-mode-wide' : 'view-mode-default';
      state.viewMode = isWide ? 'wide' : 'default';
      const btnToggle = document.getElementById('btn-view-mode-toggle');
      if (btnToggle) {
        const iconWide = btnToggle.querySelector('.icon-wide');
        const iconDef = btnToggle.querySelector('.icon-default');
        if (iconWide) iconWide.style.display = isWide ? 'none' : 'inline-block';
        if (iconDef) iconDef.style.display = isWide ? 'inline-block' : 'none';
        btnToggle.classList.toggle('is-wide', isWide);
        btnToggle.title = isWide ? '기본 뷰로 전환' : '와이드 뷰로 전환';
      }
    }

    applyViewMode(state.viewMode || 'default');

    const btnViewModeToggle = document.getElementById('btn-view-mode-toggle');
    if (btnViewModeToggle) {
      btnViewModeToggle.addEventListener('click', () => {
        const nextMode = state.viewMode === 'wide' ? 'default' : 'wide';
        applyViewMode(nextMode);
        localStorage.setItem(STORAGE_KEYS.VIEW_MODE, nextMode);
      });
    }

    // 라이트/다크 모드 전환
    function applyThemeMode(mode) {
      const isDark = mode === 'dark';
      document.documentElement.classList.toggle('dark-mode', isDark);
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
      ['btn-theme-toggle', 'btn-auth-theme-toggle'].forEach(btnId => {
        const btnTheme = document.getElementById(btnId);
        if (!btnTheme) return;
        const moonIcon = btnTheme.querySelector('.icon-moon');
        const sunIcon = btnTheme.querySelector('.icon-sun');
        if (moonIcon) moonIcon.style.display = isDark ? 'none' : 'inline-block';
        if (sunIcon) sunIcon.style.display = isDark ? 'inline-block' : 'none';
        btnTheme.title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
      });
    }

    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME_MODE) || 'light';
    applyThemeMode(savedTheme);

    const toggleThemeHandler = () => {
      const isCurrentlyDark = document.documentElement.classList.contains('dark-mode');
      const nextMode = isCurrentlyDark ? 'light' : 'dark';
      applyThemeMode(nextMode);
      localStorage.setItem(STORAGE_KEYS.THEME_MODE, nextMode);
    };
    document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleThemeHandler);
    document.getElementById('btn-auth-theme-toggle')?.addEventListener('click', toggleThemeHandler);

    // -------------------------------------------------------------
    // (E) 생산현황 날짜 변경 및 일정 저장 (v1 전용: v2 활성 시 v2 리스너가 담당)
    // -------------------------------------------------------------
    const isInspV2Active = typeof renderInspectionV2 === 'function';
    const inspDateInput = document.getElementById('inspection-date');
    if (inspDateInput && !isInspV2Active) {
      inspDateInput.addEventListener('change', (e) => {
        state.inspectionStartDate = e.target.value;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    const inspPrevDay = document.getElementById('btn-insp-prev-day');
    if (inspPrevDay && !isInspV2Active) {
      inspPrevDay.addEventListener('click', () => {
        state.inspectionStartDate = addDaysStr(state.inspectionStartDate, -1);
        if (inspDateInput) inspDateInput.value = state.inspectionStartDate;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    const inspNextDay = document.getElementById('btn-insp-next-day');
    if (inspNextDay && !isInspV2Active) {
      inspNextDay.addEventListener('click', () => {
        state.inspectionStartDate = addDaysStr(state.inspectionStartDate, 1);
        if (inspDateInput) inspDateInput.value = state.inspectionStartDate;
        saveLocalInspectionData();
        markAsDirty(true);
        renderInspectionTable();
      });
    }

    const inspTodayBtn = document.getElementById('btn-insp-today');
    if (inspTodayBtn && !isInspV2Active) {
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
    if (inspTargetInput && !isInspV2Active) {
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
    if (btnInspSave && !isInspV2Active) {
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

    // [생산일정] 일정저장 버튼 클릭 (v1 전용: v2 활성 시 saveDailyV2ToDb가 담당)
    const btnProdSave = document.getElementById('btn-prod-save');
    if (btnProdSave && typeof renderDailyV2 !== 'function') {
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

    const newWorkerCategorySel = document.getElementById('select-new-worker-category');
    if (newWorkerCategorySel) {
      newWorkerCategorySel.addEventListener('change', () => {
        renderWorkGroupSelectOptions();
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
      dept: '',
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

      // 2) KFI 매핑 데이터 & 백데이터 레코드
      const rawKfi = localStorage.getItem(STORAGE_KEYS.KFI_DATA_MAP);
      state.kfiDataMap = rawKfi ? JSON.parse(rawKfi) : { ...(defs.DEFAULT_KFI_DATA_MAP || {}) };
      const rawKfiRecs = localStorage.getItem(STORAGE_KEYS.KFI_RECORDS);
      state.kfiRecords = rawKfiRecs ? JSON.parse(rawKfiRecs) : [];

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
      localStorage.setItem(STORAGE_KEYS.KFI_RECORDS, JSON.stringify(state.kfiRecords || []));
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

  function updateNavTabBadges() {
    // 1) 검정현황: 미등록 건수 (작성/대기 중 실제 품목이 있는 행)
    const certUnregCount = (state.certDraftRows || []).filter(r =>
      (r && ((r.code && String(r.code).trim()) || (r.name && String(r.name).trim())))
    ).length;
    const certBadge = document.getElementById('badge-cert-saved-count');
    if (certBadge) {
      certBadge.textContent = certUnregCount > 0 ? String(certUnregCount) : '';
      certBadge.title = `미등록 검정 건수: ${certUnregCount}건`;
    }

    // 2) 일정계획: 로트별로 작성되지 않은 건수 (일정완료 제외)
    let inspUnplannedCount = 0;
    const inspCache = new Map();
    (state.certSavedRows || []).forEach(r => {
      if (!r || r.status === '일정완료') return;
      const wk = r.weekDate || '';
      let itemsObj = null;
      if (wk && state.inspectionTargetDate === wk && state.inspV2Data && state.inspV2Data.items) {
        itemsObj = state.inspV2Data.items;
      } else if (wk) {
        if (!inspCache.has(wk)) {
          try {
            const raw = localStorage.getItem(STORAGE_KEYS.INSP_V2_PREFIX + wk);
            inspCache.set(wk, raw ? (JSON.parse(raw).items || {}) : {});
          } catch (e) { inspCache.set(wk, {}); }
        }
        itemsObj = inspCache.get(wk);
      }
      const itState = itemsObj ? itemsObj[r.id] : null;
      const excl = (itState && itState.excludedProcs) || {};
      const dp = (itState && itState.dailyPlans) || {};
      const hasPlan = Object.values(dp).some(pObj =>
        pObj && ['assembly', 'inspect', 'pack'].some(p => !excl[p] && parseSafeInt(pObj[p]) > 0)
      );
      if (!hasPlan) inspUnplannedCount++;
    });
    const inspBadge = document.getElementById('badge-insp-unplanned-count');
    if (inspBadge) {
      inspBadge.textContent = inspUnplannedCount > 0 ? String(inspUnplannedCount) : '';
      inspBadge.title = `일정계획 미작성 로트: ${inspUnplannedCount}건`;
    }

    // 3) 생산일보 - 일보작성: 감지기반, 유도등반, 수신기반 중 내용이 비어있는 반 건수
    const targetProdDate = state.productionDate || getTodayDateString();
    let prodEntries = [];
    if (state.dailyV2Data && Array.isArray(state.dailyV2Data.entries)) {
      prodEntries = state.dailyV2Data.entries;
    } else {
      try {
        const rawD = localStorage.getItem(STORAGE_KEYS.DAILY_V2_PREFIX + targetProdDate);
        if (rawD) prodEntries = JSON.parse(rawD).entries || [];
      } catch (e) { /* ignore */ }
    }
    const prodLines = ['감지기반', '유도등반', '수신기반'];
    const prodIncompleteCount = prodLines.filter(ln => {
      const lineEntries = prodEntries.filter(ent => ent && String(ent.line || '').trim() === ln);
      if (lineEntries.length === 0) return true;
      return !lineEntries.some(ent => {
        if (parseSafeInt(ent.qty) > 0) return true;
        if (ent.workerHours && Object.values(ent.workerHours).some(v => parseFloat(v) > 0)) return true;
        if (ent.isLoss && parseFloat(ent.lossHours || ent.hours || 0) > 0) return true;
        if (String(ent.note || ent.itemName || '').trim()) return true;
        return false;
      });
    }).length;
    const prodBadge = document.getElementById('badge-prod-incomplete-count');
    if (prodBadge) {
      prodBadge.textContent = prodIncompleteCount > 0 ? String(prodIncompleteCount) : '';
      prodBadge.title = `일보 미작성 작업반: ${prodIncompleteCount}개 반`;
    }

    // 4) 품질검사: 품질검사 대기 목록(state.qualityRows) 건수
    const qualReqCount = (state.qualityRows || []).length;
    const qualBadge = document.getElementById('badge-quality-req-count');
    if (qualBadge) {
      qualBadge.textContent = qualReqCount > 0 ? String(qualReqCount) : '';
      qualBadge.title = `품질검사 대기 건수: ${qualReqCount}건`;
    }
  }

  function updateCertBadgeCounts() {
    updateNavTabBadges();

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
      const [masterDoc, kfiDoc, kfiRecsDoc, deptDoc, savedDoc, qualDoc, attDoc] = await Promise.all([
        metaRef.doc('cert_master_items').get(),
        metaRef.doc('cert_kfi_map').get(),
        metaRef.doc('cert_kfi_records').get(),
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

      if (kfiRecsDoc && kfiRecsDoc.exists && Array.isArray(kfiRecsDoc.data().records)) {
        state.kfiRecords = kfiRecsDoc.data().records;
      } else if (Array.isArray(state.kfiRecords) && state.kfiRecords.length > 0) {
        metaRef.doc('cert_kfi_records').set({ records: state.kfiRecords });
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
    if (isGuestReadOnly(!silent)) return;
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
        metaRef.doc('cert_kfi_records').set({ records: state.kfiRecords || [] }),
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

  // (4-B) 스마트 날짜 포맷터 ('11-25', '11/25', '1125', '26-11-25' -> '2026-11-25')
  function formatSmartDateInput(rawVal) {
    if (!rawVal) return '';
    const s = String(rawVal).trim();
    if (!s) return '';

    const curYear = new Date().getFullYear();
    const curCentury = Math.floor(curYear / 100) * 100;
    let y = 0, m = 0, d = 0;

    let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      y = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
      d = parseInt(match[3], 10);
    } else if ((match = s.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
      y = curCentury + parseInt(match[1], 10);
      m = parseInt(match[2], 10);
      d = parseInt(match[3], 10);
    } else if ((match = s.match(/^(\d{1,2})[-/.\s](\d{1,2})$/))) {
      y = curYear;
      m = parseInt(match[1], 10);
      d = parseInt(match[2], 10);
    } else if (/^\d{8}$/.test(s)) {
      y = parseInt(s.slice(0, 4), 10);
      m = parseInt(s.slice(4, 6), 10);
      d = parseInt(s.slice(6, 8), 10);
    } else if (/^\d{6}$/.test(s)) {
      y = curCentury + parseInt(s.slice(0, 2), 10);
      m = parseInt(s.slice(2, 4), 10);
      d = parseInt(s.slice(4, 6), 10);
    } else if (/^\d{4}$/.test(s)) {
      y = curYear;
      m = parseInt(s.slice(0, 2), 10);
      d = parseInt(s.slice(2, 4), 10);
    } else {
      return s;
    }

    if (m < 1 || m > 12 || d < 1 || d > 31) return s;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return s;

    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

  // 형식번호가 유효하면 형식번호 기준, 없으면('-', '없음', 빈값 등) 품목코드 기준으로 구분 키 반환
  function isValidCertFormatNo(formatNo) {
    const fmt = String(formatNo || '').trim();
    return fmt !== '' && fmt !== '-' && fmt !== '없음' && fmt !== 'N/A' && fmt !== 'n/a';
  }

  function getCertLotGroupKey(formatNo, code) {
    if (isValidCertFormatNo(formatNo)) {
      return `FMT:${String(formatNo).trim()}`;
    }
    const cleanCode = String(code || '').trim();
    return cleanCode ? `CODE:${cleanCode}` : '';
  }

  // 형식번호(미보유 시 품목코드) 기준 로트번호 중복 검증 (전체 저장 DB + 현재 등록 그리드)
  function checkLotNumberDuplicate(formatNo, lotNo, currentDraftRowId, code) {
    if (!lotNo) return false;
    const cleanLot = String(lotNo).trim();
    const myGroupKey = getCertLotGroupKey(formatNo, code);
    if (!cleanLot || !myGroupKey) return false;

    // 1) 저장된 누적 DB 검사
    const existsInSaved = (state.certSavedRows || []).some(r =>
      getCertLotGroupKey(r.formatNo, r.code) === myGroupKey &&
      r.lotNo && String(r.lotNo).trim() === cleanLot
    );
    if (existsInSaved) return true;

    // 2) 현재 등록 그리드 검사 (자신 제외)
    const existsInDraft = (state.certDraftRows || []).some(r =>
      r.id !== currentDraftRowId &&
      getCertLotGroupKey(r.formatNo, r.code) === myGroupKey &&
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

  // 검정현황 행의 연도 추출 (생산주차 기준 우선: sourceYear -> weekDate -> writeDate -> inspectDate -> 올해)
  function getCertRowYear(row) {
    const fallbackYear = String(new Date().getFullYear());
    if (!row) return fallbackYear;
    const srcYr = String(row.sourceYear || '').trim();
    if (/^\d{4}$/.test(srcYr)) return srcYr;
    const candidates = [row.weekDate, row.writeDate, row.inspectDate];
    for (const c of candidates) {
      const s = String(c || '').trim();
      if (/^\d{4}/.test(s)) return s.slice(0, 4);
    }
    const lotM = String(row.lotNo || '').trim().match(/^(\d{2})-/);
    if (lotM) return `20${lotM[1]}`;
    return fallbackYear;
  }

  // 검정현황 로트/제조번호 채번용 2자리 연도 추출 (이미 입력된 lotNo 앞 2자리 최우선, 미입력 시 생산주차 기준)
  function getCertRowYy(row) {
    const lotM = String(row?.lotNo || '').trim().match(/^(\d{2})-/);
    if (lotM) return lotM[1];
    return getCertRowYear(row).slice(-2);
  }

  // 동일 형식번호(미보유 시 품목코드) 기준 다음 로트번호 미리보기 감지 (자동 적용하지 않음)
  function getNextLotSuggestionsMap(draftRows) {
    const maxByFormatYear = new Map(); // `${groupKey}__${yy}` -> maxNum

    const recordLot = (formatNo, code, lotNo) => {
      const groupKey = getCertLotGroupKey(formatNo, code);
      if (!groupKey || !lotNo) return;
      const m = String(lotNo).trim().match(/^(\d{2})-(\d+)$/);
      if (!m) return;
      const key = `${groupKey}__${m[1]}`;
      const num = parseInt(m[2], 10);
      const prev = maxByFormatYear.get(key) || 0;
      if (num > prev) maxByFormatYear.set(key, num);
    };

    (state.certSavedRows || []).forEach(r => recordLot(r.formatNo, r.code, r.lotNo));

    const result = new Map();
    (draftRows || []).forEach(row => {
      const groupKey = getCertLotGroupKey(row.formatNo, row.code);
      if (!groupKey) return;
      const yy = getCertRowYy(row);
      const key = `${groupKey}__${yy}`;

      if (row.lotNo && String(row.lotNo).trim()) {
        recordLot(row.formatNo, row.code, row.lotNo);
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

  // 동일 형식번호(미보유 시 품목코드) + 연도 기준 제조번호 FROM 다음 번호 예측 (미적용)
  function getNextFromSuggestionsMap(draftRows) {
    const maxToByFormatYear = new Map();

    const recordSerial = (formatNo, code, yy, fromVal, toVal, qtyVal) => {
      const groupKey = getCertLotGroupKey(formatNo, code);
      const from = parseSafeInt(fromVal);
      if (!groupKey || from <= 0) return;
      const key = `${groupKey}__${yy}`;
      const qty = parseSafeInt(qtyVal);
      const to = parseSafeInt(toVal) || (qty > 0 ? from + qty - 1 : from);
      const prev = maxToByFormatYear.get(key) || 0;
      if (to > prev) maxToByFormatYear.set(key, to);
    };

    (state.certSavedRows || []).forEach(r => recordSerial(r.formatNo, r.code, getCertRowYy(r), r.from, r.to, r.qty));

    const result = new Map();
    (draftRows || []).forEach(row => {
      const groupKey = getCertLotGroupKey(row.formatNo, row.code);
      if (!groupKey) return;
      const yy = getCertRowYy(row);
      const key = `${groupKey}__${yy}`;

      if (parseSafeInt(row.from) > 0) {
        recordSerial(row.formatNo, row.code, yy, row.from, row.to, row.qty);
      }

      const curMaxTo = maxToByFormatYear.get(key) || 0;
      const nextFrom = curMaxTo + 1;
      result.set(row.id, { suggestion: String(nextFrom), prevTo: curMaxTo > 0 ? String(curMaxTo) : '없음' });

      if (parseSafeInt(row.from) <= 0) {
        const qty = parseSafeInt(row.qty);
        maxToByFormatYear.set(key, curMaxTo + (qty > 0 ? qty : 1));
      }
    });

    return result;
  }

  // 동일 형식번호(미보유 시 품목코드) + 동일 연도 내 제조번호 중복 및 사이값(구간 겹침) 검사
  function checkSerialRangeOverlap(formatNo, fromVal, toVal, currentDraftRowId, code, targetRowOrYy) {
    const myGroupKey = getCertLotGroupKey(formatNo, code);
    const myFrom = parseSafeInt(fromVal);
    if (!myGroupKey || myFrom <= 0) return false;
    const myTo = parseSafeInt(toVal) || myFrom;
    const myYy = typeof targetRowOrYy === 'string'
      ? targetRowOrYy
      : getCertRowYy(targetRowOrYy || (state.certDraftRows || []).find(d => d.id === currentDraftRowId));

    const isOverlapping = (r) => {
      if (getCertLotGroupKey(r.formatNo, r.code) !== myGroupKey) return false;
      if (getCertRowYy(r) !== myYy) return false;
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

  function parseCertWeekKey(rawVal, fallbackYear) {
    const s = String(rawVal || '').trim();
    if (!s) return { year: '', weekId: '' };
    const parts = s.split('::');
    if (parts.length === 2) {
      return { year: parts[0].trim(), weekId: parts[1].trim() };
    }
    return { year: String(fallbackYear || '').trim(), weekId: s };
  }

  // 생산계획 대비 검정 등록 수량 집계 (year__code__weekId -> sumQty)
  function getCertRegisteredQtyMap() {
    const map = {};
    (state.certSavedRows || []).forEach(r => {
      const code = String(r.code || '').trim();
      const wId = String(r.sourceWeekId || '').trim();
      if (!code || !wId) return;
      const yr = String(r.sourceYear || (r.weekDate && /^\d{4}/.test(r.weekDate) ? r.weekDate.slice(0, 4) : '')).trim();
      const qty = parseSafeInt(r.qty);
      if (yr) {
        const yKey = `${yr}__${code}__${wId}`;
        map[yKey] = (map[yKey] || 0) + qty;
      }
      const legacyKey = `${code}__${wId}`;
      map[legacyKey] = (map[legacyKey] || 0) + qty;
    });
    return map;
  }

  function hasUnregisteredCertPlanForWeek(weekId, rowsByCode, regMap, targetLine, yearStr) {
    if (!weekId || !rowsByCode) return false;
    return (state.certMasterItems || []).some(item => {
      if ((item.useYn || '사용') !== '사용') return false;
      if (getDefaultItemApplyType(item) === '수동') return false;
      if ((item.inspectType || '') === '-') return false;
      if (targetLine !== 'ALL' && (item.group || '').trim() !== targetLine) return false;

      const savedPlan = rowsByCode[item.code];
      const prodRaw = savedPlan && savedPlan.weeks && savedPlan.weeks[weekId] ? savedPlan.weeks[weekId].prod : '';
      const planQty = parsePlanNum(prodRaw);
      if (planQty <= 0) return false;

      const regQty = (yearStr ? regMap[`${yearStr}__${item.code}__${weekId}`] : undefined)
        ?? (regMap[`${item.code}__${weekId}`] || 0);
      return (planQty - regQty) > 0;
    });
  }

  function populateCertPlanWeekSelect() {
    const sel = document.getElementById('cert-plan-week-select');
    if (!sel) return;
    if (!state.planData) loadLocalPlanData();
    const pd = state.planData || getDefaultPlanData();
    const prevVal = state.certSelectedWeekId || sel.value || '';

    sel.innerHTML = '';
    const regMap = getCertRegisteredQtyMap();
    const targetLine = state.certAutoLineFilter || 'ALL';
    const yearKeys = Array.from(new Set([
      ...Object.keys(pd.rowsByYear || {}),
      String(pd.year || '')
    ].filter(y => /^\d{4}$/.test(y)))).sort();

    const availableValues = [];
    yearKeys.forEach(yr => {
      const rowsByCodeForYear = (yr === String(pd.year) && pd.rowsByCode)
        ? pd.rowsByCode
        : ((pd.rowsByYear && pd.rowsByYear[yr]) || {});
      const baseList = (yr === String(pd.year) && Array.isArray(pd.weeks) && pd.weeks.length > 0)
        ? pd.weeks
        : generateYearWeeks(yr);
      const list = baseList.filter(w => hasUnregisteredCertPlanForWeek(w.id, rowsByCodeForYear, regMap, targetLine, yr));
      if (list.length === 0) return;

      const grp = document.createElement('optgroup');
      grp.label = `${yr}년`;
      list.forEach(w => {
        const dates = getPlanWeekFridayDates(yr, w.id);
        const opt = document.createElement('option');
        const val = `${yr}::${w.id}`;
        opt.value = val;
        opt.textContent = `${w.id} (${dates.weekDate})`;
        grp.appendChild(opt);
        availableValues.push(val);
      });
      sel.appendChild(grp);
    });

    if (availableValues.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '미등록 주차 없음';
      sel.appendChild(emptyOpt);
      sel.value = '';
      state.certSelectedWeekId = '';
    } else {
      const parsedPrev = parseCertWeekKey(prevVal, pd.year);
      const normalizedPrev = parsedPrev.year && parsedPrev.weekId ? `${parsedPrev.year}::${parsedPrev.weekId}` : prevVal;
      if (availableValues.includes(prevVal)) {
        sel.value = prevVal;
        state.certSelectedWeekId = prevVal;
      } else if (availableValues.includes(normalizedPrev)) {
        sel.value = normalizedPrev;
        state.certSelectedWeekId = normalizedPrev;
      } else {
        sel.value = availableValues[0];
        state.certSelectedWeekId = availableValues[0];
      }
    }
    syncCustomSelect('cert-plan-week-select');
  }

  function buildDraftRowFromMasterAndPlan(item, qty, weekId, dates, todayStr, yearStr) {
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
    if (yearStr) row.sourceYear = String(yearStr);
    const planMemo = getPlanWeekMemoText(item.code, weekId, yearStr);
    if (planMemo) {
      row.site = planMemo;
      row.planMemo = planMemo;
    }
    return row;
  }

  function getDefaultItemApplyType(item) {
    if (item && (item.applyType === '자동' || item.applyType === '수동')) {
      return item.applyType;
    }
    const grp = String(item?.group || '').trim();
    const ig = String(item?.itemGroup || '').trim();
    const name = String(item?.name || '').trim();
    const fmt = String(item?.formatNo || '').trim();
    if (grp === '수신기반' && (ig === '수신기' || ig === 'F3P' || ig === 'GT1' || name.includes('수신기') || fmt.startsWith('수'))) {
      return '수동';
    }
    return '자동';
  }

  function loadCertDraftFromPlanWeek(weekKeyOrId, lineFilter) {
    if (!state.planData) loadLocalPlanData();
    const pd = state.planData || getDefaultPlanData();
    const { year: yr, weekId } = parseCertWeekKey(weekKeyOrId, pd.year);
    if (!weekId) {
      state.certDraftRows = [];
      saveLocalCertData();
      renderCertDraftTable();
      return;
    }

    const rowsByCodeForYear = (yr && yr !== String(pd.year))
      ? ((pd.rowsByYear && pd.rowsByYear[yr]) || {})
      : (pd.rowsByCode || (pd.rowsByYear && pd.rowsByYear[yr]) || {});
    const dates = getPlanWeekFridayDates(yr || pd.year, weekId);
    const todayStr = getTodayDateString();
    const regMap = getCertRegisteredQtyMap();
    const targetLine = lineFilter || state.certAutoLineFilter || 'ALL';

    const newDrafts = [];
    (state.certMasterItems || []).forEach(item => {
      if ((item.useYn || '사용') !== '사용') return;
      if (getDefaultItemApplyType(item) === '수동') return;
      if ((item.inspectType || '') === '-') return;
      if (targetLine !== 'ALL' && (item.group || '').trim() !== targetLine) return;

      const savedPlan = rowsByCodeForYear[item.code];
      const prodRaw = savedPlan && savedPlan.weeks && savedPlan.weeks[weekId] ? savedPlan.weeks[weekId].prod : '';
      const planQty = parsePlanNum(prodRaw);
      if (planQty <= 0) return;

      const regQty = (yr ? regMap[`${yr}__${item.code}__${weekId}`] : undefined)
        ?? (regMap[`${item.code}__${weekId}`] || 0);
      const remaining = planQty - regQty;
      if (remaining <= 0) return;

      const rawSplits = savedPlan?.splits && Array.isArray(savedPlan.splits[weekId]) ? savedPlan.splits[weekId] : null;
      const splitSum = rawSplits ? rawSplits.reduce((a, b) => a + parsePlanNum(b), 0) : 0;
      if (rawSplits && rawSplits.length >= 2 && splitSum === planQty) {
        let skip = regQty;
        rawSplits.forEach(partRaw => {
          const partQty = parsePlanNum(partRaw);
          if (partQty <= 0) return;
          if (skip >= partQty) {
            skip -= partQty;
            return;
          }
          const take = partQty - skip;
          skip = 0;
          if (take > 0) {
            newDrafts.push(buildDraftRowFromMasterAndPlan(item, take, weekId, dates, todayStr, yr));
          }
        });
      } else {
        newDrafts.push(buildDraftRowFromMasterAndPlan(item, remaining, weekId, dates, todayStr, yr));
      }
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

    // [표 2] 조회 필터 동기화 (연도 / 작업반 / 상태 / 생산주차 / 검색)
    renderCertSavedFilterYears();

    const lineSelect = document.getElementById('cert-filter-line');
    if (lineSelect) {
      lineSelect.value = state.certFilterLine || 'ALL';
      syncCustomSelect('cert-filter-line');
    }

    const statusSelect = document.getElementById('cert-filter-status');
    if (statusSelect) {
      statusSelect.value = state.certFilterStatus || 'ALL';
      syncCustomSelect('cert-filter-status');
    }

    const searchInput = document.getElementById('cert-filter-search');
    if (searchInput && searchInput.value !== (state.certFilterSearch || '')) {
      searchInput.value = state.certFilterSearch || '';
    }

    renderCertSavedFilterWeeks();

    renderCertDraftTable();
    renderCertSavedTable();
  }

  function formatCertWeekOptionLabel(weekDate, sourceWeekId) {
    const wd = String(weekDate || '').trim();
    if (!wd) return '';
    const mId = String(sourceWeekId || '').trim().match(/^W?(\d+)$/i);
    if (mId) return `${Number(mId[1])}주차 (${wd})`;

    if (typeof getPlanWeekFridayDates === 'function' && state.planData?.weeks) {
      const yr = wd.slice(0, 4) || state.planData.year;
      const found = (state.planData.weeks || []).find(w => getPlanWeekFridayDates(yr, w.id)?.weekDate === wd);
      if (found) {
        const wNum = found.weekNum || Number(String(found.id).replace(/\D/g, '')) || 1;
        return `${wNum}주차 (${wd})`;
      }
    }

    const m = wd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const jan1 = new Date(Number(m[1]), 0, 1);
      const dayOfYear = Math.floor((dt - jan1) / 86400000) + 1;
      const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
      return `${weekNum}주차 (${wd})`;
    }
    return wd;
  }

  function renderCertSavedFilterYears() {
    const yearSel = document.getElementById('cert-filter-year');
    if (!yearSel) return;
    const allSaved = state.certSavedRows || [];
    const currentYear = String(new Date().getFullYear());
    const nextYear = String(Number(currentYear) + 1);
    const yearSet = new Set([currentYear, nextYear]);
    allSaved.forEach(row => {
      const yr = getCertRowYear(row);
      if (/^\d{4}$/.test(yr)) yearSet.add(yr);
    });
    const sortedYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

    const prevVal = state.certFilterYear || currentYear;
    yearSel.innerHTML = '<option value="ALL">전체 연도</option>';
    sortedYears.forEach(yr => {
      const opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = `${yr}년`;
      yearSel.appendChild(opt);
    });

    if (prevVal === 'ALL' || yearSet.has(prevVal)) {
      yearSel.value = prevVal;
    } else {
      yearSel.value = currentYear;
      state.certFilterYear = currentYear;
    }
    syncCustomSelect('cert-filter-year');
  }

  function renderCertSavedFilterWeeks() {
    const weekSel = document.getElementById('cert-filter-week');
    if (!weekSel) return;
    const filterYear = state.certFilterYear || 'ALL';
    const filterLine = state.certFilterLine || 'ALL';
    const allSaved = state.certSavedRows || [];

    const weekMap = new Map();
    allSaved.forEach(row => {
      if (filterYear !== 'ALL' && getCertRowYear(row) !== filterYear) return;
      if (filterLine !== 'ALL' && (row.group || '').trim() !== filterLine) return;
      const wd = String(row.weekDate || '').trim();
      if (!wd) return;
      if (!weekMap.has(wd)) {
        weekMap.set(wd, formatCertWeekOptionLabel(wd, row.sourceWeekId));
      }
    });

    const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => b.localeCompare(a));
    const currentVal = state.certFilterWeek || 'ALL';

    weekSel.innerHTML = '<option value="ALL">생산주차</option>';
    sortedWeeks.forEach(wd => {
      const opt = document.createElement('option');
      opt.value = wd;
      opt.textContent = weekMap.get(wd);
      weekSel.appendChild(opt);
    });

    if (currentVal !== 'ALL' && weekMap.has(currentVal)) {
      weekSel.value = currentVal;
    } else {
      weekSel.value = 'ALL';
      state.certFilterWeek = 'ALL';
    }
    syncCustomSelect('cert-filter-week');
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
      tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 25px; color: #94a3b8;">${emptyMsg}</td></tr>`;
      return;
    }

    const lotSuggestions = getNextLotSuggestionsMap(rows);
    const fromSuggestions = getNextFromSuggestionsMap(rows);

    rows.forEach((row, idx) => {
      updateDraftRowCalculations(row);
      const qtyNum = parseSafeInt(row.qty);
      totalQty += qtyNum;

      // 로트번호 중복 여부 확인
      const isDupLot = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id, row.code);
      const lotHint = lotSuggestions.get(row.id);
      const lotPlaceholder = lotHint ? lotHint.suggestion : '';
      const groupLabel = isValidCertFormatNo(row.formatNo) ? '형식번호' : '품목코드';
      const lotTitle = isDupLot
        ? `⚠ 동일 ${groupLabel} 내 이미 존재하는 로트번호입니다!`
        : (lotHint ? `최근 로트: ${lotHint.prevLot} → 다음 추천: ${lotHint.suggestion}` : '');

      // 제조번호 FROM/TO 중복·사이값 여부 확인 및 다음 번호 예측
      const isDupSerial = checkSerialRangeOverlap(row.formatNo, row.from, row.to, row.id, row.code, row);
      const fromHint = fromSuggestions.get(row.id);
      const fromPlaceholder = fromHint ? fromHint.suggestion : '';
      const fromTitle = isDupSerial
        ? `⚠ 동일 ${groupLabel} 내 중복되거나 겹치는 제조번호 구간(사이값)이 있습니다!`
        : (fromHint ? `최근 제조번호 TO: ${fromHint.prevTo} → 다음 추천 FROM: ${fromHint.suggestion}` : '');

      // 요청부서 옵션
      const deptList = (state.departments && state.departments.length > 0) ? state.departments : ['판매팀', '영업팀', '시공팀', '특수사업팀', '금성비나'];
      const deptOptions = deptList.map(d => `<option value="${d}" ${d === row.dept ? 'selected' : ''}>${d}</option>`).join('');

      const tr = document.createElement('tr');
      tr.dataset.id = row.id;
      tr.dataset.rowIndex = idx;

      tr.innerHTML = `
        <td class="col-cert-check" style="text-align: center;">
          <input type="checkbox" tabindex="-1" class="cert-draft-row-check" data-id="${row.id}" ${row.checked ? 'checked' : ''}>
        </td>
        <td class="col-cert-no" style="text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
        <td class="col-cert-code cell-readonly">
          <input type="text" tabindex="-1" class="cell-input" readonly value="${row.code || ''}">
        </td>
        <td class="col-cert-name">
          <div class="cert-name-cell-wrap">
            <input type="text" class="cell-input cert-input-name" data-id="${row.id}" value="${getDisplayNameByCode(row.code, row.name || '')}">
            <button type="button" tabindex="-1" class="btn-search-item btn-open-cert-modal" data-id="${row.id}" title="품목 검색 팝업 (F2)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.5" y2="16.5"></line>
              </svg>
            </button>
          </div>
        </td>
        <td class="col-cert-spec cell-readonly">
          <input type="text" tabindex="-1" class="cell-input" readonly value="${row.spec || ''}" title="${row.spec || ''}">
        </td>
        <td class="col-cert-format cell-readonly">
          <input type="text" tabindex="-1" class="cell-input text-center" readonly value="${row.formatNo || ''}">
        </td>
        <td class="col-cert-type cell-readonly">
          <input type="text" tabindex="-1" class="cell-input text-center" readonly value="${row.type || ''}">
        </td>
        <td class="col-cert-date">
          <input type="text" class="cell-input text-center cert-input-field cert-input-date" data-field="writeDate" data-id="${row.id}" value="${row.writeDate || ''}" placeholder="MM-DD" maxlength="10">
        </td>
        <td class="col-cert-date">
          <input type="text" class="cell-input text-center cert-input-field cert-input-date" data-field="inspectDate" data-id="${row.id}" value="${row.inspectDate || ''}" placeholder="MM-DD" maxlength="10">
        </td>
        <td class="col-cert-date">
          <input type="text" class="cell-input text-center cert-input-field cert-input-date" data-field="weekDate" data-id="${row.id}" value="${row.weekDate || ''}" placeholder="MM-DD" maxlength="10" title="생산주차 금요일">
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
          <input type="text" tabindex="-1" class="cell-input text-right font-bold text-slate-700" readonly value="${row.to || ''}">
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

    // 필터링 적용 (연도 / 작업반 / 상태 / 생산주차 / 통합검색)
    const filterYear = state.certFilterYear || 'ALL';
    const filterLine = state.certFilterLine || 'ALL';
    const filterWeek = state.certFilterWeek || 'ALL';
    const filterStatus = state.certFilterStatus || 'ALL';
    const filterSearch = (state.certFilterSearch || '').trim().toLowerCase();

    const filteredRows = allSaved.filter(row => {
      if (filterYear !== 'ALL' && getCertRowYear(row) !== filterYear) return false;
      if (filterLine !== 'ALL' && (row.group || '').trim() !== filterLine) return false;
      if (filterWeek !== 'ALL' && String(row.weekDate || '').trim() !== filterWeek) return false;
      if (filterStatus !== 'ALL') {
        const st = String(row.status || '등록완료').trim();
        if (filterStatus === '일정완료') {
          if (st !== '일정완료' && st !== '검정완료') return false;
        } else if (filterStatus === '검정신청') {
          if (st !== '검정신청' && st !== '품검요청') return false;
        } else if (st !== filterStatus) {
          return false;
        }
      }
      if (filterSearch) {
        const hay = [
          row.code, row.name, row.spec, row.formatNo,
          row.site, row.lotNo, row.kfiNo, row.dept
        ].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(filterSearch)) return false;
      }
      return true;
    });

    let totalSavedQty = 0;

    if (filteredRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="22" style="text-align: center; padding: 25px; color: #94a3b8;">조건에 맞는 등록 내역이 없습니다. (총 누적: ${allSaved.length}건)</td></tr>`;
    } else {
      filteredRows.forEach((row, idx) => {
        const qtyNum = parseSafeInt(row.qty);
        totalSavedQty += qtyNum;

        const status = row.status || '등록완료';
        const isCompleted = (status === '일정완료');

        let statusBadge = '';
        let rowClass = '';
        if (status === '검정신청' || status === '품검요청') {
          const reqCnt = parseSafeInt(row.requestCount);
          const reqLabel = reqCnt > 1 ? `검정신청 (${reqCnt})` : '검정신청';
          statusBadge = `<span class="cert-status-badge status-applied">${reqLabel}</span>`;
          rowClass = 'row-status-applied';
        } else if (status === '부적합') {
          statusBadge = `<span class="cert-status-badge status-failed">부적합</span>`;
          rowClass = 'row-status-failed';
        } else if (status === '일정완료') {
          statusBadge = `<span class="cert-status-badge status-completed"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>일정완료</span>`;
          rowClass = 'row-status-completed';
        } else {
          statusBadge = `<span class="cert-status-badge status-registered">등록완료</span>`;
        }

        const checkCell = `<input type="checkbox" class="check-cert-saved-row" data-id="${row.id}" ${isCompleted ? 'disabled title="일정완료된 일정은 선택 불가"' : ''}>`;

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
          <td class="col-cert-type text-center" style="text-align: center;">${row.type || '-'}</td>
          <td class="col-cert-date text-center">${row.writeDate || '-'}</td>
          <td class="col-cert-date text-center">${row.inspectDate || '-'}</td>
          <td class="col-cert-date text-center">${row.weekDate || '-'}</td>
          <td class="col-cert-qty num-cell text-right font-bold text-primary" style="text-align: right; padding-right: 8px;">${formatNumberDisplay(qtyNum)}</td>
          <td class="col-cert-lot text-center font-bold text-slate-800">${row.lotNo || '-'}</td>
          <td class="col-cert-from num-cell text-right" style="text-align: right; padding-right: 8px;">${row.from ? formatNumberDisplay(row.from) : '-'}</td>
          <td class="col-cert-to num-cell text-right" style="text-align: right; padding-right: 8px;">${row.to ? formatNumberDisplay(row.to) : '-'}</td>
          <td class="col-cert-passno font-bold text-emerald-700">${row.passNo || '-'}</td>
          <td class="col-cert-site text-slate-700" title="${row.site || ''}">${row.site || '-'}</td>
          <td class="col-cert-color text-center">${row.color || '-'}</td>
          <td class="col-cert-dept text-center" style="text-align: center;">${row.dept || '-'}</td>
          <td class="col-cert-sensor text-center">${row.sensor || '-'}</td>
          <td class="col-cert-ctrl text-center">${row.ctrl || '-'}</td>
          <td class="col-cert-gas text-center">${row.gas || '-'}</td>
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
    if (typeof updateNavTabBadges === 'function') updateNavTabBadges();
    const tbody = document.getElementById('quality-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const viewMode = state.qualityViewMode === 'passed' ? 'passed' : 'pending';
    document.querySelectorAll('#quality-view-mode-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.qmode === viewMode);
    });
    const btnPass = document.getElementById('btn-quality-pass');
    const btnFail = document.getElementById('btn-quality-fail');
    const btnCancelPass = document.getElementById('btn-quality-cancel-pass');
    if (btnPass) btnPass.style.display = viewMode === 'pending' ? '' : 'none';
    if (btnFail) btnFail.style.display = viewMode === 'pending' ? '' : 'none';
    if (btnCancelPass) btnCancelPass.style.display = viewMode === 'passed' ? '' : 'none';

    const statusPill = document.getElementById('quality-filter-status-pill');
    if (statusPill) {
      statusPill.innerHTML = viewMode === 'passed'
        ? '<span>합격완료 이력 조회 (최근 30일)</span>'
        : '<span>전체 품검 대기 조회</span>';
    }

    const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const isWithinLast30Days = (r) => {
      if (r.completedAt) return Number(r.completedAt) >= thirtyDaysAgoMs;
      const fallbackDate = r.inspectDate || r.writeDate || r.weekDate || '';
      if (fallbackDate) {
        const ts = new Date(fallbackDate + 'T00:00:00').getTime();
        if (Number.isFinite(ts)) return ts >= thirtyDaysAgoMs;
      }
      return false;
    };

    const allQuality = viewMode === 'passed'
      ? (state.certSavedRows || [])
          .filter(r => (r.type || '').trim() === '품질' && r.status === '일정완료' && isWithinLast30Days(r))
          .slice()
          .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
      : (state.qualityRows || []);
    const filterDate = state.qualityFilterDate || '';

    // 생산주차 필터 드롭다운 옵션 구성
    const weekSel = document.getElementById('quality-filter-week');
    let filterWeek = state.qualityFilterWeek || 'ALL';
    if (weekSel) {
      const weekLabelMap = new Map();
      allQuality.forEach(r => {
        const wd = String(r.weekDate || '').trim();
        if (!wd) return;
        if (!weekLabelMap.has(wd)) {
          const wId = String(r.sourceWeekId || '').trim();
          weekLabelMap.set(wd, wId ? `${wId} (${wd})` : wd);
        }
      });
      const sortedWeeks = Array.from(weekLabelMap.keys()).sort();
      weekSel.innerHTML = '<option value="ALL">전체 주차</option>';
      sortedWeeks.forEach(wd => {
        const opt = document.createElement('option');
        opt.value = wd;
        opt.textContent = weekLabelMap.get(wd);
        weekSel.appendChild(opt);
      });
      if (filterWeek !== 'ALL' && !weekLabelMap.has(filterWeek)) {
        filterWeek = 'ALL';
        state.qualityFilterWeek = 'ALL';
      }
      weekSel.value = filterWeek;
      if (typeof syncCustomSelect === 'function') syncCustomSelect('quality-filter-week');
    }

    const filtered = allQuality.filter(row => {
      if (filterDate && !(row.writeDate === filterDate || row.inspectDate === filterDate || row.weekDate === filterDate)) {
        return false;
      }
      if (filterWeek && filterWeek !== 'ALL' && String(row.weekDate || '').trim() !== filterWeek) {
        return false;
      }
      return true;
    });

    let totalQty = 0;
    if (filtered.length === 0) {
      const emptyGuide = viewMode === 'passed'
        ? '합격완료 처리된 품질검사 내역이 없습니다.'
        : '검정신청된 일정이 없습니다. [검정현황] 화면에서 일정을 선택 후 <strong>[검정신청]</strong>을 누르면 이 화면에 추가됩니다.';
      tbody.innerHTML = `<tr><td colspan="23" style="text-align: center; padding: 35px; color: #94a3b8; font-size: 13.5px;">
        <svg style="width:15px;height:15px;vertical-align:-2px;margin-right:4px;opacity:0.75;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>${emptyGuide}
      </td></tr>`;
    } else {
      filtered.forEach((row, idx) => {
        const qtyNum = parseSafeInt(row.qty);
        totalQty += qtyNum;

        const tr = document.createElement('tr');
        tr.dataset.id = row.id;

        const reqCnt = parseSafeInt(row.requestCount);
        const qualStatusLabel = reqCnt > 1 ? `품검대기 (${reqCnt})` : '품검대기';
        const statusBadgeHtml = viewMode === 'passed'
          ? '<span class="cert-status-badge status-completed"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>일정완료</span>'
          : `<span class="cert-status-badge status-applied">${qualStatusLabel}</span>`;

        tr.innerHTML = `
          <td class="col-cert-check" style="text-align: center;">
            <input type="checkbox" class="check-quality-row" data-id="${row.id}" data-cert-id="${row.certRowId || row.id}">
          </td>
          <td class="col-cert-no" style="text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
          <td class="col-cert-status" style="text-align: center;">
            ${statusBadgeHtml}
          </td>
          <td class="col-cert-type text-center" style="text-align: center;">${row.type || '품질'}</td>
          <td class="col-cert-group text-center font-bold text-slate-700">${row.group || '-'}</td>
          <td class="col-cert-code text-center font-bold text-slate-700">${row.code || '-'}</td>
          <td class="col-cert-name font-bold text-primary">${getDisplayNameByCode(row.code, row.name) || '-'}</td>
          <td class="col-cert-spec text-slate-600" title="${row.spec || ''}">${row.spec || '-'}</td>
          <td class="col-cert-format text-center">${row.formatNo || '-'}</td>
          <td class="col-cert-date text-center">${row.writeDate || '-'}</td>
          <td class="col-cert-date text-center">${row.inspectDate || '-'}</td>
          <td class="col-cert-date text-center">${row.weekDate || '-'}</td>
          <td class="col-cert-qty num-cell text-right font-bold text-primary" style="text-align: right; padding-right: 8px;">${formatNumberDisplay(qtyNum)}</td>
          <td class="col-cert-lot text-center font-bold text-slate-800">${row.lotNo || '-'}</td>
          <td class="col-cert-from num-cell text-right" style="text-align: right; padding-right: 8px;">${row.from ? formatNumberDisplay(row.from) : '-'}</td>
          <td class="col-cert-to num-cell text-right" style="text-align: right; padding-right: 8px;">${row.to ? formatNumberDisplay(row.to) : '-'}</td>
          <td class="col-cert-passno font-bold text-emerald-700">${row.passNo || '-'}</td>
          <td class="col-cert-site text-slate-700" title="${row.site || ''}">${row.site || '-'}</td>
          <td class="col-cert-color text-center">${row.color || '-'}</td>
          <td class="col-cert-dept text-center" style="text-align: center;">${row.dept || '-'}</td>
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

  // 품목정보 마스터 변경 시 모든 연관 화면(검정현황, 품질검사, 수신기계획, 생산계획, 검정정산) 자동 동기화
  function syncMasterChangesToAllViews() {
    const masterMap = new Map();
    (state.certMasterItems || []).forEach(m => {
      const key = String(m?.code || '').trim().toLowerCase();
      if (key) masterMap.set(key, m);
    });

    const syncCertRow = (r) => {
      if (!r || !r.code) return false;
      const m = masterMap.get(String(r.code).trim().toLowerCase());
      if (!m) return false;
      let changed = false;
      const nextName = getDisplayItemName(m);
      const nextSpec = m.spec || '';
      const nextFmt = m.formatNo || '';
      const nextType = m.inspectType || r.type || '품질';
      const nextGroup = m.group || '';
      const nextSensor = m.sensor || '';
      const nextCtrl = m.ctrl || '';
      const nextGas = m.gas || '';

      if (r.name !== nextName) { r.name = nextName; changed = true; }
      if ((r.spec || '') !== nextSpec) { r.spec = nextSpec; changed = true; }
      if ((r.formatNo || '') !== nextFmt) { r.formatNo = nextFmt; changed = true; }
      if ((r.type || '') !== nextType) { r.type = nextType; changed = true; }
      if ((r.group || '') !== nextGroup) { r.group = nextGroup; changed = true; }
      if ((r.sensor || '') !== nextSensor) { r.sensor = nextSensor; changed = true; }
      if ((r.ctrl || '') !== nextCtrl) { r.ctrl = nextCtrl; changed = true; }
      if ((r.gas || '') !== nextGas) { r.gas = nextGas; changed = true; }
      return changed;
    };

    let certChanged = false;
    (state.certDraftRows || []).forEach(r => { if (syncCertRow(r)) certChanged = true; });
    (state.certSavedRows || []).forEach(r => { if (syncCertRow(r)) certChanged = true; });

    let qualChanged = false;
    (state.qualityRows || []).forEach(r => {
      if (!r || !r.code) return;
      const m = masterMap.get(String(r.code).trim().toLowerCase());
      if (!m) return;
      const nextName = getDisplayItemName(m);
      const nextSpec = m.spec || '';
      const nextFmt = m.formatNo || '';
      const nextGroup = m.group || '';
      if (r.name !== nextName) { r.name = nextName; qualChanged = true; }
      if ((r.spec || '') !== nextSpec) { r.spec = nextSpec; qualChanged = true; }
      if ((r.formatNo || '') !== nextFmt) { r.formatNo = nextFmt; qualChanged = true; }
      if ((r.group || '') !== nextGroup) { r.group = nextGroup; qualChanged = true; }
    });

    if (certChanged) {
      saveLocalCertData();
      saveCertDataToDb(true);
    }
    if (qualChanged) {
      if (typeof saveLocalQualityData === 'function') saveLocalQualityData();
      if (typeof saveQualityRowsToDb === 'function') saveQualityRowsToDb();
    }

    let rpChanged = false;
    (state.receiverPlanRows || []).forEach(r => {
      if (!r || !r.code) return;
      const m = masterMap.get(String(r.code).trim().toLowerCase());
      if (!m) return;
      const nextName = getDisplayItemName(m);
      const nextItemGroup = (m.itemGroup && m.itemGroup !== '-') ? m.itemGroup : (r.itemGroup || '');
      const nextFmt = m.formatNo || '';
      if ((r.name || '') !== nextName) { r.name = nextName; rpChanged = true; }
      if ((r.itemGroup || '') !== nextItemGroup) { r.itemGroup = nextItemGroup; rpChanged = true; }
      if ((r.formatNo || '') !== nextFmt) { r.formatNo = nextFmt; rpChanged = true; }
    });

    if (rpChanged) {
      if (typeof saveLocalReceiverPlanData === 'function') saveLocalReceiverPlanData();
      if (typeof saveReceiverPlanToDb === 'function') saveReceiverPlanToDb(true);
    }

    if (typeof renderPlanModule === 'function') renderPlanModule();
    if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
    if (typeof renderCertificationModule === 'function') renderCertificationModule();
    if (typeof renderQualityTable === 'function') renderQualityTable();
    if (typeof renderCertSettlementModule === 'function') renderCertSettlementModule();
  }

  function getAllItemGroupOptions() {
    const set = new Set([
      'GT1 일체', 'GT1 일반', 'GT1 벽부', 'F3P 가스', 'F3P 복합'
    ]);
    (state.certMasterItems || []).forEach(it => {
      const ig = String(it?.itemGroup || '').trim();
      if (ig && ig !== '-') set.add(ig);
    });
    (state.receiverPlanRows || []).forEach(r => {
      const ig = String(r?.itemGroup || '').trim();
      if (ig && ig !== '-') set.add(ig);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }

  function getItemGroupColorClass(groupName) {
    const g = String(groupName || '').trim();
    if (!g || g === '-') return '';
    const fixedColorMap = {
      'GT1 일체': 'ig-color-4', // 빨간색
      'GT1 일반': 'ig-color-6', // 주황색
      'GT1 벽부': 'ig-color-0', // 파란색
      'F3P 복합': 'ig-color-3', // 보라색
      'F3P복합': 'ig-color-3',
      'F3P 가스': 'ig-color-2', // 초록색
      'F3P가스': 'ig-color-2'
    };
    if (fixedColorMap[g]) return fixedColorMap[g];

    const fallbackIndices = [5, 7, 8, 9, 1];
    const groupSet = new Set();
    (state.certMasterItems || []).forEach(it => {
      const ig = String(it?.itemGroup || '').trim();
      if (ig && ig !== '-' && !fixedColorMap[ig]) groupSet.add(ig);
    });
    (state.receiverPlanRows || []).forEach(r => {
      const ig = String(r?.itemGroup || '').trim();
      if (ig && ig !== '-' && !fixedColorMap[ig]) groupSet.add(ig);
    });
    groupSet.add(g);
    const sorted = Array.from(groupSet).sort((a, b) => a.localeCompare(b, 'ko'));
    const idx = sorted.indexOf(g);
    const paletteIdx = fallbackIndices[(idx >= 0 ? idx : 0) % fallbackIndices.length];
    return `ig-color-${paletteIdx}`;
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

    const isEditMode = Boolean(state.certMasterEditMode);
    const thAction = document.getElementById('th-cert-master-action');
    if (thAction) thAction.textContent = isEditMode ? '삭제' : '';

    const btnEdit = document.getElementById('btn-cert-selected-edit');
    const btnSave = document.getElementById('btn-cert-inline-save');
    const btnCancel = document.getElementById('btn-cert-inline-cancel');
    if (btnEdit) btnEdit.style.display = isEditMode ? 'none' : '';
    if (btnSave) btnSave.style.display = isEditMode ? '' : 'none';
    if (btnCancel) btnCancel.style.display = isEditMode ? '' : 'none';

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="17" style="text-align: center; padding: 25px; color: #94a3b8;">등록된 품목이 없습니다. 상단 [+ 신규 품목 등록] 또는 [엑셀 업로드]를 이용하세요.</td></tr>`;
      return;
    }

    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    filtered.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const igRowCls = getItemGroupColorClass(item.itemGroup);
      tr.className = (isEditMode ? 'cert-master-row is-editing' : 'draggable-row cert-master-row') + (igRowCls ? ` ${igRowCls}` : '');
      tr.draggable = !isEditMode;
      tr.dataset.id = item.id;
      tr.dataset.dragIndex = idx;

      if (isEditMode) {
        tr.dataset.editing = 'true';
        tr.innerHTML = `
          <td style="text-align: center;">
            <button type="button" class="btn-cert-row-del-x" data-id="${item.id}" title="이 품목 삭제">×</button>
          </td>
          <td style="text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
          <td><select class="cert-inline-edit-input" data-f="useYn"><option value="사용" ${item.useYn === '사용' ? 'selected' : ''}>사용</option><option value="미사용" ${item.useYn === '미사용' ? 'selected' : ''}>미사용</option></select></td>
          <td><select class="cert-inline-edit-input" data-f="applyType"><option value="자동" ${getDefaultItemApplyType(item) === '자동' ? 'selected' : ''}>자동</option><option value="수동" ${getDefaultItemApplyType(item) === '수동' ? 'selected' : ''}>수동</option></select></td>
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
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="sensor" value="${esc(item.sensor)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="ctrl" value="${esc(item.ctrl)}"></td>
          <td><input type="text" class="cert-inline-edit-input text-center" data-f="gas" value="${esc(item.gas)}"></td>
        `;
      } else {
        const applyTypeVal = getDefaultItemApplyType(item);
        tr.innerHTML = `
          <td style="text-align: center; color: #cbd5e1;">·</td>
          <td class="drag-handle-cell" style="text-align: center; cursor: grab; color: #94a3b8;">${idx + 1}</td>
          <td style="text-align: center;"><span class="badge ${item.useYn === '사용' ? 'badge-success' : 'badge-ghost'}">${item.useYn || '사용'}</span></td>
          <td style="text-align: center;"><span class="badge ${applyTypeVal === '수동' ? 'badge-apply-manual' : 'badge-apply-auto'}">${applyTypeVal}</span></td>
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
          <td style="text-align: center;">${item.sensor || '-'}</td>
          <td style="text-align: center;">${item.ctrl || '-'}</td>
          <td style="text-align: center;">${item.gas || '-'}</td>
        `;
      }

      tbody.appendChild(tr);
    });

    if (!isEditMode) {
      bindCertMasterDragAndDrop(tbody);
    }
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

  // 커스텀 드롭다운 UI 헬퍼 (네이티브 <select>를 숨기고 통일된 라운드 카드형 드롭다운으로 래핑)
  function resolveSelectEl(selectOrId) {
    if (!selectOrId) return null;
    if (typeof selectOrId === 'string') return document.getElementById(selectOrId);
    return selectOrId;
  }

  function syncCustomSelect(selectOrId) {
    const sel = resolveSelectEl(selectOrId);
    if (!sel) return;
    const wrap = sel.nextElementSibling;
    if (!wrap || !wrap.classList.contains('ui-custom-select-wrap')) return;

    const btnText = wrap.querySelector('.ui-custom-select-label');
    const menu = wrap.querySelector('.ui-custom-select-menu');
    const selectedOpt = sel.options[sel.selectedIndex] || sel.options[0];
    if (btnText) btnText.textContent = selectedOpt ? selectedOpt.textContent : '';

    if (menu) {
      menu.innerHTML = '';
      const appendOptionBtn = (opt) => {
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
          syncCustomSelect(sel);
        });
        menu.appendChild(item);
      };

      Array.from(sel.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
          const grpLabel = document.createElement('div');
          grpLabel.className = 'ui-custom-select-group-label';
          grpLabel.textContent = child.label || '';
          menu.appendChild(grpLabel);
          Array.from(child.children).forEach(opt => {
            if (opt.tagName === 'OPTION') appendOptionBtn(opt);
          });
        } else if (child.tagName === 'OPTION') {
          appendOptionBtn(child);
        }
      });

      if (sel.dataset.hasWorkgroupManage === '1') {
        const div = document.createElement('div');
        div.className = 'ui-custom-select-divider';
        menu.appendChild(div);

        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'ui-custom-select-action';
        actionBtn.textContent = '⚙ 작업반 등록/수정';
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wrap.classList.remove('is-open');
          openWorkGroupsModal();
        });
        menu.appendChild(actionBtn);
      }
    }
  }

  function positionCustomSelectMenu(btn, menu) {
    const rect = btn.getBoundingClientRect();
    menu.style.minWidth = `${Math.max(rect.width, 115)}px`;
    menu.style.left = `${rect.left}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    const estHeight = Math.min(280, menu.scrollHeight || 200);
    if (spaceBelow < estHeight + 12 && rect.top > estHeight + 12) {
      menu.style.top = `${Math.max(8, rect.top - estHeight - 4)}px`;
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
    }
  }

  function enhanceSelectToCustomDropdown(selectOrId) {
    const sel = resolveSelectEl(selectOrId);
    if (!sel || sel.multiple || sel.dataset.nativeSelect === '1' || sel.dataset.customized === '1') return;
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
    const menu = wrap.querySelector('.ui-custom-select-menu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.plan-dropdown-wrap').forEach(w => {
        if (w !== wrap) w.classList.remove('is-open');
      });
      syncCustomSelect(sel);
      const willOpen = !wrap.classList.contains('is-open');
      wrap.classList.toggle('is-open', willOpen);
      if (willOpen) {
        positionCustomSelectMenu(btn, menu);
      }
    });

    sel.addEventListener('change', () => syncCustomSelect(sel));

    // <option> 목록 동적 변경 시 자동 동기화
    const optObs = new MutationObserver(() => syncCustomSelect(sel));
    optObs.observe(sel, { childList: true, subtree: true });

    syncCustomSelect(sel);
  }

  function enhanceAllSelects(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('select:not([data-customized="1"]):not([data-native-select="1"])').forEach(sel => {
      enhanceSelectToCustomDropdown(sel);
    });
  }

  // 작업반 등록/수정 모달 제어
  function renderWorkGroupsModalList() {
    const tbody = document.getElementById('workgroup-modal-tbody');
    if (!tbody) return;
    const entries = getWorkGroupEntries();
    tbody.innerHTML = entries.map((grp, idx) => `
      <tr data-index="${idx}">
        <td style="text-align:center; color:var(--text-muted); font-weight:600; font-size:12px;">${idx + 1}</td>
        <td style="padding:6px 8px;">
          <select class="form-select form-select-sm wg-edit-category" data-index="${idx}" style="width:100%; height:30px; border-radius:6px; font-size:12px; font-weight:600;">
            <option value="직접제조" ${grp.category !== '제조지원' ? 'selected' : ''}>직접제조</option>
            <option value="제조지원" ${grp.category === '제조지원' ? 'selected' : ''}>제조지원</option>
          </select>
        </td>
        <td style="padding:6px 8px;">
          <input type="text" class="form-input form-input-sm wg-edit-input" data-index="${idx}" value="${String(grp.name).replace(/"/g, '&quot;')}" style="width:100%; height:30px; border-radius:6px; font-size:13px; font-weight:600; color:#1e293b;">
        </td>
        <td style="text-align:center; padding:6px 8px;">
          <div class="action-btn-group" style="justify-content:center; gap:4px;">
            <button type="button" class="btn btn-xs btn-outline btn-wg-save" data-index="${idx}" style="border-radius:6px;">수정</button>
            <button type="button" class="btn btn-xs btn-ghost text-danger btn-wg-del" data-index="${idx}" style="border-radius:6px;">삭제</button>
          </div>
        </td>
      </tr>
    `).join('');
    if (typeof enhanceAllSelects === 'function') enhanceAllSelects(tbody);
  }

  function openWorkGroupsModal() {
    const modal = document.getElementById('modal-work-groups');
    if (!modal) return;
    renderWorkGroupsModalList();
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('input-new-workgroup')?.focus(), 50);
  }

  function closeWorkGroupsModal() {
    const modal = document.getElementById('modal-work-groups');
    if (modal) modal.style.display = 'none';
  }

  // (13) 검정현황 전용 이벤트 리스너 바인딩
  function initCertEventListeners() {
    // 검정현황 드롭다운 커스텀 스타일 적용
    enhanceSelectToCustomDropdown('cert-plan-week-select');
    enhanceSelectToCustomDropdown('cert-auto-line-filter');
    enhanceSelectToCustomDropdown('cert-filter-year');
    enhanceSelectToCustomDropdown('cert-filter-line');
    enhanceSelectToCustomDropdown('cert-filter-status');
    enhanceSelectToCustomDropdown('cert-filter-week');
    enhanceSelectToCustomDropdown('quality-filter-week');

    // 0. 자동 / 수동 모드 전환 & 주차 / 작업반 연동
    document.querySelectorAll('.cert-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'manual' ? 'manual' : 'auto';
        if (state.certMode === mode) return;
        state.certMode = mode;
        if (mode === 'auto') {
          populateCertPlanWeekSelect();
          loadCertDraftFromPlanWeek(state.certSelectedWeekId || '', state.certAutoLineFilter || 'ALL');
        } else {
          state.certDraftRows = [createNewDraftRow()];
          saveLocalCertData();
        }
        renderCertificationModule();
      });
    });

    document.getElementById('btn-cert-refresh-week')?.addEventListener('click', () => {
      if ((state.certMode || 'auto') === 'auto') {
        populateCertPlanWeekSelect();
        const targetWeek = state.certSelectedWeekId || document.getElementById('cert-plan-week-select')?.value || '';
        state.certSelectedWeekId = targetWeek;
        loadCertDraftFromPlanWeek(targetWeek, state.certAutoLineFilter || 'ALL');
        const parsedW = parseCertWeekKey(targetWeek, '');
        const weekLabel = parsedW.year ? `${parsedW.year}년 ${parsedW.weekId}` : parsedW.weekId;
        showToast(targetWeek ? `${weekLabel} 주차를 다시 불러왔습니다.` : '미등록 생산계획 주차가 없습니다.');
      }
    });

    document.getElementById('btn-cert-saved-expand')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const stack = document.querySelector('#tab-certification .cert-grid-stack');
      if (!stack) return;
      const expanded = stack.classList.toggle('is-saved-expanded');
      btn.classList.toggle('is-expanded', expanded);
      btn.textContent = expanded ? '접기' : '펼침';
      btn.title = expanded ? '원래 크기(50:50)로 되돌리기' : '검정 등록 내역 크게 보기 (상단 1행만 표시)';
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
        populateCertPlanWeekSelect();
        loadCertDraftFromPlanWeek(state.certSelectedWeekId || '', state.certAutoLineFilter);
      }
    });

    // 0-B. [분할] 모달 로직 (검정현황 + 생산계획 공용)
    let splitTargetRowId = null;
    let splitPlanTarget = null; // { code, name, weekId, qty }
    let splitMode = 'manual'; // 'manual' | 'lot'

    function getSplitTargetOrigQty() {
      if (splitPlanTarget) return parseSafeInt(splitPlanTarget.qty);
      const row = (state.certDraftRows || []).find(r => r.id === splitTargetRowId);
      return row ? parseSafeInt(row.qty) : 0;
    }

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
      const origQty = getSplitTargetOrigQty();
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
      const origQty = getSplitTargetOrigQty();
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
      splitPlanTarget = null;
      splitTargetRowId = target.id;
      const titleEl = document.getElementById('cert-split-modal-title');
      if (titleEl) titleEl.textContent = '✂ 신청수량 분할';
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

    window._openPlanSplitModal = ({ code, name, weekId, qty, existingSplits }) => {
      const origQty = parseSafeInt(qty);
      if (origQty < 2) {
        alert('생산 수량이 2 이상인 셀만 분할할 수 있습니다.');
        return;
      }
      splitTargetRowId = null;
      splitPlanTarget = { code, name, weekId, qty: origQty };
      const titleEl = document.getElementById('cert-split-modal-title');
      if (titleEl) titleEl.textContent = '✂ 생산수량 분할';
      splitMode = 'manual';
      document.getElementById('btn-split-tab-manual')?.classList.add('active');
      document.getElementById('btn-split-tab-lot')?.classList.remove('active');
      document.getElementById('cert-split-manual-pane').style.display = 'block';
      document.getElementById('cert-split-lot-pane').style.display = 'none';

      const info = document.getElementById('cert-split-item-info');
      if (info) {
        info.innerHTML = `<strong>${name || code}</strong> (${code || ''} · ${weekId})<br>현재 생산수량: <strong style="color:#2563eb;">${origQty.toLocaleString()}</strong>`;
      }
      const initialParts = (Array.isArray(existingSplits) && existingSplits.length >= 2)
        ? existingSplits.map(n => parseSafeInt(n))
        : [Math.floor(origQty / 2), origQty - Math.floor(origQty / 2)];
      renderSplitManualRows(initialParts);
      document.getElementById('cert-split-modal').style.display = 'flex';
    };

    document.getElementById('cert-split-rows-wrap')?.addEventListener('input', (e) => {
      if (!e.target.classList.contains('cert-split-amt-input')) return;
      const inputs = Array.from(document.querySelectorAll('#cert-split-rows-wrap .cert-split-amt-input'));
      const idx = Number(e.target.dataset.idx);
      const origQty = getSplitTargetOrigQty();
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
      splitPlanTarget = null;
    };
    document.getElementById('btn-close-split-modal')?.addEventListener('click', closeSplitModal);
    document.getElementById('btn-cancel-split-modal')?.addEventListener('click', closeSplitModal);

    document.getElementById('btn-confirm-split-modal')?.addEventListener('click', () => {
      const planTarget = splitPlanTarget;
      const idx = planTarget ? -1 : (state.certDraftRows || []).findIndex(r => r.id === splitTargetRowId);
      if (!planTarget && idx === -1) return;
      const origRow = planTarget ? null : state.certDraftRows[idx];
      const origQty = planTarget ? parseSafeInt(planTarget.qty) : parseSafeInt(origRow.qty);

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

      if (planTarget) {
        pushPlanUndoSnapshot();
        if (!state.planData) state.planData = getDefaultPlanData();
        if (!state.planData.rowsByCode[planTarget.code]) {
          state.planData.rowsByCode[planTarget.code] = { weeks: {}, colors: {}, memos: {}, splits: {} };
        }
        if (!state.planData.rowsByCode[planTarget.code].splits) {
          state.planData.rowsByCode[planTarget.code].splits = {};
        }
        state.planData.rowsByCode[planTarget.code].splits[planTarget.weekId] = parts;
        saveLocalPlanData();
        markAsDirty(true);

        const pdYear = String(state.planData?.year || '');
        const syncedCount = syncCertRegisteredRowsSplit(planTarget.code, planTarget.weekId, pdYear, parts);
        if ((state.certMode || 'auto') === 'auto' && state.certSelectedWeekId) {
          const parsedSel = parseCertWeekKey(state.certSelectedWeekId, pdYear);
          if (parsedSel.weekId === planTarget.weekId && (!pdYear || !parsedSel.year || parsedSel.year === pdYear)) {
            loadCertDraftFromPlanWeek(state.certSelectedWeekId, state.certAutoLineFilter || 'ALL');
          }
        }

        renderPlanModule();
        closeSplitModal();
        showToast(syncedCount >= 2
          ? `${parts.length}개로 분할되었습니다. (검정현황 등록완료 ${syncedCount}건 자동 분할)`
          : `${parts.length}개로 분할되었습니다. (${parts.map(p => p.toLocaleString()).join('/')})`);
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

      const srcYear = getCertRowYear(src);
      const candidates = (state.certSavedRows || []).filter(r =>
        String(r.code || '').trim() === String(src.code || '').trim() &&
        getCertRowYear(r) === srcYear &&
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
          <div style="font-variant-numeric:tabular-nums; font-weight:700; color:#1e293b;">
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

    // 1. [표 2] 연도 / 상태 / 생산주차 / 통합검색 / 초기화 필터
    document.getElementById('cert-filter-year')?.addEventListener('change', (e) => {
      state.certFilterYear = e.target.value || 'ALL';
      state.certFilterWeek = 'ALL';
      renderCertificationModule();
    });

    document.getElementById('cert-filter-status')?.addEventListener('change', (e) => {
      state.certFilterStatus = e.target.value || 'ALL';
      renderCertificationModule();
    });

    document.getElementById('cert-filter-week')?.addEventListener('change', (e) => {
      state.certFilterWeek = e.target.value || 'ALL';
      renderCertificationModule();
    });

    document.getElementById('cert-filter-search')?.addEventListener('input', (e) => {
      state.certFilterSearch = e.target.value || '';
      renderCertSavedTable();
    });

    document.getElementById('btn-cert-filter-reset')?.addEventListener('click', () => {
      state.certFilterYear = String(new Date().getFullYear());
      state.certFilterLine = 'ALL';
      state.certFilterStatus = 'ALL';
      state.certFilterWeek = 'ALL';
      state.certFilterSearch = '';
      saveLocalCertData();
      renderCertificationModule();
    });

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
          const groupKey = getCertLotGroupKey(row.formatNo, row.code);
          const groupDesc = isValidCertFormatNo(row.formatNo)
            ? `형식번호 '${row.formatNo}'`
            : `품목코드 '${row.code}'`;
          if (groupKey && row.lotNo) {
            const isDup = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id, row.code);
            if (isDup) {
              alert(`[중복 경고] ${groupDesc}에 로트번호 '${row.lotNo}'가 이미 등록되어 있습니다.\n로트번호를 수정한 후 다시 등록해주세요.`);
              return;
            }
          }
          if (groupKey && parseSafeInt(row.from) > 0) {
            const isDupSer = checkSerialRangeOverlap(row.formatNo, row.from, row.to, row.id, row.code, row);
            if (isDupSer) {
              alert(`[중복 경고] ${groupDesc}의 제조번호(${row.from}~${row.to || row.from})가 기존 등록 구간과 겹치거나 사이값입니다.\n제조번호를 수정한 후 다시 등록해주세요.`);
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

    // 3-C. [검정신청] 버튼 (품질·생산 모두 [검정신청] 상태로 변경, 구분이 '품질'인 것만 품질검사 메뉴로 이관)
    const btnApplyInspection = document.getElementById('btn-cert-apply-inspection');
    if (btnApplyInspection) {
      btnApplyInspection.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('검정신청할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const checkedIds = checkedBoxes.map(cb => cb.dataset.id);
        const selectedRows = state.certSavedRows.filter(r => checkedIds.includes(r.id) && r.status !== '일정완료');

        const qualityTargetRows = selectedRows.filter(r => (r.type || '').trim() === '품질');
        const productionTargetRows = selectedRows.filter(r => (r.type || '').trim() !== '품질');

        qualityTargetRows.forEach(row => {
          const nextReqCount = (row.status === '부적합' || (row.failCount || 0) > 0)
            ? ((row.failCount || 0) + 1)
            : (row.requestCount || 1);
          row.status = '검정신청';
          row.requestCount = nextReqCount;
          const existingIdx = (state.qualityRows || []).findIndex(q => (q.certRowId === row.id || q.id === row.id));
          const qItem = {
            ...row,
            certRowId: row.id,
            status: '검정신청',
            requestCount: nextReqCount,
            requestedAt: Date.now()
          };
          if (existingIdx >= 0) {
            state.qualityRows[existingIdx] = qItem;
          } else {
            if (!state.qualityRows) state.qualityRows = [];
            state.qualityRows.push(qItem);
          }
        });

        productionTargetRows.forEach(row => {
          row.status = '검정신청';
        });

        await saveCertDataToDb(true);
        if (qualityTargetRows.length > 0) {
          await saveQualityRowsToDb();
        }

        const total = selectedRows.length;
        const qualCount = qualityTargetRows.length;
        const prodCount = productionTargetRows.length;
        const msg = prodCount > 0
          ? `총 ${total}건 검정신청 완료 (품질검사 이관 ${qualCount}건, 생산 ${prodCount}건)`
          : `총 ${qualCount}건 검정신청 및 품질검사 이관 완료`;
        showToast(msg);

        renderCertSavedTable();
        renderQualityTable();
        if (checkAllCertSaved) checkAllCertSaved.checked = false;
      });
    }

    // 3-D1. [생산완료] 버튼 (구분이 '생산'인 것만 '일정완료' 처리, '품질' 등 타 구분은 제외)
    const btnCompleteProduction = document.getElementById('btn-cert-complete-production');
    if (btnCompleteProduction) {
      btnCompleteProduction.addEventListener('click', async () => {
        if (isGuestReadOnly(true)) return;
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('생산완료 처리할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const checkedIds = checkedBoxes.map(cb => cb.dataset.id);
        const selectedRows = state.certSavedRows.filter(r => checkedIds.includes(r.id));
        const prodTargetRows = selectedRows.filter(r => (r.type || '').trim() === '생산' && r.status !== '일정완료');
        const excludedCount = selectedRows.length - prodTargetRows.length;

        if (prodTargetRows.length === 0) {
          alert('구분이 [생산]인 미완료 항목만 생산완료 처리할 수 있습니다.');
          return;
        }

        let confirmMsg = `선택한 [생산] 항목 ${prodTargetRows.length}건을 완료(일정완료) 처리하시겠습니까?\n완료 처리된 일정은 잠금 상태가 됩니다.`;
        if (excludedCount > 0) {
          confirmMsg += `\n(※ 구분이 [생산]이 아닌 ${excludedCount}건은 제외됩니다.)`;
        }
        if (!confirm(confirmMsg)) return;

        prodTargetRows.forEach(row => {
          row.status = '일정완료';
          row.completedAt = Date.now();
        });

        await saveCertDataToDb(true);
        renderCertSavedTable();
        showToast(`생산 ${prodTargetRows.length}건이 완료(일정완료) 처리되었습니다.${excludedCount > 0 ? ` (제외 ${excludedCount}건)` : ''}`);
        if (checkAllCertSaved) checkAllCertSaved.checked = false;
      });
    }

    const isCertSavedLocked = (row) => {
      const s = (row?.status || '등록완료').trim();
      return s === '품검요청' || s === '일정완료' || s === '검정신청';
    };

    // 3-D2. [수정] 버튼 (등록완료 상태 1건 선택 시 모달로 수정; 품검요청·검정신청·일정완료 불가)
    const btnEditSaved = document.getElementById('btn-cert-edit-saved');
    const modalCertEdit = document.getElementById('modal-cert-saved-edit');
    const formCertEdit = document.getElementById('form-cert-saved-edit');
    const closeCertEditModal = () => {
      if (modalCertEdit) modalCertEdit.style.display = 'none';
    };
    document.getElementById('btn-close-cert-edit-modal')?.addEventListener('click', closeCertEditModal);
    document.getElementById('btn-cancel-cert-edit-modal')?.addEventListener('click', closeCertEditModal);
    modalCertEdit?.addEventListener('click', (e) => {
      if (e.target === modalCertEdit) closeCertEditModal();
    });

    if (btnEditSaved) {
      btnEditSaved.addEventListener('click', () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('수정할 내역을 1건 선택해 주세요.');
          return;
        }
        if (checkedBoxes.length > 1) {
          alert('수정은 1건씩 선택하여 진행해 주세요.');
          return;
        }
        const targetId = checkedBoxes[0].dataset.id;
        const row = (state.certSavedRows || []).find(r => r.id === targetId);
        if (!row) return;
        if (isCertSavedLocked(row)) {
          alert(`[${row.status}] 상태인 항목은 수정할 수 없습니다.\n('등록완료' 상태인 건만 수정 가능합니다.)`);
          return;
        }

        document.getElementById('cert-edit-id').value = row.id;
        const subEl = document.getElementById('cert-edit-item-subtitle');
        if (subEl) subEl.textContent = `${row.code || ''} · ${getDisplayNameByCode(row.code, row.name) || ''} (${row.status || '등록완료'})`;
        document.getElementById('cert-edit-inspect-date').value = row.inspectDate || '';
        document.getElementById('cert-edit-week-date').value = row.weekDate || '';
        document.getElementById('cert-edit-qty').value = row.qty || 1;
        document.getElementById('cert-edit-lot').value = row.lotNo || '';
        document.getElementById('cert-edit-from').value = row.from || '';
        document.getElementById('cert-edit-to').value = row.to || '';
        document.getElementById('cert-edit-passno').value = row.passNo || '';
        document.getElementById('cert-edit-color').value = row.color || '';
        document.getElementById('cert-edit-dept').value = row.dept || '';
        document.getElementById('cert-edit-site').value = row.site || '';
        if (modalCertEdit) modalCertEdit.style.display = 'flex';
      });
    }

    if (formCertEdit) {
      formCertEdit.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetId = document.getElementById('cert-edit-id').value;
        const row = (state.certSavedRows || []).find(r => r.id === targetId);
        if (!row) return;
        if (isCertSavedLocked(row)) {
          alert(`[${row.status}] 상태인 항목은 수정할 수 없습니다.`);
          closeCertEditModal();
          return;
        }

        row.inspectDate = document.getElementById('cert-edit-inspect-date').value.trim();
        row.weekDate = document.getElementById('cert-edit-week-date').value.trim();
        row.qty = Math.max(1, parseSafeInt(document.getElementById('cert-edit-qty').value) || 1);
        row.lotNo = document.getElementById('cert-edit-lot').value.trim();
        row.from = document.getElementById('cert-edit-from').value.trim();
        row.to = document.getElementById('cert-edit-to').value.trim();
        row.passNo = document.getElementById('cert-edit-passno').value.trim();
        row.color = document.getElementById('cert-edit-color').value.trim();
        row.dept = document.getElementById('cert-edit-dept').value.trim();
        row.site = document.getElementById('cert-edit-site').value.trim();

        saveLocalCertData();
        await saveCertDataToDb(true);
        renderCertSavedTable();
        if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
        closeCertEditModal();
        showToast('검정 등록 내역이 수정되었습니다.');
      });
    }

    // 3-D3. [등록취소] 버튼 (등록완료 상태만 취소 가능; 품검요청·검정신청·일정완료 불가)
    const btnCancelSaved = document.getElementById('btn-cert-cancel-saved');
    if (btnCancelSaved) {
      btnCancelSaved.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#cert-saved-tbody .check-cert-saved-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('등록취소할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const checkedIds = checkedBoxes.map(cb => cb.dataset.id);
        const targetRows = state.certSavedRows.filter(r => checkedIds.includes(r.id));
        const lockedRows = targetRows.filter(r => isCertSavedLocked(r));
        if (lockedRows.length > 0) {
          alert(`선택한 항목 중 ${lockedRows.length}건은 이미 [품검요청/검정신청/일정완료] 상태이므로 등록취소할 수 없습니다.\n('등록완료' 상태인 건만 등록취소 가능합니다.)`);
          return;
        }

        if (!confirm(`선택한 ${targetRows.length}건의 검정 등록을 취소하시겠습니까?\n(검정현황에서 삭제되며, 수신기계획에서 등록한 건은 미신청 상태로 복원됩니다.)`)) {
          return;
        }

        const cancelIds = targetRows.map(r => r.id);
        state.certSavedRows = state.certSavedRows.filter(r => !cancelIds.includes(r.id));
        state.qualityRows = (state.qualityRows || []).filter(q => !cancelIds.includes(q.certRowId || q.id));

        saveLocalCertData();
        await saveCertDataToDb(true);
        await saveQualityRowsToDb();
        renderCertSavedTable();
        renderQualityTable();
        if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
        showToast(`${targetRows.length}건의 검정 등록이 취소되었습니다.`);
        if (checkAllCertSaved) checkAllCertSaved.checked = false;
      });
    }

    // 3-E. 저장 내역 [선택 삭제] 버튼 (품검요청 및 일정완료 삭제 불가)
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
        const isLockedStatus = (st) => st === '일정완료' || st === '검정신청' || st === '품검요청';
        const validRows = targetRows.filter(r => !isLockedStatus(r.status));
        const lockedRows = targetRows.filter(r => isLockedStatus(r.status));

        if (validRows.length === 0) {
          alert('선택한 항목이 모두 [검정신청/일정완료] 상태이므로 삭제할 수 없습니다.');
          return;
        }

        let confirmMsg = `선택한 ${validRows.length}건을 삭제하시겠습니까?`;
        if (lockedRows.length > 0) {
          confirmMsg += `\n(※ 검정신청·일정완료된 ${lockedRows.length}건은 삭제 대상에서 제외됩니다.)`;
        }
        if (!confirm(confirmMsg)) return;

        const validIds = validRows.map(r => r.id);
        state.certSavedRows = state.certSavedRows.filter(r => !validIds.includes(r.id));
        state.qualityRows = (state.qualityRows || []).filter(q => !validIds.includes(q.certRowId || q.id));

        saveLocalCertData();
        await saveCertDataToDb(true);
        await saveQualityRowsToDb();
        renderCertSavedTable();
        renderQualityTable();
        if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
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

    document.querySelectorAll('#quality-view-mode-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.qualityViewMode = btn.dataset.qmode === 'passed' ? 'passed' : 'pending';
        if (checkAllQuality) checkAllQuality.checked = false;
        renderQualityTable();
      });
    });

    const btnQualityPass = document.getElementById('btn-quality-pass');
    if (btnQualityPass) {
      btnQualityPass.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#quality-tbody .check-quality-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('합격 처리할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const certIds = checkedBoxes.map(cb => cb.dataset.certId || cb.dataset.id);
        const qualityIds = checkedBoxes.map(cb => cb.dataset.id);

        if (!confirm(`선택한 ${checkedBoxes.length}건에 대해 [합격] 승인하시겠습니까?\n검정현황의 일정이 '일정완료'로 변경되며 잠금 처리됩니다.`)) {
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

        showToast(`선택한 ${checkedBoxes.length}건이 [합격] 처리되어 검정현황의 일정이 완료되었습니다`);
        if (checkAllQuality) checkAllQuality.checked = false;
      });
    }

    const btnQualityCancelPass = document.getElementById('btn-quality-cancel-pass');
    if (btnQualityCancelPass) {
      btnQualityCancelPass.addEventListener('click', async () => {
        if (isGuestReadOnly(true)) return;
        const checkedBoxes = Array.from(document.querySelectorAll('#quality-tbody .check-quality-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('합격취소할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const certIds = checkedBoxes.map(cb => cb.dataset.certId || cb.dataset.id);
        if (!confirm(`선택한 ${checkedBoxes.length}건의 합격을 취소하시겠습니까?\n검정현황 잠금이 해제되고 품질검사 [대기중] 목록으로 복원됩니다.`)) {
          return;
        }

        let restoredCount = 0;
        if (!state.qualityRows) state.qualityRows = [];
        state.certSavedRows.forEach(row => {
          if (!certIds.includes(row.id) || row.status !== '일정완료') return;
          row.status = '품검요청';
          delete row.completedAt;
          const existsInQuality = state.qualityRows.some(q => (q.certRowId === row.id || q.id === row.id));
          if (!existsInQuality) {
            state.qualityRows.push({
              ...row,
              certRowId: row.id,
              status: '품검요청',
              requestCount: row.requestCount || 1,
              requestedAt: Date.now()
            });
          }
          restoredCount++;
        });

        await saveCertDataToDb(true);
        await saveQualityRowsToDb();
        if (typeof appendAdminAuditLog === 'function' && restoredCount > 0) {
          await appendAdminAuditLog('합격취소', '품질검사', `${restoredCount}건 합격취소 (품검요청 복원)`);
        }

        renderQualityTable();
        renderCertSavedTable();
        showToast(`선택한 ${restoredCount}건의 합격이 취소되어 품검 대기 목록으로 복원되었습니다.`);
        if (checkAllQuality) checkAllQuality.checked = false;
      });
    }

    const btnQualityFail = document.getElementById('btn-quality-fail');
    if (btnQualityFail) {
      btnQualityFail.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('#quality-tbody .check-quality-row:checked'));
        if (checkedBoxes.length === 0) {
          alert('부적합 처리할 일정을 1건 이상 선택해 주세요.');
          return;
        }

        const certIds = checkedBoxes.map(cb => cb.dataset.certId || cb.dataset.id);
        const qualityIds = checkedBoxes.map(cb => cb.dataset.id);

        if (!confirm(`선택한 ${checkedBoxes.length}건을 [부적합] 처리하시겠습니까?\n검정현황에 '부적합'으로 표시되며, 다시 품검요청할 수 있습니다.`)) {
          return;
        }

        // 1) 검정현황 상태 -> '부적합' 및 부적합 횟수 증가
        state.certSavedRows.forEach(row => {
          if (certIds.includes(row.id)) {
            row.status = '부적합';
            row.failCount = (row.failCount || 0) + 1;
            row.failedAt = Date.now();
          }
        });

        // 2) 품질검사 그리드에서 제거 (재요청 시 (2), (3)... 표시로 다시 추가됨)
        state.qualityRows = (state.qualityRows || []).filter(q => !qualityIds.includes(q.id) && !certIds.includes(q.certRowId));

        await saveCertDataToDb(true);
        await saveQualityRowsToDb();

        renderQualityTable();
        renderCertSavedTable();

        showToast(`선택한 ${checkedBoxes.length}건이 [부적합] 처리되었습니다. 검정현황에서 다시 품검요청할 수 있습니다.`);
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
        state.qualityFilterWeek = 'ALL';
        if (qualFilterDateInput) qualFilterDateInput.value = '';
        saveLocalQualityRows();
        renderQualityTable();
        updateQualityFilterPill();
      });
    }

    const qualFilterWeekSel = document.getElementById('quality-filter-week');
    if (qualFilterWeekSel) {
      qualFilterWeekSel.addEventListener('change', (e) => {
        state.qualityFilterWeek = e.target.value || 'ALL';
        renderQualityTable();
        updateQualityFilterPill();
      });
    }

    function updateQualityFilterPill() {
      const pill = document.getElementById('quality-filter-status-pill');
      if (!pill) return;
      const parts = [];
      if (state.qualityFilterDate) parts.push(`일자: ${state.qualityFilterDate}`);
      if (state.qualityFilterWeek && state.qualityFilterWeek !== 'ALL') parts.push(`주차: ${state.qualityFilterWeek}`);
      if (parts.length > 0) {
        pill.innerHTML = `<span>필터: ${parts.join(' · ')}</span>`;
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
          const isDup = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id, row.code);
          target.classList.toggle('is-duplicate-lot', isDup);
          if (isDup) {
            const groupLabel = isValidCertFormatNo(row.formatNo) ? '형식번호' : '품목코드';
            target.title = `⚠ 동일 ${groupLabel} 내 이미 존재하는 로트번호입니다!`;
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

    // 7. 로트번호 포커스 아웃 시 "26-001", 날짜 포커스 아웃 시 "YYYY-MM-DD" 자동 포맷팅
    document.addEventListener('blur', (e) => {
      const target = e.target;
      if (target && target.classList.contains('cert-input-lot')) {
        const id = target.dataset.id;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row && row.lotNo) {
          const formatted = formatSmartLotNumber(row.lotNo, row.writeDate);
          row.lotNo = formatted;
          target.value = formatted;

          const isDup = checkLotNumberDuplicate(row.formatNo, row.lotNo, row.id, row.code);
          target.classList.toggle('is-duplicate-lot', isDup);
          saveLocalCertData();
        }
      }
      if (target && target.classList.contains('cert-input-date')) {
        const id = target.dataset.id;
        const field = target.dataset.field;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row && field) {
          const formatted = formatSmartDateInput(target.value);
          row[field] = formatted;
          target.value = formatted;
          saveLocalCertData();
        }
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      const target = e.target;
      if (e.key === 'Enter' && target && target.classList.contains('cert-input-date')) {
        const formatted = formatSmartDateInput(target.value);
        target.value = formatted;
        const id = target.dataset.id;
        const field = target.dataset.field;
        const row = (state.certDraftRows || []).find(r => r.id === id);
        if (row && field) {
          row[field] = formatted;
          saveLocalCertData();
        }
      }
    });

    // 7-B. 로트번호 · 제조번호 FROM 추천값 더블클릭 시 자동 입력
    document.addEventListener('dblclick', (e) => {
      const target = e.target;
      if (!target) return;
      const isLot = target.classList.contains('cert-input-lot');
      const isFrom = target.classList.contains('cert-input-field') && target.dataset.field === 'from';
      if (!isLot && !isFrom) return;
      if (!target.value && target.placeholder) {
        target.value = target.placeholder;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

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
        if (targetRow && (targetRow.status === '일정완료' || targetRow.status === '검정신청' || targetRow.status === '품검요청')) {
          alert(`[${targetRow.status === '품검요청' ? '검정신청' : targetRow.status}] 상태인 일정은 수정·취소·삭제할 수 없습니다.`);
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
          if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
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
              <button type="button" class="btn btn-xs btn-save-success btn-save-inline-cert" data-id="${item.id}"><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>저장</button>
              <button type="button" class="btn btn-xs btn-outline btn-cancel-inline-cert">취소</button>
            </div>
          </td>
          <td style="text-align:center; color:#2563eb; font-weight:700;">수정</td>
          <td><select class="cert-inline-edit-input" data-f="useYn"><option value="사용" ${item.useYn === '사용' ? 'selected' : ''}>사용</option><option value="미사용" ${item.useYn === '미사용' ? 'selected' : ''}>미사용</option></select></td>
          <td><select class="cert-inline-edit-input" data-f="applyType"><option value="자동" ${getDefaultItemApplyType(item) === '자동' ? 'selected' : ''}>자동</option><option value="수동" ${getDefaultItemApplyType(item) === '수동' ? 'selected' : ''}>수동</option></select></td>
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

        const existingItem = editId ? state.certMasterItems.find(i => i.id === editId) : null;
        const itemData = {
          id: editId || ('citem_' + Date.now()),
          useYn: getVal('cert-add-use') || '사용',
          applyType: getVal('cert-add-apply-type') || '자동',
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
          baseStock: existingItem?.baseStock ?? '',
          minStock: existingItem?.minStock ?? '',
          maxStock: existingItem?.maxStock ?? '',
          stAssembly: existingItem?.stAssembly ?? '',
          stInspect: existingItem?.stInspect ?? '',
          stPack: existingItem?.stPack ?? '',
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
        syncMasterChangesToAllViews();
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

      // 검정 등록 그리드 내부 스프레드시트 이동 (Tab, Enter / Shift+Enter)
      if (target && target.closest('#cert-draft-table') && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
        const tr = target.closest('tr');
        if (!tr) return;

        // Enter 키: 아래 행 동일 컬럼 이동 (Shift+Enter: 위 행)
        if (e.key === 'Enter') {
          e.preventDefault();
          const currentCell = target.closest('td');
          const cellIndex = Array.from(tr.children).indexOf(currentCell);
          let nextRow = e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling;

          // 마지막 행에서 엔터 입력 시 자동으로 새 행 생성
          if (!e.shiftKey && !nextRow) {
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

    // 14-B. 검정 등록 그리드 셀 포커스 시 전체 선택 (키보드 입력 시 기존 값 덮어쓰기)
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!t || !t.closest('#cert-draft-table')) return;
      if (t.tagName === 'INPUT' && !t.readOnly && t.type !== 'checkbox' && t.type !== 'date') {
        t.select();
        t._certJustFocused = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      const t = e.target;
      if (t && t._certJustFocused) {
        e.preventDefault();
        t._certJustFocused = false;
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
        syncMasterChangesToAllViews();
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
      let idxApplyType = -1;
      let idxApplyNo = -1;
      let idxApplyDate = -1;
      let idxReceiptDate = -1;
      let idxReceiptNo = -1;
      let idxItem = -1;
      let idxInspectDate = -1;
      let idxQty = -1;
      let idxSupply = -1;
      let idxVat = -1;
      let idxTotalFee = -1;
      let idxKfiStatus = -1;

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
          idxApplyType = cand.findIndex(h => h.includes('신청구분'));
          idxApplyNo = cand.findIndex(h => h.includes('신청번호'));
          idxApplyDate = cand.findIndex(h => h.includes('신청일자'));
          idxReceiptDate = cand.findIndex(h => h.includes('접수일자'));
          idxReceiptNo = cand.findIndex(h => h.includes('접수번호'));
          idxItem = cand.findIndex(h => h === '품목' || h.includes('품목'));
          idxInspectDate = cand.findIndex(h => h.includes('검사예정일'));
          idxQty = cand.findIndex(h => h === '수량' || h.includes('수량'));
          idxSupply = cand.findIndex(h => h.includes('공급가액'));
          idxVat = cand.findIndex(h => h.includes('부가세'));
          idxTotalFee = cand.findIndex(h => h.includes('수수료합계'));
          idxKfiStatus = cand.findIndex(h => h === '상태');
          break;
        }
      }

      // 헤더를 찾지 못한 경우 기본 열 보정
      if (headerRowIdx < 0) headerRowIdx = 0;
      if (idxPass < 0 && (rows[headerRowIdx] || []).length >= 16) idxPass = 15;
      if (idxFormat < 0) idxFormat = 8;
      if (idxMfg < 0) idxMfg = 17;
      if (idxApplyType < 0) idxApplyType = 1;
      if (idxApplyNo < 0) idxApplyNo = 2;
      if (idxApplyDate < 0) idxApplyDate = 3;
      if (idxReceiptDate < 0) idxReceiptDate = 5;
      if (idxReceiptNo < 0) idxReceiptNo = 6;
      if (idxItem < 0) idxItem = 7;
      if (idxInspectDate < 0) idxInspectDate = 9;
      if (idxQty < 0) idxQty = 16;
      if (idxSupply < 0) idxSupply = 19;
      if (idxVat < 0) idxVat = 20;
      if (idxTotalFee < 0) idxTotalFee = 21;
      if (idxKfiStatus < 0) idxKfiStatus = 22;

      const parseNum = (v) => {
        const s = String(v ?? '').replace(/,/g, '').trim();
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };

      const recordMap = new Map();
      (state.kfiRecords || []).forEach(rec => {
        if (rec && rec._uid) recordMap.set(rec._uid, rec);
      });

      let matchCount = 0;
      let recCount = 0;
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length <= Math.max(idxFormat, idxMfg)) continue;

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

        if (!formatNo || !mfgRange) continue;
        const kfiKey = `${formatNo}_${mfgRange}`;

        if (passNo) {
          state.kfiDataMap[kfiKey] = passNo;
          matchCount++;
        }

        const applyNo = String(r[idxApplyNo] ?? '').trim();
        const applyDate = String(r[idxApplyDate] ?? '').trim();
        const totalFee = parseNum(r[idxTotalFee]);
        const uid = applyNo ? `${applyNo}_${totalFee < 0 ? 'W' : 'N'}` : `${kfiKey}_${applyDate}_${totalFee}`;
        recordMap.set(uid, {
          _uid: uid,
          kfiKey,
          formatNo,
          mfgRange,
          applyType: String(r[idxApplyType] ?? '').trim(),
          applyNo,
          applyDate,
          receiptDate: String(r[idxReceiptDate] ?? '').trim(),
          receiptNo: String(r[idxReceiptNo] ?? '').trim(),
          kfiItemName: String(r[idxItem] ?? '').trim(),
          inspectDate: String(r[idxInspectDate] ?? '').trim(),
          passNo,
          qty: parseNum(r[idxQty]),
          supplyAmt: parseNum(r[idxSupply]),
          vatAmt: parseNum(r[idxVat]),
          totalFee,
          kfiStatus: String(r[idxKfiStatus] ?? '').trim()
        });
        recCount++;
      }

      state.kfiRecords = Array.from(recordMap.values());

      saveLocalCertData();
      await saveCertDataToDb(true);
      updateKfiUploadSummary();
      renderCertDraftTable();
      if (state.currentTab === 'tab-cert-settlement') {
        renderCertSettlementModule();
      }
      showToast(`KFI 백데이터 ${recCount}건(합격번호 ${matchCount}건)이 연동되었습니다.`);
    } catch (err) {
      console.error('KFI 엑셀 업로드 오류:', err);
      alert('KFI 엑셀 파일 파싱에 실패했습니다. (.xlsx, .xls, .csv 지원)');
    }
    if (e.target) e.target.value = '';
  }

  // (18-B) 검정정산 모듈 (검정현황 등록 기준 + KFI 백데이터 참조)
  const CS_APPLY_TYPES = [
    '품질제품검사(형식)Ⅲ',
    '품질제품검사(형식)Ⅱ',
    '생산제품검사(형식)',
    '생산제품검사(성능)'
  ];

  function buildCertSettlementEntries() {
    const savedRows = state.certSavedRows || [];
    const kfiRecs = state.kfiRecords || [];

    // KFI 백데이터를 kfiKey("형식번호_FROM - TO")로 인덱싱
    const kfiByKey = new Map();
    kfiRecs.forEach(rec => {
      if (!rec || !rec.kfiKey) return;
      if (!kfiByKey.has(rec.kfiKey)) kfiByKey.set(rec.kfiKey, []);
      kfiByKey.get(rec.kfiKey).push(rec);
    });

    const entries = [];
    let matchedSavedCount = 0;

    savedRows.forEach(row => {
      const fmt = String(row.formatNo || '').trim();
      const fromStr = String(row.from || '').trim();
      const toStr = String(row.to || fromStr || '').trim();
      const mfgRange = (fromStr && toStr) ? `${fromStr} - ${toStr}` : '';
      const kfiKey = (fmt && mfgRange) ? `${fmt}_${mfgRange}` : '';
      const matchedList = kfiKey ? (kfiByKey.get(kfiKey) || []) : [];

      if (matchedList.length > 0) {
        matchedSavedCount++;
        matchedList.forEach(kfi => {
          const qty = kfi.qty || parseSafeInt(row.qty);
          const supplyAmt = Number(kfi.supplyAmt) || 0;
          const vatAmt = Number(kfi.vatAmt) || 0;
          const totalFee = Number(kfi.totalFee) || (supplyAmt + vatAmt);
          const unitPrice = qty !== 0 ? Math.round(supplyAmt / qty) : 0;
          entries.push({
            savedId: row.id,
            code: row.code || '',
            name: getDisplayNameByCode(row.code, row.name || ''),
            itemKind: kfi.kfiItemName || row.name || '',
            formatNo: fmt,
            mfgRange,
            applyType: kfi.applyType || (row.type === '생산' ? '생산제품검사(형식)' : '품질제품검사(형식)Ⅲ'),
            applyDate: kfi.applyDate || row.writeDate || '',
            receiptDate: kfi.receiptDate || row.writeDate || '',
            inspectDate: kfi.inspectDate || row.inspectDate || '',
            qty,
            unitPrice,
            supplyAmt,
            vatAmt,
            totalFee,
            isWithdrawal: totalFee < 0,
            isFail: String(row.status || '').trim() === '부적합',
            isMatched: true
          });
        });
      } else {
        const qty = parseSafeInt(row.qty);
        entries.push({
          savedId: row.id,
          code: row.code || '',
          name: getDisplayNameByCode(row.code, row.name || ''),
          itemKind: row.name || '',
          formatNo: fmt,
          mfgRange,
          applyType: row.type === '생산' ? '생산제품검사(형식)' : '품질제품검사(형식)Ⅲ',
          applyDate: row.writeDate || '',
          receiptDate: row.writeDate || '',
          inspectDate: row.inspectDate || '',
          qty,
          unitPrice: 0,
          supplyAmt: 0,
          vatAmt: 0,
          totalFee: 0,
          isWithdrawal: false,
          isFail: String(row.status || '').trim() === '부적합',
          isMatched: false
        });
      }
    });

    return { entries, matchedSavedCount, totalSavedCount: savedRows.length };
  }

  function renderCertSettlementModule() {
    const { entries, matchedSavedCount, totalSavedCount } = buildCertSettlementEntries();
    const matchEl = document.getElementById('cs-match-summary');
    if (matchEl) {
      matchEl.textContent = `KFI 연동: ${matchedSavedCount} / ${totalSavedCount}건`;
      matchEl.className = matchedSavedCount > 0 ? 'rp-summary-chip' : 'rp-summary-chip is-urgent';
    }

    // 연도 옵션 갱신
    const yearSel = document.getElementById('cs-filter-year');
    const yearSet = new Set([String(new Date().getFullYear())]);
    entries.forEach(e => {
      const y = (e.applyDate || e.receiptDate || e.inspectDate || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) yearSet.add(y);
    });
    const sortedYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
    if (yearSel) {
      if (!yearSet.has(state.csFilterYear)) state.csFilterYear = sortedYears[0];
      yearSel.innerHTML = sortedYears.map(y => `<option value="${y}">${y}년</option>`).join('');
      yearSel.value = state.csFilterYear;
      if (typeof syncCustomSelect === 'function') syncCustomSelect('cs-filter-year');
    }

    const selYear = state.csFilterYear || sortedYears[0];
    const yearEntries = entries.filter(e => {
      const d = e.applyDate || e.receiptDate || e.inspectDate || '';
      return !d || d.startsWith(selYear);
    });

    // 접수일자 옵션 갱신
    const receiptSel = document.getElementById('cs-filter-receipt-date');
    const receiptSet = new Set();
    yearEntries.forEach(e => { if (e.receiptDate) receiptSet.add(e.receiptDate); });
    const sortedReceipts = Array.from(receiptSet).sort((a, b) => b.localeCompare(a));
    if (receiptSel) {
      const prev = state.csFilterReceiptDate || 'ALL';
      receiptSel.innerHTML = '<option value="ALL">접수일자 전체</option>' +
        sortedReceipts.map(d => `<option value="${d}">${d}</option>`).join('');
      state.csFilterReceiptDate = (prev !== 'ALL' && receiptSet.has(prev)) ? prev : 'ALL';
      receiptSel.value = state.csFilterReceiptDate;
      if (typeof syncCustomSelect === 'function') syncCustomSelect('cs-filter-receipt-date');
    }

    const selectedApplyTypes = Array.isArray(state.csFilterApplyTypes) ? state.csFilterApplyTypes : [];
    const visibleApplyTypes = selectedApplyTypes.length > 0
      ? CS_APPLY_TYPES.filter(t => selectedApplyTypes.includes(t))
      : CS_APPLY_TYPES;

    const chkAllApply = document.getElementById('chk-cs-apply-all');
    if (chkAllApply) chkAllApply.checked = selectedApplyTypes.length === 0;
    document.querySelectorAll('.chk-cs-apply-type').forEach(chk => {
      chk.checked = selectedApplyTypes.includes(chk.value);
    });
    const applyBtnLbl = document.getElementById('cs-apply-type-btn-label');
    if (applyBtnLbl) {
      if (selectedApplyTypes.length === 0) applyBtnLbl.textContent = '신청구분 전체';
      else if (selectedApplyTypes.length === 1) applyBtnLbl.textContent = selectedApplyTypes[0];
      else applyBtnLbl.textContent = `신청구분 (${selectedApplyTypes.length}개)`;
    }

    // 뷰 전환 표시
    const activeView = (state.csView === 'monthly' ? 'ledger' : state.csView) || 'spec';
    document.querySelectorAll('#cs-view-tabs .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.csView === activeView);
    });
    document.querySelectorAll('.cs-view-panel').forEach(p => {
      if (p.id === `cs-view-${activeView}`) {
        p.style.display = p.id === 'cs-view-ledger' ? 'flex' : '';
      } else {
        p.style.display = 'none';
      }
    });

    const fReceipt = state.csFilterReceiptDate || 'ALL';
    const matchesApplyFilter = (t) => selectedApplyTypes.length === 0 || selectedApplyTypes.includes(t);

    // 1) 수수료 명세서 렌더링
    const specRows = yearEntries.filter(e => {
      if (!matchesApplyFilter(e.applyType)) return false;
      if (fReceipt !== 'ALL' && e.receiptDate !== fReceipt) return false;
      return true;
    });
    const specTypeLbl = document.getElementById('cs-spec-type-label');
    const specRecLbl = document.getElementById('cs-spec-receipt-label');
    if (specTypeLbl) specTypeLbl.textContent = `신청구분: ${selectedApplyTypes.length === 0 ? '전체' : visibleApplyTypes.join(', ')}`;
    if (specRecLbl) specRecLbl.textContent = `접수일자: ${fReceipt === 'ALL' ? '전체' : fReceipt}`;

    let specQty = 0, specSupply = 0, specVat = 0, specTotal = 0;
    const noteMap = new Map();
    specRows.forEach(r => {
      specQty += r.qty;
      specSupply += r.supplyAmt;
      specVat += r.vatAmt;
      specTotal += r.totalFee;
      const d = r.inspectDate || '미정';
      if (!noteMap.has(d)) noteMap.set(d, { firstKind: r.itemKind, count: 0 });
      noteMap.get(d).count++;
    });

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt('cs-spec-count', `${specRows.length}건`);
    setTxt('cs-spec-qty', formatNumberDisplay(specQty));
    setTxt('cs-spec-supply', formatNumberDisplay(specSupply));
    setTxt('cs-spec-vat', formatNumberDisplay(specVat));
    setTxt('cs-spec-total', formatNumberDisplay(specTotal));

    const specNoteLines = Array.from(noteMap.entries()).map(([d, info]) => {
      const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/);
      const dLbl = m ? `${Number(m[1])}월${Number(m[2])}일` : d;
      const etc = info.count > 1 ? ` 외 ${info.count - 1}건` : '';
      return `${info.firstKind}${etc} ${dLbl} 검정`;
    });
    setTxt('cs-spec-note', `※ 적요: ${specNoteLines.length > 0 ? specNoteLines.join(' / ') : '-'}`);

    const specTbody = document.getElementById('cs-spec-tbody');
    if (specTbody) {
      if (specRows.length === 0) {
        specTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted);">표시할 검정 내역이 없습니다.</td></tr>';
      } else {
        specTbody.innerHTML = specRows.map((r, idx) => `
          <tr>
            <td style="text-align:center; color:var(--text-muted);">${idx + 1}</td>
            <td>${r.itemKind}</td>
            <td style="text-align:center;">${r.formatNo || '-'}</td>
            <td class="num-cell">${formatNumberDisplay(r.qty)}</td>
            <td class="num-cell">${formatNumberDisplay(r.unitPrice)}</td>
            <td class="num-cell font-bold">${formatNumberDisplay(r.supplyAmt)}</td>
            <td style="text-align:center;">${r.inspectDate || '-'}</td>
            <td style="text-align:center; font-size:11.5px; color:var(--text-sub);">${r.mfgRange || '-'}</td>
          </tr>
        `).join('');
      }
    }

    // 2) 명세서 집계표 렌더링
    const byApplyDate = new Map();
    yearEntries.filter(r => matchesApplyFilter(r.applyType)).forEach(r => {
      const d = r.applyDate || '미지정';
      if (!byApplyDate.has(d)) {
        const init = {};
        CS_APPLY_TYPES.forEach(t => { init[t] = { cnt: 0, fee: 0 }; });
        byApplyDate.set(d, init);
      }
      const bucket = byApplyDate.get(d);
      const tKey = CS_APPLY_TYPES.includes(r.applyType) ? r.applyType : CS_APPLY_TYPES[0];
      bucket[tKey].cnt += 1;
      bucket[tKey].fee += r.totalFee;
    });
    const sortedApplyDates = Array.from(byApplyDate.keys()).sort();
    const grandByType = {};
    CS_APPLY_TYPES.forEach(t => { grandByType[t] = { cnt: 0, fee: 0 }; });
    let sumTotalCnt = 0, sumTotalFee = 0;

    const sumThead = document.getElementById('cs-summary-thead');
    const sumTbody = document.getElementById('cs-summary-tbody');
    const sumTfoot = document.getElementById('cs-summary-tfoot');
    if (sumThead) {
      sumThead.innerHTML = `
        <tr class="header-row-primary">
          <th rowspan="2" style="width: 115px;">신청일자</th>
          ${visibleApplyTypes.map(t => `<th colspan="2">${t}</th>`).join('')}
        </tr>
        <tr class="header-row-secondary">
          ${visibleApplyTypes.map(() => '<th>건수</th><th>수수료 합계</th>').join('')}
        </tr>
      `;
    }
    if (sumTbody) {
      if (sortedApplyDates.length === 0) {
        sumTbody.innerHTML = `<tr><td colspan="${1 + visibleApplyTypes.length * 2}" style="text-align:center; padding:24px; color:var(--text-muted);">집계할 데이터가 없습니다.</td></tr>`;
      } else {
        sumTbody.innerHTML = sortedApplyDates.map(d => {
          const b = byApplyDate.get(d);
          const cols = visibleApplyTypes.map(t => {
            grandByType[t].cnt += b[t].cnt;
            grandByType[t].fee += b[t].fee;
            sumTotalCnt += b[t].cnt;
            sumTotalFee += b[t].fee;
            return `<td class="num-cell">${b[t].cnt}</td><td class="num-cell">${formatNumberDisplay(b[t].fee)}</td>`;
          }).join('');
          return `<tr><td style="text-align:center; font-weight:600;">${d}</td>${cols}</tr>`;
        }).join('');
      }
    }
    if (sumTfoot) {
      sumTfoot.innerHTML = `<tr class="summary-row">
        <td style="text-align:center; font-weight:800;">합계</td>
        ${visibleApplyTypes.map(t => `<td class="num-cell font-bold">${grandByType[t].cnt}</td><td class="num-cell font-bold text-primary">${formatNumberDisplay(grandByType[t].fee)}</td>`).join('')}
      </tr>`;
    }
    setTxt('cs-sum-count', `${sumTotalCnt}건`);
    setTxt('cs-sum-fee', formatNumberDisplay(sumTotalFee));

    // 3) 사용 정산서 (건별) 렌더링
    const ledgerRows = yearEntries.filter(e => matchesApplyFilter(e.applyType));
    let ledSupply = 0, ledVat = 0, ledTotal = 0;
    const ledTbody = document.getElementById('cs-ledger-tbody');
    if (ledTbody) {
      if (ledgerRows.length === 0) {
        ledTbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">표시할 정산 내역이 없습니다.</td></tr>';
      } else {
        ledTbody.innerHTML = ledgerRows.map((r, idx) => {
          ledSupply += r.supplyAmt;
          ledVat += r.vatAmt;
          ledTotal += r.totalFee;
          return `
            <tr class="${r.isWithdrawal ? 'text-danger' : ''}">
              <td style="text-align:center; color:var(--text-muted);">${idx + 1}</td>
              <td>${r.code || '-'}</td>
              <td style="text-align:center;">${r.applyDate || '-'}</td>
              <td>${r.name || r.itemKind}</td>
              <td class="num-cell">${formatNumberDisplay(r.qty)}</td>
              <td class="num-cell">${formatNumberDisplay(r.unitPrice)}</td>
              <td class="num-cell">${formatNumberDisplay(r.supplyAmt)}</td>
              <td class="num-cell">${formatNumberDisplay(r.vatAmt)}</td>
              <td class="num-cell font-bold">${formatNumberDisplay(r.totalFee)}</td>
            </tr>
          `;
        }).join('');
      }
    }
    setTxt('cs-led-count', `${ledgerRows.length}건`);
    setTxt('cs-led-supply', formatNumberDisplay(ledSupply));
    setTxt('cs-led-vat', formatNumberDisplay(ledVat));
    setTxt('cs-led-total', formatNumberDisplay(ledTotal));

    // 4) 월별 정산 요약 렌더링
    const mYearTh = document.getElementById('cs-monthly-year-th');
    if (mYearTh) mYearTh.textContent = selYear;

    const monthlyMetrics = [
      { no: 1, label: '건수', arr: Array(12).fill(0) },
      { no: 2, label: '생산(합격)수량', arr: Array(12).fill(0) },
      { no: 3, label: '불합격 건수', arr: Array(12).fill(0) },
      { no: 4, label: '불합격 금액', arr: Array(12).fill(0) },
      { no: 5, label: '철회건수', arr: Array(12).fill(0) },
      { no: 6, label: '철회 환급금액', arr: Array(12).fill(0) },
      { no: 7, label: '검정비', arr: Array(12).fill(0) },
      { no: 8, label: '품질제품검사', arr: Array(12).fill(0) },
      { no: 9, label: '생산제품검사', arr: Array(12).fill(0) }
    ];

    yearEntries.filter(r => matchesApplyFilter(r.applyType)).forEach(r => {
      const d = r.applyDate || r.receiptDate || r.inspectDate || '';
      const mMatch = d.match(/^\d{4}-(\d{2})-/);
      if (!mMatch) return;
      const mIdx = Number(mMatch[1]) - 1;
      if (mIdx < 0 || mIdx > 11) return;

      if (r.isWithdrawal) {
        monthlyMetrics[4].arr[mIdx] += 1;
        monthlyMetrics[5].arr[mIdx] += r.totalFee;
      } else {
        monthlyMetrics[0].arr[mIdx] += 1;
        if (!r.isFail) monthlyMetrics[1].arr[mIdx] += r.qty;
      }
      if (r.isFail) {
        monthlyMetrics[2].arr[mIdx] += 1;
        monthlyMetrics[3].arr[mIdx] += r.totalFee;
      }
      monthlyMetrics[6].arr[mIdx] += r.totalFee;
      if (String(r.applyType).startsWith('생산')) {
        monthlyMetrics[8].arr[mIdx] += r.totalFee;
      } else {
        monthlyMetrics[7].arr[mIdx] += r.totalFee;
      }
    });

    const monthlyTbody = document.getElementById('cs-monthly-tbody');
    if (monthlyTbody) {
      monthlyTbody.innerHTML = monthlyMetrics.map(m => {
        const sum = m.arr.reduce((a, b) => a + b, 0);
        return `<tr>
          <td style="text-align:center; color:var(--text-muted);">${m.no}</td>
          <td style="font-weight:600;">${m.label}</td>
          <td class="num-cell font-bold text-primary">${formatNumberDisplay(sum)}</td>
          ${m.arr.map(v => `<td class="num-cell">${formatNumberDisplay(v)}</td>`).join('')}
        </tr>`;
      }).join('');
    }
  }

  function exportCertSettlementXlsx(mode = 'all') {
    if (!window.XLSXEngine || typeof window.XLSXEngine.exportMultiSheetWorkbook !== 'function') {
      alert('엑셀 내보내기 엔진(XLSXEngine)이 로드되지 않았습니다.');
      return;
    }
    const { entries } = buildCertSettlementEntries();
    const selYear = state.csFilterYear || String(new Date().getFullYear());
    const selectedApplyTypes = Array.isArray(state.csFilterApplyTypes) ? state.csFilterApplyTypes : [];
    const visibleApplyTypes = selectedApplyTypes.length > 0
      ? CS_APPLY_TYPES.filter(t => selectedApplyTypes.includes(t))
      : CS_APPLY_TYPES;
    const matchesApplyFilter = (t) => selectedApplyTypes.length === 0 || selectedApplyTypes.includes(t);
    const fReceipt = state.csFilterReceiptDate || 'ALL';

    const yearEntries = entries.filter(e => {
      const d = e.applyDate || e.receiptDate || e.inspectDate || '';
      return !d || d.startsWith(selYear);
    });

    // 시트 1: 수수료 명세서
    const specRows = yearEntries.filter(e => {
      if (!matchesApplyFilter(e.applyType)) return false;
      if (fReceipt !== 'ALL' && e.receiptDate !== fReceipt) return false;
      return true;
    });
    let specQty = 0, specSupply = 0, specVat = 0, specTotal = 0;
    const noteMap = new Map();
    specRows.forEach(r => {
      specQty += r.qty;
      specSupply += r.supplyAmt;
      specVat += r.vatAmt;
      specTotal += r.totalFee;
      const d = r.inspectDate || '미정';
      if (!noteMap.has(d)) noteMap.set(d, { firstKind: r.itemKind, count: 0 });
      noteMap.get(d).count++;
    });
    const specNote = Array.from(noteMap.entries()).map(([d, info]) => {
      const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/);
      const dLbl = m ? `${Number(m[1])}월${Number(m[2])}일` : d;
      const etc = info.count > 1 ? ` 외 ${info.count - 1}건` : '';
      return `${info.firstKind}${etc} ${dLbl} 검정`;
    }).join('\n');

    const rowsSpec = [
      {
        height: 28,
        cells: [
          { v: '수 수 료 명 세 서', style: 'Title', mergeAcross: 3 },
          { v: selectedApplyTypes.length === 0 ? '전체' : visibleApplyTypes.join(', '), style: 'SubVal', mergeAcross: 1 }
        ]
      },
      {
        height: 20,
        cells: [
          { v: '접수일자 :', style: 'SubLabel', index: 5 },
          { v: fReceipt === 'ALL' ? '전체' : fReceipt, style: 'SubVal' }
        ]
      },
      {
        height: 24,
        cells: ['종 별', '형식번호', '신청수량', '단 가', '금 액', '비 고'].map(h => ({ v: h, style: 'Th' }))
      },
      ...specRows.map(r => ({
        height: 20,
        cells: [
          { v: r.itemKind, style: 'CellText' },
          { v: r.formatNo || '', style: 'CellCenter' },
          { v: r.qty, style: 'CellNum' },
          { v: r.unitPrice, style: 'CellNum' },
          { v: r.supplyAmt, style: 'CellNum' },
          { v: r.inspectDate || '', style: 'CellCenter' }
        ]
      })),
      { height: 12, cells: [] },
      {
        height: 22,
        cells: [
          { v: '합계', style: 'SumText', mergeAcross: 1 },
          { v: specQty, style: 'SumNum' },
          { v: '계', style: 'SumText' },
          { v: specSupply, style: 'SumNum', mergeAcross: 1 }
        ]
      },
      {
        height: 22,
        cells: [
          { v: '건수', style: 'SumText', mergeAcross: 1 },
          { v: specRows.length, style: 'SumNum' },
          { v: '부가 가치세', style: 'SumText' },
          { v: specVat, style: 'SumNum', mergeAcross: 1 }
        ]
      },
      {
        height: 22,
        cells: [
          { v: '※적요', style: 'SumText', mergeAcross: 2 },
          { v: '합 계', style: 'SumText' },
          { v: specTotal, style: 'SumNum', mergeAcross: 1 }
        ]
      },
      {
        height: Math.max(62, (specNote.split('\n').length || 1) * 18),
        cells: [
          { v: specNote || '-', style: 'NoteBox', mergeAcross: 5 }
        ]
      }
    ];

    // 시트 2: 명세서 집계표
    const byApplyDate = new Map();
    yearEntries.filter(r => matchesApplyFilter(r.applyType)).forEach(r => {
      const d = r.applyDate || '미지정';
      if (!byApplyDate.has(d)) {
        const init = {};
        CS_APPLY_TYPES.forEach(t => { init[t] = { cnt: 0, fee: 0 }; });
        byApplyDate.set(d, init);
      }
      const tKey = CS_APPLY_TYPES.includes(r.applyType) ? r.applyType : CS_APPLY_TYPES[0];
      byApplyDate.get(d)[tKey].cnt += 1;
      byApplyDate.get(d)[tKey].fee += r.totalFee;
    });
    const sortedApplyDates = Array.from(byApplyDate.keys()).sort();
    const grand = {};
    CS_APPLY_TYPES.forEach(t => { grand[t] = { cnt: 0, fee: 0 }; });

    const rowsSummary = [
      {
        height: 22,
        cells: [
          { v: '신청일자', style: 'Th', mergeDown: 1 },
          ...visibleApplyTypes.map(t => ({ v: t, style: 'Th', mergeAcross: 1 }))
        ]
      },
      {
        height: 22,
        cells: visibleApplyTypes.flatMap((_, idx) => [
          { v: '건수', style: 'Th', index: idx === 0 ? 2 : undefined },
          { v: '수수료 합계', style: 'Th' }
        ])
      },
      ...sortedApplyDates.map(d => {
        const b = byApplyDate.get(d);
        const cells = [{ v: d, style: 'CellCenter' }];
        visibleApplyTypes.forEach(t => {
          grand[t].cnt += b[t].cnt;
          grand[t].fee += b[t].fee;
          cells.push({ v: b[t].cnt, style: 'CellNum' });
          cells.push({ v: b[t].fee, style: b[t].fee < 0 ? 'CellNeg' : 'CellNum' });
        });
        return { height: 20, cells };
      }),
      {
        height: 22,
        cells: [
          { v: '합계', style: 'SumText' },
          ...visibleApplyTypes.flatMap(t => [
            { v: grand[t].cnt, style: 'SumNum' },
            { v: grand[t].fee, style: 'SumNum' }
          ])
        ]
      }
    ];

    // 시트 3: 사용 정산서 (건별 내역)
    const ledgerRows = yearEntries.filter(e => matchesApplyFilter(e.applyType));
    let ledSumQty = 0, ledSumSupply = 0, ledSumVat = 0, ledSumTotal = 0;
    const rowsLedger = [
      {
        height: 24,
        cells: ['순번', '품번', '지출일자', '품명', '검정수량', '검정단가', '공급가', '부가세', '금액'].map(h => ({ v: h, style: 'Th' }))
      },
      ...ledgerRows.map((r, idx) => {
        ledSumQty += r.qty;
        ledSumSupply += r.supplyAmt;
        ledSumVat += r.vatAmt;
        ledSumTotal += r.totalFee;
        const numSt = r.totalFee < 0 ? 'CellNeg' : 'CellNum';
        return {
          height: 20,
          cells: [
            { v: idx + 1, style: 'CellCenter' },
            { v: r.code || '', style: 'CellCenter' },
            { v: r.applyDate || '', style: 'CellCenter' },
            { v: r.name || r.itemKind, style: 'CellText' },
            { v: r.qty, style: 'CellNum' },
            { v: r.unitPrice, style: 'CellNum' },
            { v: r.supplyAmt, style: numSt },
            { v: r.vatAmt, style: numSt },
            { v: r.totalFee, style: numSt }
          ]
        };
      }),
      {
        height: 22,
        cells: [
          { v: '합계', style: 'SumText', mergeAcross: 3 },
          { v: ledSumQty, style: 'SumNum' },
          { v: '', style: 'SumText' },
          { v: ledSumSupply, style: 'SumNum' },
          { v: ledSumVat, style: 'SumNum' },
          { v: ledSumTotal, style: 'SumNum' }
        ]
      }
    ];

    // 시트 4: 월별 정산 요약
    const monthlyMetrics = [
      { no: 1, label: '건수', arr: Array(12).fill(0) },
      { no: 2, label: '생산(합격)수량', arr: Array(12).fill(0) },
      { no: 3, label: '불합격 건수', arr: Array(12).fill(0) },
      { no: 4, label: '불합격 금액', arr: Array(12).fill(0) },
      { no: 5, label: '철회건수', arr: Array(12).fill(0) },
      { no: 6, label: '철회 환급금액', arr: Array(12).fill(0) },
      { no: 7, label: '검정비', arr: Array(12).fill(0) },
      { no: 8, label: '품질제품검사', arr: Array(12).fill(0) },
      { no: 9, label: '생산제품검사', arr: Array(12).fill(0) }
    ];
    ledgerRows.forEach(r => {
      const d = r.applyDate || r.receiptDate || r.inspectDate || '';
      const mMatch = d.match(/^\d{4}-(\d{2})-/);
      if (!mMatch) return;
      const mIdx = Number(mMatch[1]) - 1;
      if (mIdx < 0 || mIdx > 11) return;
      if (r.isWithdrawal) {
        monthlyMetrics[4].arr[mIdx] += 1;
        monthlyMetrics[5].arr[mIdx] += r.totalFee;
      } else {
        monthlyMetrics[0].arr[mIdx] += 1;
        if (!r.isFail) monthlyMetrics[1].arr[mIdx] += r.qty;
      }
      if (r.isFail) {
        monthlyMetrics[2].arr[mIdx] += 1;
        monthlyMetrics[3].arr[mIdx] += r.totalFee;
      }
      monthlyMetrics[6].arr[mIdx] += r.totalFee;
      if (String(r.applyType).startsWith('생산')) monthlyMetrics[8].arr[mIdx] += r.totalFee;
      else monthlyMetrics[7].arr[mIdx] += r.totalFee;
    });

    const rowsMonthly = [
      {
        height: 24,
        cells: ['순번', selYear, '계', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map(h => ({ v: h, style: 'Th' }))
      },
      ...monthlyMetrics.map(m => {
        const sum = m.arr.reduce((a, b) => a + b, 0);
        return {
          height: 21,
          cells: [
            { v: m.no, style: 'CellCenter' },
            { v: m.label, style: 'CellText' },
            { v: sum, style: sum < 0 ? 'CellNeg' : 'SumNum' },
            ...m.arr.map(v => ({ v, style: v < 0 ? 'CellNeg' : 'CellNum' }))
          ]
        };
      })
    ];

    const sheetMap = {
      spec: { name: '수수료 명세서', colWidths: [145, 90, 78, 85, 85, 100], rows: rowsSpec },
      summary: { name: '명세서 집계표', colWidths: [95, ...visibleApplyTypes.flatMap(() => [65, 105])], rows: rowsSummary },
      ledger: { name: '사용 정산서', colWidths: [48, 95, 88, 175, 78, 82, 95, 85, 100], rows: rowsLedger },
      monthly: { name: '월별 정산 요약', colWidths: [46, 115, 95, ...Array(12).fill(82)], rows: rowsMonthly }
    };

    const today = getTodayDateString();
    if (mode !== 'all' && sheetMap[mode]) {
      const sh = sheetMap[mode];
      window.XLSXEngine.exportMultiSheetWorkbook([sh], `${sh.name}_${selYear}_${today}.xls`);
      showToast(`[${sh.name}] 엑셀 파일이 다운로드되었습니다.`);
    } else {
      window.XLSXEngine.exportMultiSheetWorkbook(
        [sheetMap.spec, sheetMap.summary, sheetMap.ledger, sheetMap.monthly],
        `검정정산_${selYear}_${today}.xls`
      );
      showToast('검정정산 엑셀 파일(4개 시트)이 다운로드되었습니다.');
    }
  }

  function initCertSettlementEvents() {
    enhanceSelectToCustomDropdown('cs-filter-year');
    enhanceSelectToCustomDropdown('cs-filter-receipt-date');

    document.getElementById('cs-filter-year')?.addEventListener('change', (e) => {
      state.csFilterYear = e.target.value;
      renderCertSettlementModule();
    });
    document.getElementById('cs-filter-receipt-date')?.addEventListener('change', (e) => {
      state.csFilterReceiptDate = e.target.value || 'ALL';
      renderCertSettlementModule();
    });

    const applyWrap = document.getElementById('cs-apply-type-dropdown-wrap');
    document.getElementById('btn-cs-apply-type-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      applyWrap?.classList.toggle('is-open');
    });
    document.getElementById('cs-apply-type-dropdown-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.getElementById('chk-cs-apply-all')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.csFilterApplyTypes = [];
      } else {
        // 개별 선택이 없으면 전체 선택 유지
        const anyChecked = Array.from(document.querySelectorAll('.chk-cs-apply-type')).some(c => c.checked);
        if (!anyChecked) e.target.checked = true;
      }
      renderCertSettlementModule();
    });

    document.querySelectorAll('.chk-cs-apply-type').forEach(chk => {
      chk.addEventListener('change', () => {
        const chkAll = document.getElementById('chk-cs-apply-all');
        const checkedVals = Array.from(document.querySelectorAll('.chk-cs-apply-type'))
          .filter(c => c.checked)
          .map(c => c.value);
        if (checkedVals.length > 0) {
          if (chkAll) chkAll.checked = false;
          state.csFilterApplyTypes = checkedVals;
        } else {
          if (chkAll) chkAll.checked = true;
          state.csFilterApplyTypes = [];
        }
        renderCertSettlementModule();
      });
    });

    document.querySelectorAll('#cs-view-tabs .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.csView = btn.dataset.csView || 'spec';
        renderCertSettlementModule();
      });
    });

    document.getElementById('btn-cs-upload-kfi')?.addEventListener('click', () => {
      document.getElementById('input-kfi-excel-upload')?.click();
    });

    const exportWrap = document.getElementById('cs-export-dropdown-wrap');
    document.getElementById('btn-cs-export-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportWrap?.classList.toggle('is-open');
    });
    const bindExport = (btnId, mode) => {
      document.getElementById(btnId)?.addEventListener('click', () => {
        exportWrap?.classList.remove('is-open');
        exportCertSettlementXlsx(mode);
      });
    };
    bindExport('btn-cs-export-all', 'all');
    bindExport('btn-cs-export-spec', 'spec');
    bindExport('btn-cs-export-summary', 'summary');
    bindExport('btn-cs-export-ledger', 'ledger');
    bindExport('btn-cs-export-monthly', 'monthly');
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
    const template = '\uFEFF사용여부,제품검사 유형,작업반,품목그룹,품목코드,대체품명,품명,규격,형식번호,모델명,단가,감지,제어,가스\n' +
      '사용,품질,감지기반,감지기,PDCRW-0001,일반 차동식-방수,일반차동식-방수형,"(감20-5), DCRW, 차동식 방수형",감20-5,DCRW,5000,,,\n' +
      '사용,품질,유도등반,유도등,PLELW-1101,피난구 벽부 대형 단면,"피난구, 벽부, 대형, 단면","(유12-45-1) 피난구, 벽부, 대형, 단면, L1ELW-19",유12-45-1,L1ELW-19,34000,,,\n';

    downloadFile(template, '품목정보_표준양식.csv', 'text/csv;charset=utf-8;');
  }


  // =========================================================================
  // 14-B. 생산계획 (tab-plan) — 엑셀형 그리드, 월/주차/전체, 5색 팔레트, 메모지, ALT+드래그
  // =========================================================================
  function generateYearWeeks(yearStr, customStartDateStr = '') {
    const y = Number(yearStr) || 2026;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const weeks = [];

    let firstFri;
    let targetYear = y;
    if (customStartDateStr && /^\d{4}-\d{2}-\d{2}$/.test(customStartDateStr)) {
      const [sy, sm, sd] = customStartDateStr.split('-').map(Number);
      // 시작일은 무조건 W1의 월요일 -> 금요일은 +4일
      firstFri = new Date(sy, sm - 1, sd + 4);
      targetYear = firstFri.getFullYear();
    } else {
      // 해당 연도 1월 1일이 포함된 주의 화요일/금요일 기준 생성 (2026년 W1 = 12/30(화), 1/2(금))
      const jan1 = new Date(y, 0, 1);
      const dow = jan1.getDay(); // 0=일 .. 5=금
      const offsetToFri = (5 - dow + 7) % 7;
      firstFri = new Date(y, 0, 1 + offsetToFri);
    }

    for (let w = 0; w < 53; w++) {
      const fri = new Date(firstFri);
      fri.setDate(firstFri.getDate() + w * 7);
      if (fri.getFullYear() > targetYear && w >= 51) break;

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
      startDate: '2025-12-29',
      startMonth: 1,
      endMonth: 3,
      selectedMonths: [1, 2, 3],
      viewMode: 'week', // 'month' | 'week' | 'all'
      summaryPos: 'bottom', // 'bottom' | 'top'
      hideSpecCols: false,
      hideFormatCol: false,
      hideModelCol: false,
      hidePriceCol: false,
      hideBaseCol: false,
      hideMinMaxCols: false,
      hideActualCol: false,
      hideCompareCols: false,
      shortageOnly: false,
      showStockAmount: false,
      stockAmountUnit: '만원',
      autoGreenOnMove: true,
      colorFilter: 'ALL',
      groupViewMode: false,
      expandedItemGroups: [],
      hiddenItemGroups: [],
      itemGroupColors: {},
      mergedItemGroups: [],
      itemGroupOrder: [],
      weeks: generateYearWeeks('2026'),
      rowsByCode: {},
      rowsByYear: { '2026': {} }
    };
  }

  function normalizePlanData(raw) {
    const def = getDefaultPlanData();
    if (!raw || typeof raw !== 'object') return def;
    const yr = String(raw.year || (raw.startDate ? raw.startDate.slice(0, 4) : def.year));
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

    const rowsByYear = (raw.rowsByYear && typeof raw.rowsByYear === 'object') ? { ...raw.rowsByYear } : {};
    const legacyRows = (raw.rowsByCode && typeof raw.rowsByCode === 'object') ? raw.rowsByCode : {};
    if (!rowsByYear[yr]) {
      rowsByYear[yr] = legacyRows;
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
      hideFormatCol: raw.hideFormatCol !== undefined ? Boolean(raw.hideFormatCol) : Boolean(raw.hideSpecCols),
      hideModelCol: raw.hideModelCol !== undefined ? Boolean(raw.hideModelCol) : Boolean(raw.hideSpecCols),
      hidePriceCol: raw.hidePriceCol !== undefined ? Boolean(raw.hidePriceCol) : Boolean(raw.hideSpecCols),
      hideBaseCol: raw.hideBaseCol !== undefined ? Boolean(raw.hideBaseCol) : Boolean(raw.hideSpecCols),
      hideMinMaxCols: raw.hideMinMaxCols !== undefined ? Boolean(raw.hideMinMaxCols) : Boolean(raw.hideSpecCols),
      hideActualCol: Boolean(raw.hideActualCol),
      hideCompareCols: Boolean(raw.hideCompareCols),
      shortageOnly: Boolean(raw.shortageOnly),
      showStockAmount: Boolean(raw.showStockAmount),
      stockAmountUnit: ['만원', '백만원', '천만원'].includes(raw.stockAmountUnit) ? raw.stockAmountUnit : '만원',
      autoGreenOnMove: raw.autoGreenOnMove !== undefined ? Boolean(raw.autoGreenOnMove) : true,
      colorFilter: raw.colorFilter || 'ALL',
      groupViewMode: raw.groupViewMode !== undefined
        ? Boolean(raw.groupViewMode)
        : (Array.isArray(raw.mergedItemGroups) && raw.mergedItemGroups.length > 0),
      expandedItemGroups: Array.isArray(raw.expandedItemGroups) ? raw.expandedItemGroups : [],
      hiddenItemGroups: Array.isArray(raw.hiddenItemGroups) ? raw.hiddenItemGroups : [],
      itemGroupColors: (raw.itemGroupColors && typeof raw.itemGroupColors === 'object') ? { ...raw.itemGroupColors } : {},
      mergedItemGroups: Array.isArray(raw.mergedItemGroups) ? raw.mergedItemGroups : [],
      itemGroupOrder: Array.isArray(raw.itemGroupOrder) ? raw.itemGroupOrder : [],
      weeks: baseWeeks,
      rowsByCode: rowsByYear[yr],
      rowsByYear
    };
  }

  function switchPlanYear(pd, targetYear) {
    const yr = String(targetYear || pd.year || '2026');
    if (!pd.rowsByYear || typeof pd.rowsByYear !== 'object') pd.rowsByYear = {};
    if (pd.year) {
      pd.rowsByYear[pd.year] = pd.rowsByCode || {};
    }
    if (yr !== pd.year) {
      pd.year = yr;
      pd.weeks = generateYearWeeks(yr);
      if (pd.startDate && /^\d{4}-\d{2}-\d{2}$/.test(pd.startDate)) {
        pd.startDate = yr + pd.startDate.slice(4);
      } else {
        pd.startDate = `${yr}-01-01`;
      }
    }
    if (!pd.rowsByYear[yr]) pd.rowsByYear[yr] = {};
    pd.rowsByCode = pd.rowsByYear[yr];
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
      if (!state.planData.rowsByYear || typeof state.planData.rowsByYear !== 'object') state.planData.rowsByYear = {};
      if (state.planData.year) {
        state.planData.rowsByYear[state.planData.year] = state.planData.rowsByCode || {};
      }
      localStorage.setItem(STORAGE_KEYS.PLAN_DATA, JSON.stringify(state.planData));
    } catch (e) {
      console.warn('생산계획 로컬 저장 실패:', e);
    }
  }

  const PLAN_DISPLAY_OPT_KEYS = [
    'hideSpecCols', 'hideFormatCol', 'hideModelCol', 'hidePriceCol',
    'hideBaseCol', 'hideMinMaxCols', 'hideActualCol', 'hideCompareCols',
    'shortageOnly', 'showStockAmount', 'stockAmountUnit', 'autoGreenOnMove', 'viewMode'
  ];

  async function loadPlanDataFromDb() {
    const hadLocal = Boolean(localStorage.getItem(STORAGE_KEYS.PLAN_DATA));
    loadLocalPlanData();
    const localOpts = {};
    if (hadLocal && state.planData) {
      PLAN_DISPLAY_OPT_KEYS.forEach(k => { localOpts[k] = state.planData[k]; });
    }
    const mergeCloudPlan = (rawDoc) => {
      const next = normalizePlanData(rawDoc);
      if (hadLocal) {
        PLAN_DISPLAY_OPT_KEYS.forEach(k => {
          if (localOpts[k] !== undefined) next[k] = localOpts[k];
        });
      }
      state.planData = next;
      saveLocalPlanData();
    };
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_data').doc('production_plan').get();
      if (doc.exists) {
        mergeCloudPlan(doc.data());
        return;
      }
    } catch (err) { /* fallback below */ }
    try {
      const fbDoc = await db.collection('pms_metadata').doc('production_plan').get();
      if (fbDoc.exists) {
        mergeCloudPlan(fbDoc.data());
      }
    } catch (err) {
      console.warn('생산계획 Firestore 로드 오류:', err);
    }
  }

  async function savePlanToDb(silent = false) {
    if (isGuestReadOnly(true)) return;
    if (!state.planData) state.planData = getDefaultPlanData();
    saveLocalPlanData();
    let dbSaved = false;
    if (isFirestoreActive && db) {
      const payload = {
        ...state.planData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await db.collection('pms_data').doc('production_plan').set(payload);
        dbSaved = true;
      } catch (err) {
        try {
          await db.collection('pms_metadata').doc('production_plan').set(payload);
          dbSaved = true;
        } catch (fbErr) {
          console.warn('생산계획 DB 저장 실패:', fbErr);
        }
      }
    }
    markAsDirty(false);
    if (!silent) {
      showToast(dbSaved ? '생산계획이 DB에 저장되었습니다.' : '생산계획이 로컬에 저장되었습니다.');
    }
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
      if (!state.planData.rowsByYear) state.planData.rowsByYear = {};
      state.planData.rowsByYear[state.planData.year] = state.planData.rowsByCode;
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
    extraCells: new Set(),
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
      { key: 'rowNo', label: 'NO', fixed: true, editable: false, cls: 'plan-col-no', width: 46, isNum: false },
      { key: 'code', label: '품목코드', fixed: true, editable: false, cls: 'plan-col-code', width: 110, isNum: false },
      { key: 'name', label: '품명', fixed: true, editable: false, cls: 'plan-col-name', width: 210, isNum: false }
    ];

    if (!pd.hideSpecCols) {
      if (!pd.hideFormatCol) fixedCols.push({ key: 'formatNo', label: '형식번호', fixed: true, editable: false, cls: 'plan-col-format', width: 90, isNum: false });
      if (!pd.hideModelCol) fixedCols.push({ key: 'modelName', label: '모델명', fixed: true, editable: false, cls: 'plan-col-model', width: 95, isNum: false });
      if (!pd.hidePriceCol) fixedCols.push({ key: 'unitPrice', label: '단가', fixed: true, editable: false, cls: 'plan-col-price', width: 80, isNum: true });
      if (!pd.hideBaseCol) fixedCols.push({ key: 'baseStock', label: `기초재고<br><small style="font-weight:500;color:#64748b;">[${baseYearShort}년]</small>`, fixed: true, editable: false, cls: 'plan-col-base', width: 85, isNum: true });
      if (!pd.hideMinMaxCols) {
        fixedCols.push(
          { key: 'minStock', label: '최소재고', fixed: true, editable: false, cls: 'plan-col-minstock', width: 78, isNum: true },
          { key: 'maxStock', label: '최대재고', fixed: true, editable: false, cls: 'plan-col-maxstock', width: 78, isNum: true }
        );
      }
    }

    let curLeft = 0;
    fixedCols.forEach((col, idx) => {
      col.left = curLeft;
      curLeft += col.width || 0;
      col.isLastFixed = idx === fixedCols.length - 1;
    });

    const { months, weeks } = getPlanPeriodWeeksAndMonths();
    const subCount = (pd.hideCompareCols ? 4 : 6) - (pd.hideActualCol ? 1 : 0);
    const dynamicCols = [];
    const groupHeaders = []; // { type: 'week'|'month', id, label, colspan }

    const pushWeekCols = (w) => {
      const amtSuffix = pd.showStockAmount ? '(₩)' : '';
      groupHeaders.push({ type: 'week', id: w.id, label: w.label, colspan: subCount });
      dynamicCols.push({ key: `${w.id}:prod`, weekId: w.id, field: 'prod', label: `생산${amtSuffix}`, fixed: false, editable: true, cls: 'plan-col-week plan-col-prod', isNum: true });
      dynamicCols.push({ key: `${w.id}:forecast`, weekId: w.id, field: 'forecast', label: `출고예정${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-forecast plan-cell-readonly', isNum: true });
      if (!pd.hideActualCol) {
        dynamicCols.push({ key: `${w.id}:actual`, weekId: w.id, field: 'actual', label: `실출고${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-actual plan-cell-readonly', isNum: true });
      }
      if (!pd.hideCompareCols) {
        dynamicCols.push({ key: `${w.id}:compare`, weekId: w.id, field: 'compare', label: '입고비교', fixed: false, editable: false, cls: 'plan-col-week plan-col-compare plan-cell-readonly', isNum: true });
        dynamicCols.push({ key: `${w.id}:diff`, weekId: w.id, field: 'diff', label: '차이수량', fixed: false, editable: false, cls: 'plan-col-week plan-col-diff plan-cell-readonly', isNum: true });
      }
      dynamicCols.push({ key: `${w.id}:stock`, weekId: w.id, field: 'stock', label: `재고${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-stock plan-cell-readonly', isNum: true });
    };

    const pushMonthCols = (m) => {
      const mId = `M${m}`;
      const amtSuffix = pd.showStockAmount ? '(₩)' : '';
      groupHeaders.push({ type: 'month', id: mId, label: `${m}월 합계`, colspan: subCount });
      dynamicCols.push({ key: `${mId}:prod`, month: m, field: 'prod', isMonth: true, label: `생산${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      dynamicCols.push({ key: `${mId}:forecast`, month: m, field: 'forecast', isMonth: true, label: `출고예정${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      if (!pd.hideActualCol) {
        dynamicCols.push({ key: `${mId}:actual`, month: m, field: 'actual', isMonth: true, label: `실출고${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      }
      if (!pd.hideCompareCols) {
        dynamicCols.push({ key: `${mId}:compare`, month: m, field: 'compare', isMonth: true, label: '입고비교', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
        dynamicCols.push({ key: `${mId}:diff`, month: m, field: 'diff', isMonth: true, label: '차이수량', fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-cell-readonly', isNum: true });
      }
      dynamicCols.push({ key: `${mId}:stock`, month: m, field: 'stock', isMonth: true, label: `기말재고${amtSuffix}`, fixed: false, editable: false, cls: 'plan-col-week plan-col-month-sum plan-col-stock plan-cell-readonly', isNum: true });
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

  const PLAN_GROUP_DEFAULT_PALETTE = [
    '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626',
    '#7c3aed', '#0d9488', '#ea580c', '#2563eb', '#db2777'
  ];

  function getPlanItemGroupColorHex(groupName, idxHint = 0) {
    const pd = state.planData || getDefaultPlanData();
    const custom = pd.itemGroupColors && pd.itemGroupColors[groupName];
    if (custom && /^#[0-9a-fA-F]{6}$/.test(custom)) return custom;
    const idx = idxHint >= 0 ? idxHint : 0;
    return PLAN_GROUP_DEFAULT_PALETTE[idx % PLAN_GROUP_DEFAULT_PALETTE.length];
  }

  function buildPlanGroupColorStyleAttr(hexColor) {
    if (!hexColor || !/^#[0-9a-fA-F]{6}$/.test(hexColor)) return '';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const isDark = document.documentElement.classList.contains('dark-mode');
    const bgAlpha = isDark ? 0.22 : 0.09;
    const fixedAlpha = isDark ? 0.34 : 0.15;
    const borderAlpha = isDark ? 0.50 : 0.28;
    const childAlpha = isDark ? 0.15 : 0.06;
    return `--plan-grp-color:${hexColor};--plan-grp-bg:rgba(${r},${g},${b},${bgAlpha});--plan-grp-fixed-bg:rgba(${r},${g},${b},${fixedAlpha});--plan-grp-border:rgba(${r},${g},${b},${borderAlpha});--plan-grp-child-bg:rgba(${r},${g},${b},${childAlpha});`;
  }

  function getPlanCarryOverBaseStock(pd, targetYear, item, visitedYears = new Set()) {
    const yr = String(targetYear || pd.year || '2026');
    if (visitedYears.has(yr)) return item.baseStock || '';
    visitedYears.add(yr);

    const prevYear = String(Number(yr) - 1);
    const prevYearRows = pd.rowsByYear && pd.rowsByYear[prevYear];
    if (prevYearRows && typeof prevYearRows === 'object' && Object.keys(prevYearRows).length > 0) {
      const prevBase = getPlanCarryOverBaseStock(pd, prevYear, item, visitedYears);
      let prevStock = parsePlanNum(prevBase);
      const prevSaved = prevYearRows[item.code] || {};
      const prevWeeks = generateYearWeeks(prevYear);
      prevWeeks.forEach(w => {
        const wSaved = (prevSaved.weeks && prevSaved.weeks[w.id]) || {};
        prevStock = prevStock + parsePlanNum(wSaved.prod) - parsePlanNum(wSaved.actual);
      });
      return String(prevStock);
    }

    const curRows = (pd.rowsByYear && pd.rowsByYear[yr]) || pd.rowsByCode || {};
    const saved = curRows[item.code] || {};
    return saved.baseStock !== undefined && saved.baseStock !== null ? saved.baseStock : (item.baseStock || '');
  }

  function getPlanComputedRows(ignoreColorFilter = false) {
    const pd = state.planData || getDefaultPlanData();
    const masterItems = state.certMasterItems || [];
    const groupFilter = state.planFilterGroup || 'ALL';
    const search = (state.planSearchText || '').trim().toLowerCase();
    const mainGroups = ['감지기반', '유도등반', '수신기반'];
    const { months, weeks: periodWeeks } = getPlanPeriodWeeksAndMonths();

    const hiddenSet = new Set(pd.hiddenItemGroups || []);
    const computedRows = masterItems
      .filter(item => (item.useYn || '사용') === '사용')
      .filter(item => {
        const ig = (item.itemGroup || '').trim();
        if (ig && hiddenSet.has(ig)) return false;
        return true;
      })
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
        const baseVal = getPlanCarryOverBaseStock(pd, pd.year, item);
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
        const splits = saved.splits || {};

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
          splits,
          isGroupRow: false
        };
      });

    // 품목그룹 보기 ON/OFF 처리 (그룹 순서대로 그룹 헤더 행 배치, 펼침 시 바로 아래에 소속 품목 표시)
    const isGroupView = Boolean(pd.groupViewMode);
    const expandedSet = new Set(pd.expandedItemGroups || []);
    let finalRows = computedRows;
    if (isGroupView) {
      const { orderedGroups } = getOrderedPlanItemGroups();
      const groupBuckets = new Map();
      const groupMembersMap = new Map();
      const ungroupedRows = [];
      const addNumOrEmpty = (a, b) => {
        const sa = String(a ?? '').trim();
        const sb = String(b ?? '').trim();
        if (sa === '' && sb === '') return '';
        return String(parsePlanNum(sa) + parsePlanNum(sb));
      };

      const AMT_FIELDS = ['prod', 'forecast', 'actual', 'stock'];
      computedRows.forEach(row => {
        if (row.itemGroup) {
          let grp = groupBuckets.get(row.itemGroup);
          if (!grp) {
            const unitPriceNum = parsePlanNum(row.unitPrice);
            const cloneWeeks = {};
            Object.keys(row.weeks || {}).forEach(wk => {
              const rw = row.weeks[wk] || {};
              const extraAmt = {};
              AMT_FIELDS.forEach(f => { extraAmt[`${f}AmountWon`] = parsePlanNum(rw[f]) * unitPriceNum; });
              cloneWeeks[wk] = { ...rw, ...extraAmt };
            });
            const cloneMonths = {};
            Object.keys(row.months || {}).forEach(mk => {
              const rm = row.months[mk] || {};
              const extraAmt = {};
              AMT_FIELDS.forEach(f => { extraAmt[`${f}AmountWon`] = parsePlanNum(rm[f]) * unitPriceNum; });
              cloneMonths[mk] = { ...rm, ...extraAmt };
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
              isExpanded: expandedSet.has(row.itemGroup),
              memberCount: 1
            };
            groupBuckets.set(row.itemGroup, grp);
            groupMembersMap.set(row.itemGroup, [{ ...row, isGroupChild: true, parentGroup: row.itemGroup }]);
          } else {
            grp.memberCount += 1;
            grp.baseStock = addNumOrEmpty(grp.baseStock, row.baseStock);
            if (row.minStock !== null) grp.minStock = (grp.minStock || 0) + row.minStock;
            if (row.maxStock !== null) grp.maxStock = (grp.maxStock || 0) + row.maxStock;

            const unitPriceNum = parsePlanNum(row.unitPrice);
            Object.keys(row.weeks || {}).forEach(wk => {
              const gw = grp.weeks[wk] || (grp.weeks[wk] = { prod: '', forecast: '', actual: '', compare: '', diff: '', stock: 0, prodAmountWon: 0, forecastAmountWon: 0, actualAmountWon: 0, stockAmountWon: 0 });
              const rw = row.weeks[wk] || {};
              gw.prod = addNumOrEmpty(gw.prod, rw.prod);
              gw.forecast = addNumOrEmpty(gw.forecast, rw.forecast);
              gw.actual = addNumOrEmpty(gw.actual, rw.actual);
              gw.compare = addNumOrEmpty(gw.compare, rw.compare);
              gw.diff = addNumOrEmpty(gw.diff, rw.diff);
              gw.stock = parsePlanNum(gw.stock) + parsePlanNum(rw.stock);
              AMT_FIELDS.forEach(f => {
                gw[`${f}AmountWon`] = (gw[`${f}AmountWon`] || 0) + (parsePlanNum(rw[f]) * unitPriceNum);
              });
            });

            Object.keys(row.months || {}).forEach(mk => {
              const gm = grp.months[mk] || (grp.months[mk] = { prod: '', forecast: '', actual: '', compare: '', diff: '', stock: '', prodAmountWon: 0, forecastAmountWon: 0, actualAmountWon: 0, stockAmountWon: 0 });
              const rm = row.months[mk] || {};
              gm.prod = addNumOrEmpty(gm.prod, rm.prod);
              gm.forecast = addNumOrEmpty(gm.forecast, rm.forecast);
              gm.actual = addNumOrEmpty(gm.actual, rm.actual);
              gm.compare = addNumOrEmpty(gm.compare, rm.compare);
              gm.diff = addNumOrEmpty(gm.diff, rm.diff);
              gm.stock = addNumOrEmpty(gm.stock, rm.stock);
              AMT_FIELDS.forEach(f => {
                gm[`${f}AmountWon`] = (gm[`${f}AmountWon`] || 0) + (parsePlanNum(rm[f]) * unitPriceNum);
              });
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
            groupMembersMap.get(row.itemGroup).push({ ...row, isGroupChild: true, parentGroup: row.itemGroup });
          }
          grp.name = `📦 ${row.itemGroup} (${grp.memberCount}종)`;
        } else {
          ungroupedRows.push(row);
        }
      });

      finalRows = [];
      const pushGroupAndChildren = (gName) => {
        if (!groupBuckets.has(gName)) return;
        const grp = groupBuckets.get(gName);
        finalRows.push(grp);
        if (grp.isExpanded) {
          finalRows.push(...(groupMembersMap.get(gName) || []));
        }
      };
      orderedGroups.forEach(gName => pushGroupAndChildren(gName));
      groupBuckets.forEach((_, gName) => {
        if (!orderedGroups.includes(gName)) pushGroupAndChildren(gName);
      });
      finalRows.push(...ungroupedRows);
    }

    const unregMap = pd.unregisteredOnly ? getCertRegisteredQtyMap() : null;
    return finalRows.filter(row => {
      if (pd.shortageOnly && !row.hasShortage) return false;
      if (!ignoreColorFilter && pd.colorFilter && pd.colorFilter !== 'ALL') {
        const vals = Object.values(row.colors || {});
        if (!vals.includes(pd.colorFilter)) return false;
      }
      if (pd.unregisteredOnly && unregMap) {
        if (row.isGroupRow) return false;
        const hasUnreg = periodWeeks.some(w => {
          const pQty = parsePlanNum(row.weeks?.[w.id]?.prod);
          return pQty > 0 && !(unregMap[`${row.code}__${w.id}`] > 0);
        });
        if (!hasUnreg) return false;
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
    if (col.key === 'minStock') return rowObj.minStock !== null && rowObj.minStock !== undefined ? rowObj.minStock : '';
    if (col.key === 'maxStock') return rowObj.maxStock !== null && rowObj.maxStock !== undefined ? rowObj.maxStock : '';
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

  function getPlanWeekCertLockInfo(code, weekId, yearStr) {
    const cleanCode = String(code || '').trim();
    const cleanWeek = String(weekId || '').trim();
    const targetYear = String(yearStr || state.planData?.year || '').trim();
    let doneQty = 0;
    let appliedQty = 0;
    let draftSavedQty = 0;

    if (!cleanCode || !cleanWeek) {
      return { doneQty: 0, appliedQty: 0, draftSavedQty: 0, lockedQty: 0, hasDone: false, hasApplied: false };
    }

    (state.certSavedRows || []).forEach(r => {
      if (String(r.code || '').trim() !== cleanCode) return;
      if (String(r.sourceWeekId || '').trim() !== cleanWeek) return;
      const rYear = String(r.sourceYear || (r.weekDate && /^\d{4}/.test(r.weekDate) ? r.weekDate.slice(0, 4) : '')).trim();
      if (targetYear && rYear && rYear !== targetYear) return;

      const qty = parseSafeInt(r.qty);
      const st = String(r.status || '등록완료').trim();
      if (st === '일정완료') {
        doneQty += qty;
      } else if (st === '검정신청' || st === '품검요청') {
        appliedQty += qty;
      } else {
        draftSavedQty += qty;
      }
    });

    return {
      doneQty,
      appliedQty,
      draftSavedQty,
      lockedQty: doneQty + appliedQty,
      hasDone: doneQty > 0,
      hasApplied: appliedQty > 0
    };
  }

  function trySetPlanCellValueWithCertGuard(code, col, rawVal) {
    if (!col || !col.editable) return { ok: false, reason: '' };
    if (col.weekId && col.field === 'prod' && !col.isMonth) {
      const yr = state.planData?.year;
      const lock = getPlanWeekCertLockInfo(code, col.weekId, yr);
      const oldQty = parsePlanNum(state.planData?.rowsByCode?.[code]?.weeks?.[col.weekId]?.prod);
      let cleanStr = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim().replace(/,/g, '');
      const newQty = cleanStr === '' ? 0 : parsePlanNum(cleanStr);

      if (lock.hasDone) {
        if (newQty === oldQty && cleanStr !== '') return { ok: false, reason: '' };
        return {
          ok: false,
          reason: `생산완료(일정완료)된 건(${lock.doneQty.toLocaleString()}개)이 있어 수량을 변경하거나 삭제할 수 없습니다.`
        };
      }

      if (lock.hasApplied && newQty < lock.lockedQty) {
        return {
          ok: false,
          reason: `검정신청된 수량(${lock.lockedQty.toLocaleString()}개)보다 적게 수정하거나 삭제할 수 없습니다.`
        };
      }

      // 검정신청 상태에서 수량이 증가한 경우, 증가분 자동 로트 분할
      const prevSplits = state.planData?.rowsByCode?.[code]?.splits?.[col.weekId];
      const hasPrevSplits = Array.isArray(prevSplits) && prevSplits.length >= 2 &&
        prevSplits.reduce((a, b) => a + parsePlanNum(b), 0) === oldQty;

      setPlanCellValue(code, col, rawVal);

      if (lock.hasApplied && newQty > oldQty) {
        const entry = state.planData?.rowsByCode?.[code];
        if (entry) {
          if (!entry.splits) entry.splits = {};
          const basePart = oldQty > 0 ? oldQty : lock.lockedQty;
          const addedPart = newQty - basePart;
          if (hasPrevSplits) {
            entry.splits[col.weekId] = [...prevSplits, newQty - oldQty];
          } else if (basePart > 0 && addedPart > 0) {
            entry.splits[col.weekId] = [basePart, addedPart];
          }
          return {
            ok: true,
            autoSplitInfo: entry.splits[col.weekId]
              ? `증가분 ${addedPart.toLocaleString()}개가 자동 분할되었습니다. (${entry.splits[col.weekId].map(n => parsePlanNum(n).toLocaleString()).join('/')})`
              : ''
          };
        }
      }
      return { ok: true, autoSplitInfo: '' };
    }

    setPlanCellValue(code, col, rawVal);
    return { ok: true, autoSplitInfo: '' };
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
      if (col.field === 'prod' && entry.splits && Array.isArray(entry.splits[col.weekId])) {
        const splitSum = entry.splits[col.weekId].reduce((a, b) => a + parsePlanNum(b), 0);
        if (parsePlanNum(clean) !== splitSum || parsePlanNum(clean) < 2) {
          delete entry.splits[col.weekId];
        }
      }
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

  function getPlanWeekMemoText(code, weekId, yearStr) {
    const rowsByCode = (yearStr && state.planData?.rowsByYear?.[String(yearStr)])
      ? state.planData.rowsByYear[String(yearStr)]
      : state.planData?.rowsByCode;
    if (!code || !weekId || !rowsByCode?.[code]?.memos) return '';
    const memos = rowsByCode[code].memos;
    if (memos[`${weekId}:prod`]) return String(memos[`${weekId}:prod`]).trim();
    const prefix = `${weekId}:`;
    const otherKey = Object.keys(memos).find(k => k.startsWith(prefix) && String(memos[k] || '').trim());
    return otherKey ? String(memos[otherKey]).trim() : '';
  }

  function applyPlanMemoToCertRow(row, nextMemo) {
    if (!row) return false;
    const next = String(nextMemo || '').trim();
    const prev = String(row.planMemo || '').trim();
    let cur = String(row.site || '').trim();

    if (prev && cur) {
      if (cur === prev) {
        cur = '';
      } else if (cur.endsWith(` / ${prev}`)) {
        cur = cur.slice(0, -(prev.length + 3)).trim();
      } else if (cur.startsWith(`${prev} / `)) {
        cur = cur.slice(prev.length + 3).trim();
      } else if (cur.includes(prev)) {
        cur = cur.replace(prev, '').replace(/\s*\/\s*$/, '').replace(/^\s*\/\s*/, '').trim();
      }
    }

    let updated = cur;
    if (next) {
      if (!cur) updated = next;
      else if (!cur.includes(next)) updated = `${cur} / ${next}`;
    }

    const changed = (row.site || '') !== updated || (row.planMemo || '') !== next;
    row.site = updated;
    row.planMemo = next;
    return changed;
  }

  function syncPlanMemoToCertAndInspection(code, weekId) {
    if (!code || !weekId || !/^W\d+$/i.test(weekId)) return;
    const nextMemo = getPlanWeekMemoText(code, weekId);
    const pd = state.planData || getDefaultPlanData();
    const dates = getPlanWeekFridayDates(pd.year, weekId);
    const normCode = String(code).trim().toLowerCase();
    let changed = false;

    const matchRow = (r) => {
      if (String(r.code || '').trim().toLowerCase() !== normCode) return false;
      if (r.sourceWeekId && String(r.sourceWeekId).trim() === weekId) return true;
      if (dates.weekDate && r.weekDate === dates.weekDate) return true;
      return false;
    };

    (state.certDraftRows || []).forEach(r => {
      if (matchRow(r) && applyPlanMemoToCertRow(r, nextMemo)) changed = true;
    });
    (state.certSavedRows || []).forEach(r => {
      if (matchRow(r) && applyPlanMemoToCertRow(r, nextMemo)) changed = true;
    });

    if (changed) {
      saveLocalCertData();
      if (typeof saveCertDataToDb === 'function') saveCertDataToDb(true);
      if (typeof renderCertDraftTable === 'function') renderCertDraftTable();
      if (typeof renderCertSavedTable === 'function') renderCertSavedTable();
      if (typeof renderInspectionTable === 'function') renderInspectionTable();
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
    const weekId = String(colKey || '').split(':')[0];
    if (/^W\d+$/i.test(weekId)) {
      syncPlanMemoToCertAndInspection(code, weekId);
    }
  }

  function buildPlanSummaryRowHtml(rows, cols, fixedCount) {
    const pd = state.planData || getDefaultPlanData();
    const showAmt = Boolean(pd.showStockAmount);
    const AMT_FIELDS = ['prod', 'forecast', 'actual', 'stock'];
    const unitDivisor = pd.stockAmountUnit === '천만원' ? 10000000 : (pd.stockAmountUnit === '백만원' ? 1000000 : 10000);
    const getRowFieldWon = (row, col) => {
      if (row.isGroupRow) {
        const amtKey = `${col.field}AmountWon`;
        if (col.isMonth && col.month) return Number(row.months?.[`M${col.month}`]?.[amtKey] || 0);
        if (col.weekId) return Number(row.weeks?.[col.weekId]?.[amtKey] || 0);
        return 0;
      }
      return parsePlanNum(getPlanCellRawValue(row, col)) * parsePlanNum(row.unitPrice);
    };

    const totals = new Array(cols.length).fill(0);
    rows.forEach(row => {
      if (row.isGroupRow && row.isExpanded) return; // 펼쳐진 그룹은 하위 개별 품목 행에서 합산되므로 중복 합산 방지
      cols.forEach((col, cIdx) => {
        if (showAmt && AMT_FIELDS.includes(col.field)) {
          totals[cIdx] += getRowFieldWon(row, col);
        } else if (col.key === 'baseStock' || col.weekId || col.isMonth) {
          totals[cIdx] += parsePlanNum(getPlanCellRawValue(row, col));
        }
      });
    });
    const summaryItemCount = rows.reduce((acc, r) => acc + (r.isGroupRow ? (r.isExpanded ? 0 : (r.memberCount || 0)) : 1), 0);

    const pos = pd.summaryPos || 'bottom';
    let html = '<tr class="plan-summary-row">';
    cols.forEach((col, cIdx) => {
      const fixedCls = col.fixed ? ` plan-fixed-col${col.isLastFixed ? ' plan-fixed-last' : ''}` : '';
      const fixedStyle = col.fixed ? ` style="left:${col.left}px;"` : '';
      if (col.key === 'rowNo') {
        html += `<td class="${col.cls}${fixedCls}"${fixedStyle}></td>`;
      } else if (col.key === 'code') {
        html += `<td class="${col.cls}${fixedCls} plan-summary-label"${fixedStyle}>
          <select id="plan-summary-pos-inline" class="plan-summary-pos-inline" title="합계 위치 변경">
            <option value="bottom"${pos === 'bottom' ? ' selected' : ''}>합계 ▼(하단)</option>
            <option value="top"${pos === 'top' ? ' selected' : ''}>합계 ▲(상단)</option>
          </select>
        </td>`;
      } else if (col.key === 'name') {
        html += `<td class="${col.cls}${fixedCls}" style="left:${col.left}px; text-align:left; font-family:Pretendard,sans-serif;">${summaryItemCount}개 품목</td>`;
      } else if (cIdx < fixedCount && col.key !== 'baseStock') {
        html += `<td class="${col.cls}${fixedCls}"${fixedStyle}></td>`;
      } else {
        const isAmtCol = showAmt && AMT_FIELDS.includes(col.field);
        const dispTotal = isAmtCol ? Math.round(totals[cIdx] / unitDivisor) : totals[cIdx];
        const negCls = (col.field === 'stock' && dispTotal < 0) ? ' plan-stock-negative' : '';
        const diffCls = (col.field === 'diff')
          ? (dispTotal < 0 ? ' plan-diff-neg' : (dispTotal > 0 ? ' plan-diff-pos' : ''))
          : '';
        const totalHtml = dispTotal.toLocaleString('ko-KR');
        html += `<td class="${col.cls}${fixedCls}${negCls}${diffCls}"${fixedStyle}>${totalHtml}</td>`;
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

    document.querySelectorAll('.plan-seg-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === pd.viewMode);
    });

    const chkSpec = document.getElementById('chk-plan-hide-spec');
    if (chkSpec) chkSpec.checked = Boolean(pd.hideSpecCols);
    const chkFmt = document.getElementById('chk-plan-hide-format');
    if (chkFmt) chkFmt.checked = Boolean(pd.hideFormatCol);
    const chkMod = document.getElementById('chk-plan-hide-model');
    if (chkMod) chkMod.checked = Boolean(pd.hideModelCol);
    const chkPri = document.getElementById('chk-plan-hide-price');
    if (chkPri) chkPri.checked = Boolean(pd.hidePriceCol);
    const chkBase = document.getElementById('chk-plan-hide-base');
    if (chkBase) chkBase.checked = Boolean(pd.hideBaseCol);
    const chkMM = document.getElementById('chk-plan-hide-minmax');
    if (chkMM) chkMM.checked = Boolean(pd.hideMinMaxCols);
    const chkActual = document.getElementById('chk-plan-hide-actual');
    if (chkActual) chkActual.checked = Boolean(pd.hideActualCol);
    const chkComp = document.getElementById('chk-plan-hide-compare');
    if (chkComp) chkComp.checked = Boolean(pd.hideCompareCols);
    const chkShort = document.getElementById('chk-plan-shortage-only');
    if (chkShort) chkShort.checked = Boolean(pd.shortageOnly);
    const chkStockAmt = document.getElementById('chk-plan-stock-amount');
    if (chkStockAmt) chkStockAmt.checked = Boolean(pd.showStockAmount);
    const unitBtn = document.getElementById('btn-plan-amount-unit');
    if (unitBtn) {
      unitBtn.style.display = pd.showStockAmount ? 'inline-flex' : 'none';
      unitBtn.textContent = `[단위 : ${pd.stockAmountUnit || '만원'}]`;
    }
    const chkAutoG = document.getElementById('chk-plan-auto-green');
    if (chkAutoG) chkAutoG.checked = Boolean(pd.autoGreenOnMove);

    document.querySelectorAll('#plan-legend-filters .plan-legend-chip').forEach(ch => {
      ch.classList.toggle('active', ch.dataset.color === (pd.colorFilter || 'ALL'));
    });

    // 품목그룹 보기 ON/OFF, 표시/숨김, 그룹별 색상 및 순서 변경 체크리스트 동기화
    const igModeChk = document.getElementById('chk-plan-group-view-mode');
    const igExpandActions = document.getElementById('plan-ig-expand-actions');
    const igListEl = document.getElementById('plan-item-group-checklist');
    const igBtn = document.getElementById('btn-plan-item-groups');
    const isGroupView = Boolean(pd.groupViewMode);
    const hiddenSet = new Set(pd.hiddenItemGroups || []);
    if (igModeChk) igModeChk.checked = isGroupView;
    if (igExpandActions) igExpandActions.style.display = isGroupView ? 'flex' : 'none';

    const { orderedGroups, groupCounts } = getOrderedPlanItemGroups();
    if (igListEl) {
      if (orderedGroups.length === 0) {
        igListEl.innerHTML = `<div style="padding: 8px; font-size: 11.5px; color: #94a3b8; text-align:center;">품목정보에 등록된 품목그룹이 없습니다.</div>`;
      } else {
        igListEl.innerHTML = orderedGroups.map((g, gIdx) => {
          const isVisible = !hiddenSet.has(g);
          const cnt = groupCounts.get(g);
          const escG = escapeHtmlPlan(g);
          const colorHex = getPlanItemGroupColorHex(g, gIdx);
          return `
            <div class="plan-ig-row" draggable="true" data-group="${escG}">
              <label class="plan-ig-left">
                <span class="plan-ig-handle" title="드래그하여 순서 변경">⋮⋮</span>
                <input type="checkbox" class="chk-plan-item-group" value="${escG}" ${isVisible ? 'checked' : ''} title="체크 시 표시 / 해제 시 숨김">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;${isVisible ? '' : ' opacity:0.45; text-decoration:line-through;'}">${escG} <small style="color:#94a3b8;">(${cnt})</small></span>
              </label>
              <input type="color" class="plan-ig-color-input" data-group="${escG}" value="${colorHex}" title="그룹 색상 지정 (그룹상태일 때만 표시)">
            </div>`;
        }).join('');
      }
    }
    if (igBtn) {
      const hiddenCnt = orderedGroups.filter(g => hiddenSet.has(g)).length;
      if (isGroupView && hiddenCnt > 0) {
        igBtn.textContent = `품목그룹 (그룹 · ${hiddenCnt}숨김) ▾`;
      } else if (isGroupView) {
        igBtn.textContent = `품목그룹 (그룹ON) ▾`;
      } else if (hiddenCnt > 0) {
        igBtn.textContent = `품목그룹 (${hiddenCnt}숨김) ▾`;
      } else {
        igBtn.textContent = '품목그룹 ▾';
      }
      const isActive = isGroupView || hiddenCnt > 0;
      igBtn.classList.toggle('btn-primary', isActive);
      igBtn.classList.toggle('btn-outline', !isActive);
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
      if (r.isGroupRow && r.isExpanded) return;
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
    const unregBtn = document.getElementById('btn-plan-cert-unregistered');
    if (unregBtn) {
      unregBtn.classList.toggle('active', Boolean(pd.unregisteredOnly));
    }

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
      const lastCls = col.isLastFixed ? ' plan-fixed-last' : '';
      headRow1 += `<th rowspan="2" class="${col.cls} plan-fixed-col${lastCls}" style="left:${col.left}px;">${col.label}</th>`;
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
      if (col && col.key) {
        let alertCnt = 0;
        rows.forEach(r => {
          if (r.isGroupRow) return;
          const c = r.colors && r.colors[col.key];
          if (c && (!pd.colorFilter || pd.colorFilter === 'ALL' || c === pd.colorFilter)) {
            alertCnt++;
          }
        });
        if (alertCnt > 0) {
          const colTitle = (col.weekId ? `${col.weekId} ` : (col.month ? `${col.month}월 ` : '')) + col.label;
          alertHtml = ` <span class="plan-week-alert-badge" data-col-key="${escapeHtmlPlan(col.key)}" data-col-label="${escapeHtmlPlan(colTitle)}" data-alert-count="${alertCnt}" title="상태 표시 ${alertCnt}건 (클릭 시 해당 열 색상 일괄 해제)">!</span>`;
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

    const unitDivisor = pd.stockAmountUnit === '천만원' ? 10000000 : (pd.stockAmountUnit === '백만원' ? 1000000 : 10000);
    const certStatusMap = {};
    const getCertStageRank = (st) => {
      if (st === '일정완료') return 3;
      if (st === '검정신청' || st === '품검요청') return 2;
      return 1; // 등록완료 / 부적합 등
    };
    (state.certSavedRows || []).forEach(r => {
      const code = String(r.code || '').trim();
      const wId = String(r.sourceWeekId || '').trim();
      if (!code || !wId) return;
      const rYear = String(r.sourceYear || (r.weekDate && /^\d{4}/.test(r.weekDate) ? r.weekDate.slice(0, 4) : '')).trim();
      if (pd.year && rYear && rYear !== String(pd.year)) return;
      const key = `${code}__${wId}`;
      const qty = parseSafeInt(r.qty);
      const st = r.status || '등록완료';
      const rank = getCertStageRank(st);
      if (!certStatusMap[key]) {
        certStatusMap[key] = { totalQty: 0, doneQty: 0, minRank: rank, statusQty: {} };
      }
      const entry = certStatusMap[key];
      entry.totalQty += qty;
      if (st === '일정완료') entry.doneQty += qty;
      if (rank < entry.minRank) entry.minRank = rank;
      entry.statusQty[st] = (entry.statusQty[st] || 0) + qty;
    });
    const { orderedGroups } = pd.groupViewMode ? getOrderedPlanItemGroups() : { orderedGroups: [] };
    const groupIdxMap = new Map(orderedGroups.map((g, i) => [g, i]));
    let bodyHtml = '';
    rows.forEach((row, rIdx) => {
      let rowCls = '';
      if (row.isGroupRow) rowCls = ' class="plan-group-summary-row"';
      else if (row.isGroupChild) rowCls = ' class="plan-group-child-row"';

      let rowStyleAttr = '';
      if (pd.groupViewMode && (row.isGroupRow || row.isGroupChild)) {
        const gName = row.isGroupRow ? row.itemGroup : row.parentGroup;
        const gHex = getPlanItemGroupColorHex(gName, groupIdxMap.get(gName) ?? 0);
        const cssVars = buildPlanGroupColorStyleAttr(gHex);
        if (cssVars) rowStyleAttr = ` style="${cssVars}"`;
      }
      bodyHtml += `<tr data-r="${rIdx}" data-code="${escapeHtmlPlan(row.code)}"${rowCls}${rowStyleAttr}>`;
      cols.forEach((col, cIdx) => {
        const raw = col.key === 'rowNo' ? String(rIdx + 1) : getPlanCellRawValue(row, col);
        let disp = col.key === 'rowNo'
          ? String(rIdx + 1)
          : (col.isNum ? formatPlanCellDisplay(raw) : escapeHtmlPlan(raw));
        const isAmtCol = pd.showStockAmount && ['prod', 'forecast', 'actual', 'stock'].includes(col.field);
        let cellWon = 0;
        if (isAmtCol && raw !== '') {
          if (row.isGroupRow) {
            const amtKey = `${col.field}AmountWon`;
            cellWon = (col.isMonth && col.month)
              ? Number(row.months?.[`M${col.month}`]?.[amtKey] || 0)
              : Number(row.weeks?.[col.weekId]?.[amtKey] || 0);
          } else {
            cellWon = parsePlanNum(raw) * parsePlanNum(row.unitPrice);
          }
          disp = Math.round(cellWon / unitDivisor).toLocaleString('ko-KR');
        }
        const fixedCls = col.fixed ? ` plan-fixed-col${col.isLastFixed ? ' plan-fixed-last' : ''}` : '';
        const fixedStyle = col.fixed ? ` style="left:${col.left}px;"` : '';

        // 차이수량 음수/양수 색상
        let diffCls = '';
        if (col.field === 'diff' && raw !== '') {
          const dn = parsePlanNum(raw);
          if (dn < 0) diffCls = ' plan-diff-neg';
          else if (dn > 0) diffCls = ' plan-diff-pos';
        }

        // 적정재고 상태 기호(▲ / - / ▼) 및 툴팁 (배경색 없이 우측 소형 기호로 표시)
        let stockCls = '';
        let stockMark = '';
        let stockMarkCls = '';
        let titleText = col.key === 'name' ? row.name : '';
        if (col.field === 'stock' && raw !== '') {
          const sn = parsePlanNum(raw);
          const pctText = (row.maxStock !== null && row.maxStock > 0)
            ? ` · 적정 대비 ${Math.round((sn / row.maxStock) * 1000) / 10}%`
            : '';
          if (sn < 0) {
            stockCls = ' plan-stock-negative';
            stockMark = '▼';
            stockMarkCls = 'is-neg';
            titleText = `결품 (${sn.toLocaleString()})${pctText}`;
          } else if (row.minStock !== null && row.minStock > 0 && sn < row.minStock) {
            stockCls = ' plan-stock-low';
            stockMark = '▼';
            stockMarkCls = 'is-low';
            titleText = `부족 (최소 ${row.minStock.toLocaleString()} 미만)${pctText}`;
          } else if (row.maxStock !== null && row.maxStock > 0 && sn > row.maxStock) {
            stockCls = ' plan-stock-high';
            stockMark = '▲';
            stockMarkCls = 'is-high';
            titleText = `과다 (최대 ${row.maxStock.toLocaleString()} 초과)${pctText}`;
          } else if ((row.minStock !== null && row.minStock > 0) || (row.maxStock !== null && row.maxStock > 0)) {
            stockCls = ' plan-stock-ok';
            stockMark = '-';
            stockMarkCls = 'is-ok';
            titleText = `적정 (${(row.minStock || 0).toLocaleString()} ~ ${(row.maxStock || '-').toLocaleString()})${pctText}`;
          }
          if (stockMark) {
            disp = `<span class="plan-stock-cell"><span class="plan-stock-val">${disp}</span><span class="plan-stock-mark ${stockMarkCls}" aria-hidden="true">${stockMark}</span></span>`;
          }
        }

        // 생산 셀 검정 진행 상태 표시 (3단계: 회색 등록완료 · 노랑 검정신청 · 초록 생산완료)
        let certCls = '';
        if (col.weekId && col.field === 'prod' && !col.isMonth) {
          const pQty = parsePlanNum(raw);
          const stInfo = certStatusMap[`${row.code}__${col.weekId}`];
          if (pQty > 0 && stInfo && stInfo.totalQty > 0) {
            let effRank = stInfo.minRank;
            if (effRank === 3 && stInfo.doneQty < pQty) {
              effRank = 1; // 일부 수량만 등록·완료된 경우 아직 미등록 잔량이 있으므로 등록완료(회색)로 표시
            }
            const stageMeta = {
              1: { cls: ' plan-cert-reg', label: '등록완료' },
              2: { cls: ' plan-cert-apply', label: '검정신청' },
              3: { cls: ' plan-cert-done', label: '생산완료' }
            }[effRank];
            certCls = stageMeta.cls;
            const statusParts = Object.entries(stInfo.statusQty)
              .filter(([, q]) => q > 0)
              .map(([s, q]) => `${s === '일정완료' ? '생산완료' : (s === '품검요청' ? '검정신청' : s)} ${q.toLocaleString()}`);
            const detailStr = statusParts.length > 1 ? ` [${statusParts.join(' · ')}]` : '';
            titleText = `${stageMeta.label} (${stInfo.totalQty.toLocaleString()} / ${pQty.toLocaleString()})${detailStr}`;
          }
        }

        const splitParts = (col.weekId && col.field === 'prod' && !col.isMonth && !row.isGroupRow && row.splits && Array.isArray(row.splits[col.weekId]) && row.splits[col.weekId].length >= 2)
          ? row.splits[col.weekId]
          : null;
        if (splitParts) {
          const splitText = `분할 ${splitParts.map(n => parsePlanNum(n).toLocaleString('ko-KR')).join('/')}`;
          titleText = titleText ? `${splitText} · ${titleText}` : splitText;
        }
        if (isAmtCol && raw !== '') {
          const qtyNum = parsePlanNum(raw);
          const amtLabel = `수량: ${qtyNum.toLocaleString()} / 금액: ${cellWon.toLocaleString()}원`;
          titleText = titleText ? `${titleText} · ${amtLabel}` : amtLabel;
        }

        const cellColor = row.colors ? row.colors[col.key] : '';
        const colorCls = cellColor ? ` plan-cell-color-${cellColor}` : '';
        const hasMemo = row.memos && row.memos[col.key] ? ' plan-has-memo' : '';
        const hasSplit = splitParts ? ' plan-has-split' : '';
        const splitMarkHtml = splitParts
          ? `<span class="plan-split-mark" aria-hidden="true">÷${splitParts.length}</span>`
          : '';
        const titleAttr = titleText ? ` title="${escapeHtmlPlan(titleText)}"` : '';
        let cellContentHtml = `${disp}${splitMarkHtml}`;
        if (row.isGroupRow && col.key === 'name') {
          const escG = escapeHtmlPlan(row.itemGroup);
          const arrow = row.isExpanded ? '▼' : '▶';
          const toggleTitle = row.isExpanded ? '클릭하여 품목 접기' : '클릭하여 품목 펼치기';
          cellContentHtml = `<button type="button" class="plan-group-toggle-btn" data-group="${escG}" title="${toggleTitle}">${arrow}</button><span>${escapeHtmlPlan(row.itemGroup)}</span><span class="plan-group-count">(${row.memberCount}종)</span>`;
        }

        bodyHtml += `<td data-r="${rIdx}" data-c="${cIdx}" class="${col.cls}${fixedCls}${diffCls}${stockCls}${certCls}${colorCls}${hasMemo}${hasSplit}"${fixedStyle}${titleAttr}>${cellContentHtml}</td>`;
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
    tbody.querySelectorAll('tr.plan-row-selected').forEach(tr => {
      tr.classList.remove('plan-row-selected', 'plan-row-selected-top', 'plan-row-selected-bottom');
    });
    tbody.querySelectorAll('td.plan-cell-selected, td.plan-cell-active, td.plan-range-top, td.plan-range-bottom, td.plan-range-left, td.plan-range-right').forEach(td => {
      td.classList.remove('plan-cell-selected', 'plan-cell-active', 'plan-range-top', 'plan-range-bottom', 'plan-range-left', 'plan-range-right');
    });

    const extra = planGridState.extraCells instanceof Set ? planGridState.extraCells : new Set();
    const range = getPlanSelectedRange();
    const infoEl = document.getElementById('plan-selection-info');
    if (!range && extra.size === 0) {
      if (infoEl) infoEl.textContent = '선택: -';
      hidePlanMemoPopover();
      return;
    }

    const isFullRowSelection = Boolean(
      extra.size === 0 &&
      range &&
      planGridState.columns.length > 0 &&
      range.c1 === 0 &&
      range.c2 === planGridState.columns.length - 1
    );

    const selectedCoords = [];
    if (extra.size > 0) {
      extra.forEach(key => {
        const [rs, cs] = key.split(',');
        const r = Number(rs), c = Number(cs);
        const td = tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (td) td.classList.add('plan-cell-selected', 'plan-range-top', 'plan-range-bottom', 'plan-range-left', 'plan-range-right');
        selectedCoords.push({ r, c });
      });
    } else if (range) {
      for (let r = range.r1; r <= range.r2; r++) {
        const tr = tbody.querySelector(`tr[data-r="${r}"]`);
        if (!tr) continue;
        if (isFullRowSelection) {
          tr.classList.add('plan-row-selected');
        }
        for (let c = range.c1; c <= range.c2; c++) {
          const td = tr.querySelector(`td[data-c="${c}"]`);
          if (td) {
            td.classList.add('plan-cell-selected');
            if (r === range.r1) td.classList.add('plan-range-top');
            if (r === range.r2) td.classList.add('plan-range-bottom');
            if (c === range.c1) td.classList.add('plan-range-left');
            if (c === range.c2) td.classList.add('plan-range-right');
          }
          selectedCoords.push({ r, c });
        }
      }
    }

    const active = planGridState.anchor;
    if (active) {
      const activeTd = tbody.querySelector(`td[data-r="${active.r}"][data-c="${active.c}"]`);
      if (activeTd) activeTd.classList.add('plan-cell-active');
    }

    if (infoEl) {
      let sum = 0;
      let numCount = 0;
      selectedCoords.forEach(({ r, c }) => {
        const rowMeta = planGridState.rows[r];
        const colMeta = planGridState.columns[c];
        if (!rowMeta || !colMeta) return;
        const raw = getPlanCellRawValue(rowMeta, colMeta);
        if (raw !== '' && raw !== null && raw !== undefined) {
          const s = String(raw).replace(/,/g, '').trim();
          if (/^[+-]?\d+(\.\d+)?$/.test(s)) {
            const n = Number(s);
            if (Number.isFinite(n)) {
              sum += n;
              numCount++;
            }
          }
        }
      });

      if (extra.size > 1) {
        infoEl.textContent = numCount > 0
          ? `선택: ${extra.size}셀 · 합계: ${formatNumberDisplay(sum)}`
          : `선택: ${extra.size}셀`;
      } else if (range && (range.r2 > range.r1 || range.c2 > range.c1)) {
        const rCount = range.r2 - range.r1 + 1;
        const cCount = range.c2 - range.c1 + 1;
        infoEl.textContent = numCount > 0
          ? `범위: ${rCount}행 × ${cCount}열 · 합계: ${formatNumberDisplay(sum)}`
          : `범위: ${rCount}행 × ${cCount}열`;
      } else if (active) {
        const colMeta = planGridState.columns[active.c];
        const rowMeta = planGridState.rows[active.r];
        const label = rowMeta && colMeta ? `${rowMeta.name || rowMeta.code} · ${colMeta.label.replace(/<[^>]*>/g, ' ')}` : '';
        infoEl.textContent = `선택: ${label}`;
      }
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
    if (col.weekId && col.field === 'prod' && !col.isMonth) {
      const lock = getPlanWeekCertLockInfo(row.code, col.weekId, state.planData?.year);
      if (lock.hasDone) {
        showToast('생산완료(일정완료)된 셀은 수량을 수정할 수 없습니다.');
        return;
      }
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
        planGridState.extraCells?.clear();
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
        const res = trySetPlanCellValueWithCertGuard(row.code, col, newVal);
        if (!res.ok) {
          planUndoStack.pop();
          updatePlanUndoButton();
          if (res.reason) alert(res.reason);
        } else {
          saveLocalPlanData();
          markAsDirty(true);
          if (res.autoSplitInfo) showToast(res.autoSplitInfo);
        }
      }
    }

    renderPlanModule();
  }

  function clearPlanSelectedCells() {
    const range = getPlanSelectedRange();
    if (!range) return;
    pushPlanUndoSnapshot();
    let changed = false;
    let blockedReason = '';
    for (let r = range.r1; r <= range.r2; r++) {
      const row = planGridState.rows[r];
      if (!row || row.isGroupRow) continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const col = planGridState.columns[c];
        if (col && col.editable) {
          const res = trySetPlanCellValueWithCertGuard(row.code, col, '');
          if (res.ok) {
            changed = true;
          } else if (res.reason && !blockedReason) {
            blockedReason = res.reason;
          }
        }
      }
    }
    if (blockedReason) alert(blockedReason);
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
    let blockedReason = '';
    const isSingleSource = matrix.length === 1 && matrix[0].length === 1;
    const isMultiTarget = range.r2 > range.r1 || range.c2 > range.c1;

    if (isSingleSource && isMultiTarget) {
      const val = matrix[0][0];
      for (let r = range.r1; r <= range.r2; r++) {
        const row = planGridState.rows[r];
        if (!row || row.isGroupRow) continue;
        for (let c = range.c1; c <= range.c2; c++) {
          const col = planGridState.columns[c];
          if (col && col.editable) {
            const res = trySetPlanCellValueWithCertGuard(row.code, col, val);
            if (res.ok) changed = true;
            else if (res.reason && !blockedReason) blockedReason = res.reason;
          }
        }
      }
    } else {
      for (let dr = 0; dr < matrix.length; dr++) {
        const tr = range.r1 + dr;
        const row = planGridState.rows[tr];
        if (!row) break;
        if (row.isGroupRow) continue;
        const lineCols = matrix[dr];
        for (let dc = 0; dc < lineCols.length; dc++) {
          const tc = range.c1 + dc;
          const col = planGridState.columns[tc];
          if (!col) break;
          if (col.editable) {
            const res = trySetPlanCellValueWithCertGuard(row.code, col, lineCols[dc]);
            if (res.ok) changed = true;
            else if (res.reason && !blockedReason) blockedReason = res.reason;
          }
        }
      }
      const endR = Math.min(planGridState.rows.length - 1, range.r1 + matrix.length - 1);
      const maxCols = Math.max(...matrix.map(m => m.length));
      const endC = Math.min(planGridState.columns.length - 1, range.c1 + maxCols - 1);
      planGridState.anchor = { r: range.r1, c: range.c1 };
      planGridState.focus = { r: endR, c: endC };
    }
    if (blockedReason) alert(blockedReason);

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
  async function handlePlanForecastUpload(file, options = {}) {
    if (!file || !window.XLSXEngine) return null;
    try {
      const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
      const rows = parsed?.data || [];
      if (!rows || rows.length < 5) {
        showToast('예정물량 파일에서 데이터를 찾을 수 없습니다.');
        return null;
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
        return null;
      }

      pushPlanUndoSnapshot();
      const pd = state.planData || getDefaultPlanData();
      state.planData = pd;
      const yMatch = file.name.match(/(?:(20\d{2})|(\d{2}))[\s_-]*예정/) || file.name.match(/(20\d{2})/);
      const targetYear = yMatch ? (yMatch[1] ? yMatch[1] : ('20' + yMatch[2])) : (pd.year || '2026');
      switchPlanYear(pd, targetYear);

      const masterMap = new Map((state.certMasterItems || []).map(it => [String(it.code || '').trim(), it]));
      const diffItems = [];
      const unknownCodes = new Set();
      let updatedCount = 0;

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const code = String(rows[r][codeIdx] || '').trim();
        if (!code) continue;
        if (!masterMap.has(code)) unknownCodes.add(code);
        if (!pd.rowsByCode[code]) pd.rowsByCode[code] = { weeks: {}, colors: {}, memos: {} };
        if (!pd.rowsByCode[code].weeks) pd.rowsByCode[code].weeks = {};
        if (!pd.rowsByCode[code].colors) pd.rowsByCode[code].colors = {};

        weekIds.forEach(wId => {
          const { planIdx, adjIdx } = weekColsMap[wId];
          const pVal = planIdx !== undefined ? parsePlanNum(rows[r][planIdx]) : 0;
          const aVal = adjIdx !== undefined ? parsePlanNum(rows[r][adjIdx]) : 0;
          const newVal = pVal + aVal;
          if (!pd.rowsByCode[code].weeks[wId]) pd.rowsByCode[code].weeks[wId] = {};
          const oldVal = parsePlanNum(pd.rowsByCode[code].weeks[wId].forecast);
          pd.rowsByCode[code].weeks[wId].forecast = String(newVal);

          if (oldVal !== newVal) {
            const delta = newVal - oldVal;
            const mItem = masterMap.get(code);
            diffItems.push({
              code,
              name: mItem ? getDisplayItemName(mItem) : code,
              weekId: wId,
              oldVal,
              newVal,
              delta,
              isUnregistered: !mItem
            });
            if (options.autoColor) {
              pd.rowsByCode[code].colors[`${wId}:forecast`] = delta > 0 ? 'yellow' : 'pink';
            }
          }
        });
        updatedCount++;
      }

      saveLocalPlanData();
      await savePlanToDb(true);
      renderPlanModule();

      // 반영 후 각 변동 셀의 예상재고 / 부족 여부 계산
      const computedMap = new Map((planGridState.rows || []).map(row => [row.code, row]));
      diffItems.forEach(d => {
        const rowObj = computedMap.get(d.code);
        const wData = rowObj?.weeks?.[d.weekId];
        const stockVal = wData ? parsePlanNum(wData.stock) : null;
        d.afterStock = stockVal;
        d.minStock = rowObj ? rowObj.minStock : null;
        d.isShort = stockVal !== null && (stockVal < 0 || (d.minStock !== null && d.minStock > 0 && stockVal < d.minStock));
      });

      showToast(`${targetYear}년 예정물량 업로드 및 저장 완료 (${updatedCount}개 품목, 변동 ${diffItems.length}건)`);
      if (!options.suppressDiffModal && diffItems.length > 0 && typeof window._openPlanForecastDiffModal === 'function') {
        window._openPlanForecastDiffModal(diffItems, targetYear, Array.from(unknownCodes));
      }
      return { targetYear, updatedCount, diffItems, unknownCodes: Array.from(unknownCodes) };
    } catch (err) {
      console.error('예정물량 업로드 오류:', err);
      showToast(err.message || '파일 파싱 중 오류가 발생했습니다.');
      return null;
    }
  }

  // 기간별재고(26W1.xls) 업로드 (5행 총출고수량->실출고, 총입고수량->입고비교)
  async function handlePlanWeeklyUpload(file, overrideWeekStr = '') {
    if (!file || !window.XLSXEngine) return;
    try {
      const pd = state.planData || getDefaultPlanData();
      state.planData = pd;

      const parseYearWeekFromStr = (str) => {
        const ym = String(str || '').match(/(?:(20\d{2})|(\d{2}))[\s_-]*W\s*(\d+)/i);
        if (ym) {
          return {
            year: ym[1] ? ym[1] : ('20' + ym[2]),
            weekId: 'W' + Number(ym[3])
          };
        }
        const wm = String(str || '').match(/W\s*(\d+)/i);
        const y4 = String(str || '').match(/(20\d{2})/);
        return {
          year: y4 ? y4[1] : (pd.year || '2026'),
          weekId: wm ? 'W' + Number(wm[1]) : ''
        };
      };

      let { year: targetYear, weekId: targetWeekId } = parseYearWeekFromStr(overrideWeekStr || file.name);
      if (!targetWeekId) {
        const ask = prompt('파일명에서 주차(예: 26W1, W1)를 찾을 수 없습니다. 적용할 연도/주차를 입력하세요 (예: 26W1):', `${String(pd.year || '2026').slice(-2)}W1`);
        if (!ask) return;
        const parsedAsk = parseYearWeekFromStr(ask.trim());
        targetYear = parsedAsk.year || targetYear;
        targetWeekId = parsedAsk.weekId || ask.trim().toUpperCase();
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
      switchPlanYear(pd, targetYear);
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
      await savePlanToDb(true);
      renderPlanModule();
      showToast(`${targetYear}년 ${targetWeekId} 기간별재고 반영 및 저장 완료 (${updatedCount}개 품목)`);
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

  function getPlanWeekDraftRegisteredCertRows(code, weekId, yearStr) {
    const cleanCode = String(code || '').trim();
    const cleanWeek = String(weekId || '').trim();
    const targetYear = String(yearStr || state.planData?.year || '').trim();
    if (!cleanCode || !cleanWeek) return [];
    const targetWeekDate = targetYear ? getPlanWeekFridayDates(targetYear, cleanWeek).weekDate : '';
    return (state.certSavedRows || []).filter(r => {
      if (String(r.code || '').trim() !== cleanCode) return false;
      const rWeek = String(r.sourceWeekId || '').trim();
      if (rWeek) {
        if (rWeek !== cleanWeek) return false;
      } else if (!targetWeekDate || String(r.weekDate || '').trim() !== targetWeekDate) {
        return false;
      }
      const rYear = String(r.sourceYear || (r.weekDate && /^\d{4}/.test(r.weekDate) ? r.weekDate.slice(0, 4) : '')).trim();
      if (targetYear && rYear && rYear !== targetYear) return false;
      const st = String(r.status || '등록완료').trim();
      return st === '등록완료';
    });
  }

  function syncCertRegisteredRowsSplit(code, weekId, yearStr, parts) {
    if (!Array.isArray(parts) || parts.length < 2) return 0;
    const lock = getPlanWeekCertLockInfo(code, weekId, yearStr);
    if (lock.hasDone || lock.hasApplied) return 0;

    const regRows = getPlanWeekDraftRegisteredCertRows(code, weekId, yearStr);
    if (regRows.length === 0) return 0;

    const regSum = regRows.reduce((acc, r) => acc + parseSafeInt(r.qty), 0);
    const partsSum = parts.reduce((acc, p) => acc + parseSafeInt(p), 0);
    if (regSum !== partsSum) return 0;

    const sorted = [...regRows].sort((a, b) => {
      const fA = parseSafeInt(a.from), fB = parseSafeInt(b.from);
      if (fA > 0 && fB > 0 && fA !== fB) return fA - fB;
      return String(a.lotNo || '').localeCompare(String(b.lotNo || ''));
    });

    const baseRow = sorted[0];
    const removeIds = new Set(sorted.map(r => r.id));
    const firstIdx = (state.certSavedRows || []).findIndex(r => removeIds.has(r.id));
    if (firstIdx === -1) return 0;

    const groupKey = getCertLotGroupKey(baseRow.formatNo, baseRow.code);
    const yyDefault = String(yearStr || new Date().getFullYear()).slice(-2);
    const baseLotM = String(baseRow.lotNo || '').trim().match(/^(\d{2})-(\d+)$/);
    const yy = baseLotM ? baseLotM[1] : yyDefault;

    let maxLotNum = 0;
    (state.certSavedRows || []).forEach(r => {
      if (removeIds.has(r.id)) return;
      if (getCertLotGroupKey(r.formatNo, r.code) !== groupKey) return;
      const m = String(r.lotNo || '').trim().match(/^(\d{2})-(\d+)$/);
      if (m && m[1] === yy) {
        const n = parseInt(m[2], 10);
        if (n > maxLotNum) maxLotNum = n;
      }
    });

    let runningFrom = parseSafeInt(baseRow.from);
    let nextLotNum = baseLotM ? Math.max(parseInt(baseLotM[2], 10), maxLotNum) : maxLotNum;

    const newRows = parts.map((pQty, idx) => {
      const q = parseSafeInt(pQty);
      const clone = { ...baseRow };
      if (idx === 0) {
        clone.id = baseRow.id;
        if (baseLotM) {
          clone.lotNo = baseRow.lotNo;
        }
      } else {
        clone.id = `cert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${idx}`;
        if (baseLotM) {
          nextLotNum += 1;
          clone.lotNo = `${yy}-${String(nextLotNum).padStart(3, '0')}`;
        } else {
          clone.lotNo = '';
        }
      }
      clone.qty = q;
      if (runningFrom > 0) {
        clone.from = runningFrom;
        clone.to = runningFrom + q - 1;
        runningFrom += q;
      } else {
        clone.from = '';
        clone.to = '';
      }
      clone.passNo = '';
      updateDraftRowCalculations(clone);
      return clone;
    });

    const keptBefore = [];
    const keptAfter = [];
    (state.certSavedRows || []).forEach((r, idx) => {
      if (removeIds.has(r.id)) return;
      if (idx < firstIdx) keptBefore.push(r);
      else keptAfter.push(r);
    });
    state.certSavedRows = [...keptBefore, ...newRows, ...keptAfter];

    saveLocalCertData();
    if (typeof saveCertDataToDb === 'function') saveCertDataToDb(true);
    if (typeof renderCertSavedTable === 'function') renderCertSavedTable();
    return newRows.length;
  }

  // 우클릭 5색 팔레트 제어
  function openPlanContextPalette(x, y) {
    const pal = document.getElementById('plan-context-palette');
    if (!pal) return;

    const anchor = planGridState.anchor;
    const row = anchor ? planGridState.rows[anchor.r] : null;
    const col = anchor ? planGridState.columns[anchor.c] : null;
    const isProdCell = Boolean(row && !row.isGroupRow && col && col.weekId && col.field === 'prod' && !col.isMonth && col.editable);
    const prodQty = isProdCell ? parsePlanNum(getPlanCellRawValue(row, col)) : 0;
    const hasSplit = Boolean(isProdCell && row.splits && Array.isArray(row.splits[col.weekId]) && row.splits[col.weekId].length >= 2);
    const hasMultiRegCert = Boolean(isProdCell && getPlanWeekDraftRegisteredCertRows(row.code, col.weekId, state.planData?.year).length >= 2);

    const splitBtn = document.getElementById('btn-plan-ctx-split');
    const mergeBtn = document.getElementById('btn-plan-ctx-merge');
    if (splitBtn) splitBtn.disabled = !(isProdCell && prodQty >= 2);
    if (mergeBtn) mergeBtn.disabled = !(hasSplit || hasMultiRegCert);

    let left = x + 12; // 마우스 포인터 오른쪽에서 등장
    let top = y - 10;
    if (left + 205 > window.innerWidth) left = Math.max(10, x - 205);
    if (top + 320 > window.innerHeight) top = Math.max(10, window.innerHeight - 330);

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
      if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return;
      const [sy, sm, sd] = val.split('-').map(Number);
      // 시작일은 무조건 W1의 월요일 -> W1 금요일(+4일) 기준으로 연도와 시작 월을 결정
      const w1Fri = new Date(sy, sm - 1, sd + 4);
      const newYear = String(w1Fri.getFullYear());
      const newMonth = w1Fri.getMonth() + 1;
      if (newYear !== state.planData.year) {
        switchPlanYear(state.planData, newYear);
      }
      state.planData.startDate = val;
      state.planData.weeks = generateYearWeeks(newYear, val);
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
    document.querySelectorAll('.plan-seg-btn[data-view]').forEach(btn => {
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

    // 품목그룹 보기 ON/OFF, 표시/숨김 체크박스, 그룹 색상, 전체 펼침/접기
    const commitPlanItemGroupChange = () => {
      planGridState.anchor = null;
      planGridState.focus = null;
      saveLocalPlanData();
      savePlanToDb(true);
      renderPlanModule();
    };

    document.getElementById('chk-plan-group-view-mode')?.addEventListener('change', (e) => {
      if (!state.planData) loadLocalPlanData();
      state.planData.groupViewMode = Boolean(e.target.checked);
      commitPlanItemGroupChange();
    });

    document.getElementById('btn-plan-ig-expand-all')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      const { orderedGroups } = getOrderedPlanItemGroups();
      state.planData.expandedItemGroups = [...orderedGroups];
      commitPlanItemGroupChange();
    });

    document.getElementById('btn-plan-ig-collapse-all')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      state.planData.expandedItemGroups = [];
      commitPlanItemGroupChange();
    });

    document.getElementById('plan-item-group-checklist')?.addEventListener('change', (e) => {
      const chk = e.target.closest('.chk-plan-item-group');
      if (chk) {
        const gName = chk.value;
        const hidden = new Set(state.planData.hiddenItemGroups || []);
        if (chk.checked) hidden.delete(gName);
        else hidden.add(gName);
        state.planData.hiddenItemGroups = Array.from(hidden);
        commitPlanItemGroupChange();
        return;
      }
      const colorInput = e.target.closest('.plan-ig-color-input');
      if (colorInput) {
        const gName = colorInput.dataset.group;
        if (gName) {
          if (!state.planData.itemGroupColors || typeof state.planData.itemGroupColors !== 'object') {
            state.planData.itemGroupColors = {};
          }
          state.planData.itemGroupColors[gName] = colorInput.value;
          commitPlanItemGroupChange();
        }
      }
    });

    document.getElementById('plan-item-group-checklist')?.addEventListener('click', (e) => {
      if (e.target.closest('.plan-ig-color-input')) {
        e.stopPropagation();
      }
    });

    document.getElementById('btn-plan-ig-show-all')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      state.planData.hiddenItemGroups = [];
      commitPlanItemGroupChange();
    });

    document.getElementById('btn-plan-ig-hide-all')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      const allGroups = Array.from(document.querySelectorAll('#plan-item-group-checklist .chk-plan-item-group')).map(c => c.value);
      state.planData.hiddenItemGroups = allGroups;
      commitPlanItemGroupChange();
    });

    // 품목그룹 순서 변경 (드래그 앤 드롭)
    const igChecklistEl = document.getElementById('plan-item-group-checklist');
    if (igChecklistEl) {
      const applyItemGroupOrder = (newOrder) => {
        state.planData.itemGroupOrder = newOrder;
        commitPlanItemGroupChange();
      };

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

    // 표시 옵션 체크박스 (일괄 숨김 + 개별 숨김)
    const syncMasterHideFlag = () => {
      const pd = state.planData;
      const allOn = Boolean(pd.hideFormatCol && pd.hideModelCol && pd.hidePriceCol && pd.hideBaseCol && pd.hideMinMaxCols);
      pd.hideSpecCols = allOn;
    };

    document.getElementById('chk-plan-hide-spec')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      state.planData.hideSpecCols = checked;
      state.planData.hideFormatCol = checked;
      state.planData.hideModelCol = checked;
      state.planData.hidePriceCol = checked;
      state.planData.hideBaseCol = checked;
      state.planData.hideMinMaxCols = checked;
      saveLocalPlanData();
      renderPlanModule();
    });

    [
      ['chk-plan-hide-format', 'hideFormatCol'],
      ['chk-plan-hide-model', 'hideModelCol'],
      ['chk-plan-hide-price', 'hidePriceCol'],
      ['chk-plan-hide-base', 'hideBaseCol'],
      ['chk-plan-hide-minmax', 'hideMinMaxCols']
    ].forEach(([elId, prop]) => {
      document.getElementById(elId)?.addEventListener('change', (e) => {
        state.planData[prop] = e.target.checked;
        syncMasterHideFlag();
        saveLocalPlanData();
        renderPlanModule();
      });
    });
    document.getElementById('chk-plan-hide-actual')?.addEventListener('change', (e) => {
      state.planData.hideActualCol = e.target.checked;
      planGridState.anchor = null;
      planGridState.focus = null;
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
    document.getElementById('chk-plan-stock-amount')?.addEventListener('change', (e) => {
      state.planData.showStockAmount = e.target.checked;
      saveLocalPlanData();
      renderPlanModule();
    });
    document.getElementById('btn-plan-amount-unit')?.addEventListener('click', () => {
      const order = ['만원', '백만원', '천만원'];
      const cur = state.planData.stockAmountUnit || '만원';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      state.planData.stockAmountUnit = next;
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

    // 미등록 필터 버튼 (계획 수량 > 0 이면서 검정등록 == 0 인 품목만 표시)
    document.getElementById('btn-plan-cert-unregistered')?.addEventListener('click', () => {
      if (!state.planData) loadLocalPlanData();
      state.planData.unregisteredOnly = !state.planData.unregisteredOnly;
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

    // 주차 헤더 클릭 시 이름 수정 & 느낌표(!) 배지 클릭 시 해당 열 색상 일괄 해제
    thead?.addEventListener('click', (e) => {
      const alertBadge = e.target.closest('.plan-week-alert-badge');
      if (alertBadge) {
        e.stopPropagation();
        if (!canEditPlan()) return;
        const colKey = alertBadge.dataset.colKey;
        const colLabel = alertBadge.dataset.colLabel || colKey;
        const cnt = Number(alertBadge.dataset.alertCount) || 0;
        if (!colKey) return;
        if (!confirm(`[${colLabel}] 열의 색상 표시(${cnt}건)를 일괄 해제하시겠습니까?`)) return;

        const pd = state.planData;
        if (!pd || !pd.rowsByCode) return;
        pushPlanUndoSnapshot();
        const activeFilter = pd.colorFilter || 'ALL';
        let cleared = 0;
        Object.values(pd.rowsByCode).forEach(entry => {
          if (!entry || !entry.colors || !entry.colors[colKey]) return;
          if (activeFilter === 'ALL' || entry.colors[colKey] === activeFilter) {
            delete entry.colors[colKey];
            cleared++;
          }
        });
        if (cleared > 0) {
          saveLocalPlanData();
          markAsDirty(true);
          renderPlanModule();
          showToast(`[${colLabel}] 열의 색상 표시 ${cleared}건이 해제되었습니다.`);
        } else {
          planUndoStack.pop();
          updatePlanUndoButton();
        }
        return;
      }

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

    // 기초·최소·최대재고 업로드 공통 함수
    async function handlePlanStockLimitsUpload(file) {
      if (!file || !window.XLSXEngine) return;
      try {
        const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
        const rows = parsed?.data || [];
        if (rows.length < 2) {
          showToast('업로드 파일에서 데이터를 찾을 수 없습니다.');
          return;
        }
        let hIdx = rows.findIndex((r, idx) => idx < 15 && Array.isArray(r) && r.some(c => {
          const s = String(c || '').trim();
          return s.includes('품목코드') || s === '코드' || s === '품목';
        }));
        if (hIdx < 0) hIdx = 0;
        const hdr = (rows[hIdx] || []).map(c => String(c || '').replace(/\s+/g, '').trim());
        const idxCode = hdr.findIndex(h => h.includes('품목코드') || h === '코드' || h === '품목');
        const idxBase = hdr.findIndex(h => h.includes('기초'));
        const idxMin = hdr.findIndex(h => h.includes('최소'));
        const idxMax = hdr.findIndex(h => h.includes('최대'));
        if (idxCode < 0 || (idxBase < 0 && idxMin < 0 && idxMax < 0)) {
          alert('헤더에 [품목코드] 및 [기초재고 / 최소재고 / 최대재고] 중 하나 이상이 포함되어야 합니다.');
          return;
        }

        if (!state.planData) loadLocalPlanData();
        const masterMap = new Map((state.certMasterItems || []).map(it => [String(it.code || '').trim().toLowerCase(), it]));
        let updated = 0;
        for (let i = hIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r) continue;
          const codeRaw = String(r[idxCode] ?? '').trim();
          if (!codeRaw) continue;
          const item = masterMap.get(codeRaw.toLowerCase());
          if (!item) continue;

          const cleanNum = (idx) => {
            if (idx < 0) return null;
            const v = String(r[idx] ?? '').replace(/,/g, '').trim();
            if (v === '') return '';
            const n = Number(v);
            return Number.isFinite(n) ? String(n) : '';
          };
          const bVal = cleanNum(idxBase);
          const minVal = cleanNum(idxMin);
          const maxVal = cleanNum(idxMax);

          if (bVal !== null) {
            item.baseStock = bVal;
            if (!state.planData.rowsByCode[item.code]) {
              state.planData.rowsByCode[item.code] = { weeks: {}, colors: {}, memos: {} };
            }
            state.planData.rowsByCode[item.code].baseStock = bVal;
          }
          if (minVal !== null) item.minStock = minVal;
          if (maxVal !== null) item.maxStock = maxVal;
          updated++;
        }

        if (updated > 0) {
          saveLocalCertData();
          await saveCertDataToDb(true);
          saveLocalPlanData();
          await savePlanToDb(true);
          renderPlanModule();
        }
        showToast(`기초·최소·최대재고 ${updated}건이 반영 및 저장되었습니다.`);
      } catch (err) {
        console.error('기초/최소/최대재고 업로드 오류:', err);
        alert('파일을 읽는 중 오류가 발생했습니다.');
      }
    }

    // 통합 드래그 & 드롭 엑셀 업로드 모달 + 예정물량 증감 비교 요약 모달
    const unifiedUploadModal = document.getElementById('modal-plan-unified-upload');
    const unifiedDropzone = document.getElementById('plan-unified-dropzone');
    const unifiedFileInput = document.getElementById('input-plan-unified-files');
    const unifiedListEl = document.getElementById('plan-unified-file-list');
    const unifiedApplyBtn = document.getElementById('btn-apply-plan-unified-upload');
    let unifiedQueue = []; // { id, file, type: 'forecast'|'weekly'|'stockLimits'|'unknown', weekStr }

    const detectPlanExcelFileMeta = async (file) => {
      const name = String(file?.name || '');
      const ym = name.match(/(?:(20\d{2})|(\d{2}))[\s_-]*W\s*(\d+)/i);
      const wm = name.match(/W\s*(\d+)/i);
      const defYy = String(state.planData?.year || '2026').slice(-2);
      const detectedWeekStr = ym
        ? `${(ym[1] || ('20' + ym[2])).slice(-2)}W${Number(ym[3])}`
        : (wm ? `${defYy}W${Number(wm[1])}` : '');

      let type = 'unknown';
      try {
        if (window.XLSXEngine) {
          const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
          const rows = (parsed?.data || []).slice(0, 15);
          const hasCell = (pred) => rows.some(r => Array.isArray(r) && r.some(c => pred(String(c || '').replace(/\s+/g, '').trim())));
          if (hasCell(s => s === '예정' || s === '조정')) {
            type = 'forecast';
          } else if (hasCell(s => s === '총출고수량' || s === '총입고수량')) {
            type = 'weekly';
          } else if (hasCell(s => s.includes('품목코드') || s === '코드' || s === '품목') && hasCell(s => s.includes('기초') || s.includes('최소') || s.includes('최대'))) {
            type = 'stockLimits';
          }
        }
      } catch (e) { /* ignore */ }

      if (type === 'unknown') {
        if (name.includes('예정')) type = 'forecast';
        else if (detectedWeekStr) type = 'weekly';
        else if (name.includes('재고') || name.includes('기초')) type = 'stockLimits';
      }
      return { type, weekStr: detectedWeekStr };
    };

    const renderUnifiedUploadQueue = () => {
      if (!unifiedListEl) return;
      if (unifiedQueue.length === 0) {
        unifiedListEl.innerHTML = '<div style="text-align:center; padding:12px; font-size:12px; color:var(--text-muted);">첨부된 파일이 없습니다.</div>';
        if (unifiedApplyBtn) unifiedApplyBtn.disabled = true;
        return;
      }
      if (unifiedApplyBtn) unifiedApplyBtn.disabled = !unifiedQueue.some(q => q.type !== 'unknown');

      unifiedListEl.innerHTML = unifiedQueue.map(q => `
        <div class="plan-upload-file-row" data-qid="${q.id}">
          <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; display:flex; align-items:center; gap:6px;" title="${escapeHtmlPlan(q.file.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; color:var(--text-muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtmlPlan(q.file.name)}</span>
          </div>
          <select class="form-input form-input-sm plan-unified-type-sel" data-qid="${q.id}" style="width:140px;">
            <option value="forecast"${q.type === 'forecast' ? ' selected' : ''}>예정물량</option>
            <option value="weekly"${q.type === 'weekly' ? ' selected' : ''}>기간별재고</option>
            <option value="stockLimits"${q.type === 'stockLimits' ? ' selected' : ''}>기초·최소·최대재고</option>
            <option value="unknown"${q.type === 'unknown' ? ' selected' : ''}>종류 미인식</option>
          </select>
          ${q.type === 'weekly' ? `<input type="text" class="form-input form-input-sm plan-unified-week-inp" data-qid="${q.id}" value="${escapeHtmlPlan(q.weekStr)}" placeholder="예: 26W46" style="width:78px; text-align:center;" title="적용할 연도/주차">` : ''}
          <button type="button" class="btn btn-xs btn-ghost text-danger plan-unified-del-btn" data-qid="${q.id}" title="목록에서 제거">×</button>
        </div>
      `).join('');
    };

    const addFilesToUnifiedQueue = async (fileList) => {
      const files = Array.from(fileList || []).filter(f => /\.(xlsx|xls|csv|tsv)$/i.test(f.name));
      if (files.length === 0) {
        showToast('엑셀(.xls, .xlsx, .csv) 파일만 업로드할 수 있습니다.');
        return;
      }
      for (const f of files) {
        const meta = await detectPlanExcelFileMeta(f);
        unifiedQueue.push({
          id: `uq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          file: f,
          type: meta.type,
          weekStr: meta.weekStr
        });
      }
      renderUnifiedUploadQueue();
    };

    const closeUnifiedUploadModal = () => {
      if (unifiedUploadModal) unifiedUploadModal.style.display = 'none';
      unifiedQueue = [];
      renderUnifiedUploadQueue();
    };

    document.getElementById('btn-plan-upload-unified')?.addEventListener('click', () => {
      document.getElementById('plan-io-dropdown-wrap')?.classList.remove('is-open');
      unifiedQueue = [];
      renderUnifiedUploadQueue();
      if (unifiedUploadModal) unifiedUploadModal.style.display = 'flex';
    });
    document.getElementById('btn-close-plan-unified-upload')?.addEventListener('click', closeUnifiedUploadModal);
    document.getElementById('btn-cancel-plan-unified-upload')?.addEventListener('click', closeUnifiedUploadModal);

    unifiedDropzone?.addEventListener('click', () => unifiedFileInput?.click());
    unifiedFileInput?.addEventListener('change', async (e) => {
      if (e.target.files?.length) await addFilesToUnifiedQueue(e.target.files);
      e.target.value = '';
    });
    unifiedDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      unifiedDropzone.classList.add('is-dragover');
    });
    unifiedDropzone?.addEventListener('dragleave', () => {
      unifiedDropzone.classList.remove('is-dragover');
    });
    unifiedDropzone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      unifiedDropzone.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.length) await addFilesToUnifiedQueue(e.dataTransfer.files);
    });

    unifiedListEl?.addEventListener('change', (e) => {
      const sel = e.target.closest('.plan-unified-type-sel');
      if (sel) {
        const q = unifiedQueue.find(x => x.id === sel.dataset.qid);
        if (q) {
          q.type = sel.value;
          renderUnifiedUploadQueue();
        }
        return;
      }
      const inp = e.target.closest('.plan-unified-week-inp');
      if (inp) {
        const q = unifiedQueue.find(x => x.id === inp.dataset.qid);
        if (q) q.weekStr = inp.value.trim();
      }
    });
    unifiedListEl?.addEventListener('click', (e) => {
      const del = e.target.closest('.plan-unified-del-btn');
      if (!del) return;
      unifiedQueue = unifiedQueue.filter(x => x.id !== del.dataset.qid);
      renderUnifiedUploadQueue();
    });

    unifiedApplyBtn?.addEventListener('click', async () => {
      const valid = unifiedQueue.filter(q => q.type !== 'unknown');
      if (valid.length === 0) return;

      const autoColor = !!document.getElementById('chk-plan-forecast-autocolor')?.checked;
      const stockFiles = valid.filter(q => q.type === 'stockLimits');
      const weeklyFiles = valid.filter(q => q.type === 'weekly');
      const forecastFiles = valid.filter(q => q.type === 'forecast');

      unifiedApplyBtn.disabled = true;
      unifiedApplyBtn.textContent = '반영 중...';
      let lastForecastRes = null;
      try {
        for (const q of stockFiles) await handlePlanStockLimitsUpload(q.file);
        for (const q of weeklyFiles) await handlePlanWeeklyUpload(q.file, q.weekStr);
        for (const q of forecastFiles) {
          lastForecastRes = await handlePlanForecastUpload(q.file, { autoColor, suppressDiffModal: true });
        }
        closeUnifiedUploadModal();
        if (lastForecastRes && lastForecastRes.diffItems.length > 0 && typeof window._openPlanForecastDiffModal === 'function') {
          window._openPlanForecastDiffModal(lastForecastRes.diffItems, lastForecastRes.targetYear, lastForecastRes.unknownCodes);
        }
      } finally {
        unifiedApplyBtn.disabled = false;
        unifiedApplyBtn.textContent = '일괄 반영하기';
      }
    });

    // 예정물량 증감 비교 요약 모달
    const diffModal = document.getElementById('modal-plan-forecast-diff');
    let curForecastDiffItems = [];
    let curForecastDiffFilter = 'ALL';

    const renderForecastDiffTable = () => {
      const tbodyDiff = document.getElementById('plan-forecast-diff-tbody');
      if (!tbodyDiff) return;
      const list = curForecastDiffItems.filter(d => {
        if (curForecastDiffFilter === 'UP') return d.delta > 0;
        if (curForecastDiffFilter === 'DOWN') return d.delta < 0;
        if (curForecastDiffFilter === 'SHORT') return d.isShort;
        return true;
      });
      if (list.length === 0) {
        tbodyDiff.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">해당 조건에 맞는 변동 내역이 없습니다.</td></tr>';
        return;
      }
      tbodyDiff.innerHTML = list.map(d => {
        const deltaColor = d.delta > 0 ? '#d97706' : '#2563eb';
        const deltaSign = d.delta > 0 ? `+${d.delta.toLocaleString()}` : d.delta.toLocaleString();
        const stockStr = d.afterStock === null ? '-' : d.afterStock.toLocaleString();
        const stockStyle = d.afterStock !== null && d.afterStock < 0
          ? 'color:#dc2626; font-weight:700;'
          : (d.isShort ? 'color:#d97706; font-weight:700;' : '');
        return `
          <tr class="plan-forecast-diff-row" data-code="${escapeHtmlPlan(d.code)}" data-week="${escapeHtmlPlan(d.weekId)}">
            <td class="text-center"><code>${escapeHtmlPlan(d.code)}</code></td>
            <td style="font-weight:600;">${escapeHtmlPlan(d.name)}${d.isUnregistered ? ' <span style="font-size:10px; color:#dc2626;">(미등록)</span>' : ''}</td>
            <td class="text-center">${escapeHtmlPlan(d.weekId)}</td>
            <td class="text-center">${d.oldVal.toLocaleString()} → <b>${d.newVal.toLocaleString()}</b></td>
            <td class="text-right" style="color:${deltaColor}; font-weight:700;">${deltaSign}</td>
            <td class="text-right" style="${stockStyle}">${stockStr}${d.isShort ? ' ⚠' : ''}</td>
          </tr>
        `;
      }).join('');
    };

    window._openPlanForecastDiffModal = (diffItems, targetYear, unknownCodes = []) => {
      curForecastDiffItems = diffItems || [];
      curForecastDiffFilter = 'ALL';
      document.querySelectorAll('#plan-forecast-diff-filter .plan-seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'ALL');
      });

      const titleEl = document.getElementById('plan-forecast-diff-title');
      if (titleEl) titleEl.textContent = `${targetYear}년 예정물량(출고예정) 변동 비교 요약`;

      const upItems = curForecastDiffItems.filter(d => d.delta > 0);
      const downItems = curForecastDiffItems.filter(d => d.delta < 0);
      const shortItems = curForecastDiffItems.filter(d => d.isShort);
      const upSum = upItems.reduce((s, d) => s + d.delta, 0);
      const downSum = downItems.reduce((s, d) => s + d.delta, 0);

      const sumEl = document.getElementById('plan-forecast-diff-summary');
      if (sumEl) {
        sumEl.innerHTML = `
          <span class="plan-diff-badge">변동 총 <b>${curForecastDiffItems.length}</b>건</span>
          <span class="plan-diff-badge" style="color:#b45309;">증가 <b>${upItems.length}</b>건 (+${upSum.toLocaleString()})</span>
          <span class="plan-diff-badge" style="color:#1d4ed8;">감소 <b>${downItems.length}</b>건 (${downSum.toLocaleString()})</span>
          <span class="plan-diff-badge" style="color:${shortItems.length > 0 ? '#dc2626' : 'var(--text-muted)'};">재고부족/결품 <b>${shortItems.length}</b>건</span>
          ${unknownCodes.length > 0 ? `<span class="plan-diff-badge" style="color:#dc2626;">미등록 코드 ${unknownCodes.length}종</span>` : ''}
        `;
      }
      renderForecastDiffTable();
      if (diffModal) diffModal.style.display = 'flex';
    };

    const closeForecastDiffModal = () => {
      if (diffModal) diffModal.style.display = 'none';
    };
    document.getElementById('btn-close-plan-forecast-diff')?.addEventListener('click', closeForecastDiffModal);
    document.getElementById('btn-ok-plan-forecast-diff')?.addEventListener('click', closeForecastDiffModal);

    document.querySelectorAll('#plan-forecast-diff-filter .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        curForecastDiffFilter = btn.dataset.filter || 'ALL';
        document.querySelectorAll('#plan-forecast-diff-filter .plan-seg-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        renderForecastDiffTable();
      });
    });

    document.getElementById('plan-forecast-diff-tbody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('.plan-forecast-diff-row');
      if (!tr) return;
      const code = tr.dataset.code;
      const weekId = tr.dataset.week;
      const rIdx = (planGridState.rows || []).findIndex(r => r.code === code);
      const cIdx = (planGridState.columns || []).findIndex(c => c.weekId === weekId && c.field === 'forecast' && !c.isMonth);
      closeForecastDiffModal();
      if (rIdx >= 0 && cIdx >= 0) {
        planGridState.anchor = { r: rIdx, c: cIdx };
        planGridState.focus = { r: rIdx, c: cIdx };
        applyPlanSelectionClasses();
        scrollPlanCellIntoView(rIdx, cIdx);
      } else {
        showToast(`${code} · ${weekId}는 현재 표시 기간(월) 밖에 있습니다.`);
      }
    });

    document.getElementById('btn-plan-export-xls')?.addEventListener('click', exportPlanToExcel);
    document.getElementById('btn-plan-save')?.addEventListener('click', () => savePlanToDb(false));

    function canEditPlan() {
      const u = state.currentUser;
      if (!u || u.isGuest) return false;
      if (u.permissions && typeof u.permissions.plan === 'string') {
        return u.permissions.plan === 'edit';
      }
      return u.role !== 'viewer';
    }

    // 우클릭 팔레트 & 메모 이벤트
    tbody.addEventListener('contextmenu', (e) => {
      if (!canEditPlan()) {
        closePlanContextPalette();
        return;
      }
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

    // 우클릭 -> [분할]
    document.getElementById('btn-plan-ctx-split')?.addEventListener('click', () => {
      closePlanContextPalette();
      const anchor = planGridState.anchor;
      if (!anchor) return;
      const row = planGridState.rows[anchor.r];
      const col = planGridState.columns[anchor.c];
      if (!row || row.isGroupRow || !col || !col.weekId || col.field !== 'prod' || col.isMonth || !col.editable) {
        alert('주차별 생산 수량 셀에서만 분할할 수 있습니다.');
        return;
      }
      const qty = parsePlanNum(getPlanCellRawValue(row, col));
      if (qty < 2) {
        alert('생산 수량이 2 이상인 셀만 분할할 수 있습니다.');
        return;
      }
      const existingSplits = row.splits && Array.isArray(row.splits[col.weekId]) ? row.splits[col.weekId] : null;
      if (typeof window._openPlanSplitModal === 'function') {
        window._openPlanSplitModal({
          code: row.code,
          name: row.name,
          weekId: col.weekId,
          qty,
          existingSplits
        });
      }
    });

    // 우클릭 -> [병합 (분할해제)]
    document.getElementById('btn-plan-ctx-merge')?.addEventListener('click', () => {
      closePlanContextPalette();
      const anchor = planGridState.anchor;
      if (!anchor) return;
      const row = planGridState.rows[anchor.r];
      const col = planGridState.columns[anchor.c];
      if (!row || !col || !col.weekId || col.field !== 'prod') return;

      const pdYear = String(state.planData?.year || '');
      const entry = state.planData?.rowsByCode?.[row.code];
      const hasSplit = Boolean(entry?.splits && Array.isArray(entry.splits[col.weekId]) && entry.splits[col.weekId].length >= 2);
      const regRows = getPlanWeekDraftRegisteredCertRows(row.code, col.weekId, pdYear);

      if (!hasSplit && regRows.length < 2) {
        showToast('분할된 셀이나 병합할 등록완료 로트가 없습니다.');
        return;
      }

      if (hasSplit) {
        pushPlanUndoSnapshot();
        delete entry.splits[col.weekId];
        saveLocalPlanData();
        markAsDirty(true);
      }

      let mergedCertCount = 0;
      if (regRows.length >= 2) {
        const sorted = [...regRows].sort((a, b) => {
          const fA = parseSafeInt(a.from), fB = parseSafeInt(b.from);
          if (fA > 0 && fB > 0 && fA !== fB) return fA - fB;
          return String(a.lotNo || '').localeCompare(String(b.lotNo || ''));
        });
        const keepRow = sorted[0];
        const removeIds = new Set(sorted.slice(1).map(r => r.id));
        const totalQty = sorted.reduce((acc, r) => acc + parseSafeInt(r.qty), 0);

        keepRow.qty = totalQty;
        keepRow.passNo = '';
        updateDraftRowCalculations(keepRow);

        state.certSavedRows = (state.certSavedRows || []).filter(r => !removeIds.has(r.id));
        mergedCertCount = sorted.length;
        saveLocalCertData();
        if (typeof saveCertDataToDb === 'function') saveCertDataToDb(true);
        if (typeof renderCertSavedTable === 'function') renderCertSavedTable();
      }

      if ((state.certMode || 'auto') === 'auto' && state.certSelectedWeekId) {
        const parsedSel = parseCertWeekKey(state.certSelectedWeekId, pdYear);
        if (parsedSel.weekId === col.weekId && (!pdYear || !parsedSel.year || parsedSel.year === pdYear)) {
          loadCertDraftFromPlanWeek(state.certSelectedWeekId, state.certAutoLineFilter || 'ALL');
        }
      }

      renderPlanModule();
      showToast(mergedCertCount >= 2
        ? `분할이 해제(병합)되었습니다. (검정현황 등록완료 ${mergedCertCount}건 → 1건 통합)`
        : '분할이 해제(병합)되었습니다.');
    });

    document.getElementById('btn-plan-memo-edit')?.addEventListener('click', promptMemoForActiveCell);
    document.getElementById('btn-plan-memo-close')?.addEventListener('click', hidePlanMemoPopover);

    // 마우스 선택, 범위 드래그 & ALT + 드래그 주차 이동
    tbody.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const groupToggleBtn = e.target.closest('.plan-group-toggle-btn');
      if (groupToggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        const gName = groupToggleBtn.dataset.group;
        if (gName && state.planData) {
          const exp = new Set(state.planData.expandedItemGroups || []);
          if (exp.has(gName)) exp.delete(gName);
          else exp.add(gName);
          state.planData.expandedItemGroups = Array.from(exp);
          planGridState.anchor = null;
          planGridState.focus = null;
          saveLocalPlanData();
          savePlanToDb(true);
          renderPlanModule();
        }
        return;
      }
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

      // NO 열 클릭 시 해당 행 전체 선택 (Shift/드래그로 여러 행 선택 지원)
      if (col && col.key === 'rowNo') {
        const lastColIdx = Math.max(0, planGridState.columns.length - 1);
        planGridState.extraCells.clear();
        if (e.shiftKey && planGridState.anchor) {
          planGridState.anchor = { r: planGridState.anchor.r, c: 0 };
          planGridState.focus = { r, c: lastColIdx };
        } else {
          planGridState.anchor = { r, c: 0 };
          planGridState.focus = { r, c: lastColIdx };
          planGridState.isDragging = true;
          planGridState.isRowDragging = true;
        }
        applyPlanSelectionClasses();
        scrollWrap.focus({ preventScroll: true });
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (!(planGridState.extraCells instanceof Set)) planGridState.extraCells = new Set();
        if (planGridState.extraCells.size === 0 && planGridState.anchor && planGridState.focus) {
          const prevRange = getPlanSelectedRange();
          if (prevRange) {
            for (let rr = prevRange.r1; rr <= prevRange.r2; rr++) {
              for (let cc = prevRange.c1; cc <= prevRange.c2; cc++) {
                planGridState.extraCells.add(`${rr},${cc}`);
              }
            }
          }
        }
        const key = `${r},${c}`;
        if (planGridState.extraCells.has(key) && planGridState.extraCells.size > 1) {
          planGridState.extraCells.delete(key);
        } else {
          planGridState.extraCells.add(key);
          planGridState.anchor = { r, c };
          planGridState.focus = { r, c };
        }
      } else if (e.shiftKey && planGridState.anchor) {
        planGridState.extraCells.clear();
        planGridState.focus = { r, c };
      } else {
        planGridState.extraCells.clear();
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
      if (planGridState.isRowDragging) {
        const lastColIdx = Math.max(0, planGridState.columns.length - 1);
        if (!planGridState.focus || planGridState.focus.r !== r || planGridState.focus.c !== lastColIdx) {
          planGridState.focus = { r, c: lastColIdx };
          applyPlanSelectionClasses();
        }
        return;
      }
      if (!planGridState.focus || planGridState.focus.r !== r || planGridState.focus.c !== c) {
        planGridState.focus = { r, c };
        applyPlanSelectionClasses();
      }
    });

    document.addEventListener('mouseup', (e) => {
      planGridState.isRowDragging = false;
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
              const pdYear = String(state.planData?.year || '');
              const srcLock = getPlanWeekCertLockInfo(drag.code, srcCol.weekId, pdYear);
              if (srcLock.hasDone) {
                showToast('생산완료(일정완료)된 셀은 주차를 이동할 수 없습니다.');
                return;
              }
              const targetExisting = parsePlanNum(getPlanCellRawValue(rowObj, targetCol));
              const targetLock = getPlanWeekCertLockInfo(drag.code, targetCol.weekId, pdYear);
              if (targetExisting > 0 || targetLock.lockedQty > 0 || targetLock.draftSavedQty > 0) {
                showToast('이동할 대상 주차에 이미 수량이 있어 이동할 수 없습니다.');
                return;
              }

              pushPlanUndoSnapshot();
              setPlanCellValue(drag.code, targetCol, srcVal);
              setPlanCellValue(drag.code, srcCol, '');
              // 메모도 함께 이동
              const srcMemo = rowObj.memos ? rowObj.memos[srcCol.key] : '';
              if (srcMemo) {
                setPlanCellMemo(drag.code, targetCol.key, srcMemo);
                setPlanCellMemo(drag.code, srcCol.key, '');
              }
              // 분할 정보도 함께 이동
              const entry = state.planData?.rowsByCode?.[drag.code];
              if (entry?.splits && Array.isArray(entry.splits[srcCol.weekId])) {
                entry.splits[targetCol.weekId] = [...entry.splits[srcCol.weekId]];
                delete entry.splits[srcCol.weekId];
              }
              if (state.planData?.autoGreenOnMove) {
                setPlanCellColor(drag.code, targetCol.key, 'green');
                setPlanCellColor(drag.code, srcCol.key, '');
              }

              // 검정현황 저장 건(등록완료/검정신청/품검요청)도 새 주차로 동기화
              let certMovedCount = 0;
              const newDates = getPlanWeekFridayDates(pdYear, targetCol.weekId);
              (state.certSavedRows || []).forEach(cr => {
                if (String(cr.code || '').trim() !== String(drag.code).trim()) return;
                if (String(cr.sourceWeekId || '').trim() !== String(srcCol.weekId).trim()) return;
                const crYear = String(cr.sourceYear || (cr.weekDate && /^\d{4}/.test(cr.weekDate) ? cr.weekDate.slice(0, 4) : '')).trim();
                if (pdYear && crYear && crYear !== pdYear) return;
                if (String(cr.status || '').trim() === '일정완료') return;

                cr.sourceWeekId = targetCol.weekId;
                if (pdYear) cr.sourceYear = pdYear;
                cr.weekDate = newDates.weekDate;
                cr.inspectDate = newDates.inspectDate;
                certMovedCount++;
              });
              if (certMovedCount > 0) {
                saveLocalCertData();
                if (typeof saveCertDataToDb === 'function') saveCertDataToDb(true);
              }

              planGridState.anchor = { r, c };
              planGridState.focus = { r, c };
              saveLocalPlanData();
              markAsDirty(true);
              renderPlanModule();
              showToast(certMovedCount > 0
                ? `${drag.weekId} → ${targetCol.weekId} 주차 이동 완료 (검정현황 ${certMovedCount}건 동기화)`
                : `${drag.weekId} → ${targetCol.weekId} 주차 이동 완료`);
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
        planGridState.extraCells?.clear();
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
        planGridState.extraCells?.clear();
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
        planGridState.extraCells?.clear();
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

      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Process' || e.isComposing || e.keyCode === 229)) {
        const col = planGridState.columns[planGridState.anchor.c];
        if (col && col.editable) {
          const isIme = e.key === 'Process' || e.isComposing || e.keyCode === 229 || /^[ㄱ-ㅎㅏ-ㅣ가-힣]$/.test(e.key);
          if (!isIme) {
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

  function getMondayOfWeek(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return getTodayDateString();
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay(); // 0=일, 1=월, ..., 6=토
    const diffToMon = dow === 0 ? -6 : (1 - dow);
    d.setDate(d.getDate() + diffToMon);
    return formatDateYMD(d);
  }

  function getInspV2PlanMeta(inspData, weekDate) {
    const items = (inspData && inspData.items) || {};
    const activeDateSet = new Set();
    Object.values(items).forEach(it => {
      if (!it || !it.dailyPlans) return;
      const excl = it.excludedProcs || {};
      Object.entries(it.dailyPlans).forEach(([ds, pObj]) => {
        if (!pObj || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
        const hasVal = ['assembly', 'inspect', 'pack'].some(p => !excl[p] && parseSafeInt(pObj[p]) > 0);
        if (hasVal) activeDateSet.add(ds);
      });
    });
    const sortedDates = Array.from(activeDateSet).sort();
    const hasPlan = sortedDates.length > 0;
    const earliestPlanDate = hasPlan ? sortedDates[0] : null;
    const defaultMonday = getMondayOfWeek(weekDate);
    return {
      hasPlan,
      earliestPlanDate,
      defaultMonday,
      effectiveStartDate: hasPlan ? earliestPlanDate : defaultMonday
    };
  }

  function readLocalInspectionV2Raw(weekDate) {
    if (!weekDate) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.INSP_V2_PREFIX + weekDate);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function loadLocalInspectionV2(weekDate) {
    if (!weekDate) return;
    const p = readLocalInspectionV2Raw(weekDate);
    const items = (p && p.items) || {};
    const meta = getInspV2PlanMeta({ items }, weekDate);
    state.inspV2Data = {
      startDate: meta.effectiveStartDate,
      dayCount: Number(p && p.dayCount) || 10,
      items
    };
  }

  function saveLocalInspectionV2() {
    if (!state.inspectionTargetDate || !state.inspV2Data) return;
    localStorage.setItem(STORAGE_KEYS.INSP_V2_PREFIX + state.inspectionTargetDate, JSON.stringify({
      ...state.inspV2Data,
      updatedAt: Date.now()
    }));
    if (typeof updateNavTabBadges === 'function') updateNavTabBadges();
  }

  async function loadInspectionV2FromDb(weekDate) {
    if (!weekDate) return;
    loadLocalInspectionV2(weekDate);
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_insp_v2').doc(weekDate).get();
      if (doc.exists) {
        const d = doc.data();
        const items = d.items || {};
        const meta = getInspV2PlanMeta({ items }, weekDate);
        state.inspV2Data = {
          startDate: meta.effectiveStartDate,
          dayCount: Number(d.dayCount) || 10,
          items
        };
        saveLocalInspectionV2();
      }
    } catch (e) {
      console.warn('일정계획 v2 로드 실패:', e);
    }
  }

  async function syncAllInspectionV2FromDb() {
    if (!isFirestoreActive || !db) return;
    try {
      const snap = await db.collection('pms_insp_v2').get();
      snap.forEach(doc => {
        const d = doc.data();
        const weekDate = doc.id;
        const items = d.items || {};
        const meta = getInspV2PlanMeta({ items }, weekDate);
        localStorage.setItem(STORAGE_KEYS.INSP_V2_PREFIX + weekDate, JSON.stringify({
          startDate: meta.effectiveStartDate,
          dayCount: Number(d.dayCount) || 10,
          items,
          updatedAt: Date.now()
        }));
      });
      if (state.inspectionTargetDate) {
        loadLocalInspectionV2(state.inspectionTargetDate);
      }
    } catch (e) {
      console.warn('일정계획 v2 전체 동기화 실패:', e);
    }
  }

  async function fetchDocDataWithFallback(primaryCol, primaryId, fallbackId) {
    if (!isFirestoreActive || !db) return null;
    try {
      const doc = await db.collection(primaryCol).doc(primaryId).get();
      if (doc.exists) return doc.data();
    } catch (e) { /* fallback below */ }
    try {
      const fbDoc = await db.collection('pms_metadata').doc(fallbackId).get();
      if (fbDoc.exists) return fbDoc.data();
    } catch (e) { /* ignore */ }
    return null;
  }

  async function saveInspectionV2ToDb() {
    if (isGuestReadOnly(true)) return;
    const weekDate = state.inspectionTargetDate;
    if (!weekDate) return;
    const activeLine = state.inspLineFilter || 'ALL';
    let mergedLineName = '';

    if (isFirestoreActive && db && activeLine !== 'ALL') {
      const remoteRaw = await fetchDocDataWithFallback('pms_insp_v2', weekDate, `insp_v2__${weekDate}`);
      if (remoteRaw) {
        const remoteData = normalizeInspV2(remoteRaw, weekDate);
        const remoteOtherItems = (remoteData.items || []).filter(it => (it.line || '감지기반').trim() !== activeLine);
        const localLineItems = (state.inspV2Data.items || []).filter(it => (it.line || '감지기반').trim() === activeLine);
        state.inspV2Data.items = [...remoteOtherItems, ...localLineItems];
        mergedLineName = activeLine;
      }
    }

    const meta = getInspV2PlanMeta(state.inspV2Data, weekDate);
    if (meta.hasPlan) {
      state.inspV2Data.startDate = meta.earliestPlanDate;
    }
    saveLocalInspectionV2();
    let dbSaved = false;
    if (isFirestoreActive && db) {
      const payload = {
        weekDate,
        startDate: state.inspV2Data.startDate,
        dayCount: state.inspV2Data.dayCount,
        items: state.inspV2Data.items,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await db.collection('pms_insp_v2').doc(weekDate).set(payload);
        dbSaved = true;
      } catch (err) {
        try {
          await db.collection('pms_metadata').doc(`insp_v2__${weekDate}`).set(payload);
          dbSaved = true;
        } catch (fbErr) {
          console.warn('일정계획 DB 저장 실패:', fbErr);
        }
      }
    }
    markAsDirty(false);
    const mergeLabel = mergedLineName ? ` (${mergedLineName} 병합)` : '';
    showToast(dbSaved ? `${weekDate} 일정계획이 DB에 저장되었습니다.${mergeLabel}` : `${weekDate} 일정계획이 로컬에 저장되었습니다.`);
    renderSidebarSchedulesV2();
    renderInspectionV2();
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
    if (typeof updateNavTabBadges === 'function') updateNavTabBadges();
    if (typeof renderProdMissingDropdown === 'function') renderProdMissingDropdown();
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
        return;
      }
    } catch (e) { /* fallback below */ }
    try {
      const fbDoc = await db.collection('pms_metadata').doc(`daily_v2__${dateStr}`).get();
      if (fbDoc.exists) {
        state.dailyV2Data = normalizeDailyV2(fbDoc.data());
        saveLocalDailyV2();
      }
    } catch (e) {
      console.warn('생산일보 v2 로드 실패:', e);
    }
  }

  async function saveDailyV2ToDb() {
    if (isGuestReadOnly(true)) return;
    const dateStr = state.productionDate;
    if (!dateStr) return;
    const activeLine = state.prodLineFilter || 'ALL';
    let mergedLineName = '';

    if (isFirestoreActive && db && activeLine !== 'ALL') {
      const remoteRaw = await fetchDocDataWithFallback('pms_daily_v2', dateStr, `daily_v2__${dateStr}`);
      if (remoteRaw) {
        const remoteData = normalizeDailyV2(remoteRaw);
        const mergedSupportByLine = {
          ...remoteData.supportByLine,
          [activeLine]: Array.isArray(state.dailyV2Data?.supportByLine?.[activeLine])
            ? state.dailyV2Data.supportByLine[activeLine]
            : []
        };
        const remoteOtherEntries = (remoteData.entries || []).filter(ent => (ent.line || '감지기반').trim() !== activeLine);
        const localLineEntries = (state.dailyV2Data?.entries || []).filter(ent => (ent.line || '감지기반').trim() === activeLine);
        state.dailyV2Data = {
          supportByLine: mergedSupportByLine,
          entries: [...remoteOtherEntries, ...localLineEntries]
        };
        mergedLineName = activeLine;
      }
    }

    saveLocalDailyV2();
    let dbSaved = false;
    if (isFirestoreActive && db) {
      const payload = {
        date: dateStr,
        supportByLine: state.dailyV2Data.supportByLine || {},
        entries: state.dailyV2Data.entries || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await db.collection('pms_daily_v2').doc(dateStr).set(payload);
        dbSaved = true;
      } catch (err) {
        try {
          await db.collection('pms_metadata').doc(`daily_v2__${dateStr}`).set(payload);
          dbSaved = true;
        } catch (fbErr) {
          console.warn('생산일보 DB 저장 실패:', fbErr);
        }
      }
    }
    markAsDirty(false);
    const mergeLabel = mergedLineName ? ` (${mergedLineName} 병합)` : '';
    showToast(dbSaved ? `${dateStr} 생산일보가 DB에 저장되었습니다.${mergeLabel}` : `${dateStr} 생산일보가 로컬에 저장되었습니다.`);
    if (mergedLineName && typeof renderProductionTable === 'function') {
      renderProductionTable();
    }
  }

  // 모든 저장된 생산일보(로컬)에서 certRowId별 공정 완료 수량 집계
  function aggregateDailyActualsByCertRow() {
    const map = {}; // certRowId -> { dateStr -> { assembly, inspect, pack } }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.DAILY_V2_PREFIX)) continue;
      const dateStr = k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length);
      if (!dateStr) continue;
      try {
        const d = JSON.parse(localStorage.getItem(k));
        (d.entries || []).forEach(ent => {
          if (!ent.certRowId) return;
          const qty = parseSafeInt(ent.actualQty);
          if (qty <= 0) return;
          if (!map[ent.certRowId]) map[ent.certRowId] = {};
          if (!map[ent.certRowId][dateStr]) map[ent.certRowId][dateStr] = { assembly: 0, inspect: 0, pack: 0 };
          (ent.procs || []).forEach(p => {
            if (map[ent.certRowId][dateStr][p] !== undefined) {
              map[ent.certRowId][dateStr][p] += qty;
            }
          });
        });
      } catch (e) { /* ignore */ }
    }
    return map;
  }

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
      const inspData = (isActive && state.inspV2Data)
        ? state.inspV2Data
        : readLocalInspectionV2Raw(w.weekDate);
      const meta = getInspV2PlanMeta(inspData, w.weekDate);
      const dateObj = new Date(w.weekDate + 'T00:00:00');
      const dayName = isNaN(dateObj.getTime()) ? '' : (DAYS_OF_WEEK[dateObj.getDay()] || '');
      const statusBadgeHtml = `<span class="schedule-plan-badge ${meta.hasPlan ? 'is-done' : 'is-empty'}">${meta.hasPlan ? '작성됨' : '미작성'}</span>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `schedule-item-btn ${isActive ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="schedule-date-text" style="width:100%;">
          <span>${w.weekDate}${dayName ? ` (${dayName})` : ''}</span>
          <span class="schedule-line-counts">감${w.counts['감지기반']}·유${w.counts['유도등반']}·수${w.counts['수신기반']}</span>
        </div>
        <div class="schedule-sub-text" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <span>시작일: ${meta.effectiveStartDate}</span>
          ${statusBadgeHtml}
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

  function getInspCellDotMeta(val, actualOnDay, dateStr, todayStr) {
    if (!dateStr || dateStr > todayStr) return null;
    if (val > 0 && actualOnDay >= val) {
      return { status: 'done', cls: 'insp-match-dot', title: `생산완료 (${actualOnDay.toLocaleString()})` };
    }
    if (val > 0 && actualOnDay === 0) {
      return { status: 'pending', cls: 'insp-pending-dot', title: '일보 미작성 (실적 0)' };
    }
    if (actualOnDay > 0 && val !== actualOnDay) {
      return { status: 'mismatch', cls: 'insp-mismatch-dot', title: `수량 불일치 (계획: ${val.toLocaleString()} / 실적: ${actualOnDay.toLocaleString()}) · 더블클릭 시 실적에 맞춤` };
    }
    return null;
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
    if (sInput) sInput.value = state.inspV2Data.startDate || getMondayOfWeek(targetDate);

    document.querySelectorAll('#insp-line-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === (state.inspLineFilter || 'ALL'));
    });
    document.querySelectorAll('#insp-status-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.status === (state.inspStatusFilter || 'ALL'));
    });

    const subDayBtn = document.getElementById('btn-insp-sub-day');
    if (subDayBtn) subDayBtn.style.display = (state.inspV2Data.dayCount || 10) > 10 ? 'inline-flex' : 'none';

    const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
    const completedMap = aggregateCompletedByCertRow();
    const dailyActualMap = aggregateDailyActualsByCertRow();
    const todayStr = getTodayDateString();
    const certRowsForWeek = (state.certSavedRows || []).filter(r => r.weekDate === targetDate);

    const dayCount = state.inspV2Data.dayCount || 10;
    const baseDate = state.inspV2Data.startDate || getMondayOfWeek(targetDate);
    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
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
      dateCols.push({ dateStr: ds, label: `${mm}/${dd} (${dowLabels[dow]})`, isWeekend, isOffDay, offReason: krHol || compHol, dow });
    }

    const visibleLines = (state.inspLineFilter && state.inspLineFilter !== 'ALL')
      ? [state.inspLineFilter]
      : INSP_LINES;

    container.innerHTML = '';

    const statusFilter = state.inspStatusFilter || 'ALL';
    visibleLines.forEach(lineName => {
      const allLineRows = certRowsForWeek.filter(r => (r.group || '').trim() === lineName);
      const lineRows = statusFilter === 'ALL'
        ? allLineRows
        : allLineRows.filter(cRow => {
            const itemState = (state.inspV2Data.items && state.inspV2Data.items[cRow.id]) || { dailyPlans: {}, excludedProcs: {} };
            const excl = itemState.excludedProcs || {};
            const dailyPlans = itemState.dailyPlans || {};
            return ['assembly', 'inspect', 'pack'].some(procKey => {
              if (excl[procKey]) return false;
              return dateCols.some(dc => {
                if (dc.isOffDay) return false;
                const val = dailyPlans[dc.dateStr] ? parseSafeInt(dailyPlans[dc.dateStr][procKey]) : 0;
                const actualOnDay = dailyActualMap[cRow.id]?.[dc.dateStr]?.[procKey] || 0;
                const meta = getInspCellDotMeta(val, actualOnDay, dc.dateStr, todayStr);
                return meta && meta.status === statusFilter;
              });
            });
          });
      const card = document.createElement('div');
      card.className = 'table-section-card';

      let sumTarget = 0, sumCompleted = 0, sumBalance = 0;
      const dailyQtySums = new Array(dayCount).fill(0);
      const dailyStSeconds = new Array(dayCount).fill(0);

      let tbodyHtml = '';
      if (lineRows.length === 0) {
        const emptyText = allLineRows.length === 0
          ? `해당 생산주차(${targetDate || '-'})에 등록된 [${lineName}] 검정 내역이 없습니다.`
          : `선택한 상태 조건에 해당하는 [${lineName}] 품목이 없습니다.`;
        tbodyHtml = `<tr><td colspan="${8 + dayCount}" style="text-align:center; padding: 20px; color:#94a3b8;">${emptyText}</td></tr>`;
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

            const compProcQty = comp[pd.key] || 0;
            const remainQty = Math.max(0, targetQty - compProcQty);

            let remainHtml = '<span style="color:#94a3b8;">-</span>';
            if (!isExcl) {
              remainHtml = `<span class="insp-remain-red">${remainQty.toLocaleString()}</span>`;
            }

            const badgeHtml = `<button type="button" tabindex="-1" class="insp-proc-badge ${isExcl ? 'is-excluded' : pd.cls}" data-row-id="${cRow.id}" data-proc="${pd.key}" title="${isExcl ? '제외됨 (클릭 시 포함)' : '클릭 시 해당 공정 제외'}">${pd.label}</button>`;
            const lineGroups = getDailyProcGroups(lineName);
            const isProcLinked = !isExcl && lineGroups.some(g => g.length > 1 && g.includes(pd.key));
            const procLinkIcon = isProcLinked
              ? `<span class="prod-proc-link-indicator" title="연결된 공정 (선행 공정 입력 시 자동 채움)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>`
              : `<span class="prod-proc-link-indicator is-empty" aria-hidden="true"></span>`;

            let dateCellsHtml = '';
            let procPlanSum = 0;
            dateCols.forEach((dc, dIdx) => {
              if (dc.isOffDay) {
                dateCellsHtml += `<td class="weekend-cell" style="background:${dc.offReason ? 'var(--danger-light)' : 'var(--bg-subtle)'};" title="${dc.offReason || '주말'}"></td>`;
              } else if (isExcl) {
                dateCellsHtml += `<td style="background:var(--bg-subtle); color:var(--text-muted); text-align:center;">-</td>`;
              } else {
                const pObj = dailyPlans[dc.dateStr];
                const val = pObj ? parseSafeInt(pObj[pd.key]) : 0;
                const actualOnDay = dailyActualMap[cRow.id]?.[dc.dateStr]?.[pd.key] || 0;
                if (val > 0) {
                  procPlanSum += val;
                  if (pd.key === 'assembly') dailyQtySums[dIdx] += val;
                  dailyStSeconds[dIdx] += (val * stMap[pd.key]);
                }
                const dotMeta = getInspCellDotMeta(val, actualOnDay, dc.dateStr, todayStr);
                const subActualHtml = dotMeta
                  ? `<span class="${dotMeta.cls}" title="${dotMeta.title}"></span>`
                  : '';
                dateCellsHtml += `<td class="insp-v2-date-cell">${subActualHtml}<input type="number" min="${actualOnDay}" class="insp-inline-num insp-v2-date-input" data-row-id="${cRow.id}" data-date="${dc.dateStr}" data-proc="${pd.key}" data-line="${lineName}" data-target="${targetQty}" data-actual="${actualOnDay}" value="${val > 0 ? val : ''}"></td>`;
              }
            });

            const dispName = getDisplayItemName(mItem) || cRow.name || '-';
            const siteNote = String(cRow.site || '').trim();
            const siteSubHtml = siteNote ? `<div class="insp-site-sub" title="${escapeHtmlPlan(siteNote)}">${escapeHtmlPlan(siteNote)}</div>` : '';
            const isReportPrinted = !!(state.reportPrintedMap && state.reportPrintedMap[cRow.id]);
            const rptCls = isReportPrinted ? 'is-printed' : 'is-pending-print';
            const rptTitle = isReportPrinted
              ? '공정검사보고서 출력 완료 (클릭 시 다시 다운로드)'
              : '공정검사보고서 출력 (클릭하여 .xlsx 다운로드)';
            const rptBadge = isReportPrinted ? '<span>완료</span>' : '<span>출력</span>';
            const rptBtnHtml = `
              <button type="button" class="insp-report-btn ${rptCls}" data-cert-row-id="${escapeHtmlPlan(cRow.id)}" title="${escapeHtmlPlan(rptTitle)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                ${rptBadge}
              </button>
            `;
            const mergedCols = pIdx === 0 ? `
              <td rowspan="3" class="insp-merged-cell text-center" style="color:var(--text-muted); font-weight:600;">${idx + 1}</td>
              <td rowspan="3" class="insp-merged-cell insp-name-cell font-bold text-slate-800" title="${escapeHtmlPlan(dispName)}">
                <div class="insp-name-row">
                  <div><div>${escapeHtmlPlan(dispName)}</div>${siteSubHtml}</div>
                  ${rptBtnHtml}
                </div>
              </td>
              <td rowspan="3" class="insp-merged-cell text-center" style="font-variant-numeric:tabular-nums;">${cRow.lotNo || '-'}</td>
              <td rowspan="3" class="insp-merged-cell num-cell text-center font-bold" style="color:var(--text-main);">${targetQty.toLocaleString()}</td>
            ` : '';

            tbodyHtml += `
              <tr class="${rowCls}">
                ${mergedCols}
                <td class="text-center" style="white-space:nowrap;">${badgeHtml}${procLinkIcon}</td>
                <td class="num-cell text-center insp-qty-blue font-bold">${!isExcl ? compProcQty.toLocaleString() : '-'}</td>
                <td class="num-cell text-center insp-remain-red" data-remain="${cRow.id}__${pd.key}">${remainHtml}</td>
                <td class="num-cell text-center font-bold" data-row-plan-sum="${cRow.id}__${pd.key}">${!isExcl ? procPlanSum.toLocaleString() : '-'}</td>
                ${dateCellsHtml}
              </tr>
            `;
          });
        });
      }

      const dateThs = dateCols.map(dc => {
        const cls = (dc.dow === 0 || dc.offReason) ? 'text-danger' : (dc.dow === 6 ? 'insp-sat-th' : '');
        const subTag = dc.offReason ? `<div style="font-size:9px; font-weight:700; color:#dc2626; line-height:1.1;">${dc.offReason}</div>` : '';
        return `<th class="insp-date-th ${cls}" style="min-width: 72px; width: 72px; text-align:center;" title="${dc.offReason || ''}">${dc.label}${subTag}</th>`;
      }).join('');

      const tfootDateTds = dateCols.map((dc, dIdx) => {
        if (dc.isOffDay) return `<td style="background:${dc.offReason ? 'var(--danger-light)' : 'var(--bg-subtle)'};"></td>`;
        const h = dailyStSeconds[dIdx] / 3600;
        return `<td class="num-cell text-center" data-tfoot-date="${lineName}__${dc.dateStr}">
          ${h > 0 ? `<span class="insp-st-hours">${h.toFixed(1)}h</span>` : ''}
        </td>`;
      }).join('');

      const sumPlanTotal = dailyQtySums.reduce((acc, v) => acc + v, 0);
      const lineRate = sumTarget > 0 ? ((sumCompleted / sumTarget) * 100).toFixed(1) : '0.0';

      card.innerHTML = `
        <div class="table-section-header header-process" style="padding: 10px 14px;">
          <div class="section-title-wrap" style="flex-wrap: wrap;">
            <span class="section-indicator bar-process"></span>
            <h3 class="section-title">${lineName}</h3>
            <span class="sidebar-count-badge">${lineRows.length}건</span>
            ${renderProdProcLinkBar(lineName)}
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
                <th style="width: 72px; text-align:center;" title="클릭 시 해당 공정 제외/포함">공정</th>
                <th style="width: 68px;">실적완료</th>
                <th style="width: 72px;">잔량</th>
                <th style="width: 68px; text-align:center;">합계</th>
                ${dateThs}
              </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
            <tfoot>
              <tr class="summary-row">
                <td colspan="3" class="summary-label text-center">합계 / 예상공수</td>
                <td class="num-cell text-center font-bold">${sumTarget.toLocaleString()}</td>
                <td></td>
                <td class="num-cell text-center insp-qty-blue font-bold">${sumCompleted.toLocaleString()}</td>
                <td class="num-cell text-center insp-remain-red">${sumBalance.toLocaleString()}</td>
                <td class="num-cell text-center font-bold" data-tfoot-plan-sum="${lineName}">${sumPlanTotal.toLocaleString()}</td>
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

    document.querySelectorAll('#insp-status-filter-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.inspStatusFilter = btn.dataset.status || 'ALL';
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

    // 행 펼침/접기, 공정 제외 토글 & 공정 연동 컨트롤
    container.addEventListener('click', (e) => {
      const pillBtn = e.target.closest('.prod-link-group-pill');
      if (pillBtn) {
        const ln = pillBtn.dataset.line;
        const gIdx = Number(pillBtn.dataset.groupIdx);
        if (!state.dailyProcLinkSelected[ln]) state.dailyProcLinkSelected[ln] = [];
        const sel = state.dailyProcLinkSelected[ln];
        const pos = sel.indexOf(gIdx);
        if (pos >= 0) sel.splice(pos, 1);
        else sel.push(gIdx);
        renderInspectionV2();
        return;
      }

      const linkBtn = e.target.closest('.btn-prod-proc-link');
      if (linkBtn) {
        const ln = linkBtn.dataset.line;
        const groups = getDailyProcGroups(ln);
        const sel = (state.dailyProcLinkSelected[ln] || []).slice().sort((a, b) => a - b);
        if (sel.length < 2) return;
        const mergedProcs = [];
        sel.forEach(idx => {
          if (groups[idx]) mergedProcs.push(...groups[idx]);
        });
        const sortedProcs = DAILY_PROC_ORDER.filter(p => mergedProcs.includes(p));
        if (sortedProcs.length === 2 && sortedProcs[0] === 'assembly' && sortedProcs[1] === 'pack') {
          showToast('인접한 공정(조립·검사, 검사·포장 또는 전체)을 선택해 주세요.');
          return;
        }
        const nextGroups = groups.filter((_, i) => !sel.includes(i));
        nextGroups.push(sortedProcs);
        nextGroups.sort((a, b) => DAILY_PROC_ORDER.indexOf(a[0]) - DAILY_PROC_ORDER.indexOf(b[0]));
        state.dailyProcLinks[ln] = nextGroups;
        state.dailyProcLinkSelected[ln] = [];
        saveDailyProcLinks();
        renderInspectionV2();
        showToast(`[${ln}] ${sortedProcs.map(p => DAILY_PROC_NAMES[p]).join('→')} 공정이 연결되었습니다.`);
        return;
      }

      const unlinkBtn = e.target.closest('.btn-prod-proc-unlink');
      if (unlinkBtn) {
        const ln = unlinkBtn.dataset.line;
        const groups = getDailyProcGroups(ln);
        const sel = state.dailyProcLinkSelected[ln] || [];
        const targetIndices = sel.length > 0
          ? sel.filter(i => groups[i] && groups[i].length > 1)
          : groups.map((g, i) => (g.length > 1 ? i : -1)).filter(i => i >= 0);
        if (targetIndices.length === 0) return;

        const nextGroups = [];
        groups.forEach((g, idx) => {
          if (targetIndices.includes(idx)) {
            g.forEach(p => nextGroups.push([p]));
          } else {
            nextGroups.push(g);
          }
        });
        nextGroups.sort((a, b) => DAILY_PROC_ORDER.indexOf(a[0]) - DAILY_PROC_ORDER.indexOf(b[0]));
        state.dailyProcLinks[ln] = nextGroups;
        state.dailyProcLinkSelected[ln] = [];
        saveDailyProcLinks();
        renderInspectionV2();
        showToast(`[${ln}] 공정 연결이 해제되었습니다.`);
        return;
      }

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
        renderSidebarSchedulesV2();
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

    // 일정계획 날짜 셀 값 변경 시 상한(로트수량) 및 하한(생산일보 실적) 검증 후 저장/합계 갱신
    const handleInspInputUpdate = (inp, isCommit = false) => {
      const rowId = inp.dataset.rowId;
      const dateStr = inp.dataset.date;
      const proc = inp.dataset.proc;
      const lineName = inp.dataset.line;
      const targetQty = parseSafeInt(inp.dataset.target);
      const actualOnDay = parseSafeInt(inp.dataset.actual);
      const val = parseSafeInt(inp.value);

      if (!state.inspV2Data.items[rowId]) state.inspV2Data.items[rowId] = { dailyPlans: {}, excludedProcs: {} };
      if (!state.inspV2Data.items[rowId].dailyPlans) state.inspV2Data.items[rowId].dailyPlans = {};
      if (!state.inspV2Data.items[rowId].dailyPlans[dateStr]) state.inspV2Data.items[rowId].dailyPlans[dateStr] = {};

      const dailyPlans = state.inspV2Data.items[rowId].dailyPlans;
      const prevVal = parseSafeInt(dailyPlans[dateStr][proc]);

      // 현재 화면에 보이는 작업일 셀들의 합계만 기준으로 계산 (숨겨진 과거/타주차 잔여값 간섭 방지)
      let otherDaysSum = 0;
      container.querySelectorAll(`.insp-v2-date-input[data-row-id="${rowId}"][data-proc="${proc}"]`).forEach(otherInp => {
        if (otherInp.dataset.date !== dateStr) {
          otherDaysSum += parseSafeInt(otherInp.value);
        }
      });

      const todayStr = getTodayDateString();
      const updateInspCellDot = (cellTd, cellVal, cellActual, cellDateStr) => {
        if (!cellTd) return;
        const dotMeta = getInspCellDotMeta(cellVal, cellActual, cellDateStr, todayStr);
        let dotEl = cellTd.querySelector('.insp-mismatch-dot, .insp-pending-dot, .insp-match-dot');
        if (dotMeta) {
          if (!dotEl) {
            dotEl = document.createElement('span');
            cellTd.prepend(dotEl);
          }
          dotEl.className = dotMeta.cls;
          dotEl.title = dotMeta.title;
        } else if (dotEl) {
          dotEl.remove();
        }
      };

      const td = inp.closest('td.insp-v2-date-cell');
      if (isCommit && otherDaysSum + val > targetQty) {
        inp.value = prevVal > 0 ? prevVal : '';
        if (td) {
          td.classList.add('is-limit-error');
          setTimeout(() => td.classList.remove('is-limit-error'), 1500);
          updateInspCellDot(td, prevVal, actualOnDay, dateStr);
        }
        const remainCap = Math.max(0, targetQty - otherDaysSum);
        showToast(`로트수량(${targetQty.toLocaleString()})을 초과할 수 없습니다. (입력 가능: ${remainCap.toLocaleString()})`);
        return;
      }

      if (isCommit && actualOnDay > 0 && val < actualOnDay) {
        const floorVal = Math.max(prevVal, actualOnDay);
        inp.value = floorVal > 0 ? floorVal : '';
        showToast(`생산일보 실적(${actualOnDay.toLocaleString()}) 미만으로 줄일 수 없습니다.`);
        return;
      }

      if (td) td.classList.remove('is-limit-error');
      const canApplyVal = isCommit || (otherDaysSum + val <= targetQty && !(actualOnDay > 0 && val < actualOnDay));
      if (canApplyVal) {
        dailyPlans[dateStr][proc] = val > 0 ? val : 0;

        // 단방향 공정 연동: 조립 -> 검사 -> 포장 순으로 연결된 후행 공정 자동 채움 (제외 공정 건너뜀)
        const groups = getDailyProcGroups(lineName);
        const matchedGrp = groups.find(g => g.length > 1 && g.includes(proc));
        if (matchedGrp) {
          const curIdx = matchedGrp.indexOf(proc);
          const downstreamProcs = matchedGrp.slice(curIdx + 1);
          const itemExcl = (state.inspV2Data.items[rowId] && state.inspV2Data.items[rowId].excludedProcs) || {};
          downstreamProcs.forEach(dp => {
            if (itemExcl[dp]) return;
            const dpInput = container.querySelector(`.insp-v2-date-input[data-row-id="${rowId}"][data-date="${dateStr}"][data-proc="${dp}"]`);
            const dpActual = dpInput ? parseSafeInt(dpInput.dataset.actual) : 0;
            const appliedDpVal = val > 0 ? Math.max(val, dpActual) : (dpActual > 0 ? dpActual : 0);
            dailyPlans[dateStr][dp] = appliedDpVal;
            if (dpInput) {
              dpInput.value = appliedDpVal > 0 ? appliedDpVal : '';
              updateInspCellDot(dpInput.closest('td.insp-v2-date-cell'), appliedDpVal, dpActual, dateStr);
            }
            const dpSumTd = container.querySelector(`td[data-row-plan-sum="${rowId}__${dp}"]`);
            if (dpSumTd) {
              let dpRowSum = 0;
              container.querySelectorAll(`.insp-v2-date-input[data-row-id="${rowId}"][data-proc="${dp}"]`).forEach(x => {
                dpRowSum += parseSafeInt(x.value);
              });
              dpSumTd.textContent = dpRowSum.toLocaleString();
            }
          });
        }
      }

      // 계획 vs 실적 일치/불일치(오늘 이하) 왼쪽 상단 점 UI 즉시 갱신
      updateInspCellDot(td, val, actualOnDay, dateStr);

      saveLocalInspectionV2();
      markAsDirty(true);

      // 해당 일자 tfoot 예상공수 갱신
      const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
      const certRowsForLine = (state.certSavedRows || []).filter(r => r.weekDate === state.inspectionTargetDate && (r.group || '').trim() === lineName);
      let dSec = 0;
      certRowsForLine.forEach(cr => {
        const itSt = state.inspV2Data.items[cr.id];
        const excl = (itSt && itSt.excludedProcs) || {};
        const pOnDay = itSt && itSt.dailyPlans && itSt.dailyPlans[dateStr];
        if (!pOnDay) return;
        const mIt = masterMap.get(cr.code) || {};
        if (!excl.assembly) dSec += parseSafeInt(pOnDay.assembly) * parseSafeInt(mIt.stAssembly);
        if (!excl.inspect) dSec += parseSafeInt(pOnDay.inspect) * parseSafeInt(mIt.stInspect);
        if (!excl.pack) dSec += parseSafeInt(pOnDay.pack) * parseSafeInt(mIt.stPack);
      });
      const tfootTd = container.querySelector(`td[data-tfoot-date="${lineName}__${dateStr}"]`);
      if (tfootTd) {
        const h = dSec / 3600;
        tfootTd.innerHTML = h > 0 ? `<span class="insp-st-hours">${h.toFixed(1)}h</span>` : '';
      }

      // 해당 행 합계 & 반 전체 합계 열 실시간 갱신
      const rowSumTd = container.querySelector(`td[data-row-plan-sum="${rowId}__${proc}"]`);
      if (rowSumTd) {
        let rSum = 0;
        container.querySelectorAll(`.insp-v2-date-input[data-row-id="${rowId}"][data-proc="${proc}"]`).forEach(inp => {
          rSum += parseSafeInt(inp.value);
        });
        rowSumTd.textContent = rSum.toLocaleString();
      }
      const tfootSumTd = container.querySelector(`td[data-tfoot-plan-sum="${lineName}"]`);
      if (tfootSumTd) {
        let lSum = 0;
        container.querySelectorAll(`.insp-v2-date-input[data-line="${lineName}"][data-proc="assembly"]`).forEach(inp => {
          lSum += parseSafeInt(inp.value);
        });
        tfootSumTd.textContent = lSum.toLocaleString();
      }

      renderSidebarSchedulesV2();
    };

    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('insp-v2-date-input')) {
        handleInspInputUpdate(e.target, false);
      }
    });
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('insp-v2-date-input')) {
        handleInspInputUpdate(e.target, true);
      }
    });

    // 수량 불일치(빨간 점) 셀 더블클릭 시 생산일보 실적 수량으로 즉시 맞춤
    container.addEventListener('dblclick', (e) => {
      if (isGuestReadOnly(true)) return;
      const td = e.target.closest('td.insp-v2-date-cell');
      if (!td) return;
      const inp = td.querySelector('.insp-v2-date-input');
      if (!inp) return;

      const dateStr = inp.dataset.date;
      const actualOnDay = parseSafeInt(inp.dataset.actual);
      const curVal = parseSafeInt(inp.value);
      const dotMeta = getInspCellDotMeta(curVal, actualOnDay, dateStr, getTodayDateString());
      if (!dotMeta || dotMeta.status !== 'mismatch') return;

      inp.value = actualOnDay > 0 ? actualOnDay : '';
      handleInspInputUpdate(inp, true);
      showToast(`일보 실적(${actualOnDay.toLocaleString()})에 맞춰 수량을 변경했습니다.`);
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

  const DAILY_PROC_ORDER = ['assembly', 'inspect', 'pack'];
  const DAILY_PROC_NAMES = { assembly: '조립', inspect: '검사', pack: '포장' };

  function getDailyProcGroups(lineName) {
    const def = [['assembly'], ['inspect'], ['pack']];
    const groups = state.dailyProcLinks && state.dailyProcLinks[lineName];
    if (!Array.isArray(groups) || groups.length === 0) return def;
    const seen = new Set();
    const valid = [];
    groups.forEach(g => {
      if (!Array.isArray(g)) return;
      const clean = DAILY_PROC_ORDER.filter(p => g.includes(p) && !seen.has(p));
      if (clean.length > 0) {
        clean.forEach(p => seen.add(p));
        valid.push(clean);
      }
    });
    DAILY_PROC_ORDER.forEach(p => {
      if (!seen.has(p)) valid.push([p]);
    });
    valid.sort((a, b) => DAILY_PROC_ORDER.indexOf(a[0]) - DAILY_PROC_ORDER.indexOf(b[0]));
    return valid;
  }

  function saveDailyProcLinks() {
    try {
      localStorage.setItem('pms_daily_proc_link_v1', JSON.stringify(state.dailyProcLinks || {}));
    } catch (e) { /* ignore */ }
  }

  function renderProdProcLinkBar(lineName) {
    const groups = getDailyProcGroups(lineName);
    const selList = (state.dailyProcLinkSelected && state.dailyProcLinkSelected[lineName]) || [];
    const linkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    const unlinkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"></path><path d="M5.17 11.75l-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"></path><line x1="8" y1="2" x2="8" y2="5"></line><line x1="2" y1="8" x2="5" y2="8"></line><line x1="16" y1="19" x2="16" y2="22"></line><line x1="19" y1="16" x2="22" y2="16"></line></svg>`;

    const pillsHtml = groups.map((grp, gIdx) => {
      const isMerged = grp.length > 1;
      const isSelected = selList.includes(gIdx);
      const labelHtml = grp.map(p => DAILY_PROC_NAMES[p] || p).join('<span class="prod-link-sep">→</span>');
      return `
        <button type="button" class="prod-link-group-pill ${isMerged ? 'is-merged' : ''} ${isSelected ? 'is-selected' : ''}" data-line="${lineName}" data-group-idx="${gIdx}" title="${isMerged ? '연결된 공정 (단방향 자동 채움)' : '클릭하여 연결할 공정 선택'}">
          ${isMerged ? linkSvg : ''}
          <span>${labelHtml}</span>
        </button>
      `;
    }).join('');

    const canLink = selList.length >= 2;
    const mergedIndices = groups.map((g, i) => (g.length > 1 ? i : -1)).filter(i => i >= 0);
    const canUnlink = selList.some(i => groups[i] && groups[i].length > 1) || (selList.length === 0 && mergedIndices.length > 0);

    return `
      <div class="prod-proc-link-bar" data-line="${lineName}">
        ${pillsHtml}
        <button type="button" class="prod-link-action-btn btn-prod-proc-link" data-line="${lineName}" ${canLink ? '' : 'disabled'} title="선택한 공정을 하나로 연결 (앞 공정 입력 시 뒤 공정 자동 채움)">
          ${linkSvg}연결
        </button>
        <button type="button" class="prod-link-action-btn is-unlink btn-prod-proc-unlink" data-line="${lineName}" ${canUnlink ? '' : 'disabled'} title="연결된 공정 해제">
          ${unlinkSvg}연결해제
        </button>
      </div>
    `;
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

    const allWorkers = (state.workers || []).filter(w => isDirectManufacturingWorker(w));

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
        tbodyHtml = `<tr><td colspan="${9 + maxWorkersCount}" style="text-align:center; padding: 20px; color:#94a3b8;">[${lineName}] 작업 내역이 없습니다. [<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 일정 불러오기] 또는 [+ 돌발/추가 품목]을 누르세요.</td></tr>`;
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
              <td class="text-center" style="font-variant-numeric:tabular-nums;">${row.lotNo || '-'}</td>
              <td class="text-center"><span class="prod-proc-pill ${row._procCls}">${row._procLabel}</span></td>
              <td><input type="text" class="cell-input text-center prod-v2-note-input" data-entry-id="${row.id}" value="${row.note || ''}" placeholder="${row.isLoss ? '유실내용' : '작업내용'}"></td>
              <td class="num-cell text-center" style="color:var(--text-muted);">${row.targetQty ? parseSafeInt(row.targetQty).toLocaleString() : '-'}</td>
              <td>${row.isLoss ? '<span style="color:var(--text-muted); display:block; text-align:center;">-</span>' : `<input type="text" class="cell-input text-center font-bold text-primary prod-v2-qty-input" data-entry-id="${row.id}" value="${actQty > 0 ? actQty.toLocaleString() : ''}" inputmode="numeric">`}</td>
              ${workerTds}${padEmptyTds}
              <td class="num-cell text-center font-bold" style="color:var(--text-main); background:var(--bg-subtle);">${rowHoursSum > 0 ? rowHoursSum.toFixed(1) : ''}</td>
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
  const WH_ATTENDANCE_LOSS_KEYWORDS = ['연차', '반차', '조퇴', '외출', '결근', '출장', '예비군', '훈련'];

  function isAttendanceLossLabel(label) {
    const s = String(label || '').trim();
    if (!s) return false;
    return WH_ATTENDANCE_LOSS_KEYWORDS.some(k => s.includes(k));
  }

  function formatWhDuration(hours, unit = state.whUnit, decimalsH = 1) {
    const h = Number(hours) || 0;
    if (unit === 'M') return `${Math.round(h * 60).toLocaleString()}m`;
    if (unit === 'S') return `${Math.round(h * 3600).toLocaleString()}s`;
    return `${h.toFixed(decimalsH)}h`;
  }

  function getPrevMonthStr(monthStr) {
    if (!monthStr || monthStr.length < 7) return '';
    const [y, m] = monthStr.split('-').map(Number);
    if (!y || !m) return '';
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function ensureMonthDailyV2Loaded(monthStr) {
    if (!monthStr || !isFirestoreActive || !db) return;
    if (state.whSyncedMonths && state.whSyncedMonths.has(monthStr)) return;
    try {
      const snap = await db.collection('pms_daily_v2')
        .where('date', '>=', `${monthStr}-01`)
        .where('date', '<=', `${monthStr}-31`)
        .get();
      snap.forEach(doc => {
        const data = doc.data();
        const dateStr = data?.date || doc.id;
        if (dateStr) {
          localStorage.setItem(STORAGE_KEYS.DAILY_V2_PREFIX + dateStr, JSON.stringify({
            ...normalizeDailyV2(data),
            date: dateStr,
            updatedAt: Date.now()
          }));
        }
      });
      if (!state.whSyncedMonths) state.whSyncedMonths = new Set();
      state.whSyncedMonths.add(monthStr);
    } catch (err) {
      console.warn(`월별 일보(${monthStr}) Firestore 조회 실패 (로컬 사용):`, err);
    }
  }

  function computeMonthWorkhours(monthStr, lineFilter = 'ALL', includeAttLoss = false) {
    const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
    const stCfg = state.stConfig || { items: [], excludedCodes: [] };
    const excludedSet = new Set(stCfg.excludedCodes || []);
    const codeToSt = new Map();
    (stCfg.items || []).forEach(st => {
      (st.codes || []).forEach(c => codeToSt.set(c, st));
    });

    const buckets = new Map(); // key -> { key, isGroup, isUnmapped, line, name, stItem, aQty, iQty, pQty, actualHours, stdH, children: Map }
    const unmappedCodes = new Set();
    const lossWork = {}; // label -> { label, totalH, byLine: { 감지기반, 유도등반, 수신기반 } }
    const lossAtt = {};
    const workerAgg = {};

    (state.workers || []).filter(w => isDirectManufacturingWorker(w)).forEach(w => {
      if (lineFilter !== 'ALL' && (w.group || '').trim() !== lineFilter) return;
      workerAgg[w.id] = {
        id: w.id, name: w.name, line: (w.group || '-').trim(),
        type: w.type === 'fixed' ? '고정' : '변동',
        aH: 0, iH: 0, pH: 0, mH: 0, actH: 0, lossH: 0, totalH: 0, days: new Set()
      };
    });

    let totalWorkLossH = 0;
    let totalAttLossH = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.DAILY_V2_PREFIX)) continue;
      const dateStr = k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length);
      if (!dateStr.startsWith(monthStr)) continue;

      try {
        const d = JSON.parse(localStorage.getItem(k));
        (d.entries || []).forEach(ent => {
          const line = (ent.line || '감지기반').trim();
          if (lineFilter !== 'ALL' && line !== lineFilter) return;

          const whMap = ent.workerHours || {};
          let rowHours = 0;
          Object.keys(whMap).forEach(wId => {
            const h = parseFloat(whMap[wId]) || 0;
            if (h <= 0) return;
            rowHours += h;
            if (!workerAgg[wId]) {
              const wObj = (state.workers || []).find(w => w.id === wId);
              if (wObj) {
                workerAgg[wId] = {
                  id: wId, name: wObj.name, line: (wObj.group || '-').trim(),
                  type: wObj.type === 'fixed' ? '고정' : '변동',
                  aH: 0, iH: 0, pH: 0, mH: 0, actH: 0, lossH: 0, totalH: 0, days: new Set()
                };
              }
            }
            if (workerAgg[wId]) {
              workerAgg[wId].totalH += h;
              workerAgg[wId].days.add(dateStr);
              if (ent.isLoss) {
                workerAgg[wId].lossH += h;
              } else {
                workerAgg[wId].actH += h;
                const procs = ent.procs || ['assembly'];
                if (procs.length === 1) {
                  if (procs[0] === 'assembly') workerAgg[wId].aH += h;
                  else if (procs[0] === 'inspect') workerAgg[wId].iH += h;
                  else if (procs[0] === 'pack') workerAgg[wId].pH += h;
                  else workerAgg[wId].mH += h;
                } else {
                  workerAgg[wId].mH += h;
                }
              }
            }
          });

          if (ent.isLoss) {
            if (rowHours <= 0) return;
            const label = String(ent.lossLabel || (ent.procs && ent.procs[0]) || '기타').trim();
            const isAtt = isAttendanceLossLabel(label);
            const targetMap = isAtt ? lossAtt : lossWork;
            if (!targetMap[label]) {
              targetMap[label] = { label, totalH: 0, byLine: {} };
            }
            targetMap[label].totalH += rowHours;
            targetMap[label].byLine[line] = (targetMap[label].byLine[line] || 0) + rowHours;
            if (isAtt) totalAttLossH += rowHours;
            else totalWorkLossH += rowHours;
            return;
          }

          const code = String(ent.code || '').trim();
          if (code && excludedSet.has(code)) return;

          const stItem = code ? codeToSt.get(code) : null;
          const qty = parseSafeInt(ent.actualQty);
          const procs = ent.procs || ['assembly'];
          const aQ = procs.includes('assembly') ? qty : 0;
          const iQ = procs.includes('inspect') ? qty : 0;
          const pQ = procs.includes('pack') ? qty : 0;

          let bKey, bObj;
          if (stItem) {
            bKey = `st_${stItem.id}`;
            if (!buckets.has(bKey)) {
              buckets.set(bKey, {
                key: bKey,
                isGroup: stItem.mode === 'group' || (stItem.codes || []).length > 1,
                isUnmapped: false,
                line: stItem.line || line,
                name: stItem.name,
                stItem,
                aQty: 0, iQty: 0, pQty: 0,
                actualHours: 0,
                stdH: 0,
                children: new Map(),
                dailyLogs: []
              });
            }
            bObj = buckets.get(bKey);
            const stA = Number(stItem.stAssembly) || 0;
            const stI = Number(stItem.stInspect) || 0;
            const stP = Number(stItem.stPack) || 0;
            const rowStdH = (aQ * stA + iQ * stI + pQ * stP) / 3600;
            bObj.aQty += aQ;
            bObj.iQty += iQ;
            bObj.pQty += pQ;
            bObj.actualHours += rowHours;
            bObj.stdH += rowStdH;
            if (rowHours > 0 || qty > 0) {
              bObj.dailyLogs.push({ dateStr, line, code: code || ent.name || '-', name: stItem.name, qty, actualH: rowHours, stdH: rowStdH });
            }

            const cKey = code || ent.name || '-';
            if (!bObj.children.has(cKey)) {
              const m = masterMap.get(code) || {};
              bObj.children.set(cKey, {
                code: cKey,
                name: getDisplayItemName(m) || ent.name || cKey,
                aQty: 0, iQty: 0, pQty: 0, actualHours: 0, stdH: 0
              });
            }
            const ch = bObj.children.get(cKey);
            ch.aQty += aQ; ch.iQty += iQ; ch.pQty += pQ;
            ch.actualHours += rowHours; ch.stdH += rowStdH;
          } else {
            const rawKey = code || ent.name || '미지정';
            if (code) unmappedCodes.add(code);
            bKey = `unmapped_${rawKey}`;
            const m = masterMap.get(code) || {};
            if (!buckets.has(bKey)) {
              buckets.set(bKey, {
                key: bKey,
                isGroup: false,
                isUnmapped: true,
                code: rawKey,
                line,
                name: getDisplayItemName(m) || ent.name || rawKey,
                stItem: {
                  stAssembly: parseFloat(m.stAssembly) || 0,
                  stInspect: parseFloat(m.stInspect) || 0,
                  stPack: parseFloat(m.stPack) || 0
                },
                aQty: 0, iQty: 0, pQty: 0,
                actualHours: 0,
                stdH: 0,
                children: new Map(),
                dailyLogs: []
              });
            }
            bObj = buckets.get(bKey);
            const rowStdH = (aQ * bObj.stItem.stAssembly + iQ * bObj.stItem.stInspect + pQ * bObj.stItem.stPack) / 3600;
            bObj.aQty += aQ;
            bObj.iQty += iQ;
            bObj.pQty += pQ;
            bObj.actualHours += rowHours;
            bObj.stdH += rowStdH;
            if (rowHours > 0 || qty > 0) {
              bObj.dailyLogs.push({ dateStr, line, code: code || ent.name || '-', name: bObj.name, qty, actualH: rowHours, stdH: rowStdH });
            }
          }
        });
      } catch (e) { /* ignore */ }
    }

    const list = Array.from(buckets.values());
    const allAnomalies = [];
    let totalStdH = 0, totalActH = 0;
    list.forEach(it => {
      totalStdH += it.stdH;
      totalActH += it.actualHours;
      const avgEff = (it.actualHours > 0 && it.stdH > 0) ? (it.stdH / it.actualHours) * 100 : null;
      const byDateMap = new Map();
      (it.dailyLogs || []).forEach(dl => {
        const dk = `${dl.dateStr}__${dl.line}`;
        if (!byDateMap.has(dk)) {
          byDateMap.set(dk, { dateStr: dl.dateStr, line: dl.line, qty: 0, actualH: 0, stdH: 0 });
        }
        const agg = byDateMap.get(dk);
        agg.qty += dl.qty;
        agg.actualH += dl.actualH;
        agg.stdH += dl.stdH;
      });

      const itemAnomalies = [];
      byDateMap.forEach(agg => {
        let reason = '';
        let severity = 'warn';
        if (agg.actualH > 0 && agg.qty <= 0) {
          reason = '공수 입력 · 수량 누락(0)';
          severity = 'err';
        } else if (agg.qty > 0 && agg.actualH <= 0) {
          reason = '수량 입력 · 공수 누락(0)';
          severity = 'err';
        } else if (agg.actualH > 0 && agg.stdH > 0) {
          const dayEff = (agg.stdH / agg.actualH) * 100;
          if (dayEff < 50 || (avgEff && dayEff < avgEff * 0.5)) {
            reason = `효율 급락 (${dayEff.toFixed(0)}%${avgEff ? ` · 월평균 ${avgEff.toFixed(0)}%` : ''})`;
          } else if (dayEff > 150 || (avgEff && dayEff > avgEff * 1.6)) {
            reason = `효율 급등 (${dayEff.toFixed(0)}%${avgEff ? ` · 월평균 ${avgEff.toFixed(0)}%` : ''})`;
          }
        }
        if (reason) {
          const entry = {
            whKey: it.key,
            itemName: it.name,
            dateStr: agg.dateStr,
            line: agg.line,
            qty: agg.qty,
            actualH: agg.actualH,
            stdH: agg.stdH,
            reason,
            severity
          };
          itemAnomalies.push(entry);
          allAnomalies.push(entry);
        }
      });
      itemAnomalies.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
      it.anomalies = itemAnomalies;
    });
    allAnomalies.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    const activeLossH = includeAttLoss ? (totalWorkLossH + totalAttLossH) : totalWorkLossH;
    const stEff = totalActH > 0 && totalStdH > 0 ? (totalStdH / totalActH) * 100 : null;
    const realEff = (totalActH + activeLossH) > 0 && totalStdH > 0 ? (totalStdH / (totalActH + activeLossH)) * 100 : null;

    return {
      list,
      anomalies: allAnomalies,
      unmappedCodes: Array.from(unmappedCodes),
      lossWork: Object.values(lossWork).sort((a, b) => b.totalH - a.totalH),
      lossAtt: Object.values(lossAtt).sort((a, b) => b.totalH - a.totalH),
      totalWorkLossH,
      totalAttLossH,
      activeLossH,
      totalStdH,
      totalActH,
      stEff,
      realEff,
      workerList: Object.values(workerAgg)
    };
  }

  async function renderWorkhoursView() {
    const esc = escapeHtmlPlan;
    const monthStr = state.whMonth || getTodayDateString().slice(0, 7);
    const mInput = document.getElementById('wh-month-input');
    if (mInput) mInput.value = monthStr;

    document.querySelectorAll('#wh-line-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === (state.whLineFilter || 'ALL'));
    });
    document.querySelectorAll('#wh-unit-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.unit === (state.whUnit || 'H'));
    });
    if (state.whIncludeAttLoss === undefined) {
      try { state.whIncludeAttLoss = localStorage.getItem('pms_wh_include_att_loss') === '1'; } catch (e) {}
    }
    const attChk = document.getElementById('wh-include-att-loss');
    if (attChk) attChk.checked = !!state.whIncludeAttLoss;

    const lineFilter = state.whLineFilter || 'ALL';
    const unit = state.whUnit || 'H';
    const includeAtt = !!state.whIncludeAttLoss;

    await ensureMonthDailyV2Loaded(monthStr);
    const prevMonthStr = getPrevMonthStr(monthStr);
    if (prevMonthStr) await ensureMonthDailyV2Loaded(prevMonthStr);

    const cur = computeMonthWorkhours(monthStr, lineFilter, includeAtt);
    const prev = prevMonthStr ? computeMonthWorkhours(prevMonthStr, lineFilter, includeAtt) : null;

    // 미매핑 배지
    const unmappedBtn = document.getElementById('btn-wh-unmapped-alert');
    const unmappedCntEl = document.getElementById('wh-unmapped-count');
    if (unmappedBtn && unmappedCntEl) {
      if (cur.unmappedCodes.length > 0) {
        unmappedBtn.style.display = 'inline-flex';
        unmappedCntEl.textContent = String(cur.unmappedCodes.length);
      } else {
        unmappedBtn.style.display = 'none';
      }
    }

    // KPI 카드 렌더링
    const formatDiffPct = (cVal, pVal) => {
      if (cVal === null || pVal === null) return '전월 데이터 없음';
      const d = cVal - pVal;
      const cls = d >= 0 ? 'is-up' : 'is-down';
      const arrow = d >= 0 ? '▲' : '▼';
      return `전월 대비 <span class="${cls}">${arrow} ${Math.abs(d).toFixed(1)}%p</span>`;
    };
    const formatDiffHours = (cH, pH) => {
      if (!prev || (pH === 0 && cH === 0)) return '전월 대비 -';
      const d = cH - pH;
      const arrow = d >= 0 ? '▲' : '▼';
      return `전월 대비 ${arrow} ${formatWhDuration(Math.abs(d), unit, 1)}`;
    };

    const setEl = (id, html, isHtml = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isHtml) el.innerHTML = html; else el.textContent = html;
    };
    setEl('wh-kpi-st', formatWhDuration(cur.totalStdH, unit, 2));
    setEl('wh-kpi-st-diff', formatDiffHours(cur.totalStdH, prev ? prev.totalStdH : 0), true);
    setEl('wh-kpi-actual', formatWhDuration(cur.totalActH, unit, 1));
    setEl('wh-kpi-actual-diff', formatDiffHours(cur.totalActH, prev ? prev.totalActH : 0), true);
    setEl('wh-kpi-loss-scope', includeAtt ? '(작업+근태)' : '(작업유실)');
    setEl('wh-kpi-loss', formatWhDuration(cur.activeLossH, unit, 1));
    setEl('wh-kpi-loss-sub', `작업 ${formatWhDuration(cur.totalWorkLossH, unit, 1)} / 근태 ${formatWhDuration(cur.totalAttLossH, unit, 1)}`);
    setEl('wh-kpi-eff', cur.stEff !== null ? `${cur.stEff.toFixed(1)}%` : '-');
    setEl('wh-kpi-eff-diff', formatDiffPct(cur.stEff, prev ? prev.stEff : null), true);
    setEl('wh-kpi-real-eff', cur.realEff !== null ? `${cur.realEff.toFixed(1)}%` : '-');
    setEl('wh-kpi-real-eff-diff', formatDiffPct(cur.realEff, prev ? prev.realEff : null), true);

    // 좌측 품목별 ST 집계표
    const stTbody = document.getElementById('wh-st-tbody');
    const stTfoot = document.getElementById('wh-st-tfoot');
    const searchKw = (state.whItemSearch || '').trim().toLowerCase();
    const displayMode = state.whAggDisplayMode || 'qty'; // 'qty' | 'st' | 'est'
    if (state.whTargetEff === undefined) {
      const savedEff = Number(state.stConfig?.targetEff);
      state.whTargetEff = (Number.isFinite(savedEff) && savedEff >= 10 && savedEff <= 300) ? savedEff : 100;
    }
    const targetEffPct = Math.max(10, Math.min(300, Number(state.whTargetEff) || 100));

    state.whLastAnomalies = cur.anomalies || [];
    state.whLastAnomaliesByKey = new Map((cur.list || []).map(it => [it.key, it.anomalies || []]));

    const anomBtn = document.getElementById('btn-wh-anomaly-alert');
    const anomCntEl = document.getElementById('wh-anomaly-count');
    if (anomBtn && anomCntEl) {
      if (state.whLastAnomalies.length > 0) {
        anomBtn.style.display = 'inline-flex';
        anomCntEl.textContent = String(state.whLastAnomalies.length);
      } else {
        anomBtn.style.display = 'none';
      }
    }

    const targetEffInput = document.getElementById('wh-target-eff');
    if (targetEffInput && document.activeElement !== targetEffInput) {
      targetEffInput.value = String(targetEffPct);
    }

    const modeBtn = document.getElementById('btn-wh-st-mode');
    if (modeBtn) {
      modeBtn.textContent = displayMode === 'est'
        ? `표시: 예상 ST (${targetEffPct}%)`
        : (displayMode === 'st' ? '표시: ST(초)' : '표시: 수량');
      modeBtn.classList.toggle('btn-primary', displayMode !== 'qty');
      modeBtn.classList.toggle('btn-outline', displayMode === 'qty');
    }
    const colAEl = document.getElementById('wh-col-a');
    const colIEl = document.getElementById('wh-col-i');
    const colPEl = document.getElementById('wh-col-p');
    if (colAEl) colAEl.textContent = displayMode === 'est' ? '조립 (예상)' : (displayMode === 'st' ? '조립 (ST)' : '조립');
    if (colIEl) colIEl.textContent = displayMode === 'est' ? '검사 (예상)' : (displayMode === 'st' ? '검사 (ST)' : '검사');
    if (colPEl) colPEl.textContent = displayMode === 'est' ? '포장 (예상)' : (displayMode === 'st' ? '포장 (ST)' : '포장');

    if (stTbody) {
      const filteredList = cur.list.filter(it => {
        if (!searchKw) return true;
        if ((it.name || '').toLowerCase().includes(searchKw)) return true;
        if ((it.code || '').toLowerCase().includes(searchKw)) return true;
        for (const ch of it.children.values()) {
          if ((ch.code || '').toLowerCase().includes(searchKw) || (ch.name || '').toLowerCase().includes(searchKw)) return true;
        }
        return false;
      });

      if (filteredList.length === 0) {
        stTbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 28px; color:#94a3b8;">해당 월에 집계된 생산일보 데이터가 없습니다.</td></tr>';
      } else {
        const effBadgeHtml = (effVal) => {
          if (effVal === null) return '-';
          const txt = `${effVal.toFixed(1)}%`;
          if (effVal < 50) return `<span class="wh-badge wh-badge-warn-low" title="효율 50% 미만 (누락/지연 확인)">${txt} ⚠</span>`;
          if (effVal > 150) return `<span class="wh-badge wh-badge-warn-high" title="효율 150% 초과 (수량/공수 확인)">${txt} ⚠</span>`;
          return `<span class="wh-badge wh-badge-ok">${txt}</span>`;
        };

        const renderProcessCell = (qtyVal, stVal, effRatio) => {
          if (displayMode === 'st') {
            return `<td class="num-cell text-right" title="수량: ${qtyVal.toLocaleString()}">${stVal}s</td>`;
          }
          if (displayMode === 'est') {
            if (qtyVal <= 0 || stVal <= 0 || !effRatio) {
              const reasonTip = qtyVal <= 0
                ? `당월 실적 수량 없음 (측정 ST: ${stVal}s)`
                : `측정 ST: ${stVal}s (예상 산출 불가)`;
              return `<td class="num-cell text-right" style="color:#94a3b8;" title="${reasonTip}">-</td>`;
            }
            const estVal = Number((stVal * effRatio).toFixed(2));
            const diff = estVal - stVal;
            const diffStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}s`;
            const colorStyle = Math.abs(diff) > stVal * 0.25 ? 'color:#d97706; font-weight:700;' : 'color:#2563eb; font-weight:600;';
            return `<td class="num-cell text-right" style="${colorStyle}" title="측정 ST: ${stVal}s → 예상 ST: ${estVal}s (${diffStr}) · 수량: ${qtyVal.toLocaleString()}">${estVal}s</td>`;
          }
          return `<td class="num-cell text-right" title="ST: ${stVal}s">${qtyVal.toLocaleString()}</td>`;
        };

        const rowsHtml = [];
        filteredList.forEach((it, idx) => {
          const stA = Number(it.stItem.stAssembly) || 0;
          const stI = Number(it.stItem.stInspect) || 0;
          const stP = Number(it.stItem.stPack) || 0;
          const effVal = it.actualHours > 0 && it.stdH > 0 ? (it.stdH / it.actualHours) * 100 : null;
          const effRatio = (effVal && effVal > 0) ? (targetEffPct / effVal) : null;
          const isExpanded = state.whExpandedGroups && state.whExpandedGroups.has(it.key);
          const hasChildren = it.isGroup && it.children.size > 0;

          let badge = '<span class="wh-badge wh-badge-single">단일</span>';
          if (it.isUnmapped) badge = '<span class="wh-badge wh-badge-unmapped">미설정</span>';
          else if (it.isGroup) badge = `<span class="wh-badge wh-badge-group">묶음 (${it.children.size}종)</span>`;

          const rowCls = it.isUnmapped ? 'wh-unmapped-row' : (hasChildren ? 'wh-group-row' : '');
          const arrow = hasChildren ? (isExpanded ? '▾ ' : '▸ ') : '';
          const actionBtn = it.isUnmapped && it.code
            ? ` <button type="button" class="btn btn-xs btn-outline btn-wh-quick-map" data-code="${esc(it.code)}" style="padding:1px 5px; font-size:10px; margin-left:4px;">지정</button>`
            : '';
          const anomPill = (it.anomalies && it.anomalies.length > 0)
            ? `<button type="button" class="wh-anomaly-pill" data-wh-key="${esc(it.key)}" title="이상 일보 ${it.anomalies.length}건 확인 (클릭 시 이동)">!${it.anomalies.length}</button>`
            : '';

          rowsHtml.push(`
            <tr class="${rowCls}" data-wh-key="${esc(it.key)}">
              <td class="text-center">${idx + 1}</td>
              <td class="text-center">${esc(it.line)}</td>
              <td class="font-bold" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(it.name)}">${arrow}${esc(it.name)} ${badge}${actionBtn}</td>
              ${renderProcessCell(it.aQty, stA, effRatio)}
              ${renderProcessCell(it.iQty, stI, effRatio)}
              ${renderProcessCell(it.pQty, stP, effRatio)}
              <td class="num-cell text-right font-bold" style="color:#7c3aed;">${formatWhDuration(it.stdH, unit, 2)}</td>
              <td class="num-cell text-right font-bold">${formatWhDuration(it.actualHours, unit, 1)}</td>
              <td class="text-center">${effBadgeHtml(effVal)}${anomPill}</td>
              <td class="text-center" style="color:#94a3b8;">-</td>
            </tr>
          `);

          if (hasChildren && isExpanded) {
            Array.from(it.children.values()).forEach(ch => {
              const chEff = ch.actualHours > 0 && ch.stdH > 0 ? (ch.stdH / ch.actualHours) * 100 : null;
              const chRatio = (chEff && chEff > 0) ? (targetEffPct / chEff) : null;
              rowsHtml.push(`
                <tr class="wh-child-row">
                  <td></td>
                  <td class="text-center">└</td>
                  <td style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(ch.code + ' ' + ch.name)}"><code>${esc(ch.code)}</code> ${esc(ch.name)}</td>
                  ${renderProcessCell(ch.aQty, stA, chRatio)}
                  ${renderProcessCell(ch.iQty, stI, chRatio)}
                  ${renderProcessCell(ch.pQty, stP, chRatio)}
                  <td class="num-cell text-right">${formatWhDuration(ch.stdH, unit, 2)}</td>
                  <td class="num-cell text-right">${formatWhDuration(ch.actualHours, unit, 1)}</td>
                  <td class="text-center">${chEff !== null ? chEff.toFixed(1) + '%' : '-'}</td>
                  <td></td>
                </tr>
              `);
            });
          }
        });
        stTbody.innerHTML = rowsHtml.join('');
      }
      if (stTfoot) {
        const totEff = cur.stEff !== null ? `${cur.stEff.toFixed(1)}%` : '-';
        const totRealEff = cur.realEff !== null ? `${cur.realEff.toFixed(1)}%` : '-';
        stTfoot.innerHTML = `<td colspan="6" class="summary-label text-center">월간 합계</td><td class="num-cell text-right font-bold" style="color:#7c3aed;">${formatWhDuration(cur.totalStdH, unit, 2)}</td><td class="num-cell text-right font-bold">${formatWhDuration(cur.totalActH, unit, 1)}</td><td class="text-center font-bold">${totEff}</td><td class="text-center font-bold" style="color:#0284c7;">${totRealEff}</td>`;
      }
    }

    // 우측 반별 유실항목 집계표
    const lossTitleEl = document.getElementById('wh-loss-title');
    if (lossTitleEl) lossTitleEl.textContent = lineFilter === 'ALL' ? '반별 유실항목 집계 (감지기 · 유도등 · 수신기)' : `유실항목별 집계 (${lineFilter})`;
    const lossBody = document.getElementById('wh-loss-body');
    if (lossBody) {
      const renderLossSectionForLine = (targetLine) => {
        const workRows = [];
        const attRows = [];
        let lineWorkSum = 0;
        let lineAttSum = 0;

        cur.lossWork.forEach(r => {
          const val = targetLine === 'ALL' ? r.totalH : (r.byLine[targetLine] || 0);
          if (val > 0) {
            workRows.push({ label: r.label, val });
            lineWorkSum += val;
          }
        });
        cur.lossAtt.forEach(r => {
          const val = targetLine === 'ALL' ? r.totalH : (r.byLine[targetLine] || 0);
          if (val > 0) {
            attRows.push({ label: r.label, val });
            lineAttSum += val;
          }
        });

        workRows.sort((a, b) => b.val - a.val);
        attRows.sort((a, b) => b.val - a.val);

        const renderRows = (rows, totalH, isAtt) => {
          if (rows.length === 0) {
            return '<div style="font-size:11px; color:#94a3b8; padding:4px 4px 6px;">내역 없음</div>';
          }
          return rows.map(r => {
            const pct = totalH > 0 ? (r.val / totalH) * 100 : 0;
            return `
              <div class="wh-loss-row">
                <div class="font-bold">${esc(r.label)}</div>
                <div class="wh-loss-bar-wrap"><div class="wh-loss-bar ${isAtt ? 'is-att' : ''}" style="width:${Math.min(100, pct).toFixed(1)}%"></div></div>
                <div class="text-right font-bold">${formatWhDuration(r.val, unit, 1)}</div>
                <div class="text-right" style="color:#64748b;">${pct.toFixed(0)}%</div>
              </div>
            `;
          }).join('');
        };

        const lineBarColor = targetLine === '감지기반' ? '#ef4444' : (targetLine === '유도등반' ? '#10b981' : '#3b82f6');
        const lineHeader = lineFilter === 'ALL'
          ? `<div class="wh-loss-line-header">
               <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:3px; height:12px; border-radius:2px; background:${lineBarColor};"></span>${esc(targetLine)}</span>
               <span style="font-size:11px; color:#64748b;">작업 <b style="color:#dc2626;">${formatWhDuration(lineWorkSum, unit, 1)}</b> · 근태 <b style="color:#d97706;">${formatWhDuration(lineAttSum, unit, 1)}</b></span>
             </div>`
          : '';

        const workIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>`;
        const attIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

        return `
          <div class="wh-loss-line-block">
            ${lineHeader}
            <div class="wh-loss-section-title">
              <span style="display:inline-flex; align-items:center; gap:5px;">${workIcon}작업 유실</span>
              <span style="color:#dc2626;">${formatWhDuration(lineWorkSum, unit, 1)}</span>
            </div>
            ${renderRows(workRows, lineWorkSum, false)}
            <div class="wh-loss-section-title" style="margin-top:8px;">
              <span style="display:inline-flex; align-items:center; gap:5px;">${attIcon}근태 유실</span>
              <span style="color:#d97706;">${formatWhDuration(lineAttSum, unit, 1)}</span>
            </div>
            ${renderRows(attRows, lineAttSum, true)}
          </div>
        `;
      };

      if (lineFilter === 'ALL') {
        const targetLines = ['감지기반', '유도등반', '수신기반'];
        lossBody.innerHTML = targetLines.map(ln => renderLossSectionForLine(ln)).join('');
      } else {
        lossBody.innerHTML = renderLossSectionForLine(lineFilter);
      }
    }

    // 하단 작업자별 월간 투입공수 집계표
    const wTbody = document.getElementById('wh-worker-tbody');
    const wTfoot = document.getElementById('wh-worker-tfoot');
    if (wTbody) {
      let sA = 0, sI = 0, sP = 0, sM = 0, sAct = 0, sLoss = 0, sTot = 0;
      wTbody.innerHTML = cur.workerList.map((w, idx) => {
        sA += w.aH; sI += w.iH; sP += w.pH; sM += w.mH; sAct += w.actH; sLoss += w.lossH; sTot += w.totalH;
        return `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td class="font-bold text-center">${esc(w.name)}</td>
            <td class="text-center">${esc(w.line)}</td>
            <td class="text-center">${esc(w.type)}</td>
            <td class="num-cell text-right">${formatWhDuration(w.aH, unit, 1)}</td>
            <td class="num-cell text-right">${formatWhDuration(w.iH, unit, 1)}</td>
            <td class="num-cell text-right">${formatWhDuration(w.pH, unit, 1)}</td>
            <td class="num-cell text-right">${formatWhDuration(w.mH, unit, 1)}</td>
            <td class="num-cell text-right font-bold">${formatWhDuration(w.actH, unit, 1)}</td>
            <td class="num-cell text-right" style="color:#dc2626;">${formatWhDuration(w.lossH, unit, 1)}</td>
            <td class="num-cell text-right font-bold text-primary">${formatWhDuration(w.totalH, unit, 1)}</td>
            <td class="text-center">${w.days.size}일</td>
          </tr>
        `;
      }).join('');
      if (wTfoot) {
        wTfoot.innerHTML = `<td colspan="4" class="summary-label text-center">합계</td><td class="num-cell text-right font-bold">${formatWhDuration(sA, unit, 1)}</td><td class="num-cell text-right font-bold">${formatWhDuration(sI, unit, 1)}</td><td class="num-cell text-right font-bold">${formatWhDuration(sP, unit, 1)}</td><td class="num-cell text-right font-bold">${formatWhDuration(sM, unit, 1)}</td><td class="num-cell text-right font-bold">${formatWhDuration(sAct, unit, 1)}</td><td class="num-cell text-right font-bold" style="color:#dc2626;">${formatWhDuration(sLoss, unit, 1)}</td><td class="num-cell text-right font-bold text-primary">${formatWhDuration(sTot, unit, 1)}</td><td></td>`;
      }
    }
  }

  function exportWorkhoursCsv() {
    const monthStr = state.whMonth || getTodayDateString().slice(0, 7);
    const lineFilter = state.whLineFilter || 'ALL';
    const cur = computeMonthWorkhours(monthStr, lineFilter, !!state.whIncludeAttLoss);
    const rows = [
      ['월', '작업반', '구분', '집계품목명', '조립실적', '검사실적', '포장실적', 'ST조립(s)', 'ST검사(s)', 'ST포장(s)', '표준공수(H)', '실동공수(H)', 'S/T효율(%)']
    ];
    cur.list.forEach(it => {
      const eff = it.actualHours > 0 && it.stdH > 0 ? ((it.stdH / it.actualHours) * 100).toFixed(1) : '';
      rows.push([
        monthStr, it.line, it.isUnmapped ? '미설정' : (it.isGroup ? '묶음' : '단일'),
        it.name, it.aQty, it.iQty, it.pQty,
        it.stItem.stAssembly || 0, it.stItem.stInspect || 0, it.stItem.stPack || 0,
        it.stdH.toFixed(2), it.actualHours.toFixed(2), eff
      ]);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `공수집계_${monthStr}_${lineFilter}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // [ST · 공수 기준 설정] 모달 상태 및 렌더링
  let stModalState = { lineFilter: 'ALL', filter: 'ALL', search: '', selectedId: null, showAllLineCodes: false, draft: null };

  function openStConfigModal(initialFilter = 'ALL', focusCode = null) {
    const modal = document.getElementById('modal-st-config');
    if (!modal) return;
    stModalState.draft = normalizeStConfig(state.stConfig);
    stModalState.lineFilter = state.whLineFilter || 'ALL';
    stModalState.filter = initialFilter || 'ALL';
    stModalState.search = '';
    stModalState.showAllLineCodes = false;
    if (focusCode) {
      stModalState.lineFilter = 'ALL';
      stModalState.filter = 'unmapped';
      stModalState.search = focusCode;
    }
    const sInput = document.getElementById('st-cfg-search');
    if (sInput) sInput.value = stModalState.search;
    stModalState.selectedId = stModalState.draft.items[0]?.id || null;
    modal.style.display = 'flex';
    renderStConfigModal();
  }

  function renderStConfigModal(preservePicker = false) {
    const esc = escapeHtmlPlan;
    const draft = stModalState.draft;
    if (!draft) return;
    const prevListEl = document.getElementById('st-cfg-list');
    const prevPickerEl = document.getElementById('st-code-picker');
    const prevPickerSearchEl = document.getElementById('st-code-picker-search');
    const savedListScroll = preservePicker && prevListEl ? prevListEl.scrollTop : 0;
    const savedPickerScroll = preservePicker && prevPickerEl ? prevPickerEl.scrollTop : 0;
    const savedPickerSearch = preservePicker && prevPickerSearchEl ? prevPickerSearchEl.value : '';
    const masterItems = state.certMasterItems || [];
    const excludedSet = new Set(draft.excludedCodes || []);
    const mappedSet = new Set();
    draft.items.forEach(it => (it.codes || []).forEach(c => mappedSet.add(c)));
    const lineFilter = stModalState.lineFilter || 'ALL';
    const unmappedMaster = masterItems.filter(m =>
      m.code && !mappedSet.has(m.code) && !excludedSet.has(m.code) &&
      (lineFilter === 'ALL' || (m.group || '').trim() === lineFilter)
    );

    document.querySelectorAll('#st-cfg-line-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === lineFilter);
    });
    document.querySelectorAll('#st-cfg-filter-group .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === stModalState.filter);
    });

    const listEl = document.getElementById('st-cfg-list');
    const editEl = document.getElementById('st-cfg-edit-pane');
    if (!listEl || !editEl) return;
    const kw = (stModalState.search || '').trim().toLowerCase();

    if (stModalState.filter === 'unmapped') {
      const filtered = unmappedMaster.filter(m => !kw || (m.code + m.name + (m.altName || '')).toLowerCase().includes(kw));
      listEl.innerHTML = filtered.length === 0
        ? '<div style="padding:20px; text-align:center; color:#94a3b8;">미설정 품목이 없습니다.</div>'
        : filtered.map(m => `
          <div class="wh-st-list-item">
            <div>
              <div class="font-bold">${esc(m.altName || m.name)}</div>
              <div style="font-size:11px; color:#64748b;"><code>${esc(m.code)}</code> · ${esc(m.group)}</div>
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" class="btn btn-xs btn-primary btn-st-add-single" data-code="${esc(m.code)}">단일추가</button>
              <button type="button" class="btn btn-xs btn-outline btn-st-exclude" data-code="${esc(m.code)}">제외</button>
            </div>
          </div>
        `).join('');
      editEl.innerHTML = `<div style="padding:20px;"><h4>미설정 품목 안내 (${unmappedMaster.length}건)</h4><p style="font-size:12.5px; color:var(--text-secondary); line-height:1.6;">• <b>[단일추가]</b>를 누르면 해당 품목을 독립 공수항목으로 바로 추가합니다.<br>• 기존 <b>묶음</b> 항목에 포함시키려면 상단 필터에서 <b>[묶음]</b>을 선택한 뒤 우측 품목 체크박스에서 체크해 주세요.<br>• 외주품 등 공수를 측정하지 않는 품목은 <b>[제외]</b>를 누르면 알림과 집계에서 제외됩니다.</p></div>`;
      return;
    }

    if (stModalState.filter === 'excluded') {
      const filtered = (draft.excludedCodes || []).filter(c => {
        const m = masterItems.find(x => x.code === c);
        if (lineFilter !== 'ALL' && (m?.group || '').trim() !== lineFilter) return false;
        return !kw || c.toLowerCase().includes(kw) || ((m?.name || '') + (m?.altName || '')).toLowerCase().includes(kw);
      });
      listEl.innerHTML = filtered.length === 0
        ? '<div style="padding:20px; text-align:center; color:#94a3b8;">제외된 품목이 없습니다.</div>'
        : filtered.map(c => {
          const m = masterItems.find(x => x.code === c) || {};
          return `
            <div class="wh-st-list-item">
              <div>
                <div class="font-bold">${esc(m.altName || m.name || c)}</div>
                <div style="font-size:11px; color:#64748b;"><code>${esc(c)}</code> · ${esc(m.group || '-')}</div>
              </div>
              <button type="button" class="btn btn-xs btn-outline btn-st-unexclude" data-code="${esc(c)}">제외해제</button>
            </div>
          `;
        }).join('');
      editEl.innerHTML = `<div style="padding:20px;"><h4>공수 제외 품목 (${filtered.length}건)</h4><p style="font-size:12.5px; color:var(--text-secondary);">외주품이나 공수 미측정 품목 목록입니다. [제외해제]를 누르면 다시 미설정 상태가 되어 단일/묶음으로 지정할 수 있습니다.</p></div>`;
      return;
    }

    const items = draft.items.filter(it => {
      if (lineFilter !== 'ALL' && (it.line || '').trim() !== lineFilter) return false;
      if (stModalState.filter === 'single' && it.mode !== 'single') return false;
      if (stModalState.filter === 'group' && it.mode !== 'group') return false;
      if (kw) {
        const hitName = (it.name + it.line).toLowerCase().includes(kw);
        const hitCode = (it.codes || []).some(c => c.toLowerCase().includes(kw));
        if (!hitName && !hitCode) return false;
      }
      return true;
    });

    const curItem = items.find(it => it.id === stModalState.selectedId) || items[0] || null;
    if (curItem) stModalState.selectedId = curItem.id;

    listEl.innerHTML = items.length === 0
      ? '<div style="padding:20px; text-align:center; color:#94a3b8;">해당 작업반에 등록된 항목이 없습니다.</div>'
      : items.map(it => {
        const sumSt = (Number(it.stAssembly) + Number(it.stInspect) + Number(it.stPack)).toFixed(2);
        const activeCls = it.id === stModalState.selectedId ? 'active' : '';
        const badge = it.mode === 'group' ? `<span class="wh-badge wh-badge-group">묶음 ${(it.codes || []).length}</span>` : '<span class="wh-badge wh-badge-single">단일</span>';
        return `
          <div class="wh-st-list-item ${activeCls}" data-st-id="${esc(it.id)}">
            <div style="min-width:0; flex:1;">
              <div class="font-bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.name)}</div>
              <div style="font-size:11px; color:#64748b;">${esc(it.line)} · 합계 ${sumSt}s</div>
            </div>
            ${badge}
          </div>
        `;
      }).join('');

    if (!curItem) {
      editEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:60px 20px;">좌측에서 항목을 선택하거나 [+ 새 항목]을 추가하세요.</div>';
      return;
    }
    const sumSt = (Number(curItem.stAssembly) + Number(curItem.stInspect) + Number(curItem.stPack)).toFixed(2);
    const curCodes = new Set(curItem.codes || []);
    const pickerItems = stModalState.showAllLineCodes
      ? masterItems
      : masterItems.filter(m => curCodes.has(m.code) || (m.group || '').trim() === curItem.line);

    editEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid var(--border-light);">
        <h4 style="margin:0; font-size:14px;">항목 상세 편집</h4>
        <button type="button" class="btn btn-xs btn-outline" id="btn-st-delete-item" style="color:#dc2626; border-color:#fca5a5;">🗑 항목 삭제</button>
      </div>
      <div class="wh-st-form-grid">
        <div class="wh-st-field">
          <label for="st-edit-name">집계 품목명</label>
          <input type="text" id="st-edit-name" class="form-input form-input-sm" value="${esc(curItem.name)}">
        </div>
        <div class="wh-st-field">
          <label for="st-edit-line">작업반</label>
          <select id="st-edit-line" class="form-select form-select-sm">
            <option value="감지기반" ${curItem.line === '감지기반' ? 'selected' : ''}>감지기반</option>
            <option value="유도등반" ${curItem.line === '유도등반' ? 'selected' : ''}>유도등반</option>
            <option value="수신기반" ${curItem.line === '수신기반' ? 'selected' : ''}>수신기반</option>
          </select>
        </div>
        <div class="wh-st-field">
          <label for="st-edit-mode">집계 유형</label>
          <select id="st-edit-mode" class="form-select form-select-sm">
            <option value="single" ${curItem.mode === 'single' ? 'selected' : ''}>단일 (1:1)</option>
            <option value="group" ${curItem.mode === 'group' ? 'selected' : ''}>묶음 (1:N)</option>
          </select>
        </div>
      </div>

      <div class="wh-st-st-grid">
        <div class="wh-st-field">
          <label for="st-edit-asm">ST 조립 (초)</label>
          <input type="number" step="0.01" min="0" id="st-edit-asm" class="form-input form-input-sm text-right" value="${curItem.stAssembly}">
        </div>
        <div class="wh-st-field">
          <label for="st-edit-ins">ST 검사 (초)</label>
          <input type="number" step="0.01" min="0" id="st-edit-ins" class="form-input form-input-sm text-right" value="${curItem.stInspect}">
        </div>
        <div class="wh-st-field">
          <label for="st-edit-pack">ST 포장 (초)</label>
          <input type="number" step="0.01" min="0" id="st-edit-pack" class="form-input form-input-sm text-right" value="${curItem.stPack}">
        </div>
        <div class="wh-st-field">
          <label>총 ST (초)</label>
          <div id="st-edit-total" class="wh-st-total-box">${sumSt}s</div>
        </div>
      </div>

      <div class="wh-st-picker-head">
        <label style="font-size:12px; font-weight:700;">소속 품목코드 선택 (${curCodes.size}개 선택 · ${esc(curItem.line)} ${pickerItems.length}종)</label>
        <div style="display:flex; align-items:center; gap:8px;">
          <label style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; color:var(--text-secondary); cursor:pointer;">
            <input type="checkbox" id="st-show-all-line-codes" ${stModalState.showAllLineCodes ? 'checked' : ''}> 타반 포함
          </label>
          <input type="text" id="st-code-picker-search" class="form-input form-input-sm" placeholder="품목코드/품명 필터..." style="width:190px;">
        </div>
      </div>
      <div class="wh-st-code-picker" id="st-code-picker">
        ${pickerItems.map(m => {
          const checked = curCodes.has(m.code) ? 'checked' : '';
          const otherMapped = !curCodes.has(m.code) && mappedSet.has(m.code) ? '<span style="font-size:10px; color:#94a3b8;">(타항목)</span>' : '';
          return `
            <label class="wh-st-code-row" data-search="${esc((m.code + ' ' + (m.altName || '') + ' ' + m.name + ' ' + m.group).toLowerCase())}">
              <input type="checkbox" class="st-code-chk" value="${esc(m.code)}" ${checked}>
              <code style="min-width:92px;">${esc(m.code)}</code>
              <span style="flex:1;">${esc(m.altName || m.name)}</span>
              <span style="font-size:11px; color:#64748b;">${esc(m.group)}</span>
              ${otherMapped}
            </label>
          `;
        }).join('')}
      </div>
    `;

    if (preservePicker) {
      const newListEl = document.getElementById('st-cfg-list');
      const newPickerEl = document.getElementById('st-code-picker');
      const newPickerSearchEl = document.getElementById('st-code-picker-search');
      if (newListEl) newListEl.scrollTop = savedListScroll;
      if (newPickerSearchEl && savedPickerSearch) {
        newPickerSearchEl.value = savedPickerSearch;
        const q = savedPickerSearch.trim().toLowerCase();
        editEl.querySelectorAll('.wh-st-code-row').forEach(r => {
          r.style.display = !q || (r.dataset.search || '').includes(q) ? 'flex' : 'none';
        });
      }
      if (newPickerEl) newPickerEl.scrollTop = savedPickerScroll;
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
        renderMasterWorkers();
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

    // 설정: 품목정보 전체 편집모드 (편집 / 저장 / 취소 / 행별 X 삭제)
    let certMasterEditSnapshot = null;

    document.getElementById('btn-cert-selected-edit')?.addEventListener('click', () => {
      certMasterEditSnapshot = JSON.parse(JSON.stringify(state.certMasterItems || []));
      state.certMasterEditMode = true;
      renderCertMasterTable();
    });

    document.getElementById('btn-cert-inline-save')?.addEventListener('click', () => {
      saveLocalCertData();
      saveCertDataToDb(true);
      syncMasterChangesToAllViews();
      certMasterEditSnapshot = null;
      state.certMasterEditMode = false;
      renderCertMasterTable();
      showToast('품목정보가 저장되고 전체 화면에 동기화되었습니다.');
    });

    document.getElementById('btn-cert-inline-cancel')?.addEventListener('click', () => {
      if (certMasterEditSnapshot) {
        state.certMasterItems = certMasterEditSnapshot;
        certMasterEditSnapshot = null;
      }
      state.certMasterEditMode = false;
      renderCertMasterTable();
    });

    const masterTbody = document.getElementById('master-cert-items-tbody');
    if (masterTbody) {
      const syncMasterEditField = (e) => {
        if (!state.certMasterEditMode) return;
        const el = e.target.closest('[data-f]');
        const tr = e.target.closest('tr');
        if (!el || !tr) return;
        const item = (state.certMasterItems || []).find(i => i.id === tr.dataset.id);
        if (!item) return;
        item[el.dataset.f] = el.value.trim();
      };
      masterTbody.addEventListener('input', syncMasterEditField);
      masterTbody.addEventListener('change', syncMasterEditField);

      masterTbody.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-cert-row-del-x');
        if (!delBtn) return;
        const id = delBtn.dataset.id;
        state.certMasterItems = (state.certMasterItems || []).filter(i => i.id !== id);
        renderCertMasterTable();
      });
    }

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

    async function exportDailyReportsYearExcel() {
      if (!window.XLSXEngine || typeof window.XLSXEngine.exportMultiSheetWorkbook !== 'function') {
        alert('엑셀 내보내기 엔진을 찾을 수 없습니다.');
        return;
      }

      const targetYear = String(state.productionDate || getTodayDateString()).slice(0, 4);
      showToast(`${targetYear}년 생산일보 데이터를 불러오는 중...`);

      const byDate = new Map();

      // 1) Firestore 1년치 조회
      if (isFirestoreActive && db) {
        try {
          const snap = await db.collection('pms_daily_v2')
            .where('date', '>=', `${targetYear}-01-01`)
            .where('date', '<=', `${targetYear}-12-31`)
            .get();
          snap.forEach(doc => {
            const data = doc.data();
            const dStr = data?.date || doc.id;
            if (dStr && String(dStr).startsWith(`${targetYear}-`)) {
              byDate.set(dStr, normalizeDailyV2(data));
            }
          });
        } catch (err) {
          console.warn(`연간 생산일보(${targetYear}) Firestore 조회 실패 (로컬 데이터 사용):`, err);
        }
      }

      // 2) 로컬 저장소 병합
      try {
        const prefix = STORAGE_KEYS.DAILY_V2_PREFIX + `${targetYear}-`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith(prefix)) continue;
          const dStr = k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length);
          const raw = localStorage.getItem(k);
          if (raw) {
            const norm = normalizeDailyV2(JSON.parse(raw));
            if (norm.entries && norm.entries.length > 0) {
              byDate.set(dStr, norm);
            }
          }
        }
      } catch (e) { /* ignore */ }

      // 3) 현재 화면에 열려 있는 날짜(미저장 포함) 반영
      if (state.productionDate && String(state.productionDate).startsWith(`${targetYear}-`) && state.dailyV2Data) {
        byDate.set(state.productionDate, normalizeDailyV2(state.dailyV2Data));
      }

      const sortedDates = Array.from(byDate.keys()).sort();
      const allWorkers = (state.workers || []).filter(w => isDirectManufacturingWorker(w));
      const workerById = new Map((state.workers || []).map(w => [w.id, w]));

      const sheets = INSP_LINES.map(lineName => {
        const lineEntries = [];
        const usedWorkerIds = new Set();

        sortedDates.forEach(dStr => {
          const dayData = byDate.get(dStr);
          if (!dayData || !Array.isArray(dayData.entries)) return;
          dayData.entries.forEach(ent => {
            if ((ent.line || '감지기반') !== lineName) return;
            const actQty = parseSafeInt(ent.actualQty);
            const targetQty = parseSafeInt(ent.targetQty);
            const whMap = ent.workerHours || {};
            let rowHours = 0;
            Object.entries(whMap).forEach(([wId, hv]) => {
              const h = parseFloat(hv) || 0;
              if (h > 0) {
                rowHours += h;
                usedWorkerIds.add(wId);
              }
            });
            if (!ent.isLoss && !ent.name && !ent.code && actQty === 0 && targetQty === 0 && rowHours === 0) return;
            lineEntries.push({ dateStr: dStr, ent, actQty, targetQty, rowHours });
          });
        });

        // 해당 반 고정 작업자 + 연간 투입된 지원/기타 작업자
        const fixedWorkers = allWorkers.filter(w => (w.group || '감지기반') === lineName);
        const fixedIdSet = new Set(fixedWorkers.map(w => w.id));
        const extraWorkers = [];
        usedWorkerIds.forEach(wId => {
          if (fixedIdSet.has(wId)) return;
          const wObj = workerById.get(wId);
          extraWorkers.push(wObj
            ? { ...wObj, _isSupport: true }
            : { id: wId, name: wId, group: '기타', _isSupport: true });
        });
        const sheetWorkers = [...fixedWorkers, ...extraWorkers];

        const headers = [
          'No', '날짜', '품명', '로트', '공정', '작업내용', '계획수량', '실적수량',
          ...sheetWorkers.map(w => w._isSupport ? `[지원] ${w.name}` : w.name),
          '공수합계'
        ];
        const colWidths = [
          36, 84, 175, 74, 72, 130, 68, 68,
          ...sheetWorkers.map(() => 62),
          72
        ];

        const rows = [];
        rows.push({
          height: 28,
          cells: [{ v: `${targetYear}년 ${lineName} 생산일보`, style: 'Title', mergeAcross: headers.length - 1 }]
        });
        rows.push({
          height: 24,
          cells: headers.map(h => ({ v: h, style: 'Th' }))
        });

        let sumTarget = 0;
        let sumActual = 0;
        let sumTotalHours = 0;
        const workerTotals = new Array(sheetWorkers.length).fill(0);

        if (lineEntries.length === 0) {
          rows.push({
            height: 24,
            cells: [{ v: `${targetYear}년 작성된 ${lineName} 생산일보 데이터가 없습니다.`, style: 'CellCenter', mergeAcross: headers.length - 1 }]
          });
        } else {
          lineEntries.forEach((item, idx) => {
            const { dateStr, ent, actQty, targetQty, rowHours } = item;
            const dispName = ent.isLoss ? (ent.name || '-') : (getDisplayNameByCode(ent.code, ent.name) || '-');
            const procLabel = ent.isLoss
              ? (ent.lossLabel || (ent.procs && ent.procs[0]) || '유실')
              : ((ent.procs && ent.procs.length > 0 ? ent.procs : ['assembly']).map(p => PROC_LABELS[p] || p).join('+'));

            if (!ent.isLoss) {
              sumTarget += targetQty;
              sumActual += actQty;
            }
            sumTotalHours += rowHours;

            const workerCells = sheetWorkers.map((w, wIdx) => {
              const h = parseFloat(ent.workerHours && ent.workerHours[w.id]) || 0;
              if (h > 0) {
                workerTotals[wIdx] += h;
                return { v: Number(h.toFixed(1)), style: 'CellHour' };
              }
              return { v: '', style: 'CellHour' };
            });

            rows.push({
              height: 20,
              cells: [
                { v: idx + 1, style: 'CellCenter' },
                { v: dateStr, style: 'CellCenter' },
                { v: dispName, style: 'CellText' },
                { v: ent.lotNo || '-', style: 'CellCenter' },
                { v: procLabel, style: 'CellCenter' },
                { v: ent.note || '', style: 'CellText' },
                { v: targetQty > 0 ? targetQty : '', style: 'CellNum' },
                { v: (!ent.isLoss && actQty > 0) ? actQty : '', style: 'CellNum' },
                ...workerCells,
                { v: rowHours > 0 ? Number(rowHours.toFixed(1)) : '', style: 'CellHour' }
              ]
            });
          });

          rows.push({
            height: 22,
            cells: [
              { v: `합계 (${lineEntries.length}건)`, style: 'SumText', mergeAcross: 5 },
              { v: sumTarget, style: 'SumNum' },
              { v: sumActual, style: 'SumNum' },
              ...workerTotals.map(t => ({ v: t > 0 ? Number(t.toFixed(1)) : 0, style: 'SumHour' })),
              { v: Number(sumTotalHours.toFixed(1)), style: 'SumHour' }
            ]
          });
        }

        return { name: lineName, colWidths, rows };
      });

      window.XLSXEngine.exportMultiSheetWorkbook(sheets, `생산일보_${targetYear}년.xls`);
      showToast(`${targetYear}년 반별 생산일보 엑셀이 다운로드되었습니다.`);
    }

    document.getElementById('btn-prod-export-excel')?.addEventListener('click', exportDailyReportsYearExcel);

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

    // 공수집계 리뉴얼 필터 및 컨트롤
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
    document.querySelectorAll('#wh-unit-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.whUnit = btn.dataset.unit || 'H';
        renderWorkhoursView();
      });
    });
    document.getElementById('wh-include-att-loss')?.addEventListener('change', (e) => {
      state.whIncludeAttLoss = !!e.target.checked;
      try { localStorage.setItem('pms_wh_include_att_loss', state.whIncludeAttLoss ? '1' : '0'); } catch (err) {}
      renderWorkhoursView();
    });
    document.getElementById('wh-item-search')?.addEventListener('input', (e) => {
      state.whItemSearch = e.target.value;
      renderWorkhoursView();
    });
    document.getElementById('wh-target-eff')?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v) && v >= 10 && v <= 300) {
        state.whTargetEff = v;
        if ((state.whAggDisplayMode || 'qty') === 'est') {
          renderWorkhoursView();
        }
      }
    });
    document.getElementById('wh-target-eff')?.addEventListener('change', (e) => {
      const v = Math.max(10, Math.min(300, parseFloat(e.target.value) || 100));
      state.whTargetEff = v;
      e.target.value = String(v);
      if ((state.whAggDisplayMode || 'qty') === 'qty') {
        state.whAggDisplayMode = 'est';
      }
      renderWorkhoursView();
    });
    document.getElementById('btn-wh-save-target-eff')?.addEventListener('click', async () => {
      if (isGuestReadOnly(true)) return;
      const inp = document.getElementById('wh-target-eff');
      const v = Math.max(10, Math.min(300, parseFloat(inp ? inp.value : state.whTargetEff) || 100));
      state.whTargetEff = v;
      if (inp) inp.value = String(v);
      if (!state.stConfig) state.stConfig = getDefaultStConfig();
      state.stConfig.targetEff = v;
      await saveStConfigToDb(true);
      renderWorkhoursView();
      showToast(`목표효율(${v}%)이 저장되었습니다.`);
    });
    document.getElementById('btn-wh-st-mode')?.addEventListener('click', () => {
      const curMode = state.whAggDisplayMode || 'qty';
      state.whAggDisplayMode = curMode === 'qty' ? 'st' : (curMode === 'st' ? 'est' : 'qty');
      renderWorkhoursView();
    });

    const openWhAnomaliesModal = (filterKey) => {
      const modal = document.getElementById('modal-wh-anomalies');
      const listEl = document.getElementById('wh-anomalies-list');
      if (!modal || !listEl) return;
      const items = filterKey
        ? (state.whLastAnomaliesByKey?.get(filterKey) || [])
        : (state.whLastAnomalies || []);
      if (items.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);">감지된 이상 일보 내역이 없습니다.</div>';
      } else {
        listEl.innerHTML = items.map(a => `
          <div class="wh-anomaly-item" data-date="${escapeHtmlPlan(a.dateStr)}" data-line="${escapeHtmlPlan(a.line)}">
            <div>
              <div style="font-size:12.5px; font-weight:700; color:var(--text-main);">
                ${escapeHtmlPlan(a.dateStr)} · ${escapeHtmlPlan(a.line)} · ${escapeHtmlPlan(a.itemName)}
              </div>
              <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
                수량: <b>${a.qty.toLocaleString()}</b> · 실동공수: <b>${a.actualH.toFixed(1)}h</b> ·
                <span style="color:${a.severity === 'err' ? '#dc2626' : '#d97706'}; font-weight:700;">${escapeHtmlPlan(a.reason)}</span>
              </div>
            </div>
            <span class="btn btn-xs btn-outline" style="flex-shrink:0;">일보 이동 →</span>
          </div>
        `).join('');
      }
      modal.style.display = 'flex';
    };

    const closeWhAnomaliesModal = () => {
      const modal = document.getElementById('modal-wh-anomalies');
      if (modal) modal.style.display = 'none';
    };
    document.getElementById('btn-wh-anomaly-alert')?.addEventListener('click', () => openWhAnomaliesModal(null));
    document.getElementById('btn-close-wh-anomalies')?.addEventListener('click', closeWhAnomaliesModal);
    document.getElementById('btn-cancel-wh-anomalies')?.addEventListener('click', closeWhAnomaliesModal);
    document.getElementById('wh-anomalies-list')?.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.wh-anomaly-item');
      if (!itemEl) return;
      const dateStr = itemEl.dataset.date;
      const lineStr = itemEl.dataset.line;
      if (!dateStr) return;
      closeWhAnomaliesModal();
      state.productionDate = dateStr;
      try { localStorage.setItem(STORAGE_KEYS.LAST_PROD_DATE, dateStr); } catch (err) {}
      if (!state.activeLines) state.activeLines = {};
      state.activeLines.daily = 'daily';
      await activateTab('tab-production');
      showToast(`${dateStr}${lineStr ? ` (${lineStr})` : ''} 생산일보로 이동했습니다.`);
    });

    document.getElementById('btn-wh-export-csv')?.addEventListener('click', exportWorkhoursCsv);
    document.getElementById('btn-wh-st-config')?.addEventListener('click', () => openStConfigModal('ALL'));
    document.getElementById('btn-wh-unmapped-alert')?.addEventListener('click', () => openStConfigModal('unmapped'));

    // 공수집계 테이블 아코디언 드릴다운 & 빠른 미설정 지정 & 이상 일보 확인
    document.getElementById('wh-st-tbody')?.addEventListener('click', (e) => {
      const anomBtn = e.target.closest('.wh-anomaly-pill');
      if (anomBtn) {
        e.stopPropagation();
        openWhAnomaliesModal(anomBtn.dataset.whKey || null);
        return;
      }
      const quickBtn = e.target.closest('.btn-wh-quick-map');
      if (quickBtn) {
        e.stopPropagation();
        openStConfigModal('unmapped', quickBtn.dataset.code);
        return;
      }
      const grpRow = e.target.closest('tr.wh-group-row');
      if (grpRow && grpRow.dataset.whKey) {
        if (!state.whExpandedGroups) state.whExpandedGroups = new Set();
        const k = grpRow.dataset.whKey;
        if (state.whExpandedGroups.has(k)) state.whExpandedGroups.delete(k);
        else state.whExpandedGroups.add(k);
        renderWorkhoursView();
      }
    });

    // [ST · 공수 기준 설정] 모달 이벤트
    const stModal = document.getElementById('modal-st-config');
    const closeStModal = () => { if (stModal) stModal.style.display = 'none'; };
    document.getElementById('btn-close-st-config')?.addEventListener('click', closeStModal);
    document.getElementById('btn-cancel-st-config')?.addEventListener('click', closeStModal);

    document.querySelectorAll('#st-cfg-line-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        stModalState.lineFilter = btn.dataset.line || 'ALL';
        renderStConfigModal();
      });
    });
    document.querySelectorAll('#st-cfg-filter-group .plan-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        stModalState.filter = btn.dataset.filter || 'ALL';
        renderStConfigModal();
      });
    });
    document.getElementById('st-cfg-search')?.addEventListener('input', (e) => {
      stModalState.search = e.target.value;
      renderStConfigModal();
    });
    document.getElementById('btn-st-cfg-add')?.addEventListener('click', () => {
      if (!stModalState.draft) return;
      const newId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      stModalState.draft.items.unshift({
        id: newId,
        line: state.whLineFilter && state.whLineFilter !== 'ALL' ? state.whLineFilter : '감지기반',
        name: '신규 공수 항목',
        mode: 'single',
        codes: [],
        stAssembly: 0,
        stInspect: 0,
        stPack: 0
      });
      stModalState.filter = 'ALL';
      stModalState.selectedId = newId;
      renderStConfigModal();
    });
    document.getElementById('btn-st-cfg-reset')?.addEventListener('click', () => {
      if (!confirm('구글 시트 기반 초기 54종 매핑 및 예측 ST로 되돌리시겠습니까?')) return;
      stModalState.draft = getDefaultStConfig();
      stModalState.selectedId = stModalState.draft.items[0]?.id || null;
      renderStConfigModal();
      showToast('초기 매핑을 불러왔습니다. [설정 저장]을 누르면 반영됩니다.');
    });
    document.getElementById('btn-st-cfg-download')?.addEventListener('click', () => {
      const draft = stModalState.draft || normalizeStConfig(state.stConfig);
      const rows = [
        ['작업반', '집계유형', '집계품목명', 'ST조립(초)', 'ST검사(초)', 'ST포장(초)', '소속품목코드']
      ];
      (draft.items || []).forEach(it => {
        rows.push([
          it.line || '감지기반',
          it.mode === 'group' ? '묶음' : '단일',
          it.name || '',
          it.stAssembly || 0,
          it.stInspect || 0,
          it.stPack || 0,
          (it.codes || []).join(', ')
        ]);
      });
      if ((draft.excludedCodes || []).length > 0) {
        rows.push(['-', '제외', '공수제외품목', 0, 0, 0, (draft.excludedCodes || []).join(', ')]);
      }
      const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ST_공수기준_양식_${getTodayDateString()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('ST 기준 양식을 다운로드했습니다.');
    });
    document.getElementById('btn-st-cfg-upload')?.addEventListener('click', () => {
      const inp = document.getElementById('st-cfg-upload-input');
      if (inp) { inp.value = ''; inp.click(); }
    });
    document.getElementById('st-cfg-upload-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!window.XLSXEngine || typeof window.XLSXEngine.parseSpreadsheetFile !== 'function') {
        alert('스프레드시트 파서(XLSXEngine)를 찾을 수 없습니다.');
        return;
      }
      try {
        const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
        const rows = parsed?.data || [];
        if (rows.length < 2) {
          showToast('업로드 파일에 데이터가 없습니다.');
          return;
        }
        const header = (rows[0] || []).map(h => String(h || '').replace(/\s+/g, '').trim());
        const idxLine = header.findIndex(h => h.includes('작업반'));
        const idxType = header.findIndex(h => h.includes('유형'));
        const idxName = header.findIndex(h => h.includes('품목명') || h.includes('집계'));
        const idxAsm = header.findIndex(h => h.includes('조립'));
        const idxIns = header.findIndex(h => h.includes('검사'));
        const idxPack = header.findIndex(h => h.includes('포장'));
        const idxCodes = header.findIndex(h => h.includes('코드'));

        if (idxName === -1 || idxCodes === -1) {
          alert('양식 헤더(집계품목명, 소속품목코드 등)를 인식할 수 없습니다. [양식 다운받기]로 받은 파일을 사용해 주세요.');
          return;
        }

        const newItems = [];
        const newExcluded = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!Array.isArray(r) || r.every(c => !String(c || '').trim())) continue;
          const rawLine = idxLine >= 0 ? String(r[idxLine] || '').trim() : '감지기반';
          const rawType = idxType >= 0 ? String(r[idxType] || '').trim() : '단일';
          const name = String(r[idxName] || '').trim();
          const codes = String(r[idxCodes] || '').split(/[,;\n\r]+/).map(s => s.trim()).filter(Boolean);

          if (rawType.includes('제외')) {
            codes.forEach(c => { if (!newExcluded.includes(c)) newExcluded.push(c); });
            continue;
          }
          if (!name) continue;
          const line = WH_VALID_LINES.has(rawLine) ? rawLine : '감지기반';
          const stA = idxAsm >= 0 ? (parseFloat(String(r[idxAsm] || '').replace(/,/g, '')) || 0) : 0;
          const stI = idxIns >= 0 ? (parseFloat(String(r[idxIns] || '').replace(/,/g, '')) || 0) : 0;
          const stP = idxPack >= 0 ? (parseFloat(String(r[idxPack] || '').replace(/,/g, '')) || 0) : 0;
          const mode = (rawType.includes('묶음') || codes.length > 1) ? 'group' : 'single';
          newItems.push({
            id: `st_up_${i}_${Date.now().toString(36).slice(-4)}`,
            line, name, mode, codes,
            stAssembly: stA, stInspect: stI, stPack: stP
          });
        }

        if (newItems.length === 0 && newExcluded.length === 0) {
          showToast('반영할 유효한 ST 행이 없습니다.');
          return;
        }
        stModalState.draft = normalizeStConfig({
          items: newItems,
          excludedCodes: newExcluded,
          unexcludedCodes: stModalState.draft?.unexcludedCodes || []
        });
        stModalState.selectedId = stModalState.draft.items[0]?.id || null;
        renderStConfigModal();
        showToast(`${newItems.length}건의 ST 기준을 불러왔습니다. [설정 저장]을 눌러 반영하세요.`);
      } catch (err) {
        console.error('ST 양식 업로드 오류:', err);
        alert('파일을 읽는 중 오류가 발생했습니다. (.xlsx, .xls, .csv 지원)');
      }
    });
    document.getElementById('btn-save-st-config')?.addEventListener('click', async () => {
      if (!stModalState.draft) return;
      state.stConfig = normalizeStConfig(stModalState.draft);
      await saveStConfigToDb(false);
      closeStModal();
      renderWorkhoursView();
    });

    document.getElementById('st-cfg-list')?.addEventListener('click', (e) => {
      const draft = stModalState.draft;
      if (!draft) return;
      const addBtn = e.target.closest('.btn-st-add-single');
      if (addBtn) {
        const code = addBtn.dataset.code;
        const m = (state.certMasterItems || []).find(x => x.code === code) || {};
        const newId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        draft.items.unshift({
          id: newId,
          line: (m.group === '감지기반' || m.group === '유도등반' || m.group === '수신기반') ? m.group : '감지기반',
          name: m.altName || m.name || code,
          mode: 'single',
          codes: [code],
          stAssembly: parseFloat(m.stAssembly) || 0,
          stInspect: parseFloat(m.stInspect) || 0,
          stPack: parseFloat(m.stPack) || 0
        });
        stModalState.filter = 'ALL';
        stModalState.selectedId = newId;
        renderStConfigModal();
        return;
      }
      const exBtn = e.target.closest('.btn-st-exclude');
      if (exBtn) {
        const code = exBtn.dataset.code;
        if (!draft.excludedCodes.includes(code)) draft.excludedCodes.push(code);
        draft.unexcludedCodes = (draft.unexcludedCodes || []).filter(c => c !== code);
        renderStConfigModal();
        return;
      }
      const unexBtn = e.target.closest('.btn-st-unexclude');
      if (unexBtn) {
        const code = unexBtn.dataset.code;
        draft.excludedCodes = draft.excludedCodes.filter(c => c !== code);
        if (!Array.isArray(draft.unexcludedCodes)) draft.unexcludedCodes = [];
        if (!draft.unexcludedCodes.includes(code)) draft.unexcludedCodes.push(code);
        renderStConfigModal();
        return;
      }
      const itemRow = e.target.closest('.wh-st-list-item[data-st-id]');
      if (itemRow) {
        stModalState.selectedId = itemRow.dataset.stId;
        renderStConfigModal();
      }
    });

    const editPane = document.getElementById('st-cfg-edit-pane');
    if (editPane) {
      const syncSelectedFromInputs = () => {
        const cur = stModalState.draft?.items.find(it => it.id === stModalState.selectedId);
        if (!cur) return;
        const nameEl = document.getElementById('st-edit-name');
        const lineEl = document.getElementById('st-edit-line');
        const modeEl = document.getElementById('st-edit-mode');
        const asmEl = document.getElementById('st-edit-asm');
        const insEl = document.getElementById('st-edit-ins');
        const packEl = document.getElementById('st-edit-pack');
        if (nameEl) cur.name = nameEl.value.trim();
        if (lineEl) cur.line = lineEl.value;
        if (modeEl) cur.mode = modeEl.value;
        if (asmEl) cur.stAssembly = parseFloat(asmEl.value) || 0;
        if (insEl) cur.stInspect = parseFloat(insEl.value) || 0;
        if (packEl) cur.stPack = parseFloat(packEl.value) || 0;
        const totEl = document.getElementById('st-edit-total');
        if (totEl) totEl.textContent = `${(cur.stAssembly + cur.stInspect + cur.stPack).toFixed(2)}s`;
      };

      editPane.addEventListener('input', (e) => {
        if (e.target.id === 'st-code-picker-search') {
          const q = e.target.value.trim().toLowerCase();
          editPane.querySelectorAll('.wh-st-code-row').forEach(r => {
            r.style.display = !q || (r.dataset.search || '').includes(q) ? 'flex' : 'none';
          });
          return;
        }
        syncSelectedFromInputs();
      });

      editPane.addEventListener('change', (e) => {
        if (e.target.id === 'st-show-all-line-codes') {
          stModalState.showAllLineCodes = !!e.target.checked;
          renderStConfigModal(true);
          return;
        }
        if (e.target.classList.contains('st-code-chk')) {
          const cur = stModalState.draft?.items.find(it => it.id === stModalState.selectedId);
          if (!cur) return;
          const code = e.target.value;
          if (e.target.checked) {
            // 다른 항목에 매핑되어 있었다면 중복 방지 위해 이동
            stModalState.draft.items.forEach(other => {
              if (other.id !== cur.id) other.codes = (other.codes || []).filter(c => c !== code);
            });
            if (!cur.codes.includes(code)) cur.codes.push(code);
            if (cur.codes.length > 1) cur.mode = 'group';
          } else {
            cur.codes = (cur.codes || []).filter(c => c !== code);
          }
          renderStConfigModal(true);
          return;
        }
        syncSelectedFromInputs();
        if (e.target.id === 'st-edit-line' || e.target.id === 'st-edit-mode') {
          renderStConfigModal();
        }
      });

      editPane.addEventListener('click', (e) => {
        if (e.target.id === 'btn-st-delete-item') {
          if (!stModalState.draft) return;
          stModalState.draft.items = stModalState.draft.items.filter(it => it.id !== stModalState.selectedId);
          stModalState.selectedId = stModalState.draft.items[0]?.id || null;
          renderStConfigModal();
        }
      });
    }
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
    if (isGuestReadOnly(!silent)) return;
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

  function getCalSchedMaxPreview(weekCount) {
    const calBody = document.getElementById('att-cal-body');
    const bodyH = (calBody && calBody.clientHeight > 100)
      ? calBody.clientHeight
      : Math.max(420, window.innerHeight - 230);
    const rowH = bodyH / Math.max(weekCount || 5, 5);
    const availableForChips = rowH - 32;
    return Math.max(2, Math.min(14, Math.floor(availableForChips / 21)));
  }

  function normalizeCalSchedStatus(rawStatus) {
    const s = String(rawStatus || '').trim();
    if (s === '일정완료') return '일정완료';
    if (s === '검정신청' || s === '품검요청') return '검정신청';
    return '등록완료';
  }

  function getCalSchedStatusMeta(status) {
    switch (status) {
      case '일정완료': return { label: '일정완료', dotCls: 'st-done' };
      case '검정신청':
      case '품검요청': return { label: '검정신청', dotCls: 'st-apply' };
      default: return { label: '검정등록', dotCls: 'st-reg' };
    }
  }

  function getCalSchedLineClass(lineName) {
    if (lineName === '감지기반') return 'line-sensor';
    if (lineName === '유도등반') return 'line-guide';
    if (lineName === '수신기반') return 'line-receiver';
    return '';
  }

  function collectScheduleCalendarData() {
    const certMap = new Map((state.certSavedRows || []).map(r => [r.id, r]));
    const masterMap = new Map((state.certMasterItems || []).map(it => [it.code, it]));
    const dailyActualMap = typeof aggregateDailyActualsByCertRow === 'function' ? aggregateDailyActualsByCertRow() : {};
    const dateMap = new Map();

    // localStorage의 모든 pms_insp_v2_ 주차 데이터 수집
    const allWeekPlans = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.INSP_V2_PREFIX)) continue;
      const weekDate = k.slice(STORAGE_KEYS.INSP_V2_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        if (parsed && parsed.items) {
          allWeekPlans.set(weekDate, parsed.items);
        }
      } catch (e) { /* ignore */ }
    }

    // 현재 메모리에 열려 있는 일정계획이 있으면 최신 반영
    if (state.inspectionTargetDate && state.inspV2Data && state.inspV2Data.items) {
      allWeekPlans.set(state.inspectionTargetDate, state.inspV2Data.items);
    }

    allWeekPlans.forEach((itemsObj, weekDate) => {
      Object.entries(itemsObj).forEach(([certRowId, itemState]) => {
        const cRow = certMap.get(certRowId);
        if (!cRow || !itemState || !itemState.dailyPlans) return;

        const excl = itemState.excludedProcs || {};
        const mItem = masterMap.get(cRow.code) || {};
        const lineName = String(cRow.group || mItem.group || '기타').trim();
        const itemGroup = String(mItem.itemGroup || cRow.itemGroup || '기타').trim() || '기타';
        const dispName = (typeof getDisplayItemName === 'function' ? getDisplayItemName(mItem) : '') || cRow.name || cRow.code || '-';
        const status = normalizeCalSchedStatus(cRow.status);

        // 대표 공정 결정 (조립 우선, 제외 시 검사 -> 포장)
        let repProc = 'assembly';
        if (excl.assembly) {
          if (!excl.inspect) repProc = 'inspect';
          else if (!excl.pack) repProc = 'pack';
        }

        Object.entries(itemState.dailyPlans).forEach(([ds, pObj]) => {
          if (!pObj || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
          const planQty = parseSafeInt(pObj[repProc]);
          if (planQty <= 0) return;

          const actualQty = parseSafeInt(dailyActualMap[certRowId]?.[ds]?.[repProc]);
          if (!dateMap.has(ds)) dateMap.set(ds, []);
          dateMap.get(ds).push({
            certRowId,
            weekDate,
            lineName,
            itemGroup,
            code: cRow.code || '',
            name: dispName,
            site: String(cRow.site || '').trim(),
            lotNo: String(cRow.lotNo || '').trim(),
            lotQty: parseSafeInt(cRow.qty),
            planQty,
            actualQty,
            status
          });
        });
      });
    });

    // 날짜별 반 순서(감지->유도->수신) 및 품목명 정렬
    const lineOrder = { '감지기반': 1, '유도등반': 2, '수신기반': 3 };
    dateMap.forEach(list => {
      list.sort((a, b) => {
        const la = lineOrder[a.lineName] || 9;
        const lb = lineOrder[b.lineName] || 9;
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name, 'ko');
      });
    });

    return dateMap;
  }

  function renderAttendanceModule() {
    const monthStr = state.attendanceMonth || getTodayDateString().slice(0, 7);
    const [yearNum, monthNum] = monthStr.split('-').map(Number);

    const isSched = state.calendarMode === 'schedule';

    // 상위 메뉴 드롭다운 칩 & 툴바 & 사이드바 전환
    const calChip = document.getElementById('chip-cal-mode');
    if (calChip) calChip.textContent = isSched ? '생산일정' : '근태관리';
    document.querySelectorAll('.nav-dropdown-item[data-parent-tab="tab-attendance"]').forEach(el => {
      el.classList.toggle('active', el.dataset.line === (isSched ? 'schedule' : 'attendance'));
    });
    const attActions = document.getElementById('att-mode-actions');
    const schedActions = document.getElementById('cal-sched-actions');
    if (attActions) attActions.style.display = isSched ? 'none' : 'flex';
    if (schedActions) schedActions.style.display = isSched ? 'flex' : 'none';

    const attSidebarWrap = document.getElementById('att-sidebar-attendance-wrap');
    const schedSidebarWrap = document.getElementById('cal-sched-sidebar-wrap');
    if (attSidebarWrap) attSidebarWrap.style.display = isSched ? 'none' : 'flex';
    if (schedSidebarWrap) schedSidebarWrap.style.display = isSched ? 'flex' : 'none';

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
      if (typeof syncCustomSelect === 'function') syncCustomSelect('att-year-select');
    }
    const monthSel = document.getElementById('att-month-select');
    if (monthSel) {
      monthSel.value = String(monthNum).padStart(2, '0');
      if (typeof syncCustomSelect === 'function') syncCustomSelect('att-month-select');
    }

    if (isSched) {
      renderScheduleCalendarMode(yearNum, monthNum);
      return;
    }

    const badgeEl = document.getElementById('att-sidebar-month-badge');
    if (badgeEl) badgeEl.textContent = `${yearNum}년`;

    // 범례 렌더링
    const legendEl = document.getElementById('att-legend-wrap');
    const typeFilter = state.attendanceTypeFilter || 'ALL';
    if (legendEl) {
      const typePills = (state.attendanceTypes || []).map(t => {
        const isActive = typeFilter === t.id;
        return `<span class="att-legend-pill is-clickable ${isActive ? 'is-active-filter' : ''}" data-att-type-id="${t.id}" title="클릭 시 [${t.name}]만 필터링 (다시 클릭 시 전체)"><span class="att-legend-dot" style="background:${t.color};"></span>${t.name}</span>`;
      }).join('');
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
      calBody.classList.remove('is-schedule-mode', 'has-expanded-week');
      calBody.style.gridTemplateRows = '';
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
            const isDimmed = typeFilter !== 'ALL' && r.typeId !== typeFilter;
            return `
              <div class="att-event-chip ${isDimmed ? 'is-dimmed' : ''}" draggable="true" data-rec-id="${r.id}" data-date="${ds}" style="background:${t.color || '#2563eb'};" title="${wName} - ${t.name}${r.memo ? ' (' + r.memo + ')' : ''}">
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

  function renderScheduleCalendarMode(yearNum, monthNum) {
    const badgeEl = document.getElementById('cal-sched-month-badge');
    if (badgeEl) badgeEl.textContent = `${yearNum}년 ${monthNum}월`;

    // 반 필터 버튼 활성화
    const lineFilter = state.calSchedLineFilter || 'ALL';
    document.querySelectorAll('#cal-sched-line-filter .plan-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.line === lineFilter);
    });

    // 상단 범례: 작업반 왼쪽 색상 + 클릭 가능한 상태 원형 필터
    const legendEl = document.getElementById('att-legend-wrap');
    if (legendEl) {
      const statusFilter = state.calSchedStatusFilter || 'ALL';
      const statusDefs = [
        { key: '등록완료', label: '검정등록', cls: 'st-reg' },
        { key: '검정신청', label: '검정신청', cls: 'st-apply' },
        { key: '일정완료', label: '일정완료', cls: 'st-done' }
      ];
      const statusPills = statusDefs.map(sd => {
        const isActive = statusFilter === sd.key;
        return `<span class="att-legend-pill is-clickable ${isActive ? 'is-active-filter' : ''}" data-cal-status="${sd.key}" title="클릭 시 [${sd.label}] 상태만 강조">${`<span class="cal-status-dot ${sd.cls}"></span>`}${sd.label}</span>`;
      }).join('');
      const lineDefs = [
        { key: '감지기반', cls: 'line-sensor' },
        { key: '유도등반', cls: 'line-guide' },
        { key: '수신기반', cls: 'line-receiver' }
      ];
      const linePills = lineDefs.map(ld => {
        const isActive = lineFilter === ld.key;
        return `<span class="att-legend-pill cal-line-chip ${ld.cls} is-clickable ${isActive ? 'is-active-filter' : ''}" data-cal-line="${ld.key}" title="클릭 시 [${ld.key}]만 필터링 (다시 클릭 시 전체)">${ld.key}</span>`;
      }).join('');
      legendEl.innerHTML = `${linePills}<span style="color:#cbd5e1; margin:0 2px;">|</span>${statusPills}`;
    }

    const dateMap = collectScheduleCalendarData();

    const firstOfMonth = new Date(yearNum, monthNum - 1, 1);
    const lastOfMonth = new Date(yearNum, monthNum, 0);
    const startSunday = new Date(firstOfMonth);
    startSunday.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    const endSaturday = new Date(lastOfMonth);
    endSaturday.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

    const todayStr = getTodayDateString();
    const statusFilter = state.calSchedStatusFilter || 'ALL';
    const expandedIdx = state.calSchedExpandedWeekIdx;
    const totalWeeks = Math.max(5, Math.round((endSaturday - startSunday) / (7 * 86400000)) + 1);
    const maxPreview = getCalSchedMaxPreview(totalWeeks);

    const weeksData = [];
    const cursor = new Date(startSunday);
    let weekIdx = 0;

    while (cursor <= endSaturday) {
      const sundayStr = formatDateYMD(cursor);
      const weekLabel = getPlanWeekLabelForSunday(sundayStr);
      const days = [];
      let maxOverflow = 0;
      const groupTotals = new Map();
      let weekTotalQty = 0;

      for (let d = 0; d < 7; d++) {
        const ds = formatDateYMD(cursor);
        const rawItems = dateMap.get(ds) || [];
        const filteredItems = rawItems.filter(it => lineFilter === 'ALL' || it.lineName === lineFilter);
        if (filteredItems.length > maxPreview) {
          maxOverflow = Math.max(maxOverflow, filteredItems.length - Math.max(1, maxPreview - 1));
        }

        filteredItems.forEach(it => {
          weekTotalQty += it.planQty;
          groupTotals.set(it.itemGroup, (groupTotals.get(it.itemGroup) || 0) + it.planQty);
        });

        days.push({
          dateStr: ds,
          dayNum: cursor.getDate(),
          isOtherMonth: cursor.getMonth() !== (monthNum - 1),
          items: filteredItems
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      const satStr = days[6].dateStr;
      weeksData.push({
        weekIdx,
        weekLabel,
        rangeLabel: `${sundayStr.slice(5).replace('-', '/')}~${satStr.slice(5).replace('-', '/')}`,
        days,
        maxOverflow,
        groupTotals,
        weekTotalQty
      });
      weekIdx++;
    }

    // 유효하지 않은 확장 인덱스 보정
    const validExpandedIdx = (expandedIdx !== null && expandedIdx >= 0 && expandedIdx < weeksData.length) ? expandedIdx : null;
    if (validExpandedIdx !== state.calSchedExpandedWeekIdx) {
      state.calSchedExpandedWeekIdx = validExpandedIdx;
    }

    const collapseBtn = document.getElementById('btn-cal-collapse-week');
    if (collapseBtn) collapseBtn.style.display = validExpandedIdx !== null ? 'inline-flex' : 'none';

    const calBody = document.getElementById('att-cal-body');
    if (calBody) {
      calBody.classList.add('is-schedule-mode');
      calBody.classList.toggle('has-expanded-week', validExpandedIdx !== null);
      calBody.style.setProperty('--att-weeks', String(Math.max(weeksData.length, 5)));
      if (validExpandedIdx !== null) {
        calBody.style.gridTemplateRows = weeksData.map(w => w.weekIdx === validExpandedIdx ? 'auto' : 'minmax(108px, 1fr)').join(' ');
      } else {
        calBody.style.gridTemplateRows = '';
      }

      let html = '';
      weeksData.forEach(w => {
        const isExpanded = w.weekIdx === validExpandedIdx;
        html += `<div class="att-cal-row ${isExpanded ? 'is-week-expanded' : ''}" data-week-idx="${w.weekIdx}">`;
        html += `<div class="att-week-cell"><span class="att-week-badge">${w.weekLabel}</span>`;
        if (w.maxOverflow > 0 || isExpanded) {
          const btnIcon = isExpanded
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:2px; pointer-events:none;"><polyline points="18 15 12 9 6 15"></polyline></svg>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:2px; pointer-events:none;"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
          html += `<button type="button" class="att-week-expand-btn ${isExpanded ? 'is-expanded' : ''}" data-week-idx="${w.weekIdx}">${btnIcon}${isExpanded ? '접기' : `+${w.maxOverflow}`}</button>`;
        }
        html += `</div>`;

        w.days.forEach(day => {
          const ds = day.dateStr;
          const status = getAttendanceDayStatus(ds);
          const isToday = ds === todayStr;
          const isSelected = state.calSchedSelectedDate === ds;
          const hasConflict = status.isOffDay && day.items.length > 0;

          const classes = ['att-day-cell'];
          if (day.isOtherMonth) classes.push('is-other-month');
          if (isToday) classes.push('is-today');
          if (isSelected) classes.push('is-sched-selected');
          if (status.dow === 0) classes.push('is-sun');
          if (status.dow === 6) classes.push('is-sat');
          if (status.isWeekend) classes.push('is-weekend');
          if (status.holidayName) classes.push('is-holiday');
          if (status.closedReason) classes.push('is-closed');
          if (status.isOffDay) classes.push('is-offday');
          if (hasConflict) classes.push('has-sched-conflict');

          let tagHtml = '';
          if (hasConflict) {
            tagHtml = `<span class="cal-conflict-badge" title="휴무일에 생산일정이 등록되어 있습니다 (${status.holidayName || status.closedReason || '주말'})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>휴무일정</span>`;
          } else if (status.holidayName) {
            tagHtml = `<span class="att-day-tag tag-holiday" title="${status.holidayName}">${status.holidayName}</span>`;
          } else if (status.closedReason) {
            tagHtml = `<span class="att-day-tag tag-closed" title="${status.closedReason}">휴무: ${status.closedReason}</span>`;
          }

          const dayLimit = day.items.length <= maxPreview ? maxPreview : Math.max(1, maxPreview - 1);
          const visibleItems = isExpanded ? day.items : day.items.slice(0, dayLimit);
          const hiddenCount = isExpanded ? 0 : Math.max(0, day.items.length - dayLimit);

          const chipsHtml = visibleItems.map(it => {
            const lineCls = getCalSchedLineClass(it.lineName);
            const stMeta = getCalSchedStatusMeta(it.status);
            const isDimmed = statusFilter !== 'ALL' && it.status !== statusFilter;
            const pct = it.planQty > 0 ? Math.round((it.actualQty / it.planQty) * 100) : 0;
            const tooltipLines = [`[${it.lineName}] ${it.name}`];
            if (it.site) tooltipLines.push(it.site);
            tooltipLines.push(
              `로트번호 : ${it.lotNo || '-'}`,
              `로트수량 : ${it.lotQty.toLocaleString()}`,
              `계획 : ${it.planQty.toLocaleString()} / 실적 : ${it.actualQty.toLocaleString()} (${pct}%)`,
              `상태 : ${stMeta.label}`
            );
            const tooltip = tooltipLines.join('\n').replace(/"/g, '&quot;');
            return `
              <div class="cal-sched-chip ${lineCls} ${isDimmed ? 'is-dimmed' : ''}" data-date="${ds}" data-week-date="${it.weekDate}" title="${tooltip}">
                <span class="cal-sched-chip-name">${it.name}</span>
                <span class="cal-sched-chip-qty">${it.planQty.toLocaleString()}</span>
                <span class="cal-status-dot ${stMeta.dotCls}" title="${stMeta.label}"></span>
              </div>
            `;
          }).join('');

          const moreHtml = hiddenCount > 0
            ? `<div class="cal-sched-more-hint" data-week-idx="${w.weekIdx}">+${hiddenCount}건 더보기</div>`
            : '';

          html += `
            <div class="${classes.join(' ')}" data-date="${ds}">
              <div class="att-day-top">
                <span class="att-day-num">${day.dayNum}</span>
                ${tagHtml}
              </div>
              <div class="att-events-wrap">${chipsHtml}${moreHtml}</div>
            </div>
          `;
        });
        html += `</div>`;
      });

      calBody.innerHTML = html;
    }

    renderScheduleCalendarSidebar(weeksData, dateMap);
  }

  function renderScheduleCalendarSidebar(weeksData, dateMap) {
    const detailEl = document.getElementById('cal-sched-day-detail');
    const selDate = state.calSchedSelectedDate;
    const lineFilter = state.calSchedLineFilter || 'ALL';

    if (detailEl) {
      if (!selDate) {
        detailEl.style.display = 'none';
      } else {
        const items = (dateMap.get(selDate) || []).filter(it => lineFilter === 'ALL' || it.lineName === lineFilter);
        detailEl.style.display = 'block';
        const headerWeekDate = items.length > 0 ? items[0].weekDate : '';
        const headerJumpBtnHtml = headerWeekDate
          ? `<button type="button" class="cal-detail-header-jump-btn" data-jump-tab="tab-inspection" data-week-date="${headerWeekDate}" title="해당 주차 일정계획 화면으로 이동">일정계획 바로가기</button>`
          : '';
        let dHtml = `
          <div class="cal-detail-header">
            <span class="cal-detail-title" style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${selDate} 상세 (${items.length}건)
              </span>
              ${headerJumpBtnHtml}
            </span>
            <button type="button" class="cal-detail-close" id="btn-cal-detail-close" title="상세 닫기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
        if (items.length === 0) {
          dHtml += `<div style="font-size:11px; color:#64748b; padding:6px 0;">등록된 생산일정이 없습니다.</div>`;
        } else {
          dHtml += items.map(it => {
            const lineCls = getCalSchedLineClass(it.lineName);
            const stMeta = getCalSchedStatusMeta(it.status);
            const pct = it.planQty > 0 ? Math.round((it.actualQty / it.planQty) * 100) : 0;
            const isPrinted = !!(state.reportPrintedMap && state.reportPrintedMap[it.certRowId]);
            const rptStyle = isPrinted ? ' style="background:#dcfce7; color:#15803d; border-color:#86efac;"' : '';
            const safeSite = it.site
              ? it.site.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
              : '';
            const siteHtml = safeSite
              ? `<div class="cal-detail-item-site" title="${safeSite}">${safeSite}</div>`
              : '';
            return `
              <div class="cal-detail-item ${lineCls}">
                <div class="cal-detail-item-main">
                  <div class="cal-detail-item-name">
                    <span class="cal-detail-item-name-text" title="${it.name}">${it.name}</span>
                    <span class="cal-detail-item-status"><span class="cal-status-dot ${stMeta.dotCls}"></span> ${stMeta.label}</span>
                  </div>
                  ${siteHtml}
                  <div class="cal-detail-item-sub">${it.lineName} · 로트 ${it.lotNo || '-'} (${it.lotQty.toLocaleString()})</div>
                  <div class="cal-detail-item-sub">계획 <strong>${it.planQty.toLocaleString()}</strong> / 실적 ${it.actualQty.toLocaleString()} (${pct}%)</div>
                </div>
                <button type="button" class="cal-detail-jump-btn" data-report-cert-id="${it.certRowId}"${rptStyle} title="${isPrinted ? '공정검사보고서 출력 완료 (클릭 시 다시 다운로드)' : '공정검사보고서 출력 (.xlsx 다운로드)'}">${isPrinted ? '완료' : '출력'}</button>
              </div>
            `;
          }).join('');
        }
        detailEl.innerHTML = dHtml;
      }
    }

    const listEl = document.getElementById('cal-sched-weekly-groups');
    if (listEl) {
      const expandedIdx = state.calSchedExpandedWeekIdx;
      listEl.innerHTML = weeksData.map(w => {
        const isExpanded = w.weekIdx === expandedIdx;
        const sortedGroups = Array.from(w.groupTotals.entries()).sort((a, b) => b[1] - a[1]);
        const groupRowsHtml = sortedGroups.length > 0
          ? sortedGroups.map(([grpName, qty]) => `
              <div class="cal-week-group-row">
                <span>${grpName}</span>
                <span class="cal-week-group-qty">${qty.toLocaleString()}</span>
              </div>
            `).join('')
          : `<div class="cal-week-group-row" style="color:#94a3b8;"><span>일정 없음</span><span>0</span></div>`;

        return `
          <div class="cal-week-summary-card ${isExpanded ? 'is-expanded' : ''}">
            <div class="cal-week-summary-head">
              <div>
                <span>${w.weekLabel}</span>
                <span class="cal-week-summary-range">(${w.rangeLabel})</span>
              </div>
              <span class="cal-week-summary-total">${w.weekTotalQty.toLocaleString()}</span>
            </div>
            <div class="cal-week-group-rows">${groupRowsHtml}</div>
          </div>
        `;
      }).join('');
    }
  }

  function renderAttendanceSidebar() {
    const monthStr = state.attendanceMonth || getTodayDateString().slice(0, 7);
    const yearStr = monthStr.slice(0, 4);
    const workers = state.workers || [];
    const registeredGroups = getWorkGroupsList();
    const normalizeGrp = (g) => {
      const s = String(g || registeredGroups[0] || '감지기반').trim();
      return s || registeredGroups[0] || '감지기반';
    };
    const matchGroupFilter = (wGroup, filterVal) => {
      if (!filterVal || filterVal === 'ALL') return true;
      const g = normalizeGrp(wGroup);
      if (filterVal === '기타') return !registeredGroups.includes(g);
      return g === filterVal;
    };

    const grpSelect = document.getElementById('att-filter-group');
    if (grpSelect) {
      const hasEtcWorkers = workers.some(w => !registeredGroups.includes(normalizeGrp(w.group)));
      const filterGroups = hasEtcWorkers ? [...registeredGroups, '기타'] : [...registeredGroups];
      grpSelect.innerHTML = `<option value="ALL">전체 작업반</option>` +
        filterGroups.map(g => `<option value="${g}">${g}</option>`).join('');
      const curGrp = state.attendanceSidebarGroup || 'ALL';
      if (curGrp !== 'ALL' && !filterGroups.includes(curGrp)) {
        state.attendanceSidebarGroup = 'ALL';
      }
      grpSelect.value = state.attendanceSidebarGroup || 'ALL';
      if (typeof syncCustomSelect === 'function') syncCustomSelect(grpSelect);
    }

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
      if (typeof syncCustomSelect === 'function') syncCustomSelect(workerSelect);
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
    const orderGroups = [...registeredGroups];
    filteredWorkers.forEach(w => {
      const g = normalizeGrp(w.group);
      const bucket = registeredGroups.includes(g) ? g : '기타';
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
          const weight = getAttendanceTypeDayWeight(t.name);
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
    if (isGuestReadOnly(true)) return;
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
        const registeredGroups = getWorkGroupsList();
        const wGrp = String((wObj && wObj.group) || registeredGroups[0] || '감지기반').trim() || '감지기반';
        attModalState.activeGroup = registeredGroups.includes(wGrp) ? wGrp : '기타';
        document.getElementById('att-start-date').value = rec.date;
        document.getElementById('att-end-date').value = rec.date;
        document.getElementById('att-memo').value = rec.memo || '';
      }
      if (titleEl) titleEl.textContent = '✏️ 근태 일정 수정';
      if (btnDel) btnDel.style.display = '';
      if (multiHint) multiHint.style.display = 'none';
      mode = 'worker';
    } else {
      const registeredGroups = getWorkGroupsList();
      attModalState.activeGroup = (state.attendanceSidebarGroup && state.attendanceSidebarGroup !== 'ALL')
        ? state.attendanceSidebarGroup
        : (registeredGroups[0] || '감지기반');
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
    const registeredGroups = getWorkGroupsList();
    const getBucket = (g) => {
      const s = String(g || registeredGroups[0] || '감지기반').trim() || registeredGroups[0] || '감지기반';
      return registeredGroups.includes(s) ? s : '기타';
    };

    const availableBuckets = [...registeredGroups];
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
      const weight = getAttendanceTypeDayWeight(t.name);
      const weightText = weight > 0 ? `${weight}일 차감` : '표시만 (일수 제외)';
      return `
        <tr data-type-id="${t.id}">
          <td style="text-align:center; color:var(--text-muted);">${idx + 1}</td>
          <td><input type="text" class="form-input form-input-sm att-setting-name-input" data-id="${t.id}" value="${String(t.name).replace(/"/g, '&quot;')}"></td>
          <td style="text-align:center;">
            <input type="color" class="att-setting-color-input" data-id="${t.id}" value="${t.color || '#2563eb'}" style="width:44px; height:28px; padding:2px; border:1px solid var(--border-light); border-radius:6px; cursor:pointer;">
          </td>
          <td style="text-align:center; font-size:12px; color:var(--text-sub); font-weight:600;">${weightText}</td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-xs btn-outline text-danger btn-del-att-type" data-id="${t.id}">삭제</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openAttendanceTypeSettingsModal() {
    renderAttendanceTypeSettings();
    const overlay = document.getElementById('att-type-settings-modal-overlay');
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAttendanceTypeSettingsModal() {
    const overlay = document.getElementById('att-type-settings-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
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
    document.getElementById('btn-att-save-db')?.addEventListener('click', () => saveAttendanceToDb(false));

    // 근태유형 설정 모달 열기/닫기
    document.getElementById('btn-att-goto-settings')?.addEventListener('click', openAttendanceTypeSettingsModal);
    document.getElementById('btn-att-modal-goto-settings')?.addEventListener('click', () => {
      closeAttendanceModal();
      openAttendanceTypeSettingsModal();
    });
    document.getElementById('btn-close-att-type-modal')?.addEventListener('click', closeAttendanceTypeSettingsModal);
    document.getElementById('btn-close-att-type-modal-footer')?.addEventListener('click', closeAttendanceTypeSettingsModal);
    document.getElementById('att-type-settings-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'att-type-settings-modal-overlay') closeAttendanceTypeSettingsModal();
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

    // 생산일정 캘린더: 우측 사이드바 반별 필터
    document.getElementById('cal-sched-line-filter')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.plan-seg-btn');
      if (!btn || !btn.dataset.line) return;
      state.calSchedLineFilter = btn.dataset.line;
      state.calSchedExpandedWeekIdx = null;
      renderAttendanceModule();
    });

    // 생산일정 / 근태관리 캘린더: 상단 범례 클릭 필터
    document.getElementById('att-legend-wrap')?.addEventListener('click', (e) => {
      if (state.calendarMode !== 'schedule') {
        const typePill = e.target.closest('[data-att-type-id]');
        if (!typePill) return;
        const typeId = typePill.dataset.attTypeId;
        state.attendanceTypeFilter = (state.attendanceTypeFilter === typeId) ? 'ALL' : typeId;
        renderAttendanceModule();
        return;
      }
      const linePill = e.target.closest('[data-cal-line]');
      if (linePill) {
        const ln = linePill.dataset.calLine;
        state.calSchedLineFilter = (state.calSchedLineFilter === ln) ? 'ALL' : ln;
        state.calSchedExpandedWeekIdx = null;
        renderAttendanceModule();
        return;
      }
      const pill = e.target.closest('[data-cal-status]');
      if (!pill) return;
      const st = pill.dataset.calStatus;
      state.calSchedStatusFilter = (state.calSchedStatusFilter === st) ? 'ALL' : st;
      renderAttendanceModule();
    });

    // 생산일정 캘린더: 상단 접기 버튼 & ESC 키 복귀
    document.getElementById('btn-cal-collapse-week')?.addEventListener('click', () => {
      if (state.calSchedExpandedWeekIdx !== null) {
        state.calSchedExpandedWeekIdx = null;
        renderAttendanceModule();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.currentTab === 'tab-attendance' && state.calendarMode === 'schedule' && state.calSchedExpandedWeekIdx !== null) {
        state.calSchedExpandedWeekIdx = null;
        renderAttendanceModule();
      }
    });

    let calResizeTimer = null;
    window.addEventListener('resize', () => {
      if (state.currentTab !== 'tab-attendance' || state.calendarMode !== 'schedule') return;
      clearTimeout(calResizeTimer);
      calResizeTimer = setTimeout(() => {
        renderAttendanceModule();
      }, 150);
    });

    // 생산일정 캘린더: 일정계획 바로가기
    document.getElementById('btn-cal-goto-insp')?.addEventListener('click', () => {
      activateTab('tab-inspection');
    });

    // 생산일정 캘린더: 우측 사이드바 날짜 상세 닫기 & 주차 바로가기
    document.getElementById('cal-sched-day-detail')?.addEventListener('click', async (e) => {
      if (e.target.closest('#btn-cal-detail-close')) {
        state.calSchedSelectedDate = null;
        renderAttendanceModule();
        return;
      }
      const reportBtn = e.target.closest('[data-report-cert-id]');
      if (reportBtn) {
        const certRowId = reportBtn.dataset.reportCertId;
        if (certRowId && typeof exportProcessInspectionReport === 'function') {
          exportProcessInspectionReport(certRowId);
        }
        return;
      }
      const jumpBtn = e.target.closest('[data-jump-tab]');
      if (jumpBtn) {
        const weekDate = jumpBtn.dataset.weekDate;
        if (weekDate) {
          state.inspectionTargetDate = weekDate;
          localStorage.setItem(STORAGE_KEYS.LAST_INSP_TARGET, weekDate);
          if (typeof loadInspectionV2FromDb === 'function') {
            await loadInspectionV2FromDb(weekDate);
          }
        }
        await activateTab('tab-inspection');
        if (typeof renderInspectionV2 === 'function') renderInspectionV2();
      }
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
        if (state.calendarMode === 'schedule') return;
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
        if (state.calendarMode === 'schedule') return;
        if (!dragSelecting) return;
        const cell = e.target.closest('.att-day-cell');
        if (!cell) return;
        if (cell.dataset.date !== dragEndDate) {
          dragEndDate = cell.dataset.date;
          updateDragSelectionUI();
        }
      });

      window.addEventListener('mouseup', () => {
        if (state.calendarMode === 'schedule') return;
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
        if (state.calendarMode === 'schedule') {
          const expandBtn = e.target.closest('.att-week-expand-btn, .cal-sched-more-hint');
          if (expandBtn) {
            e.stopPropagation();
            const idx = Number(expandBtn.dataset.weekIdx);
            state.calSchedExpandedWeekIdx = (state.calSchedExpandedWeekIdx === idx) ? null : idx;
            renderAttendanceModule();
            return;
          }
          const cell = e.target.closest('.att-day-cell');
          if (cell && cell.dataset.date) {
            const ds = cell.dataset.date;
            state.calSchedSelectedDate = (state.calSchedSelectedDate === ds) ? null : ds;
            renderAttendanceModule();
          }
          return;
        }
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

    document.getElementById('btn-apply-att-type-modal')?.addEventListener('click', () => {
      if (attTypesTbody) {
        attTypesTbody.querySelectorAll('tr[data-type-id]').forEach(tr => {
          const id = tr.dataset.typeId;
          const item = (state.attendanceTypes || []).find(t => t.id === id);
          if (!item) return;
          const nameInp = tr.querySelector('.att-setting-name-input');
          const colorInp = tr.querySelector('.att-setting-color-input');
          if (nameInp && nameInp.value.trim()) item.name = nameInp.value.trim();
          if (colorInp && colorInp.value) item.color = colorInp.value;
        });
      }
      saveAttendanceToDb(true);
      renderAttendanceModule();
      showToast('근태유형 및 색상이 캘린더에 적용되었습니다.');
    });
  }

  function initWorkGroupModalEvents() {
    document.getElementById('btn-close-workgroup-modal')?.addEventListener('click', closeWorkGroupsModal);
    document.getElementById('btn-done-workgroup-modal')?.addEventListener('click', closeWorkGroupsModal);
    document.getElementById('modal-work-groups')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-work-groups') closeWorkGroupsModal();
    });

    document.getElementById('form-add-workgroup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const catSel = document.getElementById('select-new-workgroup-category');
      const category = catSel ? catSel.value : '직접제조';
      const inp = document.getElementById('input-new-workgroup');
      const name = (inp?.value || '').trim();
      if (!name) return;
      const entries = getWorkGroupEntries();
      if (entries.some(g => g.name === name)) {
        alert('이미 등록된 작업반입니다.');
        return;
      }
      state.workGroups = [...entries, { name, category }];
      inp.value = '';
      saveLocalMasterData();
      await saveMasterToDb(true);
      renderWorkGroupsModalList();
      renderMasterWorkers();
      if (typeof renderAttendanceSidebar === 'function') renderAttendanceSidebar();
      showToast(`[${category}] '${name}' 작업반이 추가되었습니다.`);
    });

    document.getElementById('workgroup-modal-tbody')?.addEventListener('click', async (e) => {
      const saveBtn = e.target.closest('.btn-wg-save');
      if (saveBtn) {
        const idx = Number(saveBtn.dataset.index);
        const entries = getWorkGroupEntries();
        const oldEntry = entries[idx];
        const oldName = oldEntry ? oldEntry.name : '';
        const catSel = document.querySelector(`.wg-edit-category[data-index="${idx}"]`);
        const newCategory = catSel ? catSel.value : (oldEntry ? oldEntry.category : '직접제조');
        const inp = document.querySelector(`.wg-edit-input[data-index="${idx}"]`);
        const newName = (inp?.value || '').trim();
        if (!newName) {
          alert('작업반 명칭을 입력해 주세요.');
          return;
        }
        if (newName !== oldName && entries.some(g => g.name === newName)) {
          alert('이미 존재하는 작업반 명칭입니다.');
          return;
        }
        entries[idx] = { name: newName, category: newCategory };
        state.workGroups = entries;
        if (oldName && newName !== oldName) {
          (state.workers || []).forEach(w => {
            if (w.group === oldName) w.group = newName;
          });
        }
        saveLocalMasterData();
        await saveMasterToDb(true);
        renderWorkGroupsModalList();
        renderMasterWorkers();
        if (typeof renderProductionTable === 'function') renderProductionTable();
        if (typeof renderAttendanceSidebar === 'function') renderAttendanceSidebar();
        showToast(`작업반이 [${newCategory}] '${newName}'(으)로 수정되었습니다.`);
        return;
      }

      const delBtn = e.target.closest('.btn-wg-del');
      if (delBtn) {
        const idx = Number(delBtn.dataset.index);
        const entries = getWorkGroupEntries();
        if (entries.length <= 1) {
          alert('최소 1개 이상의 작업반이 필요합니다.');
          return;
        }
        const targetName = entries[idx]?.name || '';
        if (!confirm(`'${targetName}' 작업반을 삭제하시겠습니까?`)) return;
        state.workGroups = entries.filter((_, i) => i !== idx);
        saveLocalMasterData();
        await saveMasterToDb(true);
        renderWorkGroupsModalList();
        renderMasterWorkers();
        if (typeof renderProductionTable === 'function') renderProductionTable();
        if (typeof renderAttendanceSidebar === 'function') renderAttendanceSidebar();
        showToast(`'${targetName}' 작업반이 삭제되었습니다.`);
      }
    });
  }

  function initGlobalCustomDropdowns() {
    enhanceAllSelects(document);
    const bodyObs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'SELECT') {
            enhanceSelectToCustomDropdown(node);
          } else if (node.querySelectorAll) {
            enhanceAllSelects(node);
          }
        }
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
  }

  // =========================================================================
  // 14-B. 수신기계획 전용 모듈 (생산계획 하위메뉴 - 엑셀형 그리드 & 검정현황 수동 전송)
  // =========================================================================
  function createEmptyReceiverPlanRow(overrides = {}) {
    return {
      id: 'rp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      reqNo: '',
      code: '',
      formatNo: '',
      itemGroup: '',
      name: '',
      siteName: '',
      builder: '',
      client: '',
      manager: '',
      receiptDate: '',
      dueDate: '',
      issueReqDate: '',
      weekDate: '',
      inspectDate: '',
      colorInfo: '',
      remark: '',
      lotNo: '',
      mfgYm: '',
      serialFrom: '',
      serialTo: '',
      ...overrides
    };
  }

  function trimRpRow(row) {
    if (!row || typeof row !== 'object') return row;
    Object.keys(row).forEach(k => {
      if (typeof row[k] === 'string') row[k] = row[k].trim();
    });
    return row;
  }

  function parseShortDateInput(raw) {
    const val = String(raw ?? '').trim();
    if (!val) return '';
    // 이미 YYYY-MM-DD 형식인 경우
    let m = val.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    // 27-1-3 (YY-M-D)
    m = val.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) {
      return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    // 6-1 (M-D) -> 현재 연도
    m = val.match(/^(\d{1,2})[-./](\d{1,2})$/);
    if (m) {
      const yr = new Date().getFullYear();
      return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
    return val;
  }

  function calcReceiverInspectDateFromWeekDate(weekDateStr) {
    const m = String(weekDateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const dow = d.getDay(); // 0:일 ~ 6:토
    const diffToFriday = dow === 0 ? -2 : (5 - dow);
    const nextFriday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToFriday + 7);
    return adjustBusinessDayBackward(nextFriday);
  }

  function calcReceiverMfgYmFromWeekDate(weekDateStr) {
    const normalized = parseShortDateInput(weekDateStr);
    const m = String(normalized || '').trim().match(/^(\d{4})-(\d{2})-/);
    if (!m) return '';
    return `${m[1].slice(2, 4)}${m[2]}`;
  }

  function loadLocalReceiverPlanData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RECEIVER_PLAN);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          state.receiverPlanRows = parsed.map(r => trimRpRow(createEmptyReceiverPlanRow(r)));
          return;
        }
      }
    } catch (e) {
      console.warn('수신기계획 로컬 로드 실패:', e);
    }
    state.receiverPlanRows = [];
  }

  function saveLocalReceiverPlanData() {
    try {
      localStorage.setItem(STORAGE_KEYS.RECEIVER_PLAN, JSON.stringify(state.receiverPlanRows || []));
    } catch (e) {
      console.warn('수신기계획 로컬 저장 실패:', e);
    }
  }

  async function loadReceiverPlanDataFromDb() {
    loadLocalReceiverPlanData();
    if (!isFirestoreActive || !db) return;
    try {
      const doc = await db.collection('pms_data').doc('receiver_plan').get();
      if (doc.exists && Array.isArray(doc.data()?.rows)) {
        state.receiverPlanRows = doc.data().rows.map(r => trimRpRow(createEmptyReceiverPlanRow(r)));
        if (Array.isArray(doc.data()?.colOrder)) {
          rpGridState.columns = loadRpOrderedColumns(doc.data().colOrder);
          saveRpColumnOrder(rpGridState.columns);
        }
        saveLocalReceiverPlanData();
        return;
      }
    } catch (err) { /* fallback below */ }
    try {
      const fbDoc = await db.collection('pms_metadata').doc('receiver_plan').get();
      if (fbDoc.exists && Array.isArray(fbDoc.data()?.rows)) {
        state.receiverPlanRows = fbDoc.data().rows.map(r => trimRpRow(createEmptyReceiverPlanRow(r)));
        if (Array.isArray(fbDoc.data()?.colOrder)) {
          rpGridState.columns = loadRpOrderedColumns(fbDoc.data().colOrder);
          saveRpColumnOrder(rpGridState.columns);
        }
        saveLocalReceiverPlanData();
      }
    } catch (err) {
      console.warn('수신기계획 Firestore 로드 오류:', err);
    }
  }

  async function saveReceiverPlanToDb(silent = false) {
    if (isGuestReadOnly(!silent)) return;
    saveLocalReceiverPlanData();
    const cleanRows = JSON.parse(JSON.stringify(state.receiverPlanRows || []));
    let dbSaved = false;
    if (isFirestoreActive && db) {
      const payload = {
        rows: cleanRows,
        colOrder: (rpGridState?.columns || RP_GRID_COLUMNS).slice(2).map(c => c.key),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await db.collection('pms_data').doc('receiver_plan').set(payload);
        dbSaved = true;
      } catch (err) {
        try {
          await db.collection('pms_metadata').doc('receiver_plan').set(payload);
          dbSaved = true;
        } catch (fbErr) {
          console.warn('수신기계획 Firestore 저장 오류:', fbErr);
        }
      }
    } else {
      dbSaved = true;
    }
    markAsDirty(false);
    if (!silent) {
      showToast(dbSaved ? '수신기계획이 DB에 저장되었습니다.' : '로컬에 저장되었습니다. (DB 연결 확인 필요)');
    }
  }

  function pushRpUndoSnapshot() {
    if (!Array.isArray(state.rpUndoStack)) state.rpUndoStack = [];
    state.rpUndoStack.push(JSON.stringify(state.receiverPlanRows || []));
    if (state.rpUndoStack.length > 30) state.rpUndoStack.shift();
    const undoBtn = document.getElementById('btn-rp-undo');
    if (undoBtn) undoBtn.disabled = state.rpUndoStack.length === 0;
  }

  function undoReceiverPlan() {
    if (!state.rpUndoStack || state.rpUndoStack.length === 0) return;
    try {
      const prev = JSON.parse(state.rpUndoStack.pop());
      if (Array.isArray(prev)) {
        state.receiverPlanRows = prev;
        saveLocalReceiverPlanData();
        renderReceiverPlanModule();
        showToast('이전 작업으로 되돌렸습니다.');
      }
    } catch (e) {}
    const undoBtn = document.getElementById('btn-rp-undo');
    if (undoBtn) undoBtn.disabled = !state.rpUndoStack || state.rpUndoStack.length === 0;
  }

  function getReceiverPlanCertMatch(row) {
    const saved = state.certSavedRows || [];
    let found = saved.find(s => s.sourceRpId && s.sourceRpId === row.id);
    if (found) return found;
    if (row.reqNo && row.reqNo.trim()) {
      found = saved.find(s => s.sourceReqNo && s.sourceReqNo === row.reqNo.trim());
      if (found) return found;
    }
    if (row.formatNo && row.lotNo && row.serialFrom) {
      found = saved.find(s =>
        String(s.formatNo || '').trim() === row.formatNo.trim() &&
        String(s.lotNo || '').trim() === row.lotNo.trim() &&
        String(s.from || '').trim() === String(row.serialFrom).trim()
      );
      if (found) return found;
    }
    return null;
  }

  function getReceiverPlanCertStatus(row) {
    const match = getReceiverPlanCertMatch(row);
    if (!match) return { label: '미신청', normStatus: '미신청', cls: 'is-none', dotCls: 'rp-dot-none', rowCls: '', isSent: false, isEditableInCert: false, isLocked: false };
    const raw = String(match.status || '').trim();
    const st = raw === '검정완료' ? '일정완료' : (typeof normalizeCalSchedStatus === 'function' ? normalizeCalSchedStatus(raw) : (raw || '등록완료'));
    if (st === '일정완료') {
      return { label: '일정완료', normStatus: '일정완료', cls: 'is-applied', dotCls: 'rp-dot-done', rowCls: 'is-rp-row-completed is-rp-row-locked', isSent: true, isEditableInCert: false, isLocked: true };
    }
    if (st === '검정신청' || st === '품검요청') {
      return { label: '검정신청', normStatus: '검정신청', cls: 'is-applied', dotCls: 'rp-dot-apply', rowCls: 'is-rp-row-applied is-rp-row-locked', isSent: true, isEditableInCert: false, isLocked: true };
    }
    return { label: '검정등록', normStatus: '등록완료', cls: 'is-registered', dotCls: 'rp-dot-reg', rowCls: 'is-rp-row-registered', isSent: true, isEditableInCert: true, isLocked: false };
  }

  function recommendReceiverLotAndSerial(targetRows, overwriteExisting = false) {
    const maxLotByFmtYear = new Map();
    const maxSerialByFmtYear = new Map();
    const now = new Date();
    const yyDefault = String(now.getFullYear()).slice(-2);
    const ymDefault = yyDefault + String(now.getMonth() + 1).padStart(2, '0');

    const getRowYy = (row) => {
      const lotM = String(row?.lotNo || '').trim().match(/^(\d{2})-/);
      if (lotM) return lotM[1];
      const ref = row?.weekDate || row?.inspectDate || '';
      if (ref.length >= 4 && /^\d{4}/.test(ref)) return ref.slice(2, 4);
      const py = String(row?.planYear || '').trim();
      if (/^\d{4}$/.test(py)) return py.slice(2, 4);
      const rec = row?.writeDate || row?.receiptDate || '';
      if (rec.length >= 4 && /^\d{4}/.test(rec)) return rec.slice(2, 4);
      return yyDefault;
    };

    const recordLot = (fmt, lotNo) => {
      const f = String(fmt || '').trim();
      const l = String(lotNo || '').trim();
      if (!f || !l) return;
      const m = l.match(/^(\d{2})-(\d+)$/);
      if (!m) return;
      const key = `${f}__${m[1]}`;
      const num = parseInt(m[2], 10);
      if (num > (maxLotByFmtYear.get(key) || 0)) maxLotByFmtYear.set(key, num);
    };

    const recordSerial = (fmt, yy, fromVal, toVal) => {
      const f = String(fmt || '').trim();
      const from = parseSafeInt(fromVal);
      if (!f || from <= 0) return;
      const key = `${f}__${yy}`;
      const to = Math.max(from, parseSafeInt(toVal) || from);
      if (to > (maxSerialByFmtYear.get(key) || 0)) maxSerialByFmtYear.set(key, to);
    };

    (state.certSavedRows || []).forEach(r => {
      recordLot(r.formatNo, r.lotNo);
      recordSerial(r.formatNo, getRowYy(r), r.from, r.to);
    });
    (state.receiverPlanRows || []).forEach(r => {
      if (!getReceiverPlanCertStatus(r).isSent) return;
      recordLot(r.formatNo, r.lotNo);
      recordSerial(r.formatNo, getRowYy(r), r.serialFrom, r.serialTo);
    });

    let updated = 0;
    (targetRows || []).forEach(row => {
      const fmt = String(row.formatNo || '').trim();
      if (!fmt) return;
      const primaryRef = row.weekDate || row.inspectDate || '';
      const py = String(row.planYear || '').trim();
      let yy = yyDefault;
      if (primaryRef.length >= 4 && /^\d{4}/.test(primaryRef)) {
        yy = primaryRef.slice(2, 4);
      } else if (/^\d{4}$/.test(py)) {
        yy = py.slice(2, 4);
      } else if (row.receiptDate && row.receiptDate.length >= 4 && /^\d{4}/.test(row.receiptDate)) {
        yy = row.receiptDate.slice(2, 4);
      }
      const key = `${fmt}__${yy}`;

      let changed = false;
      if (overwriteExisting || !String(row.lotNo || '').trim()) {
        const nextLotNum = (maxLotByFmtYear.get(key) || 0) + 1;
        row.lotNo = `${yy}-${String(nextLotNum).padStart(3, '0')}`;
        maxLotByFmtYear.set(key, nextLotNum);
        changed = true;
      }
      if (overwriteExisting || !String(row.mfgYm || '').trim()) {
        const calcYm = calcReceiverMfgYmFromWeekDate(row.weekDate);
        if (calcYm) {
          row.mfgYm = calcYm;
          changed = true;
        }
      }
      if (overwriteExisting || !String(row.serialFrom || '').trim()) {
        const nextSerial = (maxSerialByFmtYear.get(key) || 0) + 1;
        row.serialFrom = String(nextSerial);
        row.serialTo = String(nextSerial);
        maxSerialByFmtYear.set(key, nextSerial);
        changed = true;
      } else if (!String(row.serialTo || '').trim()) {
        row.serialTo = String(row.serialFrom).trim();
        changed = true;
      }
      if (changed) updated++;
    });
    return updated;
  }

  // 미신청 행들의 로트/제조번호를 현재 그리드 위→아래 순서대로 자동 재계산 (확정 행은 유지)
  function recalculatePendingReceiverLotsAndSerials() {
    const rows = state.receiverPlanRows || [];
    const pendingRows = [];
    let cleared = 0;

    rows.forEach(r => {
      if (getReceiverPlanCertStatus(r).isSent) return;
      const fmt = String(r.formatNo || '').trim();
      if (!fmt || fmt === '-') {
        if (r.lotNo || r.serialFrom || r.serialTo) {
          r.lotNo = '';
          r.serialFrom = '';
          r.serialTo = '';
          cleared++;
        }
        return;
      }
      pendingRows.push(r);
    });

    if (pendingRows.length === 0) return cleared;

    const prevSnapshot = pendingRows.map(r => `${r.lotNo || ''}|${r.serialFrom || ''}|${r.serialTo || ''}`);
    recommendReceiverLotAndSerial(pendingRows, true);
    let diffCnt = cleared;
    pendingRows.forEach((r, idx) => {
      const nextSnapshot = `${r.lotNo || ''}|${r.serialFrom || ''}|${r.serialTo || ''}`;
      if (nextSnapshot !== prevSnapshot[idx]) diffCnt++;
    });
    return diffCnt;
  }

  function getReceiverPlanRowYear(row) {
    if (!row) return '';
    const primaryCandidates = [row.weekDate, row.inspectDate];
    for (const c of primaryCandidates) {
      const s = String(c || '').trim();
      if (/^\d{4}/.test(s)) return s.slice(0, 4);
    }
    const lotM = String(row.lotNo || '').trim().match(/^(\d{2})-/);
    if (lotM) return `20${lotM[1]}`;
    const py = String(row.planYear || '').trim();
    if (/^\d{4}$/.test(py)) return py;
    const fallbackCandidates = [row.receiptDate, row.dueDate];
    for (const c of fallbackCandidates) {
      const s = String(c || '').trim();
      if (/^\d{4}/.test(s)) return s.slice(0, 4);
    }
    return '';
  }

  function getEffectiveRpItemGroup(row) {
    if (!row) return '';
    if (row.code) {
      const mItem = (state.certMasterItems || []).find(i =>
        String(i.code || '').trim().toLowerCase() === String(row.code || '').trim().toLowerCase()
      );
      if (mItem && mItem.itemGroup && mItem.itemGroup !== '-') {
        return String(mItem.itemGroup).trim();
      }
    }
    return String(row.itemGroup || '').trim();
  }

  function populateReceiverPlanFilterOptions() {
    const rows = state.receiverPlanRows || [];
    const currentYear = String(new Date().getFullYear());
    const nextYear = String(Number(currentYear) + 1);

    const yearSel = document.getElementById('rp-filter-year');
    if (yearSel) {
      const yearSet = new Set([currentYear, nextYear]);
      rows.forEach(r => {
        const yr = getReceiverPlanRowYear(r);
        if (/^\d{4}$/.test(yr)) yearSet.add(yr);
      });
      const sortedYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
      const prevYear = state.rpFilterYear || currentYear;
      yearSel.innerHTML = '<option value="ALL">전체 연도</option>' +
        sortedYears.map(yr => `<option value="${yr}">${yr}년</option>`).join('');
      if (prevYear === 'ALL' || yearSet.has(prevYear)) {
        yearSel.value = prevYear;
      } else {
        yearSel.value = currentYear;
        state.rpFilterYear = currentYear;
      }
      if (typeof syncCustomSelect === 'function') syncCustomSelect('rp-filter-year');
    }

    const fYear = state.rpFilterYear || 'ALL';
    const yearFilteredRows = fYear === 'ALL'
      ? rows
      : rows.filter(r => {
        const yr = getReceiverPlanRowYear(r);
        return yr === fYear || (!yr && fYear === currentYear);
      });

    const fillSelect = (id, allLabel, values, labelFormatter = null) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value || 'ALL';
      const uniq = Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean))).sort();
      sel.innerHTML = `<option value="ALL">${allLabel}</option>` +
        uniq.map(v => {
          const label = typeof labelFormatter === 'function' ? labelFormatter(v) : v;
          return `<option value="${v.replace(/"/g, '&quot;')}">${String(label).replace(/</g, '&lt;')}</option>`;
        }).join('');
      sel.value = uniq.includes(prev) ? prev : 'ALL';
      if (typeof syncCustomSelect === 'function') syncCustomSelect(id);
    };

    fillSelect('rp-filter-week', '생산주차', yearFilteredRows.map(r => r.weekDate), v => formatCertWeekOptionLabel(v));
    fillSelect('rp-filter-item', '품목그룹', yearFilteredRows.map(r => getEffectiveRpItemGroup(r)));
  }

  function getFilteredReceiverPlanRows() {
    const rows = state.receiverPlanRows || [];
    const currentYear = String(new Date().getFullYear());
    const fYear = state.rpFilterYear || 'ALL';
    const q = (document.getElementById('rp-search-site')?.value || '').trim().toLowerCase();
    const fWeek = document.getElementById('rp-filter-week')?.value || 'ALL';
    const fItem = document.getElementById('rp-filter-item')?.value || 'ALL';
    const fStatus = state.rpStatusFilter || 'ALL';

    return rows.filter(row => {
      if (fYear !== 'ALL') {
        const yr = getReceiverPlanRowYear(row);
        if (yr ? yr !== fYear : fYear !== currentYear) return false;
      }
      if (q) {
        const matched = [row.code, row.name, row.siteName, row.formatNo, row.builder, row.client]
          .some(v => String(v || '').toLowerCase().includes(q));
        if (!matched) return false;
      }
      if (fWeek !== 'ALL' && String(row.weekDate || '').trim() !== fWeek) return false;
      if (fItem !== 'ALL' && getEffectiveRpItemGroup(row) !== fItem) return false;
      if (fStatus !== 'ALL') {
        const st = getReceiverPlanCertStatus(row);
        if (fStatus === '미신청' && st.isSent) return false;
        if (fStatus === '신청완료' && !st.isSent) return false;
        if (['등록완료', '검정신청', '품검요청', '일정완료'].includes(fStatus) && st.normStatus !== fStatus) return false;
      }
      return true;
    });
  }

  function getRpDueClass(dueDateStr, isSent) {
    if (!dueDateStr || isSent) return '';
    const m = String(dueDateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const diffDays = Math.ceil((due - today) / 86400000);
    if (diffDays < 0) return 'is-rp-overdue';
    if (diffDays <= 7) return 'is-rp-due-soon';
    return '';
  }

  const RP_COL_ORDER_STORAGE_KEY = 'pms_rp_col_order_v1';
  const RP_DISPLAY_OPTS_STORAGE_KEY = 'pms_rp_display_opts_v1';
  const RP_DATE_HIDE_KEYS = new Set(['issueReqDate', 'weekDate', 'inspectDate']);

  function loadRpDisplayOpts() {
    try {
      const raw = localStorage.getItem(RP_DISPLAY_OPTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          hideCode: !!parsed.hideCode,
          hideFormat: !!parsed.hideFormat,
          hideGroup: !!parsed.hideGroup,
          hideName: !!parsed.hideName,
          hideDates: !!parsed.hideDates
        };
      }
    } catch (e) { /* ignore */ }
    return { hideCode: false, hideFormat: false, hideGroup: false, hideName: false, hideDates: false };
  }

  function saveRpDisplayOpts(opts) {
    try {
      localStorage.setItem(RP_DISPLAY_OPTS_STORAGE_KEY, JSON.stringify({
        hideCode: !!opts.hideCode,
        hideFormat: !!opts.hideFormat,
        hideGroup: !!opts.hideGroup,
        hideName: !!opts.hideName,
        hideDates: !!opts.hideDates
      }));
    } catch (e) { /* ignore */ }
  }

  function filterVisibleRpColumns(cols, opts = loadRpDisplayOpts()) {
    const filtered = (cols || []).filter(c => {
      if (opts.hideCode && c.key === 'code') return false;
      if (opts.hideFormat && c.key === 'formatNo') return false;
      if (opts.hideGroup && c.key === 'itemGroup') return false;
      if (opts.hideName && c.key === 'name') return false;
      if (opts.hideDates && RP_DATE_HIDE_KEYS.has(c.key)) return false;
      return true;
    });
    return recalcRpFixedCols(filtered);
  }

  const RP_GRID_COLUMNS = [
    { key: '_chk', label: '선택', editable: false, cls: 'rp-col-chk', width: 36, fixedLeft: 0 },
    { key: '_no', label: 'NO', editable: false, cls: 'rp-col-no', width: 42, fixedLeft: 36 },
    { key: 'reqNo', field: 'reqNo', label: '제작의뢰번호', editable: true, cls: 'rp-col-req is-mono', width: 130, fixedLeft: 78 },
    { key: 'code', field: 'code', label: '품목코드', editable: true, cls: 'rp-col-code is-mono text-center', width: 110, fixedLeft: 208 },
    { key: 'formatNo', field: 'formatNo', label: '형식번호', editable: true, cls: 'rp-col-fmt', width: 85, fixedLeft: 318 },
    { key: 'itemGroup', field: 'itemGroup', label: '품목그룹', editable: false, cls: 'rp-col-group text-center', width: 95, fixedLeft: 403 },
    { key: 'name', field: 'name', label: '품명', editable: true, cls: 'rp-col-name', width: 130, fixedLeft: 498 },
    { key: 'siteName', field: 'siteName', label: '현장명', editable: true, cls: 'rp-col-site', width: 220, fixedLeft: 628 },
    { key: 'builder', field: 'builder', label: '건설사', editable: true, cls: 'rp-col-builder', width: 115 },
    { key: 'client', field: 'client', label: '거래선', editable: true, cls: 'rp-col-client', width: 95 },
    { key: 'manager', field: 'manager', label: '담당자', editable: true, cls: 'rp-col-manager text-center', width: 75 },
    { key: 'receiptDate', field: 'receiptDate', label: '접수일', editable: true, isDate: true, cls: 'rp-col-date is-mono text-center', width: 96 },
    { key: 'dueDate', field: 'dueDate', label: '납기일자', editable: true, isDate: true, cls: 'rp-col-date rp-col-date-due is-mono text-center', width: 96 },
    { key: 'issueReqDate', field: 'issueReqDate', label: '불출일', editable: true, isDate: true, cls: 'rp-col-date is-mono text-center', width: 96 },
    { key: 'weekDate', field: 'weekDate', label: '생산주차', editable: true, isDate: true, cls: 'rp-col-date is-mono text-center', width: 96 },
    { key: 'inspectDate', field: 'inspectDate', label: '수검일자', editable: true, isDate: true, cls: 'rp-col-date is-mono text-center', width: 96 },
    { key: 'colorInfo', field: 'colorInfo', label: '외함색상', editable: true, cls: 'rp-col-color', width: 120 },
    { key: 'remark', field: 'remark', label: '비고', editable: true, cls: 'rp-col-remark', width: 130 },
    { key: 'lotNo', field: 'lotNo', label: '로트번호', editable: true, cls: 'rp-col-lot is-mono text-center', width: 82 },
    { key: 'mfgYm', field: 'mfgYm', label: '제조년월', editable: true, cls: 'rp-col-ym is-mono text-center', width: 68 },
    { key: 'serialFrom', field: 'serialFrom', label: '제조번호 FROM', editable: true, cls: 'rp-col-serial is-mono text-center', width: 92 },
    { key: 'serialTo', field: 'serialTo', label: '제조번호 TO', editable: true, cls: 'rp-col-serial is-mono text-center', width: 92 }
  ];

  function recalcRpFixedCols(cols) {
    const toggleableFixed = ['code', 'formatNo', 'itemGroup', 'name'];
    const hiddenFixedCnt = toggleableFixed.reduce((cnt, k) => cnt + (cols.some(c => c.key === k) ? 0 : 1), 0);
    const fixedLimit = Math.max(2, 8 - hiddenFixedCnt);
    let left = 0;
    cols.forEach((col, idx) => {
      if (idx < fixedLimit) {
        col.isFixed = true;
        col.fixedLeft = left;
        left += Number(col.width || 100);
      } else {
        col.isFixed = false;
        col.fixedLeft = undefined;
      }
    });
    return cols;
  }

  function loadRpOrderedColumns(overrideKeys = null) {
    const base = RP_GRID_COLUMNS.map(c => ({ ...c }));
    try {
      let savedKeys = Array.isArray(overrideKeys) ? overrideKeys : null;
      if (!savedKeys) {
        const raw = localStorage.getItem(RP_COL_ORDER_STORAGE_KEY);
        if (raw) savedKeys = JSON.parse(raw);
      }
      if (Array.isArray(savedKeys) && savedKeys.length > 0) {
        const pinned = base.slice(0, 2);
        const dataCols = base.slice(2);
        const byKey = new Map(dataCols.map(c => [c.key, c]));
        const ordered = [];
        savedKeys.forEach(k => {
          if (byKey.has(k)) {
            ordered.push(byKey.get(k));
            byKey.delete(k);
          }
        });
        byKey.forEach(c => ordered.push(c));
        return recalcRpFixedCols([...pinned, ...ordered]);
      }
    } catch (e) { /* ignore */ }
    return recalcRpFixedCols(base);
  }

  function saveRpColumnOrder(cols) {
    try {
      const visibleKeys = (cols || []).slice(2).map(c => c.key);
      const visibleSet = new Set(visibleKeys);
      const prevRaw = localStorage.getItem(RP_COL_ORDER_STORAGE_KEY);
      const defaultKeys = RP_GRID_COLUMNS.slice(2).map(c => c.key);
      const prevKeys = prevRaw ? JSON.parse(prevRaw) : defaultKeys;
      const baseOrder = Array.isArray(prevKeys) ? [...prevKeys] : [...defaultKeys];
      defaultKeys.forEach(k => {
        if (!baseOrder.includes(k)) baseOrder.push(k);
      });

      let visIdx = 0;
      const merged = [];
      baseOrder.forEach(k => {
        if (visibleSet.has(k)) {
          if (visIdx < visibleKeys.length) {
            merged.push(visibleKeys[visIdx++]);
          }
        } else {
          merged.push(k);
        }
      });
      while (visIdx < visibleKeys.length) {
        merged.push(visibleKeys[visIdx++]);
      }

      localStorage.setItem(RP_COL_ORDER_STORAGE_KEY, JSON.stringify(merged));
    } catch (e) { /* ignore */ }
  }

  const rpGridState = {
    rows: [],
    columns: filterVisibleRpColumns(loadRpOrderedColumns()),
    anchor: null,
    focus: null,
    isDragging: false,
    editing: null,
    lastCopiedTSV: ''
  };

  function getRpSelectedRange() {
    if (!rpGridState.anchor || !rpGridState.focus) return null;
    if (rpGridState.rows.length === 0) return null;
    const maxR = rpGridState.rows.length - 1;
    const maxC = rpGridState.columns.length - 1;
    const minDataC = Math.min(2, maxC);
    return {
      r1: Math.max(0, Math.min(maxR, Math.min(rpGridState.anchor.r, rpGridState.focus.r))),
      r2: Math.max(0, Math.min(maxR, Math.max(rpGridState.anchor.r, rpGridState.focus.r))),
      c1: Math.max(minDataC, Math.min(maxC, Math.min(rpGridState.anchor.c, rpGridState.focus.c))),
      c2: Math.max(minDataC, Math.min(maxC, Math.max(rpGridState.anchor.c, rpGridState.focus.c)))
    };
  }

  function applyRpSelectionClasses() {
    const tbody = document.getElementById('rp-excel-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('td.plan-cell-selected, td.plan-cell-active, td.plan-range-top, td.plan-range-bottom, td.plan-range-left, td.plan-range-right').forEach(td => {
      td.classList.remove('plan-cell-selected', 'plan-cell-active', 'plan-range-top', 'plan-range-bottom', 'plan-range-left', 'plan-range-right');
    });

    const selSet = state.rpSelectedIds instanceof Set ? state.rpSelectedIds : new Set();
    const selInfo = document.getElementById('rp-selection-info');
    const range = getRpSelectedRange();
    if (!range) {
      if (selInfo) selInfo.textContent = `선택: ${selSet.size}건`;
      return;
    }

    for (let r = range.r1; r <= range.r2; r++) {
      const tr = tbody.querySelector(`tr[data-r="${r}"]`);
      if (!tr) continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const td = tr.querySelector(`td[data-c="${c}"]`);
        if (!td) continue;
        td.classList.add('plan-cell-selected');
        if (r === range.r1) td.classList.add('plan-range-top');
        if (r === range.r2) td.classList.add('plan-range-bottom');
        if (c === range.c1) td.classList.add('plan-range-left');
        if (c === range.c2) td.classList.add('plan-range-right');
      }
    }

    const active = rpGridState.anchor;
    if (active && active.r < rpGridState.rows.length) {
      const activeTd = tbody.querySelector(`td[data-r="${active.r}"][data-c="${active.c}"]`);
      if (activeTd) activeTd.classList.add('plan-cell-active');
    }

    if (selInfo) {
      const rCount = range.r2 - range.r1 + 1;
      const cCount = range.c2 - range.c1 + 1;
      selInfo.textContent = (rCount > 1 || cCount > 1)
        ? `선택: ${selSet.size}건 (${rCount}행×${cCount}열)`
        : `선택: ${selSet.size}건`;
    }
  }

  function scrollRpCellIntoView(r, c) {
    const tbody = document.getElementById('rp-excel-tbody');
    if (!tbody) return;
    const td = tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    if (td && typeof td.scrollIntoView === 'function') {
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function findNextRpEditableCell(r, c, reverse) {
    const cols = rpGridState.columns;
    const rows = rpGridState.rows;
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
      if (cols[cc] && cols[cc].editable) return { r: cr, c: cc };
    }
    return null;
  }

  function canEditReceiverPlan() {
    const u = state.currentUser;
    if (!u || u.isGuest) return false;
    const perms = u.permissions || {};
    const perm = perms.receiverPlan || perms.plan || 'view';
    return perm === 'edit';
  }

  function renderReceiverPlanHeader() {
    const theadRow = document.querySelector('#rp-excel-table thead tr.plan-header-row-1');
    if (!theadRow) return;
    const canEdit = canEditReceiverPlan();
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    theadRow.innerHTML = rpGridState.columns.map(col => {
      const fixedCls = col.isFixed ? 'rp-fixed-col ' : '';
      const styleAttr = (col.isFixed && col.fixedLeft !== undefined) ? ` style="left: ${col.fixedLeft}px;"` : '';
      if (col.key === '_chk') {
        return `<th class="${fixedCls}${col.cls}"${styleAttr}><input type="checkbox" id="chk-rp-all" title="현재 필터 목록 전체 선택"></th>`;
      }
      if (col.key === '_no') {
        return `<th class="${fixedCls}${col.cls}"${styleAttr}>NO</th>`;
      }
      const dragAttr = canEdit ? ' draggable="true" title="드래그하여 열 순서 변경"' : '';
      return `<th class="${fixedCls}${col.cls}"${styleAttr} data-col-key="${col.key}"${dragAttr}>${esc(col.label)}</th>`;
    }).join('');
  }

  function renderReceiverPlanModule() {
    if (!Array.isArray(state.receiverPlanRows)) loadLocalReceiverPlanData();
    if (recalculatePendingReceiverLotsAndSerials() > 0) {
      saveLocalReceiverPlanData();
    }
    const rpOpts = loadRpDisplayOpts();
    const chkRpCode = document.getElementById('chk-rp-hide-code');
    const chkRpFmt = document.getElementById('chk-rp-hide-format');
    const chkRpGroup = document.getElementById('chk-rp-hide-group');
    const chkRpName = document.getElementById('chk-rp-hide-name');
    const chkRpDates = document.getElementById('chk-rp-hide-dates');
    if (chkRpCode) chkRpCode.checked = rpOpts.hideCode;
    if (chkRpFmt) chkRpFmt.checked = rpOpts.hideFormat;
    if (chkRpGroup) chkRpGroup.checked = rpOpts.hideGroup;
    if (chkRpName) chkRpName.checked = rpOpts.hideName;
    if (chkRpDates) chkRpDates.checked = rpOpts.hideDates;

    populateReceiverPlanFilterOptions();
    renderReceiverPlanHeader();

    const tbody = document.getElementById('rp-excel-tbody');
    if (!tbody) return;

    const allRows = state.receiverPlanRows || [];
    const filtered = getFilteredReceiverPlanRows();
    rpGridState.rows = filtered;
    rpGridState.editing = null;

    // 요약 배지(동그라미 숫자) & 납기임박 칩 업데이트
    let allPendingCnt = 0;
    allRows.forEach(r => {
      const st = getReceiverPlanCertStatus(r);
      if (!st.isSent) allPendingCnt++;
    });

    let urgentCnt = 0;
    allRows.forEach(r => {
      const st = getReceiverPlanCertStatus(r);
      if (getRpDueClass(r.dueDate, st.isSent)) urgentCnt++;
    });

    const elCountAll = document.getElementById('rp-count-all');
    const elCountPending = document.getElementById('rp-count-pending');
    const elUrgent = document.getElementById('rp-summary-urgent');
    if (elCountAll) elCountAll.textContent = String(allRows.length);
    if (elCountPending) elCountPending.textContent = String(allPendingCnt);
    if (elUrgent) {
      elUrgent.textContent = `납기임박 ${urgentCnt}건`;
      elUrgent.style.display = urgentCnt > 0 ? '' : 'none';
    }

    const selSet = state.rpSelectedIds instanceof Set ? state.rpSelectedIds : new Set();
    const chkAll = document.getElementById('chk-rp-all');
    if (chkAll) {
      chkAll.checked = filtered.length > 0 && filtered.every(r => selSet.has(r.id));
    }

    if (filtered.length === 0) {
      rpGridState.anchor = null;
      rpGridState.focus = null;
      tbody.innerHTML = `<tr><td colspan="${rpGridState.columns.length}" style="text-align:center; padding:32px; color:var(--text-muted);">표시할 수신기계획 데이터가 없습니다. [+ 행 추가] 또는 [엑셀 관리 ▾]에서 파일을 업로드하세요.</td></tr>`;
      applyRpSelectionClasses();
      return;
    }

    if (rpGridState.anchor && rpGridState.anchor.r >= filtered.length) {
      rpGridState.anchor = { r: filtered.length - 1, c: rpGridState.anchor.c };
    }
    if (rpGridState.focus && rpGridState.focus.r >= filtered.length) {
      rpGridState.focus = { r: filtered.length - 1, c: rpGridState.focus.c };
    }

    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    tbody.innerHTML = filtered.map((row, rIdx) => {
      const st = getReceiverPlanCertStatus(row);
      const isChecked = selSet.has(row.id);
      const dueCls = getRpDueClass(row.dueDate, st.isSent);
      const dateErrCls = (row.receiptDate && row.dueDate && row.dueDate < row.receiptDate) ? 'is-date-error' : '';

      const cellsHtml = rpGridState.columns.map((col, cIdx) => {
        const fixedCls = col.isFixed ? 'rp-fixed-col ' : '';
        const fullCls = `${fixedCls}${col.cls}`;
        const styleAttr = (col.isFixed && col.fixedLeft !== undefined) ? ` style="left: ${col.fixedLeft}px;"` : '';
        if (col.key === '_chk') {
          return `<td class="${fullCls}"${styleAttr} data-r="${rIdx}" data-c="${cIdx}"><input type="checkbox" class="chk-rp-row" data-rp-id="${row.id}" ${isChecked ? 'checked' : ''}></td>`;
        }
        if (col.key === '_no') {
          const noTitle = canEditReceiverPlan() ? ' title="드래그하여 행 순서 변경"' : '';
          return `<td class="${fullCls}"${styleAttr} data-r="${rIdx}" data-c="${cIdx}"${noTitle}>${rIdx + 1}</td>`;
        }
        let val = row[col.field] ?? '';
        if (col.key === 'itemGroup' && row.code) {
          val = getEffectiveRpItemGroup(row) || val;
        } else if (col.key === 'name' && row.code) {
          val = getDisplayNameByCode(row.code, val);
        }
        const escVal = esc(val);
        if (col.key === 'reqNo') {
          const titleText = st.isLocked
            ? `${st.label} (수정 불가)${val ? ' · ' + escVal : ''}`
            : `${st.label}${val ? ' · ' + escVal : ''}`;
          return `<td class="${fullCls} ${st.dotCls}"${styleAttr} data-r="${rIdx}" data-c="${cIdx}" title="${titleText}">${escVal}</td>`;
        }
        const errCls = (col.key === 'dueDate' && dateErrCls) ? ` ${dateErrCls}` : '';
        let titleAttr = '';
        if (col.key === 'dueDate' && dateErrCls) {
          titleAttr = ' title="접수일보다 납기일자가 빠릅니다"';
        } else if (st.isLocked) {
          titleAttr = ` title="${escVal ? escVal + ' · ' : ''}검정신청/완료된 건은 수정할 수 없습니다"`;
        } else if (escVal) {
          titleAttr = ` title="${escVal}"`;
        }
        return `<td class="${fullCls}${errCls}"${styleAttr} data-r="${rIdx}" data-c="${cIdx}"${titleAttr}>${escVal}</td>`;
      }).join('');

      const igRowCls = getItemGroupColorClass(getEffectiveRpItemGroup(row));
      return `<tr data-rp-id="${row.id}" data-r="${rIdx}" class="${st.rowCls} ${isChecked ? 'is-rp-selected' : ''} ${dueCls} ${igRowCls}">${cellsHtml}</tr>`;
    }).join('');

    applyRpSelectionClasses();
  }

  function initReceiverPlanEvents() {
    // 수신기계획 열 헤더 드래그 순서 변경 (수정 권한 있는 사용자만 가능)
    const rpThead = document.querySelector('#rp-excel-table thead');
    if (rpThead) {
      let draggingColKey = null;

      const clearColDragVisuals = () => {
        rpThead.querySelectorAll('th').forEach(th => {
          th.classList.remove('rp-col-dragging', 'rp-col-drop-left', 'rp-col-drop-right');
        });
      };

      rpThead.addEventListener('dragstart', (e) => {
        const th = e.target.closest('th[data-col-key]');
        if (!th || !canEditReceiverPlan()) {
          e.preventDefault();
          return;
        }
        draggingColKey = th.dataset.colKey;
        th.classList.add('rp-col-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggingColKey);
        }
      });

      rpThead.addEventListener('dragover', (e) => {
        if (!draggingColKey || !canEditReceiverPlan()) return;
        const targetTh = e.target.closest('th[data-col-key]');
        if (!targetTh || targetTh.dataset.colKey === draggingColKey) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        rpThead.querySelectorAll('th').forEach(th => th.classList.remove('rp-col-drop-left', 'rp-col-drop-right'));
        const rect = targetTh.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        targetTh.classList.add(isLeft ? 'rp-col-drop-left' : 'rp-col-drop-right');
      });

      rpThead.addEventListener('drop', (e) => {
        if (!draggingColKey || !canEditReceiverPlan()) return;
        e.preventDefault();
        const targetTh = e.target.closest('th[data-col-key]');
        const draggedKey = draggingColKey;
        draggingColKey = null;
        const wasLeft = targetTh && targetTh.classList.contains('rp-col-drop-left');
        clearColDragVisuals();

        if (!targetTh || targetTh.dataset.colKey === draggedKey) return;
        const targetKey = targetTh.dataset.colKey;
        const cols = rpGridState.columns;
        const fromIdx = cols.findIndex(c => c.key === draggedKey);
        if (fromIdx < 2) return;

        const [moved] = cols.splice(fromIdx, 1);
        let toIdx = cols.findIndex(c => c.key === targetKey);
        if (toIdx < 2) {
          cols.splice(fromIdx, 0, moved);
          return;
        }
        if (!wasLeft) toIdx += 1;
        cols.splice(toIdx, 0, moved);

        recalcRpFixedCols(cols);
        saveRpColumnOrder(cols);
        markAsDirty(true);
        rpGridState.anchor = null;
        rpGridState.focus = null;
        renderReceiverPlanModule();
        showToast('열 순서가 변경되었습니다. [저장] 버튼을 눌러 DB에 반영하세요.');
      });

      rpThead.addEventListener('dragend', () => {
        draggingColKey = null;
        clearColDragVisuals();
      });
    }

    // 수신기계획 행 드래그 순서 변경 (수정 권한 있는 사용자만 가능)
    const rpTbody = document.getElementById('rp-excel-tbody');
    if (rpTbody) {
      let draggingRowId = null;

      const clearRpDragVisuals = () => {
        rpTbody.querySelectorAll('tr').forEach(r => {
          r.classList.remove('rp-row-dragging', 'rp-drop-above', 'rp-drop-below');
          r.draggable = false;
        });
      };

      rpTbody.addEventListener('mousedown', (e) => {
        const noCell = e.target.closest('td.rp-col-no');
        if (!noCell) return;
        const tr = noCell.closest('tr[data-rp-id]');
        if (!tr) return;
        if (!canEditReceiverPlan()) return;
        tr.draggable = true;
      });

      document.addEventListener('mouseup', () => {
        if (!draggingRowId) {
          rpTbody.querySelectorAll('tr[draggable="true"]').forEach(r => { r.draggable = false; });
        }
      });

      rpTbody.addEventListener('dragstart', (e) => {
        const tr = e.target.closest('tr[data-rp-id]');
        if (!tr || !canEditReceiverPlan()) {
          e.preventDefault();
          return;
        }
        draggingRowId = tr.dataset.rpId;
        tr.classList.add('rp-row-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggingRowId);
        }
      });

      rpTbody.addEventListener('dragover', (e) => {
        if (!draggingRowId || !canEditReceiverPlan()) return;
        const targetTr = e.target.closest('tr[data-rp-id]');
        if (!targetTr || targetTr.dataset.rpId === draggingRowId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        rpTbody.querySelectorAll('tr').forEach(r => r.classList.remove('rp-drop-above', 'rp-drop-below'));
        const rect = targetTr.getBoundingClientRect();
        const isAbove = e.clientY < rect.top + rect.height / 2;
        targetTr.classList.add(isAbove ? 'rp-drop-above' : 'rp-drop-below');
      });

      rpTbody.addEventListener('drop', (e) => {
        if (!draggingRowId || !canEditReceiverPlan()) return;
        e.preventDefault();
        const targetTr = e.target.closest('tr[data-rp-id]');
        const draggedId = draggingRowId;
        draggingRowId = null;
        const wasAbove = targetTr && targetTr.classList.contains('rp-drop-above');
        clearRpDragVisuals();

        if (!targetTr || targetTr.dataset.rpId === draggedId) return;
        const targetId = targetTr.dataset.rpId;
        const list = state.receiverPlanRows || [];
        const fromIdx = list.findIndex(r => r.id === draggedId);
        if (fromIdx < 0) return;

        const [moved] = list.splice(fromIdx, 1);
        let toIdx = list.findIndex(r => r.id === targetId);
        if (toIdx < 0) {
          list.splice(fromIdx, 0, moved);
          return;
        }
        if (!wasAbove) toIdx += 1;
        list.splice(toIdx, 0, moved);

        saveLocalReceiverPlanData();
        markAsDirty(true);
        renderReceiverPlanModule();
        showToast('행 순서가 변경되었습니다. [저장] 버튼을 눌러 반영하세요.');
      });

      rpTbody.addEventListener('dragend', () => {
        draggingRowId = null;
        clearRpDragVisuals();
      });
    }

    let acPopup = null;
    function closeRpAutocomplete() {
      if (acPopup) {
        acPopup.remove();
        acPopup = null;
      }
    }

    function openRpCodeAutocomplete(inputEl, rowId) {
      closeRpAutocomplete();
      const q = (inputEl.value || '').trim().toLowerCase();
      const items = (state.certMasterItems || []).filter(it => {
        if ((it.useYn || '사용') !== '사용') return false;
        if (!q) return getDefaultItemApplyType(it) === '수동' || it.group === '수신기반';
        return String(it.code || '').toLowerCase().includes(q) ||
               String(it.name || '').toLowerCase().includes(q) ||
               String(it.altName || '').toLowerCase().includes(q);
      }).slice(0, 12);

      if (items.length === 0) return;

      const rect = inputEl.getBoundingClientRect();
      acPopup = document.createElement('div');
      acPopup.className = 'rp-code-autocomplete';
      acPopup.style.left = `${rect.left}px`;
      acPopup.style.top = `${Math.min(window.innerHeight - 250, rect.bottom + 2)}px`;
      acPopup.innerHTML = items.map(it => `
        <button type="button" class="rp-ac-item" data-code="${String(it.code || '').replace(/"/g, '&quot;')}">
          <span><strong>${it.code}</strong> · ${getDisplayItemName(it)}</span>
          <span style="color:var(--text-muted); font-size:11px;">${it.formatNo || '-'}</span>
        </button>
      `).join('');

      acPopup.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.rp-ac-item');
        if (!btn) return;
        e.preventDefault();
        const selectedCode = btn.dataset.code;
        const mItem = (state.certMasterItems || []).find(i => i.code === selectedCode);
        const row = (state.receiverPlanRows || []).find(r => r.id === rowId);
        if (row && mItem) {
          pushRpUndoSnapshot();
          const prevCode = String(row.code || '').trim().toLowerCase();
          const nextCode = String(mItem.code || '').trim().toLowerCase();
          row.code = mItem.code || '';
          row.formatNo = (mItem.formatNo && mItem.formatNo !== '-') ? mItem.formatNo : '';
          row.itemGroup = (mItem.itemGroup && mItem.itemGroup !== '-') ? mItem.itemGroup : '';
          row.name = getDisplayItemName(mItem);
          if (prevCode !== nextCode) {
            row.lotNo = '';
            row.serialFrom = '';
            row.serialTo = '';
          }
          recommendReceiverLotAndSerial([row], false);
          rpGridState.editing = null;
          saveLocalReceiverPlanData();
          markAsDirty(true);
          renderReceiverPlanModule();
          document.getElementById('rp-grid-scroll-wrap')?.focus({ preventScroll: true });
        }
        closeRpAutocomplete();
      });

      document.body.appendChild(acPopup);
    }

    // 검색/필터 이벤트
    document.getElementById('rp-search-site')?.addEventListener('input', () => renderReceiverPlanModule());
    document.getElementById('rp-filter-year')?.addEventListener('change', (e) => {
      state.rpFilterYear = e.target.value || 'ALL';
      const weekSel = document.getElementById('rp-filter-week');
      if (weekSel) weekSel.value = 'ALL';
      renderReceiverPlanModule();
    });
    ['rp-filter-week', 'rp-filter-item'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => renderReceiverPlanModule());
    });

    document.querySelectorAll('#rp-status-filters .plan-legend-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#rp-status-filters .plan-legend-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.rpStatusFilter = btn.dataset.rpStatus || 'ALL';
        renderReceiverPlanModule();
      });
    });

    // 전체 선택 체크박스 (헤더 재렌더링 대응 위임)
    document.querySelector('#rp-excel-table thead')?.addEventListener('change', (e) => {
      if (!e.target || e.target.id !== 'chk-rp-all') return;
      if (!(state.rpSelectedIds instanceof Set)) state.rpSelectedIds = new Set();
      const filtered = getFilteredReceiverPlanRows();
      if (e.target.checked) filtered.forEach(r => state.rpSelectedIds.add(r.id));
      else filtered.forEach(r => state.rpSelectedIds.delete(r.id));
      renderReceiverPlanModule();
    });

    // 엑셀형 그리드 셀 편집/선택/복사/붙여넣기
    const scrollWrap = document.getElementById('rp-grid-scroll-wrap');
    const tbody = document.getElementById('rp-excel-tbody');

    function applyRpCellValue(row, col, rawVal) {
      if (!row || !col || !col.editable || !col.field) return false;
      let nextVal = String(rawVal ?? '').trim();
      if (col.isDate) {
        nextVal = parseShortDateInput(nextVal);
      }
      if ((row[col.field] ?? '') === nextVal) return false;

      row[col.field] = nextVal;

      if (col.field === 'code' && nextVal) {
        const mItem = (state.certMasterItems || []).find(i =>
          String(i.code || '').trim().toLowerCase() === nextVal.toLowerCase()
        );
        if (mItem) {
          row.code = mItem.code;
          row.formatNo = (mItem.formatNo && mItem.formatNo !== '-') ? mItem.formatNo : '';
          row.itemGroup = (mItem.itemGroup && mItem.itemGroup !== '-') ? mItem.itemGroup : '';
          row.name = getDisplayItemName(mItem);
          row.lotNo = '';
          row.serialFrom = '';
          row.serialTo = '';
          recommendReceiverLotAndSerial([row], false);
        }
      }

      if (col.field === 'weekDate' && nextVal) {
        if (/^\d{4}/.test(nextVal)) row.planYear = nextVal.slice(0, 4);
        const calcInspect = calcReceiverInspectDateFromWeekDate(nextVal);
        if (calcInspect) row.inspectDate = calcInspect;
        const calcYm = calcReceiverMfgYmFromWeekDate(nextVal);
        if (calcYm) row.mfgYm = calcYm;
      }

      if (col.field === 'serialFrom' && nextVal && !row.serialTo) {
        row.serialTo = nextVal;
      }
      return true;
    }

    function commitRpCellEdit(save) {
      const ed = rpGridState.editing;
      if (!ed) return;
      rpGridState.editing = null;
      closeRpAutocomplete();

      const col = rpGridState.columns[ed.c];
      const row = rpGridState.rows[ed.r];
      if (!col || !row) {
        renderReceiverPlanModule();
        return;
      }

      if (save) {
        const newVal = ed.inputEl.value;
        const origNorm = String(ed.originalVal ?? '');
        const newNorm = col.isDate ? parseShortDateInput(String(newVal ?? '').trim()) : String(newVal ?? '').trim();
        if (newNorm !== origNorm) {
          pushRpUndoSnapshot();
          const changed = applyRpCellValue(row, col, newVal);
          if (changed) {
            saveLocalReceiverPlanData();
            markAsDirty(true);
          } else {
            state.rpUndoStack.pop();
            const undoBtn = document.getElementById('btn-rp-undo');
            if (undoBtn) undoBtn.disabled = state.rpUndoStack.length === 0;
          }
        }
      }

      renderReceiverPlanModule();
    }

    let rpImeProxy = scrollWrap ? scrollWrap.querySelector('#rp-ime-proxy') : null;
    if (scrollWrap && !rpImeProxy) {
      rpImeProxy = document.createElement('input');
      rpImeProxy.type = 'text';
      rpImeProxy.id = 'rp-ime-proxy';
      rpImeProxy.className = 'rp-ime-proxy';
      rpImeProxy.lang = 'ko';
      rpImeProxy.autocomplete = 'off';
      rpImeProxy.setAttribute('aria-hidden', 'true');
      rpImeProxy.tabIndex = -1;
      scrollWrap.appendChild(rpImeProxy);
    }

    let isRpImeComposing = false;

    function resetRpImeProxyVisual() {
      if (!rpImeProxy) return;
      rpImeProxy.removeAttribute('style');
    }

    function focusRpGrid() {
      if (rpImeProxy) {
        isRpImeComposing = false;
        resetRpImeProxyVisual();
        rpImeProxy.value = '';
        rpImeProxy.focus({ preventScroll: true });
      } else {
        scrollWrap?.focus({ preventScroll: true });
      }
    }

    if (rpImeProxy) {
      rpImeProxy.addEventListener('compositionstart', () => {
        isRpImeComposing = true;
        if (rpGridState.editing || !rpGridState.anchor) return;
        const col = rpGridState.columns[rpGridState.anchor.c];
        const row = rpGridState.rows[rpGridState.anchor.r];
        if (!col || !col.editable || !row || getReceiverPlanCertStatus(row).isLocked) return;
        const td = tbody ? tbody.querySelector(`td[data-r="${rpGridState.anchor.r}"][data-c="${rpGridState.anchor.c}"]`) : null;
        if (td) {
          const rect = td.getBoundingClientRect();
          rpImeProxy.style.position = 'fixed';
          rpImeProxy.style.left = `${rect.left}px`;
          rpImeProxy.style.top = `${rect.top}px`;
          rpImeProxy.style.width = `${rect.width}px`;
          rpImeProxy.style.height = `${rect.height}px`;
          rpImeProxy.style.opacity = '1';
          rpImeProxy.style.zIndex = '200';
          rpImeProxy.style.background = 'var(--bg-card, #ffffff)';
          rpImeProxy.style.color = 'var(--text-main, #0f172a)';
          rpImeProxy.style.border = '2px solid #2563eb';
          rpImeProxy.style.padding = '2px 6px';
          rpImeProxy.style.fontSize = '12px';
          rpImeProxy.style.boxSizing = 'border-box';
        }
      });

      rpImeProxy.addEventListener('compositionend', () => {
        isRpImeComposing = false;
        resetRpImeProxyVisual();
        const txt = rpImeProxy.value;
        rpImeProxy.value = '';
        if (!txt || rpGridState.editing || !rpGridState.anchor) return;
        const col = rpGridState.columns[rpGridState.anchor.c];
        if (col && col.editable) {
          startRpCellEdit(rpGridState.anchor.r, rpGridState.anchor.c, txt, true);
        }
      });

      rpImeProxy.addEventListener('input', (e) => {
        if (isRpImeComposing || e.isComposing) return;
        const txt = rpImeProxy.value;
        rpImeProxy.value = '';
        if (!txt || rpGridState.editing || !rpGridState.anchor) return;
        const col = rpGridState.columns[rpGridState.anchor.c];
        if (col && col.editable) {
          startRpCellEdit(rpGridState.anchor.r, rpGridState.anchor.c, txt, true);
        }
      });
    }

    function startRpCellEdit(r, c, initialText, replaceMode) {
      if (rpGridState.editing) commitRpCellEdit(true);

      const col = rpGridState.columns[c];
      const row = rpGridState.rows[r];
      if (!col || !row || !col.editable) return;
      const st = getReceiverPlanCertStatus(row);
      if (st.isLocked) {
        showToast('검정신청/완료된 건은 수정할 수 없습니다.');
        return;
      }

      const td = tbody ? tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`) : null;
      if (!td) return;

      const origVal = row[col.field] ?? '';
      td.classList.add('plan-cell-editing');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'plan-cell-editor';
      input.lang = 'ko';
      input.style.imeMode = 'active';
      input.value = replaceMode ? (initialText !== undefined ? initialText : '') : String(origVal);

      td.innerHTML = '';
      td.appendChild(input);
      input.focus();
      if (!replaceMode) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }

      rpGridState.editing = { r, c, originalVal: origVal, inputEl: input };

      if (col.field === 'code') {
        input.addEventListener('input', () => {
          openRpCodeAutocomplete(input, row.id);
        });
      }

      input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          commitRpCellEdit(true);
          const nextR = Math.max(0, Math.min(rpGridState.rows.length - 1, r + (e.shiftKey ? -1 : 1)));
          rpGridState.anchor = { r: nextR, c };
          rpGridState.focus = { r: nextR, c };
          applyRpSelectionClasses();
          scrollRpCellIntoView(nextR, c);
          focusRpGrid();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitRpCellEdit(true);
          const next = findNextRpEditableCell(r, c, e.shiftKey);
          if (next) {
            rpGridState.anchor = next;
            rpGridState.focus = next;
            applyRpSelectionClasses();
            scrollRpCellIntoView(next.r, next.c);
          }
          focusRpGrid();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          commitRpCellEdit(false);
          focusRpGrid();
        }
      });

      input.addEventListener('blur', () => {
        setTimeout(closeRpAutocomplete, 160);
        if (rpGridState.editing && rpGridState.editing.inputEl === input) {
          commitRpCellEdit(true);
        }
      });
    }

    function clearRpSelectedCells() {
      const range = getRpSelectedRange();
      if (!range) return;
      pushRpUndoSnapshot();
      let changed = false;
      let lockedSkipped = false;
      for (let r = range.r1; r <= range.r2; r++) {
        const row = rpGridState.rows[r];
        if (!row) continue;
        if (getReceiverPlanCertStatus(row).isLocked) {
          lockedSkipped = true;
          continue;
        }
        for (let c = range.c1; c <= range.c2; c++) {
          const col = rpGridState.columns[c];
          if (col && col.editable && (row[col.field] ?? '') !== '') {
            row[col.field] = '';
            changed = true;
          }
        }
      }
      if (changed) {
        saveLocalReceiverPlanData();
        markAsDirty(true);
        renderReceiverPlanModule();
      } else {
        state.rpUndoStack.pop();
        const undoBtn = document.getElementById('btn-rp-undo');
        if (undoBtn) undoBtn.disabled = state.rpUndoStack.length === 0;
        if (lockedSkipped) showToast('검정신청/완료된 건은 수정할 수 없습니다.');
      }
    }

    function copyRpSelectionToClipboard(clipboardData) {
      const range = getRpSelectedRange();
      if (!range) return;

      const lines = [];
      for (let r = range.r1; r <= range.r2; r++) {
        const row = rpGridState.rows[r];
        if (!row) continue;
        const cells = [];
        for (let c = range.c1; c <= range.c2; c++) {
          const col = rpGridState.columns[c];
          if (col.key === '_chk') cells.push('');
          else if (col.key === '_no') cells.push(String(r + 1));
          else cells.push(String(row[col.field] ?? ''));
        }
        lines.push(cells.join('\t'));
      }

      const tsv = lines.join('\r\n');
      rpGridState.lastCopiedTSV = tsv;
      if (clipboardData) {
        clipboardData.setData('text/plain', tsv);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsv).catch(() => {});
      }

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

    function pasteTSVToRpGrid(text) {
      if (text === undefined || text === null || text === '') return;
      const range = getRpSelectedRange();
      if (!range) return;

      let normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (normalized.endsWith('\n')) normalized = normalized.slice(0, -1);

      const matrix = normalized.split('\n').map(line => line.split('\t'));
      if (matrix.length === 0) return;

      pushRpUndoSnapshot();
      let changed = false;
      let lockedSkipped = false;
      const isSingleSource = matrix.length === 1 && matrix[0].length === 1;
      const isMultiTarget = range.r2 > range.r1 || range.c2 > range.c1;

      if (isSingleSource && isMultiTarget) {
        const val = matrix[0][0];
        for (let r = range.r1; r <= range.r2; r++) {
          const row = rpGridState.rows[r];
          if (!row) continue;
          if (getReceiverPlanCertStatus(row).isLocked) {
            lockedSkipped = true;
            continue;
          }
          for (let c = range.c1; c <= range.c2; c++) {
            const col = rpGridState.columns[c];
            if (col && col.editable && applyRpCellValue(row, col, val)) {
              changed = true;
            }
          }
        }
      } else {
        for (let dr = 0; dr < matrix.length; dr++) {
          const tr = range.r1 + dr;
          const row = rpGridState.rows[tr];
          if (!row) break;
          if (getReceiverPlanCertStatus(row).isLocked) {
            lockedSkipped = true;
            continue;
          }
          const lineCols = matrix[dr];
          for (let dc = 0; dc < lineCols.length; dc++) {
            const tc = range.c1 + dc;
            const col = rpGridState.columns[tc];
            if (!col) break;
            if (col.editable && applyRpCellValue(row, col, lineCols[dc])) {
              changed = true;
            }
          }
        }
        const endR = Math.min(rpGridState.rows.length - 1, range.r1 + matrix.length - 1);
        const maxCols = Math.max(...matrix.map(m => m.length));
        const endC = Math.min(rpGridState.columns.length - 1, range.c1 + maxCols - 1);
        rpGridState.anchor = { r: range.r1, c: range.c1 };
        rpGridState.focus = { r: endR, c: endC };
      }

      if (changed) {
        saveLocalReceiverPlanData();
        markAsDirty(true);
        renderReceiverPlanModule();
      } else {
        state.rpUndoStack.pop();
        const undoBtn = document.getElementById('btn-rp-undo');
        if (undoBtn) undoBtn.disabled = state.rpUndoStack.length === 0;
        if (lockedSkipped) showToast('검정신청/완료된 건은 수정할 수 없습니다.');
      }
    }

    if (tbody && scrollWrap) {
      tbody.addEventListener('change', (e) => {
        const chk = e.target.closest('.chk-rp-row');
        if (chk) {
          if (!(state.rpSelectedIds instanceof Set)) state.rpSelectedIds = new Set();
          if (chk.checked) state.rpSelectedIds.add(chk.dataset.rpId);
          else state.rpSelectedIds.delete(chk.dataset.rpId);
          renderReceiverPlanModule();
          return;
        }
      });

      tbody.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.chk-rp-row')) return;
        const td = e.target.closest('td[data-r][data-c]');
        if (!td) return;
        if (rpGridState.editing) {
          if (rpGridState.editing.inputEl === e.target) return;
          commitRpCellEdit(true);
        }

        const r = Number(td.dataset.r);
        const c = Number(td.dataset.c);
        const colDef = rpGridState.columns[c];
        if (!colDef || colDef.key === '_chk' || colDef.key === '_no') return;

        if (e.shiftKey && rpGridState.anchor) {
          rpGridState.focus = { r, c };
        } else {
          rpGridState.anchor = { r, c };
          rpGridState.focus = { r, c };
          rpGridState.isDragging = true;
        }

        e.preventDefault();
        applyRpSelectionClasses();
        focusRpGrid();
      });

      tbody.addEventListener('mouseover', (e) => {
        if (!rpGridState.isDragging) return;
        const td = e.target.closest('td[data-r][data-c]');
        if (!td) return;
        const r = Number(td.dataset.r);
        const c = Math.max(2, Number(td.dataset.c));
        const colDef = rpGridState.columns[c];
        if (!colDef || colDef.key === '_chk' || colDef.key === '_no') return;
        if (!rpGridState.focus || rpGridState.focus.r !== r || rpGridState.focus.c !== c) {
          rpGridState.focus = { r, c };
          applyRpSelectionClasses();
        }
      });

      document.addEventListener('mouseup', () => {
        rpGridState.isDragging = false;
      });

      tbody.addEventListener('dblclick', (e) => {
        if (e.target.closest('.chk-rp-row')) return;
        const td = e.target.closest('td[data-r][data-c]');
        if (!td) return;
        const r = Number(td.dataset.r);
        const c = Number(td.dataset.c);
        const colDef = rpGridState.columns[c];
        if (!colDef || colDef.key === '_chk' || colDef.key === '_no') return;
        startRpCellEdit(r, c, undefined, false);
      });

      scrollWrap.addEventListener('keydown', (e) => {
        if (rpGridState.editing) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undoReceiverPlan();
          return;
        }

        if (!rpGridState.anchor) {
          if (rpGridState.rows.length > 0 && rpGridState.columns.length > 2) {
            rpGridState.anchor = { r: 0, c: 2 };
            rpGridState.focus = { r: 0, c: 2 };
            applyRpSelectionClasses();
          } else {
            return;
          }
        }

        const maxR = rpGridState.rows.length - 1;
        const maxC = rpGridState.columns.length - 1;
        const cur = rpGridState.focus || rpGridState.anchor;

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          let nr = cur.r;
          let nc = cur.c;
          if (e.key === 'ArrowUp') nr = Math.max(0, nr - 1);
          if (e.key === 'ArrowDown') nr = Math.min(maxR, nr + 1);
          if (e.key === 'ArrowLeft') nc = Math.max(2, nc - 1);
          if (e.key === 'ArrowRight') nc = Math.min(maxC, nc + 1);

          if (e.shiftKey) {
            rpGridState.focus = { r: nr, c: nc };
          } else {
            rpGridState.anchor = { r: nr, c: nc };
            rpGridState.focus = { r: nr, c: nc };
          }
          applyRpSelectionClasses();
          scrollRpCellIntoView(nr, nc);
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          const next = findNextRpEditableCell(rpGridState.anchor.r, rpGridState.anchor.c, e.shiftKey);
          if (next) {
            rpGridState.anchor = next;
            rpGridState.focus = next;
            applyRpSelectionClasses();
            scrollRpCellIntoView(next.r, next.c);
          }
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          const nr = Math.max(0, Math.min(maxR, rpGridState.anchor.r + (e.shiftKey ? -1 : 1)));
          const nc = rpGridState.anchor.c;
          rpGridState.anchor = { r: nr, c: nc };
          rpGridState.focus = { r: nr, c: nc };
          applyRpSelectionClasses();
          scrollRpCellIntoView(nr, nc);
          return;
        }

        if (e.key === 'F2') {
          e.preventDefault();
          startRpCellEdit(rpGridState.anchor.r, rpGridState.anchor.c, undefined, false);
          return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          clearRpSelectedCells();
          return;
        }

        if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Process' || e.isComposing || e.keyCode === 229)) {
          if (e.target === rpImeProxy) return;
          const col = rpGridState.columns[rpGridState.anchor.c];
          if (col && col.editable) {
            const isIme = e.key === 'Process' || e.isComposing || e.keyCode === 229 || /^[ㄱ-ㅎㅏ-ㅣ가-힣]$/.test(e.key);
            if (!isIme) {
              e.preventDefault();
              startRpCellEdit(rpGridState.anchor.r, rpGridState.anchor.c, e.key, true);
            } else {
              startRpCellEdit(rpGridState.anchor.r, rpGridState.anchor.c, '', true);
            }
          }
        }
      });

      scrollWrap.addEventListener('copy', (e) => {
        if (rpGridState.editing) return;
        e.preventDefault();
        copyRpSelectionToClipboard(e.clipboardData);
      });

      scrollWrap.addEventListener('paste', (e) => {
        if (rpGridState.editing) return;
        e.preventDefault();
        const text = e.clipboardData ? e.clipboardData.getData('text/plain') : rpGridState.lastCopiedTSV;
        pasteTSVToRpGrid(text);
      });
    }

    // + 행 추가 (기존 등록 건 아래쪽에 추가 + 스크롤 하단 이동)
    const handleRpAddRow = () => {
      pushRpUndoSnapshot();
      const activeYear = (state.rpFilterYear && state.rpFilterYear !== 'ALL')
        ? state.rpFilterYear
        : String(new Date().getFullYear());
      const newRow = createEmptyReceiverPlanRow({
        receiptDate: getTodayDateString(),
        planYear: activeYear
      });
      state.receiverPlanRows.push(newRow);
      saveLocalReceiverPlanData();
      markAsDirty(true);
      renderReceiverPlanModule();
      if (scrollWrap) {
        scrollWrap.scrollTop = scrollWrap.scrollHeight;
      }
      const newRowIdx = rpGridState.rows.findIndex(r => r.id === newRow.id);
      if (newRowIdx >= 0) {
        rpGridState.anchor = { r: newRowIdx, c: 2 };
        rpGridState.focus = { r: newRowIdx, c: 2 };
        applyRpSelectionClasses();
        startRpCellEdit(newRowIdx, 2, undefined, false);
      }
    };
    document.getElementById('btn-rp-add-row')?.addEventListener('click', handleRpAddRow);

    // + 여러 행 추가 모달
    const addMultiModal = document.getElementById('rp-add-multi-modal');
    const addMultiInput = document.getElementById('rp-add-multi-count');
    const closeAddMultiModal = () => { if (addMultiModal) addMultiModal.style.display = 'none'; };

    const handleRpAddMultiRows = () => {
      if (addMultiInput) addMultiInput.value = '5';
      if (addMultiModal) {
        addMultiModal.style.display = 'flex';
        setTimeout(() => {
          addMultiInput?.focus();
          addMultiInput?.select();
        }, 20);
      }
    };

    const applyRpAddMultiRows = () => {
      const count = parseInt(addMultiInput?.value || '0', 10);
      if (!Number.isFinite(count) || count < 1 || count > 200) {
        showToast('추가할 행의 수를 1~200 사이로 입력하세요.');
        return;
      }
      pushRpUndoSnapshot();
      const activeYear = (state.rpFilterYear && state.rpFilterYear !== 'ALL')
        ? state.rpFilterYear
        : String(new Date().getFullYear());
      const todayStr = getTodayDateString();
      let firstNewId = null;
      for (let i = 0; i < count; i++) {
        const newRow = createEmptyReceiverPlanRow({
          receiptDate: todayStr,
          planYear: activeYear
        });
        if (i === 0) firstNewId = newRow.id;
        state.receiverPlanRows.push(newRow);
      }
      closeAddMultiModal();
      saveLocalReceiverPlanData();
      markAsDirty(true);
      renderReceiverPlanModule();
      if (scrollWrap) {
        scrollWrap.scrollTop = scrollWrap.scrollHeight;
      }
      const firstIdx = firstNewId ? rpGridState.rows.findIndex(r => r.id === firstNewId) : -1;
      if (firstIdx >= 0) {
        rpGridState.anchor = { r: firstIdx, c: 2 };
        rpGridState.focus = { r: firstIdx, c: 2 };
        applyRpSelectionClasses();
      }
      showToast(`${count}개 행이 추가되었습니다.`);
    };

    document.getElementById('btn-close-rp-add-multi-modal')?.addEventListener('click', closeAddMultiModal);
    document.getElementById('btn-cancel-rp-add-multi-modal')?.addEventListener('click', closeAddMultiModal);
    document.getElementById('btn-apply-rp-add-multi-modal')?.addEventListener('click', applyRpAddMultiRows);
    addMultiInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyRpAddMultiRows();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAddMultiModal();
      }
    });

    // 행 복제 (아래쪽에 추가 + 스크롤 하단 이동)
    const handleRpCloneRow = () => {
      const selIds = Array.from(state.rpSelectedIds || []);
      if (selIds.length === 0) {
        showToast('복제할 행을 선택해주세요.');
        return;
      }
      pushRpUndoSnapshot();
      const clones = [];
      (state.receiverPlanRows || []).forEach(r => {
        if (!selIds.includes(r.id)) return;
        const { id: _omitId, ...rest } = r;
        const copy = createEmptyReceiverPlanRow({
          ...rest,
          lotNo: '',
          serialFrom: '',
          serialTo: ''
        });
        clones.push(copy);
      });
      recommendReceiverLotAndSerial(clones, true);
      state.receiverPlanRows = [...(state.receiverPlanRows || []), ...clones];
      saveLocalReceiverPlanData();
      markAsDirty(true);
      renderReceiverPlanModule();
      const sw = document.getElementById('rp-grid-scroll-wrap');
      if (sw) sw.scrollTop = sw.scrollHeight;
      showToast(`${clones.length}개 행을 복제하고 다음 로트·제조번호를 채번했습니다.`);
    };
    document.getElementById('btn-rp-clone-row')?.addEventListener('click', handleRpCloneRow);

    // 선택 삭제
    const handleRpDeleteRows = () => {
      const selIds = Array.from(state.rpSelectedIds || []);
      if (selIds.length === 0) {
        showToast('삭제할 행을 선택해주세요.');
        return;
      }
      if (!confirm(`선택한 ${selIds.length}개 행을 삭제하시겠습니까?`)) return;
      pushRpUndoSnapshot();
      state.receiverPlanRows = (state.receiverPlanRows || []).filter(r => !selIds.includes(r.id));
      state.rpSelectedIds.clear();
      saveLocalReceiverPlanData();
      markAsDirty(true);
      renderReceiverPlanModule();
      showToast(`${selIds.length}개 행이 삭제되었습니다.`);
    };
    document.getElementById('btn-rp-delete-rows')?.addEventListener('click', handleRpDeleteRows);

    // 로트/제조번호 추천
    document.getElementById('btn-rp-recommend-lot')?.addEventListener('click', () => {
      const selIds = Array.from(state.rpSelectedIds || []);
      const targets = selIds.length > 0
        ? (state.receiverPlanRows || []).filter(r => selIds.includes(r.id))
        : getFilteredReceiverPlanRows();
      if (targets.length === 0) {
        showToast('추천을 적용할 행이 없습니다.');
        return;
      }
      pushRpUndoSnapshot();
      const cnt = recommendReceiverLotAndSerial(targets, false);
      saveLocalReceiverPlanData();
      if (cnt > 0) markAsDirty(true);
      renderReceiverPlanModule();
      showToast(cnt > 0 ? `${cnt}건에 로트·제조번호 추천이 적용되었습니다.` : '비어 있는 로트·제조번호가 없습니다.');
    });

    // 일괄 편집 모달
    const bulkModal = document.getElementById('rp-bulk-edit-modal');
    const closeBulkModal = () => { if (bulkModal) bulkModal.style.display = 'none'; };
    const handleRpBulkEdit = () => {
      const selIds = Array.from(state.rpSelectedIds || []);
      if (selIds.length === 0) {
        showToast('일괄 편집할 행을 선택해주세요.');
        return;
      }
      const infoEl = document.getElementById('rp-bulk-target-info');
      if (infoEl) infoEl.textContent = `선택된 ${selIds.length}개 행의 생산주차/수검일자를 일괄 변경합니다.`;
      const wEl = document.getElementById('rp-bulk-week-date');
      const iEl = document.getElementById('rp-bulk-inspect-date');
      if (wEl) wEl.value = '';
      if (iEl) iEl.value = '';
      if (bulkModal) bulkModal.style.display = 'flex';
    };
    document.getElementById('btn-rp-bulk-edit')?.addEventListener('click', handleRpBulkEdit);
    document.getElementById('btn-close-rp-bulk-modal')?.addEventListener('click', closeBulkModal);
    document.getElementById('btn-cancel-rp-bulk-modal')?.addEventListener('click', closeBulkModal);
    document.getElementById('btn-apply-rp-bulk-modal')?.addEventListener('click', () => {
      const selIds = Array.from(state.rpSelectedIds || []);
      const wRaw = document.getElementById('rp-bulk-week-date')?.value || '';
      const iRaw = document.getElementById('rp-bulk-inspect-date')?.value || '';
      const wVal = parseShortDateInput(wRaw);
      const iVal = parseShortDateInput(iRaw);
      if (!wVal && !iVal) {
        showToast('변경할 생산주차 또는 수검일자를 입력하세요.');
        return;
      }
      pushRpUndoSnapshot();
      (state.receiverPlanRows || []).forEach(r => {
        if (!selIds.includes(r.id)) return;
        if (wVal) {
          r.weekDate = wVal;
          const calcYm = calcReceiverMfgYmFromWeekDate(wVal);
          if (calcYm) r.mfgYm = calcYm;
          if (!iVal) {
            const calcInspect = calcReceiverInspectDateFromWeekDate(wVal);
            if (calcInspect) r.inspectDate = calcInspect;
          }
        }
        if (iVal) r.inspectDate = iVal;
      });
      saveLocalReceiverPlanData();
      markAsDirty(true);
      closeBulkModal();
      renderReceiverPlanModule();
      showToast(`${selIds.length}개 행이 일괄 수정되었습니다.`);
    });

    // 표시 옵션 드롭다운 (품목코드 / 형식번호 / 날짜 일괄 숨김)
    const rpOptWrap = document.getElementById('rp-opt-dropdown-wrap');
    const rpFileWrap = document.getElementById('rp-file-dropdown-wrap');
    document.getElementById('btn-rp-options')?.addEventListener('click', (e) => {
      e.stopPropagation();
      rpFileWrap?.classList.remove('is-open');
      rpOptWrap?.classList.toggle('is-open');
    });
    rpOptWrap?.querySelector('.plan-dropdown-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    const onRpDisplayOptChange = () => {
      const opts = {
        hideCode: !!document.getElementById('chk-rp-hide-code')?.checked,
        hideFormat: !!document.getElementById('chk-rp-hide-format')?.checked,
        hideGroup: !!document.getElementById('chk-rp-hide-group')?.checked,
        hideName: !!document.getElementById('chk-rp-hide-name')?.checked,
        hideDates: !!document.getElementById('chk-rp-hide-dates')?.checked
      };
      saveRpDisplayOpts(opts);
      rpGridState.columns = filterVisibleRpColumns(loadRpOrderedColumns(), opts);
      rpGridState.anchor = null;
      rpGridState.focus = null;
      renderReceiverPlanModule();
    };
    document.getElementById('chk-rp-hide-code')?.addEventListener('change', onRpDisplayOptChange);
    document.getElementById('chk-rp-hide-format')?.addEventListener('change', onRpDisplayOptChange);
    document.getElementById('chk-rp-hide-group')?.addEventListener('change', onRpDisplayOptChange);
    document.getElementById('chk-rp-hide-name')?.addEventListener('change', onRpDisplayOptChange);
    document.getElementById('chk-rp-hide-dates')?.addEventListener('change', onRpDisplayOptChange);

    // 엑셀 입출력 드롭다운
    document.getElementById('btn-rp-file-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      rpOptWrap?.classList.remove('is-open');
      rpFileWrap?.classList.toggle('is-open');
    });
    document.getElementById('btn-rp-upload-excel')?.addEventListener('click', () => {
      rpFileWrap?.classList.remove('is-open');
      document.getElementById('input-rp-upload-excel')?.click();
    });

    document.getElementById('input-rp-upload-excel')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file || typeof XLSX === 'undefined') return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (!jsonRows || jsonRows.length === 0) {
            showToast('업로드된 파일에 데이터가 없습니다.');
            return;
          }
          const pick = (obj, keys) => {
            for (const k of keys) {
              if (obj[k] !== undefined && String(obj[k]).trim() !== '') return String(obj[k]).trim();
            }
            // 줄바꿈 포함 헤더 대응 (예: "제조번호\nFROM")
            for (const rawKey of Object.keys(obj)) {
              const normKey = rawKey.replace(/\s+/g, '');
              if (keys.some(k => k.replace(/\s+/g, '') === normKey)) {
                return String(obj[rawKey]).trim();
              }
            }
            return '';
          };

          const imported = jsonRows.map(obj => {
            const code = pick(obj, ['품목코드']);
            const mItem = code ? (state.certMasterItems || []).find(i => String(i.code || '').trim().toLowerCase() === code.toLowerCase()) : null;
            const fmt = pick(obj, ['형식번호']) || (mItem && mItem.formatNo !== '-' ? mItem.formatNo : '');
            const name = pick(obj, ['품명', '모델']) || (mItem ? getDisplayItemName(mItem) : '');
            const sFrom = pick(obj, ['제조번호FROM', '제조번호 FROM', '제조번호\nFROM']);
            const sTo = pick(obj, ['제조번호TO', '제조번호 TO', '제조번호\nTO']) || sFrom;

            const weekDate = parseShortDateInput(pick(obj, ['생산주차']));
            const inspectDate = parseShortDateInput(pick(obj, ['수검일자'])) || (weekDate ? calcReceiverInspectDateFromWeekDate(weekDate) : '');

            return trimRpRow(createEmptyReceiverPlanRow({
              reqNo: pick(obj, ['제작의뢰번호']),
              code,
              formatNo: fmt,
              itemGroup: pick(obj, ['품목그룹', '그룹']) || (mItem && mItem.itemGroup && mItem.itemGroup !== '-' ? mItem.itemGroup : ''),
              name,
              siteName: pick(obj, ['현장명']),
              builder: pick(obj, ['건설사']),
              client: pick(obj, ['거래선']),
              manager: pick(obj, ['담당자']),
              receiptDate: parseShortDateInput(pick(obj, ['접수일'])),
              dueDate: parseShortDateInput(pick(obj, ['납기일자'])),
              issueReqDate: parseShortDateInput(pick(obj, ['불출요청일'])),
              weekDate,
              inspectDate,
              colorInfo: pick(obj, ['외함색상', '색상정보']),
              remark: pick(obj, ['비고']),
              lotNo: pick(obj, ['로트번호', 'Lot no.', 'LOT NO']),
              mfgYm: pick(obj, ['제조년월']) || (weekDate ? calcReceiverMfgYmFromWeekDate(weekDate) : ''),
              serialFrom: sFrom,
              serialTo: sTo
            }));
          }).filter(r => r.reqNo || r.code || r.siteName || r.name);

          pushRpUndoSnapshot();
          state.receiverPlanRows = [...(state.receiverPlanRows || []), ...imported];
          saveLocalReceiverPlanData();
          await saveReceiverPlanToDb(true);
          renderReceiverPlanModule();
          showToast(`수신기계획 ${imported.length}건을 불러와 저장했습니다.`);
        } catch (err) {
          console.error('수신기계획 엑셀 파싱 오류:', err);
          alert('엑셀/CSV 파일을 읽는 중 오류가 발생했습니다.');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    });

    document.getElementById('btn-rp-download-excel')?.addEventListener('click', () => {
      rpFileWrap?.classList.remove('is-open');
      if (typeof XLSX === 'undefined') return;
      const rows = getFilteredReceiverPlanRows();
      const exportData = rows.map((r, idx) => ({
        'NO': idx + 1,
        '제작의뢰번호': r.reqNo || '',
        '품목코드': r.code || '',
        '형식번호': r.formatNo || '',
        '품목그룹': r.itemGroup || '',
        '품명': r.name || '',
        '현장명': r.siteName || '',
        '검정상태': getReceiverPlanCertStatus(r).label,
        '건설사': r.builder || '',
        '거래선': r.client || '',
        '담당자': r.manager || '',
        '접수일': r.receiptDate || '',
        '납기일자': r.dueDate || '',
        '불출요청일': r.issueReqDate || '',
        '생산주차': r.weekDate || '',
        '수검일자': r.inspectDate || '',
        '외함색상': r.colorInfo || '',
        '비고': r.remark || '',
        '로트번호': r.lotNo || '',
        '제조년월': r.mfgYm || '',
        '제조번호 FROM': r.serialFrom || '',
        '제조번호 TO': r.serialTo || ''
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '수신기계획');
      XLSX.writeFile(wb, `수신기계획_${getTodayDateString()}.xlsx`);
    });

    // 명판 인쇄 (26년 명판출력 A1:G14 양식, A4 흑백, 체크박스 순차 출력)
    const handleRpPrintLabel = () => {
      const selSet = state.rpSelectedIds instanceof Set ? state.rpSelectedIds : new Set();
      if (selSet.size === 0) {
        showToast('명판을 인쇄할 행을 선택해주세요.');
        return;
      }

      const filteredSelected = getFilteredReceiverPlanRows().filter(r => selSet.has(r.id));
      const targetRows = filteredSelected.length > 0
        ? filteredSelected
        : (state.receiverPlanRows || []).filter(r => selSet.has(r.id));

      if (targetRows.length === 0) {
        showToast('선택된 행이 없습니다.');
        return;
      }

      const printArea = document.getElementById('rp-label-print-area');
      if (!printArea) return;

      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const pagesHtml = targetRows.map(r => {
        const mItem = (state.certMasterItems || []).find(i =>
          String(i.code || '').trim().toLowerCase() === String(r.code || '').trim().toLowerCase()
        );
        const itemTitle = (mItem && mItem.name ? mItem.name : '') || r.name || '';
        const modelVal = (mItem && mItem.itemGroup && mItem.itemGroup !== '-') ? mItem.itemGroup : (r.formatNo || '');
        const sFrom = String(r.serialFrom || '').trim();
        const sTo = String(r.serialTo || '').trim();
        const serialText = (sFrom && sTo && sFrom !== sTo) ? `${sFrom} - ${sTo}` : sFrom;

        const itemSize = itemTitle.length > 28 ? '13.5pt' : (itemTitle.length > 16 ? '17pt' : '22pt');
        const siteStr = String(r.siteName || '');
        const siteSize = siteStr.length > 65 ? '14pt' : (siteStr.length > 40 ? '17pt' : (siteStr.length > 22 ? '22pt' : '28pt'));
        const fitSm = (txt) => {
          const len = String(txt || '').length;
          return len > 24 ? '8.5pt' : (len > 14 ? '10pt' : '12pt');
        };

        return `
          <div class="rp-label-page">
            <table class="rp-label-table">
              <colgroup>
                <col style="width:14%">
                <col style="width:20%">
                <col style="width:15%">
                <col style="width:22%">
                <col style="width:13%">
                <col style="width:16%">
              </colgroup>
              <tbody>
                <tr>
                  <th colspan="6" class="lbl-banner">취급주의 / 파손주의</th>
                </tr>
                <tr>
                  <td colspan="4" rowspan="3" class="lbl-item-name"><div class="lbl-fit-box" style="font-size:${itemSize};">${esc(itemTitle)}</div></td>
                  <th class="lbl-sticker lbl-sticker-tl">LOT NO.</th>
                  <td class="lbl-sticker lbl-sticker-tr">${esc(r.lotNo || '')}</td>
                </tr>
                <tr>
                  <th class="lbl-sticker lbl-sticker-ml">제조번호</th>
                  <td class="lbl-sticker lbl-sticker-mr">${esc(serialText)}</td>
                </tr>
                <tr>
                  <td colspan="2" class="lbl-sticker lbl-sticker-b">${esc(r.colorInfo || '')}</td>
                </tr>
                <tr class="lbl-row-meta">
                  <td colspan="4" class="lbl-code"><div class="lbl-fit-box">${esc(r.code || '')}</div></td>
                  <td colspan="2" class="lbl-val"><div class="lbl-fit-box" style="font-size:${fitSm(r.remark)};">${esc(r.remark || '')}</div></td>
                </tr>
                <tr class="lbl-row-info">
                  <th class="lbl-th">모델</th>
                  <td class="lbl-val"><div class="lbl-fit-box" style="font-size:${fitSm(modelVal)};">${esc(modelVal)}</div></td>
                  <th class="lbl-th">건설사</th>
                  <td class="lbl-val"><div class="lbl-fit-box" style="font-size:${fitSm(r.builder)};">${esc(r.builder || '')}</div></td>
                  <th class="lbl-th">거래선</th>
                  <td class="lbl-val"><div class="lbl-fit-box" style="font-size:${fitSm(r.client)};">${esc(r.client || '')}</div></td>
                </tr>
                <tr>
                  <td colspan="6" class="lbl-site"><div class="lbl-fit-box" style="font-size:${siteSize};">${esc(siteStr)}</div></td>
                </tr>
                <tr>
                  <th class="lbl-date-th">제작의뢰일</th>
                  <th class="lbl-date-th">납기요청일</th>
                  <th class="lbl-date-th">공정검사 일자</th>
                  <th class="lbl-date-th">최종검사 일자</th>
                  <th colspan="2" class="lbl-date-th">□ 데이터 입력</th>
                </tr>
                <tr>
                  <td class="lbl-date-val">${esc(r.receiptDate || '')}</td>
                  <td class="lbl-date-val">${esc(r.dueDate || '')}</td>
                  <td class="lbl-date-val"></td>
                  <td class="lbl-date-val"></td>
                  <td colspan="2" class="lbl-date-val">/</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('');

      printArea.innerHTML = pagesHtml;
      document.body.classList.add('is-printing-rp-labels');

      const cleanup = () => {
        document.body.classList.remove('is-printing-rp-labels');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => window.print(), 60);
    };
    document.getElementById('btn-rp-print-label')?.addEventListener('click', handleRpPrintLabel);

    // 수신기계획 마우스 우클릭 컨텍스트 메뉴 (행 추가 / 행 복제 / 일괄 편집 / 명판 인쇄 / 선택 삭제)
    const rpCtxMenu = document.getElementById('rp-context-menu');
    let rpCtxRowId = null;

    const closeRpContextMenu = () => {
      if (rpCtxMenu) rpCtxMenu.classList.remove('is-visible');
      rpCtxRowId = null;
    };

    if (scrollWrap && rpCtxMenu) {
      scrollWrap.addEventListener('contextmenu', (e) => {
        if (rpGridState.editing) return;
        e.preventDefault();
        const tr = e.target.closest('tr[data-rp-id]');
        rpCtxRowId = tr ? tr.dataset.rpId : null;

        const menuW = rpCtxMenu.offsetWidth || 160;
        const menuH = rpCtxMenu.offsetHeight || 210;
        const left = Math.min(e.clientX + 6, window.innerWidth - menuW - 8);
        const top = Math.min(e.clientY, window.innerHeight - menuH - 8);
        rpCtxMenu.style.left = `${Math.max(8, left)}px`;
        rpCtxMenu.style.top = `${Math.max(8, top)}px`;
        rpCtxMenu.classList.remove('is-visible');
        requestAnimationFrame(() => rpCtxMenu.classList.add('is-visible'));
      });

      rpCtxMenu.addEventListener('click', (e) => {
        const itemBtn = e.target.closest('[data-rp-action]');
        if (!itemBtn) return;
        const action = itemBtn.dataset.rpAction;
        const targetRowId = rpCtxRowId;
        closeRpContextMenu();

        if (action === 'add') {
          handleRpAddRow();
          return;
        }
        if (action === 'add-multi') {
          handleRpAddMultiRows();
          return;
        }

        // 체크된 행이 없을 때 특정 행 위에서 우클릭했다면 해당 행을 자동 선택 대상으로 지정
        if (!(state.rpSelectedIds instanceof Set)) state.rpSelectedIds = new Set();
        if (state.rpSelectedIds.size === 0 && targetRowId) {
          state.rpSelectedIds.add(targetRowId);
          renderReceiverPlanModule();
        }

        if (action === 'clone') handleRpCloneRow();
        else if (action === 'bulk') handleRpBulkEdit();
        else if (action === 'print') handleRpPrintLabel();
        else if (action === 'delete') handleRpDeleteRows();
      });

      document.addEventListener('click', (e) => {
        if (!rpCtxMenu.classList.contains('is-visible')) return;
        if (!e.target.closest('#rp-context-menu')) closeRpContextMenu();
      });
      scrollWrap.addEventListener('scroll', closeRpContextMenu);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeRpContextMenu();
      });
    }

    // 검정현황 표 2(등록 내역)로 바로 전송 ('등록완료' 상태, 1행 = 1대)
    document.getElementById('btn-rp-send-cert')?.addEventListener('click', async () => {
      const selIds = Array.from(state.rpSelectedIds || []);
      if (selIds.length === 0) {
        showToast('검정현황으로 보낼 행을 체크박스로 선택해주세요.');
        return;
      }

      const selectedRows = (state.receiverPlanRows || []).filter(r => selIds.includes(r.id));
      const alreadySent = selectedRows.filter(r => getReceiverPlanCertStatus(r).isSent);
      const toSend = selectedRows.filter(r => !getReceiverPlanCertStatus(r).isSent);

      if (toSend.length === 0) {
        showToast('선택한 행은 모두 이미 검정현황에 전송되어 있습니다.');
        return;
      }
      if (alreadySent.length > 0) {
        if (!confirm(`선택한 ${selectedRows.length}건 중 이미 전송된 ${alreadySent.length}건을 제외하고 미신청 ${toSend.length}건만 검정현황(등록완료)으로 보내시겠습니까?`)) {
          return;
        }
      }

      // 선택된 미신청 행들을 위→아래 순서대로 최종 로트·제조번호로 확정 후 검정현황으로 전송
      recommendReceiverLotAndSerial(toSend, true);

      const todayStr = getTodayDateString();
      const newSaved = [];
      toSend.forEach(r => {
        const mItem = (state.certMasterItems || []).find(i =>
          String(i.code || '').trim().toLowerCase() === String(r.code || '').trim().toLowerCase()
        );
        const siteNote = r.remark ? `${r.siteName} (${r.remark})` : (r.siteName || '');
        const fromVal = String(r.serialFrom || '').trim();
        const toVal = String(r.serialTo || fromVal || '').trim();

        newSaved.push({
          id: 'csaved_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          status: '등록완료',
          code: r.code || (mItem?.code || ''),
          name: r.name || (mItem ? getDisplayItemName(mItem) : ''),
          spec: mItem?.spec || '',
          formatNo: r.formatNo || (mItem?.formatNo && mItem.formatNo !== '-' ? mItem.formatNo : ''),
          type: mItem?.inspectType || '품질',
          group: mItem?.group || '수신기반',
          writeDate: todayStr,
          inspectDate: r.inspectDate || r.weekDate || todayStr,
          weekDate: r.weekDate || r.inspectDate || todayStr,
          qty: 1,
          lotNo: r.lotNo || '',
          from: fromVal,
          to: toVal,
          kfiNo: '',
          site: siteNote,
          color: r.colorInfo || '',
          dept: r.client || '',
          sensor: mItem?.sensor || '',
          ctrl: mItem?.ctrl || '',
          gas: mItem?.gas || '',
          sourceRpId: r.id,
          sourceReqNo: r.reqNo || ''
        });
      });

      state.certSavedRows = [...newSaved, ...(state.certSavedRows || [])];
      saveLocalCertData();
      await saveCertDataToDb(true);
      recalculatePendingReceiverLotsAndSerials();
      saveLocalReceiverPlanData();
      await saveReceiverPlanToDb(true);
      state.rpSelectedIds.clear();
      renderReceiverPlanModule();
      if (typeof renderCertificationModule === 'function') renderCertificationModule();
      showToast(`${newSaved.length}건이 검정현황 등록 내역(등록완료)으로 검정등록되었습니다.`);
    });

    // 저장 & 되돌리기
    document.getElementById('btn-rp-save')?.addEventListener('click', () => saveReceiverPlanToDb(false));
    document.getElementById('btn-rp-undo')?.addEventListener('click', undoReceiverPlan);

    // Ctrl+Z 단축키
    document.addEventListener('keydown', (e) => {
      if (state.currentTab === 'tab-receiver-plan' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          undoReceiverPlan();
        }
      }
    });
  }

  // =========================================================================
  // 15. 로그인 · 회원가입 승인 · 임시비밀번호 · 권한 관리 모듈
  // =========================================================================
  const AUTH_PERM_KEYS = [
    'plan', 'receiverPlan', 'cert', 'inspection', 'production', 'workhours', 'attendance', 'quality', 'settings'
  ];

  const DEFAULT_AUTH_DEPTS = ['감지기반', '유도등반', '수신기반', '생산관리', '품질', '제조기술', '기타'];

  const AUTH_ROLE_PRESETS = {
    admin: {
      label: '관리자', desc: '전체 메뉴 수정 및 가입·비밀번호 승인', short: 'A', cls: 'role-master', canApprove: true,
      permissions: {
        plan: 'edit', receiverPlan: 'edit', cert: 'edit', inspection: 'edit',
        production: 'edit', workhours: 'edit', attendance: 'edit', quality: 'edit', settings: 'edit'
      }
    },
    manager: {
      label: '생산/팀장', desc: '생산·일정·품질 전체 관리 및 설정 조회', short: 'M', cls: 'role-manager', canApprove: false,
      permissions: {
        plan: 'edit', receiverPlan: 'edit', cert: 'edit', inspection: 'edit',
        production: 'edit', workhours: 'edit', attendance: 'edit', quality: 'edit', settings: 'view'
      }
    },
    leader: {
      label: '현장반장', desc: '생산일보 입력 및 계획·일정·품질 조회', short: 'L', cls: 'role-leader', canApprove: false,
      permissions: {
        plan: 'view', receiverPlan: 'view', cert: 'none', inspection: 'view',
        production: 'edit', workhours: 'none', attendance: 'view', quality: 'view', settings: 'none'
      }
    },
    qa: {
      label: '품질/검정', desc: '검정현황·품질검사 입력 및 계획 조회', short: 'Q', cls: 'role-qa', canApprove: false,
      permissions: {
        plan: 'view', receiverPlan: 'view', cert: 'edit', inspection: 'view',
        production: 'none', workhours: 'none', attendance: 'view', quality: 'edit', settings: 'none'
      }
    },
    viewer: {
      label: '조회전용', desc: '설정 제외 전체 화면 조회만 가능', short: 'V', cls: 'role-viewer', canApprove: false,
      permissions: {
        plan: 'view', receiverPlan: 'view', cert: 'view', inspection: 'view',
        production: 'view', workhours: 'view', attendance: 'view', quality: 'view', settings: 'none'
      }
    }
  };

  function getAuthRolePresetsMap() {
    if (state.authRolePresets && Object.keys(state.authRolePresets).length > 0) {
      return state.authRolePresets;
    }
    const copy = {};
    Object.entries(AUTH_ROLE_PRESETS).forEach(([k, v]) => {
      copy[k] = { ...v, permissions: { ...v.permissions } };
    });
    state.authRolePresets = copy;
    return state.authRolePresets;
  }

  function getAuthDeptsList() {
    if (Array.isArray(state.authDepts) && state.authDepts.length > 0) return state.authDepts;
    state.authDepts = [...DEFAULT_AUTH_DEPTS];
    return state.authDepts;
  }

  function normalizeAuthConfig(depts, rolePresets) {
    const cleanDepts = Array.isArray(depts) && depts.length > 0
      ? depts.map(d => String(d || '').trim()).filter(Boolean)
      : [...DEFAULT_AUTH_DEPTS];
    state.authDepts = cleanDepts.length > 0 ? cleanDepts : [...DEFAULT_AUTH_DEPTS];

    const cleanRoles = {};
    const src = (rolePresets && typeof rolePresets === 'object' && Object.keys(rolePresets).length > 0)
      ? rolePresets
      : AUTH_ROLE_PRESETS;
    Object.entries(src).forEach(([k, v]) => {
      if (!v || typeof v !== 'object') return;
      const fallback = AUTH_ROLE_PRESETS[k] || AUTH_ROLE_PRESETS.viewer;
      const perms = {};
      AUTH_PERM_KEYS.forEach(pk => {
        const pv = v.permissions?.[pk];
        perms[pk] = (pv === 'none' || pv === 'view' || pv === 'edit') ? pv : fallback.permissions[pk];
      });
      cleanRoles[k] = {
        label: String(v.label || fallback.label || k).trim(),
        desc: String(v.desc !== undefined ? v.desc : (fallback.desc || '')).trim(),
        short: String(v.short || String(v.label || k).slice(0, 1).toUpperCase() || 'U'),
        cls: v.cls || fallback.cls || 'role-viewer',
        canApprove: v.canApprove !== undefined ? !!v.canApprove : !!fallback.canApprove,
        permissions: perms
      };
    });
    state.authRolePresets = Object.keys(cleanRoles).length > 0 ? cleanRoles : { ...AUTH_ROLE_PRESETS };
  }

  function syncAuthDeptDropdown() {
    const sel = document.getElementById('auth-reg-dept');
    if (!sel) return;
    const prev = sel.value;
    const depts = getAuthDeptsList();
    sel.innerHTML = depts.map(d => `<option value="${escapeHtmlPlan(d)}">${escapeHtmlPlan(d)}</option>`).join('');
    if (depts.includes(prev)) sel.value = prev;
    if (typeof syncCustomSelect === 'function') syncCustomSelect('auth-reg-dept');
  }

  function hashAuthPassword(pw) {
    const s = 'pms_salt_2026_' + String(pw || '');
    let h1 = 0x811c9dc5;
    let h2 = 0x12345678;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    }
    return ((h1 >>> 0).toString(16).padStart(8, '0')) + ((h2 >>> 0).toString(16).padStart(8, '0'));
  }

  function getDefaultAuthUsers() {
    const adminPreset = AUTH_ROLE_PRESETS.admin;
    return [{
      id: 'usr_admin',
      loginId: 'admin',
      name: '관리자',
      dept: '생산관리',
      passwordHash: hashAuthPassword('1234'),
      status: 'active',
      role: 'admin',
      canApprove: true,
      mustChangePassword: false,
      resetRequested: false,
      resetRequestedAt: null,
      permissions: { ...adminPreset.permissions },
      createdAt: new Date().toISOString()
    }];
  }

  function normalizeAuthUsers(rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) return getDefaultAuthUsers();
    const roleMap = getAuthRolePresetsMap();
    const fallbackRoleKey = roleMap.viewer ? 'viewer' : Object.keys(roleMap)[0];
    const list = rawList.map(u => {
      const role = roleMap[u.role] ? u.role : fallbackRoleKey;
      const basePerms = (roleMap[role] || AUTH_ROLE_PRESETS.viewer).permissions;
      const perms = {};
      const legacyPlan = u.permissions?.plan;
      AUTH_PERM_KEYS.forEach(k => {
        let v = u.permissions?.[k];
        if (v !== 'none' && v !== 'view' && v !== 'edit') {
          if ((k === 'receiverPlan' || k === 'inspection') && (legacyPlan === 'none' || legacyPlan === 'view' || legacyPlan === 'edit')) {
            v = legacyPlan;
          } else {
            v = basePerms[k];
          }
        }
        perms[k] = v;
      });
      return {
        id: u.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        loginId: String(u.loginId || '').trim(),
        name: String(u.name || '').trim(),
        dept: String(u.dept || '기타').trim(),
        passwordHash: String(u.passwordHash || ''),
        status: (u.status === 'pending' || u.status === 'rejected') ? u.status : 'active',
        role,
        canApprove: !!u.canApprove,
        mustChangePassword: !!u.mustChangePassword,
        resetRequested: !!u.resetRequested,
        resetRequestedAt: u.resetRequestedAt || null,
        permissions: perms,
        createdAt: u.createdAt || new Date().toISOString()
      };
    }).filter(u => u.loginId);
    return list.length > 0 ? list : getDefaultAuthUsers();
  }

  function loadLocalAuthUsers() {
    try {
      const cfgRaw = localStorage.getItem(STORAGE_KEYS.AUTH_CONFIG);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw);
        normalizeAuthConfig(cfg.depts, cfg.rolePresets);
      } else {
        normalizeAuthConfig(null, null);
      }
    } catch (e) {
      normalizeAuthConfig(null, null);
    }
    syncAuthDeptDropdown();

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USERS);
      if (raw) {
        const parsed = normalizeAuthUsers(JSON.parse(raw));
        state.authUsers = parsed;
        return parsed;
      }
    } catch (e) { /* ignore */ }
    const def = getDefaultAuthUsers();
    state.authUsers = def;
    localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(def));
    return def;
  }

  async function fetchAuthUsersFromDb() {
    if (!isFirestoreActive || !db) {
      return { ok: false, localOnly: true, error: new Error('DB 미연결 (로컬 모드)') };
    }
    try {
      const authDoc = await db.collection('pms_metadata').doc('auth_users').get();
      if (authDoc.exists && Array.isArray(authDoc.data().users) && authDoc.data().users.length > 0) {
        normalizeAuthConfig(authDoc.data().depts, authDoc.data().rolePresets);
        localStorage.setItem(STORAGE_KEYS.AUTH_CONFIG, JSON.stringify({ depts: state.authDepts, rolePresets: state.authRolePresets }));
        syncAuthDeptDropdown();
        state.authUsers = normalizeAuthUsers(authDoc.data().users);
        localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(state.authUsers));
        return { ok: true, exists: true };
      }
      return { ok: true, exists: false };
    } catch (err) {
      console.warn('auth_users DB 조회 실패:', err);
      return { ok: false, error: err };
    }
  }

  async function saveAuthUsersToDb(silent = true) {
    state.authUsers = normalizeAuthUsers(state.authUsers);
    const depts = getAuthDeptsList();
    const rolePresets = getAuthRolePresetsMap();
    localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(state.authUsers));
    localStorage.setItem(STORAGE_KEYS.AUTH_CONFIG, JSON.stringify({ depts, rolePresets }));
    syncAuthDeptDropdown();
    if (isFirestoreActive && db) {
      try {
        await db.collection('pms_metadata').doc('auth_users').set({
          users: state.authUsers,
          depts,
          rolePresets
        });
        if (!silent) showToast('사용자 및 권한 설정이 DB에 저장되었습니다.');
        return { ok: true };
      } catch (err) {
        console.warn('auth_users DB 저장 실패:', err);
        if (!silent) showToast('로컬에 저장되었습니다 (DB 오류)');
        return { ok: false, error: err };
      }
    } else if (!silent) {
      showToast('사용자 및 권한 설정이 로컬에 저장되었습니다.');
    }
    return { ok: false, localOnly: true };
  }

  const AUTH_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 최초 로그인/재로그인 4시간
  const AUTH_EXTEND_DURATION_MS = 1 * 60 * 60 * 1000;  // 작업 중 만료 시 1시간 연장
  const AUTH_ACTIVE_WINDOW_MS = 30 * 60 * 1000;      // 최근 사용시간 30분 이내
  const GUEST_SESSION_TIMEOUT_MS = 10 * 60 * 1000;   // 게스트 화면전환 미사용 10분 타임아웃
  const GUEST_LOGIN_ID = '__guest__';
  let lastAuthActivityAt = Date.now();
  let authSessionTimerId = null;

  function createGuestUser() {
    return {
      id: GUEST_LOGIN_ID,
      loginId: GUEST_LOGIN_ID,
      name: 'Guest',
      dept: '',
      role: 'guest',
      status: 'active',
      canApprove: false,
      mustChangePassword: false,
      isGuest: true,
      permissions: {
        plan: 'view',
        receiverPlan: 'view',
        cert: 'view',
        inspection: 'view',
        production: 'view',
        workhours: 'view',
        attendance: 'view',
        quality: 'view',
        settings: 'none'
      }
    };
  }

  function isGuestReadOnly(showMsg = false) {
    if (state.currentUser && state.currentUser.isGuest) {
      if (showMsg) showToast('게스트 계정은 조회 전용이므로 등록·수정·저장이 불가합니다.');
      return true;
    }
    return false;
  }

  function parseAuthSessionRaw(raw) {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && obj.loginId) {
        return {
          loginId: String(obj.loginId),
          expiresAt: Number(obj.expiresAt) || (Date.now() + AUTH_SESSION_DURATION_MS)
        };
      }
    } catch (e) {
      // 구버전 plain string 세션 호환
      return {
        loginId: String(raw),
        expiresAt: Date.now() + AUTH_SESSION_DURATION_MS
      };
    }
    return null;
  }

  function getSavedAuthSession() {
    const localRaw = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    if (localRaw) {
      const parsed = parseAuthSessionRaw(localRaw);
      if (parsed) return { ...parsed, storage: 'local' };
    }
    const sessRaw = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    if (sessRaw) {
      const parsed = parseAuthSessionRaw(sessRaw);
      if (parsed) return { ...parsed, storage: 'session' };
    }
    return null;
  }

  function saveAuthSession(loginId, keepLogin, expiresAt = Date.now() + AUTH_SESSION_DURATION_MS) {
    localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    const payload = JSON.stringify({ loginId, expiresAt });
    if (keepLogin) localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, payload);
    else sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, payload);
  }

  function extendAuthSession(extraMs = AUTH_EXTEND_DURATION_MS, accumulate = false) {
    const sess = getSavedAuthSession();
    if (!sess) return null;
    const baseTime = accumulate ? Math.max(sess.expiresAt, Date.now()) : Date.now();
    const nextExpiresAt = baseTime + extraMs;
    saveAuthSession(sess.loginId, sess.storage === 'local', nextExpiresAt);
    return nextExpiresAt;
  }

  function clearAuthSession() {
    localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
  }

  function isUserCurrentlyWorking() {
    if (state.isDirty) return true;
    return (Date.now() - lastAuthActivityAt) <= AUTH_ACTIVE_WINDOW_MS;
  }

  function formatSessionRemainText(remainMs) {
    const totalMins = Math.max(1, Math.ceil(remainMs / 60000));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}시간 ${m}분`;
    if (h > 0) return `${h}시간`;
    return `${m}분`;
  }

  function updateSessionTimerUI() {
    const el = document.getElementById('header-session-timer');
    if (!el) return;
    if (!state.currentUser) {
      el.style.display = 'none';
      return;
    }
    const sess = getSavedAuthSession();
    if (!sess) {
      el.style.display = 'none';
      return;
    }
    const remainMs = Math.max(0, sess.expiresAt - Date.now());
    const remainText = formatSessionRemainText(remainMs);
    el.innerHTML = `<span class="session-dot"></span><span class="session-text">${remainText}</span>`;

    if (state.currentUser.isGuest) {
      const isUrgent = remainMs <= 3 * 60 * 1000;
      const isWarn = !isUrgent && remainMs <= 5 * 60 * 1000;
      el.classList.toggle('is-stage-30m', isUrgent);
      el.classList.toggle('is-stage-1h', isWarn);
      el.classList.remove('is-stage-2h', 'is-extendable');
      el.title = '게스트 남은 시간 (10분간 화면 전환이 없으면 자동 종료됩니다)';
      el.style.display = 'inline-flex';
      return;
    }

    const is30m = remainMs <= 30 * 60 * 1000;
    const is1h = !is30m && remainMs <= 60 * 60 * 1000;
    const is2h = !is30m && !is1h && remainMs <= 2 * 60 * 60 * 1000;
    const canExtend = remainMs <= 60 * 60 * 1000;

    el.classList.toggle('is-stage-30m', is30m);
    el.classList.toggle('is-stage-1h', is1h);
    el.classList.toggle('is-stage-2h', is2h);
    el.classList.toggle('is-extendable', canExtend);
    el.title = canExtend
      ? '남은 로그인 시간 (클릭 시 1시간 연장 · 작업 중 만료 시 자동 1시간 연장)'
      : '남은 로그인 시간 (1시간 이하 남았을 때 클릭하여 연장 가능)';
    el.style.display = 'inline-flex';
  }

  function getSavedSessionLoginId() {
    const sess = getSavedAuthSession();
    if (!sess) return '';
    if (Date.now() >= sess.expiresAt) {
      clearAuthSession();
      return '';
    }
    // 구버전 문자열 세션이었다면 만료시간을 포함해 재저장
    saveAuthSession(sess.loginId, sess.storage === 'local', sess.expiresAt);
    return sess.loginId;
  }

  function setAuthOverlayVisible(show) {
    const ov = document.getElementById('auth-overlay');
    if (ov) ov.style.display = show ? 'flex' : 'none';
  }

  function setAuthMsg(elId, msg, isOk = false) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-ok', !!isOk);
  }

  function switchAuthTab(tabName) {
    document.querySelectorAll('#auth-mode-tabs .auth-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.authTab === tabName);
    });
    const forms = {
      login: document.getElementById('form-auth-login'),
      signup: document.getElementById('form-auth-signup'),
      reset: document.getElementById('form-auth-reset')
    };
    Object.entries(forms).forEach(([k, f]) => {
      if (f) f.style.display = k === tabName ? 'flex' : 'none';
    });
    setAuthMsg('auth-login-msg', '');
    setAuthMsg('auth-signup-msg', '');
    setAuthMsg('auth-reset-msg', '');
  }

  function updateHeaderAuthUI() {
    const u = state.currentUser;
    const roleEl = document.getElementById('header-user-role');
    const nameEl = document.getElementById('header-user-name');
    const alertEl = document.getElementById('header-auth-alert');
    const navBadge = document.getElementById('settings-auth-pending-badge');
    const navUsersBtn = document.getElementById('btn-settings-nav-users');
    const navDataAdminBtn = document.getElementById('btn-settings-nav-data-admin');
    const headerLogoutBtn = document.getElementById('btn-header-logout');

    if (!u) {
      document.documentElement.classList.remove('guest-readonly');
      if (roleEl) roleEl.textContent = '-';
      if (nameEl) nameEl.textContent = '로그인 대기';
      if (alertEl) alertEl.style.display = 'none';
      if (navBadge) navBadge.style.display = 'none';
      if (navUsersBtn) navUsersBtn.style.display = 'none';
      if (navDataAdminBtn) navDataAdminBtn.style.display = 'none';
      if (headerLogoutBtn) headerLogoutBtn.style.display = 'none';
      return;
    }

    if (headerLogoutBtn) headerLogoutBtn.style.display = 'inline-flex';

    if (u.isGuest) {
      if (roleEl) {
        roleEl.textContent = 'G';
        roleEl.title = '게스트 (조회 전용)';
      }
      if (nameEl) nameEl.textContent = 'Guest (조회전용)';
      if (navUsersBtn) navUsersBtn.style.display = 'none';
      if (navDataAdminBtn) navDataAdminBtn.style.display = 'none';
      if (alertEl) alertEl.style.display = 'none';
      if (navBadge) navBadge.style.display = 'none';
      return;
    }

    const roleMap = getAuthRolePresetsMap();
    const preset = roleMap[u.role] || roleMap.viewer || AUTH_ROLE_PRESETS.viewer;
    if (roleEl) {
      roleEl.textContent = preset.short;
      roleEl.title = `역할: ${preset.label}${preset.desc ? ' · ' + preset.desc : ''}`;
    }
    if (nameEl) nameEl.textContent = `${u.name} (${preset.label})`;

    const isAdminUser = u.role === 'admin';
    const pendingCount = (state.authUsers || []).filter(x => x.status === 'pending' || x.resetRequested).length;
    if (isAdminUser) {
      if (navUsersBtn) navUsersBtn.style.display = 'flex';
      if (navDataAdminBtn) navDataAdminBtn.style.display = 'flex';
      if (alertEl) {
        alertEl.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
        alertEl.textContent = String(pendingCount);
      }
      if (navBadge) {
        navBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        navBadge.textContent = String(pendingCount);
      }
    } else {
      if (navUsersBtn) navUsersBtn.style.display = 'none';
      if (navDataAdminBtn) navDataAdminBtn.style.display = 'none';
      if (alertEl) alertEl.style.display = 'none';
      if (navBadge) navBadge.style.display = 'none';

      // 관리자가 아닌 계정이 사용자·권한 관리 / 데이터 관리 패널에 머물러 있으면 품목정보 탭으로 복귀
      const usersPane = document.getElementById('settings-pane-users');
      const dataPane = document.getElementById('settings-pane-data-admin');
      if (usersPane?.classList.contains('active') || dataPane?.classList.contains('active')) {
        document.querySelector('.settings-nav-btn[data-pane="settings-pane-items"]')?.click();
      }
    }
  }

  function applyAuthPermissions() {
    const u = state.currentUser;
    document.documentElement.classList.toggle('guest-readonly', !!(u && u.isGuest));
    updateHeaderAuthUI();
    if (!u) return;

    const isAdminRole = u.role === 'admin';
    const perms = u.permissions || {};
    const planPerm = isAdminRole ? 'edit' : (perms.plan || 'view');
    const recvPerm = isAdminRole ? 'edit' : (perms.receiverPlan || planPerm);
    const prodPerm = isAdminRole ? 'edit' : (perms.production || 'view');
    const whPerm = isAdminRole ? 'edit' : (perms.workhours || 'view');
    const settingsPerm = isAdminRole ? 'edit' : ((perms.settings && perms.settings !== 'none') ? perms.settings : (u.canApprove ? 'edit' : 'none'));

    const tabMap = {
      'tab-plan': (planPerm === 'none' && recvPerm === 'none') ? 'none' : (planPerm === 'edit' || recvPerm === 'edit' ? 'edit' : 'view'),
      'tab-receiver-plan': recvPerm,
      'tab-certification': isAdminRole ? 'edit' : (perms.cert || 'view'),
      'tab-cert-settlement': isAdminRole ? 'edit' : (perms.cert || 'view'),
      'tab-inspection': isAdminRole ? 'edit' : (perms.inspection || 'view'),
      'tab-production': (prodPerm === 'none' && whPerm === 'none') ? 'none' : (prodPerm === 'edit' || whPerm === 'edit' ? 'edit' : 'view'),
      'tab-attendance': isAdminRole ? 'edit' : (perms.attendance || 'view'),
      'tab-quality': isAdminRole ? 'edit' : (perms.quality || 'view'),
      'tab-settings': settingsPerm
    };

    // 상단 내비게이션 버튼 및 드롭다운 항목 숨김 처리
    document.querySelectorAll('.nav-tab[data-tab]').forEach(btn => {
      const tId = btn.dataset.tab;
      const lvl = tabMap[tId] || 'view';
      const wrapper = btn.closest('.nav-dropdown-wrap') || btn;
      wrapper.style.display = lvl === 'none' ? 'none' : '';
    });

    const planSub = document.querySelector('.nav-dropdown-item[data-parent-tab="tab-plan"]');
    const recvSub = document.querySelector('.nav-dropdown-item[data-parent-tab="tab-receiver-plan"]');
    if (planSub) planSub.style.display = planPerm === 'none' ? 'none' : '';
    if (recvSub) recvSub.style.display = recvPerm === 'none' ? 'none' : '';

    const dailySub = document.querySelector('.nav-dropdown-item[data-line="daily"]');
    const whSub = document.querySelector('.nav-dropdown-item[data-line="workhours"]');
    if (dailySub) dailySub.style.display = prodPerm === 'none' ? 'none' : '';
    if (whSub) whSub.style.display = whPerm === 'none' ? 'none' : '';

    // 각 탭 패널 읽기 전용 클래스 적용
    Object.entries(tabMap).forEach(([tId, lvl]) => {
      const pane = document.getElementById(tId);
      if (pane) pane.classList.toggle('auth-readonly-pane', lvl === 'view');
    });
    const planPane = document.getElementById('tab-plan');
    if (planPane) planPane.classList.toggle('auth-readonly-pane', planPerm === 'view');
    const prodDailyPane = document.getElementById('prod-daily-view');
    const prodWhPane = document.getElementById('prod-workhours-view');
    if (prodDailyPane) prodDailyPane.classList.toggle('auth-readonly-pane', prodPerm === 'view');
    if (prodWhPane) prodWhPane.classList.toggle('auth-readonly-pane', whPerm === 'view');

    // 현재 보고 있는 탭이 숨김(none)이면 허용된 첫 탭으로 이동
    const curLvl = tabMap[state.currentTab] || 'view';
    if (curLvl === 'none') {
      const firstAllowed = Object.entries(tabMap).find(([, l]) => l !== 'none')?.[0];
      if (firstAllowed) {
        const targetNav = document.querySelector(`.nav-tab[data-tab="${firstAllowed}"]`);
        if (targetNav) targetNav.click();
      }
    }

    if (isAdminRole) renderAuthManagePane();
  }

  function openUserAccountModal() {
    const u = state.currentUser;
    if (!u) return;
    if (u.isGuest) {
      showToast('게스트 계정은 조회 전용입니다.');
      return;
    }
    const modal = document.getElementById('modal-user-account');
    if (!modal) return;
    const roleMap = getAuthRolePresetsMap();
    const preset = roleMap[u.role] || roleMap.viewer || AUTH_ROLE_PRESETS.viewer;
    const sumEl = document.getElementById('user-account-summary');
    if (sumEl) {
      sumEl.innerHTML = `
        <div><span style="color:var(--text-muted);">이름</span><br><b>${escapeHtmlPlan(u.name)}</b></div>
        <div><span style="color:var(--text-muted);">아이디</span><br><code>${escapeHtmlPlan(u.loginId)}</code></div>
        <div><span style="color:var(--text-muted);">소속</span><br><b>${escapeHtmlPlan(u.dept)}</b></div>
        <div><span style="color:var(--text-muted);">역할</span><br><b>${escapeHtmlPlan(preset.label)}</b></div>
      `;
    }
    const tempAlert = document.getElementById('user-account-temp-pw-alert');
    if (tempAlert) tempAlert.style.display = u.mustChangePassword ? 'block' : 'none';
    const goManage = document.getElementById('btn-auth-go-manage');
    if (goManage) goManage.style.display = u.role === 'admin' ? 'inline-flex' : 'none';
    document.getElementById('form-change-my-pw')?.reset();
    setAuthMsg('my-pw-msg', '');
    modal.style.display = 'flex';
  }

  function renderAuthManagePane() {
    const pendingEl = document.getElementById('auth-pending-list');
    const tbody = document.getElementById('auth-users-tbody');
    if (!pendingEl || !tbody) return;
    const esc = escapeHtmlPlan;
    const users = state.authUsers || [];
    const depts = getAuthDeptsList();
    const roleMap = getAuthRolePresetsMap();
    const roleEntries = Object.entries(roleMap);

    // 2번 칸: 소속 목록 렌더링
    const deptsListEl = document.getElementById('auth-depts-list');
    if (deptsListEl) {
      deptsListEl.innerHTML = depts.map((d, dIdx) => `
        <div class="auth-meta-row" data-dept-idx="${dIdx}">
          <input type="text" class="form-input form-input-sm auth-dept-edit-input" data-dept-idx="${dIdx}" value="${esc(d)}" style="flex:1;">
          ${depts.length > 1 ? `<button type="button" class="btn btn-xs btn-outline auth-dept-del-btn" data-dept-idx="${dIdx}" style="color:#dc2626;">삭제</button>` : ''}
        </div>
      `).join('');
    }

    // 3번 칸: 역할 프리셋 목록 렌더링
    const rolesListEl = document.getElementById('auth-roles-list');
    if (rolesListEl) {
      rolesListEl.innerHTML = roleEntries.map(([rk, rv]) => `
        <div class="auth-meta-row" data-role-key="${esc(rk)}">
          <input type="text" class="form-input form-input-sm auth-role-label-input" data-role-key="${esc(rk)}" value="${esc(rv.label || '')}" placeholder="역할 이름" style="width:92px; flex:0 0 92px; font-weight:700;">
          <input type="text" class="form-input form-input-sm auth-role-desc-input" data-role-key="${esc(rk)}" value="${esc(rv.desc || '')}" placeholder="역할 설명" style="flex:1;">
          ${rk !== 'admin' && roleEntries.length > 1 ? `<button type="button" class="btn btn-xs btn-outline auth-role-del-btn" data-role-key="${esc(rk)}" style="color:#dc2626;">삭제</button>` : ''}
        </div>
      `).join('');
    }

    const pendingUsers = users.filter(u => u.status === 'pending');
    const resetUsers = users.filter(u => u.status === 'active' && u.resetRequested);

    if (pendingUsers.length === 0 && resetUsers.length === 0) {
      pendingEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:6px 0;">대기 중인 가입 신청이나 비밀번호 초기화 요청이 없습니다.</div>';
    } else {
      const pHtml = pendingUsers.map(u => `
        <div class="auth-pending-item">
          <div>
            <span class="wh-badge wh-badge-unmapped">가입대기</span>
            <b style="margin-left:6px;">${esc(u.name)}</b> (<code>${esc(u.loginId)}</code>) · ${esc(u.dept)}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <select class="form-select form-select-sm auth-approve-role" data-uid="${esc(u.id)}" style="width:110px;">
              ${roleEntries.map(([rk, rv]) => `<option value="${esc(rk)}" ${rk === 'viewer' ? 'selected' : ''}>${esc(rv.label)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-xs btn-primary btn-auth-approve" data-uid="${esc(u.id)}">승인</button>
            <button type="button" class="btn btn-xs btn-outline btn-auth-reject" data-uid="${esc(u.id)}" style="color:#dc2626;">반려</button>
          </div>
        </div>
      `).join('');

      const rHtml = resetUsers.map(u => `
        <div class="auth-pending-item">
          <div>
            <span class="wh-badge wh-badge-warn-low">비번초기화</span>
            <b style="margin-left:6px;">${esc(u.name)}</b> (<code>${esc(u.loginId)}</code>) · ${esc(u.dept)}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" class="btn btn-xs btn-primary btn-auth-issue-temp" data-uid="${esc(u.id)}">임시 비밀번호 발급</button>
            <button type="button" class="btn btn-xs btn-outline btn-auth-dismiss-reset" data-uid="${esc(u.id)}">무시</button>
          </div>
        </div>
      `).join('');
      pendingEl.innerHTML = pHtml + rHtml;
    }

    const activeUsers = users.filter(u => u.status === 'active');
    const permSelectHtml = (uid, key, val) => `
      <select class="form-select form-select-sm auth-perm-sel" data-uid="${esc(uid)}" data-key="${key}">
        <option value="none" ${val === 'none' ? 'selected' : ''}>숨김</option>
        <option value="view" ${val === 'view' ? 'selected' : ''}>조회</option>
        <option value="edit" ${val === 'edit' ? 'selected' : ''}>수정</option>
      </select>
    `;

    tbody.innerHTML = activeUsers.map(u => {
      const p = u.permissions || {};
      const isSelf = state.currentUser && state.currentUser.id === u.id;
      const deptOpts = depts.includes(u.dept) ? depts : [u.dept, ...depts].filter(Boolean);
      return `
        <tr data-uid="${esc(u.id)}">
          <td><code>${esc(u.loginId)}</code>${u.mustChangePassword ? ' <span title="임시비번 변경대기" style="color:#64748b;display:inline-flex;vertical-align:middle;"><svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></span>' : ''}</td>
          <td class="font-bold">${esc(u.name)}</td>
          <td>
            <select class="form-select form-select-sm auth-dept-sel" data-uid="${esc(u.id)}">
              ${deptOpts.map(d => `<option value="${esc(d)}" ${u.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
            </select>
          </td>
          <td>
            <select class="form-select form-select-sm auth-role-sel" data-uid="${esc(u.id)}" title="${esc(roleMap[u.role]?.desc || '')}">
              ${roleEntries.map(([rk, rv]) => `<option value="${esc(rk)}" ${u.role === rk ? 'selected' : ''} title="${esc(rv.desc || '')}">${esc(rv.label)}</option>`).join('')}
            </select>
          </td>
          <td style="text-align:center;"><input type="checkbox" class="auth-approve-chk" data-uid="${esc(u.id)}" ${u.canApprove ? 'checked' : ''}></td>
          <td>${permSelectHtml(u.id, 'plan', p.plan)}</td>
          <td>${permSelectHtml(u.id, 'receiverPlan', p.receiverPlan)}</td>
          <td>${permSelectHtml(u.id, 'cert', p.cert)}</td>
          <td>${permSelectHtml(u.id, 'inspection', p.inspection)}</td>
          <td>${permSelectHtml(u.id, 'production', p.production)}</td>
          <td>${permSelectHtml(u.id, 'workhours', p.workhours)}</td>
          <td>${permSelectHtml(u.id, 'attendance', p.attendance)}</td>
          <td>${permSelectHtml(u.id, 'quality', p.quality)}</td>
          <td>${permSelectHtml(u.id, 'settings', p.settings)}</td>
          <td style="text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center;">
              <button type="button" class="btn btn-xs btn-outline btn-auth-issue-temp" data-uid="${esc(u.id)}" title="임시 비밀번호 발급">임시비번</button>
              ${isSelf ? '' : `<button type="button" class="btn btn-xs btn-outline btn-auth-delete-user" data-uid="${esc(u.id)}" style="color:#dc2626;">삭제</button>`}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function syncAuthAfterDbLoad() {
    const sid = getSavedSessionLoginId();
    if (sid) {
      if (sid === GUEST_LOGIN_ID) {
        state.currentUser = createGuestUser();
        setAuthOverlayVisible(false);
        applyAuthPermissions();
        updateSessionTimerUI();
        return;
      }
      const found = (state.authUsers || []).find(u => u.loginId === sid && u.status === 'active');
      if (found) {
        state.currentUser = found;
        setAuthOverlayVisible(false);
        applyAuthPermissions();
        updateSessionTimerUI();
        return;
      }
      clearAuthSession();
      state.currentUser = null;
    }
    setAuthOverlayVisible(true);
    updateHeaderAuthUI();
    updateSessionTimerUI();
  }

  function initAuthModule() {
    loadLocalAuthUsers();

    // 저장된 아이디 채우기
    const savedId = localStorage.getItem(STORAGE_KEYS.AUTH_SAVED_ID) || '';
    const loginIdInput = document.getElementById('auth-login-id');
    const saveIdChk = document.getElementById('auth-save-id');
    if (loginIdInput && savedId) loginIdInput.value = savedId;
    if (saveIdChk) saveIdChk.checked = !!savedId || true;

    // 기존 세션 복원
    syncAuthAfterDbLoad();

    // 탭 전환
    document.querySelectorAll('#auth-mode-tabs .auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab));
    });
    document.getElementById('btn-go-reset-tab')?.addEventListener('click', () => switchAuthTab('reset'));

    // Guest 접속 (가입 없이 조회 전용 · sessionStorage만 유지 · 화면 전환 10분 타임아웃)
    document.getElementById('btn-auth-guest-login')?.addEventListener('click', () => {
      saveAuthSession(GUEST_LOGIN_ID, false, Date.now() + GUEST_SESSION_TIMEOUT_MS);
      lastAuthActivityAt = Date.now();
      state.currentUser = createGuestUser();
      setAuthMsg('auth-login-msg', '');
      setAuthOverlayVisible(false);
      applyAuthPermissions();
      updateSessionTimerUI();
      showToast('Guest(조회 전용) 모드로 접속했습니다.');
    });

    // 게스트 화면 전환 시 10분 타임아웃 갱신
    const refreshGuestOnScreenSwitch = (e) => {
      if (!state.currentUser || !state.currentUser.isGuest) return;
      if (e && e.target && !e.target.closest('.nav-tab, .nav-dropdown-item, .plan-seg-btn, .auth-tab-btn')) return;
      saveAuthSession(GUEST_LOGIN_ID, false, Date.now() + GUEST_SESSION_TIMEOUT_MS);
      updateSessionTimerUI();
    };
    document.addEventListener('click', refreshGuestOnScreenSwitch);

    // 게스트 모드: 메인 영역 내 모든 체크박스 선택 차단
    document.addEventListener('click', (e) => {
      if (!state.currentUser || !state.currentUser.isGuest) return;
      const chk = e.target && e.target.closest && e.target.closest('.main-content input[type="checkbox"]');
      if (chk) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // 1) 로그인
    document.getElementById('form-auth-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idVal = (document.getElementById('auth-login-id')?.value || '').trim();
      const pwVal = document.getElementById('auth-login-pw')?.value || '';
      const saveId = !!document.getElementById('auth-save-id')?.checked;
      const keepLogin = !!document.getElementById('auth-keep-login')?.checked;

      if (isFirestoreActive && db) {
        await fetchAuthUsersFromDb();
      }

      const user = (state.authUsers || []).find(u => u.loginId === idVal);
      if (!user || user.passwordHash !== hashAuthPassword(pwVal)) {
        setAuthMsg('auth-login-msg', '아이디 또는 비밀번호가 일치하지 않습니다.');
        return;
      }
      if (user.status === 'pending') {
        setAuthMsg('auth-login-msg', '관리자 승인 대기 중입니다. 승인 후 로그인해 주세요.');
        return;
      }
      if (user.status === 'rejected') {
        setAuthMsg('auth-login-msg', '가입 신청이 반려되었습니다. 관리자에게 문의하세요.');
        return;
      }

      if (saveId) localStorage.setItem(STORAGE_KEYS.AUTH_SAVED_ID, idVal);
      else localStorage.removeItem(STORAGE_KEYS.AUTH_SAVED_ID);

      saveAuthSession(idVal, keepLogin, Date.now() + AUTH_SESSION_DURATION_MS);
      lastAuthActivityAt = Date.now();

      state.currentUser = user;
      document.getElementById('auth-login-pw').value = '';
      setAuthOverlayVisible(false);
      applyAuthPermissions();
      updateSessionTimerUI();
      showToast(`${user.name}님 환영합니다.`);

      if (user.mustChangePassword) {
        setTimeout(() => openUserAccountModal(), 250);
      }
    });

    // 2) 회원가입 신청
    document.getElementById('form-auth-signup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('auth-reg-name')?.value || '').trim();
      const dept = document.getElementById('auth-reg-dept')?.value || '기타';
      const loginId = (document.getElementById('auth-reg-id')?.value || '').trim();
      const pw = document.getElementById('auth-reg-pw')?.value || '';
      const pw2 = document.getElementById('auth-reg-pw2')?.value || '';

      if (!name || !loginId || pw.length < 4) {
        setAuthMsg('auth-signup-msg', '이름, 아이디, 비밀번호(4자 이상)를 정확히 입력해 주세요.');
        return;
      }
      if (pw !== pw2) {
        setAuthMsg('auth-signup-msg', '비밀번호 확인이 일치하지 않습니다.');
        return;
      }
      if (!isFirestoreActive || !db) {
        setAuthMsg('auth-signup-msg', 'DB에 연결되지 않아 가입 신청을 서버에 전송할 수 없습니다. (로컬 모드 / 네트워크·방화벽 확인 필요)');
        return;
      }

      const fetchRes = await fetchAuthUsersFromDb();
      if (!fetchRes.ok) {
        const errDetail = fetchRes.error?.code || fetchRes.error?.message || 'DB 조회 오류';
        setAuthMsg('auth-signup-msg', `서버 사용자 목록 조회에 실패했습니다. (${errDetail})`);
        return;
      }

      if ((state.authUsers || []).some(u => u.loginId.toLowerCase() === loginId.toLowerCase())) {
        setAuthMsg('auth-signup-msg', '이미 사용 중인 아이디입니다.');
        return;
      }

      const viewerPerms = (getAuthRolePresetsMap().viewer || AUTH_ROLE_PRESETS.viewer).permissions;
      const newUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        loginId, name, dept,
        passwordHash: hashAuthPassword(pw),
        status: 'pending',
        role: 'viewer',
        canApprove: false,
        mustChangePassword: false,
        resetRequested: false,
        resetRequestedAt: null,
        permissions: { ...viewerPerms },
        createdAt: new Date().toISOString()
      };
      state.authUsers.push(newUser);
      const saveRes = await saveAuthUsersToDb(true);
      if (!saveRes.ok) {
        state.authUsers = state.authUsers.filter(u => u.id !== newUser.id);
        localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(state.authUsers));
        const errDetail = saveRes.error?.code || saveRes.error?.message || 'DB 권한/네트워크 오류';
        setAuthMsg('auth-signup-msg', `가입 신청 서버 저장에 실패했습니다. (${errDetail})`);
        return;
      }
      document.getElementById('form-auth-signup')?.reset();
      setAuthMsg('auth-signup-msg', '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.', true);
    });

    // 3) 비밀번호 재설정 요청
    document.getElementById('form-auth-reset')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loginId = (document.getElementById('auth-reset-id')?.value || '').trim();
      const name = (document.getElementById('auth-reset-name')?.value || '').trim();
      if (!isFirestoreActive || !db) {
        setAuthMsg('auth-reset-msg', 'DB에 연결되지 않아 초기화 요청을 전송할 수 없습니다.');
        return;
      }
      const fetchRes = await fetchAuthUsersFromDb();
      if (!fetchRes.ok) {
        setAuthMsg('auth-reset-msg', '서버 사용자 목록 조회에 실패했습니다.');
        return;
      }
      const user = (state.authUsers || []).find(u => u.loginId === loginId && u.name === name && u.status === 'active');
      if (!user) {
        setAuthMsg('auth-reset-msg', '일치하는 활성 계정을 찾을 수 없습니다.');
        return;
      }
      user.resetRequested = true;
      user.resetRequestedAt = new Date().toISOString();
      const saveRes = await saveAuthUsersToDb(true);
      if (!saveRes.ok) {
        user.resetRequested = false;
        setAuthMsg('auth-reset-msg', '초기화 요청 저장에 실패했습니다. 관리자에게 문의하세요.');
        return;
      }
      document.getElementById('form-auth-reset')?.reset();
      setAuthMsg('auth-reset-msg', '초기화 요청이 접수되었습니다. 관리자에게 임시 비밀번호를 안내받으세요.', true);
    });

    // 헤더 프로필 클릭 -> 내 계정 모달
    document.getElementById('btn-header-user-profile')?.addEventListener('click', openUserAccountModal);
    document.getElementById('btn-close-user-account')?.addEventListener('click', () => {
      const m = document.getElementById('modal-user-account');
      if (m) m.style.display = 'none';
    });
    document.getElementById('btn-auth-go-manage')?.addEventListener('click', () => {
      const m = document.getElementById('modal-user-account');
      if (m) m.style.display = 'none';
      document.querySelector('.nav-tab[data-tab="tab-settings"]')?.click();
      document.getElementById('btn-settings-nav-users')?.click();
    });
    document.getElementById('btn-settings-nav-users')?.addEventListener('click', async () => {
      if (isFirestoreActive && db) {
        const res = await fetchAuthUsersFromDb();
        if (res.ok) {
          renderAuthManagePane();
          updateHeaderAuthUI();
        }
      }
    });
    const performAuthLogout = (expiredMsg = '') => {
      clearAuthSession();
      state.currentUser = null;
      const m = document.getElementById('modal-user-account');
      if (m) m.style.display = 'none';
      updateHeaderAuthUI();
      updateSessionTimerUI();
      switchAuthTab('login');
      if (expiredMsg) setAuthMsg('auth-login-msg', expiredMsg);
      setAuthOverlayVisible(true);
    };
    document.getElementById('btn-auth-logout')?.addEventListener('click', () => performAuthLogout(''));
    document.getElementById('btn-header-logout')?.addEventListener('click', () => performAuthLogout(''));

    // 사용자 활동 감지 (최근 사용시간 30분 기준)
    const markAuthActivity = () => {
      const now = Date.now();
      if (now - lastAuthActivityAt >= 5000) {
        lastAuthActivityAt = now;
      }
    };
    ['mousedown', 'keydown', 'input', 'touchstart', 'scroll', 'wheel'].forEach(evt => {
      window.addEventListener(evt, markAuthActivity, { passive: true });
    });

    // 남은 시간 주기적 체크 (작업 중이면 1시간 연장, 비작업 시 자동 로그아웃)
    const checkAuthSessionTick = () => {
      if (!state.currentUser) {
        updateSessionTimerUI();
        return;
      }
      const sess = getSavedAuthSession();
      if (!sess) {
        performAuthLogout('로그인 세션이 만료되어 다시 로그인해 주세요.');
        return;
      }
      if (Date.now() >= sess.expiresAt) {
        if (state.currentUser.isGuest) {
          performAuthLogout('10분간 화면 전환이 없어 게스트 접속이 종료되었습니다.');
        } else if (isUserCurrentlyWorking()) {
          extendAuthSession(AUTH_EXTEND_DURATION_MS);
          updateSessionTimerUI();
          showToast('작업 중이므로 로그인 시간이 1시간 연장되었습니다.');
        } else {
          performAuthLogout('로그인 유효시간이 만료되어 자동 로그아웃되었습니다.');
        }
        return;
      }
      updateSessionTimerUI();
    };

    if (authSessionTimerId) clearInterval(authSessionTimerId);
    authSessionTimerId = setInterval(checkAuthSessionTick, 15000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkAuthSessionTick();
    });
    document.getElementById('header-session-timer')?.addEventListener('click', () => {
      if (!state.currentUser) return;
      if (state.currentUser.isGuest) {
        showToast('게스트는 화면 전환 시 시간이 자동 갱신됩니다.');
        return;
      }
      const sess = getSavedAuthSession();
      if (!sess) return;
      const remainMs = sess.expiresAt - Date.now();
      if (remainMs > AUTH_EXTEND_DURATION_MS) {
        showToast('남은 시간이 1시간 이하일 때만 연장할 수 있습니다.');
        return;
      }
      extendAuthSession(AUTH_EXTEND_DURATION_MS, true);
      lastAuthActivityAt = Date.now();
      updateSessionTimerUI();
      showToast('로그인 시간이 1시간 연장되었습니다.');
    });

    // 내 비밀번호 변경
    document.getElementById('form-change-my-pw')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = state.currentUser;
      if (!u) return;
      const curPw = document.getElementById('my-pw-current')?.value || '';
      const newPw = document.getElementById('my-pw-new')?.value || '';
      const newPw2 = document.getElementById('my-pw-new2')?.value || '';

      if (u.passwordHash !== hashAuthPassword(curPw)) {
        setAuthMsg('my-pw-msg', '현재 비밀번호가 일치하지 않습니다.');
        return;
      }
      if (newPw.length < 4) {
        setAuthMsg('my-pw-msg', '새 비밀번호는 4자 이상이어야 합니다.');
        return;
      }
      if (newPw !== newPw2) {
        setAuthMsg('my-pw-msg', '새 비밀번호 확인이 일치하지 않습니다.');
        return;
      }
      u.passwordHash = hashAuthPassword(newPw);
      u.mustChangePassword = false;
      await saveAuthUsersToDb(true);
      document.getElementById('form-change-my-pw')?.reset();
      const tempAlert = document.getElementById('user-account-temp-pw-alert');
      if (tempAlert) tempAlert.style.display = 'none';
      setAuthMsg('my-pw-msg', '비밀번호가 성공적으로 변경되었습니다.', true);
      renderAuthManagePane();
    });

    // 관리자: 대기/초기화 요청 처리
    document.getElementById('auth-pending-list')?.addEventListener('click', async (e) => {
      const appBtn = e.target.closest('.btn-auth-approve');
      if (appBtn) {
        const uid = appBtn.dataset.uid;
        const user = state.authUsers.find(u => u.id === uid);
        if (!user) return;
        const roleSel = document.querySelector(`.auth-approve-role[data-uid="${uid}"]`);
        const role = roleSel?.value || 'viewer';
        const roleMap = getAuthRolePresetsMap();
        const preset = roleMap[role] || roleMap.viewer || AUTH_ROLE_PRESETS.viewer;
        user.status = 'active';
        user.role = role;
        user.canApprove = preset.canApprove;
        user.permissions = { ...preset.permissions };
        await saveAuthUsersToDb(true);
        applyAuthPermissions();
        showToast(`${user.name}(${user.loginId}) 가입을 승인했습니다.`);
        return;
      }
      const rejBtn = e.target.closest('.btn-auth-reject');
      if (rejBtn) {
        const uid = rejBtn.dataset.uid;
        const user = state.authUsers.find(u => u.id === uid);
        if (!user || !confirm(`${user.name}(${user.loginId}) 가입 신청을 반려하시겠습니까?`)) return;
        user.status = 'rejected';
        await saveAuthUsersToDb(true);
        applyAuthPermissions();
        return;
      }
      const tempBtn = e.target.closest('.btn-auth-issue-temp');
      if (tempBtn) {
        const uid = tempBtn.dataset.uid;
        const user = state.authUsers.find(u => u.id === uid);
        if (!user) return;
        const tempPw = generateTempPassword();
        user.passwordHash = hashAuthPassword(tempPw);
        user.mustChangePassword = true;
        user.resetRequested = false;
        await saveAuthUsersToDb(true);
        applyAuthPermissions();
        alert(`[${user.name} (${user.loginId})] 임시 비밀번호가 발급되었습니다.\n\n임시 비밀번호: ${tempPw}\n\n로그인 후 [내 계정]에서 비밀번호를 변경하도록 안내해 주세요.`);
        return;
      }
      const disBtn = e.target.closest('.btn-auth-dismiss-reset');
      if (disBtn) {
        const uid = disBtn.dataset.uid;
        const user = state.authUsers.find(u => u.id === uid);
        if (!user) return;
        user.resetRequested = false;
        await saveAuthUsersToDb(true);
        applyAuthPermissions();
      }
    });

    // 관리자: 권한 매트릭스 편집 & 저장
    const usersTbody = document.getElementById('auth-users-tbody');
    usersTbody?.addEventListener('change', (e) => {
      const uid = e.target.dataset.uid;
      const user = state.authUsers.find(u => u.id === uid);
      if (!user) return;
      if (e.target.classList.contains('auth-dept-sel')) {
        user.dept = e.target.value;
      } else if (e.target.classList.contains('auth-role-sel')) {
        const role = e.target.value;
        const roleMap = getAuthRolePresetsMap();
        const preset = roleMap[role] || roleMap.viewer || AUTH_ROLE_PRESETS.viewer;
        user.role = role;
        user.canApprove = preset.canApprove;
        user.permissions = { ...preset.permissions };
        renderAuthManagePane();
      } else if (e.target.classList.contains('auth-approve-chk')) {
        const approvers = state.authUsers.filter(u => u.status === 'active' && u.canApprove);
        if (!e.target.checked && approvers.length <= 1 && user.canApprove) {
          alert('최소 1명 이상의 승인 권한자가 필요합니다.');
          e.target.checked = true;
          return;
        }
        user.canApprove = !!e.target.checked;
      } else if (e.target.classList.contains('auth-perm-sel')) {
        const key = e.target.dataset.key;
        if (key) user.permissions[key] = e.target.value;
      }
    });

    usersTbody?.addEventListener('click', async (e) => {
      const tempBtn = e.target.closest('.btn-auth-issue-temp');
      if (tempBtn) {
        const uid = tempBtn.dataset.uid;
        const user = state.authUsers.find(u => u.id === uid);
        if (!user) return;
        const tempPw = generateTempPassword();
        user.passwordHash = hashAuthPassword(tempPw);
        user.mustChangePassword = true;
        user.resetRequested = false;
        await saveAuthUsersToDb(true);
        renderAuthManagePane();
        alert(`[${user.name} (${user.loginId})] 임시 비밀번호가 발급되었습니다.\n\n임시 비밀번호: ${tempPw}\n\n로그인 후 [내 계정]에서 비밀번호를 변경하도록 안내해 주세요.`);
        return;
      }
      const delBtn = e.target.closest('.btn-auth-delete-user');
      if (delBtn) {
        const uid = delBtn.dataset.uid;
        const user = state.authUsers.find(u => u.id === uid);
        if (!user || !confirm(`${user.name}(${user.loginId}) 계정을 삭제하시겠습니까?`)) return;
        state.authUsers = state.authUsers.filter(u => u.id !== uid);
        await saveAuthUsersToDb(true);
        applyAuthPermissions();
        showToast('계정이 삭제되었습니다.');
      }
    });

    document.getElementById('btn-auth-save-users')?.addEventListener('click', async () => {
      await saveAuthUsersToDb(false);
      applyAuthPermissions();
    });

    // 2번 칸: 소속 목록 추가 · 수정 · 삭제
    document.getElementById('btn-auth-dept-add')?.addEventListener('click', async () => {
      const inp = document.getElementById('auth-dept-new-name');
      const name = (inp?.value || '').trim();
      if (!name) return;
      const depts = getAuthDeptsList();
      if (depts.includes(name)) {
        showToast('이미 존재하는 소속명입니다.');
        return;
      }
      depts.push(name);
      if (inp) inp.value = '';
      await saveAuthUsersToDb(true);
      renderAuthManagePane();
      showToast(`소속 [${name}]이 추가되었습니다.`);
    });

    const deptsListEl = document.getElementById('auth-depts-list');
    deptsListEl?.addEventListener('change', async (e) => {
      if (!e.target.classList.contains('auth-dept-edit-input')) return;
      const idx = Number(e.target.dataset.deptIdx);
      const depts = getAuthDeptsList();
      const oldName = depts[idx];
      const newName = (e.target.value || '').trim();
      if (!newName || oldName === undefined) {
        renderAuthManagePane();
        return;
      }
      if (newName !== oldName && depts.includes(newName)) {
        showToast('이미 존재하는 소속명입니다.');
        renderAuthManagePane();
        return;
      }
      depts[idx] = newName;
      (state.authUsers || []).forEach(u => {
        if (u.dept === oldName) u.dept = newName;
      });
      await saveAuthUsersToDb(true);
      renderAuthManagePane();
      showToast('소속명이 수정되었습니다.');
    });

    deptsListEl?.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.auth-dept-del-btn');
      if (!delBtn) return;
      const idx = Number(delBtn.dataset.deptIdx);
      const depts = getAuthDeptsList();
      if (depts.length <= 1) {
        alert('최소 1개 이상의 소속이 필요합니다.');
        return;
      }
      const target = depts[idx];
      if (!confirm(`소속 [${target}]을 삭제하시겠습니까?`)) return;
      depts.splice(idx, 1);
      await saveAuthUsersToDb(true);
      renderAuthManagePane();
      showToast(`소속 [${target}]이 삭제되었습니다.`);
    });

    // 3번 칸: 역할 프리셋 추가 · 수정 · 삭제
    document.getElementById('btn-auth-role-add')?.addEventListener('click', async () => {
      const nameInp = document.getElementById('auth-role-new-name');
      const descInp = document.getElementById('auth-role-new-desc');
      const label = (nameInp?.value || '').trim();
      const desc = (descInp?.value || '').trim();
      if (!label) {
        alert('역할 이름을 입력해 주세요.');
        nameInp?.focus();
        return;
      }
      const roleMap = getAuthRolePresetsMap();
      const key = 'role_' + Date.now();
      const baseViewer = roleMap.viewer || AUTH_ROLE_PRESETS.viewer;
      roleMap[key] = {
        label,
        desc,
        short: label.slice(0, 1).toUpperCase(),
        cls: 'role-viewer',
        canApprove: false,
        permissions: { ...baseViewer.permissions }
      };
      if (nameInp) nameInp.value = '';
      if (descInp) descInp.value = '';
      await saveAuthUsersToDb(true);
      renderAuthManagePane();
      showToast(`역할 프리셋 [${label}]이 추가되었습니다.`);
    });

    const rolesListEl = document.getElementById('auth-roles-list');
    rolesListEl?.addEventListener('change', async (e) => {
      const rk = e.target.dataset.roleKey;
      const roleMap = getAuthRolePresetsMap();
      if (!rk || !roleMap[rk]) return;
      if (e.target.classList.contains('auth-role-label-input')) {
        const val = (e.target.value || '').trim();
        if (!val) {
          renderAuthManagePane();
          return;
        }
        roleMap[rk].label = val;
        roleMap[rk].short = val.slice(0, 1).toUpperCase();
      } else if (e.target.classList.contains('auth-role-desc-input')) {
        roleMap[rk].desc = (e.target.value || '').trim();
      }
      await saveAuthUsersToDb(true);
      updateHeaderAuthUI();
      renderAuthManagePane();
      showToast('역할 프리셋이 수정되었습니다.');
    });

    rolesListEl?.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.auth-role-del-btn');
      if (!delBtn) return;
      const rk = delBtn.dataset.roleKey;
      const roleMap = getAuthRolePresetsMap();
      if (!rk || !roleMap[rk] || rk === 'admin') return;
      const label = roleMap[rk].label;
      if (!confirm(`역할 프리셋 [${label}]을 삭제하시겠습니까?`)) return;
      delete roleMap[rk];
      const fallbackKey = roleMap.viewer ? 'viewer' : Object.keys(roleMap)[0];
      (state.authUsers || []).forEach(u => {
        if (u.role === rk) u.role = fallbackKey;
      });
      await saveAuthUsersToDb(true);
      renderAuthManagePane();
      showToast(`역할 프리셋 [${label}]이 삭제되었습니다.`);
    });
  }

  // =========================================================================
  // 15-B. 공정검사 보고서 양식 (.xlsx) 관리 및 자동 치환 출력 모듈
  // =========================================================================
  let activeRptGroup = '분류대기';
  let pendingRptItemCodes = [];

  function loadLocalReportTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORT_TEMPLATES);
      const parsed = raw ? JSON.parse(raw) : [];
      state.reportTemplates = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      state.reportTemplates = [];
    }
    try {
      const rawP = localStorage.getItem(STORAGE_KEYS.REPORT_PRINTED);
      const parsedP = rawP ? JSON.parse(rawP) : {};
      state.reportPrintedMap = (parsedP && typeof parsedP === 'object') ? parsedP : {};
    } catch (e) {
      state.reportPrintedMap = {};
    }
  }

  async function saveReportTemplateToDb(tpl, deletedId = null) {
    localStorage.setItem(STORAGE_KEYS.REPORT_TEMPLATES, JSON.stringify(state.reportTemplates || []));
    if (isFirestoreActive && db) {
      try {
        const colRef = db.collection('pms_report_templates');
        if (deletedId) await colRef.doc(deletedId).delete();
        if (tpl) await colRef.doc(tpl.id).set(tpl);
      } catch (err) {
        try {
          const metaRef = db.collection('pms_metadata');
          if (deletedId) await metaRef.doc(`report_tpl__${deletedId}`).delete();
          if (tpl) await metaRef.doc(`report_tpl__${tpl.id}`).set({ ...tpl, __isReportTemplate: true });
        } catch (fbErr) {
          console.warn('보고서 양식 DB 저장 실패:', fbErr);
        }
      }
    }
  }

  async function saveReportPrintedToDb() {
    localStorage.setItem(STORAGE_KEYS.REPORT_PRINTED, JSON.stringify(state.reportPrintedMap || {}));
    if (isFirestoreActive && db) {
      try {
        await db.collection('pms_metadata').doc('report_printed').set({ printedMap: state.reportPrintedMap || {} });
      } catch (err) {
        console.warn('출력 이력 DB 저장 실패:', err);
      }
    }
  }

  function findReportTemplateForCode(code) {
    const norm = String(code || '').trim().toLowerCase();
    if (!norm) return null;
    return (state.reportTemplates || []).find(t =>
      Array.isArray(t.itemCodes) && t.itemCodes.some(c => String(c || '').trim().toLowerCase() === norm)
    ) || null;
  }

  function base64ToUint8Array(dataUrlOrB64) {
    const b64 = String(dataUrlOrB64 || '').includes(',') ? String(dataUrlOrB64).split(',')[1] : String(dataUrlOrB64 || '');
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function getDefaultReportPositions() {
    const base = {
      lot: { x: 0.34, y: 0.18, w: 0.14, h: 0.04 },
      qty: { x: 0.34, y: 0.23, w: 0.14, h: 0.04 },
      remark: { x: 0.13, y: 0.27, w: 0.80, h: 0.04 },
      defectQty: { x: 0.50, y: 0.23, w: 0.12, h: 0.04 },
      inspectQty: { x: 0.64, y: 0.23, w: 0.12, h: 0.04 }
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORT_DEFAULT_POS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.lot && parsed.qty && parsed.remark) {
          return {
            lot: { ...base.lot, ...parsed.lot },
            qty: { ...base.qty, ...parsed.qty },
            remark: { ...base.remark, ...parsed.remark },
            defectQty: { ...base.defectQty, ...(parsed.defectQty || {}) },
            inspectQty: { ...base.inspectQty, ...(parsed.inspectQty || {}) }
          };
        }
      }
    } catch (e) {}
    return base;
  }

  function normalizeReportPositions(srcPos) {
    const def = getDefaultReportPositions();
    const s = (srcPos && typeof srcPos === 'object') ? srcPos : {};
    return {
      lot: { ...def.lot, ...(s.lot || {}) },
      qty: { ...def.qty, ...(s.qty || {}) },
      remark: { ...def.remark, ...(s.remark || {}) },
      defectQty: { ...def.defectQty, ...(s.defectQty || {}) },
      inspectQty: { ...def.inspectQty, ...(s.inspectQty || {}) }
    };
  }

  function saveDefaultReportPositions(pos) {
    if (pos) localStorage.setItem(STORAGE_KEYS.REPORT_DEFAULT_POS, JSON.stringify(pos));
  }

  function renderTextToPngDataUrl(text, fontSizePt = 10) {
    const str = String(text || '').trim();
    if (!str) return null;
    const scale = 4;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const pxSize = fontSizePt * 1.333 * scale;
    const fontStr = `400 ${pxSize}px "Pretendard", "Malgun Gothic", sans-serif`;
    ctx.font = fontStr;
    const metrics = ctx.measureText(str);
    const padX = 2 * scale;
    const padY = 2 * scale;
    canvas.width = Math.max(20, Math.ceil(metrics.width + padX * 2));
    canvas.height = Math.max(20, Math.ceil(pxSize * 1.3 + padY * 2));
    ctx.font = fontStr;
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, padX, canvas.height / 2);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthPt: canvas.width / (scale * 1.333),
      heightPt: canvas.height / (scale * 1.333)
    };
  }

  let pendingPrintCertRowId = null;

  function openReportDefectModal(certRowId) {
    const cRow = (state.certSavedRows || []).find(r => r.id === certRowId);
    if (!cRow) return;
    const tpl = findReportTemplateForCode(cRow.code);
    if (!tpl || !tpl.fileBase64) {
      alert(`[설정 > 공정검사 보고서 양식]에서 품목(${cRow.code})에 연결된 .pdf 양식을 먼저 등록해 주세요.`);
      return;
    }
    if (typeof PDFLib === 'undefined') {
      alert('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하거나 새로고침해 주세요.');
      return;
    }

    pendingPrintCertRowId = certRowId;
    const lotQty = parseSafeInt(cRow.qty);
    const prevDefect = parseSafeInt(state.reportPrintedMap?.[cRow.id]?.defectQty);
    const infoEl = document.getElementById('rpt-defect-item-info');
    const lotEl = document.getElementById('rpt-defect-lot-qty');
    const defectEl = document.getElementById('rpt-defect-qty-input');
    const inspectEl = document.getElementById('rpt-defect-inspect-qty');
    const modal = document.getElementById('modal-rpt-defect-input');

    if (infoEl) {
      infoEl.innerHTML = `<b>${escapeHtmlPlan(cRow.name || cRow.code || '')}</b> (${escapeHtmlPlan(cRow.code || '')}) · 로트: <code>${escapeHtmlPlan(cRow.lotNo || '-')}</code>`;
    }
    if (lotEl) lotEl.value = lotQty.toLocaleString();
    if (defectEl) defectEl.value = String(Math.max(0, prevDefect));
    if (inspectEl) inspectEl.textContent = (lotQty + Math.max(0, prevDefect)).toLocaleString();
    if (modal) modal.style.display = 'flex';
    setTimeout(() => {
      defectEl?.focus();
      defectEl?.select();
    }, 50);
  }

  async function exportProcessInspectionReport(certRowId) {
    openReportDefectModal(certRowId);
  }

  async function printProcessInspectionReportPdf(certRowId, defectQtyInput = 0) {
    const cRow = (state.certSavedRows || []).find(r => r.id === certRowId);
    if (!cRow) return;
    const tpl = findReportTemplateForCode(cRow.code);
    if (!tpl || !tpl.fileBase64) {
      alert(`[설정 > 공정검사 보고서 양식]에서 품목(${cRow.code})에 연결된 .pdf 양식을 먼저 등록해 주세요.`);
      return;
    }
    if (typeof PDFLib === 'undefined') {
      alert('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하거나 새로고침해 주세요.');
      return;
    }

    const lotQty = parseSafeInt(cRow.qty);
    const defectQty = Math.max(0, parseSafeInt(defectQtyInput));
    const inspectQty = lotQty + defectQty;

    try {
      const bytes = base64ToUint8Array(tpl.fileBase64);
      const pdfDoc = await PDFLib.PDFDocument.load(bytes);
      const pages = pdfDoc.getPages();
      const page = pages[0];
      if (!page) {
        alert('PDF 파일에서 첫 번째 페이지를 찾을 수 없습니다.');
        return;
      }

      const box = page.getCropBox ? page.getCropBox() : page.getMediaBox();
      const rot = ((page.getRotation ? page.getRotation().angle : 0) % 360 + 360) % 360;
      const visW = (rot === 90 || rot === 270) ? box.height : box.width;
      const visH = (rot === 90 || rot === 270) ? box.width : box.height;
      // PDF 내부 MediaBox 배율과 무관하게 실제 A4 용지 기준 pt 크기로 보정
      const a4RefH = visW > visH ? 595.28 : 841.89;
      const ptScale = visH / a4RefH;

      const pos = normalizeReportPositions(tpl.positions);
      const fontSizePt = Number(tpl.fontSize) || 10;

      const fields = [
        { key: 'lot', text: String(cRow.lotNo || '').trim(), align: 'center' },
        { key: 'qty', text: String(lotQty), align: 'center' },
        { key: 'remark', text: String(cRow.site || '').trim(), align: 'left' },
        { key: 'defectQty', text: String(defectQty), align: 'center' },
        { key: 'inspectQty', text: String(inspectQty), align: 'center' }
      ];

      for (const f of fields) {
        if (f.text === '') continue;
        const p = pos[f.key];
        if (!p) continue;
        const pngInfo = renderTextToPngDataUrl(f.text, fontSizePt);
        if (!pngInfo) continue;
        const pngBytes = base64ToUint8Array(pngInfo.dataUrl);
        const embedded = await pdfDoc.embedPng(pngBytes);
        const imgW = pngInfo.widthPt * ptScale;
        const imgH = pngInfo.heightPt * ptScale;
        const hasBox = Number(p.w) > 0 && Number(p.h) > 0;
        const isLeft = f.align === 'left';
        const ux = (hasBox && !isLeft) ? (p.x + p.w / 2) : p.x;
        const uy = hasBox ? (p.y + p.h / 2) : p.y;
        const xShift = (hasBox && !isLeft) ? (-imgW / 2) : (isLeft ? 4 * ptScale : 0);

        let drawX = box.x + ux * box.width + xShift;
        let drawY = box.y + (1 - uy) * box.height - (imgH / 2);
        let deg = 0;

        if (rot === 90) {
          drawX = box.x + uy * box.width + (imgH / 2);
          drawY = box.y + ux * box.height + xShift;
          deg = 90;
        } else if (rot === 180) {
          drawX = box.x + (1 - ux) * box.width - xShift;
          drawY = box.y + uy * box.height + (imgH / 2);
          deg = 180;
        } else if (rot === 270) {
          drawX = box.x + (1 - uy) * box.width - (imgH / 2);
          drawY = box.y + (1 - ux) * box.height - xShift;
          deg = 270;
        }

        page.drawImage(embedded, {
          x: drawX,
          y: drawY,
          width: imgW,
          height: imgH,
          rotate: PDFLib.degrees(deg)
        });
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBlobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));

      let iframe = document.getElementById('rpt-print-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'rpt-print-iframe';
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
        document.body.appendChild(iframe);
      }
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (printErr) {
            window.open(pdfBlobUrl, '_blank');
          }
        }, 180);
      };
      iframe.src = pdfBlobUrl;

      state.reportPrintedMap[cRow.id] = {
        printedAt: new Date().toISOString(),
        code: cRow.code || '',
        lotNo: cRow.lotNo || '',
        defectQty,
        inspectQty
      };
      await saveReportPrintedToDb();
      renderInspectionTable();
      showToast(`공정검사보고서 인쇄 화면을 열었습니다 (${cRow.code})`);
    } catch (err) {
      console.error('PDF 보고서 생성 실패:', err);
      alert('PDF 보고서 생성 중 오류가 발생했습니다: ' + (err?.message || err));
    }
  }

  function renderReportTemplatesPane() {
    const listEl = document.getElementById('rpt-tpl-list');
    const connListEl = document.getElementById('rpt-connected-list');
    const pickerBox = document.getElementById('rpt-picker-box');
    const mapListEl = document.getElementById('rpt-item-map-list');
    if (!listEl || !connListEl || !mapListEl) return;
    const esc = escapeHtmlPlan;
    const allTpls = state.reportTemplates || [];

    // 그룹별 카운트 및 탭 active 동기화
    const groupCounts = { '분류대기': 0, '감지기반': 0, '유도등반': 0, '수신기반': 0 };
    allTpls.forEach(t => {
      const g = groupCounts.hasOwnProperty(t.group) ? t.group : '분류대기';
      groupCounts[g] += 1;
    });
    document.querySelectorAll('#rpt-group-bar .plan-seg-btn').forEach(btn => {
      const g = btn.dataset.group;
      btn.classList.toggle('active', g === activeRptGroup);
      const cntEl = btn.querySelector('.rpt-grp-cnt');
      if (cntEl) cntEl.textContent = String(groupCounts[g] || 0);
    });
    const grpLabelEl = document.getElementById('rpt-list-group-label');
    if (grpLabelEl) grpLabelEl.textContent = activeRptGroup;

    const dzText = document.getElementById('rpt-dropzone-text');
    if (dzText) {
      dzText.textContent = activeRptGroup === '분류대기'
        ? '.pdf 양식 파일을 여기에 드래그&드롭하거나 클릭하세요 → [분류대기]로 즉시 등록됩니다'
        : `.pdf 양식 파일을 여기에 드래그&드롭하거나 클릭하세요 → [${activeRptGroup}]으로 즉시 등록됩니다`;
    }

    const tpls = allTpls.filter(t => (t.group || '분류대기') === activeRptGroup);
    if (!tpls.some(t => t.id === state.activeReportTemplateId)) {
      state.activeReportTemplateId = tpls[0]?.id || null;
    }
    const curTpl = tpls.find(t => t.id === state.activeReportTemplateId) || null;

    if (tpls.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:18px 12px; text-align:center;">[${esc(activeRptGroup)}]에 등록된 양식이 없습니다.<br>왼쪽 영역에 .pdf 파일을 드래그&amp;드롭하세요.</div>`;
    } else {
      listEl.innerHTML = tpls.map(t => `
        <div class="rpt-tpl-item ${curTpl && curTpl.id === t.id ? 'active' : ''}" data-tpl-id="${esc(t.id)}">
          <div style="min-width:0; flex:1;">
            <div class="font-bold" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(t.fileName || t.name || '')}">${esc(t.fileName || t.name || '파일 없음')}</div>
          </div>
          <span class="rpt-conn-badge">${(t.itemCodes || []).length}개 연결</span>
        </div>
      `).join('');
    }

    const fileInfo = document.getElementById('rpt-tpl-file-info');
    const fontSel = document.getElementById('rpt-font-size');
    const posBtn = document.getElementById('btn-rpt-open-pos-modal');
    const posSum = document.getElementById('rpt-pos-summary');
    const delBtn = document.getElementById('btn-rpt-tpl-delete');
    const saveBtn = document.getElementById('btn-rpt-tpl-save');

    if (curTpl) {
      if (fileInfo) fileInfo.textContent = curTpl.fileName || curTpl.name || '선택된 파일 없음';
      if (fontSel) { fontSel.value = String(curTpl.fontSize || 10); fontSel.disabled = false; syncCustomSelect('rpt-font-size'); }
      if (posBtn) posBtn.disabled = false;
      if (posSum) {
        posSum.textContent = curTpl.positions
          ? `출력 위치 지정 완료 (${curTpl.fontSize || 10}pt · Pretendard)`
          : '기본 위치 적용 중 — [클릭으로 위치 지정]으로 맞춰주세요.';
      }
      if (delBtn) delBtn.style.display = 'inline-flex';
      if (saveBtn) saveBtn.disabled = false;
    } else {
      if (fileInfo) fileInfo.textContent = '선택된 양식 없음';
      if (fontSel) { fontSel.value = '10'; fontSel.disabled = true; syncCustomSelect('rpt-font-size'); }
      if (posBtn) posBtn.disabled = true;
      if (posSum) posSum.textContent = '';
      if (delBtn) delBtn.style.display = 'none';
      if (saveBtn) saveBtn.disabled = true;
    }

    const itemByNorm = new Map();
    (state.certMasterItems || []).forEach(it => {
      if (it.code) itemByNorm.set(String(it.code).trim().toLowerCase(), it);
    });

    // 우측 상단: 현재 양식에 연결된 품목만 표시
    const connectedCodes = curTpl ? (curTpl.itemCodes || []) : [];
    const countEl = document.getElementById('rpt-mapped-count');
    if (countEl) countEl.textContent = String(connectedCodes.length);

    if (!curTpl) {
      connListEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:14px; text-align:center;">좌측에서 등록된 양식을 선택하세요.</div>';
      if (pickerBox) pickerBox.style.display = 'none';
    } else if (connectedCodes.length === 0) {
      connListEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:14px; text-align:center;">연결된 품목이 없습니다. 위의 [+ 품목 연결] 버튼을 눌러 품목을 추가하세요.</div>';
    } else {
      connListEl.innerHTML = connectedCodes.map(code => {
        const it = itemByNorm.get(String(code || '').trim().toLowerCase());
        const disp = it ? getDisplayItemName(it) : code;
        const grp = it?.group || '-';
        return `
          <div class="rpt-connected-item">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              <code style="font-size:11.5px;">${esc(code)}</code>
              <span class="font-bold" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(disp)}</span>
              <span style="font-size:11px; color:var(--text-muted);">(${esc(grp)})</span>
            </div>
            <button type="button" class="rpt-unlink-btn" data-code="${esc(code)}" title="연결 해제">×</button>
          </div>
        `;
      }).join('');
    }

    // 우측 하단: + 품목 연결 클릭 시 열리는 반별 품목 선택 리스트
    if (pickerBox && pickerBox.style.display !== 'none' && curTpl) {
      const grpFilter = document.getElementById('rpt-item-group-filter')?.value || 'ALL';
      const q = (document.getElementById('rpt-item-search')?.value || '').trim().toLowerCase();
      const curConnectedSet = new Set(connectedCodes.map(c => String(c || '').trim().toLowerCase()));
      const pendingSet = new Set(pendingRptItemCodes.map(c => String(c || '').trim().toLowerCase()));

      const otherMap = new Map();
      allTpls.forEach(t => {
        if (t.id === curTpl.id) return;
        (t.itemCodes || []).forEach(c => otherMap.set(String(c).trim().toLowerCase(), t.name));
      });

      const items = (state.certMasterItems || []).filter(it => {
        if ((it.useYn || '사용') !== '사용') return false;
        const norm = String(it.code || '').trim().toLowerCase();
        if (curConnectedSet.has(norm) || otherMap.has(norm)) return false;
        if (grpFilter !== 'ALL' && (it.group || '').trim() !== grpFilter) return false;
        if (q) {
          const hay = `${it.code || ''} ${it.name || ''} ${it.itemGroup || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (items.length === 0) {
        mapListEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:16px; text-align:center;">미등록 품목이 없습니다.</div>';
      } else {
        mapListEl.innerHTML = items.map(it => {
          const normCode = String(it.code || '').trim().toLowerCase();
          const checked = pendingSet.has(normCode);
          return `
            <label class="rpt-item-row">
              <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <input type="checkbox" class="rpt-item-chk" data-code="${esc(it.code)}" ${checked ? 'checked' : ''}>
                <code style="font-size:11.5px;">${esc(it.code)}</code>
                <span class="font-bold" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(getDisplayItemName(it))}</span>
                <span style="font-size:11px; color:var(--text-muted);">(${esc(it.group || '-')})</span>
              </div>
            </label>
          `;
        }).join('');
      }
    }
  }

  function initReportTemplateModule() {
    loadLocalReportTemplates();

    const handleDroppedReportFiles = (files) => {
      const pdfFiles = Array.from(files || []).filter(f => f && f.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length === 0) {
        alert('.pdf 형식의 파일만 업로드할 수 있습니다.');
        return;
      }

      const existingNames = new Set((state.reportTemplates || []).map(t => String(t.fileName || t.name || '').trim().toLowerCase()));
      const uniqueFiles = [];
      const dupNames = [];
      pdfFiles.forEach(file => {
        const normName = String(file.name || '').trim().toLowerCase();
        if (existingNames.has(normName)) {
          dupNames.push(file.name);
        } else {
          existingNames.add(normName);
          uniqueFiles.push(file);
        }
      });

      if (uniqueFiles.length === 0) {
        showToast(`중복 파일이라 등록하지 않았습니다: ${dupNames.join(', ')}`);
        return;
      }

      const targetGroup = activeRptGroup || '분류대기';
      let done = 0;
      uniqueFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = async () => {
          const newTpl = {
            id: 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: file.name.replace(/\.pdf$/i, ''),
            group: targetGroup,
            fileName: file.name,
            fileBase64: reader.result,
            fontSize: 10,
            positions: getDefaultReportPositions(),
            itemCodes: [],
            updatedAt: new Date().toISOString()
          };
          state.reportTemplates.push(newTpl);
          state.activeReportTemplateId = newTpl.id;
          await saveReportTemplateToDb(newTpl);
          done += 1;
          if (done === uniqueFiles.length) {
            renderReportTemplatesPane();
            const msg = dupNames.length > 0
              ? `${uniqueFiles.length}개 [${targetGroup}] 등록 (중복 제외: ${dupNames.join(', ')})`
              : `${uniqueFiles.length}개 양식이 [${targetGroup}]에 등록되었습니다.`;
            showToast(msg);
          }
        };
        reader.readAsDataURL(file);
      });
    };

    document.getElementById('rpt-group-bar')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.plan-seg-btn[data-group]');
      if (!btn) return;
      activeRptGroup = btn.dataset.group || '분류대기';
      pendingRptItemCodes = [];
      renderReportTemplatesPane();
    });

    const dropzone = document.getElementById('rpt-dropzone');
    const fileInput = document.getElementById('rpt-tpl-file');
    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      handleDroppedReportFiles(e.dataTransfer?.files);
    });
    fileInput?.addEventListener('change', (e) => {
      handleDroppedReportFiles(e.target.files);
      e.target.value = '';
    });

    document.getElementById('rpt-tpl-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.rpt-tpl-item');
      if (!item) return;
      state.activeReportTemplateId = item.dataset.tplId;
      pendingRptItemCodes = [];
      renderReportTemplatesPane();
    });

    // 등록된 양식 우클릭 -> 작업반 이동 컨텍스트 메뉴
    const rptCtxMenu = document.getElementById('rpt-context-menu');
    let rptCtxTargetId = null;
    const closeRptContextMenu = () => {
      if (rptCtxMenu) {
        rptCtxMenu.classList.remove('is-visible');
        rptCtxMenu.setAttribute('aria-hidden', 'true');
      }
      rptCtxTargetId = null;
    };

    document.getElementById('rpt-tpl-list')?.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('.rpt-tpl-item');
      if (!item || !rptCtxMenu) return;
      e.preventDefault();
      rptCtxTargetId = item.dataset.tplId || null;
      if (!rptCtxTargetId) return;
      state.activeReportTemplateId = rptCtxTargetId;
      pendingRptItemCodes = [];
      renderReportTemplatesPane();

      const targetTpl = (state.reportTemplates || []).find(t => t.id === rptCtxTargetId);
      const curGroup = targetTpl?.group || '분류대기';
      rptCtxMenu.querySelectorAll('.rpt-ctx-move-btn').forEach(b => {
        const isSame = b.dataset.moveGroup === curGroup;
        b.disabled = isSame;
        b.style.opacity = isSame ? '0.45' : '';
      });

      const menuW = 196;
      const menuH = 170;
      const left = Math.min(e.clientX + 8, window.innerWidth - menuW - 12);
      const top = Math.min(e.clientY + 6, window.innerHeight - menuH - 12);
      rptCtxMenu.style.left = `${Math.max(8, left)}px`;
      rptCtxMenu.style.top = `${Math.max(8, top)}px`;
      rptCtxMenu.classList.add('is-visible');
      rptCtxMenu.setAttribute('aria-hidden', 'false');
    });

    rptCtxMenu?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.rpt-ctx-move-btn[data-move-group]');
      if (!btn || btn.disabled) return;
      const targetId = rptCtxTargetId || state.activeReportTemplateId;
      const targetTpl = (state.reportTemplates || []).find(t => t.id === targetId);
      const destGroup = btn.dataset.moveGroup;
      closeRptContextMenu();
      if (!targetTpl || !destGroup) return;
      targetTpl.group = destGroup;
      targetTpl.updatedAt = new Date().toISOString();
      await saveReportTemplateToDb(targetTpl);
      activeRptGroup = destGroup;
      state.activeReportTemplateId = targetTpl.id;
      renderReportTemplatesPane();
      showToast(`[${targetTpl.fileName || targetTpl.name}] 양식을 [${destGroup}]으로 이동했습니다.`);
    });

    document.addEventListener('click', (e) => {
      if (rptCtxMenu && rptCtxMenu.classList.contains('is-visible') && !rptCtxMenu.contains(e.target)) {
        closeRptContextMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeRptContextMenu();
    });

    document.getElementById('btn-rpt-open-picker')?.addEventListener('click', () => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl) {
        alert('먼저 좌측에서 등록된 양식을 선택해 주세요.');
        return;
      }
      pendingRptItemCodes = [];
      const grpSel = document.getElementById('rpt-item-group-filter');
      if (grpSel) {
        const g = curTpl.group || '분류대기';
        grpSel.value = (g === '감지기반' || g === '유도등반' || g === '수신기반') ? g : 'ALL';
      }
      const pickerBox = document.getElementById('rpt-picker-box');
      if (pickerBox) pickerBox.style.display = 'block';
      renderReportTemplatesPane();
    });

    document.getElementById('btn-rpt-close-picker')?.addEventListener('click', () => {
      pendingRptItemCodes = [];
      const pickerBox = document.getElementById('rpt-picker-box');
      if (pickerBox) pickerBox.style.display = 'none';
    });

    document.getElementById('rpt-connected-list')?.addEventListener('click', async (e) => {
      const unlinkBtn = e.target.closest('.rpt-unlink-btn');
      if (!unlinkBtn) return;
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl || !Array.isArray(curTpl.itemCodes)) return;
      const norm = String(unlinkBtn.dataset.code || '').trim().toLowerCase();
      curTpl.itemCodes = curTpl.itemCodes.filter(c => String(c || '').trim().toLowerCase() !== norm);
      await saveReportTemplateToDb(curTpl);
      renderReportTemplatesPane();
    });

    document.getElementById('rpt-item-group-filter')?.addEventListener('change', renderReportTemplatesPane);
    document.getElementById('rpt-item-search')?.addEventListener('input', renderReportTemplatesPane);

    document.getElementById('rpt-item-map-list')?.addEventListener('change', (e) => {
      if (!e.target.classList.contains('rpt-item-chk')) return;
      const code = e.target.dataset.code;
      const norm = String(code || '').trim().toLowerCase();
      if (e.target.checked) {
        if (!pendingRptItemCodes.some(c => String(c).trim().toLowerCase() === norm)) pendingRptItemCodes.push(code);
      } else {
        pendingRptItemCodes = pendingRptItemCodes.filter(c => String(c).trim().toLowerCase() !== norm);
      }
    });

    document.getElementById('btn-rpt-select-visible')?.addEventListener('click', () => {
      document.querySelectorAll('#rpt-item-map-list .rpt-item-chk').forEach(chk => {
        chk.checked = true;
        const code = chk.dataset.code;
        const norm = String(code || '').trim().toLowerCase();
        if (!pendingRptItemCodes.some(c => String(c).trim().toLowerCase() === norm)) pendingRptItemCodes.push(code);
      });
    });

    document.getElementById('btn-rpt-clear-visible')?.addEventListener('click', () => {
      const visibleCodes = new Set(Array.from(document.querySelectorAll('#rpt-item-map-list .rpt-item-chk')).map(c => String(c.dataset.code || '').trim().toLowerCase()));
      pendingRptItemCodes = pendingRptItemCodes.filter(c => !visibleCodes.has(String(c).trim().toLowerCase()));
      document.querySelectorAll('#rpt-item-map-list .rpt-item-chk').forEach(chk => { chk.checked = false; });
    });

    document.getElementById('btn-rpt-apply-items')?.addEventListener('click', async () => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl) return;
      if (pendingRptItemCodes.length === 0) {
        alert('연결할 품목을 먼저 체크해 주세요.');
        return;
      }
      if (!Array.isArray(curTpl.itemCodes)) curTpl.itemCodes = [];
      const addNorms = new Set(pendingRptItemCodes.map(c => String(c || '').trim().toLowerCase()));
      // 다른 양식에 있던 품목은 해제 (1품목 = 1양식)
      state.reportTemplates.forEach(t => {
        if (t.id !== curTpl.id && Array.isArray(t.itemCodes)) {
          t.itemCodes = t.itemCodes.filter(c => !addNorms.has(String(c || '').trim().toLowerCase()));
        }
      });
      pendingRptItemCodes.forEach(code => {
        const norm = String(code || '').trim().toLowerCase();
        if (!curTpl.itemCodes.some(c => String(c || '').trim().toLowerCase() === norm)) {
          curTpl.itemCodes.push(code);
        }
      });
      pendingRptItemCodes = [];
      await saveReportTemplateToDb(curTpl);
      renderReportTemplatesPane();
      showToast('선택한 품목이 연결되었습니다.');
    });

    document.getElementById('rpt-font-size')?.addEventListener('change', async (e) => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl) return;
      curTpl.fontSize = Number(e.target.value || 10);
      curTpl.updatedAt = new Date().toISOString();
      await saveReportTemplateToDb(curTpl);
      renderReportTemplatesPane();
      showToast(`글자 크기가 ${curTpl.fontSize}pt로 저장되었습니다.`);
    });

    document.getElementById('btn-rpt-tpl-save')?.addEventListener('click', async () => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl) return;
      curTpl.fontSize = Number(document.getElementById('rpt-font-size')?.value || 11);
      curTpl.updatedAt = new Date().toISOString();

      await saveReportTemplateToDb(curTpl);
      renderReportTemplatesPane();
      showToast('양식 설정이 저장되었습니다.');
    });

    // PDF 출력 위치 지정 모달 (셀 범위 드래그 → 정가운데 정렬)
    let activePosField = 'lot';
    let draftPositions = getDefaultReportPositions();
    let posDragStart = null;

    const updatePosPinsUI = () => {
      const map = {
        lot: 'rpt-pin-lot',
        qty: 'rpt-pin-qty',
        remark: 'rpt-pin-remark',
        defectQty: 'rpt-pin-defectQty',
        inspectQty: 'rpt-pin-inspectQty'
      };
      Object.entries(map).forEach(([k, id]) => {
        const el = document.getElementById(id);
        const p = draftPositions[k];
        if (el && p) {
          const w = Number(p.w) > 0 ? p.w : 0.14;
          const h = Number(p.h) > 0 ? p.h : 0.035;
          el.style.left = `${(p.x * 100).toFixed(2)}%`;
          el.style.top = `${(p.y * 100).toFixed(2)}%`;
          el.style.width = `${(w * 100).toFixed(2)}%`;
          el.style.height = `${(h * 100).toFixed(2)}%`;
        }
      });
      document.querySelectorAll('#rpt-pos-field-btns [data-pos-field]').forEach(b => {
        b.classList.toggle('active', b.dataset.posField === activePosField);
      });
    };

    document.getElementById('rpt-pos-field-btns')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pos-field]');
      if (!btn) return;
      activePosField = btn.dataset.posField || 'lot';
      updatePosPinsUI();
    });

    const pdfWrapEl = document.getElementById('rpt-pdf-canvas-wrap');
    pdfWrapEl?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = pdfWrapEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const sx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const sy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      posDragStart = { x: sx, y: sy };
      draftPositions[activePosField] = { x: sx, y: sy, w: 0.02, h: 0.02 };
      updatePosPinsUI();
    });

    window.addEventListener('mousemove', (e) => {
      if (!posDragStart || !pdfWrapEl) return;
      const rect = pdfWrapEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const x1 = Math.min(posDragStart.x, cx);
      const y1 = Math.min(posDragStart.y, cy);
      const w = Math.max(0.03, Math.abs(cx - posDragStart.x));
      const h = Math.max(0.02, Math.abs(cy - posDragStart.y));
      draftPositions[activePosField] = {
        x: Number(x1.toFixed(4)),
        y: Number(y1.toFixed(4)),
        w: Number(w.toFixed(4)),
        h: Number(h.toFixed(4))
      };
      updatePosPinsUI();
    });

    window.addEventListener('mouseup', () => {
      if (!posDragStart) return;
      posDragStart = null;
      if (activePosField === 'lot') activePosField = 'qty';
      else if (activePosField === 'qty') activePosField = 'remark';
      else if (activePosField === 'remark') activePosField = 'defectQty';
      else if (activePosField === 'defectQty') activePosField = 'inspectQty';
      updatePosPinsUI();
    });

    document.getElementById('btn-rpt-open-pos-modal')?.addEventListener('click', async () => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl || !curTpl.fileBase64) return;
      if (typeof pdfjsLib === 'undefined') {
        alert('PDF 미리보기 라이브러리를 불러오지 못했습니다.');
        return;
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      draftPositions = normalizeReportPositions(curTpl.positions);
      activePosField = 'lot';

      const modal = document.getElementById('modal-rpt-pdf-pos');
      if (modal) modal.style.display = 'flex';

      try {
        const bytes = base64ToUint8Array(curTpl.fileBase64);
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        const unscaled = page.getViewport({ scale: 1 });
        const targetW = Math.min(740, window.innerWidth - 90);
        const scale = targetW / unscaled.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.getElementById('rpt-pdf-preview-canvas');
        if (canvas) {
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
        updatePosPinsUI();
      } catch (err) {
        console.error('PDF 미리보기 렌더링 실패:', err);
        alert('PDF 미리보기 중 오류가 발생했습니다: ' + (err?.message || err));
      }
    });

    const closePosModal = () => {
      const modal = document.getElementById('modal-rpt-pdf-pos');
      if (modal) modal.style.display = 'none';
    };
    document.getElementById('btn-rpt-close-pos')?.addEventListener('click', closePosModal);
    document.getElementById('btn-rpt-cancel-pos')?.addEventListener('click', closePosModal);

    document.getElementById('btn-rpt-save-pos')?.addEventListener('click', async () => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl) return;
      const savedPos = normalizeReportPositions(draftPositions);
      curTpl.positions = savedPos;
      curTpl.fontSize = Number(document.getElementById('rpt-font-size')?.value || curTpl.fontSize || 10);
      curTpl.updatedAt = new Date().toISOString();
      saveDefaultReportPositions(savedPos);
      await saveReportTemplateToDb(curTpl);
      closePosModal();
      renderReportTemplatesPane();
      showToast('이 양식에 출력 위치가 저장되었습니다. (신규 양식에도 기본 적용)');
    });

    document.getElementById('btn-rpt-apply-pos-all')?.addEventListener('click', async () => {
      const allTpls = state.reportTemplates || [];
      if (allTpls.length === 0) return;
      const savedPos = normalizeReportPositions(draftPositions);
      saveDefaultReportPositions(savedPos);
      const fontSize = Number(document.getElementById('rpt-font-size')?.value || 10);
      for (const t of allTpls) {
        t.positions = normalizeReportPositions(savedPos);
        t.fontSize = fontSize;
        t.updatedAt = new Date().toISOString();
        await saveReportTemplateToDb(t);
      }
      closePosModal();
      renderReportTemplatesPane();
      showToast(`등록된 모든 양식(${allTpls.length}개)에 동일 위치가 적용되었습니다.`);
    });

    document.getElementById('btn-rpt-tpl-delete')?.addEventListener('click', async () => {
      const curTpl = (state.reportTemplates || []).find(t => t.id === state.activeReportTemplateId);
      if (!curTpl || !confirm(`[${curTpl.name}] 양식을 삭제하시겠습니까?`)) return;
      const delId = curTpl.id;
      state.reportTemplates = state.reportTemplates.filter(t => t.id !== delId);
      state.activeReportTemplateId = state.reportTemplates[0]?.id || null;
      await saveReportTemplateToDb(null, delId);
      renderReportTemplatesPane();
      showToast('양식이 삭제되었습니다.');
    });

    // 일정계획 내 품명 옆 보고서 출력 아이콘 클릭
    document.getElementById('insp-line-tables-container')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.insp-report-btn');
      if (!btn || btn.disabled) return;
      const certRowId = btn.dataset.certRowId;
      if (certRowId) exportProcessInspectionReport(certRowId);
    });

    // 공정검사보고서 인쇄 전 불량수량 입력 모달 이벤트
    const closeDefectModal = () => {
      const m = document.getElementById('modal-rpt-defect-input');
      if (m) m.style.display = 'none';
      pendingPrintCertRowId = null;
    };
    document.getElementById('btn-rpt-defect-close')?.addEventListener('click', closeDefectModal);
    document.getElementById('btn-rpt-defect-cancel')?.addEventListener('click', closeDefectModal);
    document.getElementById('rpt-defect-qty-input')?.addEventListener('input', () => {
      const cRow = (state.certSavedRows || []).find(r => r.id === pendingPrintCertRowId);
      const lotQty = cRow ? parseSafeInt(cRow.qty) : 0;
      const defectQty = Math.max(0, parseSafeInt(document.getElementById('rpt-defect-qty-input')?.value));
      const inspectEl = document.getElementById('rpt-defect-inspect-qty');
      if (inspectEl) inspectEl.textContent = (lotQty + defectQty).toLocaleString();
    });
    document.getElementById('form-rpt-defect-input')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetId = pendingPrintCertRowId;
      const defectQty = Math.max(0, parseSafeInt(document.getElementById('rpt-defect-qty-input')?.value));
      closeDefectModal();
      if (targetId) {
        await printProcessInspectionReportPdf(targetId, defectQty);
      }
    });

    document.querySelector('.settings-nav-btn[data-pane="settings-pane-reports"]')?.addEventListener('click', renderReportTemplatesPane);
    renderReportTemplatesPane();
  }

  // =========================================================================
  // 15-B. 관리자 전용 데이터 관리 · 초기화 · 검정현황 잠금 해제 관리
  // =========================================================================
  function initAdminDataManagement() {
    const escHtml = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const getLocalPrefixKeys = (prefix) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      return keys.sort();
    };

    const getAuditLogs = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_AUDIT_LOGS);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    };

    const saveAuditLogs = async (logs) => {
      const trimmed = (Array.isArray(logs) ? logs : []).slice(0, 50);
      try {
        localStorage.setItem(STORAGE_KEYS.ADMIN_AUDIT_LOGS, JSON.stringify(trimmed));
      } catch (e) { /* ignore */ }
      if (isFirestoreActive && db) {
        try {
          await db.collection('pms_metadata').doc('admin_audit_logs').set({ logs: trimmed });
        } catch (e) { /* ignore */ }
      }
      renderAdminAuditTable();
    };

    const appendAdminAuditLog = async (actionType, targetLabel, detail) => {
      const userLabel = state.currentUser ? `${state.currentUser.name}(${state.currentUser.id})` : '관리자';
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const logs = getAuditLogs();
      logs.unshift({ ts, user: userLabel, actionType, targetLabel, detail });
      await saveAuditLogs(logs);
    };

    const syncAuditLogsFromDb = async () => {
      if (!isFirestoreActive || !db) return;
      try {
        const doc = await db.collection('pms_metadata').doc('admin_audit_logs').get();
        if (doc.exists && Array.isArray(doc.data()?.logs)) {
          localStorage.setItem(STORAGE_KEYS.ADMIN_AUDIT_LOGS, JSON.stringify(doc.data().logs.slice(0, 50)));
          renderAdminAuditTable();
        }
      } catch (e) { /* ignore */ }
    };

    const downloadAdminFullBackupJson = () => {
      const inspV2Map = {};
      getLocalPrefixKeys(STORAGE_KEYS.INSP_V2_PREFIX).forEach(k => {
        try { inspV2Map[k.slice(STORAGE_KEYS.INSP_V2_PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* ignore */ }
      });
      const dailyV2Map = {};
      getLocalPrefixKeys(STORAGE_KEYS.DAILY_V2_PREFIX).forEach(k => {
        try { dailyV2Map[k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* ignore */ }
      });
      const backup = {
        version: '4.2-full',
        exportedAt: new Date().toISOString(),
        commonItems: state.commonItems || [],
        etcItems: state.etcItems || [],
        workers: state.workers || [],
        workGroups: state.workGroups || [],
        departments: state.departments || [],
        certMasterItems: state.certMasterItems || [],
        certSavedRows: state.certSavedRows || [],
        certDraftRows: state.certDraftRows || [],
        qualityRows: state.qualityRows || [],
        planData: state.planData || null,
        receiverPlanRows: state.receiverPlanRows || [],
        attendanceTypes: state.attendanceTypes || [],
        attendanceRecords: state.attendanceRecords || [],
        attendanceHolidays: state.attendanceHolidays || {},
        inspV2Map,
        dailyV2Map
      };
      downloadFile(JSON.stringify(backup, null, 2), `PMS_전체백업_${getTodayDateString()}.json`, 'application/json');
    };

    const maybeAutoBackup = () => {
      const chk = document.getElementById('chk-admin-auto-backup');
      if (chk && chk.checked) {
        downloadAdminFullBackupJson();
      }
    };

    const getQualityRowDate = (q) => String(q?.inspectDate || q?.writeDate || q?.date || '').slice(0, 10);
    const isDateInRange = (dStr, start, end) => {
      if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return false;
      if (start && dStr < start) return false;
      if (end && dStr > end) return false;
      return true;
    };

    const deleteFirestoreCollectionDocs = async (colName, docIds) => {
      if (!isFirestoreActive || !db) return;
      const targets = Array.isArray(docIds) ? docIds : null;
      try {
        if (targets) {
          await Promise.all(targets.map(id => db.collection(colName).doc(id).delete().catch(() => {})));
        } else {
          const snap = await db.collection(colName).get();
          await Promise.all(snap.docs.map(d => d.ref.delete().catch(() => {})));
        }
      } catch (e) { /* ignore */ }
    };

    const deleteMetadataPrefixDocs = async (prefix, docIds) => {
      if (!isFirestoreActive || !db) return;
      try {
        if (Array.isArray(docIds)) {
          await Promise.all(docIds.map(id => db.collection('pms_metadata').doc(`${prefix}${id}`).delete().catch(() => {})));
        } else {
          const snap = await db.collection('pms_metadata').get();
          const jobs = [];
          snap.forEach(d => {
            if (d.id.startsWith(prefix)) jobs.push(d.ref.delete().catch(() => {}));
          });
          await Promise.all(jobs);
        }
      } catch (e) { /* ignore */ }
    };

    const getPlanRowCount = (pd) => {
      if (!pd || typeof pd !== 'object') return 0;
      if (pd.rowsByYear && typeof pd.rowsByYear === 'object') {
        const sum = Object.values(pd.rowsByYear).reduce((acc, yrObj) => (
          acc + (yrObj && typeof yrObj === 'object' ? Object.keys(yrObj).length : 0)
        ), 0);
        if (sum > 0) return sum;
      }
      return (pd.rowsByCode && typeof pd.rowsByCode === 'object') ? Object.keys(pd.rowsByCode).length : 0;
    };

    const renderAdminDataStats = () => {
      const tbody = document.getElementById('admin-data-stats-tbody');
      if (!tbody) return;
      const inspCount = getLocalPrefixKeys(STORAGE_KEYS.INSP_V2_PREFIX).length;
      const dailyCount = getLocalPrefixKeys(STORAGE_KEYS.DAILY_V2_PREFIX).length;
      const planCount = getPlanRowCount(state.planData);
      const rpCount = Array.isArray(state.receiverPlanRows) ? state.receiverPlanRows.length : 0;
      const attCount = Array.isArray(state.attendanceRecords) ? state.attendanceRecords.length : 0;
      const certCount = Array.isArray(state.certSavedRows) ? state.certSavedRows.length : 0;
      const qualCount = Array.isArray(state.qualityRows) ? state.qualityRows.length : 0;
      const masterCount = (state.workers?.length || 0) + (state.commonItems?.length || 0) + (state.etcItems?.length || 0);

      const rows = [
        { key: 'cert', name: '검정현황', count: `${certCount}건`, desc: '저장된 검정 내역 (일정완료·품검요청 잠금 포함) 및 작성중 목록' },
        { key: 'quality', name: '품질검사', count: `${qualCount}건`, desc: '품질검사 대기·진행·완료 내역' },
        { key: 'insp_v2', name: '일정계획', count: `${inspCount}주`, desc: '주차별 생산 일정계획 데이터' },
        { key: 'daily_v2', name: '생산일보', count: `${dailyCount}일`, desc: '일자별 생산일보 실적·작업자·유실공수 데이터' },
        { key: 'plan', name: '생산계획', count: `${planCount}행`, desc: '연간/월간/주차별 생산계획 그리드' },
        { key: 'receiver', name: '수주현황 (수신기)', count: `${rpCount}건`, desc: '수신기 수주 및 납품 일정 내역' },
        { key: 'attendance', name: '근태관리', count: `${attCount}건`, desc: '작업자 근태 기록 및 휴일 지정 내역' },
        { key: 'master_samples', name: '기본 마스터 샘플', count: `${masterCount}건`, desc: '작업자·공통품목·기타작업 목록 (비워도 기본 샘플 재삽입 안 됨)' }
      ];

      tbody.innerHTML = rows.map(r => `
        <tr>
          <td><strong>${escHtml(r.name)}</strong></td>
          <td style="text-align:center;"><span class="badge" style="background:#f1f5f9; color:#334155;">${escHtml(r.count)}</span></td>
          <td style="font-size:12px; color:var(--text-secondary);">${escHtml(r.desc)}</td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-xs btn-outline text-danger btn-admin-reset-mod" data-mod="${r.key}" data-name="${escHtml(r.name)}">초기화</button>
          </td>
        </tr>
      `).join('');
    };

    const resetAdminModuleData = async (modKey, modName) => {
      if (!state.currentUser?.canApprove) {
        alert('관리자 권한이 필요합니다.');
        return;
      }
      if (!confirm(`[${modName}] 데이터를 모두 초기화하시겠습니까?\n(로컬 저장소와 Firestore DB에서 모두 삭제됩니다.)`)) return;
      if (!confirm(`정말로 [${modName}] 전체 데이터를 삭제합니다. 계속할까요?`)) return;

      maybeAutoBackup();

      if (modKey === 'cert') {
        const syncQual = document.getElementById('chk-admin-sync-quality')?.checked;
        const prevCount = (state.certSavedRows || []).length;
        state.certSavedRows = [];
        state.certDraftRows = [createNewDraftRow()];
        if (syncQual) {
          state.qualityRows = [];
        }
        saveLocalCertData();
        await saveCertDataToDb(true);
        if (syncQual) await saveQualityRowsToDb();
        renderCertSavedTable();
        renderCertDraftTable();
        renderQualityTable();
        if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
        await appendAdminAuditLog('전체 초기화', '검정현황', `저장내역 ${prevCount}건 초기화${syncQual ? ' (품질검사 연동 포함)' : ''}`);
      } else if (modKey === 'quality') {
        const prevCount = (state.qualityRows || []).length;
        state.qualityRows = [];
        saveLocalCertData();
        await saveQualityRowsToDb();
        renderQualityTable();
        await appendAdminAuditLog('전체 초기화', '품질검사', `${prevCount}건 초기화`);
      } else if (modKey === 'insp_v2') {
        const keys = getLocalPrefixKeys(STORAGE_KEYS.INSP_V2_PREFIX);
        keys.forEach(k => localStorage.removeItem(k));
        state.inspV2Data = { startDate: state.inspectionStartDate || getTodayDateString(), dayCount: 10, items: {} };
        await deleteFirestoreCollectionDocs('pms_insp_v2');
        await deleteMetadataPrefixDocs('insp_v2__');
        if (typeof renderInspectionV2 === 'function') renderInspectionV2();
        await appendAdminAuditLog('전체 초기화', '일정계획', `${keys.length}개 주차 데이터 초기화`);
      } else if (modKey === 'daily_v2') {
        const keys = getLocalPrefixKeys(STORAGE_KEYS.DAILY_V2_PREFIX);
        keys.forEach(k => localStorage.removeItem(k));
        state.dailyV2Data = { lines: {} };
        await deleteFirestoreCollectionDocs('pms_daily_v2');
        await deleteMetadataPrefixDocs('daily_v2__');
        if (typeof renderDailyV2 === 'function') renderDailyV2();
        await appendAdminAuditLog('전체 초기화', '생산일보', `${keys.length}일 데이터 초기화`);
      } else if (modKey === 'plan') {
        const prevCount = getPlanRowCount(state.planData);
        state.planData = getDefaultPlanData();
        await savePlanToDb();
        renderPlanModule();
        await appendAdminAuditLog('전체 초기화', '생산계획', `${prevCount}행 초기화`);
      } else if (modKey === 'receiver') {
        const prevCount = (state.receiverPlanRows || []).length;
        state.receiverPlanRows = [];
        await saveReceiverPlanToDb(true);
        if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
        await appendAdminAuditLog('전체 초기화', '수주현황', `${prevCount}건 초기화`);
      } else if (modKey === 'attendance') {
        const prevCount = (state.attendanceRecords || []).length;
        state.attendanceRecords = [];
        state.attendanceHolidays = {};
        saveLocalAttendanceData();
        await saveAttendanceToDb(true);
        renderAttendanceModule();
        await appendAdminAuditLog('전체 초기화', '근태관리', `${prevCount}건 초기화`);
      } else if (modKey === 'master_samples') {
        const prevCount = (state.workers?.length || 0) + (state.commonItems?.length || 0) + (state.etcItems?.length || 0);
        state.workers = [];
        state.commonItems = [];
        state.etcItems = [];
        saveLocalMasterData();
        await saveMasterToDb(true);
        renderMasterData();
        renderAll();
        await appendAdminAuditLog('전체 초기화', '기본 마스터 샘플', `작업자·품목·기타작업 ${prevCount}건 비움`);
      }

      renderAdminDataStats();
      renderAdminCertTable();
      showToast(`[${modName}] 초기화가 완료되었습니다.`);
    };

    const countRangeTargets = () => {
      const mod = document.getElementById('admin-range-module')?.value || 'cert';
      const start = document.getElementById('admin-range-start')?.value || '';
      const end = document.getElementById('admin-range-end')?.value || '';
      const badge = document.getElementById('admin-range-preview-badge');
      if (!badge) return 0;

      if (!start && !end) {
        badge.textContent = '기간을 선택하세요';
        return 0;
      }

      let count = 0;
      const countCert = () => (state.certSavedRows || []).filter(r => isDateInRange(String(r.writeDate || '').slice(0, 10), start, end)).length;
      const countQual = () => (state.qualityRows || []).filter(q => isDateInRange(getQualityRowDate(q), start, end)).length;
      const countInsp = () => getLocalPrefixKeys(STORAGE_KEYS.INSP_V2_PREFIX)
        .filter(k => isDateInRange(k.slice(STORAGE_KEYS.INSP_V2_PREFIX.length), start, end)).length;
      const countDaily = () => getLocalPrefixKeys(STORAGE_KEYS.DAILY_V2_PREFIX)
        .filter(k => isDateInRange(k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length), start, end)).length;
      const countAtt = () => (state.attendanceRecords || []).filter(r => isDateInRange(String(r.date || '').slice(0, 10), start, end)).length;

      if (mod === 'cert') count = countCert();
      else if (mod === 'quality') count = countQual();
      else if (mod === 'insp_v2') count = countInsp();
      else if (mod === 'daily_v2') count = countDaily();
      else if (mod === 'attendance') count = countAtt();
      else if (mod === 'all_dated') count = countCert() + countQual() + countInsp() + countDaily() + countAtt();

      badge.textContent = `대상: ${count}건`;
      return count;
    };

    const deleteAdminRangeData = async () => {
      if (!state.currentUser?.canApprove) {
        alert('관리자 권한이 필요합니다.');
        return;
      }
      const mod = document.getElementById('admin-range-module')?.value || 'cert';
      const start = document.getElementById('admin-range-start')?.value || '';
      const end = document.getElementById('admin-range-end')?.value || '';
      if (!start && !end) {
        alert('시작일 또는 종료일을 입력해 주세요.');
        return;
      }
      if (start && end && start > end) {
        alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
      }
      const total = countRangeTargets();
      if (total === 0) {
        alert('선택한 기간에 해당하는 삭제 대상 데이터가 없습니다.');
        return;
      }
      const modLabel = document.getElementById('admin-range-module')?.selectedOptions?.[0]?.textContent || mod;
      if (!confirm(`[${modLabel}]\n기간(${start || '처음'} ~ ${end || '끝'}) 데이터 ${total}건을 삭제하시겠습니까?`)) return;

      maybeAutoBackup();
      const syncQual = document.getElementById('chk-admin-sync-quality')?.checked;
      const deletedDetails = [];

      if (mod === 'cert' || mod === 'all_dated') {
        const delIds = (state.certSavedRows || [])
          .filter(r => isDateInRange(String(r.writeDate || '').slice(0, 10), start, end))
          .map(r => r.id);
        if (delIds.length > 0) {
          state.certSavedRows = (state.certSavedRows || []).filter(r => !delIds.includes(r.id));
          if (syncQual) {
            state.qualityRows = (state.qualityRows || []).filter(q => !delIds.includes(q.certRowId || q.id));
          }
          saveLocalCertData();
          await saveCertDataToDb(true);
          if (syncQual) await saveQualityRowsToDb();
          renderCertSavedTable();
          renderQualityTable();
          if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
          deletedDetails.push(`검정현황 ${delIds.length}건`);
        }
      }

      if (mod === 'quality' || mod === 'all_dated') {
        const before = (state.qualityRows || []).length;
        state.qualityRows = (state.qualityRows || []).filter(q => !isDateInRange(getQualityRowDate(q), start, end));
        const removed = before - state.qualityRows.length;
        if (removed > 0) {
          saveLocalCertData();
          await saveQualityRowsToDb();
          renderQualityTable();
          deletedDetails.push(`품질검사 ${removed}건`);
        }
      }

      if (mod === 'insp_v2' || mod === 'all_dated') {
        const targetWeeks = getLocalPrefixKeys(STORAGE_KEYS.INSP_V2_PREFIX)
          .map(k => k.slice(STORAGE_KEYS.INSP_V2_PREFIX.length))
          .filter(d => isDateInRange(d, start, end));
        if (targetWeeks.length > 0) {
          targetWeeks.forEach(w => localStorage.removeItem(STORAGE_KEYS.INSP_V2_PREFIX + w));
          await deleteFirestoreCollectionDocs('pms_insp_v2', targetWeeks);
          await deleteMetadataPrefixDocs('insp_v2__', targetWeeks);
          if (state.inspectionTargetDate && targetWeeks.includes(state.inspectionTargetDate)) {
            loadLocalInspectionV2(state.inspectionTargetDate);
            if (typeof renderInspectionV2 === 'function') renderInspectionV2();
          }
          deletedDetails.push(`일정계획 ${targetWeeks.length}주`);
        }
      }

      if (mod === 'daily_v2' || mod === 'all_dated') {
        const targetDays = getLocalPrefixKeys(STORAGE_KEYS.DAILY_V2_PREFIX)
          .map(k => k.slice(STORAGE_KEYS.DAILY_V2_PREFIX.length))
          .filter(d => isDateInRange(d, start, end));
        if (targetDays.length > 0) {
          targetDays.forEach(d => localStorage.removeItem(STORAGE_KEYS.DAILY_V2_PREFIX + d));
          await deleteFirestoreCollectionDocs('pms_daily_v2', targetDays);
          await deleteMetadataPrefixDocs('daily_v2__', targetDays);
          if (state.productionDate && targetDays.includes(state.productionDate)) {
            loadLocalDailyV2(state.productionDate);
            if (typeof renderDailyV2 === 'function') renderDailyV2();
          }
          deletedDetails.push(`생산일보 ${targetDays.length}일`);
        }
      }

      if (mod === 'attendance' || mod === 'all_dated') {
        const before = (state.attendanceRecords || []).length;
        state.attendanceRecords = (state.attendanceRecords || []).filter(r => !isDateInRange(String(r.date || '').slice(0, 10), start, end));
        const removed = before - state.attendanceRecords.length;
        if (removed > 0) {
          saveLocalAttendanceData();
          await saveAttendanceToDb(true);
          renderAttendanceModule();
          deletedDetails.push(`근태관리 ${removed}건`);
        }
      }

      await appendAdminAuditLog('기간 삭제', modLabel, `${start || '처음'} ~ ${end || '끝'} (${deletedDetails.join(', ')})`);
      countRangeTargets();
      renderAdminDataStats();
      renderAdminCertTable();
      showToast('선택한 기간의 데이터가 삭제되었습니다.');
    };

    const getFilteredAdminCertRows = () => {
      const statusFilter = document.getElementById('admin-cert-status-filter')?.value || 'ALL';
      const start = document.getElementById('admin-cert-date-start')?.value || '';
      const end = document.getElementById('admin-cert-date-end')?.value || '';
      const q = (document.getElementById('admin-cert-search')?.value || '').trim().toLowerCase();

      return (state.certSavedRows || []).filter(r => {
        const st = r.status || '등록완료';
        if (statusFilter !== 'ALL' && st !== statusFilter) return false;
        const wd = String(r.writeDate || '').slice(0, 10);
        if (start && (!wd || wd < start)) return false;
        if (end && (!wd || wd > end)) return false;
        if (q) {
          const hay = [r.code, r.name, getDisplayNameByCode(r.code, r.name), r.spec, r.lotNo, r.requestDept, r.group]
            .map(v => String(v || '').toLowerCase()).join(' ');
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    };

    const renderAdminCertTable = () => {
      const tbody = document.getElementById('admin-cert-tbody');
      if (!tbody) return;
      const rows = getFilteredAdminCertRows();
      const chkAll = document.getElementById('chk-admin-cert-all');
      if (chkAll) chkAll.checked = false;

      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-secondary);">조건에 해당하는 검정현황 데이터가 없습니다.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const rawSt = r.status || '등록완료';
        const st = rawSt === '품검요청' ? '검정신청' : rawSt;
        const isLocked = st === '일정완료' || st === '검정신청';
        const badgeStyle = st === '일정완료'
          ? 'background:#dcfce7; color:#15803d;'
          : st === '검정신청'
            ? 'background:#fef3c7; color:#b45309;'
            : st === '불합격'
              ? 'background:#fee2e2; color:#b91c1c;'
              : 'background:#e0f2fe; color:#0369a1;';
        const lockSvg = isLocked
          ? '<svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
          : '';
        return `
          <tr data-id="${escHtml(r.id)}">
            <td style="text-align:center;"><input type="checkbox" class="chk-admin-cert-row" data-id="${escHtml(r.id)}"></td>
            <td style="text-align:center;"><span class="badge" style="${badgeStyle}">${lockSvg}${escHtml(st)}</span></td>
            <td style="text-align:center;">${escHtml(r.writeDate || '-')}</td>
            <td style="text-align:center;">${escHtml(r.requestDept || '-')}</td>
            <td style="text-align:center;">${escHtml(r.code || '-')}</td>
            <td>${escHtml(getDisplayNameByCode(r.code, r.name) || '-')}</td>
            <td style="text-align:right;">${Number(r.qty || 0).toLocaleString()}</td>
            <td style="text-align:center;">${escHtml(r.lotNo || '-')}</td>
            <td style="text-align:center;">${escHtml(r.group || '-')}</td>
            <td style="text-align:center;">
              <button type="button" class="btn btn-xs btn-outline btn-admin-cert-edit" data-id="${escHtml(r.id)}">수정</button>
              <button type="button" class="btn btn-xs btn-outline text-danger btn-admin-cert-del" data-id="${escHtml(r.id)}">삭제</button>
            </td>
          </tr>
        `;
      }).join('');
    };

    const renderAdminAuditTable = () => {
      const tbody = document.getElementById('admin-audit-tbody');
      if (!tbody) return;
      const logs = getAuditLogs();
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px; color:var(--text-secondary);">기록된 관리 이력이 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="font-size:12px;">${escHtml(l.ts)}</td>
          <td style="font-size:12px;">${escHtml(l.user)}</td>
          <td style="font-size:12px;"><span class="badge" style="background:#f1f5f9; color:#334155;">${escHtml(l.actionType)}</span></td>
          <td style="font-size:12px;">${escHtml(l.targetLabel)}</td>
          <td style="font-size:12px; color:var(--text-secondary);">${escHtml(l.detail)}</td>
        </tr>
      `).join('');
    };

    const forceDeleteCertRowsByIds = async (ids, label) => {
      if (!ids || ids.length === 0) return;
      if (!confirm(`${label} ${ids.length}건을 강제 삭제하시겠습니까?\n(일정완료·품검요청 잠금 항목도 즉시 삭제됩니다.)`)) return;
      maybeAutoBackup();
      const syncQual = document.getElementById('chk-admin-sync-quality')?.checked;
      state.certSavedRows = (state.certSavedRows || []).filter(r => !ids.includes(r.id));
      if (syncQual) {
        state.qualityRows = (state.qualityRows || []).filter(q => !ids.includes(q.certRowId || q.id));
      }
      saveLocalCertData();
      await saveCertDataToDb(true);
      if (syncQual) await saveQualityRowsToDb();
      renderCertSavedTable();
      renderQualityTable();
      if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
      await appendAdminAuditLog('강제 삭제', '검정현황', `${ids.length}건 삭제${syncQual ? ' (품질검사 연동 포함)' : ''}`);
      renderAdminDataStats();
      renderAdminCertTable();
      showToast(`${ids.length}건이 강제 삭제되었습니다.`);
    };

    // 이벤트 연결
    document.getElementById('btn-settings-nav-data-admin')?.addEventListener('click', () => {
      syncAuditLogsFromDb();
      renderAdminDataStats();
      countRangeTargets();
      renderAdminCertTable();
      renderAdminAuditTable();
    });

    document.getElementById('btn-admin-refresh-stats')?.addEventListener('click', () => {
      renderAdminDataStats();
      countRangeTargets();
      renderAdminCertTable();
      renderAdminAuditTable();
      showToast('현황을 새로고침했습니다.');
    });

    document.getElementById('btn-admin-full-backup')?.addEventListener('click', downloadAdminFullBackupJson);

    // 생산계획(W1~W53) 백업 파일(CSV/JSON) 일괄 복원 및 DB 저장
    const planBackupFileInp = document.getElementById('input-admin-plan-backup-file');
    const planBackupBtn = document.getElementById('btn-admin-plan-backup-restore');
    const planBackupStatus = document.getElementById('admin-plan-backup-status');

    const applyPlanBackupRecords = async (records, targetYear, mode, fileName) => {
      if (!records || records.length === 0) {
        alert('복원할 품목 데이터가 없습니다.');
        return;
      }
      if (!state.planData) loadLocalPlanData();
      if (!state.planData) state.planData = getDefaultPlanData();
      if (!state.planData.rowsByYear || typeof state.planData.rowsByYear !== 'object') {
        state.planData.rowsByYear = {};
      }
      if (mode === 'overwrite' || !state.planData.rowsByYear[targetYear]) {
        state.planData.rowsByYear[targetYear] = {};
      }
      const yearRows = state.planData.rowsByYear[targetYear];
      const masterMap = new Map((state.certMasterItems || []).map(it => [String(it.code || '').trim().toLowerCase(), it]));
      let appliedCount = 0;
      let weekCellCount = 0;

      records.forEach(rec => {
        const code = String(rec.code || '').trim();
        if (!code) return;
        const master = masterMap.get(code.toLowerCase());
        const canonicalCode = master ? master.code : code;
        if (!yearRows[canonicalCode]) {
          yearRows[canonicalCode] = { weeks: {}, colors: {}, memos: {}, splits: {} };
        }
        const row = yearRows[canonicalCode];
        if (!row.weeks) row.weeks = {};

        if (rec.baseStock !== undefined && rec.baseStock !== null && String(rec.baseStock).trim() !== '') {
          row.baseStock = String(rec.baseStock).trim();
          if (master) master.baseStock = row.baseStock;
        }
        if (master) {
          if (rec.minStock !== undefined && String(rec.minStock).trim() !== '') master.minStock = String(rec.minStock).trim();
          if (rec.optStock !== undefined && String(rec.optStock).trim() !== '') master.maxStock = String(rec.optStock).trim();
        }

        Object.entries(rec.weeks || {}).forEach(([wId, wObj]) => {
          if (!row.weeks[wId]) row.weeks[wId] = {};
          const dst = row.weeks[wId];
          ['prod', 'forecast', 'actual'].forEach(f => {
            const val = wObj?.[f];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              dst[f] = String(val).trim();
              weekCellCount++;
            } else if (mode === 'overwrite') {
              dst[f] = '';
            }
          });
        });
        appliedCount++;
      });

      if (String(state.planData.year || '2026') === String(targetYear)) {
        state.planData.rowsByCode = yearRows;
      }
      saveLocalCertData();
      await saveCertDataToDb(true);
      saveLocalPlanData();
      await savePlanToDb(false);
      if (typeof renderPlanModule === 'function') renderPlanModule();
      await appendAdminAuditLog('백업 복원', '생산계획', `${targetYear}년 ${appliedCount}개 품목 (${weekCellCount}개 셀, ${mode === 'overwrite' ? '덮어쓰기' : '병합'}) - ${fileName}`);
      renderAdminDataStats();
      renderAdminAuditTable();
      if (planBackupStatus) {
        planBackupStatus.textContent = `완료: ${targetYear}년 ${appliedCount}개 품목 (${weekCellCount.toLocaleString()}개 값) DB 저장됨`;
        planBackupStatus.style.color = '#15803d';
      }
      showToast(`생산계획 ${targetYear}년 ${appliedCount}개 품목이 DB에 복원/저장되었습니다.`);
    };

    planBackupBtn?.addEventListener('click', () => {
      if (planBackupFileInp) {
        planBackupFileInp.value = '';
        planBackupFileInp.click();
      }
    });

    planBackupFileInp?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const targetYear = document.getElementById('admin-plan-backup-year')?.value || '2026';
      const mode = document.getElementById('admin-plan-backup-mode')?.value || 'overwrite';
      if (!confirm(`[${file.name}] 파일을 ${targetYear}년 생산계획에 ${mode === 'overwrite' ? '전체 덮어쓰기' : '병합'} 후 DB에 저장하시겠습니까?`)) {
        e.target.value = '';
        return;
      }
      try {
        if (planBackupStatus) {
          planBackupStatus.textContent = '파일 분석 및 DB 저장 중...';
          planBackupStatus.style.color = 'var(--text-secondary)';
        }
        const records = [];
        if (/\.json$/i.test(file.name)) {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
          list.forEach(it => {
            const code = String(it.Code ?? it.code ?? '').trim();
            if (!code) return;
            const weeks = {};
            Object.entries(it.Weeks || it.weeks || {}).forEach(([wId, wv]) => {
              weeks[wId] = {
                prod: wv?.prod ?? '',
                forecast: wv?.forecast ?? '',
                actual: wv?.actual ?? ''
              };
            });
            records.push({
              code,
              baseStock: it.BaseStock ?? it.baseStock,
              minStock: it.MinStock ?? it.minStock,
              optStock: it.OptStock ?? it.optStock,
              weeks
            });
          });
        } else {
          if (!window.XLSXEngine) throw new Error('XLSXEngine 없음');
          const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
          const rows = parsed?.data || [];
          if (rows.length < 2) throw new Error('데이터 행이 없습니다.');
          const hdr = (rows[0] || []).map(c => String(c || '').trim());
          const idxCode = hdr.findIndex(h => h === '코드' || h === '품목코드');
          if (idxCode < 0) throw new Error('[코드] 컬럼을 찾을 수 없습니다.');
          const idxBase = hdr.findIndex(h => h.startsWith('기초재고'));
          const idxMin = hdr.findIndex(h => h === '최소재고');
          const idxOpt = hdr.findIndex(h => h === '적정재고' || h === '최대재고');

          const weekCols = {};
          hdr.forEach((h, cIdx) => {
            const m = h.match(/^(W\d+)_(생산|출고예정|실출고)$/);
            if (m) {
              const wId = m[1];
              if (!weekCols[wId]) weekCols[wId] = {};
              if (m[2] === '생산') weekCols[wId].prod = cIdx;
              else if (m[2] === '출고예정') weekCols[wId].forecast = cIdx;
              else if (m[2] === '실출고') weekCols[wId].actual = cIdx;
            }
          });

          for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            const code = String(row[idxCode] ?? '').trim();
            if (!code) continue;
            const weeks = {};
            Object.entries(weekCols).forEach(([wId, cols]) => {
              weeks[wId] = {
                prod: cols.prod !== undefined ? String(row[cols.prod] ?? '').trim() : '',
                forecast: cols.forecast !== undefined ? String(row[cols.forecast] ?? '').trim() : '',
                actual: cols.actual !== undefined ? String(row[cols.actual] ?? '').trim() : ''
              };
            });
            records.push({
              code,
              baseStock: idxBase >= 0 ? String(row[idxBase] ?? '').trim() : undefined,
              minStock: idxMin >= 0 ? String(row[idxMin] ?? '').trim() : undefined,
              optStock: idxOpt >= 0 ? String(row[idxOpt] ?? '').trim() : undefined,
              weeks
            });
          }
        }
        await applyPlanBackupRecords(records, targetYear, mode, file.name);
      } catch (err) {
        console.error('생산계획 백업 복원 오류:', err);
        if (planBackupStatus) {
          planBackupStatus.textContent = `오류: ${err.message || '파일 처리 실패'}`;
          planBackupStatus.style.color = '#dc2626';
        }
        alert('백업 파일을 불러오는 중 오류가 발생했습니다: ' + (err.message || err));
      } finally {
        e.target.value = '';
      }
    });

    // 수신기계획 백업 파일(CSV/JSON) 일괄 복원 및 DB 저장
    const rpBackupFileInp = document.getElementById('input-admin-rp-backup-file');
    const rpBackupBtn = document.getElementById('btn-admin-rp-backup-restore');
    const rpBackupStatus = document.getElementById('admin-rp-backup-status');

    rpBackupBtn?.addEventListener('click', () => {
      if (rpBackupFileInp) {
        rpBackupFileInp.value = '';
        rpBackupFileInp.click();
      }
    });

    rpBackupFileInp?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const mode = document.getElementById('admin-rp-backup-mode')?.value || 'overwrite';
      if (!confirm(`[${file.name}] 파일을 수신기계획에 ${mode === 'overwrite' ? '전체 덮어쓰기' : '추가'} 후 DB에 저장하시겠습니까?`)) {
        e.target.value = '';
        return;
      }
      try {
        if (rpBackupStatus) {
          rpBackupStatus.textContent = '파일 분석 및 DB 저장 중...';
          rpBackupStatus.style.color = 'var(--text-secondary)';
        }
        const importedRows = [];
        if (/\.json$/i.test(file.name)) {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed?.rows) ? parsed.rows : (Array.isArray(parsed) ? parsed : []);
          list.forEach(it => {
            if (!it || typeof it !== 'object') return;
            importedRows.push(trimRpRow(createEmptyReceiverPlanRow(it)));
          });
        } else {
          if (!window.XLSXEngine) throw new Error('XLSXEngine 없음');
          const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
          const rows = parsed?.data || [];
          if (rows.length < 2) throw new Error('데이터 행이 없습니다.');
          const hdr = (rows[0] || []).map(c => String(c || '').trim());
          const colIdx = (names) => hdr.findIndex(h => names.includes(h));
          const mapIdx = {
            reqNo: colIdx(['제작의뢰번호', 'reqNo']),
            code: colIdx(['품목코드', '제품코드', 'code']),
            formatNo: colIdx(['형식번호', 'formatNo']),
            itemGroup: colIdx(['품목그룹', '구분', 'itemGroup']),
            name: colIdx(['품명', 'MODEL', 'name']),
            siteName: colIdx(['현장명', 'siteName']),
            builder: colIdx(['건설사', 'builder']),
            client: colIdx(['거래선', 'client']),
            manager: colIdx(['담당자', 'manager']),
            receiptDate: colIdx(['접수일', '제작의뢰서 접수일', 'receiptDate']),
            dueDate: colIdx(['납기일자', '제작의뢰서 납기일자', 'dueDate']),
            issueReqDate: colIdx(['불출일', '자재불출 요청일', 'issueReqDate']),
            weekDate: colIdx(['생산주차', '생산주차 마감일', 'weekDate']),
            inspectDate: colIdx(['수검일자', 'KFI검사 마감일', 'inspectDate']),
            colorInfo: colIdx(['외함색상', '색상정보', 'colorInfo']),
            remark: colIdx(['비고', 'remark']),
            lotNo: colIdx(['로트번호', 'Lot no.', 'lotNo']),
            mfgYm: colIdx(['제조년월', 'mfgYm']),
            serialFrom: colIdx(['제조번호 FROM', 'serialFrom']),
            serialTo: colIdx(['제조번호 TO', 'serialTo'])
          };
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            const obj = {};
            let hasVal = false;
            Object.entries(mapIdx).forEach(([k, idx]) => {
              if (idx >= 0) {
                const v = String(row[idx] ?? '').trim();
                obj[k] = v;
                if (v) hasVal = true;
              }
            });
            if (!hasVal) continue;
            importedRows.push(trimRpRow(createEmptyReceiverPlanRow(obj)));
          }
        }

        if (importedRows.length === 0) {
          alert('복원할 수신기계획 데이터가 없습니다.');
          return;
        }
        if (mode === 'overwrite') {
          state.receiverPlanRows = importedRows;
        } else {
          state.receiverPlanRows = (state.receiverPlanRows || []).concat(importedRows);
        }
        await saveReceiverPlanToDb(false);
        if (typeof renderReceiverPlanModule === 'function') renderReceiverPlanModule();
        await appendAdminAuditLog('백업 복원', '수신기계획', `${importedRows.length}건 (${mode === 'overwrite' ? '덮어쓰기' : '추가'}) - ${file.name}`);
        renderAdminDataStats();
        renderAdminAuditTable();
        if (rpBackupStatus) {
          rpBackupStatus.textContent = `완료: ${importedRows.length.toLocaleString()}건 DB 저장됨`;
          rpBackupStatus.style.color = '#15803d';
        }
      } catch (err) {
        console.error('수신기계획 백업 복원 오류:', err);
        if (rpBackupStatus) {
          rpBackupStatus.textContent = `오류: ${err.message || '파일 처리 실패'}`;
          rpBackupStatus.style.color = '#dc2626';
        }
        alert('백업 파일을 불러오는 중 오류가 발생했습니다: ' + (err.message || err));
      } finally {
        e.target.value = '';
      }
    });

    // 검정현황 백업 파일(CSV/JSON) 일괄 복원 및 DB 저장
    const certBackupFileInp = document.getElementById('input-admin-cert-backup-file');
    const certBackupBtn = document.getElementById('btn-admin-cert-backup-restore');
    const certBackupStatus = document.getElementById('admin-cert-backup-status');
    const certBackupCutoffSel = document.getElementById('admin-cert-backup-cutoff-week');

    if (certBackupCutoffSel && certBackupCutoffSel.options.length <= 1 && typeof generateYearWeeks === 'function') {
      const wks2026 = generateYearWeeks('2026');
      wks2026.forEach(w => {
        const dt = typeof getPlanWeekFridayDates === 'function' ? getPlanWeekFridayDates('2026', w.id) : null;
        const wDate = dt?.weekDate || dt?.rawFridayStr || '';
        if (!wDate) return;
        const opt = document.createElement('option');
        opt.value = wDate;
        opt.textContent = `${w.id} 이하 (~${wDate}) 완료처리`;
        certBackupCutoffSel.appendChild(opt);
      });
    }

    certBackupBtn?.addEventListener('click', () => {
      if (certBackupFileInp) {
        certBackupFileInp.value = '';
        certBackupFileInp.click();
      }
    });

    certBackupFileInp?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const mode = document.getElementById('admin-cert-backup-mode')?.value || 'overwrite';
      const cutoffDate = certBackupCutoffSel?.value || '';
      const cutoffLabel = cutoffDate ? `${certBackupCutoffSel.options[certBackupCutoffSel.selectedIndex]?.textContent}` : '원본 상태 유지';
      if (!confirm(`[${file.name}] 파일을 검정현황에 ${mode === 'overwrite' ? '전체 덮어쓰기' : '추가'} (${cutoffLabel}) 후 DB에 저장하시겠습니까?`)) {
        e.target.value = '';
        return;
      }
      try {
        if (certBackupStatus) {
          certBackupStatus.textContent = '파일 분석 및 DB 저장 중...';
          certBackupStatus.style.color = 'var(--text-secondary)';
        }
        const rawRecords = [];
        if (/\.json$/i.test(file.name)) {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed?.rows) ? parsed.rows : (Array.isArray(parsed) ? parsed : []);
          list.forEach(it => {
            if (it && typeof it === 'object') rawRecords.push(it);
          });
        } else {
          if (!window.XLSXEngine) throw new Error('XLSXEngine 없음');
          const parsed = await window.XLSXEngine.parseSpreadsheetFile(file);
          const rows = parsed?.data || [];
          if (rows.length < 2) throw new Error('데이터 행이 없습니다.');
          const hdr = (rows[0] || []).map(c => String(c || '').trim());
          const colIdx = (names) => hdr.findIndex(h => names.includes(h));
          const m = {
            id: colIdx(['ID', 'PID', 'id']),
            status: colIdx(['상태', 'status']),
            sheetStatus: colIdx(['원본진행', '진행', 'sheetStatus']),
            type: colIdx(['구분', 'type']),
            writeDate: colIdx(['작성일자', 'writeDate']),
            inspectDate: colIdx(['KFI수검일자', 'KFI 수검일자 (생산주 +7)', 'inspectDate']),
            weekDate: colIdx(['생산주차', '생산주차 (매주 금)', 'weekDate']),
            code: colIdx(['품목코드', 'code']),
            name: colIdx(['제품명', '제 품 명', 'name']),
            spec: colIdx(['규격', '규 격', 'spec']),
            formatNo: colIdx(['형식번호', '형식 번호', 'formatNo']),
            qty: colIdx(['신청수량', 'qty']),
            lotNo: colIdx(['로트번호', 'lotNo']),
            from: colIdx(['제조번호FROM', '제조번호 FROM', 'from']),
            to: colIdx(['제조번호TO', '제조번호 TO', 'to']),
            passNo: colIdx(['합격표시번호', 'passNo']),
            site: colIdx(['비고(현장명)', '비고 (현장명)', 'site']),
            color: colIdx(['외함색상', 'color']),
            dept: colIdx(['요청부서', 'dept']),
            sensor: colIdx(['감지', 'sensor']),
            ctrl: colIdx(['제어', 'ctrl'])
          };
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            const obj = {};
            let hasVal = false;
            Object.entries(m).forEach(([k, idx]) => {
              if (idx >= 0) {
                const v = String(row[idx] ?? '').trim();
                obj[k] = v;
                if (v) hasVal = true;
              }
            });
            if (hasVal && (obj.code || obj.name)) rawRecords.push(obj);
          }
        }

        if (rawRecords.length === 0) {
          alert('복원할 검정현황 데이터가 없습니다.');
          return;
        }

        const nowIso = new Date().toISOString();
        let completedCnt = 0;
        const importedRows = rawRecords.map(rec => {
          const row = createNewDraftRow({
            id: rec.id || ('cert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
            checked: false,
            code: String(rec.code || '').trim(),
            name: String(rec.name || '').trim(),
            spec: String(rec.spec || '').trim(),
            formatNo: String(rec.formatNo || '').trim(),
            type: String(rec.type || '').trim(),
            writeDate: String(rec.writeDate || '').trim(),
            inspectDate: String(rec.inspectDate || '').trim(),
            weekDate: String(rec.weekDate || '').trim(),
            qty: String(rec.qty || '').trim(),
            lotNo: String(rec.lotNo || '').trim(),
            from: String(rec.from || '').trim(),
            to: String(rec.to || '').trim(),
            passNo: String(rec.passNo || '').trim(),
            site: String(rec.site || '').trim(),
            color: String(rec.color || '').trim(),
            dept: String(rec.dept || '').trim(),
            sensor: String(rec.sensor || '').trim(),
            ctrl: String(rec.ctrl || '').trim(),
            savedAt: rec.savedAt || nowIso
          });

          const refDate = row.weekDate || row.inspectDate || row.writeDate || '';
          if (cutoffDate) {
            if (refDate && refDate <= cutoffDate) {
              row.status = '일정완료';
            } else if (rec.sheetStatus === '신청완료' || rec.status === '검정신청') {
              row.status = '검정신청';
            } else {
              row.status = '등록완료';
            }
          } else {
            row.status = rec.status || (rec.sheetStatus === '검사완료' ? '일정완료' : (rec.sheetStatus === '신청완료' ? '검정신청' : '등록완료'));
          }
          if (row.status === '일정완료') completedCnt++;
          return row;
        });

        if (mode === 'overwrite') {
          state.certSavedRows = importedRows;
        } else {
          state.certSavedRows = importedRows.concat(state.certSavedRows || []);
        }
        saveLocalCertData();
        await saveCertDataToDb(true);
        if (typeof renderCertificationModule === 'function') renderCertificationModule();
        await appendAdminAuditLog('백업 복원', '검정현황', `${importedRows.length}건 (완료 ${completedCnt}건, ${cutoffLabel}) - ${file.name}`);
        renderAdminDataStats();
        renderAdminCertTable();
        renderAdminAuditTable();
        if (certBackupStatus) {
          certBackupStatus.textContent = `완료: ${importedRows.length.toLocaleString()}건 (완료 ${completedCnt.toLocaleString()}건) DB 저장됨`;
          certBackupStatus.style.color = '#15803d';
        }
        showToast(`검정현황 ${importedRows.length}건이 DB에 복원/저장되었습니다.`);
      } catch (err) {
        console.error('검정현황 백업 복원 오류:', err);
        if (certBackupStatus) {
          certBackupStatus.textContent = `오류: ${err.message || '파일 처리 실패'}`;
          certBackupStatus.style.color = '#dc2626';
        }
        alert('백업 파일을 불러오는 중 오류가 발생했습니다: ' + (err.message || err));
      } finally {
        e.target.value = '';
      }
    });

    document.getElementById('admin-data-stats-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-admin-reset-mod');
      if (!btn) return;
      resetAdminModuleData(btn.dataset.mod, btn.dataset.name);
    });

    ['admin-range-module', 'admin-range-start', 'admin-range-end'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', countRangeTargets);
    });
    document.getElementById('btn-admin-delete-range')?.addEventListener('click', deleteAdminRangeData);

    ['admin-cert-status-filter', 'admin-cert-date-start', 'admin-cert-date-end'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderAdminCertTable);
    });
    document.getElementById('admin-cert-search')?.addEventListener('input', renderAdminCertTable);
    document.getElementById('btn-admin-cert-reset-filter')?.addEventListener('click', () => {
      const s = document.getElementById('admin-cert-status-filter'); if (s) s.value = 'ALL';
      const ds = document.getElementById('admin-cert-date-start'); if (ds) ds.value = '';
      const de = document.getElementById('admin-cert-date-end'); if (de) de.value = '';
      const q = document.getElementById('admin-cert-search'); if (q) q.value = '';
      renderAdminCertTable();
    });

    document.getElementById('chk-admin-cert-all')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('#admin-cert-tbody .chk-admin-cert-row').forEach(cb => { cb.checked = checked; });
    });

    document.getElementById('btn-admin-cert-bulk-status')?.addEventListener('click', async () => {
      const ids = Array.from(document.querySelectorAll('#admin-cert-tbody .chk-admin-cert-row:checked')).map(cb => cb.dataset.id);
      if (ids.length === 0) { alert('상태를 변경할 항목을 1건 이상 선택해 주세요.'); return; }
      const newStatus = document.getElementById('admin-cert-bulk-status')?.value || '등록완료';
      if (!confirm(`선택한 ${ids.length}건의 상태를 [${newStatus}](으)로 변경하시겠습니까?`)) return;
      (state.certSavedRows || []).forEach(r => {
        if (ids.includes(r.id)) r.status = newStatus;
      });
      saveLocalCertData();
      await saveCertDataToDb(true);
      renderCertSavedTable();
      await appendAdminAuditLog('상태 변경', '검정현황', `${ids.length}건 → ${newStatus}`);
      renderAdminCertTable();
      showToast(`${ids.length}건의 상태가 [${newStatus}](으)로 변경되었습니다.`);
    });

    document.getElementById('btn-admin-cert-bulk-delete')?.addEventListener('click', () => {
      const ids = Array.from(document.querySelectorAll('#admin-cert-tbody .chk-admin-cert-row:checked')).map(cb => cb.dataset.id);
      if (ids.length === 0) { alert('삭제할 항목을 1건 이상 선택해 주세요.'); return; }
      forceDeleteCertRowsByIds(ids, '선택한 검정현황');
    });

    const editModal = document.getElementById('admin-cert-edit-modal');
    const closeEditModal = () => { if (editModal) editModal.style.display = 'none'; };
    document.getElementById('btn-close-admin-cert-edit')?.addEventListener('click', closeEditModal);
    document.getElementById('btn-cancel-admin-cert-edit')?.addEventListener('click', closeEditModal);

    document.getElementById('admin-cert-tbody')?.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.btn-admin-cert-del');
      if (delBtn) {
        forceDeleteCertRowsByIds([delBtn.dataset.id], '해당 검정현황');
        return;
      }
      const editBtn = e.target.closest('.btn-admin-cert-edit');
      if (editBtn) {
        const row = (state.certSavedRows || []).find(r => r.id === editBtn.dataset.id);
        if (!row || !editModal) return;
        document.getElementById('admin-edit-cert-id').value = row.id;
        document.getElementById('admin-edit-cert-status').value = row.status || '등록완료';
        document.getElementById('admin-edit-cert-writeDate').value = String(row.writeDate || '').slice(0, 10);
        document.getElementById('admin-edit-cert-dept').value = row.requestDept || '';
        document.getElementById('admin-edit-cert-qty').value = row.qty ?? '';
        document.getElementById('admin-edit-cert-lot').value = row.lotNo || '';
        document.getElementById('admin-edit-cert-group').value = row.group || '';
        document.getElementById('admin-edit-cert-note').value = row.note || '';
        editModal.style.display = 'flex';
      }
    });

    document.getElementById('form-admin-cert-edit')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('admin-edit-cert-id').value;
      const row = (state.certSavedRows || []).find(r => r.id === id);
      if (!row) return;
      row.status = document.getElementById('admin-edit-cert-status').value;
      row.writeDate = document.getElementById('admin-edit-cert-writeDate').value;
      row.requestDept = document.getElementById('admin-edit-cert-dept').value.trim();
      row.qty = Number(document.getElementById('admin-edit-cert-qty').value || 0);
      row.lotNo = document.getElementById('admin-edit-cert-lot').value.trim();
      row.group = document.getElementById('admin-edit-cert-group').value.trim();
      row.note = document.getElementById('admin-edit-cert-note').value.trim();

      saveLocalCertData();
      await saveCertDataToDb(true);
      renderCertSavedTable();
      closeEditModal();
      await appendAdminAuditLog('항목 수정', '검정현황', `${row.code || ''} ${row.name || ''} (${row.status})`);
      renderAdminCertTable();
      showToast('검정현황 항목이 수정되었습니다.');
    });

    document.getElementById('btn-admin-clear-audit')?.addEventListener('click', async () => {
      if (!confirm('관리 이력 로그를 모두 비우시겠습니까?')) return;
      await saveAuditLogs([]);
      showToast('관리 이력이 비워졌습니다.');
    });
  }

  // =========================================================================
  // 16. DOM 준비 완료 및 시스템 기동
  // =========================================================================
  function initBottomStatusBar() {
    document.getElementById('btn-scroll-top')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const mc = document.querySelector('.main-content');
      if (mc && mc.scrollTop > 0) mc.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const syncFooterTab = () => {
      const el = document.getElementById('footer-current-tab');
      if (!el) return;
      const activeTab = document.querySelector('.nav-tab.active');
      if (!activeTab) return;
      const tId = activeTab.dataset.tab;
      if (tId === 'tab-production') {
        const chip = document.getElementById('chip-daily-line')?.textContent?.trim();
        el.textContent = chip ? `생산일보 · ${chip}` : '생산일보';
      } else if (tId === 'tab-plan' || tId === 'tab-receiver-plan') {
        const chip = document.getElementById('chip-plan-mode')?.textContent?.trim();
        el.textContent = chip || '생산계획';
      } else if (tId === 'tab-certification' || tId === 'tab-cert-settlement') {
        const chip = document.getElementById('chip-cert-mode')?.textContent?.trim();
        el.textContent = chip ? `검정현황 · ${chip}` : '검정현황';
      } else if (tId === 'tab-attendance') {
        const chip = document.getElementById('chip-cal-mode')?.textContent?.trim();
        el.textContent = chip ? `캘린더 · ${chip}` : '캘린더';
      } else {
        const label = activeTab.querySelector('span')?.textContent?.trim();
        if (label) el.textContent = label;
      }
    };

    const syncRpGridHeight = () => {
      const pane = document.getElementById('tab-receiver-plan');
      const wrap = document.getElementById('rp-grid-scroll-wrap');
      if (pane && wrap && pane.classList.contains('active')) {
        const top = wrap.getBoundingClientRect().top;
        if (top > 0) {
          const avail = Math.max(300, Math.floor(window.innerHeight - top - 48));
          wrap.style.height = `${avail}px`;
          wrap.style.maxHeight = `${avail}px`;
        }
      }
      const attPane = document.getElementById('tab-attendance');
      const attGrid = document.querySelector('#tab-attendance .att-main-grid');
      if (attPane && attGrid && attPane.classList.contains('active')) {
        if (window.innerWidth > 1180) {
          const attTop = attGrid.getBoundingClientRect().top;
          if (attTop > 0) {
            const attAvail = Math.max(400, Math.floor(window.innerHeight - attTop - 70));
            attGrid.style.height = `${attAvail}px`;
            attGrid.style.maxHeight = `${attAvail}px`;
          }
        } else {
          attGrid.style.height = '';
        }
      }
    };

    document.querySelectorAll('.nav-tab, .nav-dropdown-item').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(() => { syncFooterTab(); syncRpGridHeight(); }, 30));
    });
    window.addEventListener('resize', syncRpGridHeight);
    syncFooterTab();
    syncRpGridHeight();
  }

  document.addEventListener('DOMContentLoaded', () => {
    // 새로고침 시 마지막에 보던 하위 모드 및 탭을 가장 먼저 복원 (초기 깜빡임 방지)
    let savedTabToRestore = null;
    try {
      const savedCalMode = localStorage.getItem('pms_last_cal_mode');
      if (savedCalMode === 'schedule' || savedCalMode === 'attendance') {
        state.calendarMode = savedCalMode;
        const calChip = document.getElementById('chip-cal-mode');
        if (calChip) calChip.textContent = savedCalMode === 'schedule' ? '생산일정' : '근태관리';
      }
      const savedDailyMode = localStorage.getItem('pms_last_daily_mode');
      if (savedDailyMode === 'daily' || savedDailyMode === 'workhours') {
        state.activeLines.daily = savedDailyMode;
        const dChip = document.getElementById('chip-daily-line');
        if (dChip) dChip.textContent = savedDailyMode === 'workhours' ? '공수집계' : '일보작성';
      }
      const savedTab = localStorage.getItem('pms_last_active_tab');
      if (savedTab && document.getElementById(savedTab)) {
        savedTabToRestore = savedTab;
        if (savedTab === 'tab-receiver-plan') {
          const pChip = document.getElementById('chip-plan-mode');
          if (pChip) pChip.textContent = '수신기계획';
          const planMenu = document.querySelector('.nav-dropdown-item[data-parent-tab="tab-receiver-plan"]')?.closest('.nav-dropdown-menu');
          if (planMenu) {
            planMenu.querySelectorAll('.nav-dropdown-item').forEach(el => el.classList.remove('active'));
            planMenu.querySelector('.nav-dropdown-item[data-parent-tab="tab-receiver-plan"]')?.classList.add('active');
          }
        } else if (savedTab === 'tab-cert-settlement') {
          const cChip = document.getElementById('chip-cert-mode');
          if (cChip) cChip.textContent = '검정정산';
          const certMenu = document.querySelector('.nav-dropdown-item[data-parent-tab="tab-cert-settlement"]')?.closest('.nav-dropdown-menu');
          if (certMenu) {
            certMenu.querySelectorAll('.nav-dropdown-item').forEach(el => el.classList.remove('active'));
            certMenu.querySelector('.nav-dropdown-item[data-parent-tab="tab-cert-settlement"]')?.classList.add('active');
          }
        }
      }
    } catch (e) { /* ignore */ }

    loadLocalReceiverPlanData();
    loadLocalCertData();
    loadLocalPlanData();
    initEventListeners();
    initReceiverPlanEvents();
    initCertSettlementEvents();
    initAttendanceModule();
    initWorkGroupModalEvents();
    initAuthModule();
    initReportTemplateModule();
    initAdminDataManagement();
    initBottomStatusBar();
    initGlobalCustomDropdowns();
    startClock();
    if (savedTabToRestore) {
      activateTab(savedTabToRestore);
    }
    initFirebase();

    // 생산일보 미작성 일자 드롭다운 이벤트
    const missingWrap = document.getElementById('prod-missing-dropdown-wrap');
    const missingBtn = document.getElementById('btn-prod-missing-days');
    const missingPop = document.getElementById('prod-missing-popover');
    if (missingWrap && missingBtn && missingPop) {
      missingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = missingPop.style.display !== 'none';
        if (!isOpen && typeof renderProdMissingDropdown === 'function') {
          renderProdMissingDropdown();
        }
        missingPop.style.display = isOpen ? 'none' : 'flex';
      });

      missingPop.addEventListener('click', async (e) => {
        const itemBtn = e.target.closest('[data-missing-date]');
        if (!itemBtn) return;
        const ds = itemBtn.dataset.missingDate;
        missingPop.style.display = 'none';
        if (!ds) return;
        state.productionDate = ds;
        localStorage.setItem(STORAGE_KEYS.LAST_PROD_DATE, ds);
        const dateInput = document.getElementById('production-date');
        if (dateInput) dateInput.value = ds;
        await loadProductionDataFromDb(ds);
        await loadDailyV2FromDb(ds);
        renderProductionTable();
      });

      document.addEventListener('click', (e) => {
        if (!missingWrap.contains(e.target)) {
          missingPop.style.display = 'none';
        }
      });
    }
  });

})();
