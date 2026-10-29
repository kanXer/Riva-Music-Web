'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Track, Playlist, RepeatMode, ThemeMode, LyricLine } from '@/types';
import { getPlaybackUrl, getCoverUrl, isTrackDownloaded } from '@/lib/offlineStore';

interface MusicContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
  selectedRegion: string;
  setSelectedRegion: (region: string) => void;
  selectedLanguages: string[];
  setSelectedLanguages: (langs: string[]) => void;

  // Connectivity / offline playback
  isOnline: boolean;
  streamError: string | null;

  // Player state
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  currentTime: number;
  duration: number;
  queue: Track[];
  queueIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  volume: number;

  // Player Controls
  playTrack: (track: Track, newQueue?: Track[], shuffleFirst?: boolean) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  cycleRepeatMode: () => void;
  toggleShuffle: () => void;
  setVolume: (vol: number) => void;

  // Full Screen / Lyrics Modal
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  showLyrics: boolean;
  setShowLyrics: (val: boolean) => void;
  lyrics: LyricLine[];
  plainLyrics: string[];
  lyricsSource: string | null;
  isLoadingLyrics: boolean;
  lyricOffsetMs: number;
  setLyricOffsetMs: (ms: number) => void;

  // Library / Liked / History / Playlists
  likedTracks: Track[];
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  recentTracks: Track[];
  playlists: Playlist[];
  createPlaylist: (title: string) => Playlist | null;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  searchHistory: string[];
  addSearchHistory: (term: string) => void;
  removeSearchHistory: (term: string) => void;
  clearSearchHistory: () => void;

  // Sleep Timer
  sleepTimerMinutes: number | null;
  sleepRemainingSeconds: number;
  setSleepTimerMinutes: (minutes: number | null) => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

export const AVAILABLE_REGIONS = [
  { code: 'IN', name: 'India 🇮🇳' },
  { code: 'US', name: 'United States 🇺🇸' },
  { code: 'GB', name: 'United Kingdom 🇬🇧' },
  { code: 'CA', name: 'Canada 🇨🇦' },
  { code: 'AE', name: 'UAE 🇦🇪' },
  { code: 'AU', name: 'Australia 🇦🇺' },
  { code: 'PK', name: 'Pakistan 🇵🇰' },
  { code: 'NP', name: 'Nepal 🇳🇵' },
  { code: 'WW', name: 'Worldwide 🌍' }
];

