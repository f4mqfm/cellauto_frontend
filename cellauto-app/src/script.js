// 2024 Borsos László F4MQFM (lborsos@gmail.com)
let viewRow = 30, viewCol = 30;
const maxRow = 220, maxCol = 220;
/** DOM cella-id: fix szélesség / oszlop és sor; a régi 2 jegy 100+ méretnél ütközött → rossz cella, „szakadó” minta. */
const CELL_ID_PAD = 3;
function cellDomId(col, row) {
    return 'x' + String(col).padStart(CELL_ID_PAD, '0') + String(row).padStart(CELL_ID_PAD, '0');
}

window.CELLAUTO_cellDomId = cellDomId;

window.CELLAUTO_getCellDisplayedWordText = function (col, row) {
    var el = document.getElementById(cellDomId(col, row));
    if (!el) return '';
    var raw = el.textContent || el.innerText || '';
    return String(raw).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
};
const maxCycle = 100;
const currentCycle = 10;
var matrix = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));
var matrixVerify = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));
var matrixVerifyChecked = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));

/** Mindig frissen kérjük le: ha a script a #boardDiv előtt fut (# → null), később már jó. */
function boardDivEl() {
    return document.getElementById('boardDiv');
}

const nrOfColors = 6;
var method = '';
var maxLevel = 10;
var maxLevelWord = 6;
var maxLevelVerify = 6;
var delay = 0;
var board = 'square';
var modePT = 'play';
var errorCount = 0;
const STORAGE_BOARD_SIZE = 'cellauto_board_size';
const STORAGE_BOARD_ZOOM = 'cellauto_board_zoom';
let boardZoom = 1;
let isRunning = false;
let generationHistory = [];
let pendingLoadedPlacement = null;
let pendingPreviewCells = [];
let isPointerDown = false;
let dragSelectActive = false;
let dragSelectValue = 0;
let wordQuickPickerEl = null;
let wordQuickPickerOpenedAt = 0;
let cellHoverPreviewEl = null;

/** 6 szint szólistái; az app.js tölti API-ból bejelentkezés után */
var matrixWord = Array.from({ length: 6 }, () => []);

function createHexTable(create = true) {
    if (create) {
        let div1 = document.createElement('div');
        div1.classList.add('hexagon-wrapper');
        let div2 = document.createElement('div');
        div2.classList.add('hexagon-wrapper__hexagon-container');
        div1.appendChild(div2);
        for (let yy = 0; yy < viewRow; yy++) {
            let row = document.createElement('div');
            row.classList.add('hexagon-row');
            if (yy % 2 !== 0) row.classList.add('hexagon-row--offset');
            const xMax = viewCol - ((yy % 2 !== 0) ? 1 : 0);
            for (let xx = 0; xx < xMax; xx++) {
                var divOut = document.createElement('div');
                divOut.classList.add("hexagon__outer");
                var divIn = document.createElement('div');
                divIn.innerHTML = "&nbsp;";
                divIn.classList.add("hexagon__inner");
                divIn.id = cellDomId(xx, yy);
                divIn.dataset.x = String(xx);
                divIn.dataset.y = String(yy);
                divOut.appendChild(divIn);
                row.appendChild(divOut);
            }
            div2.appendChild(row);
        }
        var bd = boardDivEl();
        if (!bd) return;
        bd.appendChild(div1);
    } else {
        var bd0 = boardDivEl();
        if (bd0) bd0.innerHTML = '';
    }
}


function createSquareTable(create = true) {
    if (create) {
        var bd = boardDivEl();
        if (!bd) return;
        var table = document.createElement('table');
        for (let i = 0; i < viewRow; i++) {
            var tr = document.createElement('tr');
            for (let j = 0; j < viewCol; j++) {
                var td = document.createElement('td');
                td.id = cellDomId(j, i);
                td.dataset.x = String(j);
                td.dataset.y = String(i);
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        bd.appendChild(table);
    } else {
        var bd1 = boardDivEl();
        if (bd1) bd1.innerHTML = '';
    }
}

function addClickListenersSquare() {
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol; j++) {
            let cell = document.getElementById(cellDomId(j, i));
            cell.addEventListener('mousedown', function (ev) { handleCellMouseDown(ev, j, i); });
            cell.addEventListener('mouseenter', function () { handleCellMouseEnter(j, i); });
            cell.addEventListener('mouseenter', function () { showCellHoverPreview(j, i); });
            cell.addEventListener('mouseleave', hideCellHoverPreview);
        }
    }
}

function addClickListenersHex() {
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol; j++) {
            if (!(i % 2 != 0 && j == viewCol - 1)) {
                let cell = document.getElementById(cellDomId(j, i));
                cell.addEventListener('mousedown', function (ev) { handleCellMouseDown(ev, j, i); });
                cell.addEventListener('mouseenter', function () { handleCellMouseEnter(j, i); });
                cell.addEventListener('mouseenter', function () { showCellHoverPreview(j, i); });
                cell.addEventListener('mouseleave', hideCellHoverPreview);
            }
        }
    }
}

function hideCellHoverPreview() {
    if (!cellHoverPreviewEl) return;
    cellHoverPreviewEl.classList.remove('is-visible');
}

function showCellHoverPreview(col, row) {
    const cell = document.getElementById(cellDomId(col, row));
    if (!cell) return;
    const txt = (cell.textContent || '')
        .replace(/\u00a0/g, '')
        .replace(/[\r\n]+/g, '')
        .trim();
    if (!txt) {
        hideCellHoverPreview();
        return;
    }

    if (!cellHoverPreviewEl) {
        cellHoverPreviewEl = document.createElement('div');
        cellHoverPreviewEl.className = 'cell-hover-preview';
        document.body.appendChild(cellHoverPreviewEl);
    }
    cellHoverPreviewEl.textContent = txt;
    const r = cell.getBoundingClientRect();
    let left = r.left + r.width / 2;
    let top = r.top - 8;
    cellHoverPreviewEl.style.left = Math.max(8, Math.min(left, window.innerWidth - 8)) + 'px';
    cellHoverPreviewEl.style.top = Math.max(8, top) + 'px';
    cellHoverPreviewEl.classList.add('is-visible');
}

function activeDrawLevelFromUi() {
    let drawLevel = document.querySelector('input[name="examDrawLevel"]:checked');
    if (!drawLevel) drawLevel = document.querySelector('input[name="drawLevel"]:checked');
    return drawLevel ? parseInt(drawLevel.value, 10) : 1;
}

function currentDrawValue() {
    let mode = document.getElementById('mode').value;
    let level = activeDrawLevelFromUi();
    return mode == 'play' ? 1 : level;
}

function ptrFromCellEvent(ev) {
    return ev && typeof ev.clientX === 'number'
        ? { clientX: ev.clientX, clientY: ev.clientY }
        : typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
          ? window.__cellautoLastPointer
          : null;
}

/** Ha true, a fagyott (kiinduló) cella tiltását érvényesítjük (toast); ha false, a kattintás folytatódik (pl. szó mód). */
function shouldShowExamFrozenBlockToast(ev) {
    var wm = document.getElementById('word_mode');
    if (wm && wm.value === 'word' && typeof window.CELLAUTO_examAllowFrozenWordFill === 'function' && window.CELLAUTO_examAllowFrozenWordFill()) {
        return false;
    }
    notifyFrozenPatternBlocked(ev);
    return true;
}

/** Vizsga: kiinduló minta tiltás — az egér melletti buborék (lentről animálva), nem sarok-toast. */
function notifyFrozenPatternBlocked(ev) {
    var msg = 'A kiinduló minta nem módosítható.';
    var ptr = ptrFromCellEvent(ev);
    if (typeof window.CELLAUTO_showPracticeCellHint === 'function') {
        window.CELLAUTO_showPracticeCellHint(ptr, msg);
    } else if (typeof window.showToast === 'function') {
        window.showToast(msg, 3400);
    }
}

function handleCellMouseDown(ev, col, row) {
    if (pendingLoadedPlacement) {
        if (ev) ev.preventDefault();
        return;
    }
    var examBr0 = typeof window.CELLAUTO_examEditBlockedReason === 'function'
        ? window.CELLAUTO_examEditBlockedReason(col, row)
        : '';
    if (examBr0 === 'frozen') {
        if (shouldShowExamFrozenBlockToast(ev)) {
            if (ev) ev.preventDefault();
            return;
        }
    } else if (examBr0 === 'not_started') {
        if (ev) ev.preventDefault();
        var ptrNs = ptrFromCellEvent(ev);
        if (typeof window.CELLAUTO_notifyExamNotStartedCellClick === 'function') {
            window.CELLAUTO_notifyExamNotStartedCellClick(ptrNs);
        }
        return;
    } else if (examBr0) {
        if (ev) ev.preventDefault();
        return;
    }
    isPointerDown = true;
    const clickMode = document.getElementById('word_mode').value;
    if (clickMode !== 'select') {
        toggleCell(col, row, ev);
        return;
    }
    dragSelectActive = true;
    dragSelectValue = matrix[col][row] === 0 ? currentDrawValue() : 0;
    var prevDrag = matrix[col][row];
    matrix[col][row] = dragSelectValue;
    reDrawTable();
    if (typeof window.CELLAUTO_examAfterCellChange === 'function') {
        var ptrDown =
            ev && typeof ev.clientX === 'number'
                ? { clientX: ev.clientX, clientY: ev.clientY }
                : typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
                  ? window.__cellautoLastPointer
                  : null;
        window.CELLAUTO_examAfterCellChange(col, row, prevDrag, dragSelectValue, ptrDown);
    }
    if (ev) ev.preventDefault();
}

