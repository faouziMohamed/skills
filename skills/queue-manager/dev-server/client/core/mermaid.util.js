import {escapeHtml} from './html.util.js';
import {resolvedDark} from './theme.js';
import {loadMermaid} from './vendor-loader.js';

const pendingSelector = '.mermaid-diagram:not([data-rendered])';
let diagramCount = 0;
let scheduled = false;
let queue = Promise.resolve();

/**
 * Draws every ```mermaid fence that Markdown rendering placed on the page, now
 * and whenever a view re-renders. The fence source stays visible until the
 * diagram is drawn, and remains readable when it cannot be.
 */
export function installMermaid() {
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  new MutationObserver(redrawAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', redrawAll);
  document.addEventListener('click', retryLoad);
  schedule();
}

function retryLoad(event) {
  const button = event.target.closest('[data-mermaid-retry]');
  if (!button) return;
  for (const container of document.querySelectorAll(
    '.mermaid-diagram[data-rendered="load-error"]',
  )) {
    container.querySelector('.mermaid-error')?.remove();
    delete container.dataset.rendered;
  }
  schedule();
}

function redrawAll() {
  document
    .querySelectorAll('.mermaid-diagram[data-rendered="done"]')
    .forEach(container => {
      const source = container.querySelector('.mermaid-source code');
      if (!source) return;
      container.innerHTML = `<pre><code class="language-mermaid">${escapeHtml(source.textContent)}</code></pre>`;
      delete container.dataset.rendered;
    });
  schedule();
}

function schedule() {
  if (scheduled || !document.querySelector(pendingSelector)) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    queue = queue.then(drawPending);
  });
}

async function drawPending() {
  const containers = [...document.querySelectorAll(pendingSelector)];
  if (!containers.length) return;
  containers.forEach(container => (container.dataset.rendered = 'pending'));
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (error) {
    containers.forEach(container => showLoadFailure(container, error));
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: resolvedDark() ? 'dark' : 'default',
    fontFamily: 'inherit',
  });
  for (const container of containers) await drawOne(mermaid, container);
}

async function drawOne(mermaid, container) {
  const source = container.querySelector('code')?.textContent ?? '';
  diagramCount += 1;
  try {
    await mermaid.parse(source);
    const {svg} = await mermaid.render(`mermaid-${diagramCount}`, source);
    container.innerHTML = `<div class="mermaid-svg" role="img" aria-label="Diagram">${svg}</div><details class="mermaid-source"><summary>Diagram source</summary><pre><code>${escapeHtml(source)}</code></pre></details>`;
    keepNaturalWidth(container.querySelector('.mermaid-svg svg'));
    container.dataset.rendered = 'done';
  } catch (error) {
    showFailure(container, error);
  }
}

// Mermaid scales a diagram down to its column; wide ones become unreadable, so
// they keep their drawn width and the frame scrolls instead.
function keepNaturalWidth(svg) {
  const width = svg?.viewBox?.baseVal?.width;
  if (!width) return;
  svg.style.maxWidth = 'none';
  svg.style.width = `${Math.ceil(width)}px`;
}

function showLoadFailure(container, error) {
  const retry =
    '<button class="btn" type="button" data-mermaid-retry>Retry</button>';
  showError(container, 'load-error', 'Diagrams could not load', error, retry);
}

function showFailure(container, error) {
  showError(container, 'error', 'Diagram could not be drawn', error, '');
}

function showError(container, rendered, label, error, actions) {
  container.dataset.rendered = rendered;
  const message = String(error?.message ?? error).split('\n')[0];
  const text = `${label}: ${escapeHtml(message)}`;
  container.insertAdjacentHTML(
    'beforeend',
    `<p class="mermaid-error" role="status">${text} ${actions}</p>`,
  );
}
