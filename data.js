// ---------- NEWSHOT 공유 뉴스 DB ----------
// 여러 페이지 (index / keyword / calendar)에서 공통으로 사용
window.NEWS_DB = [
  {
    id: 'n1',
    category: 'IT',
    source: '테크크런치',
    time: '1시간 전',
    title: 'OpenAI, GPT-5 출시 임박… 추론 능력 2배 향상 예고',
    summary: [
      'OpenAI가 차세대 모델 GPT-5를 6월 공개 예정이라고 발표.',
      '기존 모델 대비 복합 추론 성능이 약 2배 향상된 것으로 벤치마크.',
      '기업용 API 가격은 동결, 무료 사용자에게도 일부 기능 개방.'
    ],
    chips: ['#AI', '#OpenAI', '#GPT5']
  },
  {
    id: 'n2',
    category: '경제',
    source: '한국경제',
    time: '2시간 전',
    title: 'SK하이닉스, HBM4 양산 돌입… 엔비디아 단독 공급 유력',
    summary: [
      'SK하이닉스가 차세대 HBM4 메모리 양산 라인을 공식 가동.',
      '엔비디아 차기 GPU 아키텍처에 단독 공급될 가능성이 높음.',
      '업계는 2026년 HBM 시장 점유율 60% 돌파를 전망.'
    ],
    chips: ['#반도체', '#HBM4', '#엔비디아']
  },
  {
    id: 'n3',
    category: '부동산',
    source: '매일경제',
    time: '3시간 전',
    title: '서울 아파트 전셋값, 10주 연속 상승… "공급 부족이 원인"',
    summary: [
      '서울 아파트 전셋값이 10주째 상승세를 이어감.',
      '입주 물량 감소와 금리 인하 기대감이 맞물린 결과로 분석.',
      '전문가들은 하반기 전세 가격 추가 상승을 예상.'
    ],
    chips: ['#부동산', '#전세', '#서울']
  },
  {
    id: 'n4',
    category: 'IT',
    source: '블룸버그',
    time: '4시간 전',
    title: 'Google, 제미나이 2.5 울트라 공개… GPT-5 견제구',
    summary: [
      '구글이 차세대 AI 모델 제미나이 2.5 울트라를 발표.',
      'OpenAI GPT-5 출시 전에 선제적 공개로 시장 선점 전략.',
      '기업용 Workspace에 기본 탑재 예정, 유료 전환 유도.'
    ],
    chips: ['#AI', '#Google', '#제미나이']
  },
  {
    id: 'n5',
    category: 'IT',
    source: '연합뉴스',
    time: '5시간 전',
    title: 'Microsoft, OpenAI 추가 투자 100억 달러 검토',
    summary: [
      'MS가 OpenAI와 추가 투자 협상 중임이 확인됨.',
      '클라우드 독점 공급 연장 조건이 핵심 쟁점.',
      'GPT-5 학습 인프라 전용 데이터센터 확보가 목표.'
    ],
    chips: ['#AI', '#OpenAI', '#MS', '#GPT5']
  },
  {
    id: 'n6',
    category: '경제',
    source: '조선비즈',
    time: '6시간 전',
    title: '삼성전자, 1분기 영업이익 9.3조… HBM이 효자',
    summary: [
      '삼성전자가 1분기 영업이익 9.3조 원으로 어닝 서프라이즈.',
      '반도체 부문이 전체 영업이익의 70% 차지.',
      'HBM 매출 호조가 실적 견인한 것으로 분석.'
    ],
    chips: ['#반도체', '#삼성전자', '#실적', '#HBM4']
  },
  {
    id: 'n7',
    category: '경제',
    source: '한겨레',
    time: '8시간 전',
    title: '한국은행 기준금리 2.75% 동결… 5회 연속',
    summary: [
      '한은 금통위가 기준금리를 2.75%로 5회 연속 동결.',
      '물가 안정세 확인 후 인하 시점을 저울질 중.',
      '하반기 2차례 인하 가능성이 시장에 반영.'
    ],
    chips: ['#금리', '#한은', '#금리인하']
  },
  {
    id: 'n8',
    category: '부동산',
    source: '머니투데이',
    time: '10시간 전',
    title: '강남 3구 재건축 수주전 과열… 시공사 출혈경쟁',
    summary: [
      '강남·서초·송파 재건축 단지 수주전에 대형 건설사 출혈경쟁.',
      '무이자 이주비, 분담금 환급 등 파격 조건 속출.',
      '업계에서는 과도한 경쟁이 분양가 상승으로 이어질 우려.'
    ],
    chips: ['#부동산', '#재건축', '#서울']
  },
  {
    id: 'n9',
    category: '사회',
    source: 'KBS뉴스',
    time: '12시간 전',
    title: 'AI 기본법 국회 본회의 통과… 2027년 시행',
    summary: [
      'AI 기본법이 국회 본회의를 통과.',
      '생성형 AI 표시 의무, 고위험 AI 영향평가 제도 도입.',
      '2027년 1월 본격 시행 예정.'
    ],
    chips: ['#AI', '#AI규제', '#정책']
  },
  {
    id: 'n10',
    category: 'IT',
    source: '더버지',
    time: '13시간 전',
    title: 'Apple, M5 칩 탑재 맥북 프로 공개',
    summary: [
      '애플이 신형 M5 칩 탑재 맥북 프로 라인업 발표.',
      '신경망 엔진 성능 3배 향상으로 AI 연산 최적화.',
      '온디바이스 AI 기능 강화, 클라우드 의존도 축소.'
    ],
    chips: ['#AI', '#Apple', '#M5']
  },
  {
    id: 'n11',
    category: '스포츠',
    source: '스포츠조선',
    time: '15시간 전',
    title: '손흥민 시즌 20호골… 토트넘 챔스 진출 유력',
    summary: [
      '손흥민이 프리미어리그 시즌 20호골을 기록.',
      '득점 순위 3위로 올라섰고, 커리어 하이 페이스.',
      '토트넘의 챔피언스리그 진출 가능성이 크게 높아짐.'
    ],
    chips: ['#손흥민', '#EPL', '#토트넘']
  },
  {
    id: 'n12',
    category: '경제',
    source: '이데일리',
    time: '18시간 전',
    title: '美 3월 CPI 3.1% 상승… 금리 인하 기대 후퇴',
    summary: [
      '미국 3월 소비자물가지수가 예상치를 웃도는 3.1% 상승.',
      '연준 6월 금리 인하 기대감이 후퇴한 분위기.',
      '원/달러 환율이 달러 강세 영향으로 급등.'
    ],
    chips: ['#금리', '#환율', '#미국경제', '#금리인하']
  }
];

