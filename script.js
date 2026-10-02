/**
 * ============================================================================
 * Symmetry Forge: Mirror Weaver
 * Cambridge Maths: Pattern & Symmetry (Floor 1)
 *
 * An arcade geometric puzzle action game where players weave glowing symmetrical
 * crystal artifacts across vertical, horizontal, diagonal, and radial mirror axes.
 *
 * Strictly compliant with StuCent runtime rules:
 * - root DOM access with fallback for local testing
 * - game.end({ score, stars, maxScore, success })
 * - Zero external URLs / zero external assets (pure inline Canvas & WebAudio)
 * - Zero periodic polling (only requestAnimationFrame & setTimeout)
 * - Zero global leakage (scoped inside IIFE)
 * - Tablet/touch first with pointer events
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // DOM ACCESS HELPERS (The "Golden Rule")
  // ==========================================================================
  const $ = (id) => (typeof root !== 'undefined' ? root.getElementById(id) : document.getElementById(id));
  const $$ = (sel) => (typeof root !== 'undefined' ? root.querySelectorAll(sel) : document.querySelectorAll(sel));

  // ==========================================================================
  // AUDIO SYNTHESIZER (WebAudio API — 100% Self-Contained, Zero Files)
  // ==========================================================================
  let audioCtx = null;
  let soundEnabled = true;
  let isAudioUnlocked = false;
  let bgmStep = 0;
  let bgmTimeout = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function unlockAudio() {
    initAudio();
    if (audioCtx && audioCtx.state === 'running' && soundEnabled && !bgmTimeout) {
      startBgm();
    }
  }

  function playTone(freq, durationMs, type = 'sine', gainVal = 0.1) {
    if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + durationMs / 1000);
    } catch (e) {
      // Audio safety catch
    }
  }

  function playSound(name) {
    if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
    try {
      const t = audioCtx.currentTime;
      if (name === 'snap') {
        // High crystal snap chime
        playTone(659.25, 120, 'sine', 0.12);
        playTone(1318.5, 180, 'triangle', 0.08);
      } else if (name === 'mirror-correct') {
        // Ascending harmonic chime
        playTone(523.25, 150, 'sine', 0.15); // C5
        setTimeout(() => playTone(659.25, 150, 'sine', 0.15), 60); // E5
        setTimeout(() => playTone(783.99, 200, 'triangle', 0.18), 120); // G5
        setTimeout(() => playTone(1046.5, 250, 'sine', 0.2), 180); // C6
      } else if (name === 'wrong') {
        // Damped hollow buzz
        playTone(180, 220, 'sawtooth', 0.12);
        playTone(130, 260, 'square', 0.08);
      } else if (name === 'artifact-complete') {
        // Dazzling cosmic chord
        [523.25, 659.25, 783.99, 987.77, 1174.66].forEach((f, i) => {
          setTimeout(() => playTone(f, 400, 'triangle', 0.14), i * 50);
        });
      } else if (name === 'countdown') {
        playTone(440, 100, 'sine', 0.12);
      } else if (name === 'launch') {
        playTone(880, 250, 'triangle', 0.2);
      } else if (name === 'tick') {
        playTone(700, 40, 'sine', 0.05);
      } else if (name === 'combo') {
        playTone(880, 140, 'triangle', 0.12);
        setTimeout(() => playTone(1174.66, 200, 'sine', 0.15), 70);
      } else if (name === 'star') {
        playTone(784, 180, 'sine', 0.15);
        setTimeout(() => playTone(1046.5, 300, 'triangle', 0.2), 90);
      }
    } catch (e) {}
  }

  // --- BGM: Ambient Crystal Loom Synth Loop ---
  const bgmNotes = [
    329.63, 392.00, 493.88, 587.33, 493.88, 392.00,
    329.63, 440.00, 523.25, 659.25, 523.25, 440.00,
    293.66, 369.99, 440.00, 587.33, 440.00, 369.99,
    261.63, 329.63, 392.00, 523.25, 392.00, 329.63
  ];

  function scheduleBgmNote() {
    if (!soundEnabled) { stopBgm(); return; }
    if (!audioCtx || audioCtx.state !== 'running') {
      bgmTimeout = setTimeout(scheduleBgmNote, 380);
      return;
    }
    const note = bgmNotes[bgmStep % bgmNotes.length];
    playTone(note, 340, 'sine', 0.04);
    playTone(note / 2, 420, 'triangle', 0.025);
    bgmStep++;
    bgmTimeout = setTimeout(scheduleBgmNote, 380);
  }

  function startBgm() {
    if (bgmTimeout || !soundEnabled) return;
    bgmStep = 0;
    scheduleBgmNote();
  }

  function stopBgm() {
    if (bgmTimeout) {
      clearTimeout(bgmTimeout);
      bgmTimeout = null;
    }
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    const icon = $('sound-icon');
    if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) {
      initAudio();
      startBgm();
    } else {
      stopBgm();
    }
  }

  // ==========================================================================
  // LEVEL DEFINITIONS & MATHEMATICAL SYMMETRY PATTERNS
  // ==========================================================================
  // Grid coordinates are integer 0..7 (8x8 grid). Center axes:
  // - Vertical Axis: x = 3.5 (Left 0..3, Right 4..7; mirror: 7 - x)
  // - Horizontal Axis: y = 3.5 (Top 0..3, Bottom 4..7; mirror: 7 - y)
  // - Diagonal Axis: y = x (mirror: (y, x))
  // - 4-Fold Cross: reflects across both x = 3.5 and y = 3.5

  const LEVELS = [
    {
      levelNum: 1,
      title: 'Vertical Plane',
      axisType: 'vertical', // x = 3.5
      timerSec: 35,
      artifacts: [
        {
          name: 'Crystal Arrow',
          // Guide points on left half (x <= 3)
          guidePoints: [
            { x: 3, y: 1 },
            { x: 2, y: 3 },
            { x: 1, y: 5 },
            { x: 3, y: 6 }
          ],
          hint: 'Estimate distance from center line: mirror x across the vertical axis!'
        },
        {
          name: 'Cyber Butterfly',
          guidePoints: [
            { x: 3, y: 2 },
            { x: 1, y: 2 },
            { x: 0, y: 4 },
            { x: 2, y: 6 },
            { x: 3, y: 5 }
          ],
          hint: 'Each wing point is at the exact same distance from the mirror!'
        },
        {
          name: 'Diamond Aegis',
          guidePoints: [
            { x: 3, y: 0 },
            { x: 1, y: 2 },
            { x: 0, y: 4 },
            { x: 1, y: 6 },
            { x: 3, y: 7 }
          ],
          hint: 'Weave the outer shield vertex by vertex!'
        }
      ]
    },
    {
      levelNum: 2,
      title: 'Water Horizon (Horizontal)',
      axisType: 'horizontal', // y = 3.5 (Top 0..3 reflects to Bottom 4..7; mirror: 7 - y)
      timerSec: 35,
      artifacts: [
        {
          name: 'Twin Peaks',
          guidePoints: [
            { x: 1, y: 3 },
            { x: 2, y: 1 },
            { x: 4, y: 2 },
            { x: 6, y: 1 }
          ],
          hint: 'Water reflection: distance above the line equals distance below!'
        },
        {
          name: 'Solar Crown',
          guidePoints: [
            { x: 1, y: 2 },
            { x: 3, y: 1 },
            { x: 4, y: 1 },
            { x: 6, y: 2 },
            { x: 7, y: 3 }
          ],
          hint: 'Reflect the crown peaks across the horizontal mirror!'
        },
        {
          name: 'Lotus Blade',
          guidePoints: [
            { x: 2, y: 3 },
            { x: 3, y: 1 },
            { x: 4, y: 1 },
            { x: 5, y: 3 },
            { x: 7, y: 2 }
          ],
          hint: 'Balance top and bottom petals!'
        }
      ]
    },
    {
      levelNum: 3,
      title: 'Slanted Mirror (Diagonal)',
      axisType: 'diagonal', // y = x line: point (x, y) reflects to (y, x)
      timerSec: 40,
      artifacts: [
        {
          name: 'Prism Kite',
          // Guide points below diagonal (x < y)
          guidePoints: [
            { x: 0, y: 2 },
            { x: 1, y: 4 },
            { x: 2, y: 6 },
            { x: 3, y: 7 }
          ],
          hint: 'Diagonal symmetry flips coordinates: (x, y) becomes (y, x)!'
        },
        {
          name: 'Star Fragment',
          guidePoints: [
            { x: 0, y: 3 },
            { x: 1, y: 5 },
            { x: 3, y: 6 },
            { x: 4, y: 7 }
          ],
          hint: 'Perpendicular distance across the 45-degree axis!'
        },
        {
          name: 'Lightning Ray',
          guidePoints: [
            { x: 1, y: 2 },
            { x: 1, y: 5 },
            { x: 2, y: 7 },
            { x: 4, y: 6 }
          ],
          hint: 'Follow the diagonal reflection plane!'
        }
      ]
    },
    {
      levelNum: 4,
      title: 'Mandala Core (4-Fold Cross)',
      axisType: 'fourfold', // Both vertical (7-x) and horizontal (7-y)
      timerSec: 45,
      artifacts: [
        {
          name: 'Sacred Cross',
          // Quadrant 1 (x: 0..3, y: 0..3) guides; reflects into Q2, Q3, Q4
          guidePoints: [
            { x: 2, y: 1 },
            { x: 1, y: 2 },
            { x: 3, y: 3 }
          ],
          hint: '4-fold symmetry: one point reflects across both axes into 3 copies!'
        },
        {
          name: 'Kaleido Crest',
          guidePoints: [
            { x: 1, y: 1 },
            { x: 3, y: 1 },
            { x: 1, y: 3 }
          ],
          hint: 'Weave the 4 quadrants into a balanced mandala!'
        }
      ]
    },
    {
      levelNum: 5,
      title: 'Grand Symmetry Overdrive',
      axisType: 'overdrive', // Alternates axes with rapid cosmic sparks
      timerSec: 45,
      artifacts: [
        {
          name: 'Hyper Crystal',
          axisType: 'vertical',
          guidePoints: [
            { x: 2, y: 0 },
            { x: 1, y: 2 },
            { x: 0, y: 4 },
            { x: 1, y: 6 },
            { x: 2, y: 7 },
            { x: 3, y: 4 }
          ],
          hint: 'Final Trial: Rapid-fire bilateral alignment!'
        },
        {
          name: 'Celestial Nova',
          axisType: 'fourfold',
          guidePoints: [
            { x: 2, y: 1 },
            { x: 1, y: 3 },
            { x: 3, y: 2 }
          ],
          hint: 'Channel cosmic four-fold harmony!'
        }
      ]
    }
  ];

  // Helper to compute all symmetric expected points for a given guide point & axis
  function getSymmetricPoints(pt, axisType) {
    const list = [];
    if (axisType === 'vertical') {
      list.push({ x: 7 - pt.x, y: pt.y });
    } else if (axisType === 'horizontal') {
      list.push({ x: pt.x, y: 7 - pt.y });
    } else if (axisType === 'diagonal') {
      list.push({ x: pt.y, y: pt.x });
    } else if (axisType === 'fourfold') {
      // Reflects into 3 points: horizontal, vertical, and both
      list.push({ x: 7 - pt.x, y: pt.y });
      list.push({ x: pt.x, y: 7 - pt.y });
      list.push({ x: 7 - pt.x, y: 7 - pt.y });
    }
    return list;
  }

  // ==========================================================================
  // GAME STATE
  // ==========================================================================
  let currentLevel = 0;
  let currentArtifactIdx = 0;
  let score = 0;
  let lives = 3;
  let timerLeft = 0;
  let timerTimeout = null;
  let combo = 1;
  let maxCombo = 1;
  let totalArtifactsForged = 0;
  let totalAttempts = 0;
  let correctPlacements = 0;
  let gameRunning = false;

  // Active artifact state
  let currentArtifact = null;
  let currentAxis = 'vertical';
  let activeGuidePoints = [];
  let expectedSymmetricPoints = [];
  let placedPoints = []; // [{x, y, isCorrect}]

  // Particle bursts & visual juice
  let particles = [];
  let floatingTexts = [];
  let screenShake = 0;

  // Active hover/pointer state for live distance ruler
  let hoveredGridCell = null; // {x, y}

  // ==========================================================================
  // CANVAS SYSTEM & RENDERING
  // ==========================================================================
  let canvas = null;
  let ctx = null;
  let canvasWidth = 700;
  let canvasHeight = 460;
  let animationFrameId = null;

  // Grid layout metrics on main canvas
  const GRID_SIZE = 8;
  let cellSize = 44;
  let gridOffsetX = 0;
  let gridOffsetY = 0;

  function updateCanvasDimensions() {
    if (!canvas) return;
    const container = $('canvas-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width) || 700;
    const h = Math.floor(rect.height) || 460;

    canvasWidth = w;
    canvasHeight = h;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Calculate grid sizing centered on canvas
    const maxGridW = w - 40;
    const maxGridH = h - 40;
    cellSize = Math.floor(Math.min(maxGridW, maxGridH) / GRID_SIZE);
    cellSize = Math.max(34, Math.min(100, cellSize));

    const totalGridSize = cellSize * GRID_SIZE;
    gridOffsetX = Math.floor((w - totalGridSize) / 2);
    gridOffsetY = Math.floor((h - totalGridSize) / 2);
  }

  // Grid to Canvas pixel helper
  function gridToPixel(gx, gy) {
    return {
      x: gridOffsetX + gx * cellSize + cellSize / 2,
      y: gridOffsetY + gy * cellSize + cellSize / 2
    };
  }

  // Pixel to Grid coord helper
  function pixelToGrid(px, py) {
    const gx = Math.floor((px - gridOffsetX) / cellSize);
    const gy = Math.floor((py - gridOffsetY) / cellSize);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      return { x: gx, y: gy };
    }
    return null;
  }

  // ==========================================================================
  // DRAWING: MAIN FORGE RENDER LOOP
  // ==========================================================================
  function renderForge() {
    if (!ctx) return;

    ctx.save();

    // Screen shake on error
    if (screenShake > 0) {
      const sx = (Math.random() - 0.5) * screenShake;
      const sy = (Math.random() - 0.5) * screenShake;
      ctx.translate(sx, sy);
      screenShake *= 0.85;
      if (screenShake < 0.5) screenShake = 0;
    }

    // Clear background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 1. Draw glowing subtle grid cells
    drawGrid();

    // 2. Draw Axis of Symmetry
    drawAxis();

    // 3. Draw Artifact Polygons & Connections
    drawArtifactConnections();

    // 4. Draw Guide Nodes (illuminated cyan crystals)
    drawGuideNodes();

    // 5. Draw Placed Mirror Nodes
    drawPlacedNodes();

    // 6. Draw Live Distance Ruler (educational hover/drag guide)
    drawDistanceRuler();

    // 7. Draw Juice: Particles & floating score text
    drawParticles();
    drawFloatingTexts();

    ctx.restore();

    if (gameRunning) {
      animationFrameId = requestAnimationFrame(renderForge);
    }
  }

  function drawGrid() {
    ctx.save();
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const px = gridOffsetX + x * cellSize;
        const py = gridOffsetY + y * cellSize;

        // Determine if cell is on the Guide side or Mirror side
        const isGuide = isGuideSide(x, y);

        ctx.fillStyle = isGuide ? 'rgba(0, 240, 255, 0.03)' : 'rgba(217, 70, 239, 0.03)';
        ctx.fillRect(px, py, cellSize, cellSize);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, cellSize, cellSize);

        // Highlight hovered cell
        if (hoveredGridCell && hoveredGridCell.x === x && hoveredGridCell.y === y && !isGuide) {
          ctx.fillStyle = 'rgba(217, 70, 239, 0.15)';
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(217, 70, 239, 0.5)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px, py, cellSize, cellSize);
        }
      }
    }
    ctx.restore();
  }

  function isGuideSide(x, y) {
    if (currentAxis === 'vertical') return x <= 3;
    if (currentAxis === 'horizontal') return y <= 3;
    if (currentAxis === 'diagonal') return x < y;
    if (currentAxis === 'fourfold') return x <= 3 && y <= 3;
    return x <= 3;
  }

  function drawAxis() {
    ctx.save();
    ctx.shadowBlur = 16;

    if (currentAxis === 'vertical' || currentAxis === 'fourfold') {
      const axisX = gridOffsetX + 4 * cellSize;
      ctx.strokeStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(axisX, gridOffsetY - 10);
      ctx.lineTo(axisX, gridOffsetY + GRID_SIZE * cellSize + 10);
      ctx.stroke();

      // Axis label
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MIRROR AXIS', axisX, gridOffsetY - 14);
    }

    if (currentAxis === 'horizontal' || currentAxis === 'fourfold') {
      const axisY = gridOffsetY + 4 * cellSize;
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(gridOffsetX - 10, axisY);
      ctx.lineTo(gridOffsetX + GRID_SIZE * cellSize + 10, axisY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('MIRROR AXIS', gridOffsetX - 14, axisY + 4);
    }

    if (currentAxis === 'diagonal') {
      ctx.strokeStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(gridOffsetX - 6, gridOffsetY - 6);
      ctx.lineTo(gridOffsetX + GRID_SIZE * cellSize + 6, gridOffsetY + GRID_SIZE * cellSize + 6);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('DIAGONAL MIRROR', gridOffsetX + 10, gridOffsetY - 14);
    }

    ctx.restore();
  }

  function drawArtifactConnections() {
    if (activeGuidePoints.length < 2) return;

    ctx.save();
    // 1. Draw Guide Connections (Cyan glow)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.4)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < activeGuidePoints.length; i++) {
      const p = gridToPixel(activeGuidePoints[i].x, activeGuidePoints[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // 2. Draw Placed Valid Mirror Connections (Magenta glow)
    const validPlaced = placedPoints.filter(pt => pt.isCorrect);
    if (validPlaced.length >= 2) {
      ctx.strokeStyle = 'rgba(217, 70, 239, 0.6)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(217, 70, 239, 0.5)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < validPlaced.length; i++) {
        const p = gridToPixel(validPlaced[i].x, validPlaced[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGuideNodes() {
    ctx.save();
    const time = performance.now() * 0.003;
    for (const gp of activeGuidePoints) {
      const p = gridToPixel(gp.x, gp.y);
      const pulse = Math.sin(time + gp.x + gp.y) * 2;

      // Outer glow
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14;

      // Outer Ring
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cellSize * 0.32 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Core Crystal
      ctx.fillStyle = '#e0faff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, cellSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlacedNodes() {
    ctx.save();
    for (const pt of placedPoints) {
      const p = gridToPixel(pt.x, pt.y);

      if (pt.isCorrect) {
        // Glowing Magenta Crystal
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 18;

        ctx.strokeStyle = '#d946ef';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, cellSize * 0.34, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, cellSize * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Inner Star Sparkle
        ctx.fillStyle = '#fae8ff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✨', p.x, p.y);
      } else {
        // Red Glitch X
        ctx.strokeStyle = '#f43f5e';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        const r = cellSize * 0.25;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y - r);
        ctx.lineTo(p.x + r, p.y + r);
        ctx.moveTo(p.x + r, p.y - r);
        ctx.lineTo(p.x - r, p.y + r);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Educational Distance Ruler: Shows perpendicular distance to mirror axis
  function drawDistanceRuler() {
    if (!hoveredGridCell || isGuideSide(hoveredGridCell.x, hoveredGridCell.y)) return;

    ctx.save();
    const hp = gridToPixel(hoveredGridCell.x, hoveredGridCell.y);

    if (currentAxis === 'vertical') {
      const axisX = gridOffsetX + 4 * cellSize;
      // Perpendicular line from hover cell to mirror axis
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hp.x, hp.y);
      ctx.lineTo(axisX, hp.y);
      ctx.stroke();

      // Distance in grid units: hover cell distance from x=3.5
      // hoveredGridCell.x is 4..7 -> distance is (hoveredGridCell.x - 3.5)
      const distUnits = (hoveredGridCell.x - 3.5).toFixed(1);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Dist: ${distUnits} units`, (hp.x + axisX) / 2, hp.y - 8);
    } else if (currentAxis === 'horizontal') {
      const axisY = gridOffsetY + 4 * cellSize;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hp.x, hp.y);
      ctx.lineTo(hp.x, axisY);
      ctx.stroke();

      const distUnits = (hoveredGridCell.y - 3.5).toFixed(1);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Dist: ${distUnits}`, hp.x + 8, (hp.y + axisY) / 2);
    }

    ctx.restore();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.025;
      p.size = Math.max(0, p.size * 0.96);

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnParticles(x, y, count = 12, color = '#d946ef') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        life: 1.0,
        color
      });
    }
  }

  function drawFloatingTexts() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y -= 1.2;
      ft.life -= 0.025;

      if (ft.life <= 0) {
        floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 12;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  function spawnFloatingText(x, y, text, color = '#fbbf24') {
    floatingTexts.push({ x, y, text, color, life: 1.0 });
  }

  // ==========================================================================
  // INPUT HANDLING: POINTER EVENTS (Touch, Stylus, Mouse)
  // ==========================================================================
  function setupInputs() {
    if (!canvas) return;

    function handlePointer(e) {
      if (!gameRunning) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const cell = pixelToGrid(px, py);
      hoveredGridCell = cell;

      if (e.type === 'pointerdown') {
        unlockAudio();
        if (cell) {
          onCellTapped(cell.x, cell.y);
        }
      }
    }

    canvas.addEventListener('pointerdown', handlePointer);
    canvas.addEventListener('pointermove', handlePointer);
    canvas.addEventListener('pointerleave', () => {
      hoveredGridCell = null;
    });

    // Clear attempt button
    const btnReset = $('btn-reset-pattern');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        placedPoints = placedPoints.filter(pt => pt.isCorrect); // remove wrong ones
        playSound('tick');
      });
    }
  }

  // Tapping a grid cell on the mirror side
  function onCellTapped(gx, gy) {
    // 1. Must be on the Mirror side (not the guide side)
    if (isGuideSide(gx, gy)) {
      spawnFloatingText(gridToPixel(gx, gy).x, gridToPixel(gx, gy).y, 'Guide Side! Tap Mirror 👉', '#38bdf8');
      playSound('wrong');
      return;
    }

    // 2. Check if already placed correctly
    if (placedPoints.some(pt => pt.x === gx && pt.y === gy && pt.isCorrect)) {
      return; // Already placed
    }

    totalAttempts++;

    // 3. Is this (gx, gy) one of the expected symmetric points?
    const isExpected = expectedSymmetricPoints.some(ep => ep.x === gx && ep.y === gy);

    const pix = gridToPixel(gx, gy);

    if (isExpected) {
      // CORRECT SYMMETRY!
      placedPoints.push({ x: gx, y: gy, isCorrect: true });
      correctPlacements++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;

      const ptsEarned = 50 * combo;
      score += ptsEarned;
      playSound('mirror-correct');
      spawnParticles(pix.x, pix.y, 16, '#d946ef');
      spawnFloatingText(pix.x, pix.y - 10, `+${ptsEarned} ✨`, '#d946ef');

      updateHUD();
      checkArtifactCompletion();
    } else {
      // INCORRECT SYMMETRIC PLACEMENT
      combo = 1;
      screenShake = 12;
      placedPoints.push({ x: gx, y: gy, isCorrect: false });
      playSound('wrong');
      spawnFloatingText(pix.x, pix.y - 10, 'Off Axis! ❌', '#f43f5e');

      // Deduct a life
      lives--;
      updateHUD();

      if (lives <= 0) {
        onGameOver();
      }
    }
  }

  function checkArtifactCompletion() {
    // Have all expected points been correctly placed?
    const allFound = expectedSymmetricPoints.every(ep =>
      placedPoints.some(pp => pp.x === ep.x && pp.y === ep.y && pp.isCorrect)
    );

    const progressFill = $('mission-progress-fill');
    const progressText = $('mission-progress-text');
    const correctCount = placedPoints.filter(p => p.isCorrect).length;
    const totalCount = expectedSymmetricPoints.length;

    if (progressFill) progressFill.style.width = `${Math.min(100, (correctCount / totalCount) * 100)}%`;
    if (progressText) progressText.textContent = `${correctCount}/${totalCount}`;

    if (allFound) {
      // ARTIFACT FULLY FORGED!
      totalArtifactsForged++;
      score += 200 * (currentLevel + 1);
      playSound('artifact-complete');

      // Center explosion of cosmic particles
      const center = gridToPixel(3.5, 3.5);
      spawnParticles(center.x, center.y, 40, '#00f0ff');
      spawnParticles(center.x, center.y, 30, '#fbbf24');
      showPopup('🌟 SYMMETRY HARMONIZED! 🌟');

      setTimeout(() => {
        currentArtifactIdx++;
        const lvl = LEVELS[currentLevel];
        if (currentArtifactIdx >= lvl.artifacts.length) {
          // Level Completed!
          onLevelComplete();
        } else {
          loadArtifact(lvl.artifacts[currentArtifactIdx]);
        }
      }, 750);
    }
  }

  // ==========================================================================
  // LEVEL FLOW & HUD
  // ==========================================================================
  function startLevel() {
    const lvl = LEVELS[currentLevel];
    currentArtifactIdx = 0;
    currentAxis = lvl.axisType;

    loadArtifact(lvl.artifacts[currentArtifactIdx]);
    startTimer(lvl.timerSec);
    updateHUD();
  }

  function loadArtifact(artifact) {
    currentArtifact = artifact;
    currentAxis = artifact.axisType || LEVELS[currentLevel].axisType;
    activeGuidePoints = artifact.guidePoints;

    // Calculate all expected reflections
    expectedSymmetricPoints = [];
    for (const gp of activeGuidePoints) {
      const symList = getSymmetricPoints(gp, currentAxis);
      for (const sp of symList) {
        if (!expectedSymmetricPoints.some(ep => ep.x === sp.x && ep.y === sp.y)) {
          expectedSymmetricPoints.push(sp);
        }
      }
    }

    placedPoints = [];

    // Update mission HUD
    const nameEl = $('mission-pattern-name');
    const tagEl = $('mission-axis-tag');
    const hintEl = $('hint-text');

    if (nameEl) nameEl.textContent = artifact.name;
    if (tagEl) {
      if (currentAxis === 'vertical') tagEl.textContent = 'VERTICAL AXIS';
      else if (currentAxis === 'horizontal') tagEl.textContent = 'HORIZONTAL AXIS';
      else if (currentAxis === 'diagonal') tagEl.textContent = 'DIAGONAL AXIS';
      else if (currentAxis === 'fourfold') tagEl.textContent = '4-FOLD CROSS';
      else tagEl.textContent = 'GRAND OVERDRIVE';
    }
    if (hintEl) hintEl.textContent = artifact.hint;

    const progressFill = $('mission-progress-fill');
    const progressText = $('mission-progress-text');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = `0/${expectedSymmetricPoints.length}`;
  }

  function updateHUD() {
    const lvlEl = $('hud-level-val');
    const scoreEl = $('hud-score-val');
    const timerEl = $('hud-timer-val');
    const comboEl = $('multiplier-pill');
    const hearts = $$('#hud-lives-val .heart');

    if (lvlEl) lvlEl.textContent = `${currentLevel + 1}/${LEVELS.length}`;
    if (scoreEl) scoreEl.textContent = score;
    if (timerEl) timerEl.textContent = `${timerLeft}s`;
    if (comboEl) comboEl.textContent = `x${combo} COMBO`;

    hearts.forEach((h, i) => {
      if (i < lives) {
        h.classList.remove('lost');
      } else {
        h.classList.add('lost');
      }
    });
  }

  function startTimer(seconds) {
    stopTimer();
    timerLeft = seconds;
    updateHUD();

    function tick() {
      timerLeft--;
      if (timerLeft <= 5 && timerLeft > 0) playSound('tick');
      updateHUD();
      if (timerLeft <= 0) {
        stopTimer();
        onTimeUp();
      } else {
        timerTimeout = setTimeout(tick, 1000);
      }
    }

    timerTimeout = setTimeout(tick, 1000);
  }

  function stopTimer() {
    if (timerTimeout) {
      clearTimeout(timerTimeout);
      timerTimeout = null;
    }
  }

  function onTimeUp() {
    playSound('wrong');
    showPopup('⏳ TIME UP!');
    lives--;
    updateHUD();
    if (lives <= 0) {
      onGameOver();
    } else {
      // Reload current artifact
      setTimeout(() => {
        loadArtifact(LEVELS[currentLevel].artifacts[currentArtifactIdx]);
        startTimer(LEVELS[currentLevel].timerSec);
      }, 800);
    }
  }

  function onLevelComplete() {
    stopTimer();
    playSound('star');

    const bonus = 250 * (currentLevel + 1);
    score += bonus;
    updateHUD();

    const modal = $('modal-level-up');
    const titleEl = $('levelup-title');
    const bonusEl = $('levelup-bonus');
    const accEl = $('levelup-acc');

    const acc = totalAttempts > 0 ? Math.round((correctPlacements / totalAttempts) * 100) : 100;
    if (titleEl) titleEl.textContent = `Level ${currentLevel + 1} Cleared!`;
    if (bonusEl) bonusEl.textContent = `+${bonus} pts`;
    if (accEl) accEl.textContent = `${acc}%`;

    if (modal) modal.classList.add('active');
  }

  function onGameOver() {
    stopTimer();
    gameRunning = false;
    finishGame(false);
  }

  function finishGame(isVictory = true) {
    stopTimer();
    stopBgm();
    gameRunning = false;

    showScreen('screen-result');

    const badgeEl = $('result-badge');
    const titleEl = $('result-title');
    const subEl = $('result-subtitle');
    const scoreEl = $('result-score-val');
    const artEl = $('result-artifacts-val');
    const accEl = $('result-accuracy-val');
    const comboEl = $('result-combo-val');

    const accuracy = totalAttempts > 0 ? Math.round((correctPlacements / totalAttempts) * 100) : 100;

    if (badgeEl) badgeEl.textContent = isVictory ? 'FORGE MASTER' : 'PRACTICE COMPLETE';
    if (titleEl) titleEl.textContent = isVictory ? 'Symmetry Mastered!' : 'Forge Cooled Down';
    if (subEl) {
      subEl.textContent = isVictory
        ? 'You harmonized all crystal planes with mathematical precision!'
        : 'Good effort! Review the mirror distance and try forging again.';
    }

    if (scoreEl) scoreEl.textContent = score;
    if (artEl) artEl.textContent = totalArtifactsForged;
    if (accEl) accEl.textContent = `${accuracy}%`;
    if (comboEl) comboEl.textContent = `x${maxCombo}`;

    // Stars Rating (0 - 3)
    let starsEarned = 0;
    if (score >= 1200) starsEarned = 3;
    else if (score >= 600) starsEarned = 2;
    else if (score >= 200) starsEarned = 1;

    const starSlots = [$('star-1'), $('star-2'), $('star-3')];
    starSlots.forEach((slot, idx) => {
      if (!slot) return;
      slot.classList.remove('earned');
      if (idx < starsEarned) {
        setTimeout(() => {
          slot.classList.add('earned');
          playSound('star');
        }, (idx + 1) * 350);
      }
    });

    // Store final metrics scaled to game.config.maxPoints
    const maxConfigPoints = (typeof game !== 'undefined' && game.config && game.config.maxPoints) ? game.config.maxPoints : 100;
    const scaledScore = Math.min(maxConfigPoints, Math.max(0, Math.round((score / 2000) * maxConfigPoints)));
    window._lastResult = {
      score: scaledScore,
      rawScore: score,
      stars: starsEarned,
      success: isVictory || starsEarned >= 1,
      maxScore: maxConfigPoints
    };
  }

  function showPopup(text) {
    const pop = $('floating-feedback');
    if (!pop) return;
    pop.textContent = text;
    pop.className = 'floating-feedback show-pop';
    setTimeout(() => {
      pop.className = 'floating-feedback';
    }, 750);
  }

  // ==========================================================================
  // ANIMATED VISUAL INSTRUCTION DEMO CANVAS
  // ==========================================================================
  let demoAnimId = null;
  let demoActive = false;

  function runInstructionDemo() {
    const dCanvas = $('canvas-instruction-demo');
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');
    demoActive = true;

    let step = 0;
    const demoCellSize = 24;
    const midX = 170;
    const midY = 80;

    function renderDemo() {
      if (!demoActive) return;
      step += 0.03;

      dCtx.fillStyle = '#080c16';
      dCtx.fillRect(0, 0, 340, 160);

      // Grid lines
      dCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      dCtx.lineWidth = 1;
      for (let x = 0; x < 340; x += demoCellSize) {
        dCtx.beginPath();
        dCtx.moveTo(x, 0);
        dCtx.lineTo(x, 160);
        dCtx.stroke();
      }
      for (let y = 0; y < 160; y += demoCellSize) {
        dCtx.beginPath();
        dCtx.moveTo(0, y);
        dCtx.lineTo(340, y);
        dCtx.stroke();
      }

      // Vertical Mirror Line
      dCtx.strokeStyle = '#00f0ff';
      dCtx.lineWidth = 2.5;
      dCtx.setLineDash([6, 4]);
      dCtx.beginPath();
      dCtx.moveTo(midX, 10);
      dCtx.lineTo(midX, 150);
      dCtx.stroke();
      dCtx.setLineDash([]);

      dCtx.fillStyle = 'rgba(0, 240, 255, 0.8)';
      dCtx.font = 'bold 9px sans-serif';
      dCtx.textAlign = 'center';
      dCtx.fillText('MIRROR LINE', midX, 14);

      // Guide Point (Left side: 3 units left of midX)
      const guideX = midX - demoCellSize * 3;
      const guideY = midY;

      dCtx.fillStyle = '#00f0ff';
      dCtx.shadowColor = '#00f0ff';
      dCtx.shadowBlur = 10;
      dCtx.beginPath();
      dCtx.arc(guideX, guideY, 7, 0, Math.PI * 2);
      dCtx.fill();

      // Equal distance dotted line
      dCtx.strokeStyle = '#fbbf24';
      dCtx.lineWidth = 1.5;
      dCtx.setLineDash([3, 3]);
      dCtx.beginPath();
      dCtx.moveTo(guideX, guideY);
      dCtx.lineTo(midX, guideY);
      dCtx.stroke();

      dCtx.fillStyle = '#fbbf24';
      dCtx.font = 'bold 9px sans-serif';
      dCtx.fillText('Dist: 3', (guideX + midX) / 2, guideY - 6);

      // Animated Finger moving to reflect point (Right side: 3 units right)
      const mirrorX = midX + demoCellSize * 3;
      const progress = (Math.sin(step) + 1) / 2; // 0 to 1

      if (progress > 0.5) {
        // Dotted line to mirror
        dCtx.beginPath();
        dCtx.moveTo(midX, guideY);
        dCtx.lineTo(mirrorX, guideY);
        dCtx.stroke();
        dCtx.fillText('Dist: 3', (midX + mirrorX) / 2, guideY - 6);

        // Reflected Point Appears
        dCtx.fillStyle = '#d946ef';
        dCtx.shadowColor = '#d946ef';
        dCtx.shadowBlur = 12;
        dCtx.beginPath();
        dCtx.arc(mirrorX, guideY, 8, 0, Math.PI * 2);
        dCtx.fill();

        dCtx.fillStyle = '#ffffff';
        dCtx.font = 'bold 10px sans-serif';
        dCtx.fillText('✨ PERFECT! ✨', mirrorX, guideY - 14);
      }

      // Animated pointer cursor
      const cursorX = midX + (mirrorX - midX) * Math.min(1, progress * 1.5);
      dCtx.fillStyle = '#ffffff';
      dCtx.font = '18px sans-serif';
      dCtx.fillText('👆', cursorX, guideY + 16);

      demoAnimId = requestAnimationFrame(renderDemo);
    }

    renderDemo();
  }

  function stopInstructionDemo() {
    demoActive = false;
    if (demoAnimId) {
      cancelAnimationFrame(demoAnimId);
      demoAnimId = null;
    }
  }

  // ==========================================================================
  // START SCREEN MASCOT PREVIEW CANVAS (Kaleidoscopic Crystal)
  // ==========================================================================
  let startPreviewAnimId = null;
  let startPreviewActive = false;

  function runStartPreview() {
    const sCanvas = $('canvas-start-preview');
    if (!sCanvas) return;
    const sCtx = sCanvas.getContext('2d');
    startPreviewActive = true;
    let angle = 0;

    function renderStart() {
      if (!startPreviewActive) return;
      angle += 0.015;

      sCtx.fillStyle = 'rgba(8, 12, 22, 0.2)';
      sCtx.fillRect(0, 0, 320, 150);

      const cx = 160;
      const cy = 75;

      sCtx.save();
      sCtx.translate(cx, cy);

      // Rotating Sacred Symmetry Polygon
      const petals = 6;
      for (let i = 0; i < petals; i++) {
        sCtx.rotate((Math.PI * 2) / petals);
        sCtx.strokeStyle = i % 2 === 0 ? '#00f0ff' : '#d946ef';
        sCtx.lineWidth = 2;
        sCtx.shadowColor = i % 2 === 0 ? '#00f0ff' : '#d946ef';
        sCtx.shadowBlur = 10;

        sCtx.beginPath();
        sCtx.moveTo(0, 0);
        sCtx.lineTo(Math.cos(angle) * 35, Math.sin(angle) * 35);
        sCtx.lineTo(Math.cos(angle * 1.5) * 55, 0);
        sCtx.closePath();
        sCtx.stroke();
      }

      // Center glowing core
      sCtx.fillStyle = '#ffffff';
      sCtx.shadowColor = '#00f0ff';
      sCtx.shadowBlur = 16;
      sCtx.beginPath();
      sCtx.arc(0, 0, 6, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.restore();

      startPreviewAnimId = requestAnimationFrame(renderStart);
    }

    renderStart();
  }

  function stopStartPreview() {
    startPreviewActive = false;
    if (startPreviewAnimId) {
      cancelAnimationFrame(startPreviewAnimId);
      startPreviewAnimId = null;
    }
  }

  // ==========================================================================
  // NAVIGATION & SCREEN MANAGEMENT
  // ==========================================================================
  function showScreen(screenId) {
    const screens = $$('.screen');
    screens.forEach(s => s.classList.remove('active'));

    const target = $(screenId);
    if (target) {
      target.classList.add('active');
    }

    // Modal safety
    const modal = $('modal-level-up');
    if (modal) modal.classList.remove('active');

    // Manage preview animations to conserve CPU
    if (screenId === 'screen-start') {
      runStartPreview();
      stopInstructionDemo();
    } else if (screenId === 'screen-instructions') {
      stopStartPreview();
      runInstructionDemo();
    } else {
      stopStartPreview();
      stopInstructionDemo();
    }
  }

  function runCountdown(callback) {
    showScreen('screen-countdown');
    let count = 3;
    const numEl = $('countdown-number');
    if (numEl) numEl.textContent = count;
    playSound('countdown');

    function nextCount() {
      count--;
      if (count > 0) {
        if (numEl) numEl.textContent = count;
        playSound('countdown');
        setTimeout(nextCount, 800);
      } else {
        if (numEl) numEl.textContent = '✨';
        playSound('launch');
        setTimeout(() => {
          callback();
        }, 350);
      }
    }

    setTimeout(nextCount, 800);
  }

  function resetGame() {
    currentLevel = 0;
    currentArtifactIdx = 0;
    score = 0;
    lives = 3;
    combo = 1;
    maxCombo = 1;
    totalArtifactsForged = 0;
    totalAttempts = 0;
    correctPlacements = 0;
    particles = [];
    floatingTexts = [];
    hoveredGridCell = null;
    stopTimer();
  }

  function startGame() {
    resetGame();
    unlockAudio();
    runCountdown(() => {
      showScreen('screen-game');
      canvas = $('canvas-forge');
      updateCanvasDimensions();
      gameRunning = true;
      startLevel();
      renderForge();
    });
  }

  // ==========================================================================
  // INITIALIZATION & EVENT LISTENERS
  // ==========================================================================
  function init() {
    // 1. Button Bindings
    const btnPlay = $('btn-play');
    if (btnPlay) btnPlay.addEventListener('click', startGame);

    const btnInstructions = $('btn-instructions');
    if (btnInstructions) {
      btnInstructions.addEventListener('click', () => {
        unlockAudio();
        showScreen('screen-instructions');
      });
    }

    const btnStartFromHow = $('btn-start-from-how');
    if (btnStartFromHow) btnStartFromHow.addEventListener('click', startGame);

    const btnSound = $('btn-sound-toggle');
    if (btnSound) btnSound.addEventListener('click', toggleSound);

    const btnFullscreen = $('btn-fullscreen-toggle');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        const wrap = $('game-wrapper');
        if (!document.fullscreenElement) {
          wrap.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    const btnNextLevel = $('btn-next-level');
    if (btnNextLevel) {
      btnNextLevel.addEventListener('click', () => {
        const modal = $('modal-level-up');
        if (modal) modal.classList.remove('active');
        currentLevel++;
        if (currentLevel >= LEVELS.length) {
          // Completed all 5 levels!
          finishGame(true);
        } else {
          startLevel();
        }
      });
    }

    // Try Again
    const btnTryAgain = $('btn-try-again');
    if (btnTryAgain) {
      btnTryAgain.addEventListener('click', () => {
        showScreen('screen-start');
      });
    }

    // Submit Score -> calls game.end()
    const btnSubmit = $('btn-submit-score');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        const maxConfigPoints = (typeof game !== 'undefined' && game.config && game.config.maxPoints) ? game.config.maxPoints : 100;
        const res = window._lastResult || { score: maxConfigPoints, stars: 3, success: true, maxScore: maxConfigPoints };
        if (typeof game !== 'undefined' && typeof game.end === 'function') {
          game.end({
            score: res.score,
            stars: res.stars,
            success: res.success,
            maxScore: maxConfigPoints,
            meta: {
              rawScore: res.rawScore,
              artifactsForged: totalArtifactsForged,
              combo: maxCombo
            }
          });
        }
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Submitted! ✅';
      });
    }

    // 2. Setup Canvas & Touch Controls
    canvas = $('canvas-forge');
    setupInputs();

    window.addEventListener('resize', () => {
      if (gameRunning) {
        updateCanvasDimensions();
      }
    });

    // 3. Start Screen Preview
    showScreen('screen-start');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
