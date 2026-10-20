export function homeRouteForRole(role) {
  if (role === 'CONSUMER') return 'explore'
  if (role === 'BUSINESS') return 'business-dashboard'
  return null
}

export function canAccessRoute(role, requiredRole) {
  return !requiredRole || role === requiredRole
}
