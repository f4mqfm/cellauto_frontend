// 2024 Borsos László F4MQFM (lborsos@gmail.com)
const viewRow = 31, viewCol = 31;
const maxRow = 100, maxCol = 100;
const elements = 946;
const maxCycle = 100;
const currentCycle = 10;
var matrix = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));
var matrixVerify = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));
var matrixVerifyChecked = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));

/** Ne rögzítsük a betöltés pillanatában: headben/késő BB-ben futó script esetén még nincs #boardDiv → null → üres Max gen. */
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


function createHexTable(create = true) {
    if (create) {
        let div1 = document.createElement('div');
        div1.classList.add('hexagon-wrapper');
        let div2 = document.createElement('div');
        div2.classList.add('hexagon-wrapper__hexagon-container');
        div1.appendChild(div2);
        var xx = 0, yy = 0;
        for (let i = 0; i < elements; i++) {
            var divOut = document.createElement('div');
            divOut.classList.add("hexagon__outer");
            var divIn = document.createElement('div');
            divIn.innerHTML = "&nbsp;";
            divIn.classList.add("hexagon__inner");
            divIn.id = 'x' + String(xx).padStart(2, '0') + String(yy).padStart(2, '0');
            divOut.appendChild(divIn);
            div2.appendChild(divOut);
            xx++;
            if (xx == 31 || ((yy % 2 != 0) && (xx == 30))) {
                xx = 0;
                yy++;
            }
        }
        var bd = boardDivEl();
        if (!bd) return;
        bd.appendChild(div1);
    } else {
        var bdClear = boardDivEl();
        if (bdClear) bdClear.innerHTML = '';
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
                td.id = 'x' + String(j).padStart(2, '0') + String(i).padStart(2, '0');
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        bd.appendChild(table);
    } else {
        var bd2 = boardDivEl();
        if (bd2) bd2.innerHTML = '';
    }
}

function addClickListenersSquare() {
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol; j++) {
            let cell = document.getElementById('x' + String(j).padStart(2, '0') + String(i).padStart(2, '0'));
            cell.addEventListener('click', function () { toggleCell(j, i); });
        }
    }
}

function addClickListenersHex() {
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol; j++) {
            if (!(i % 2 != 0 && j == viewCol - 1)) {
                let cell = document.getElementById('x' + String(j).padStart(2, '0') + String(i).padStart(2, '0'));
                cell.addEventListener('click', function () { toggleCell(j, i); });
            }
        }
    }
}

function toggleCell(col, row) {

    const clickMode = document.getElementById('word_mode').value;
    if (clickMode === 'select') {
        // let drawLevel = document.getElementById('drawLevel').value;
        let drawLevel = document.querySelector('input[name="drawLevel"]:checked').value;
        let mode = document.getElementById('mode').value;
        let cell = document.getElementById('x' + String(col).padStart(2, '0') + String(row).padStart(2, '0'));
        if (matrix[col][row] === 0) {
            matrix[col][row] = mode == 'play' ? 1 : drawLevel;
            // cell.classList.add('colorStart');
        } else {
            matrix[col][row] = 0;
            // cell.classList.remove('colorStart');
        }
        reDrawTable();
    } else {
        if (matrix[col][row] > 0 && matrix[col][row] <= matrixWord.length) {

            const firstSelect = document.getElementById(`lev${matrix[col][row]}`);
            const selectedIndex = firstSelect.selectedIndex;
            const selectedOption = firstSelect.options[selectedIndex];
            const selectedValue = selectedOption.value;
            //            const rowIndex = selectedOption.dataset.rowIndex;
            let cell = document.getElementById('x' + String(col).padStart(2, '0') + String(row).padStart(2, '0'));
            if (selectedValue != '---') {
                //                cell.innerHTML=selectedValue;
                cell.innerHTML = insertLineBreaks(selectedValue);
            }
        }
        console.log(matrixWord);
        // word mode
    }
}

