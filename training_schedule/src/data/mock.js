/** Demo schedule data for the Training Schedule portal (May 19–25, 2026). */

export const CATEGORIES = [
	{ key: "leadership", label: "Leadership", color: "#3b82f6" },
	{ key: "communication", label: "Communication", color: "#10b981" },
	{ key: "technical", label: "Technical", color: "#8b5cf6" },
	{ key: "management", label: "Management", color: "#eab308" },
	{ key: "marketing", label: "Marketing", color: "#ec4899" },
	{ key: "sales", label: "Sales", color: "#0ea5e9" },
	{ key: "other", label: "Other", color: "#9ca3af" },
];

export const TRAINERS = [
	{ id: "t1", name: "Ali Raza", initials: "AR", color: "#6366f1" },
	{ id: "t2", name: "Sara Ahmed", initials: "SA", color: "#10b981" },
	{ id: "t3", name: "Omar Khan", initials: "OK", color: "#f59e0b" },
	{ id: "t4", name: "Hina Malik", initials: "HM", color: "#ec4899" },
	{ id: "t5", name: "Bilal Siddiqui", initials: "BS", color: "#0ea5e9" },
];

export const PROGRAMS = [
	"Leadership Skills",
	"Communication Essentials",
	"Technical Onboarding",
	"Team Management",
	"Digital Marketing",
	"Sales Mastery",
	"Customer Success",
];

export const ROOMS = ["Room A", "Room B", "Room C", "Room D", "Room E", "Room F", "Lab 1", "Lab 2"];

export const TIME_SLOTS = [
	{ id: "s1", label: "08:00 – 10:00", start: "08:00", end: "10:00" },
	{ id: "s2", label: "10:15 – 12:15", start: "10:15", end: "12:15" },
	{ id: "s3", label: "12:30 – 02:30", start: "12:30", end: "14:30" },
	{ id: "s4", label: "02:45 – 04:45", start: "14:45", end: "16:45" },
	{ id: "s5", label: "05:00 – 07:00", start: "17:00", end: "19:00" },
];

/** ISO dates for week Mon–Sun */
export const WEEK_START = "2026-05-19";

export const SESSIONS = [
	// Monday
	{ id: "1", date: "2026-05-19", slot: "s1", title: "Leadership Skills", trainerId: "t1", room: "Room A", category: "leadership", status: "completed" },
	{ id: "2", date: "2026-05-19", slot: "s2", title: "Communication Essentials", trainerId: "t2", room: "Room B", category: "communication", status: "completed" },
	{ id: "3", date: "2026-05-19", slot: "s3", title: "Technical Onboarding", trainerId: "t3", room: "Lab 1", category: "technical", status: "completed" },
	{ id: "4", date: "2026-05-19", slot: "s4", title: "Team Management", trainerId: "t4", room: "Room C", category: "management", status: "completed" },
	// Tuesday (today in mock)
	{ id: "5", date: "2026-05-20", slot: "s1", title: "Leadership Skills", trainerId: "t1", room: "Room A", category: "leadership", status: "in_progress" },
	{ id: "6", date: "2026-05-20", slot: "s2", title: "Digital Marketing", trainerId: "t5", room: "Room D", category: "marketing", status: "upcoming" },
	{ id: "7", date: "2026-05-20", slot: "s3", title: "Sales Mastery", trainerId: "t2", room: "Room B", category: "sales", status: "upcoming" },
	{ id: "8", date: "2026-05-20", slot: "s4", title: "Customer Success", trainerId: "t4", room: "Room E", category: "other", status: "upcoming" },
	{ id: "9", date: "2026-05-20", slot: "s5", title: "Communication Essentials", trainerId: "t3", room: "Room C", category: "communication", status: "upcoming" },
	// Wednesday
	{ id: "10", date: "2026-05-21", slot: "s1", title: "Technical Onboarding", trainerId: "t3", room: "Lab 2", category: "technical", status: "upcoming" },
	{ id: "11", date: "2026-05-21", slot: "s2", title: "Leadership Skills", trainerId: "t1", room: "Room A", category: "leadership", status: "upcoming" },
	{ id: "12", date: "2026-05-21", slot: "s3", title: "Team Management", trainerId: "t5", room: "Room F", category: "management", status: "upcoming" },
	{ id: "13", date: "2026-05-21", slot: "s4", title: "Sales Mastery", trainerId: "t2", room: "Room B", category: "sales", status: "upcoming" },
	// Thursday
	{ id: "14", date: "2026-05-22", slot: "s1", title: "Digital Marketing", trainerId: "t4", room: "Room D", category: "marketing", status: "upcoming" },
	{ id: "15", date: "2026-05-22", slot: "s2", title: "Communication Essentials", trainerId: "t2", room: "Room C", category: "communication", status: "upcoming" },
	{ id: "16", date: "2026-05-22", slot: "s3", title: "Leadership Skills", trainerId: "t1", room: "Room A", category: "leadership", status: "upcoming" },
	{ id: "17", date: "2026-05-22", slot: "s5", title: "Technical Onboarding", trainerId: "t3", room: "Lab 1", category: "technical", status: "upcoming" },
	// Friday
	{ id: "18", date: "2026-05-23", slot: "s1", title: "Team Management", trainerId: "t5", room: "Room E", category: "management", status: "upcoming" },
	{ id: "19", date: "2026-05-23", slot: "s2", title: "Sales Mastery", trainerId: "t1", room: "Room B", category: "sales", status: "upcoming" },
	{ id: "20", date: "2026-05-23", slot: "s3", title: "Customer Success", trainerId: "t4", room: "Room F", category: "other", status: "upcoming" },
	{ id: "21", date: "2026-05-23", slot: "s4", title: "Digital Marketing", trainerId: "t2", room: "Room D", category: "marketing", status: "upcoming" },
	// Saturday light
	{ id: "22", date: "2026-05-24", slot: "s2", title: "Leadership Skills", trainerId: "t1", room: "Room A", category: "leadership", status: "upcoming" },
];

export const SUMMARY = {
	total_sessions: 45,
	completed: 18,
	in_progress: 12,
	upcoming: 15,
	rooms_used: 6,
	rooms_total: 8,
	total_trainers: 15,
};

export const CURRENT_USER = {
	name: "Farhan Hussain",
	role: "Admin",
	initials: "FH",
	notifications: 3,
};

export function getTrainer(id) {
	return TRAINERS.find((t) => t.id === id) || TRAINERS[0];
}

export function getCategory(key) {
	return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}
