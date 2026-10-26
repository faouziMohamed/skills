import {ASSETS} from '../../shared/routes.constant.mjs';

const loading = new Map();

/**
 * Loads the downloaded ECharts library once.
 * @returns {Promise<any>} The `echarts` global.
 */
export function loadECharts() {
  return loadScripts([ASSETS.vendor('echarts.min.js')]).then(
    () => window.echarts,
  );
}

/**
 * Loads the downloaded Mermaid library once.
 * @returns {Promise<any>} The `mermaid` global.
 */
export function loadMermaid() {
  return loadScripts([ASSETS.vendor('mermaid.min.js')]).then(
    () => window.mermaid,
  );
}

/**
 * Loads the downloaded Cytoscape.js with the dagre layout once.
 * @returns {Promise<any>} The `cytoscape` factory.
 */
export async function loadCytoscape() {
  await loadScripts([
    ASSETS.vendor('cytoscape.min.js'),
    ASSETS.vendor('dagre.min.js'),
    ASSETS.vendor('cytoscape-dagre.js'),
  ]);
  const cytoscape = window.cytoscape;
  if (!cytoscape('layout', 'dagre') && window.cytoscapeDagre)
    cytoscape.use(window.cytoscapeDagre);
  return cytoscape;
}

async function loadScripts(sources) {
  for (const source of sources) await loadScript(source);
}

function loadScript(source) {
  if (!loading.has(source)) {
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => {
        loading.delete(source);
        script.remove();
        reject(new Error(`Could not load ${source}`));
      };
      document.head.append(script);
    });
    loading.set(source, promise);
  }
  return loading.get(source);
}
