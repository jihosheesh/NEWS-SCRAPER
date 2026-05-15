/**
 * NEWSHOT 개인화 뉴스 API — Cloudflare Worker
 * =============================================
 * GET /news?keywords=AI,금리,부동산
 *   → 네이버 뉴스 검색 API 병렬 호출
 *   → 정제·분류·중복제거 후 JSON 반환
 */

const MAX_PER_KW = 5;
const MAX_OUT    = 20;

const NAVER_ID     = '6NSgckaK44d8PSWGqf_t';
const NAVER_SECRET = 'CXAKMkoJTJ';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

// ────────────────────────────────────────────────────────────────
// 카테고리 분류
// ────────────────────────────────────────────────────────────────
const CAT_KW = {
  'IT': ['AI','인공지능','반도체','스타트업','클라우드','GPT','딥러닝','로봇','배터리','전기차','자율주행','사이버','블록체인','메타버스','데이터센터','엔비디아','SK하이닉스','애플','구글','마이크로소프트','오픈AI','네이버','카카오','파운드리','HBM','칩','CPU','GPU','테슬라','스마트폰'],
  '경제': ['금리','환율','주식','코스피','코스닥','물가','CPI','기준금리','한국은행','GDP','수출','무역','증시','달러','인플레','성장률','경기침체','무역적자','외환','비트코인','가상자산','이더리움','코인'],
  '부동산': ['부동산','아파트','전세','월세','분양','청약','재건축','재개발','집값','주택','오피스텔'],
  '사회': ['정치','선거','국회','정부','대통령','법안','사건','사고','교육','복지','의료','기후','환경','노동','인구','출산','채용','취업','고용','일자리','구직','이재명','트럼프'],
  '스포츠': ['야구','축구','농구','배구','손흥민','KBO','EPL','올림픽','월드컵','스포츠','선수','감독','구장','홈런','리그'],
};

const CHIP_KW = [
  [['AI','인공지능','ChatGPT','GPT','생성형AI','거대언어모델'], '#AI'],
  [['반도체','파운드리','HBM','메모리칩'], '#반도체'],
  [['엔비디아'], '#엔비디아'],
  [['삼성전자'], '#삼성전자'],
  [['SK하이닉스'], '#SK하이닉스'],
  [['테슬라'], '#테슬라'],
  [['애플','Apple'], '#애플'],
  [['구글','Google'], '#구글'],
  [['부동산','아파트','집값'], '#부동산'],
  [['전세'], '#전세'],
  [['재건축','재개발'], '#재건축'],
  [['금리','기준금리'], '#금리'],
  [['한국은행'], '#한은'],
  [['환율','달러강세','원달러'], '#환율'],
  [['비트코인','이더리움','가상자산','코인'], '#비트코인'],
  [['스타트업','유니콘','벤처'], '#스타트업'],
  [['손흥민'], '#손흥민'],
  [['KBO','야구'], '#KBO'],
  [['EPL','프리미어리그'], '#EPL'],
  [['정책','법안','규제'], '#정책'],
  [['네이버'], '#네이버'],
  [['카카오'], '#카카오'],
  [['전기차','배터리','충전'], '#전기차'],
  [['수출','무역'], '#수출'],
  [['채용','채용공고','구인','모집'], '#채용'],
  [['취업','취준','취업준비','구직'], '#취업'],
  [['고용','일자리','실업','고용률'], '#고용'],
  [['정치','국회','대통령','선거'], '#정치'],
  [['교육','대학','학교','입시','수능'], '#교육'],
  [['의료','건강','병원','보건'], '#의료'],
  [['기후','환경','탄소','재생에너지'], '#환경'],
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

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function htmlDecode(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
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
  if (extraChip && !chips.includes(extraChip)) chips.push(extraChip);
  for (const [kws, chip] of CHIP_KW) {
    if (kws.some(kw => text.includes(kw)) && !chips.includes(chip)) chips.push(chip);
    if (chips.length >= 4) break;
  }
  return chips.length ? chips : ['#뉴스'];
}

function toSentences(desc, title) {
  if (!desc || desc.length < 15) return [title + '.'];
  // 네이버 description이 title보다 25자 이상 길어야 실제 내용 존재
  // 짧으면 "제목+출처" 패턴으로 간주하고 title만 반환
  if (desc.length <= title.length + 25) return [title + '.'];

  const parts = desc.split(/(?<=[.!?])\s+|\n+/);
  const result = [];
  for (const p of parts) {
    const s = p.trim();
    if (s.length < 15) continue;
    result.push(s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.');
    if (result.length >= 5) break;
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

// ────────────────────────────────────────────────────────────────
// 네이버 뉴스 API 호출
// ────────────────────────────────────────────────────────────────
async function fetchForKeyword(keyword) {
  const defaultCat = classifyCat(keyword, '사회');
  const kwChip = '#' + keyword.replace(/#/g, '').trim();

  const q = encodeURIComponent(keyword);
  const url = `https://openapi.naver.com/v1/search/news.json?query=${q}&display=${MAX_PER_KW}&sort=date`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id':     NAVER_ID,
        'X-Naver-Client-Secret': NAVER_SECRET,
      },
    });

    if (!res.ok) return [];

    const data  = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    return items.map(item => {
      const title = htmlDecode(stripHtml(item.title || '')).trim();
      const desc  = htmlDecode(stripHtml(item.description || '')).trim();
      const link  = item.originallink || item.link || '';

      if (!title || !link || title.length < 8) return null;
      if (/^\[(포토|영상|화보|사진)\]/.test(title)) return null;

      const ts       = item.pubDate ? new Date(item.pubDate).getTime() : 0;
      const source   = (() => {
        try { return new URL(link).hostname.replace('www.', ''); } catch { return ''; }
      })();
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
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────
// Worker 진입점
// ────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname !== '/news') {
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: CORS });
    }

    const raw      = url.searchParams.get('keywords') || '';
    const keywords = [...new Set(
      raw.split(',').map(k => k.trim()).filter(k => k.length > 0)
    )].slice(0, 10);

    if (!keywords.length) {
      return new Response(JSON.stringify({ articles: [] }), { headers: CORS });
    }

    const settled = await Promise.allSettled(keywords.map(fetchForKeyword));

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

    articles.sort((a, b) => b._ts - a._ts);
    articles.forEach(a => delete a._ts);

    return new Response(
      JSON.stringify({ articles: articles.slice(0, MAX_OUT), keywords }),
      { headers: CORS }
    );
  },
};
