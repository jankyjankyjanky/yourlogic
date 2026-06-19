// ==========================================
// 1. インラインWeb Worker (盤面自動生成エンジン)
// ==========================================
const workerCode = `
self.onmessage = function(e) {
    const { size, difficulty } = e.data;
    
    // 矩形分割法による盤面生成
    let rectangles = [{ x1: 0, y1: 0, x2: size - 1, y2: size - 1 }];
    let minArea = 2;
    let maxArea = 12;
    
    // 難易度に応じた矩形サイズ調整
    if (difficulty === 'easy') { minArea = 4; maxArea = 16; }
    else if (difficulty === 'insane') { minArea = 2; maxArea = 8; }

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < rectangles.length; i++) {
            const r = rectangles[i];
            const w = r.x2 - r.x1 + 1;
            const h = r.y2 - r.y1 + 1;
            const area = w * h;

            if (area > maxArea || (area >= minArea * 2 && Math.random() < 0.75)) {
                // 分割方向の決定 (長い方を優先して分割)
                const splitVertically = w > h ? true : (w === h ? Math.random() < 0.5 : false);
                
                if (splitVertically && w >= 2) {
                    const splitX = r.x1 + Math.floor(Math.random() * (w - 1));
                    rectangles.splice(i, 1, 
                        { x1: r.x1, y1: r.y1, x2: splitX, y2: r.y2 },
                        { x1: splitX + 1, y1: r.y1, x2: r.x2, y2: r.y2 }
                    );
                    changed = true;
                    break;
                } else if (!splitVertically && h >= 2) {
                    const splitY = r.y1 + Math.floor(Math.random() * (h - 1));
                    rectangles.splice(i, 1, 
                        { x1: r.x1, y1: r.y1, x2: r.x2, y2: splitY },
                        { x1: r.x1, y1: splitY + 1, x2: r.x2, y2: r.y2 }
                    );
                    changed = true;
                    break;
                }
            }
        }
    }

    // 問題データ(数字配置)と模範解答の作成
    const boardNumbers = Array(size).fill().map(() => Array(size).fill(0));
    const solution = rectangles.map((rect, index) => {
        const w = rect.x2 - rect.x1 + 1;
        const h = rect.y2 - r.y1 + 1;
        const area = w * h;
        
        // 矩形内のランダムな位置に数字を配置
        const numX = rect.x1 + Math.floor(Math.random() * w);
        const numY = rect.y1 + Math.floor(Math.random() * h);
        boardNumbers[numY][numX] = area;

        return { ...rect, id: index, val: area, numX, numY };
    });

    self.postMessage({ boardNumbers, solution });
};
`;

// ==========================================
// 2. グローバル状態管理と初期化
// ==========================================
const params = new URLSearchParams(window.location.search);
const BOARD_SIZE = parseInt(params.get('size')) || 10;
const DIFFICULTY = params.get('diff') || 'standard';

let currentMode = 'draw'; // 'draw' (本番), 'draft' (下書き), 'erase' (消しゴム)
let isDragging = false;
let dragStart = null;
let dragCurrent = null;

let cells = [];             // 2次元DOM配列 [y][x]
let puzzleData = [];        // 問題の数字配置 [y][x]
let solutionRects = [];     // 模範解答の矩形リスト
let userRectangles = [];    // ユーザーが確定させた矩形リスト
let draftCells = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false)); // 下書き状態

// タイマー用
let startTime;
let timerInterval;

const boardEl = document.getElementById('board');
const hintArea = document.getElementById('hint-text-area');

function init() {
    // メタ情報とローディングの表示
    document.getElementById('game-meta-text').textContent = `サイズ: ${BOARD_SIZE}×${BOARD_SIZE} / 難易度: ${DIFFICULTY.toUpperCase()}`;
    showSystemMessage("盤面を生成中...", "#3182ce");

    // 盤面グリッド幅の動的決定
    boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;

    // Web Workerの起動
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.postMessage({ size: BOARD_SIZE, difficulty: DIFFICULTY });
    
    worker.onmessage = function(e) {
        const { boardNumbers, solution } = e.data;
        puzzleData = boardNumbers;
        solutionRects = solution;
        
        hideSystemMessage();
        buildBoardDOM();
        startTimer();
        setupControls();
    };
}

// ==========================================
// 3. DOM構築とイベントバインド
// ==========================================
function buildBoardDOM() {
    boardEl.innerHTML = "";
    // セルサイズに応じたフォント調整
    const fontSize = Math.max(10, Math.min(24, (600 / BOARD_SIZE) * 0.4));

    for (let y = 0; y < BOARD_SIZE; y++) {
        cells[y] = [];
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.style.fontSize = `${fontSize}px`;

            if (puzzleData[y][x] > 0) {
                cell.textContent = puzzleData[y][x];
                cell.classList.add('initial');
            }

            // マウスイベント
            cell.addEventListener('mousedown', handlePointerDown);
            cell.addEventListener('mouseenter', handlePointerEnter);
            
            // スマホタッチイベント
            cell.addEventListener('touchstart', handleTouchStart, { passive: false });
            cell.addEventListener('touchmove', handleTouchMove, { passive: false });

            boardEl.appendChild(cell);
            cells[y][x] = cell;
        }
    }

    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);
}

