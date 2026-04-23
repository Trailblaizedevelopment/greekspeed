export type ActivityStatus = 'hot' | 'warm' | 'cold'

export interface ActivityInfo {
  status: ActivityStatus
  color: string
  text: string
  timeAgo: string
  isOnline: boolean
}

/**
 * Get activity status based on lastActiveAt timestamp
 */
export function getActivityStatus(lastActiveAt?: string | null): ActivityInfo {
  if (!lastActiveAt) {
    return { 
      status: 'cold', 
      color: 'bg-gray-400', 
      text: 'No Activity', 
      timeAgo: 'No Activity',
      isOnline: false
    }
  }

  const lastActiveDate = new Date(lastActiveAt)
  const now = new Date()
  const diffMs = now.getTime() - lastActiveDate.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 1) {
    return { 
      status: 'hot', 
      color: 'bg-green-500', 
      text: 'Active Now', 
      timeAgo: 'Active Now',
      isOnline: true
    }
  } else if (diffHours < 24) {
    return { 
      status: 'warm', 
      color: 'bg-accent-500', 
      text: 'Recently Active', 
      timeAgo: 'Recently Active',
      isOnline: false
    }
  } else {
    return { 
      status: 'cold', 
      color: 'bg-gray-400', 
      text: 'Not Active', 
      timeAgo: 'Not Active',
      isOnline: false
    }
  }
}

/**
 * Get background color for activity status
 */
export function getActivityBgColor(status: ActivityStatus): string {
  const colors = {
    hot: 'bg-green-500',
    warm: 'bg-accent-500',
    cold: 'bg-gray-400'
  }
  return colors[status]
}

/**
 * Get text color for activity status
 */
export function getActivityColor(status: ActivityStatus): string {
  const colors = {
    hot: 'text-green-600',
    warm: 'text-brand-accent',
    cold: 'text-gray-500'
  }
  return colors[status]
}

/**
 * Get label for activity status
 */
export function getActivityLabel(status: ActivityStatus): string {
  const labels = {
    hot: 'Active Now',
    warm: 'Recently Active',
    cold: 'Not Active'
  }
  return labels[status]
}

