/*
API通信処理を以下の4関数に分離しています。
fetchConversationsApi()：GET /api/ai/v2/conversations
createConversationApi(title)：POST /api/ai/v2/conversations
fetchTurnsApi(conversationId, limit, offset)：GET /api/ai/v2/conversations/:id/turns
postTurnApi(conversationId, prompt)：POST /api/ai/v2/conversations/:id/turns
*/



// ==========================================
// 1. 定数・アプリケーション状態
// ==========================================
const API_BASE = '/api/ai/v2';
const PAGE_SIZE = 20;

const state = {
  aiDisabled: false,
  conversations: [],
  selectedConversationId: null,
  turns: [],
  hasMore: false,
  isSubmitting: false,
  isLoadingMore: false,
};

// ==========================================
// 2. DOM要素参照
// ==========================================
const dom = {
  disabledBanner: document.getElementById('disabledBanner'),
  newConversationForm: document.getElementById('newConversationForm'),
  newTitleInput: document.getElementById('newTitleInput'),
  createConversationBtn: document.getElementById('createConversationBtn'),
  conversationList: document.getElementById('conversationList'),
  currentConversationTitle: document.getElementById('currentConversationTitle'),
  errorBox: document.getElementById('errorBox'),
  messagesContainer: document.getElementById('messagesContainer'),
  loadMoreBar: document.getElementById('loadMoreBar'),
  loadMoreBtn: document.getElementById('loadMoreBtn'),
  emptyState: document.getElementById('emptyState'),
  turnsList: document.getElementById('turnsList'),
  askForm: document.getElementById('askForm'),
  promptInput: document.getElementById('promptInput'),
  charCounter: document.getElementById('charCounter'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  sendBtn: document.getElementById('sendBtn'),
};

// ==========================================
// 3. API通信関数（エンドポイントごとに分離）
// ==========================================
class ApiError extends Error {
  constructor(message, status, aiDisabled = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.aiDisabled = aiDisabled;
  }
}

async function parseApiResponse(res, fallbackMessage) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    // JSON以外の応答時のフォールバック
  }

  if (!res.ok) {
    const isDisabled = res.status === 503 && Boolean(data.aiDisabled);
    throw new ApiError(data.error || fallbackMessage, res.status, isDisabled);
  }
  return data;
}

/**
 * ① 会話一覧・公開状態取得 API
 * GET /api/ai/v2/conversations
 */
async function fetchConversationsApi() {
  const res = await fetch(`${API_BASE}/conversations`);
  const data = await parseApiResponse(res, '会話一覧の取得に失敗しました。');
  return {
    aiDisabled: Boolean(data.aiDisabled),
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
  };
}

/**
 * ② 新規会話作成 API
 * POST /api/ai/v2/conversations
 */
async function createConversationApi(title) {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await parseApiResponse(res, '新規会話の作成に失敗しました。');
  return data.conversation;
}

/**
 * ③ 指定会話の往復履歴取得 API
 * GET /api/ai/v2/conversations/:id/turns?limit=...&offset=...
 */