function handleCellMouseEnter(col, row) {
    if (!isPointerDown || !dragSelectActive) return;
    const clickMode = document.getElementById('word_mode').value;
    if (clickMode !== 'select') return;
    var examBr1 = typeof window.CELLAUTO_examEditBlockedReason === 'function'
        ? window.CELLAUTO_examEditBlockedReason(col, row)
        : '';
    if (examBr1) return;
    if (matrix[col][row] !== dragSelectValue) {
        var prevEnter = matrix[col][row];
        matrix[col][row] = dragSelectValue;
        reDrawTable();
        if (typeof window.CELLAUTO_examAfterCellChange === 'function') {
            var ptrDrag =
                typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
                    ? window.__cellautoLastPointer
                    : null;
            window.CELLAUTO_examAfterCellChange(col, row, prevEnter, dragSelectValue, ptrDrag);
        }
    }
}

function isWordQuickPickEnabled() {
    if (typeof window.CELLAUTO_examUseWordQuickPicker === 'function' && window.CELLAUTO_examUseWordQuickPicker()) {
        return true;
    }
    var ch = document.getElementById('wordQuickPick');
    return !!(ch && ch.checked);
}

function closeWordQuickPicker() {
    if (wordQuickPickerEl && wordQuickPickerEl.parentNode) {
        wordQuickPickerEl.parentNode.removeChild(wordQuickPickerEl);
    }
    wordQuickPickerEl = null;
}

function applyWordToCell(col, row, value) {
    let cell = document.getElementById(cellDomId(col, row));
    if (!cell) return;
    if (!value || value === '---') {
        cell.innerHTML = '&nbsp;';
        return;
    }
    cell.innerHTML = insertLineBreaks(value);
}

function openWordQuickPicker(col, row, relationHighlightIdsDisplay, relationHighlightIdsValidation) {
    const generation = matrix[col][row];
    const source = document.getElementById('lev' + generation);
    if (!source) return;

    const targetCell = document.getElementById(cellDomId(col, row));
    if (!targetCell) return;

    const validationIds =
        relationHighlightIdsValidation !== undefined ? relationHighlightIdsValidation : relationHighlightIdsDisplay;

    closeWordQuickPicker();

    const box = document.createElement('div');
    box.className = 'word-quick-picker';
    box.tabIndex = -1;

    const list = document.createElement('div');
    list.className = 'word-quick-picker__list';
    list.setAttribute('role', 'listbox');

    let firstBtn = null;

    function wirePick(o, isRelation) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'word-quick-picker__btn' +
            (isRelation ? ' word-quick-picker__btn--relation' : '');
        var label = String(o.textContent || o.value || '').trim();
        btn.innerHTML =
            '<span class="word-quick-picker__label">' +
            String(label).replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</span>';
        btn.addEventListener('click', function (ev) {
            applyWordToCell(col, row, o.value);
            if (
                typeof window.CELLAUTO_isPracticeWordSentencePhase === 'function' &&
                window.CELLAUTO_isPracticeWordSentencePhase() &&
                typeof window.CELLAUTO_onPracticeWordPicked === 'function'
            ) {
                window.CELLAUTO_onPracticeWordPicked(
                    col,
                    row,
                    o.value,
                    validationIds || null,
                    { clientX: ev.clientX, clientY: ev.clientY }
                );
            }
            closeWordQuickPicker();
        });
        if (!firstBtn) firstBtn = btn;
        list.appendChild(btn);
    }

    for (let i = 0; i < source.options.length; i++) {
        const o = source.options[i];
        if (!o.value || o.value === '---') continue;
        let isRel = false;
        if (
            relationHighlightIdsDisplay &&
            relationHighlightIdsDisplay.length &&
            typeof window.CELLAUTO_practiceWordIdForLabel === 'function'
        ) {
            var oid = window.CELLAUTO_practiceWordIdForLabel(o.value, generation);
            if (oid && relationHighlightIdsDisplay.indexOf(oid) >= 0) isRel = true;
        }
        wirePick(o, isRel);
    }

    box.appendChild(list);
    document.body.appendChild(box);
    wordQuickPickerEl = box;
    wordQuickPickerOpenedAt = Date.now();

    box.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
            ev.preventDefault();
            closeWordQuickPicker();
        }
    });

    const r = targetCell.getBoundingClientRect();
    const margin = 6;
    let left = r.right + margin;
    let top = r.top;
    if (left + box.offsetWidth > window.innerWidth - margin) {
        left = Math.max(margin, r.left - box.offsetWidth - margin);
    }
    if (top + box.offsetHeight > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - box.offsetHeight - margin);
    }
    box.style.left = left + 'px';
    box.style.top = top + 'px';

    setTimeout(function () {
        if (firstBtn) firstBtn.focus();
        else box.focus();
    }, 0);
}

function toggleCell(col, row, ev) {

    var examBr = typeof window.CELLAUTO_examEditBlockedReason === 'function'
        ? window.CELLAUTO_examEditBlockedReason(col, row)
        : '';
    if (examBr === 'frozen') {
        if (shouldShowExamFrozenBlockToast(ev)) return;
    } else if (examBr) {
        return;
    }

    const clickMode = document.getElementById('word_mode').value;
    if (clickMode === 'select') {
        let mode = document.getElementById('mode').value;
        let drawLv = activeDrawLevelFromUi();
        let cell = document.getElementById(cellDomId(col, row));
        const prev = matrix[col][row];
        if (matrix[col][row] === 0) {
            matrix[col][row] = mode == 'play' ? 1 : drawLv;
            // cell.classList.add('colorStart');
        } else {
            matrix[col][row] = 0;
            // cell.classList.remove('colorStart');
        }
        reDrawTable();
        if (typeof window.CELLAUTO_examAfterCellChange === 'function') {
            var ptrT =
                ev && typeof ev.clientX === 'number'
                    ? { clientX: ev.clientX, clientY: ev.clientY }
                    : typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
                      ? window.__cellautoLastPointer
                      : null;
            window.CELLAUTO_examAfterCellChange(col, row, prev, matrix[col][row], ptrT);
        }
    } else {
        var practicePhase =
            typeof window.CELLAUTO_isPracticeWordSentencePhase === 'function' &&
            window.CELLAUTO_isPracticeWordSentencePhase();
        var pg = null;
        if (practicePhase && typeof window.CELLAUTO_practiceWordPickGate === 'function') {
            pg = window.CELLAUTO_practiceWordPickGate(col, row);
            if (!pg.ok) {
                var ptrGate =
                    ev && typeof ev.clientX === 'number'
                        ? { clientX: ev.clientX, clientY: ev.clientY }
                        : typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
                          ? window.__cellautoLastPointer
                          : null;
                if (ptrGate && typeof window.CELLAUTO_showPracticeCellHint === 'function') {
                    window.CELLAUTO_showPracticeCellHint(ptrGate, pg.message || '');
                } else if (typeof window.showToast === 'function') {
                    window.showToast(pg.message || '', 4200);
                }
                return;
            }
        }

        if (matrix[col][row] > 0 && matrix[col][row] <= matrixWord.length) {
            if (isWordQuickPickEnabled()) {
                (function () {
                    var rawH = pg && pg.relationHighlightIds ? pg.relationHighlightIds : null;
                    var dispH = rawH;
                    if (
                        practicePhase &&
                        typeof window.CELLAUTO_practiceFillHelpActive === 'function' &&
                        !window.CELLAUTO_practiceFillHelpActive()
                    ) {
                        dispH = null;
                    }
                    openWordQuickPicker(col, row, dispH, rawH);
                })();
                return;
            }

            const firstSelect = document.getElementById(`lev${matrix[col][row]}`);
            if (!firstSelect) return;
            const selectedIndex = firstSelect.selectedIndex;
            const selectedOption = firstSelect.options[selectedIndex];
            const selectedValue = selectedOption ? selectedOption.value : '---';
            applyWordToCell(col, row, selectedValue);
            if (practicePhase && typeof window.CELLAUTO_onPracticeWordPicked === 'function') {
                var ptrPick =
                    ev && typeof ev.clientX === 'number'
                        ? { clientX: ev.clientX, clientY: ev.clientY }
                        : typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
                          ? window.__cellautoLastPointer
                          : null;
                window.CELLAUTO_onPracticeWordPicked(
                    col,
                    row,
                    selectedValue,
                    pg && pg.relationHighlightIds ? pg.relationHighlightIds : null,
                    ptrPick
                );
            }
        }
        // word mode
    }
}

