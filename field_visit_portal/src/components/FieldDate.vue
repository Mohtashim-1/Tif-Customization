<script setup>
import DatePicker from "./DatePicker.vue";
import FieldLabel from "./FieldLabel.vue";

defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	required: { type: Boolean, default: false },
});
const model = defineModel({ type: String, default: "" });
</script>

<template>
	<div class="field">
		<FieldLabel :en="labelEn" :ur="labelUr" :mode="mode" :required="required" />
		<DatePicker v-model="model" />
	</div>
</template>
