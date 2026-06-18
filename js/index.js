import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, fetchPuzzlesByDifficulty, fetchOrInitUser, saveNewPuzzle, updateUserStamina } from "./services/firebaseService.js";
import { generatePuzzle } from "./puzzles/sudoku/sudokuGenerator.js";

let currentUser = null;
let selectedDifficulty = 'easy'; // 難易度UIの選択状態（初期値）

// ログイン状態の監視
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        console.log("ユーザーがログインしました:", user.displayName);
        // 必要に応じてここにホーム画面用のスタミナ表示更新などを入れる
    } else {
        console.log("ゲストモードです");
    }
});

// 難易度ボタンの選択切り替えイベント
document.querySelectorAll('.difficulty-selector .diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.difficulty-selector .diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedDifficulty = e.target.dataset.diff; 
    });
});

// 「数独に挑戦する」ボタンが押された時のフロー制御（ゲートキーパー）
document.getElementById('start-sudoku-btn').addEventListener('click', async () => {
    try {
        // 1. 該当難易度の既存パズルストックをFirestoreから取得
        const availablePuzzles = await fetchPuzzlesByDifficulty(selectedDifficulty);
        let targetPuzzle = null;

        if (currentUser) {
            const userData = await fetchOrInitUser(currentUser);
            const clearedPuzzles = userData?.clearedPuzzles || [];
            const isAdmin = userData?.isAdmin || false;

            // 2. 未プレイの問題がストックにあるか探す
            targetPuzzle = availablePuzzles.find(p => !clearedPuzzles.includes(p.id));

            if (targetPuzzle) {
                // 🟢 【条件A】適する問題がストレージにある ➔ 画面遷移
                navigateToSudoku(selectedDifficulty, targetPuzzle.id);
                return;
            }

            // --- ここからストックがない場合の判定 ---
            console.log("未プレイの問題がありません。生成猶予を確認します...");
            
            // 内部スタミナの最新自動回復値を算出
            let points = userData?.generationPoints ?? 5;
            let lastUpdated = userData?.lastPointUpdatedAt;
            let lastUpdatedMs = lastUpdated?.toDate ? lastUpdated.toDate().getTime() : new Date(lastUpdated).getTime();
            
            const STAMINA_RECOVERY_MS = 5 * 60 * 60 * 1000;
            const MAX_STAMINA = 5;
            const elapsedMs = Date.now() - lastUpdatedMs;

            if (points < MAX_STAMINA && elapsedMs >= STAMINA_RECOVERY_MS) {
                const recoveredPoints = Math.floor(elapsedMs / STAMINA_RECOVERY_MS);
                points = Math.min(MAX_STAMINA, points + recoveredPoints);
                lastUpdatedMs = lastUpdatedMs + (recoveredPoints * STAMINA_RECOVERY_MS);
            }

            // 3. 生成猶予が残っているか（または管理者か）をチェック
            if (points > 0 || isAdmin) {
                // 🟢 【条件B】問題がない ＆ 生成猶予がある ➔ その場で自動生成してDB保存後に遷移
                alert("⏳ 唯一解パズルを新規自動生成中... しばらくお待ちください。");
                
                let newPuzzle = generatePuzzle(selectedDifficulty);
                if (newPuzzle) {
                    const newId = await saveNewPuzzle(currentUser.uid, selectedDifficulty, newPuzzle);
                    
                    // 非管理者の場合はポイントを1減算してDBを更新
                    if (!isAdmin) {
                        const nextPoints = points - 1;
                        const nextUpdatedDate = (points === MAX_STAMINA) ? new Date() : new Date(lastUpdatedMs);
                        await updateUserStamina(currentUser.uid, nextPoints, nextUpdatedDate);
                    }

                    // 生成したパズルIDを持って画面遷移
                    navigateToSudoku(selectedDifficulty, newId);
                } else {
                    alert("問題の自動生成に失敗しました。もう一度お試しください。");
                }
            } else {
                // 🔴 【条件C】問題がない ＆ 生成猶予もない ➔ index.htmlのままアラートを表示
                alert(`⚠️ 申し訳ありません。難易度「${selectedDifficulty}」の既存ストックが切れています。\nまた、現在の生成猶予ポイントが不足しているため、新しい問題を自動生成できません。\n（5時間に1ポイント自動回復します）`);
            }
        } else {
            // ゲストモードの場合の挙動（ストックからランダム、なければログインを促す）
            if (availablePuzzles.length > 0) {
                targetPuzzle = availablePuzzles[Math.floor(Math.random() * availablePuzzles.length)];
                navigateToSudoku(selectedDifficulty, targetPuzzle.id);
            } else {
                alert(`⚠️ 現在、難易度「${selectedDifficulty}」の既存ストックがありません。\nログインすると新しい問題を生成して遊ぶことができます！`);
            }
        }
    } catch (e) {
        console.error("遷移チェックエラー:", e);
    }
});

// ページ遷移を実行する補助関数（※ブラウザで実行されるため、基準はindex.htmlからの相対パスになります）
function navigateToSudoku(difficulty, puzzleId) {
    window.location.href = `./puzzles/sudoku.html?diff=${difficulty}&id=${puzzleId}`;
}