function reDrawTable() {
    let cell = '';
    let cellValue = 0;
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol - ((i % 2 != 0) && (board == 'hex')); j++) {
            cell = document.getElementById(cellDomId(j, i));
            removeColors(cell);
            removeVerifyColors(cell);
            cellValue = matrix[j][i]
            if (cellValue == 1) {
                cell.classList.add('color1');
            }
            if (cellValue > 1) {
                cell.classList.add('color' + ((cellValue - 1) % nrOfColors + 1));
            }
        }
    }
}

function removeColors(cell) {
    cell.classList.remove('colorStart');
    for (color = 1; color <= nrOfColors; color++) {
        cell.classList.remove('color' + color);
    }
}

function removeVerifyColors(cell) {
    cell.classList.remove('plus');
    cell.classList.remove('minus');
    cell.classList.remove('ok');
    cell.classList.remove('error');
}

function verify() {
    reDrawTable();
    method = document.getElementById("neighbors").value;
    maxLevel = document.getElementById("level").value;
    // matrix[j][i] = oszlop, sor — mint reDrawTable / setLevel / vizsga diff (nem matrix[i][j])
    for (let ii = 0; ii < maxRow; ii++) {
        for (let jj = 0; jj < maxCol; jj++) {
            matrixVerify[ii][jj] = 0;
            matrixVerifyChecked[ii][jj] = 0;
        }
    }
    for (let i = 0; i < viewRow; i++) {
        const xMax = viewCol - ((board === 'hex' && (i % 2 !== 0)) ? 1 : 0);
        for (let j = 0; j < xMax; j++) {
            if (matrix[j][i] === 1) {
                matrixVerify[j][i] = 1;
            }
        }
    }
    genMatrix(true);
    renderTableVerify();
}

async function renderTableVerify() {
    errorCount = 0;
    for (lev = 2; lev <= maxLevel; lev++) {
        for (let i = 0; i < viewRow; i++) {
            for (let j = 0; j < viewCol - ((i % 2 != 0) && (board == 'hex')); j++) {
                if (matrix[j][i] == lev || matrixVerify[j][i] == lev) {
                    if (matrix[j][i] != 0 || matrixVerify[j][i] != 0) {
                        if (matrixVerifyChecked[j][i] == 0) {
                            if (matrix[j][i] != 0 && matrixVerify[j][i] == 0) {
                                addVerifyClass(j, i, 'plus');
                            }
                            if (matrix[j][i] == 0 && matrixVerify[j][i] != 0) {
                                addVerifyClass(j, i, 'minus');
                            }
                            if (matrix[j][i] == matrixVerify[j][i]) {
                                addVerifyClass(j, i, 'ok');
                            }
                            if (matrix[j][i] != matrixVerify[j][i] && (matrix[j][i] > 0 && matrixVerify[j][i] > 0)) {
                                addVerifyClass(j, i, 'error');
                            }
                        }
                    }
                }
            }
        }
        await sleep(delay * 1000);
    }
    if (errorCount == 0) showWinMessage()
    else showWinMessage(false);
}

function addVerifyClass(x, y, cl) {
    // console.log(x,y,cl);
    matrixVerifyChecked[x][y] = 1;
    cell = document.getElementById(cellDomId(x, y));
    // if (cell.classList.length == (board=='hex' ? 1 : 0)) {
    if (cl != 'ok') errorCount++;
    cell.classList.add(cl);
}

function genMatrix(ver = false) {
    for (i = 2; i <= maxLevel; i++) {
        setLevel(i, ver);
    }
}

function setLevel(level, ver) {
    for (let i = 0; i < viewRow; i++) {
        const xMax = viewCol - ((board === 'hex' && (i % 2 !== 0)) ? 1 : 0);
        for (let j = 0; j < xMax; j++) {
            if (ver) {
                if (matrixVerify[j][i] == 0 && checkIfNewChildIsBorn(j, i, level, method, matrixVerify)) {
                    matrixVerify[j][i] = level;
                }
            } else {
                if (matrix[j][i] == 0 && checkIfNewChildIsBorn(j, i, level, method, matrix)) {
                    matrix[j][i] = level;
                }
            }
        }
    }
}

function isValidBoardCell(x, y, boardType) {
    if (x < 0 || y < 0 || x >= viewCol || y >= viewRow) return false;
    if (boardType === 'hex' && (y % 2 !== 0) && x === viewCol - 1) return false;
    return true;
}

function getBoardValue(mat, x, y, boardType) {
    if (!isValidBoardCell(x, y, boardType)) return 0;
    return matrixValue(mat[x] && mat[x][y]);
}

function checkIfNewChildIsBorn(col, row, level, method, mat) {
    let neighborsPreviousLevel = 0;
    let neighborsPrePreviousLevel = 0;
    switch (method) {
        case 'side': {
            const sideNeighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dx, dy] of sideNeighbors) {
                const cell = getBoardValue(mat, col + dx, row + dy, board === 'hex' ? 'hex' : 'square');
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
        };
            break;
        case 'apex': {
            const apexNeighbors = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
            for (const [dx, dy] of apexNeighbors) {
                const cell = getBoardValue(mat, col + dx, row + dy, board === 'hex' ? 'hex' : 'square');
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            break;
        }
        case 'hex': {
            let cell = getBoardValue(mat, col, row - 1, 'hex');
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            cell = getBoardValue(mat, col + 1, row, 'hex');
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            cell = getBoardValue(mat, col, row + 1, 'hex');
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            cell = getBoardValue(mat, col - 1, row, 'hex');
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            if (row % 2 == 0) {
                cell = getBoardValue(mat, col - 1, row - 1, 'hex');
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
                cell = getBoardValue(mat, col - 1, row + 1, 'hex');
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            } else {
                cell = getBoardValue(mat, col + 1, row + 1, 'hex');
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
                cell = getBoardValue(mat, col + 1, row - 1, 'hex');
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            break;
        }
    }
    if (neighborsPrePreviousLevel == 0 && neighborsPreviousLevel == 1) {
        return true;
    }
    return false;
}

function matrixValue(mx) {
    return (mx == undefined ? 0 : mx)
}

function countNeighborsSquare(col, row, mat) {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const x = col + dx, y = row + dy;
            if (x < 0 || y < 0 || x >= viewCol || y >= viewRow) continue;
            c += (mat[x][y] === 1) ? 1 : 0;
        }
    }
    return c;
}

function countNeighborsHex(col, row, mat) {
    // 6 szomszéd a te hex elrendezésedhez igazítva (páros/szodd sor offset)
    const offsetsEven = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [-1, 1]];
    const offsetsOdd = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1]];
    const offsets = (row % 2 === 0) ? offsetsEven : offsetsOdd;

    let c = 0;
    for (const [dx, dy] of offsets) {
        const x = col + dx, y = row + dy;
        if (x < 0 || y < 0 || x >= viewCol || y >= viewRow) continue;

        // nálad hexnél a páratlan sor utolsó oszlopa nem létezik
        if (board === 'hex' && (y % 2 !== 0) && x === viewCol - 1) continue;

        c += (mat[x][y] === 1) ? 1 : 0;
    }
    return c;
}

function stepGameOfLife(useHighLifeRule) {
    const next = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));

    for (let y = 0; y < viewRow; y++) {
        const xMax = viewCol - ((y % 2 !== 0) && (board === 'hex'));
        for (let x = 0; x < xMax; x++) {
            const n = countNeighborsSquare(x, y, matrix);
            const alive = (matrix[x][y] === 1);

            // B3/S23 (Conway) vs B36/S23 (HighLife)
            if (alive) next[x][y] = (n === 2 || n === 3) ? 1 : 0;
            else next[x][y] = (n === 3 || (useHighLifeRule && n === 6)) ? 1 : 0;
        }
    }

    // átmásolás vissza a matrixba
    for (let y = 0; y < viewRow; y++) {
        for (let x = 0; x < viewCol; x++) matrix[x][y] = next[x][y];
    }
}

function captureBoardSnapshot() {
    const cells = [];
    for (let y = 0; y < viewRow; y++) {
        const xMax = viewCol - ((board === 'hex' && (y % 2 !== 0)) ? 1 : 0);
        for (let x = 0; x < xMax; x++) {
            cells.push(matrix[x][y] | 0);
        }
    }
    return {
        viewRow: viewRow,
        viewCol: viewCol,
        board: board,
        cells: cells,
    };
}

