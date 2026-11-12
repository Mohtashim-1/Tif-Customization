const SC_API = "tif_customization.tif_customization.page.school_certificate.school_certificate";
const SC_MAX_DOWNLOAD = 1500;

frappe.pages["school-certificate"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Mission Partner School Certificate"),
		single_column: true,
	});
	new SchoolCertificatePage(page);
};

class SchoolCertificatePage {
	constructor(page) {
		this.page = page;
		this.rows = [];
		this.selected = new Set();
		this.make_filters();
		this.make_body();
		this.page.set_primary_action(__("Download PDF"), () => this.download(), "download");
		this.page.set_secondary_action(__("Refresh"), () => this.load());
		this.load();
	}

	make_filters() {
		const reload = () => this.load();
		this.f = {
			search: this.page.add_field({
				fieldname: "search",
				label: __("Search School"),
				fieldtype: "Data",
				change: frappe.utils.debounce(reload, 400),
			}),
			province: this.page.add_field({
				fieldname: "province",
				label: __("Province"),
				fieldtype: "Select",
				options: [""],
				change: reload,
			}),
			city: this.page.add_field({
				fieldname: "city",
				label: __("City"),
				fieldtype: "Data",
				change: frappe.utils.debounce(reload, 400),
			}),
			from_date: this.page.add_field({
				fieldname: "from_date",
				label: __("Visits From"),
				fieldtype: "Date",
				change: reload,
			}),
			to_date: this.page.add_field({
				fieldname: "to_date",
				label: __("Visits To"),
				fieldtype: "Date",
				change: reload,
			}),
			eligible_only: this.page.add_field({
				fieldname: "eligible_only",
				label: __("Eligible only"),
				fieldtype: "Check",
				default: 1,
				change: reload,
			}),
			cert_date: this.page.add_field({
				fieldname: "cert_date",
				label: __("Certificate Date"),
				fieldtype: "Date",
				default: frappe.datetime.get_today(),
			}),
		};
	}

	make_body() {
		this.$body = $(`
			<div class="school-cert-page" style="padding: 8px 0 24px;">
				<style>
					.school-cert-page .sc-summary { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
					.school-cert-page .sc-card { background:var(--card-bg); border:1px solid var(--border-color); border-radius:8px; padding:10px 16px; min-width:170px; }
					.school-cert-page .sc-card .lbl { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.03em; }
					.school-cert-page .sc-card .val { font-size:20px; font-weight:700; }
					.school-cert-page table { width:100%; }
					.school-cert-page th { position:sticky; top:0; background:var(--subtle-fg); z-index:1; white-space:nowrap; }
					.school-cert-page td, .school-cert-page th { vertical-align:middle !important; font-size:12px; }
					.school-cert-page .sc-pill { display:inline-block; padding:1px 7px; margin:1px 2px; border-radius:10px; font-size:10.5px; background:var(--bg-light-gray); }
					.school-cert-page .sc-pill.QPS { background:#e3f1ec; color:#0d5c46; }
					.school-cert-page .sc-pill.TPS { background:#e8eefb; color:#28407a; }
					.school-cert-page .sc-pill.CEE { background:#fbf0e1; color:#8a5a12; }
					.school-cert-page .sc-scroll { max-height:65vh; overflow:auto; border:1px solid var(--border-color); border-radius:8px; }
					.school-cert-page tr.sc-off { color:var(--text-muted); }
				</style>
				<div class="sc-summary"></div>
				<div class="sc-scroll"><table class="table table-hover table-sm mb-0">
					<thead><tr>
						<th style="width:32px"><input type="checkbox" class="sc-all" title="${__("Select all")}"></th>
						<th>${__("School")}</th>
						<th>${__("City")}</th>
						<th>${__("Province")}</th>
						<th>${__("Running Programs")}</th>
						<th>${__("Last Visit")}</th>
						<th style="width:110px"></th>
					</tr></thead>
					<tbody></tbody>
				</table></div>
			</div>
		`).appendTo(this.page.main);

		this.$body.on("change", ".sc-all", (e) => {
			const on = e.target.checked;
			this.rows.filter((r) => r.eligible).forEach((r) => (on ? this.selected.add(r.school) : this.selected.delete(r.school)));
			this.render_rows();
		});
		this.$body.on("change", ".sc-row", (e) => {
			const school = decodeURIComponent($(e.target).attr("data-school"));
			e.target.checked ? this.selected.add(school) : this.selected.delete(school);
			this.render_summary();
		});
		this.$body.on("click", ".sc-one", (e) => {
			this.download([decodeURIComponent($(e.currentTarget).attr("data-school"))]);
		});
	}

