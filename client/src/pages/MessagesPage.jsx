import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getFriendRequests, respondToFriendRequest, removeFriend, blockFriend, toggleFriendLocationVisibility, openDirectFriendChat } from '@/services/flinders';
import { getMessages } from '@/services/chat';
import { apiUrl } from '@/lib/api';
import { getAuthHeaders, parseResponse } from '@/lib/api-headers';
import {
  Loader2, MessageSquare, ArrowLeft, Users, Check, X, UserPlus, Search,
  MoreVertical, Trash2, Ban, MapPin, Eye, EyeOff, UserX, GraduationCap, Calendar,
  ChevronRight, Shield, Clock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { avatarMedium, avatarThumb } from '@/lib/avatar';
import PageTour from '@/components/PageTour';
import OnboardingTour from '@/components/OnboardingTour';

const ChatPanel = lazy(() => import('@/components/chat/ChatPanel'));

export default function MessagesPage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null); // { roomId, friend }
  const [lastMessages, setLastMessages] = useState({}); // roomId → last message preview
  const [search, setSearch] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [profileFriend, setProfileFriend] = useState(null); // friend object for profile panel
  const [menuOpenId, setMenuOpenId] = useState(null); // friend id for context menu
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'remove'|'block', friend }
  const [actionLoading, setActionLoading] = useState(false);
  const menuRef = useRef(null);

  const loadFriends = useCallback(async () => {
    try {
      const data = await getFriendRequests();
      setFriends(Array.isArray(data?.friends) ? data.friends : []);
      setIncoming(Array.isArray(data?.incoming) ? data.incoming : []);
    } catch {
      setFriends([]);
      setIncoming([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load last message for each friend's DM room
  useEffect(() => {
    const fetchPreviews = async () => {
      const previews = {};
      for (const f of friends) {
        if (!f.direct_room_id) continue;
        try {
          const data = await getMessages(f.direct_room_id);
          const msgs = data.messages || data || [];
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            previews[f.direct_room_id] = {
              content: last.message_type === 'file' ? '📎 File' : (last.content || '').slice(0, 60),
              time: last.created_at,
              isOwn: last.user_id === user?.id,
            };
          }
        } catch {}
      }
      setLastMessages(previews);
    };
    if (friends.length > 0) fetchPreviews();
  }, [friends, user?.id]);

  const handleRespond = async (requestId, action) => {
    setRespondingId(requestId);
    try {
      await respondToFriendRequest(requestId, action);
      await loadFriends();
    } catch {} finally {
      setRespondingId(null);
    }
  };

  const openChat = async (friend) => {
    try {
      const chatFriend = friend.direct_room_id ? friend : await openDirectFriendChat(friend.id);
      if (chatFriend?.direct_room_id) {
        setActiveChat({ roomId: chatFriend.direct_room_id, friend: chatFriend });
        setProfileFriend(null);
        await loadFriends();
      }
    } catch {}
  };

  const handleRemoveFriend = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.type === 'block') {
        await blockFriend(confirmAction.friend.id);
      } else {
        await removeFriend(confirmAction.friend.id);
      }
      if (activeChat?.friend?.id === confirmAction.friend.id) setActiveChat(null);
      setProfileFriend(null);
      setConfirmAction(null);
      await loadFriends();
    } catch {} finally {
      setActionLoading(false);
    }
  };

  const handleToggleLocation = async (friend) => {
    try {
      await toggleFriendLocationVisibility(friend.id, !friend.location_shared);
      await loadFriends();
      // Update profile panel if open
      setProfileFriend((prev) => prev?.id === friend.id ? { ...prev, location_shared: !friend.location_shared } : prev);
    } catch {}
  };

  const filteredFriends = friends.filter((f) => {
    if (!search.trim()) return true;
    const name = (f.other_user?.full_name || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  // Sort: friends with recent messages first
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const aMsg = lastMessages[a.direct_room_id];
    const bMsg = lastMessages[b.direct_room_id];
    if (aMsg && bMsg) return new Date(bMsg.time) - new Date(aMsg.time);
    if (aMsg) return -1;
    if (bMsg) return 1;
    return 0;
  });

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  // Mobile: show chat or list
  const showChatMobile = activeChat !== null || profileFriend !== null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200/70 bg-white shadow-sm">
      <OnboardingTour
        tourId="messages-onboarding"
        steps={[
          {
            target: '[data-tour="messages-list"]',
            title: 'Your DMs live here!',
            description: 'Send friend requests from Timetable Buddy, then chat privately right here!',
            icon: '💬',
            position: 'right',
          },
        ]}
      />
      <PageTour
        tourId="messages"
        steps={[
          {
            target: '[data-tour="messages-search"]',
            title: 'Find a friend!',
            desc: 'Type a name to quickly find someone in your list.',
            position: 'bottom',
          },
          {
            target: '[data-tour="messages-list"]',
            title: 'Tap to chat!',
            desc: 'Pick any friend to start a private conversation. Easy as that!',
            position: 'right',
          },
        ]}
      />
      {/* Header */}
      <div data-tour="messages-header" className="sticky top-0 z-10 border-b border-slate-100 bg-white/92 px-3 py-2.5 backdrop-blur-md safe-area-top sm:px-4 sm:py-3">
        <div className="flex w-full items-center gap-2">
          {showChatMobile && (
            <button onClick={() => { setActiveChat(null); setProfileFriend(null); }} className="sm:hidden p-1 -ml-1 rounded-lg hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
          )}
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">Messages</h1>
            <p className="truncate text-[11px] text-slate-400 sm:hidden">
              {incoming.length > 0 ? `${incoming.length} pending request${incoming.length > 1 ? 's' : ''}` : 'Direct messages and friend profile'}
            </p>
          </div>
          {friends.length > 0 && (
            <Badge className="hidden rounded-full border-blue-200 bg-blue-100 text-[10px] text-blue-700 sm:inline-flex">
              {friends.length} friends
            </Badge>
          )}
          {incoming.length > 0 && (
            <Badge className="rounded-full border-amber-200 bg-amber-100 text-[10px] text-amber-700">
              {incoming.length} pending
            </Badge>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 w-full flex-1">
        {/* Left panel: Friend list */}
        <div className={`w-full sm:w-80 sm:border-r border-slate-100 flex flex-col shrink-0 ${showChatMobile ? 'hidden sm:flex' : 'flex'}`}>
          {/* Search */}
          <div data-tour="messages-search" className="border-b border-slate-50 p-2.5 sm:p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search friends..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8.5 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm"
              />
            </div>
          </div>

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <div className="border-b border-slate-100">
              <div className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Friend Requests
              </div>
              {incoming.map((req) => (
                <div key={req.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-600 shrink-0">
                    {(req.other_user?.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{req.other_user?.full_name || 'Student'}</div>
                    {req.message && <div className="text-xs text-slate-400 truncate">{req.message}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleRespond(req.id, 'accept')}
                      disabled={respondingId === req.id}
                      className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {respondingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => handleRespond(req.id, 'decline')}
                      className="h-8 w-8 rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friend list / conversations */}
          <div data-tour="messages-list" className="flex-1 overflow-y-auto">
            {sortedFriends.length === 0 && (
              <div className="text-center py-16 px-4">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100">
                  <UserPlus className="h-8 w-8 text-blue-500" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No friends yet</p>
                <p className="mt-1 text-xs text-slate-400">
                  Add friends from your course chat members to start messaging
                </p>
              </div>
            )}
            {sortedFriends.map((f) => {
              const preview = lastMessages[f.direct_room_id];
              const isActive = activeChat?.roomId === f.direct_room_id;
              return (
                <div key={f.id} className="relative group">
                  <button
                    onClick={() => openChat(f)}
                    className={`w-full flex items-center gap-3 px-3 py-3 pr-11 transition-colors text-left ${
                      isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    {f.other_user?.avatar_url ? (
                      <img src={avatarThumb(f.other_user.avatar_url)} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {(f.other_user?.full_name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800 truncate">{f.other_user?.full_name || 'Student'}</span>
                        {preview && (
                          <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatTime(preview.time)}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {preview ? (
                          <>
                            {preview.isOwn && <span className="text-slate-500">You: </span>}
                            {preview.content}
                          </>
                        ) : (
                          <span className="text-slate-300 italic">No messages yet</span>
                        )}
                      </div>
                    </div>
                  </button>
                  {/* Context menu trigger */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" ref={menuOpenId === f.id ? menuRef : null}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === f.id ? null : f.id); }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-slate-200 sm:h-7 sm:w-7 sm:bg-transparent sm:shadow-none"
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                    {menuOpenId === f.id && (
                      <div className="absolute right-0 top-8 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                        <button
                          onClick={(e) => { e.stopPropagation(); setProfileFriend(f); setMenuOpenId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Users className="h-3.5 w-3.5" /> View Profile
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleLocation(f); setMenuOpenId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {f.location_shared ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {f.location_shared ? 'Hide Location' : 'Share Location'}
                        </button>
                        <div className="border-t border-slate-100 my-1" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'remove', friend: f }); setMenuOpenId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                        >
                          <UserX className="h-3.5 w-3.5" /> Remove Friend
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'block', friend: f }); setMenuOpenId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Ban className="h-3.5 w-3.5" /> Block User
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel: Chat or Profile */}
        <div className={`flex-1 flex flex-col min-h-0 ${!showChatMobile ? 'hidden sm:flex' : 'flex'}`}>
          {profileFriend ? (
            /* Friend Profile Panel */
            <div className="flex-1 overflow-y-auto">
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
                <button onClick={() => setProfileFriend(null)} className="p-1 -ml-1 rounded-lg hover:bg-slate-100">
                  <ArrowLeft className="h-4 w-4 text-slate-500" />
                </button>
                <span className="text-sm font-semibold text-slate-700">Friend Profile</span>
              </div>
              <div className="flex flex-col items-center p-5 sm:p-6">
                {profileFriend.other_user?.avatar_url ? (
                  <img src={avatarMedium(profileFriend.other_user.avatar_url)} alt="" className="mb-3 h-20 w-20 rounded-full object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-2xl font-bold text-white mb-3">
                    {(profileFriend.other_user?.full_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <h2 className="text-lg font-bold text-slate-900">{profileFriend.other_user?.full_name || 'Student'}</h2>
                {profileFriend.other_user?.university_email && (
                  <p className="text-xs text-slate-400 mt-0.5">{profileFriend.other_user.university_email}</p>
                )}
              </div>

              <div className="space-y-3 px-4 pb-5 sm:px-6">
                {/* Info cards */}
                {profileFriend.other_user?.major && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <GraduationCap className="h-4 w-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="text-xs text-slate-400">Major</div>
                      <div className="text-sm font-medium text-slate-700">{profileFriend.other_user.major}</div>
                    </div>
                  </div>
                )}
                {profileFriend.other_user?.year_level && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
                    <div>
                      <div className="text-xs text-slate-400">Year Level</div>
                      <div className="text-sm font-medium text-slate-700">Year {profileFriend.other_user.year_level}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                  <Clock className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400">Friends since</div>
                    <div className="text-sm font-medium text-slate-700">{formatDate(profileFriend.responded_at || profileFriend.created_at)}</div>
                  </div>
                </div>
                {profileFriend.message && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <MessageSquare className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="text-xs text-slate-400">Friend request message</div>
                      <div className="text-sm text-slate-600 italic">"{profileFriend.message}"</div>
                    </div>
                  </div>
                )}

                {/* Location visibility toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-slate-700">Share my location</div>
                      <div className="text-xs text-slate-400">Show on Where Are You</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleLocation(profileFriend)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${profileFriend.location_shared ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${profileFriend.location_shared ? 'translate-x-4' : ''}`} />
                  </button>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-3">
                  <Button
                    onClick={() => { openChat(profileFriend); }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" /> Send Message
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmAction({ type: 'remove', friend: profileFriend })}
                    className="w-full rounded-xl text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <UserX className="h-4 w-4 mr-2" /> Remove Friend
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmAction({ type: 'block', friend: profileFriend })}
                    className="w-full rounded-xl text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Ban className="h-4 w-4 mr-2" /> Block User
                  </Button>
                </div>
              </div>
            </div>
          ) : activeChat ? (
            <>
              {/* Chat header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-3 text-white sm:px-4">
                <button onClick={() => setActiveChat(null)} className="sm:hidden p-1 -ml-1 rounded-lg hover:bg-white/20">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {activeChat.friend.other_user?.avatar_url ? (
                  <img src={avatarThumb(activeChat.friend.other_user.avatar_url)} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                    {(activeChat.friend.other_user?.full_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate">{activeChat.friend.other_user?.full_name || 'Student'}</h3>
                </div>
                <button
                  onClick={() => setProfileFriend(activeChat.friend)}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
              {/* Chat content */}
              <div className="flex-1 min-h-0">
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>}>
                  <ChatPanel roomId={activeChat.roomId} embedded />
                </Suspense>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 shadow-lg shadow-blue-500/10">
                  <MessageSquare className="h-10 w-10 text-blue-500" />
                </div>
                <p className="text-base font-semibold text-slate-600">Your Messages</p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Select a friend to start chatting
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Remove/Block Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !actionLoading && setConfirmAction(null)}>
          <div className="max-h-[calc(var(--viewport-dynamic-height,100dvh)-1.5rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-4">
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${confirmAction.type === 'block' ? 'bg-red-100' : 'bg-amber-100'}`}>
                {confirmAction.type === 'block' ? <Ban className="h-6 w-6 text-red-500" /> : <UserX className="h-6 w-6 text-amber-500" />}
              </div>
            </div>
            <h3 className="text-center text-lg font-bold text-slate-900 mb-1">
              {confirmAction.type === 'block' ? 'Block User' : 'Remove Friend'}
            </h3>
            <p className="text-center text-sm text-slate-500 mb-5">
              {confirmAction.type === 'block'
                ? `Block ${confirmAction.friend.other_user?.full_name}? They won't be able to message you or send friend requests.`
                : `Remove ${confirmAction.friend.other_user?.full_name} from your friends? Your chat history will be preserved.`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setConfirmAction(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                className={`flex-1 rounded-xl text-white ${confirmAction.type === 'block' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                onClick={handleRemoveFriend}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmAction.type === 'block' ? 'Block' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
