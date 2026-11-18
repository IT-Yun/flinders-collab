# Flinders Collab: Avoid Repeat Mistakes

This document records the concrete mistakes found during recent fixes, what caused them, how they were corrected, and what to check next time before shipping.

## 1. Email auth and OTP flow

### Mistake
- Mixed multiple email auth flows at once.
- Web, mobile, and Supabase templates were not aligned.
- Signup sometimes sent a confirm-link email instead of a 6-digit code.
- Password reset and signup did not consistently use the same OTP pattern.

### Why it happened
- App code, server verification logic, and Supabase mail templates were changed separately instead of as one system.
- The verification handler accepted one OTP type while the email templates still used another flow.

### Fix
- Unified signup and reset to 6-digit OTP flow.
- Updated Supabase confirmation and recovery templates to show `{{ .Token }}` instead of confirm links.
- Updated server verification to accept the correct OTP types for signup/reset.
- Split reset password into send, verify, and complete steps.

### Next time checklist
- Decide the exact auth flow first: `link` or `OTP`, not both.
- Verify all three layers together:
  - client flow
  - server verify endpoint
  - Supabase email templates
- Test signup and reset on both web and mobile before saying it is done.

## 2. SMTP and email delivery

### Mistake
- Switched SMTP providers before proving the credentials were valid end-to-end.
- Spent time on Gmail SMTP failures that were actually caused by the wrong Gmail username being used.
- Tried Resend in testing mode without first checking external recipient limits.

### Why it happened
- SMTP config was treated as “saved in dashboard = working”.
- Provider-specific constraints were checked too late.

### Fix
- Verified SMTP by logging in directly against the SMTP server, not just through Supabase UI.
- Corrected the Gmail account mismatch and sender email mismatch.
- Confirmed Resend testing-mode limitation and moved back once Gmail auth was corrected.

### Next time checklist
- Before debugging app code, verify SMTP with a direct login test.
- Always confirm these fields match exactly:
  - SMTP username
  - sender email
  - account that generated the app password or API key
- Check provider restrictions first:
  - Gmail app password/auth policies
  - Resend testing-mode recipient restrictions
  - domain verification requirements

## 3. Saying “done” before mobile was fully validated

### Mistake
- Web flow was validated, but mobile runtime validation was incomplete.

### Why it happened
- Mobile project config issues blocked full end-to-end testing.
- Code completion was treated too close to runtime verification.

### Fix
- Repaired part of the mobile project setup.
- Marked mobile as code-updated but not fully runtime-verified until that was actually true.

### Next time checklist
- Separate status clearly:
  - code changed
  - build passed
  - runtime tested
  - real-device tested
- Do not claim mobile is complete unless the full path was actually exercised.

## 4. Session refresh and random logout

### Mistake
- Temporary refresh failures could log the user out.

### Why it happened
- The app treated any refresh failure as an invalid session.

### Fix
- Only clear session on real invalid-refresh responses like `400` or `401`.
- Keep the session on transient network or server failures.

### Next time checklist
- Separate auth failures from transient infrastructure failures.
- Never destroy session state on network noise alone.

## 5. Friend acceptance creating direct chat rooms automatically

### Mistake
- Accepting a friend request created a DM room immediately.

### Why it happened
- Friendship and chat-room creation were coupled.

### Fix
- Stopped room creation on friend acceptance.
- Create direct chat only when the user actually opens chat.

### Next time checklist
- Keep social graph changes separate from room/resource creation.
- Create expensive or user-visible resources lazily when they are actually needed.

## 6. Location sharing communication was too weak

### Mistake
- Users could reasonably think exact GPS was being stored or shared all the time.
- Laptop permission failure guidance was not obvious enough.

### Why it happened
- The important privacy message was present but not emphasized enough.
- Browser/device permission edge cases were not surfaced at the point of action.

### Fix
- Added location troubleshooting guidance for MacBook and Windows/Samsung laptops.
- Added a large, visible note explaining location is only shared while on campus and hides after leaving campus.

### Next time checklist
- For sensitive features, surface the privacy boundary before the user clicks.
- Add “if it fails, do this” guidance where the failure happens.
- Prioritize reassurance and recovery instructions over feature marketing copy.

## 7. Tutorial and onboarding copy was too long

### Mistake
- Tutorials explained too much instead of pushing the user to one concrete first action.

### Why it happened
- Copy was feature-first rather than action-first.

### Fix
- Shortened tour copy across pages.
- Rewrote key guidance to focus on one action:
  - make a room
  - paste a code
  - turn sharing on
  - register a class

### Next time checklist
- Each onboarding step should answer one question only:
  - “What should I do here?”
- Prefer one short sentence over feature lists.
- If a sentence has “and” more than once, it is probably too long.

## 8. Sidebar `NEW` badge placement

### Mistake
- The `NEW!` badge could overlap or visually crowd navigation labels.

### Why it happened
- Badge lived inside the text row instead of as a separate fixed chip.

### Fix
- Moved badge to a separate right-aligned element.

### Next time checklist
- Test badges against long labels before shipping.
- Keep badges outside the truncating text container.

## 9. Unread badge logic counted the wrong things

### Mistake
- My own announcements or activity could contribute to unread state.
- DM badges could remain after opening Messages.
- App badge total could double-count direct-message unread totals.

### Why it happened
- Unread summary logic counted all activity newer than `last_visited_at`, regardless of author.
- Direct rooms were not consistently marked visited from the Messages screen.
- App badge aggregation added DM room totals twice.

### Fix
- Excluded self-authored activity from unread activity summary.
- Excluded self-authored announcements from unread announcement counts.
- Marked direct rooms as visited when Messages loads or a DM is opened.
- Fixed app badge total to avoid double-counting DM unread.

### Next time checklist
- Unread logic must answer this exact question:
  - “What did someone else do that I have not seen yet?”
- Always exclude the acting user from unread counts.
- Verify read-clear behavior on:
  - room page
  - DM page
  - topic chat popup
  - app badge total

## 10. Operational rule for future projects

Before saying a feature is complete, verify these in order:

1. Configuration is valid.
2. API path is correct.
3. UI state reflects the backend truth.
4. Unread/read state clears correctly.
5. My own actions do not generate unread noise for me.
6. Real user-facing copy is short, obvious, and failure-aware.

If any feature crosses multiple layers, always inspect and test all layers together:

- UI
- client state
- server logic
- provider configuration
- templates/content

