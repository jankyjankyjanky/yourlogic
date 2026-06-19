export function generateShikakuPuzzle(size, difficulty) {
    let rectangles = [{ x1: 0, y1: 0, x2: size - 1, y2: size - 1 }];
    
    // 難易度による面積の制限
    let minArea = 2;
    let maxArea = 12;
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

            // 分割条件（面積が大きい、またはランダム確率）
            if (area > maxArea || (area >= minArea * 2 && Math.random() < 0.75)) {
                const splitVertically = w > h ? true : (w === h ? Math.random() < 0.5 : false);
                
                if (splitVertically && w >= 2) {
                    const splitX = r.x1 + Math.floor(Math.random() * (w - 1));
                    rectangles.splice(i, 1, 
                        { x1: r.x1, y1: r.y1, x2: splitX, y2: r.y2 },
                        { x1: splitX + 1, y1: r.y1, x2: r.x2, y2: r.y2 }
                    );
                    changed = true; break;
                } else if (!splitVertically && h >= 2) {
                    const splitY = r.y1 + Math.floor(Math.random() * (h - 1));
                    rectangles.splice(i, 1, 
                        { x1: r.x1, y1: r.y1, x2: r.x2, y2: splitY },
                        { x1: r.x1, y1: splitY + 1, x2: r.x2, y2: r.y2 }
                    );
                    changed = true; break;
                }
            }
        }
    }

    // 数字の配置（2次元配列）と模範解答データを作成
    const puzzleData = Array(size).fill().map(() => Array(size).fill(0));
    const solutionRects = rectangles.map((rect, index) => {
        const w = rect.x2 - rect.x1 + 1;
        const h = rect.y2 - rect.y1 + 1;
        const area = w * h;
        
        // 矩形内のランダムな位置に数字を1つ置く
        const numX = rect.x1 + Math.floor(Math.random() * w);
        const numY = rect.y1 + Math.floor(Math.random() * h);
        puzzleData[numY][numX] = area;

        return { ...rect, id: index, val: area, numX, numY };
    });

    return { puzzleData, solutionRects };
}
