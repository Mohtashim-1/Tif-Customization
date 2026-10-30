export const ACTIVITY_CARDS = [
	{
		id: "visits",
		type: "Visits",
		group: "visits",
		emoji: "🏫",
		titleEn: "School / Marketing Visit",
		titleUr: "اسکول / مارکیٹنگ وزٹ",
		subEn: "New / follow-up school visit",
		subUr: "نیا یا فالو اپ اسکول وزٹ",
	},
	{
		id: "me",
		type: "M&E",
		group: "me",
		emoji: "🔍",
		titleEn: "Monitoring & Evaluation",
		titleUr: "مانیٹرنگ اینڈ ایویلیوایشن",
		subEn: "Mutalae Quran-e-Hakeem (2025-26)",
		subUr: "مطالعہ قرآن حکیم (۲۰۲۵-۲۶)",
	},
	{
		id: "meeting",
		type: "Meeting with Ulama and Educationist",
		group: "meeting",
		emoji: "👥",
		titleEn: "Meeting with Ulama & Educationist",
		titleUr: "علماء و ماہرین تعلیم سے ملاقات",
		subEn: "Ulama / Schools / Madrassah visit",
		subUr: "علماء / اسکول / مدرسہ کا دورہ",
	},
	{
		id: "internal_meeting",
		type: "Internal Meeting",
		group: "internal_meeting",
		emoji: "🗓️",
		titleEn: "Internal Meeting / HO / RO Visit",
		titleUr: "اندرونی میٹنگ / ہیڈ آفس / ریجنل آفس دورہ",
		subEn: "Internal meeting · Head Office / Regional Office visit",
		subUr: "اندرونی میٹنگ · ہیڈ آفس / ریجنل آفس دورہ",
	},
	{
		id: "training",
		type: "Teachers Training Meeting",
		group: "training",
		emoji: "🎓",
		titleEn: "Teachers Training Meeting",
		titleUr: "اساتذہ کی تربیتی میٹنگ",
		subEn: "TT meeting & coordination",
		subUr: "ٹی ٹی میٹنگ اور رابطہ کاری",
	},
	{
		id: "workshop_conducted",
		type: "Workshop Conducted",
		altTypes: ["Workshop"],
		group: "training",
		alwaysShow: true,
		emoji: "🛠️",
		titleEn: "Workshop Conducted",
		titleUr: "ورکشاپ منعقد",
		subEn: "Workshop / Training conducted",
		subUr: "ورکشاپ / تربیت کا انعقاد",
	},
	// Enrolment / Stall / Quiz: open to every field officer (see FIELD_OFFICER_OPEN_ACTIVITY_TYPES)
	{
		id: "workshop_arranged",
		type: "Workshop Arranged",
		group: "training",
		emoji: "📅",
		titleEn: "Workshop Arranged",
		titleUr: "ورکشاپ کا اہتمام",
		subEn: "Date, venue, participants",
		subUr: "تاریخ، مقام، شرکاء",
	},
	{
		id: "stall",
		type: "Co-curricular Activity",
		group: "event",
		emoji: "🎪",
		titleEn: "Stall Activity / Exhibition",
		titleUr: "سٹال سرگرمی / نمائش",
		subEn: "Date, venue, schools, participants",
		subUr: "تاریخ، مقام، اسکول، شرکاء",
	},
	{
		id: "quiz",
		type: "Quiz Arranged",
		group: "event",
		emoji: "📝",
		titleEn: "Quiz Arranged",
		titleUr: "کوئز کا اہتمام",
		subEn: "Date, venue, schools, participants",
		subUr: "تاریخ، مقام، اسکول، شرکاء",
	},
	{
		id: "volunteer",
		type: "Enrolment of Volunteers",
		group: "volunteer",
		emoji: "🤝",
		titleEn: "Volunteer Enrolment",
		titleUr: "والنٹیئر اندراج",
		subEn: "Contact, location, school, profession",
		subUr: "رابطہ، مقام، اسکول، پیشہ",
	},
	// Hidden for now — Ambassador Enrolment card
	// {
	// 	id: "ambassador",
	// 	type: "Enrolment of Ambassadors",
	// 	group: "ambassador",
	// 	emoji: "🏅",
	// 	titleEn: "Ambassador Enrolment",
	// 	titleUr: "ایمبیسڈر اندراج",
	// 	subEn: "Contact, location, school, profession",
	// 	subUr: "رابطہ، مقام، اسکول، پیشہ",
	// },
	{
		id: "enrolment",
		type: "Enrolment of Participants",
		group: "enrolment",
		emoji: "👤",
		titleEn: "Enrolment of Participants",
		titleUr: "شرکاء کا اندراج",
		subEn: "ELP / TECC / TTC / Tajweed",
		subUr: "ای ایل پی / ٹی ای سی سی / ٹی ٹی سی / تجوید",
	},
	{
		id: "registration",
		type: "Registration of Participant in Workshops",
		group: "enrolment",
		farhanOnly: true,
		emoji: "📋",
		titleEn: "Registration in Workshops",
		titleUr: "ورکشاپ میں رجسٹریشن",
		subEn: "New participants registration",
		subUr: "نئے شرکاء کی رجسٹریشن",
	},
	{
		id: "academic",
		type: "Academic Task",
		altTypes: [
			"Headoffice/ Regional Office/ Out of Station Visit",
			"Other Official Tasks",
		],
		group: "academic",
		emoji: "🏛️",
		titleEn: "Academic Task",
		titleUr: "تعلیمی کام",
		subEn: "Academic tasks · HO / RO visits",
		subUr: "تعلیمی کام · ہیڈ آفس / ریجنل آفس دورے",
	},
	{
		id: "books",
		type: "Books Demand (Quantity)",
		group: "books",
		emoji: "📚",
		titleEn: "Books Demand",
		titleUr: "کتب کی طلب",
		subEn: "Books requirement from schools",
		subUr: "اسکولوں سے کتب کی ضرورت",
	},
	{
		id: "report",
		type: "Report",
		group: "report",
		alwaysShow: true,
		href: "/app/sme-summary-report-copy",
		emoji: "📊",
		titleEn: "Report",
		titleUr: "رپورٹ",
		subEn: "SME Summary Report",
		subUr: "SME سمری رپورٹ",
	},
];

