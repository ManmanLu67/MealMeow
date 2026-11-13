exports.main = async (event) => {
  const action = event && event.action
  switch (action) {
    case 'home':
    case 'checkin':
    case 'exempt':
    case 'gallery':
    case 'adopt':
    case 'saveMeals':
    case 'deleteCheckin':
      return { ok: false, error: 'not_implemented', action }
    default:
      return { ok: false, error: 'unknown_action' }
  }
}