function applyBoardSnapshot(snapshot) {
    if (!snapshot || !snapshot.cells) return;
    if (snapshot.viewRow !== viewRow || snapshot.viewCol !== viewCol || snapshot.board !== board) return;
    let idx = 0;
    for (let y = 0; y < viewRow; y++) {
        const xMax = viewCol - ((board === 'hex' && (y % 2 !== 0)) ? 1 : 0);
        for (let x = 0; x < xMax; x++) {
            matrix[x][y] = snapshot.cells[idx++] | 0;
        }
    }
}

function getMatrixMaxValue() {
    let m = 0;
    for (let y = 0; y < viewRow; y++) {
        const xMax = viewCol - ((board === 'hex' && (y % 2 !== 0)) ? 1 : 0);
        for (let x = 0; x < xMax; x++) {
            if (matrix[x][y] > m) m = matrix[x][y];
        }
    }
    return m;
}

function normalizeBinaryMatrix() {
    for (let y = 0; y < viewRow; y++) {
        const xMax = viewCol - ((board === 'hex' && (y % 2 !== 0)) ? 1 : 0);
        for (let x = 0; x < xMax; x++) {
            matrix[x][y] = matrix[x][y] ? 1 : 0;
        }
    }
}

function advanceOneGeneration(selectedMethod, selectedMaxLevel) {
    if (selectedMethod === 'life' || selectedMethod === 'life_hex') {
        const useHighLifeRule = selectedMethod === 'life_hex';
        stepGameOfLife(useHighLifeRule);
        return true;
    }

    const nextLevel = getMatrixMaxValue() + 1;
    if (nextLevel > selectedMaxLevel) return false;
    setLevel(nextLevel, false);
    return true;
}

function stopGenerate() {
    isRunning = false;
    setGenerationControlsState();
}

function normalizePayloadCells(payload) {
    if (!payload || !Array.isArray(payload.cells) || !payload.cells.length) return null;
    const valid = payload.cells.filter(function (c) {
        return c && typeof c.x === 'number' && typeof c.y === 'number' && typeof c.v === 'number' && c.v !== 0;
    });
    if (!valid.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    valid.forEach(function (c) {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
    });
    return {
        cells: valid.map(function (c) {
            return { x: c.x - minX, y: c.y - minY, v: c.v | 0 };
        }),
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        originalX: minX,
        originalY: minY,
    };
}

function canPlaceNormalizedCellsAt(norm, ox, oy) {
    if (!norm) return false;
    for (let i = 0; i < norm.cells.length; i++) {
        const c = norm.cells[i];
        const x = ox + c.x;
        const y = oy + c.y;
        if (!isValidBoardCell(x, y, board)) return false;
    }
    return true;
}

function clampPlacementOffset(norm, ox, oy) {
    if (!norm) return { x: 0, y: 0 };
    const maxX = Math.max(0, viewCol - norm.width);
    const maxY = Math.max(0, viewRow - norm.height);
    let x = Math.max(0, Math.min(ox, maxX));
    let y = Math.max(0, Math.min(oy, maxY));
    if (canPlaceNormalizedCellsAt(norm, x, y)) return { x: x, y: y };

    for (let dy = 0; dy <= maxY; dy++) {
        for (let dx = 0; dx <= maxX; dx++) {
            const tx = Math.max(0, Math.min(x - dx, maxX));
            const ty = Math.max(0, Math.min(y - dy, maxY));
            if (canPlaceNormalizedCellsAt(norm, tx, ty)) return { x: tx, y: ty };
        }
    }
    return null;
}

function clearPlacementPreview() {
    if (!pendingPreviewCells.length) return;
    for (let i = 0; i < pendingPreviewCells.length; i++) {
        const cell = pendingPreviewCells[i];
        if (!cell) continue;
        cell.classList.remove('preview-cell');
        for (let c = 1; c <= nrOfColors; c++) cell.classList.remove('color' + c);
    }
    pendingPreviewCells = [];
}

function paintPlacementPreview(norm, ox, oy) {
    clearPlacementPreview();
    if (!norm) return;
    for (let i = 0; i < norm.cells.length; i++) {
        const c = norm.cells[i];
        const x = ox + c.x;
        const y = oy + c.y;
        const cell = document.getElementById(cellDomId(x, y));
        if (!cell) continue;
        const colorClass = 'color' + (((c.v - 1 + nrOfColors) % nrOfColors) + 1);
        cell.classList.add(colorClass);
        cell.classList.add('preview-cell');
        pendingPreviewCells.push(cell);
    }
}

function updatePlacementPreviewTo(x, y) {
    if (!pendingLoadedPlacement) return;
    const clamped = clampPlacementOffset(pendingLoadedPlacement, x, y);
    if (!clamped) return;
    pendingLoadedPlacement.previewX = clamped.x;
    pendingLoadedPlacement.previewY = clamped.y;
    paintPlacementPreview(pendingLoadedPlacement, clamped.x, clamped.y);
}

function placeLoadedPatternAt(clickX, clickY) {
    if (!pendingLoadedPlacement) return false;
    const norm = pendingLoadedPlacement;
    const clamped = clampPlacementOffset(norm, clickX, clickY);
    if (!clamped) return false;
    clearPlacementPreview();
    if (!norm.overlay) resetMartixValue();
    for (let i = 0; i < norm.cells.length; i++) {
        const c = norm.cells[i];
        const x = clamped.x + c.x;
        const y = clamped.y + c.y;
        if (isValidBoardCell(x, y, board)) matrix[x][y] = c.v | 0;
    }
    reDrawTable();
    pendingLoadedPlacement = null;
    return true;
}

function beginLoadedPlacement(payload, opts) {
    opts = opts || {};
    const norm = normalizePayloadCells(payload);
    if (!norm) {
        pendingLoadedPlacement = null;
        clearPlacementPreview();
        reDrawTable();
        return;
    }
    norm.overlay = !!opts.overlay;
    pendingLoadedPlacement = norm;
    if (!norm.overlay) resetMartixValue();
    reDrawTable();
    updatePlacementPreviewTo(norm.originalX, norm.originalY);
    showToast('Mozgasd az egeret: az elo-nezet mutatja az elhelyezest. Kattints a lerakáshoz, ESC: eredeti pozicio + kilepes.', 30000);
}

function setGenerationControlsState() {
    var playBtn = document.getElementById('check');
    var resetBtn = document.getElementById('btnReset');
    var stopBtn = document.getElementById('btnStop');
    var fwdBtn = document.getElementById('btnStepForward');
    var backBtn = document.getElementById('btnStepBack');
    if (playBtn) playBtn.disabled = isRunning;
    if (resetBtn) resetBtn.disabled = isRunning;
    if (stopBtn) stopBtn.disabled = !isRunning;
    if (fwdBtn) fwdBtn.disabled = isRunning;
    if (backBtn) backBtn.disabled = isRunning;
}

async function goGenerate() {
    if (isRunning) return;
    isRunning = true;
    setGenerationControlsState();
    method = document.getElementById("neighbors").value;
    maxLevel = Number(document.getElementById("level").value);
    delay = Number(document.getElementById("delay").value);

    if (method === 'life' || method === 'life_hex') {
        normalizeBinaryMatrix();
    }

    const startMax = getMatrixMaxValue();
    for (let lev = startMax + 1; lev <= maxLevel; lev++) {
        if (!isRunning) break;
        generationHistory.push(captureBoardSnapshot());
        if (!advanceOneGeneration(method, maxLevel)) break;
        reDrawTable();
        await sleep(delay * 1000);
    }
    isRunning = false;
    setGenerationControlsState();
}


const PATTERNS = {
    glider: [
        [0, 1, 0],
        [0, 0, 1],
        [1, 1, 1],
    ],
    lwss: [
        [0, 1, 0, 0, 1],
        [1, 0, 0, 0, 0],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 0],
    ],
};

function clearToBinary() {
    for (let y = 0; y < viewRow; y++) {
        for (let x = 0; x < viewCol; x++) matrix[x][y] = 0;
    }
}

function placePattern(pattern, startX, startY) {
    for (let y = 0; y < pattern.length; y++) {
        for (let x = 0; x < pattern[0].length; x++) {
            const gx = startX + x;
            const gy = startY + y;
            if (gx < 0 || gy < 0 || gx >= viewCol || gy >= viewRow) continue;
            if (pattern[y][x]) matrix[gx][gy] = 1;
        }
    }
}

function seedLifeDemo() {
    clearToBinary();

    // pár minta szétszórva
    placePattern(PATTERNS.glider, 2, 2);
    placePattern(PATTERNS.glider, 20, 5);
    placePattern(PATTERNS.lwss, 25, 18);

    reDrawTable();
}