function reDrawTable() {
    let cell = '';
    let cellValue = 0;
    for (let i = 0; i < viewRow; i++) {
        for (let j = 0; j < viewCol - ((i % 2 != 0) && (board == 'hex')); j++) {
            cell = document.getElementById('x' + String(j).padStart(2, '0') + String(i).padStart(2, '0'));
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
    for (let i = 0; i < maxRow; i++) {
        for (let j = 0; j < maxCol; j++) {
            if (matrix[i][j] == 1) {
                matrixVerify[i][j] = 1;
            } else {
                matrixVerify[i][j] = 0;
                matrixVerifyChecked[i][j] = 0;
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
    cell = document.getElementById('x' + String(x).padStart(2, '0') + String(y).padStart(2, '0'));
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
        for (let j = 0; j < viewCol; j++) {
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

function checkIfNewChildIsBorn(col, row, level, method, mat) {
    let neighborsPreviousLevel = 0;
    let neighborsPrePreviousLevel = 0;
    switch (method) {
        case 'side': {
            if (col > 0) {
                const cell = mat[col - 1][row];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (col < viewCol) {
                const cell = mat[col + 1][row];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (row > 0) {
                const cell = mat[col][row - 1];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (row < viewRow) {
                const cell = mat[col][row + 1];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
        };
            break;
        case 'apex': {
            if (!(col == 0 || row == 0)) {
                const cell = mat[col - 1][row - 1];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (!(col == viewCol || row == viewRow)) {
                const cell = mat[col + 1][row + 1];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (!(col == 0 || row == viewRow)) {
                const cell = mat[col - 1][row + 1];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (!(col == viewCol || row == 0)) {
                const cell = mat[col + 1][row - 1];
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            break;
        }
        case 'hex': {
            let cell = matrixValue(mat[col][row - 1]);
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            cell = matrixValue(mat[col + 1][row]);
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            cell = matrixValue(mat[col][row + 1]);
            neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
            neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            if (col > 0) {
                cell = matrixValue(mat[col - 1][row]);
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
            }
            if (row % 2 == 0) {
                if (col > 0) {
                    cell = matrixValue(mat[col - 1][row - 1]);
                    neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                    neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
                }
                if (col > 0) {
                    cell = matrixValue(mat[col - 1][row + 1]);
                    neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                    neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
                }
            } else {
                cell = matrixValue(mat[col + 1][row + 1]);
                neighborsPreviousLevel += cell == level - 1 ? 1 : 0;
                neighborsPrePreviousLevel += cell < level - 1 && cell != 0 ? 1 : 0;
                cell = matrixValue(mat[col + 1][row - 1]);
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

function stepGameOfLife(isHex) {
    const next = Array.from({ length: maxRow }, () => Array.from({ length: maxCol }, () => 0));

    for (let y = 0; y < viewRow; y++) {
        const xMax = viewCol - ((y % 2 !== 0) && (board === 'hex'));
        for (let x = 0; x < xMax; x++) {
            const n = isHex ? countNeighborsHex(x, y, matrix) : countNeighborsSquare(x, y, matrix);
            const alive = (matrix[x][y] === 1);

            // Classic GoL szabály: B3/S23 (square)
            // Hexnél nincs “klasszikus”; itt is B3/S23-at használunk, mert egyszerű.
            if (alive) next[x][y] = (n === 2 || n === 3) ? 1 : 0;
            else next[x][y] = (n === 3) ? 1 : 0;
        }
    }

    // átmásolás vissza a matrixba
    for (let y = 0; y < viewRow; y++) {
        for (let x = 0; x < viewCol; x++) matrix[x][y] = next[x][y];
    }
}

async function goGenerate() {
    method = document.getElementById("neighbors").value;
    maxLevel = Number(document.getElementById("level").value);
    delay = Number(document.getElementById("delay").value);

    if (method === 'life' || method === 'life_hex') {
        // mindig csak 0/1 legyen
        for (let y = 0; y < viewRow; y++) {
            for (let x = 0; x < viewCol; x++) matrix[x][y] = (matrix[x][y] ? 1 : 0);
        }

        for (let lev = 1; lev <= maxLevel; lev++) {
            stepGameOfLife(method === 'life_hex');
            reDrawTable();
            await sleep(delay * 1000);
        }
        return;
    }

    // régi mód
    genMatrix();
    renderTable();
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

                cell = document.getElementById('x' + String(j).padStart(2, '0') + String(i).padStart(2, '0'));
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
//             cell = document.getElementById('x' + String(j).padStart(2, '0') + String(i).padStart(2, '0'));
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

function cellautoWireUiAndInit() {
    var neighborsEl = document.getElementById('neighbors');
    var modeEl = document.getElementById('mode');
    if (!neighborsEl || !modeEl) return;

    neighborsEl.addEventListener('change', function () {
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
        if (this.value === 'life') {
            resetMartixValue();
            seedLifeDemo();
        }
    });

    modeEl.addEventListener('change', function () {
        var curMode = this.value;
        if (modePT == 'play' && curMode == 'test') {
            modePT = curMode;
            document.getElementById('verifySection').classList.remove('hidden');
            document.getElementById('check').classList.add('hidden');
            document.getElementById('btnVerify').classList.remove('hidden');
            document.getElementById('level1').checked = true;
            document.getElementById('level').value = maxLevelVerify;
        }
        if (modePT == 'test' && curMode == 'play') {
            modePT = curMode;
            document.getElementById('verifySection').classList.add('hidden');
            document.getElementById('btnVerify').classList.add('hidden');
            document.getElementById('check').classList.remove('hidden');
            document.getElementById('level').value = maxLevel;
        }
    });

    /* Max gen. először — ha createSquareTable elszállna, így is legyen lista (1…maxCycle) */
    var select = document.getElementById('level');
    if (select) {
        select.innerHTML = '';
        for (let i = 1; i <= maxCycle; i++) {
            var option = document.createElement('option');
            option.value = String(i);
            option.textContent = String(i);
            if (i === currentCycle) option.selected = true;
            select.appendChild(option);
        }
    }
    createSquareTable();
    addClickListenersSquare();
    neighborsEl.value = 'side';
    modeEl.value = 'play';
    document.getElementById('verifySection').classList.add('hidden');
    document.getElementById('btnVerify').classList.add('hidden');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cellautoWireUiAndInit);
} else {
    cellautoWireUiAndInit();
}

// A scriptet elhelyezheted a HTML oldalad <head> részében vagy a <body> végén

document.addEventListener('DOMContentLoaded', function () {
    var tabla = document.getElementById('boardDiv'); // Azonosítjuk a formot
    var form = document.getElementById('drawLevel'); // Azonosítjuk a formot
    if (!tabla || !form) return;

    tabla.addEventListener('contextmenu', function (event) {
        event.preventDefault(); // Megakadályozza a kontextusmenü megjelenését

        var radioButtons = form.querySelectorAll('input[type="radio"]');
        var selectedButton = form.querySelector('input[type="radio"]:checked');
        var selectedIndex = Array.prototype.indexOf.call(radioButtons, selectedButton);

        var nextIndex = (selectedIndex + 1) % radioButtons.length; // Következő index, vagy vissza az elsőre
        radioButtons[nextIndex].checked = true; // Beállítjuk a következő rádiógombot
    });
});


function help() {
    alert("Cellular automation\n\n2024 Borsos László (F4MQFM)\nlborsos@gmail.com\n\nClick on the field to set the initial cells.")
}


function showWinMessage(win = true) {
    let message = win ? 'winMessage' : 'loserMessage';
    var winMessage = document.getElementById(message);
    winMessage.style.display = "block"; // Megjelenítjük a szöveget

    setTimeout(function () {
        winMessage.style.display = "none"; // Eltüntetjük a szöveget 3 másodperc múlva
    }, 3000); // 3000 millisecond = 3 másodperc
}

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