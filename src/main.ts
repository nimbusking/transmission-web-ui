import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { i18n, setLanguage } from './i18n';
import App from './App.vue';
import Workspace from './components/Workspace.vue';
import './style.css';
import './themes.css';
import './visual-themes.css';
await setLanguage(new URLSearchParams(location.search).get('lang') || 'auto');
const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: Workspace }],
});
createApp(App).use(createPinia()).use(i18n).use(router).mount('#app');
