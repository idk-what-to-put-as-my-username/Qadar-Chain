// ─── Loading Screen ───────────────────────────────────────────────────────────
// Self-contained: injects its own styles, mounts the loader overlay, and
// dismisses it once the D3 simulation has settled (or after a 6 s fallback).
// Call initLoader(simulation) after the simulation is created.

export function initLoader(simulation) {
    const style = document.createElement("style");
    style.textContent = `
        #qadar-loader {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #0a0a0f;
            pointer-events: all;
            transition: opacity 0.9s ease;
        }
        #qadar-loader.fade-out {
            opacity: 0;
            pointer-events: none;
        }
        .loader-brand {
            font-family: 'Cinzel', serif;
            font-size: 2.4rem;
            letter-spacing: 0.35em;
            color: rgba(255,255,255,0.92);
            margin-bottom: 0.25rem;
            user-select: none;
        }
        .loader-brand .loader-accent {
            color: rgb(180, 150, 80);
        }
        .loader-sub {
            font-family: 'Cinzel', serif;
            font-size: 0.72rem;
            letter-spacing: 0.55em;
            color: rgba(180,150,80,0.6);
            margin-bottom: 3rem;
            text-transform: uppercase;
            user-select: none;
        }
        .loader-chain {
            display: flex;
            align-items: center;
            margin-bottom: 2.5rem;
        }
        .loader-link {
            width: 18px;
            height: 10px;
            border: 1.5px solid rgba(180, 150, 80, 0.25);
            border-radius: 5px;
            animation: chainPulse 1.6s ease-in-out infinite;
        }
        .loader-link:nth-child(1) { animation-delay: 0.00s; }
        .loader-link:nth-child(2) { animation-delay: 0.18s; }
        .loader-link:nth-child(3) { animation-delay: 0.36s; }
        .loader-link:nth-child(4) { animation-delay: 0.54s; }
        .loader-link:nth-child(5) { animation-delay: 0.72s; }
        .loader-link:nth-child(6) { animation-delay: 0.90s; }
        .loader-link:nth-child(7) { animation-delay: 1.08s; }
        @keyframes chainPulse {
            0%, 100% {
                border-color: rgba(180, 150, 80, 0.2);
                box-shadow: none;
            }
            50% {
                border-color: rgba(208, 180, 100, 0.9);
                box-shadow: 0 0 8px rgba(208, 180, 100, 0.5);
            }
        }
        .loader-status {
            font-family: 'Roboto', sans-serif;
            font-size: 0.7rem;
            letter-spacing: 0.2em;
            color: rgba(255,255,255,0.3);
            text-transform: uppercase;
        }
    `;
    document.head.appendChild(style);

    const loader = document.createElement("div");
    loader.id = "qadar-loader";
    loader.innerHTML = `
        <div class="loader-brand">QADAR<span class="loader-accent">CHAIN</span></div>
        <div class="loader-sub">Connecting the threads of history</div>
        <div class="loader-chain">
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
        </div>
        <div class="loader-status">Settling the graph\u2026</div>
    `;
    document.body.appendChild(loader);

    function dismissLoader() {
        loader.classList.add("fade-out");
        setTimeout(() => loader.remove(), 950);
    }

    // Debounced "end" listener — the sim can restart briefly (alpha bumps from
    // applyVisibilityFilter), so we wait a short beat after it truly goes quiet.
    let _settleTimer = null;

    simulation.on("end.loader", () => {
        clearTimeout(_settleTimer);
        _settleTimer = setTimeout(() => {
            simulation.on("end.loader", null);
            dismissLoader();
        }, 400);
    });

    // Safety fallback: always dismiss after 6 s
    setTimeout(() => {
        simulation.on("end.loader", null);
        clearTimeout(_settleTimer);
        dismissLoader();
    }, 6000);
}