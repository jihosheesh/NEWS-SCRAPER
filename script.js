// ──────────────────────────────────────────────────────────────
// Cloudflare Worker API URL
// 배포 후 실제 URL로 교체: https://newshot-api.{계정명}.workers.dev
// ──────────────────────────────────────────────────────────────
const NEWSHOT_API = '';   // ← 배포 완료 후 이 곳에 Worker URL 입력

// ---------- 관심 키워드 ----------
const KEYWORDS_KEY      = 'newshot_user_keywords';
const DEFAULT_KEYWORDS  = ['AI', '반도체', '부동산', '스타트업'];

function loadUserKeywords() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYWORDS_KEY));
    return Array.isArray(saved) && saved.length ? saved : [...DEFAULT_KEYWORDS];
  } catch { return [...DEFAULT_KEYWORDS]; }
}

// ──────────────────────────────────────────────────────────────
// 로컬 필터 (data.js 기반 — 즉시 표시용 / API 폴백)
// ──────────────────────────────────────────────────────────────
let _kwFallback   = false;
let _apiLoading   = false;

function getPersonalizedNewsLocal() {
  const kws = loadUserKeywords();
  const normalizedKws = kws.map(k => window.normalizeTag(k));

  const filtered = window.NEWS_DB.filter(n => {
    // ① 칩 매칭
    const chips = (n.chips || []).map(c => window.normalizeTag(c));
    if (normalizedKws.some(kw => chips.includes(kw))) return true;
    // ② 텍스트 매칭 (직접 입력 키워드)
    const text = (n.title + ' ' + (Array.isArray(n.summary) ? n.summary.join(' ') : '')).toLowerCase();
    return kws.some(kw => text.includes(kw.toLowerCase()));
  });

  if (filtered.length > 0) { _kwFallback = false; return filtered.slice(0, 5); }
  _kwFallback = true;
  return [...window.NEWS_DB].slice(0, 5);
}

// ──────────────────────────────────────────────────────────────
// API 호출 — 사용자 키워드로 실시간 스크래핑
// ──────────────────────────────────────────────────────────────
async function fetchPersonalizedFromAPI() {
  if (!NEWSHOT_API) return null;   // URL 미설정 시 스킵

  const kws = loadUserKeywords();
  const apiUrl = `${NEWSHOT_API}/news?keywords=${encodeURIComponent(kws.join(','))}`;

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.articles) && data.articles.length ? data.articles : null;
  } catch (e) {
    console.warn('[NEWSHOT] API 호출 실패, 로컬 데이터 사용:', e.message);
    return null;
  }
}

// ---------- localStorage ----------
const INTEREST_KEY = 'newshot_interests';
const LOG_KEY      = 'newshot_activity_log';

function loadInterests() {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY)) || {}; }
  catch { return {}; }
}
function saveInterests(obj) { localStorage.setItem(INTEREST_KEY, JSON.stringify(obj)); }
function logActivity(entry) {
  const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  log.push({ ...entry, at: new Date().toISOString() });
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-200)));
}
function bumpKeywordScores(chips, delta) {
  const map = JSON.parse(localStorage.getItem('newshot_kw_scores') || '{}');
  chips.forEach(c => { const k = c.replace(/#/g, '').toLowerCase(); map[k] = (map[k] || 0) + delta; });
  localStorage.setItem('newshot_kw_scores', JSON.stringify(map));
}

let interests = loadInterests();

// ---------- 뉴스 렌더 ----------
let currentNewsData = [];
let showingAll      = false;

function renderNews() {
  const list = document.getElementById('newsList');

  // 로딩 중 스피너 (API 호출 중일 때만)
  if (_apiLoading && !currentNewsData.length) {
    list.innerHTML = `<div class="api-loading"><div class="api-spinner"></div><p>키워드 맞춤 뉴스 불러오는 중…</p></div>`;
    return;
  }

  // 키워드 불일치 폴백 배너
  const banner = (!showingAll && _kwFallback)
    ? `<div class="kw-fallback-banner">
        <span>🔍 관심 키워드 최신 기사가 없어 전체 최신 뉴스를 표시합니다.</span>
        <a href="settings.html" class="kw-fallback-edit">키워드 편집</a>
       </div>`
    : '';

  list.innerHTML = banner + currentNewsData.map((n, i) =>
    window.buildNewsCard(n, i, !!interests[n.id])
  ).join('');

  window.bindCardFlip(list);

  // 좋아요
  list.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const news = currentNewsData[+btn.dataset.idx];
      if (!news) return;
      const wasLiked = !!interests[news.id];
      if (wasLiked) {
        delete interests[news.id];
        btn.classList.remove('active');
        btn.querySelector('svg').setAttribute('fill', 'none');
        bumpKeywordScores(news.chips, -1);
        logActivity({ action: 'unlike', newsId: news.id, category: news.category, chips: news.chips });
      } else {
        interests[news.id] = { ...news, at: Date.now() };
        btn.classList.add('active');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
        bumpKeywordScores(news.chips, 1);
        logActivity({ action: 'like', newsId: news.id, category: news.category, chips: news.chips });
      }
      saveInterests(interests);
    });
  });

  // 조회 로그
  list.querySelectorAll('.news-card').forEach(card => {
    card.querySelector('.card-front').addEventListener('click', e => {
      if (e.target.closest('.like-btn') || e.target.closest('.chip-link')) return;
      const news = currentNewsData[+card.dataset.idx];
      if (news) logActivity({ action: 'view', newsId: news.id, category: news.category, chips: news.chips });
    });
  });
}

