<script setup>
defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	type: { type: String, default: "text" },
	placeholder: String,
	helperEn: String,
	helperUr: String,
	modelValue: [String, Number],
});
const emit = defineEmits(["update:modelValue"]);
</script>

<template>
	<div class="field">
		<label>
			<span class="en">{{ labelEn }}</span>
			<span v-if="mode !== 'en' && labelUr" class="ur urdu">{{ labelUr }}</span>
		</label>
		<input
			:type="type"
			:value="modelValue"
			:placeholder="placeholder"
			@input="emit('update:modelValue', $event.target.value)"
		/>
		<div v-if="helperEn || helperUr" class="helper">
			<span v-if="mode === 'ur'" class="urdu">{{ helperUr }}</span>
			<template v-else>
				{{ helperEn }}
				<span v-if="mode === 'both' && helperUr" class="urdu"> / {{ helperUr }}</span>
			</template>
		</div>
	</div>
</template>
