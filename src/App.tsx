import { useEffect, useRef, useState, useCallback } from 'react';

function App() {
  const [clock, setClock] = useState('');
  const [guidesVisible, setGuidesVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [animationsReady, setAnimationsReady] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const decodingRef1 = useRef<HTMLSpanElement>(null);
  const decodingRef2 = useRef<HTMLSpanElement>(null);
  const contactRowsRef = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const reducedMotion = useRef(false);

  const line1 = 'Пока тут ничего нет,';
  const line2 = 'но не переживайте — я найду для вас решение.';

  // Check reduced motion preference
  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Delay all animations by 1 second after page load
  useEffect(() => {
    const handleLoad = () => {
      setTimeout(() => {
        setAnimationsReady(true);
      }, 1000);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  // Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const timeStr = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Barnaul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
      setClock(timeStr);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Master synchronized animation: SVG drawing + character-by-character typing
  useEffect(() => {
    if (!animationsReady) return;

    if (reducedMotion.current) {
      // Show everything immediately
      setGuidesVisible(true);
      // Show SVG paths fully
      if (svgRef.current) {
        const paths = svgRef.current.querySelectorAll('.svg-path') as NodeListOf<SVGPathElement>;
        paths.forEach((el) => {
          const length = el.getTotalLength();
          el.style.strokeDasharray = String(length);
          el.style.strokeDashoffset = '0';
        });
        // Show all pens immediately
        const pens = svgRef.current.querySelectorAll('.pen-dot') as NodeListOf<SVGCircleElement>;
        pens.forEach((pen) => pen.classList.add('active'));
      }
      return;
    }

    if (!svgRef.current) return;

    const svg = svgRef.current;

    // Scale 4s on desktop (>760px) — Variant B: modify path coordinates directly
    if (window.innerWidth > 760) {
      const scaleFour = (pathEl: SVGPathElement, scale: number) => {
        const d = pathEl.getAttribute('d') || '';
        // Parse all numbers from the path
        const numbers: number[] = [];
        const regex = /-?\d+\.?\d*/g;
        let match;
        while ((match = regex.exec(d)) !== null) {
          numbers.push(parseFloat(match[0]));
        }
        
        // Find bounding box center
        const xs = numbers.filter((_, i) => i % 2 === 0);
        const ys = numbers.filter((_, i) => i % 2 === 1);
        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
        
        // Scale coordinates relative to center
        const scaledNumbers = numbers.map((val, i) => {
          const center = i % 2 === 0 ? centerX : centerY;
          return center + (val - center) * scale;
        });
        
        // Reconstruct path string
        let newD = d;
        let numIndex = 0;
        newD = d.replace(/-?\d+\.?\d*/g, () => {
          return String(Math.round(scaledNumbers[numIndex++] * 100) / 100);
        });
        
        pathEl.setAttribute('d', newD);
      };
      
      const fourLeft = svg.querySelector('.svg-path--four-left') as SVGPathElement;
      const fourRight = svg.querySelector('.svg-path--four-right') as SVGPathElement;
      
      if (fourLeft) scaleFour(fourLeft, 1.2);
      if (fourRight) scaleFour(fourRight, 1.2);
    }

    // SVG timings (seconds) — unchanged
    const timings = [
      { delay: 0, duration: 1.2 },
      { delay: 1.2, duration: 1.6 },
      { delay: 2.8, duration: 1.2 },
      { delay: 4.0, duration: 1.4 },
    ];

    // Total duration D = last path end
    const D = timings[timings.length - 1].delay + timings[timings.length - 1].duration; // 5.4s

    // Initialize SVG paths
    const pathEls = svg.querySelectorAll('.svg-path') as NodeListOf<SVGPathElement>;
    const pathData: { el: SVGPathElement; length: number; delay: number; duration: number }[] = [];
    pathEls.forEach((el, i) => {
      const length = el.getTotalLength();
      el.style.strokeDasharray = String(length);
      el.style.strokeDashoffset = String(length);
      pathData.push({ el, length, delay: timings[i].delay, duration: timings[i].duration });
    });

    // Initialize pen dots — one per path
    const pens = svg.querySelectorAll('.pen-dot') as NodeListOf<SVGCircleElement>;

    // Pre-set pen positions and schedule activation synchronized with path delays
    const penTimers: number[] = [];
    pathData.forEach((data, i) => {
      if (pens[i]) {
        // Set initial position at the start of the path
        const startPt = data.el.getPointAtLength(0);
        pens[i].setAttribute('cx', String(startPt.x));
        pens[i].setAttribute('cy', String(startPt.y));
        
        // Activate pen exactly when path drawing begins
        const delayMs = data.delay * 1000;
        const timer = window.setTimeout(() => {
          pens[i].classList.remove('fading');
          pens[i].classList.add('active');
        }, delayMs);
        penTimers.push(timer);
      }
    });

    // Character typing distribution: proportional to string lengths
    const len1 = line1.length;
    const len2 = line2.length;
    const totalChars = len1 + len2;
    const w1 = len1 / totalChars; // fraction of D for line1
    const d1 = D * w1; // duration for line1
    const d2 = D - d1; // duration for line2

    // Set transition delays for each character span
    if (decodingRef1.current) {
      const spans = decodingRef1.current.querySelectorAll('span');
      spans.forEach((span, i) => {
        const delay = (i / len1) * d1;
        span.style.transitionDelay = `${delay}s`;
      });
    }
    if (decodingRef2.current) {
      const spans = decodingRef2.current.querySelectorAll('span');
      spans.forEach((span, i) => {
        const delay = d1 + (i / len2) * d2;
        span.style.transitionDelay = `${delay}s`;
      });
    }

    const t0 = performance.now();
    let rafId = 0;
    let finished = false;
    let prevActiveIdx = -1;

    // Smoothstep easing for SVG paths
    const smoothstep = (t: number): number => {
      const c = Math.max(0, Math.min(1, t));
      return c * c * (3 - 2 * c);
    };

    const tick = (now: number) => {
      const elapsed = (now - t0) / 1000; // seconds

      // === SVG ANIMATION ===
      // Find which path is currently active
      let activeIdx = -1;
      for (let i = 0; i < pathData.length; i++) {
        const { delay, duration } = pathData[i];
        if (elapsed >= delay && elapsed < delay + duration) {
          activeIdx = i;
          break;
        }
      }

      // Handle pen transitions (fade out only — activation is handled by setTimeout)
      if (activeIdx !== prevActiveIdx) {
        // Fade out previous pen
        if (prevActiveIdx >= 0 && prevActiveIdx < pens.length) {
          pens[prevActiveIdx].classList.remove('active');
          pens[prevActiveIdx].classList.add('fading');
        }
        prevActiveIdx = activeIdx;
      }

      // Finalize paths that should be fully drawn
      for (let i = 0; i < pathData.length; i++) {
        const { el, length, delay, duration } = pathData[i];
        const end = delay + duration;
        if (elapsed >= end) {
          el.style.strokeDashoffset = '0';
        } else if (elapsed < delay) {
          el.style.strokeDashoffset = String(length);
        }
      }

      // Draw active path
      if (activeIdx !== -1) {
        const { el, length, delay, duration } = pathData[activeIdx];
        const localT = (elapsed - delay) / duration;
        const e = smoothstep(localT);
        el.style.strokeDashoffset = String(length * (1 - e));
        const pt = el.getPointAtLength(length * e);
        pens[activeIdx].setAttribute('cx', String(pt.x));
        pens[activeIdx].setAttribute('cy', String(pt.y));
      }

      // === CHECK COMPLETION ===
      if (elapsed >= D) {
        if (!finished) {
          finished = true;
          // Finalize SVG
          pathData.forEach(({ el }) => {
            el.style.strokeDashoffset = '0';
          });
          // Fade out last pen
          const lastPenIdx = pathData.length - 1;
          if (lastPenIdx < pens.length) {
            pens[lastPenIdx].classList.remove('active');
            pens[lastPenIdx].classList.add('fading');
          }
          setTimeout(() => setGuidesVisible(true), 400);
        }
        return; // stop rAF
      }

      rafId = requestAnimationFrame(tick);
    };

    // Trigger character typing animation
    if (decodingRef1.current) decodingRef1.current.classList.add('active');
    if (decodingRef2.current) decodingRef2.current.classList.add('active');

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      penTimers.forEach(timer => clearTimeout(timer));
    };
  }, [animationsReady]);

  // IntersectionObserver for contact rows (desktop only)
  useEffect(() => {
    if (!animationsReady) return;

    const isMobile = window.innerWidth <= 760 || 'ontouchstart' in window;

    // On mobile or reduced motion, show all rows immediately
    if (isMobile || reducedMotion.current) {
      contactRowsRef.current.forEach((row) => {
        if (row) row.classList.add('visible');
      });
      return;
    }

    // On desktop, use IntersectionObserver for scroll-triggered animation
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !entry.target.classList.contains('visible')) {
            const el = entry.target as HTMLElement;
            const delay = parseInt(el.dataset.delay || '0', 10);
            setTimeout(() => el.classList.add('visible'), delay);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.2 }
    );

    contactRowsRef.current.forEach((row) => {
      if (row) observer.observe(row);
    });

    return () => observer.disconnect();
  }, [animationsReady]);

  // Copy to clipboard
  const handleCopy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopyStates((prev) => ({ ...prev, [id]: true }));
    setToastText('скопировано');
    setToastVisible(true);

    setTimeout(() => {
      setCopyStates((prev) => ({ ...prev, [id]: false }));
    }, 1800);

    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  }, []);

  // Scroll to contact
  const scrollToContact = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('contact');
    if (el) {
      const offset = window.innerWidth <= 760 ? 160 : 320;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: reducedMotion.current ? 'auto' : 'smooth' });
    }
  };

  // Privacy modal
  const openPrivacy = () => {
    setPrivacyModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closePrivacy = () => {
    setPrivacyModalOpen(false);
    document.body.style.overflow = '';
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && privacyModalOpen) {
        closePrivacy();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [privacyModalOpen]);

  return (
    <>
      {/* Paper grain overlay */}
      <svg className="grain" xmlns="http://www.w3.org/2000/svg">
        <filter id="grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter)" />
      </svg>

      {/* Header */}
      <header className="header">
        <div className="header__brand">роман бестужев</div>
        <div className="header__clock">{clock}</div>
        <div className="header__tagline">веб-разработка.</div>
      </header>

      {/* Side details */}
      <div className="side-detail side-detail--left">53.3477° n · 83.7777° e</div>
      <div className="side-detail side-detail--right">656000 · барнаул</div>

      {/* Hero */}
      <main className="hero">
        <div className="hero__inner">
          <div className="hero__column">
          {/* SVG 404 */}
          <div className="hero__svg-wrap">
            <svg
              ref={svgRef}
              viewBox="0 0 420 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="404"
              role="img"
            >
              <g transform="translate(420 0) scale(-1 1)">
                {/* First 4 (screen-right, shifted closer to 0: +15 X in paper coords, -6 Y) */}
                <path
                  className="svg-path svg-path--four-left"
                  d="M 35 94 L 35 14 L 85 74 L 15 74"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ '--duration': '1.2s', '--delay': '0s' } as React.CSSProperties}
                />
                {/* 0 (oval with overlap, -6 Y) */}
                <path
                  className="svg-path"
                  d="M 175 74 C 175 39, 195 19, 215 19 C 235 19, 255 39, 255 74 C 255 109, 235 129, 215 129 C 195 129, 175 109, 175 74 C 175 66, 177 59, 180 54"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ '--duration': '1.6s', '--delay': '1.2s' } as React.CSSProperties}
                />
                {/* Second 4 (screen-left, shifted closer to 0: -15 X in paper coords, -6 Y) */}
                <path
                  className="svg-path svg-path--four-right"
                  d="M 355 92 L 355 12 L 405 72 L 335 72"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ '--duration': '1.2s', '--delay': '2.8s' } as React.CSSProperties}
                />
                {/* Wavy underline */}
                <path
                  className="svg-path"
                  d="M 20 152 Q 60 144, 100 152 Q 140 160, 180 152 Q 220 144, 260 152 Q 300 160, 340 152 Q 370 146, 400 152"
                  stroke="var(--ink)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{ '--duration': '1.4s', '--delay': '4s' } as React.CSSProperties}
                />
                {/* Guides */}
                <g className={`guides ${guidesVisible ? 'visible' : ''}`}>
                  <line x1="210" y1="10" x2="210" y2="155" stroke="var(--hair)" strokeWidth="0.5" />
                  <line x1="10" y1="80" x2="410" y2="80" stroke="var(--hair)" strokeWidth="0.5" />
                </g>
                {/* Pen dots — one per path */}
                <circle className="pen-dot pen-dot--0" cx="0" cy="0" r="4" fill="var(--ink)" />
                <circle className="pen-dot pen-dot--1" cx="0" cy="0" r="4" fill="var(--ink)" />
                <circle className="pen-dot pen-dot--2" cx="0" cy="0" r="4" fill="var(--ink)" />
                <circle className="pen-dot pen-dot--3 pen-dot--final" cx="0" cy="0" r="4" fill="var(--ink)" />
              </g>
            </svg>
          </div>

          <div className="hero__scramble" aria-live="polite">
            <span className="hero__scramble-line">
              <span className="hero__scramble-ghost" aria-hidden="true">{line1}</span>
              <span className="hero__scramble-text decoding" ref={decodingRef1} aria-hidden="true">
                {line1.split('').map((char, i) => (
                  <span key={i}>{char}</span>
                ))}
              </span>
              <span className="hero__scramble-visible">{line1}</span>
            </span>
            <span className="hero__scramble-line">
              <span className="hero__scramble-ghost" aria-hidden="true">{line2}</span>
              <span className="hero__scramble-text decoding" ref={decodingRef2} aria-hidden="true">
                {line2.split('').map((char, i) => (
                  <span key={i}>{char}</span>
                ))}
              </span>
              <span className="hero__scramble-visible">{line2}</span>
            </span>
          </div>

          {/* CTA button and privacy trigger wrapper */}
          <div className="hero__cta-wrapper">
            <button className="hero__btn" onClick={scrollToContact}>
              <span>Связаться</span>
            </button>

            <p className="privacy-trigger">
              Нажимая кнопку, вы соглашаетесь с <a href="#" className="privacy-link" onClick={(e) => { e.preventDefault(); openPrivacy(); }}>политикой конфиденциальности</a>
            </p>
          </div>
          </div>
        </div>
      </main>

      {/* Contact section */}
      <section className="contact" id="contact">
        <div className="contact__header">
          <h2 className="contact__title">найдём решение вместе.</h2>
          <p className="micro contact__subtitle">Отвечу вам в течение дня</p>
        </div>

        {/* Phone */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[0] = el; }}
          data-delay="0"
        >
          <p className="micro contact__label">телефон</p>
          <span className="contact__value">+7 921 666 90 66</span>
          <a className="contact__action-btn" href="tel:+79216669066" aria-label="Позвонить по номеру +7 921 666 90 66">
            <span>Позвонить</span>
            <span className="arrow">→</span>
          </a>
        </div>

        {/* Email */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[1] = el; }}
          data-delay="150"
        >
          <p className="micro contact__label">почта</p>
          <span className="contact__value">fullstack@bestuzhev.tech</span>
          <a className="contact__action-btn" href="mailto:fullstack@bestuzhev.tech" aria-label="Написать на почту fullstack@bestuzhev.tech">
            <span>Написать</span>
            <span className="arrow">→</span>
          </a>
        </div>

        {/* Telegram */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[2] = el; }}
          data-delay="300"
        >
          <p className="micro contact__label">Telegram</p>
          <span className="contact__value">rbestuzhev</span>
          <a className="contact__action-btn" href="https://t.me/rbestuzhev" target="_blank" rel="noopener noreferrer" aria-label="Написать в Telegram @rbestuzhev">
            <span>В Telegram</span>
            <span className="arrow">→</span>
          </a>
        </div>

        {/* MAX */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[3] = el; }}
          data-delay="450"
        >
          <p className="micro contact__label">MAX</p>
          <span className="contact__value">Роман Бестужев</span>
          <a className="contact__action-btn" href="https://max.ru/u/f9LHodD0cOKhOQcmdKaXFYlTU4PCgvV05zr5zYjPgYNDeRWT6wqlngRQNXk" target="_blank" rel="noopener noreferrer" aria-label="Написать в MAX Роману Бестужеву">
            <span>В MAX</span>
            <span className="arrow">→</span>
          </a>
        </div>

        <p className="contact__note">
          эта страница — временная заглушка: постоянный сайт уже в разработке.
        </p>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer__col">роман бестужев — веб-разработка.</div>
        <div className="footer__col">барнаул, алтайский край · 656000</div>
      </footer>

      {/* Toast */}
      <div className={`toast ${toastVisible ? 'show' : ''}`} role="status" aria-live="polite">
        {toastText}
      </div>

      {/* Privacy Modal */}
      <div id="privacy-modal" className={`privacy-modal ${privacyModalOpen ? 'active' : ''}`} role="dialog" aria-modal="true" aria-labelledby="privacy-title" aria-hidden={!privacyModalOpen}>
        <div className="privacy-modal__overlay" onClick={closePrivacy}></div>
        <div className="privacy-modal__content">
          <button className="privacy-modal__close" onClick={closePrivacy} aria-label="Закрыть окно политики конфиденциальности">&times;</button>
          <h2 className="privacy-modal__title" id="privacy-title"><em>политика</em> конфиденциальности</h2>
          <div className="privacy-modal__text">
            <p><strong>01 — Цель.</strong> Обработка ваших обращений, поступивших через телефон, почту, Telegram или MAX, для связи и обсуждения задач.</p>
            <p><strong>02 — Данные.</strong> Мы обрабатываем только те данные, которые вы добровольно предоставляете (имя, номер телефона, адрес электронной почты, текст сообщения).</p>
            <p><strong>03 — Конфиденциальность.</strong> Ваши данные не передаются третьим лицам и не используются для маркетинговых рассылок без вашего явного согласия.</p>
            <p><strong>04 — Хранение.</strong> Данные хранятся до момента решения вашего вопроса или до отзыва согласия по запросу на fullstack@bestuzhev.tech.</p>
            <p><strong>05 — Права.</strong> Вы вправе запросить удаление или изменение ваших персональных данных в любой момент, написав на указанную почту.</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
