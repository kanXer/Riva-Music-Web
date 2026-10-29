'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useMusic, ALL_LANGUAGES } from '@/context/MusicContext';
import { Player } from '@/components/Player';
import { LanguageModal } from '@/components/LanguageModal';
import { ProfileModal } from '@/components/ProfileModal';
import { LibraryView } from '@/components/LibraryView';
import { CollectionSheet } from '@/components/CollectionSheet';
import { DownloadButton } from '@/components/DownloadButton';
import { getSession, clearSession, RivaProfile } from '@/components/LoginGate';
import { useOfflineStatus } from '@/lib/offlineHooks';
import { HomeSection, Track, SearchItem } from '@/types';
import {
  House,
  Search,
  ListMusic,
  AudioLines,
  RefreshCw,
  Play,
  History,
  X,
  User,
  LogOut,
  Music,
  Disc3,
  ListPlus,
  ArrowUpRight,
  Headphones,
  ArrowRight,
  WifiOff,
  Mic,
  Heart
} from 'lucide-react';

type Tab = 'home' | 'search' | 'library';
type SearchFilter = 'songs' | 'albums' | 'artists' | 'playlists';

const FILTER_LABELS: Record<SearchFilter, string> = {
  songs: 'Songs',
  albums: 'Albums',
  artists: 'Artists',
  playlists: 'Playlists'
};

const VIBE_CHIPS = ['Arijit Singh', 'Lo-Fi', 'Bollywood', 'Pop', 'Chill', 'Workout', 'Indie', 'Romantic'];
const DEFAULT_MOODS = ['Lo-Fi', 'Pop', 'Chill', 'Workout', 'Party'];

