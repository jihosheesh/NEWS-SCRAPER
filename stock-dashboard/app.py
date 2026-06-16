import calendar
import json
import os
from datetime import datetime, time as dtime

import feedparser
import pandas as pd
import requests
from flask import Flask, jsonify, render_template, request

try:
    from zoneinfo import ZoneInfo
    KST = ZoneInfo("Asia/Seoul")
except ImportError:
    KST = None

app = Flask(__name__)

with open(os.path.join(os.path.dirname(__file__), "stocks.json"), encoding="utf-8") as f:
    STOCK_LIST = json.load(f)

STOCK_BY_CODE = {item["code"]: item for item in STOCK_LIST}

BIG_MOVE = 5.0      # 폭등/폭락 기준 (%)
SURGE_MOVE = 3.0    # 급등 기준 (%)
NEAR_EXTREME = 0.05 # 52주 고/저 근접 기준 (5%)
VOLUME_SPIKE = 1.5  # 거래량 급증 기준 (평균 대비)

HEADERS = {"User-Agent": "Mozilla/5.0"}

# 10대 매매 원칙 (이미지 기준) - apply_rules()가 이 순서/번호를 그대로 따른다
TRADING_RULES = [
    {"id": 1, "text": "아침 폭등 → 전량 매도"},
    {"id": 2, "text": "아침 폭락 → 매도 금지"},
    {"id": 3, "text": "오후 폭등 → 추격 매수 금지"},
    {"id": 4, "text": "오후 폭락 → 내일 매수 기회"},
    {"id": 5, "text": "개장 급등 → 충동 매수 금지"},
    {"id": 6, "text": "마감 전 급등 → 일부 익절"},
    {"id": 7, "text": "저가 + 거래량 증가 → 과감히 매수"},
    {"id": 8, "text": "고가 + 거래량 증가 → 신속 매도"},
    {"id": 9, "text": "횡보장 → 거래 금지"},
    {"id": 10, "text": "지지선(20일선) 이탈 → 손절 필수"},
]


def now_kst():
    if KST:
        return datetime.now(KST)
    return datetime.now()


def get_market_phase():
    """KST 기준 장 시간대 구분"""
    t = now_kst().time()
    if t < dtime(9, 0):
        return "장전"
    if t <= dtime(9, 30):
        return "개장초"
    if t <= dtime(12, 0):
        return "오전장"
    if t <= dtime(14, 30):
        return "오후장"
    if t <= dtime(15, 30):
        return "마감전"
    if t <= dtime(20, 0):
        return "애프터마켓"
    return "장마감"


def calc_rsi(close, period=14):
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def fetch_chart(ticker):
    """한국 종목코드(6자리 숫자)는 stocks.json의 시장 구분을 우선 사용,
    없으면 .KS/.KQ를 차례로 시도. 그 외는 입력값 그대로 사용"""
    candidates = [ticker.upper()]
    if ticker.isdigit():
        known = STOCK_BY_CODE.get(ticker)
        if known:
            other = "KQ" if known["market"] == "KS" else "KS"
            candidates = [f"{ticker}.{known['market']}", f"{ticker}.{other}"]
        else:
            candidates = [f"{ticker}.KS", f"{ticker}.KQ"]

    for sym in candidates:
        try:
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                params={"range": "1y", "interval": "1d"},
                headers=HEADERS,
                timeout=10,
            )
            data = r.json()
            result = data.get("chart", {}).get("result")
            if result and result[0].get("timestamp"):
                return sym, result[0]
        except Exception:
            continue
    return None, None


def _signed_value(value_str, direction):
    """네이버 등락 비교값에 상승/하락 방향(direction)을 적용해 부호를 붙임"""
    v = float(value_str.replace(",", ""))
    if direction == "FALLING":
        return -v
    if direction == "RISING":
        return v
    return 0.0


