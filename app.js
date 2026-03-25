const PROGRESS_KEY = "kid-vocab-progress-v1";
const WRONG_NOTE_KEY = "kid-vocab-wrong-note-v1";

const state = {
  data: null,
  selectedSection: "learn",
  learn: {
    setFilter: "single",
    query: "",
    selectedSetId: null,
    currentIndex: 0,
    revealed: false,
    dailyDeckCards: null,
    showSetBrowser: false,
  },
  quiz: {
    scope: "selected-set",
    type: "random",
    direction: "random",
    session: null,
    wrongFilter: null,
  },
  review: {
    filter: "all",
    customDate: "",
  },
  progress: loadJsonStorage(PROGRESS_KEY),
  wrongNote: normalizeWrongNote(loadJsonStorage(WRONG_NOTE_KEY)),
};

const sectionOptions = [
  { id: "learn", label: "학습" },
  { id: "quiz", label: "퀴즈" },
  { id: "review", label: "복습" },
];

const learnSetFilterOptions = [
  { id: "single", label: "DAY" },
  { id: "review", label: "복습" },
  { id: "range", label: "누적" },
  { id: "all", label: "전체" },
];

const quizScopeOptions = [
  { id: "selected-set", label: "현재 세트" },
  { id: "today", label: "오늘 학습" },
  { id: "wrong", label: "오답만" },
];

const quizTypeOptions = [
  { id: "random", label: "섞어서" },
  { id: "objective", label: "객관식" },
  { id: "subjective", label: "주관식" },
];

const quizDirectionOptions = [
  { id: "random", label: "방향 섞기" },
  { id: "word-to-meaning", label: "영어 보고 뜻" },
  { id: "meaning-to-word", label: "뜻 보고 영어" },
];

const reviewFilterOptions = [
  { id: "all", label: "전체 오답" },
  { id: "today", label: "오늘 틀림" },
  { id: "recent7", label: "최근 7일" },
  { id: "date", label: "날짜 선택" },
];

