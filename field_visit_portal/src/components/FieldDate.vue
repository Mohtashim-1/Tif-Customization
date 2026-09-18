<script setup>
import DatePicker from "./DatePicker.vue";

defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
});
const model = defineModel({ type: String, default: "" });
</script>

<template>
	<div class="field">
		<label>
			<span class="en">{{ labelEn }}</span>
			<span v-if="mode !== 'en' && labelUr" class="ur urdu">{{ labelUr }}</span>
		</label>
		<DatePicker v-model="model" />
	</div>
</template>
