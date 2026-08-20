import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	server: {
		port: 8088,
		proxy: getProxyOptions(),
	},
	build: {
		outDir: path.resolve(__dirname, "../tif_customization/public/training_schedule"),
		emptyOutDir: true,
		target: "es2015",
		manifest: true,
		rollupOptions: {
			input: path.resolve(__dirname, "index.html"),
			output: {
				entryFileNames: "assets/[name]-[hash].js",
				chunkFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash][extname]",
			},
		},
	},
	base: "/assets/tif_customization/training_schedule/",
});

function getProxyOptions() {
	const config = getCommonSiteConfig();
	const webserver_port = config ? config.webserver_port : 8000;
	return {
		"^/(app|login|api|assets|files|private)": {
			target: `http://127.0.0.1:${webserver_port}`,
			ws: true,
			router(req) {
				const site_name = req.headers.host.split(":")[0];
				return `http://${site_name}:${webserver_port}`;
			},
		},
	};
}

function getCommonSiteConfig() {
	let currentDir = path.resolve(".");
	while (currentDir !== "/") {
		if (fs.existsSync(path.join(currentDir, "sites")) && fs.existsSync(path.join(currentDir, "apps"))) {
			const configPath = path.join(currentDir, "sites", "common_site_config.json");
			if (fs.existsSync(configPath)) {
				return JSON.parse(fs.readFileSync(configPath, "utf8"));
			}
			return null;
		}
		currentDir = path.resolve(currentDir, "..");
	}
	return null;
}