export const ALL_LANGUAGES = [
  'Hindi', 'English', 'Punjabi', 'Bhojpuri', 'Haryanvi',
  'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali',
  'Marathi', 'Gujarati', 'Rajasthani', 'Urdu'
];

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('riva_theme') as ThemeMode;
      if (saved === 'DARK' || saved === 'LIGHT' || saved === 'SYSTEM') return saved;
    }
    return 'SYSTEM';
  });
  const [selectedRegion, setSelectedRegionState] = useState('IN');
  const [selectedLanguages, setSelectedLanguagesState] = useState<string[]>(['Hindi']);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>('OFF');
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolumeState] = useState(1);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string[]>([]);
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricOffsetMs, setLyricOffsetMs] = useState(0);

  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const [sleepTimerMinutes, setSleepTimerState] = useState<number | null>(null);
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const isUsingYtRef = useRef<boolean>(false);
  const ytIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for stable callbacks (MediaSession / ended handler closures)
  const currentTrackRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<RepeatMode>('OFF');
  const isPlayingRef = useRef(false);
  const shuffleRef = useRef(false);
  const radioExtendedForRef = useRef<Set<string>>(new Set());

  // Mirror latest state into refs after every commit (never during render)
  useEffect(() => {
    currentTrackRef.current = currentTrack;
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    repeatModeRef.current = repeatMode;
    isPlayingRef.current = isPlaying;
    shuffleRef.current = shuffle;
  }, [currentTrack, queue, queueIndex, repeatMode, isPlaying, shuffle]);

  // Reactive connectivity status (drives the offline banner + download gating)
  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = useRef(true);
  useEffect(() => {
    const sync = () => {
      isOnlineRef.current = navigator.onLine;
      setIsOnline(navigator.onLine);
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // Initialize from LocalStorage
  useEffect(() => {
    const restore = () => {
      const savedTheme = localStorage.getItem('riva_theme') as ThemeMode;
      if (savedTheme === 'DARK' || savedTheme === 'LIGHT' || savedTheme === 'SYSTEM') setThemeModeState(savedTheme);

      const savedRegion = localStorage.getItem('riva_region');
      if (savedRegion) setSelectedRegionState(savedRegion);

      setSelectedLanguagesState(loadJSON<string[]>('riva_languages', ['Hindi']));
      setLikedTracks(loadJSON<Track[]>('riva_liked', []));
      setRecentTracks(loadJSON<Track[]>('riva_recent', []));
      setPlaylists(loadJSON<Playlist[]>('riva_playlists', []));
      setSearchHistory(loadJSON<string[]>('riva_search_history', []));
    };
    restore();
  }, []);

  // Theme apply
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const isDark =
        themeMode === 'DARK' ||
        (themeMode === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);

      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    try {
      localStorage.setItem('riva_theme', themeMode);
    } catch (_) {}

    if (themeMode === 'SYSTEM' && typeof window !== 'undefined' && 'matchMedia' in window) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => setThemeModeState(mode);
  const cycleThemeMode = () => {
    setThemeModeState(prev => {
      if (prev === 'SYSTEM') return 'LIGHT';
      if (prev === 'LIGHT') return 'DARK';
      return 'SYSTEM';
    });
  };

  const setSelectedRegion = (reg: string) => {
    setSelectedRegionState(reg);
    localStorage.setItem('riva_region', reg);
  };

  const setSelectedLanguages = (langs: string[]) => {
    // Hindi is force-ordered first (RivaViewModel)
    const ordered = ["Hindi", ...langs.filter(l => l.toLowerCase() !== 'hindi')];
    setSelectedLanguagesState(ordered);
    saveJSON('riva_languages', ordered);
  };

  const updateMediaSessionPositionState = () => {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      try {
        const curDur = isUsingYtRef.current
          ? (ytPlayerRef.current?.getDuration ? ytPlayerRef.current.getDuration() : 0)
          : (audioRef.current?.duration || 0);
        const curPos = isUsingYtRef.current
          ? (ytPlayerRef.current?.getCurrentTime ? ytPlayerRef.current.getCurrentTime() : 0)
          : (audioRef.current?.currentTime || 0);

        if (curDur && !isNaN(curDur) && curDur > 0) {
          navigator.mediaSession.setPositionState({
            duration: curDur,
            playbackRate: 1,
            position: Math.min(curPos, curDur)
          });
        }
      } catch (_) {}
    }
  };

  const seek = useCallback((seconds: number) => {
    if (isUsingYtRef.current && ytPlayerRef.current?.seekTo) {
      ytPlayerRef.current.seekTo(seconds, true);
      setCurrentTime(seconds);
      updateMediaSessionPositionState();
    } else if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      updateMediaSessionPositionState();
    }
  }, []);

  // ---- Stable next/previous handlers (declared before effects that use them) ----
  const handleNextTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    if (repeatModeRef.current === 'ONE') {
      seek(0);
      audioRef.current?.play();
      return;
    }
    let nextIdx = queueIndexRef.current + 1;
    if (nextIdx >= q.length) {
      if (repeatModeRef.current === 'ALL') {
        nextIdx = 0;
      } else {
        // Related chain: extend queue with radio tracks (like the app's autoplay)
        const current = currentTrackRef.current;
        if (current && !radioExtendedForRef.current.has(current.id)) {
          radioExtendedForRef.current.add(current.id);
          fetch(`/api/radio/${current.id}?gl=${localStorage.getItem('riva_region') || 'IN'}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => {
              const related: Track[] = (d.tracks || []).filter((t: Track) => !q.some(x => x.id === t.id));
              if (related.length > 0) {
                const extended = [...q, ...related];
                setQueue(extended);
                queueRef.current = extended;
                setQueueIndex(q.length);
                setCurrentTrack(related[0]);
              } else {
                setIsPlaying(false);
              }
            })
            .catch(() => setIsPlaying(false));
        } else {
          setIsPlaying(false);
        }
        return;
      }
    }
    setQueueIndex(nextIdx);
    setCurrentTrack(q[nextIdx]);
  }, [seek]);

  const handlePreviousTrack = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      seek(0);
      return;
    }
    const q = queueRef.current;
    if (q.length === 0) return;
    let prevIdx = queueIndexRef.current - 1;
    if (prevIdx < 0) prevIdx = q.length - 1;
    setQueueIndex(prevIdx);
    setCurrentTrack(q[prevIdx]);
  }, [seek]);

  const handleTrackEnded = useCallback(() => {
    if (repeatModeRef.current === 'ONE') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }
    handleNextTrack();
  }, [handleNextTrack]);

  // Audio element management & Events
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      updateMediaSessionPositionState();
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      updateMediaSessionPositionState();
    };
    const onEnded = () => handleTrackEnded();
    const onPlay = () => {
      setIsPlaying(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    };
    const onPause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };
    const onError = () => {
      setIsLoadingAudio(false);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (audioRef.current) {
            audioRef.current.play();
            setIsPlaying(true);
          }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => handlePreviousTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => handleNextTrack());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && audioRef.current) {
            audioRef.current.currentTime = details.seekTime;
            setCurrentTime(details.seekTime);
          }
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(audioRef.current.currentTime - (details.seekOffset || 10), 0);
          }
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          if (audioRef.current) {
            audioRef.current.currentTime = Math.min(audioRef.current.currentTime + (details.seekOffset || 10), audioRef.current.duration || 0);
          }
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
          }
        });
      } catch (err) {
        console.warn("MediaSession handler error:", err);
      }
    }

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.pause();
    };
  }, [handleTrackEnded, handleNextTrack, handlePreviousTrack]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(volume * 100);
  }, [volume]);

  // Load stream & lyrics on track change
  useEffect(() => {
    if (!currentTrack) return;

    let isSubscribed = true;

    // Check offline cover first for mediaSession
    const applyMediaSession = async () => {
      const videoId = currentTrack.videoId || currentTrack.id;
      let artworkSrc = currentTrack.thumbnailUrl || '/icon-512.png';
      if (await isTrackDownloaded(videoId)) {
        const localCover = await getCoverUrl(videoId);
        if (localCover) artworkSrc = localCover;
      }
      if ('mediaSession' in navigator && isSubscribed) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: "Riva Music",
          artwork: [96, 128, 192, 256, 384, 512].map(size => ({ src: artworkSrc, sizes: `${size}x${size}`, type: 'image/jpeg' }))
        });
      }
    };
    applyMediaSession();

    const resetStreamError = () => setStreamError(null);
    resetStreamError();

    // Helper: start YT IFrame playback fallback
    const startYtFallback = (vid: string) => {
      isUsingYtRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      const ensureYtPlayer = () => {
        if (!isSubscribed) return;
        const YT = (window as any).YT;
        if (!YT || !YT.Player) {
          // Load API script if not present
          if (!document.getElementById('yt-iframe-api-script')) {
            const tag = document.createElement('script');
            tag.id = 'yt-iframe-api-script';
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
          }
          setTimeout(ensureYtPlayer, 300);
          return;
        }

        if (ytPlayerRef.current && ytPlayerRef.current.loadVideoById) {
          try {
            ytPlayerRef.current.loadVideoById(vid);
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
            setIsLoadingAudio(false);
          } catch (_) {
            setTimeout(ensureYtPlayer, 300);
          }
          return;
        }

        // Initialize player in the hidden container
        try {
          ytPlayerRef.current = new YT.Player('riva-hidden-yt-player', {
            height: '10',
            width: '10',
            videoId: vid,
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              enablejsapi: 1,
              playsinline: 1,
              origin: window.location.origin
            },
            events: {
              onReady: (event: any) => {
                if (!isSubscribed) return;
                event.target.setVolume(volume * 100);
                event.target.playVideo();
                setIsPlaying(true);
                setIsLoadingAudio(false);
              },
              onStateChange: (event: any) => {
                if (!isSubscribed) return;
                // 1: PLAYING, 2: PAUSED, 0: ENDED
                if (event.data === 1) {
                  setIsPlaying(true);
                  setIsLoadingAudio(false);
                  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                  const dur = event.target.getDuration ? event.target.getDuration() : 0;
                  if (dur) setDuration(dur);
                } else if (event.data === 2) {
                  setIsPlaying(false);
                  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                } else if (event.data === 0) {
                  handleTrackEnded();
                }
              },
              onError: () => {
                if (!isSubscribed) return;
                setIsLoadingAudio(false);
                setIsPlaying(false);
                setStreamError('Playback restricted for this video.');
              }
            }
          });
        } catch (e) {
          console.warn("YT player init retry:", e);
          setTimeout(ensureYtPlayer, 500);
        }
      };

      ensureYtPlayer();

      // Start ticker for currentTime & duration
      if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
      ytIntervalRef.current = setInterval(() => {
        if (isUsingYtRef.current && ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
          const t = ytPlayerRef.current.getCurrentTime() || 0;
          const d = ytPlayerRef.current.getDuration ? (ytPlayerRef.current.getDuration() || 0) : 0;
          setCurrentTime(t);
          if (d > 0) setDuration(d);
          updateMediaSessionPositionState();
        }
      }, 500);
    };

    const fetchStream = async () => {
      setIsLoadingAudio(true);
      try {
        const videoId = currentTrack.videoId || currentTrack.id;

        // ---- Offline-first: if the track is downloaded, play the local blob ----
        if (await isTrackDownloaded(videoId)) {
          isUsingYtRef.current = false;
          if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
          if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();

          if (!currentTrack.thumbnailUrl?.startsWith('blob:')) {
            const localCover = await getCoverUrl(videoId);
            if (localCover && isSubscribed) {
              setCurrentTrack(prev => (prev && (prev.videoId || prev.id) === videoId ? { ...prev, thumbnailUrl: localCover } : prev));
            }
          }

          const localUrl = await getPlaybackUrl(videoId);
          if (!isSubscribed || !localUrl || !audioRef.current) return;
          audioRef.current.src = localUrl;
          try {
            await audioRef.current.play();
            setIsPlaying(true);
          } catch (playErr) {
            console.warn('Autoplay / play request prevented:', playErr);
          }
          return;
        }

        // ---- Online: resolve stream through the API chain ----
        const res = await fetch(`/api/stream/${videoId}`);
        if (!res.ok) {
          // If server stream extraction fails (e.g. Vercel datacenter IP blocked by bot-check),
          // fallback directly to the YouTube Player API
          startYtFallback(videoId);
          return;
        }

        const data = await res.json();
        if (!isSubscribed) return;

        if (data.url && audioRef.current) {
          isUsingYtRef.current = false;
          if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
          if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();

          const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(data.url)}&ua=${encodeURIComponent(data.userAgent || '')}`;
          const audio = audioRef.current;
          audio.src = proxyUrl;
          try {
            await audio.play();
            setIsPlaying(true);
          } catch (playErr) {
            console.warn('Audio-proxy playback error, trying fallback:', playErr);
            startYtFallback(videoId);
          }
        } else {
          startYtFallback(videoId);
        }
      } catch (err) {
        console.warn('Server stream resolution error, falling back to YouTube engine:', err);
        const videoId = currentTrack.videoId || currentTrack.id;
        startYtFallback(videoId);
      } finally {
        if (isSubscribed && !isUsingYtRef.current) setIsLoadingAudio(false);
      }
    };

    fetchStream();

    // Fetch lyrics: synced (BetterLyrics→LRCLIB) then native shelf fallback
    const loadLyrics = async () => {
      setIsLoadingLyrics(true);
      setLyrics([]);
      setPlainLyrics([]);
      setLyricsSource(null);
      setLyricOffsetMs(0);
      try {
        const res = await fetch(`/api/lyrics?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&duration=${currentTrack.durationSeconds || 0}&videoId=${currentTrack.videoId || currentTrack.id}`);
        const d = await res.json();
        if (isSubscribed) {
          setLyrics(d.lines || []);
          setPlainLyrics(d.plainLines || []);
          setLyricsSource(d.source || null);
          setIsLoadingLyrics(false);
        }
      } catch (_) {
        if (isSubscribed) setIsLoadingLyrics(false);
      }
    };
    loadLyrics();

    // Update Recent
    const updateRecent = () => {
      setRecentTracks(prev => {
        const next = [currentTrack, ...prev.filter(t => t.id !== currentTrack.id)].slice(0, 50);
        saveJSON('riva_recent', next);
        return next;
      });
    };
    updateRecent();

    return () => {
      isSubscribed = false;
    };
  }, [currentTrack]);

  const playTrack = (track: Track, newQueue?: Track[], shuffleFirst?: boolean) => {
    const useShuffle = shuffleFirst ?? shuffleRef.current;
    let q = newQueue && newQueue.length > 0 ? newQueue : [track];
    if (useShuffle && q.length > 1) {
      // App behavior: current track first, rest shuffled
      const rest = shuffleArray(q.filter(t => t.id !== track.id));
      q = [track, ...rest];
      setQueue(q);
      setQueueIndex(0);
    } else {
      setQueue(q);
      const idx = q.findIndex(t => t.id === track.id);
      setQueueIndex(idx >= 0 ? idx : 0);
    }
    radioExtendedForRef.current = new Set();
    setCurrentTrack(track);
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const pause = () => {
    if (isUsingYtRef.current && ytPlayerRef.current?.pauseVideo) {
      ytPlayerRef.current.pauseVideo();
      setIsPlaying(false);
    } else if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const resume = () => {
    if (isUsingYtRef.current && ytPlayerRef.current?.playVideo) {
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
    } else if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const setRepeatMode = (mode: RepeatMode) => setRepeatModeState(mode);

  const cycleRepeatMode = () => {
    setRepeatModeState(prev => (prev === 'OFF' ? 'ALL' : prev === 'ALL' ? 'ONE' : 'OFF'));
  };

  // App behavior: toggling shuffle rebuilds the queue around the current track
  const toggleShuffle = () => {
    setShuffle(prev => {
      const next = !prev;
      shuffleRef.current = next;
      const current = currentTrackRef.current;
      const q = queueRef.current;
      if (current && q.length > 1) {
        if (next) {
          const rest = shuffleArray(q.filter(t => t.id !== current.id));
          const rebuilt = [current, ...rest];
          setQueue(rebuilt);
          setQueueIndex(0);
        } else {
          // restore original order (liked/recent order lost after shuffle rebuild; keep as-is)
          setQueueIndex(q.findIndex(t => t.id === current.id));
        }
      }
      return next;
    });
  };

  const setVolume = (vol: number) => setVolumeState(Math.max(0, Math.min(1, vol)));

  const toggleLike = (track: Track) => {
    setLikedTracks(prev => {
      const exists = prev.some(t => t.id === track.id);
      const next = exists ? prev.filter(t => t.id !== track.id) : [track, ...prev];
      saveJSON('riva_liked', next);
      return next;
    });
  };

  const isLiked = (trackId: string) => likedTracks.some(t => t.id === trackId);

  const createPlaylist = (title: string): Playlist | null => {
    if (!title.trim()) return null;
    const newPl: Playlist = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim().slice(0, 48),
      tracks: [],
      createdAt: Date.now()
    };
    setPlaylists(prev => {
      const next = [newPl, ...prev];
      saveJSON('riva_playlists', next);
      return next;
    });
    return newPl;
  };

  const addToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id === playlistId && !p.tracks.some(t => t.id === track.id)) {
          return { ...p, tracks: [...p.tracks, track] };
        }
        return p;
      });
      saveJSON('riva_playlists', next);
      return next;
    });
  };

  const removeFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id === playlistId) {
          return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
        }
        return p;
      });
      saveJSON('riva_playlists', next);
      return next;
    });
  };

  const deletePlaylist = (playlistId: string) => {
    setPlaylists(prev => {
      const next = prev.filter(p => p.id !== playlistId);
      saveJSON('riva_playlists', next);
      return next;
    });
  };

  // Search history (max 8, like the app)
  const addSearchHistory = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setSearchHistory(prev => {
      const next = [t, ...prev.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
      saveJSON('riva_search_history', next);
      return next;
    });
  };

  const removeSearchHistory = (term: string) => {
    setSearchHistory(prev => {
      const next = prev.filter(x => x !== term);
      saveJSON('riva_search_history', next);
      return next;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    saveJSON('riva_search_history', []);
  };

  // Sleep timer with live seconds countdown
  const setSleepTimerMinutes = (minutes: number | null) => {
    if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    sleepTimerRef.current = null;
    setSleepTimerState(minutes);
    setSleepRemainingSeconds(minutes ? minutes * 60 : 0);
    if (minutes !== null && minutes > 0) {
      let secondsRemaining = minutes * 60;
      sleepTimerRef.current = setInterval(() => {
        secondsRemaining -= 1;
        if (secondsRemaining <= 0) {
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          sleepTimerRef.current = null;
          setSleepTimerState(null);
          setSleepRemainingSeconds(0);
          audioRef.current?.pause();
          setIsPlaying(false);
        } else {
          setSleepRemainingSeconds(secondsRemaining);
        }
      }, 1000);
    }
  };

  return (
    <MusicContext.Provider value={{
      themeMode,
      setThemeMode,
      cycleThemeMode,
      selectedRegion,
      setSelectedRegion,
      selectedLanguages,
      setSelectedLanguages,

      isOnline,
      streamError,

      currentTrack,
      isPlaying,
      isLoadingAudio,
      currentTime,
      duration,
      queue,
      queueIndex,
      repeatMode,
      shuffle,
      volume,

      playTrack,
      togglePlay,
      pause,
      resume,
      seek,
      nextTrack: handleNextTrack,
      previousTrack: handlePreviousTrack,
      setRepeatMode,
      cycleRepeatMode,
      toggleShuffle,
      setVolume,

      isExpanded,
      setIsExpanded,
      showLyrics,
      setShowLyrics,
      lyrics,
      plainLyrics,
      lyricsSource,
      isLoadingLyrics,
      lyricOffsetMs,
      setLyricOffsetMs,

      likedTracks,
      toggleLike,
      isLiked,
      recentTracks,
      playlists,
      createPlaylist,
      addToPlaylist,
      removeFromPlaylist,
      deletePlaylist,
      searchHistory,
      addSearchHistory,
      removeSearchHistory,
      clearSearchHistory,

      sleepTimerMinutes,
      sleepRemainingSeconds,
      setSleepTimerMinutes
    }}>
      {/* Hidden YouTube Engine Container for guaranteed browser playback */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: -100,
          right: -100,
          width: 10,
          height: 10,
          opacity: 0.01,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: -9999
        }}
      >
        <div id="riva-hidden-yt-player" />
      </div>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) throw new Error('useMusic must be used within a MusicProvider');
  return context;
}
