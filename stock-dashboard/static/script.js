const STORAGE_KEY = "stock-dashboard-tickers";

let tickers = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let timer = null;
let searchDebounce = null;

const cardsEl = document.getElementById("cards");
const phaseEl = document.getElementById("phase");
const updatedEl = document.getElementById("updated");
const macroEl = document.getElementById("macro");
const portfolioEl = document.getElementById("portfolio");
const inputEl = document.getElementById("tickerInput");
const suggestionsEl = document.getElementById("suggestions");
const intervalSelect = document.getElementById("intervalSelect");
const rulesListEl = document.getElementById("rulesList");

document.getElementById("addBtn").addEventListener("click", () => addFromInput());
document.getElementById("refreshBtn").addEventListener("click", load);
intervalSelect.addEventListener("change", resetTimer);

inputEl.addEventListener("input", onSearchInput);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addFromInput();
  }
  if (e.key === "Escape") hideSuggestions();
});
document.addEventListener("click", (e) => {
  if (!suggestionsEl.contains(e.target) && e.target !== inputEl) hideSuggestions();
});

function onSearchInput() {
  const q = inputEl.value.trim();
  if (searchDebounce) clearTimeout(searchDebounce);

  // 쉼표로 여러 종목코드를 직접 입력하는 경우는 검색하지 않음
  if (!q || q.includes(",") || /^\d+$/.test(q)) {
    hideSuggestions();
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const matches = await res.json();
      renderSuggestions(matches);
    } catch (e) {
      hideSuggestions();
    }
  }, 200);
}

function renderSuggestions(matches) {
  if (!matches.length) {
    hideSuggestions();
    return;
  }
  suggestionsEl.innerHTML = matches.map((m) => `
    <div class="suggestion-item" data-code="${m.code}">
      <span>${m.name}</span>
      <span class="s-code">${m.code}</span>
    </div>
  `).join("");
  suggestionsEl.classList.add("show");

  suggestionsEl.querySelectorAll(".suggestion-item").forEach((el) => {
    el.addEventListener("click", () => {
      addTicker(el.dataset.code);
      inputEl.value = "";
      hideSuggestions();
    });
  });
}

function hideSuggestions() {
  suggestionsEl.classList.remove("show");
  suggestionsEl.innerHTML = "";
}

function addFromInput() {
  const value = inputEl.value.trim();
  if (!value) return;

  // 쉼표로 구분된 종목코드 직접 입력
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    addTicker(p);
  }
  inputEl.value = "";
  hideSuggestions();
  load();
}

function addTicker(code) {
  if (!tickers.includes(code)) {
    tickers.push(code);
    saveTickers();
  }
  load();
}

function removeTicker(ticker) {
  tickers = tickers.filter((t) => t !== ticker);
  saveTickers();
  load();
}

function saveTickers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

function resetTimer() {
  if (timer) clearInterval(timer);
  const ms = parseInt(intervalSelect.value, 10);
  if (ms > 0) {
    timer = setInterval(load, ms);
  }
}

async function loadRules() {
  try {
    const res = await fetch("/api/rules");
    const rules = await res.json();
    rulesListEl.innerHTML = rules.map((r) => `<li>${r.text}</li>`).join("");
  } catch (e) {
    rulesListEl.innerHTML = "";
  }
}

async function load() {
  if (tickers.length === 0) {
    cardsEl.innerHTML = '<div class="empty">종목명(한글) 또는 종목코드를 입력해 추가해보세요. (예: 삼성전자, 005930)</div>';
    phaseEl.textContent = "-";
    updatedEl.textContent = "";
    macroEl.innerHTML = "";
    portfolioEl.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(`/api/analyze?tickers=${encodeURIComponent(tickers.join(","))}`);
    const data = await res.json();
    phaseEl.textContent = data.phase;
    updatedEl.textContent = `업데이트: ${data.updated} (기준일: ${data.results[0] && data.results[0].date ? data.results[0].date : "-"})`;
    renderMacro(data.macro, data.witching);
    renderPortfolio(data.results);
    render(data.results);
  } catch (e) {
    cardsEl.innerHTML = `<div class="empty">데이터 조회 실패: ${e}</div>`;
  }
}

function changeClassOf(v) {
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}

