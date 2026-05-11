import { inject } from '@angular/core';
import { CanMatchFn, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { UserRole } from '../models/auth.models';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

export const roleGuard: CanMatchFn = (route: Route, _segments: UrlSegment[]): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);
  const roles = (route.data?.['roles'] ?? []) as UserRole[];

  if (!auth.currentUser) {
    return router.createUrlTree(['/auth/login']);
  }

  if (roles.length === 0 || auth.hasAnyRole(roles)) {
    return true;
  }

  notifications.error('You do not have access to this area.');
  return router.createUrlTree(['/dashboard']);
};
