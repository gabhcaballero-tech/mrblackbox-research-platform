-- Add nullable Supabase Auth linkage for internal users.
ALTER TABLE "internal_users" ADD COLUMN "authUserId" UUID;

-- Nullable unique index allows many unlinked rows while enforcing one app user per Supabase Auth user.
CREATE UNIQUE INDEX "internal_users_authUserId_key" ON "internal_users"("authUserId");
