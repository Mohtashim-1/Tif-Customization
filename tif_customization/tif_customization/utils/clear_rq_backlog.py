"""Utility to clear duplicate queued jobs from RQ."""

import frappe
from rq.job import Job


def _is_build_index_job(job):
	fn = str(getattr(job, "func_name", None) or "")
	desc = str(getattr(job, "description", None) or getattr(job, "origin", None) or "")
	return "build_index" in fn or "build_index" in desc


@frappe.whitelist()
def clear_duplicate_build_index_jobs(keep_one=True):
	"""Remove queued lms.sqlite.build_index jobs from the long queue."""
	from frappe.utils.background_jobs import get_queue, get_redis_conn

	conn = get_redis_conn()
	queue = get_queue("long")
	removed = 0
	kept = 0

	for job_id in list(queue.job_ids):
		try:
			job = Job.fetch(job_id, connection=conn)
			if not _is_build_index_job(job):
				continue
			if keep_one and not kept:
				kept = 1
				continue
			job.cancel()
			job.delete()
			removed += 1
		except Exception:
			pass

	return {
		"removed": removed,
		"kept": kept,
		"remaining_long": len(queue.job_ids),
		"message": f"Removed {removed} duplicate build_index job(s); {len(queue.job_ids)} left in long queue",
	}
