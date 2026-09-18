<script setup>
defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	file: File,
	accept: { type: String, default: "image/*,.pdf,.xlsx,.xls,.csv" },
	hintEn: { type: String, default: "" },
	hintUr: { type: String, default: "" },
});
const emit = defineEmits(["pick"]);

function onDrop(e) {
	e.preventDefault();
	const f = e.dataTransfer.files?.[0];
	if (f) emit("pick", f);
}
function onChange(e) {
	const f = e.target.files?.[0];
	if (f) emit("pick", f);
}
</script>

<template>
	<div
		class="dropzone"
		@dragover.prevent
		@drop="onDrop"
		@click="$refs.file?.click()"
	>
		<input ref="file" type="file" :accept="accept" class="hidden" @change="onChange" />
		<div class="dz">
			<div class="ico">📎</div>
			<div>
				<div class="dz-title">
					{{ labelEn }}
					<div v-if="mode !== 'en'" class="urdu muted">{{ labelUr }}</div>
				</div>
				<div class="muted">
					<template v-if="file">{{ file.name }}</template>
					<template v-else-if="mode === 'ur'">{{ hintUr || "کلک کریں یا فائل یہاں گھسیٹیں" }}</template>
					<template v-else>{{ hintEn || "Click or drag file here / فائل یہاں لگائیں" }}</template>
				</div>
				<div v-if="file" class="ready">✓ {{ (file.size / 1024).toFixed(0) }} KB ready / تیار</div>
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
.dz-title {
	font-size: 13px;
	font-weight: 500;
}
.muted {
	font-size: 11px;
	color: #71717a;
	margin-top: 2px;
}
.ready {
	margin-top: 8px;
	font-size: 11px;
	font-weight: 500;
	color: #0f7a3c;
}
</style>
