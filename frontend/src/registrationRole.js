const STORAGE_KEY = 'rescuebite_pending_registration_role'

function isRegistrationRole(role) {
  return role === 'CONSUMER' || role === 'BUSINESS'
}

export function getPendingRegistrationRole() {
  try {
    const role = sessionStorage.getItem(STORAGE_KEY)
    return isRegistrationRole(role) ? role : null
  } catch {
    return null
  }
}

export function setPendingRegistrationRole(role) {
  if (!isRegistrationRole(role)) return
  try {
    sessionStorage.setItem(STORAGE_KEY, role)
  } catch {
    // Clerk can still carry the role in sign-up metadata if storage is unavailable.
  }
}

export function clearPendingRegistrationRole() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
