import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// ── Design Tokens (lexdiff.gomdori.app) ────────────────────
const BG = "#fafaf8";
const CARD_BG = "#ffffff";
const CARD_BORDER = "#e5e5e0";
const NAVY = "#1a2b4c";
const GOLD = "#b08d57";
const TEXT = "#1a1a1a";
const TEXT_MUTED = "#6b7280";
const TEXT_LIGHT = "#9ca3af";
const WHITE = "#ffffff";

const FONT_SANS = "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_SERIF = "'RIDIBatang', 'Noto Serif KR', Georgia, serif";
const FONT_LOGO = "'Libre Bodoni', Georgia, serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ── SVG Scale Icon ─────────────────────────────────────────
const ScaleIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = WHITE }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v18" /><path d="M5 7l7-4 7 4" />
    <path d="M3 13l2-6 4 6a4 4 0 01-6 0z" /><path d="M15 13l2-6 4 6a4 4 0 01-6 0z" />
  </svg>
);

// ── Scene 1: Hero (0-90 frames = 3s) ──────────────────────
const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, from: 0.6, to: 1, durationInFrames: 12 });
  const logoOp = interpolate(frame, [0, 8], [0, 1], CLAMP);
  const lineW = interpolate(frame, [10, 22], [0, 64], CLAMP);
  const subOp = interpolate(frame, [18, 28], [0, 1], CLAMP);
  const subY = interpolate(frame, [18, 28], [12, 0], CLAMP);
  const statsOp = interpolate(frame, [35, 45], [0, 1], CLAMP);

  const stats = [
    { icon: "⚖️", label: "법률", value: "1,706" },
    { icon: "📋", label: "위임법령", value: "3,476" },
    { icon: "🏛️", label: "자치법규", value: "15.8만" },
    { icon: "📖", label: "판례", value: "25만" },
  ];

  return (
    <AbsoluteFill style={{ background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_SANS }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Badge */}
        <div style={{
          opacity: logoOp,
          border: `1px solid ${NAVY}30`,
          padding: "5px 16px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          color: NAVY,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 24,
        }}>
          <ScaleIcon size={12} color={NAVY} />
          Premium Legal AI
        </div>

        {/* Logo */}
        <div style={{ opacity: logoOp, transform: `scale(${logoScale})`, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 64, height: 64, background: NAVY,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(26,43,76,0.3)",
          }}>
            <ScaleIcon size={28} color={WHITE} />
          </div>
          <span style={{
            fontSize: 88, fontFamily: FONT_LOGO, fontWeight: 500,
            fontStyle: "italic", color: NAVY, letterSpacing: "-0.03em",
          }}>
            LexDiff
          </span>
        </div>

        {/* Gold line */}
        <div style={{ width: lineW, height: 3, background: GOLD, margin: "20px auto" }} />

        {/* Subtitle */}
        <div style={{
          opacity: subOp, transform: `translateY(${subY}px)`,
          fontSize: 20, fontFamily: FONT_SERIF, color: TEXT_MUTED,
          fontWeight: 500, letterSpacing: "0.05em", lineHeight: 1.6,
        }}>
          AI 법률 검색 · 신구조문 비교 · 판례 분석 · 위임법령 추적
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 32, marginTop: 36, opacity: statsOp, fontSize: 13, fontWeight: 500 }}>
          {stats.map((s, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, color: TEXT_MUTED }}>
              <span>{s.icon}</span>
              <span>{s.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: NAVY, fontWeight: 700 }}>{s.value}</span>
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 2: Search Demo (90-270 = 6s = 180f) ────────────
const SearchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const query = "퇴직금 못 받았는데 어떻게 해야 하나요?";
  const typedLen = Math.min(Math.floor(frame * 0.8), query.length); // 초고속 타이핑
  const typedText = query.slice(0, typedLen);
  const cursor = frame % 16 < 10;

  const barOp = interpolate(frame, [0, 8], [0, 1], CLAMP);

  const rStart = 30; // 타이핑 끝나자마자
  const rFrame = Math.max(0, frame - rStart);

  const responses = [
    { icon: "⚖️", label: "법령 검색", detail: "search_law → 근로기준법", delay: 0 },
    { icon: "📖", label: "조문 조회", detail: "제36조 (퇴직금 지급 의무)", delay: 8 },
    { icon: "🔍", label: "판례 검색", detail: "대법원 2022다54321 — 퇴직금 청구권", delay: 16 },
    { icon: "✨", label: "AI 분석 완료", detail: "2개 법령, 3개 판례 기반 답변", delay: 24 },
  ];

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT_SANS }}>
      {/* Label */}
      <div style={{
        position: "absolute", top: 50, left: 0, right: 0, textAlign: "center",
        fontSize: 12, color: GOLD, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase" as const,
        opacity: interpolate(frame, [0, 10], [0, 1], CLAMP),
      }}>
        AI Legal Search
      </div>

      {/* Search bar */}
      <div style={{
        position: "absolute", top: 95, left: "50%",
        transform: "translateX(-50%)", opacity: barOp, width: 700,
      }}>
        <div style={{
          background: WHITE, border: `1px solid ${CARD_BORDER}`,
          display: "flex", alignItems: "center",
          boxShadow: "0 16px 48px rgba(0,0,0,0.07)",
        }}>
          <div style={{
            width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center",
            borderRight: `1px solid ${CARD_BORDER}`, fontSize: 18,
          }}>🧠</div>
          <div style={{ flex: 1, padding: "0 18px", fontSize: 17, color: TEXT, height: 52, display: "flex", alignItems: "center" }}>
            <span>{typedText}</span>
            {cursor && <span style={{ color: NAVY, fontWeight: 300, marginLeft: 1 }}>|</span>}
          </div>
          <div style={{
            height: 52, padding: "0 28px", background: NAVY, color: WHITE,
            display: "flex", alignItems: "center", fontSize: 15, fontWeight: 700, letterSpacing: "0.15em",
          }}>검색</div>
        </div>
      </div>

      {/* Responses */}
      <div style={{
        position: "absolute", top: 185, left: "50%", transform: "translateX(-50%)",
        width: 700, display: "flex", flexDirection: "column", gap: 8,
      }}>
        {responses.map((r, i) => {
          const lf = Math.max(0, rFrame - r.delay);
          const op = interpolate(lf, [0, 6], [0, 1], CLAMP);
          const x = interpolate(lf, [0, 8], [16, 0], CLAMP);
          const dots = Math.min(3, Math.floor(lf / 5));
          const loading = lf > 0 && lf < 10;
          const barW = lf >= 10 ? interpolate(lf, [10, 18], [0, 100], CLAMP) : 0;

          return (
            <div key={i} style={{
              opacity: op, transform: `translateX(${x}px)`,
              background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: `${barW}%`, height: 2, background: GOLD }} />
              <span style={{ fontSize: 18, width: 26, textAlign: "center" }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 14, color: NAVY, fontWeight: 700 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: FONT_MONO, marginTop: 1 }}>
                  {loading ? `처리 중${".".repeat(dots)}` : (lf >= 10 ? r.detail : "")}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Badge */}
      {rFrame > 40 && (
        <div style={{
          position: "absolute", bottom: 60, left: "50%", transform: "translateX(-50%)",
          border: `1px solid ${GOLD}50`, padding: "6px 20px",
          fontSize: 13, color: GOLD, fontWeight: 600,
          opacity: interpolate(rFrame, [40, 47], [0, 1], CLAMP),
        }}>
          실시간 스트리밍 — 법령 MCP 도구 자동 호출
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── Scene 3: Features + CTA (210-330 = 4s = 120f) ───────��
const FeatureCTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Cards (0-55f)
  const features = [
    { title: "AI 법률 분석", icon: "🧠", desc: "일상 언어 → 법령·판례 답변", delay: 0 },
    { title: "법령 비교·추적", icon: "⚡", desc: "신구조문 대조표 · 개정 이력", delay: 6 },
    { title: "실시간 데이터", icon: "📡", desc: "법제처 API 다이렉트 연동", delay: 12 },
  ];

  const headerOp = interpolate(frame, [0, 6], [0, 1], CLAMP);

  // Phase 2: CTA (55-120f)
  const ctaFrame = Math.max(0, frame - 55);
  const ctaOp = interpolate(ctaFrame, [0, 8], [0, 1], CLAMP);

  // Cards fade out, CTA fades in
  const cardsFade = interpolate(frame, [48, 58], [1, 0], CLAMP);
  const ctaActive = frame >= 52;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT_SANS }}>
      {/* Phase 1: Feature cards */}
      <div style={{ opacity: cardsFade, position: "absolute", inset: 0 }}>
        <div style={{
          position: "absolute", top: 55, left: 0, right: 0, textAlign: "center", opacity: headerOp,
        }}>
          <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" as const, marginBottom: 8 }}>
            Core Competence
          </div>
          <div style={{ fontSize: 34, fontFamily: FONT_SERIF, color: NAVY, fontWeight: 900, lineHeight: 1.3 }}>
            법령에서 찾고, 근거로 답합니다.
          </div>
        </div>

        <div style={{
          position: "absolute", top: 210, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 20,
        }}>
          {features.map((f, i) => {
            const lf = Math.max(0, frame - f.delay - 5);
            const sc = spring({ frame: lf, fps, from: 0.8, to: 1, durationInFrames: 8 });
            const op = interpolate(lf, [0, 5], [0, 1], CLAMP);
            const y = interpolate(lf, [0, 6], [20, 0], CLAMP);
            const bar = lf > 6 ? interpolate(lf, [6, 14], [0, 1], CLAMP) : 0;

            return (
              <div key={i} style={{
                width: 300, opacity: op, transform: `translateY(${y}px) scale(${sc})`,
                background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
                padding: "32px 28px", position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: GOLD, transform: `scaleX(${bar})`, transformOrigin: "left" }} />
                <div style={{
                  width: 44, height: 44, background: "#f9fafb", border: `1px solid ${CARD_BORDER}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 16,
                }}>{f.icon}</div>
                <div style={{ fontSize: 20, fontFamily: FONT_SERIF, color: NAVY, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        {frame > 28 && (
          <div style={{
            position: "absolute", bottom: 45, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 32, opacity: interpolate(frame, [28, 36], [0, 1], CLAMP),
            fontSize: 12, fontWeight: 500,
          }}>
            {[
              { icon: "⚖️", label: "법률", value: "1,706" },
              { icon: "📋", label: "위임법령", value: "3,476" },
              { icon: "🏛️", label: "자치법규", value: "15.8만" },
              { icon: "📖", label: "판례", value: "25만" },
            ].map((s, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, color: TEXT_MUTED }}>
                {s.icon} {s.label} <span style={{ color: NAVY, fontWeight: 700 }}>{s.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Phase 2: CTA */}
      {ctaActive && (
        <AbsoluteFill style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          opacity: ctaOp,
        }}>
          {/* Glow */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", width: 400, height: 400,
            transform: "translate(-50%, -50%)", borderRadius: "50%",
            background: `radial-gradient(circle, ${NAVY} 0%, transparent 70%)`,
            opacity: 0.08,
          }} />

          {/* Logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            transform: `scale(${spring({ frame: ctaFrame, fps, from: 0.7, to: 1, durationInFrames: 10 })})`,
          }}>
            <div style={{
              width: 64, height: 64, background: NAVY,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(26,43,76,0.3)",
            }}>
              <ScaleIcon size={28} color={WHITE} />
            </div>
            <span style={{
              fontSize: 80, fontFamily: FONT_LOGO, fontWeight: 500,
              fontStyle: "italic", color: NAVY, letterSpacing: "-0.03em",
            }}>LexDiff</span>
          </div>

          {/* Gold line */}
          <div style={{
            width: interpolate(ctaFrame, [5, 14], [0, 64], CLAMP),
            height: 3, background: GOLD, margin: "20px 0",
          }} />

          {/* Tagline */}
          <div style={{
            fontSize: 20, fontFamily: FONT_SERIF, color: TEXT_MUTED,
            fontWeight: 500, letterSpacing: "0.05em",
            opacity: interpolate(ctaFrame, [10, 18], [0, 1], CLAMP),
            textAlign: "center", lineHeight: 1.5,
          }}>
            법령을 쉽게. AI로 똑똑하게.
            <div style={{ fontSize: 15, color: GOLD, fontWeight: 600, marginTop: 6, letterSpacing: "0.1em" }}>
              공공 Legal AI의 시작
            </div>
          </div>

          {/* URL */}
          <div style={{
            marginTop: 24, fontSize: 15, color: TEXT_LIGHT, fontWeight: 500,
            opacity: interpolate(ctaFrame, [16, 24], [0, 1], CLAMP),
          }}>
            lexdiff.gomdori.app
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ── Main Composition (11s = 330 frames) ────────────────────
export const LexDiffDemo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={90}>
        <HeroScene />
      </Sequence>
      <Sequence from={90} durationInFrames={120}>
        <SearchScene />
      </Sequence>
      <Sequence from={210} durationInFrames={120}>
        <FeatureCTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
