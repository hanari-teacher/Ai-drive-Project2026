document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const latestAnswerContainer = document.getElementById('latest-answer');
    const historyContainer = document.getElementById('history-container');

    // 1. ページロード時に履歴を取得 (TASK-06: 初期取得・0件表示)
    fetchHistory();

    // 2. 送信ボタンクリックイベント (TASK-07: 送信UI・非同期Fetch・待機状態)
    submitBtn.addEventListener('click', async () => {
        const promptText = promptInput.value.trim();
        errorMessage.textContent = '';

        // クライアント側バリデーション
        if (!promptText) {
            errorMessage.textContent = 'プロンプトを入力してください。';
            return;
        }

        // 待機状態（ローディング）の適用
        submitBtn.disabled = true;
        submitBtn.textContent = 'AIが回答を生成中...';

        try {
            const response = await fetch('/api/ai/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: promptText })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error?.message || result.message || 'AIの応答取得に失敗しました。');
            }

            // 成功時：最新回答を表示し、入力欄をクリア、履歴を再取得
            renderLatestAnswer(result.data);
            promptInput.value = ''; // 成功時は入力をクリア
            fetchHistory();

        } catch (error) {
            // 失敗時：エラーを表示（入力されたテキストは消さずに保持し、再送可能にする）
            errorMessage.textContent = `エラー: ${error.message}`;
        } finally {
            // ローディング解除
            submitBtn.disabled = false;
            submitBtn.textContent = '送信する';
        }
    });

    // 履歴取得関数
    async function fetchHistory() {
        try {
            const response = await fetch('/api/ai/history');
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error('履歴の取得に失敗しました。');
            }

            renderHistory(result.data);
        } catch (error) {
            historyContainer.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'empty';
            p.style.color = 'red';
            p.textContent = error.message;
            historyContainer.appendChild(p);
        }
    }

    // 履歴描画関数（XSS対策として textContent を使用）
    function renderHistory(histories) {
        historyContainer.innerHTML = '';

        if (!histories || histories.length === 0) {
            const p = document.createElement('p');
            p.className = 'empty';
            p.textContent = '履歴はありません。';
            historyContainer.appendChild(p);
            return;
        }

        histories.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';

            const promptP = document.createElement('p');
            promptP.className = 'prompt';
            promptP.textContent = `Q: ${item.prompt}`;

            const answerP = document.createElement('p');
            answerP.className = 'answer';
            answerP.textContent = item.answer;

            const dateP = document.createElement('p');
            dateP.className = 'date';
            dateP.textContent = new Date(item.created_at).toLocaleString();

            div.appendChild(promptP);
            div.appendChild(answerP);
            div.appendChild(dateP);

            historyContainer.appendChild(div);
        });
    }

    // 最新回答描画関数
    function renderLatestAnswer(item) {
        latestAnswerContainer.innerHTML = '';

        const promptP = document.createElement('p');
        promptP.className = 'prompt';
        promptP.textContent = `Q: ${item.prompt}`;

        const answerP = document.createElement('p');
        answerP.className = 'answer';
        answerP.textContent = item.answer;

        const dateP = document.createElement('p');
        dateP.className = 'date';
        dateP.textContent = new Date(item.created_at).toLocaleString();

        latestAnswerContainer.appendChild(promptP);
        latestAnswerContainer.appendChild(answerP);
        latestAnswerContainer.appendChild(dateP);
    }
});