// function goGenerate() {
//     method = document.getElementById("neighbors").value;
//     maxLevel = document.getElementById("level").value;
//     delay = document.getElementById("delay").value;

//     genMatrix();
//     renderTable();
// }

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function renderTable(reset = false) {
    let cell = '';
    for (lev = 2; lev <= maxLevel; lev++) {
        for (let i = 0; i < viewRow; i++) {
            for (let j = 0; j < viewCol - ((i % 2 != 0) && (board == 'hex')); j++) {

                cell = document.getElementById(cellDomId(j, i));
                if (reset) {
                    // cell.className = '';
                }
                cellValue = matrix[j][i]
                if (cellValue == lev) {
                    if (cell.classList.length == (board == 'hex' ? 1 : 0)) {
                        cell.classList.add('color' + ((cellValue - 1) % nrOfColors + 1));
                    }
                }
            }
        }
        await sleep(delay * 1000);
    }
}

function resetMatrix(opt) {
    stopGenerate();
    generationHistory = [];
    pendingLoadedPlacement = null;
    clearPlacementPreview();
    if (board == 'hex') {
        createHexTable(false);
        createHexTable();
        addClickListenersHex();
    } else {
        createSquareTable(false);
        createSquareTable();
        addClickListenersSquare();
    }
    document.getElementById('level1').checked = true;
    resetMartixValue();
    setGenerationControlsState();
}

function resetMartixValue() {
    for (let i = 0; i < maxRow; i++) {
        for (let j = 0; j < maxCol; j++) {
            matrix[i][j] = 0;
            matrixVerify[i][j] = 0;
        }
    }
}

// function resetMatrix(opt) {
//     let cell = '';
//     for (let i = 0; i < viewRow; i++) {
//         for (let j = 0; j < viewCol-((i % 2 != 0) && (board=='hex')); j++) {
//             cell = document.getElementById(cellDomId(j, i));
//             if (!(matrix[j][i]==1 && opt==1)) {
//                 matrix[j][i] = 0;
//                 if (board!='hex') {
//                     cell.className = '';
//                 }
//             }
//         }
//     }
//     if (board=='hex') {
//         createHexTable(false);
//         for (let i = 0; i < maxRow; i++) {
//             for (let j = 0; j < maxCol; j++) {
//                 matrix[i][j] = 0;
//             }
//         }
//         createHexTable();
//         addClickListenersHex();
//     }
// }

function wireNeighborsAndModeSelects() {
    var neighborsEl = document.getElementById('neighbors');
    var modeEl = document.getElementById('mode');
    if (!neighborsEl || !modeEl || neighborsEl._cellautoUiWired) return;
    neighborsEl._cellautoUiWired = true;

    neighborsEl.addEventListener('change', function () {
        stopGenerate();
        generationHistory = [];
        var boradTmp = this.value;
        if (board == 'square' && boradTmp == 'hex') {
            board = 'hex';
            createSquareTable(false);
            createHexTable();
            addClickListenersHex();
            resetMartixValue();
        }
        if (board == 'hex' && boradTmp != 'hex') {
            board = 'square';
            createHexTable(false);
            createSquareTable();
            addClickListenersSquare();
            resetMartixValue();
        }
        if (this.value === 'life' || this.value === 'life_hex') {
            resetMartixValue();
            seedLifeDemo();
        }
        updateBoardScrollableExtent();
    });

    modeEl.addEventListener('change', function () {
        var curMode = this.value;
        if (modePT == 'play' && curMode == 'test') {
            modePT = curMode;
            document.getElementById('verifySectionDraw').classList.remove('hidden');
            document.getElementById('check').classList.add('hidden');
            document.getElementById('btnVerify').classList.remove('hidden');
            document.getElementById('level1').checked = true;
            document.getElementById('level').value = maxLevelVerify;
        }
        if (modePT == 'test' && curMode == 'play') {
            modePT = curMode;
            document.getElementById('verifySectionDraw').classList.add('hidden');
            document.getElementById('btnVerify').classList.add('hidden');
            document.getElementById('check').classList.remove('hidden');
            document.getElementById('level').value = maxLevel;
        }
        if (typeof window.CELLAUTO_refreshExamGenPills === 'function') {
            window.CELLAUTO_refreshExamGenPills();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireNeighborsAndModeSelects);
} else {
    wireNeighborsAndModeSelects();
}

function syncPlayModeToggleFromSelect() {
    var modeSel = document.getElementById('mode');
    if (!modeSel) return;
    var active = modeSel.value === 'test' ? 'test' : 'play';
    var radio = document.querySelector('input[name="playModeToggle"][value="' + active + '"]');
    if (radio) radio.checked = true;
}

function wirePlayModeToggle() {
    var modeSel = document.getElementById('mode');
    if (!modeSel || modeSel._playModeWired) return;
    modeSel._playModeWired = true;
    syncPlayModeToggleFromSelect();

    var radios = document.querySelectorAll('input[name="playModeToggle"]');
    radios.forEach(function (r) {
        r.addEventListener('change', function () {
            if (!this.checked) return;
            modeSel.value = this.value;
            modeSel.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });

    modeSel.addEventListener('change', syncPlayModeToggleFromSelect);
}

function stepForwardOneGeneration() {
    if (isRunning) return;
    method = document.getElementById("neighbors").value;
    maxLevel = Number(document.getElementById("level").value);
    if (method === 'life' || method === 'life_hex') normalizeBinaryMatrix();
    generationHistory.push(captureBoardSnapshot());
    if (advanceOneGeneration(method, maxLevel)) reDrawTable();
    setGenerationControlsState();
}

function stepBackOneGeneration() {
    if (isRunning) return;
    var prev = generationHistory.pop();
    if (!prev) return;
    applyBoardSnapshot(prev);
    reDrawTable();
    setGenerationControlsState();
}

function wireGenerationControls() {
    var stopBtn = document.getElementById('btnStop');
    var fwdBtn = document.getElementById('btnStepForward');
    var backBtn = document.getElementById('btnStepBack');
    if (stopBtn && !stopBtn._wired) {
        stopBtn._wired = true;
        stopBtn.addEventListener('click', stopGenerate);
    }
    if (fwdBtn && !fwdBtn._wired) {
        fwdBtn._wired = true;
        fwdBtn.addEventListener('click', stepForwardOneGeneration);
    }
    if (backBtn && !backBtn._wired) {
        backBtn._wired = true;
        backBtn.addEventListener('click', stepBackOneGeneration);
    }
    setGenerationControlsState();
}

/** Max gen. (1…maxCycle) — fusson a táblaépítés előtt is, hogy hiba esetén is legyen opció */
function ensureMaxGenSelectOptions() {
    const select = document.getElementById('level');
    if (!select) return;
    select.innerHTML = '';
    for (let i = 1; i <= maxCycle; i++) {
        var option = document.createElement('option');
        option.value = String(i);
        option.textContent = String(i);
        if (i === currentCycle) option.selected = true;
        select.appendChild(option);
    }
}

function initGameBoard() {
    ensureMaxGenSelectOptions();
    createSquareTable();
    addClickListenersSquare();
    document.getElementById('neighbors').value = 'side';
    document.getElementById('mode').value = 'play';
    document.getElementById('verifySectionDraw').classList.add('hidden');
    document.getElementById('btnVerify').classList.add('hidden');

    wireBoardSizeAndZoomControls();
    wireWordModeToggle();
    wirePlayModeToggle();
    wireGenerationControls();
    updateBoardScrollableExtent();
    if (typeof window.CELLAUTO_refreshExamGenPills === 'function') {
        window.CELLAUTO_refreshExamGenPills();
    }
}

function applyBoardSize(size) {
    if (!Number.isFinite(size) || size < 10 || size > 200) return;
    viewRow = size;
    viewCol = size;
    resetMatrix(0);
    updateBoardScrollableExtent();
}

function applyBoardZoom(zoom) {
    var bd = boardDivEl();
    if (!bd || !Number.isFinite(zoom) || zoom <= 0) return;
    boardZoom = zoom;
    bd.style.zoom = String(zoom);
    updateBoardScrollableExtent();
}

function syncWordModeToggleFromSelect() {
    var wm = document.getElementById('word_mode');
    if (!wm) return;
    var active = wm.value === 'word' ? 'word' : 'select';
    var radio = document.querySelector('input[name="wordModeToggle"][value="' + active + '"]');
    if (radio) radio.checked = true;
}

function wireWordModeToggle() {
    var wm = document.getElementById('word_mode');
    if (!wm || wm._modeWired) return;
    wm._modeWired = true;
    syncWordModeToggleFromSelect();

    var radios = document.querySelectorAll('input[name="wordModeToggle"]');
    radios.forEach(function (r) {
        r.addEventListener('change', function () {
            if (!this.checked) return;
            wm.value = this.value;
            wm.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });

    wm.addEventListener('change', function () {
        syncWordModeToggleFromSelect();
        if (typeof window.CELLAUTO_refreshExamGenPills === 'function') {
            window.CELLAUTO_refreshExamGenPills();
        }
    });
}

function updateBoardScrollableExtent() {
    var bd = boardDivEl();
    if (!bd) return;
    requestAnimationFrame(function () {
        var root = bd.firstElementChild;
        if (!root) return;
        var rect = root.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) return;
        bd.style.minWidth = String(Math.ceil(rect.width)) + 'px';
        bd.style.minHeight = String(Math.ceil(rect.height)) + 'px';
    });
}

function wireBoardSizeAndZoomControls() {
    var sizeSel = document.getElementById('boardSizeSelect');
    var zoomSel = document.getElementById('boardZoomSelect');

    if (sizeSel && !sizeSel._wired) {
        sizeSel._wired = true;
        var savedSize = parseInt(localStorage.getItem(STORAGE_BOARD_SIZE) || '', 10);
        if (savedSize && sizeSel.querySelector('option[value="' + savedSize + '"]')) {
            sizeSel.value = String(savedSize);
        }
        applyBoardSize(parseInt(sizeSel.value, 10));
        sizeSel.addEventListener('change', function () {
            var size = parseInt(this.value, 10);
            applyBoardSize(size);
            localStorage.setItem(STORAGE_BOARD_SIZE, String(size));
        });
    }

    if (zoomSel && !zoomSel._wired) {
        zoomSel._wired = true;
        var savedZoom = localStorage.getItem(STORAGE_BOARD_ZOOM);
        if (savedZoom && zoomSel.querySelector('option[value="' + savedZoom + '"]')) {
            zoomSel.value = savedZoom;
        }
        applyBoardZoom(parseFloat(zoomSel.value));
        zoomSel.addEventListener('change', function () {
            var zoom = parseFloat(this.value);
            applyBoardZoom(zoom);
            localStorage.setItem(STORAGE_BOARD_ZOOM, String(zoom));
        });
    }
}

if (!window.__CELLAUTO_DEFER_INIT__) {
    window.addEventListener('load', initGameBoard);
}

// A scriptet elhelyezheted a HTML oldalad <head> részében vagy a <body> végén

document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener(
        'mousemove',
        function (e) {
            window.__cellautoLastPointer = { clientX: e.clientX, clientY: e.clientY };
        },
        { capture: true, passive: true }
    );

    var tabla = document.getElementById('boardDiv'); // Azonosítjuk a formot
    var form = document.getElementById('drawLevel'); // Azonosítjuk a formot

    tabla.addEventListener('contextmenu', function (event) {
        event.preventDefault(); // Megakadályozza a kontextusmenü megjelenését

        var radioButtons = form.querySelectorAll('input[type="radio"]');
        var selectedButton = form.querySelector('input[type="radio"]:checked');
        var selectedIndex = Array.prototype.indexOf.call(radioButtons, selectedButton);

        var nextIndex = (selectedIndex + 1) % radioButtons.length; // Következő index, vagy vissza az elsőre
        radioButtons[nextIndex].checked = true; // Beállítjuk a következő rádiógombot
    });

    document.addEventListener('mouseup', function () {
        isPointerDown = false;
        dragSelectActive = false;
    });
    document.addEventListener('scroll', hideCellHoverPreview, true);

    document.addEventListener('click', function (event) {
        if (!wordQuickPickerEl) return;
        if (Date.now() - wordQuickPickerOpenedAt < 180) return;
        if (wordQuickPickerEl.contains(event.target)) return;
        closeWordQuickPicker();
    });

    tabla.addEventListener('mousemove', function (event) {
        if (!pendingLoadedPlacement) return;
        const target = event.target && event.target.closest ? event.target.closest('[data-x][data-y]') : null;
        const x = target && target.dataset ? parseInt(target.dataset.x, 10) : NaN;
        const y = target && target.dataset ? parseInt(target.dataset.y, 10) : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        updatePlacementPreviewTo(x, y);
    }, true);

    tabla.addEventListener('click', function (event) {
        if (!pendingLoadedPlacement) return;
        const target = event.target && event.target.closest ? event.target.closest('[data-x][data-y]') : null;
        const x = target && target.dataset ? parseInt(target.dataset.x, 10) : NaN;
        const y = target && target.dataset ? parseInt(target.dataset.y, 10) : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        event.preventDefault();
        event.stopPropagation();
        placeLoadedPatternAt(x, y);
    }, true);

    document.addEventListener('keydown', function (event) {
        if (!pendingLoadedPlacement) return;
        if (event.key !== 'Escape') return;
        event.preventDefault();
        placeLoadedPatternAt(
            pendingLoadedPlacement.originalX,
            pendingLoadedPlacement.originalY
        );
    });
});


function help() {
    showToast('Cellular automation — 2024 Borsos Laszlo (F4MQFM), lborsos@gmail.com. Click on the field to set the initial cells.', 30000);
}


function showWinMessage(win = true) {
    let message = win ? 'winMessage' : 'loserMessage';
    var winMessage = document.getElementById(message);
    winMessage.style.display = "block"; // Megjelenítjük a szöveget

    setTimeout(function () {
        winMessage.style.display = "none"; // Eltüntetjük a szöveget 3 másodperc múlva
    }, 3000); // 3000 millisecond = 3 másodperc
}

function showToast(message, durationMs) {
    var id = 'cellautoToast';
    var el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = 'app-toast';
        var text = document.createElement('div');
        text.className = 'app-toast__text';
        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'app-toast__close';
        close.setAttribute('aria-label', 'Értesítés bezárása');
        close.textContent = '×';
        close.addEventListener('click', function () {
            clearTimeout(el._hideTimer);
            el.classList.remove('is-visible');
        });
        el.appendChild(text);
        el.appendChild(close);
        document.body.appendChild(el);
    }
    var textEl = el.querySelector('.app-toast__text');
    if (textEl) textEl.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
        el.classList.remove('is-visible');
    }, Number(durationMs) || 2600);
}

