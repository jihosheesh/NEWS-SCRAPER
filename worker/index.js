/**
 * NEWSHOT 개인화 뉴스 API — Cloudflare Worker
 * =============================================
 * GET /news?keywords=AI,테슬라,부동산
 *   → 각 키워드로 Google News RSS 병렬 검색
 *   → 정제·분류·중복제거 후 JSON 반환
 */

const MAX_PER_KW = 5;   // 키워드당 최대 수집 기사 수
const MAX_OUT    = 20;  // 응답 최대 기사 수
const CACHE_TTL  = 300; // 5분 캐시 (Google News 과호출 방지)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

// ────────────────────────────────────────────────────────────────
// 카테고리 분류 키워드
// ────────────────────────────────────────────────────────────────
const CAT_KW = {
  'IT': [
    'AI','인공지능','반도체','스타트업','클라우드','GPT','딥러닝','로봇',
    '배터리','전기차','자율주행','사이버','블록체인','메타버스','데이터센터',
    '엔비디아','SK하이닉스','애플','구글','마이크로소프트','오픈AI','네이버',
    '카카오','파운드리','HBM','칩','CPU','GPU','테슬라','스마트폰',
  ],
  '경제': [
    '금리','환율','주식','코스피','코스닥','물가','CPI','기준금리','한국은행',
    'GDP','수출','무역','증시','달러','인플레','성장률','경기침체','무역적자',
    '외환','비트코인','가상자산','이더리움','코인',
  ],
  '부동산': [
    '부동산','아파트','전세','월세','분양','청약','재건축','재개발','집값',
    '주택','오피스텔',
  ],
  '사회': [
    '정치','선거','국회','정부','대통령','법안','사건','사고','교육','복지',
    '의료','기후','환경','노동','인구','출산','채용','취업','고용','일자리',
    '구직','이재명','트럼프',
  ],
  '스포츠': [
    '야구','축구','농구','배구','손흥민','KBO','EPL','올림픽','월드컵',
    '스포츠','선수','감독','구장','홈런','리그',
  ],
};

// ────────────────────────────────────────────────────────────────
// 해시태그 칩 매핑
// ────────────────────────────────────────────────────────────────
const CHIP_KW = [
  [['AI','인공지능','ChatGPT','GPT','생성형AI','거대언어모델'],  '#AI'],
  [['반도체','파운드리','HBM','메모리칩'],                       '#반도체'],
  [['엔비디아'],                                                 '#엔비디아'],
  [['삼성전자'],                                                 '#삼성전자'],
  [['SK하이닉스'],                                               '#SK하이닉스'],
  [['테슬라'],                                                   '#테슬라'],
  [['애플','Apple'],                                             '#애플'],
  [['구글','Google'],                                            '#구글'],
  [['부동산','아파트','집값'],                                   '#부동산'],
  [['전세'],                                                     '#전세'],
  [['재건축','재개발'],                                          '#재건축'],
  [['금리','기준금리'],                                          '#금리'],
  [['한국은행'],                                                 '#한은'],
  [['환율','달러강세','원달러'],                                 '#환율'],
  [['비트코인','이더리움','가상자산','코인'],                    '#비트코인'],
  [['스타트업','유니콘','벤처'],                                 '#스타트업'],
  [['손흥민'],                                                   '#손흥민'],
  [['KBO','야구'],                                               '#KBO'],
  [['EPL','프리미어리그'],                                       '#EPL'],
  [['정책','법안','규제'],                                       '#정책'],
  [['네이버'],                                                   '#네이버'],
  [['카카오'],                                                   '#카카오'],
  [['전기차','배터리','충전'],                                   '#전기차'],
  [['수출','무역'],                                              '#수출'],
  [['채용','채용공고','구인','모집'],                            '#채용'],
  [['취업','취준','취업준비','구직'],                            '#취업'],
  [['고용','일자리','실업','고용률'],                            '#고용'],
  [['정치','국회','대통령','선거'],                              '#정치'],
  [['교육','대학','학교','입시','수능'],                         '#교육'],
  [['의료','건강','병원','보건'],                                '#의료'],
  [['기후','환경','탄소','재생에너지'],                          '#환경'],
];

