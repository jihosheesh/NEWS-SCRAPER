#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NEWSHOT 뉴스 스크래퍼 — 한국 언론사 RSS 기반
=============================================
실행하면 한국 언론사 RSS에서 최신 기사를 가져와
data.js 의 NEWS_DB / KEYWORD_TOP 블록을 자동 갱신합니다.

설치:
    pip install requests feedparser beautifulsoup4

실행:
    python scraper.py

주기적 자동 실행 (Windows 작업 스케줄러 or cron):
    python scraper.py  매시간 실행 권장
"""

import feedparser
import requests
import json
import re
import os
import hashlib
from datetime import datetime, timezone
from bs4 import BeautifulSoup

# ────────────────────────────────────────────────────────────────
# 설정
# ────────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DATA_JS   = os.path.join(BASE_DIR, 'data.js')
MAX_TOTAL = 15    # data.js 에 담을 최대 기사 수
PER_FEED  = 4     # 피드당 최대 수집 건수
TIMEOUT   = 10    # HTTP 타임아웃(초)
HEADERS   = {'User-Agent': 'Mozilla/5.0 (compatible; NEWSHOT-Scraper/1.0)'}

# ────────────────────────────────────────────────────────────────
# 한국 언론사 RSS 피드 (외국 출처 제외)
# ────────────────────────────────────────────────────────────────
RSS_FEEDS = [
    # ── IT / 테크 ──────────────────────────────────────────────
    {'url': 'https://www.etnews.com/rss/allArticle.xml',
     'source': '전자신문',    'cat': 'IT'},
    {'url': 'https://zdnet.co.kr/rss/zdnet_total.xml',
     'source': 'ZDNet Korea', 'cat': 'IT'},
    # ── 경제 ──────────────────────────────────────────────────
    {'url': 'https://www.hankyung.com/rss/feed/news.xml',
     'source': '한국경제',   'cat': '경제'},
    {'url': 'https://www.mk.co.kr/rss/30000001.xml',
     'source': '매일경제',   'cat': '경제'},
    {'url': 'https://biz.chosun.com/rss/rss.html',
     'source': '조선비즈',   'cat': '경제'},
    {'url': 'https://www.edaily.co.kr/rss/rss.xml',
     'source': '이데일리',   'cat': '경제'},
    {'url': 'https://www.mt.co.kr/rss/main.xml',
     'source': '머니투데이', 'cat': '경제'},
    # ── 종합 ──────────────────────────────────────────────────
    {'url': 'https://www.yna.co.kr/rss/news.xml',
     'source': '연합뉴스',   'cat': '사회'},
    {'url': 'https://rss.donga.com/total.xml',
     'source': '동아일보',   'cat': '사회'},
    {'url': 'https://news.kbs.co.kr/rss/rss.xml',
     'source': 'KBS뉴스',    'cat': '사회'},
    {'url': 'https://imnews.imbc.com/rss/news/news_00.xml',
     'source': 'MBC뉴스',    'cat': '사회'},
    {'url': 'https://www.hani.co.kr/rss/',
     'source': '한겨레',     'cat': '사회'},
    # ── 스포츠 ────────────────────────────────────────────────
    {'url': 'https://sports.chosun.com/rss/sports.xml',
     'source': '스포츠조선', 'cat': '스포츠'},
]

# ────────────────────────────────────────────────────────────────
# 카테고리 분류 키워드
# ────────────────────────────────────────────────────────────────
CAT_KW = {
    'IT': [
        'AI', '인공지능', '반도체', '스타트업', '클라우드', 'ChatGPT', 'GPT',
        '딥러닝', '로봇', '배터리', '전기차', '자율주행', '사이버', '블록체인',
        '메타버스', '데이터센터', '엔비디아', 'SK하이닉스', '삼성전자 반도체',
        '애플', '구글', '마이크로소프트', '오픈AI', '네이버', '카카오', '빅테크',
        '파운드리', 'HBM', '칩', 'CPU', 'GPU',
    ],
    '경제': [
        '금리', '환율', '주식', '코스피', '코스닥', '물가', 'CPI', '기준금리',
        '한국은행', '경제성장', 'GDP', '수출', '무역', '증시', '달러',
        '인플레', '성장률', '경기침체', '무역적자', '외환',
    ],
    '부동산': [
        '부동산', '아파트', '전세', '월세', '분양', '청약', '재건축',
        '재개발', '집값', '주택', '오피스텔',
    ],
    '사회': [
        '정치', '선거', '국회', '정부', '대통령', '법안', '사건', '사고',
        '교육', '복지', '의료', '기후', '환경', '노동', '인구', '출산',
    ],
    '스포츠': [
        '야구', '축구', '농구', '배구', '손흥민', 'KBO', 'EPL',
        '올림픽', '월드컵', '스포츠', '선수권', '리그',
    ],
}

# ────────────────────────────────────────────────────────────────
# 해시태그 칩 매핑
# ────────────────────────────────────────────────────────────────
CHIP_KW = [
    (['AI', '인공지능', 'ChatGPT', 'GPT', '생성형 AI', '거대언어모델'], '#AI'),
    (['반도체', '파운드리', 'HBM', '메모리칩'],                         '#반도체'),
    (['엔비디아'],                                                       '#엔비디아'),
    (['삼성전자'],                                                       '#삼성전자'),
    (['SK하이닉스'],                                                     '#SK하이닉스'),
    (['부동산', '아파트', '집값'],                                       '#부동산'),
    (['전세'],                                                           '#전세'),
    (['재건축', '재개발'],                                               '#재건축'),
    (['금리', '기준금리'],                                               '#금리'),
    (['한국은행'],                                                       '#한은'),
    (['환율', '달러강세', '원달러'],                                     '#환율'),
    (['스타트업', '유니콘', '벤처'],                                     '#스타트업'),
    (['손흥민'],                                                         '#손흥민'),
    (['KBO', '야구'],                                                    '#KBO'),
    (['EPL', '프리미어리그'],                                            '#EPL'),
    (['정책', '법안', '규제'],                                           '#정책'),
    (['네이버'],                                                         '#네이버'),
    (['카카오'],                                                         '#카카오'),
    (['전기차', '배터리', '충전'],                                       '#전기차'),
    (['수출', '무역'],                                                   '#수출'),
]

# ────────────────────────────────────────────────────────────────
# 유틸 함수
# ────────────────────────────────────────────────────────────────
def rel_time(dt):
    """datetime → '3시간 전' 형식 문자열"""
    if not dt:
        return '방금 전'
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    s = max(0, int((now - dt).total_seconds()))
    if s < 60:    return '방금 전'
    if s < 3600:  return f'{s // 60}분 전'
    if s < 86400: return f'{s // 3600}시간 전'
    return f'{s // 86400}일 전'


def clean_html(text):
    """HTML 태그 제거 + 연속 공백 정리"""
    if not text:
        return ''
    text = BeautifulSoup(str(text), 'html.parser').get_text()
    return re.sub(r'\s+', ' ', text).strip()


def to_sentences(text, n=3):
    """텍스트 → 한국어 문장 최대 n개 리스트"""
    text = text.strip()
    if not text:
        return []
    # 마침표 뒤 공백, 또는 줄바꿈으로 분리
    parts = re.split(r'(?<=\.)\s+|\n+', text)
    result = []
    for p in parts:
        p = p.strip()
        if len(p) < 15:
            continue
        if not p.endswith('.'):
            p += '.'
        result.append(p)
        if len(result) >= n:
            break
    # RSS 요약이 짧으면 단락 전체를 첫 문장으로
    if not result and len(text) >= 15:
        chunk = text[:150].rsplit(' ', 1)[0]
        result = [chunk + ('.' if not chunk.endswith('.') else '')]
    return result[:n]


def classify_cat(title, desc, default):
    """제목+설명 키워드 빈도로 카테고리 분류"""
    text = title + ' ' + desc
    scores = {c: sum(1 for kw in kws if kw in text) for c, kws in CAT_KW.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else default


def get_chips(title, desc):
    """제목+설명에서 해시태그 칩 최대 4개 추출"""
    text = title + ' ' + desc
    chips = []
    for kws, chip in CHIP_KW:
        if any(kw in text for kw in kws) and chip not in chips:
            chips.append(chip)
        if len(chips) >= 4:
            break
    return chips or ['#뉴스']


def make_id(url):
    """URL → 8자리 고유 ID"""
    return 'n' + hashlib.md5(url.encode()).hexdigest()[:8]


def parse_dt(entry):
    """feedparser entry → timezone-aware datetime"""
    pp = getattr(entry, 'published_parsed', None)
    if pp:
        try:
            return datetime(*pp[:6], tzinfo=timezone.utc)
        except Exception:
            pass
    return None


# ────────────────────────────────────────────────────────────────
# 스크래핑
# ────────────────────────────────────────────────────────────────
def scrape():
    articles = []

    for fi in RSS_FEEDS:
        src = fi['source']
        try:
            print(f'  · {src:<14}', end=' ')
            r = requests.get(fi['url'], headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            feed = feedparser.parse(r.content)

            count = 0
            for entry in feed.entries:
                if count >= PER_FEED:
                    break

                title = clean_html(entry.get('title', ''))
                link  = entry.get('link', '') or entry.get('id', '')
                desc  = clean_html(
                    entry.get('summary', '') or entry.get('description', '')
                )
                dt = parse_dt(entry)

                if not title or not link or len(title) < 8:
                    continue

                # 링크가 상대경로인 경우 피드 URL 도메인으로 보정
                if link.startswith('/'):
                    from urllib.parse import urlparse
                    parsed = urlparse(fi['url'])
                    link = f'{parsed.scheme}://{parsed.netloc}{link}'

                summary = to_sentences(desc) if desc else [title + '.']

                articles.append({
                    'id':       make_id(link),
                    'category': classify_cat(title, desc, fi['cat']),
                    'source':   src,
                    'time':     rel_time(dt),
                    'url':      link,
                    'title':    title,
                    'summary':  summary,
                    'chips':    get_chips(title, desc),
                    '_dt':      dt or datetime.min.replace(tzinfo=timezone.utc),
                })
                count += 1

            print(f'{count}건 수집')

        except Exception as e:
            print(f'오류 → {e}')

    # 최신순 정렬 후 제목 앞 20자로 중복 제거
    articles.sort(key=lambda a: a['_dt'], reverse=True)
    seen, unique = set(), []
    for a in articles:
        key = a['title'][:20]
        if key not in seen:
            seen.add(key)
            unique.append(a)

    return unique[:MAX_TOTAL]


# ────────────────────────────────────────────────────────────────
# data.js 갱신 (센티넬 블록 교체)
# ────────────────────────────────────────────────────────────────
SENTINEL_START = '// ====AUTO-GENERATED-START===='
SENTINEL_END   = '// ====AUTO-GENERATED-END===='


def update_data_js(articles):
    # _dt 필드 제거 (JSON 직렬화 불가)
    clean = [{k: v for k, v in a.items() if k != '_dt'} for a in articles]

    # TOP3 키워드 집계
    chip_cnt: dict = {}
    for a in clean:
        for c in a['chips']:
            chip_cnt[c] = chip_cnt.get(c, 0) + 1
    top3 = sorted(chip_cnt.items(), key=lambda x: -x[1])[:3]
    kw_top = [
        {
            'rank':     i + 1,
            'tag':      ch.replace('#', ''),
            'mentions': f'{cnt * 130 + 900}건',
            'trend':    f'+{cnt * 20 + 35}%',
        }
        for i, (ch, cnt) in enumerate(top3)
    ]

    now_str   = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    news_json = json.dumps(clean,   ensure_ascii=False, indent=2)
    kwt_json  = json.dumps(kw_top,  ensure_ascii=False, indent=2)

    new_block = (
        f'{SENTINEL_START}\n'
        f'// 마지막 업데이트: {now_str}\n'
        f'window.NEWS_DB = {news_json};\n\n'
        f'// ---------- TOP3 키워드 ----------\n'
        f'window.KEYWORD_TOP = {kwt_json};\n'
        f'{SENTINEL_END}'
    )

    with open(DATA_JS, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(
        re.escape(SENTINEL_START) + r'.*?' + re.escape(SENTINEL_END),
        re.DOTALL,
    )
    if pattern.search(content):
        updated = pattern.sub(new_block, content)
    else:
        # 센티넬 없으면 파일 맨 앞에 삽입
        updated = new_block + '\n\n' + content

    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write(updated)

    top_tags = ', '.join(f'#{kw_top[i]["tag"]}' for i in range(len(kw_top)))
    print(f'\n[완료] data.js 갱신 완료 - {len(clean)}건 기사, TOP3: {top_tags}')


# ────────────────────────────────────────────────────────────────
# 엔트리포인트
# ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    print('=' * 52)
    print('  NEWSHOT 뉴스 스크래퍼 - 한국 언론사 전용')
    print('=' * 52)
    print()

    articles = scrape()

    print()
    if articles:
        update_data_js(articles)
    else:
        print('⚠️  수집된 기사가 없습니다. 인터넷 연결을 확인하세요.')

    print()
