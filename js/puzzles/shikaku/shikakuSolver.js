/**
 * ShikakuSolver - 解析・難易度判定エンジン
 */
const ShikakuSolver = {
    /**
     * 問題を解析して解を求め、難易度を動的にスコアリングする
     * @param {Array} grid - 盤面の2次元配列（数字がない場所は0）
     * @return {Object} 解析結果 { success, solution, difficulty }
     */
    solve(grid) {
        const height = grid.length;
        const width = grid[0].length;
        
        // 1. 盤面上の数字（ヒント）を抽出
        const numbers = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (grid[r][c] > 0) {
                    numbers.push({ id: numbers.length, r, c, val: grid[r][c] });
                }
            }
        }

        // 2. 各数字に対して、配置可能なすべての長方形候補を列挙
        const candidatesMap = new Map();
        for (const num of numbers) {
            candidatesMap.set(num.id, this.generateCandidatesForNumber(num, grid, width, height));
        }

        // 3. ロジカルなシミュレーションによる解法
        let changed = true;
        let logicalSteps = 0;
        const confirmedRects = [];
        const coveredCells = Array.from({ length: height }, () => Array(width).fill(false));

        while (changed) {
            changed = false;

            // テクニック①: Naked Single (ある数字に対して有効な長方形候補が1つしかない)
            for (const num of numbers) {
                if (confirmedRects.some(rect => rect.numId === num.id)) continue;

                // 既に埋まったセルと衝突する候補をフィルタリング
                const validCandidates = candidatesMap.get(num.id).filter(rect => 
                    !this.isIntersectingWithCovered(rect, coveredCells)
                );

                if (validCandidates.length === 1) {
                    const target = validCandidates[0];
                    target.numId = num.id;
                    confirmedRects.push(target);
                    this.markCovered(target, coveredCells);
                    changed = true;
                    logicalSteps++;
                } else if (validCandidates.length === 0) {
                    // 矛盾発生
                    return { success: false, solution: null, difficulty: 'invalid' };
                }
            }

            // テクニック②: Cell Lock (ある空きマスをカバーできるのが、特定の1つの数字の候補群しかない場合)
            // ※中級テクニックとしてカウント
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (coveredCells[r][c]) continue;

                    let possibleNumIds = [];
                    let lastMatchingRect = null;

                    for (const num of numbers) {
                        if (confirmedRects.some(rect => rect.numId === num.id)) continue;
                        const validCandidates = candidatesMap.get(num.id).filter(rect => 
                            !this.isIntersectingWithCovered(rect, coveredCells)
                        );

                        for (const rect of validCandidates) {
                            if (r >= rect.r && r < rect.r + rect.h && c >= rect.c && c < rect.c + rect.w) {
                                if (!possibleNumIds.includes(num.id)) {
                                    possibleNumIds.push(num.id);
                                }
                                lastMatchingRect = rect;
                            }
                        }
                    }

                    // このマスを救える数字が1つしかなく、その候補矩形が特定の1つに絞り込める場合
                    if (possibleNumIds.length === 1) {
                        const numId = possibleNumIds[0];
                        const validCandidates = candidatesMap.get(numId).filter(rect => 
                            !this.isIntersectingWithCovered(rect, coveredCells) &&
                            r >= rect.r && r < rect.r + rect.h && c >= rect.c && c < rect.c + rect.w
                        );
                        if (validCandidates.length === 1) {
                            const target = validCandidates[0];
                            target.numId = numId;
                            confirmedRects.push(target);
                            this.markCovered(target, coveredCells);
                            changed = true;
                            logicalSteps += 2; // スコア加算
                        }
                    }
                }
            }
        }

        // 全マスが埋まったか確認
        const allCovered = coveredCells.every(row => row.every(cell => cell));
        if (allCovered && confirmedRects.length === numbers.length) {
            // ロジックだけで解けた
            let difficulty = 'easy';
            if (logicalSteps > numbers.length * 1.2) difficulty = 'medium';
            return { success: true, solution: confirmedRects, difficulty };
        }

        // 4. ロジックで行き詰まった場合は「総当たり（全探索）」に頼る
        const backupSolution = [];
        const isSolvedByBacktrack = this.backtrackSolve(numbers, 0, candidatesMap, Array.from({ length: height }, () => Array(width).fill(false)), backupSolution);

        if (isSolvedByBacktrack) {
            return {
                success: true,
                solution: backupSolution,
                difficulty: 'hard' // 総当たりが必要だったものは「上級（あるいは超難問）」
            };
        }

        return { success: false, solution: null, difficulty: 'impossible' };
    },

    // 特定の数字から生成可能なすべての長方形候補を列挙（他の数字を内包しない）
    generateCandidatesForNumber(num, grid, width, height) {
        const candidates = [];
        const val = num.val;

        // 面積が val になる 縦h × 横w の組み合わせ
        for (let w = 1; w <= val; w++) {
            if (val % w !== 0) continue;
            const h = val / w;

            // 数字 (num.r, num.c) を含むような配置を全探索
            for (let r = num.r - h + 1; r <= num.r; r++) {
                for (let c = num.c - w + 1; c <= num.c; c++) {
                    if (r >= 0 && r + h <= height && c >= 0 && c + w <= width) {
                        
                        // この長方形の中に「他の数字」が入っていないかチェック
                        let containsOtherNumber = false;
                        for (let tr = r; tr < r + h; tr++) {
                            for (let tc = c; tc < c + w; tc++) {
                                if (grid[tr][tc] > 0 && (tr !== num.r || tc !== num.c)) {
                                    containsOtherNumber = true;
                                    break;
                                }
                            }
                            if (containsOtherNumber) break;
                        }

                        if (!containsOtherNumber) {
                            candidates.push({ r, c, w, h });
                        }
                    }
                }
            }
        }
        return candidates;
    },

    isIntersectingWithCovered(rect, coveredCells) {
        for (let r = rect.r; r < rect.r + rect.h; r++) {
            for (let c = rect.c; c < rect.c + rect.w; c++) {
                if (coveredCells[r] && coveredCells[r][c]) return true;
            }
        }
        return false;
    },

    markCovered(rect, coveredCells) {
        for (let r = rect.r; r < rect.r + rect.h; r++) {
            for (let c = rect.c; c < rect.c + rect.w; c++) {
                coveredCells[r][c] = true;
            }
        }
    },

    // バックトラッキング全探索
    backtrackSolve(numbers, index, candidatesMap, coveredCells, solution) {
        if (index === numbers.length) {
            // すべてのマスが完全に埋まっているか確認
            return coveredCells.every(row => row.every(cell => cell));
        }

        const num = numbers[index];
        const candidates = candidatesMap.get(num.id);

        for (const rect of candidates) {
            if (this.isIntersectingWithCovered(rect, coveredCells)) continue;

            // 状態を進める
            rect.numId = num.id;
            solution.push(rect);
            
            // 盤面を一時的に埋める
            for (let r = rect.r; r < rect.r + rect.h; r++) {
                for (let c = rect.c; c < rect.c + rect.w; c++) {
                    coveredCells[r][c] = true;
                }
            }

            if (this.backtrackSolve(numbers, index + 1, candidatesMap, coveredCells, solution)) {
                return true;
            }

            // 状態を戻す（バックトラック）
            solution.pop();
            for (let r = rect.r; r < rect.r + rect.h; r++) {
                for (let c = rect.c; c < rect.c + rect.w; c++) {
                    coveredCells[r][c] = false;
                }
            }
        }

        return false;
    }
};
