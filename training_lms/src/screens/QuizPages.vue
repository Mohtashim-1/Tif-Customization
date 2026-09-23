<script setup>
import { computed, nextTick } from "vue";
import { state, go, goBack, courseById, toast, saveQuiz, addQuestion, removeQuestion } from "../store";

const course = computed(() => courseById(state.quiz?.courseId || state.selectedCourseId));
const quiz = computed(() => state.quiz);

function setType(q, type) {
	q.type = type;
	if (type === "tf") {
		q.options = ["True", "False"];
		q.answer = 0;
	} else if (type === "short") {
		q.options = [];
		q.answer = "";
	} else if (type === "multi") {
		if (!Array.isArray(q.options) || q.options.length < 2) q.options = ["", "", "", ""];
		q.answer = Array.isArray(q.answer) ? q.answer : [];
	} else {
		if (!Array.isArray(q.options) || q.options.length < 2) q.options = ["", "", "", ""];
		q.answer = typeof q.answer === "number" ? q.answer : 0;
	}
}

function addOption(q, after) {
	if (!Array.isArray(q.options)) q.options = [];
	const at = after == null ? q.options.length : after + 1;
	q.options.splice(at, 0, "");
	nextTick(() => {
		const el = document.querySelector(`[data-opt="${q.id}-${at}"]`);
		el?.focus();
	});
}

function removeOption(q, i) {
	if ((q.options || []).length <= 2) {
		q.options[i] = "";
		return;
	}
	q.options.splice(i, 1);
	if (q.type === "multi" && Array.isArray(q.answer)) {
		q.answer = q.answer.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n));
	} else if (typeof q.answer === "number" && q.answer >= q.options.length) {
		q.answer = 0;
	}
}

function onOptionEnter(q, i, ev) {
	ev.preventDefault();
	ev.stopPropagation();
	addOption(q, i);
}

function toggleMulti(q, i) {
	const cur = new Set(Array.isArray(q.answer) ? q.answer : []);
	if (cur.has(i)) cur.delete(i);
	else cur.add(i);
	q.answer = [...cur].sort((a, b) => a - b);
}

async function save() {
	if (!quiz.value?.name) {
		toast("Give the quiz a title.");
		return;
	}
	if (!quiz.value.questions?.length) {
		toast("Add at least one question.");
		return;
	}
	for (const q of quiz.value.questions) {
		if (Array.isArray(q.options)) q.options = q.options.map((s) => String(s || "").trim()).filter(Boolean);
		if (!q.text) {
			toast("Every question needs text.");
			return;
		}
		if (q.type !== "short" && !(q.options || []).length) {
			toast("Multiple-choice questions need options.");
			return;
		}
	}
	await saveQuiz(quiz.value);
}

function stopEnter(ev) {
	if (ev.target.tagName === "TEXTAREA") return;
	if (ev.target.closest("[data-opt]")) return;
	ev.preventDefault();
}
</script>

<template>
	<form class="card" style="max-width: 920px" v-if="quiz" @submit.prevent="save" @keydown.enter="stopEnter">
		<div class="row" style="justify-content: space-between">
			<div>
				<div class="q-meta">{{ course?.name || "Program" }}</div>
				<h2 style="margin: 6px 0 0">Set up quiz</h2>
				<p style="color: var(--muted); margin: 8px 0 0">
					Press Enter on an option to add the next one. Saved quizzes stay in ERP.
				</p>
			</div>
			<button class="btn" type="button" @click="goBack">← Back</button>
		</div>
		<div class="form-grid" style="margin-top: 18px">
			<label class="field full"><span>Quiz title</span><input v-model="quiz.name" placeholder="Final Assessment" /></label>
			<label class="field"><span>Passing %</span><input v-model.number="quiz.passing" type="number" min="1" max="100" /></label>
			<label class="field"><span>Duration (minutes)</span><input v-model.number="quiz.duration" type="number" min="1" /></label>
			<label class="field"><span>Max attempts</span><input v-model.number="quiz.maxAttempts" type="number" min="1" /></label>
			<label class="field">
				<span>Status</span>
				<select v-model.number="quiz.published">
					<option :value="1">Published — students can take it</option>
					<option :value="0">Draft</option>
				</select>
			</label>
		</div>

		<div class="row" style="justify-content: space-between; margin: 22px 0 10px">
			<h3 style="margin: 0">Questions</h3>
			<button class="btn" type="button" @click="addQuestion()">Add question</button>
		</div>

		<div v-for="(q, idx) in quiz.questions" :key="q.id" class="card" style="box-shadow: none; margin-bottom: 10px">
			<div class="row" style="justify-content: space-between">
				<strong>Question {{ idx + 1 }}</strong>
				<button class="btn ghost" type="button" @click="removeQuestion(idx)">Remove</button>
			</div>
			<div class="form-grid">
				<label class="field">
					<span>Type</span>
					<select :value="q.type" @change="setType(q, $event.target.value)">
						<option value="mcq">Single choice</option>
						<option value="multi">Multiple answers</option>
						<option value="tf">True / False</option>
						<option value="short">Short text</option>
					</select>
				</label>
				<label class="field full"><span>Question</span><textarea v-model="q.text" rows="2" /></label>
				<div v-if="q.type !== 'short'" class="field full">
					<span>Options</span>
					<div v-for="(opt, i) in q.options" :key="i" class="row" style="margin-top: 8px; gap: 8px">
						<span style="width: 22px; color: var(--faint); font-family: var(--mono)">{{ i + 1 }}.</span>
						<input
							:data-opt="`${q.id}-${i}`"
							v-model="q.options[i]"
							:placeholder="`Option ${i + 1}`"
							style="flex: 1; min-width: 0"
							@keydown.enter.exact.prevent.stop="onOptionEnter(q, i, $event)"
						/>
						<button class="btn ghost" type="button" @click="removeOption(q, i)">Remove</button>
					</div>
					<button class="btn" type="button" style="margin-top: 10px" @click="addOption(q)">Add option</button>
					<p style="margin: 8px 0 0; font-size: 12px; color: var(--faint)">Press Enter to add another option.</p>
				</div>
				<label v-if="q.type === 'mcq' || q.type === 'tf'" class="field">
					<span>Correct option</span>
					<select v-model.number="q.answer">
						<option v-for="(opt, i) in q.options" :key="i" :value="i">{{ i + 1 }}. {{ opt || "(blank)" }}</option>
					</select>
				</label>
				<div v-else-if="q.type === 'multi'" class="field full">
					<span>Correct answers (tick all that apply)</span>
					<label v-for="(opt, i) in q.options" :key="i" style="display: flex; gap: 8px; align-items: center; margin-top: 6px">
						<input type="checkbox" :checked="Array.isArray(q.answer) && q.answer.includes(i)" @change="toggleMulti(q, i)" />
						{{ opt || "(blank)" }}
					</label>
				</div>
				<label v-else class="field full">
					<span>Accepted answer (text match)</span>
					<input v-model="q.answer" />
				</label>
			</div>
		</div>
		<p v-if="!quiz.questions.length" class="empty">No questions yet. Click Add question.</p>

		<div class="row" style="margin-top: 18px">
			<button class="btn primary" type="submit">Save quiz</button>
			<button class="btn" type="button" @click="goBack">Cancel</button>
		</div>
	</form>
	<div v-else class="card">
		<p>No quiz selected.</p>
		<button class="btn" type="button" @click="goBack">← Back</button>
	</div>
</template>
