export interface Track {
  id: string;
  videoId?: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  highResThumbnailUrl?: string | null;
  localPath?: string;
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle: string;
  tracks: Track[];
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export interface SearchItem {
  id: string;
  videoId?: string;
  browseId?: string;
  playlistId?: string;
  type: 'song' | 'video' | 'album' | 'artist' | 'playlist';
  title: string;
  artist: string;
  album?: string;
  subtitle?: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

export interface SearchSuggestions {
  queries: string[];
  items: SearchItem[];
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
}

export type RepeatMode = 'OFF' | 'ALL' | 'ONE';
export type ThemeMode = 'DARK' | 'LIGHT' | 'SYSTEM';
