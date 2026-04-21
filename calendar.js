// ---------- 관심사 불러오기 ----------
function getKwScores() {
  try { return JSON.parse(localStorage.getItem('newshot_kw_scores') || '{}'); }
  catch { return {}; }
}

// ---------- 이슈 더미 데이터 (날짜별) ----------
// 실제로는 AI가 각 날짜의 기사를 분석해서 이슈 단위로 묶어주는 데이터
const issueData = {
  '2026-04-01': [
    { category: 'IT', title: 'MS, OpenAI와 추가 투자 협상', summary: '클라우드 독점 공급 연장을 두고 100억 달러 규모의 추가 투자를 논의 중. GPT-5 학습 인프라 확보가 핵심 쟁점.', chips: ['#AI', '#MS', '#OpenAI'] },
    { category: '경제', title: '美 3월 CPI 3.1% 상승', summary: '예상치 상회. 연준 6월 금리 인하 기대감 후퇴. 달러 강세로 원/달러 환율 급등.', chips: ['#금리', '#환율', '#미국경제'] }
  ],
  '2026-04-05': [
    { category: '부동산', title: '서울 전셋값 9주 연속 상승', summary: '강남 3구 중심으로 상승폭 확대. 입주 물량 감소가 주요 원인으로 분석.', chips: ['#부동산', '#전세'] }
  ],
  '2026-04-08': [
    { category: 'IT', title: '엔비디아 차기 GPU "루빈" 공개', summary: 'HBM4 채택 확정, TSMC 2nm 공정으로 제조. 2026년 4분기 양산 예정.', chips: ['#반도체', '#엔비디아', '#HBM4'] },
    { category: '스포츠', title: '손흥민, 시즌 20호골 달성', summary: '프리미어리그 득점 순위 3위로 올라섰고, 토트넘의 챔피언스리그 진출 가능성을 높임.', chips: ['#손흥민', '#EPL'] }
  ],
  '2026-04-10': [
    { category: '사회', title: 'AI 기본법 국회 본회의 통과', summary: '생성형 AI 표시 의무, 고위험 AI 영향평가 도입. 2027년 1월 시행 예정.', chips: ['#AI규제', '#정책'] }
  ],
  '2026-04-12': [
    { category: '경제', title: '삼성전자, 1분기 영업이익 9.3조', summary: 'HBM 매출 호조로 어닝 서프라이즈. 반도체 부문이 전체 영업이익의 70% 차지.', chips: ['#삼성전자', '#반도체', '#실적'] }
  ],
  '2026-04-15': [
    { category: 'IT', title: 'OpenAI, GPT-5 출시 임박', summary: '6월 공개 예정. 추론 능력 2배 향상, 에이전트 기능 전면 강화.', chips: ['#AI', '#OpenAI', '#GPT5'] },
    { category: '경제', title: 'SK하이닉스 HBM4 양산 돌입', summary: '엔비디아 단독 공급 유력. 2026년 HBM 시장 점유율 60% 돌파 전망.', chips: ['#반도체', '#HBM4'] },
    { category: '부동산', title: '서울 전셋값 10주 연속 상승', summary: '공급 부족 지속. 하반기 추가 상승 예상.', chips: ['#부동산', '#전세'] }
  ],
  '2026-04-18': [
    { category: '사회', title: '전국 교사 1만 명 집회', summary: '교권 보호 강화 법안 통과 촉구. 교육부 후속 대책 발표 예정.', chips: ['#교육', '#사회'] }
  ],
  '2026-04-22': [
    { category: 'IT', title: 'Apple, AI 탑재 M5 칩 발표', summary: '신경망 엔진 성능 3배 향상. 맥북 프로 신제품에 먼저 탑재.', chips: ['#AI', '#Apple', '#M5'] }
  ],
  '2026-04-25': [
    { category: '경제', title: '한은 기준금리 2.75% 동결', summary: '5회 연속 동결. 물가 안정세 확인 후 인하 시점 저울질.', chips: ['#금리', '#한은'] },
    { category: '스포츠', title: 'KBO 개막 3연전 전석 매진', summary: '야구 열기 재점화. 2026 시즌 총 관중 1,000만 돌파 기대.', chips: ['#KBO', '#야구'] }
  ]
};

// ---------- 상태 ----------
let viewDate = new Date(2026, 3, 1); // 2026년 4월
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
  const TODAY   = '2026-04-15';

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
                <div class="week-issue-title">${issue.title}</div>
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
