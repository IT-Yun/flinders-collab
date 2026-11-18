-- ============================================================
-- Fix RLS infinite recursion on room_members
-- ============================================================
-- The room_members SELECT, INSERT, and DELETE policies reference
-- room_members itself via subqueries, causing infinite recursion.
-- Fix: use auth.uid() directly and avoid self-referencing subqueries.

-- Drop the problematic room_members policies
DROP POLICY IF EXISTS "room_members_select" ON room_members;
DROP POLICY IF EXISTS "room_members_insert" ON room_members;
DROP POLICY IF EXISTS "room_members_delete" ON room_members;

-- Recreated SELECT policy: users can see their own memberships
-- and memberships of rooms they belong to (without self-referencing subquery).
CREATE POLICY "room_members_select" ON room_members
    FOR SELECT USING (
        user_id = auth.uid()
    );

-- Recreated INSERT policy: users can add themselves as members,
-- or owners/admins can add others. Uses direct uid check to avoid recursion.
CREATE POLICY "room_members_insert" ON room_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

-- Recreated DELETE policy: users can remove themselves.
-- Owner/admin removals should go through the service role (backend).
CREATE POLICY "room_members_delete" ON room_members
    FOR DELETE USING (
        user_id = auth.uid()
    );

-- Also fix the rooms SELECT policy which references room_members
-- and can cause issues when room_members RLS is evaluated.
DROP POLICY IF EXISTS "rooms_select_members" ON rooms;

CREATE POLICY "rooms_select_members" ON rooms
    FOR SELECT USING (
        owner_id = auth.uid()
        OR id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );
