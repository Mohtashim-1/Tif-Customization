frappe.pages["organization-chart-("].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_hr_customization/css/organization_chart.css");

	if (!document.getElementById("org-chart-grade-css")) {
		const style = document.createElement("style");
		style.id = "org-chart-grade-css";
		style.textContent = `
			.org-chart-container--grade .org-node-children::before { height: 22px; }
			.org-chart-container--grade .org-siblings-row::before { display: none; }
			.org-chart-container--grade .org-branch::before { display: none; }

			.org-rail {
				position: absolute;
				top: 0;
				left: 0;
				width: 0;
				height: 2px;
				background: #0d6efd;
				z-index: 2;
				pointer-events: none;
			}
			.org-drop {
				position: absolute;
				top: 0;
				left: 50%;
				transform: translateX(-50%);
				width: 2px;
				height: 22px;
				background: #0d6efd;
				z-index: 2;
				pointer-events: none;
			}

			.org-chart-container--grade .org-node-children.is-expanded::before,
			.org-chart-container--grade .org-expanded-all .org-node-children::before {
				height: var(--org-stem-height, 22px);
			}

			.org-chart-container--grade .org-branch--group {
				display: flex;
				flex-direction: column;
				align-items: center;
				padding: 0 10px;
				align-self: flex-start;
				position: relative;
				overflow: visible;
			}
			.org-chart-container--grade .org-group {
				position: relative;
				z-index: 3;
				display: flex;
				flex-direction: column;
				align-items: center;
				min-width: 180px;
				padding: 0 6px;
			}
			.org-group-title {
				position: relative;
				top: auto;
				left: auto;
				transform: none;
				z-index: 4;
				font-size: 10px;
				font-weight: 700;
				padding: 4px 12px;
				border-radius: 999px;
				text-align: center;
				max-width: 280px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				border: 1px solid;
				margin: 0 0 10px;
			}
			.org-group-stack {
				display: flex;
				flex-direction: column;
				gap: 16px;
				align-items: center;
				width: 100%;
				padding-top: 0;
			}
			.org-group-member {
				display: flex;
				flex-direction: column;
				align-items: center;
				flex: 0 0 auto;
				position: relative;
			}
			.org-group-member > .org-node { align-items: center; }
			.org-group-member .org-node-card,
			.org-group-stack .org-node-card { width: 168px; }
			.org-chart-container--grade .org-siblings-row {
				display: inline-flex;
				flex-wrap: nowrap;
				justify-content: center;
				align-items: flex-start;
				gap: 0;
				position: relative;
				margin-top: 0;
				padding-top: 22px;
				width: max-content;
				max-width: none;
			}
			.org-emp-legend {
				display: flex;
				flex-wrap: wrap;
				gap: 8px 14px;
				margin: 0 0 12px;
				padding: 10px 12px;
				background: #fff;
				border: 1px solid #e9ecef;
				border-radius: 8px;
			}
			.org-emp-legend-item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				font-size: 11px;
				color: #495057;
			}
			.org-emp-legend-swatch {
				width: 14px;
				height: 14px;
				border-radius: 4px;
				border: 2px solid transparent;
			}
			.org-group-title--grade {
				color: #6f42c1;
				background: rgba(111, 66, 193, 0.1);
				border-color: rgba(111, 66, 193, 0.35);
			}
			.org-group-title--dept {
				color: #0a58ca;
				background: rgba(13, 110, 253, 0.1);
				border-color: rgba(13, 110, 253, 0.35);
			}
			.org-card-emp-badge {
				display: inline-block;
				margin-top: 4px;
				padding: 2px 8px;
				border-radius: 999px;
				font-size: 9px;
				font-weight: 600;
				line-height: 1.3;
				max-width: 100%;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			.org-card-dept-badge {
				display: inline-block;
				margin-top: 4px;
				padding: 2px 8px;
				border-radius: 999px;
				font-size: 9px;
				font-weight: 600;
				background: rgba(13, 110, 253, 0.08);
				color: #0a58ca;
				border: 1px solid rgba(13, 110, 253, 0.25);
				max-width: 100%;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
		`;
		document.head.appendChild(style);
	}

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Organization Chart (Grade Wise)",
		single_column: true,
	});

	page.org_chart_state = { wrapper, page, children_by_parent: {} };
	add_filter_controls(page);
	initialize_organization_chart(page.org_chart_state);
	page.add_inner_button(__("Expand All"), () => expand_all_nodes(page.org_chart_state));
	page.add_inner_button(__("Collapse All"), () => collapse_all_nodes(page.org_chart_state));
};

