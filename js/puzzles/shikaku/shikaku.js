// js/puzzles/shikaku/shikaku.js

// ==========================================
// 1. 初期設定と状態管理
// ==========================================
const params = new URLSearchParams(window.location.search);
const BOARD_SIZE = parseInt(params.get('size')) || 10;
const DIFFICULTY = params.get('diff') || 'standard';

// 状態変数
let currentMode = 'draw'; // 'draw' (本番), 'draft' (下書き), 'erase' (消しゴム)
let isDragging = false;
let dragStart = null;   // {x, y}
let dragCurrent = null; // {x, y}

let cells = []; // 2次元配列 [y][x] でDOM要素を管理
let userRectangles = []; // ユーザーが描画した矩形 {x1, y1, x2, y2, type: 'draw'|'draft'}
let puzzleData = [];     // 問題データ（数字の配置）※次フェーズでジェネレータと連携

const boardEl = document.getElementById('board');

// ==========================================
// 2. 初期化処理
// ==========================================
function init() {
    // メタ情報の表示
    document.getElementById('game-meta-text').textContent = `サイズ: ${BOARD_SIZE}×${BOARD_SIZE} / 難易度: ${DIFFICULTY.toUpperCase()}`;
    
    // 盤面グリッドの設定
    boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
    
    // セルの生成
    for (let y = 0; y < BOARD_SIZE; y++) {
        cells[y] = [];
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;

            // PC・スマホ両対応のイベントリスナー
            cell.addEventListener('mousedown', handlePointerDown);
            cell.addEventListener('mouseenter', handlePointerEnter);
            cell.addEventListener('touchstart', handleTouchStart, { passive: false });
            cell.addEventListener('touchmove', handleTouchMove, { passive: false });

            boardEl.appendChild(cell);
            cells[y][x] = cell;
        }
    }

    // 画面全体でのドロップ判定
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);

    // ツールバーの初期化
    setupControls();
}

// ==========================================
// 3. 入力モードの制御
// ==========================================
function setupControls() {
    const modes = {
        'mode-draw-btn': 'draw',
        'mode-draft-btn': 'draft',
        'mode-erase-btn': 'erase'
    };

    for (const [id, mode] of Object.entries(modes)) {
        document.getElementById(id).addEventListener('click', (e) => {
            setMode(mode);
            document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        });
    }

    // Mキーでの切り替え（本番 ⇔ 下書き）
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'm') {
            const nextMode = currentMode === 'draw' ? 'draft' : 'draw';
            document.getElementById(`mode-${nextMode}-btn`).click();
        }
    });

    // 3段階ヒントボタンのバインド
    document.getElementById('hint-btn').addEventListener('click', executeThreeStepHint);
}

function setMode(mode) {
    currentMode = mode;
}

// ==========================================
// 4. ドラッグ＆描画ロジック
// ==========================================
function getCoords(element) {
    return {
        x: parseInt(element.dataset.x),
        y: parseInt(element.dataset.y)
    };
}

function handlePointerDown(e) {
    e.preventDefault(); // テキスト選択防止
    if (e.button !== 0 && e.type !== 'touchstart') return; // 左クリックのみ

    isDragging = true;
    dragStart = getCoords(e.target);
    dragCurrent = { ...dragStart };
    renderPreview();
}

function handlePointerEnter(e) {
    if (!isDragging) return;
    dragCurrent = getCoords(e.target);
    renderPreview();
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('cell')) {
        handlePointerDown({ target, preventDefault: () => {} });
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (!isDragging) return;
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('cell')) {
        const coords = getCoords(target);
        if (coords.x !== dragCurrent.x || coords.y !== dragCurrent.y) {
            dragCurrent = coords;
            renderPreview();
        }
    }
}

function handlePointerUp() {
    if (!isDragging) return;
    isDragging = false;

    const x1 = Math.min(dragStart.x, dragCurrent.x);
    const x2 = Math.max(dragStart.x, dragCurrent.x);
    const y1 = Math.min(dragStart.y, dragCurrent.y);
    const y2 = Math.max(dragStart.y, dragCurrent.y);

    if (currentMode === 'erase') {
        // 消しゴムモード: 選択範囲と重なる矩形を削除
        userRectangles = userRectangles.filter(rect => 
            !(x1 <= rect.x2 && x2 >= rect.x1 && y1 <= rect.y2 && y2 >= rect.y1)
        );
    } else {
        // 描画モード/下書きモード: 新しい矩形を追加
        // ※重なる同タイプの矩形を上書き・削除する処理をここに入れるとUXが向上します
        userRectangles.push({ x1, y1, x2, y2, type: currentMode });
    }

    dragStart = null;
    dragCurrent = null;
    renderBoard();
}

