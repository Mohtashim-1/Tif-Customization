<script setup>
defineProps({
	titleEn: String,
	titleUr: String,
	subEn: String,
	subUr: String,
	mode: { type: String, default: "both" },
});
</script>

<template>
	<div>
		<div class="st">
			<template v-if="mode === 'en'">{{ titleEn }}</template>
			<span v-else-if="mode === 'ur'" class="urdu">{{ titleUr }}</span>
			<template v-else>
				{{ titleEn }}
				<span class="urdu green"> / {{ titleUr }}</span>
			</template>
		</div>
		<div v-if="subEn || subUr" class="ss">
			<template v-if="mode === 'en'">{{ subEn }}</template>
			<span v-else-if="mode === 'ur'" class="urdu">{{ subUr }}</span>
			<template v-else>
				{{ subEn }}
				<span v-if="subUr" class="urdu"> / {{ subUr }}</span>
			</template>
		</div>
	</div>
</template>

<style scoped>
.st {
	font-size: 16px;
	font-weight: 600;
	letter-spacing: -0.025em;
}
.ss {
	font-size: 12px;
	color: #71717a;
	margin-top: 2px;
}
.green {
	color: #0f7a3c;
}
</style>
