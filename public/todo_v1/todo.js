class TodoApi {
  async fetchTodos() {
    const res = await fetch('/api/v1/todo');
    const json = await res.json();
    if (!json.success) throw new Error(json.error.message);
    return json.data;
  }

async createTodo(title) {
    const res = await fetch('/api/v1/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    
    // レスポンスがJSONかどうか、errorが存在するかを安全に確認
    const json = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      // json.error や json.error.message が undefined でも落ちないようにする
      const errorMessage = json?.error?.message || `Error status: ${res.status}`;
      throw new Error(errorMessage);
    }
    return json.data;
  }

  async updateTodoStatus(id, completed) {
    const res = await fetch(`/api/v1/todo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Failed to update');
    return json.data;
  }

  async deleteTodo(id) {
    const res = await fetch(`/api/v1/todo/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok && res.status !== 204) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error?.message || 'Failed to delete');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const api = new TodoApi();
  const form = document.getElementById('todo-form');
  const input = document.getElementById('todo-input');
  const listContainer = document.getElementById('todo-list');
  const errorAlert = document.getElementById('error-alert');

  function showError(message) {
    errorAlert.textContent = message;
    errorAlert.classList.remove('hidden');
    setTimeout(() => errorAlert.classList.add('hidden'), 4000);
  }

  async function loadTodos() {
    try {
      const todos = await api.fetchTodos();
      renderTodos(todos);
    } catch (err) {
      showError(err.message);
    }
  }

  function renderTodos(todos) {
    listContainer.innerHTML = '';
    if (todos.length === 0) {
      listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">TODOがありません</p>';
      return;
    }

    todos.forEach(todo => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm';
      item.innerHTML = `
        <div class="flex items-center space-x-3">
          <input type="checkbox" ${todo.completed ? 'checked' : ''} class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer toggle-chk" data-id="${todo.id}">
          <span class="${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}">${escapeHtml(todo.title)}</span>
        </div>
        <button class="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded delete-btn" data-id="${todo.id}">削除</button>
      `;
      listContainer.appendChild(item);
    });

    // イベントリスナーの付与
    listContainer.querySelectorAll('.toggle-chk').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        try {
          await api.updateTodoStatus(e.target.dataset.id, e.target.checked);
          loadTodos();
        } catch (err) {
          showError(err.message);
        }
      });
    });

    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        try {
          await api.deleteTodo(e.target.dataset.id);
          loadTodos();
        } catch (err) {
          showError(err.message);
        }
      });
    });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;

    try {
      await api.createTodo(title);
      input.value = '';
      loadTodos();
    } catch (err) {
      showError(err.message);
    }
  });

  loadTodos();
});