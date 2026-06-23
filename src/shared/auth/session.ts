import { redirect } from "next/navigation";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { type Capability, hasCapability, type InternalUserRole, type InternalUserStatus } from "./permissions";
import { createServerSupabaseClient } from "./supabase/server";

export type SupabaseIdentity = {
  id: string;
  email: string | null;
};

export type InternalUserRecord = {
  id: string;
  authUserId: string | null;
  email: string;
  name: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type AuthDenialCode =
  | "NO_SESSION"
  | "NO_INTERNAL_USER"
  | "INACTIVE_INTERNAL_USER"
  | "MISSING_CAPABILITY";

export type InternalAccessResult =
  | {
      status: "allowed";
      identity: SupabaseIdentity;
      internalUser: InternalUserRecord;
    }
  | {
      status: "denied";
      code: AuthDenialCode;
      identity: SupabaseIdentity | null;
      internalUser: InternalUserRecord | null;
    };

type SupabaseUser = {
  id: string;
  email?: string | null;
};

type SupabaseAuthClientLike = {
  auth: {
    getUser: () => Promise<{
      data: { user: SupabaseUser | null };
      error: unknown;
    }>;
    getClaims?: () => Promise<{
      data: { claims?: { sub?: unknown; email?: unknown } } | null;
      error: unknown;
    }>;
  };
};

export type InternalUserReader = {
  findByAuthUserId: (authUserId: string) => Promise<InternalUserRecord | null>;
};

type InternalUserDelegate = {
  findUnique: (args: {
    where: { authUserId: string };
    select: {
      id: true;
      authUserId: true;
      email: true;
      name: true;
      role: true;
      status: true;
    };
  }) => Promise<InternalUserRecord | null>;
};

type PrismaWithInternalUser = PrismaClientLike & {
  internalUser: InternalUserDelegate;
};

type CurrentAccessOptions = {
  requiredCapability?: Capability;
  supabase?: SupabaseAuthClientLike;
  internalUserReader?: InternalUserReader;
};

export function resolveInternalUserAccess(input: {
  identity: SupabaseIdentity | null;
  internalUser: InternalUserRecord | null;
  requiredCapability?: Capability;
}): InternalAccessResult {
  if (!input.identity) {
    return {
      code: "NO_SESSION",
      identity: null,
      internalUser: null,
      status: "denied"
    };
  }

  if (!input.internalUser) {
    return {
      code: "NO_INTERNAL_USER",
      identity: input.identity,
      internalUser: null,
      status: "denied"
    };
  }

  if (input.internalUser.status !== "ACTIVE") {
    return {
      code: "INACTIVE_INTERNAL_USER",
      identity: input.identity,
      internalUser: input.internalUser,
      status: "denied"
    };
  }

  if (
    input.requiredCapability &&
    !hasCapability(input.internalUser.role, input.requiredCapability)
  ) {
    return {
      code: "MISSING_CAPABILITY",
      identity: input.identity,
      internalUser: input.internalUser,
      status: "denied"
    };
  }

  return {
    identity: input.identity,
    internalUser: input.internalUser,
    status: "allowed"
  };
}

export async function getSupabaseIdentity(
  supabaseClient?: SupabaseAuthClientLike
): Promise<SupabaseIdentity | null> {
  const supabase = supabaseClient ?? ((await createServerSupabaseClient()) as SupabaseAuthClientLike);

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

export function createPrismaInternalUserReader(): InternalUserReader {
  return {
    async findByAuthUserId(authUserId) {
      const prisma = (await createPrismaClient()) as PrismaWithInternalUser;

      return prisma.internalUser.findUnique({
        select: {
          authUserId: true,
          email: true,
          id: true,
          name: true,
          role: true,
          status: true
        },
        where: { authUserId }
      });
    }
  };
}

export async function getCurrentInternalAccess(
  options: CurrentAccessOptions = {}
): Promise<InternalAccessResult> {
  const identity = await getSupabaseIdentity(options.supabase);

  if (!identity) {
    return resolveInternalUserAccess({
      identity,
      internalUser: null,
      requiredCapability: options.requiredCapability
    });
  }

  const internalUserReader = options.internalUserReader ?? createPrismaInternalUserReader();
  const internalUser = await internalUserReader.findByAuthUserId(identity.id);

  return resolveInternalUserAccess({
    identity,
    internalUser,
    requiredCapability: options.requiredCapability
  });
}

export async function getCurrentInternalUser(
  options: Omit<CurrentAccessOptions, "requiredCapability"> = {}
): Promise<InternalUserRecord | null> {
  const access = await getCurrentInternalAccess(options);

  return access.status === "allowed" ? access.internalUser : null;
}

export async function requireInternalUser(
  options: Omit<CurrentAccessOptions, "requiredCapability"> = {}
): Promise<InternalUserRecord> {
  const access = await getCurrentInternalAccess(options);

  if (access.status === "allowed") {
    return access.internalUser;
  }

  handleDeniedAccess(access);
}

export async function requireCapability(
  capability: Capability,
  options: Omit<CurrentAccessOptions, "requiredCapability"> = {}
): Promise<InternalUserRecord> {
  const access = await getCurrentInternalAccess({ ...options, requiredCapability: capability });

  if (access.status === "allowed") {
    return access.internalUser;
  }

  handleDeniedAccess(access);
}

function handleDeniedAccess(access: Extract<InternalAccessResult, { status: "denied" }>): never {
  if (access.code === "NO_SESSION") {
    redirect("/login");
  }

  redirect("/unauthorized");
}
