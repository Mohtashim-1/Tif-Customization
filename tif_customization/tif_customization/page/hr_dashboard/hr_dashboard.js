/**
 * HR Dashboard — `/app/hr-dashboard`
 * Workforce (hiring / attrition / headcount distributions).
 */

/** Distinct series colors (avoid single teal / low contrast) */
const TIF_HR_PALETTE = {
	donut: ["#4f46e5", "#ea580c", "#059669", "#e11d48", "#7c3aed", "#0891b2", "#ca8a04", "#db2777", "#65a30d"],
	lines4: ["#2563eb", "#ea580c", "#059669", "#dc2626"],
	present: ["#1d4ed8"],
	incidents: ["#ea580c", "#059669", "#dc2626"],
	hires: ["#2563eb", "#dc2626"],
	deptPair: ["#6366f1", "#f97316"],
	/** Punctuality pie: on-time → severe */
	punctualityBuckets: ["#059669", "#ca8a04", "#f97316", "#be123c"],
	/** Incident mix: absents, lates, half days, early goings */
	incidentMix: ["#dc2626", "#ea580c", "#059669", "#7c3aed"],
};

frappe.pages["hr-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "HR Dashboard",
		single_column: true,
	});

	if (!window.TIFAttendanceLeaveDashboard) {
		window.TIFAttendanceLeaveDashboard = class TIFAttendanceLeaveDashboard {
			constructor(page) {
				this.page = page;
				this.apex_loaded = false;
				this.charts = {};
				this.filters = {
					company: frappe.defaults.get_user_default("Company") || "",
					branch: "",
					department: "",
					employee: "",
					from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -5),
					to_date: frappe.datetime.get_today(),
				};
			}

			async make() {
				this.render();
				this.inject_styles();
				this.make_filters();
				this.bind_card_clicks();
				await this.load_apexcharts();
				await this.refresh();
			}

			render() {
				this.page.main.html(`
					<div class="tif-attdash">
						
						<div class="tif-attdash__cards" style="display:none">
							<div class="tif-card" data-card="attendance_records">
								<div class="tif-card__label">Attendance Records</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">EA docs in range</div>
							</div>
							<div class="tif-card" data-card="employees_covered">
								<div class="tif-card__label">Employees</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Distinct staff</div>
							</div>
							<div class="tif-card" data-card="total_present_days">
								<div class="tif-card__label">Σ Present Days</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Summed across records</div>
							</div>
							<div class="tif-card" data-card="total_absents">
								<div class="tif-card__label">Σ Absents</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Employee Attendance</div>
							</div>
							<div class="tif-card" data-card="total_lates">
								<div class="tif-card__label">Σ Lates</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Employee Attendance</div>
							</div>
							<div class="tif-card" data-card="total_half_days">
								<div class="tif-card__label">Σ Half Days</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Employee Attendance</div>
							</div>
							<div class="tif-card" data-card="approved_leave_days">
								<div class="tif-card__label">Approved Leave Days</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Leave Application</div>
							</div>
							<div class="tif-card" data-card="pending_leave_applications">
								<div class="tif-card__label">Open Leave Apps</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Submitted, awaiting</div>
							</div>
						</div>

						
						
							<div class="tif-attdash__cards">
								<div class="tif-card tif-card--clickable" data-card="active_headcount" title="Click for detail">
									<div class="tif-card__label">Active Employees</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Excl. Special Education</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="special_education_staff" title="Click for detail">
									<div class="tif-card__label">Special Education Staff</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Center + S.EDU</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_full_time_permanent" title="Click for detail">
									<div class="tif-card__label">Full Time Permanent</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_part_time_permanent" title="Click for detail">
									<div class="tif-card__label">Part Time Permanent</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_contract_fixed_salary" title="Click for detail">
									<div class="tif-card__label">Contract Base (Fixed Salary)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_contract_as_per_need" title="Click for detail">
									<div class="tif-card__label">Contract Base (As Per Need)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Contract / consultant staff</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_full_time_probation" title="Click for detail">
									<div class="tif-card__label">Full Time Probation</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_part_time_probation" title="Click for detail">
									<div class="tif-card__label">Part Time Probation</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="emp_types_total" title="Click for detail">
									<div class="tif-card__label">Total</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">All employment types</div>
								</div>
							</div>

							<div class="tif-attdash__spacer" aria-hidden="true"></div>
							<div class="tif-attdash__section">
								<div class="tif-attdash__section-title">Staff by gender</div>
								<div class="tif-attdash__cards">
									<div class="tif-card tif-card--clickable" data-card="full_time_male" title="Click for detail">
										<div class="tif-card__label">Full Time Male</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active employees</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="full_time_female" title="Click for detail">
										<div class="tif-card__label">Full Time Female</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active employees</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="part_time_male" title="Click for detail">
										<div class="tif-card__label">Part Time Male</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active employees</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="part_time_female" title="Click for detail">
										<div class="tif-card__label">Part Time Female</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active employees</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="contract_staff_male" title="Click for detail">
										<div class="tif-card__label">Contract Staff Male</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active employees</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="contract_staff_female" title="Click for detail">
										<div class="tif-card__label">Contract Staff Female</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active employees</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="overall_male_staff" title="Click for detail">
										<div class="tif-card__label">Overall Male Staff</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">All active male</div>
									</div>
									<div class="tif-card tif-card--clickable" data-card="overall_female_staff" title="Click for detail">
										<div class="tif-card__label">Overall Female Staff</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">All active female</div>
									</div>
								</div>
							</div>

							<div class="tif-attdash__cards">
								<div class="tif-card tif-card--clickable" data-card="new_hires_this_month" title="Click for detail">
									<div class="tif-card__label">New hires (This Month)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Joining this month</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="new_hires_this_year" title="Click for detail">
									<div class="tif-card__label">New hires (This Year)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Joining this year</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="attrition_this_month" title="Click for detail">
									<div class="tif-card__label">Attrition (This Month)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Payroll month (26–25)</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="left_employees_this_month" title="Click for detail">
									<div class="tif-card__label">Left Employees (This Month)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Payroll month (26–25)</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="left_employees_this_year" title="Click for detail">
									<div class="tif-card__label">Left Employees (This Year)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Payroll year (26 Jun – 25 Jun)</div>
								</div>
								<div class="tif-card" data-card="top_punctual_last_year">
									<div class="tif-card__label">Top Punctual (Last Year)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Full time with 0 lates · previous payroll year</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="top_3_late_comers_last_year" title="Click for employee names">
									<div class="tif-card__label">Top 3 Late Comers (Last Year)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Full time · previous payroll year</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="eobi_added" title="Click for detail">
									<div class="tif-card__label">EOBI Enrolled</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees with EOBI</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="pak_qatar_enrolled" title="Click for detail">
									<div class="tif-card__label">Pak Qatar (Enrolled Health Card, Paycon, GLT)</div>
									<div class="tif-card__value">—</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="cnic_expired_count" title="Click for detail">
									<div class="tif-card__label">CNIC Expired</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active; expiry before today</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="cnic_upcoming_count" title="Click for detail">
									<div class="tif-card__label">Upcoming CNIC Expiry</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active; expiring soon</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="upcoming_confirmation" title="Click for detail">
									<div class="tif-card__label">Upcoming Confirmation</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Next 60 days</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="total_male" title="Click for detail">
									<div class="tif-card__label">Total Male</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="total_female" title="Click for detail">
									<div class="tif-card__label">Total Female</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active employees</div>
								</div>
								<div class="tif-card tif-card--clickable" data-card="top_3_late_comers" title="Click for employee names">
									<div class="tif-card__label">Top 3 Late Comers</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Full time · current payroll month</div>
								</div>
								<div class="tif-card" data-card="top_3_punctual_employees">
									<div class="tif-card__label">Top Punctual</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Full time with 0 lates</div>
								</div>
							</div>
							

						<div class="tif-attdash__grid">
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Hiring vs attrition (monthly counts)</div>
								<div id="tif-attdash-hire-attr"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Active headcount by employment type</div>
								<div id="tif-attdash-emp-type"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Gender (active employees)</div>
								<div id="tif-dash-wf-gender"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Grades (active employees)</div>
								<div id="tif-dash-wf-grade"></div>
							</div>
							
							
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">City (active count by employment type)</div>
								<p class="tif-panel__hint">Each bar shows total employees per city, split by employment type.</p>
								<div id="tif-dash-wf-ebranch"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">City headcount</div>
								<div id="tif-dash-wf-branch-table"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Designation (active count)</div>
								<div id="tif-dash-wf-desig"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Department (active count by employment type)</div>
								<p class="tif-panel__hint">Each bar shows total employees per department, split by employment type.</p>
								<div id="tif-dash-wf-dept"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Monthly attendance (Employee Attendance)</div>
								<p class="tif-panel__hint">Present days and incidents use separate charts so small values stay readable.</p>
								<div class="tif-attdash__split-charts">
									<div class="tif-attdash__split-cell">
										<div class="tif-chart-subtitle">Present days</div>
										<div id="tif-attdash-monthly-present"></div>
									</div>
									<div class="tif-attdash__split-cell">
										<div class="tif-chart-subtitle">Absents, lates &amp; half days</div>
										<div id="tif-attdash-monthly-incidents"></div>
									</div>
								</div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Punctuality</div>
								<p class="tif-panel__hint">Staff grouped by Σ lates on their attendance rows in range. Incident mix shows the share of each incident type (totals).</p>
								<div class="tif-attdash__split-charts">
									<div class="tif-attdash__split-cell">
										<div class="tif-chart-subtitle">Employees by Σ lates</div>
										<div id="tif-attdash-punct-buckets"></div>
									</div>
									<div class="tif-attdash__split-cell">
										<div class="tif-chart-subtitle">Incident mix (Σ)</div>
										<div id="tif-attdash-punct-mix"></div>
									</div>
								</div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Totals distribution</div>
								<div id="tif-attdash-dist"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Leave applications by status</div>
								<div id="tif-attdash-leave-status"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Department — absents vs lates (Σ)</div>
								<div id="tif-attdash-dept"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Present days by city (unit)</div>
								<div id="tif-attdash-branch"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Approved leave trend</div>
								<div id="tif-attdash-leave-trend"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Leave days by type</div>
								<div id="tif-attdash-leave-type"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Top late comers (Σ lates)</div>
								<div id="tif-attdash-top-lates"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Top employees by total absents (Σ)</div>
								<div id="tif-attdash-top-abs"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">CNIC expired — detail</div>
								<p class="tif-panel__hint">Active employees with CNIC Expiry before today (if field exists).</p>
								<div id="tif-attdash-cnic-expired"></div>
							</div>
							
							
							
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Top late comers — detail</div>
								<div id="tif-attdash-table-lates"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Highest absents — detail</div>
								<div id="tif-attdash-table-abs"></div>
							</div>
						</div>
					</div>
				`);
			}

			inject_styles() {
				if (document.getElementById("tif-attdash-style")) return;
				const style = document.createElement("style");
				style.id = "tif-attdash-style";
				style.textContent = `
					.tif-attdash__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px;margin:8px 0 14px}
					.tif-attdash__spacer{height:18px;margin:6px 0 4px;border:0;border-top:1px solid var(--border-color);opacity:.85}
					.tif-attdash__section{margin:0 0 16px}
					.tif-attdash__section-title{font-size:14px;font-weight:650;margin:0 0 10px;color:var(--text-color)}
					.tif-attdash__section .tif-attdash__cards{margin-top:0}
					.tif-card{border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);padding:12px;min-width:140px}
					.tif-card--clickable{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
					.tif-card--clickable:hover{border-color:var(--primary);box-shadow:0 2px 8px rgba(37,99,235,.12)}
					.tif-drill-row:hover{background:var(--control-bg)}
					.tif-card__label{font-size:12px;color:var(--text-muted);margin-bottom:4px}
					.tif-card__value{font-size:20px;font-weight:700;line-height:1.2}
					.tif-card__hint{font-size:11px;color:var(--text-muted);margin-top:6px}
					.tif-card[data-card]{position:relative;overflow:hidden}
					.tif-card[data-card]::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:var(--tif-card-accent, transparent)}
					.tif-card[data-card] .tif-card__value{color:var(--tif-card-accent-text, inherit)}
					.tif-card[data-card] .tif-card__label,
					.tif-card[data-card] .tif-card__hint{color:var(--tif-card-muted, var(--text-muted))}
					.tif-card--clickable:hover{transform:translateY(-1px)}
					.tif-card[data-card="active_headcount"]{--tif-card-accent:#1e40af;--tif-card-accent-text:#ffffff;--tif-card-muted:#dbeafe;background:linear-gradient(135deg,#1d4ed8 0%,#1e3a8a 100%);border-color:#1e40af;box-shadow:0 6px 16px rgba(30,64,175,.18)}
					.tif-card[data-card="special_education_staff"]{--tif-card-accent:#0f766e;--tif-card-accent-text:#ffffff;--tif-card-muted:#ccfbf1;background:linear-gradient(135deg,#0d9488 0%,#115e59 100%);border-color:#0f766e;box-shadow:0 6px 16px rgba(15,118,110,.18)}
					.tif-card[data-card="emp_full_time_permanent"],
					.tif-card[data-card="emp_part_time_permanent"],
					.tif-card[data-card="emp_contract_fixed_salary"],
					.tif-card[data-card="emp_contract_as_per_need"]{--tif-card-accent:#7c3aed;--tif-card-accent-text:#6d28d9;--tif-card-muted:#4c1d95;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border-color:#ddd6fe}
					.tif-card[data-card="emp_full_time_probation"],
					.tif-card[data-card="emp_part_time_probation"]{--tif-card-accent:#0891b2;--tif-card-accent-text:#0e7490;--tif-card-muted:#164e63;background:linear-gradient(135deg,#ecfeff 0%,#cffafe 100%);border-color:#a5f3fc}
					.tif-card[data-card="emp_types_total"]{--tif-card-accent:#0f766e;--tif-card-accent-text:#115e59;--tif-card-muted:#134e4a;background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);border-color:#99f6e4}
					.tif-card[data-card="full_time_male"],
					.tif-card[data-card="part_time_male"],
					.tif-card[data-card="contract_staff_male"]{--tif-card-accent:#2563eb;--tif-card-accent-text:#1d4ed8;--tif-card-muted:#1e3a8a;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-color:#bfdbfe}
					.tif-card[data-card="full_time_female"],
					.tif-card[data-card="part_time_female"],
					.tif-card[data-card="contract_staff_female"]{--tif-card-accent:#db2777;--tif-card-accent-text:#be185d;--tif-card-muted:#831843;background:linear-gradient(135deg,#fdf2f8 0%,#fce7f3 100%);border-color:#fbcfe8}
					.tif-card[data-card="overall_male_staff"]{--tif-card-accent:#1e3a8a;--tif-card-accent-text:#ffffff;--tif-card-muted:#bfdbfe;background:linear-gradient(135deg,#1d4ed8 0%,#1e3a8a 100%);border-color:#1e40af;box-shadow:0 6px 16px rgba(30,64,175,.22)}
					.tif-card[data-card="overall_female_staff"]{--tif-card-accent:#9d174d;--tif-card-accent-text:#ffffff;--tif-card-muted:#fbcfe8;background:linear-gradient(135deg,#db2777 0%,#9d174d 100%);border-color:#be185d;box-shadow:0 6px 16px rgba(190,24,93,.22)}
					.tif-card[data-card="overall_male_staff"] .tif-card__label,
					.tif-card[data-card="overall_male_staff"] .tif-card__hint,
					.tif-card[data-card="overall_female_staff"] .tif-card__label,
					.tif-card[data-card="overall_female_staff"] .tif-card__hint{color:var(--tif-card-muted)}
					.tif-card[data-card="overall_male_staff"] .tif-card__value,
					.tif-card[data-card="overall_female_staff"] .tif-card__value{color:#ffffff}
					.tif-card[data-card="new_hires_this_month"],
					.tif-card[data-card="new_hires_this_year"]{--tif-card-accent:#059669;--tif-card-accent-text:#047857;--tif-card-muted:#064e3b;background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-color:#a7f3d0}
					.tif-card[data-card="left_employees_this_month"],
					.tif-card[data-card="left_employees_this_year"],
					.tif-card[data-card="attrition_this_month"]{--tif-card-accent:#f97316;--tif-card-accent-text:#c2410c;--tif-card-muted:#7c2d12;background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border-color:#fed7aa}
					.tif-card[data-card="eobi_added"]{--tif-card-accent:#ca8a04;--tif-card-accent-text:#a16207;--tif-card-muted:#713f12;background:linear-gradient(135deg,#fefce8 0%,#fef3c7 100%);border-color:#fde68a}
					.tif-card[data-card="pak_qatar_enrolled"]{--tif-card-accent:#db2777;--tif-card-accent-text:#be185d;--tif-card-muted:#831843;background:linear-gradient(135deg,#fdf2f8 0%,#fce7f3 100%);border-color:#fbcfe8}
					.tif-card[data-card="cnic_expired_count"]{--tif-card-accent:#dc2626;--tif-card-accent-text:#b91c1c;--tif-card-muted:#7f1d1d;background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%);border-color:#fecaca}
					.tif-card[data-card="cnic_upcoming_count"]{--tif-card-accent:#4f46e5;--tif-card-accent-text:#4338ca;--tif-card-muted:#312e81;background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%);border-color:#c7d2fe}
					.tif-card[data-card="upcoming_confirmation"]{--tif-card-accent:#0d9488;--tif-card-accent-text:#0f766e;--tif-card-muted:#134e4a;background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);border-color:#99f6e4}
					.tif-card[data-card="total_male"],
					.tif-card[data-card="total_female"]{--tif-card-accent:#64748b;--tif-card-accent-text:#475569;--tif-card-muted:#334155;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);border-color:#cbd5e1}
					.tif-card[data-card="top_3_late_comers"],
					.tif-card[data-card="top_3_late_comers_last_year"]{--tif-card-accent:#dc2626;--tif-card-accent-text:#b91c1c;--tif-card-muted:#7f1d1d;background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%);border-color:#fecaca}
					.tif-card[data-card="top_3_punctual_employees"],
					.tif-card[data-card="top_punctual_last_year"]{--tif-card-accent:#059669;--tif-card-accent-text:#047857;--tif-card-muted:#064e3b;background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-color:#a7f3d0}
					.tif-attdash__grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:12px}
					.tif-panel{border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);padding:12px;box-shadow:0 1px 2px rgba(15,23,42,.06)}
					.tif-panel__title{font-size:13px;font-weight:600;margin-bottom:8px}
					.tif-panel--span2{grid-column:1 / -1}
					.tif-attdash .apexcharts-canvas{margin:0 auto}
					.tif-panel__hint{font-size:11px;color:var(--text-muted);margin:0 0 10px;line-height:1.4}
					.tif-attdash__split-charts{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
					@media (max-width:960px){.tif-attdash__split-charts{grid-template-columns:1fr}}
					.tif-chart-subtitle{font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)}
					@media (min-width: 1400px){
						.tif-attdash__grid{grid-template-columns:repeat(3,minmax(300px,1fr))}
						.tif-panel--span2{grid-column:1 / -1}
					}
				`;
				document.head.appendChild(style);
			}

			make_filters() {
				this.page.clear_primary_action();
				this.page.set_primary_action("Refresh", () => this.refresh(), "refresh");
				this.page.add_inner_button("Last 6 months", () => this.set_range_months(6));
				this.page.add_inner_button("Last 12 months", () => this.set_range_months(12));
				this.page.add_inner_button("Year to date", () => this.set_range_year());
				this.page.add_inner_button("Clear dept / employee", () => {
					this.page.fields_dict.department?.set_value("");
					this.page.fields_dict.employee?.set_value("");
					this.on_filter_change();
				});

				this.page.add_field({
					fieldname: "company",
					label: "Company",
					fieldtype: "Link",
					options: "Company",
					default: this.filters.company,
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "branch",
					label: "Branch",
					fieldtype: "Link",
					options: "Branch",
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "department",
					label: "Department",
					fieldtype: "Link",
					options: "Department",
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "employee",
					label: "Employee",
					fieldtype: "Link",
					options: "Employee",
					get_query: () => {
						const company = this.page.fields_dict.company?.get_value?.();
						const filters = { status: "Active" };
						if (company) {
							filters.company = company;
						}
						return { filters };
					},
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "from_date",
					label: "From",
					fieldtype: "Date",
					default: this.filters.from_date,
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "to_date",
					label: "To",
					fieldtype: "Date",
					default: this.filters.to_date,
					change: () => this.on_filter_change(),
				});
			}

			set_range_months(n) {
				const to = frappe.datetime.get_today();
				const from = frappe.datetime.add_months(to, -Math.abs(n));
				this.page.fields_dict.from_date.set_value(from);
				this.page.fields_dict.to_date.set_value(to);
				this.on_filter_change();
			}

			set_range_year() {
				const to = frappe.datetime.get_today();
				const yearStart = frappe.datetime.year_start(to);
				this.page.fields_dict.from_date.set_value(yearStart);
				this.page.fields_dict.to_date.set_value(to);
				this.on_filter_change();
			}

			on_filter_change() {
				this.filters.company = this.page.fields_dict.company?.get_value() || "";
				this.filters.branch = this.page.fields_dict.branch?.get_value() || "";
				this.filters.department = this.page.fields_dict.department?.get_value() || "";
				this.filters.employee = this.page.fields_dict.employee?.get_value() || "";
				this.filters.from_date = this.page.fields_dict.from_date?.get_value() || "";
				this.filters.to_date = this.page.fields_dict.to_date?.get_value() || "";
				this.refresh();
			}

			/** frappe.format often returns HTML divs; strip for table/KPI text */
			_plain_formatted(val, fieldtype) {
				const raw = frappe.format(val ?? 0, { fieldtype: fieldtype || "Float" });
				let s = String(raw ?? "");
				if (frappe.utils?.strip_html) {
					s = frappe.utils.strip_html(s);
				}
				s = s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
				return s || "—";
			}

			_apexMode() {
				return frappe.boot?.sysdefaults?.theme === "dark" ? "dark" : "light";
			}

			/** Horizontal bar category axis — reduce ellipsis truncation on long names */
			_xaxisCategoriesNoTrim(labels) {
				return {
					categories: labels,
					labels: {
						trim: false,
						hideOverlappingLabels: false,
						maxHeight: 400,
						style: { fontSize: "11px" },
					},
				};
			}

			/** ApexCharts defaults: animations + light shadow (restores “live” feel) */
			_chartAnim(partial) {
				return {
					...partial,
					animations: {
						enabled: true,
						easing: "easeinout",
						speed: 700,
						animateGradually: { enabled: true, delay: 100 },
						dynamicAnimation: { enabled: true, speed: 400 },
					},
					dropShadow: {
						enabled: true,
						top: 2,
						left: 0,
						blur: 6,
						opacity: 0.1,
						color: "#000",
					},
				};
			}

			/** Map punctuality bucket label → color (subset of buckets keeps correct semantics) */
			_lateBucketColors(labels) {
				const order = ["0 lates", "1-5 lates", "6-15 lates", "16+ lates"];
				const pal = TIF_HR_PALETTE.punctualityBuckets;
				return (labels || []).map((lb) => {
					const i = order.indexOf(lb);
					return i >= 0 ? pal[i] : pal[pal.length - 1];
				});
			}

			_stackedEmploymentColors(seriesCount) {
				const base = [...TIF_HR_PALETTE.donut, "#0d9488", "#9333ea", "#b45309", "#be185d", "#1e40af"];
				if (seriesCount <= base.length) {
					return base.slice(0, seriesCount);
				}
				const colors = [...base];
				while (colors.length < seriesCount) {
					colors.push(base[colors.length % base.length]);
				}
				return colors;
			}

			_render_stacked_headcount_chart(key, selector, data, options = {}) {
				const mode = this._apexMode();
				const labels = data.labels || [];
				const series = data.series || [];
				const chartHeight = Math.max(options.height || 380, labels.length * 34);
				const colors = this._stackedEmploymentColors(series.length);
				const chart = this.ensure_chart(key, selector, {
					chart: this._chartAnim({
						type: "bar",
						height: chartHeight,
						stacked: true,
						toolbar: { show: false },
					}),
					theme: { mode },
					colors,
					grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
					tooltip: { theme: mode, shared: true, intersect: false },
					noData: { text: options.noData || "No data" },
					plotOptions: {
						bar: {
							horizontal: true,
							borderRadius: 3,
							barHeight: "72%",
							dataLabels: { total: { enabled: true, style: { fontSize: "11px", fontWeight: 700 } } },
						},
					},
					xaxis: this._xaxisCategoriesNoTrim(labels),
					series,
					dataLabels: {
						enabled: true,
						style: { fontSize: "10px", fontWeight: 600 },
						formatter: (val) => (val > 0 ? String(Math.round(val)) : ""),
					},
					legend: { position: "top", fontWeight: 500, fontSize: "11px" },
					yaxis: { labels: { maxWidth: 220 } },
				});
				if (chart) {
					chart.updateOptions(
						{
							chart: { height: chartHeight },
							colors,
							xaxis: this._xaxisCategoriesNoTrim(labels),
						},
						false,
						true,
					);
					chart.updateSeries(series, true);
				}
				return chart;
			}

			load_apexcharts() {
				if (this.apex_loaded || window.ApexCharts) {
					this.apex_loaded = true;
					return Promise.resolve();
				}
				return new Promise((resolve, reject) => {
					const existing = document.querySelector('script[data-tif-apexcharts="1"]');
					if (existing) {
						existing.addEventListener("load", () => resolve());
						existing.addEventListener("error", () => reject());
						return;
					}
					const script = document.createElement("script");
					script.dataset.tifApexcharts = "1";
					script.src = "https://cdn.jsdelivr.net/npm/apexcharts@3.49.1";
					script.onload = () => {
						this.apex_loaded = true;
						resolve();
					};
					script.onerror = () => reject(new Error("Failed to load ApexCharts"));
					document.head.appendChild(script);
				});
			}

			set_card(key, value, fmt = false) {
				const el = this.page.main.find(`.tif-card[data-card="${key}"] .tif-card__value`)[0];
				if (!el) return;
				if (value === null || value === undefined || value === "") {
					el.textContent = "—";
					return;
				}
				let formatted;
				if (fmt === "currency") {
					formatted = frappe.format(value, { fieldtype: "Currency" });
				} else if (fmt === true) {
					formatted = frappe.format(value, { fieldtype: "Float" });
				} else if (typeof value === "number" && !Number.isInteger(value)) {
					formatted = frappe.format(value, { fieldtype: "Float" });
				} else {
					formatted = frappe.format(value, { fieldtype: "Int" });
				}
				const s = String(formatted ?? value);
				el.textContent = frappe.utils?.strip_html ? frappe.utils.strip_html(s) : s.replace(/<[^>]*>/g, "");
			}

			set_card_hint(key, hint) {
				const el = this.page.main.find(`.tif-card[data-card="${key}"] .tif-card__hint`)[0];
				if (!el) return;
				el.textContent = hint || "";
			}

			ensure_chart(key, selector, options) {
				if (!window.ApexCharts) return null;
				if (this.charts[key]) return this.charts[key];
				const container = this.page.main.find(selector)[0];
				if (!container) return null;
				const chart = new ApexCharts(container, options);
				chart.render();
				this.charts[key] = chart;
				return chart;
			}

			async refresh() {
				if (!window.ApexCharts) {
					try {
						await this.load_apexcharts();
					} catch (e) {
						frappe.msgprint("ApexCharts could not be loaded.");
						return;
					}
				}
				const filters = { ...this.filters };
				this.page.set_indicator("Loading…", "blue");
				const r = await frappe.call({
					method: "tif_customization.tif_customization.page.hr_dashboard.hr_dashboard.get_dashboard_data",
					args: { filters },
				});
				if (this.page.clear_indicator) this.page.clear_indicator();
				const data = r?.message || {};
				this.render_kpis(data);
				this.render_charts(data);
			}

			render_kpis(data) {
				this.dashboard_data = data || {};
				this.set_card("attendance_records", data.attendance_records);
				this.set_card("employees_covered", data.employees_covered);
				this.set_card("total_present_days", data.total_present_days, true);
				this.set_card("total_absents", data.total_absents, true);
				this.set_card("total_lates", data.total_lates, true);
				this.set_card("total_half_days", data.total_half_days, true);
				this.set_card("approved_leave_days", data.approved_leave_days, true);
				this.set_card("pending_leave_applications", data.pending_leave_applications);

				this.set_card("active_headcount", data.active_headcount);
				this.set_card("special_education_staff", data.special_education_staff);
				this.set_card("emp_full_time_permanent", data.emp_full_time_permanent);
				this.set_card("emp_part_time_permanent", data.emp_part_time_permanent);
				this.set_card("emp_full_time_probation", data.emp_full_time_probation);
				this.set_card("emp_part_time_probation", data.emp_part_time_probation);
				this.set_card("emp_contract_as_per_need", data.emp_contract_as_per_need);
				this.set_card("emp_contract_fixed_salary", data.emp_contract_fixed_salary);
				this.set_card("emp_types_total", data.emp_types_total);
				this.set_card("full_time_male", data.full_time_male);
				this.set_card("full_time_female", data.full_time_female);
				this.set_card("part_time_male", data.part_time_male);
				this.set_card("part_time_female", data.part_time_female);
				this.set_card("contract_staff_male", data.contract_staff_male);
				this.set_card("contract_staff_female", data.contract_staff_female);
				this.set_card("overall_male_staff", data.overall_male_staff);
				this.set_card("overall_female_staff", data.overall_female_staff);
				this.set_card("new_hires_this_month", data.new_hires_this_month);
				this.set_card("new_hires_this_year", data.new_hires_this_year);
				this.set_card("attrition_this_month", data.attrition_this_month);
				const payrollMonthLabel = data.payroll_month_label || "";
				const payrollYearLabel = data.payroll_year_label || "";
				const attritionRate = data.attrition_rate_this_month;
				const attritionHint =
					payrollMonthLabel && attritionRate !== null && attritionRate !== undefined
						? `${payrollMonthLabel} · ${Number(attritionRate).toFixed(2)}% of active headcount`
						: payrollMonthLabel || "Payroll month (26–25)";
				this.set_card_hint("attrition_this_month", attritionHint);
				this.set_card("left_employees_this_month", data.left_employees_this_month);
				this.set_card_hint(
					"left_employees_this_month",
					payrollMonthLabel || "Payroll month (26–25)",
				);
				this.set_card("left_employees_this_year", data.left_employees_this_year);
				this.set_card_hint(
					"left_employees_this_year",
					payrollYearLabel || "Payroll year (26 Jun – 25 Jun)",
				);
				this.set_card("eobi_added", data.eobi_added_count);
				this.set_card("pak_qatar_enrolled", data.pak_qatar_enrolled_count);
				this.set_card("cnic_expired_count", data.cnic_expired_count);
				this.set_card("cnic_upcoming_count", data.cnic_upcoming_count);
				this.set_card("upcoming_confirmation", data.upcoming_confirmation_count);
				this.set_card("total_male", data.total_male);
				this.set_card("total_female", data.total_female);

				const lateList = data.top_3_late_comers || [];
				this.set_card("top_3_late_comers", lateList.length || data.top_3_late_comers_count || 0);
				this.set_card_hint(
					"top_3_late_comers",
					payrollMonthLabel
						? `Full time · ${payrollMonthLabel}`
						: "Full time · current payroll month",
				);

				const punctualCount = Number(
					data.top_punctual_zero_lates_count ?? data.top_3_punctual_employees_count ?? 0,
				);
				this.set_card("top_3_punctual_employees", punctualCount);
				this.set_card_hint(
					"top_3_punctual_employees",
					payrollMonthLabel
						? `Full time with 0 lates · ${payrollMonthLabel}`
						: "Full time with 0 lates · current payroll month",
				);

				const lateYearList = data.top_3_late_comers_last_year || [];
				const payrollYearPrevLabel = data.payroll_year_prev_label || "";
				this.set_card(
					"top_3_late_comers_last_year",
					lateYearList.length || data.top_3_late_comers_last_year_count || 0,
				);
				this.set_card_hint(
					"top_3_late_comers_last_year",
					payrollYearPrevLabel
						? `Full time · ${payrollYearPrevLabel}`
						: "Full time · previous payroll year",
				);

				const punctualYearCount = Number(data.top_punctual_last_year_count || 0);
				this.set_card("top_punctual_last_year", punctualYearCount);
				this.set_card_hint(
					"top_punctual_last_year",
					payrollYearPrevLabel
						? `Full time with 0 lates · ${payrollYearPrevLabel}`
						: "Full time with 0 lates · previous payroll year",
				);

				this.set_card("new_hires", data.new_hires);
				this.set_card("left_employees", data.left_employees);
				const arEl = this.page.main.find('.tif-card[data-card="attrition_rate"] .tif-card__value')[0];
				if (arEl) {
					const v = data.attrition_rate;
					arEl.textContent =
						v === null || v === undefined || v === ""
							? "—"
							: `${Number(v).toFixed(2)}%`;
				}

				this.set_card("total_left_employees", data.total_left_employees);
				this.set_card("payroll_salary_slips_this_month", data.payroll_salary_slips_this_month);
				this.set_card("payroll_net_pay_this_month", data.payroll_net_pay_this_month, "currency");
				this.set_card("active_headcount_pakistan", data.active_headcount_pakistan);
				this.set_card("probation_employees_count", data.probation_employees_count);
				const d = Number(data.cnic_upcoming_days || 30);
				this.set_card_hint("cnic_upcoming_count", `Active; next ${Number.isFinite(d) ? d : 30} days`);
			}

			bind_card_clicks() {
				const me = this;
				this.page.main.off("click.tifCardDrill");
				this.page.main.on("click.tifCardDrill", ".tif-card--clickable", function () {
					const cardKey = this.getAttribute("data-card");
					if (cardKey) me.show_card_drilldown(cardKey);
				});
			}

			async show_card_drilldown(cardKey) {
				const filters = {
					...this.filters,
					cnic_upcoming_days: this.dashboard_data?.cnic_upcoming_days || 30,
				};
				const label = this.page.main
					.find(`.tif-card[data-card="${cardKey}"] .tif-card__label`)
					.first()
					.text()
					.trim();
				const d = new frappe.ui.Dialog({
					title: __("Drill-down: {0}", [label || cardKey]),
					size: "extra-large",
					fields: [{ fieldtype: "HTML", fieldname: "body" }],
				});
				d.fields_dict.body.$wrapper.html(
					`<div class="text-muted" style="padding:20px;text-align:center">${__("Loading…")}</div>`,
				);
				d.show();

				try {
					const r = await frappe.call({
						method: "tif_customization.tif_customization.page.hr_dashboard.hr_dashboard.get_card_drilldown",
						args: { card_key: cardKey, filters },
					});
					const payload = r?.message || {};
					const rows = payload.rows || [];
					if (!rows.length) {
						d.fields_dict.body.$wrapper.html(
							`<div class="text-muted" style="padding:20px;text-align:center">${__("No records found")}</div>`,
						);
						return;
					}
					const columns = payload.columns || [];
					const tableHtml = this._drilldown_table_html(rows, columns);
					d.fields_dict.body.$wrapper.html(
						`<p class="text-muted small" style="margin-bottom:10px">${__(
							"{0} record(s)",
							[String(rows.length)],
						)}</p>${tableHtml}`,
					);
					d.fields_dict.body.$wrapper.find("tr[data-route]").on("click", function () {
						const route = $(this).data("route");
						if (route) frappe.set_route(route);
					});
				} catch (e) {
					d.fields_dict.body.$wrapper.html(
						`<div class="text-danger" style="padding:20px">${__("Could not load drill-down")}</div>`,
					);
				}
			}

			_drilldown_table_html(rows, columns) {
				const safe = (v) =>
					frappe.utils?.escape_html ? frappe.utils.escape_html(String(v ?? "")) : String(v ?? "");
				const th = columns
					.map(
						(c) =>
							`<th style="font-size:12px;font-weight:600;padding:8px;border-bottom:1px solid var(--border-color)">${safe(c.label)}</th>`,
					)
					.join("");
				const body = rows
					.map((row) => {
						const route = this._row_route(row);
						const attrs = route ? ` class="tif-drill-row" data-route='${JSON.stringify(route)}' style="cursor:pointer"` : "";
						const tds = columns
							.map((c) => {
								let val = row[c.key];
								if (c.format === "Date" && val) {
									val = frappe.datetime.str_to_user(val);
								} else if (c.format === "Float") {
									val = this._plain_formatted(val, "Float");
								} else if (c.format === "Int") {
									val = this._plain_formatted(val, "Int");
								}
								const align = c.format === "Float" || c.format === "Int" ? "right" : "left";
								return `<td style="padding:8px;text-align:${align}">${safe(val ?? "—")}</td>`;
							})
							.join("");
						return `<tr${attrs}>${tds}</tr>`;
					})
					.join("");
				return `<div style="max-height:420px;overflow:auto"><table class="table table-bordered" style="width:100%;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
			}

			_row_route(row) {
				if (row.employee_id) return ["Form", "Employee", row.employee_id];
				if (row.attendance_id) return ["Form", "Employee Attendance", row.attendance_id];
				if (row.leave_application) return ["Form", "Leave Application", row.leave_application];
				return null;
			}

			render_charts(data) {
				const mode = this._apexMode();
				const donutOpts = {
					chart: this._chartAnim({ type: "donut", height: 300, toolbar: { show: false } }),
					theme: { mode },
					colors: TIF_HR_PALETTE.donut,
					stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
					tooltip: { theme: mode, style: { fontSize: "12px" } },
					plotOptions: {
						pie: {
							donut: {
								size: "62%",
								labels: { show: true, name: { fontSize: "12px" }, value: { fontSize: "13px", fontWeight: 600 } },
							},
						},
					},
				};

				{
					const d = data.hiring_attrition_trend || {};
					const chart = this.ensure_chart("hire_attr", "#tif-attdash-hire-attr", {
						chart: this._chartAnim({ type: "line", height: 300, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.hires,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No workforce movement in range" },
						stroke: { width: 3, curve: "smooth" },
						markers: { size: 4, strokeWidth: 2, hover: { size: 6 } },
						xaxis: { categories: d.labels || [] },
						series: d.series || [],
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
						yaxis: { labels: { formatter: (v) => (Number.isFinite(v) ? String(Math.round(v)) : "") } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries(d.series || [], true);
					}
				}

				{
					const d = data.headcount_by_employment_type || {};
					const chart = this.ensure_chart("emp_type", "#tif-attdash-emp-type", {
						...donutOpts,
						noData: { text: "No employment type data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.headcount_by_gender || {};
					const chart = this.ensure_chart("wf_gender", "#tif-dash-wf-gender", {
						...donutOpts,
						noData: { text: "No gender data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.headcount_by_city || {};
					const chart = this.ensure_chart("wf_city", "#tif-dash-wf-city", {
						...donutOpts,
						noData: { text: "No city data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.headcount_by_grade || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("wf_grade", "#tif-dash-wf-grade", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(280, labels.length * 32),
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: ["#4f46e5"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No grades data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Employees", data: values }],
						dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Employees", data: values }], true);
					}
				}

				{
					const d = data.headcount_by_employee_branch || {};
					const labels = d.labels || [];
					const values = d.values || [];
					this._render_stacked_headcount_chart(
						"wf_ebr",
						"#tif-dash-wf-ebranch",
						data.headcount_by_branch_employment_type || { labels: [], series: [] },
						{ noData: "No branch data", height: Math.max(320, labels.length * 34) },
					);
					const branchRows = labels.map((label, idx) => ({
						branch: label,
						count: values[idx] || 0,
					}));
					this.render_table("#tif-dash-wf-branch-table", branchRows, [
						{ key: "branch", label: "Branch" },
						{ key: "count", label: "Employees", format: "Int" },
					]);
				}

				{
					const d = data.headcount_by_designation || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("wf_des", "#tif-dash-wf-desig", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(360, labels.length * 30),
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: ["#7c3aed"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No designation data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "70%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Employees", data: values }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Employees", data: values }], true);
					}
				}

				{
					const d = data.headcount_by_department || {};
					const labels = d.labels || [];
					this._render_stacked_headcount_chart(
						"wf_dep",
						"#tif-dash-wf-dept",
						data.headcount_by_department_employment_type || { labels: [], series: [] },
						{ noData: "No department data", height: Math.max(400, labels.length * 34) },
					);
				}

				{
					const d = data.monthly_attendance_trend || {};
					const labels = d.labels || [];
					const seriesList = d.series || [];
					const presentSeries = seriesList.find((s) => (s.name || "").toLowerCase().includes("present")) || {
						name: "Present Days",
						data: [],
					};
					const incidentSeries = seriesList.filter((s) => !(s.name || "").toLowerCase().includes("present"));

					const chP = this.ensure_chart("monthly_p", "#tif-attdash-monthly-present", {
						chart: this._chartAnim({ type: "area", height: 280, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.present,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No present-day data" },
						stroke: { width: 2, curve: "smooth" },
						fill: {
							type: "gradient",
							gradient: { shadeIntensity: 0.35, opacityFrom: 0.45, opacityTo: 0.05, stops: [0, 90, 100] },
						},
						xaxis: { categories: labels },
						series: [presentSeries],
						dataLabels: { enabled: false },
						legend: { show: false },
						yaxis: { labels: { formatter: (v) => (v % 1 === 0 ? String(v) : v.toFixed(1)) } },
					});
					if (chP) {
						chP.updateOptions({ xaxis: { categories: labels } }, false, true);
						chP.updateSeries([presentSeries], true);
					}

					const zeroPad = labels.map(() => 0);
					const incidentFallback = [
						{ name: "Absents", data: zeroPad },
						{ name: "Lates", data: zeroPad },
						{ name: "Half Days", data: zeroPad },
					];
					const chI = this.ensure_chart("monthly_i", "#tif-attdash-monthly-incidents", {
						chart: this._chartAnim({ type: "line", height: 280, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.incidents,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No incident rows (absents / lates / half days)" },
						stroke: { width: 2, curve: "smooth" },
						markers: { size: 4, strokeWidth: 2 },
						xaxis: { categories: labels },
						series: incidentSeries.length ? incidentSeries : incidentFallback,
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
						yaxis: { labels: { formatter: (v) => (v % 1 === 0 ? String(v) : v.toFixed(1)) }, min: 0 },
					});
					if (chI) {
						chI.updateOptions({ xaxis: { categories: labels } }, false, true);
						chI.updateSeries(incidentSeries.length ? incidentSeries : incidentFallback, true);
					}
				}

				{
					const d = data.punctuality_late_buckets || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const bucketCols = this._lateBucketColors(labels);
					const chart = this.ensure_chart("punct_bk", "#tif-attdash-punct-buckets", {
						chart: this._chartAnim({ type: "pie", height: 300, toolbar: { show: false } }),
						theme: { mode },
						colors: bucketCols,
						labels,
						series: values,
						stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
						tooltip: {
							theme: mode,
							fillSeriesColor: true,
							y: {
								formatter: (val) =>
									`${Number.isFinite(val) ? Math.round(val) : val} employees`,
							},
						},
						plotOptions: {
							pie: {
								expandOnClick: true,
								offsetY: 2,
							},
						},
						dataLabels: {
							enabled: true,
							dropShadow: { enabled: false },
							formatter: (val, opts) => {
								const s = opts?.w?.config?.series;
								const n = Array.isArray(s) ? s[opts.seriesIndex] : null;
								return Number.isFinite(n) ? String(Math.round(n)) : "";
							},
						},
						legend: { position: "bottom", fontWeight: 500 },
						noData: { text: "No employees / lates data in range" },
					});
					if (chart) {
						chart.updateOptions({ labels, colors: this._lateBucketColors(labels) }, false, true);
						chart.updateSeries(values, true);
					}
				}

				{
					const d = data.punctuality_incident_mix || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("punct_mix", "#tif-attdash-punct-mix", {
						chart: this._chartAnim({ type: "pie", height: 300, toolbar: { show: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.incidentMix,
						labels,
						series: values,
						stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
						tooltip: {
							theme: mode,
							fillSeriesColor: true,
							y: {
								formatter: (val) => {
									if (!Number.isFinite(val)) return "";
									const t = Math.round(val * 100) / 100;
									return t % 1 === 0 ? String(Math.round(t)) : t.toFixed(1);
								},
							},
						},
						plotOptions: {
							pie: {
								expandOnClick: true,
								offsetY: 2,
							},
						},
						dataLabels: {
							enabled: true,
							dropShadow: { enabled: false },
							formatter: (pct, opts) => {
								const s = opts?.w?.config?.series;
								const n = Array.isArray(s) ? s[opts.seriesIndex] : null;
								if (!Number.isFinite(n) || !Number.isFinite(pct)) return "";
								const t = Math.round(n * 100) / 100;
								const num = t % 1 === 0 ? String(Math.round(t)) : t.toFixed(1);
								return `${num} (${pct.toFixed(0)}%)`;
							},
						},
						legend: { position: "bottom", fontWeight: 500 },
						noData: { text: "No incident totals in range" },
					});
					if (chart) {
						chart.updateOptions({ labels, colors: TIF_HR_PALETTE.incidentMix }, false, true);
						chart.updateSeries(values, true);
					}
				}

				{
					const d = data.metrics_distribution || {};
					const chart = this.ensure_chart("dist", "#tif-attdash-dist", {
						...donutOpts,
						noData: { text: "No data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
						plotOptions: {
							pie: {
								donut: {
									size: "62%",
									labels: {
										show: true,
										name: { fontSize: "12px" },
										value: { fontSize: "13px", fontWeight: 600 },
										total: {
											show: true,
											label: "Σ metrics",
											fontWeight: 600,
										},
									},
								},
							},
						},
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.leave_status_breakdown || {};
					const chart = this.ensure_chart("leave_stat", "#tif-attdash-leave-status", {
						...donutOpts,
						noData: { text: "No leave applications in range" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.department_absents_lates || {};
					const labels = d.labels || [];
					const chart = this.ensure_chart("dept", "#tif-attdash-dept", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(320, labels.length * 28),
							stacked: false,
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: TIF_HR_PALETTE.deptPair,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No department data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "68%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [
							{ name: "Absents", data: d.absents || [] },
							{ name: "Lates", data: d.lates || [] },
						],
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries(
							[
								{ name: "Absents", data: d.absents || [] },
								{ name: "Lates", data: d.lates || [] },
							],
							true,
						);
					}
				}

				{
					const d = data.branch_breakdown || {};
					const chart = this.ensure_chart("branch", "#tif-attdash-branch", {
						chart: this._chartAnim({ type: "bar", height: 300, toolbar: { show: false } }),
						theme: { mode },
						colors: ["#0d9488"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No branch data" },
						plotOptions: { bar: { borderRadius: 6, columnWidth: "72%" } },
						xaxis: { categories: d.labels || [], labels: { rotate: -35, trim: false, style: { fontSize: "11px" } } },
						series: [{ name: "Present days", data: d.values || [] }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [], labels: { rotate: -35, trim: false } } }, false, true);
						chart.updateSeries([{ name: "Present days", data: d.values || [] }], true);
					}
				}

				{
					const d = data.leave_trend || {};
					const chart = this.ensure_chart("leave_tr", "#tif-attdash-leave-trend", {
						chart: this._chartAnim({ type: "line", height: 300, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: ["#2563eb", "#ca8a04"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No approved leave in range" },
						stroke: { width: 2, curve: "smooth" },
						markers: { size: 4, strokeWidth: 2 },
						xaxis: { categories: d.labels || [] },
						series: d.series || [],
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries(d.series || [], true);
					}
				}

				{
					const d = data.leaves_by_type || {};
					const chart = this.ensure_chart("leave_type", "#tif-attdash-leave-type", {
						...donutOpts,
						noData: { text: "No data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const rows = data.top_by_lates || [];
					const labels = rows.map((r) => r.employee_name || "—");
					const values = rows.map((r) => r.value || 0);
					const chart = this.ensure_chart("top_l", "#tif-attdash-top-lates", {
						chart: this._chartAnim({ type: "bar", height: Math.max(300, rows.length * 30), toolbar: { show: false } }),
						theme: { mode },
						colors: ["#ea580c"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Total lates", data: values }],
						dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Total lates", data: values }], true);
					}
				}

				{
					const rows = data.top_by_absents || [];
					const labels = rows.map((r) => r.employee_name || "—");
					const values = rows.map((r) => r.value || 0);
					const chart = this.ensure_chart("top_a", "#tif-attdash-top-abs", {
						chart: this._chartAnim({ type: "bar", height: Math.max(300, rows.length * 30), toolbar: { show: false } }),
						theme: { mode },
						colors: ["#dc2626"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Total absents", data: values }],
						dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Total absents", data: values }], true);
					}
				}

				this.render_table("#tif-attdash-cnic-expired", data.cnic_expired_employees || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "employee_id", label: "Employee ID" },
					{ key: "department", label: "Department" },
					{ key: "cnic_expiry", label: "CNIC expiry", format: "Date" },
				]);
				this.render_table("#tif-attdash-cnic-upcoming", data.cnic_upcoming_employees || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "employee_id", label: "Employee ID" },
					{ key: "department", label: "Department" },
					{ key: "cnic_expiry", label: "CNIC expiry", format: "Date" },
				]);
				this.render_table("#tif-attdash-city-branch", data.headcount_by_city_branch || [], [
					{ key: "city", label: "City" },
					{ key: "branch", label: "Branch" },
					{ key: "count", label: "Employees", format: "Int" },
				]);
				this.render_table("#tif-attdash-probation", data.probation_employees || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "employee_id", label: "Employee ID" },
					{ key: "department", label: "Department" },
					{ key: "probation_until", label: "Probation until", format: "Date" },
				]);
				this.render_table("#tif-attdash-table-lates", data.top_by_lates || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "department", label: "Department" },
					{ key: "value", label: "Σ Lates", format: "Float" },
				]);
				this.render_table("#tif-attdash-table-abs", data.top_by_absents || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "department", label: "Department" },
					{ key: "value", label: "Σ Absents", format: "Float" },
				]);
			}

			render_table(selector, rows, columns) {
				const container = this.page.main.find(selector)[0];
				if (!container) return;
				if (!rows || !rows.length) {
					container.innerHTML = `<div class="text-muted" style="padding:6px 2px">No data</div>`;
					return;
				}
				const safe = (v) =>
					frappe.utils?.escape_html ? frappe.utils.escape_html(String(v ?? "")) : String(v ?? "");
				const th = columns
					.map(
						(c) =>
							`<th style="font-size:12px;color:var(--text-muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--border-color)">${safe(c.label)}</th>`,
					)
					.join("");
				const td = (row) =>
					columns
						.map((c) => {
							let inner;
							let align = "left";
							if (c.format === "Float") {
								inner = this._plain_formatted(row?.[c.key], "Float");
								align = "right";
							} else if (c.format === "Int") {
								inner = this._plain_formatted(row?.[c.key], "Int");
								align = "right";
							} else if (c.format === "Date") {
								const dv = row?.[c.key];
								inner = dv
									? this._plain_formatted(dv, "Date")
									: "—";
								align = "right";
							} else {
								inner = safe(row?.[c.key] || "—");
							}
							return `<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);text-align:${align}">${inner}</td>`;
						})
						.join("");
				const body = rows.slice(0, 15).map((r) => `<tr>${td(r)}</tr>`).join("");
				container.innerHTML = `
					<div style="overflow:auto;max-height:320px">
						<table class="table table-bordered" style="margin:0;border:0;font-size:12px">
							<thead><tr>${th}</tr></thead>
							<tbody>${body}</tbody>
						</table>
					</div>
				`;
			}
		};
	}

	const view = new window.TIFAttendanceLeaveDashboard(page);
	view.make();
};
