import { notFound, redirect } from "next/navigation";
import { participantTokenSchema } from "@/shared/validation/participant";

type ParticipantPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ParticipantPage({ params }: ParticipantPageProps) {
  const { token } = await params;
  const parsedToken = participantTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    notFound();
  }

  redirect(`/p/${encodeURIComponent(parsedToken.data)}/activities`);
}