function loadJsonStorage(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "{}");
  } catch (error) {
    return {};
  }
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function saveJsonStorage(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function saveProgress() {
  saveJsonStorage(PROGRESS_KEY, state.progress);
}

function saveWrongNote() {
  saveJsonStorage(WRONG_NOTE_KEY, state.wrongNote);
}

function normalizeWrongNote(rawValue) {
  const normalized = {};

  Object.entries(rawValue || {}).forEach(([key, item]) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const wrongByDate = {};

    if (item.wrongByDate && typeof item.wrongByDate === "object") {
      Object.entries(item.wrongByDate).forEach(([dateKey, count]) => {
        if (dateKey && Number(count) > 0) {
          wrongByDate[dateKey] = Number(count);
        }
      });
    }

    if (!Object.keys(wrongByDate).length && Array.isArray(item.wrongDates)) {
      item.wrongDates.forEach((dateKey) => {
        if (!dateKey) {
          return;
        }
        wrongByDate[dateKey] = (wrongByDate[dateKey] || 0) + 1;
      });
    }

    const fallbackDate = item.lastWrongAt ? toDateKey(new Date(item.lastWrongAt)) : toDateKey(new Date());

    if (!Object.keys(wrongByDate).length) {
      wrongByDate[fallbackDate] = Math.max(1, Number(item.wrongCount) || 1);
    }

    const wrongCount =
      Object.values(wrongByDate).reduce((sum, count) => sum + Number(count || 0), 0) ||
      Math.max(1, Number(item.wrongCount) || 1);

    normalized[key] = {
      setId: String(item.setId || "").trim(),
      cardId: String(item.cardId || "").trim(),
      setTitle: item.setTitle || "",
      word: item.word || "",
      meaning: item.meaning || "",
      audioUrl: item.audioUrl || null,
      wrongCount,
      lastWrongAt: item.lastWrongAt || new Date().toISOString(),
      lastPromptType: item.lastPromptType || "",
      lastSelected: item.lastSelected || "",
      wrongByDate,
    };
  });

  return normalized;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningAnswerParts(value) {
  return String(value || "")
    .split(/[;,/]| 또는 |\n/g)
    .map((item) => normalizeAnswer(item))
    .filter(Boolean);
}

function isCorrectSubjectiveAnswer(promptType, userAnswer, answerText) {
  const normalizedUser = normalizeAnswer(userAnswer);

  if (!normalizedUser) {
    return false;
  }

  if (promptType === "meaning-to-word") {
    return normalizedUser === normalizeAnswer(answerText);
  }

  const normalizedAnswer = normalizeAnswer(answerText);
  const answerParts = getMeaningAnswerParts(answerText);

  return (
    normalizedUser === normalizedAnswer ||
    answerParts.includes(normalizedUser) ||
    answerParts.some((part) => part.includes(normalizedUser) || normalizedUser.includes(part))
  );
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateLabel(dateKey) {
  if (!dateKey) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(fromDateKey(dateKey));
}

function formatDateTime(isoText) {
  if (!isoText) {
    return "";
  }

  const date = new Date(isoText);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getCardKey(setId, cardId) {
  return `${setId}:${cardId}`;
}

function getAllSets() {
  return state.data?.sets || [];
}

function getLearnVisibleSets() {
  return getAllSets().filter((setItem) => {
    const typeMatch =
      state.learn.setFilter === "all" ||
      (state.learn.setFilter === "single" && setItem.kind === "single") ||
      (state.learn.setFilter === "range" && setItem.kind === "range") ||
      (state.learn.setFilter === "review" && setItem.kind === "review");

    if (!typeMatch) {
      return false;
    }

    if (!state.learn.query) {
      return true;
    }

    const haystack = normalize(`${setItem.title} ${setItem.previewWords.join(" ")}`);
    return haystack.includes(normalize(state.learn.query));
  });
}

function ensureSelectedSet() {
  const selectedExists = getAllSets().some((setItem) => setItem.id === state.learn.selectedSetId);

  if (!selectedExists) {
    state.learn.selectedSetId = getLearnVisibleSets()[0]?.id || getAllSets()[0]?.id || null;
  }

  const visible = getLearnVisibleSets();

  if (visible.length && !visible.some((setItem) => setItem.id === state.learn.selectedSetId)) {
    state.learn.selectedSetId = visible[0].id;
    state.learn.currentIndex = 0;
    state.learn.revealed = false;
  }
}

function getSelectedSet() {
  ensureSelectedSet();
  return getAllSets().find((setItem) => setItem.id === state.learn.selectedSetId) || null;
}

function getCompactSetTitle(titleOrSet, kindOverride) {
  const title = typeof titleOrSet === "string" ? titleOrSet : titleOrSet?.title || "";
  const kind = typeof titleOrSet === "string" ? kindOverride : titleOrSet?.kind;
  const prefix = state.data?.folderTitle ? `${state.data.folderTitle} - ` : "";
  const compact = String(title).startsWith(prefix) ? String(title).slice(prefix.length) : String(title);
  const dayPart = compact.match(/DAY\s*(\d+(?:\s*-\s*\d+)?)/i)?.[1]?.replace(/\s+/g, "");

  if (kind === "single" && dayPart) {
    return `DAY ${dayPart}`;
  }

  if (kind === "range" && dayPart) {
    return `누적 ${dayPart}`;
  }

  if (kind === "review" && dayPart) {
    return `복습 ${dayPart}`;
  }

  return compact.replace(/REVIEW TEST/gi, "복습").replace(/\s+/g, " ").trim();
}

function getLearnModeLabel(kind) {
  if (kind === "review") {
    return "복습";
  }

  if (kind === "range") {
    return "누적";
  }

  return "DAY";
}

function getSetBadgeLabel(kind) {
  if (kind === "review") {
    return "복습";
  }

  if (kind === "range") {
    return "누적";
  }

  return "DAY";
}

function withSetContext(setItem) {
  return (setItem.cards || []).map((card) => ({
    ...card,
    setId: setItem.id,
    setTitle: setItem.title,
    setKind: setItem.kind,
  }));
}

function getAllCards() {
  return getAllSets().flatMap(withSetContext);
}

function getSinglePracticeCards() {
  return getAllSets()
    .filter((setItem) => setItem.kind === "single")
    .flatMap(withSetContext);
}

function isKnownCard(setId, cardId) {
  return Boolean(state.progress[getCardKey(setId, cardId)]);
}

function pickRandom(cards, count) {
  const copy = [...cards];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy.slice(0, count);
}

function rebuildDailyDeck() {
  const baseCards = getSinglePracticeCards();
  const unknownCards = baseCards.filter((card) => !isKnownCard(card.setId, card.id));
  const pool = unknownCards.length ? unknownCards : baseCards;
  state.learn.dailyDeckCards = pickRandom(pool, Math.min(10, pool.length));
}

function getDailyDeckCards() {
  if (!state.learn.dailyDeckCards) {
    rebuildDailyDeck();
  }

  return state.learn.dailyDeckCards || [];
}

function getLearnDeck() {
  const selectedSet = getSelectedSet();

  if (!selectedSet) {
    return { title: "", kind: "single", cards: [] };
  }

  return {
    title: selectedSet.title,
    kind: selectedSet.kind,
    cards: withSetContext(selectedSet),
  };
}

function clampLearnIndex() {
  const deck = getLearnDeck();

  if (!deck.cards.length) {
    state.learn.currentIndex = 0;
    return;
  }

  if (state.learn.currentIndex >= deck.cards.length) {
    state.learn.currentIndex = deck.cards.length - 1;
  }

  if (state.learn.currentIndex < 0) {
    state.learn.currentIndex = 0;
  }
}

function getCurrentLearnCard() {
  const deck = getLearnDeck();
  return {
    deck,
    card: deck.cards[state.learn.currentIndex] || null,
  };
}

function getWrongNoteCards() {
  const liveCardMap = new Map(getAllCards().map((card) => [getCardKey(card.setId, card.id), card]));
  const todayKey = toDateKey(new Date());

  return Object.entries(state.wrongNote)
    .map(([key, savedItem]) => {
      const liveCard = liveCardMap.get(key);
      const wrongByDate = { ...(savedItem.wrongByDate || {}) };
      const wrongDates = Object.keys(wrongByDate).sort((left, right) => right.localeCompare(left));
      const wrongCount =
        Object.values(wrongByDate).reduce((sum, count) => sum + Number(count || 0), 0) || savedItem.wrongCount || 0;
      const merged = liveCard
        ? { ...liveCard, ...savedItem }
        : {
            setId: savedItem.setId,
            id: savedItem.cardId,
            setTitle: savedItem.setTitle,
            word: savedItem.word,
            meaning: savedItem.meaning,
            audioUrl: savedItem.audioUrl || null,
          };

      return {
        ...merged,
        wrongKey: key,
        wrongByDate,
        wrongDates,
        wrongCount,
        wrongDayCount: wrongDates.length,
        todayWrongCount: wrongByDate[todayKey] || 0,
      };
    })
    .sort((left, right) => {
      if (right.wrongCount !== left.wrongCount) {
        return right.wrongCount - left.wrongCount;
      }

      return String(right.lastWrongAt).localeCompare(String(left.lastWrongAt));
    });
}

function getRecentDateKeys(days) {
  const keys = [];
  const current = new Date();

  for (let index = 0; index < days; index += 1) {
    const date = new Date(current);
    date.setDate(current.getDate() - index);
    keys.push(toDateKey(date));
  }

  return keys;
}

function getReviewFilterConfig() {
  if (state.review.filter === "date") {
    return {
      mode: "date",
      dateKey: state.review.customDate || toDateKey(new Date()),
    };
  }

  return { mode: state.review.filter };
}

function getWrongFilterLabel(filterConfig) {
  const config = filterConfig || { mode: "all" };

  if (config.mode === "today") {
    return "오늘 틀린 오답";
  }

  if (config.mode === "recent7") {
    return "최근 7일 오답";
  }

  if (config.mode === "date") {
    return `${formatDateLabel(config.dateKey)} 오답`;
  }

  if (config.mode === "card") {
    return "선택한 카드 오답";
  }

  return "전체 오답";
}

function getWrongCardsByFilter(filterConfig = { mode: "all" }) {
  const items = getWrongNoteCards();

  if (filterConfig.mode === "card") {
    return items.filter((item) => item.wrongKey === filterConfig.key);
  }

  if (filterConfig.mode === "today") {
    const todayKey = toDateKey(new Date());
    return items.filter((item) => item.wrongByDate[todayKey]);
  }

  if (filterConfig.mode === "recent7") {
    const recentKeys = new Set(getRecentDateKeys(7));
    return items.filter((item) => item.wrongDates.some((dateKey) => recentKeys.has(dateKey)));
  }

  if (filterConfig.mode === "date") {
    return items.filter((item) => item.wrongByDate[filterConfig.dateKey]);
  }

  return items;
}

function addWrongNote(card, promptType, selectedText) {
  const key = getCardKey(card.setId, card.id);
  const existing = state.wrongNote[key];
  const todayKey = toDateKey(new Date());
  const wrongByDate = { ...(existing?.wrongByDate || {}) };

  wrongByDate[todayKey] = (wrongByDate[todayKey] || 0) + 1;

  state.wrongNote[key] = {
    setId: card.setId,
    cardId: card.id,
    setTitle: card.setTitle,
    word: card.word,
    meaning: card.meaning,
    audioUrl: card.audioUrl || null,
    wrongCount: Object.values(wrongByDate).reduce((sum, count) => sum + count, 0),
    lastWrongAt: new Date().toISOString(),
    lastPromptType: promptType,
    lastSelected: selectedText,
    wrongByDate,
  };

  saveWrongNote();
}

function removeWrongNoteByKey(key) {
  delete state.wrongNote[key];
  saveWrongNote();
}

function removeWrongNote(card) {
  removeWrongNoteByKey(getCardKey(card.setId, card.id));
}

function clearWrongNote() {
  state.wrongNote = {};
  saveWrongNote();
}

function getQuizScopeCards() {
  if (state.quiz.scope === "today") {
    return getDailyDeckCards();
  }

  if (state.quiz.scope === "wrong") {
    return getWrongCardsByFilter(state.quiz.wrongFilter || { mode: "all" });
  }

  return getLearnDeck().cards;
}

function getQuizScopeLabel() {
  if (state.quiz.scope === "today") {
    return "오늘 학습";
  }

  if (state.quiz.scope === "wrong") {
    return getWrongFilterLabel(state.quiz.wrongFilter || { mode: "all" });
  }

  return getCompactSetTitle(getSelectedSet()) || "현재 세트";
}

function makeChoices(correctText, distractorTexts) {
  const uniqueDistractors = [...new Set(distractorTexts.filter((text) => text && text !== correctText))];
  const pickedDistractors = pickRandom(uniqueDistractors, Math.min(3, uniqueDistractors.length));
  return pickRandom([correctText, ...pickedDistractors], pickedDistractors.length + 1);
}

function buildQuizQuestion() {
  const session = state.quiz.session;

  if (!session || session.finished) {
    return;
  }

  const currentCard = session.queue[session.index];

  if (!currentCard) {
    session.finished = true;
    return;
  }

  const formatType =
    state.quiz.type === "random" ? (Math.random() < 0.5 ? "objective" : "subjective") : state.quiz.type;
  const promptType =
    state.quiz.direction === "random"
      ? Math.random() < 0.5
        ? "word-to-meaning"
        : "meaning-to-word"
      : state.quiz.direction;

  const pool = getQuizScopeCards().length >= 4 ? getQuizScopeCards() : getAllCards();
  const answerText = promptType === "word-to-meaning" ? currentCard.meaning : currentCard.word;
  const distractorTexts = pool
    .filter((card) => getCardKey(card.setId, card.id) !== getCardKey(currentCard.setId, currentCard.id))
    .map((card) => (promptType === "word-to-meaning" ? card.meaning : card.word));

  session.currentQuestion = {
    card: currentCard,
    formatType,
    promptType,
    promptText: promptType === "word-to-meaning" ? currentCard.word : currentCard.meaning,
    answerText,
    choices: formatType === "objective" ? makeChoices(answerText, distractorTexts) : [],
    selectedText: "",
  };

  session.answered = false;
  session.feedback =
    formatType === "objective"
      ? "정답을 골라 보세요."
      : promptType === "meaning-to-word"
        ? "영어 단어를 직접 써 보세요."
        : "뜻을 직접 써 보세요.";
}

function resetQuizSession() {
  const cards = getQuizScopeCards();
  const queue = pickRandom(cards, cards.length);

  state.quiz.session = {
    queue,
    index: 0,
    correct: 0,
    wrong: 0,
    answered: false,
    finished: queue.length === 0,
    feedback: "",
    currentQuestion: null,
  };

  if (queue.length) {
    buildQuizQuestion();
  }
}

function answerQuiz(answerText) {
  const session = state.quiz.session;

  if (!session || session.finished || session.answered) {
    return;
  }

  const question = session.currentQuestion;
  const correct =
    question.formatType === "subjective"
      ? isCorrectSubjectiveAnswer(question.promptType, answerText, question.answerText)
      : answerText === question.answerText;

  question.selectedText = answerText;
  session.answered = true;

  if (correct) {
    session.correct += 1;
    session.feedback = `정답! ${question.card.word} = ${question.card.meaning}`;

    if (state.quiz.scope === "wrong") {
      removeWrongNote(question.card);
    }
  } else {
    session.wrong += 1;
    session.feedback = `아쉬워요. 정답은 ${question.answerText}`;
    addWrongNote(question.card, question.promptType, answerText);
  }

  render();
}

function nextQuizQuestion() {
  const session = state.quiz.session;

  if (!session) {
    resetQuizSession();
    render();
    return;
  }

  if (session.finished) {
    resetQuizSession();
    render();
    return;
  }

  if (!session.answered) {
    session.feedback =
      session.currentQuestion?.formatType === "subjective"
        ? "먼저 답을 써 주세요."
        : "먼저 답을 골라 주세요.";
    render();
    return;
  }

  session.index += 1;

  if (session.index >= session.queue.length) {
    session.finished = true;
    render();
    return;
  }

  buildQuizQuestion();
  render();
}

function renderTabs(containerId, options, activeId, onClick) {
  const container = document.querySelector(containerId);
  container.innerHTML = options
    .map(
      (option) => `
        <button
          class="nav-tab ${option.id === activeId ? "active" : ""}"
          type="button"
          data-id="${escapeHtml(option.id)}"
        >
          ${escapeHtml(option.label)}
        </button>
      `
    )
    .join("");

  container.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => onClick(button.dataset.id));
  });
}