function get_employment_type_style(employment_type) {
	const key = (employment_type || "").trim();
	const palette = {
		"Full Time -  (Permanent)": { bg: "#e8f5e9", border: "#2e7d32", text: "#1b5e20" },
		"Part Time - (Permanent)": { bg: "#e3f2fd", border: "#1565c0", text: "#0d47a1" },
		"Contract Base - (Fixed Salary)": { bg: "#fff3e0", border: "#ef6c00", text: "#e65100" },
		"QPS - Contract Staff": { bg: "#f3e5f5", border: "#7b1fa2", text: "#4a148c" },
		"TPS - Contract Staff": { bg: "#e0f2f1", border: "#00695c", text: "#004d40" },
		"Teacher Training - Contract Staff": { bg: "#fff8e1", border: "#f9a825", text: "#f57f17" },
		"Trustee (TIF)": { bg: "#e8eaf6", border: "#283593", text: "#1a237e" },
	};
	if (palette[key]) return palette[key];
	let hash = 0;
	for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
	const hues = ["#5c6bc0", "#8d6e63", "#00838f", "#c2185b", "#558b2f"];
	const border = hues[Math.abs(hash) % hues.length];
	return { bg: "#f8f9fa", border, text: "#343a40" };
}

function employment_type_card_attrs(employment_type) {
	const style = get_employment_type_style(employment_type);
	return `style="background:${style.bg};border-color:${style.border};" data-employment-type="${frappe.utils.escape_html(employment_type || "")}"`;
}

