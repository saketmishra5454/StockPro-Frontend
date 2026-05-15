import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: 'Login | StockPro',
    loadComponent: () => import('./login/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'register',
    title: 'Register | StockPro',
    loadComponent: () => import('./register/register-page.component').then((m) => m.RegisterPageComponent)
  },
  {
    path: 'reset-password',
    title: 'Reset Password | StockPro',
    loadComponent: () => import('./reset-password/reset-password-page.component').then((m) => m.ResetPasswordPageComponent)
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  }
];
