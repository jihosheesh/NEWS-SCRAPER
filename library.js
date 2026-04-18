// ---------- 저장된 관심 기사 읽기 ----------
const INTEREST_KEY = 'newshot_interests';

function loadInterests() {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY)) || {}; }
  catch { return {}; }
}
function saveInterests(obj) {
  localStorage.setItem(INTEREST_KEY, JSON.stringify(obj));
}

let interests = loadInterests();
let activeFilter = 'all';

// ---------- 카테고리 순서 (중요도 높은 순 유지) ----------
const CATEGORY_ORDER = ['IT', '경제', '사회', '부동산', '스포츠'];

// ---------- 상대 시각 ----------
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전 저장`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전 저장`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}일 전 저장`;
  return `${Math.floor(d / 30)}개월 전 저장`;
}

// ---------- AI 카테고리 분류 (저장 안된 옛 데이터 대비) ----------
// chips 기반으로 카테고리 추정 — 실제 서비스에선 분류 모델이 담당
const KEYWORD_CATEGORY_MAP = {
  ai: 'IT', openai: 'IT', gpt5: 'IT', 반도체: 'IT', hbm4: 'IT', 엔비디아: 'IT', apple: 'IT', m5: 'IT',
  금리: '경제', 환율: '경제', 실적: '경제', 삼성전자: '경제', 한은: '경제', 미국경제: '경제',
  부동산: '부동산', 전세: '부동산', 서울: '부동산',
  ai규제: '사회', 정책: '사회', 교육: '사회', 사회: '사회',
  손흥민: '스포츠', epl: '스포츠', kbo: '스포츠', 야구: '스포츠'
};
function inferCategory(article) {
  if (article.category) return article.category;
  for (const chip of (article.chips || [])) {
    const key = chip.replace('#', '').toLowerCase();
    if (KEYWORD_CATEGORY_MAP[key]) return KEYWORD_CATEGORY_MAP[key];
  }
  return '기타';
}

// ---------- 렌더링 ----------
function renderStats() {
  const items = Object.values(interests);
  const byCat = {};
  items.forEach(a => {
    const c = inferCategory(a);
    byCat[c] = (byCat[c] || 0) + 1;
  });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  const thisWeek = items.filter(a => Date.now() - a.at < 7 * 24 * 60 * 60 * 1000).length;

  document.getElementById('libStats').innerHTML = `
    <div class="stat-card">
      <div class="num">${items.length}</div>
      <div class="label">저장한 기사</div>
    </div>
    <div class="stat-card">
      <div class="num">${Object.keys(byCat).length}</div>
      <div class="label">카테고리</div>
    </div>
    <div class="stat-card">
      <div class="num">${thisWeek}</div>
      <div class="label">최근 7일</div>
    </div>
  `;

  if (topCat) {
    document.getElementById('libSub').innerHTML =
      `총 <b>${items.length}건</b>, 이번 주는 <b>${topCat[0]}</b> 분야에 가장 많이 반응했어요.`;
  }
}

function renderFilter() {
  const items = Object.values(interests);
  const countByCat = { all: items.length };
  items.forEach(a => {
    const c = inferCategory(a);
    countByCat[c] = (countByCat[c] || 0) + 1;
  });

  const cats = ['all', ...CATEGORY_ORDER.filter(c => countByCat[c])];
  if (countByCat['기타']) cats.push('기타');

  document.getElementById('filterRow').innerHTML = cats.map(c => `
    <button class="filter-chip ${activeFilter === c ? 'active' : ''}" data-cat="${c}">
      ${c === 'all' ? '전체' : c}
      <span class="cnt">${countByCat[c] || 0}</span>
    </button>
  `).join('');

  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.cat;
      renderFilter();
      renderContent();
    });
  });
}

function renderContent() {
  const items = Object.values(interests);
  const content = document.getElementById('libContent');

  if (!items.length) {
    content.innerHTML = `
      <div class="lib-empty">
        <div class="emoji">📚</div>
        <h3>아직 저장한 기사가 없어요</h3>
        <p>홈에서 👍 버튼을 누른 기사들이<br/>AI가 장르별로 자동 분류해 모아드려요.</p>
        <a href="index.html" class="go-home-btn">기사 보러가기</a>
      </div>
    `;
    return;
  }

  // 카테고리별 그룹화
  const grouped = {};
  items.forEach(a => {
    const c = inferCategory(a);
    (grouped[c] = grouped[c] || []).push(a);
  });

  // 각 그룹 내 최신순 정렬
  Object.values(grouped).forEach(arr => arr.sort((a, b) => b.at - a.at));

  // 표시 순서 (전체 필터일 때)
  const showCats = activeFilter === 'all'
    ? [...CATEGORY_ORDER, '기타'].filter(c => grouped[c])
    : [activeFilter].filter(c => grouped[c]);

  if (!showCats.length) {
    content.innerHTML = `<div class="lib-empty"><div class="emoji">🔍</div><h3>이 카테고리에는 저장된 기사가 없어요</h3></div>`;
    return;
  }

  content.innerHTML = showCats.map(cat => `
    <section class="cat-section" data-cat="${cat}">
      <div class="cat-header">
        <span class="cat-dot"></span>
        <span class="cat-title">${cat}</span>
        <span class="cat-count">${grouped[cat].length}건</span>
      </div>
      <div class="cat-articles">
        ${grouped[cat].map(a => renderCard(a)).join('')}
      </div>
    </section>
  `).join('');

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      delete interests[id];
      saveInterests(interests);
      renderStats();
      renderFilter();
      renderContent();
    });
  });

  // 해시태그 링크가 카드 클릭/삭제로 전파되지 않게
  document.querySelectorAll('.lib-chip.chip-link').forEach(chip => {
    chip.addEventListener('click', e => e.stopPropagation());
  });
}

function renderCard(a) {
  const oneline = Array.isArray(a.summary) ? (a.summary[0] || '') : (a.summary || '');
  return `
    <article class="lib-card" data-id="${a.id}">
      <div class="lib-meta">
        <span class="source">${a.source || '출처 미상'}</span>
        <span class="dot"></span>
        <span class="saved-at">${timeAgo(a.at)}</span>
      </div>
      <h4 class="lib-title">${a.title}</h4>
      <p class="lib-oneline">${oneline}</p>
      <div class="lib-footer">
        <div class="lib-chips">
          ${(a.chips || []).map(c => `<a class="lib-chip chip-link" href="keyword.html?tag=${encodeURIComponent(c.replace('#',''))}">${c}</a>`).join('')}
        </div>
        <button class="remove-btn" data-id="${a.id}" aria-label="보관함에서 삭제">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </article>
  `;
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
renderStats();
renderFilter();
renderContent();
