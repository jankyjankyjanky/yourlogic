/**
 * ShikakuGenerator - 問題自動生成エンジン
 */
const ShikakuGenerator = {
    /**
     * 指定されたサイズと難易度の問題を生成する
     * @param {string} difficulty - 'easy' | 'medium' | 'hard'
     * @return {Object} { grid, solution, width, height }
     */
    generate(difficulty) {
        let width = 8, height = 8;
        if (difficulty === 'easy') { width = 6; height = 6; }
        if (difficulty === 'hard') { width = 10; height = 10; }

        let attempts = 0;
        while (attempts < 100) {
            attempts++;
            
            // 1. 完成形（シード）を長方形の敷き詰めによって作成
            const solutionRects = this.generateRandomPerfectDivision(width, height);
            
            // 2. 各長方形から「数字を配置するセル」を1マスずつ選んで問題の初期グリッドを作成
            const grid = Array.from({ length: height }, () => Array(width).fill(0));
            solutionRects.forEach(rect => {
                // 長方形内のランダムな位置に面積（ヒント数）を配置
                const randR = rect.r + Math.floor(Math.random() * rect.h);
                const randC = rect.c + Math.floor(Math.random() * rect.w);
                grid[randR][randC] = rect.w * rect.h;
            });

            // 3. Solverで検証
            const analysis = ShikakuSolver.solve(grid);
            
            // 唯一解を持ち、かつスカスカ防止の最低ヒント数条件をクリアしているか検証
            const minHints = Math.floor((width * height) / 5); // セーフティネット（最低限必要なヒント数）
            if (analysis.success && solutionRects.length >= minHints) {
                // 難易度の一致、または最大試行に近づいたら妥協して出力
                if (analysis.difficulty === difficulty || attempts > 50) {
                    return {
                        grid: grid,
                        solution: solutionRects,
                        width: width,
                        height: height
                    };
                }
            }
        }
        
        // フォールバック（最悪の場合の初期シード）
        return this.getFallbackPuzzle(difficulty);
    },

    // 盤面をランダムに長方形で分割する（完成形シードの生成）
    generateRandomPerfectDivision(width, height) {
        const rects = [];
        const unassigned = Array.from({ length: height }, () => Array(width).fill(true));

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (!unassigned[r][c]) continue;

                // 割り当て可能な最大幅と高さを探る
                let maxW = 1;
                while (c + maxW < width && unassigned[r][c + maxW] && maxW < 5) maxW++;
                
                // ランダムに長方形のサイズを決定
                const w = Math.floor(Math.random() * maxW) + 1;
                
                let maxH = 1;
                let validH = true;
                while (r + maxH < height && maxH < 5) {
                    for (let tc = c; tc < c + w; tc++) {
                        if (!unassigned[r + maxH][tc]) { validH = false; break; }
                    }
                    if (!validH) break;
                    maxH++;
                }
                const h = Math.floor(Math.random() * maxH) + 1;

                // 確定させてマーク
                for (let tr = r; tr < r + h; tr++) {
                    for (let tc = c; tc < c + w; tc++) {
                        unassigned[tr][tc] = false;
                    }
                }
                rects.push({ r, c, w, h });
            }
        }
        return rects;
    },

    getFallbackPuzzle(difficulty) {
        // 万が一の無限ループを回避するための固定良問データ
        const grid = [
            [0, 2, 0, 0, 4, 0],
            [0, 0, 0, 0, 0, 2],
            [3, 0, 9, 0, 0, 0],
            [0, 0, 0, 0, 0, 4],
            [2, 0, 0, 0, 0, 0],
            [0, 4, 0, 0, 6, 0]
        ];
        return {
            grid: grid,
            solution: [], // Core側でSolverを回して再取得可能
            width: 6,
            height: 6
        };
    }
};