function render_employment_type_legend(employment_types) {
	const types = [...new Set((employment_types || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	if (!types.length) return "";
	const items = types
		.map((t) => {
			const s = get_employment_type_style(t);
			return `<span class="org-emp-legend-item"><span class="org-emp-legend-swatch" style="background:${s.bg};border-color:${s.border};"></span>${frappe.utils.escape_html(t)}</span>`;
		})
		.join("");
	return `<div class="org-emp-legend"><strong style="margin-right:8px;font-size:11px;">${__("Employment Type")}:</strong>${items}</div>`;
}

function collect_employment_types_from_chart(children_by_parent, roots) {
	const types = new Set();
	const walk = (nodes) => {
		for (const n of nodes || []) {
			if (n.employment_type) types.add(n.employment_type);
			walk(children_by_parent[n.id] || []);
		}
	};
	walk(roots);
	return [...types];
}

function add_filter_controls(page) {
	page.main.append(`
		<div class="org-chart-filters">
			<div class="row">
				<div class="col-md-4">
					<label>${__("Employment Type")}</label>
					<select class="form-control employment-type-filter"></select>
				</div>
				<div class="col-md-4">
					<label>${__("Department")}</label>
					<select class="form-control department-filter"></select>
				</div>
				<div class="col-md-4">
					<label>${__("Actions")}</label>
					<div class="org-filter-actions">
						<button class="btn btn-primary btn-sm refresh-chart"><i class="fa fa-refresh"></i> ${__("Refresh")}</button>
						<button class="btn btn-secondary btn-sm expand-all"><i class="fa fa-expand"></i> ${__("Expand All")}</button>
						<button class="btn btn-default btn-sm collapse-all"><i class="fa fa-compress"></i> ${__("Collapse All")}</button>
					</div>
				</div>
			</div>
		</div>
	`);

	$(".employment-type-filter").html(`<option value="">${__("All Employment Types")}</option>`);
	$(".department-filter").html(`<option value="">${__("All Departments")}</option>`);

	frappe.call({
		method: "frappe.client.get_list",
		args: { doctype: "Employment Type", fields: ["name"], order_by: "name" },
		callback(r) {
			(r.message || []).forEach((row) => {
				$(".employment-type-filter").append(
					`<option value="${frappe.utils.escape_html(row.name)}">${frappe.utils.escape_html(row.name)}</option>`,
				);
			});
		},
	});

	frappe.call({
		method: "frappe.client.get_list",
		args: { doctype: "Department", fields: ["name"], order_by: "name" },
		callback(r) {
			(r.message || []).forEach((row) => {
				$(".department-filter").append(
					`<option value="${frappe.utils.escape_html(row.name)}">${frappe.utils.escape_html(row.name)}</option>`,
				);
			});
		},
	});
}

function initialize_organization_chart(state) {
	$(state.wrapper).find(".page-content").append(`
		<div class="org-chart-container">
			<div class="org-chart-loading">
				<i class="fa fa-spinner fa-spin fa-2x"></i>
				<p>${__("Loading organization chart...")}</p>
			</div>
		</div>
	`);
	bind_chart_events(state);
	load_organization_chart(state);
}

function bind_chart_events(state) {
	const $wrapper = $(state.wrapper);
	$wrapper.on("click", ".refresh-chart", () => load_organization_chart(state));
	$wrapper.on("click", ".expand-all", () => expand_all_nodes(state));
	$wrapper.on("click", ".collapse-all", () => collapse_all_nodes(state));
}

function get_filters() {
	return {
		employment_type: $(".employment-type-filter").val() || "",
		department: $(".department-filter").val() || "",
	};
}

function load_organization_chart(state) {
	const container = $(state.wrapper).find(".org-chart-container");
	container.html(`
		<div class="org-chart-loading">
			<i class="fa fa-spinner fa-spin fa-2x"></i>
			<p>${__("Loading organization chart...")}</p>
		</div>
	`);

	frappe.call({
		method:
			"tif_customization.tif_customization.page.organization_chart_grade.organization_chart_grade.get_grade_wise_org_chart",
		args: get_filters(),
		callback(r) {
			if (!r.message) return;
			state.children_by_parent = r.message.children_by_parent || {};
			render_organization_chart(r.message, state);
		},
		error() {
			container.html(`
				<div class="org-chart-error">
					<i class="fa fa-exclamation-triangle fa-2x"></i>
					<h4>${__("Failed to load organization chart")}</h4>
				</div>
			`);
		},
	});
}

function render_organization_chart(data, state) {
	const container = $(state.wrapper).find(".org-chart-container");
	const roots = data.roots || [];
	const children_by_parent = data.children_by_parent || {};

	if (!roots.length) {
		container.html(`<div class="org-chart-empty"><h4>${__("No employees found")}</h4></div>`);
		return;
	}

	const trees = roots.map((root) => build_org_node_html(root, children_by_parent, true)).join("");
	const legend = render_employment_type_legend(
		collect_employment_types_from_chart(children_by_parent, roots),
	);

	container.html(`
		${legend}
		<div class="org-chart-tree">
			<div class="org-chart-scroll">
				<div class="org-forest">${trees}</div>
			</div>
		</div>
	`);
	container.addClass("org-chart-container--grade");

	bind_card_events(container);
	schedule_connector_fix(container);

	roots.forEach((root) => {
		const children = children_by_parent[root.id] || [];
		if (children.length) show_node_children(root.id);
	});
	if (data.coo_id) show_node_children(data.coo_id);
	schedule_connector_fix(container);
}

function schedule_connector_fix(container) {
	const $c = container.jquery ? container : $(container);
	const run = () => fix_grouped_connectors($c);
	requestAnimationFrame(run);
	setTimeout(run, 50);
	setTimeout(run, 300);
	setTimeout(run, 800);
	$(window).off("resize.org_chart_grade").on("resize.org_chart_grade", run);
	$c.find(".org-chart-scroll").off("scroll.org_chart_grade").on("scroll.org_chart_grade", run);
}

function build_org_node_html(employee, children_by_parent, is_root = false) {
	const children = children_by_parent[employee.id] || [];
	const has_children = children.length > 0;
	const card_class = is_root ? "org-node-card org-node-card--root" : "org-node-card";
	const group_by_grade = employee.chart_role === "dept_head";

	let children_html = "";
	if (has_children) {
		if (group_by_grade) {
			const groups = group_children_by_grade(children);
			const branches = groups
				.map(({ grade, items }) => {
					const label = `${grade} (${items.length})`;
					const members = items
						.map(
							(child) =>
								`<div class="org-group-member">${build_org_node_html(child, children_by_parent, false)}</div>`,
						)
						.join("");
					return `
						<div class="org-branch org-branch--group">
							<div class="org-drop"></div>
							<div class="org-group">
								<div class="org-group-title org-group-title--grade" title="${frappe.utils.escape_html(label)}">${frappe.utils.escape_html(label)}</div>
								<div class="org-group-stack org-group-stack--column">${members}</div>
							</div>
						</div>
					`;
				})
				.join("");
			children_html = `
				<div class="org-node-children" data-employee-id="${employee.id}">
					<div class="org-siblings-row">
						<div class="org-rail"></div>
						${branches}
					</div>
				</div>
			`;
		} else {
			const branches = children
				.map((child) => {
					const dept_label = child.department_label || child.department || "";
					const dept_badge = child.chart_role === "dept_head" && dept_label
						? `<div class="org-group-title org-group-title--dept" title="${frappe.utils.escape_html(dept_label)}">${frappe.utils.escape_html(dept_label)}</div>`
						: "";
					return `
						<div class="org-branch org-branch--group">
							<div class="org-drop"></div>
							${dept_badge}
							${build_org_node_html(child, children_by_parent, false)}
						</div>
					`;
				})
				.join("");
			children_html = `
				<div class="org-node-children" data-employee-id="${employee.id}">
					<div class="org-siblings-row">
						<div class="org-rail"></div>
						${branches}
					</div>
				</div>
			`;
		}
	}

	return `
		<div class="org-node ${is_root ? "org-node--root" : ""}">
			<div class="${card_class} employee-card" data-employee-id="${employee.id}" ${employment_type_card_attrs(employee.employment_type)}>
				${build_card_body_html(employee, is_root)}
				${has_children ? build_toggle_btn_html(employee.id, is_root) : ""}
			</div>
			${children_html}
		</div>
	`;
}

function group_children_by_grade(children) {
	const map = {};
	for (const child of children || []) {
		const grade = (child.grades || child.grade || __("No Grade")).trim() || __("No Grade");
		if (!map[grade]) map[grade] = { grade, items: [] };
		map[grade].items.push(child);
	}
	return Object.values(map)
		.map((group) => {
			group.items.sort((a, b) =>
				(a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
			);
			return group;
		})
		.sort((a, b) =>
			a.grade.localeCompare(b.grade, undefined, { numeric: true, sensitivity: "base" }),
		);
}

function build_card_body_html(employee, is_root) {
	const avatar_size = is_root ? 56 : 40;
	const emp_style = get_employment_type_style(employee.employment_type);
	const grade_label = employee.grades || employee.grade || "";
	return `
		<div class="org-card-avatar">${build_avatar_html(employee, avatar_size)}</div>
		<div class="org-card-name">${frappe.utils.escape_html(employee.name)}</div>
		<div class="org-card-title">${frappe.utils.escape_html(employee.title || __("No Designation"))}</div>
		<div class="org-card-meta">
			${grade_label ? `<span>${__("Grade")}: ${frappe.utils.escape_html(grade_label)}</span>` : ""}
			${employee.department ? `<span>${frappe.utils.escape_html(employee.department)}</span>` : ""}
			${employee.connections > 0 ? `<span class="org-reports-badge">${employee.connections} ${__("Reports")}</span>` : ""}
		</div>
		${employee.employment_type ? `<span class="org-card-emp-badge" style="background:${emp_style.bg};color:${emp_style.text};border:1px solid ${emp_style.border};">${frappe.utils.escape_html(employee.employment_type)}</span>` : ""}
	`;
}

function build_avatar_html(employee, size) {
	if (employee.image) {
		return `<img src="${employee.image}" alt="" width="${size}" height="${size}">`;
	}
	return `<span class="org-avatar-fallback">${frappe.utils.escape_html((employee.name || "?").charAt(0).toUpperCase())}</span>`;
}

function build_toggle_btn_html(employee_id, is_root) {
	return `
		<button type="button" class="org-toggle-btn expand-btn" data-employee-id="${employee_id}">
			<i class="fa fa-chevron-down"></i>
			<span>${is_root ? __("View Team") : __("Expand")}</span>
		</button>
	`;
}

function bind_card_events(container) {
	container.find(".employee-card").on("click", function (e) {
		if ($(e.target).closest(".org-toggle-btn, .expand-btn").length) return;
		show_employee_details($(this).data("employee-id"));
	});

	container.find(".org-toggle-btn").on("click", function (e) {
		e.stopPropagation();
		toggle_employee_children($(this).data("employee-id"), $(this));
	});
}

function show_node_children(employee_id) {
	const block = $(`.org-node-children[data-employee-id="${employee_id}"]`);
	block.addClass("is-expanded");
	update_toggle_btn(employee_id, true);
	schedule_connector_fix(block.closest(".org-chart-container"));
}

function hide_node_children(employee_id) {
	const block = $(`.org-node-children[data-employee-id="${employee_id}"]`);
	block.removeClass("is-expanded");
	update_toggle_btn(employee_id, false);
	schedule_connector_fix(block.closest(".org-chart-container"));
}

function update_toggle_btn(employee_id, expanded) {
	const btn = $(`.org-toggle-btn[data-employee-id="${employee_id}"]`);
	const icon = btn.find("i");
	const label = btn.find("span");
	const is_root_btn = label.text().includes(__("View")) || label.text().includes(__("Hide"));
	if (expanded) {
		icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
		label.text(is_root_btn ? __("Hide Team") : __("Collapse"));
	} else {
		icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
		label.text(is_root_btn ? __("View Team") : __("Expand"));
	}
}

function toggle_employee_children(employee_id) {
	const block = $(`.org-node-children[data-employee-id="${employee_id}"]`);
	if (block.hasClass("is-expanded")) hide_node_children(employee_id);
	else show_node_children(employee_id);
}

function expand_all_nodes(state) {
	$(state.wrapper).find(".org-chart-container").addClass("org-expanded-all");
	$(state.wrapper).find(".org-node-children").addClass("is-expanded");
	$(state.wrapper).find(".org-toggle-btn").each(function () {
		update_toggle_btn($(this).data("employee-id"), true);
	});
	schedule_connector_fix($(state.wrapper).find(".org-chart-container"));
	frappe.show_alert({ message: __("Full organization expanded"), indicator: "green" }, 3);
}

function collapse_all_nodes(state) {
	const container = $(state.wrapper).find(".org-chart-container");
	container.removeClass("org-expanded-all");
	container.find(".org-node-children").removeClass("is-expanded");
	container.find(".org-toggle-btn").each(function () {
		update_toggle_btn($(this).data("employee-id"), false);
	});
	$(state.wrapper).find(".org-node--root").each(function () {
		const root_id = $(this).find("> .org-node-card").data("employee-id");
		if (root_id) show_node_children(root_id);
	});
	schedule_connector_fix(container);
}

function show_employee_details(employee_id) {
	frappe.call({
		method:
			"tif_customization.tif_customization.page.organization_chart_grade.organization_chart_grade.get_employee_details",
		args: { employee_id },
		callback(r) {
			if (!r.message) return;
			const e = r.message;
			frappe.msgprint({
				title: __("Employee Details"),
				message: `
					<div style="display:flex; gap:12px; align-items:center;">
						<div style="flex:0 0 auto;">
							${e.image ? `<img src="${e.image}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">` : ""}
						</div>
						<div>
							<div style="font-weight:700;">${frappe.utils.escape_html(e.name || "")}</div>
							<div style="color:#6c757d;">${frappe.utils.escape_html(e.designation || "")}</div>
						</div>
					</div>
					<hr>
					<div><b>${__("Employee ID")}:</b> ${frappe.utils.escape_html(e.id || "")}</div>
					<div><b>${__("Department")}:</b> ${frappe.utils.escape_html(e.department || "")}</div>
					<div><b>${__("Grade")}:</b> ${frappe.utils.escape_html(e.grades || e.grade || "")}</div>
					<div><b>${__("Employment Type")}:</b> ${frappe.utils.escape_html(e.employment_type || "")}</div>
					<div><b>${__("Company Email")}:</b> ${frappe.utils.escape_html(e.company_email || "")}</div>
					<div><b>${__("Cell Number")}:</b> ${frappe.utils.escape_html(e.cell_number || "")}</div>
				`,
				wide: true,
			});
		},
	});
}

function fix_grouped_connectors(container) {
	const root = container && (container[0] || container);
	if (!root || !root.querySelectorAll) return;

	fix_parent_stems(root);

	root.querySelectorAll(".org-siblings-row").forEach((row) => {
		const rail = row.querySelector(":scope > .org-rail");
		const branches = Array.from(row.querySelectorAll(":scope > .org-branch"));
		if (!branches.length) {
			if (rail) rail.style.display = "none";
			return;
		}

		const rowRect = row.getBoundingClientRect();
		const railY = rowRect.top + 1;
		const centers = [];

		branches.forEach((branch) => {
			const point = get_branch_connect_point(branch, rowRect);
			if (!point) return;
			centers.push(point.rowX);

			const drop = branch.querySelector(":scope > .org-drop");
			if (drop) {
				const branchRect = branch.getBoundingClientRect();
				const dropTop = railY - branchRect.top;
				const dropHeight = Math.max(2, point.anchorTop - railY);
				drop.style.left = `${Math.round(point.branchX)}px`;
				drop.style.top = `${Math.round(dropTop)}px`;
				drop.style.height = `${Math.round(dropHeight)}px`;
				drop.style.transform = "translateX(-50%)";
				drop.style.display = dropHeight > 0 ? "block" : "none";
			}
		});

		if (!rail || centers.length < 2) {
			if (rail) rail.style.display = "none";
			return;
		}

		const firstX = Math.min(...centers);
		const lastX = Math.max(...centers);
		if (!isFinite(firstX) || !isFinite(lastX)) return;

		const x1 = Math.max(0, Math.round(firstX));
		const x2 = Math.max(x1 + 2, Math.round(lastX));
		rail.style.display = "block";
		rail.style.left = `${x1}px`;
		rail.style.width = `${Math.max(2, x2 - x1)}px`;
	});
}

function fix_parent_stems(root) {
	root.querySelectorAll(".org-chart-container--grade .org-node-children.is-expanded, .org-chart-container--grade .org-expanded-all .org-node-children").forEach(
		(childrenBlock) => {
			const row = childrenBlock.querySelector(":scope > .org-siblings-row");
			const parentCard = childrenBlock.parentElement?.querySelector(":scope > .org-node-card");
			if (!row || !parentCard) {
				childrenBlock.style.removeProperty("--org-stem-height");
				return;
			}
			const parentRect = parentCard.getBoundingClientRect();
			const rowRect = row.getBoundingClientRect();
			const stemHeight = Math.max(2, Math.round(rowRect.top - parentRect.bottom));
			childrenBlock.style.setProperty("--org-stem-height", `${stemHeight}px`);
		},
	);
}

function get_direct_group_member_cards(group) {
	return Array.from(group.querySelectorAll(":scope > .org-group-stack > .org-group-member"))
		.map((member) => member.querySelector(":scope > .org-node > .org-node-card"))
		.filter(Boolean);
}

function get_branch_connect_point(branch, rowRect) {
	const branchRect = branch.getBoundingClientRect();
	const group = branch.querySelector(":scope > .org-group");

	if (group) {
		const member_cards = get_direct_group_member_cards(group);
		if (member_cards.length > 0) {
			const firstRect = member_cards[0].getBoundingClientRect();
			const lastRect = member_cards[member_cards.length - 1].getBoundingClientRect();
			const cx =
				member_cards.length > 1
					? (firstRect.left + firstRect.width / 2 + lastRect.left + lastRect.width / 2) / 2
					: firstRect.left + firstRect.width / 2;
			const title = group.querySelector(":scope > .org-group-title");
			const anchorTop = title ? title.getBoundingClientRect().top : firstRect.top;
			return { rowX: cx - rowRect.left, branchX: cx - branchRect.left, anchorTop };
		}
	}

	const dept_title = branch.querySelector(":scope > .org-group-title--dept");
	const card =
		branch.querySelector(":scope > .org-node > .org-node-card") ||
		branch.querySelector(":scope > .org-node-card");
	if (!card) return null;
	const r = card.getBoundingClientRect();
	const cx = r.left + r.width / 2;
	const anchorTop = dept_title ? dept_title.getBoundingClientRect().top : r.top;
	return { rowX: cx - rowRect.left, branchX: cx - branchRect.left, anchorTop };
}
