// ---------- URL에서 태그 읽기 ----------
const params = new URLSearchParams(location.search);
const rawTag = params.get('tag') || '';

// ---------- 네비게이션 트레일 (어디→어디로 왔는지 추적) ----------
// sessionStorage에 ['AI', 'OpenAI'] 같은 방문 순서 저장
const TRAIL_KEY = 'newshot_kw_trail';
const REFERRER_KEY = 'newshot_kw_from';
function getTrail() {
  try { return JSON.parse(sessionStorage.getItem(TRAIL_KEY)) || []; }
  catch { return []; }
}
function setTrail(arr) {
  sessionStorage.setItem(TRAIL_KEY, JSON.stringify(arr));
}
// 외부 페이지(홈/라이브러리/캘린더)에서 진입한 경우 트레일 초기화
// document.referrer가 keyword.html이 아닌 경우 = 새로 시작
const fromKeywordPage = document.referrer && document.referrer.includes('keyword.html');
if (!fromKeywordPage) {
  setTrail([]);
}
function updateTrail() {
  const trail = getTrail();
  if (trail[trail.length - 1] === rawTag) return trail;
  const existIdx = trail.indexOf(rawTag);
  if (existIdx !== -1) {
    const sliced = trail.slice(0, existIdx + 1);
    setTrail(sliced);
    return sliced;
  }
  trail.push(rawTag);
  const limited = trail.slice(-6);
  setTrail(limited);
  return limited;
}
const trail = updateTrail();

// ---------- 관심 / 로그 유틸 (좋아요 동기화용) ----------
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
const interests = loadInterests();

// ---------- AI 한 줄 설명 (태그별 맞춤) ----------
// 실제 서비스에선 AI가 기사 군집을 읽고 생성
const WHY_TEXT = {
  'gpt5': '차세대 AI 경쟁의 중심축. 출시 임박으로 <b>반도체·클라우드·기업 소프트웨어</b> 전반에 연쇄 영향.',
  'ai': '생성형 AI 패러다임 전환기. 모델·규제·인프라 모두 <b>2026년 가장 뜨거운 축</b>.',
  'openai': 'GPT-5 출시, MS 추가 투자 등 <b>AI 시장 흐름을 주도</b>하는 기업 이슈.',
  '반도체': 'HBM 경쟁·AI 수요·지정학 이슈가 얽힌 <b>국내 증시 최대 변수</b>.',
  'hbm4': '엔비디아·삼성·SK하이닉스 삼각 경쟁. <b>AI 인프라 투자의 바로미터</b>.',
  '엔비디아': 'AI 반도체의 지배자. 차기 GPU 루빈·HBM4 탑재 여부가 <b>글로벌 공급망</b> 좌우.',
  '금리인하': '한은·연준의 통화정책 방향. <b>부동산·주식·환율</b> 연쇄 파급.',
  '금리': '모든 자산 가격의 기준선. <b>한미 금리 차이</b>가 환율과 외국인 수급을 좌우.',
  '부동산': '전세·재건축·금리 복합 이슈. <b>서울 중심부 수급</b>이 전국 시장을 견인.',
  '전세': '공급 부족이 지속되는 장.  <b>하반기 추가 상승</b>이 유력하다는 분석.',
  'ai규제': 'AI 기본법 시행을 앞둔 규제 환경 변화. <b>기업 컴플라이언스 대응</b> 시급.',
  '손흥민': '2026 커리어 하이 시즌. <b>토트넘 챔스 진출</b>과 국가대표 이슈 동시 진행.'
};

function getWhyText(tag) {
  const key = window.normalizeTag(tag);
  return WHY_TEXT[key] || `지금 주목받고 있는 키워드. 관련 기사 흐름을 <b>한눈에</b> 확인해보세요.`;
}

