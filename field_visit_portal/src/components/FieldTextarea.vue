<script setup>
import FieldLabel from "./FieldLabel.vue";

defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	placeholder: String,
	required: { type: Boolean, default: false },
	modelValue: String,
});
const emit = defineEmits(["update:modelValue"]);
</script>

<template>
	<div class="field">
		<FieldLabel :en="labelEn" :ur="labelUr" :mode="mode" :required="required" />
		<textarea
			rows="3"
			:value="modelValue"
			:placeholder="placeholder"
			@input="emit('update:modelValue', $event.target.value)"
		/>
	</div>
</template>