function renderChips(containerId, options, activeId, onClick) {
  const container = document.querySelector(containerId);
  container.innerHTML = options
    .map(
      (option) => `
        <button
          class="chip ${option.id === activeId ? "active" : ""}"
          type="button"
          data-id="${escapeHtml(option.id)}"
        >
          ${escapeHtml(option.label)}
        </button>
      `
    )
    .join("");

  container.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => onClick(button.dataset.id));
  });
}

function renderHeader() {
  document.querySelector("#appSubtitle").textContent = state.data.folderTitle;

  const stats = [{ label: "다시 볼 카드", value: getWrongNoteCards().length.toLocaleString("ko-KR") }];

  document.querySelector("#headerStats").innerHTML = stats
    .map(
      (item) => `
        <div class="stat-card">
          <span class="stat-value">${escapeHtml(item.value)}</span>
          <span class="stat-label">${escapeHtml(item.label)}</span>
        </div>
      `
    )
    .join("");
}

function renderSectionState() {
  const onTabClick = (id) => {
    state.selectedSection = id;
    if (id === "quiz") {
      resetQuizSession();
    }
    render();
  };

  renderTabs("#sectionTabs", sectionOptions, state.selectedSection, onTabClick);
  renderTabs("#bottomTabs", sectionOptions, state.selectedSection, onTabClick);

  document.querySelectorAll(".app-section").forEach((section) => {
    const isActive = section.id === `${state.selectedSection}Section`;
    section.classList.toggle("is-active", isActive);
  });
}

