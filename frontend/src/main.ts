import { createApp } from 'vue'
import './style.css'
import './lib/progress'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
