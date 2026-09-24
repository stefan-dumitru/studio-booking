import { NavLink, Outlet } from 'react-router-dom';

const navLinkClassName = ({ isActive }: { isActive: boolean }): string =>
  `rounded-md px-3 py-1.5 text-sm ${
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

/** Wraps every /admin/* route. */
export function AdminLayout(): React.JSX.Element {
  return (
    <div className="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav className="flex gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
          <NavLink to="/admin" end className={navLinkClassName}>
            Summary
          </NavLink>
          <NavLink to="/admin/bookings" className={navLinkClassName}>
            Bookings
          </NavLink>
          <NavLink to="/admin/members" className={navLinkClassName}>
            Members
          </NavLink>
          <NavLink to="/admin/resources" className={navLinkClassName}>
            Resources
          </NavLink>
          <NavLink to="/admin/resource-types" className={navLinkClassName}>
            Resource types
          </NavLink>
        </nav>
        <div className="mt-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
