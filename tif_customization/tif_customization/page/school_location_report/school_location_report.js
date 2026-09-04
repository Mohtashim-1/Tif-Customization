frappe.pages["school-location-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Database Dashboard"),
		single_column: true,
	});

	if (!window.SchoolLocationReport) {
		window.SchoolLocationReport = class SchoolLocationReport {
			constructor(page) {
				this.page = page;
				this.filters = {
					province: "",
					city: "",
					program: "",
					program_status: "",
					school_status: "",
					school_type: "",
					search: "",
				};
			}

			async make() {
				this.render_layout();
				this.bind_events();
				await this.refresh();
			}

			render_layout() {
				this.page.main.html(`
					<div class="school-loc">
						<div class="school-loc-hero">
							<div>
								<div class="school-loc-eyebrow">${__("School Analytics")}</div>
								<h2>${__("School Database Dashboard")}</h2>
								<p>${__("Province, department, city and Karachi-wise school summary with TPS, QPS and CEE status split.")}</p>
							</div>
							<div class="school-loc-hero__stats" id="school-loc-hero-stats"></div>
						</div>

						<div class="school-loc-toolbar">
							<div class="filter-field">
								<label>${__("Province")}</label>
								<select class="form-control input-province"><option value="">${__("All Provinces")}</option></select>
							</div>
							<div class="filter-field">
								<label>${__("City")}</label>
								<select class="form-control input-city"><option value="">${__("All Cities")}</option></select>
							</div>
							<div class="filter-field">
								<label>${__("Program")}</label>
								<select class="form-control input-program">
									<option value="">${__("All Programs")}</option>
									<option value="tps">TPS</option>
									<option value="qps">QPS</option>
									<option value="cee">CEE</option>
								</select>
							</div>
							<div class="filter-field">
								<label>${__("Program Status")}</label>
								<select class="form-control input-program-status">
									<option value="">${__("All")}</option>
									<option value="Active">${__("Active")}</option>
									<option value="In Active">${__("In Active")}</option>
									<option value="No">${__("No")}</option>
								</select>
							</div>
							<div class="filter-field">
								<label>${__("School Status")}</label>
								<select class="form-control input-school-status"><option value="">${__("All")}</option></select>
							</div>
							<div class="filter-field">
								<label>${__("School Type")}</label>
								<select class="form-control input-school-type"><option value="">${__("All")}</option></select>
							</div>
							<div class="filter-field filter-field--search">
								<label>${__("Search")}</label>
								<input class="form-control input-search" placeholder="${__("School, city, province, address")}" />
							</div>
							<div class="filter-field">
								<div class="school-loc-buttons">
									<button class="btn btn-primary btn-sm btn-refresh">${__("Refresh")}</button>
									<button class="btn btn-default btn-sm btn-clear">${__("Clear")}</button>
									<button class="btn btn-default btn-sm btn-print">${__("Print")}</button>
								</div>
							</div>
						</div>

						<div class="school-loc-kpis" id="school-loc-kpis"></div>

						<div class="school-loc-panel">
							<div class="school-loc-panel__head">
								<h3>${__("Province Wise School Summary")}</h3>
								<span>${__("TPS / QPS / CEE split")}</span>
							</div>
							<div class="school-loc-table-wrap" id="province-summary"></div>
						</div>

						<div class="school-loc-grid">
							<div class="school-loc-panel">
								<div class="school-loc-panel__head">
									<h3>${__("Department Wise School Summary")}</h3>
									<span>${__("All selected schools")}</span>
								</div>
								<div class="school-loc-table-wrap" id="department-summary"></div>
							</div>
							<div class="school-loc-panel">
								<div class="school-loc-panel__head">
									<h3>${__("Karachi School Summary")}</h3>
									<span>${__("City = Karachi")}</span>
								</div>
								<div class="school-loc-table-wrap" id="karachi-summary"></div>
							</div>
						</div>

						<div class="school-loc-grid school-loc-grid--wide">
							<div class="school-loc-panel">
								<div class="school-loc-panel__head">
									<h3>${__("Province Wise School")}</h3>
									<span>${__("Simple count")}</span>
								</div>
								<div class="school-loc-table-wrap" id="province-simple"></div>
							</div>
							<div class="school-loc-panel">
								<div class="school-loc-panel__head">
									<h3>${__("City Wise School")}</h3>
									<span>${__("Top locations")}</span>
								</div>
								<div class="school-loc-table-wrap school-loc-table-wrap--tall" id="city-summary"></div>
							</div>
						</div>

						<div class="school-loc-panel">
							<div class="school-loc-panel__head">
								<h3>${__("School Details")}</h3>
								<span>${__("Showing first 500 records")}</span>
							</div>
							<div class="school-loc-table-wrap school-loc-table-wrap--details" id="school-details"></div>
						</div>
					</div>
				`);
				this.add_style();
			}

			bind_events() {
				this.page.main.find(".btn-refresh").on("click", () => this.refresh());
				this.page.main.find(".btn-print").on("click", () => window.print());
				this.page.main.find(".btn-clear").on("click", () => {
					this.filters = {
						province: "",
						city: "",
						program: "",
						program_status: "",
						school_status: "",
						school_type: "",
						search: "",
					};
					this.page.main.find("select").val("");
					this.page.main.find(".input-search").val("");
					this.refresh();
				});
				[
					["province", ".input-province"],
					["city", ".input-city"],
					["program", ".input-program"],
					["program_status", ".input-program-status"],
					["school_status", ".input-school-status"],
					["school_type", ".input-school-type"],
				].forEach(([key, selector]) => {
					this.page.main.find(selector).on("change", (event) => {
						this.filters[key] = event.target.value || "";
					});
				});
				this.page.main.find(".input-search").on("change", (event) => {
					this.filters.search = (event.target.value || "").trim();
				});
			}

			async refresh() {
				this.page.set_indicator(__("Loading…"), "blue");
				try {
					const response = await frappe.call({
						method: "tif_customization.tif_customization.page.school_location_report.school_location_report.get_report_data",
						args: { filters: this.filters },
					});
					this.data = response.message || {};
					this.sync_filter_options();
					this.render();
				} catch (error) {
					frappe.msgprint(__("Could not load School Location Report"));
				} finally {
					this.page.clear_indicator?.();
				}
			}

			sync_filter_options() {
				if (this.options_loaded) return;
				const options = this.data.filter_options || {};
				this.fill_select(".input-province", options.provinces || [], __("All Provinces"));
				this.fill_select(".input-city", options.cities || [], __("All Cities"));
				this.fill_select(".input-school-status", options.school_statuses || [], __("All"));
				this.fill_select(".input-school-type", options.school_types || [], __("All"));
				this.options_loaded = true;
			}

			fill_select(selector, rows, all_label) {
				const value = this.page.main.find(selector).val() || "";
				this.page.main
					.find(selector)
					.html(
						[`<option value="">${all_label}</option>`]
							.concat(rows.map((row) => `<option value="${this.escape(row)}">${this.escape(row)}</option>`))
							.join("")
					)
					.val(value);
			}

			render() {
				this.render_hero();
				this.render_kpis();
				this.render_province_summary();
				this.render_department_summary();
				this.render_karachi_summary();
				this.render_simple_locations();
				this.render_details();
			}

			render_hero() {
				const summary = this.data.summary || {};
				this.page.main.find("#school-loc-hero-stats").html(`
					<div><span>${__("Schools")}</span><strong>${this.num(summary.total_schools)}</strong></div>
					<div><span>${__("Provinces")}</span><strong>${this.num(summary.provinces)}</strong></div>
					<div><span>${__("Cities")}</span><strong>${this.num(summary.cities)}</strong></div>
				`);
			}

			render_kpis() {
				const summary = this.data.summary || {};
				const cards = [
					{ label: __("Total Schools"), value: this.num(summary.total_schools), color: "#2563eb" },
					{ label: __("TPS Active"), value: this.num(summary.tps_active), color: "#059669" },
					{ label: __("QPS Active"), value: this.num(summary.qps_active), color: "#7c3aed" },
					{ label: __("CEE Active"), value: this.num(summary.cee_active), color: "#ea580c" },
				];
				this.page.main.find("#school-loc-kpis").html(
					cards
						.map(
							(card) => `
						<div class="school-loc-kpi" style="--accent:${card.color}">
							<div class="school-loc-kpi__label">${card.label}</div>
							<div class="school-loc-kpi__value">${card.value}</div>
						</div>`
						)
						.join("")
				);
			}

			render_province_summary() {
				this.render_table(
					"#province-summary",
					[
						{ key: "location", label: __("Province") },
						{ key: "tps_active", label: __("TPS Active"), num: true },
						{ key: "tps_inactive", label: __("TPS InActive"), num: true },
						{ key: "tps_no", label: __("TPS No"), num: true },
						{ key: "qps_active", label: __("QPS Active"), num: true },
						{ key: "qps_inactive", label: __("QPS InActive"), num: true },
						{ key: "qps_no", label: __("QPS No"), num: true },
						{ key: "cee_active", label: __("CEE Active"), num: true },
						{ key: "cee_no", label: __("CEE No"), num: true },
						{ key: "total_schools", label: __("Total Schools"), num: true, strong: true },
					],
					this.with_total_row(this.data.province_summary || [], "location")
				);
			}

			render_department_summary() {
				this.render_table(
					"#department-summary",
					[
						{ key: "department", label: __("Department") },
						{ key: "active", label: __("Active"), num: true },
						{ key: "inactive", label: __("In Active"), num: true },
						{ key: "no", label: __("No"), num: true },
						{ key: "total", label: __("Total"), num: true, strong: true },
					],
					this.data.department_summary || []
				);
			}

			render_karachi_summary() {
				this.render_table(
					"#karachi-summary",
					[
						{ key: "department", label: __("Department") },
						{ key: "active", label: __("Active"), num: true },
						{ key: "inactive", label: __("In Active"), num: true },
						{ key: "no", label: __("No Services"), num: true },
						{ key: "total", label: __("Total"), num: true, strong: true },
					],
					this.data.karachi_summary || []
				);
			}

			render_simple_locations() {
				this.render_table(
					"#province-simple",
					[
						{ key: "location", label: __("Province") },
						{ key: "total_schools", label: __("Province Wise School"), num: true, strong: true },
					],
					this.with_total_row(this.data.province_simple || [], "location")
				);
				this.render_table(
					"#city-summary",
					[
						{ key: "location", label: __("City") },
						{ key: "total_schools", label: __("No of School"), num: true, strong: true },
					],
					this.with_total_row(this.data.city_summary || [], "location")
				);
			}

			render_details() {
				this.render_table(
					"#school-details",
					[
						{ key: "name", label: __("ID"), link: "School" },
						{ key: "school_name", label: __("School") },
						{ key: "book_items", label: __("Book Detail"), books: true },
						{ key: "province", label: __("Province") },
						{ key: "city", label: __("City") },
						{ key: "tps", label: __("TPS") },
						{ key: "qps", label: __("QPS") },
						{ key: "cee", label: __("CEE") },
						{ key: "students", label: __("Students"), num: true },
						{ key: "address", label: __("Address"), cls: "school-loc-address" },
					],
					this.data.school_details || []
				);
			}

			with_total_row(rows, label_key) {
				if (!rows.length) return rows;
				const total = { [label_key]: __("Grand Total"), _total: true };
				Object.keys(rows[0]).forEach((key) => {
					if (key !== label_key && typeof rows[0][key] === "number") {
						total[key] = rows.reduce((sum, row) => sum + flt(row[key]), 0);
					}
				});
				return rows.concat([total]);
			}

			render_table(selector, columns, rows) {
				const element = this.page.main.find(selector);
				if (!rows.length) {
					element.html(`<div class="school-loc-empty">${__("No records found")}</div>`);
					return;
				}
				const head = columns
					.map((column) => `<th class="${column.num ? "text-right" : ""}">${column.label}</th>`)
					.join("");
				const body = rows
					.map((row) => {
						const cells = columns
							.map((column) => {
								let value = row[column.key];
								if (column.books) {
									value = this.render_book_details(row.book_items);
								} else if (column.num) {
									value = this.num(value);
								} else {
									value = this.escape(value == null ? "" : String(value));
									if (column.link && row[column.key]) {
										value = `<span class="school-loc-link" data-doctype="${column.link}" data-name="${this.escape(row[column.key])}">${value}</span>`;
									}
								}
								const classes = [
									column.num ? "text-right school-loc-num" : "",
									column.strong ? "school-loc-strong" : "",
									column.books ? "school-loc-books-cell" : "",
									column.cls || "",
								]
									.filter(Boolean)
									.join(" ");
								return `<td class="${classes}">${value}</td>`;
							})
							.join("");
						return `<tr class="${row._total ? "school-loc-total-row" : ""}">${cells}</tr>`;
					})
					.join("");
				element.html(`<table class="school-loc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
				element.find(".school-loc-link").on("click", function () {
					frappe.set_route("Form", this.getAttribute("data-doctype"), this.getAttribute("data-name"));
				});
			}

			num(value) {
				return format_number(flt(value), null, 0);
			}

			render_book_details(items) {
				if (!items || !items.length) {
					return `<span class="text-muted">—</span>`;
				}
				return `<div class="school-loc-books">${items
					.map(
						(item) => `
						<div class="school-loc-book">
							<span class="school-loc-book__name">${this.escape(item.item_name || "")}</span>
							<span class="school-loc-book__qty">${this.num(item.qty)}</span>
						</div>`
					)
					.join("")}</div>`;
			}

			escape(value) {
				return frappe.utils.escape_html(value == null ? "" : String(value));
			}

			add_style() {
				if ($("#school-location-report-style").length) return;
				$("head").append(`
					<style id="school-location-report-style">
						.school-loc { padding-bottom: 28px; }
						.school-loc-hero { display:flex; justify-content:space-between; gap:18px; flex-wrap:wrap; margin:8px 0 14px; padding:22px 24px; border-radius:18px; color:#fff; background:linear-gradient(135deg,#1e3a8a,#2563eb 50%,#059669); box-shadow:0 18px 40px rgba(15,23,42,.15); }
						.school-loc-eyebrow { font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#bfdbfe; margin-bottom:7px; }
						.school-loc-hero h2 { margin:0 0 7px; color:#fff; font-size:28px; font-weight:850; letter-spacing:-.03em; }
						.school-loc-hero p { margin:0; color:rgba(255,255,255,.9); font-size:14px; line-height:1.55; max-width:820px; }
						.school-loc-hero__stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; min-width:360px; align-self:center; }
						.school-loc-hero__stats div { padding:12px 14px; border:1px solid rgba(255,255,255,.25); border-radius:14px; background:rgba(255,255,255,.13); backdrop-filter:blur(10px); }
						.school-loc-hero__stats span { display:block; font-size:11px; font-weight:700; text-transform:uppercase; color:rgba(255,255,255,.75); }
						.school-loc-hero__stats strong { display:block; margin-top:3px; color:#fff; font-size:21px; font-weight:850; }
						.school-loc-toolbar { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; margin-bottom:14px; padding:14px; border:1px solid var(--border-color,#e5e7eb); border-radius:14px; background:var(--card-bg,#fff); box-shadow:0 1px 2px rgba(15,23,42,.04); }
						.school-loc-toolbar .filter-field { min-width:150px; }
						.school-loc-toolbar label { display:block; margin-bottom:5px; font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-muted,#6b7280); }
						.filter-field--search { flex:1; min-width:260px !important; }
						.school-loc-buttons { display:flex; flex-wrap:wrap; gap:8px; }
						.school-loc-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
						.school-loc-kpi { position:relative; overflow:hidden; padding:15px 16px; min-height:92px; border:1px solid var(--border-color,#e5e7eb); border-radius:16px; background:linear-gradient(180deg,var(--card-bg,#fff),rgba(248,250,252,.72)); box-shadow:0 1px 2px rgba(15,23,42,.04); }
						.school-loc-kpi:before { content:""; position:absolute; inset:0 0 auto 0; height:4px; background:var(--accent); }
						.school-loc-kpi__label { font-size:12px; font-weight:750; color:var(--text-muted,#6b7280); }
						.school-loc-kpi__value { margin-top:8px; font-size:25px; font-weight:850; letter-spacing:-.03em; }
						.school-loc-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
						.school-loc-grid--wide { grid-template-columns:.7fr 1.3fr; }
						.school-loc-panel { overflow:hidden; margin-bottom:12px; border:1px solid var(--border-color,#e5e7eb); border-radius:16px; background:var(--card-bg,#fff); box-shadow:0 1px 2px rgba(15,23,42,.04); }
						.school-loc-panel__head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:13px 15px; border-bottom:1px solid var(--border-color,#e5e7eb); background:linear-gradient(180deg,rgba(248,250,252,.98),rgba(248,250,252,.62)); }
						.school-loc-panel__head h3 { margin:0; font-size:15px; font-weight:800; }
						.school-loc-panel__head span { font-size:12px; color:var(--text-muted,#6b7280); }
						.school-loc-table-wrap { max-height:390px; overflow:auto; }
						.school-loc-table-wrap--tall { max-height:520px; }
						.school-loc-table-wrap--details { max-height:560px; }
						.school-loc-table { width:100%; border-collapse:separate; border-spacing:0; font-size:12px; }
						.school-loc-table th, .school-loc-table td { padding:9px 10px; border-bottom:1px solid var(--border-color,#e5e7eb); white-space:nowrap; vertical-align:top; }
						.school-loc-table th { position:sticky; top:0; z-index:2; background:#4f81bd; color:#fff; font-size:11px; font-weight:800; }
						.school-loc-table tbody tr:nth-child(even) td { background:#dbe8f5; }
						.school-loc-table tbody tr:nth-child(odd) td { background:#eef4fb; }
						.school-loc-table tbody tr:hover td { background:#dcfce7; }
						.school-loc-total-row td { background:#c6d9f1 !important; font-weight:850; }
						.school-loc-num, .school-loc-strong { font-weight:750; }
						.school-loc-link { color:var(--primary,#2563eb); cursor:pointer; font-weight:700; }
						.school-loc-link:hover { text-decoration:underline; }
						.school-loc-address { min-width:320px; max-width:520px; white-space:normal !important; line-height:1.4; }
						.school-loc-books-cell { min-width:240px; max-width:360px; white-space:normal !important; }
						.school-loc-books { display:flex; flex-direction:column; gap:3px; }
						.school-loc-book { display:flex; justify-content:space-between; gap:10px; align-items:baseline; line-height:1.35; }
						.school-loc-book__name { color:#0f172a; }
						.school-loc-book__qty { font-weight:800; font-variant-numeric:tabular-nums; white-space:nowrap; }
						.school-loc-empty { padding:28px; text-align:center; color:var(--text-muted,#6b7280); }
						@media(max-width:1100px){ .school-loc-kpis,.school-loc-grid,.school-loc-grid--wide { grid-template-columns:1fr; } .school-loc-hero__stats { min-width:100%; } }
						@media(max-width:700px){ .school-loc-hero__stats { grid-template-columns:1fr; } .school-loc-hero h2 { font-size:23px; } }
						@media print { .page-head,.school-loc-toolbar { display:none !important; } .school-loc-table-wrap { max-height:none; overflow:visible; } .school-loc-hero,.school-loc-panel,.school-loc-kpi { box-shadow:none; } }
					</style>
				`);
			}
		};
	}

	new window.SchoolLocationReport(page).make();
};
