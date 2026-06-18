/**
 * ShikakuHint - ヒント・解説生成エンジン
 */
const ShikakuHint = {
    /**
     * ユーザーの現在の入力盤面を診断し、最適なステップのヒントを生成する
     * @param {Array} currentRects - ユーザーが配置した四角形リスト [{r, c, w, h}]
     * @param {Array} startGrid - 初期数字盤面
     * @param {Array} solution - 模範解答の四角形リスト
     * @return {Object} { type: 'error'|'correction'|'logic', message, rect: {r,c,w,h} }
     */
    getHint(currentRects, startGrid, solution) {
        const height = startGrid.length;
        const width = startGrid[0].length;

        // -------------------------------------------------------------
        // ① 第一段階: 盤面上のあきらかなルール違反の指摘
        // -------------------------------------------------------------
        for (const rect of currentRects) {
            // 長方形内の数字を数える
            let numCount = 0;
            let foundNumVal = 0;
            for (let r = rect.r; r < rect.r + rect.h; r++) {
                for (let c = rect.c; c < rect.c + rect.w; c++) {
                    if (startGrid[r] && startGrid[r][c] > 0) {
                        numCount++;
                        foundNumVal = startGrid[r][c];
                    }
                }
            }

            // ルール違反：数字が複数入っている、または1つも入っていない
            if (numCount !== 1) {
                return {
                    type: 'error',
                    message: '「1つの四角形の中に数字は必ず1つだけ」というルールに違反している場所があります。赤く光った四角形を修正しましょう。',
                    rect: rect
                };
            }

            // ルール違反：面積が数字と一致しない
            if (rect.w * rect.h !== foundNumVal) {
                return {
                    type: 'error',
                    message: `数字 ${foundNumVal} の四角形ですが、現在の面積が ${rect.w * rect.h} になっています。サイズを合わせましょう。`,
                    rect: rect
                };
            }
        }

        // -------------------------------------------------------------
        // ② 第二段階: 誤入力の指摘（模範解答との突合）
        // -------------------------------------------------------------
        for (const rect of currentRects) {
            // ユーザーの引いた四角形が、模範解答のいずれの長方形とも完全一致しない場合
            const isCorrect = solution.some(sol => 
                sol.r === rect.r && sol.c === rect.c && sol.w === rect.w && sol.h === rect.h
            );

            if (!isCorrect) {
                return {
                    type: 'correction',
                    message: 'ルール違反はありませんが、正しいゴールとは異なる四角形が引かれているようです。ハイライトされた四角形を見直してみてください。',
                    rect: rect
                };
            }
        }

        // -------------------------------------------------------------
        // ③ 第三段階: 次の一手を論理的にアドバイスする
        // -------------------------------------------------------------
        // 模範解答の中から、まだユーザーが配置していない四角形を1つ見つける
        for (const solRect of solution) {
            const alreadyPlaced = currentRects.some(rect => 
                rect.r === solRect.r && rect.c === solRect.c && rect.w === solRect.w && rect.h === solRect.h
            );

            if (!alreadyPlaced) {
                // その四角形の中に含まれる初期数字を見つける
                let numVal = 0;
                let numR = 0, numC = 0;
                for (let r = solRect.r; r < solRect.r + solRect.h; r++) {
                    for (let c = solRect.c; c < solRect.c + solRect.w; c++) {
                        if (startGrid[r][c] > 0) {
                            numVal = startGrid[r][c];
                            numR = r; numC = c;
                            break;
                        }
                    }
                }

                return {
                    type: 'logic',
                    message: `(${numR + 1}行目, ${numC + 1}列目) にある「${numVal}」の数字に注目してください。この四角形の広がる形は、ここにハイライトされた領域に一意に決定できます。`,
                    rect: solRect
                };
            }
        }

        return {
            type: 'logic',
            message: '素晴らしい！すべての四角形が正しく配置されています。盤面はクリア状態です。',
            rect: null
        };
    }
};