window.showToast = showToast;

/** Vizsga: teljes megoldás mátrix (pillanatnyi táblaállapotból szimuláció); az eredeti `matrix` változatlan marad. */
window.CELLAUTO_computeExpectedSolutionMatrix = function (generationsCount) {
    var gc = parseInt(generationsCount, 10);
    if (!Number.isFinite(gc) || gc < 1) return null;
    var backup = [];
    var x, y;
    for (x = 0; x < maxCol; x++) backup[x] = matrix[x].slice();
    var methodEl = document.getElementById('neighbors').value;
    var prevMaxLevel = maxLevel;
    maxLevel = gc;
    try {
        // setLevel → checkIfNewChildIsBorn a globális `method`-ot használja; anélkül üres maradna,
        // és a referencia nem szimulálna (4–5. gen hiányzik, „rossz gen” minden új gyűrűn).
        method = methodEl;
        if (methodEl === 'life' || methodEl === 'life_hex') normalizeBinaryMatrix();
        var guard = 0;
        while (guard++ < 3000) {
            if (getMatrixMaxValue() >= gc) break;
            if (!advanceOneGeneration(methodEl, gc)) break;
        }
        var out = [];
        for (x = 0; x < maxCol; x++) out[x] = matrix[x].slice();
        return out;
    } finally {
        for (x = 0; x < maxCol; x++) {
            for (y = 0; y < maxRow; y++) matrix[x][y] = backup[x][y];
        }
        maxLevel = prevMaxLevel;
    }
};

function insertLineBreaks(inputString) {
    const length = inputString.length;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += inputString[i];
        if ((i + 1) % 5 === 0 && (i + 1) !== length) {
            result += '\n';
        }
    }
    return result;
}

/** docs/api-board-saves.md – aktuális tábla + UI meta JSON-hoz */
window.CELLAUTO_buildSavePayload = function () {
    var cells = [];
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol - ((i % 2 != 0) && (board == 'hex')); j++) {
            var v = matrix[j][i];
            if (v !== 0) cells.push({ x: j, y: i, v: v });
        }
    }
    var wl = document.getElementById('wordListSelect');
    var cl = document.getElementById('colorListSelect');
    var bs = document.getElementById('boardSizeSelect');
    var bz = document.getElementById('boardZoomSelect');
    var drawRadio = document.querySelector('input[name="examDrawLevel"]:checked')
        || document.querySelector('input[name="drawLevel"]:checked');
    return {
        schemaVersion: 1,
        board: board === 'hex' ? 'hex' : 'square',
        neighbors: document.getElementById('neighbors').value,
        mode: document.getElementById('mode').value === 'test' ? 'test' : 'play',
        maxLevel: parseInt(document.getElementById('level').value, 10) || 10,
        delay: parseFloat(document.getElementById('delay').value) || 0,
        wordMode: document.getElementById('word_mode').value,
        drawLevel: drawRadio ? parseInt(drawRadio.value, 10) : null,
        wordListId: wl && wl.value ? parseInt(wl.value, 10) : null,
        colorListId: cl && cl.value ? parseInt(cl.value, 10) : null,
        boardSize: bs && bs.value ? parseInt(bs.value, 10) : viewRow,
        boardZoom: bz && bz.value ? parseFloat(bz.value) : boardZoom,
        cells: cells
    };
};

