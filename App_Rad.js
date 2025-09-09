    /* ==========================
       CONFIG
    ========================== */
    // Per event een uniek ID → nieuw cookie → iedereen kan weer 1× draaien
    const EVENT_ID = '2025-09-Demo'; // <— pas aan naar je eventnaam/datum
    const DAILY_RESET_AT_MIDNIGHT = true; // automatisch resetten om 00:00 (lokale tijd)

    // Testmodus: jij onbeperkt draaien. AAN met ?test=1 of toggle met Alt+T.
    let TEST_MODE = new URLSearchParams(location.search).get('test') === '1';

    // (Alleen gebruikt als DAILY_RESET_AT_MIDNIGHT = false)
    const EVENT_EXPIRES = new Date('2025-12-31T23:59:59');

    // Cookie-naam per event
    const SPUN_COOKIE = `wheel_${EVENT_ID}_spun`;

    /* ==========================
       COOKIE HELPERS
    ========================== */
    function setCookie(name, value, expiresDate) {
      const expires = expiresDate ? `; expires=${expiresDate.toUTCString()}` : '';
      document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/; SameSite=Lax`;
    }
    function getCookie(name) {
      const found = document.cookie.split('; ').find(row => row.startsWith(name + '='));
      return found ? decodeURIComponent(found.split('=')[1]) : null;
    }
    function deleteCookie(name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    }
    function tonightMidnight() {
      const d = new Date();
      d.setHours(24, 0, 0, 0); // eerstvolgende middernacht
      return d;
    }
    function cookieExpiry() {
      return DAILY_RESET_AT_MIDNIGHT ? tonightMidnight() : EVENT_EXPIRES;
    }

    /* ==========================
       UI & STATE
    ========================== */
    const wheel      = document.getElementById('wheel');
    const spinButton = document.getElementById('spinButton');
    const result     = document.getElementById('result');

    const prizes = [
      '1 Lolly', '2 Rubiaatje 18+', '3 Fan-kaart van Knip und Knots', '4 Chocolaatje',
      '5 Speculaasje', '6 Lolly', '7 Rondleiding in `t Kot', '8 Gratis deelname aan Spel 2',
      '9 Chocolaatje', '10 Speculaasje', '11 Koffie met Appeltaart'
    ];

    let isSpinning = false;
    let currentRotation = 0; // cumulatieve rotatie in graden

    // Audio
    const spinAudio = document.getElementById('spinSound');
    let audioOk = true;
    if (spinAudio) {
      spinAudio.addEventListener('error', () => audioOk = false, { once: true });
    }

    function updateSpinButtonState() {
      const alreadySpun = !!getCookie(SPUN_COOKIE);
      if (!TEST_MODE && alreadySpun) {
        spinButton.disabled = true;
        spinButton.textContent = DAILY_RESET_AT_MIDNIGHT
          ? 'Draaikans gebruikt (vandaag)'
          : 'Draaikans gebruikt (event)';
      } else {
        spinButton.disabled = false;
        spinButton.textContent = '🎲 DRAAI HET RAD!';
      }
    }
    updateSpinButtonState();

    /* ==========================
       SPIN + TICK PER SECTOR
    ========================== */
    function spinWheel() {
      if (isSpinning) return;

      // 1× per klant (cookie). Testmodus negeert deze check.
      if (!TEST_MODE && getCookie(SPUN_COOKIE) === '1') {
        alert(DAILY_RESET_AT_MIDNIGHT
          ? 'Je hebt vandaag al gedraaid. Probeer het morgen opnieuw!'
          : 'Je hebt al gedraaid voor dit evenement.');
        return;
      }

      isSpinning = true;
      spinButton.disabled = true;
      spinButton.textContent = 'BEZIG MET DRAAIEN...';

      // Start audio (user gesture → toegestaan)
      playSpinAudio();

      result.classList.remove('show');
      result.innerHTML = '<p>Het rad draait... 🌪️</p>';

      // Willekeurige draai: 3–6 volle rondes + 0–359°
      const minSpins = 3, maxSpins = 6;
      const spins = Math.floor(Math.random() * (maxSpins - minSpins + 1)) + minSpins;
      const finalDegree = Math.floor(Math.random() * 360);

      const startAngle = currentRotation;                 // voor deze draai
      const deltaRotation = (spins * 360) + finalDegree;  // toename
      const totalRotation = startAngle + deltaRotation;

      // Start animatie (CSS transition)
      wheel.style.transform = `rotate(${totalRotation}deg)`;
      currentRotation = totalRotation; // state bijwerken

      // ===== TICK-SCHEMA op basis van actuele (geanimeerde) hoek =====
      const sectorAngle = 360 / 11;
      let lastTickIndex = angleToIndex(startAngle, sectorAngle);

      const tickInterval = setInterval(() => {
        const a = getCurrentRotationDeg(wheel);
        if (a == null) return; // geen transform uitleesbaar
        const idx = angleToIndex(a, sectorAngle);
        if (idx !== lastTickIndex) {
          lastTickIndex = idx;
          playTick();
        }
      }, 30);

      const onEnd = (ev) => {
        if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
        clearInterval(tickInterval);
        wheel.removeEventListener('transitionend', onEnd);

        // Bepaal winnaar o.b.v. de zichtbare eindstand (cumulatief)
        const normalizedDegree = (360 - (currentRotation % 360)) % 360;
        const winningSegment = Math.floor(normalizedDegree / sectorAngle);

        isSpinning = false;

        // Cookie zetten na draaien (niet in testmodus)
        if (!TEST_MODE) {
          setCookie(SPUN_COOKIE, '1', cookieExpiry());
        }

        updateSpinButtonState();
        showResult(prizes[winningSegment]);
        createConfetti();
      };

      wheel.addEventListener('transitionend', onEnd);

      // Fallback timer mocht 'transitionend' niet vuren
      setTimeout(() => {
        if (isSpinning) {
          onEnd({ propertyName: 'transform' });
        }
      }, 4200);
    }

    // Hulp: bepaal index 0..10 uit absolute hoek
    function angleToIndex(angleDeg, sectorAngle) {
      const a = ((angleDeg % 360) + 360) % 360; // 0..359
      const normalized = (360 - a) % 360;       // pijl wijst omhoog
      return Math.floor(normalized / sectorAngle);
    }

    // Lees actuele rotatie (in graden) uit de computed transform-matrix
    function getCurrentRotationDeg(el) {
      const st = window.getComputedStyle(el);
      const tr = st.transform || st.webkitTransform || st.mozTransform;
      if (!tr || tr === 'none') return 0;
      let a, b;
      if (tr.startsWith('matrix(')) {
        const vals = tr.slice(7, -1).split(',').map(parseFloat);
        a = vals[0]; b = vals[1];
      } else if (tr.startsWith('matrix3d(')) {
        const vals = tr.slice(9, -1).split(',').map(parseFloat);
        a = vals[0]; b = vals[1];
      } else { return null; }
      const rad = Math.atan2(b, a);
      const deg = rad * (180 / Math.PI);
      return (deg + 360) % 360;
    }

    /* ==========================
       RESULTAAT & CONFETTI
    ========================== */
    function showResult(prize) {
      result.innerHTML = `
        <h3>🎉 GEFELICITEERD! 🎉</h3>
        <p><strong>Je hebt gewonnen:</strong></p>
        <p style="font-size: 1.2em; color: #f39c12; font-weight: bold;">${prize}</p>
        <p style="margin-top: 10px; font-size: 0.9em; opacity: 0.8;">Veel plezier met je prijs!</p>
      `;
      result.classList.add('show');
    }

    function createConfetti() {
      const colors = ['#f39c12', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f'];
      for (let i = 0; i < 50; i++) {
        setTimeout(() => {
          const confetti = document.createElement('div');
          confetti.classList.add('confetti');
          confetti.style.left = Math.random() * 100 + '%';
          confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
          confetti.style.animationDelay = Math.random() * 3 + 's';
          document.body.appendChild(confetti);
          setTimeout(() => confetti.remove(), 3000);
        }, i * 50);
      }
    }

    /* ==========================
       AUDIO HELPERS
    ========================== */
    function playSpinAudio() {
      if (spinAudio && audioOk) {
        try {
          spinAudio.currentTime = 0;
          const p = spinAudio.play();
          if (p && p.then) { p.catch(() => {}); } // stille catch bij autoplay-blokkade
        } catch (e) {}
      } else {
        // fallback: korte beep
        tickBeep(440, 0.15, 0.12);
      }
    }

    function playTick() {
      // Korte click/tick met lichte variatie
      const base = 1200 + Math.random() * 80; // Hz
      tickBeep(base, 0.12, 0.06);
    }

    function tickBeep(freq, gainPeak, duration) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (_) {}
    }

    /* ==========================
       Interactie (klik & swipe)
    ========================== */
    wheel.addEventListener('click', function () {
      if (!isSpinning) spinWheel();
    });

    let touchStartY = 0, touchEndY = 0;
    document.addEventListener('touchstart', e => touchStartY = e.changedTouches[0].screenY);
    document.addEventListener('touchend',   e => { touchEndY = e.changedTouches[0].screenY; handleSwipe(); });

    function handleSwipe() {
      if (touchEndY < touchStartY - 50 && !isSpinning) {
        spinWheel();
      }
    }

    /* ==========================
       Admin-sneltoetsen
       Alt+T -> Testmodus toggle (onbeperkt draaien)
       Alt+R -> Reset cookie voor dit event
    ========================== */
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 't') {
        TEST_MODE = !TEST_MODE;
        alert('Testmodus ' + (TEST_MODE ? 'AAN (onbeperkt draaien)' : 'UIT (klanten 1x)'));
        updateSpinButtonState();
      }
      if (e.altKey && e.key.toLowerCase() === 'r') {
        if (confirm(`Admin reset uitvoeren voor event "${EVENT_ID}"?`)) {
          deleteCookie(SPUN_COOKIE);
          updateSpinButtonState();
          alert('Reset voltooid: iedereen kan weer draaien.');
        }
      }
    });