import {escapeHtml} from '../../core/html.util.js';
import {taskPath} from '../../core/router.js';
import {$, showToast, state} from '../../core/state.js';
import {applyTaskAction, createTask, updateTaskBody} from './tasks.service.js';

/**
 * Wires task transitions, body saves and the new-task, block and done dialogs.
 * @param {{loadTasks: () => Promise<void>, reloadActiveTask: (id: string) => Promise<void>, openPeek: (id: string) => void, openSettings: () => void}} options
 */
export function initTaskActions({
  loadTasks,
  reloadActiveTask,
  openPeek,
  openSettings,
}) {
  const addDialog = $('#add-dialog');
  const blockDialog = $('#block-dialog');
  const doneDialog = $('#done-dialog');

  async function runAction(id, payload, message) {
    try {
      await applyTaskAction(id, payload);
      showToast(message, 'success');
      await reloadActiveTask(id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function updateBlockers(id, added, removed) {
    try {
      if (added.length > 0)
        await applyTaskAction(id, {action: 'block', by: added});
      if (removed.length > 0)
        await applyTaskAction(id, {action: 'unblock', by: removed});
      showToast(blockerChangeMessage(added, removed), 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
    await reloadActiveTask(id);
  }

  function openBlockDialog(id) {
    const target = state.tasks.find(task => task.id === id);
    const current = target ? target.blockedBy : [];
    const canAdd = target?.status !== 'on-hold';
    const waiting = dependentsOf(id, state.tasks);
    const candidates = canAdd
      ? state.tasks.filter(
          task =>
            task.status !== 'done' &&
            task.id !== id &&
            !current.includes(task.id) &&
            !waiting.has(task.id),
        )
      : [];
    const editing = current.length > 0;
    state.blockTarget = id;
    state.blockCurrent = [...current];
    $('#block-title').textContent = editing
      ? `Blockers of ${id}`
      : `Block ${id}`;
    $('#block-hint').textContent = blockHint(editing, canAdd);
    $('#block-submit').textContent = editing ? 'Save blockers' : 'Block task';
    const options = [
      ...current.map(blockerId => blockerOption(blockerId, true)),
      ...candidates.map(task => blockerOption(task.id, false)),
    ];
    $('#block-options').innerHTML = options.length
      ? options.join('')
      : '<p class="muted">No other open task is available as a blocker.</p>';
    if (!blockDialog.open) blockDialog.showModal();
  }

  function openDoneDialog(id) {
    state.doneTarget = id;
    $('#done-form').elements.summary.value = '';
    const task = state.tasks.find(item => item.id === id);
    const open = task?.dod?.present
      ? task.dod.items.filter(item => !item.done)
      : [];
    const warning = $('#done-dod');
    warning.hidden = open.length === 0;
    warning.innerHTML = open.length
      ? `<strong>${open.length} Definition of done item${open.length === 1 ? '' : 's'} not checked</strong>
        <ul>${open.map(item => `<li>${escapeHtml(item.text).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`).join('')}</ul>
        <p>Finish them, or record why they are deferred under What is left before closing.</p>`
      : '';
    if (!doneDialog.open) doneDialog.showModal();
  }

  function handleDetailAction(task, action) {
    if (action === 'start')
      runAction(task.id, {action: 'start'}, 'Task started.');
    if (action === 'unblock')
      runAction(task.id, {action: 'unblock'}, 'Task unblocked.');
    if (action === 'hold')
      runAction(task.id, {action: 'hold'}, 'Task put on hold.');
    if (action === 'resume')
      runAction(task.id, {action: 'resume'}, 'Task resumed.');
    if (action === 'block') openBlockDialog(task.id);
    if (action === 'done') openDoneDialog(task.id);
  }

  async function saveTaskBody(task, body) {
    try {
      await updateTaskBody(task.id, body);
      showToast('Task body saved.', 'success');
      await loadTasks();
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }

  async function copyTaskLink(task) {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${taskPath(task.id)}`,
      );
      showToast('Task link copied.', 'success');
    } catch {
      showToast('Could not copy the link.', 'error');
    }
  }

  function openAddDialog() {
    if (!state.initialized) {
      openSettings('init');
      return;
    }
    addDialog.showModal();
    $('#add-form [name="title"]').focus();
  }

  $('#add-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payload = await createTask({
        title: data.get('title'),
        priority: data.get('priority'),
        resume: data.get('resume'),
      });
      addDialog.close();
      form.reset();
      showToast('Task created.', 'success');
      await loadTasks();
      if (payload.id) openPeek(payload.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  $('#block-form').addEventListener('submit', async event => {
    event.preventDefault();
    const chosen = [
      ...event.currentTarget.querySelectorAll('[name="blocker"]:checked'),
    ].map(input => input.value);
    const current = state.blockCurrent;
    const added = chosen.filter(id => !current.includes(id));
    const removed = current.filter(id => !chosen.includes(id));
    if (added.length === 0 && removed.length === 0) {
      const message = current.length
        ? 'The blockers are unchanged.'
        : 'Choose at least one blocker.';
      showToast(message, 'error');
      return;
    }
    blockDialog.close();
    await updateBlockers(state.blockTarget, added, removed);
  });

  $('#done-form').addEventListener('submit', async event => {
    event.preventDefault();
    const summary = new FormData(event.currentTarget).get('summary');
    doneDialog.close();
    await runAction(
      state.doneTarget,
      {action: 'done', summary},
      'Task marked shipped.',
    );
  });

  return {handleDetailAction, saveTaskBody, copyTaskLink, openAddDialog};
}

function dependentsOf(id, tasks) {
  const found = new Set();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const task of tasks) {
      if (!task.blockedBy.includes(current) || found.has(task.id)) continue;
      found.add(task.id);
      pending.push(task.id);
    }
  }
  return found;
}

function blockerOption(id, checked) {
  const task = state.tasks.find(item => item.id === id);
  const title = task ? task.title : 'Not in the queue';
  const detail = task ? `${task.status} · ${task.resume}` : 'Missing task';
  return `<label class="check-item">
    <input type="checkbox" name="blocker" value="${escapeHtml(id)}"${checked ? ' checked' : ''}>
    <span><strong>${escapeHtml(id)} · ${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
  </label>`;
}

function blockHint(editing, canAdd) {
  if (!editing) return 'Choose the task or tasks that must finish first.';
  if (!canAdd)
    return 'Untick a blocker to remove it. Resume the task to add new blockers.';
  return 'Untick a blocker to remove it, or tick another task that must finish first.';
}

function blockerChangeMessage(added, removed) {
  if (removed.length === 0) return 'Task blocked.';
  if (added.length === 0) return `Removed ${removed.join(', ')}.`;
  return 'Blockers updated.';
}
