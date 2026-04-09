/**
 * Главный gesture canvas: сектор, сетка, зоны жестов, точки сигнала — порт с index.html.old.
 * Данные: Alpine.store('app'). Загрузить после Alpine + store.js.
 */
function gestureCanvasView() {
    'use strict';

    function app() {
        return Alpine.store('app');
    }

    function sectorForCanvas(canvas) {
        const W = canvas.width;
        const H = canvas.height;
        const halfAngle = (Math.PI * (96 / 2)) / 180;
        const vertSpan = H * 0.88;
        const outerR = (0.95 * W) / (2 * Math.sin(halfAngle));
        const innerR = outerR - vertSpan;
        const cx = W / 2;
        const cy = H * 0.95 + innerR;
        return {
            cx,
            cy,
            innerR,
            outerR,
            startAngle: -Math.PI / 2 - halfAngle,
            endAngle: -Math.PI / 2 + halfAngle,
            halfAngle,
        };
    }

    function logicalToCanvas(lx, ly, S) {
        const angle = S.startAngle + lx * (S.endAngle - S.startAngle);
        const radius = S.innerR + ly * (S.outerR - S.innerR);
        return {
            x: S.cx + radius * Math.cos(angle),
            y: S.cy + radius * Math.sin(angle),
        };
    }

    function canvasToLogical(px, py, S) {
        const dx = px - S.cx;
        const dy = py - S.cy;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const lx = (angle - S.startAngle) / (S.endAngle - S.startAngle);
        const ly = (radius - S.innerR) / (S.outerR - S.innerR);
        return { x: lx, y: ly };
    }

    function sectorRectPath(ctx, S, xMin, yMin, xMax, yMax) {
        const rInner = S.innerR + yMin * (S.outerR - S.innerR);
        const rOuter = S.innerR + yMax * (S.outerR - S.innerR);
        const aStart = S.startAngle + xMin * (S.endAngle - S.startAngle);
        const aEnd = S.startAngle + xMax * (S.endAngle - S.startAngle);
        ctx.beginPath();
        ctx.arc(S.cx, S.cy, rInner, aStart, aEnd, false);
        ctx.arc(S.cx, S.cy, rOuter, aEnd, aStart, true);
        ctx.closePath();
    }

    // Локальный SignalProcessor удален: используем только точки, приходящие с устройства.

    let isDragging = false;
    let dragEdge = null;
    /** Индекс жеста, за чей край схватились (множественное выделение); иначе null. */
    let dragEdgeOwnerIndex = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPositions = {};
    let marqueeStart = null;
    let marqueeCurrent = null;
    let newGestureStart = null;
    let newGestureCurrent = null;
    let deviceGestureBounds = null;
    let gestureCreateDocMouseUp = null;
    let prevCreating = false;
    let rafId = 0;
    let booted = false;

    function drawSectorBase(ctx, canvas, S) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        sectorRectPath(ctx, S, 0, 0, 1, 1);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        sectorRectPath(ctx, S, 0, 0, 1, 1);
        ctx.clip();

        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 7; i++) {
            const lx = i / 7;
            const p0 = logicalToCanvas(lx, 0, S);
            const p1 = logicalToCanvas(lx, 1, S);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }

        for (let i = 0; i <= 7; i++) {
            const ly = i / 7;
            const r = S.innerR + ly * (S.outerR - S.innerR);
            ctx.beginPath();
            ctx.arc(S.cx, S.cy, r, S.startAngle, S.endAngle, false);
            ctx.stroke();
        }

        ctx.restore();

        ctx.save();
        sectorRectPath(ctx, S, 0, 0, 1, 1);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#e0e0e0';
        ctx.font = '11px sans-serif';
        for (let i = 0; i <= 7; i++) {
            const ly = i / 7;
            const p = logicalToCanvas(0.0, ly, S);
            ctx.fillText(`${ly.toFixed(1)}`, p.x - 28, p.y + 4);
        }
        for (let i = 0; i <= 7; i++) {
            const lx = i / 7;
            const p = logicalToCanvas(lx, -0.03, S);
            ctx.fillText(`${lx.toFixed(1)}`, p.x - 8, p.y + 4);
        }
    }

    function drawGestures(presetName) {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const S = sectorForCanvas(canvas);
        drawSectorBase(ctx, canvas, S);

        if (!presetName || !app().presetsData[presetName]) return;

        const preset = app().presetsData[presetName];
        const selected = app().selectedGestureIndices || [];

        if (preset.gestures && Array.isArray(preset.gestures)) {
            const n = preset.gestures.length;
            preset.gestures.forEach((gesture, index) => {
                if (gesture.position && Array.isArray(gesture.position) && gesture.position.length >= 5) {
                    const [active, xMin, yMin, xMax, yMax] = gesture.position;
                    if (!active) return;

                    const isSelected = selected.includes(index);
                    const hue = n > 0 ? (index * 360) / n : 0;

                    sectorRectPath(ctx, S, xMin, yMin, xMax, yMax);
                    ctx.fillStyle = isSelected
                        ? `hsla(${hue}, 70%, 60%, 0.6)`
                        : `hsla(${hue}, 10%, 50%, 0.15)`;
                    ctx.fill();

                    sectorRectPath(ctx, S, xMin, yMin, xMax, yMax);
                    ctx.strokeStyle = isSelected
                        ? `hsla(${hue}, 70%, 40%, 1)`
                        : `hsla(${hue}, 10%, 40%, 0.4)`;
                    ctx.lineWidth = isSelected ? 3 : 1;
                    ctx.stroke();

                    const pLabel = logicalToCanvas(xMin + 0.01, yMin + 0.02, S);
                    ctx.fillStyle = isSelected ? '#ffffff' : '#999';
                    ctx.font = isSelected ? 'bold 16px sans-serif' : '12px sans-serif';
                    ctx.fillText(`G${index + 1}`, pLabel.x, pLabel.y);

                    if (isSelected) {
                        ctx.font = '11px monospace';
                        ctx.fillStyle = '#ffffff';
                        const pBL = logicalToCanvas(xMin + 0.01, yMin + 0.06, S);
                        ctx.fillText(`${xMin.toFixed(2)}, ${yMin.toFixed(3)}`, pBL.x, pBL.y);
                        const pTR = logicalToCanvas(xMax - 0.01, yMax - 0.01, S);
                        const endCoords = `${xMax.toFixed(2)}, ${yMax.toFixed(3)}`;
                        const ew = ctx.measureText(endCoords).width;
                        ctx.fillText(endCoords, pTR.x - ew, pTR.y);
                    }
                }
            });
        }
    }

    function drawSignalPoints(devicePoints) {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const S = sectorForCanvas(canvas);

        function drawDot(lx, ly, color) {
            const p = logicalToCanvas(lx, ly, S);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - 6, p.y);
            ctx.lineTo(p.x + 6, p.y);
            ctx.moveTo(p.x, p.y - 6);
            ctx.lineTo(p.x, p.y + 6);
            ctx.stroke();
        }

        for (const pt of devicePoints) {
            drawDot(pt.x, pt.y, '#ffff44');
        }

        if (app().gestureCreating && deviceGestureBounds) {
            const b = deviceGestureBounds;
            sectorRectPath(ctx, S, b.xMin, b.yMin, b.xMax, b.yMax);
            ctx.fillStyle = 'rgba(255, 200, 50, 0.2)';
            ctx.fill();
            sectorRectPath(ctx, S, b.xMin, b.yMin, b.xMax, b.yMax);
            ctx.strokeStyle = '#ffcc33';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function updateDeviceGestureBoundsFromPoints(devicePts) {
        const MARGIN = 0.02;
        for (const pt of devicePts) {
            const px = pt.x;
            const py = pt.y;
            if (isNaN(px) || isNaN(py)) continue;

            if (!deviceGestureBounds) {
                deviceGestureBounds = {
                    xMin: px - MARGIN,
                    yMin: py - MARGIN,
                    xMax: px + MARGIN,
                    yMax: py + MARGIN,
                };
            } else {
                if (px - MARGIN < deviceGestureBounds.xMin) deviceGestureBounds.xMin = px - MARGIN;
                if (py - MARGIN < deviceGestureBounds.yMin) deviceGestureBounds.yMin = py - MARGIN;
                if (px + MARGIN > deviceGestureBounds.xMax) deviceGestureBounds.xMax = px + MARGIN;
                if (py + MARGIN > deviceGestureBounds.yMax) deviceGestureBounds.yMax = py + MARGIN;
            }
        }
        if (deviceGestureBounds) {
            deviceGestureBounds.xMin = Math.max(0, deviceGestureBounds.xMin);
            deviceGestureBounds.yMin = Math.max(0, deviceGestureBounds.yMin);
            deviceGestureBounds.xMax = Math.min(1, deviceGestureBounds.xMax);
            deviceGestureBounds.yMax = Math.min(1, deviceGestureBounds.yMax);
            app().gestureShowDeviceConfirm = true;
        }
    }

    function applySnapping(value, isXAxis) {
        const snapTolerance = 0.005;
        const name = app().currentPresetName;
        const preset = name ? app().presetsData[name] : null;
        const sel = app().selectedGestureIndices || [];

        const snapPoints = [0, 1.0];
        if (preset?.gestures) {
            preset.gestures.forEach((g, i) => {
                if (sel.includes(i)) return;
                if (!g.position || g.position.length < 5 || !g.position[0]) return;
                if (isXAxis) {
                    snapPoints.push(g.position[1], g.position[3]);
                } else {
                    snapPoints.push(g.position[2], g.position[4]);
                }
            });
        }
        for (const sp of snapPoints) {
            if (Math.abs(value - sp) < snapTolerance) return sp;
        }
        return value;
    }

    function getGestureAtPoint(px, py) {
        const name = app().currentPresetName;
        if (!name || !app().presetsData[name]) return -1;
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return -1;
        const S = sectorForCanvas(canvas);
        const L = canvasToLogical(px, py, S);
        const preset = app().presetsData[name];
        if (!preset.gestures || !Array.isArray(preset.gestures)) return -1;

        for (let i = preset.gestures.length - 1; i >= 0; i--) {
            const gesture = preset.gestures[i];
            if (gesture.position && Array.isArray(gesture.position) && gesture.position.length >= 5) {
                const [active, xMin, yMin, xMax, yMax] = gesture.position;
                if (!active) continue;
                if (L.x >= xMin && L.x <= xMax && L.y >= yMin && L.y <= yMax) {
                    return i;
                }
            }
        }
        return -1;
    }

    /**
     * Край выбранного жеста рядом с точкой. Среди выделенных сначала проверяем жесты «сверху»
     * (больший индекс), как в getGestureAtPoint, чтобы совпадающие границы относились к нужному жесту.
     * @returns {{ edge: string, gestureIndex: number } | null}
     */
    function getEdgeNearPoint(px, py, tolerance) {
        tolerance = tolerance || 0.02;
        const name = app().currentPresetName;
        if (!name || !app().presetsData[name]) return null;
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return null;
        const S = sectorForCanvas(canvas);
        const L = canvasToLogical(px, py, S);
        const preset = app().presetsData[name];
        if (!preset.gestures || !Array.isArray(preset.gestures)) return null;

        const sel = app().selectedGestureIndices || [];
        if (sel.length === 0) return null;

        const ordered = [...sel].sort((a, b) => b - a);

        for (const idx of ordered) {
            const gesture = preset.gestures[idx];
            if (!gesture || !gesture.position || gesture.position.length < 5) continue;
            const [active, xMin, yMin, xMax, yMax] = gesture.position;
            if (!active) continue;

            const insideX = L.x >= xMin - tolerance && L.x <= xMax + tolerance;
            const insideY = L.y >= yMin - tolerance && L.y <= yMax + tolerance;

            if (Math.abs(L.x - xMin) < tolerance && insideY) {
                return { edge: 'left', gestureIndex: idx };
            }
            if (Math.abs(L.x - xMax) < tolerance && insideY) {
                return { edge: 'right', gestureIndex: idx };
            }
            if (Math.abs(L.y - yMax) < tolerance && insideX) {
                return { edge: 'top', gestureIndex: idx };
            }
            if (Math.abs(L.y - yMin) < tolerance && insideX) {
                return { edge: 'bottom', gestureIndex: idx };
            }
        }
        return null;
    }

    function moveGesture(px, py) {
        const name = app().currentPresetName;
        if (!name || !app().presetsData[name]) return;
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const S = sectorForCanvas(canvas);
        const preset = app().presetsData[name];
        if (!preset.gestures || !Array.isArray(preset.gestures)) return;

        const sel = app().selectedGestureIndices || [];
        if (sel.length === 0) return;

        const Lcur = canvasToLogical(px, py, S);
        const Lstart = canvasToLogical(dragStartX, dragStartY, S);

        let deltaX = Lcur.x - Lstart.x;
        let deltaY = Lcur.y - Lstart.y;

        deltaX = applySnapping(
            (dragStartPositions[sel[0]] || [0, 0, 0, 0, 0])[1] + deltaX,
            true
        ) - (dragStartPositions[sel[0]] || [0, 0, 0, 0, 0])[1];
        deltaY = applySnapping(
            (dragStartPositions[sel[0]] || [0, 0, 0, 0, 0])[2] + deltaY,
            false
        ) - (dragStartPositions[sel[0]] || [0, 0, 0, 0, 0])[2];

        for (const idx of sel) {
            const sp = dragStartPositions[idx];
            if (!sp) continue;
            const w = sp[3] - sp[1];
            const h = sp[4] - sp[2];
            deltaX = Math.max(deltaX, -sp[1]);
            deltaX = Math.min(deltaX, 1 - sp[3]);
            deltaY = Math.max(deltaY, -sp[2]);
            deltaY = Math.min(deltaY, 1 - sp[4]);
        }

        for (const idx of sel) {
            const gesture = preset.gestures[idx];
            const sp = dragStartPositions[idx];
            if (!gesture || !sp) continue;
            gesture.position = [
                sp[0],
                sp[1] + deltaX,
                sp[2] + deltaY,
                sp[3] + deltaX,
                sp[4] + deltaY,
            ];
        }
        app().markDirty('preset', name);
    }

    function updateGestureBoundary(px, py) {
        const name = app().currentPresetName;
        if (!name || !app().presetsData[name]) return;
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const S = sectorForCanvas(canvas);
        const preset = app().presetsData[name];
        if (!preset.gestures || !Array.isArray(preset.gestures)) return;

        const sel = app().selectedGestureIndices || [];
        if (sel.length === 0) return;

        const L = canvasToLogical(px, py, S);
        const anchorIdx =
            dragEdgeOwnerIndex !== null && dragStartPositions[dragEdgeOwnerIndex] !== undefined
                ? dragEdgeOwnerIndex
                : sel[0];
        const anchorSp = dragStartPositions[anchorIdx];
        if (!anchorSp) return;

        let delta;
        if (dragEdge === 'left') {
            delta = applySnapping(L.x, true) - anchorSp[1];
        } else if (dragEdge === 'right') {
            delta = applySnapping(L.x, true) - anchorSp[3];
        } else if (dragEdge === 'top') {
            delta = applySnapping(L.y, false) - anchorSp[4];
        } else if (dragEdge === 'bottom') {
            delta = applySnapping(L.y, false) - anchorSp[2];
        } else {
            return;
        }

        const MIN_SIZE = 0.01;
        for (const idx of sel) {
            const sp = dragStartPositions[idx];
            if (!sp) continue;
            if (dragEdge === 'left') {
                delta = Math.max(delta, -sp[1]);
                delta = Math.min(delta, (sp[3] - sp[1]) - MIN_SIZE);
            } else if (dragEdge === 'right') {
                delta = Math.min(delta, 1 - sp[3]);
                delta = Math.max(delta, MIN_SIZE - (sp[3] - sp[1]));
            } else if (dragEdge === 'top') {
                delta = Math.min(delta, 1 - sp[4]);
                delta = Math.max(delta, MIN_SIZE - (sp[4] - sp[2]));
            } else if (dragEdge === 'bottom') {
                delta = Math.max(delta, -sp[2]);
                delta = Math.min(delta, (sp[4] - sp[2]) - MIN_SIZE);
            }
        }

        for (const idx of sel) {
            const gesture = preset.gestures[idx];
            const sp = dragStartPositions[idx];
            if (!gesture || !sp) continue;
            let [a, x0, y0, x1, y1] = sp;
            if (dragEdge === 'left') x0 += delta;
            else if (dragEdge === 'right') x1 += delta;
            else if (dragEdge === 'top') y1 += delta;
            else if (dragEdge === 'bottom') y0 += delta;
            gesture.position = [a, x0, y0, x1, y1];
        }
        app().markDirty('preset', name);
    }

    /** Рамка нового жеста поверх уже отрисованного кадра (без полного redraw). */
    function drawNewGesturePreviewOverlay(px1, py1, px2, py2) {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const S = sectorForCanvas(canvas);

        const L1 = canvasToLogical(px1, py1, S);
        const L2 = canvasToLogical(px2, py2, S);

        const lxMin = Math.max(0, Math.min(L1.x, L2.x));
        const lxMax = Math.min(1, Math.max(L1.x, L2.x));
        const lyMin = Math.max(0, Math.min(L1.y, L2.y));
        const lyMax = Math.min(1, Math.max(L1.y, L2.y));

        sectorRectPath(ctx, S, lxMin, lyMin, lxMax, lyMax);
        ctx.fillStyle = 'rgba(119, 66, 255, 0.3)';
        ctx.fill();
        sectorRectPath(ctx, S, lxMin, lyMin, lxMax, lyMax);
        ctx.strokeStyle = '#7742ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function abortCreateGestureUi() {
        app().gestureCreating = false;
        app().gestureShowDeviceConfirm = false;
        newGestureStart = null;
        newGestureCurrent = null;
        deviceGestureBounds = null;
        isDragging = false;
        dragEdge = null;
        dragEdgeOwnerIndex = null;
        if (gestureCreateDocMouseUp) {
            document.removeEventListener('mouseup', gestureCreateDocMouseUp);
            gestureCreateDocMouseUp = null;
        }
        const c = document.getElementById('gestureCanvas');
        if (c) c.style.cursor = 'default';
    }

    function completeCreateGesture(px1, py1, px2, py2) {
        if (!app().gestureCreating) return;

        const name = app().currentPresetName;
        if (!name || !app().presetsData[name]) return;

        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const S = sectorForCanvas(canvas);

        const L1 = canvasToLogical(px1, py1, S);
        const L2 = canvasToLogical(px2, py2, S);

        const xMin = Math.max(0, Math.min(L1.x, L2.x));
        const xMax = Math.min(1, Math.max(L1.x, L2.x));
        const yMin = Math.max(0, Math.min(L1.y, L2.y));
        const yMax = Math.min(1, Math.max(L1.y, L2.y));

        if (xMax - xMin < 0.01 || yMax - yMin < 0.01) {
            app().showStatus('Gesture too small, please draw a larger area', 'error');
            return;
        }

        app().saveHistory();

        const newGesture = {
            midi: [{ channel: 1, note: 60 }],
            cv: [],
            position: [true, xMin, yMin, xMax, yMax],
        };

        const preset = app().presetsData[name];
        if (!preset.gestures) preset.gestures = [];
        preset.gestures.push(newGesture);
        const newIdx = preset.gestures.length - 1;
        app().selectedGestureIndices = [newIdx];

        abortCreateGestureUi();

        app().markDirty('preset', name);
        app().showStatus(`New gesture created (${newIdx + 1}/${preset.gestures.length})`, 'success');
    }

    function handleCanvasMouseMove(event) {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;

        if (app().gestureCreating && isDragging && newGestureStart) {
            newGestureCurrent = { x: px, y: py };
            return;
        }

        if (isDragging && dragEdge) {
            if (dragEdge === 'marquee') {
                marqueeCurrent = { x: px, y: py };
            } else if (dragEdge === 'move') {
                moveGesture(px, py);
            } else {
                updateGestureBoundary(px, py);
            }
            return;
        }

        if (app().gestureCreating) return;

        const edgeHit = getEdgeNearPoint(px, py);
        if (edgeHit) {
            canvas.style.cursor =
                edgeHit.edge === 'left' || edgeHit.edge === 'right' ? 'ew-resize' : 'ns-resize';
        } else {
            const gi = getGestureAtPoint(px, py);
            const sel = app().selectedGestureIndices || [];
            if (gi !== -1 && sel.includes(gi)) {
                canvas.style.cursor = 'move';
            } else if (gi !== -1) {
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }
        }
    }

    function handleCanvasMouseDown(event) {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;

        if (app().gestureCreating) {
            newGestureStart = { x: px, y: py };
            newGestureCurrent = { x: px, y: py };
            isDragging = true;
            event.preventDefault();
            if (gestureCreateDocMouseUp) document.removeEventListener('mouseup', gestureCreateDocMouseUp);
            const canvasEl = document.getElementById('gestureCanvas');
            gestureCreateDocMouseUp = (e) => {
                document.removeEventListener('mouseup', gestureCreateDocMouseUp);
                gestureCreateDocMouseUp = null;
                if (!app().gestureCreating || !newGestureStart) return;
                const r = canvasEl.getBoundingClientRect();
                const sx = canvasEl.width / r.width;
                const sy = canvasEl.height / r.height;
                const endPx = (e.clientX - r.left) * sx;
                const endPy = (e.clientY - r.top) * sy;
                isDragging = false;
                completeCreateGesture(newGestureStart.x, newGestureStart.y, endPx, endPy);
            };
            document.addEventListener('mouseup', gestureCreateDocMouseUp);
            return;
        }

        const edgeHit = getEdgeNearPoint(px, py);
        if (edgeHit) {
            app().saveHistory();
            saveDragStartPositions();
            isDragging = true;
            dragEdge = edgeHit.edge;
            dragEdgeOwnerIndex = edgeHit.gestureIndex;
            dragStartX = px;
            dragStartY = py;
            event.preventDefault();
            return;
        }

        const gestureIndex = getGestureAtPoint(px, py);
        if (gestureIndex === -1) {
            marqueeStart = { x: px, y: py };
            marqueeCurrent = { x: px, y: py };
            isDragging = true;
            dragEdge = 'marquee';
            event.preventDefault();
            return;
        }

        const name = app().currentPresetName;
        const sel = app().selectedGestureIndices || [];

        if (event.shiftKey) {
            if (!sel.includes(gestureIndex)) {
                app().selectedGestureIndices = [...sel, gestureIndex];
            }
            return;
        }

        if (sel.includes(gestureIndex) && name && app().presetsData[name]) {
            const preset = app().presetsData[name];
            const gesture = preset.gestures[gestureIndex];
            if (gesture && gesture.position && gesture.position.length >= 5) {
                app().saveHistory();
                saveDragStartPositions();
                isDragging = true;
                dragEdge = 'move';
                dragStartX = px;
                dragStartY = py;
                event.preventDefault();
                return;
            }
        }
        app().selectedGestureIndices = [gestureIndex];
    }

    function getGesturesInRect(lxMin, lyMin, lxMax, lyMax) {
        const name = app().currentPresetName;
        if (!name || !app().presetsData[name]) return [];
        const preset = app().presetsData[name];
        if (!preset.gestures || !Array.isArray(preset.gestures)) return [];

        const result = [];
        preset.gestures.forEach((gesture, i) => {
            if (!gesture.position || gesture.position.length < 5) return;
            const [active, gxMin, gyMin, gxMax, gyMax] = gesture.position;
            if (!active) return;
            if (gxMax > lxMin && gxMin < lxMax && gyMax > lyMin && gyMin < lyMax) {
                result.push(i);
            }
        });
        return result;
    }

    function drawMarquee(px1, py1, px2, py2) {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const S = sectorForCanvas(canvas);

        const L1 = canvasToLogical(px1, py1, S);
        const L2 = canvasToLogical(px2, py2, S);

        const lxMin = Math.max(0, Math.min(L1.x, L2.x));
        const lxMax = Math.min(1, Math.max(L1.x, L2.x));
        const lyMin = Math.max(0, Math.min(L1.y, L2.y));
        const lyMax = Math.min(1, Math.max(L1.y, L2.y));

        sectorRectPath(ctx, S, lxMin, lyMin, lxMax, lyMax);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fill();
        sectorRectPath(ctx, S, lxMin, lyMin, lxMax, lyMax);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function saveDragStartPositions() {
        dragStartPositions = {};
        const name = app().currentPresetName;
        const preset = name ? app().presetsData[name] : null;
        if (!preset?.gestures) return;
        const sel = app().selectedGestureIndices || [];
        for (const idx of sel) {
            const g = preset.gestures[idx];
            if (g?.position?.length >= 5) {
                dragStartPositions[idx] = [...g.position];
            }
        }
    }

    function handleCanvasMouseUp(event) {
        if (app().gestureCreating && isDragging && newGestureStart) {
            /* doc handler completes creation */
        }
        if (dragEdge === 'marquee' && marqueeStart && marqueeCurrent) {
            const canvas = document.getElementById('gestureCanvas');
            if (canvas) {
                const S = sectorForCanvas(canvas);
                const L1 = canvasToLogical(marqueeStart.x, marqueeStart.y, S);
                const L2 = canvasToLogical(marqueeCurrent.x, marqueeCurrent.y, S);
                const lxMin = Math.min(L1.x, L2.x);
                const lxMax = Math.max(L1.x, L2.x);
                const lyMin = Math.min(L1.y, L2.y);
                const lyMax = Math.max(L1.y, L2.y);

                const CLICK_THRESHOLD = 0.005;
                if (lxMax - lxMin < CLICK_THRESHOLD && lyMax - lyMin < CLICK_THRESHOLD) {
                    app().selectedGestureIndices = [];
                } else {
                    const found = getGesturesInRect(lxMin, lyMin, lxMax, lyMax);
                    if (event && event.shiftKey) {
                        const prev = app().selectedGestureIndices || [];
                        const merged = [...prev];
                        for (const idx of found) {
                            if (!merged.includes(idx)) merged.push(idx);
                        }
                        app().selectedGestureIndices = merged;
                    } else {
                        app().selectedGestureIndices = found;
                    }
                }
            }
            marqueeStart = null;
            marqueeCurrent = null;
        }
        isDragging = false;
        dragEdge = null;
        dragEdgeOwnerIndex = null;
    }

    function handleCanvasMouseLeave() {
        if (!app().gestureCreating) {
            if (dragEdge === 'marquee') {
                marqueeStart = null;
                marqueeCurrent = null;
            }
            isDragging = false;
            dragEdge = null;
            dragEdgeOwnerIndex = null;
        }
    }

    function paintFrame() {
        const a = app();
        if (!a) return;

        const canvasEl = document.getElementById('gestureCanvas');

        if (a.gestureCreating && !prevCreating) {
            deviceGestureBounds = null;
            a.gestureShowDeviceConfirm = false;
        }
        prevCreating = a.gestureCreating;

        if (canvasEl && a.gestureCreating && !isDragging) {
            canvasEl.style.cursor = 'crosshair';
        }

        const name = a.currentPresetName;
        drawGestures(name);

        const devicePts = Array.isArray(a.devicePoints) ? a.devicePoints.slice() : [];

        if (a.gestureCreating && devicePts.length) {
            updateDeviceGestureBoundsFromPoints(devicePts);
        }

        drawSignalPoints(devicePts);

        if (dragEdge === 'marquee' && marqueeStart && marqueeCurrent) {
            drawMarquee(marqueeStart.x, marqueeStart.y, marqueeCurrent.x, marqueeCurrent.y);
        }

        if (a.gestureCreating && isDragging && newGestureStart && newGestureCurrent) {
            drawNewGesturePreviewOverlay(
                newGestureStart.x,
                newGestureStart.y,
                newGestureCurrent.x,
                newGestureCurrent.y
            );
        }
    }

    function loop() {
        paintFrame();
        rafId = requestAnimationFrame(loop);
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && app().gestureCreating) {
            e.preventDefault();
            abortCreateGestureUi();
            app().showStatus('Gesture creation cancelled', 'success');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            app().undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            app().redo();
        }
    }

    function boot() {
        const canvas = document.getElementById('gestureCanvas');
        if (!canvas) {
            requestAnimationFrame(boot);
            return;
        }
        if (booted) return;
        booted = true;

        canvas.addEventListener('mousedown', handleCanvasMouseDown);
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        canvas.addEventListener('mouseup', handleCanvasMouseUp);
        canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
        document.addEventListener('keydown', onKeyDown);

        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    }

    return {
        init() {
            boot();
            app().gestureCanvasApi = {
                abortCreateGestureUi: this.abortCreateGestureUi,
                confirmDeviceGesture: this.confirmDeviceGesture,
            };
        },
        abortCreateGestureUi,
        confirmDeviceGesture() {
            if (!deviceGestureBounds) {
                app().showStatus('No device data captured yet', 'error');
                return;
            }
            const canvas = document.getElementById('gestureCanvas');
            if (!canvas) return;
            const S = sectorForCanvas(canvas);
            const b = deviceGestureBounds;
            const p1 = logicalToCanvas(b.xMin, b.yMin, S);
            const p2 = logicalToCanvas(b.xMax, b.yMax, S);
            completeCreateGesture(p1.x, p1.y, p2.x, p2.y);
        },
    };
}
