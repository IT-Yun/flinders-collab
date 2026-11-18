import React, { useState, useEffect, useCallback } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Loader2, Plus, MessageCircle, Trash2, Send, GraduationCap,
  BookOpen, Users2, Calendar, Coffee, HelpCircle, FolderKanban,
  Flame, Heart, Laugh, HandMetal, Brain, Eye, EyeOff, BarChart3,
  TrendingUp, Sparkles, Ghost, MessageSquare,
} from 'lucide-react';
import OnboardingTour from '@/components/OnboardingTour';
import { formatDistanceToNow } from 'date-fns';
import {
  getPosts, createPost, deletePost, toggleParticipation, getMyParticipations,
  getComments, createComment, deleteComment, getAcademicInfo, updateAcademicInfo,
  toggleReaction as apiToggleReaction, votePoll as apiVotePoll, updateBoardState,
} from '@/services/board';
import { getLatestBoardTimestamp } from '@/lib/board-notifications';
import { avatarThumb } from '@/lib/avatar';

const CATEGORIES = [
  { value: 'all', label: 'All', shortLabel: 'All', icon: Sparkles },
  { value: 'study_group', label: 'Study Group', shortLabel: 'Study', icon: Users2 },
  { value: 'project', label: 'Project Team', shortLabel: 'Project', icon: FolderKanban },
  { value: 'qna', label: 'Q&A', shortLabel: 'Q&A', icon: MessageSquare },
  { value: 'meetup', label: 'Meetup', shortLabel: 'Meetup', icon: Coffee },
  { value: 'confession', label: 'Confession', shortLabel: 'Confess', icon: Ghost },
  { value: 'event', label: 'Event', shortLabel: 'Event', icon: Calendar },
  { value: 'general', label: 'General', shortLabel: 'General', icon: HelpCircle },
];