function renderLearnSection() {
  ensureSelectedSet();
  clampLearnIndex();
  const learnGrid = document.querySelector(".learn-grid");
  learnGrid.classList.toggle("mobile-browser-hidden", isMobileLayout() && !state.learn.showSetBrowser);
  learnGrid.classList.toggle("mobile-browser-open", isMobileLayout() && state.learn.showSetBrowser);
  document.querySelector("#toggleSetBrowserButton").textContent = state.learn.showSetBrowser ? "학습으로 돌아가기" : "세트 바꾸기";

  renderChips("#learnSetFilters", learnSetFilterOptions, state.learn.setFilter, (id) => {
    state.learn.setFilter = id;
    state.learn.currentIndex = 0;
    state.learn.revealed = false;
    ensureSelectedSet();
    render();
  });

  const visibleSets = getLearnVisibleSets();
  const setList = document.querySelector("#learnSetList");

  if (!visibleSets.length) {
    setList.innerHTML = `<div class="empty-card">조건에 맞는 세트가 없어요.</div>`;
  } else {
    setList.innerHTML = visibleSets
      .map((setItem) => {
        const activeClass = setItem.id === state.learn.selectedSetId ? "active" : "";

        return `
          <button class="set-item ${activeClass}" type="button" data-set-id="${escapeHtml(setItem.id)}">
            <span class="set-item-main">
              <span class="set-badge ${escapeHtml(setItem.kind)}">${escapeHtml(getSetBadgeLabel(setItem.kind))}</span>
              <strong class="set-title">${escapeHtml(getCompactSetTitle(setItem))}</strong>
            </span>
          </button>
        `;
      })
      .join("");

    setList.querySelectorAll("[data-set-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.learn.selectedSetId = button.dataset.setId;
        state.learn.currentIndex = 0;
        state.learn.revealed = false;
        if (isMobileLayout()) {
          state.learn.showSetBrowser = false;
        }
        state.quiz.scope = "selected-set";
        state.quiz.wrongFilter = null;
        render();
      });
    });
  }

  const { deck, card } = getCurrentLearnCard();
  const progressText = deck.cards.length ? `${state.learn.currentIndex + 1} / ${deck.cards.length}` : "0 / 0";
  const progressRate = deck.cards.length ? ((state.learn.currentIndex + 1) / deck.cards.length) * 100 : 0;
  const wordText = document.querySelector("#wordText");
  const meaningText = document.querySelector("#meaningText");
  const audioButton = document.querySelector("#audioButton");
  const flashcard = document.querySelector("#flashcard");

  document.querySelector("#learnDeckLabel").textContent = getLearnModeLabel(deck.kind);
  document.querySelector("#learnDeckTitle").textContent = getCompactSetTitle(deck.title, deck.kind) || "세트를 골라 주세요";
  document.querySelector("#learnDeckCopy").textContent = "";
  document.querySelector("#learnProgressText").textContent = progressText;
  document.querySelector("#learnProgressValue").style.width = `${progressRate}%`;

  if (!card) {
    flashcard.classList.remove("revealed");
    flashcard.disabled = true;
    audioButton.disabled = true;
    wordText.textContent = "카드가 없어요";
    meaningText.textContent = "다른 세트를 골라 주세요.";
    meaningText.classList.remove("compact-meaning");
    document.querySelector("#learnHelperText").textContent = "";
    document.querySelector("#flipButton").textContent = "뜻 보기";
    document.querySelector("#knownButton").textContent = "외웠어요";
    return;
  }

  flashcard.disabled = false;
  flashcard.classList.toggle("revealed", state.learn.revealed);
  audioButton.disabled = !card.audioUrl;
  wordText.textContent = card.word;
  meaningText.textContent = card.meaning;
  meaningText.classList.toggle("compact-meaning", card.meaning.length > 26);
  document.querySelector("#learnHelperText").textContent = "";
  document.querySelector("#flipButton").textContent = state.learn.revealed ? "앞면 보기" : "뜻 보기";
  document.querySelector("#knownButton").textContent = isKnownCard(card.setId, card.id) ? "표시 해제" : "외웠어요";
}

