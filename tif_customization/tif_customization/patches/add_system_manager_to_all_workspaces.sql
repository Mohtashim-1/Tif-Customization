-- Add System Manager role to all workspaces (idempotent).
-- Run: bench --site erp.theilmfoundation.cloud mariadb < apps/tif_customization/tif_customization/tif_customization/patches/add_system_manager_to_all_workspaces.sql

INSERT INTO `tabHas Role` (
	name, creation, modified, modified_by, owner, docstatus, idx,
	role, parent, parentfield, parenttype
)
SELECT
	LOWER(SUBSTRING(SHA1(CONCAT(w.name, '-sm-', UUID())), 1, 10)),
	NOW(6), NOW(6), 'Administrator', 'Administrator', 0,
	COALESCE((
		SELECT MAX(hr.idx)
		FROM `tabHas Role` hr
		WHERE hr.parent = w.name AND hr.parenttype = 'Workspace'
	), 0) + 1,
	'System Manager',
	w.name,
	'roles',
	'Workspace'
FROM `tabWorkspace` w
WHERE NOT EXISTS (
	SELECT 1
	FROM `tabHas Role` hr
	WHERE hr.parent = w.name
		AND hr.parenttype = 'Workspace'
		AND hr.role = 'System Manager'
);
