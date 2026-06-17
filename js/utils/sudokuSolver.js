/**
 * 数独の盤面を論理ロジックベースで解析し、難易度と唯一解を判定します。
 * @param {string} boardStr - 81文字の数字文字列（空きマスは '0'）
 * @returns {Object} 解析結果 { isUnique: boolean, difficulty: string|null, solution: string|null, error: string|null }
 */
export function analyzeSudoku(boardStr) {
    if (!boardStr || boardStr.length !== 81) {
        return { isUnique: false, difficulty: null, solution: null, error: "盤面データが81文字ではありません。" };
    }

    // 1. 2次元配列および候補リスト(1-9のフラグ)の初期化
    let board = [];
    for (let i = 0; i < 81; i += 9) {
        board.push(boardStr.slice(i, i + 9).split('').map(Number));
    }

    // 各マスの候補数字を管理するオブジェクト (1〜9のSet)
    let candidates = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set([1,2,3,4,5,6,7,8,9])));

    // どのテクニックを使用したかを記録するフラグ
    let usedHiddenSingleOrIntersection = false;
    let usedNakedPair = false;
    let usedBacktrack = false;

    // 候補リストを最新の状態に更新する関数
    function updateCandidates() {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] !== 0) {
                    candidates[r][c].clear();
                    continue;
                }
                // 初期化（すべて候補に入れる）
                candidates[r][c] = new Set([1,2,3,4,5,6,7,8,9]);
                
                // 縦・横の重複を排除
                for (let i = 0; i < 9; i++) {
                    candidates[r][c].delete(board[r][i]);
                    candidates[r][c].delete(board[i][c]);
                }
                // ブロック内の重複を排除
                const br = Math.floor(r / 3) * 3;
                const bc = Math.floor(c / 3) * 3;
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        candidates[r][c].delete(board[br + i][bc + j]);
                    }
                }
            }
        }
    }

    // 【解法1】Naked Single (消去法: 候補が1つしかないマスを埋める)
    function solveNakedSingle() {
        let changed = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0 && candidates[r][c].size === 1) {
                    board[r][c] = Array.from(candidates[r][c])[0];
                    updateCandidates();
                    changed = true;
                }
            }
        }
        return changed;
    }

    // 【解法2】Hidden Single (その行/列/ブロック内で、特定の数字が「そこにしか入れない」マスを埋める)
    function solveHiddenSingle() {
        let changed = false;
        
        // ブロックごとの走査
        for (let b = 0; b < 9; b++) {
            const br = Math.floor(b / 3) * 3;
            const bc = (b % 3) * 3;
            
            for (let num = 1; num <= 9; num++) {
                let count = 0;
                let targetR = -1, targetC = -1;
                
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        const r = br + i;
                        const c = bc + j;
                        if (board[r][c] === 0 && candidates[r][c].has(num)) {
                            count++;
                            targetR = r; targetC = c;
                        }
                    }
                }
                if (count === 1 && board[targetR][targetC] === 0) {
                    board[targetR][targetC] = num;
                    usedHiddenSingleOrIntersection = true;
                    updateCandidates();
                    changed = true;
                }
            }
        }
        return changed;
    }

    // 【解法3】Naked Pair (二国同盟: 同じ行/列/ブロック内に、候補が全く同じ「2つの数字だけ」のマスが2つあれば、他のマスからその2つの候補を消す)
    function applyNakedPair() {
        let changed = false;
        for (let r = 0; r < 9; r++) {
            for (let c1 = 0; c1 < 9; c1++) {
                if (board[r][c1] === 0 && candidates[r][c1].size === 2) {
                    for (let c2 = c1 + 1; c2 < 9; c2++) {
                        if (board[r][c2] === 0 && candidates[r][c2].size === 2) {
                            const arr1 = Array.from(candidates[r][c1]);
                            if (candidates[r][c2].has(arr1[0]) && candidates[r][c2].has(arr1[1])) {
                                // 二国同盟発見。行内の他のマスからこの2つの数字を排除
                                for (let c3 = 0; c3 < 9; c3++) {
                                    if (c3 !== c1 && c3 !== c2 && board[r][c3] === 0) {
                                        if (candidates[r][c3].delete(arr1[0]) || candidates[r][c3].delete(arr1[1])) {
                                            usedNakedPair = true;
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return changed;
    }

    // --- 論理シミュレーションの実行ループ ---
    updateCandidates();
    let loop = true;
    while (loop) {
        if (solveNakedSingle()) continue;
        if (solveHiddenSingle()) continue;
        if (applyNakedPair()) continue;
        loop = false; // どのロジックでもマスが埋まらなくなったらループを抜ける
    }

    // 盤面がすべて埋まったか確認
    let isSolvedByLogic = board.every(row => row.every(val => val !== 0));
    
    // 2. 唯一解チェックのためのバックトラッキング（全探索）
    // 論理フェーズで解けなかった場合、または最終確認としてマルチ解を検出するために実行
    const solutions = [];
    let searchBoard = [];
    for (let i = 0; i < 81; i += 9) {
        searchBoard.push(boardStr.slice(i, i + 9).split('').map(Number));
    }

    function isValid(r, c, val) {
        for (let i = 0; i < 9; i++) {
            if (searchBoard[r][i] === val || searchBoard[i][c] === val) return false;
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (searchBoard[br + i][bc + j] === val) return false;
            }
        }
        return true;
    }

    function backtrack(index) {
        if (index === 81) {
            solutions.push(searchBoard.map(row => row.join('')).join(''));
            return solutions.length >= 2;
        }
        const r = Math.floor(index / 9);
        const c = index % 9;
        if (searchBoard[r][c] !== 0) return backtrack(index + 1);

        for (let val = 1; val <= 9; val++) {
            if (isValid(r, c, val)) {
                searchBoard[r][c] = val;
                if (backtrack(index + 1)) return true;
                searchBoard[r][c] = 0;
            }
        }
        return false;
    }

    backtrack(0);

    // 3. 結果の集計と難易度決定
    if (solutions.length === 0) {
        return { isUnique: false, difficulty: null, solution: null, error: "解が存在しません。" };
    }
    if (solutions.length > 1) {
        return { isUnique: false, difficulty: null, solution: solutions[0], error: "複数解（ユニークではない）が存在します。" };
    }

    // 唯一解の場合の難易度マッピング
    let finalDifficulty = "easy";
    if (!isSolvedByLogic) {
        finalDifficulty = "insane"; // 論理パターンを尽くしても解けなかった場合
    } else if (usedNakedPair) {
        finalDifficulty = "hard";
    } else if (usedHiddenSingleOrIntersection) {
        finalDifficulty = "standard";
    }

    return {
        isUnique: true,
        difficulty: finalDifficulty,
        solution: solutions[0],
        error: null
    };
}
