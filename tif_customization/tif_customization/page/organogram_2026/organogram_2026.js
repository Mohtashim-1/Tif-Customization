frappe.pages["organogram-2026"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Organogram 2026"),
		single_column: true,
	});
	new frappe.tif_customization.Organogram2026(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.Organogram2026 = class Organogram2026 {
	constructor(page) {
		this.page = page;
		this.scale = 0.78;
	}

	make() {
		this.page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
		this.page.add_inner_button(__("Zoom In"), () => this.zoom(0.08));
		this.page.add_inner_button(__("Zoom Out"), () => this.zoom(-0.08));
		this.page.add_inner_button(__("Print"), () => window.print());
		this.page.add_inner_button(__("Original Chart"), () => window.open("/files/image.png", "_blank"));
		this.inject_styles();
		$(this.page.body).html(`<div class="og-root"><div class="og-loading">${__("Loading organogram...")}</div></div>`);
		this.load();
	}

	zoom(delta) {
		this.scale = Math.min(1.35, Math.max(0.42, this.scale + delta));
		$(this.page.body).find(".og-canvas").css("transform", `scale(${this.scale})`);
		requestAnimationFrame(() => this.draw_connectors());
	}

	load() {
		const $root = $(this.page.body).find(".og-root");
		$root.html(`<div class="og-loading">${__("Loading organogram...")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.organogram_2026.organogram_2026.get_organogram",
			callback: (r) => {
				if (!r.message) {
					$root.html(`<p class="text-danger">${__("Failed to load organogram.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
			error: () => {
				$root.html(`<p class="text-danger">${__("Failed to load organogram.")}</p>`);
			},
		});
	}

	person_svg(figures) {
		if ((figures || 1) >= 2) {
			return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
				<circle cx="22" cy="20" r="9"/>
				<path d="M8 54c0-9 6-16 14-16s14 7 14 16"/>
				<circle cx="44" cy="20" r="9"/>
				<path d="M30 54c0-9 6-16 14-16s14 7 14 16"/>
			</svg>`;
		}
		return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
			<circle cx="32" cy="20" r="11"/>
			<path d="M12 56c0-11 9-18 20-18s20 7 20 18"/>
		</svg>`;
	}

	node_html(node) {
		if (!node) return `<div class="og-node og-node--empty"></div>`;
		const count = node.count || (node.people || []).length;
		const people = node.people || [];
		let caption = "";
		if (count === 1) caption = people[0].name || "";
		else if (count > 1) caption = `${count} ${__("staff")}`;
		const title = (node.title || "").replace(/\n/g, "<br>");
		return `<div class="og-node og-${frappe.utils.escape_html(node.tone || "male")}" data-og-key="${frappe.utils.escape_html(
			node.key || ""
		)}">
			<div class="og-circle">${this.person_svg(node.figures)}</div>
			<div class="og-title">${title}</div>
			${caption ? `<div class="og-person">${frappe.utils.escape_html(caption)}</div>` : ""}
		</div>`;
	}

	lane_levels(lane) {
		const src = (lane && lane.levels) || {};
		const out = {};
		for (let lv = 4; lv <= 7; lv++) {
			out[lv] = src[lv] || src[String(lv)] || [];
		}
		return out;
	}

	unit_html(unit) {
		const lanes = unit.lanes || [];
		const lane_count = Math.max(1, lanes.length);
		const labels = lanes
			.map((lane) =>
				lane.label
					? `<div class="og-dept">${frappe.utils.escape_html(lane.label)}</div>`
					: `<div class="og-dept og-dept--ghost"></div>`
			)
			.join("");
		const level_rows = [4, 5, 6, 7]
			.map((lv) => {
				const cells = lanes
					.map((lane) => {
						const nodes = this.lane_levels(lane)[lv] || [];
						const inner = nodes.length
							? nodes.map((n) => this.node_html(n)).join("")
							: `<div class="og-node og-node--empty"></div>`;
						return `<div class="og-slot">${inner}</div>`;
					})
					.join("");
				return `<div class="og-level-row" data-level="${lv}">
					<div class="og-slots" style="grid-template-columns:repeat(${lane_count},minmax(108px,1fr))">${cells}</div>
				</div>`;
			})
			.join("");

		const unit_label = unit.label
			? `<div class="og-dept og-dept--unit">${frappe.utils.escape_html(unit.label)}</div>`
			: "";
		const head = unit.head
			? `<div class="og-head">${this.node_html(unit.head)}</div>`
			: `<div class="og-head og-head--stub"></div>`;

		return `<div class="og-unit" data-unit="${frappe.utils.escape_html(unit.id || "")}" style="--lanes:${lane_count}">
			${head}
			${unit_label}
			<div class="og-lane-labels" style="grid-template-columns:repeat(${lane_count},minmax(108px,1fr))">${labels}</div>
			${level_rows}
		</div>`;
	}

	render(data) {
		const legend = (data.legend || [])
			.map(
				(l) =>
					`<span class="og-leg-item"><span class="og-swatch og-${l.key}"></span>${frappe.utils.escape_html(
						l.label
					)}</span>`
			)
			.join("");
		const units = (data.units || []).map((u) => this.unit_html(u)).join("");
		const roman = ["I", "II", "III", "IV", "V", "VI", "VII"]
			.map((lv) => `<div class="og-roman">${lv}</div>`)
			.join("");

		$(this.page.body).find(".og-root").html(`
			<div class="og-toolbar">
				${legend}
				<span class="og-hint">${__("Click a circle to see staff. Dashed lines are reporting lines.")}</span>
			</div>
			<div class="og-scroll">
				<div class="og-canvas" style="transform:scale(${this.scale})">
					<div class="og-header">
						<div class="og-brand">
							<img src="${frappe.utils.escape_html(data.logo || "/files/TIF-Logo.png")}" alt="TIF" onerror="this.style.display='none'">
							<div>
								<div class="og-org">THE ILM FOUNDATION</div>
								<div class="og-site">${frappe.utils.escape_html(data.website || "")}</div>
							</div>
						</div>
						<div class="og-heading">${frappe.utils.escape_html(data.title || __("ORGANOGRAM 2026"))}</div>
					</div>
					<div class="og-chart">
						<div class="og-romans">${roman}</div>
						<div class="og-tree">
							<div class="og-top">
								${this.node_html(data.directors)}
								${this.node_html(data.ceo)}
							</div>
							<div class="og-units">${units}</div>
						</div>
					</div>
				</div>
			</div>
		`);

		const self = this;
		$(this.page.body)
			.find(".og-node[data-og-key]")
			.on("click", function () {
				self.show_people($(this).attr("data-og-key") || "");
			});
		$(this.page.body)
			.find(".og-scroll")
			.off("scroll.ogwires")
			.on("scroll.ogwires", () => {
				clearTimeout(this._wire_t);
				this._wire_t = setTimeout(() => this.draw_connectors(), 40);
			});
		requestAnimationFrame(() => {
			this.draw_connectors();
			setTimeout(() => this.draw_connectors(), 80);
		});
	}

	all_nodes(data) {
		const list = [];
		const add = (n) => {
			if (n && n.key) list.push(n);
		};
		add(data.directors);
		add(data.ceo);
		for (const unit of data.units || []) {
			add(unit.head);
			for (const lane of unit.lanes || []) {
				const levels = lane.levels || {};
				for (const k of Object.keys(levels)) {
					for (const n of levels[k] || []) add(n);
				}
			}
		}
		return list;
	}

	collect_links(data) {
		const links = [];
		const seen = new Set();
		const add = (parent, child) => {
			if (!parent || !child || parent === child) return;
			const id = `${parent}>${child}`;
			if (seen.has(id)) return;
			seen.add(id);
			links.push({ parent, child });
		};
		for (const n of this.all_nodes(data)) {
			if (n.parent) add(n.parent, n.key);
		}
		if (links.length) return links;

		add("directors", "ceo");
		for (const unit of data.units || []) {
			const head_key = unit.head && unit.head.key ? unit.head.key : "ceo";
			if (unit.head) add("ceo", unit.head.key);
			for (const lane of unit.lanes || []) {
				const levels = this.lane_levels(lane);
				let prev = [];
				for (let lv = 4; lv <= 7; lv++) {
					const nodes = (levels[lv] || []).filter((n) => n && n.key);
					if (!nodes.length) continue;
					if (!prev.length) nodes.forEach((n) => add(head_key, n.key));
					else if (prev.length === 1) nodes.forEach((n) => add(prev[0].key, n.key));
					else {
						nodes.forEach((n, i) => add(prev[Math.min(i, prev.length - 1)].key, n.key));
					}
					prev = nodes;
				}
			}
		}
		return links;
	}

	anchor(el, canvas) {
		const circle = el.querySelector(".og-circle") || el;
		let x = 0;
		let y = 0;
		let n = circle;
		while (n && n !== canvas) {
			x += n.offsetLeft;
			y += n.offsetTop;
			n = n.offsetParent;
		}
		if (!n) {
			const er = circle.getBoundingClientRect();
			const rr = canvas.getBoundingClientRect();
			const sx = rr.width / (canvas.offsetWidth || rr.width || 1);
			const sy = rr.height / (canvas.offsetHeight || rr.height || 1);
			return {
				x: (er.left + er.width / 2 - rr.left) / sx,
				top: (er.top - rr.top) / sy,
				bottom: (er.bottom - rr.top) / sy,
			};
		}
		return {
			x: x + circle.offsetWidth / 2,
			top: y,
			bottom: y + circle.offsetHeight,
		};
	}

	parent_in_view(el) {
		const scroller = $(this.page.body).find(".og-scroll").get(0);
		if (!scroller) return true;
		const er = el.getBoundingClientRect();
		const sr = scroller.getBoundingClientRect();
		return er.bottom > sr.top + 12 && er.top < sr.bottom - 8;
	}

	svg_line(svg, x1, y1, x2, y2) {
		if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) return;
		const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		line.setAttribute("x1", x1.toFixed(1));
		line.setAttribute("y1", y1.toFixed(1));
		line.setAttribute("x2", x2.toFixed(1));
		line.setAttribute("y2", y2.toFixed(1));
		line.setAttribute("stroke", "#64748b");
		line.setAttribute("stroke-width", "2");
		line.setAttribute("stroke-dasharray", "6 4");
		line.setAttribute("fill", "none");
		svg.appendChild(line);
	}

	draw_fork(svg, parent, children, canvas) {
		const p = this.anchor(parent, canvas);
		const kids = children.map((el) => this.anchor(el, canvas));
		if (!kids.length) return;
		const below = kids.filter((k) => k.top > p.bottom + 6);
		const beside = kids.filter((k) => k.top <= p.bottom + 6);

		if (below.length) {
			const min_top = Math.min(...below.map((k) => k.top));
			let bus_y = p.bottom + Math.max(12, (min_top - p.bottom) * 0.42);
			if (bus_y > min_top - 8) bus_y = (p.bottom + min_top) / 2;
			const xs = [p.x, ...below.map((k) => k.x)];
			this.svg_line(svg, p.x, p.bottom, p.x, bus_y);
			this.svg_line(svg, Math.min(...xs), bus_y, Math.max(...xs), bus_y);
			below.forEach((k) => this.svg_line(svg, k.x, bus_y, k.x, k.top));
		}

		if (beside.length) {
			const bus_y = Math.max(p.bottom, ...beside.map((k) => k.bottom)) + 12;
			const xs = [p.x, ...beside.map((k) => k.x)];
			this.svg_line(svg, p.x, p.bottom, p.x, bus_y);
			this.svg_line(svg, Math.min(...xs), bus_y, Math.max(...xs), bus_y);
			beside.forEach((k) => this.svg_line(svg, k.x, k.bottom, k.x, bus_y));
		}
	}

	draw_connectors() {
		const canvas = $(this.page.body).find(".og-canvas").get(0);
		if (!canvas || !this.data) return;
		canvas.querySelectorAll("svg.og-wires").forEach((el) => el.remove());
		const w = canvas.scrollWidth || canvas.offsetWidth;
		const h = canvas.scrollHeight || canvas.offsetHeight;
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "og-wires");
		svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		svg.setAttribute("width", String(w));
		svg.setAttribute("height", String(h));
		svg.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none;z-index:1;overflow:visible`;
		canvas.appendChild(svg);

		const map = {};
		canvas.querySelectorAll(".og-node[data-og-key]").forEach((el) => {
			map[el.getAttribute("data-og-key")] = el;
		});
		const groups = {};
		for (const link of this.collect_links(this.data)) {
			if (!map[link.parent] || !map[link.child]) continue;
			(groups[link.parent] ||= []).push(map[link.child]);
		}
		for (const pkey of Object.keys(groups)) {
			const parent_el = map[pkey];
			if (!this.parent_in_view(parent_el)) continue;
			this.draw_fork(svg, parent_el, groups[pkey], canvas);
		}
	}

	emp_type_style(employment_type) {
		const key = (employment_type || "").trim();
		const palette = {
			"Full Time -  (Permanent)": { bg: "#e8f5e9", border: "#2e7d32", text: "#1b5e20" },
			"Part Time - (Permanent)": { bg: "#fce8e8", border: "#7f1d1d", text: "#7f1d1d" },
			"Contract Base - (Fixed Salary)": { bg: "#fff3e0", border: "#ef6c00", text: "#e65100" },
			"QPS - Contract Staff": { bg: "#fff8e1", border: "#ca8a04", text: "#854d0e" },
			"TPS - Contract Staff": { bg: "#fff8e1", border: "#ca8a04", text: "#854d0e" },
			"Teacher Training - Contract Staff": { bg: "#fff8e1", border: "#ca8a04", text: "#854d0e" },
		};
		if (palette[key]) return palette[key];
		if (/part time/i.test(key)) return palette["Part Time - (Permanent)"];
		if (/fixed salary|contract base/i.test(key)) return palette["Contract Base - (Fixed Salary)"];
		if (/full time/i.test(key)) return palette["Full Time -  (Permanent)"];
		return { bg: "#f8fafc", border: "#94a3b8", text: "#334155" };
	}

	child_report_count(key) {
		return this.collect_links(this.data).filter((l) => l.parent === key).length;
	}

	person_card_html(p, reports) {
		const name = frappe.utils.escape_html(p.name || "");
		const desig = frappe.utils.escape_html(p.designation || "");
		const dept = frappe.utils.escape_html(p.department || "");
		const grade = frappe.utils.escape_html(p.grades || p.grade || "");
		const emp = p.employment_type || "";
		const st = this.emp_type_style(emp);
		const initial = (p.name || "?").trim().charAt(0).toUpperCase();
		const photo = p.image
			? `<img src="${frappe.utils.escape_html(p.image)}" alt="">`
			: `<span class="og-emp-fallback">${frappe.utils.escape_html(initial)}</span>`;
		const href = `/app/employee/${encodeURIComponent(p.id)}`;
		return `<a class="og-emp-card" href="${href}">
			<div class="og-emp-photo">${photo}</div>
			<div class="og-emp-name">${name}</div>
			<div class="og-emp-title">${desig}</div>
			<div class="og-emp-pills">
				${grade ? `<span>${__("Grade")}: ${grade}</span>` : ""}
				${dept ? `<span>${dept}</span>` : ""}
			</div>
			${reports > 0 ? `<div class="og-emp-reports">${reports} ${__("Reports")}</div>` : ""}
			${emp ? `<span class="og-emp-type" style="background:${st.bg};color:${st.text};border-color:${st.border}">${frappe.utils.escape_html(emp)}</span>` : ""}
		</a>`;
	}

	show_people(key) {
		const node = this.find_node(this.data, key);
		if (!node) return;
		const people = node.people || [];
		const reports = this.child_report_count(key);
		const body = people.length
			? `<div class="og-card-grid">${people
					.map((p) => this.person_card_html(p, people.length === 1 ? reports : 0))
					.join("")}</div>`
			: `<div class="og-emp-empty">${__("No active employee matched this role yet.")}</div>`;
		const d = new frappe.ui.Dialog({
			title: (node.title || "").replace(/\n/g, " "),
			size: people.length > 2 ? "extra-large" : "large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
			primary_action_label: __("Close"),
			primary_action: () => d.hide(),
		});
		d.$wrapper.addClass("og-staff-dialog");
		d.fields_dict.html.$wrapper.html(`
			<div class="og-dialog-lead">
				<span>${people.length} ${__("active staff")}</span>
				${reports ? `<span>· ${reports} ${__("reporting lines below")}</span>` : ""}
			</div>
			${body}
		`);
		d.show();
	}

	find_node(data, key) {
		const want = (key || "").trim();
		const hit = (n) => n && (n.key || "") === want;
		if (hit(data.directors)) return data.directors;
		if (hit(data.ceo)) return data.ceo;
		for (const unit of data.units || []) {
			if (hit(unit.head)) return unit.head;
			for (const lane of unit.lanes || []) {
				const levels = lane.levels || {};
				for (const lv of Object.keys(levels)) {
					for (const n of levels[lv] || []) if (hit(n)) return n;
				}
			}
		}
		return null;
	}

	inject_styles() {
		let s = document.getElementById("og-2026-css");
		if (!s) {
			s = document.createElement("style");
			s.id = "og-2026-css";
			document.head.appendChild(s);
		}
		s.textContent = `
			.og-root{padding:8px 12px 28px}
			.og-loading{padding:40px;text-align:center;color:#64748b}
			.og-toolbar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:12px}
			.og-leg-item{display:inline-flex;align-items:center;gap:6px;color:#334155}
			.og-swatch{width:16px;height:16px;border-radius:50%;border:3px solid #94a3b8;display:inline-block;background:#fff}
			.og-hint{margin-left:auto;color:#64748b;font-size:11px}
			.og-scroll{overflow:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff;max-height:calc(100vh - 220px)}
			.og-canvas{transform-origin:top left;min-width:1960px;padding:16px 28px 48px;position:relative;background:#fff}
			.og-wires{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible}
			.og-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-right:40px;position:relative}
			.og-brand{display:flex;gap:10px;align-items:center}
			.og-brand img{height:56px}
			.og-org{font-weight:800;letter-spacing:.06em;color:#0f172a;font-size:13px}
			.og-site{font-size:11px;color:#64748b;letter-spacing:.04em}
			.og-heading{font-size:26px;font-weight:800;color:#1e3a5f;letter-spacing:.12em}
			.og-chart{display:flex;gap:8px;position:relative;padding-top:4px}
			.og-romans{display:flex;flex-direction:column;width:28px;padding-top:8px;color:#94a3b8;font-weight:800;font-size:13px;flex-shrink:0}
			.og-roman{height:92px;display:flex;align-items:flex-start;padding-top:8px}
			.og-roman:first-child{height:118px}
			.og-roman:nth-child(2){height:100px}
			.og-roman:nth-child(3){height:86px}
			.og-tree{flex:1;min-width:0;position:relative}
			.og-top{display:flex;flex-direction:column;align-items:center;gap:40px;padding-bottom:6px}
			.og-units{display:flex;align-items:flex-start;justify-content:center;gap:8px;padding-top:36px;position:relative}
			.og-unit{display:flex;flex-direction:column;align-items:center;min-width:120px;position:relative}
			.og-head{min-height:92px;display:flex;align-items:flex-start;justify-content:center}
			.og-head--stub{min-height:8px}
			.og-unit[data-unit="coo"]{flex:1.4}
			.og-dept{font-size:9px;font-weight:800;color:#fff;background:#5b4b8a;border-radius:5px;padding:3px 7px;margin:4px auto 6px;text-align:center;max-width:150px;line-height:1.25}
			.og-dept--unit{background:#3d2e6b;max-width:220px;font-size:10px;margin-top:0}
			.og-dept--ghost{visibility:hidden;min-height:18px}
			.og-lane-labels{display:grid;gap:6px;width:100%;justify-items:center}
			.og-level-row{position:relative;min-height:100px;width:100%}
			.og-slots{display:grid;gap:6px;width:100%;position:relative;z-index:1;justify-items:center}
			.og-slot{display:flex;gap:6px;justify-content:center;align-items:flex-start;flex-wrap:wrap;min-height:96px}
			.og-node{width:108px;text-align:center;cursor:pointer;position:relative;z-index:2;background:transparent}
			.og-node--empty{visibility:hidden;height:8px;width:8px}
			.og-circle{width:48px;height:48px;margin:0 auto 5px;border-radius:50%;border:3.5px solid #94a3b8;display:flex;align-items:center;justify-content:center;background:#fff;color:#64748b}
			.og-circle svg{width:26px;height:26px}
			.og-title{font-size:10px;font-weight:700;color:#1e3a5f;line-height:1.2;min-height:24px}
			.og-person{font-size:9px;color:#0f766e;font-weight:600;margin-top:2px;line-height:1.15}
			.og-part_time .og-circle,.og-swatch.og-part_time{border-color:#7f1d1d;color:#7f1d1d}
			.og-male .og-circle,.og-swatch.og-male{border-color:#1d4ed8;color:#1d4ed8}
			.og-female .og-circle,.og-swatch.og-female{border-color:#db2777;color:#db2777}
			.og-contract_need .og-circle,.og-swatch.og-contract_need{border-color:#ca8a04;color:#ca8a04}
			.og-contract_fix .og-circle,.og-swatch.og-contract_fix{border-color:#ea580c;color:#ea580c}
			.og-board .og-circle,.og-swatch.og-board{border-color:#15803d;color:#15803d}
			.og-node:hover .og-circle{transform:scale(1.06)}
			.og-dialog-lead{font-size:12px;color:#64748b;margin:0 0 14px}
			.og-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(188px,1fr));gap:14px}
			.og-emp-card{display:flex;flex-direction:column;align-items:center;text-align:center;text-decoration:none;color:inherit;background:#f4fbf6;border:2px solid #4ade80;border-radius:14px;padding:16px 12px 14px;box-shadow:0 2px 8px rgba(15,23,42,.06);transition:transform .15s,box-shadow .15s}
			.og-emp-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(15,23,42,.12);color:inherit}
			.og-emp-photo img,.og-emp-fallback{width:64px;height:64px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 10px}
			.og-emp-fallback{background:#0d6efd;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px}
			.og-emp-name{font-size:14px;font-weight:800;color:#0f172a;line-height:1.25}
			.og-emp-title{font-size:12px;color:#64748b;margin:3px 0 8px;line-height:1.3}
			.og-emp-pills{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;margin-bottom:8px}
			.og-emp-pills span{font-size:11px;color:#475569;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:3px 10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.og-emp-reports{font-size:12px;font-weight:700;color:#2563eb;margin:2px 0 8px}
			.og-emp-type{display:inline-block;font-size:11px;font-weight:700;border:1.5px solid;border-radius:999px;padding:4px 10px;line-height:1.2;max-width:100%}
			.og-emp-empty{padding:28px 12px;text-align:center;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px}
			.og-staff-dialog .modal-body{background:#f8fafc}
			@media print{
				@page{size:A3 landscape;margin:8mm}
				.page-head,.og-toolbar{display:none!important}
				.og-scroll{max-height:none;overflow:visible;border:0}
				.og-canvas{transform:scale(.62)!important}
			}
		`;
		document.head.appendChild(s);
	}
};
