(function () {
  const bodyEl = document.body;
  const roomId = bodyEl?.dataset.roomId || 'default';
  const isFullInitial = bodyEl?.dataset.isFull === 'true';
  const maxUsernameLength = Number(bodyEl?.dataset.maxUsername) || 50;
  const maxCommentLength = Number(bodyEl?.dataset.maxComment) || 500;

  const statusEl = document.getElementById('connection-status');
  const errorEl = document.getElementById('error-banner');
  const messageListEl = document.getElementById('message-list');
  const formEl = document.getElementById('chat-form');
  const usernameInputEl = document.getElementById('username-input');
  const commentInputEl = document.getElementById('comment-input');
  const sendButtonEl = document.getElementById('send-button');
  const leaveButtonEl = document.getElementById('leave-button');
  const initialDataEl = document.getElementById('initial-messages-data');

  const POLLING_INTERVAL_MS = 3000;
  const HEARTBEAT_INTERVAL_MS = 20000;

  const messageMap = new Map();
  const ownMessageIds = new Set();
  let currentUsername = '';
  let pollingTimerId = null;
  let heartbeatTimerId = null;
  let isRoomFull = isFullInitial;
  let isDisconnectedByUser = false;
  let socket = null;

  const STATUS_BADGE_BASE =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors';

  const STATUS_BADGE_VARIANTS = {
    connected: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    reconnecting: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    disconnected: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    full: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
    neutral: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  };

  function setErrorMessage(text) {
    if (!errorEl) return;
    errorEl.textContent = text || '';
  }

  function setConnectionStatus(text, variant = 'neutral') {
    if (!statusEl) return;
    const variantClass =
      STATUS_BADGE_VARIANTS[variant] || STATUS_BADGE_VARIANTS.neutral;
    statusEl.className = `${STATUS_BADGE_BASE} ${variantClass}`;
    statusEl.textContent = text;
  }

  function formatMessageTime(msg) {
    const raw = msg?.created_at ?? msg?.createdAt;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function scrollToBottom() {
    if (!messageListEl) return;
    messageListEl.scrollTop = messageListEl.scrollHeight;
  }

  function isOwnMessage(msg) {
    if (!msg) return false;
    if (msg.id !== undefined && msg.id !== null && ownMessageIds.has(String(msg.id))) {
      return true;
    }
    const senderName = String(msg.username ?? '').trim();
    return Boolean(currentUsername) && senderName === currentUsername;
  }

  function renderFullRoomNotice(messageText, retryHref) {
    isRoomFull = true;
    stopBackgroundTimers();

    if (messageListEl) {
      messageListEl.textContent = '';
    }
    if (formEl) {
      formEl.style.display = 'none';
    }
    if (sendButtonEl) {
      sendButtonEl.disabled = true;
    }

    if (!errorEl) return;
    errorEl.textContent = '';

    const p = document.createElement('p');
    p.className = 'font-semibold';
    p.textContent = messageText || '現在チャットルームは満席（最大5名）です。';

    const link = document.createElement('a');
    link.href = retryHref || '/chat';
    link.className =
      'mt-3 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2';
    link.textContent = '/chat へ再アクセスする';

    errorEl.appendChild(p);
    errorEl.appendChild(link);
  }

  function applyDisconnectedUi() {
    isRoomFull = true;
    stopBackgroundTimers();

    if (formEl) {
      formEl.style.display = 'none';
    }
    if (sendButtonEl) {
      sendButtonEl.disabled = true;
    }
    if (leaveButtonEl) {
      leaveButtonEl.disabled = true;
    }

    setConnectionStatus('切断済み', 'disconnected');

    if (!errorEl) return;
    errorEl.className =
      'rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm';
    errorEl.textContent = '';

    const p = document.createElement('p');
    p.className = 'font-medium text-slate-800';
    p.textContent = 'チャットセッションを削除し、切断しました。';

    const link = document.createElement('a');
    link.href = '/chat';
    link.className =
      'mt-3 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2';
    link.textContent = '/chat へ再接続する';

    errorEl.appendChild(p);
    errorEl.appendChild(link);
  }

  async function disconnectSession() {
    if (isDisconnectedByUser) return;
    isDisconnectedByUser = true;

    applyDisconnectedUi();

    try {
      await fetch('/api/chat/leave', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, removeSession: true }),
      });
    } catch {
      // 通信失敗時も切断済み表示は維持
    }

    try {
      if (socket) {
        if (socket.io && socket.io.opts) {
          socket.io.opts.reconnection = false;
        }
        socket.disconnect();
      }
    } catch {
      // 例外は無視
    }
  }

  function createMessageElement(msg) {
    const own = isOwnMessage(msg);
    const formattedTime = formatMessageTime(msg);

    const li = document.createElement('li');
    li.dataset.messageId = String(msg.id);
    li.className = own ? 'flex justify-end' : 'flex justify-start';

    const bubble = document.createElement('div');
    bubble.className = own
      ? 'max-w-[80%] rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-sm leading-relaxed'
      : 'max-w-[80%] rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed';

    const metaRow = document.createElement('div');
    metaRow.className = own
      ? 'flex items-baseline justify-end gap-2'
      : 'flex items-baseline justify-start gap-2';

    const nameSpan = document.createElement('span');
    nameSpan.className = own
      ? 'msg-username font-semibold text-indigo-700'
      : 'msg-username font-semibold text-slate-700';
    nameSpan.textContent = String(msg.username ?? '');

    metaRow.appendChild(nameSpan);

    if (formattedTime) {
      const timeSpan = document.createElement('time');
      timeSpan.className = 'msg-time text-[11px] text-slate-400';
      const raw = msg?.created_at ?? msg?.createdAt;
      if (raw) {
        timeSpan.dateTime = String(raw);
      }
      timeSpan.textContent = formattedTime;
      metaRow.appendChild(timeSpan);
    }

    const commentDiv = document.createElement('div');
    commentDiv.className =
      'msg-comment mt-0.5 whitespace-pre-wrap break-words text-slate-800';
    commentDiv.textContent = String(msg.comment ?? '');

    bubble.appendChild(metaRow);
    bubble.appendChild(commentDiv);
    li.appendChild(bubble);
    return li;
  }

  function renderSortedMessages() {
    if (!messageListEl || isRoomFull) return;
    const sorted = Array.from(messageMap.values()).sort(
      (a, b) => Number(a.id) - Number(b.id)
    );
    messageListEl.textContent = '';
    for (const msg of sorted) {
      messageListEl.appendChild(createMessageElement(msg));
    }
    scrollToBottom();
  }

  function mergeMessages(items) {
    if (!Array.isArray(items) || isRoomFull) return;
    let changed = false;
    for (const item of items) {
      if (!item || item.id === undefined || item.id === null) continue;
      const key = String(item.id);
      if (!messageMap.has(key)) {
        messageMap.set(key, item);
        changed = true;
      }
    }
    if (changed) {
      renderSortedMessages();
    }
  }

  function validateInputs(rawUsername, rawComment) {
    if (typeof rawUsername !== 'string' || typeof rawComment !== 'string') {
      return 'ユーザー名とコメントを入力してください。';
    }
    const username = rawUsername.trim();
    const comment = rawComment.trim();

    if (username.length === 0) {
      return 'ユーザー名を入力してください。';
    }
    if (username.length > maxUsernameLength) {
      return `ユーザー名は${maxUsernameLength}文字以内で入力してください。`;
    }
    if (comment.length === 0) {
      return 'コメントを入力してください。';
    }
    if (comment.length > maxCommentLength) {
      return `コメントは${maxCommentLength}文字以内で入力してください。`;
    }
    return null;
  }

  async function fetchMessagesFromDb() {
    if (isRoomFull || isDisconnectedByUser) return;
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'GET',
        credentials: 'same-origin',
      });
      if (response.status === 403 || response.status === 409) {
        const data = await response.json().catch(() => ({}));
        if (data.code === 'ROOM_FULL') {
          renderFullRoomNotice(data.message, data.retryUrl || '/chat');
          setConnectionStatus('満席のため入室制限中', 'full');
        }
        return;
      }
      if (!response.ok) {
        setErrorMessage('チャット履歴の同期に失敗しました。');
        return;
      }
      const data = await response.json();
      if (Array.isArray(data.messages)) {
        mergeMessages(data.messages);
      }
    } catch {
      setErrorMessage('通信エラーによりチャット履歴を同期できません。');
    }
  }

  async function sendHeartbeat() {
    if (isRoomFull || isDisconnectedByUser) return;
    try {
      await fetch('/api/chat/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // 通信失敗時は次回またはポーリング・ソケット再接続で復帰を試みる
    }
  }

  function startBackgroundTimers() {
    stopBackgroundTimers();
    pollingTimerId = window.setInterval(fetchMessagesFromDb, POLLING_INTERVAL_MS);
    heartbeatTimerId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  function stopBackgroundTimers() {
    if (pollingTimerId !== null) {
      window.clearInterval(pollingTimerId);
      pollingTimerId = null;
    }
    if (heartbeatTimerId !== null) {
      window.clearInterval(heartbeatTimerId);
      heartbeatTimerId = null;
    }
  }

  if (leaveButtonEl) {
    leaveButtonEl.addEventListener('click', () => {
      disconnectSession();
    });
  }

  // 初期履歴の読み込み
  if (!isRoomFull && initialDataEl && initialDataEl.textContent) {
    try {
      const parsed = JSON.parse(initialDataEl.textContent);
      mergeMessages(parsed);
    } catch {
      setErrorMessage('初期履歴の読み込みに失敗しました。');
    }
  }
  scrollToBottom();

  if (isRoomFull) {
    renderFullRoomNotice(
      document.getElementById('full-message')?.textContent ||
        '現在チャットルームは満席（最大5名）です。',
      document.getElementById('retry-chat-link')?.getAttribute('href') || '/chat'
    );
    setConnectionStatus('満席のため入室制限中', 'full');
    return;
  }

  if (typeof window.io !== 'function') {
    setConnectionStatus('通信モジュール読込エラー', 'disconnected');
    setErrorMessage('通信クライアントの初期化に失敗しました。');
    return;
  }

  socket = window.io();

  // ソケットイベントリスナーは初回のみ登録（再接続時に追加登録しない）
  socket.on('connect', () => {
    if (isDisconnectedByUser) return;
    setConnectionStatus('接続済み', 'connected');
    setErrorMessage('');
    if (sendButtonEl) sendButtonEl.disabled = false;

    socket.emit('chat:join', { roomId }, (ack) => {
      if (ack && ack.ok && Array.isArray(ack.messages)) {
        mergeMessages(ack.messages);
      } else if (ack && ack.reason === 'FULL') {
        renderFullRoomNotice(ack.error, '/chat');
        setConnectionStatus('満席のため入室制限中', 'full');
      } else {
        fetchMessagesFromDb();
      }
    });
  });

  socket.on('disconnect', () => {
    if (isDisconnectedByUser) {
      setConnectionStatus('切断済み', 'disconnected');
      return;
    }
    setConnectionStatus('切断中', 'disconnected');
    if (sendButtonEl) sendButtonEl.disabled = true;
    setErrorMessage('通信が切断されました。切断中はメッセージを送信できません。');
  });

  socket.on('connect_error', () => {
    if (isDisconnectedByUser) return;
    setConnectionStatus('再接続中', 'reconnecting');
    setErrorMessage('サーバーとの通信に失敗しました。');
  });

  socket.on('chat:message:new', (msg) => {
    mergeMessages([msg]);
  });

  socket.on('chat:room:full', (payload) => {
    renderFullRoomNotice(payload?.message, payload?.retryUrl || '/chat');
    setConnectionStatus('満席のため入室制限中', 'full');
  });

  socket.on('chat:error', (err) => {
    setErrorMessage(err?.message || 'チャット処理中にエラーが発生しました。');
  });

  if (formEl) {
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      setErrorMessage('');

      if (isDisconnectedByUser || !socket || !socket.connected) {
        setErrorMessage('通信が切断されているため送信できません。再接続をお待ちください。');
        return;
      }

      const rawUsername = usernameInputEl ? usernameInputEl.value : '';
      const rawComment = commentInputEl ? commentInputEl.value : '';
      const validationError = validateInputs(rawUsername, rawComment);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      const trimmedUsername = rawUsername.trim();
      currentUsername = trimmedUsername;

      if (sendButtonEl) sendButtonEl.disabled = true;

      socket.emit(
        'chat:message:send',
        { username: rawUsername, comment: rawComment },
        (ack) => {
          if (sendButtonEl && socket.connected && !isRoomFull && !isDisconnectedByUser) {
            sendButtonEl.disabled = false;
          }

          if (ack && ack.ok) {
            if (ack.message) {
              if (ack.message.id !== undefined && ack.message.id !== null) {
                ownMessageIds.add(String(ack.message.id));
              }
              mergeMessages([ack.message]);
            }
            if (commentInputEl) {
              commentInputEl.value = '';
            }
            setErrorMessage('');
          } else {
            setErrorMessage(ack?.error || 'メッセージの送信に失敗しました。');
          }
        }
      );
    });
  }

  startBackgroundTimers();

  window.addEventListener('beforeunload', () => {
    stopBackgroundTimers();
    if (isDisconnectedByUser) return;
    try {
      navigator.sendBeacon('/api/chat/leave', '');
    } catch {
      // 離脱時のベストエフォート送信
    }
  });
})();