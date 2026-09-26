// Module worker for Docent practice. Pyodide 314 needs a module worker
// (pyodide.asm.mjs is an ES module); it is imported from the URL the page sends.

let runJson = null;

async function init({ pyodideUrl, harnessUrl }) {
  const { loadPyodide } = await import(pyodideUrl);
  const quiet = () => {};
  const pyodide = await loadPyodide({ stdout: quiet, stderr: quiet });
  const response = await fetch(harnessUrl);
  if (!response.ok) throw new Error(`could not fetch the grader (${response.status})`);
  const source = await response.text();
  const namespace = pyodide.globals.get('dict')();
  pyodide.runPython(source, { globals: namespace });
  runJson = namespace.get('run_json');
  const python = pyodide.runPython('import sys; sys.version.split()[0]');
  return { version: pyodide.version, python };
}

self.addEventListener('message', async (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    try {
      const info = await init(msg);
      self.postMessage({ type: 'ready', ...info });
    } catch (error) {
      self.postMessage({ type: 'init-error', message: String((error && error.message) || error) });
    }
    return;
  }
  if (msg.type === 'run') {
    let result;
    try {
      const checks = msg.checks ? JSON.stringify(msg.checks) : '';
      result = JSON.parse(runJson(String(msg.code ?? ''), checks));
    } catch (error) {
      const message = String((error && error.message) || error);
      result = {
        stdout: '',
        stderr: '',
        error: { kind: 'internal', type: 'InternalError', message, summary: message, line: null, fatal: /fatal/i.test(message) },
      };
    }
    self.postMessage({ type: 'result', id: msg.id, result });
  }
});
