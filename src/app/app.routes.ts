import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { AppShellComponent } from './shared/layout/app-shell/app-shell.component';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES)
  },
  {
    path: '',
    component: AppShellComponent,
    canMatch: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard | StockPro',
        loadComponent: () => import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent)
      },
      {
        path: 'products',
        title: 'Products | StockPro',
        loadComponent: () => import('./features/products/products-page.component').then((m) => m.ProductsPageComponent)
      },
      {
        path: 'warehouses',
        title: 'Warehouses | StockPro',
        loadComponent: () => import('./features/warehouses/warehouses-page.component').then((m) => m.WarehousesPageComponent)
      },
      {
        path: 'purchase-orders',
        title: 'Purchase Orders | StockPro',
        loadComponent: () => import('./features/purchase-orders/purchase-orders-page.component').then((m) => m.PurchaseOrdersPageComponent)
      },
      {
        path: 'suppliers',
        title: 'Suppliers | StockPro',
        loadComponent: () => import('./features/suppliers/suppliers-page.component').then((m) => m.SuppliersPageComponent)
      },
      {
        path: 'stock-movements',
        title: 'Stock Movements | StockPro',
        loadComponent: () => import('./features/stock-movements/stock-movements-page.component').then((m) => m.StockMovementsPageComponent)
      },
      {
        path: 'alerts',
        title: 'Alerts | StockPro',
        loadComponent: () => import('./features/alerts/alerts-page.component').then((m) => m.AlertsPageComponent)
      },
      {
        path: 'reports',
        title: 'Reports | StockPro',
        loadComponent: () => import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'admin',
        title: 'Admin | StockPro',
        canMatch: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadComponent: () => import('./features/admin/admin-page.component').then((m) => m.AdminPageComponent)
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
