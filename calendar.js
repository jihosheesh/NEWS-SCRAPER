// ---------- 관심사 불러오기 ----------
function getKwScores() {
  try { return JSON.parse(localStorage.getItem('newshot_kw_scores') || '{}'); }
  catch { return {}; }
}

// ---------- 이슈 데이터 — NEWS_DB에서 동적 생성 ----------
function relTimeToDate(timeStr) {
  const now = new Date();
  if (!timeStr || timeStr === '방금 전') return new Date(now);
  const m = timeStr.match(/(\d+)분 전/);   if (m) { const d = new Date(now); d.setMinutes(d.getMinutes() - +m[1]); return d; }
  const h = timeStr.match(/(\d+)시간 전/); if (h) { const d = new Date(now); d.setHours(d.getHours() - +h[1]);     return d; }
  const dy = timeStr.match(/(\d+)일 전/);  if (dy){ const d = new Date(now); d.setDate(d.getDate() - +dy[1]);       return d; }
  return new Date(now);
}

function buildIssueData() {
  const result = {};
  (window.NEWS_DB || []).forEach(article => {
    const date = relTimeToDate(article.time);
    const key  = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    if (!result[key]) result[key] = [];
    const summary = Array.isArray(article.summary) ? article.summary[0] || '' : article.summary || '';
    result[key].push({
      category: article.category || '기타',
      title:    article.title,
      summary,
      chips:    article.chips || [],
      url:      article.url || '',
    });
  });
  return result;
}

const issueData = buildIssueData();

// ---------- 상태 ----------
const _now = new Date();
let viewDate = new Date(_now.getFullYear(), _now.getMonth(), 1); // 현재 월
let activeFilter = 'all';

const CATEGORIES = ['all', 'IT', '경제', '사회', '부동산', '스포츠'];
const CAT_LABEL = { all: '전체', IT: 'IT', '경제': '경제', '사회': '사회', '부동산': '부동산', '스포츠': '스포츠' };

// ---------- 렌더: 필터 ----------
function renderFilter() {
  const row = document.getElementById('filterRow');
  row.innerHTML = CATEGORIES.map(c => `
    <button class="filter-chip ${activeFilter === c ? 'active' : ''}" data-cat="${c}">
      ${CAT_LABEL[c]}
    </button>
  `).join('');
  row.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.cat;
      renderFilter();
      renderGrid();
    });
  });
}

// ---------- 유틸 ----------
function fmtKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function filteredIssues(key) {
  const items = issueData[key] || [];
  return activeFilter === 'all' ? items : items.filter(i => i.category === activeFilter);
}

// ---------- 렌더: 주차별 이슈 목록 ----------
function renderGrid() {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  document.getElementById('monthTitle').textContent = `${year}년 ${month + 1}월`;

  const lastDate = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const DOW_KO  = ['일','월','화','수','목','금','토'];
  const _t = new Date();
  const TODAY = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,'0')}-${String(_t.getDate()).padStart(2,'0')}`;

  // 주차 배열 계산 (일~토 기준)
  const weeks = [];
  let week = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= lastDate; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push([...week]); week = []; }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push([...week]);
  }

  let html = '';
  let hasAny = false;

  weeks.forEach((wk, wi) => {
    // 이슈 있는 날짜만 추출
    const days = wk
      .filter(d => d !== null)
      .map(d => ({ d, key: fmtKey(year, month, d), dow: new Date(year, month, d).getDay() }))
      .map(o  => ({ ...o, issues: filteredIssues(o.key) }))
      .filter(o => o.issues.length > 0);

    if (!days.length) return;
    hasAny = true;

    const validDays = wk.filter(d => d !== null);
    const fd = validDays[0], ld = validDays[validDays.length - 1];
    const fdow = new Date(year, month, fd).getDay();
    const ldow = new Date(year, month, ld).getDay();
    const total = days.reduce((s, o) => s + o.issues.length, 0);

    html += `
      <div class="week-section">
        <div class="week-header">
          <div class="week-title">
            <span class="week-label">${wi + 1}주차</span>
            <span class="week-range">${month+1}/${fd}(${DOW_KO[fdow]}) – ${month+1}/${ld}(${DOW_KO[ldow]})</span>
          </div>
          <span class="week-badge">${total}건</span>
        </div>
        <div class="week-days">`;

    days.forEach(({ d, key, dow, issues }) => {
      const isSun = dow === 0, isSat = dow === 6;
      const isToday = key === TODAY;
      html += `
          <div class="week-day-row${isToday ? ' today' : ''}">
            <div class="week-date-col">
              <span class="week-date${isSun?' sun':isSat?' sat':''}">${d}</span>
              <span class="week-dow${isSun?' sun':isSat?' sat':''}">${DOW_KO[dow]}</span>
              ${isToday ? '<span class="today-dot"></span>' : ''}
            </div>
            <div class="week-issues-col">`;

      issues.forEach(issue => {
        const chips = issue.chips.map(c =>
          `<a class="mini-chip chip-link" href="keyword.html?tag=${encodeURIComponent(c.replace('#',''))}">${c}</a>`
        ).join('');
        html += `
              <div class="week-issue-card">
                <div class="week-issue-head">
                  <span class="week-cat cat-${issue.category}">${issue.category}</span>
                  <div class="week-chips">${chips}</div>
                </div>
                <div class="week-issue-title">${issue.url ? `<a href="${issue.url}" target="_blank" rel="noopener">${issue.title}</a>` : issue.title}</div>
                <div class="week-issue-summary">${issue.summary}</div>
              </div>`;
      });

      html += `
            </div>
          </div>`;
    });

    html += `
        </div>
      </div>`;
  });

  if (!hasAny) {
    html = `<div class="week-no-data">
      <span class="wnd-emoji">📭</span>
      <p>이 달에는 해당 카테고리의 이슈가 없어요.</p>
    </div>`;
  }

  document.getElementById('calGrid').innerHTML = html;
}

// ---------- 개인화: 관심 키워드 요약 ----------
function renderHeroSub() {
  const scores = getKwScores();
  const top = Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => `#${k}`);
  const sub = top.length
    ? `내 관심 키워드 ${top.join(' · ')} 기준으로 재구성`
    : `내 관심사 기준, AI가 추출한 이슈 흐름`;
  document.getElementById('heroSub').textContent = sub;
}

// ---------- 월 이동 ----------
document.getElementById('prevMonth').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderGrid();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderGrid();
});

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
renderFilter();
renderGrid();
renderHeroSub();