// ---------- TOP3 키워드 (홈 하단) ----------
window.KEYWORD_TOP = [
  { rank: 1, tag: 'GPT-5', mentions: '12,430건', trend: '+248%' },
  { rank: 2, tag: 'HBM4', mentions: '8,720건', trend: '+156%' },
  { rank: 3, tag: '금리인하', mentions: '6,310건', trend: '+89%' }
];

// ---------- 키워드 정규화 (해시태그/영문/한글 모두 같은 키로) ----------
window.normalizeTag = function(raw) {
  return String(raw || '').replace('#', '').replace(/-/g, '').toLowerCase();
};

// ---------- 특정 태그로 기사 필터 ----------
window.getArticlesByTag = function(rawTag) {
  const target = window.normalizeTag(rawTag);
  return window.NEWS_DB.filter(n =>
    (n.chips || []).some(c => window.normalizeTag(c) === target)
  );
};

// ---------- 카테고리별 카드 배경 ----------
window.CATEGORY_GRADIENTS = {
  'IT':   { bg: 'linear-gradient(135deg,#0d1b3e,#1e3a6e)', icon: '💻', color: '#8fb4ff' },
  '경제':  { bg: 'linear-gradient(135deg,#1a1000,#3d2800)', icon: '📈', color: '#ffc570' },
  '부동산': { bg: 'linear-gradient(135deg,#0f0820,#241452)', icon: '🏢', color: '#b89dff' },
  '사회':  { bg: 'linear-gradient(135deg,#1a0500,#3d1000)', icon: '🗞️', color: '#ff8d73' },
  '스포츠': { bg: 'linear-gradient(135deg,#001008,#002a18)', icon: '⚽', color: '#6de0a2' },
  'default':{ bg: 'linear-gradient(135deg,#0d0d1a,#1a1a2e)', icon: '📰', color: 'var(--accent)' },
};

