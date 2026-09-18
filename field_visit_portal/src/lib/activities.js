export const ACTIVITY_CARDS = [
	{
		id: "visits",
		type: "Visits",
		group: "visits",
		emoji: "🏫",
		titleEn: "School Visit",
		titleUr: "اسکول کا دورہ",
		subEn: "New / follow-up school visit",
		subUr: "نیا یا فالو اپ اسکول وزٹ",
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
		id: "workshop",
		type: "Workshop Arranged",
		group: "training",
		emoji: "🛠️",
		titleEn: "Workshop Arranged",
		titleUr: "ورکشاپ کا انعقاد",
		subEn: "Workshop / Training conducted",
		subUr: "ورکشاپ / تربیت کا انعقاد",
	},
	{
		id: "enrolment",
		type: "Enrolment of Participants",
		group: "enrolment",
		farhanOnly: true,
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
		titleEn: "Academic Task / HO / RO Visit",
		titleUr: "تعلیمی / ہیڈ آفس / ریجنل آفس کا دورہ",
		subEn: "Head Office / Regional Office tasks",
		subUr: "ہیڈ آفس / ریجنل آفس کے کام",
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
];

export const TRAVEL_MODE_UR = {
	"Own Vehicle / Bike": "ذاتی موٹر سائیکل / گاڑی",
	"Company Vehicle": "کمپنی کی گاڑی",
	"Public Transport": "پبلک ٹرانسپورٹ",
	"Ride Hailing": "رائیڈ ہیلنگ",
	Walking: "پیدل",
	Other: "دیگر",
};

export const QUARTER_OPTIONS = [
	{ value: "Q1", label: "Q1 - Jan-Mar" },
	{ value: "Q2", label: "Q2 - Apr-Jun" },
	{ value: "Q3", label: "Q3 - Jul-Sep" },
	{ value: "Q4", label: "Q4 - Oct-Dec" },
];

export function cardsForUser(activityTypes = []) {
	const allowed = new Set(activityTypes);
	return ACTIVITY_CARDS.filter((card) => {
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

export function currentQuarter() {
	const month = Number(
		new Intl.DateTimeFormat("en", { timeZone: "Asia/Karachi", month: "numeric" }).format(new Date())
	);
	if (month <= 3) return "Q1";
	if (month <= 6) return "Q2";
	if (month <= 9) return "Q3";
	return "Q4";
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