def fetch_naver_realtime(code):
    """네이버 실시간 시세(delayTime=0) - 정규장 현재가/등락률/거래량 + 애프터마켓(15:30~20:00) 시간외 데이터.
    Yahoo Finance(15~20분 지연)보다 지연이 거의 없어 정규장 중 현재가 표시에 사용함"""
    try:
        r = requests.get(
            f"https://polling.finance.naver.com/api/realtime/domestic/stock/{code}",
            headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"},
            timeout=8,
        )
        data = r.json()["datas"][0]
        direction = data.get("compareToPreviousPrice", {}).get("name", "")

        close = float(data["closePriceRaw"])
        change_pct = _signed_value(data["fluctuationsRatioRaw"], direction)
        delta = _signed_value(data["compareToPreviousClosePriceRaw"], direction)

        after_market = None
        info = data.get("overMarketPriceInfo")
        if info and info.get("overMarketStatus") == "OPEN":
            over_price = float(info["overPrice"].replace(",", ""))
            after_market = {
                "price": int(over_price),
                "change_pct": round((over_price - close) / close * 100, 2),
                "volume": int(info["accumulatedTradingVolume"].replace(",", "")),
                "high": int(info["highPrice"].replace(",", "")),
                "low": int(info["lowPrice"].replace(",", "")),
                "traded_at": info.get("localTradedAt"),
            }

        return {
            "close": close,
            "prev_close": close - delta,
            "change_pct": round(change_pct, 2),
            "volume": int(data["accumulatedTradingVolumeRaw"]),
            "delay_sec": data.get("stockExchangeType", {}).get("delayTime", 0),
            "traded_at": data.get("localTradedAt"),
            "after_market": after_market,
        }
    except Exception:
        return None


def fetch_news(query, limit=3):
    """구글 뉴스 RSS로 실시간 한국어 기사 검색"""
    try:
        url = "https://news.google.com/rss/search"
        r = requests.get(
            url,
            params={"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"},
            headers=HEADERS,
            timeout=8,
        )
        feed = feedparser.parse(r.content)
        items = []
        for entry in feed.entries[:limit]:
            source = ""
            if "source" in entry and hasattr(entry.source, "get"):
                source = entry.source.get("title", "")
            elif "source" in entry:
                source = getattr(entry.source, "title", "")
            items.append({
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "source": source,
                "published": entry.get("published", ""),
            })
        return items
    except Exception:
        return []


def fetch_macro():
    """원/달러 환율, 코스피, 미국채10년 - 최근 5거래일 변화율 (분석 1회당 1번만 호출)"""
    macro = {}
    specs = {"usdkrw": "KRW=X", "kospi": "^KS11", "us10y": "^TNX"}
    for key, sym in specs.items():
        try:
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                params={"range": "10d", "interval": "1d"},
                headers=HEADERS,
                timeout=8,
            )
            result = r.json()["chart"]["result"][0]
            closes = [c for c in result["indicators"]["quote"][0]["close"] if c is not None]
            if len(closes) >= 2:
                last = closes[-1]
                prev = closes[-min(6, len(closes))]
                macro[key] = {
                    "value": round(last, 2),
                    "change_pct": round((last - prev) / prev * 100, 2),
                }
        except Exception:
            continue
    return macro


def fetch_naver_integration(code):
    """네이버페이 증권 - PER/PBR/컨센서스 실적 및 최근 5일 외국인·기관·개인 순매수"""
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{code}/integration",
            headers=HEADERS,
            timeout=8,
        )
        data = r.json()
        info = {item["code"]: item for item in data.get("totalInfos", []) or []}

        def to_num(field):
            item = info.get(field)
            if not item or not item.get("value"):
                return None
            v = item["value"].replace(",", "").replace("배", "").replace("원", "").replace("%", "")
            try:
                return float(v)
            except ValueError:
                return None

        flow = {"foreign": 0, "organ": 0, "individual": 0}
        has_flow = False
        flow_daily = []
        for d in (data.get("dealTrendInfos") or [])[:5]:
            close = d.get("closePrice")
            close_val = float(close.replace(",", "")) if close else 0
            day = {"date": d.get("bizdate"), "close": close_val}
            for key, field in (("foreign", "foreignerPureBuyQuant"), ("organ", "organPureBuyQuant"), ("individual", "individualPureBuyQuant")):
                val = d.get(field)
                quant = int(val.replace(",", "").replace("+", "")) if val else 0
                if val:
                    flow[key] += quant
                    has_flow = True
                day[key] = {"quant": quant, "amount": quant * close_val}
            flow_daily.append(day)

        return {
            "per": to_num("per"),
            "cns_per": to_num("cnsPer"),
            "eps": to_num("eps"),
            "cns_eps": to_num("cnsEps"),
            "pbr": to_num("pbr"),
            "dividend_yield": to_num("dividendYieldRatio"),
            "flow_5d": flow if has_flow else None,
            "flow_daily": flow_daily if has_flow else None,
        }
    except Exception:
        return None