async function fetchTurnsApi(conversationId, limit = PAGE_SIZE, offset = 0) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/turns?${query}`);
  const data = await parseApiResponse(res, '会話履歴の取得に失敗しました。');
  return {
    conversation: data.conversation || null,
    turns: Array.isArray(data.turns) ? data.turns : [],
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * ④ 質問送信・AI応答生成・1往復保存 API
 * POST /api/ai/v2/conversations/:id/turns
 */
async function postTurnApi(conversationId, prompt) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await parseApiResponse(res, '質問の送信に失敗しました。');
  return data.turn;
}

// ==========================================
// 4. UI描画・状態同期関数
// ==========================================
function showError(message) {
  dom.errorBox.textContent = message;
  dom.errorBox.classList.add('visible');
}

function clearError() {
  dom.errorBox.textContent = '';
  dom.errorBox.classList.remove('visible');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function syncControlStates() {
  if (state.aiDisabled) {
    dom.disabledBanner.classList.add('visible');
    dom.newTitleInput.disabled = true;
    dom.createConversationBtn.disabled = true;
  } else {
    dom.disabledBanner.classList.remove('visible');
    dom.newTitleInput.disabled = state.isSubmitting;
    dom.createConversationBtn.disabled = state.isSubmitting;
  }

  const canAsk =
    !state.aiDisabled &&
    state.selectedConversationId !== null &&
    !state.isSubmitting;

  dom.promptInput.disabled = !canAsk;
  dom.sendBtn.disabled = !canAsk;
  dom.loadingIndicator.classList.toggle('visible', state.isSubmitting);
  dom.loadMoreBtn.disabled = state.isLoadingMore;
}

function renderConversationList() {
  dom.conversationList.innerHTML = '';

  if (state.conversations.length === 0) {
    const li = document.createElement('li');
    li.className = 'conversation-empty';
    li.textContent = '会話はまだありません。';
    dom.conversationList.appendChild(li);
    return;
  }

  for (const conv of state.conversations) {
    const li = document.createElement('li');
    li.className = 'conversation-item' + (conv.id === state.selectedConversationId ? ' active' : '');

    const titleEl = document.createElement('div');
    titleEl.className = 'conversation-item-title';
    titleEl.textContent = conv.title;

    const dateEl = document.createElement('div');
    dateEl.className = 'conversation-item-date';
    dateEl.textContent = `更新: ${formatDate(conv.updatedAt)}`;

    li.appendChild(titleEl);
    li.appendChild(dateEl);

    li.addEventListener('click', () => {
      if (state.isSubmitting) return;
      selectConversation(conv.id);
    });

    dom.conversationList.appendChild(li);
  }
}

function createTurnElement(turn) {
  const group = document.createElement('div');
  group.className = 'turn-group';

  const userBubble = document.createElement('div');
  userBubble.className = 'message-bubble message-user';
  const userRole = document.createElement('div');
  userRole.className = 'message-role';
  userRole.textContent = `あなた (${formatDate(turn.createdAt)})`;
  const userText = document.createElement('div');
  userText.textContent = turn.userMessage;
  userBubble.appendChild(userRole);
  userBubble.appendChild(userText);

  const modelBubble = document.createElement('div');
  modelBubble.className = 'message-bubble message-model';
  const modelRole = document.createElement('div');
  modelRole.className = 'message-role';
  modelRole.textContent = 'Gemini AI';
  const modelText = document.createElement('div');
  modelText.textContent = turn.modelMessage;
  modelBubble.appendChild(modelRole);
  modelBubble.appendChild(modelText);

  group.appendChild(userBubble);
  group.appendChild(modelBubble);
  return group;
}

function renderTurns(scrollToBottom = false) {
  dom.loadMoreBar.classList.toggle('visible', state.hasMore);

  if (state.selectedConversationId === null) {
    dom.emptyState.style.display = 'block';
    dom.emptyState.textContent = '左のメニューから会話を選択するか、新しい会話を作成してください。';
    dom.turnsList.innerHTML = '';
    return;
  }

  if (state.turns.length === 0) {
    dom.emptyState.style.display = 'block';
    dom.emptyState.textContent = 'まだメッセージがありません。下の入力欄から最初の質問を送信してください。';
    dom.turnsList.innerHTML = '';
    return;
  }

  dom.emptyState.style.display = 'none';
  dom.turnsList.innerHTML = '';
  for (const turn of state.turns) {
    dom.turnsList.appendChild(createTurnElement(turn));
  }

  if (scrollToBottom) {
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  }
}

// ==========================================
// 5. 画面アクション（API呼び出し＋UI更新）
// ==========================================
async function loadConversations(preserveSelection = true) {
  try {
    const result = await fetchConversationsApi();
    state.aiDisabled = result.aiDisabled;
    state.conversations = result.conversations;

    if (!preserveSelection) {
      state.selectedConversationId = null;
    }

    renderConversationList();
    syncControlStates();
  } catch (err) {
    showError(err.message || '会話一覧の読み込み中にエラーが発生しました。');
  }
}

async function selectConversation(conversationId) {
  clearError();
  state.selectedConversationId = conversationId;
  state.turns = [];
  state.hasMore = false;

  const targetConv = state.conversations.find((c) => c.id === conversationId);
  dom.currentConversationTitle.textContent = targetConv ? targetConv.title : '会話';

  renderConversationList();
  renderTurns(false);
  syncControlStates();

  try {
    const result = await fetchTurnsApi(conversationId, PAGE_SIZE, 0);
    if (result.conversation?.title) {
      dom.currentConversationTitle.textContent = result.conversation.title;
    }
    state.turns = result.turns;
    state.hasMore = result.hasMore;
    renderTurns(true);
  } catch (err) {
    showError(err.message || '会話履歴の読み込み中にエラーが発生しました。');
  }
}

async function handleLoadMoreTurns() {
  if (state.selectedConversationId === null || state.isLoadingMore || !state.hasMore) {
    return;
  }

  clearError();
  state.isLoadingMore = true;
  syncControlStates();

  const prevScrollHeight = dom.messagesContainer.scrollHeight;
  const offset = state.turns.length;

  try {
    const result = await fetchTurnsApi(state.selectedConversationId, PAGE_SIZE, offset);
    state.turns = [...result.turns, ...state.turns];
    state.hasMore = result.hasMore;
    renderTurns(false);

    const newScrollHeight = dom.messagesContainer.scrollHeight;
    dom.messagesContainer.scrollTop += newScrollHeight - prevScrollHeight;
  } catch (err) {
    showError(err.message || '過去の履歴取得中にエラーが発生しました。');
  } finally {
    state.isLoadingMore = false;
    syncControlStates();
  }
}

async function handleCreateConversation(e) {
  e.preventDefault();
  clearError();

  const title = dom.newTitleInput.value.trim();
  if (!title) {
    showError('会話タイトルを入力してください。');
    return;
  }
  if (title.length > 100) {
    showError('会話タイトルは100文字以内で入力してください。');
    return;
  }

  dom.createConversationBtn.disabled = true;
  dom.newTitleInput.disabled = true;

  try {
    const created = await createConversationApi(title);
    dom.newTitleInput.value = '';
    state.conversations = [created, ...state.conversations];
    await selectConversation(created.id);
  } catch (err) {
    if (err instanceof ApiError && err.aiDisabled) {
      state.aiDisabled = true;
    }
    showError(err.message || '新規会話の作成中にエラーが発生しました。');
  } finally {
    syncControlStates();
  }
}

async function handleAskSubmit(e) {
  e.preventDefault();
  if (state.selectedConversationId === null || state.isSubmitting) return;

  clearError();
  const trimmedPrompt = dom.promptInput.value.trim();

  if (!trimmedPrompt) {
    showError('質問文を入力してください。');
    return;
  }
  if (trimmedPrompt.length > 1500) {
    showError('質問文は1,500文字以内で入力してください。');
    return;
  }

  state.isSubmitting = true;
  syncControlStates();

  try {
    const newTurn = await postTurnApi(state.selectedConversationId, trimmedPrompt);

    // 成功時のみ入力欄をクリア
    dom.promptInput.value = '';
    dom.charCounter.textContent = '0 / 1500';

    if (newTurn) {
      state.turns.push(newTurn);
      renderTurns(true);
    }

    await loadConversations(true);
  } catch (err) {
    if (err instanceof ApiError && err.aiDisabled) {
      state.aiDisabled = true;
    }
    // 失敗時は入力欄の内容を保持したままエラー表示
    showError(err.message || 'AIからの応答取得に失敗しました。時間をおいて再送信してください。');
  } finally {
    state.isSubmitting = false;
    syncControlStates();
    if (!dom.promptInput.disabled) {
      dom.promptInput.focus();
    }
  }
}

// ==========================================
// 6. イベント登録・初期化
// ==========================================
function bindEvents() {
  dom.newConversationForm.addEventListener('submit', handleCreateConversation);
  dom.loadMoreBtn.addEventListener('click', handleLoadMoreTurns);
  dom.askForm.addEventListener('submit', handleAskSubmit);

  dom.promptInput.addEventListener('input', () => {
    dom.charCounter.textContent = `${dom.promptInput.value.length} / 1500`;
  });

  dom.promptInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      dom.askForm.requestSubmit();
    }
  });
}

(async function init() {
  bindEvents();
  await loadConversations(false);
})();