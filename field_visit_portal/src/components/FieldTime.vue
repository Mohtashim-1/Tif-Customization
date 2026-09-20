<script setup>
import TimePicker from "./TimePicker.vue";
import FieldLabel from "./FieldLabel.vue";

defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	required: { type: Boolean, default: false },
});
const model = defineModel({ type: String, default: "10:00" });
</script>

<template>
	<div class="field">
		<FieldLabel :en="labelEn" :ur="labelUr" :mode="mode" :required="required" />
		<TimePicker v-model="model" />
	</div>
</template>
