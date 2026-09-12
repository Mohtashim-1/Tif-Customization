/**
 * Lightweight date picker for School Opening guest form (no external libs).
 * Display: DD/MM/YYYY — submit: YYYY-MM-DD in hidden input name=form_date
 */
(function () {
	const MONTHS = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];

	function pad(n) {
		return n < 10 ? "0" + n : String(n);
	}

	function toIso(y, m, d) {
		return y + "-" + pad(m) + "-" + pad(d);
	}

	function toDisplay(iso) {
		if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
		const [y, m, d] = iso.split("-");
		return d + "/" + m + "/" + y;
	}

	function parseIso(iso) {
		const [y, m, d] = iso.split("-").map(Number);
		return { y, m, d };
	}

	function initSchoolOpeningDatePicker(root) {
		if (!root || root.dataset.soaDateInit) return;
		root.dataset.soaDateInit = "1";

		const display = root.querySelector(".soa-date-display");
		const hidden = root.querySelector('input[type="hidden"][name="form_date"]');
		const popup = root.querySelector(".soa-date-popup");
		const grid = root.querySelector(".soa-date-grid");
		const title = root.querySelector(".soa-date-month-label");
		const btn = root.querySelector(".soa-date-picker-btn");

		if (!display || !hidden || !popup || !grid || !title) return;

		const today = new Date();
		let viewYear = today.getFullYear();
		let viewMonth = today.getMonth() + 1;
		let selectedIso =
			hidden.value && /^\d{4}-\d{2}-\d{2}$/.test(hidden.value)
				? hidden.value
				: toIso(today.getFullYear(), today.getMonth() + 1, today.getDate());

		function applySelection(iso) {
			selectedIso = iso;
			hidden.value = iso;
			display.value = toDisplay(iso);
			display.classList.remove("soa-date-empty");
			popup.hidden = true;
			root.classList.remove("soa-date-open");
		}

		function render() {
			title.textContent = MONTHS[viewMonth - 1] + " " + viewYear;
			grid.innerHTML = "";
			const first = new Date(viewYear, viewMonth - 1, 1);
			const startDow = first.getDay();
			const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
			const sel = parseIso(selectedIso);

			for (let i = 0; i < startDow; i++) {
				const empty = document.createElement("span");
				empty.className = "soa-date-day soa-date-day--empty";
				grid.appendChild(empty);
			}

			for (let day = 1; day <= daysInMonth; day++) {
				const cell = document.createElement("button");
				cell.type = "button";
				cell.className = "soa-date-day";
				cell.textContent = String(day);
				const iso = toIso(viewYear, viewMonth, day);
				if (iso === selectedIso) cell.classList.add("soa-date-day--selected");
				if (
					day === today.getDate() &&
					viewMonth === today.getMonth() + 1 &&
					viewYear === today.getFullYear()
				) {
					cell.classList.add("soa-date-day--today");
				}
				cell.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					applySelection(iso);
				});
				grid.appendChild(cell);
			}
		}

		function openPopup() {
			if (selectedIso) {
				const p = parseIso(selectedIso);
				viewYear = p.y;
				viewMonth = p.m;
			}
			render();
			popup.hidden = false;
			root.classList.add("soa-date-open");
		}

		function closePopup() {
			popup.hidden = true;
			root.classList.remove("soa-date-open");
		}

		root.querySelector(".soa-date-prev")?.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			viewMonth -= 1;
			if (viewMonth < 1) {
				viewMonth = 12;
				viewYear -= 1;
			}
			render();
		});

		root.querySelector(".soa-date-next")?.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			viewMonth += 1;
			if (viewMonth > 12) {
				viewMonth = 1;
				viewYear += 1;
			}
			render();
		});

		root.querySelector(".soa-date-today")?.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const iso = toIso(today.getFullYear(), today.getMonth() + 1, today.getDate());
			viewYear = today.getFullYear();
			viewMonth = today.getMonth() + 1;
			applySelection(iso);
			render();
		});

		display.addEventListener("click", (e) => {
			e.preventDefault();
			openPopup();
		});

		btn?.addEventListener("click", (e) => {
			e.preventDefault();
			if (popup.hidden) openPopup();
			else closePopup();
		});

		document.addEventListener("click", (e) => {
			if (!root.contains(e.target)) closePopup();
		});

		applySelection(selectedIso);
	}

	document.addEventListener("DOMContentLoaded", () => {
		document.querySelectorAll(".soa-date-picker").forEach(initSchoolOpeningDatePicker);
	});
})();