function renderMacro(macro, witching) {
  if (!macroEl) return;
  if (!macro) {
    macroEl.innerHTML = "";
    return;
  }
  const items = [];
  if (macro.kospi) {
    items.push(`<span class="macro-item">코스피 ${macro.kospi.value.toLocaleString()} <span class="${changeClassOf(macro.kospi.change_pct)}">(5일 ${macro.kospi.change_pct > 0 ? "+" : ""}${macro.kospi.change_pct}%)</span></span>`);
  }
  if (macro.usdkrw) {
    items.push(`<span class="macro-item">원/달러 ${macro.usdkrw.value.toLocaleString()} <span class="${changeClassOf(macro.usdkrw.change_pct)}">(5일 ${macro.usdkrw.change_pct > 0 ? "+" : ""}${macro.usdkrw.change_pct}%)</span></span>`);
  }
  if (macro.us10y) {
    items.push(`<span class="macro-item">美 10년물 ${macro.us10y.value}% <span class="${changeClassOf(macro.us10y.change_pct)}">(5일 ${macro.us10y.change_pct > 0 ? "+" : ""}${macro.us10y.change_pct}%)</span></span>`);
  }
  if (witching) {
    const label = witching.days_until === 0 ? "오늘 네 마녀의 날" : `${witching.date} 네 마녀의 날 예정`;
    items.push(`<span class="macro-item witching">⚠ ${label}</span>`);
  }
  macroEl.innerHTML = items.join("");
}

function overallClass(overall) {
  if (overall === "매수 관심") return "buy";
  if (overall === "매도·비중 축소 검토") return "sell";
  return "neutral";
}

function catClass(score) {
  return score > 0 ? "pos" : score < 0 ? "neg" : "neu";
}

function catIcon(score) {
  return score > 0 ? "▲" : score < 0 ? "▼" : "■";
}