// ==========================================
// 4. マウス・タッチ操作ハンドラ
// ==========================================
function getCoords(element) {
    return { x: parseInt(element.dataset.x), y: parseInt(element.dataset.y) };
}

function handlePointerDown(e) {
    if (e.button !== 0 && e.type !== 'touchstart') return;
    e.preventDefault();

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
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && target.classList.contains('cell')) {
        handlePointerDown({ target, preventDefault: () => {}, type: 'touchstart' });
    }
}

function handleTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
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
        // 消しゴム: 範囲内の下書きと、範囲と交差する本番枠線を消去
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) draftCells[y][x] = false;
        }
        userRectangles = userRectangles.filter(rect => 
            !(x1 <= rect.x2 && x2 >= rect.x1 && y1 <= rect.y2 && y2 >= rect.y1)
        );
    } else if (currentMode === 'draft') {
        // 下書き: 選択矩形内をすべて反転または塗りつぶし
        const fillValue = !draftCells[y1][x1];
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) draftCells[y][x] = fillValue;
        }
    } else if (currentMode === 'draw') {
        // 本番枠線: 新しい長方形として確定
        // 重複する古い本番枠線は自動カットして上書き
        userRectangles = userRectangles.filter(rect => 
            !(x1 <= rect.x2 && x2 >= rect.x1 && y1 <= rect.y2 && y2 >= rect.y1)
        );
        userRectangles.push({ x1, y1, x2, y2 });
    }

    dragStart = null;
    dragCurrent = null;
    renderBoard();
}

// ==========================================
// 5. 描画アップデート
// ==========================================
function clearDynamicStyles() {
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cl = cells[y][x].classList;
            cl.remove('b-top', 'b-right', 'b-bottom', 'b-left', 'draft-bg', 'highlight-selected');
            cl.remove('highlight-error', 'highlight-hint-target', 'highlight-hint-area');
        }
    }
}

function renderBoard() {
    clearDynamicStyles();

    // 1. 下書きの描画
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (draftCells[y][x]) cells[y][x].classList.add('draft-bg');
        }
    }

    // 2. 本番枠線の描画
    userRectangles.forEach(rect => {
        for (let y = rect.y1; y <= rect.y2; y++) {
            for (let x = rect.x1; x <= rect.x2; x++) {
                if (y === rect.y1) cells[y][x].classList.add('b-top');
                if (y === rect.y2) cells[y][x].classList.add('b-bottom');
                if (x === rect.x1) cells[y][x].classList.add('b-left');
                if (x === rect.x2) cells[y][x].classList.add('b-right');
            }
        }
    });
}

function renderPreview() {
    renderBoard();
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
// 6. コントロールUI & タイマー
// ==========================================
function setupControls() {
    // 入力モードの切り替え
    const modes = { 'mode-draw-btn': 'draw', 'mode-draft-btn': 'draft', 'mode-erase-btn': 'erase' };
    for (const [id, mode] of Object.entries(modes)) {
        document.getElementById(id).addEventListener('click', (e) => {
            currentMode = mode;
            document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        });
    }

    // Mキーショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'm') {
            const nextMode = currentMode === 'draw' ? 'draft' : 'draw';
            document.getElementById(`mode-${nextMode}-btn`).click();
        }
    });

    // 下部アクションボタン
    document.getElementById('check-btn').addEventListener('click', executeCheck);
    document.getElementById('hint-btn').addEventListener('click', executeThreeStepHint);
    document.getElementById('giveup-btn').addEventListener('click', executeGiveUp);
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const diff = Date.now() - startTime;
        const mins = String(Math.floor(diff / 60000)).padStart(2, '0');
        const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        document.getElementById('timer').textContent = `${mins}:${secs}`;
    }, 1000);
}

function showSystemMessage(text, color) {
    hintArea.innerHTML = text;
    hintArea.style.color = color;
    hintArea.style.backgroundColor = "#f0f0f0";
    hintArea.style.display = 'block';
}

function hideSystemMessage() {
    hintArea.style.display = 'none';
}

// ==========================================
// 7. 答え合わせ & 3段階ヒントアルゴリズム
// ==========================================

