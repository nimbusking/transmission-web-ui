/* global window, document, setTimeout, clearTimeout, URL, Blob */
/* Independent startup fallback: intentionally uses conservative JavaScript syntax. */
(function () {
  var events = [];
  var buildId = document.currentScript.getAttribute('data-build-id') || 'bootstrap';
  var started = new Date().toISOString();
  var timer;
  function record(event) {
    if (events.length < 50)
      events.push({
        seq: events.length + 1,
        at: new Date().toISOString(),
        monoMs: new Date().getTime() - new Date(started).getTime(),
        type: 'startup.error',
        level: 'error',
        data: { source: event.type, line: event.lineno || 0, column: event.colno || 0 },
      });
  }
  window.addEventListener('error', record, true);
  window.addEventListener('unhandledrejection', record);
  window.__diagnosticsBoot = {
    take: function () {
      clearTimeout(timer);
      window.removeEventListener('error', record, true);
      window.removeEventListener('unhandledrejection', record);
      var result = events;
      events = [];
      return result;
    },
  };
  timer = setTimeout(function () {
    if (document.querySelector('#app').children.length) return;
    var box = document.createElement('div');
    box.textContent = 'Application startup failed / 应用启动失败 ';
    var button = document.createElement('button');
    button.textContent = 'Export diagnostics / 导出诊断';
    button.onclick = function () {
      var url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify({
              schemaVersion: 1,
              app: { version: 'startup', buildId: buildId },
              capture: {
                mode: 'startup',
                eligibility: 'diagnostic-only',
                start: started,
                end: new Date().toISOString(),
                complete: false,
                reasons: ['startup-failure'],
              },
              environment: {},
              checkpoint: null,
              observed: null,
              privacy: { version: 1, transforms: ['metadata-whitelist'], losses: ['startup-only'] },
              events: events,
            }),
          ],
          { type: 'application/json' },
        ),
      );
      var link = document.createElement('a');
      link.href = url;
      link.download = 'transmission-web-ui-startup-diagnostic.json';
      link.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    };
    box.appendChild(button);
    document.body.appendChild(box);
  }, 15000);
})();
