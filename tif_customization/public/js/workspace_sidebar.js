(function () {
	function find_workspace_page(pages, page) {
		if (!pages?.length || !page?.name) return null;
		const ref = page.name;
		return (
			pages.find((p) => p.title === ref) ||
			pages.find((p) => p.name === ref) ||
			pages.find((p) => frappe.router.slug(p.title) === frappe.router.slug(ref)) ||
			null
		);
	}

	function patch_workspace_class() {
		const Workspace = frappe.views && frappe.views.Workspace;
		if (!Workspace || Workspace.__tif_sidebar_patched) return !!Workspace;

		const proto = Workspace.prototype;
		proto.__tif_find_page = find_workspace_page;

		const original_get_page_to_show = proto.get_page_to_show;
		proto.get_page_to_show = function () {
			const resolved = original_get_page_to_show.call(this);
			if (!this.all_pages?.length) return resolved;
			if (find_workspace_page(this.all_pages, resolved)) return resolved;

			const fallback = this.all_pages[0];
			localStorage.current_page = fallback.title;
			localStorage.is_current_page_public = fallback.public;
			frappe.route_flags.replace_route = true;
			frappe.set_route(
				fallback.public
					? frappe.router.slug(fallback.title)
					: "private/" + frappe.router.slug(fallback.title)
			);
			return { name: fallback.title, public: fallback.public };
		};

		const original_show_page = proto.show_page;
		proto.show_page = async function (page) {
			const pages =
				page.public && this.public_pages.length ? this.public_pages : this.private_pages;
			const current_page = find_workspace_page(pages, page);
			if (current_page) {
				page = { name: current_page.title, public: page.public };
			}
			return original_show_page.call(this, page);
		};

		Workspace.__tif_sidebar_patched = true;
		return true;
	}

	function init() {
		if (patch_workspace_class()) return;
		$(document).on("app_ready", patch_workspace_class);
	}

	if (window.frappe) init();
	else document.addEventListener("DOMContentLoaded", init);
})();
