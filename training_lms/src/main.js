import { createApp } from "vue";
import App from "./App.vue";
import "./assets/theme.css";
import { bootFromPath } from "./store";

bootFromPath();
window.addEventListener("popstate", bootFromPath);
createApp(App).mount("#app");
