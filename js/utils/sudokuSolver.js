/**
 * 数独の盤面を解析し、模範解答と解のユニーク性を判定します。
 * @param {string} boardStr - 81文字の数字文字列（空きマスは '0'）
 * @returns {Object} 解析結果 { isUnique: boolean, solution: string|null, error: string|null }
 */
export function analyzeSudoku(boardStr) {
    if (!boardStr || boardStr.length !== 81) {
        return { isUnique: false, solution: null, error: "盤面データが81文字ではありません。" };
    }

    // 1次元文字列を2次元配列(9x9)の数値に変換
    const board = [];
    for (let i = 0; i < 81; i += 9) {
        board.push(boardStr.slice(i, i + 9).split('').map(Number));
    }

    const solutions = [];

    // 数字が配置可能かチェックする補助関数
    function isValid(r, c, val) {
        for (let i = 0; i < 9; i++) {
            if (board[r][i] === val || board[i][c] === val) return false;
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (board[br + i][bc + j] === val) return false;
            }
        }
        return true;
    }

    // バックトラッキングによる解探索
    function backtrack(index) {
        if (index === 81) {
            // 解が1つ見つかったので保存
            const solStr = board.map(row => row.join('')).join('');
            solutions.push(solStr);
            // 解が2つ以上見つかったら、唯一解ではないので探索を打ち切る(trueを返して抜ける)
            return solutions.length >= 2;
        }

        const r = Math.floor(index / 9);
        const c = index % 9;

        // すでに数字がある（初期数字）場合は次のマスへ
        if (board[r][c] !== 0) {
            return backtrack(index + 1);
        }

        for (let val = 1; val <= 9; val++) {
            if (isValid(r, c, val)) {
                board[r][c] = val;
                // 次のマス以降の探索で「打ち切り（2解検出）」が発生したら再帰を抜ける
                if (backtrack(index + 1)) return true;
                board[r][c] = 0; // 元に戻す
            }
        }
        return false;
    }

    // 探索開始
    backtrack(0);

    return {
        isUnique: solutions.length === 1,
        solution: solutions.length > 0 ? solutions[0] : null,
        error: solutions.length === 0 ? "解が存在しない破綻した問題です。" : null
    };
}