/** Mentés visszaállítása a táblára */
window.CELLAUTO_applySavePayload = function (payload, opts) {
    opts = opts || {};
    if (!payload || payload.schemaVersion !== 1) return false;
    var asIcon = !!opts.asIcon || !!payload.icon;

    if (asIcon) {
        beginLoadedPlacement(payload, { overlay: true });
        return true;
    }
    var neigh = document.getElementById('neighbors');
    neigh.value = payload.neighbors || 'side';
    neigh.dispatchEvent(new Event('change', { bubbles: true }));

    var modeEl = document.getElementById('mode');
    modeEl.value = payload.mode === 'test' ? 'test' : 'play';
    modeEl.dispatchEvent(new Event('change', { bubbles: true }));

    var lv = document.getElementById('level');
    if (lv && payload.maxLevel) lv.value = String(payload.maxLevel);
    var d = document.getElementById('delay');
    if (d && payload.delay !== undefined && payload.delay !== null) d.value = String(payload.delay);
    var wm = document.getElementById('word_mode');
    if (wm && payload.wordMode) {
        wm.value = payload.wordMode;
        wm.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var sizeSel = document.getElementById('boardSizeSelect');
    if (sizeSel && payload.boardSize && sizeSel.querySelector('option[value="' + payload.boardSize + '"]')) {
        sizeSel.value = String(payload.boardSize);
        sizeSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var zoomSel = document.getElementById('boardZoomSelect');
    if (zoomSel && payload.boardZoom && zoomSel.querySelector('option[value="' + payload.boardZoom + '"]')) {
        zoomSel.value = String(payload.boardZoom);
        zoomSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (payload.drawLevel) {
        var dr = document.querySelector('input[name="examDrawLevel"][value="' + payload.drawLevel + '"]');
        if (!dr) dr = document.querySelector('input[name="drawLevel"][value="' + payload.drawLevel + '"]');
        if (dr) dr.checked = true;
    }

    if (opts.immediatePlacement) {
        pendingLoadedPlacement = null;
        clearPlacementPreview();
        resetMartixValue();
        var cellsImm = payload.cells || [];
        for (var ii = 0; ii < cellsImm.length; ii++) {
            var cc = cellsImm[ii];
            if (!cc || typeof cc.x !== 'number' || typeof cc.y !== 'number') continue;
            var vi = cc.v | 0;
            if (!vi) continue;
            if (isValidBoardCell(cc.x, cc.y, board)) matrix[cc.x][cc.y] = vi;
        }
        reDrawTable();
        return true;
    }

    beginLoadedPlacement(payload, { overlay: false });
    return true;
};

window.CELLAUTO_getBoardType = function () {
    return board === 'hex' ? 'hex' : 'square';
};

window.CELLAUTO_getViewBoardMeta = function () {
    return { viewRow: viewRow, viewCol: viewCol, board: board };
};

/**
 * Hány különböző GEN1 → GEN2 → … → GEN gc szomszéd-lánc van a táblán (aktuális neighbors mód),
 * ahol minden lépés szomszédos cellára megy és a referencia értéke sorban 1..gc.
 * (Szavak_spec / ellipszisek szerinti „mondat-helyek” darabszáma.)
 */
window.CELLAUTO_countSpatialGenerationPaths = function (ref, gc) {
    if (!ref || gc < 1) return 0;
    var vr = viewRow;
    var vc = viewCol;
    var bt = board;
    var neighEl = document.getElementById('neighbors');
    var method = neighEl ? neighEl.value : 'side';

    if (method === 'life' || method === 'life_hex') return 0;

    function validCell(x, y) {
        if (x < 0 || y < 0 || x >= vc || y >= vr) return false;
        if (bt === 'hex' && y % 2 !== 0 && x === vc - 1) return false;
        return true;
    }

    function eachNeighbor(col, row, fn) {
        if (method === 'side') {
            var side = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (var i = 0; i < side.length; i++) fn(col + side[i][0], row + side[i][1]);
        } else if (method === 'apex') {
            var apex = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
            for (var j = 0; j < apex.length; j++) fn(col + apex[j][0], row + apex[j][1]);
        } else if (method === 'hex') {
            var offsetsEven = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [-1, 1]];
            var offsetsOdd = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1]];
            var offs = row % 2 === 0 ? offsetsEven : offsetsOdd;
            for (var k = 0; k < offs.length; k++) fn(col + offs[k][0], row + offs[k][1]);
        }
    }

    function dfs(cx, cy, g) {
        if (g === gc) return 1;
        var want = g + 1;
        var sum = 0;
        eachNeighbor(cx, cy, function (xx, yy) {
            if (!validCell(xx, yy)) return;
            var cell = ref[xx] && ref[xx][yy] !== undefined ? ref[xx][yy] | 0 : 0;
            if (cell !== want) return;
            sum += dfs(xx, yy, want);
        });
        return sum;
    }

    var total = 0;
    for (var y = 0; y < vr; y++) {
        var xMax = vc - (bt === 'hex' && y % 2 !== 0 ? 1 : 0);
        for (var x = 0; x < xMax; x++) {
            var v = ref[x] && ref[x][y] !== undefined ? ref[x][y] | 0 : 0;
            if (v !== 1) continue;
            total += dfs(x, y, 1);
        }
    }
    return total;
};

/**
 * Az összes GEN1 → … → GEN gc szomszéd-lánc (cella-pozíciók listája), ugyanazzal a szabállyal,
 * mint a CELLAUTO_countSpatialGenerationPaths darabszáma.
 */
window.CELLAUTO_enumerateSpatialGenerationPaths = function (ref, gc) {
    var paths = [];
    if (!ref || gc < 1) return paths;
    var vr = viewRow;
    var vc = viewCol;
    var bt = board;
    var neighEl = document.getElementById('neighbors');
    var method = neighEl ? neighEl.value : 'side';

    if (method === 'life' || method === 'life_hex') return paths;

    function validCell(x, y) {
        if (x < 0 || y < 0 || x >= vc || y >= vr) return false;
        if (bt === 'hex' && y % 2 !== 0 && x === vc - 1) return false;
        return true;
    }

    function eachNeighbor(col, row, fn) {
        if (method === 'side') {
            var side = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (var i = 0; i < side.length; i++) fn(col + side[i][0], row + side[i][1]);
        } else if (method === 'apex') {
            var apex = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
            for (var j = 0; j < apex.length; j++) fn(col + apex[j][0], row + apex[j][1]);
        } else if (method === 'hex') {
            var offsetsEven = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [-1, 1]];
            var offsetsOdd = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1]];
            var offs = row % 2 === 0 ? offsetsEven : offsetsOdd;
            for (var k = 0; k < offs.length; k++) fn(col + offs[k][0], row + offs[k][1]);
        }
    }

    function dfs(cx, cy, g, curPath) {
        curPath.push({ x: cx, y: cy });
        if (g === gc) {
            paths.push(curPath.slice());
            curPath.pop();
            return;
        }
        var want = g + 1;
        eachNeighbor(cx, cy, function (xx, yy) {
            if (!validCell(xx, yy)) return;
            var cell = ref[xx] && ref[xx][yy] !== undefined ? ref[xx][yy] | 0 : 0;
            if (cell !== want) return;
            dfs(xx, yy, want, curPath);
        });
        curPath.pop();
    }

    for (var y = 0; y < vr; y++) {
        var xMax = vc - (bt === 'hex' && y % 2 !== 0 ? 1 : 0);
        for (var x = 0; x < xMax; x++) {
            var v = ref[x] && ref[x][y] !== undefined ? ref[x][y] | 0 : 0;
            if (v !== 1) continue;
            dfs(x, y, 1, []);
        }
    }
    return paths;
};

/**
 * Van-e legalább egy GEN1 … GEN gc szomszéd-lánc a megoldás-mátrixon.
 */
window.CELLAUTO_refHasGenerationPath = function (ref, gc) {
    return window.CELLAUTO_countSpatialGenerationPaths(ref, gc) > 0;
};