export default function Home() {
  const {
    selectedRegion,
    selectedLanguages,
    playTrack,
    currentTrack,
    recentTracks,
    searchHistory,
    addSearchHistory,
    removeSearchHistory,
    clearSearchHistory
  } = useMusic();

  const [selectedTab, setSelectedTab] = useState<Tab>('home');
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [isLoadingHome, setIsLoadingHome] = useState(true);
  const [homeError, setHomeError] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState<RivaProfile | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('songs');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionItems, setSuggestionItems] = useState<SearchItem[]>([]);

  // Collection sheet
  const [collection, setCollection] = useState<{ browseId: string; title: string } | null>(null);

  const searchJobRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep-link: /#search or /#library opens that tab after mount (avoids SSR mismatch);
  // /?q=<term> pre-fills and runs a search
  useEffect(() => {
    const applyDeepLink = () => {
      const h = window.location.hash.replace('#', '');
      if (h === 'search' || h === 'library') setSelectedTab(h);
      const q = new URLSearchParams(window.location.search).get('q');
      if (q) {
        setSelectedTab('search');
        setSearchQuery(q);
      }
    };
    applyDeepLink();
  }, []);

  // Logged-in user (from LoginGate session — Firebase or guest)
  const [userProfile, setUserProfile] = useState<{ name: string; photoUrl?: string | null } | null>(null);
  const { isOnline } = useOfflineStatus();
  useEffect(() => {
    const sync = () => {
      const p = getSession();
      setProfileData(p);
      setUserProfile(p ? { name: p.name, photoUrl: p.photoUrl } : null);
    };
    sync();
    const handler = () => sync();
    window.addEventListener('riva-auth', handler);
    return () => window.removeEventListener('riva-auth', handler);
  }, []);

  const handleOpenProfile = () => {
    setIsProfileOpen(true);
  };

  // ---- Home feed ----
  const loadHome = useCallback(async () => {
    setIsLoadingHome(true);
    setHomeError(false);
    try {
      const langs = selectedLanguages.join(',');
      const res = await fetch(`/api/home?gl=${selectedRegion}&languages=${encodeURIComponent(langs)}`);
      const data = await res.json();
      if (data.sections) setSections(data.sections);
      else setHomeError(true);
    } catch (_) {
      setHomeError(true);
    } finally {
      setIsLoadingHome(false);
    }
  }, [selectedRegion, selectedLanguages]);

  useEffect(() => {
    const run = () => { loadHome(); };
    run();
  }, [loadHome]);

  // ---- Debounced search (260ms, like the app) ----
  useEffect(() => {
    if (searchJobRef.current) clearTimeout(searchJobRef.current);
    const q = searchQuery.trim();
    if (!q) {
      const reset = () => {
        setSuggestions([]);
        setSuggestionItems([]);
        setSearchResults([]);
        setIsSearching(false);
      };
      reset();
      return;
    }
    const run = async () => {
      setIsSearching(true);
      try {
        const [sugRes, searchRes] = await Promise.all([
          fetch(`/api/suggestions?q=${encodeURIComponent(q)}&gl=${selectedRegion}`),
          fetch(`/api/search?q=${encodeURIComponent(q)}&filter=${searchFilter}&gl=${selectedRegion}`)
        ]);
        const sugData = await sugRes.json();
        const searchData = await searchRes.json();
        setSuggestions((sugData.queries || []).filter((s: string) => s.toLowerCase() !== q.toLowerCase()));
        setSuggestionItems(sugData.items || []);
        setSearchResults(searchData.results || []);
      } catch (_) {}
      finally { setIsSearching(false); }
    };
    searchJobRef.current = setTimeout(run, 260);
    return () => { if (searchJobRef.current) clearTimeout(searchJobRef.current); };
  }, [searchQuery, searchFilter, selectedRegion]);

  const executeSearch = (term: string) => {
    setSearchQuery(term);
    addSearchHistory(term);
  };

  const openCollection = (item: SearchItem) => {
    const bid = item.browseId || (item.type === 'playlist' ? item.id : '');
    if (!bid) return;
    setCollection({ browseId: bid, title: item.title });
  };

  const onSearchItemClick = (item: SearchItem) => {
    if ((item.type === 'song' || item.type === 'video') && item.videoId) {
      const track: Track = {
        id: item.videoId,
        videoId: item.videoId,
        title: item.title,
        artist: item.artist,
        durationSeconds: item.durationSeconds,
        thumbnailUrl: item.thumbnailUrl
      };
      playTrack(track, searchResults.filter(r => r.videoId).map(r => ({
        id: r.videoId!, videoId: r.videoId!, title: r.title, artist: r.artist,
        durationSeconds: r.durationSeconds, thumbnailUrl: r.thumbnailUrl
      })));
    } else {
      openCollection(item);
    }
  };

  const moodChips = Array.from(new Set([...selectedLanguages, ...DEFAULT_MOODS]));

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const isLanguageChip = (chip: string) => ALL_LANGUAGES.includes(chip);

  return (
    <div className="min-h-screen flex flex-col pb-40 sm:pb-32 text-[var(--color-text-primary)]">
      {/* ================= MAIN CONTENT ================= */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-6 md:px-8">
        {/* ---------- TAB 0: HOME ---------- */}
        {selectedTab === 'home' && (
          <div className="flex flex-col gap-5 pt-4">
            {/* HomeHeader */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* BrandMark: gradient square + GraphicEq */}
                <div
                  className="w-[38px] h-[38px] rounded-2xl flex items-center justify-center shadow-lg shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--color-lime), var(--color-coral), var(--color-lime-deep))' }}
                >
                  <AudioLines size={21} className="text-[var(--color-ink)]" />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight leading-none">Riva Music</h1>
                  <p className="text-[9px] font-bold text-[var(--color-lime)] tracking-wide">by Nexus Digital</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CircleIconBtn onClick={() => setSelectedTab('search')} title="Search">
                  <Search size={17} />
                </CircleIconBtn>
                <CircleIconBtn onClick={loadHome} title="Refresh">
                  <RefreshCw size={17} className={isLoadingHome ? 'animate-spin text-[var(--color-lime)]' : ''} />
                </CircleIconBtn>
                <CircleIconBtn onClick={handleOpenProfile} title={`My Profile (${userProfile?.name || 'Guest'})`}>
                  {userProfile?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={userProfile.photoUrl} alt={userProfile.name} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={17} />
                  )}
                </CircleIconBtn>
              </div>
            </div>

            {/* Greeting */}
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">{greeting()}, {userProfile?.name || 'music lover'}</p>
              <h2 className="text-[22px] font-black tracking-tight mt-0.5">What do you want to hear?</h2>
            </div>

            {/* RIVA SELECTS HeroCard */}
            <div
              className="relative overflow-hidden rounded-[28px] p-6 min-h-[188px] flex flex-col justify-center"
              style={{ background: 'linear-gradient(120deg, var(--color-section-a-top, #2E1410), var(--color-section-a-mid, #3A1C12), var(--color-section-a-bottom, #1D0F0C))' }}
            >
              {/* radial glow blobs */}
              <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-[var(--color-lime)]/25 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-8 w-48 h-48 rounded-full bg-[var(--color-coral)]/20 blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-1.5">
                  <Headphones size={14} className="text-[var(--color-lime)]" />
                  <span className="text-[11px] font-black tracking-[0.12em] text-[var(--color-lime)]">RIVA SELECTS</span>
                </div>
                <h3 className="text-2xl font-black leading-tight mt-2.5">Your day,<br />your soundtrack.</h3>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mt-2">Stream it. Save it. Own the moment.</p>
                <button
                  onClick={() => setSelectedTab('search')}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black active:scale-95 transition-transform"
                >
                  Explore music <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* Mood / language chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
              {moodChips.map(chip => {
                const selected = selectedLanguages.includes(chip);
                return (
                  <button
                    key={chip}
                    onClick={() => {
                      if (isLanguageChip(chip)) setIsLangOpen(true);
                      else { setSelectedTab('search'); executeSearch(chip); }
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-bold border shrink-0 transition-all ${
                      selected
                        ? 'bg-[var(--color-lime)]/[0.18] border-[var(--color-lime)]/50 text-[var(--color-lime)]'
                        : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            {/* Recently played */}
            {recentTracks.length > 0 && (
              <SectionBlock title="Recently played" subtitle="Pick up where you left off">
                {recentTracks.slice(0, 12).map((t, i) => (
                  <TrackCard key={t.id} track={t} isCurrent={currentTrack?.id === t.id} queue={recentTracks} />
                ))}
              </SectionBlock>
            )}

            {/* Home sections */}
            {isLoadingHome && sections.length === 0 ? (
              <HomeSkeleton />
            ) : homeError ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <WifiOff size={28} className="text-[var(--color-coral)]" />
                <p className="text-base font-black">Couldn&apos;t load the feed</p>
                <p className="text-xs text-[var(--color-text-secondary)]">Check your connection and try again.</p>
                <button onClick={loadHome} className="mt-2 px-5 py-2.5 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black">
                  Retry
                </button>
              </div>
            ) : (
              sections.map(section => (
                <SectionBlock
                  key={section.id}
                  title={section.title}
                  subtitle={section.subtitle}
                  action={section.id === 'trending' ? 'See all' : 'See all'}
                  onAction={() => { setSelectedTab('search'); executeSearch(section.title); }}
                >
                  {section.tracks.map((t, i) => (
                    <TrackCard
                      key={t.id}
                      track={t}
                      isCurrent={currentTrack?.id === t.id}
                      queue={section.tracks}
                      rank={section.id === 'trending' ? i + 1 : undefined}
                    />
                  ))}
                </SectionBlock>
              ))
            )}
          </div>
        )}

        {/* ---------- TAB 1: SEARCH ---------- */}
        {selectedTab === 'search' && (
          <div className="flex flex-col gap-4 pt-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Search</h2>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Songs, artists, albums and playlists.</p>
            </div>

            {/* Search bar */}
            <div className="flex items-center gap-2.5 bg-[var(--color-panel)] border rounded-[18px] px-4 py-3 focus-within:border-[var(--color-lime)]/70 transition-colors" style={{ borderColor: 'var(--color-panel-border)' }}>
              <Search size={18} className="text-[var(--color-lime)] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeSearch(searchQuery)}
                placeholder="Search Riva Music..."
                className="flex-1 bg-transparent text-sm font-medium placeholder-[var(--color-text-faint)] focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); setSuggestions([]); setSuggestionItems([]); }} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
                  <X size={17} />
                </button>
              )}
              <MicButton onResult={(text) => executeSearch(text)} />
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {(Object.keys(FILTER_LABELS) as SearchFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setSearchFilter(f)}
                  className={`px-4 py-2 rounded-full text-xs font-bold border shrink-0 transition-all ${
                    searchFilter === f
                      ? 'bg-[var(--color-lime)] border-[var(--color-lime)] text-[var(--color-ink)]'
                      : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>

            {/* Progress */}
            {(isSearching) && (
              <div className="h-1 rounded-full bg-[var(--color-panel)] overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-[var(--color-lime)] animate-[searchslide_1s_ease-in-out_infinite]" />
              </div>
            )}

            {/* Empty query state: history + vibes */}
            {!searchQuery.trim() ? (
              <div className="flex flex-col gap-5">
                {searchHistory.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black">Recent searches</h3>
                      <button onClick={clearSearchHistory} className="text-[11px] font-bold text-[var(--color-lime)]">Clear</button>
                    </div>
                    {searchHistory.map(term => (
                      <div key={term} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[var(--color-panel)]">
                        <History size={17} className="text-[var(--color-text-faint)] shrink-0" />
                        <button onClick={() => executeSearch(term)} className="flex-1 text-left text-sm truncate">{term}</button>
                        <button onClick={() => removeSearchHistory(term)} className="p-1.5 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-black">Start with a vibe</h3>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {VIBE_CHIPS.map(v => (
                      <button
                        key={v}
                        onClick={() => executeSearch(v)}
                        className="px-4 py-2 rounded-full bg-[var(--color-panel)] border border-[var(--color-panel-border)] text-xs font-bold text-[var(--color-text-secondary)] hover:border-[var(--color-lime)]/50 transition-all"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SearchHintCard */}
                <div className="rounded-[22px] bg-gradient-to-br from-[var(--color-panel)] via-[var(--color-panel-elevated)] to-[var(--color-panel)] border border-[var(--color-panel-border)] p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-[15px] bg-[var(--color-lime)]/[0.12] flex items-center justify-center shrink-0">
                    <AudioLines size={22} className="text-[var(--color-lime)]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black">Search the whole catalogue</h4>
                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
                      Millions of songs from YouTube Music — filtered for real songs, no mixes or jukeboxes.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Suggestions */}
                {suggestions.length > 0 && (searchFilter === 'songs') && (
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-sm font-black px-1 pb-1">Suggestions</h3>
                    {suggestions.slice(0, 6).map(s => (
                      <button
                        key={s}
                        onClick={() => executeSearch(s)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[var(--color-panel)] text-left"
                      >
                        <span className="flex items-center gap-3 text-sm truncate">
                          <Search size={14} className="text-[var(--color-text-faint)] shrink-0" />
                          {s}
                        </span>
                        <ArrowUpRight size={14} className="text-[var(--color-text-faint)] shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Recommended songs (from suggestions items) */}
                {searchFilter === 'songs' && suggestionItems.filter(i => i.videoId).length > 0 && (
                  <SectionBlock title="Recommended songs" subtitle={`Based on "${searchQuery}"`}>
                    {suggestionItems.filter(i => i.videoId).slice(0, 8).map(item => (
                      <TrackCard
                        key={item.id}
                        track={{
                          id: item.videoId!,
                          videoId: item.videoId!,
                          title: item.title,
                          artist: item.artist,
                          durationSeconds: item.durationSeconds,
                          thumbnailUrl: item.thumbnailUrl
                        }}
                        isCurrent={currentTrack?.id === item.videoId}
                        queue={suggestionItems.filter(i => i.videoId).map(i => ({
                          id: i.videoId!, videoId: i.videoId!, title: i.title, artist: i.artist,
                          durationSeconds: i.durationSeconds, thumbnailUrl: i.thumbnailUrl
                        }))}
                      />
                    ))}
                  </SectionBlock>
                )}

                {/* Explore (non-song results) */}
                {searchFilter === 'songs' && searchResults.filter(r => r.type !== 'song' && r.type !== 'video').length > 0 && (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black px-1 pb-1">Explore</h3>
                    {searchResults.filter(r => r.type !== 'song' && r.type !== 'video').slice(0, 3).map(item => (
                      <SearchItemRow key={item.id} item={item} onClick={() => openCollection(item)} />
                    ))}
                  </div>
                )}

                {/* Main results */}
                {(() => {
                  const songs = searchResults.filter(r => r.type === 'song' || r.type === 'video');
                  const others = searchFilter !== 'songs' ? searchResults : [];
                  const list = searchFilter === 'songs' ? songs : others;
                  if (list.length === 0 && !isSearching) {
                    return (
                      <div className="flex flex-col items-center gap-3 py-14 text-center">
                        <Search size={26} className="text-[var(--color-sky)]" />
                        <p className="text-base font-black">No matches yet</p>
                        <p className="text-xs text-[var(--color-text-secondary)] max-w-60">
                          Try a different spelling, an artist name, or a mood like &quot;lofi&quot;.
                        </p>
                      </div>
                    );
                  }
                  if (searchFilter === 'songs') {
                    return (
                      <div className="flex flex-col gap-0.5">
                        {songs.length > 0 && <h3 className="text-sm font-black px-1 py-1">Songs</h3>}
                        {songs.map(item => (
                          <TrackResultRow
                            key={item.id}
                            item={item}
                            isCurrent={currentTrack?.id === item.videoId}
                            onClick={() => onSearchItemClick(item)}
                          />
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-2 px-1 py-1">
                        <h3 className="text-sm font-black">{FILTER_LABELS[searchFilter]}</h3>
                        <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">{list.length} results</span>
                      </div>
                      {list.map(item => (
                        <SearchItemRow key={item.id} item={item} onClick={() => onSearchItemClick(item)} />
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ---------- TAB 2: LIBRARY ---------- */}
        {selectedTab === 'library' && (
          <LibraryView onOpenSearch={() => setSelectedTab('search')} />
        )}
      </main>

      {/* ================= PLAYER ================= */}
      <Player />

      {/* ================= COLLECTION SHEET ================= */}
      {collection && (
        <CollectionSheet
          browseId={collection.browseId}
          fallbackTitle={collection.title}
          onClose={() => setCollection(null)}
        />
      )}

      {/* ================= OFFLINE BANNER ================= */}
      {!isOnline && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-panel-elevated)] border border-[var(--color-coral)]/50 shadow-xl backdrop-blur-xl">
          <WifiOff size={14} className="text-[var(--color-coral)]" />
          <span className="text-[11px] font-bold text-[var(--color-text-primary)]">Offline — playing downloads only</span>
        </div>
      )}

      {/* ================= BOTTOM NAV ================= */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-ink-soft)]/[0.97] backdrop-blur-2xl border-t border-[var(--color-panel-border)] px-6 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around sm:max-w-md sm:mx-auto sm:left-1/2 sm:-translate-x-1/2 sm:rounded-t-2xl sm:border-x"
        style={{ height: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {([
          { id: 'home' as Tab, icon: <House size={20} />, label: 'Home' },
          { id: 'search' as Tab, icon: <Search size={20} />, label: 'Search' },
          { id: 'library' as Tab, icon: <ListMusic size={20} />, label: 'Library' }
        ]).map(item => {
          const active = selectedTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSelectedTab(item.id)}
              className="flex flex-col items-center gap-0.5 py-1 px-5"
            >
              <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-all ${active ? 'bg-[var(--color-lime)]' : ''}`}>
                <span className={active ? 'text-[var(--color-ink)]' : 'text-[var(--color-text-faint)]'}>
                  {item.icon}
                </span>
              </span>
              <span className={`text-[10px] font-bold ${active ? 'text-[var(--color-lime)]' : 'text-[var(--color-text-faint)]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <LanguageModal isOpen={isLangOpen} onClose={() => setIsLangOpen(false)} />
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profileData}
        onOpenLanguages={() => setIsLangOpen(true)}
      />
    </div>
  );
}

/* ================= Shared pieces ================= */

function CircleIconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-full bg-[var(--color-panel-elevated)] border border-[var(--color-panel-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-lime)] transition-colors"
    >
      {children}
    </button>
  );
}

function SectionBlock({ title, subtitle, action, onAction, children }: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between px-0.5">
        <div>
          <h3 className="text-lg font-black tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-[var(--color-text-secondary)]">{subtitle}</p>}
        </div>
        {action && (
          <button
            onClick={onAction}
            className="px-2.5 py-1.5 rounded-full bg-[var(--color-panel)] border border-[var(--color-panel-border)] text-[11px] font-bold text-[var(--color-lime)]"
          >
            {action}
          </button>
        )}
      </div>
      <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
        {children}
      </div>
    </div>
  );
}

/* TrackCard — 150dp square artwork r22, play overlay, rank/playing badge */
function TrackCard({ track, isCurrent, queue, rank }: { track: Track; isCurrent: boolean; queue: Track[]; rank?: number }) {
  const { playTrack } = useMusic();
  return (
    <div className="w-[150px] shrink-0 flex flex-col">
      <div
        onClick={() => playTrack(track, queue)}
        className="relative w-[150px] h-[150px] rounded-[22px] overflow-hidden cursor-pointer bg-gradient-to-br from-[var(--color-panel-elevated)] via-[var(--color-panel)] to-[var(--color-panel)] border border-[var(--color-panel-border)]/50"
      >
        {track.thumbnailUrl ? (
          <Image src={track.thumbnailUrl} alt={track.title} fill sizes="150px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={34} className="text-[var(--color-lime)]/80" />
          </div>
        )}
        {/* play overlay */}
        <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-[var(--color-lime)] flex items-center justify-center shadow-lg">
          <Play size={17} className="text-[var(--color-ink)] fill-[var(--color-ink)] ml-0.5" />
        </div>
        {/* rank / playing badge */}
        {isCurrent ? (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-[var(--color-ink)]/[0.78] text-[var(--color-lime)] text-[9px] font-black tracking-wide">PLAYING</span>
        ) : rank !== undefined && (
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[9px] font-black ${rank <= 3 ? 'bg-[var(--color-lime)] text-[var(--color-ink)]' : 'bg-[var(--color-ink)]/[0.82] text-[var(--color-lime)]'}`}>
            #{rank}
          </span>
        )}
      </div>
      <h4 className={`text-[13px] font-bold truncate mt-2.5 ${isCurrent ? 'text-[var(--color-lime)]' : ''}`}>{track.title}</h4>
      <p className="text-[11px] text-[var(--color-text-secondary)] truncate">{track.artist}</p>
    </div>
  );
}

/* SearchItemRow — explore rows (album/artist/playlist/video) */
function SearchItemRow({ item, onClick }: { item: SearchItem; onClick: () => void }) {
  const round = item.type === 'artist';
  const typeIcon = item.type === 'artist' ? <User size={18} /> : item.type === 'album' ? <Disc3 size={18} /> : <ListPlus size={18} />;
  const typeLabel = item.type === 'song' ? 'Song' : item.type === 'video' ? 'Video' : item.type === 'album' ? 'Album' : item.type === 'artist' ? 'Artist' : 'Playlist';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 mx-3.5 p-2 rounded-[18px] hover:bg-[var(--color-panel)] text-left transition-colors"
    >
      <div className={`relative w-[58px] h-[58px] overflow-hidden bg-[var(--color-ink-soft)] shrink-0 ${round ? 'rounded-full' : 'rounded-[14px]'}`}>
        {item.thumbnailUrl ? (
          <Image src={item.thumbnailUrl} alt={item.title} fill sizes="58px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-text-faint)]">{typeIcon}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-[13px] font-bold truncate">{item.title}</h4>
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] truncate">
          <span className="truncate">{item.subtitle || item.artist}</span>
          <span className="px-1.5 py-px rounded bg-[var(--color-panel-elevated)] text-[9px] font-bold text-[var(--color-lime)] shrink-0">{typeLabel}</span>
        </p>
      </div>
      <ArrowUpRight size={16} className="text-[var(--color-text-faint)] shrink-0" />
    </button>
  );
}

/* TrackResultRow — song rows with like heart */
function TrackResultRow({ item, isCurrent, onClick }: { item: SearchItem; isCurrent: boolean; onClick: () => void }) {
  const { isLiked, toggleLike } = useMusic();
  const liked = item.videoId ? isLiked(item.videoId) : false;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 mx-3.5 p-2 rounded-[18px] cursor-pointer border transition-all ${isCurrent ? 'bg-[var(--color-lime)]/10 border-[var(--color-lime)]/30' : 'border-transparent hover:bg-[var(--color-panel)]'}`}
    >
      <div className="relative w-[58px] h-[58px] rounded-[14px] overflow-hidden bg-[var(--color-ink-soft)] shrink-0">
        {item.thumbnailUrl ? (
          <Image src={item.thumbnailUrl} alt={item.title} fill sizes="58px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Music size={18} /></div>
        )}
        {isCurrent && (
          <div className="absolute inset-0 bg-[var(--color-ink)]/40 flex items-center justify-center">
            <AudioLines size={20} className="text-[var(--color-lime)]" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className={`text-[13px] font-bold truncate ${isCurrent ? 'text-[var(--color-lime)]' : ''}`}>{item.title}</h4>
        <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
          {item.artist}{item.durationSeconds ? ` • ${Math.floor(item.durationSeconds / 60)}:${String(item.durationSeconds % 60).padStart(2, '0')}` : ''}
        </p>
      </div>
      <DownloadButton
        track={{
          id: item.id,
          videoId: item.videoId,
          title: item.title,
          artist: item.artist,
          album: item.album,
          durationSeconds: item.durationSeconds,
          thumbnailUrl: item.thumbnailUrl,
        }}
        size={18}
      />
      <button
        onClick={(e) => { e.stopPropagation(); if (item.videoId) toggleLike({ id: item.videoId, videoId: item.videoId, title: item.title, artist: item.artist, durationSeconds: item.durationSeconds, thumbnailUrl: item.thumbnailUrl }); }}
        className="p-2 rounded-full shrink-0 text-[var(--color-text-secondary)]"
      >
        <Heart size={18} className={liked ? 'fill-[var(--color-coral)] text-[var(--color-coral)]' : ''} />
      </button>
    </div>
  );
}

/* Mic button with Web Speech API (app has voice search) */
type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

function MicButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const start = () => {
    const w = window as {
      SpeechRecognition?: new () => {
        lang: string;
        onresult: ((e: SpeechResultEvent) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        onresult: ((e: SpeechResultEvent) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
      };
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.onresult = (e: SpeechResultEvent) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };
  const hasSpeech = typeof window !== 'undefined' &&
    !!((window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
       (window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  if (!hasSpeech) return null;
  return (
    <button onClick={start} title="Voice search" className={`shrink-0 ${listening ? 'text-[var(--color-lime)] animate-pulse' : 'text-[var(--color-lime)]'}`}>
      <Mic size={19} />
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse pb-6">
      {[1, 2].map(n => (
        <div key={n} className="flex flex-col gap-3">
          <div className="h-5 w-44 rounded-lg bg-[var(--color-panel)]" />
          <div className="flex gap-3.5 overflow-hidden">
            {[1, 2, 3, 4].map(c => (
              <div key={c} className="w-[150px] shrink-0 flex flex-col gap-2">
                <div className="w-[150px] h-[150px] rounded-[22px] bg-[var(--color-panel-elevated)]" />
                <div className="h-3 w-32 rounded bg-[var(--color-panel)]" />
                <div className="h-2.5 w-20 rounded bg-[var(--color-panel)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