// ==========================================
// 5. 画面の描画処理
// ==========================================
function clearBoardStyles() {
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cl = cells[y][x].classList;
            cl.remove('b-top', 'b-right', 'b-bottom', 'b-left', 'draft-bg', 'highlight-selected');
            // ヒントのハイライトもリセット
            cl.remove('highlight-error', 'highlight-hint-target', 'highlight-hint-area');
        }
    }
}

function renderBoard() {
    clearBoardStyles();

    // 確定済み矩形の描画
    userRectangles.forEach(rect => {
        for (let y = rect.y1; y <= rect.y2; y++) {
            for (let x = rect.x1; x <= rect.x2; x++) {
                if (rect.type === 'draft') {
                    cells[y][x].classList.add('draft-bg');
                } else if (rect.type === 'draw') {
                    if (y === rect.y1) cells[y][x].classList.add('b-top');
                    if (y === rect.y2) cells[y][x].classList.add('b-bottom');
                    if (x === rect.x1) cells[y][x].classList.add('b-left');
                    if (x === rect.x2) cells[y][x].classList.add('b-right');
                }
            }
        }
    });
}

function renderPreview() {
    renderBoard(); // 現在の確定状態をベースにする
    if (!dragStart || !dragCurrent) return;

    const x1 = Math.min(dragStart.x, dragCurrent.x);
    const x2 = Math.max(dragStart.x, dragCurrent.x);
    const y1 = Math.min(dragStart.y, dragCurrent.y);
    const y2 = Math.max(dragStart.y, dragCurrent.y);

    for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
            cells[y][x].classList.add('highlight-selected');
        }
    }
}

// ==========================================
// 6. 3段階ヒントシステム（枠組み）
// ==========================================
function executeThreeStepHint() {
    const hintArea = document.getElementById('hint-text-area');
    hintArea.style.display = 'block';
    
    // 再描画してハイライトを初期化
    renderBoard();

    // ① ルール違反チェック
    const violations = checkRuleViolations();
    if (violations.hasError) {
        hintArea.textContent = "【ルール違反】面積の不一致や、数字の重複・不足があります。赤色の枠を修正してください。";
        hintArea.style.color = "#cc0000";
        highlightCells(violations.errorCells, 'highlight-error');
        return;
    }

    // ② 模範解答との不一致チェック
    const mistakes = checkMistakes();
    if (mistakes.hasMistake) {
        hintArea.textContent = "【誤り】ルール違反はありませんが、正解と異なる枠組みがあります。赤色の枠を修正してください。";
        hintArea.style.color = "#cc0000";
        highlightCells(mistakes.mistakeCells, 'highlight-error');
        return;
    }

    // ③ パズルロジック的な推導ヒント
    const logicHint = generateLogicHint();
    if (logicHint.found) {
        hintArea.innerHTML = `【ヒント】<span style="color:#dd6b20">${logicHint.targetNumber}</span> に注目。${logicHint.message}`;
        hintArea.style.color = "#333";
        highlightCells(logicHint.targetCells, 'highlight-hint-target');
        highlightCells(logicHint.areaCells, 'highlight-hint-area');
    } else {
        hintArea.textContent = "素晴らしい！現在の盤面は完璧に正解に向かっています。";
        hintArea.style.color = "#2b6cb0";
    }
}

function highlightCells(coordArray, className) {
    coordArray.forEach(coord => {
        if (cells[coord.y] && cells[coord.y][coord.x]) {
            cells[coord.y][coord.x].classList.add(className);
        }
    });
}

// --- 以下、次フェーズで実装するアルゴリズムのスタブ ---
function checkRuleViolations() {
    // TODO: 描画された矩形の面積チェック、数字の包含チェック
    return { hasError: false, errorCells: [] }; 
}

function checkMistakes() {
    // TODO: ユーザーの入力と模範解答の差異をチェック
    return { hasMistake: false, mistakeCells: [] };
}

function generateLogicHint() {
    // TODO: 現在の盤面から、次に確定できるマスとその理由をアルゴリズムで探索
    return { found: false, targetNumber: null, message: "", targetCells: [], areaCells: [] };
}

// 起動
init();