function renderQuizSection() {
  renderChips("#quizScopeFilters", quizScopeOptions, state.quiz.scope, (id) => {
    state.quiz.scope = id;
    state.quiz.wrongFilter = id === "wrong" ? state.quiz.wrongFilter : null;
    resetQuizSession();
    render();
  });

  renderChips("#quizTypeFilters", quizTypeOptions, state.quiz.type, (id) => {
    state.quiz.type = id;
    resetQuizSession();
    render();
  });

  renderChips("#quizDirectionFilters", quizDirectionOptions, state.quiz.direction, (id) => {
    state.quiz.direction = id;
    resetQuizSession();
    render();
  });

  const cards = getQuizScopeCards();
  const scopeLabel = getQuizScopeLabel();
  const scopeCopy =
    state.quiz.scope === "selected-set"
      ? ""
      : state.quiz.scope === "today"
        ? ""
        : "";

  document.querySelector("#quizScopeLabel").textContent = scopeLabel;
  document.querySelector("#quizScopeCopy").textContent = scopeCopy;

  const session = state.quiz.session;
  const metaNode = document.querySelector("#quizSessionMeta");
  const questionNode = document.querySelector("#quizQuestion");
  const choicesNode = document.querySelector("#quizChoices");
  const feedbackNode = document.querySelector("#quizFeedback");
  const subjectiveForm = document.querySelector("#subjectiveForm");
  const subjectiveInput = document.querySelector("#subjectiveInput");
  const quizTitle = document.querySelector("#quizTitle");

  if (!cards.length) {
    quizTitle.textContent = "문제를 만들 카드가 없어요";
    metaNode.textContent = scopeLabel;
    questionNode.textContent = "학습에서 세트를 고르거나, 오답 카드를 먼저 만들어 주세요.";
    subjectiveForm.classList.add("hidden");
    choicesNode.innerHTML = "";
    feedbackNode.textContent = "";
    return;
  }

  if (!session) {
    resetQuizSession();
    return renderQuizSection();
  }

  if (session.finished) {
    quizTitle.textContent = "퀴즈 끝";
    metaNode.textContent = `${scopeLabel} · 정답 ${session.correct}개 · 오답 ${session.wrong}개`;
    questionNode.textContent = "다시 섞어서 또 풀 수 있어요.";
    subjectiveForm.classList.add("hidden");
    choicesNode.innerHTML = "";
    feedbackNode.textContent = "처음부터 버튼을 누르면 같은 범위로 새 퀴즈를 시작해요.";
    return;
  }

  const question = session.currentQuestion;
  quizTitle.textContent = question.formatType === "subjective" ? "주관식 퀴즈" : "객관식 퀴즈";
  metaNode.textContent = `${scopeLabel} · ${session.index + 1} / ${session.queue.length}`;
  questionNode.textContent =
    question.promptType === "word-to-meaning"
      ? `"${question.promptText}" 뜻은 무엇일까요?`
      : `"${question.promptText}"에 맞는 영어 단어는 무엇일까요?`;

  if (question.formatType === "subjective") {
    subjectiveForm.classList.remove("hidden");
    subjectiveInput.disabled = session.answered;
    subjectiveInput.value = session.answered ? question.selectedText : "";
    subjectiveInput.placeholder =
      question.promptType === "meaning-to-word" ? "영어 단어를 써 보세요" : "뜻을 써 보세요";
  } else {
    subjectiveForm.classList.add("hidden");
    subjectiveInput.value = "";
    subjectiveInput.disabled = false;
  }

  choicesNode.innerHTML =
    question.formatType === "objective"
      ? question.choices
          .map((choice) => {
            const selectedClass = session.answered && question.selectedText === choice ? "selected" : "";
            const correctClass = session.answered && question.answerText === choice ? "correct" : "";
            const wrongClass =
              session.answered && question.selectedText === choice && question.answerText !== choice ? "wrong" : "";

            return `
              <button
                class="choice-btn ${selectedClass} ${correctClass} ${wrongClass}"
                type="button"
                data-choice="${escapeHtml(choice)}"
                ${session.answered ? "disabled" : ""}
              >
                ${escapeHtml(choice)}
              </button>
            `;
          })
          .join("")
      : "";

  feedbackNode.textContent = session.feedback;

  choicesNode.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => answerQuiz(button.dataset.choice));
  });
}

