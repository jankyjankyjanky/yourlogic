/**
 * ShikakuCore - ゲーム進行・UI同期（心臓部）
 */
window.ShikakuCore = {
    grid: [],
    solution: [],
    currentRects: [],
    width: 0,
    height: 0,
    difficulty: 'medium',
    
    // タイマー関連
    timerInterval: null,
    secondsElapsed: 0,

    // ドラッグ操作の状態管理
    isDragging: false,
    dragStartCell: null,

    init() {
        this.gridContainer = document.getElementById('grid-container');
        this.cellsGrid = document.getElementById('cells-grid');
        this.rectsLayer = document.getElementById('rects-layer');
        this.previewRect = document.getElementById('preview-rect');
        this.timerDisplay = document.getElementById('timer');
        this.hintText = document.getElementById('hint-text');

        this.setupMouseEvents();
        this.loadProgress(); // 自動保存データの復旧を試みる
    },

    startNewGame(difficulty) {
        this.difficulty = difficulty;
        this.secondsElapsed = 0;
        this.currentRects = [];
        
        // Generator から良質な問題を生成
        const puzzle = ShikakuGenerator.generate(difficulty);
        this.grid = puzzle.grid;
        this.width = puzzle.width;
        this.height = puzzle.height;

        // 解答をあらかじめSolverから得ておく
        const res = ShikakuSolver.solve(this.grid);
        this.solution = res.solution;

        this.renderGrid();
        this.startTimer();
        this.saveCurrentProgress(); // 初期盤面の自動セーブ
        this.hintText.innerText = "新しいゲームが始まりました。四角を切り分けてください。";
    },

    renderGrid() {
        this.cellsGrid.innerHTML = '';
        this.rectsLayer.innerHTML = '';
        
        this.gridContainer.style.width = `${this.width * 50}px`;
        this.gridContainer.style.height = `${this.height * 50}px`;

        for (let r = 0; r < this.height; r++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'grid-row';
            for (let c = 0; c < this.width; c++) {
                const cellDiv = document.createElement('div');
                cellDiv.className = 'grid-cell';
                cellDiv.dataset.row = r;
                cellDiv.dataset.col = c;
                
                if (this.grid[r][c] > 0) {
                    cellDiv.innerText = this.grid[r][c];
                }
                rowDiv.appendChild(cellDiv);
            }
            this.cellsGrid.appendChild(rowDiv);
        }
        this.drawPlacedRects();
    },

    // ユーザーが配置した四角形をUIレイヤーにレンダリング
    drawPlacedRects() {
        this.rectsLayer.innerHTML = '';
        this.currentRects.forEach((rect, idx) => {
            const rectEl = document.createElement('div');
            rectEl.className = 'placed-rect';
            if (rect.isError) rectEl.classList.add('error');
            if (rect.isHint) rectEl.classList.add('hint-highlight');

            rectEl.style.top = `${rect.r * 50}px`;
            rectEl.style.left = `${rect.c * 50}px`;
            rectEl.style.width = `${rect.w * 50}px`;
            rectEl.style.height = `${rect.h * 50}px`;
            
            this.rectsLayer.appendChild(rectEl);
        });
    },

    setupMouseEvents() {
        this.gridContainer.addEventListener('mousedown', (e) => {
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;
            
            this.isDragging = true;
            this.dragStartCell = {
                r: parseInt(cell.dataset.row),
                c: parseInt(cell.dataset.col)
            };
            this.updatePreview(this.dragStartCell, this.dragStartCell);
        });

        this.gridContainer.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const currentCell = {
                r: parseInt(cell.dataset.row),
                c: parseInt(cell.dataset.col)
            };
            this.updatePreview(this.dragStartCell, currentCell);
        });

        window.addEventListener('mouseup', (e) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.previewRect.style.display = 'none';

            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const dragEndCell = {
                r: parseInt(cell.dataset.row),
                c: parseInt(cell.dataset.col)
            };

            this.finalizeRect(this.dragStartCell, dragEndCell);
        });
    },

    updatePreview(start, end) {
        const rStart = Math.min(start.r, end.r);
        const rEnd = Math.max(start.r, end.r);
        const cStart = Math.min(start.c, end.c);
        const cEnd = Math.max(start.c, end.c);

        this.previewRect.style.display = 'block';
        this.previewRect.style.top = `${rStart * 50}px`;
        this.previewRect.style.left = `${cStart * 50}px`;
        this.previewRect.style.width = `${(cEnd - cStart + 1) * 50}px`;
        this.previewRect.style.height = `${(rEnd - rStart + 1) * 50}px`;
    },

    finalizeRect(start, end) {
        const r = Math.min(start.r, end.r);
        const h = Math.max(start.r, end.r) - r + 1;
        const c = Math.min(start.c, end.c);
        const w = Math.max(start.c, end.c) - c + 1;

        // 重複する古い四角形があれば削除（上書き）
        this.currentRects = this.currentRects.filter(rect => {
            // 新しく描いた四角形と完全に重なる、または始点が被る場合は消去
            return !(rect.r === r && rect.c === c && rect.w === w && rect.h === h);
        });

        // 既存の四角形と交差するマスにある「同じ始点、または完全に被るもの」への配慮
        // 単純に新規追加
        this.currentRects.push({ r, c, w, h });

        // ヒント用の一時フラグやエラーフラグをクリア
        this.currentRects.forEach(re => { delete re.isError; delete re.isHint; });

        this.drawPlacedRects();
        
        // 状態変化による自動セーブ発火
        this.saveCurrentProgress();
        
        // クリア判定のトリガー
        this.checkWinCondition();
    },

    clearRects() {
        this.currentRects = [];
        this.drawPlacedRects();
        this.saveCurrentProgress();
    },

    triggerHint() {
        // ヒント演出のためにフラグを一端全解除
        this.currentRects.forEach(re => { delete re.isError; delete re.isHint; });
        
        const hintResult = ShikakuHint.getHint(this.currentRects, this.grid, this.solution);
        this.hintText.innerText = hintResult.message;

        if (hintResult.rect) {
            if (hintResult.type === 'error' || hintResult.type === 'correction') {
                // 該当の四角形にエラーマークをつけて再描画
                const target = this.currentRects.find(re => 
                    re.r === hintResult.rect.r && re.c === hintResult.rect.c
                );
                if (target) target.isError = true;
            } else if (hintResult.type === 'logic') {
                // 盤面に一時的なヒント枠を生成して追加
                const hintRect = { ...hintResult.rect, isHint: true };
                this.currentRects.push(hintRect);
                // 3秒後にヒント枠だけ消去
                setTimeout(() => {
                    this.currentRects = this.currentRects.filter(re => !re.isHint);
                    this.drawPlacedRects();
                }, 3500);
            }
            this.drawPlacedRects();
        }
    },

    checkWinCondition() {
        // 敷き詰められた面積の合計が全マス数と一致しているか
        let totalArea = 0;
        this.currentRects.forEach(re => totalArea += (re.w * re.h));
        if (totalArea !== this.width * this.height) return;

        // Hintモジュールを流用して、エラーや矛盾がないか最終確認
        const check = ShikakuHint.getHint(this.currentRects, this.grid, this.solution);
        if (check.type === 'logic' && check.rect === null) {
            this.handleGameClear();
        }
    },

    handleGameClear() {
        this.stopTimer();
        alert(`クリアおめでとうございます！タイム: ${this.timerDisplay.innerText}`);

        // クリア時にすべてをリセット・送信する責任を果たす
        localStorage.removeItem('shikaku_progress');
        
        ShikakuMenu.sendClearRecordToFirestore({
            difficulty: this.difficulty,
            time: this.secondsElapsed
        });
    },

    // 状態変化をトリガーにした自動セーブ
    saveCurrentProgress() {
        const progress = {
            grid: this.grid,
            solution: this.solution,
            currentRects: this.currentRects,
            width: this.width,
            height: this.height,
            difficulty: this.difficulty,
            secondsElapsed: this.secondsElapsed
        };
        localStorage.setItem('shikaku_progress', JSON.stringify(progress));
    },

    loadProgress() {
        const raw = localStorage.getItem('shikaku_progress');
        if (!raw) {
            // 初期状態はデフォルトで中級を開始
            this.startNewGame('medium');
            return;
        }

        try {
            const progress = JSON.parse(raw);
            this.grid = progress.grid;
            this.solution = progress.solution;
            this.currentRects = progress.currentRects;
            this.width = progress.width;
            this.height = progress.height;
            this.difficulty = progress.difficulty;
            this.secondsElapsed = progress.secondsElapsed;

            // UI反映
            this.difficultySelect.value = this.difficulty;
            this.renderGrid();
            this.startTimer();
        } catch (e) {
            localStorage.removeItem('shikaku_progress');
            this.startNewGame('medium');
        }
    },

    startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => {
            this.secondsElapsed++;
            
            // タイマーの進行も状態変化の1つとして自動セーブ
            if (this.secondsElapsed % 5 === 0) { // 負荷軽減のため5秒ごとにセーブ
                this.saveCurrentProgress();
            }
            
            const mins = String(Math.floor(this.secondsElapsed / 60)).padStart(2, '0');
            const secs = String(this.secondsElapsed % 60).padStart(2, '0');
            this.timerDisplay.innerText = `${mins}:${secs}`;
        }, 1000);
    },

    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }
};

document.addEventListener('DOMContentLoaded', () => window.ShikakuCore.init());