	values() {
		const v = {};
		Object.keys(this.f).forEach((k) => (v[k] = this.f[k].get_value()));
		return v;
	}

	load() {
		const v = this.values();
		frappe.call({
			method: `${SC_API}.get_schools`,
			args: {
				search: v.search,
				province: v.province,
				city: v.city,
				from_date: v.from_date,
				to_date: v.to_date,
				eligible_only: v.eligible_only ? 1 : 0,
			},
			freeze: !this.loaded,
			callback: (r) => {
				const d = r.message || {};
				this.loaded = true;
				this.rows = d.rows || [];
				this.totals = d;
				const current = this.f.province.get_value();
				this.f.province.df.options = [""].concat(d.provinces || []);
				this.f.province.refresh();
				this.f.province.set_value(current || "");
				const visible = new Set(this.rows.map((r) => r.school));
				[...this.selected].forEach((s) => visible.has(s) || this.selected.delete(s));
				this.render_rows();
			},
		});
	}

	render_summary() {
		const t = this.totals || {};
		const card = (lbl, val) => `<div class="sc-card"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
		this.$body.find(".sc-summary").html(
			card(__("Schools visited"), t.total_schools || 0) +
				card(__("Eligible (program running)"), t.total_eligible || 0) +
				card(__("Showing"), this.rows.length) +
				card(__("Selected"), this.selected.size)
		);
		const eligible = this.rows.filter((r) => r.eligible);
		this.$body.find(".sc-all").prop("checked", eligible.length > 0 && eligible.every((r) => this.selected.has(r.school)));
	}

	render_rows() {
		const esc = frappe.utils.escape_html;
		const html = this.rows
			.map((r) => {
				const key = encodeURIComponent(r.school);
				const pills = r.running.length
					? r.running.map((p) => `<span class="sc-pill ${p.dept}">${esc(p.label)}</span>`).join("")
					: `<span class="text-muted">${__("No program running")}</span>`;
				return `<tr class="${r.eligible ? "" : "sc-off"}">
					<td><input type="checkbox" class="sc-row" data-school="${key}" ${r.eligible ? "" : "disabled"} ${this.selected.has(r.school) ? "checked" : ""}></td>
					<td><a href="/app/customer/${key}" target="_blank">${esc(r.school_label)}</a></td>
					<td>${esc(r.city || "")}</td>
					<td>${esc(r.province || "")}</td>
					<td>${pills}</td>
					<td style="white-space:nowrap">${r.last_visit ? frappe.datetime.str_to_user(r.last_visit) : ""}</td>
					<td>${r.eligible ? `<button class="btn btn-xs btn-default sc-one" data-school="${key}">${frappe.utils.icon("download", "xs")} ${__("PDF")}</button>` : ""}</td>
				</tr>`;
			})
			.join("");
		this.$body
			.find("tbody")
			.html(html || `<tr><td colspan="7" class="text-center text-muted py-4">${__("No schools found")}</td></tr>`);
		this.render_summary();
	}

	download(schools) {
		schools = schools || [...this.selected];
		if (!schools.length) {
			frappe.msgprint(__("Select at least one eligible school."));
			return;
		}
		if (schools.length > SC_MAX_DOWNLOAD) {
			frappe.msgprint(
				__("You selected {0} schools. Please download at most {1} certificates at a time (use the Province or City filter to split).", [
					schools.length,
					SC_MAX_DOWNLOAD,
				])
			);
			return;
		}
		open_url_post(`/api/method/${SC_API}.download_certificates`, {
			schools: JSON.stringify(schools),
			cert_date: this.f.cert_date.get_value() || frappe.datetime.get_today(),
		});
		frappe.show_alert(
			{
				message:
					schools.length > 100
						? __("Preparing {0} certificates… this can take up to a minute.", [schools.length])
						: __("Preparing {0} certificate(s)…", [schools.length]),
				indicator: "blue",
			},
			schools.length > 100 ? 15 : 5
		);
	}
}
