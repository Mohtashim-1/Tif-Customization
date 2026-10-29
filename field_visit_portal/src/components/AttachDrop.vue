<script setup>
import { onBeforeUnmount, ref, watch } from "vue";
import { formatCapture, isImageFile, readCaptureTime } from "../lib/captureTime";

const props = defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	file: File,
	accept: { type: String, default: "image/*,.pdf,.xlsx,.xls,.csv" },
	hintEn: { type: String, default: "" },
	hintUr: { type: String, default: "" },
	required: { type: Boolean, default: false },
	/** Max video length in seconds (0 = no check). */
	maxDurationSec: { type: Number, default: 0 },
});
const emit = defineEmits(["pick"]);
const previewUrl = ref("");
const captured = ref("");
const missingCapture = ref(false);
const durationError = ref("");

function clearPreview() {
	if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
	previewUrl.value = "";
	captured.value = "";
	missingCapture.value = false;
	durationError.value = "";
}

function readVideoDuration(file) {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = () => {
			const d = Number(video.duration) || 0;
			URL.revokeObjectURL(url);
			resolve(d);
		};
		video.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(0);
		};
		video.src = url;
	});
}

async function acceptFile(f) {
	if (!f) return;
	durationError.value = "";
	const isVideo = String(f.type || "").startsWith("video/") || /\.(mp4|mov|webm|m4v|3gp)$/i.test(f.name || "");
	if (isVideo && props.maxDurationSec > 0) {
		const dur = await readVideoDuration(f);
		if (dur > props.maxDurationSec + 0.5) {
			durationError.value = `Video is ${Math.round(dur)}s — keep it about 30 seconds (max ${props.maxDurationSec}s).`;
			emit("pick", null);
			return;
		}
	}
	emit("pick", f);
}

watch(
	() => props.file,
	async (file) => {
		clearPreview();
		if (!file || !isImageFile(file)) return;
		previewUrl.value = URL.createObjectURL(file);
		const when = await readCaptureTime(file);
		if (previewUrl.value && props.file === file) {
			captured.value = when ? formatCapture(when) : "";
			missingCapture.value = !when;
		}
	},
	{ immediate: true }
);

onBeforeUnmount(clearPreview);

function onDrop(e) {
	e.preventDefault();
	const f = e.dataTransfer.files?.[0];
	if (f) acceptFile(f);
}
function onChange(e) {
	const f = e.target.files?.[0];
	if (f) acceptFile(f);
	e.target.value = "";
}
</script>

<template>
	<div class="dropzone" @dragover.prevent @drop="onDrop" @click="$refs.file?.click()">
		<input ref="file" type="file" :accept="accept" class="hidden" @change="onChange" />
		<div class="dz">
			<img v-if="previewUrl" :src="previewUrl" alt="" class="shot" />
			<div v-else class="ico">📎</div>
			<div>
				<div class="dz-title">
					{{ labelEn }}<span v-if="required" class="req">*</span>
					<div v-if="mode !== 'en'" class="urdu muted">{{ labelUr }}</div>
				</div>
				<div class="muted">
					<template v-if="file">{{ file.name }}</template>
					<template v-else-if="mode === 'ur'">{{ hintUr || "کلک کریں یا فائل یہاں گھسیٹیں" }}</template>
					<template v-else>{{ hintEn || "Click or drag file here / فائل یہاں لگائیں" }}</template>
				</div>
				<div v-if="captured" class="captured">
					Captured: {{ captured }}
					<div v-if="mode !== 'en'" class="urdu">تصویر کا وقت</div>
				</div>
				<div v-else-if="missingCapture" class="missing">
					No capture time. Add the original photo you clicked, not a copy.
					<div v-if="mode !== 'en'" class="urdu">وقت نہیں ملا۔ اصل تصویر لگائیں، کاپی نہیں۔</div>
				</div>
				<div v-else-if="file" class="ready">✓ {{ (file.size / 1024).toFixed(0) }} KB ready / تیار</div>
				<div v-if="durationError" class="missing">{{ durationError }}</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.hidden {
	display: none;
}
.dz {
	display: flex;
	gap: 12px;
	align-items: flex-start;
}
.ico {
	width: 40px;
	height: 40px;
	border-radius: 12px;
	background: #fff;
	border: 1px solid #e4e4e7;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 18px;
	flex-shrink: 0;
}
.shot {
	width: 72px;
	height: 72px;
	object-fit: cover;
	border-radius: 12px;
	border: 1px solid #e4e4e7;
	background: #f4f4f5;
	flex-shrink: 0;
}
.dz-title {
	font-size: 13px;
	font-weight: 500;
}
.muted {
	font-size: 11px;
	color: #71717a;
	margin-top: 2px;
}
.ready,
.captured,
.missing {
	margin-top: 8px;
	font-size: 12px;
	font-weight: 600;
	line-height: 1.35;
}
.ready,
.captured {
	color: #0f7a3c;
}
.missing {
	color: #b45309;
}
.urdu {
	font-weight: 500;
	margin-top: 2px;
}
</style>
