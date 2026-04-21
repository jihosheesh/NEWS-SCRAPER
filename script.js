// ---------- 관심 키워드 ----------
const KEYWORDS_KEY = 'newshot_user_keywords';
const DEFAULT_KEYWORDS = ['AI', '반도체', '부동산', '스타트업'];

function loadUserKeywords() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYWORDS_KEY));
    return Array.isArray(saved) && saved.length ? saved : [...DEFAULT_KEYWORDS];
  } catch { return [...DEFAULT_KEYWORDS]; }
}

// true = 키워드 일치 기사 없어서 최신 뉴스로 폴백 중
let _kwFallback = false;

function getPersonalizedNews() {
  const kws = loadUserKeywords();
  const normalizedKws = kws.map(k => window.normalizeTag(k));

  const filtered = window.NEWS_DB.filter(n => {
    // ① 칩(chip) 매칭 — CHIP_KW에 등록된 키워드
    const chips = (n.chips || []).map(c => window.normalizeTag(c));
    if (normalizedKws.some(kw => chips.includes(kw))) return true;

    // ② 텍스트 매칭 — 직접 입력 키워드를 제목·요약에서 검색
    const text = (n.title + ' ' + (Array.isArray(n.summary) ? n.summary.join(' ') : '')).toLowerCase();
    return kws.some(kw => text.includes(kw.toLowerCase()));
  });

  if (filtered.length > 0) {
    _kwFallback = false;
    return filtered.slice(0, 5);
  }
  // 키워드 일치 기사 없음 → 최신 뉴스 폴백 (빈 화면 방지)
  _kwFallback = true;
  return [...window.NEWS_DB].slice(0, 5);
}

// ---------- localStorage ----------
const INTEREST_KEY = 'newshot_interests';
const LOG_KEY = 'newshot_activity_log';

function loadInterests() {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY)) || {}; }
  catch { return {}; }
}
function saveInterests(obj) {
  localStorage.setItem(INTEREST_KEY, JSON.stringify(obj));
}
function logActivity(entry) {
  const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  log.push({ ...entry, at: new Date().toISOString() });
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-200)));
}
function bumpKeywordScores(chips, delta) {
  const map = JSON.parse(localStorage.getItem('newshot_kw_scores') || '{}');
  chips.forEach(c => {
    const key = c.replace(/#/g, '').toLowerCase();
    map[key] = (map[key] || 0) + delta;
  });
  localStorage.setItem('newshot_kw_scores', JSON.stringify(map));
}

let interests = loadInterests();

// ---------- 뉴스 렌더 ----------
let currentNewsData = getPersonalizedNews();
let showingAll = false;

function renderNews() {
  const list = document.getElementById('newsList');

  // 키워드 불일치 폴백 상태 — 카드 위에 작은 배너만 표시
  const banner = (!showingAll && _kwFallback)
    ? `<div class="kw-fallback-banner">
        <span>🔍 관심 키워드 최신 기사가 없어 전체 최신 뉴스를 표시합니다.</span>
        <a href="settings.html" class="kw-fallback-edit">키워드 편집</a>
       </div>`
    : '';

  list.innerHTML = banner + currentNewsData.map((n, i) =>
    window.buildNewsCard(n, i, !!interests[n.id])
  ).join('');

  // 카드 플립
  window.bindCardFlip(list);

  // 좋아요 — 카드 재렌더 없이 버튼 상태만 업데이트
  list.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const news = currentNewsData[+btn.dataset.idx];
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
      logActivity({ action: 'view', newsId: news.id, category: news.category, chips: news.chips });
    });
  });
}

// ---------- 전체보기 토글 ----------
function initViewAllBtn() {
  const btn = document.getElementById('viewAllBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    showingAll = !showingAll;
    currentNewsData = showingAll ? [...window.NEWS_DB] : getPersonalizedNews();
    btn.textContent = showingAll ? '접기' : '전체보기';
    renderNews();
  });
}

// ---------- TOP3 키워드 ----------
function renderKeywords() {
  const grid = document.getElementById('keywordGrid');
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
  el.innerHTML = `
    <div class="kw-sub-row">
      <div class="kw-sub-chips">
        ${kws.map(k => `<span class="kw-sub-chip">${k}</span>`).join('')}
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

// ---------- 초기화 ----------
renderNews();
renderKeywords();
renderKeywordSub();
initViewAllBtn();
