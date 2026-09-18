<script setup>
defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	placeholder: String,
	modelValue: String,
});
const emit = defineEmits(["update:modelValue"]);
</script>

<template>
	<div class="field">
		<label>
			<span class="en">{{ labelEn }}</span>
			<span v-if="mode !== 'en' && labelUr" class="ur urdu">{{ labelUr }}</span>
		</label>
		<textarea
			rows="3"
			:value="modelValue"
			:placeholder="placeholder"
			@input="emit('update:modelValue', $event.target.value)"
		/>
	</div>
</template>