def witching_day_info():
    """네 마녀의 날(쿼드러플 위칭데이) - 3·6·9·12월 둘째 목요일 전후 1일 이내인지 확인"""
    today = now_kst().date()
    if today.month not in (3, 6, 9, 12):
        return None
    thursdays = [
        d for d in calendar.Calendar().itermonthdates(today.year, today.month)
        if d.month == today.month and d.weekday() == 3
    ]
    if len(thursdays) < 2:
        return None
    witching = thursdays[1]
    days_until = (witching - today).days
    if -1 <= days_until <= 1:
        return {"date": witching.isoformat(), "days_until": days_until}
    return None


NEWS_POS_KEYWORDS = ["상승", "목표가 상향", "호조", "수주", "강세", "급등", "신고가", "성장", "확대", "개선", "기대"]
NEWS_NEG_KEYWORDS = ["하락", "목표가 하향", "부진", "급락", "약세", "적자", "우려", "규제", "리스크", "축소", "손실"]


def score_news_sentiment(news):
    pos = neg = 0
    for n in news:
        title = n.get("title", "")
        pos += sum(1 for k in NEWS_POS_KEYWORDS if k in title)
        neg += sum(1 for k in NEWS_NEG_KEYWORDS if k in title)
    return pos, neg


def build_assessment(close, high_52, low_52, macro, naver_info, news, witching):
    """주식투자 정리노트 v1 기준: 펀더멘털/매크로/수급/심리/밸류에이션 5개 항목 종합 판단 (메인 판단)"""
    categories = []

    # 1. 펀더멘털 (실적 추정치 추세)
    if naver_info and naver_info.get("eps") and naver_info.get("cns_eps") and naver_info["eps"]:
        eps, cns_eps = naver_info["eps"], naver_info["cns_eps"]
        ratio = cns_eps / eps
        if ratio >= 1.05:
            score, label = 1, "실적 개선 기대"
            detail = (
                f"현재 EPS {eps:,.0f}원 → 컨센서스 EPS {cns_eps:,.0f}원으로 {(ratio - 1) * 100:.0f}% 증가 전망 "
                f"(현재 PER {naver_info['per']:.1f}배 → 컨센서스 기준 PER {naver_info['cns_per']:.1f}배로 낮아질 전망)"
            )
        elif ratio <= 0.95:
            score, label = -1, "실적 둔화 우려"
            detail = (
                f"현재 EPS {eps:,.0f}원 → 컨센서스 EPS {cns_eps:,.0f}원으로 {(1 - ratio) * 100:.0f}% 감소 전망 "
                f"(현재 PER {naver_info['per']:.1f}배 → 컨센서스 기준 PER {naver_info['cns_per']:.1f}배로 높아질 전망)"
            )
        else:
            score, label = 0, "실적 안정적"
            detail = f"현재 PER {naver_info['per']:.1f}배, 컨센서스 기준 PER {naver_info['cns_per']:.1f}배로 큰 변화 없음"
    else:
        score, label = 0, "실적 데이터 없음"
        detail = "컨센서스 실적 추정치 데이터를 가져오지 못해 중립으로 처리"
    categories.append({"key": "fundamental", "name": "① 펀더멘털(실적)", "score": score, "label": label, "detail": detail})

    # 2. 매크로 (금리·환율·코스피 흐름)
    kospi, us10y, usdkrw = macro.get("kospi"), macro.get("us10y"), macro.get("usdkrw")
    score = 0
    parts = []
    if kospi:
        if kospi["change_pct"] >= 1:
            score += 1
        elif kospi["change_pct"] <= -1:
            score -= 1
        parts.append(f"코스피 5거래일 {kospi['change_pct']:+.1f}%")
    if us10y:
        if us10y["change_pct"] <= -1:
            score += 1
        elif us10y["change_pct"] >= 1:
            score -= 1
        parts.append(f"미국채10년 5거래일 {us10y['change_pct']:+.1f}%")
    if usdkrw:
        parts.append(f"원/달러 환율 5거래일 {usdkrw['change_pct']:+.1f}%")
    score = max(-1, min(1, score))
    if score > 0:
        label = "매크로 우호적 (시장 전체 상승·금리 안정)"
    elif score < 0:
        label = "매크로 비우호적 (시장 전체 하락·금리 부담)"
    else:
        label = "매크로 중립"
    detail = " / ".join(parts) if parts else "매크로 데이터를 가져오지 못해 중립으로 처리"
    categories.append({"key": "macro", "name": "② 매크로(금리·환율·지수)", "score": score, "label": label, "detail": detail})

    # 3. 수급 (외국인·기관 순매수)
    if naver_info and naver_info.get("flow_5d"):
        f = naver_info["flow_5d"]
        net = f["foreign"] + f["organ"]
        if f["foreign"] > 0 and f["organ"] > 0:
            score, label = 1, "외국인·기관 동반 순매수"
        elif f["foreign"] < 0 and f["organ"] < 0:
            score, label = -1, "외국인·기관 동반 순매도"
        elif net > 0:
            score, label = 1, "수급 우호적 (순매수 우위)"
        elif net < 0:
            score, label = -1, "수급 비우호적 (순매도 우위)"
        else:
            score, label = 0, "수급 중립"
        detail = f"최근 5거래일 누적 순매수 - 외국인 {f['foreign']:+,}주, 기관 {f['organ']:+,}주, 개인 {f['individual']:+,}주"
        daily = naver_info.get("flow_daily")
    else:
        score, label = 0, "수급 데이터 없음"
        detail = "외국인·기관 매매 데이터를 가져오지 못해 중립으로 처리"
        daily = None
    categories.append({"key": "flow", "name": "③ 수급(외국인·기관)", "score": score, "label": label, "detail": detail, "daily": daily})

    # 4. 투자심리·이벤트 (뉴스 톤 + 네 마녀의 날)
    pos, neg = score_news_sentiment(news)
    if pos > neg:
        score, label = 1, "뉴스 심리 긍정적"
    elif neg > pos:
        score, label = -1, "뉴스 심리 부정적"
    else:
        score, label = 0, "뉴스 심리 중립"
    detail_parts = [f"최근 기사 제목 기준 긍정 키워드 {pos}건, 부정 키워드 {neg}건"]
    if witching:
        if witching["days_until"] == 0:
            detail_parts.append("⚠ 오늘은 네 마녀의 날(쿼드러플 위칭데이) → 장 마감 직전 수급성 변동성 확대 가능, 기업가치와 무관한 급등락은 추격매매 자제")
        else:
            detail_parts.append(f"⚠ {witching['date']} 네 마녀의 날(쿼드러플 위칭데이) 예정 → 만기 수급에 따른 변동성 확대 가능")
    categories.append({"key": "sentiment", "name": "④ 투자심리·이벤트", "score": score, "label": label, "detail": " / ".join(detail_parts)})

    # 5. 밸류에이션 (52주 가격 위치)
    if high_52 and low_52 and high_52 > low_52:
        position = (close - low_52) / (high_52 - low_52)
        if position <= 0.3:
            score, label = 1, "52주 저가권 (저평가 구간)"
        elif position >= 0.7:
            score, label = -1, "52주 고가권 (고평가 구간)"
        else:
            score, label = 0, "52주 중간 구간"
        detail = f"52주 범위({low_52:,.0f}~{high_52:,.0f}원) 중 현재가 {close:,.0f}원은 하단 기준 {position * 100:.0f}% 위치"
    else:
        score, label = 0, "밸류에이션 데이터 부족"
        detail = "52주 고저 데이터를 가져오지 못해 중립으로 처리"
    categories.append({"key": "valuation", "name": "⑤ 밸류에이션(52주 위치)", "score": score, "label": label, "detail": detail})

    total = sum(c["score"] for c in categories)
    if total >= 2:
        overall = "매수 관심"
    elif total <= -2:
        overall = "매도·비중 축소 검토"
    else:
        overall = "중립 (보유/관망)"

    return {"overall": overall, "score": total, "categories": categories}