/** Szomszédos cellák bejárása ugyanazzal a neighbors móddal, mint a vizsga referenciaút (Gyakorlás szólista szabály). */
window.CELLAUTO_forEachBoardNeighbor = function (col, row, visitor) {
    if (typeof visitor !== 'function') return;
    var neighEl = document.getElementById('neighbors');
    var method = neighEl ? neighEl.value : 'side';
    if (method === 'life' || method === 'life_hex') return;
    var vc = viewCol;
    var vr = viewRow;
    var bt = board;
    function validCell(x, y) {
        if (x < 0 || y < 0 || x >= vc || y >= vr) return false;
        if (bt === 'hex' && y % 2 !== 0 && x === vc - 1) return false;
        return true;
    }
    function eachNeighbor(c, r, fn) {
        if (method === 'side') {
            var side = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (var i = 0; i < side.length; i++) fn(c + side[i][0], r + side[i][1]);
        } else if (method === 'apex') {
            var apex = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
            for (var j = 0; j < apex.length; j++) fn(c + apex[j][0], r + apex[j][1]);
        } else if (method === 'hex') {
            var offsetsEven = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [-1, 1]];
            var offsetsOdd = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1]];
            var offs = r % 2 === 0 ? offsetsEven : offsetsOdd;
            for (var k = 0; k < offs.length; k++) fn(c + offs[k][0], r + offs[k][1]);
        }
    }
    eachNeighbor(col, row, function (nx, ny) {
        if (!validCell(nx, ny)) return;
        visitor(nx, ny);
    });
};

/** Vizsga: minden látható cellában a rács egyezik a referenciával (teljes megoldás). */
window.CELLAUTO_matrixMatchesExamRef = function (ref) {
    if (!ref) return false;
    for (var i = 0; i < viewRow; i++) {
        var xMax = viewCol - ((board === 'hex' && (i % 2 !== 0)) ? 1 : 0);
        for (var j = 0; j < xMax; j++) {
            var exp = ref[j] && ref[j][i] !== undefined ? ref[j][i] | 0 : 0;
            if ((matrix[j][i] | 0) !== exp) return false;
        }
    }
    return true;
};

/** Vizsga: nem üres kiinduló cellák pozíciói (col,row → true), szerkesztés tiltásához */
window.CELLAUTO_getExamFrozenMaskFromMatrix = function () {
    var mask = Object.create(null);
    for (var i = 0; i < viewRow; i++) {
        var xMax = viewCol - ((i % 2 !== 0) && (board === 'hex'));
        for (var j = 0; j < xMax; j++) {
            if ((matrix[j][i] | 0) !== 0) mask[j + ',' + i] = true;
        }
    }
    return mask;
};

/** Vizsga API good_cell: csak kitöltendő (nem kiinduló/fagyott) cellák, ahol a rács == referencia generáció — ≤ kitöltendő cellák száma */
window.CELLAUTO_countCorrectExamFillCells = function (ref, frozenCells) {
    if (!ref) return 0;
    var fc = frozenCells || {};
    var n = 0;
    for (var i = 0; i < viewRow; i++) {
        var xMax = viewCol - ((i % 2 !== 0) && (board === 'hex'));
        for (var j = 0; j < xMax; j++) {
            var exp = ref[j] && ref[j][i] !== undefined ? ref[j][i] | 0 : 0;
            if (exp <= 0) continue;
            if (fc[j + ',' + i]) continue;
            if ((matrix[j][i] | 0) === exp) n++;
        }
    }
    return n;
};

/** Összehasonlítás a referencia mátrixszal — mint Verify (+ / m / x / egyező jelölés) */
window.CELLAUTO_paintMatrixDiffOverlay = function (expectedMatrix) {
    if (!expectedMatrix) return null;
    var stats = { ok: 0, error: 0, plus: 0, minus: 0 };
    reDrawTable();
    for (var i = 0; i < viewRow; i++) {
        var xMax = viewCol - ((i % 2 !== 0) && (board === 'hex'));
        for (var j = 0; j < xMax; j++) {
            var cell = document.getElementById(cellDomId(j, i));
            if (!cell) continue;
            removeVerifyColors(cell);
            var act = matrix[j][i] | 0;
            var exp = (expectedMatrix[j] && expectedMatrix[j][i] !== undefined) ? (expectedMatrix[j][i] | 0) : 0;
            if (act === exp) {
                if (exp !== 0) {
                    cell.classList.add('ok');
                    stats.ok++;
                }
            } else {
                if (act !== 0 && exp === 0) {
                    cell.classList.add('plus');
                    stats.plus++;
                } else if (act === 0 && exp !== 0) {
                    cell.classList.add('minus');
                    stats.minus++;
                } else {
                    cell.classList.add('error');
                    stats.error++;
                }
            }
        }
    }
    return stats;
};

/** Vizsga API: kiértékelés utáni tábla — cellaérték + Verify-jelölés (+/m/×/keret) + opcionális szöveg */
window.CELLAUTO_captureEvaluationFieldBoards = function () {
    var neighEl = document.getElementById('neighbors');
    var cells = [];
    var i;
    var j;
    var xMax;
    for (i = 0; i < viewRow; i++) {
        xMax = viewCol - ((board === 'hex' && (i % 2 !== 0)) ? 1 : 0);
        for (j = 0; j < xMax; j++) {
            var cell = document.getElementById(cellDomId(j, i));
            var v = matrix[j][i] | 0;
            var mark = '';
            if (cell) {
                if (cell.classList.contains('ok')) mark = 'ok';
                else if (cell.classList.contains('error')) mark = 'error';
                else if (cell.classList.contains('plus')) mark = 'plus';
                else if (cell.classList.contains('minus')) mark = 'minus';
            }
            var entry = { x: j, y: i, v: v, mark: mark };
            if (cell) {
                var raw = (cell.innerText || '').replace(/\u00a0/g, ' ').trim();
                if (raw) entry.text = raw;
            }
            cells.push(entry);
        }
    }
    return {
        schemaVersion: 1,
        board: board === 'hex' ? 'hex' : 'square',
        neighbors: neighEl ? neighEl.value : '',
        viewRow: viewRow,
        viewCol: viewCol,
        cells: cells,
    };
};

window.initGameBoard = initGameBoard;
window.ensureMaxGenSelectOptions = ensureMaxGenSelectOptions;
window.reDrawTable = reDrawTable;

/** GEN gombok színe (Funkciók + vizsga panel) — nem exam-mode-ban: ott `if (!api) return` miatt hiányozhat a regisztráció */
(function () {
    var FALLBACK_PALETTE = ['#25ad4f', '#fcf400', '#ee1c25', '#00a4e6', '#b97b55', '#ffc70a'];

    function hexToRgb(hex) {
        if (!hex || typeof hex !== 'string') return null;
        var h = hex.replace(/^#/, '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        if (h.length !== 6) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    function pickLabelTextColor(bgHex) {
        var rgb = hexToRgb(bgHex);
        if (!rgb) return '#fff';
        var y = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        return y > 0.62 ? '#111' : '#fff';
    }

    function applyPaletteToGenLabels(containerEl) {
        if (!containerEl) return;
        var pal =
            Array.isArray(window.CELLAUTO_lastPaletteHex) && window.CELLAUTO_lastPaletteHex.length >= 6
                ? window.CELLAUTO_lastPaletteHex
                : FALLBACK_PALETTE;
        containerEl.querySelectorAll('label.exam-gen-pill[data-gen]').forEach(function (lab) {
            var g = parseInt(lab.getAttribute('data-gen') || '0', 10);
            if (!g) return;
            var slot = (g - 1) % 6;
            var bg = pal[slot] || FALLBACK_PALETTE[slot];
            var fg = pickLabelTextColor(bg);
            lab.style.setProperty('background-color', bg, 'important');
            lab.style.setProperty('color', fg, 'important');
            lab.style.setProperty(
                'text-shadow',
                fg === '#111' ? 'none' : '0 1px 0 rgba(255,255,255,0.35)',
                'important'
            );
        });
    }

    function clearSidebarDrawGenPalette(formEl, sectionEl) {
        if (formEl) {
            formEl.querySelectorAll('label.exam-gen-pill[data-gen]').forEach(function (lab) {
                lab.style.removeProperty('background-color');
                lab.style.removeProperty('color');
                lab.style.removeProperty('text-shadow');
            });
        }
        if (sectionEl) sectionEl.classList.remove('verify-section-draw--palette');
    }

    /** Test módban (Draw gen. látható): mindig generációs szín — nem csak Word módban, hogy egyezzen a vizsgapanel GEN sorával */
    function refreshMainSidebarDrawGenPills() {
        var form = document.getElementById('drawLevel');
        var sec = document.getElementById('verifySectionDraw');
        if (!form || !sec) return;
        if (!sec.classList.contains('hidden')) {
            applyPaletteToGenLabels(form);
            sec.classList.add('verify-section-draw--palette');
        } else {
            clearSidebarDrawGenPalette(form, sec);
        }
    }

    window.CELLAUTO_refreshExamGenPills = function () {
        applyPaletteToGenLabels(document.getElementById('examDrawLevelRadios'));
        refreshMainSidebarDrawGenPills();
    };
})();