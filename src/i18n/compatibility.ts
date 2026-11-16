const keys: Record<string, string> = {
  'Limit must be a nonnegative safe integer KB/s': 'compat0',
  'Transmission 3.00 limit exceeds 4294967 KB/s': 'compat1',
  'Limit baseline unavailable; reload before editing': 'compat2',
  'Limit changed; reload before editing': 'compat3',
  'No changes needed': 'compat4',
  'Saved values do not match; reload before editing': 'compat5',
  'May have been applied; reload to reconcile': 'compat6',
  'Tracker baseline unavailable; reload before editing': 'compat7',
  'Tracker capability unavailable; reconnect and reload': 'compat8',
  'Invalid Tracker group': 'compat9',
  'Unknown Tracker member': 'compat10',
  'Tracker URL must use http, https or udp': 'compat11',
  'Duplicate Tracker URL': 'compat12',
  'Grouping and mixed membership/URL edits are restricted on this connection': 'compat13',
  'New Trackers require separate appended groups on this connection': 'compat14',
  'Tracker list changed; reload before editing': 'compat15',
  'Saved Tracker list does not match; reload before editing': 'compat16',
};
export function compatibilityMessage(message: string, t: (key: string) => string): string {
  return keys[message] ? t(keys[message]) : message;
}
