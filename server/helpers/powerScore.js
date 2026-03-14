// Kademeli Organizasyon ve Yetki Gücü Sistemi
// Power Score: Admin(100) > Senior Manager(80) > Manager(60) > Senior User(40) > User(20)

const POWER_SCORES = {
  admin: 100,
  senior_manager: 80,
  manager: 60,
  senior_user: 40,
  user: 20,
};

const VALID_ROLES = Object.keys(POWER_SCORES);

export function getPowerScore(role) {
  return POWER_SCORES[role] ?? 0;
}

export function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

// Can the requester see the target user? (equal or lower power)
export function canSee(requesterRole, targetRole) {
  return getPowerScore(requesterRole) >= getPowerScore(targetRole);
}

// Can the requester assign tasks to the target? (equal or lower power)
export function canAssignTo(requesterRole, targetRole) {
  return getPowerScore(requesterRole) >= getPowerScore(targetRole);
}

// Can the requester delete/reject a task created by creatorRole?
// Only if requester power >= creator power
export function canDeleteTask(requesterRole, creatorRole) {
  return getPowerScore(requesterRole) >= getPowerScore(creatorRole);
}

// Can the requester publish announcements? (manager and above, power >= 60)
export function canPublishAnnouncement(role) {
  return getPowerScore(role) >= 60;
}

// Can the requester delete announcements? (manager and above, power >= 60)
export function canDeleteAnnouncement(role) {
  return getPowerScore(role) >= 60;
}

// Can manage users in settings? (manager and above, power >= 60)
export function canManageUsers(role) {
  return getPowerScore(role) >= 60;
}

// Get roles that a user can create (strictly lower power only)
export function getCreatableRoles(role) {
  const requesterPower = getPowerScore(role);
  return VALID_ROLES.filter(r => POWER_SCORES[r] < requesterPower);
}

// Is admin? (power === 100, for delete-level operations)
export function isAdmin(role) {
  return getPowerScore(role) === 100;
}

// Get SQL filter for visibility based on power score
// Returns users with power score <= requester's power score
export function getVisibleRolesSQL(requesterRole) {
  const requesterPower = getPowerScore(requesterRole);
  const visibleRoles = VALID_ROLES.filter(r => POWER_SCORES[r] <= requesterPower);
  return visibleRoles.map(r => `'${r}'`).join(',');
}

export { POWER_SCORES, VALID_ROLES };
