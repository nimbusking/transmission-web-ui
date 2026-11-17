import { diagnostics } from './services/diagnostics/recorder';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { i18n, setLanguage } from './i18n';
import App from './App.vue';
import Workspace from './components/Workspace.vue';
import './style.css';
import './themes.css';
import './visual-themes.css';
window.addEventListener('error', (event) => diagnostics.exception('window', event.error), true);
window.addEventListener('unhandledrejection', (event) =>
  diagnostics.exception('promise', event.reason),
);
document.addEventListener('visibilitychange', () =>
  diagnostics.record('lifecycle.visibility', { hidden: document.hidden }),
);
await setLanguage(new URLSearchParams(location.search).get('lang') || 'auto');
const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: Workspace }],
});
const application = createApp(App);
application.config.errorHandler = (error) => diagnostics.exception('vue', error);
application.use(createPinia()).use(i18n).use(router).mount('#app');
for (const event of window.__diagnosticsBoot?.take() ?? []) {
  diagnostics.record('startup.error', { line: event.line, column: event.column });
}
