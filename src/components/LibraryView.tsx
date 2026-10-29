'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useMusic } from '@/context/MusicContext';
import { Track } from '@/types';
import { DownloadButton } from '@/components/DownloadButton';
import {
  getStorageInfo,
  deleteTrack,
  type OfflineTrackMeta,
} from '@/lib/offlineStore';
import { useDownloadedList, useOfflineStatus } from '@/lib/offlineHooks';
import {
  Heart,
  Play,
  Trash2,
  Plus,


  Search,
  Download,
  Clock,

  ArrowUpDown,
  User,
  WifiOff,
  HardDrive,


} from 'lucide-react';

type LibrarySection = 'ALL' | 'LIKED' | 'SONGS' | 'PLAYLISTS' | 'ARTISTS' | 'DOWNLOADS';
type SortOption = 'RECENT' | 'TITLE' | 'ARTIST';

export function LibraryView({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const {
    likedTracks,
    recentTracks,
    playlists,
    createPlaylist,
    addToPlaylist,
    deletePlaylist,
    playTrack,
    currentTrack,
    toggleLike,
    isLiked
  } = useMusic();

  const [section, setSection] = useState<LibrarySection>('ALL');
  const [sort, setSort] = useState<SortOption>('RECENT');
  const [searchQuery, setSearchQuery] = useState('');
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Offline downloads (IndexedDB)
  const { tracks: downloadedTracks, covers: downloadedCovers } = useDownloadedList();
  const { isOnline } = useOfflineStatus();
  const [storageInfo, setStorageInfo] = useState<{ tracksBytes: number; quota: number } | null>(null);
  const refreshStorage = () => {
    getStorageInfo().then((info) => setStorageInfo({ tracksBytes: info.tracksBytes, quota: info.quota }));
  };
  React.useEffect(() => {
    refreshStorage();
    const onDl = () => refreshStorage();
    window.addEventListener('riva-downloads', onDl);
    return () => window.removeEventListener('riva-downloads', onDl);
  }, []);

  const formatBytes = (b: number) => {
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(b / 1024))} KB`;
  };

  // Derive artists from liked and recent tracks
  const allTracks = Array.from(
    new Map([...likedTracks, ...recentTracks].map(t => [t.id, t])).values()
  );

  const artistsMap = new Map<string, Track[]>();
  allTracks.forEach(t => {
    const artistName = t.artist.split(/[,&•]/)[0].trim();
    if (!artistsMap.has(artistName)) {
      artistsMap.set(artistName, []);
    }
    artistsMap.get(artistName)!.push(t);
  });

  const artists = Array.from(artistsMap.entries()).map(([name, tracks]) => ({
    name,
    tracks,
    artwork: tracks[0]?.thumbnailUrl
  }));

  // Filtering
  const matches = (t: Track) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  };

  const sortTracks = (tracks: Track[]) => {
    const copy = [...tracks];
    if (sort === 'TITLE') return copy.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'ARTIST') return copy.sort((a, b) => a.artist.localeCompare(b.artist));
    return copy;
  };

  const filteredLiked = sortTracks(likedTracks.filter(matches));
  const filteredRecent = sortTracks(recentTracks.filter(matches));
  const filteredSongs = sortTracks(allTracks.filter(matches));
  const filteredPlaylists = playlists.filter(p =>
    !searchQuery.trim() || p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredArtists = artists.filter(a =>
    !searchQuery.trim() || a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlaylistTitle.trim()) {
      createPlaylist(newPlaylistTitle.trim());
      setNewPlaylistTitle('');
      setShowCreate(false);
    }
  };

  const handleImportPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setIsImporting(true);
    try {
      const res = await fetch(`/api/playlist?id=${encodeURIComponent(importUrl.trim())}`);
      const data = await res.json();
      if (data.title && data.tracks) {
        // Create the playlist AND save every imported track into it
        const pl = createPlaylist(data.title);
        if (pl) {
          data.tracks.forEach((t: Track) => addToPlaylist(pl.id, t));
        }
        setImportUrl('');
        if (data.tracks.length > 0) {
          playTrack(data.tracks[0], data.tracks);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
      {/* Header Title & In-Library Search */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              Library
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Everything you saved, liked, and played
            </p>
          </div>
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="p-2.5 rounded-full bg-[var(--color-panel)] border border-[var(--color-panel-border)] text-[var(--color-lime)] hover:scale-105 transition-all shadow-sm"
              title="Search Music"
            >
              <Search size={18} />
            </button>
          )}
        </div>

        {/* Search bar inside library */}
        <div className="relative w-full">
          <Search size={16} className="absolute left-3.5 top-3 text-[var(--color-lime)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search within your library..."
            className="w-full bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded-2xl pl-10 pr-4 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-lime)]/70 transition-all"
          />
        </div>
      </div>

      {/* Filter Tabs & Sort Selection */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
        <div className="flex items-center gap-2">
          {(['ALL', 'LIKED', 'SONGS', 'PLAYLISTS', 'ARTISTS'] as LibrarySection[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shrink-0 ${section === tab ? 'bg-[var(--color-lime)] text-[var(--color-ink)] border-[var(--color-lime)] shadow-sm' : 'bg-[var(--color-panel)] text-[var(--color-text-secondary)] border-[var(--color-panel-border)] hover:border-[var(--color-panel-border)]/80'}`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)] shrink-0">
          <ArrowUpDown size={13} className="text-[var(--color-lime)]" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-transparent text-xs font-semibold text-[var(--color-text-primary)] cursor-pointer focus:outline-none"
          >
            <option value="RECENT" className="bg-[var(--color-panel)]">Recently Added</option>
            <option value="TITLE" className="bg-[var(--color-panel)]">Title A-Z</option>
            <option value="ARTIST" className="bg-[var(--color-panel)]">Artist A-Z</option>
          </select>
        </div>
      </div>

      {/* SECTION: ALL (Exact Metrolist Style Hero + Cards + Lists) */}
      {section === 'ALL' && (
        <div className="flex flex-col gap-7">
          {/* Liked Songs Hero Banner */}
          <div
            onClick={() => setSection('LIKED')}
            className="relative rounded-3xl p-6 overflow-hidden cursor-pointer bg-gradient-to-br from-[var(--color-banner-from)] via-[var(--color-banner-via)] to-[var(--color-banner-to)] border border-[var(--color-lime)]/30 shadow-xl group hover:border-[var(--color-lime)]/60 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-5 z-10">
              <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden shrink-0 shadow-2xl border border-[var(--color-panel-border)] bg-[var(--color-lime)]/20 flex items-center justify-center">
                {likedTracks[0]?.thumbnailUrl ? (
                  <Image src={likedTracks[0].thumbnailUrl} alt="Liked" fill className="object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <Heart size={36} className="fill-[var(--color-lime)] text-[var(--color-lime)]" />
                )}
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-lime)]">
                  Favorites Collection
                </span>
                <h3 className="text-xl md:text-2xl font-black text-[var(--color-text-primary)] mt-0.5">
                  Liked Songs
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  {likedTracks.length} tracks saved
                </p>
              </div>
            </div>

            {likedTracks.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playTrack(likedTracks[0], likedTracks);
                }}
                className="p-3.5 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] hover:scale-110 active:scale-95 shadow-xl shadow-[var(--color-lime)]/30 transition-all shrink-0 z-10"
              >
                <Play size={20} className="fill-current ml-0.5" />
              </button>
            )}
          </div>

          {/* Quick Dual Cards: Downloads & History */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setSection('DOWNLOADS')}
              className="p-4 rounded-3xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] flex items-center justify-between cursor-pointer hover:border-[var(--color-lime)]/40 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-[var(--color-lime)]/15 text-[var(--color-lime)]">
                  <Download size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                    Offline Downloads
                  </h4>
                  <p className="text-xs text-[var(--color-text-faint)]">
                    {downloadedTracks.length} tracks{downloadedTracks.length > 0 && storageInfo ? ` • ${formatBytes(storageInfo.tracksBytes)}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[var(--color-lime)]">Browse</span>
            </div>

            <div
              onClick={() => setSection('ALL')}
              className="p-4 rounded-3xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] flex items-center justify-between cursor-pointer hover:border-[var(--color-lime)]/40 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-[#991B1B]/20 text-[#FF8A80]">
                  <Clock size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                    Recently Played
                  </h4>
                  <p className="text-xs text-[var(--color-text-faint)]">
                    {recentTracks.length} tracks in history
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[var(--color-lime)]">View</span>
            </div>
          </div>

          {/* Playlists Horizontal Shelf */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-[var(--color-text-primary)]">
                  Playlists
                </h3>
                <p className="text-xs text-[var(--color-text-faint)]">
                  Your custom and imported YouTube playlists
                </p>
              </div>
              <button
                onClick={() => setSection('PLAYLISTS')}
                className="text-xs font-bold text-[var(--color-lime)] hover:underline"
              >
                View all ({playlists.length})
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {playlists.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => p.tracks.length > 0 && playTrack(p.tracks[0], p.tracks)}
                  className="p-3 rounded-2xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] flex flex-col justify-between gap-3 cursor-pointer hover:border-[var(--color-lime)]/50 transition-all group"
                >
                  <div>
                    <h5 className="text-xs font-extrabold truncate text-[var(--color-text-primary)] group-hover:text-[var(--color-lime)]">
                      {p.title}
                    </h5>
                    <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                      {p.tracks.length} tracks
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <div className="p-2 rounded-full bg-[var(--color-lime)]/15 group-hover:bg-[var(--color-lime)] transition-all [&>svg]:text-[var(--color-lime)] group-hover:[&>svg]:text-[var(--color-ink)]">
                      <Play size={12} className="fill-current" />
                    </div>
                  </div>
                </div>
              ))}

              {/* Create New Playlist Card */}
              <div
                onClick={() => { setSection('PLAYLISTS'); setShowCreate(true); }}
                className="p-3 rounded-2xl border-2 border-dashed border-[var(--color-panel-border)] flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-[var(--color-lime)] text-[var(--color-text-faint)] hover:text-[var(--color-lime)] transition-all"
              >
                <Plus size={20} />
                <span className="text-xs font-bold">New Playlist</span>
              </div>
            </div>
          </div>

          {/* Artists Shelf */}
          {artists.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[var(--color-text-primary)]">
                    Artists
                  </h3>
                  <p className="text-xs text-[var(--color-text-faint)]">
                    Derived from your saved & played tracks
                  </p>
                </div>
                <button
                  onClick={() => setSection('ARTISTS')}
                  className="text-xs font-bold text-[var(--color-lime)] hover:underline"
                >
                  View all ({artists.length})
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {artists.slice(0, 6).map((a) => (
                  <div
                    key={a.name}
                    onClick={() => playTrack(a.tracks[0], a.tracks)}
                    className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[var(--color-panel)] cursor-pointer transition-all group text-center"
                  >
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-[var(--color-ink-soft)] border-2 border-transparent group-hover:border-[var(--color-lime)] transition-all shadow-md">
                      {a.artwork ? (
                        <Image src={a.artwork} alt={a.name} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User size={24} className="text-[var(--color-lime)]" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-bold truncate w-full text-[var(--color-text-primary)] group-hover:text-[var(--color-lime)]">
                      {a.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recently Played List */}
          {recentTracks.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-black text-[var(--color-text-primary)]">
                Recent Tracks
              </h3>
              <div className="flex flex-col gap-1.5">
                {recentTracks.slice(0, 6).map((t) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    isCurrent={currentTrack?.id === t.id}
                    onPlay={() => playTrack(t, recentTracks)}
                    isLiked={isLiked(t.id)}
                    onToggleLike={() => toggleLike(t)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION: DOWNLOADS (offline, IndexedDB) */}
      {section === 'DOWNLOADS' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-[var(--color-text-primary)]">
                Offline Downloads ({downloadedTracks.length})
              </h3>
              <p className="text-xs text-[var(--color-text-faint)] mt-0.5">
                {storageInfo
                  ? `${formatBytes(storageInfo.tracksBytes)} of ${storageInfo.quota ? formatBytes(storageInfo.quota) : '?'} storage used`
                  : 'Stored on this device — play without internet'}
              </p>
            </div>
            {downloadedTracks.length > 0 && (
              <button
                onClick={() => {
                  const q = downloadedTracks.map((m) => metaToTrack(m, downloadedCovers.get(m.id) ?? null));
                  playTrack(q[0], q);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black hover:scale-105 transition-all shadow-md"
              >
                <Play size={14} className="fill-current" /> Play all
              </button>
            )}
          </div>

          {!isOnline && downloadedTracks.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--color-lime)]/10 border border-[var(--color-lime)]/30 text-xs font-semibold text-[var(--color-lime)]">
              <WifiOff size={14} /> You are offline — playing from downloads.
            </div>
          )}

          {downloadedTracks.length === 0 ? (
            <div className="p-8 rounded-3xl border-2 border-dashed border-[var(--color-panel-border)] flex flex-col items-center gap-2 text-center">
              <Download size={26} className="text-[var(--color-text-faint)]" />
              <p className="text-sm font-bold text-[var(--color-text-primary)]">No downloads yet</p>
              <p className="text-xs text-[var(--color-text-faint)] max-w-xs">
                Tap the <Download size={11} className="inline -mt-0.5" /> icon on any song row to save it here — it stays playable without internet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {downloadedTracks.map((meta) => {
                const t = metaToTrack(meta, downloadedCovers.get(meta.id) ?? null);
                return (
                  <div
                    key={meta.id}
                    onClick={() => playTrack(t, downloadedTracks.map((m) => metaToTrack(m, downloadedCovers.get(m.id) ?? null)))}
                    className={`flex items-center justify-between p-2 rounded-2xl border cursor-pointer transition-all ${currentTrack?.id === meta.id ? 'bg-[var(--color-lime)]/15 border-[var(--color-lime)]' : 'bg-[var(--color-panel)]/60 border-transparent hover:border-[var(--color-panel-border)] hover:bg-[var(--color-panel)]'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-[var(--color-ink-soft)] shadow-sm">
                        {downloadedCovers.get(meta.id) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={downloadedCovers.get(meta.id)!} alt={meta.title} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className={`text-xs md:text-sm font-bold truncate ${currentTrack?.id === meta.id ? 'text-[var(--color-lime)]' : 'text-[var(--color-text-primary)]'}`}>
                          {meta.title}
                        </h4>
                        <p className="text-[11px] text-[var(--color-text-faint)] truncate mt-0.5">
                          {meta.artist} • {formatBytes(meta.fileSize)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTrack(meta.id).then(() => {
                            refreshStorage();
                          });
                        }}
                        title="Remove download"
                        className="p-2 rounded-full hover:bg-[var(--color-panel-border)]/30 text-[var(--color-text-secondary)] hover:text-[var(--color-coral)] transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button className="p-2 rounded-full text-[var(--color-lime)] hover:scale-110 transition-transform">
                        <Play size={16} className="fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION: LIKED */}
      {section === 'LIKED' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-[var(--color-text-primary)]">
              Liked Songs ({filteredLiked.length})
            </h3>
            {filteredLiked.length > 0 && (
              <button
                onClick={() => playTrack(filteredLiked[0], filteredLiked)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black hover:scale-105 transition-all shadow-md"
              >
                <Play size={14} className="fill-current" /> Play All
              </button>
            )}
          </div>

          {filteredLiked.length === 0 ? (
            <div className="text-center py-16 text-sm text-[var(--color-text-faint)]">
              No liked songs found. Tap ❤️ on any song to add it!
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredLiked.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  isCurrent={currentTrack?.id === t.id}
                  onPlay={() => playTrack(t, filteredLiked)}
                  isLiked={isLiked(t.id)}
                  onToggleLike={() => toggleLike(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION: ALL SONGS */}
      {section === 'SONGS' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-[var(--color-text-primary)]">
              All Library Tracks ({filteredSongs.length})
            </h3>
            {filteredSongs.length > 0 && (
              <button
                onClick={() => playTrack(filteredSongs[0], filteredSongs)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black hover:scale-105 transition-all shadow-md"
              >
                <Play size={14} className="fill-current" /> Play All
              </button>
            )}
          </div>

          {filteredSongs.length === 0 ? (
            <div className="text-center py-16 text-sm text-[var(--color-text-faint)]">
              No songs in your library yet.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredSongs.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  isCurrent={currentTrack?.id === t.id}
                  onPlay={() => playTrack(t, filteredSongs)}
                  isLiked={isLiked(t.id)}
                  onToggleLike={() => toggleLike(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION: PLAYLISTS */}
      {section === 'PLAYLISTS' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-black text-[var(--color-text-primary)]">
              Playlists & YouTube Importer
            </h3>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-panel)] border border-[var(--color-panel-border)] text-xs font-bold text-[var(--color-lime)] hover:border-[var(--color-lime)] transition-all"
            >
              <Plus size={15} /> Create Playlist
            </button>
          </div>

          {/* YouTube Importer Input */}
          <form onSubmit={handleImportPlaylist} className="flex gap-2 p-3 rounded-2xl bg-[var(--color-panel)] border border-[var(--color-panel-border)]">
            <input
              type="text"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste YouTube or YouTube Music playlist link..."
              className="flex-1 bg-transparent text-xs text-[var(--color-text-primary)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isImporting}
              className="px-4 py-2 rounded-xl bg-[var(--color-lime)] text-[var(--color-ink)] font-bold text-xs shrink-0 hover:scale-105 transition-all"
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          </form>

          {showCreate && (
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                placeholder="Playlist name..."
                className="flex-1 p-3 rounded-2xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] text-xs text-[var(--color-text-primary)] focus:outline-none"
              />
              <button
                type="submit"
                className="px-5 py-3 rounded-2xl bg-[var(--color-lime)] text-[var(--color-ink)] font-bold text-xs"
              >
                Save
              </button>
            </form>
          )}

          {filteredPlaylists.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--color-text-faint)]">
              No playlists found. Create one above!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredPlaylists.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-3xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] flex flex-col justify-between gap-3 group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-extrabold text-[var(--color-text-primary)]">
                        {p.title}
                      </h4>
                      <p className="text-xs text-[var(--color-text-faint)]">
                        {p.tracks.length} tracks
                      </p>
                    </div>
                    <button
                      onClick={() => deletePlaylist(p.id)}
                      className="p-1.5 rounded-full text-[var(--color-text-faint)] hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {p.tracks.length > 0 && (
                    <button
                      onClick={() => playTrack(p.tracks[0], p.tracks)}
                      className="flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--color-lime)]/15 text-[var(--color-lime)] text-xs font-bold hover:bg-[var(--color-lime)] hover:text-[var(--color-ink)] transition-all"
                    >
                      <Play size={14} className="fill-current" /> Play Playlist
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION: ARTISTS */}
      {section === 'ARTISTS' && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-black text-[var(--color-text-primary)]">
            Artists ({filteredArtists.length})
          </h3>

          {filteredArtists.length === 0 ? (
            <div className="text-center py-16 text-sm text-[var(--color-text-faint)]">
              No artists found. Start playing music to see artists populate here!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredArtists.map((a) => (
                <div
                  key={a.name}
                  onClick={() => playTrack(a.tracks[0], a.tracks)}
                  className="p-4 rounded-3xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] flex flex-col items-center gap-3 cursor-pointer hover:border-[var(--color-lime)]/50 transition-all text-center group"
                >
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--color-ink-soft)] border-2 border-transparent group-hover:border-[var(--color-lime)] transition-all shadow-lg">
                    {a.artwork ? (
                      <Image src={a.artwork} alt={a.name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User size={32} className="text-[var(--color-lime)]" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-extrabold truncate text-[var(--color-text-primary)] group-hover:text-[var(--color-lime)]">
                      {a.name}
                    </h5>
                    <p className="text-[10px] text-[var(--color-text-faint)]">
                      {a.tracks.length} tracks
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= Shared pieces ================= */

/** OfflineTrackMeta → playable Track (cover comes from the local blob URL). */
function metaToTrack(meta: OfflineTrackMeta, coverUrl: string | null): Track {
  return {
    id: meta.id,
    videoId: meta.id,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    durationSeconds: meta.duration,
    thumbnailUrl: coverUrl,
  };
}

function TrackRow({
  track,
  isCurrent,
  onPlay,
  isLiked,
  onToggleLike
}: {
  track: Track;
  isCurrent: boolean;
  onPlay: () => void;
  isLiked: boolean;
  onToggleLike: () => void;
}) {
  const formatSecs = (secs: number) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return ` • ${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      onClick={onPlay}
      className={`flex items-center justify-between p-2 rounded-2xl border cursor-pointer transition-all ${isCurrent ? 'bg-[var(--color-lime)]/15 border-[var(--color-lime)]' : 'bg-[var(--color-panel)]/60 border-transparent hover:border-[var(--color-panel-border)] hover:bg-[var(--color-panel)]'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-[var(--color-ink-soft)] shadow-sm">
          {track.thumbnailUrl && (
            <Image src={track.thumbnailUrl} alt={track.title} fill className="object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <h4 className={`text-xs md:text-sm font-bold truncate ${isCurrent ? 'text-[var(--color-lime)]' : 'text-[var(--color-text-primary)]'}`}>
            {track.title}
          </h4>
          <p className="text-[11px] text-[var(--color-text-faint)] truncate mt-0.5">
            {track.artist} {formatSecs(track.durationSeconds)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DownloadButton track={track} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike();
          }}
          className="p-2 rounded-full hover:bg-[var(--color-panel-border)]/30 text-[var(--color-text-secondary)] hover:text-[var(--color-lime)] transition-colors"
        >
          <Heart size={16} className={isLiked ? 'fill-[var(--color-lime)] text-[var(--color-lime)]' : ''} />
        </button>
        <button className="p-2 rounded-full text-[var(--color-lime)] hover:scale-110 transition-transform">
          <Play size={16} className="fill-current" />
        </button>
      </div>
    </div>
  );
}
