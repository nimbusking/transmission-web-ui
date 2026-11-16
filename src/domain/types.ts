import type { LayoutTheme } from './themes';
import type { VisualTheme } from './visual-themes';
export type TorrentId = number;
export interface Torrent {
  id: number;
  hashString?: string;
  name?: string;
  downloadDir?: string;
  status?: number;
  totalSize?: number;
  sizeWhenDone?: number;
  percentDone?: number;
  rateDownload?: number;
  rateUpload?: number;
  uploadRatio?: number;
  uploadedEver?: number;
  downloadedEver?: number;
  error?: number;
  errorString?: string;
  queuePosition?: number;
  addedDate?: number;
  doneDate?: number;
  activityDate?: number;
  eta?: number;
  isPrivate?: boolean;
  metadataPercentComplete?: number;
  recheckProgress?: number;
  trackers?: Tracker[];
  trackerStats?: Tracker[];
  trackerList?: string;
  files?: TorrentFile[];
  fileStats?: FileStat[];
  peers?: Peer[];
  wanted?: (boolean | undefined)[];
  [key: string]: any;
}
export interface Tracker {
  id: number;
  announce: string;
  tier: number;
  host?: string;
  lastAnnounceResult?: string;
  lastAnnounceSucceeded?: boolean;
  lastAnnounceTime?: number;
  seederCount?: number;
  leecherCount?: number;
  [key: string]: any;
}
export interface TorrentFile {
  name: string;
  length: number;
  bytesCompleted: number;
}
export interface FileStat {
  bytesCompleted: number;
  wanted?: boolean;
  priority?: number;
}
export interface Peer {
  address: string;
  port: number;
  clientName: string;
  progress: number;
  rateToClient: number;
  rateToPeer: number;
  [key: string]: any;
}
export interface TorrentTarget {
  id: number;
  hashString: string;
  generation: number;
}
export interface Session {
  version: string;
  'rpc-version': number;
  'session-id'?: string;
  [key: string]: any;
}
export type ResultStatus = 'success' | 'duplicate' | 'failed' | 'cancelled' | 'unknown' | 'skipped';
export interface ItemResult {
  id: number | string;
  name: string;
  status: ResultStatus;
  message?: string;
}
export interface BatchResult {
  items: ItemResult[];
  completedAt: number;
}
export type DetailSection = 'general' | 'files' | 'trackers' | 'peers';
export interface ColumnSetting {
  key: string;
  width: number;
  visible: boolean;
}
export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}
export interface UiSettings {
  columnPresetVersion?: number;
  columnsBackup?: ColumnSetting[];
  navigationExpanded?: Record<string, boolean>;
  locale: string;
  theme: 'light' | 'dark' | 'system';
  layoutTheme?: LayoutTheme;
  visualTheme?: VisualTheme;
  refreshIntervalMs: number;
  autoRefresh: boolean;
  pagination: boolean;
  pageSize: number;
  filePageSize?: number;
  sidebarWidth: number;
  detailHeight: number;
  forceDesktop: boolean;
  columns: ColumnSetting[];
  ipUrl: string;
  trackerListUrl: string;
}
export interface Settings {
  schemaVersion: 2;
  ui: UiSettings;
  labels: Label[];
  torrentLabels: Record<string, string[]>;
  folderDictionary: string[];
}
export type SettingsSection = 'ui' | 'folders' | 'labels';
export interface MigrationReport {
  sections?: SettingsSection[];
  settings: Settings;
  warnings: string[];
  raw: unknown;
}
export type JobPhase =
  | 'planned'
  | 'locating'
  | 'verifying'
  | 'waiting'
  | 'evaluating'
  | 'matched'
  | 'partial'
  | 'acceptedPartial'
  | 'restoring'
  | 'restored'
  | 'notMatched'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export interface MatchItem {
  target: TorrentTarget;
  name: string;
  originalDir: string;
  currentDir: string;
  candidateIndex: number;
  phase: JobPhase;
  progress: number;
  error?: string;
}
export interface MatchJob {
  id: string;
  createdAt: number;
  candidates: string[];
  items: MatchItem[];
  running: boolean;
  cancelled: boolean;
}
