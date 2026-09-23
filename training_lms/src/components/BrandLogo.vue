<script setup>
import logo from "../assets/ilm-logo.png";

defineProps({
	size: { type: [Number, String], default: 32 },
});
</script>

<template>
	<img
		:src="logo"
		alt="The ILM Foundation"
		class="brand-logo"
		:style="{ width: size + 'px', height: size + 'px' }"
	/>
</template>
