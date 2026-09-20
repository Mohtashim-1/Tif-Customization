<script setup>
import FieldLabel from "./FieldLabel.vue";

defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	type: { type: String, default: "text" },
	placeholder: String,
	helperEn: String,
	helperUr: String,
	required: { type: Boolean, default: false },
	modelValue: [String, Number],
});
const emit = defineEmits(["update:modelValue"]);
</script>

<template>
	<div class="field">
		<FieldLabel :en="labelEn" :ur="labelUr" :mode="mode" :required="required" />
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
