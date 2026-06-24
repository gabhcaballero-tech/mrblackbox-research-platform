import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createParticipantPortalRepository, type ParticipantPortalRepository } from "@/modules/participant-portal/repository";
import {
  participantPortalPublicSessionCookieName,
  readPublicPortalSessionToken
} from "@/modules/participant-portal/public-session";
import { createServerSupabaseClient } from "./supabase/server";

export type ParticipantPortalIdentity = {
  email: string | null;
  id: string;
  source?: "PUBLIC_SESSION" | "SUPABASE";
};

export type ParticipantPortalAuthResult =
  | {
      identity: ParticipantPortalIdentity;
      status: "allowed";
    }
  | {
      identity: ParticipantPortalIdentity;
      message: string;
      status: "internal_user_blocked";
    }
  | {
      status: "no_session";
    };

type ParticipantPortalSupabaseSessionClient = {
  auth: {
    getClaims?: () => Promise<{
      data: { claims?: { email?: unknown; sub?: unknown } } | null;
      error: unknown;
    }>;
    getUser: () => Promise<{
      data: { user: { email?: string | null; id: string } | null };
      error: unknown;
    }>;
    signOut: () => Promise<unknown>;
  };
};

export async function getParticipantPortalAuth({
  repository = createParticipantPortalRepository(),
  studyCode,
  supabase
}: {
  repository?: ParticipantPortalRepository;
  studyCode?: string;
  supabase?: ParticipantPortalSupabaseSessionClient;
} = {}): Promise<ParticipantPortalAuthResult> {
  const client = supabase ?? ((await createServerSupabaseClient()) as ParticipantPortalSupabaseSessionClient);
  const identity = await getPortalIdentity(client);

  if (!identity) {
    const publicIdentity = studyCode ? await getPublicPortalIdentity(studyCode) : null;

    if (publicIdentity) {
      return {
        identity: publicIdentity,
        status: "allowed"
      };
    }

    return { status: "no_session" };
  }

  const internalUser = await repository.findInternalUserByAuthUserId(identity.id);

  if (internalUser) {
    return {
      identity,
      message: "Este acceso está reservado para participantes.",
      status: "internal_user_blocked"
    };
  }

  return {
    identity: { ...identity, source: "SUPABASE" },
    status: "allowed"
  };
}

export async function requireParticipantPortalAuth({
  repository,
  studyCode,
  supabase
}: {
  repository?: ParticipantPortalRepository;
  studyCode: string;
  supabase?: ParticipantPortalSupabaseSessionClient;
}): Promise<Extract<ParticipantPortalAuthResult, { status: "allowed" }>> {
  const auth = await getParticipantPortalAuth({ repository, studyCode, supabase });

  if (auth.status === "allowed") {
    return auth;
  }

  if (auth.status === "internal_user_blocked") {
    redirect(`/participar/${encodeURIComponent(studyCode)}/verificar?error=internal`);
  }

  redirect(`/participar/${encodeURIComponent(studyCode)}`);
}

export async function signOutParticipantPortal({
  supabase
}: {
  supabase?: ParticipantPortalSupabaseSessionClient;
} = {}): Promise<void> {
  const client = supabase ?? ((await createServerSupabaseClient()) as ParticipantPortalSupabaseSessionClient);
  await client.auth.signOut();
}

async function getPortalIdentity(
  supabase: ParticipantPortalSupabaseSessionClient
): Promise<ParticipantPortalIdentity | null> {
  if (typeof supabase.auth.getClaims === "function") {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;

    if (!error && typeof sub === "string") {
      const email = data?.claims?.email;

      return {
        email: typeof email === "string" ? email : null,
        id: sub
      };
    }
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return {
    email: data.user.email ?? null,
    id: data.user.id
  };
}

async function getPublicPortalIdentity(studyCode: string): Promise<ParticipantPortalIdentity | null> {
  const secret = process.env.PARTICIPANT_PORTAL_HASH_SECRET;

  if (!secret) {
    return null;
  }

  const cookieStore = await cookies();
  const session = readPublicPortalSessionToken({
    secret,
    studyCode,
    token: cookieStore.get(participantPortalPublicSessionCookieName(studyCode))?.value
  });

  if (!session) {
    return null;
  }

  return {
    email: null,
    id: session.identityId,
    source: "PUBLIC_SESSION"
  };
}
