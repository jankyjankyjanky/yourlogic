import { analyzeSudoku } from './sudokuSolver.js';

// ベースとなる完成盤面のシード
const SEED_SOLUTIONS = [
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
    "123456789456789123789123456234567891567891234891234567345678912678912345912345678"
];

/**
 * 数字をランダムに入れ替えて、新しい完成盤面（バリエーション）を作ります
 */
function getShuffledSolution() {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    const seed = SEED_SOLUTIONS[Math.floor(Math.random() * SEED_SOLUTIONS.length)];
    return seed.split('').map(char => {
        const val = parseInt(char);
        return nums[val - 1].toString();
    }).join('');
}

/**
 * 指定された難易度の問題ができるまで、穴あけと論理解析を繰り返します
 * @param {string} targetDifficulty - 内部的な難易度ID
 * @returns {Object|null} { problemData, solutionData } 成功時
 */
export function generatePuzzle(targetDifficulty) {
    let globalAttempts = 0;

    while (globalAttempts < 5) {
        let solution = getShuffledSolution();
        let currentBoard = solution.split('');
        
        // 0〜80のインデックスをランダムにシャッフル
        let indices = Array.from({ length: 81 }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        // 1マスずつ削っていく
        for (let i = 0; i < 81; i++) {
            const idx = indices[i];
            const backup = currentBoard[idx];
            currentBoard[idx] = '0'; // 穴をあける

            const problemStr = currentBoard.join('');
            const analysis = analyzeSudoku(problemStr);

            // 唯一解が維持されている場合
            if (analysis.isUnique) {
                if (analysis.difficulty === targetDifficulty) {
                    let isReady = true;

                    // 💡 【セーフティネット】盤面の穴が20個未満なら、まだ確定させない
                    // 一番簡単な難易度が、1〜2マス削っただけのスカスカな状態で出力されるのを防ぎます。
                    const currentHoleCount = currentBoard.filter(char => char === '0').length;
                    if (currentHoleCount < 20) {
                        isReady = false; // 確定フラグを落として、次の削りへ進む
                    }

                    // 20マス以上の穴が空いていれば、安全にリターン
                    if (isReady) {
                        return {
                            problemData: problemStr,
                            solutionData: analysis.solution
                        };
                    }
                }
            } else {
                // 唯一解が崩れたら、この穴あけはキャンセルして元に戻す
                currentBoard[idx] = backup;
            }
        }
        globalAttempts++;
    }
    return null; // 5回全滅した場合はnull
}
