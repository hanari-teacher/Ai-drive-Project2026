class TodoApi {
  async getAll() {
    const res = await fetch('/api/v1/todos');
    if (!res.ok) throw new Error('一覧の取得に失敗しました');
    const json = await res.json();
    return json.data;
  }

  async create(title) {
    const res = await fetch('/api/v1/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || '登録に失敗しました');
    }
    return await res.json();
  }

  async updateCompleted(id, completed) {
    const res = await fetch(`/api/v1/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (!res.ok) throw new Error('更新に失敗しました');
    return await res.json();
  }

  async delete(id) {
    const res = await fetch(`/api/v1/todos/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('削除に失敗しました');
    return true;
  }
}