<script setup>
import TimePicker from "./TimePicker.vue";

defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
});
const model = defineModel({ type: String, default: "10:00" });
</script>

<template>
	<div class="field">
		<label>
			<span class="en">{{ labelEn }}</span>
			<span v-if="mode !== 'en' && labelUr" class="ur urdu">{{ labelUr }}</span>
		</label>
		<TimePicker v-model="model" />
	</div>
</template>
