import { isSafeCheckoutRedirectUrl as isSafeCheckoutRedirect } from '@/services/checkoutSecurity';

export const isSafeCheckoutRedirectUrl = (
  value: unknown,
  currentOrigin: string = window.location.origin,
): value is string => isSafeCheckoutRedirect(value, currentOrigin);