// ---------- 전체보기 토글 ----------
function initViewAllBtn() {
  const btn = document.getElementById('viewAllBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    showingAll = !showingAll;
    currentNewsData = showingAll ? [...window.NEWS_DB] : getPersonalizedNewsLocal();
    _kwFallback = false;
    btn.textContent = showingAll ? '접기' : '전체보기';
    renderNews();
  });
}

// ---------- TOP3 키워드 ----------
function renderKeywords() {
  const grid = document.getElementById('keywordGrid');
  if (!grid) return;
  grid.innerHTML = window.KEYWORD_TOP.map(k => `
    <a class="keyword-card" href="keyword.html?tag=${encodeURIComponent(k.tag)}" data-tag="${k.tag}">
      <span class="rank">${k.rank}</span>
      <div class="kw-body">
        <div class="kw-tag">${k.tag}</div>
        <div class="kw-meta">언급 ${k.mentions} · <span class="trend-up">${k.trend}</span></div>
      </div>
      <svg class="kw-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
  `).join('');
}

// ---------- 관심 키워드 헤더 ----------
function renderKeywordSub() {
  const el = document.getElementById('kwSub');
  if (!el) return;
  const kws = loadUserKeywords();
  // API 사용 중이면 "실시간" 뱃지 표시
  const badge = NEWSHOT_API
    ? `<span class="kw-realtime-badge">실시간</span>`
    : '';
  el.innerHTML = `
    <div class="kw-sub-row">
      <div class="kw-sub-chips">
        ${kws.map(k => `<span class="kw-sub-chip">${k}</span>`).join('')}
        ${badge}
      </div>
      <a href="settings.html" class="kw-edit-btn">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        편집
      </a>
    </div>`;
}

// ---------- 사이드바 ----------
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
document.getElementById('openSidebar').addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('visible');
});
const closeSidebar = () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
};
document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

// ──────────────────────────────────────────────────────────────
// 초기화 — 2단계 로딩
// 1단계: data.js 로컬 데이터로 즉시 표시
// 2단계: API 응답 도착 시 개인화 데이터로 교체
// ──────────────────────────────────────────────────────────────
(async function init() {
  // 1단계: 로컬 데이터 즉시 표시
  currentNewsData = getPersonalizedNewsLocal();
  renderNews();
  renderKeywords();
  renderKeywordSub();
  initViewAllBtn();

  // 2단계: API 개인화 (NEWSHOT_API 설정된 경우만)
  if (NEWSHOT_API && !showingAll) {
    _apiLoading = true;
    const apiArticles = await fetchPersonalizedFromAPI();
    _apiLoading = false;

    if (apiArticles && !showingAll) {
      currentNewsData = apiArticles;
      _kwFallback     = false;
      renderNews();   // 개인화 데이터로 교체 렌더
      renderKeywordSub(); // 실시간 뱃지 반영
    }
  }
})();
