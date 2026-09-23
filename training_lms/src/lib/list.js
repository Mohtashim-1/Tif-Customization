import { reactive, ref, watch } from "vue";

export function useRowSelection(rowsRef, key = "id") {
	const selected = ref([]);

	const api = reactive({
		get selected() {
			return selected.value;
		},
		get selectedSet() {
			return new Set(selected.value);
		},
		has(id) {
			return selected.value.includes(id);
		},
		get allOn() {
			const rows = rowsRef.value || [];
			return rows.length > 0 && selected.value.length === rows.length;
		},
		toggle(id, ev) {
			ev?.stopPropagation?.();
			if (id == null) return;
			const i = selected.value.indexOf(id);
			if (i >= 0) selected.value = selected.value.filter((x) => x !== id);
			else selected.value = [...selected.value, id];
		},
		toggleAll() {
			const rows = (rowsRef.value || []).filter(Boolean);
			if (api.allOn) selected.value = [];
			else selected.value = rows.map((r) => r[key]).filter((id) => id != null);
		},
		chosen(all) {
			const rows = all || rowsRef.value || [];
			if (!selected.value.length) return rows;
			const set = new Set(selected.value);
			return rows.filter((r) => set.has(r[key]));
		},
	});

	watch(
		() => (rowsRef.value || []).map((r) => (r ? r[key] : "")).join("|"),
		() => {
			const keep = new Set((rowsRef.value || []).map((r) => (r ? r[key] : null)));
			selected.value = selected.value.filter((id) => keep.has(id));
		}
	);

	return api;
}
