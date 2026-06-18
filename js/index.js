import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, fetchPuzzlesByDifficulty, fetchOrInitUser, saveNewPuzzle, updateUserStamina } from "./services/firebaseService.js";
import { generatePuzzle } from "./puzzles/sudoku/sudokuGenerator.js";

let currentUser = null;
let selectedDifficulty = 'easy'; // 難易度UIの選択状態（初期値）
let staminaTimerId = null;       // タイマーの参照保持用

const STAMINA_RECOVERY_MS = 5 * 60 * 60 * 1000; // 5時間
const MAX_STAMINA = 5;

// --- 💡 追加：スタミナの最新状態と次の回復までの時間を計算する共通関数 ---
function calculateCurrentStamina(userData) {
    let points = userData?.generationPoints ?? MAX_STAMINA;
    let lastUpdated = userData?.lastPointUpdatedAt;
    let lastUpdatedMs = lastUpdated?.toDate ? lastUpdated.toDate().getTime() : new Date(lastUpdated).getTime();
    
    const now = Date.now();
    let elapsedMs = now - lastUpdatedMs;

    // ポイントが満タン未満、かつ回復時間を過ぎている場合
    if (points < MAX_STAMINA && elapsedMs >= STAMINA_RECOVERY_MS) {
        const recoveredPoints = Math.floor(elapsedMs / STAMINA_RECOVERY_MS);
        points = Math.min(MAX_STAMINA, points + recoveredPoints);
        lastUpdatedMs = lastUpdatedMs + (recoveredPoints * STAMINA_RECOVERY_MS);
        elapsedMs = now - lastUpdatedMs; // 残りの経過時間を再計算
    }

    // 次の回復までの残り時間（ミリ秒）
    let nextRecoveryIn = 0;
    if (points < MAX_STAMINA) {
        nextRecoveryIn = STAMINA_RECOVERY_MS - elapsedMs;
    }

    return { points, lastUpdatedMs, nextRecoveryIn };
}

// --- 💡 追加：スタミナUIをリアルタイム更新するメインロジック ---
function startStaminaTracker(userData) {
    const container = document.getElementById('stamina-container');
    const countSpan = document.getElementById('stamina-count');
    const timerSpan = document.getElementById('stamina-timer');

    if (!container || !countSpan || !timerSpan) return;

    // UIを表示状態にする
    container.style.display = 'inline-flex';

    // 既存のタイマーがあればクリア
    if (staminaTimerId) clearInterval(staminaTimerId);

    // 1秒ごとに最新のスタミナとタイマーを計算して描画
    staminaTimerId = setInterval(() => {
        const { points, nextRecoveryIn } = calculateCurrentStamina(userData);
        
        // スタミナ数の表示更新
        countSpan.textContent = `${points}/${MAX_STAMINA}`;

        // カウントダウンタイマーの表示更新
        if (points >= MAX_STAMINA) {
            timerSpan.textContent = ""; // 満タン時はタイマー非表示
        } else {
            const totalSeconds = Math.max(0, Math.floor(nextRecoveryIn / 1000));
            const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            timerSpan.textContent = `(回復まで ${hours}:${minutes}:${seconds})`;
        }
    }, 1000);
}

// 💡 追加：UIをリセットする関数（ログアウト時用）
function stopStaminaTracker() {
    if (staminaTimerId) {
        clearInterval(staminaTimerId);
        staminaTimerId = null;
    }
    const container = document.getElementById('stamina-container');
    if (container) container.style.display = 'none';
}


// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        console.log("ユーザーがログインしました:", user.displayName);
        try {
            // 💡 ログイン時にユーザーデータを取得し、スタミナトラッカーを起動
            const userData = await fetchOrInitUser(user);
            startStaminaTracker(userData);
        } catch (e) {
            console.error("ログイン後のスタミナ初期化エラー:", e);
        }
    } else {
        console.log("ゲストモードです");
        stopStaminaTracker(); // 💡 ゲスト時はスタミナUIを隠す
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
            
            // 💡 共通関数を使って最新のスタミナポイントとタイムスタンプベースを取得
            const { points, lastUpdatedMs } = calculateCurrentStamina(userData);

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
                        // 満タン状態から減る場合は「今」を起点に、既に目減りしている場合は前回の計算ベースを引き継ぐ
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

// ページ遷移を実行する補助関数
function navigateToSudoku(difficulty, puzzleId) {
    window.location.href = `./puzzles/sudoku.html?diff=${difficulty}&id=${puzzleId}`;
}
