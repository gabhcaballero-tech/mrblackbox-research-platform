"use client";

export const mirroredSelfiePreviewStyle = { transform: "scaleX(-1)" } as const;
export const selfieMediaFrameClass = "relative overflow-hidden rounded-md bg-black";
export const selfieMediaClass = "aspect-[3/4] w-full rounded-md bg-zinc-950 object-cover";

export function shouldMirrorSelfiePreview(facingMode: "environment" | "user") {
  return facingMode === "user";
}

export function SelfiePrivacyHud({
  mode,
  testIdPrefix = "selfie"
}: {
  mode: "camera" | "preview";
  testIdPrefix?: string;
}) {
  const showEyeText = mode === "camera";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-testid={`${testIdPrefix}-${mode}-hud`}
    >
      <div className="absolute inset-x-0 bottom-0 top-[43%] bg-black/90" data-testid={`${testIdPrefix}-${mode}-lower-mask`} />
      <div className="absolute left-1/2 top-[29%] flex w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center px-6">
        {showEyeText ? (
          <p className="rounded-md bg-zinc-950/60 px-3 py-1 text-xs font-semibold text-white shadow-sm">
            Coloca tus ojos aqui
          </p>
        ) : null}
        <div className="relative mt-3 h-14 w-56 max-w-[76vw]">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/55" />
          <div
            className="absolute left-[35%] top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2"
            data-testid={`${testIdPrefix}-${mode}-left-eye-guide`}
          >
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/85" />
            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/85" />
          </div>
          <div
            className="absolute left-[65%] top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2"
            data-testid={`${testIdPrefix}-${mode}-right-eye-guide`}
          >
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/85" />
            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/85" />
          </div>
        </div>
        <div className="mt-6 h-px w-28 bg-white/35" />
      </div>
    </div>
  );
}
