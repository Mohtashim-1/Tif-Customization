import { computed, reactive } from "vue";
import { apiGet, apiPost, METHOD, LMS_METHOD } from "./lib/api";
import { formatClock as prettyClock } from "./lib/format";

export { formatClock } from "./lib/format";

const ICONS = {
	home: "M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z",
	book: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20",
	cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
	users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
	quiz: "M9 2h6v4H9zM7 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M8 12h8M8 16h5",
	award: "M12 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14M8.2 14.6 7 22l5-3 5 3-1.2-7.4",
	chart: "M3 3v18h18M7 16v-5M12 16V8M17 16v-9",
	bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9",
	gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
	user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
	file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
	layers: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
};

function uid(prefix) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function token() {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const QR_SECRET = "axis-qr-v1";

function toB64url(str) {
	return btoa(unescape(encodeURIComponent(str)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function fromB64url(str) {
	const pad = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
	return decodeURIComponent(escape(atob(pad)));
}

function checksum(body) {
	let h = 2166136261;
	const s = body + QR_SECRET;
	for (let i = 0; i < s.length; i++) h ^= s.charCodeAt(i), h = Math.imul(h, 16777619);
	return (h >>> 0).toString(16);
}

export function makeQrToken(session, exp = Date.now() + validityMs()) {
	const course = typeof courseById === "function" ? courseById(session.courseId) : null;
	const body = JSON.stringify({
		id: session.id,
		n: session.name,
		c: session.courseId,
		cn: course?.name || "",
		t: session.trainer,
		d: session.date,
		a: session.start,
		b: session.end,
		l: session.location,
		exp,
	});
	return `${toB64url(body)}.${checksum(body)}`;
}

export function parseQrToken(tok) {
	if (!tok) return null;
	const raw = String(tok);
	const i = raw.lastIndexOf(".");
	if (i > 0) {
		try {
			const body = fromB64url(raw.slice(0, i));
			if (checksum(body) === raw.slice(i + 1)) {
				if (body.startsWith("{")) {
					const payload = JSON.parse(body);
					if (payload?.id) {
						adoptQrSession(payload);
						return { sessionId: payload.id, exp: Number(payload.exp) || 0 };
					}
				}
				const [sessionId, expStr] = body.split("|");
				if (sessionId) return { sessionId, exp: Number(expStr) || 0 };
			}
		} catch {
			/* fall through to legacy tokens */
		}
	}
	const legacy = state.sessions.find((s) => s.qrToken && s.qrToken === raw);
	if (legacy) return { sessionId: legacy.id, exp: legacy.qrExpiry || Date.now() + validityMs() };
	return null;
}

export function todayIso() {
	return new Date().toLocaleDateString("en-CA");
}

function slugId(prefix, name) {
	const slug = String(name || "other")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
	return `${prefix}-${slug || "other"}`;
}

const COVERS = ["teal", "navy", "amber", "rose", "green"];

function coverFor(name) {
	return COVERS[Math.abs(String(name || "").split("").reduce((n, c) => n + c.charCodeAt(0), 0)) % COVERS.length];
}

function mapErpStatus(status) {
	if (status === "in_progress") return "In progress";
	if (status === "completed") return "Closed";
	if (status === "upcoming") return "Scheduled";
	return status || "Scheduled";
}

function adoptQrSession(payload) {
	if (!state.sessions) return;
	if (payload.cn && payload.c && !courseById(payload.c)) {
		state.courses.unshift({
			id: payload.c,
			name: payload.cn,
			code: payload.c.replace(/^c-/, "").toUpperCase().slice(0, 12),
			category: "Training",
			description: payload.cn,
			image: coverFor(payload.cn),
			trainer: payload.t || "",
			duration: "",
			start: payload.d || "",
			end: payload.d || "",
			status: "Active",
			venue: payload.l || "",
			max: 0,
			passing: state.settings.passingPercentage,
			sessionsCount: 1,
		});
	}
	if (!sessionById(payload.id)) {
		state.sessions.unshift({
			id: payload.id,
			courseId: payload.c,
			name: payload.n,
			trainer: payload.t,
			date: payload.d,
			start: payload.a,
			end: payload.b,
			location: payload.l,
			status: "Attendance open",
			qrActive: true,
			qrToken: "",
			qrExpiry: Number(payload.exp) || 0,
			expected: 0,
			presentErp: 0,
		});
	}
}

function nowIso() {
	return new Date().toISOString();
}

function clock() {
	return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const ROLES = [
	{ id: "super", label: "Super Admin", email: "root@theilmfoundation.cloud", name: "Nadia Qureshi" },
	{ id: "admin", label: "Organization Admin", email: "admin@theilmfoundation.cloud", name: "Imran Baig" },
	{ id: "coordinator", label: "Course Coordinator", email: "coord@theilmfoundation.cloud", name: "Farah Malik" },
	{ id: "trainer", label: "Trainer", email: "j.smith@theilmfoundation.cloud", name: "John Smith" },
	{ id: "student", label: "Student", email: "ahmed.ali@example.pk", name: "Ahmed Ali" },
];

function seed() {
	return {
		orgName: "The ILM Foundation",
		settings: {
			passingPercentage: 70,
			qrValidity: "15 minutes",
			autoIssueCertificate: true,
			requireAttendance: true,
			requireQuiz: true,
		},
		courses: [
			{
				id: "c-h2s",
				name: "Basic H2S Training",
				code: "H2S-001",
				category: "HSE",
				description:
					"Identify hydrogen sulphide hazards, use detection equipment, and complete emergency escape drills.",
				image: "teal",
				trainer: "John Smith",
				duration: "1 Day",
				start: "2026-09-22",
				end: "2026-09-22",
				status: "Active",
				venue: "Karachi Training Centre · Hall B",
				max: 30,
				passing: 70,
				sessionsCount: 4,
			},
			{
				id: "c-cse",
				name: "Confined Space Entry",
				code: "CSE-204",
				category: "HSE",
				description: "Permit-to-work, atmospheric testing, and rescue planning for confined spaces.",
				image: "navy",
				trainer: "Hina Shah",
				duration: "2 Days",
				start: "2026-09-20",
				end: "2026-09-21",
				status: "Active",
				venue: "Port Qasim Site",
				max: 24,
				passing: 75,
				sessionsCount: 4,
			},
			{
				id: "c-fir",
				name: "Fire Warden & Evacuation",
				code: "FIR-110",
				category: "Emergency",
				description: "Warden duties, extinguisher classes, and building evacuation leadership.",
				image: "amber",
				trainer: "Bilal Ahmad",
				duration: "1 Day",
				start: "2026-09-22",
				end: "2026-09-22",
				status: "Active",
				venue: "ILM Foundation Auditorium",
				max: 22,
				passing: 70,
				sessionsCount: 3,
			},
			{
				id: "c-fac",
				name: "First Aid & CPR Level 2",
				code: "FAC-118",
				category: "Medical",
				description: "Scene survey, CPR, AED, and bleeding control for workplace first responders.",
				image: "rose",
				trainer: "Ayesha Siddiqui",
				duration: "2 Days",
				start: "2026-09-18",
				end: "2026-09-19",
				status: "Active",
				venue: "Clinic Lab 2",
				max: 18,
				passing: 80,
				sessionsCount: 4,
			},
			{
				id: "c-hlt",
				name: "Infection Control Essentials",
				code: "HLT-330",
				category: "Healthcare",
				description: "Hand hygiene, PPE sequence, and isolation precautions for clinical staff.",
				image: "green",
				trainer: "Sara Khan",
				duration: "Half day",
				start: "2026-09-22",
				end: "2026-09-22",
				status: "Closed",
				venue: "City Hospital Wing C",
				max: 16,
				passing: 70,
				sessionsCount: 2,
			},
		],
		sessions: [
			{
				id: "s-h2s-3",
				courseId: "c-h2s",
				name: "Session 3 — Practical Training",
				trainer: "John Smith",
				date: "2026-09-22",
				start: "10:00",
				end: "12:30",
				location: "Hall B · Yard",
				status: "Scheduled",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 30,
			},
			{
				id: "s-cse-1",
				courseId: "c-cse",
				name: "Session 1 — Entry Permits",
				trainer: "Hina Shah",
				date: "2026-09-22",
				start: "11:00",
				end: "13:00",
				location: "Port Qasim",
				status: "In progress",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 24,
			},
			{
				id: "s-fir-2",
				courseId: "c-fir",
				name: "Session 2 — Evacuation Drill",
				trainer: "Bilal Ahmad",
				date: "2026-09-22",
				start: "14:00",
				end: "16:00",
				location: "HQ Auditorium",
				status: "Scheduled",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 22,
			},
			{
				id: "s-fac-4",
				courseId: "c-fac",
				name: "Session 4 — Assessment",
				trainer: "Ayesha Siddiqui",
				date: "2026-09-22",
				start: "15:30",
				end: "17:00",
				location: "Clinic Lab 2",
				status: "Scheduled",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 18,
			},
			{
				id: "s-hlt-2",
				courseId: "c-hlt",
				name: "Session 2 — Hand Hygiene",
				trainer: "Sara Khan",
				date: "2026-09-22",
				start: "09:00",
				end: "10:30",
				location: "City Hospital",
				status: "Closed",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 16,
			},
			{
				id: "s-h2s-1",
				courseId: "c-h2s",
				name: "Session 1 — Introduction",
				trainer: "John Smith",
				date: "2026-09-22",
				start: "08:00",
				end: "09:15",
				location: "Hall B",
				status: "Closed",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 30,
			},
			{
				id: "s-h2s-2",
				courseId: "c-h2s",
				name: "Session 2 — Safety Procedures",
				trainer: "John Smith",
				date: "2026-09-22",
				start: "09:20",
				end: "09:55",
				location: "Hall B",
				status: "Closed",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 30,
			},
			{
				id: "s-h2s-4",
				courseId: "c-h2s",
				name: "Session 4 — Assessment",
				trainer: "John Smith",
				date: "2026-09-22",
				start: "13:30",
				end: "15:00",
				location: "Hall B",
				status: "Scheduled",
				qrActive: false,
				qrToken: "",
				qrExpiry: 0,
				expected: 30,
			},
		],
		students: [],
		enrollments: [],
		attendance: [],
		modules: [
			{ id: "m1", courseId: "c-h2s", title: "Module 1 · Introduction", lessons: ["What is H2S", "Exposure limits"] },
			{ id: "m2", courseId: "c-h2s", title: "Module 2 · Safety Procedures", lessons: ["Detection equipment", "Buddy system"] },
			{ id: "m3", courseId: "c-h2s", title: "Module 3 · Emergency Response", lessons: ["Escape sets", "Muster points"] },
			{ id: "m4", courseId: "c-h2s", title: "Module 4 · Final Assessment", lessons: ["Scenario drill", "Written quiz"] },
			{ id: "m5", courseId: "c-cse", title: "Module 1 · Permits", lessons: ["Entry permits", "Atmospheric testing"] },
			{ id: "m6", courseId: "c-hlt", title: "Module 1 · Hygiene", lessons: ["Hand hygiene", "PPE sequence"] },
		],
		quizzes: [],
		attempts: [],
		certificates: [],
		templates: [
			{ id: "t1", name: "ILM Foundation Classic", status: "Default", courses: 4 },
			{ id: "t2", name: "HSE Compact", status: "Active", courses: 2 },
		],
		notifications: [],
		audit: [],
	};
}

export const state = reactive({
	screen: "login",
	nav: "dashboard",
	roleId: "admin",
	toast: "",
	selectedCourseId: "c-h2s",
	selectedSessionId: "s-h2s-3",
	selectedStudentId: "",
	selectedCertId: "",
	selectedQuizId: "",
	quiz: null,
	checkinToken: "",
	checkinPhone: "",
	checkinStudentId: "",
	checkinError: "",
	checkinResolving: false,
	checkinGate: "",
	quizIndex: 0,
	quizAnswers: {},
	quizStarted: false,
	lastResult: null,
	reportTab: "attendance",
	studentTab: "overview",
	liveTick: 0,
	headerSearch: "",
	lessonTitle: "",
	backStack: [],
	docLoading: false,
	displayName: "",
	userEmail: "",
	...seed(),
	trainers: [],
	catalogLoading: false,
	catalogError: "",
	catalogReady: false,
});

export const role = computed(() => {
	const base = ROLES.find((r) => r.id === state.roleId) || ROLES.find((r) => r.id === "admin");
	const student = state.checkinStudentId ? studentById(state.checkinStudentId) : null;
	const name = state.displayName || student?.name || (window.training_lms_boot?.full_name || "") || base.name;
	const email = state.userEmail || student?.phone || student?.email || window.training_lms_boot?.user || base.email;
	return { ...base, name, email };
});
export const isStudent = computed(() => state.roleId === "student");
export const isTrainer = computed(() => state.roleId === "trainer");
export const isAdmin = computed(() => ["super", "admin", "coordinator"].includes(state.roleId));

export function go(screen, nav, opts = {}) {
	if (opts.root) state.backStack = [];
	state.screen = screen;
	if (nav) state.nav = nav;
	state.checkinError = "";
	persistUi();
	syncPath();
}

const DETAIL_SCREENS = new Set([
	"student_profile",
	"course_detail",
	"course_create",
	"quiz_edit",
	"session_detail",
	"session_create",
	"qr_screen",
	"cert_view",
	"lms_course",
	"lms_lesson",
	"quiz_start",
	"quiz_attempt",
	"quiz_result",
]);

function navSnapshot() {
	return {
		screen: state.screen,
		nav: state.nav,
		selectedCourseId: state.selectedCourseId,
		selectedSessionId: state.selectedSessionId,
		selectedStudentId: state.selectedStudentId,
		selectedCertId: state.selectedCertId,
		selectedQuizId: state.selectedQuizId,
		studentTab: state.studentTab,
	};
}

export function openDoc(screen, nav, assign = {}) {
	const cur = navSnapshot();
	if (cur.screen && cur.screen !== screen && cur.screen !== "login") {
		state.backStack.push(cur);
	}
	Object.assign(state, assign);
	state.docLoading = true;
	go(screen, nav);
	window.setTimeout(() => {
		state.docLoading = false;
	}, 450);
}

export function goBack() {
	const prev = state.backStack.pop();
	if (prev) {
		state.docLoading = true;
		state.screen = prev.screen;
		state.nav = prev.nav;
		state.selectedCourseId = prev.selectedCourseId;
		state.selectedSessionId = prev.selectedSessionId;
		state.selectedStudentId = prev.selectedStudentId;
		state.selectedCertId = prev.selectedCertId;
		state.selectedQuizId = prev.selectedQuizId;
		state.studentTab = prev.studentTab || "overview";
		syncPath();
		window.setTimeout(() => {
			state.docLoading = false;
		}, 280);
		return;
	}
	const fallback = {
		student_profile: ["students", "students"],
		course_detail: ["courses", "courses"],
		course_create: ["courses", "courses"],
		quiz_edit: ["course_detail", "courses"],
		session_detail: ["sessions", "sessions"],
		session_create: ["sessions", "sessions"],
		qr_screen: ["session_detail", "sessions"],
		cert_view: ["report_cert", "certs"],
		lms_course: ["courses", "courses"],
		lms_lesson: ["lms_course", "courses"],
		quiz_start: ["lms_course", "courses"],
		quiz_attempt: ["quiz_start", "courses"],
		quiz_result: ["lms_course", "courses"],
	}[state.screen];
	if (fallback) go(fallback[0], fallback[1]);
}

export const canBack = computed(() => state.backStack.length > 0 || DETAIL_SCREENS.has(state.screen));

const UI_KEY = "tif_lms_ui";

export function persistUi() {
	try {
		const payload = JSON.stringify({
			roleId: state.roleId,
			checkinStudentId: state.checkinStudentId,
			selectedCourseId: state.selectedCourseId,
			selectedSessionId: state.selectedSessionId,
			selectedStudentId: state.selectedStudentId,
			displayName: state.displayName,
			userEmail: state.userEmail,
		});
		sessionStorage.setItem(UI_KEY, payload);
		localStorage.setItem(UI_KEY, payload);
	} catch {
		/* ignore */
	}
}

export function restoreUi() {
	try {
		const raw = sessionStorage.getItem(UI_KEY) || localStorage.getItem(UI_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw);
		if (saved.checkinStudentId) state.checkinStudentId = saved.checkinStudentId;
		if (saved.selectedCourseId) state.selectedCourseId = saved.selectedCourseId;
		if (saved.selectedSessionId) state.selectedSessionId = saved.selectedSessionId;
		if (saved.selectedStudentId) state.selectedStudentId = saved.selectedStudentId;
		if (saved.displayName) state.displayName = saved.displayName;
		if (saved.userEmail) state.userEmail = saved.userEmail;
		const path = window.location.pathname || "";
		if (saved.roleId && !/\/login$/.test(path) && !path.endsWith("/training-lms") && path !== "/training-lms/") {
			state.roleId = saved.roleId;
		}
	} catch {
		/* ignore */
	}
}

export async function activateQuizForSession(session) {
	if (!session) {
		toast("Open a session first.");
		return false;
	}
	state.selectedCourseId = session.courseId;
	await loadQuizzes();
	const qz = quizForCourse(session.courseId);
	if (!qz) {
		toast("Set up a quiz on this program first (Courses → program → Create quiz).");
		go("course_detail", "courses");
		return false;
	}
	qz.published = 1;
	session.quizLive = true;
	state.quiz = qz;
	try {
		const saved = await apiPost(`${LMS_METHOD}.activate_quiz`, {
			course_id: session.courseId,
			session_name: session.id,
		});
		if (saved?.id) {
			const idx = state.quizzes.findIndex((q) => q.id === saved.id);
			if (idx >= 0) state.quizzes[idx] = { ...state.quizzes[idx], ...saved, published: 1 };
			else state.quizzes.unshift({ ...saved, published: 1 });
			state.quiz = { ...saved, published: 1 };
		}
	} catch {
		try {
			const saved = await apiPost(`${LMS_METHOD}.save_quiz`, {
				payload: JSON.stringify({ ...qz, published: 1 }),
			});
			if (saved?.id) {
				const idx = state.quizzes.findIndex((q) => q.id === saved.id);
				if (idx >= 0) state.quizzes[idx] = { ...state.quizzes[idx], ...saved, published: 1 };
				else state.quizzes.unshift({ ...saved, published: 1 });
			}
		} catch {
			/* still live in this browser for the current session */
		}
	}
	persistUi();
	toast("Quiz is live for students. They start it from Continue to Course — this screen stays on the session.");
	return true;
}

export function homeFor(roleId) {
	if (roleId === "student") return "student_dash";
	if (roleId === "trainer") return "trainer_dash";
	return "admin_dash";
}

export function signIn() {
	loadCatalog();
	go(homeFor(state.roleId), "dashboard", { root: true });
}

export async function portalSignIn(usr, pwd) {
	const ident = String(usr || "").trim();
	const password = String(pwd || "").trim();
	if (!ident || !password) {
		toast("Enter your mobile number or email, and password.");
		throw new Error("Enter your mobile number or email, and password.");
	}
	let sess;
	try {
		sess = await apiPost(`${LMS_METHOD}.portal_login`, { usr: ident, pwd: password });
	} catch (e) {
		const msg = e.message || "";
		if (/csrf|forbidden|403/i.test(msg)) {
			sess = await apiGet(`${LMS_METHOD}.portal_login`, { usr: ident, pwd: password });
		} else {
			toast(msg || "Could not sign in.");
			throw e;
		}
	}
	applyPortalSession(sess);
	await loadCatalog();
	go(homeFor(state.roleId), "dashboard", { root: true });
	return sess;
}

export function applyPortalSession(sess) {
	if (!sess?.ok || !sess.role) return;
	state.roleId = sess.role;
	state.displayName = sess.full_name || "";
	state.userEmail = sess.email || "";
	if (sess.csrf_token) {
		window.training_lms_boot = window.training_lms_boot || {};
		window.training_lms_boot.csrf_token = sess.csrf_token;
		window.training_lms_boot.user = sess.user || window.training_lms_boot.user;
		window.training_lms_boot.full_name = sess.full_name || window.training_lms_boot.full_name;
		window.training_lms_boot.role = sess.role;
		window.csrf_token = sess.csrf_token;
	}
	if (sess.student) {
		adoptLocalStudent(sess.student);
		state.checkinStudentId = sess.student.id;
		state.roleId = "student";
		state.displayName = sess.student.name || state.displayName;
		state.userEmail = sess.student.phone || sess.student.email || state.userEmail;
	} else if (sess.kind === "staff" && sess.role !== "student") {
		state.checkinStudentId = "";
	}
	persistUi();
}

export function adoptLocalStudent(saved) {
	if (!saved?.id) return null;
	const local = {
		id: saved.id,
		name: saved.name,
		phone: saved.phone,
		email: saved.email,
		cnic: saved.cnic,
		org: saved.org,
		designation: saved.designation,
		employeeId: saved.employeeId,
		gender: saved.gender,
		status: saved.status,
		registered: saved.registered,
	};
	const idx = state.students.findIndex(
		(s) => s.id === local.id || (local.phone && normalizePhone(s.phone) === normalizePhone(local.phone))
	);
	if (idx >= 0) state.students[idx] = { ...state.students[idx], ...local };
	else state.students.unshift(local);
	for (const e of saved.enrollments || []) {
		if (!state.enrollments.find((x) => x.studentId === e.studentId && x.courseId === e.courseId)) {
			state.enrollments.push(e);
		}
	}
	return local;
}

export async function bootSession() {
	restoreUi();
	const path = window.location.pathname || "";
	if (/attendance\/check-in/.test(path)) return;
	const boot = window.training_lms_boot || {};
	if (boot.user && boot.user !== "Guest") {
		try {
			const sess = await apiGet(`${LMS_METHOD}.portal_session`);
			if (sess?.ok) applyPortalSession(sess);
			else if (boot.role) {
				state.roleId = boot.role;
				state.displayName = boot.full_name || "";
				state.userEmail = boot.user || "";
			}
		} catch {
			if (boot.role) {
				state.roleId = boot.role;
				state.displayName = boot.full_name || "";
				state.userEmail = boot.user || "";
			}
		}
		if (state.screen === "login") go(homeFor(state.roleId), "dashboard", { root: true });
		persistUi();
	}
}

export function switchRole(id) {
	state.roleId = id;
	go(homeFor(id), "dashboard", { root: true });
}

export async function signOut() {
	try {
		await apiPost(`${LMS_METHOD}.portal_logout`);
	} catch {
		try {
			await apiGet("logout");
		} catch {
			/* ignore */
		}
	}
	state.roleId = "admin";
	state.checkinStudentId = "";
	state.displayName = "";
	state.userEmail = "";
	window.training_lms_boot = window.training_lms_boot || {};
	window.training_lms_boot.user = "Guest";
	window.training_lms_boot.role = "";
	window.training_lms_boot.full_name = "";
	try {
		sessionStorage.removeItem(UI_KEY);
		localStorage.removeItem(UI_KEY);
	} catch {
		/* ignore */
	}
	go("login");
}

export function navItems() {
	if (state.roleId === "student") {
		return [
			{ label: "Dashboard", key: "dashboard", screen: "student_dash", d: ICONS.home },
			{ label: "My courses", key: "courses", screen: "courses", d: ICONS.book },
			{ label: "My certificates", key: "certs", screen: "my_certs", d: ICONS.award },
			{ label: "Notifications", key: "notifications", screen: "notifications", d: ICONS.bell },
			{ label: "Profile", key: "profile", screen: "profile", d: ICONS.user },
		];
	}
	if (state.roleId === "trainer") {
		return [
			{ label: "Dashboard", key: "dashboard", screen: "trainer_dash", d: ICONS.home },
			{ label: "My sessions", key: "sessions", screen: "sessions", d: ICONS.cal },
			{ label: "Courses", key: "courses", screen: "courses", d: ICONS.book },
			{ label: "Trainers", key: "trainers", screen: "trainers", d: ICONS.users },
			{ label: "Students", key: "students", screen: "students", d: ICONS.users },
			{ label: "Quiz results", key: "reports", screen: "report_quiz", d: ICONS.quiz },
			{ label: "Certificates", key: "certs", screen: "report_cert", d: ICONS.award },
			{ label: "Notifications", key: "notifications", screen: "notifications", d: ICONS.bell },
			{ label: "Profile", key: "profile", screen: "profile", d: ICONS.user },
		];
	}
	return [
		{ label: "Dashboard", key: "dashboard", screen: "admin_dash", d: ICONS.home },
		{ label: "Courses", key: "courses", screen: "courses", d: ICONS.book },
		{ label: "Trainers", key: "trainers", screen: "trainers", d: ICONS.users },
		{ label: "Sessions", key: "sessions", screen: "sessions", d: ICONS.cal },
		{ label: "Students", key: "students", screen: "students", d: ICONS.users },
		{ label: "Reports", key: "reports", screen: "report_attendance", d: ICONS.chart },
		{ label: "Certificates", key: "certs", screen: "report_cert", d: ICONS.award },
		{ label: "Templates", key: "templates", screen: "cert_templates", d: ICONS.layers },
		{ label: "Notifications", key: "notifications", screen: "notifications", d: ICONS.bell },
		{ label: "Audit logs", key: "audit", screen: "audit_logs", d: ICONS.file },
		{ label: "Settings", key: "settings", screen: "settings", d: ICONS.gear },
	];
}

export function courseById(id) {
	if (!id) return undefined;
	const key = String(id);
	return (
		state.courses.find((c) => c.id === key) ||
		state.courses.find((c) => c.name === key) ||
		state.courses.find((c) => c.code === key) ||
		state.courses.find((c) => String(c.name).toLowerCase() === key.toLowerCase())
	);
}
export function sessionById(id) {
	if (!id) return undefined;
	const key = String(id);
	return state.sessions.find((s) => s.id === key) || state.sessions.find((s) => s.name === key);
}
export function studentById(id) {
	if (!id) return undefined;
	let key = String(id);
	try {
		key = decodeURIComponent(key);
	} catch {
		/* keep */
	}
	return state.students.find((s) => s.id === key || s.id === id);
}
export function studentByPhone(phone) {
	const p = normalizePhone(phone);
	return state.students.find((s) => normalizePhone(s.phone) === p);
}

export function applyCatalog(programRows = [], trainerRows = [], sessionRows = []) {
	const openQr = {};
	for (const s of state.sessions) {
		if (s.qrActive || s.quizLive) {
			openQr[s.id] = {
				qrActive: s.qrActive,
				qrToken: s.qrToken,
				qrExpiry: s.qrExpiry,
				status: s.status,
				quizLive: s.quizLive,
			};
		}
	}

	const courses = programRows.map((p) => {
		const related = sessionRows.filter((s) => (s.program || s.title) === p.name);
		const trainers = [...new Set(related.map((s) => s.trainerName).filter(Boolean))];
		const dates = related.map((s) => s.date).filter(Boolean).sort();
		return {
			id: slugId("c", p.name),
			name: p.name,
			code: slugId("c", p.name).replace(/^c-/, "").toUpperCase().slice(0, 16),
			category: String(p.types || "Training").split(",")[0].trim() || "Training",
			description: `${p.sessions || related.length} scheduled session(s) · ${p.trainers || trainers.length} trainer(s)`,
			image: coverFor(p.name),
			trainer: trainers[0] || "",
			duration: "",
			start: dates[0] || "",
			end: dates[dates.length - 1] || "",
			status: "Active",
			venue: "",
			max: 0,
			passing: state.settings.passingPercentage,
			sessionsCount: p.sessions || related.length,
		};
	});

	for (const s of sessionRows) {
		const key = s.program || s.title;
		if (key && !courses.find((c) => c.name === key)) {
			courses.push({
				id: slugId("c", key),
				name: key,
				code: slugId("c", key).replace(/^c-/, "").toUpperCase().slice(0, 16),
				category: s.type || "Training",
				description: s.title || key,
				image: coverFor(key),
				trainer: s.trainerName || "",
				duration: "",
				start: s.date || "",
				end: s.date || "",
				status: "Active",
				venue: s.room || "",
				max: 0,
				passing: state.settings.passingPercentage,
				sessionsCount: 1,
			});
		}
	}

	state.courses = courses;
	state.sessions = sessionRows.map((s) => {
		const courseName = s.program || s.title;
		const prev = openQr[s.name];
		return {
			id: s.name,
			courseId: slugId("c", courseName),
			name: s.title || s.name,
			trainer: s.trainerName,
			date: s.date,
			start: s.start_time || "",
			end: s.end_time || "",
			location: s.room || "",
			status: prev?.status || mapErpStatus(s.status),
			qrActive: prev?.qrActive || false,
			qrToken: prev?.qrToken || "",
			qrExpiry: prev?.qrExpiry || 0,
			quizLive: prev?.quizLive || false,
			expected: s.attendance_total || 0,
			presentErp: s.attendance_present || 0,
			erpStatus: s.status,
		};
	});
	state.trainers = trainerRows.map((t) => ({
		name: t.name,
		initials: t.initials,
		color: t.color,
		sessions: t.sessions,
		upcoming: t.upcoming || 0,
		completed: t.completed || 0,
	}));
	if (courses[0] && !courseById(state.selectedCourseId)) state.selectedCourseId = courses[0].id;
	if (state.sessions[0] && !sessionById(state.selectedSessionId)) state.selectedSessionId = state.sessions[0].id;
	state.catalogReady = true;
}

export async function loadCatalog() {
	restoreUi();
	state.catalogLoading = true;
	try {
		try {
			const [programs, trainers, sessions] = await Promise.all([
				apiGet(`${METHOD}.get_directory`, { view: "programs" }),
				apiGet(`${METHOD}.get_directory`, { view: "trainers" }),
				apiGet(`${METHOD}.get_directory`, { view: "sessions" }),
			]);
			applyCatalog(programs?.rows || [], trainers?.rows || [], sessions?.rows || []);
			state.catalogError = "";
		} catch (e) {
			if (window.training_lms_boot?.user && window.training_lms_boot.user !== "Guest") {
				state.catalogError = e.message || String(e);
			}
		}
		await Promise.all([loadQuizzes(), loadAttempts(), loadStudents(), loadCertificates()]);
		await loadSavedAttendance();
	} catch (e) {
		if (!state.catalogError) state.catalogError = e.message || String(e);
	} finally {
		state.catalogLoading = false;
	}
}

export function normalizePhone(v) {
	return String(v || "").replace(/\D/g, "").slice(-11);
}

export function findDuplicate({ phone, email, cnic }) {
	return (
		state.students.find((s) => phone && normalizePhone(s.phone) === normalizePhone(phone)) ||
		state.students.find((s) => email && s.email?.toLowerCase() === String(email).toLowerCase()) ||
		state.students.find((s) => cnic && s.cnic === cnic) ||
		null
	);
}

export function sessionAttendance(sessionId) {
	return state.attendance.filter((a) => a.sessionId === sessionId);
}

export function presentCount(sessionId) {
	const local = sessionAttendance(sessionId).filter((a) => a.status === "Present" || a.status === "Late").length;
	const s = sessionById(sessionId);
	return Math.max(local, Number(s?.presentErp) || 0);
}

export function mergeServerCheckins(sessionId, rows = []) {
	if (!sessionId || !Array.isArray(rows) || !rows.length) return;
	const session = sessionById(sessionId);
	for (const row of rows) {
		const phone = normalizePhone(row.phone);
		let student = (phone && studentByPhone(phone)) || state.students.find((s) => s.id === row.id);
		if (!student) {
			student = {
				id: row.id || uid("stu"),
				name: row.name || phone || "Student",
				phone: row.phone || "",
				email: row.email || "",
				status: "Active",
				registered: todayIso(),
			};
			state.students.unshift(student);
		}
		const already = state.attendance.find(
			(a) =>
				a.sessionId === sessionId &&
				(a.studentId === student.id || (phone && normalizePhone(studentById(a.studentId)?.phone) === phone))
		);
		const prettyTime = prettyClock(row.time || clock());
		if (already) {
			if (row.time) already.time = prettyTime;
			continue;
		}
		state.attendance.unshift({
			id: row.id || uid("att"),
			studentId: student.id,
			sessionId,
			courseId: session?.courseId,
			status: row.status || "Present",
			time: prettyTime,
			date: session?.date || todayIso(),
			device: row.device || "Phone QR",
			token: session?.qrToken,
		});
		if (session?.courseId) ensureEnrollment(student.id, session.courseId);
		if (row.email && !student.email) student.email = row.email;
	}
}

export function qrUrl(tokenValue) {
	const origin = window.location.origin;
	return `${origin}/training-lms/attendance/check-in/${tokenValue}`;
}

export function qrImage(tokenValue) {
	return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrUrl(tokenValue))}`;
}

export function validityMs() {
	const map = {
		"5 minutes": 5 * 60 * 1000,
		"10 minutes": 10 * 60 * 1000,
		"15 minutes": 15 * 60 * 1000,
		"30 minutes": 30 * 60 * 1000,
		"Entire session": 8 * 60 * 60 * 1000,
	};
	return map[state.settings.qrValidity] || 15 * 60 * 1000;
}

export async function startAttendance(sessionId) {
	const s = sessionById(sessionId);
	if (!s) return;
	s.qrExpiry = Date.now() + validityMs();
	s.qrActive = true;
	s.status = "Attendance open";
	state.selectedSessionId = sessionId;
	const course = courseById(s.courseId);
	try {
		const res = await apiPost(`${LMS_METHOD}.open_attendance`, {
			session_name: s.id,
			validity_ms: String(validityMs()),
			payload: JSON.stringify({
				id: s.id,
				n: s.name,
				c: s.courseId,
				cn: course?.name || "",
				t: s.trainer,
				d: s.date,
				a: s.start,
				b: s.end,
				l: s.location,
			}),
		});
		if (!res?.token) throw new Error("Server did not return a QR token.");
		s.qrToken = res.token;
		s.qrExpiry = res.exp || s.qrExpiry;
	} catch (e) {
		toast(e.message || "Could not start attendance. Stay signed in to ERP and try again.");
		s.qrActive = false;
		s.status = "Scheduled";
		return;
	}
	audit(role.value.name, "Started attendance QR", s.name);
	go("qr_screen", "sessions");
}

export async function closeAttendance(sessionId) {
	const s = sessionById(sessionId);
	if (!s) return;
	s.qrActive = false;
	s.status = "Closed";
	try {
		await apiPost(`${LMS_METHOD}.close_attendance`, { token: s.qrToken, session_name: s.id });
	} catch {
		/* local close still applies */
	}
	audit(role.value.name, "Closed attendance", s.name);
}

export async function resolveCheckin(tok) {
	const token = String(tok || state.checkinToken || "").trim();
	if (!token) {
		state.checkinResolving = false;
		state.checkinGate = "invalid";
		return "invalid";
	}
	state.checkinResolving = true;
	state.checkinGate = "loading";
	state.checkinToken = token;
	try {
		const res = await apiGet(`${LMS_METHOD}.resolve_attendance`, { token });
		if (res?.ok && res.id) {
			adoptQrSession({
				id: res.id,
				n: res.name,
				c: res.courseId,
				cn: res.courseName,
				t: res.trainer,
				d: res.date,
				a: res.start,
				b: res.end,
				l: res.location,
				exp: res.exp,
			});
			const s = sessionById(res.id);
			if (s) {
				s.qrActive = true;
				s.qrToken = token;
				s.qrExpiry = res.exp;
				s.status = "Attendance open";
			}
			if (Array.isArray(res.checkins)) mergeServerCheckins(res.id, res.checkins);
			state.checkinResolving = false;
			state.checkinGate = "ok";
			return "ok";
		}
		state.checkinResolving = false;
		state.checkinGate = res?.reason || "invalid";
		return state.checkinGate;
	} catch {
		state.checkinResolving = false;
		const parsed = parseQrToken(token);
		let status = parsed?.sessionId ? qrStatus(sessionById(parsed.sessionId), token) : "invalid";
		if (!status || status === "loading") status = "invalid";
		state.checkinGate = status;
		return state.checkinGate;
	}
}

export function sessionFromToken(tok) {
	const parsed = parseQrToken(tok);
	if (parsed?.sessionId) return sessionById(parsed.sessionId) || null;
	return state.sessions.find((s) => s.qrToken && s.qrToken === tok) || null;
}

export function qrStatus(session, tok) {
	if (state.checkinResolving || state.checkinGate === "loading") return "loading";
	if (state.checkinGate && state.checkinGate !== "ok" && tok && tok === state.checkinToken) {
		return state.checkinGate;
	}
	if (!session) return "invalid";
	if (tok && session.qrToken === tok) {
		if (session.qrExpiry && Date.now() > Number(session.qrExpiry)) return "expired";
		if (!session.qrActive) return "closed";
		return "ok";
	}
	const parsed = tok ? parseQrToken(tok) : null;
	const exp = parsed?.exp || session.qrExpiry;
	if (exp && Date.now() > Number(exp)) return "expired";
	if (parsed?.sessionId === session.id) return "ok";
	if (!session.qrActive) return "closed";
	return "ok";
}

export function markAttendance(studentId, session, status = "Present") {
	const exists = state.attendance.find((a) => a.studentId === studentId && a.sessionId === session.id);
	if (exists) return { ok: false, reason: "duplicate", record: exists };
	const student = studentById(studentId);
	const rec = {
		id: uid("att"),
		studentId,
		sessionId: session.id,
		courseId: session.courseId,
		status,
		time: clock(),
		date: session.date,
		token: session.qrToken,
		ip: "103.18.44." + Math.floor(Math.random() * 80),
		device: navigator.userAgent.slice(0, 42),
		manual: status === "Manually Marked",
	};
	state.attendance.unshift(rec);
	ensureEnrollment(studentId, session.courseId);
	audit("System", "Attendance created", student?.name || studentId);
	notify("Attendance confirmation", `${student?.name || "Student"} marked ${status.toLowerCase()}.`);
	const token = session.qrToken || state.checkinToken;
	if (token) {
		apiGet(`${LMS_METHOD}.mark_checkin`, {
			token,
			phone: student?.phone || "",
			student_name: student?.name || "",
			email: student?.email || "",
			device: rec.device,
		}).catch(() => {});
	}
	return { ok: true, record: rec };
}

export function ensureEnrollment(studentId, courseId) {
	if (!state.enrollments.find((e) => e.studentId === studentId && e.courseId === courseId)) {
		state.enrollments.push({ studentId, courseId, progress: 15, lessonsDone: 0 });
	}
}

export function nextStudentId() {
	const n = state.students.length + 1;
	return `STU-2026-${String(n).padStart(5, "0")}`;
}

export async function registerStudent(form, session) {
	const dup = findDuplicate(form);
	let student = dup;
	try {
		const saved = await persistStudent(form, {
			id: dup?.id || "",
			courseId: session?.courseId || "",
			courseName: courseById(session?.courseId)?.name || "",
		});
		if (saved) student = saved;
	} catch {
		/* fall back to local */
	}
	if (!student) {
		student = {
			id: nextStudentId(),
			name: form.name,
			phone: form.phone,
			email: form.email,
			cnic: form.cnic,
			org: form.org,
			designation: form.designation,
			employeeId: form.employeeId,
			gender: form.gender || "",
			status: "Active",
			registered: todayIso(),
		};
		state.students.unshift(student);
	}
	ensureEnrollment(student.id, session.courseId);
	const att = markAttendance(student.id, session);
	state.checkinStudentId = student.id;
	return { student, created: !dup, attendance: att };
}

export function currentStudent() {
	if (state.checkinStudentId) return studentById(state.checkinStudentId);
	return studentById(state.selectedStudentId);
}

export function enrollmentsFor(studentId) {
	const student = studentById(studentId);
	const phone = normalizePhone(student?.phone);
	const ids = new Set([studentId]);
	if (phone) {
		state.students.forEach((s) => {
			if (normalizePhone(s.phone) === phone) ids.add(s.id);
		});
	}
	const map = {};
	for (const e of state.enrollments) {
		if (ids.has(e.studentId))
			map[e.courseId] = {
				...e,
				studentId,
				course: courseById(e.courseId) || courseById(e.courseName),
			};
	}
	for (const a of state.attendance) {
		if (!ids.has(a.studentId) && !(phone && normalizePhone(studentById(a.studentId)?.phone) === phone)) continue;
		if (!a.courseId || map[a.courseId]) continue;
		map[a.courseId] = { studentId, courseId: a.courseId, progress: 15, lessonsDone: 0, course: courseById(a.courseId) };
	}
	return Object.values(map);
}

export function attendanceForStudent(studentId) {
	const student = studentById(studentId);
	const phone = normalizePhone(student?.phone);
	return state.attendance.filter((a) => {
		if (a.studentId === studentId) return true;
		if (phone && normalizePhone(studentById(a.studentId)?.phone) === phone) return true;
		return false;
	});
}

function courseMatchKeys(courseId) {
	const course = courseById(courseId);
	const raw = [courseId, course?.id, course?.name, course?.code];
	const keys = new Set();
	for (const v of raw) {
		if (!v) continue;
		const s = String(v).toLowerCase().trim();
		keys.add(s);
		keys.add(s.replace(/[^a-z0-9]+/g, ""));
		keys.add(slugId("c", v).toLowerCase());
	}
	return keys;
}

export function quizForCourse(courseId) {
	if (!courseId) return null;
	const names = courseMatchKeys(courseId);
	const match = (q) => {
		const keys = [q.courseId, q.courseName, q.id];
		return keys.some((k) => k && (names.has(String(k).toLowerCase()) || names.has(String(k).toLowerCase().replace(/[^a-z0-9]+/g, "")) || names.has(slugId("c", k).toLowerCase())));
	};
	return state.quizzes.find((q) => match(q) && q.published !== 0) || state.quizzes.find(match) || null;
}

export function quizzesForCourse(courseId) {
	if (!courseId) return [];
	const names = courseMatchKeys(courseId);
	return state.quizzes.filter((q) => {
		const keys = [q.courseId, q.courseName, q.id];
		return keys.some((k) => k && (names.has(String(k).toLowerCase()) || names.has(String(k).toLowerCase().replace(/[^a-z0-9]+/g, "")) || names.has(slugId("c", k).toLowerCase())));
	});
}

export function blankQuestion() {
	return { id: uid("q"), type: "mcq", text: "", options: ["Option A", "Option B", "Option C", "Option D"], answer: 0 };
}

export function openQuizEditor(existing) {
	const course = courseById(state.selectedCourseId);
	state.quiz = existing
		? {
				...existing,
				questions: (existing.questions || []).map((q) => ({
					...q,
					options: [...(q.options || [])],
					answer: Array.isArray(q.answer) ? [...q.answer] : q.answer,
				})),
			}
		: {
				id: "",
				courseId: state.selectedCourseId,
				courseName: course?.name || "",
				name: `${course?.name || "Program"} · Final Assessment`,
				passing: course?.passing || 70,
				duration: 30,
				maxAttempts: 2,
				randomize: 0,
				published: 1,
				questions: [blankQuestion()],
			};
	state.selectedQuizId = state.quiz.id || "";
	openDoc("quiz_edit", "courses");
}

export function addQuestion() {
	if (!state.quiz) return;
	if (!state.quiz.questions) state.quiz.questions = [];
	state.quiz.questions.push(blankQuestion());
}

export function removeQuestion(idx) {
	if (!state.quiz?.questions) return;
	state.quiz.questions.splice(idx, 1);
}

export async function loadQuizzes() {
	try {
		const res = await apiGet(`${LMS_METHOD}.list_quizzes`);
		const rows = (res?.rows || []).map((q) => ({
			...q,
			maxAttempts: q.maxAttempts ?? q.max_attempts ?? 2,
			published: q.published === 0 ? 0 : 1,
		}));
		if (!rows.length && state.quizzes.length) return;
		state.quizzes = rows;
		if (state.selectedCourseId) {
			const current = quizForCourse(state.selectedCourseId);
			if (current && state.screen !== "quiz_edit") state.quiz = current;
		}
	} catch {
		/* keep local list */
	}
}

export async function loadAttempts() {
	try {
		const res = await apiGet(`${LMS_METHOD}.list_attempts`);
		state.attempts = (res?.rows || []).map((a) => ({
			id: a.id,
			studentId: a.studentId,
			studentName: a.studentName,
			courseId: a.courseId,
			quizId: a.quizId,
			score: a.score,
			passed: !!a.passed,
			at: a.at,
		}));
	} catch {
		/* keep local list */
	}
}

export async function loadSavedAttendance() {
	try {
		const res = await apiGet(`${LMS_METHOD}.list_lms_attendance`);
		const rows = res?.rows || [];
		for (const row of rows) {
			const session = sessionById(row.sessionId) || state.sessions.find((s) => s.id === row.parent);
			mergeServerCheckins(row.sessionId || row.parent, [
				{
					id: row.id,
					name: row.name,
					phone: row.phone,
					email: row.email,
					time: row.time,
					status: row.status || "Present",
					device: row.device || "LMS QR",
				},
			]);
			if (row.phone && row.name) {
				persistStudent(
					{ name: row.name, phone: row.phone, email: row.email },
					{ courseId: session?.courseId || "", courseName: courseById(session?.courseId)?.name || "" }
				).catch(() => {});
			}
		}
	} catch {
		/* optional */
	}
}

export async function loadStudents() {
	try {
		const res = await apiGet(`${LMS_METHOD}.list_students`);
		const rows = res?.rows || [];
		if (!Array.isArray(rows) || !rows.length) return;
		state.students = rows.map((s) => ({
				id: s.id,
				name: s.name,
				phone: s.phone || "",
				email: s.email || "",
				cnic: s.cnic || "",
				org: s.org || "",
				designation: s.designation || "",
				employeeId: s.employeeId || "",
				gender: s.gender || "",
				status: s.status || "Active",
				registered: s.registered || "",
			}));
			state.enrollments = res.enrollments || rows.flatMap((s) => s.enrollments || []);
	} catch {
		/* keep local */
	}
}

export async function loadCertificates() {
	try {
		const res = await apiGet(`${LMS_METHOD}.list_certificates`);
		state.certificates = (res?.rows || []).map((c) => ({
			id: c.id,
			studentId: c.studentId,
			courseId: c.courseId,
			issue: c.issue,
			expiry: c.expiry,
			status: c.status,
			grade: c.grade,
			revokedReason: c.revokedReason || "",
		}));
	} catch {
		/* keep local */
	}
}

export async function persistStudent(form, extra = {}) {
	const payload = {
		id: form.id || "",
		name: form.name,
		phone: form.phone,
		email: form.email || "",
		cnic: form.cnic || "",
		org: form.org || "",
		designation: form.designation || "",
		employeeId: form.employeeId || "",
		gender: form.gender || "",
		status: form.status || "Active",
		...extra,
	};
	let saved = null;
	try {
		saved = await apiPost(`${LMS_METHOD}.save_student`, { payload: JSON.stringify(payload) });
	} catch {
		saved = await apiGet(`${LMS_METHOD}.save_student`, { payload: JSON.stringify(payload) });
	}
	if (!saved?.id) return null;
	return adoptLocalStudent(saved);
}

export async function saveQuiz(quiz) {
	try {
		const saved = await apiPost(`${LMS_METHOD}.save_quiz`, { payload: JSON.stringify(quiz) });
		const idx = state.quizzes.findIndex((q) => q.id && q.id === saved.id);
		if (idx >= 0) state.quizzes[idx] = saved;
		else state.quizzes.unshift(saved);
		state.quiz = saved;
		state.selectedQuizId = saved.id;
		toast("Quiz saved. It will still be here after refresh.");
		audit(role.value.name, "Quiz saved", saved.name);
		go("course_detail", "courses");
		return saved;
	} catch (e) {
		toast(e.message || "Could not save quiz. Stay signed in to ERP and try again.");
		return null;
	}
}

export async function deleteQuiz(id) {
	try {
		await apiPost(`${LMS_METHOD}.delete_quiz`, { name: id });
		state.quizzes = state.quizzes.filter((q) => q.id !== id);
		if (state.quiz?.id === id) state.quiz = quizForCourse(state.selectedCourseId);
		toast("Quiz deleted.");
	} catch (e) {
		toast(e.message || "Could not delete quiz.");
	}
}

export function attemptsFor(studentId, courseId) {
	return state.attempts.filter((a) => a.studentId === studentId && (!courseId || a.courseId === courseId));
}

export function gradeQuiz(answers, quiz = state.quiz) {
	const q = quiz || quizForCourse(state.selectedCourseId);
	if (!q?.questions?.length) return { score: 0, passing: 70, passed: false, correct: 0, total: 0 };
	let correct = 0;
	q.questions.forEach((question) => {
		const given = answers[question.id];
		if (question.type === "multi") {
			const a = [...(given || [])].sort().join(",");
			const b = [...(question.answer || [])].sort().join(",");
			if (a === b) correct += 1;
		} else if (question.type === "short") {
			if (String(given || "").trim().toLowerCase().includes(String(question.answer || "").toLowerCase())) correct += 1;
		} else if (Number(given) === Number(question.answer)) correct += 1;
	});
	const score = Math.round((correct / q.questions.length) * 100);
	return { score, passing: q.passing, passed: score >= q.passing, correct, total: q.questions.length };
}

export async function submitQuiz(studentId) {
	const q = quizForCourse(state.selectedCourseId) || state.quiz;
	if (!q) {
		toast("No quiz is set up for this program.");
		return null;
	}
	const student = studentById(studentId);
	let result = gradeQuiz(state.quizAnswers, q);
	try {
		const res = await apiPost(`${LMS_METHOD}.submit_attempt`, {
			quiz: q.id,
			answers: JSON.stringify(state.quizAnswers),
			student_id: studentId,
			student_name: student?.name || "",
			phone: student?.phone || "",
		});
		if (res?.ok === 0 && res.reason === "limit") {
			toast("Attempt limit reached.");
			result = { score: res.score, passing: res.passing, passed: !!res.passed, correct: res.correct, total: res.total };
		} else if (res) {
			result = { score: res.score, passing: res.passing, passed: !!res.passed, correct: res.correct, total: res.total };
			if (res.attempt) {
				state.attempts.unshift({
					id: res.attempt.id,
					studentId,
					studentName: student?.name || "",
					courseId: q.courseId,
					quizId: q.id,
					score: result.score,
					passed: result.passed,
					at: res.attempt.at,
					answers: { ...state.quizAnswers },
				});
			}
		}
	} catch (e) {
		toast(e.message || "Could not save the attempt. Result is shown locally only.");
		state.attempts.push({
			id: uid("try"),
			studentId,
			courseId: q.courseId,
			score: result.score,
			passed: result.passed,
			at: nowIso(),
			answers: { ...state.quizAnswers },
		});
	}
	state.lastResult = result;
	audit(student?.name || studentId, "Quiz attempt", `${result.score}%`);
	if (result.passed && state.settings.autoIssueCertificate) {
		issueCertificate(studentId, q.courseId, result.score);
	}
	go("quiz_result");
	return result;
}

export async function issueCertificate(studentId, courseId, grade) {
	const existing = state.certificates.find(
		(c) => c.studentId === studentId && c.courseId === courseId && c.status !== "Revoked"
	);
	if (existing) return existing;
	const course = courseById(courseId);
	const student = studentById(studentId);
	let cert = {
		id: uid("cert"),
		studentId,
		courseId,
		issue: todayIso(),
		expiry: `${Number(todayIso().slice(0, 4)) + 2}${todayIso().slice(4)}`,
		status: "Valid",
		grade: `${grade}%`,
		revokedReason: "",
	};
	try {
		const saved = await apiPost(`${LMS_METHOD}.save_certificate`, {
			payload: JSON.stringify({
				studentId,
				studentName: student?.name || "",
				courseId,
				courseName: course?.name || "",
				issue: cert.issue,
				expiry: cert.expiry,
				grade: cert.grade,
			}),
		});
		if (saved?.id) cert = { ...cert, ...saved };
	} catch (e) {
		toast(e.message || "Certificate shown locally only — could not save to ERP.");
	}
	state.certificates.unshift(cert);
	state.selectedCertId = cert.id;
	audit("System", "Certificate generated", cert.id);
	notify("Certificate issued", `${student?.name || "Student"} — ${course?.name || courseId}.`);
	return cert;
}

export async function revokeCertificate(id, reason) {
	const c = state.certificates.find((x) => x.id === id);
	if (!c) return;
	c.status = "Revoked";
	c.revokedReason = reason || "Revoked by administrator";
	try {
		await apiPost(`${LMS_METHOD}.revoke_certificate`, { name: id, reason: c.revokedReason });
	} catch {
		/* local still applies */
	}
	audit(role.value.name, "Certificate revoked", id);
}

export function certById(id) {
	return state.certificates.find((c) => c.id === id);
}

export function notify(title, body) {
	state.notifications.unshift({ id: uid("n"), title, body, time: clock(), unread: true });
}

export function audit(who, action, target) {
	state.audit.unshift({
		id: uid("l"),
		who,
		action,
		target,
		at: new Date().toLocaleString("en-GB", { hour12: false }),
	});
}

export function toast(msg) {
	state.toast = msg;
	setTimeout(() => {
		if (state.toast === msg) state.toast = "";
	}, 2600);
}

export async function addCourse(form) {
	try {
		await apiPost(`${METHOD}.create_link_record`, { key: "program", name: form.name });
	} catch {
		/* program may already exist */
	}
	audit(role.value.name, "Course created", form.name);
	toast("Program saved. Sessions can now be scheduled against it.");
	await loadCatalog();
	const id = slugId("c", form.name);
	state.selectedCourseId = id;
	go("course_detail", "courses");
}

export async function addSession(form) {
	const course = courseById(form.courseId);
	try {
		const result = await apiPost(`${METHOD}.save_session`, {
			values: {
				type: "Training",
				training_date: form.date,
				training_time: form.start,
				training_end_time: form.end,
				trainer_name: form.trainer,
				program: course?.name || "",
				training_type: form.name,
				workshop_topic: form.name,
				mode_of_training: "In-person",
			},
		});
		audit(role.value.name, "Session created", form.name);
		toast("Session saved to Upcoming Training.");
		await loadCatalog();
		if (result?.name) {
			state.selectedSessionId = result.name;
			go("session_detail", "sessions");
		}
	} catch (e) {
		toast(e.message || String(e));
	}
}

export async function addStudent(form) {
	try {
		const saved = await persistStudent({ ...form, status: "Active" });
		if (saved) {
			audit(role.value.name, "Student created", saved.id);
			state.selectedStudentId = saved.id;
			toast("Student saved to ERP.");
			go("student_profile", "students");
			return saved;
		}
	} catch (e) {
		toast(e.message || "Could not save student.");
	}
	const student = {
		id: nextStudentId(),
		status: "Active",
		registered: todayIso(),
		...form,
	};
	state.students.unshift(student);
	audit(role.value.name, "Student created", student.id);
	state.selectedStudentId = student.id;
	go("student_profile", "students");
}

export const titles = {
	login: ["", "Sign in"],
	admin_dash: ["Overview", "Organization dashboard"],
	trainer_dash: ["Overview", "Today's teaching"],
	student_dash: ["Overview", "My learning"],
	courses: ["Catalog", "Courses"],
	trainers: ["People", "Trainers"],
	course_create: ["Catalog", "Create course"],
	course_detail: ["Catalog", "Course detail"],
	quiz_edit: ["Catalog", "Set up quiz"],
	sessions: ["Delivery", "Training sessions"],
	session_create: ["Delivery", "Create session"],
	session_detail: ["Delivery", "Session details"],
	qr_screen: ["Attendance", "Live attendance QR"],
	qr_landing: ["Attendance", "Session check-in"],
	qr_phone: ["Attendance", "Identify student"],
	qr_register: ["Attendance", "New student registration"],
	att_success: ["Attendance", "Check-in complete"],
	lms_course: ["LMS", "Course workspace"],
	lms_lesson: ["LMS", "Lesson"],
	quiz_start: ["Assessment", "Final assessment"],
	quiz_attempt: ["Assessment", "Quiz in progress"],
	quiz_result: ["Assessment", "Quiz result"],
	cert_issued: ["Certification", "Certificate generated"],
	cert_view: ["Certification", "Digital certificate"],
	cert_verify: ["Public", "Certificate verification"],
	my_certs: ["Achievements", "My certificates"],
	students: ["People", "Student database"],
	student_profile: ["People", "Student profile"],
	report_attendance: ["Reports", "Attendance report"],
	report_quiz: ["Reports", "Quiz results"],
	report_cert: ["Reports", "Certificate issuance"],
	notifications: ["Activity", "Notifications"],
	profile: ["Account", "My profile"],
	settings: ["Configuration", "Settings"],
	cert_templates: ["Configuration", "Certificate templates"],
	audit_logs: ["Governance", "Audit logs"],
};

export const publicScreens = ["login", "qr_landing", "qr_phone", "qr_register", "att_success", "cert_verify"];

export function syncPath() {
	const base = "/training-lms";
	let path = base;
	if (state.screen === "qr_landing" && state.checkinToken) path = `${base}/attendance/check-in/${state.checkinToken}`;
	else if (state.screen === "cert_verify" && state.selectedCertId)
		path = `${base}/certificate/verify/${state.selectedCertId}`;
	else if (state.screen === "student_profile" && state.selectedStudentId)
		path = `${base}/student_profile/${encodeURIComponent(state.selectedStudentId)}`;
	else if (state.screen === "session_detail" && state.selectedSessionId)
		path = `${base}/session_detail/${encodeURIComponent(state.selectedSessionId)}`;
	else if (state.screen === "course_detail" && state.selectedCourseId)
		path = `${base}/course_detail/${encodeURIComponent(state.selectedCourseId)}`;
	else if (state.screen === "qr_screen" && state.selectedSessionId)
		path = `${base}/qr_screen/${encodeURIComponent(state.selectedSessionId)}`;
	else if (["lms_course", "lms_lesson", "quiz_start", "quiz_attempt", "quiz_result"].includes(state.screen) && state.selectedCourseId)
		path = `${base}/${state.screen}/${encodeURIComponent(state.selectedCourseId)}`;
	else if (state.screen !== "login") path = `${base}/${state.screen}`;
	if (window.history && window.location.pathname.startsWith(base)) {
		window.history.replaceState({}, "", path);
	}
}

export function bootFromPath() {
	restoreUi();
	const p = window.location.pathname || "";
	const checkin = p.match(/attendance\/check-in\/([^/]+)/);
	if (checkin) {
		try {
			state.checkinToken = decodeURIComponent(checkin[1]);
		} catch {
			state.checkinToken = checkin[1];
		}
		state.screen = "qr_landing";
		state.checkinResolving = true;
		state.checkinGate = "loading";
		resolveCheckin(state.checkinToken);
		return;
	}
	const verify = p.match(/certificate\/verify\/([^/]+)/);
	if (verify) {
		state.selectedCertId = decodeURIComponent(verify[1]);
		state.screen = "cert_verify";
		return;
	}
	const detail = p.match(
		/\/training-lms\/(student_profile|session_detail|course_detail|qr_screen|lms_course|lms_lesson|quiz_start|quiz_attempt|quiz_result)\/([^/]+)/
	);
	if (detail) {
		state.screen = detail[1];
		let id = detail[2];
		try {
			id = decodeURIComponent(detail[2]);
		} catch {
			/* keep */
		}
		if (detail[1] === "student_profile") {
			state.selectedStudentId = id;
			state.nav = "students";
		} else if (detail[1] === "session_detail" || detail[1] === "qr_screen") {
			state.selectedSessionId = id;
			state.nav = "sessions";
		} else {
			state.selectedCourseId = id;
			state.nav = "courses";
		}
		return;
	}
	const m = p.match(/\/training-lms\/([^/]+)/);
	if (m && titles[m[1]] && m[1] !== "login") {
		state.screen = m[1];
		if (m[1] === "student_profile") state.nav = "students";
		else if (m[1] === "session_detail" || m[1] === "qr_screen" || m[1] === "session_create") state.nav = "sessions";
		else if (m[1] === "course_detail" || m[1] === "course_create" || m[1] === "lms_course" || m[1].startsWith("quiz_"))
			state.nav = "courses";
		else {
			const item = navItems().find((n) => n.screen === m[1]);
			if (item) state.nav = item.key;
		}
	}
}

export async function demoScan() {
	const s = state.sessions.find((x) => x.qrActive && x.qrToken) || state.sessions[0] || sessionById("s-h2s-3");
	if (!s) {
		go("qr_landing");
		return;
	}
	await startAttendance(s.id);
	state.checkinToken = s.qrToken;
	go("qr_landing");
}

export const ROLES_LIST = ROLES;
export { ICONS };