RSI_OVERSOLD = 30
RSI_OVERBOUGHT = 70


def apply_rules(phase, change_pct, close, ma20, prev_close, prev_ma20, volume_ratio, high_52, low_52,
                 after_change_pct=None, rsi=None):
    signals = []
    has_rsi = rsi is not None and pd.notna(rsi)

    # 1. 아침 폭등 -> 전량 매도
    if phase in ("개장초", "오전장") and change_pct >= BIG_MOVE:
        signals.append({"type": "매도", "rule": 1, "text": "아침 폭등 → 전량 매도 검토", "details": [
            f"전일 종가 대비 {change_pct:+.2f}% (폭등 기준 ±{BIG_MOVE:.0f}% 이상)",
            "장 초반 급등은 단기 차익실현 매물이 출회되기 쉬워 보유 물량 매도를 검토합니다.",
        ]})

    # 2. 아침 폭락 -> 매도 금지
    if phase in ("개장초", "오전장") and change_pct <= -BIG_MOVE:
        signals.append({"type": "보유", "rule": 2, "text": "아침 폭락 → 매도 금지, 보유 권장", "details": [
            f"전일 종가 대비 {change_pct:+.2f}% (폭락 기준 ±{BIG_MOVE:.0f}% 이상)",
            "장 초반 패닉성 급락에서 매도하면 저점에서 손실을 확정짓기 쉽습니다.",
        ]})

    # 3. 오후 폭등 -> 추격 매수 금지
    if phase in ("오후장", "마감전") and change_pct >= BIG_MOVE:
        signals.append({"type": "관망", "rule": 3, "text": "오후 폭등 → 추격 매수 금지", "details": [
            f"전일 종가 대비 {change_pct:+.2f}% (폭등 기준 ±{BIG_MOVE:.0f}% 이상)",
            "이미 크게 오른 상태에서 진입하면 단기 고점에 매수할 위험이 큽니다.",
        ]})

    # 4. 오후 폭락 -> 내일 매수 기회
    if phase in ("오후장", "마감전") and change_pct <= -BIG_MOVE:
        signals.append({"type": "대기", "rule": 4, "text": "오후 폭락 → 내일 매수 기회로 관찰", "details": [
            f"전일 종가 대비 {change_pct:+.2f}% (폭락 기준 ±{BIG_MOVE:.0f}% 이상)",
            "오늘 매수보다 내일 시가 흐름을 확인 후 진입 여부를 판단하는 것을 권장합니다.",
        ]})

    # 5. 개장 급등 -> 충동 매수 금지
    if phase == "개장초" and change_pct >= SURGE_MOVE:
        signals.append({"type": "관망", "rule": 5, "text": "개장 직후 급등 → 충동 매수 금지", "details": [
            f"전일 종가 대비 {change_pct:+.2f}% (급등 기준 ±{SURGE_MOVE:.0f}% 이상)",
            "개장 직후의 급격한 변동은 변동성이 커서 추세 확인 전 진입은 위험합니다.",
        ]})

    # 6. 마감 전 급등 -> 일부 익절
    if phase == "마감전" and change_pct >= SURGE_MOVE:
        signals.append({"type": "매도", "rule": 6, "text": "마감 전 급등 → 일부 익절 검토", "details": [
            f"전일 종가 대비 {change_pct:+.2f}% (급등 기준 ±{SURGE_MOVE:.0f}% 이상)",
            "마감 전 급등은 다음날 시가에 반납될 수 있어 일부 물량 익절을 검토합니다.",
        ]})

    # 애프터마켓(15:30~20:00, 시간외 거래) -> 규칙 3/4/5/6을 시간외 변동률에 적용
    if phase == "애프터마켓" and after_change_pct is not None:
        if after_change_pct >= BIG_MOVE:
            signals.append({"type": "관망", "rule": 3, "text": "애프터마켓 폭등 → 익일 추격 매수 금지", "details": [
                f"정규장 종가 대비 시간외 등락률 {after_change_pct:+.2f}% (폭등 기준 ±{BIG_MOVE:.0f}% 이상)",
                "시간외 급등은 익일 시가에 과열이 해소될 수 있어 추격 매수를 금지합니다.",
            ]})
        elif after_change_pct <= -BIG_MOVE:
            signals.append({"type": "대기", "rule": 4, "text": "애프터마켓 폭락 → 내일 매수 기회로 관찰", "details": [
                f"정규장 종가 대비 시간외 등락률 {after_change_pct:+.2f}% (폭락 기준 ±{BIG_MOVE:.0f}% 이상)",
                "내일 시가 흐름을 확인한 뒤 매수 여부를 판단하는 것을 권장합니다.",
            ]})
        elif after_change_pct >= SURGE_MOVE:
            signals.append({"type": "매도", "rule": 6, "text": "애프터마켓 급등 → 일부 익절 검토", "details": [
                f"정규장 종가 대비 시간외 등락률 {after_change_pct:+.2f}% (급등 기준 ±{SURGE_MOVE:.0f}% 이상)",
                "시간외 급등 구간에서 보유 물량 일부를 익절하는 것을 검토할 수 있습니다.",
            ]})
        elif after_change_pct <= -SURGE_MOVE:
            signals.append({"type": "관망", "rule": 5, "text": "애프터마켓 급락 → 추격 매도 자제", "details": [
                f"정규장 종가 대비 시간외 등락률 {after_change_pct:+.2f}% (급락 기준 ±{SURGE_MOVE:.0f}% 이상)",
                "시간외 급락에서 추격 매도하면 익일 반등 시 손실이 커질 수 있습니다.",
            ]})

    # 7. 저가 + 거래량 증가 (또는 RSI 과매도) -> 매수 관심
    near_low = bool(low_52) and close <= low_52 * (1 + NEAR_EXTREME)
    vol_spike = volume_ratio >= VOLUME_SPIKE
    oversold = has_rsi and rsi <= RSI_OVERSOLD
    if (near_low and vol_spike) or oversold:
        details = []
        if near_low:
            gap = (close - low_52) / low_52 * 100
            details.append(f"52주 최저가({low_52:,.0f}원) 대비 +{gap:.1f}% 구간 (저가권, ±{NEAR_EXTREME*100:.0f}% 이내)")
        if vol_spike:
            details.append(f"거래량이 20일 평균 대비 {volume_ratio:.1f}배 (급증 기준 {VOLUME_SPIKE:.1f}배 이상)")
        if oversold:
            details.append(f"RSI {rsi:.1f} ≤ {RSI_OVERSOLD} (과매도 구간, 기술적 반등 가능성)")
        if near_low and vol_spike:
            details.append("저점에서 거래량을 동반한 매집 신호로 해석되어 적극적인 매수를 검토할 수 있습니다.")
        else:
            details.append("단독 신호이므로 추가 하락 가능성도 있어 분할 매수로 접근하는 것을 권장합니다.")
        signals.append({"type": "매수", "rule": 7, "text": "저가권·과매도 신호 → 매수 관심", "details": details})

    # 8. 고가 + 거래량 증가 (또는 RSI 과매수) -> 매도 관심
    near_high = bool(high_52) and close >= high_52 * (1 - NEAR_EXTREME)
    overbought = has_rsi and rsi >= RSI_OVERBOUGHT
    if (near_high and vol_spike) or overbought:
        details = []
        if near_high:
            gap = (high_52 - close) / high_52 * 100
            details.append(f"52주 최고가({high_52:,.0f}원)에서 -{gap:.1f}% 구간 (고가권, ±{NEAR_EXTREME*100:.0f}% 이내)")
        if vol_spike:
            details.append(f"거래량이 20일 평균 대비 {volume_ratio:.1f}배 (급증 기준 {VOLUME_SPIKE:.1f}배 이상)")
        if overbought:
            details.append(f"RSI {rsi:.1f} ≥ {RSI_OVERBOUGHT} (과매수 구간, 기술적 되돌림 가능성)")
        if near_high and vol_spike:
            details.append("고점에서 거래량을 동반한 차익 매물 출회 신호로 해석되어 신속한 매도를 검토할 수 있습니다.")
        else:
            details.append("단독 신호이므로 추가 상승 가능성도 있어 일부 물량만 매도하는 것을 권장합니다.")
        signals.append({"type": "매도", "rule": 8, "text": "고가권·과매수 신호 → 매도 관심", "details": details})

    # 10. 지지선(20일선) 이탈 -> 손절 필수
    if pd.notna(ma20) and pd.notna(prev_ma20) and close < ma20 and prev_close >= prev_ma20:
        signals.append({"type": "매도", "rule": 10, "text": "20일 지지선 이탈 → 손절 필수", "details": [
            f"현재가 {close:,.0f}원 < 20일선 {ma20:,.0f}원 (전일까지는 지지선 위였음)",
            "20일선은 최근 한 달 추세를 보여주는 단기 지지선 역할을 합니다.",
            "지지선 이탈은 추세 전환 신호로, 추가 하락으로 이어질 가능성이 높아 손절이 필요합니다.",
        ]})

    # 9. 횡보장 -> 거래 금지 (다른 신호가 없을 때)
    if not signals and pd.notna(ma20) and ma20 and abs(close - ma20) / ma20 < 0.01 and abs(change_pct) < 1:
        signals.append({"type": "관망", "rule": 9, "text": "횡보장 → 신규 거래 자제", "details": [
            f"현재가 {close:,.0f}원이 20일선 {ma20:,.0f}원 인근(±1% 이내)에 위치",
            f"등락률 {change_pct:+.2f}%로 큰 움직임 없이 횡보 중입니다.",
            "방향성이 뚜렷하지 않은 구간에서는 신규 진입을 자제하는 것이 좋습니다.",
        ]})

    if not signals:
        details = []
        if phase == "애프터마켓":
            if after_change_pct is not None:
                details.append(
                    f"정규장 등락률 {change_pct:+.2f}% / 시간외 등락률 {after_change_pct:+.2f}% "
                    f"— 모두 급등·폭등 기준(±{SURGE_MOVE:.0f}%~±{BIG_MOVE:.0f}%) 미달"
                )
            else:
                details.append("애프터마켓 시간외 거래 데이터를 가져오지 못해 시간외 신호는 판단 보류")
        else:
            details.append(f"등락률 {change_pct:+.2f}% — 급등·폭등 기준(±{SURGE_MOVE:.0f}%~±{BIG_MOVE:.0f}%) 미달")

        if has_rsi:
            rsi_desc = "중립 구간(30~70)" if RSI_OVERSOLD < rsi < RSI_OVERBOUGHT else f"{rsi:.1f}"
            details.append(f"RSI {rsi:.1f} — {rsi_desc} (과매수 70 이상 / 과매도 30 이하에 해당하지 않음)")
        if high_52 and low_52:
            details.append(
                f"현재가 {close:,.0f}원 — 52주 범위({low_52:,.0f}~{high_52:,.0f}원)의 고가권·저가권"
                f"(상하단 ±{NEAR_EXTREME*100:.0f}%)에 해당하지 않음"
            )
        details.append(f"거래량 {volume_ratio:.1f}배 — 급증 기준({VOLUME_SPIKE:.1f}배 이상) 미달")
        if pd.notna(ma20):
            rel = "위" if close >= ma20 else "아래"
            details.append(f"20일선({ma20:,.0f}원) {rel}에 위치 — 지지선 이탈 없음")

        signals.append({"type": "관망", "rule": 0, "text": "10대 원칙 중 충족된 조건 없음 → 관망 권장", "details": details})

    priority = {"매도": 0, "매수": 1, "대기": 2, "보유": 2, "관망": 3}
    signals.sort(key=lambda s: priority.get(s["type"], 4))
    return signals


