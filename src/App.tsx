import { useEffect, useRef, useState, useCallback } from 'react';

function App() {
  const [clock, setClock] = useState('');
  const [scrambledLine1, setScrambledLine1] = useState('Пока тут ничего нет,');
  const [scrambledLine2, setScrambledLine2] = useState('но не переживайте — я найду для вас решение.');
  const [svgAnimated, setSvgAnimated] = useState(false);
  const [guidesVisible, setGuidesVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});

  const svgRef = useRef<SVGSVGElement>(null);
  const penRef = useRef<SVGCircleElement>(null);
  const contactRowsRef = useRef<(HTMLDivElement | null)[]>([]);
  const reducedMotion = useRef(false);

  const line1 = 'Пока тут ничего нет,';
  const line2 = 'но не переживайте — я найду для вас решение.';
  const glitchChars = 'абвгдежзийклмнопрстуфхцчшщъыьэюя0123456789!@#$%&*';

  // Check reduced motion preference
  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      setClock(`барнаул · ${timeStr}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Scramble effect (two lines, sequential)
  useEffect(() => {
    if (reducedMotion.current) {
      setScrambledLine1(line1);
      setScrambledLine2(line2);
      setSvgAnimated(true);
      setGuidesVisible(true);
      return;
    }

    const scrambleLine = (
      target: string,
      setter: (v: string) => void,
      onComplete: () => void
    ) => {
      let iteration = 0;
      const maxIterations = target.length;
      const interval = setInterval(() => {
        setter(
          target
            .split('')
            .map((char: string, index: number) => {
              if (index < iteration) return target[index];
              if (char === ' ' || char === ',' || char === '.' || char === '—' || char === '-') return char;
              return glitchChars[Math.floor(Math.random() * glitchChars.length)];
            })
            .join('')
        );
        iteration += 1 / 2;
        if (iteration >= maxIterations) {
          clearInterval(interval);
          setter(target);
          onComplete();
        }
      }, 40);
      return interval;
    };

    // Decode line 1 first, then line 2
    const interval1 = scrambleLine(line1, setScrambledLine1, () => {
      scrambleLine(line2, setScrambledLine2, () => {
        // Start SVG animation after both lines decoded
        setTimeout(() => setSvgAnimated(true), 300);
      });
    });

    return () => clearInterval(interval1);
  }, []);

  // SVG animation + pen movement (synchronized rAF)
  useEffect(() => {
    if (!svgAnimated || reducedMotion.current || !svgRef.current) return;

    const svg = svgRef.current;
    const pen = penRef.current;
    if (!pen) return;

    const pathEls = svg.querySelectorAll('.svg-path') as NodeListOf<SVGPathElement>;

    // Timings matching original CSS delays/durations (seconds)
    const timings = [
      { delay: 0, duration: 1.2 },
      { delay: 1.2, duration: 1.6 },
      { delay: 2.8, duration: 1.2 },
      { delay: 4.0, duration: 1.4 },
    ];

    // Initialize exact lengths synchronously before first paint frame
    const pathData: { el: SVGPathElement; length: number; delay: number; duration: number }[] = [];
    pathEls.forEach((el, i) => {
      const length = el.getTotalLength();
      el.style.strokeDasharray = String(length);
      el.style.strokeDashoffset = String(length);
      pathData.push({ el, length, delay: timings[i].delay, duration: timings[i].duration });
    });

    pen.classList.add('active');
    const startTime = performance.now();
    let rafId = 0;
    let finished = false;

    // Smoothstep easing
    const smoothstep = (t: number): number => {
      const c = Math.max(0, Math.min(1, t));
      return c * c * (3 - 2 * c);
    };

    const tick = (now: number) => {
      const elapsed = (now - startTime) / 1000; // seconds

      // Find which path is currently active
      let activeIdx = -1;
      for (let i = 0; i < pathData.length; i++) {
        const { delay, duration } = pathData[i];
        if (elapsed >= delay && elapsed < delay + duration) {
          activeIdx = i;
          break;
        }
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

      if (activeIdx === -1) {
        // Check if all paths are done
        const totalEnd = pathData[pathData.length - 1].delay + pathData[pathData.length - 1].duration;
        if (elapsed >= totalEnd) {
          // All done
          if (!finished) {
            finished = true;
            pen.classList.remove('active');
            setTimeout(() => setGuidesVisible(true), 400);
          }
          return; // stop rAF
        }
        // Between paths — keep pen at end of last completed path
        rafId = requestAnimationFrame(tick);
        return;
      }

      const { el, length, delay, duration } = pathData[activeIdx];
      const localT = (elapsed - delay) / duration;
      const e = smoothstep(localT);

      // Synchronized: same eased value drives both dashoffset and pen position
      el.style.strokeDashoffset = String(length * (1 - e));
      const pt = el.getPointAtLength(length * e);
      pen.setAttribute('cx', String(pt.x));
      pen.setAttribute('cy', String(pt.y));

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [svgAnimated]);

  // IntersectionObserver for contact rows
  useEffect(() => {
    if (reducedMotion.current) {
      contactRowsRef.current.forEach((row) => {
        if (row) row.classList.add('visible');
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
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
  }, []);

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
      el.scrollIntoView({ behavior: reducedMotion.current ? 'auto' : 'smooth' });
    }
  };

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
          <div className="hero__scramble" aria-live="polite">
            <span className="hero__scramble-line">
              <span className="hero__scramble-ghost" aria-hidden="true">{line1}</span>
              <span className="hero__scramble-text">{scrambledLine1}</span>
            </span>
            <span className="hero__scramble-line">
              <span className="hero__scramble-ghost" aria-hidden="true">{line2}</span>
              <span className="hero__scramble-text">{scrambledLine2}</span>
            </span>
          </div>

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
                {/* First 4 */}
                <path
                  className="svg-path"
                  d="M 30 120 L 30 40 L 80 100 L 10 100"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ '--duration': '1.2s', '--delay': '0s' } as React.CSSProperties}
                />
                {/* 0 (oval with overlap) */}
                <path
                  className="svg-path"
                  d="M 175 80 C 175 45, 195 25, 215 25 C 235 25, 255 45, 255 80 C 255 115, 235 135, 215 135 C 195 135, 175 115, 175 80 C 175 72, 177 65, 180 60"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ '--duration': '1.6s', '--delay': '1.2s' } as React.CSSProperties}
                />
                {/* Second 4 */}
                <path
                  className="svg-path"
                  d="M 310 120 L 310 40 L 360 100 L 290 100"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ '--duration': '1.2s', '--delay': '2.8s' } as React.CSSProperties}
                />
                {/* Wavy underline */}
                <path
                  className="svg-path"
                  d="M 20 148 Q 60 140, 100 148 Q 140 156, 180 148 Q 220 140, 260 148 Q 300 156, 340 148 Q 370 142, 400 148"
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
                {/* Pen dot */}
                <circle
                  ref={penRef}
                  className="pen-dot"
                  cx="0"
                  cy="0"
                  r="4"
                  fill="var(--ink)"
                />
              </g>
            </svg>
          </div>

          {/* CTA button */}
          <button className="hero__btn" onClick={scrollToContact}>
            <span>Связаться</span>
          </button>

          {/* Note under button */}
          <p className="micro hero__note">
            вы здесь по qr-коду с визитки — значит, всё работает
          </p>
        </div>
      </main>

      {/* Contact section */}
      <section className="contact" id="contact">
        <div className="contact__header">
          <h2 className="contact__title">найдём решение вместе.</h2>
          <p className="micro contact__subtitle">ответа обычно в течение дня</p>
        </div>

        {/* Phone */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[0] = el; }}
          data-delay="0"
        >
          <div>
            <p className="micro contact__label">телефон</p>
            <a className="contact__value" href="tel:+79216669066">+7 921 666 90 66</a>
          </div>
          <button
            className={`contact__copy-btn ${copyStates['phone'] ? 'success' : ''}`}
            onClick={() => handleCopy('+79216669066', 'phone')}
          >
            {copyStates['phone'] ? '✓ готово' : 'копировать'}
          </button>
        </div>

        {/* Email */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[1] = el; }}
          data-delay="150"
        >
          <div>
            <p className="micro contact__label">почта</p>
            <a className="contact__value" href="mailto:fullstack@bestuzhev.tech">fullstack@bestuzhev.tech</a>
          </div>
          <button
            className={`contact__copy-btn ${copyStates['email'] ? 'success' : ''}`}
            onClick={() => handleCopy('fullstack@bestuzhev.tech', 'email')}
          >
            {copyStates['email'] ? '✓ готово' : 'копировать'}
          </button>
        </div>

        {/* City */}
        <div
          className="contact__row"
          ref={(el) => { contactRowsRef.current[2] = el; }}
          data-delay="300"
        >
          <div>
            <p className="micro contact__label">город</p>
            <span className="contact__value">барнаул, алтайский край · 656000</span>
          </div>
          <button
            className={`contact__copy-btn ${copyStates['city'] ? 'success' : ''}`}
            onClick={() => handleCopy('барнаул, алтайский край, 656000', 'city')}
          >
            {copyStates['city'] ? '✓ готово' : 'копировать'}
          </button>
        </div>

        <p className="contact__note">
          эта страница — временная заглушка: постоянный сайт уже в разработке.
          а пока — позвоните или напишите, обсудим вашу задачу напрямую.
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
    </>
  );
}

export default App;