export const TRAVEL_MODE_UR = {
	"Own Vehicle / Bike": "ذاتی موٹر سائیکل / گاڑی",
	"Company Vehicle": "کمپنی کی گاڑی",
	"Public Transport": "پبلک ٹرانسپورٹ",
	"Ride Hailing": "رائیڈ ہیلنگ",
	Walking: "پیدل",
	Other: "دیگر",
};

// Fiscal year Jul–Jun (same as SME / expense reports).
export const QUARTER_OPTIONS = [
	{ value: "Q1", label: "Q1 - Jul-Sep" },
	{ value: "Q2", label: "Q2 - Oct-Dec" },
	{ value: "Q3", label: "Q3 - Jan-Mar" },
	{ value: "Q4", label: "Q4 - Apr-Jun" },
];

/** Always show these to field officers even if meta.activity_types is stale */
const OPEN_FIELD_OFFICER_CARD_TYPES = new Set([
	"Enrolment of Participants",
	"Quiz Arranged",
	"Co-curricular Activity",
	"Workshop Conducted",
	"Workshop",
]);

export function cardsForUser(activityTypes = []) {
	const allowed = new Set(activityTypes);
	return ACTIVITY_CARDS.filter((card) => {
		if (card.alwaysShow) return true;
		if (OPEN_FIELD_OFFICER_CARD_TYPES.has(card.type)) return true;
		if (allowed.has(card.type)) return true;
		return (card.altTypes || []).some((t) => allowed.has(t));
	});
}

export function resolveActivityType(card, academicTask, allowedTypes = []) {
	if (!card) return "";
	if (card.id !== "academic") return card.type;
	const task = (academicTask || "").trim();
	let mapped = "Academic Task";
	if (task === "Other Official Tasks") mapped = "Other Official Tasks";
	else if (
		[
			"Head Office Visit",
			"Regional Office Visit",
			"Out of Station Visit",
			"Meeting of Regional Staff (Supervisors) and SMEs",
		].includes(task)
	) {
		mapped = "Headoffice/ Regional Office/ Out of Station Visit";
	}
	if (!allowedTypes.length || allowedTypes.includes(mapped)) return mapped;
	const fallback = ["Academic Task", "Headoffice/ Regional Office/ Out of Station Visit", "Other Official Tasks"].find(
		(t) => allowedTypes.includes(t)
	);
	return fallback || mapped;
}

export function todayISO() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Karachi",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const get = (t) => parts.find((p) => p.type === t)?.value || "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

export function currentMonthName() {
	return new Intl.DateTimeFormat("en", { timeZone: "Asia/Karachi", month: "long" }).format(new Date());
}

/** Map calendar month (1–12) → fiscal quarter (FY starts July). */
export function quarterFromMonth(month) {
	const m = Number(month) || 0;
	if (m >= 7 && m <= 9) return "Q1";
	if (m >= 10 && m <= 12) return "Q2";
	if (m >= 1 && m <= 3) return "Q3";
	if (m >= 4 && m <= 6) return "Q4";
	return "Q1";
}

export function currentQuarter() {
	const month = Number(
		new Intl.DateTimeFormat("en", { timeZone: "Asia/Karachi", month: "numeric" }).format(new Date())
	);
	return quarterFromMonth(month);
}

export function karachiClock() {
	return new Intl.DateTimeFormat("en-PK", {
		timeZone: "Asia/Karachi",
		hour: "2-digit",
		minute: "2-digit",
		day: "2-digit",
		month: "short",
	}).format(new Date());
}