// ────────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────────
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + h) ^ str.charCodeAt(i);
  }
  return 'n' + (h >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

function relTime(ts) {
  if (!ts) return '방금 전';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60)    return '방금 전';
  if (s < 3600)  return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

function classifyCat(text, fallback) {
  let best = fallback, bestScore = 0;
  for (const [cat, kws] of Object.entries(CAT_KW)) {
    const score = kws.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

function getChips(text, extraChip) {
  const chips = [];
  // 사용자 키워드를 첫 번째 칩으로 (직접 입력 키워드 우선 보장)
  if (extraChip && !chips.includes(extraChip)) chips.push(extraChip);
  for (const [kws, chip] of CHIP_KW) {
    if (kws.some(kw => text.includes(kw)) && !chips.includes(chip)) chips.push(chip);
    if (chips.length >= 4) break;
  }
  return chips.length ? chips : ['#뉴스'];
}

function toSentences(desc, title) {
  if (!desc || desc.length < 15) return [title + '.'];
  const parts = desc.split(/(?<=[.!?])\s+|\n+/);
  const result = [];
  for (const p of parts) {
    const s = p.trim();
    if (s.length < 15) continue;
    result.push(s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.');
    if (result.length >= 3) break;
  }
  if (!result.length) {
    const chunk = desc.slice(0, 150).replace(/\s+\S+$/, '');
    result.push(chunk + (chunk.endsWith('.') ? '' : '.'));
  }
  return result;
}

function normalizeTitle(t) {
  return t.replace(/^\[.*?\]\s*/, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
}

function htmlDecode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// ────────────────────────────────────────────────────────────────
// RSS XML 파싱
// ────────────────────────────────────────────────────────────────
function extractTag(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>`, 'i');
  const textRe  = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  return htmlDecode((xml.match(cdataRe)?.[1] ?? xml.match(textRe)?.[1] ?? '').trim());
}

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
}

function processItem(itemXml, defaultCat, keyword, kwChip) {
  // 제목 정제
  let title = extractTag(itemXml, 'title')
    .replace(/\s*-\s*[\w\s가-힣·]{2,25}$/u, '')  // " - 언론사명" 제거
    .replace(/[◆■●◇□][^]*/u, '')                  // 구분자 이후 제거
    .trim();

  const link = extractTag(itemXml, 'link') || extractTag(itemXml, 'guid');
  if (!title || !link || title.length < 8) return null;
  if (/^\[(포토|영상|화보|사진)\]/.test(title)) return null;

  // 설명 정제 (▲◆ 이후 타기사 티저 제거)
  const rawDesc = extractTag(itemXml, 'description');
  const desc = rawDesc.split(/\s{0,3}[▲◆■●◇]\s/u)[0].slice(0, 250);

  const source   = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || 'Google뉴스';
  const pubDate  = extractTag(itemXml, 'pubDate');
  const ts       = pubDate ? new Date(pubDate).getTime() : 0;
  const textFull = title + ' ' + desc;

  return {
    id:       simpleHash(link),
    title,
    url:      link,
    source,
    time:     relTime(ts),
    category: classifyCat(textFull, defaultCat),
    chips:    getChips(textFull, kwChip),
    summary:  toSentences(desc, title),
    _ts:      ts,
  };
}

// ────────────────────────────────────────────────────────────────
// 키워드 → Google News RSS fetch
// ────────────────────────────────────────────────────────────────
async function fetchForKeyword(keyword) {
  const defaultCat = classifyCat(keyword, '사회');
  // 사용자 키워드를 칩으로 직접 추가 (예: "테슬라" → "#테슬라")
  const kwChip = '#' + keyword.replace(/#/g, '').trim();

  const q   = encodeURIComponent(keyword);
  const url = `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEWSHOT/1.0)' },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
  });

  if (!res.ok) return [];

  const xml   = await res.text();
  const items = parseItems(xml).slice(0, MAX_PER_KW);
  return items.map(item => processItem(item, defaultCat, keyword, kwChip)).filter(Boolean);
}

// ────────────────────────────────────────────────────────────────
// Worker 진입점
// ────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname !== '/news') {
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: CORS });
    }

    // 키워드 파싱 (최대 10개)
    const raw      = url.searchParams.get('keywords') || '';
    const keywords = [...new Set(
      raw.split(',').map(k => k.trim()).filter(k => k.length > 0)
    )].slice(0, 10);

    if (!keywords.length) {
      return new Response(JSON.stringify({ articles: [] }), { headers: CORS });
    }

    // 키워드별 병렬 fetch
    const settled = await Promise.allSettled(keywords.map(fetchForKeyword));

    // 결과 합치기 + 정규화 키 기준 중복 제거
    const seen     = new Set();
    const articles = [];

    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const a of r.value) {
        const key = normalizeTitle(a.title).slice(0, 15);
        if (key && !seen.has(key)) {
          seen.add(key);
          articles.push(a);
        }
      }
    }

    // 최신순 정렬, 내부 필드 제거
    articles.sort((a, b) => b._ts - a._ts);
    articles.forEach(a => delete a._ts);

    return new Response(
      JSON.stringify({ articles: articles.slice(0, MAX_OUT), keywords }),
      { headers: CORS }
    );
  },
};