function renderReviewSection() {
  const allWrongCards = getWrongNoteCards();
  const filteredWrongCards = getWrongCardsByFilter(getReviewFilterConfig());
  const customDateField = document.querySelector("#reviewDateField");
  const reviewDateInput = document.querySelector("#reviewDateInput");
  const reviewList = document.querySelector("#reviewWrongList");

  document.querySelector("#reviewStats").innerHTML = allWrongCards.length
    ? `
      <div class="review-inline-count">
        <strong>${escapeHtml(String(allWrongCards.length))}</strong>
        <span>다시 볼 카드</span>
      </div>
    `
    : "";

  renderChips("#reviewFilters", reviewFilterOptions, state.review.filter, (id) => {
    state.review.filter = id;

    if (id !== "date") {
      state.review.customDate = "";
    } else if (!state.review.customDate) {
      state.review.customDate = toDateKey(new Date());
    }

    render();
  });

  customDateField.classList.toggle("hidden", state.review.filter !== "date");
  reviewDateInput.value = state.review.customDate;
  document.querySelector("#reviewListLabel").textContent = getWrongFilterLabel(getReviewFilterConfig());
  document.querySelector("#reviewSummaryCopy").textContent = filteredWrongCards.length
    ? ""
    : "복습할 카드가 없어요.";

  if (!filteredWrongCards.length) {
    reviewList.innerHTML = `<div class="empty-card">복습할 카드가 없어요.</div>`;
    return;
  }

  reviewList.innerHTML = filteredWrongCards
    .map((item) => {
      const dateSummary = item.wrongDates
        .slice(0, 3)
        .map((dateKey) => `${formatDateLabel(dateKey)} ${item.wrongByDate[dateKey]}회`)
        .join(" · ");

      return `
        <article class="wrong-item">
          <div class="wrong-item-copy">
            <div class="wrong-word">${escapeHtml(item.word)}</div>
            <div class="wrong-meaning">${escapeHtml(item.meaning)}</div>
            <div class="wrong-meta">
              ${escapeHtml(getCompactSetTitle(item.setTitle, item.setKind))} · 총 ${item.wrongCount}회 · 마지막 ${escapeHtml(
                formatDateTime(item.lastWrongAt)
              )}
            </div>
            <div class="wrong-dates">${escapeHtml(dateSummary)}</div>
          </div>
          <div class="action-row compact">
            <button class="ghost-btn" type="button" data-review-card="${escapeHtml(item.wrongKey)}">카드 보기</button>
            <button class="ghost-btn accent" type="button" data-review-quiz="${escapeHtml(item.wrongKey)}">이 카드 퀴즈</button>
            <button class="ghost-btn" type="button" data-review-remove="${escapeHtml(item.wrongKey)}">삭제</button>
          </div>
        </article>
      `;
    })
    .join("");

  reviewList.querySelectorAll("[data-review-card]").forEach((button) => {
    button.addEventListener("click", () => jumpToLearnCard(button.dataset.reviewCard));
  });

  reviewList.querySelectorAll("[data-review-quiz]").forEach((button) => {
    button.addEventListener("click", () => startWrongQuiz({ mode: "card", key: button.dataset.reviewQuiz }));
  });

  reviewList.querySelectorAll("[data-review-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      removeWrongNoteByKey(button.dataset.reviewRemove);
      render();
    });
  });
}

