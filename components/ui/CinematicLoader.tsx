"use client";

// A fascinating 3D holographic cube of "scene frames" rotating in space, wrapped
// in orbiting particles + a breathing aura. Pure CSS 3D — zero dependencies.
// Used on the generation / waiting screens so the wait feels premium, not idle.
export function CinematicLoader({ icon }: { icon?: string }) {
  return (
    <div className="vy-stage relative mx-auto flex h-56 w-56 items-center justify-center">
      <div className="vy-aura" />

      {/* Rotating 3D cube — each face a stage of the creative process */}
      <div className="vy-cube">
        <div className="vy-cube-face f1">✍️</div>
        <div className="vy-cube-face f2">🎬</div>
        <div className="vy-cube-face f3">🎭</div>
        <div className="vy-cube-face f4">🎨</div>
        <div className="vy-cube-face f5">🎞️</div>
        <div className="vy-cube-face f6">⚡</div>
      </div>

      {/* Orbiting particles on two rings */}
      <div className="vy-orbit" />
      <div className="vy-orbit2" />

      {/* Current-step icon floating at center-front */}
      {icon && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="vy-glowtext text-2xl drop-shadow-[0_0_12px_rgba(192,132,252,0.9)]">{icon}</span>
        </div>
      )}
    </div>
  );
}