def build_summary(signals, news):
    top = signals[0]
    if top["rule"]:
        text = f"[10대 원칙 - 규칙 {top['rule']}] {top['text']}"
    else:
        text = top["text"]

    if news:
        text += f" / 최근 기사: \"{news[0]['title']}\""
        if news[0].get("source"):
            text += f" ({news[0]['source']})"

    return text


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/rules")
def rules():
    return jsonify(TRADING_RULES)


@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip().lower()
    if not q:
        return jsonify([])
    tokens = q.split()
    matches = [
        item for item in STOCK_LIST
        if all(t in item["name"].lower() or t in item["code"] for t in tokens)
    ]
    # 이름이 검색어로 시작하는 항목을 우선 정렬 (구글 검색처럼 더 관련성 높은 결과를 위로)
    matches.sort(key=lambda item: not item["name"].lower().startswith(q))
    return jsonify(matches[:10])


@app.route("/api/news")
def news_endpoint():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    return jsonify(fetch_news(q, limit=5))


@app.route("/api/analyze")
def analyze():
    raw = request.args.get("tickers", "")
    tickers = [t.strip() for t in raw.split(",") if t.strip()]

    phase = get_market_phase()
    macro = fetch_macro()
    witching = witching_day_info()

    results = []
    for ticker in tickers:
        try:
            symbol, chart = fetch_chart(ticker)
            if not chart:
                results.append({"ticker": ticker, "error": "데이터를 찾을 수 없습니다"})
                continue

            meta = chart["meta"]
            quote = chart["indicators"]["quote"][0]
            df = pd.DataFrame({
                "close": quote["close"],
                "volume": quote["volume"],
            }, index=pd.to_datetime(chart["timestamp"], unit="s"))
            df = df.dropna(subset=["close"])
            if len(df) < 2:
                results.append({"ticker": ticker, "error": "데이터가 충분하지 않습니다"})
                continue

            df["RSI"] = calc_rsi(df["close"])
            df["MA5"] = df["close"].rolling(5).mean()
            df["MA20"] = df["close"].rolling(20).mean()

            last = df.iloc[-1]
            prev = df.iloc[-2]

            close = float(meta.get("regularMarketPrice", last["close"]))
            prev_close = float(meta.get("previousClose", prev["close"]))
            change_pct = (close - prev_close) / prev_close * 100

            high_52 = float(meta.get("fiftyTwoWeekHigh", df["close"].max()))
            low_52 = float(meta.get("fiftyTwoWeekLow", df["close"].min()))

            avg_volume = df["volume"].tail(20).mean()
            volume = float(meta.get("regularMarketVolume", last["volume"]))

            # Yahoo Finance는 15~20분 지연될 수 있어, 국내 종목은 지연 0인 네이버 실시간
            # 시세로 현재가/등락률/거래량/애프터마켓 데이터를 덮어씀
            realtime = fetch_naver_realtime(ticker) if ticker.isdigit() else None
            if realtime:
                close = realtime["close"]
                prev_close = realtime["prev_close"]
                change_pct = realtime["change_pct"]
                volume = realtime["volume"]

            volume_ratio = (volume / avg_volume) if avg_volume else 0.0

            after_market = realtime["after_market"] if realtime else None
            after_change_pct = after_market["change_pct"] if after_market else None

            signals = apply_rules(
                phase, change_pct, close, last["MA20"],
                prev_close, prev["MA20"], volume_ratio, high_52, low_52,
                after_change_pct, last["RSI"],
            )

            known = STOCK_BY_CODE.get(ticker)
            name = known["name"] if known else (meta.get("longName") or meta.get("shortName") or symbol)

            news = fetch_news(f"{name} 주가", limit=3)
            summary = build_summary(signals, news)

            naver_info = fetch_naver_integration(ticker) if ticker.isdigit() else None
            assessment = build_assessment(close, high_52, low_52, macro, naver_info, news, witching)

            results.append({
                "ticker": ticker,
                "symbol": symbol,
                "name": name,
                "price": int(close),
                "change_pct": round(change_pct, 2),
                "volume": int(volume),
                "volume_ratio": round(volume_ratio, 2),
                "rsi": round(float(last["RSI"]), 1) if pd.notna(last["RSI"]) else None,
                "ma5": round(float(last["MA5"])) if pd.notna(last["MA5"]) else None,
                "ma20": round(float(last["MA20"])) if pd.notna(last["MA20"]) else None,
                "high_52": int(high_52),
                "low_52": int(low_52),
                "date": df.index[-1].strftime("%Y-%m-%d"),
                "signals": signals,
                "summary": summary,
                "news": news,
                "after_market": after_market,
                "assessment": assessment,
            })
        except Exception as e:
            results.append({"ticker": ticker, "error": str(e)})

    return jsonify({
        "phase": phase,
        "updated": now_kst().strftime("%Y-%m-%d %H:%M:%S"),
        "macro": macro,
        "witching": witching,
        "results": results,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5190))
    app.run(host="0.0.0.0", port=port, debug=False)