function render() {
  ensureSelectedSet();
  clampLearnIndex();
  renderHeader();
  renderSectionState();
  renderLearnSection();
  renderQuizSection();
  renderReviewSection();
}

function nextLearnCard(step) {
  const deck = getLearnDeck();

  if (!deck.cards.length) {
    return;
  }

  state.learn.currentIndex = (state.learn.currentIndex + step + deck.cards.length) % deck.cards.length;
  state.learn.revealed = false;
  render();
}

function toggleKnown() {
  const { card } = getCurrentLearnCard();

  if (!card) {
    return;
  }

  const key = getCardKey(card.setId, card.id);

  if (state.progress[key]) {
    delete state.progress[key];
  } else {
    state.progress[key] = {
      learnedAt: new Date().toISOString(),
      word: card.word,
      meaning: card.meaning,
    };
  }

  saveProgress();
  state.learn.dailyDeckCards = null;
  render();
}

function playAudio() {
  const { card } = getCurrentLearnCard();

  if (!card?.audioUrl) {
    return;
  }

  const audio = new Audio(card.audioUrl);
  audio.play().catch(() => {
    window.alert("오디오를 재생하지 못했어요.");
  });
}

function jumpToLearnCard(wrongKey) {
  const item = state.wrongNote[wrongKey];

  if (!item) {
    return;
  }

  state.selectedSection = "learn";
  state.learn.setFilter = "all";
  state.learn.query = "";
  state.learn.selectedSetId = item.setId;

  const targetSet = getAllSets().find((setItem) => setItem.id === item.setId);
  const targetIndex = targetSet?.cards.findIndex((card) => String(card.id) === String(item.cardId)) ?? 0;

  state.learn.currentIndex = Math.max(0, targetIndex);
  state.learn.revealed = false;
  render();
}

