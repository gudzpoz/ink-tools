import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import PrimeVue from 'primevue/config';
import { createApp } from 'vue';
import App from './App.vue';

import 'primevue/resources/themes/md-light-indigo/theme.css';

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
const app = createApp(App as never);

app.use(pinia);
app.use(PrimeVue);
app.mount('#app');