function fmtFlowDate(bizdate) {
  if (!bizdate || bizdate.length !== 8) return bizdate;
  const y = Number(bizdate.slice(0, 4));
  const m = Number(bizdate.slice(4, 6));
  const d = Number(bizdate.slice(6, 8));
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const wd = days[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}

function fmtFlowAmount(amount) {
  const eok = amount / 1e8;
  const sign = eok > 0 ? "+" : "";
  return `${sign}${eok.toFixed(1)}억`;
}

function flowCellClass(quant) {
  return quant > 0 ? "flow-buy" : quant < 0 ? "flow-sell" : "";
}

function renderFlowDaily(daily) {
  if (!daily || !daily.length) return "";
  const rows = daily.map((d) => `
    <tr>
      <td>${fmtFlowDate(d.date)}</td>
      ${["foreign", "organ", "individual"].map((key) => `
        <td class="${flowCellClass(d[key].quant)}">
          <div class="flow-quant">${d[key].quant > 0 ? "+" : ""}${d[key].quant.toLocaleString()}주</div>
          <div class="flow-amount">${fmtFlowAmount(d[key].amount)}</div>
        </td>
      `).join("")}
    </tr>
  `).join("");
  return `
    <details class="flow-daily">
      <summary>일별 수급 보기 (최근 ${daily.length}거래일)</summary>
      <table class="flow-table">
        <thead>
          <tr><th>날짜</th><th>외국인</th><th>기관</th><th>개인</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
  `;
}

function renderAssessment(assessment) {
  if (!assessment) return "";
  const scoreText = assessment.score > 0 ? `+${assessment.score}` : `${assessment.score}`;
  return `
    <div class="assessment">
      <div class="assessment-head">
        <span class="assessment-badge ${overallClass(assessment.overall)}">${assessment.overall}</span>
        <span class="assessment-score">종합 점수 ${scoreText} / ±5</span>
      </div>
      <div class="assessment-cats">
        ${assessment.categories.map((c) => `
          <div class="cat ${catClass(c.score)}">
            <div class="cat-head">
              <span class="cat-icon">${catIcon(c.score)}</span>
              <span class="cat-name">${c.name}</span>
              <span class="cat-label">${c.label}</span>
            </div>
            <div class="cat-detail">${c.detail}</div>
            ${c.daily ? renderFlowDaily(c.daily) : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPortfolio(results) {
  if (!portfolioEl) return;
  const valid = results.filter((r) => !r.error && r.assessment);
  if (!valid.length) {
    portfolioEl.innerHTML = "";
    return;
  }

  const counts = { "매수 관심": 0, "중립 (보유/관망)": 0, "매도·비중 축소 검토": 0 };
  let totalScore = 0;
  valid.forEach((r) => {
    counts[r.assessment.overall] = (counts[r.assessment.overall] || 0) + 1;
    totalScore += r.assessment.score;
  });
  const avg = totalScore / valid.length;
  const avgText = `${avg > 0 ? "+" : ""}${avg.toFixed(1)}`;

  const itemsHtml = valid.map((r) => `
    <div class="portfolio-item" data-ticker="${r.ticker}">
      <span class="portfolio-name">${r.name}</span>
      <span class="portfolio-price">${r.price.toLocaleString()}원 <span class="${changeClassOf(r.change_pct)}">${r.change_pct > 0 ? "+" : ""}${r.change_pct}%</span></span>
      <span class="portfolio-badge ${overallClass(r.assessment.overall)}">${r.assessment.overall} (${r.assessment.score > 0 ? "+" : ""}${r.assessment.score})</span>
    </div>
  `).join("");

  portfolioEl.innerHTML = `
    <div class="portfolio-head">
      <div class="portfolio-title">📁 포트폴리오 개요 (${valid.length}종목)</div>
      <div class="portfolio-summary">
        <span class="portfolio-count buy">매수 관심 ${counts["매수 관심"]}</span>
        <span class="portfolio-count neutral">중립 ${counts["중립 (보유/관망)"]}</span>
        <span class="portfolio-count sell">매도·비중 축소 ${counts["매도·비중 축소 검토"]}</span>
        <span class="portfolio-avg">평균 점수 ${avgText}</span>
      </div>
    </div>
    <div class="portfolio-list">${itemsHtml}</div>
  `;

  portfolioEl.querySelectorAll(".portfolio-item").forEach((el) => {
    el.addEventListener("click", () => {
      const card = cardsEl.querySelector(`[data-ticker-card="${el.dataset.ticker}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function rsiSub(rsi) {
  if (rsi == null) return "";
  if (rsi >= 70) return '<div class="sub overbought">과매수</div>';
  if (rsi <= 30) return '<div class="sub oversold">과매도</div>';
  return '<div class="sub neutral">중립</div>';
}

function render(results) {
  cardsEl.innerHTML = "";
  for (const item of results) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.tickerCard = item.ticker;

    if (item.error) {
      card.innerHTML = `
        <div class="card-head">
          <div>
            <div class="card-title">${item.ticker}</div>
            <div class="error-card">${item.error}</div>
          </div>
          <button class="card-remove" data-ticker="${item.ticker}">&times;</button>
        </div>`;
    } else {
      const changeClass = item.change_pct > 0 ? "up" : item.change_pct < 0 ? "down" : "flat";
      const changeSign = item.change_pct > 0 ? "+" : "";

      const signalsHtml = item.signals.map((s) => `
        <div class="signal">
          <div class="signal-head">
            <span class="signal-badge ${s.type}">${s.type}</span>
            <span class="signal-text">${s.rule > 0 ? `규칙 ${s.rule}: ` : ""}${s.text}</span>
          </div>
          ${(s.details && s.details.length) ? `
            <ul class="signal-details">
              ${s.details.map((d) => `<li>${d}</li>`).join("")}
            </ul>
          ` : ""}
        </div>
      `).join("");

      const afterHtml = item.after_market ? `
        <div class="after-market">
          <span class="after-label">⏰ 애프터마켓(시간외)</span>
          <span class="after-price">${item.after_market.price.toLocaleString()}원</span>
          <span class="change ${item.after_market.change_pct > 0 ? "up" : item.after_market.change_pct < 0 ? "down" : "flat"}">
            ${item.after_market.change_pct > 0 ? "+" : ""}${item.after_market.change_pct}%
          </span>
        </div>
      ` : "";

      const newsHtml = (item.news && item.news.length) ? `
        <div class="news-list">
          <div class="news-title">📰 실시간 관련 기사</div>
          ${item.news.map((n) => `
            <div class="news-item">
              <a href="${n.link}" target="_blank" rel="noopener noreferrer">${n.title}</a>
              <span class="news-meta">${n.source || ""}</span>
            </div>
          `).join("")}
        </div>
      ` : "";

      const assessmentHtml = renderAssessment(item.assessment);

      card.innerHTML = `
        <div class="card-head">
          <div>
            <div class="card-title">${item.name}</div>
            <div class="card-ticker">${item.ticker}</div>
          </div>
          <button class="card-remove" data-ticker="${item.ticker}">&times;</button>
        </div>
        <div class="price-row">
          <div class="price">${item.price.toLocaleString()}원</div>
          <div class="change ${changeClass}">${changeSign}${item.change_pct}%</div>
        </div>
        ${afterHtml}
        <div class="metrics">
          <div class="metric">
            <div class="label">RSI(14)</div>
            <div class="value">${item.rsi ?? "-"}</div>
            ${rsiSub(item.rsi)}
          </div>
          <div class="metric"><div class="label">5일선</div><div class="value">${item.ma5 ? item.ma5.toLocaleString() : "-"}</div></div>
          <div class="metric"><div class="label">20일선</div><div class="value">${item.ma20 ? item.ma20.toLocaleString() : "-"}</div></div>
          <div class="metric"><div class="label">거래량비</div><div class="value">${item.volume_ratio}x</div></div>
          <div class="metric"><div class="label">52주 최고</div><div class="value">${item.high_52.toLocaleString()}</div></div>
          <div class="metric"><div class="label">52주 최저</div><div class="value">${item.low_52.toLocaleString()}</div></div>
        </div>
        ${assessmentHtml}
        ${newsHtml}
        <details class="chart-ref">
          <summary>📊 차트/시간대 참고 (10대 원칙, 보조 지표)</summary>
          <div class="summary">${item.summary}</div>
          <div class="signals">${signalsHtml}</div>
        </details>
      `;
    }

    cardsEl.appendChild(card);
  }

  cardsEl.querySelectorAll(".card-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeTicker(btn.dataset.ticker));
  });
}

loadRules();
load();
resetTimer();
