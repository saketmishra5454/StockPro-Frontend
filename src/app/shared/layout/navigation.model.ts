import { UserRole } from '@core/models/auth.models';

export interface NavigationItem {
  label: string;
  icon: string;
  route: string;
  roles: UserRole[];
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', roles: ['ADMIN', 'MANAGER', 'STAFF', 'OFFICER'] },
  { label: 'Products', icon: 'inventory_2', route: '/products', roles: ['ADMIN', 'MANAGER', 'STAFF', 'OFFICER'] },
  { label: 'Warehouses', icon: 'warehouse', route: '/warehouses', roles: ['ADMIN', 'MANAGER', 'OFFICER'] },
  { label: 'Purchase Orders', icon: 'receipt_long', route: '/purchase-orders', roles: ['ADMIN', 'MANAGER', 'OFFICER'] },
  { label: 'Suppliers', icon: 'groups', route: '/suppliers', roles: ['ADMIN', 'MANAGER', 'OFFICER'] },
  { label: 'Stock Movements', icon: 'sync_alt', route: '/stock-movements', roles: ['ADMIN', 'MANAGER', 'STAFF', 'OFFICER'] },
  { label: 'Alerts', icon: 'notifications_active', route: '/alerts', roles: ['ADMIN', 'MANAGER', 'STAFF', 'OFFICER'] },
  { label: 'Reports', icon: 'monitoring', route: '/reports', roles: ['ADMIN', 'MANAGER'] },
  { label: 'Admin Panel', icon: 'admin_panel_settings', route: '/admin', roles: ['ADMIN'] }
];
