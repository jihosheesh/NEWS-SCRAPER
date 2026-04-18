// ---------- 관심 키워드 ----------
const KEYWORDS_KEY = 'newshot_user_keywords';
const DEFAULT_KEYWORDS = ['AI', '반도체', '부동산', '스타트업'];

function loadUserKeywords() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYWORDS_KEY));
    return Array.isArray(saved) && saved.length ? saved : [...DEFAULT_KEYWORDS];
  } catch { return [...DEFAULT_KEYWORDS]; }
}

function getPersonalizedNews() {
  const kws = loadUserKeywords().map(k => window.normalizeTag(k));
  const filtered = window.NEWS_DB.filter(n =>
    (n.chips || []).some(c => kws.includes(window.normalizeTag(c)))
  );
  return (filtered.length ? filtered : window.NEWS_DB).slice(0, 5);
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
    const key = c.replace('#', '').toLowerCase();
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
  list.innerHTML = currentNewsData.map((n, i) =>
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
    currentNewsData = showingAll ? window.NEWS_DB : getPersonalizedNews();
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
  el.innerHTML = `내가 설정한 키워드: ${kws.map(k => `<b>${k}</b>`).join(' · ')} · <a href="settings.html" class="kw-edit-link">편집</a>`;
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