const CATEGORY_STYLES = {
  study_group: { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-200', gradient: 'from-blue-500 to-cyan-500' },
  project: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-200', gradient: 'from-emerald-500 to-teal-500' },
  qna: { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-200', gradient: 'from-violet-500 to-purple-500' },
  meetup: { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-200', gradient: 'from-orange-500 to-amber-500' },
  confession: { bg: 'bg-pink-500/10', text: 'text-pink-600', border: 'border-pink-200', gradient: 'from-pink-500 to-rose-500' },
  event: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-200', gradient: 'from-purple-500 to-indigo-500' },
  general: { bg: 'bg-slate-500/10', text: 'text-slate-600', border: 'border-slate-200', gradient: 'from-slate-500 to-gray-500' },
};

const EMOJI_MAP = {
  fire: { icon: '🔥', label: 'Fire' },
  heart: { icon: '❤️', label: 'Love' },
  laugh: { icon: '😂', label: 'Haha' },
  clap: { icon: '👏', label: 'Clap' },
  think: { icon: '🤔', label: 'Hmm' },
};
const APP_SOFT_REFRESH_EVENT = 'app-soft-refresh';

// ── Academic Info Gate ──

function AcademicInfoGate({ onSaved }) {
  const [year, setYear] = useState('');
  const [sem, setSem] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    if (!year || !sem) { setError('Select both fields.'); return; }
    setLoading(true);
    setError('');
    try {
      await updateAcademicInfo(Number(year), Number(sem));
      onSaved({ year_level: Number(year), semester: Number(sem) });
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm rounded-3xl border bg-white/80 p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl sm:p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/30">
              <GraduationCap className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Welcome to the Board</h2>
            <p className="text-sm text-slate-500 mt-1">Select your year and semester to continue.</p>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="flex h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                >
                  <option value="">Select</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                    <option key={y} value={y}>Year {y}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Semester</label>
                <select
                  value={sem}
                  onChange={(e) => setSem(e.target.value)}
                  className="flex h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                >
                  <option value="">Select</option>
                  {[1, 2, 3].map((s) => (
                    <option key={s} value={s}>Sem {s}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full rounded-xl h-12 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-sm font-bold shadow-lg shadow-indigo-500/25 transition-all">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Continue
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Emoji Reaction Bar ──

function ReactionBar({ reactions, myReactions, onToggle }) {
  const [animating, setAnimating] = useState(null);

  const handleClick = (emoji) => {
    setAnimating(emoji);
    onToggle(emoji);
    setTimeout(() => setAnimating(null), 300);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Object.entries(EMOJI_MAP).map(([key, { icon }]) => {
        const count = reactions[key] || 0;
        const isActive = myReactions.includes(key);
        const isPopping = animating === key;
        return (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); handleClick(key); }}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
              isActive
                ? 'bg-indigo-50 border border-indigo-200 shadow-sm'
                : 'bg-slate-50 border border-transparent hover:bg-slate-100'
            } ${isPopping ? 'scale-125' : ''}`}
          >
            <span className={`text-sm transition-transform duration-200 ${isPopping ? 'scale-150' : ''}`}>{icon}</span>
            {count > 0 && <span className={isActive ? 'text-indigo-600 font-bold' : 'text-slate-500'}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Poll Component ──

function PollSection({ pollOptions, voteCounts, myVote, onVote, postId, pollVoters, isAnonymousPoll }) {
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
  const hasVoted = myVote !== null && myVote !== undefined;
  const [showVoters, setShowVoters] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      {pollOptions.map((option, idx) => {
        const count = voteCounts[idx] || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = myVote === idx;
        const voters = pollVoters?.[idx] || [];

        return (
          <div key={idx}>
            <button
              onClick={(e) => { e.stopPropagation(); onVote(postId, idx); }}
              className={`relative w-full text-left rounded-xl border px-4 py-2.5 text-sm font-medium transition-all overflow-hidden ${
                isMyVote
                  ? 'border-indigo-300 bg-indigo-50'
                  : hasVoted
                    ? 'border-slate-200 bg-slate-50 hover:border-slate-300 cursor-pointer'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer'
              }`}
            >
              {hasVoted && (
                <div
                  className={`absolute inset-0 rounded-xl transition-all duration-500 ${isMyVote ? 'bg-indigo-100/60' : 'bg-slate-100/60'}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <span className={isMyVote ? 'text-indigo-700' : 'text-slate-700'}>{option}</span>
                <div className="flex items-center gap-2">
                  {hasVoted && count > 0 && (
                    <span className={`text-[10px] ${isMyVote ? 'text-indigo-400' : 'text-slate-300'}`}>
                      {count} vote{count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {hasVoted && (
                    <span className={`text-xs font-bold ${isMyVote ? 'text-indigo-600' : 'text-slate-400'}`}>{pct}%</span>
                  )}
                </div>
              </div>
            </button>
            {/* Voter names shown when "View Voters" is toggled */}
            {showVoters && voters.length > 0 && (
              <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {isAnonymousPoll
                    ? `${voters.length} anonymous vote${voters.length !== 1 ? 's' : ''}`
                    : voters.map((v) => v.full_name).join(', ')}
                </p>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-center gap-2">
        <p className="text-[11px] text-slate-400">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}{hasVoted ? ' · You voted · Tap to change' : ' · Tap to vote'}
        </p>
        {hasVoted && totalVotes > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowVoters((v) => !v); }}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all ${
              showVoters
                ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'
            }`}
          >
            <Users2 className="h-2.5 w-2.5" />
            {showVoters ? 'Hide Voters' : 'View Voters'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Comment Section ──

function CommentSection({ postId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getComments('board_post', postId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSend = async () => {
    if (!newComment.trim() || sending) return;
    setSending(true);
    try {
      const comment = await createComment('board_post', postId, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch { /* silent */ } finally { setSending(false); }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch { /* silent */ }
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2.5 max-h-64 overflow-y-auto">
          {comments.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">No comments yet</p>
          )}
          {comments.map((c) => {
            const authorName = c.users?.full_name || 'Anonymous';
            const initials = authorName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
            const affiliationLabel = c.users?.affiliation_label || null;
            return (
              <div key={c.id} className="group flex gap-2">
                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                  {c.users?.avatar_url && <AvatarImage src={avatarThumb(c.users.avatar_url)} />}
                  <AvatarFallback className="text-[9px] bg-slate-100">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-slate-800">{authorName}</span>
                    <span className="text-[10px] text-slate-400">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {affiliationLabel && (
                    <p className="text-[10px] text-slate-400">{affiliationLabel}</p>
                  )}
                  <p className="text-sm text-slate-600 break-words">{c.content}</p>
                </div>
                {c.author_id === user?.id && (
                  <button onClick={() => handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-destructive transition-opacity shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Write a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          className="flex-1 text-sm rounded-full h-9 border-slate-200 bg-slate-50 focus:bg-white"
          maxLength={2000}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!newComment.trim() || sending}
          className="rounded-full h-9 w-9 p-0 bg-indigo-500 hover:bg-indigo-600 shrink-0"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ── Post Card ──

function PostCard({ post, myStatus, onParticipate, onDelete, onReaction, onVote, userId, isAdmin }) {
  const [showComments, setShowComments] = useState(false);
  const [reactions, setReactions] = useState(post.reactions || {});
  const [myReactions, setMyReactions] = useState(post.my_reactions || []);
  const [pollVoteCounts, setPollVoteCounts] = useState(post.poll_vote_counts || {});
  const [myPollVote, setMyPollVote] = useState(post.my_poll_vote);

  const isAnonymous = post.is_anonymous && post.author_id !== userId;
  const authorName = isAnonymous ? 'Anonymous' : (post.users?.full_name || 'Anonymous');
  const initials = isAnonymous ? '?' : authorName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const academicLabel = (!isAnonymous && post.users?.year_level && post.users?.semester)
    ? `Y${post.users.year_level} · S${post.users.semester}`
    : null;
  const affiliationLabel = !isAnonymous ? post.users?.affiliation_label : null;
  const catStyle = CATEGORY_STYLES[post.category] || CATEGORY_STYLES.general;
  const catLabel = CATEGORIES.find((c) => c.value === post.category)?.label || post.category;

  // Trending: total reactions + comments > 5
  const totalEngagement = Object.values(reactions).reduce((a, b) => a + b, 0) + (post.comment_count || 0);
  const isTrending = totalEngagement >= 5;

  const handleReaction = async (emoji) => {
    try {
      const result = await onReaction(post.id, emoji);
      setReactions(result.reactions);
      setMyReactions(result.my_reactions);
    } catch { /* silent */ }
  };

  const [pollVoters, setPollVoters] = useState(post.poll_voters || {});

  const handleVote = async (postId, optionIndex) => {
    try {
      const result = await onVote(postId, optionIndex);
      setPollVoteCounts(result.poll_vote_counts);
      setMyPollVote(result.my_poll_vote);
      if (result.poll_voters) setPollVoters(result.poll_voters);
    } catch { /* silent */ }
  };

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:border-slate-300/80 hover:shadow-lg hover:shadow-slate-200/50 sm:p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className={`h-10 w-10 ring-2 ring-white shadow-sm shrink-0 ${isAnonymous ? 'opacity-70' : ''}`}>
          {!isAnonymous && post.users?.avatar_url && <AvatarImage src={avatarThumb(post.users.avatar_url)} />}
          <AvatarFallback className={`text-xs font-bold text-white ${isAnonymous ? 'bg-slate-400' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-sm font-semibold text-slate-900">{authorName}</span>
            {isAnonymous && <Ghost className="h-3.5 w-3.5 text-slate-400" />}
            {academicLabel && (
              <span className="text-[10px] font-medium text-slate-400 sm:text-[11px]">{academicLabel}</span>
            )}
          </div>
          {affiliationLabel && (
            <p className="mt-0.5 break-words text-[10px] leading-snug text-slate-400 sm:text-[11px]">{affiliationLabel}</p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-400 sm:text-[11px]">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {isTrending && (
            <Badge className="rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 text-[10px] gap-1 px-2 py-0.5 shadow-sm">
              <TrendingUp className="h-2.5 w-2.5" />
              Hot
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] rounded-full ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
            {catLabel}
          </Badge>
          {(post.author_id === userId || isAdmin) && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(post.id); }} className="text-slate-300 hover:text-destructive transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-3">
        <h3 className="font-bold text-[15px] text-slate-900 leading-snug">{post.title}</h3>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Poll */}
      {post.poll_options && Array.isArray(post.poll_options) && post.poll_options.length > 0 && (
        <PollSection
          pollOptions={post.poll_options}
          voteCounts={pollVoteCounts}
          myVote={myPollVote}
          onVote={handleVote}
          postId={post.id}
          pollVoters={pollVoters}
          isAnonymousPoll={post.anonymous_poll}
        />
      )}

      {/* Reactions + Comment toggle */}
      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
        <ReactionBar reactions={reactions} myReactions={myReactions} onToggle={handleReaction} />
        <button
          onClick={(e) => { e.stopPropagation(); setShowComments((v) => !v); }}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            showComments ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {post.comment_count > 0 ? post.comment_count : 'Comment'}
        </button>
      </div>

      {/* Comments */}
      {showComments && <CommentSection postId={post.id} />}
    </div>
  );
}

// ── Create Post Dialog ──

function CreatePostDialog({ open, onOpenChange, onCreated, academicInfo }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [hasPoll, setHasPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [anonymousPoll, setAnonymousPoll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(''); setContent(''); setCategory('general');
      setIsAnonymous(false); setHasPoll(false); setPollOptions(['', '']); setAnonymousPoll(false); setError('');
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) { setError('Title and content are required.'); return; }
    if (hasPoll) {
      const validOptions = pollOptions.filter((o) => o.trim());
      if (validOptions.length < 2) { setError('Add at least 2 poll options.'); return; }
    }
    setLoading(true); setError('');
    try {
      const data = {
        title: title.trim(),
        content: content.trim(),
        category,
        is_anonymous: isAnonymous,
      };
      if (hasPoll) {
        data.poll_options = pollOptions.filter((o) => o.trim()).map((o) => o.trim());
        data.anonymous_poll = anonymousPoll;
      }
      const post = await createPost(data);
      const createdAt = new Date(post?.created_at).getTime();
      const safeTimestamp = Number.isFinite(createdAt) ? createdAt : Date.now();
      await updateBoardState(new Date(safeTimestamp).toISOString());
      window.dispatchEvent(new CustomEvent('board-notifications-read', {
        detail: { userId: user?.id, timestamp: safeTimestamp },
      }));
      window.dispatchEvent(new CustomEvent('board-post-created', { detail: { postId: post.id } }));
      onCreated?.(post);
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Failed to create post.');
    } finally { setLoading(false); }
  };

  const addPollOption = () => {
    if (pollOptions.length < 6) setPollOptions([...pollOptions, '']);
  };

  const updatePollOption = (idx, val) => {
    const next = [...pollOptions];
    next[idx] = val;
    setPollOptions(next);
  };

  const removePollOption = (idx) => {
    if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1.5rem),56rem)] max-w-[56rem] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-2xl p-0">
        <DialogHeader>
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6">
            <DialogTitle className="text-lg font-black">New Post</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Create a new post on the community board</DialogDescription>
        </DialogHeader>

        {/* Author info */}
        <div className="mx-5 flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2 sm:mx-6">
          <div className="flex items-center gap-2">
            {isAnonymous ? (
              <>
                <Ghost className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">Posting anonymously</span>
              </>
            ) : (
              <>
                <GraduationCap className="h-4 w-4 text-indigo-500" />
                <span className="text-xs text-slate-600">
                  {[user?.user_metadata?.university, user?.user_metadata?.major].filter(Boolean).join(' · ') || `Year ${academicInfo?.year_level}, Sem ${academicInfo?.semester}`}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsAnonymous(!isAnonymous)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
              isAnonymous
                ? 'bg-slate-200 text-slate-700'
                : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {isAnonymous ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {isAnonymous ? 'Anonymous On' : 'Anonymous'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-4 sm:px-6">
          {/* Category */}
          <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => {
              const Icon = cat.icon;
              const style = CATEGORY_STYLES[cat.value] || CATEGORY_STYLES.general;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    category === cat.value
                      ? `${style.bg} ${style.text} ${style.border}`
                      : 'border-slate-200 hover:border-slate-300 text-slate-400'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl text-sm font-medium h-11"
            maxLength={200}
          />
          <Textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="rounded-xl min-h-[220px] text-sm leading-6"
            maxLength={5000}
          />

          {/* Poll toggle + options */}
          <div>
            <button
              type="button"
              onClick={() => setHasPoll(!hasPoll)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                hasPoll ? 'bg-violet-50 text-violet-600 border-violet-200' : 'border-slate-200 text-slate-400 hover:border-slate-300'
              }`}
            >
              <BarChart3 className="h-3 w-3" />
              {hasPoll ? 'Poll Added' : 'Add Poll'}
            </button>
            {hasPoll && (
              <div className="mt-3 space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => updatePollOption(idx, e.target.value)}
                      className="flex-1 rounded-lg text-sm h-9 bg-white"
                      maxLength={100}
                    />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => removePollOption(idx)} className="text-slate-400 hover:text-red-500 px-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  {pollOptions.length < 6 && (
                    <button type="button" onClick={addPollOption} className="text-xs text-violet-600 font-semibold hover:underline">
                      + Add option
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAnonymousPoll(!anonymousPoll)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      anonymousPoll
                        ? 'bg-violet-200 text-violet-700'
                        : 'bg-white border border-violet-200 text-violet-400 hover:border-violet-300'
                    }`}
                  >
                    {anonymousPoll ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {anonymousPoll ? 'Anonymous Poll' : 'Show Voters'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <Button type="submit" disabled={loading} className="w-full rounded-xl h-11 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 font-bold shadow-lg shadow-indigo-500/20">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Post
          </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Board Page ──

export default function BoardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [myParticipations, setMyParticipations] = useState({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [academicInfo, setAcademicInfo] = useState(null);
  const [academicChecked, setAcademicChecked] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await getPosts(category);
      setPosts(data || []);
      if (category === 'all') {
        const latestTimestamp = getLatestBoardTimestamp(data || []);
        if (latestTimestamp > 0) {
          await updateBoardState(new Date(latestTimestamp).toISOString());
          window.dispatchEvent(new CustomEvent('board-notifications-read', {
            detail: { userId: user?.id, timestamp: latestTimestamp },
          }));
        }
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [category, user?.id]);

  useEffect(() => {
    getAcademicInfo()
      .then((info) => {
        if (info.year_level && info.semester) setAcademicInfo(info);
        setAcademicChecked(true);
      })
      .catch(() => setAcademicChecked(true));

    getMyParticipations().then(setMyParticipations).catch(() => {});
  }, []);

  useEffect(() => {
    if (academicChecked && academicInfo) fetchPosts();
  }, [fetchPosts, academicChecked, academicInfo]);

  useEffect(() => {
    if (!academicChecked || !academicInfo) return undefined;
    const handleSoftRefresh = () => {
      setLoading(true);
      fetchPosts();
    };
    window.addEventListener(APP_SOFT_REFRESH_EVENT, handleSoftRefresh);
    return () => window.removeEventListener(APP_SOFT_REFRESH_EVENT, handleSoftRefresh);
  }, [academicChecked, academicInfo, fetchPosts]);

  useEffect(() => {
    const syncTutorialState = (event) => {
      if (event?.detail && typeof event.detail.active === 'boolean') {
        setTutorialActive(event.detail.active);
        return;
      }
      setTutorialActive(Boolean(document.querySelector('[data-tutorial-root]')));
    };

    syncTutorialState();
    window.addEventListener('interactive-tutorial-state', syncTutorialState);
    return () => window.removeEventListener('interactive-tutorial-state', syncTutorialState);
  }, []);

  if (academicChecked && !academicInfo) {
    return <AcademicInfoGate onSaved={(info) => setAcademicInfo(info)} />;
  }

  if (!academicChecked) {
    return (
      <>
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </>
    );
  }

  const handlePostCreated = (post) => setPosts((prev) => [post, ...prev]);
  const handleDelete = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try { await deletePost(postId); setPosts((prev) => prev.filter((p) => p.id !== postId)); } catch { /* silent */ }
  };
  const handleParticipate = async (postId, status) => {
    const result = await toggleParticipation(postId, status);
    setMyParticipations((prev) => {
      const next = { ...prev };
      if (result.action === 'removed') delete next[postId];
      else next[postId] = result.status;
      return next;
    });
    return result;
  };
  const handleReaction = async (postId, emoji) => {
    return await apiToggleReaction(postId, emoji);
  };
  const handleVote = async (postId, optionIndex) => {
    return await apiVotePoll(postId, optionIndex);
  };

  return (
    <>
      <OnboardingTour
        tourId="board"
        steps={[
          {
            target: null,
            title: 'Welcome to Free Board!',
            description: 'Your campus community — post anything, meet people, get help.',
            icon: '\u{1F44B}',
          },
          {
            target: '[data-tour="cat-study_group"]',
            title: 'Study Group',
            description: 'Need study buddies? Find or create a group here.',
            position: 'bottom',
            icon: '\u{1F4DA}',
          },
          {
            target: '[data-tour="cat-project"]',
            title: 'Project Team',
            description: 'Looking for teammates? Recruit people for your project.',
            position: 'bottom',
            icon: '\u{1F4C2}',
          },
          {
            target: '[data-tour="cat-qna"]',
            title: 'Q&A',
            description: 'Got questions about uni? Someone here has answers.',
            position: 'bottom',
            icon: '\u{2753}',
          },
          {
            target: '[data-tour="cat-meetup"]',
            title: 'Meetup',
            description: 'Wanna grab coffee or hang out? Find people here.',
            position: 'bottom',
            icon: '\u2615',
          },
          {
            target: '[data-tour="cat-confession"]',
            title: 'Confession',
            description: 'Share thoughts anonymously. No judgement, just vibes.',
            position: 'bottom',
            icon: '\u{1F47B}',
          },
          {
            target: '[data-tour="cat-event"]',
            title: 'Event',
            description: 'Campus parties, workshops, anything happening — share it!',
            position: 'bottom',
            icon: '\u{1F389}',
          },
          {
            target: '[data-tour="board-new-post"]',
            title: 'Write a Post',
            description: 'Ready? Tap here to write your first post!',
            position: 'bottom',
            icon: '\u270F\uFE0F',
          },
        ]}
      />
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-5 text-white shadow-2xl shadow-purple-500/20 sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-8 -bottom-8 h-40 w-40 rounded-full bg-pink-400/20 blur-2xl" />
        <div className="absolute right-8 bottom-6 text-6xl opacity-20 select-none">💬</div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" />
              Community
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Free Board</h1>
            <p className="mt-1.5 max-w-sm text-sm leading-6 text-white/75">
              Connect, share, and discover with fellow Flinders students.
            </p>
          </div>
          <Button
            data-tour="board-new-post"
            onClick={() => setCreateOpen(true)}
            className="shrink-0 rounded-xl bg-white text-purple-700 hover:bg-white/90 font-bold shadow-xl gap-2 h-11"
          >
            <Plus className="h-4 w-4" />
            New Post
          </Button>
        </div>
      </div>

      {/* Category filter */}
      <div className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const style = CATEGORY_STYLES[cat.value] || {};
          return (
            <button
              key={cat.value}
              data-tour={`cat-${cat.value}`}
              onClick={() => { setCategory(cat.value); setLoading(true); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-semibold transition-all sm:px-4 sm:text-xs ${
                category === cat.value
                  ? `${style.bg || 'bg-indigo-50'} ${style.text || 'text-indigo-600'} ${style.border || 'border-indigo-200'} shadow-sm`
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="sm:hidden">{cat.shortLabel || cat.label}</span>
              <span className="hidden sm:inline">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Posts */}
      <div className="relative" data-tutorial="board-post-feed">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-base font-bold text-slate-400">No posts yet</h3>
            <p className="text-sm text-slate-400 mt-1">Be the first to share something!</p>
          </div>
        ) : (
          <div className={`space-y-4 transition-all ${tutorialActive ? 'blur-md select-none' : ''}`}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                myStatus={myParticipations[post.id] || null}
                onParticipate={handleParticipate}
                onDelete={handleDelete}
                onReaction={handleReaction}
                onVote={handleVote}
                userId={user?.id}
                isAdmin={Boolean(user?.is_admin)}
              />
            ))}
          </div>
        )}

        {tutorialActive && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-white/88 backdrop-blur-sm">
            <div className="rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50">
                <EyeOff className="h-5 w-5 text-indigo-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Board posts are hidden during the tutorial.</p>
            </div>
          </div>
        )}
      </div>

      <CreatePostDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handlePostCreated}
        academicInfo={academicInfo}
      />
    </>
  );
}
