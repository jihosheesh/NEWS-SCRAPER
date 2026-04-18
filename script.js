// ---------- 관심 키워드 ----------
const KEYWORDS_KEY = 'newshot_user_keywords';
const DEFAULT_KEYWORDS = ['AI', '반도체', '부동산', '스타트업'];

function loadUserKeywords() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYWORDS_KEY));
    return Array.isArray(saved) && saved.length ? saved : [...DEFAULT_KEYWORDS];
  } catch { return [...DEFAULT_KEYWORDS]; }
}

// 관심 키워드에 맞는 기사 필터 (없으면 전체 상위 5건)
function getPersonalizedNews() {
  const kws = loadUserKeywords().map(k => window.normalizeTag(k));
  const filtered = window.NEWS_DB.filter(n =>
    (n.chips || []).some(c => kws.includes(window.normalizeTag(c)))
  );
  return (filtered.length ? filtered : window.NEWS_DB).slice(0, 5);
}

const newsData = getPersonalizedNews();

// ---------- 사용자 관심 로그 (localStorage 기반 학습) ----------
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
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-200))); // 최근 200개만 유지
}

// 키워드별 좋아요 카운트 → 개인화 점수로 활용
function bumpKeywordScores(chips, delta) {
  const map = JSON.parse(localStorage.getItem('newshot_kw_scores') || '{}');
  chips.forEach(c => {
    const key = c.replace('#', '').toLowerCase();
    map[key] = (map[key] || 0) + delta;
  });
  localStorage.setItem('newshot_kw_scores', JSON.stringify(map));
}

const interests = loadInterests();

// (TOP3 키워드는 data.js의 window.KEYWORD_TOP 사용)

// ---------- 렌더링 ----------
function renderNews() {
  const list = document.getElementById('newsList');
  list.innerHTML = newsData.map((n, i) => {
    const liked = !!interests[n.id];
    return `
    <article class="news-card" data-idx="${i}">
      <div class="news-meta">
        <span class="category-tag">${n.category}</span>
        <span class="source">${n.source}</span>
        <span class="dot"></span>
        <span class="time">${n.time}</span>
      </div>
      <h3 class="news-title">${n.title}</h3>
      <ul class="news-summary">
        ${n.summary.map(s => `<li>${s}</li>`).join('')}
      </ul>
      <div class="news-footer">
        <div class="chips">
          ${n.chips.map(c => `<a class="chip chip-link" href="keyword.html?tag=${encodeURIComponent(c.replace('#',''))}">${c}</a>`).join('')}
        </div>
        <button class="like-btn ${liked ? 'active' : ''}" data-idx="${i}" aria-label="좋아요">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
            <path d="M7 22V11" />
            <path d="M5 11h2v11H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
            <path d="M7 11V7a4 4 0 0 1 4-4l1 4v4h6.5a2.5 2.5 0 0 1 2.45 3l-1.5 7a2.5 2.5 0 0 1-2.45 2H7" />
          </svg>
        </button>
      </div>
    </article>
  `;
  }).join('');

  // 좋아요 버튼 이벤트
  list.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      const news = newsData[idx];
      const wasLiked = !!interests[news.id];

      if (wasLiked) {
        delete interests[news.id];
        bumpKeywordScores(news.chips, -1);
        logActivity({ action: 'unlike', newsId: news.id, category: news.category, chips: news.chips });
      } else {
        // 라이브러리에서 바로 복원할 수 있도록 기사 전체 정보를 함께 저장
        interests[news.id] = {
          id: news.id,
          category: news.category,
          source: news.source,
          time: news.time,
          title: news.title,
          summary: news.summary,
          chips: news.chips,
          at: Date.now()
        };
        bumpKeywordScores(news.chips, 1);
        logActivity({ action: 'like', newsId: news.id, category: news.category, chips: news.chips });
      }
      saveInterests(interests);
      renderNews();
    });
  });

  // 해시태그 링크는 카드 클릭과 분리
  list.querySelectorAll('.chip-link').forEach(chip => {
    chip.addEventListener('click', e => e.stopPropagation());
  });

  // 카드 클릭 → 조회 로그 (추후 스크롤/체류시간도 추가 예정)
  list.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', () => {
      const news = newsData[+card.dataset.idx];
      logActivity({ action: 'view', newsId: news.id, category: news.category, chips: news.chips });
    });
  });
}

function renderKeywords() {
  const grid = document.getElementById('keywordGrid');
  const data = window.KEYWORD_TOP;
  grid.innerHTML = data.map(k => `
    <a class="keyword-card" href="keyword.html?tag=${encodeURIComponent(k.tag)}" data-tag="${k.tag}">
      <span class="rank">${k.rank}</span>
      <div class="kw-body">
        <div class="kw-tag">${k.tag}</div>
        <div class="kw-meta">
          언급 ${k.mentions} · <span class="trend-up">${k.trend}</span>
        </div>
      </div>
      <svg class="kw-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
  `).join('');
}

// ---------- 사이드바 ----------
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
document.getElementById('openSidebar').addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('visible');
});
document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
}

// ---------- 관심 키워드 섹션 헤더 ----------
function renderKeywordSub() {
  const el = document.getElementById('kwSub');
  if (!el) return;
  const kws = loadUserKeywords();
  el.innerHTML = `내가 설정한 키워드: ${kws.map(k => `<b>${k}</b>`).join(' · ')}`;
}

// ---------- 초기화 ----------
renderNews();
renderKeywords();
renderKeywordSub();