// ---------- 카드 HTML 생성 (홈·키워드 공용) ----------
window.buildNewsCard = function(n, i, liked) {
  const g = window.CATEGORY_GRADIENTS[n.category] || window.CATEGORY_GRADIENTS['default'];
  const chips = (n.chips || []).map(c =>
    `<a class="chip chip-link" href="keyword.html?tag=${encodeURIComponent(c.replace('#',''))}">${c}</a>`
  ).join('');
  return `
  <div class="news-card-wrapper">
    <article class="news-card" data-idx="${i}" data-id="${n.id}">
      <div class="card-front">
        <div class="news-meta">
          <span class="category-tag">${n.category}</span>
          <span class="source">${n.source}</span>
          <span class="dot"></span>
          <span class="time">${n.time}</span>
        </div>
        <h3 class="news-title">${n.title}</h3>
        <ul class="news-summary">${n.summary.map(s => `<li>${s}</li>`).join('')}</ul>
        <div class="news-footer">
          <div class="chips">${chips}</div>
          <button class="like-btn${liked ? ' active' : ''}" data-idx="${i}" aria-label="좋아요">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
              <path d="M7 22V11"/><path d="M5 11h2v11H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/>
              <path d="M7 11V7a4 4 0 0 1 4-4l1 4v4h6.5a2.5 2.5 0 0 1 2.45 3l-1.5 7a2.5 2.5 0 0 1-2.45 2H7"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="card-back">
        <div class="card-img" style="background:${g.bg}">
          <span class="card-img-icon">${g.icon}</span>
          <span class="card-img-cat" style="color:${g.color}">${n.category}</span>
          <button class="card-close" aria-label="닫기">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="card-body">
          <h3 class="card-back-title">${n.title}</h3>
          <ul class="card-back-list">${n.summary.map(s => `<li>${s}</li>`).join('')}</ul>
          <div class="card-back-meta">
            <span class="source">${n.source}</span><span class="dot"></span><span class="time">${n.time}</span>
          </div>
          <div class="chips" style="margin-top:6px">${chips}</div>
          <p class="card-tap-hint">탭하여 닫기</p>
        </div>
      </div>
    </article>
  </div>`;
};

// ---------- 카드 플립 이벤트 바인딩 ----------
window.bindCardFlip = function(container) {
  container.querySelectorAll('.news-card').forEach(card => {
    const front = card.querySelector('.card-front');
    const back  = card.querySelector('.card-back');

    // 열기 — 뒷면 높이 측정 후 카드 확장
    const openCard = () => {
      // 잠시 position:relative / transform:none 으로 되돌려 scrollHeight 측정
      // (동기 연산이므로 화면에 플래시 없음)
      back.style.cssText = 'position:relative;transform:none;visibility:hidden';
      const backH = back.scrollHeight;
      back.style.cssText = '';            // 인라인 스타일 초기화 → CSS 클래스 복원
      card.style.minHeight = Math.max(backH, front.offsetHeight) + 'px';
      card.classList.add('flipped');
    };

    // 닫기 — 카드 앞면으로 복귀
    const closeCard = (e) => {
      if (e) e.stopPropagation();
      card.classList.remove('flipped');
      card.style.minHeight = '';          // CSS 기본값(240px)으로 트랜지션
    };

    // 앞면 클릭 → 열기
    front.addEventListener('click', e => {
      if (e.target.closest('.like-btn') || e.target.closest('.chip-link')) return;
      openCard();
    });

    // X 버튼 or 뒷면 탭 → 닫기
    back.querySelector('.card-close').addEventListener('click', closeCard);
    back.addEventListener('click', e => {
      if (e.target.closest('.chip-link') || e.target.closest('.card-close')) return;
      closeCard(e);
    });
  });
};

// ---------- 관련 키워드 추출 (같은 기사에 함께 등장하는 chip) ----------
window.getRelatedTags = function(rawTag, limit = 6) {
  const target = window.normalizeTag(rawTag);
  const related = {};
  window.NEWS_DB.forEach(n => {
    const chips = n.chips || [];
    if (chips.some(c => window.normalizeTag(c) === target)) {
      chips.forEach(c => {
        const key = window.normalizeTag(c);
        if (key !== target) related[c] = (related[c] || 0) + 1;
      });
    }
  });
  return Object.entries(related)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([chip]) => chip);
};
