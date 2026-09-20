<script setup>
import { computed } from "vue";

const props = defineProps({
	en: String,
	ur: String,
	mode: { type: String, default: "both" },
	required: { type: Boolean, default: false },
});

function clean(text) {
	return (text || "").replace(/\s*\*\s*$/, "").trim();
}

const showReq = computed(
	() => Boolean(props.required) || /\*/.test(props.en || "") || /\*/.test(props.ur || ""),
);
</script>

<template>
	<label>
		<span class="en">
			{{ clean(en) }}
			<span v-if="showReq" class="req" title="Required">*</span>
		</span>
		<span v-if="mode !== 'en' && ur" class="ur urdu">{{ clean(ur) }}</span>
	</label>
</template>