// ---------- 렌더 ----------
function render() {
  document.getElementById('kwTitle').textContent = rawTag || '키워드';

  const articles = window.getArticlesByTag(rawTag);
  const related = window.getRelatedTags(rawTag);

  // 통계
  const kwTop = (window.KEYWORD_TOP || []).find(k => window.normalizeTag(k.tag) === window.normalizeTag(rawTag));
  const statsHtml = `
    <span class="stat"><b>${articles.length}</b>건 기사</span>
    ${kwTop ? `
      <span class="divider"></span>
      <span class="stat">언급 <b>${kwTop.mentions}</b></span>
      <span class="divider"></span>
      <span class="stat trend">${kwTop.trend}</span>
    ` : ''}
  `;
  document.getElementById('kwStats').innerHTML = statsHtml;
  document.getElementById('kwWhy').innerHTML = getWhyText(rawTag);

  // 관련 키워드
  const relatedWrap = document.getElementById('kwRelatedWrap');
  if (related.length) {
    relatedWrap.style.display = '';
    document.getElementById('kwRelated').innerHTML = related.map(c =>
      `<a class="related-chip" href="keyword.html?tag=${encodeURIComponent(c.replace('#',''))}">${c}</a>`
    ).join('');
  }

  // 기사 카운트
  document.getElementById('articlesCount').textContent = `${articles.length}건`;

  // 기사 목록
  const list = document.getElementById('newsList');
  if (!articles.length) {
    list.innerHTML = `
      <div class="empty-keyword">
        <div class="emoji">🔎</div>
        <h3>이 키워드에 매칭되는 기사가 없어요</h3>
        <p>관련 키워드에서 다른 주제를 살펴보세요.</p>
      </div>
    `;
    return;
  }
  renderNews(articles);
}

function renderNews(articles) {
  const list = document.getElementById('newsList');
  list.innerHTML = articles.map((n, i) => {
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

  // 좋아요
  list.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const news = articles[+btn.dataset.idx];
      const wasLiked = !!interests[news.id];
      if (wasLiked) {
        delete interests[news.id];
        bumpKeywordScores(news.chips, -1);
        logActivity({ action: 'unlike', newsId: news.id, category: news.category, chips: news.chips });
      } else {
        interests[news.id] = {
          id: news.id, category: news.category, source: news.source, time: news.time,
          title: news.title, summary: news.summary, chips: news.chips, at: Date.now()
        };
        bumpKeywordScores(news.chips, 1);
        logActivity({ action: 'like', newsId: news.id, category: news.category, chips: news.chips });
      }
      saveInterests(interests);
      renderNews(articles);
    });
  });

  // 해시태그 링크 → 카드 클릭과 분리
  list.querySelectorAll('.chip-link').forEach(chip => {
    chip.addEventListener('click', e => e.stopPropagation());
  });

  // 카드 뷰 로그
  list.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', () => {
      const news = articles[+card.dataset.idx];
      logActivity({ action: 'view', newsId: news.id, category: news.category, chips: news.chips, from: 'keyword:' + rawTag });
    });
  });
}

// ---------- 사이드바 / 뒤로가기 ----------
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

// ---------- 브레드크럼 렌더 + 뒤로가기 ----------
function renderBreadcrumb() {
  const t = getTrail();
  const backLabel = document.getElementById('crumbBackLabel');
  const trailEl = document.getElementById('crumbTrail');

  // 뒤로가기 라벨: 바로 이전 태그가 있으면 "#이전태그로" / 없으면 "홈으로"
  if (t.length >= 2) {
    const prev = t[t.length - 2];
    backLabel.textContent = `#${prev}`;
  } else {
    backLabel.textContent = '홈으로';
  }

  // 트레일 표시: 홈 > #A > #B > #현재
  const parts = ['<a class="crumb-item" href="index.html">홈</a>'];
  t.forEach((tag, i) => {
    parts.push('<span class="crumb-sep">›</span>');
    const isLast = i === t.length - 1;
    if (isLast) {
      parts.push(`<span class="crumb-item current">#${tag}</span>`);
    } else {
      parts.push(`<a class="crumb-item" href="keyword.html?tag=${encodeURIComponent(tag)}">#${tag}</a>`);
    }
  });
  trailEl.innerHTML = parts.join('');

  // 현재 항목은 항상 보이게 스크롤
  requestAnimationFrame(() => {
    trailEl.scrollLeft = trailEl.scrollWidth;
  });
}

document.getElementById('crumbBack').addEventListener('click', () => {
  const t = getTrail();
  if (t.length >= 2) {
    const prev = t[t.length - 2];
    // 트레일에서 현재 항목 제거
    setTrail(t.slice(0, -1));
    location.href = `keyword.html?tag=${encodeURIComponent(prev)}`;
  } else {
    // 홈으로 나갈 때는 트레일 초기화
    sessionStorage.removeItem(TRAIL_KEY);
    location.href = 'index.html';
  }
});

// ---------- 초기화 ----------
renderBreadcrumb();
render();
