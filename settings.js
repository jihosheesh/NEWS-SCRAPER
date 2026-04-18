// ---------- 상수 ----------
const KEYWORDS_KEY = 'newshot_user_keywords';
const DEFAULT_KEYWORDS = ['AI', '반도체', '부동산', '스타트업'];

const SUGGESTED = [
  'AI', 'OpenAI', 'GPT-5', '반도체', 'HBM4', '엔비디아', 'Apple', 'Google',
  '금리', '환율', '부동산', '전세', '삼성전자', '스타트업', '스포츠', '손흥민',
  'AI규제', '정책', 'KBO'
];

// ---------- 저장소 ----------
function loadKeywords() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYWORDS_KEY));
    return Array.isArray(saved) && saved.length ? saved : [...DEFAULT_KEYWORDS];
  } catch { return [...DEFAULT_KEYWORDS]; }
}

function saveKeywords(arr) {
  localStorage.setItem(KEYWORDS_KEY, JSON.stringify(arr));
}

let keywords = loadKeywords();

// ---------- 렌더 ----------
function renderCurrent() {
  const wrap = document.getElementById('kwCurrent');
  document.getElementById('kwCount').textContent = keywords.length;

  if (!keywords.length) {
    wrap.innerHTML = `<span class="kw-empty">키워드가 없어요. 아래에서 추가해보세요.</span>`;
    return;
  }

  wrap.innerHTML = keywords.map(kw => `
    <span class="set-kw-chip">
      <span class="kw-tag-label">${kw}</span>
      <button class="kw-remove" data-kw="${kw}" aria-label="${kw} 삭제">×</button>
    </span>
  `).join('');

  wrap.querySelectorAll('.kw-remove').forEach(btn => {
    btn.addEventListener('click', () => removeKeyword(btn.dataset.kw));
  });
}

function renderSuggest() {
  const wrap = document.getElementById('kwSuggest');
  const normalized = keywords.map(k => k.toLowerCase());

  wrap.innerHTML = SUGGESTED.map(s => {
    const added = normalized.includes(s.toLowerCase());
    return `<button class="suggest-chip ${added ? 'added' : ''}" data-kw="${s}">${s}</button>`;
  }).join('');

  wrap.querySelectorAll('.suggest-chip:not(.added)').forEach(btn => {
    btn.addEventListener('click', () => addKeyword(btn.dataset.kw));
  });
}

function render() {
  renderCurrent();
  renderSuggest();
}

// ---------- CRUD ----------
function addKeyword(raw) {
  const kw = raw.trim().replace(/^#+/, '');
  if (!kw) return;
  if (keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
    showToast(`'${kw}'는 이미 추가돼 있어요`);
    return;
  }
  if (keywords.length >= 15) {
    showToast('키워드는 최대 15개까지 추가할 수 있어요');
    return;
  }
  keywords.push(kw);
  saveKeywords(keywords);
  render();
  showToast(`#${kw} 추가됨`);
}

function removeKeyword(kw) {
  keywords = keywords.filter(k => k !== kw);
  saveKeywords(keywords);
  render();
  showToast(`#${kw} 삭제됨`);
}

// ---------- 입력창 ----------
const input = document.getElementById('kwInput');
const addBtn = document.getElementById('kwAddBtn');

addBtn.addEventListener('click', () => {
  addKeyword(input.value);
  input.value = '';
  input.focus();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addKeyword(input.value);
    input.value = '';
  }
});

// ---------- 데이터 초기화 ----------
document.getElementById('resetActivity').addEventListener('click', () => {
  if (!confirm('활동 기록과 키워드 점수를 초기화할까요?')) return;
  localStorage.removeItem('newshot_activity_log');
  localStorage.removeItem('newshot_kw_scores');
  showToast('활동 기록이 초기화됐어요');
});

document.getElementById('resetLibrary').addEventListener('click', () => {
  if (!confirm('저장한 기사를 전부 삭제할까요?')) return;
  localStorage.removeItem('newshot_interests');
  showToast('라이브러리가 비워졌어요');
});

// ---------- 토스트 ----------
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
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
render();
