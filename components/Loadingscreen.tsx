'use client';

import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  onFinish?: () => void;
}

export default function LoadingScreen({ onFinish }: LoadingScreenProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');

  useEffect(() => {
    setMounted(true);
    const enterTimer = setTimeout(() => setPhase('visible'), 100);
    const exitTimer = setTimeout(() => setPhase('exit'), 2800);
    const finishTimer = setTimeout(() => {
      if (onFinish) onFinish();
    }, 3400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@300;400&display=swap');

        .loader-container {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #FDFBF7;
          transition: opacity 0.6s ease, transform 0.6s ease;
        }

        .loader-container.enter {
          opacity: 0;
          transform: scale(1.02);
        }

        .loader-container.visible {
          opacity: 1;
          transform: scale(1);
        }

        .loader-container.exit {
          opacity: 0;
          transform: scale(0.97);
        }

        /* Texture grain overlay */
        .loader-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          opacity: 0.5;
        }

        .loader-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          position: relative;
        }

        /* Decorative ring */
        .loader-ring {
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          border: 1px solid rgba(193, 154, 107, 0.2);
          top: 50%;
          left: 50%;
          transform: translate(-50%, calc(-50% - 20px));
          animation: ring-pulse 2s ease-in-out infinite;
        }

        .loader-ring-outer {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          border: 1px dashed rgba(193, 154, 107, 0.1);
          top: 50%;
          left: 50%;
          transform: translate(-50%, calc(-50% - 20px));
          animation: ring-spin 8s linear infinite;
        }

        @keyframes ring-pulse {
          0%, 100% { opacity: 0.4; transform: translate(-50%, calc(-50% - 20px)) scale(1); }
          50% { opacity: 0.8; transform: translate(-50%, calc(-50% - 20px)) scale(1.05); }
        }

        @keyframes ring-spin {
          from { transform: translate(-50%, calc(-50% - 20px)) rotate(0deg); }
          to { transform: translate(-50%, calc(-50% - 20px)) rotate(360deg); }
        }

        /* SVG wheat icon */
        .wheat-icon-wrapper {
          position: relative;
          width: 80px;
          height: 80px;
        }

        .wheat-svg {
          width: 80px;
          height: 80px;
          color: #C19A6B;
          filter: drop-shadow(0 4px 16px rgba(193, 154, 107, 0.4));
        }

        /* Stem draws first */
        .wheat-stem {
          stroke-dasharray: 80;
          stroke-dashoffset: 80;
          animation: draw-stem 0.6s ease-out 0.2s forwards;
        }

        /* Each grain draws with staggered delay */
        .wheat-grain {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
        }

        .wheat-grain:nth-child(2) { animation: draw-grain 0.5s ease-out 0.7s forwards; }
        .wheat-grain:nth-child(3) { animation: draw-grain 0.5s ease-out 0.9s forwards; }
        .wheat-grain:nth-child(4) { animation: draw-grain 0.5s ease-out 1.1s forwards; }
        .wheat-grain:nth-child(5) { animation: draw-grain 0.5s ease-out 0.8s forwards; }
        .wheat-grain:nth-child(6) { animation: draw-grain 0.5s ease-out 1.0s forwards; }
        .wheat-grain:nth-child(7) { animation: draw-grain 0.5s ease-out 1.2s forwards; }

        @keyframes draw-stem {
          to { stroke-dashoffset: 0; }
        }

        @keyframes draw-grain {
          to { stroke-dashoffset: 0; }
        }

        /* Glow pulse after drawing */
        .wheat-svg {
          animation: wheat-glow 2s ease-in-out 1.5s infinite;
        }

        @keyframes wheat-glow {
          0%, 100% { filter: drop-shadow(0 4px 16px rgba(193, 154, 107, 0.4)); }
          50% { filter: drop-shadow(0 4px 28px rgba(193, 154, 107, 0.7)); }
        }

        /* Text section */
        .text-wrapper {
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .loader-title {
          font-family: 'Playfair Display', serif;
          font-size: 2.8rem;
          font-weight: 700;
          color: #2C1810;
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .title-line1 {
          display: block;
          opacity: 0;
          transform: translateY(20px);
          animation: text-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.8s forwards;
        }

        .title-line2 {
          display: block;
          color: #C19A6B;
          font-style: italic;
          opacity: 0;
          transform: translateY(20px);
          animation: text-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 1.0s forwards;
        }

        .loader-subtitle {
          font-family: 'Montserrat', sans-serif;
          font-size: 0.75rem;
          font-weight: 300;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #8B6347;
          margin-top: 10px;
          opacity: 0;
          animation: text-rise 0.6s ease 1.3s forwards;
        }

        @keyframes text-rise {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Shimmer bar */
        .shimmer-bar {
          width: 60px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #C19A6B, transparent);
          margin: 14px auto 0;
          opacity: 0;
          animation: shimmer-appear 0.5s ease 1.5s forwards;
        }

        @keyframes shimmer-appear {
          to { opacity: 1; }
        }

        /* Progress dots */
        .progress-dots {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          opacity: 0;
          animation: text-rise 0.5s ease 1.6s forwards;
        }

        .dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #C19A6B;
          animation: dot-pulse 1.2s ease-in-out infinite;
        }

        .dot:nth-child(1) { animation-delay: 1.7s; }
        .dot:nth-child(2) { animation-delay: 1.9s; }
        .dot:nth-child(3) { animation-delay: 2.1s; }

        @keyframes dot-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        /* Decorative corner marks */
        .corner {
          position: absolute;
          width: 20px;
          height: 20px;
          border-color: rgba(193, 154, 107, 0.3);
          border-style: solid;
          opacity: 0;
          animation: corner-appear 0.5s ease 0.5s forwards;
        }

        .corner-tl { top: -40px; left: -40px; border-width: 1px 0 0 1px; }
        .corner-tr { top: -40px; right: -40px; border-width: 1px 1px 0 0; }
        .corner-bl { bottom: -40px; left: -40px; border-width: 0 0 1px 1px; }
        .corner-br { bottom: -40px; right: -40px; border-width: 0 1px 1px 0; }

        @keyframes corner-appear {
          to { opacity: 1; }
        }
      `}</style>

      <div className={`loader-container ${phase}`}>
        <div className="loader-content">

          {/* Decorative corners */}
          <div className="corner corner-tl" />
          <div className="corner corner-tr" />
          <div className="corner corner-bl" />
          <div className="corner corner-br" />

          {/* Decorative rings */}
          <div className="loader-ring" />
          <div className="loader-ring-outer" />

          {/* Animated wheat icon */}
          <div className="wheat-icon-wrapper">
            <svg
              viewBox="0 0 100 100"
              className="wheat-svg"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Stem */}
              <path className="wheat-stem" d="M50 92 Q50 50 50 8" />
              {/* Left grains */}
              <path className="wheat-grain" d="M50 75 Q30 65 30 45" />
              <path className="wheat-grain" d="M50 55 Q25 45 25 25" />
              <path className="wheat-grain" d="M50 35 Q35 25 40 10" />
              {/* Right grains */}
              <path className="wheat-grain" d="M50 75 Q70 65 70 45" />
              <path className="wheat-grain" d="M50 55 Q75 45 75 25" />
              <path className="wheat-grain" d="M50 35 Q65 25 60 10" />
            </svg>
          </div>

          {/* Title text */}
          <div className="text-wrapper">
            <h1 className="loader-title">
              <span className="title-line1">L'Artisan</span>
              <span className="title-line2">Doré</span>
            </h1>
            <div className="shimmer-bar" />
            <p className="loader-subtitle">Boulangerie Artisanale · depuis 1952</p>
            <div className="progress-dots">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}