function startWrongQuiz(filterConfig) {
  state.selectedSection = "quiz";
  state.quiz.scope = "wrong";
  state.quiz.wrongFilter = filterConfig;
  resetQuizSession();
  render();
}

function attachEvents() {
  document.querySelector("#toggleSetBrowserButton").addEventListener("click", () => {
    state.learn.showSetBrowser = !state.learn.showSetBrowser;
    render();
  });

  document.querySelector("#setSearch").addEventListener("input", (event) => {
    state.learn.query = event.target.value;
    state.learn.currentIndex = 0;
    state.learn.revealed = false;
    ensureSelectedSet();
    render();
  });

  document.querySelector("#flashcard").addEventListener("click", () => {
    state.learn.revealed = !state.learn.revealed;
    render();
  });

  document.querySelector("#flipButton").addEventListener("click", () => {
    state.learn.revealed = !state.learn.revealed;
    render();
  });

  document.querySelector("#prevButton").addEventListener("click", () => nextLearnCard(-1));
  document.querySelector("#nextButton").addEventListener("click", () => nextLearnCard(1));
  document.querySelector("#knownButton").addEventListener("click", toggleKnown);
  document.querySelector("#audioButton").addEventListener("click", playAudio);
  document.querySelector("#restartQuizButton").addEventListener("click", () => {
    resetQuizSession();
    render();
  });
  document.querySelector("#nextQuizButton").addEventListener("click", nextQuizQuestion);
  document.querySelector("#subjectiveForm").addEventListener("submit", (event) => {
    event.preventDefault();
    answerQuiz(document.querySelector("#subjectiveInput").value);
  });
  document.querySelector("#reviewDateInput").addEventListener("input", (event) => {
    state.review.customDate = event.target.value;
    render();
  });
  document.querySelector("#startReviewQuizButton").addEventListener("click", () => {
    startWrongQuiz(getReviewFilterConfig());
  });
  document.querySelector("#clearWrongButton").addEventListener("click", () => {
    clearWrongNote();
    if (state.quiz.scope === "wrong") {
      resetQuizSession();
    }
    render();
  });

  window.addEventListener("keydown", (event) => {
    if (state.selectedSection !== "learn") {
      return;
    }

    if (event.key === "ArrowRight") {
      nextLearnCard(1);
    } else if (event.key === "ArrowLeft") {
      nextLearnCard(-1);
    } else if (event.key === " ") {
      event.preventDefault();
      state.learn.revealed = !state.learn.revealed;
      render();
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobileLayout()) {
      state.learn.showSetBrowser = false;
    }
    render();
  });
}

async function loadData() {
  const response = await fetch("./vocab-data.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load data: ${response.status}`);
  }

  state.data = await response.json();
  state.learn.selectedSetId = getLearnVisibleSets()[0]?.id || getAllSets()[0]?.id || null;
  resetQuizSession();
  render();
}

function showLoadError(error) {
  document.querySelector("#appSubtitle").textContent = "데이터를 불러오지 못했어요.";
  document.querySelector("#headerStats").innerHTML = "";
  document.querySelector("#learnSetList").innerHTML = `<div class="empty-card">${escapeHtml(error.message)}</div>`;
  document.querySelector("#learnDeckTitle").textContent = "vocab-data.json 파일이 필요해요";
  document.querySelector("#wordText").textContent = "데이터 파일 확인";
  document.querySelector("#meaningText").textContent = "수집 스크립트를 먼저 실행해 주세요.";
  document.querySelector("#quizQuestion").textContent = "데이터가 준비되면 퀴즈를 시작할 수 있어요.";
  document.querySelector("#reviewWrongList").innerHTML = `<div class="empty-card">오답노트는 데이터가 있을 때 동작해요.</div>`;
}

attachEvents();
loadData().catch(showLoadError);