// ① ルール違反の精密スキャン
function scanRuleViolations() {
    let errorCells = [];
    let coveredGrid = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));

    // 重複チェック用マッピング
    userRectangles.forEach((rect, idx) => {
        for (let y = rect.y1; y <= rect.y2; y++) {
            for (let x = rect.x1; x <= rect.x2; x++) {
                coveredGrid[y][x]++;
                if (coveredGrid[y][x] > 1) {
                    errorCells.push({ x, y }); // 重複エラー
                }
            }
        }
    });

    // 各矩形の内部ロジック検証
    userRectangles.forEach(rect => {
        let numbersInside = [];
        const area = (rect.x2 - rect.x1 + 1) * (rect.y2 - rect.y1 + 1);

        for (let y = rect.y1; y <= rect.y2; y++) {
            for (let x = rect.x1; x <= rect.x2; x++) {
                if (puzzleData[y][x] > 0) {
                    numbersInside.push({ x, y, val: puzzleData[y][x] });
                }
            }
        }

        // 違反条件: 数字が1つではない、または数字と面積が一致しない
        if (numbersInside.length !== 1 || numbersInside[0].val !== area) {
            for (let y = rect.y1; y <= rect.y2; y++) {
                for (let x = rect.x1; x <= rect.x2; x++) {
                    errorCells.push({ x, y });
                }
            }
        }
    });

    return errorCells;
}

function executeCheck() {
    renderBoard();
    const errors = scanRuleViolations();
    
    if (errors.length > 0) {
        showSystemMessage("【答え合わせ】ルール違反の箇所があります（赤くハイライト）。", "#cc0000");
        highlightCoords(errors, 'highlight-error');
        return;
    }

    // 全マスがカバーされているか検証
    let totalCovered = 0;
    userRectangles.forEach(r => totalCovered += (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1));
    
    if (totalCovered < BOARD_SIZE * BOARD_SIZE) {
        showSystemMessage("【答え合わせ】ミスはありませんが、まだ囲まれていない空きマスがあります。", "#1a365d");
        return;
    }

    // クリア達成
    clearInterval(timerInterval);
    showSystemMessage(`🎉 クリア！おめでとうございます！ タイム: ${document.getElementById('timer').textContent}`, "#28a745");
}

function executeThreeStepHint() {
    renderBoard();
    
    // 【第1段階】ルール違反のチェック
    const errors = scanRuleViolations();
    if (errors.length > 0) {
        showSystemMessage("【ヒント: ルール違反】数字の重複や面積が違っている枠があります。赤枠を直しましょう。", "#cc0000");
        highlightCoords(errors, 'highlight-error');
        return;
    }

    // 【第2段階】模範解答との不一致チェック
    let mistakeCells = [];
    userRectangles.forEach(uRect => {
        // ユーザーの矩形が模範解答のどれとも完全一致しない場合
        const isCorrect = solutionRects.some(sRect => 
            uRect.x1 === sRect.x1 && uRect.y1 === sRect.y1 && 
            uRect.x2 === sRect.x2 && uRect.y2 === sRect.y2
        );
        if (!isCorrect) {
            for (let y = uRect.y1; y <= uRect.y2; y++) {
                for (let x = uRect.x1; x <= uRect.x2; x++) mistakeCells.push({ x, y });
            }
        }
    });

    if (mistakeCells.length > 0) {
        showSystemMessage("【ヒント: 誤り配置】ルールは満たしていますが、正しい正解枠とは異なる線を引いています。", "#cc0000");
        highlightCoords(mistakeCells, 'highlight-error');
        return;
    }

    // 【第3段階】論理推導アシスト
    // まだユーザーが囲んでいない数字を1つ探し、その正解の姿をヒントとして可視化する
    let nextTarget = null;
    for (const sRect of solutionRects) {
        const alreadyDone = userRectangles.some(uRect => 
            uRect.x1 === sRect.x1 && uRect.y1 === sRect.y1 && 
            uRect.x2 === sRect.x2 && uRect.y2 === sRect.y2
        );
        if (!alreadyDone) {
            nextTarget = sRect;
            break;
        }
    }

    if (nextTarget) {
        showSystemMessage(`【ロジック提案】マスの数字 <span style="color:#dd6b20">${nextTarget.val}</span> に注目。この数字が入る四角形の正解エリアを薄くハイライトしました。`, "#2d3748");
        
        // 数字のある位置をターゲットハイライト
        cells[nextTarget.numY][nextTarget.numX].classList.add('highlight-hint-target');
        
        // 正解の矩形範囲をエリアハイライト
        let areaCoords = [];
        for (let y = nextTarget.y1; y <= nextTarget.y2; y++) {
            for (let x = nextTarget.x1; x <= nextTarget.x2; x++) areaCoords.push({ x, y });
        }
        highlightCoords(areaCoords, 'highlight-hint-area');
    } else {
        showSystemMessage("現在の盤面は完璧です！そのまま残りの空きマスを埋めましょう。", "#2b6cb0");
    }
}

function executeGiveUp() {
    clearInterval(timerInterval);
    showSystemMessage("諦めモード：正解の枠線をすべて描画しました。", "#718096");
    
    // ユーザー矩形を全消去して正解に置き換え
    userRectangles = solutionRects.map(r => ({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 }));
    draftCells = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false));
    renderBoard();
}

function highlightCoords(coordArray, className) {
    coordArray.forEach(c => {
        if (cells[c.y] && cells[c.y][c.x]) cells[c.y][c.x].classList.add(className);
    });
}

// 起動実行
init();
