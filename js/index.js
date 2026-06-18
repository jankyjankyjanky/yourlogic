import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, fetchPuzzlesByDifficulty, fetchOrInitUser, saveNewPuzzle, updateUserStamina } from "./services/firebaseService.js";
import { generatePuzzle } from "./puzzles/sudoku/sudokuGenerator.js";

let currentUser = null;
let selectedDifficulty = 'easy';
let staminaTimerId = null;

const STAMINA_RECOVERY_MS = 5 * 60 * 60 * 1000; // 5時間
const MAX_STAMINA = 5;

// スタミナ状態計算関数
function calculateCurrentStamina(userData) {
    let points = userData?.generationPoints ?? MAX_STAMINA;
    let lastUpdated = userData?.lastPointUpdatedAt;
    let lastUpdatedMs = lastUpdated?.toDate ? lastUpdated.toDate().getTime() : new Date(lastUpdated).getTime();
    
    const now = Date.now();
    let elapsedMs = now - lastUpdatedMs;

    if (points < MAX_STAMINA && elapsedMs >= STAMINA_RECOVERY_MS) {
        const recoveredPoints = Math.floor(elapsedMs / STAMINA_RECOVERY_MS);
        points = Math.min(MAX_STAMINA, points + recoveredPoints);
        lastUpdatedMs = lastUpdatedMs + (recoveredPoints * STAMINA_RECOVERY_MS);
        elapsedMs = now - lastUpdatedMs;
    }

    let nextRecoveryIn = 0;
    if (points < MAX_STAMINA) {
        nextRecoveryIn = STAMINA_RECOVERY_MS - elapsedMs;
    }

    return { points, lastUpdatedMs, nextRecoveryIn };
}

// スタミナUIリアルタイム更新
function startStaminaTracker(userData) {
    const container = document.getElementById('stamina-container');
    const countSpan = document.getElementById('stamina-count');
    const timerSpan = document.getElementById('stamina-timer');

    if (!container || !countSpan || !timerSpan) return;
    container.style.display = 'inline-flex';

    if (staminaTimerId) clearInterval(staminaTimerId);

    staminaTimerId = setInterval(() => {
        const { points, nextRecoveryIn } = calculateCurrentStamina(userData);
        countSpan.textContent = `${points}/${MAX_STAMINA}`;

        if (points >= MAX_STAMINA) {
            timerSpan.textContent = "";
        } else {
            const totalSeconds = Math.max(0, Math.floor(nextRecoveryIn / 1000));
            const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            timerSpan.textContent = `(${hours}:${minutes}:${seconds})`;
        }
    }, 1000);
}

function stopStaminaTracker() {
    if (staminaTimerId) {
        clearInterval(staminaTimerId);
        staminaTimerId = null;
    }
    const container = document.getElementById('stamina-container');
    if (container) container.style.display = 'none';
}

// 💡 認証状態によってヘッダーUIを切り替える関数
function updateHeaderAuthUI(user) {
    const loginNavBtn = document.getElementById('login-nav-btn');
    const userNavProfile = document.getElementById('user-nav-profile');
    const headerUserName = document.getElementById('header-user-name');

    if (user) {
        // ログイン時：ログインボタンを隠し、プロファイル／設定リンクを表示
        loginNavBtn.style.display = 'none';
        userNavProfile.style.display = 'flex';
        headerUserName.textContent = user.displayName || user.email || "ユーザー";
    } else {
        // ログアウト時：ログインボタンを表示し、プロファイル領域を隠す
        loginNavBtn.style.display = 'inline-block';
        userNavProfile.style.display = 'none';
    }
}

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateHeaderAuthUI(user); // 💡 ヘッダーUIを更新

    if (user) {
        console.log("ユーザーがログインしました:", user.displayName);
        try {
            const userData = await fetchOrInitUser(user);
            startStaminaTracker(userData);
        } catch (e) {
            console.error("ログイン後のスタミナ初期化エラー:", e);
        }
    } else {
        console.log("ゲストモードです");
        stopStaminaTracker();
    }
});

// 💡 ヘッダーのボタンイベントを設定
document.getElementById('login-nav-btn').addEventListener('click', () => {
    // ログイン画面（login.html）へ遷移
    window.location.href = './login.html'; 
});

document.getElementById('logout-nav-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        alert("ログアウトしました");
    } catch (e) {
        console.error("ログアウトエラー:", e);
    }
});

// 難易度ボタン切り替え
document.querySelectorAll('.difficulty-selector .diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.difficulty-selector .diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedDifficulty = e.target.dataset.diff; 
    });
});

// 「数独に挑戦する」ボタン（ゲートキーパー）
document.getElementById('start-sudoku-btn').addEventListener('click', async () => {
    try {
        const availablePuzzles = await fetchPuzzlesByDifficulty(selectedDifficulty);
        let targetPuzzle = null;

        if (currentUser) {
            const userData = await fetchOrInitUser(currentUser);
            const clearedPuzzles = userData?.clearedPuzzles || [];
            const isAdmin = userData?.isAdmin || false;

            targetPuzzle = availablePuzzles.find(p => !clearedPuzzles.includes(p.id));

            if (targetPuzzle) {
                navigateToSudoku(selectedDifficulty, targetPuzzle.id);
                return;
            }

            console.log("未プレイの問題がありません。生成猶予を確認します...");
            const { points, lastUpdatedMs } = calculateCurrentStamina(userData);

            if (points > 0 || isAdmin) {
                alert("⏳ 唯一解パズルを新規自動生成中... しばらくお待ちください。");
                let newPuzzle = generatePuzzle(selectedDifficulty);
                if (newPuzzle) {
                    const newId = await saveNewPuzzle(currentUser.uid, selectedDifficulty, newPuzzle);
                    
                    if (!isAdmin) {
                        const nextPoints = points - 1;
                        const nextUpdatedDate = (points === MAX_STAMINA) ? new Date() : new Date(lastUpdatedMs);
                        await updateUserStamina(currentUser.uid, nextPoints, nextUpdatedDate);
                    }
                    navigateToSudoku(selectedDifficulty, newId);
                } else {
                    alert("問題の自動生成に失敗しました。もう一度お試しください。");
                }
            } else {
                alert(`⚠️ 申し訳ありません。難易度「${selectedDifficulty}」の既存ストックが切れています。\nまた、現在の生成猶予ポイントが不足しているため、新しい問題を自動生成できません。\n（5時間に1ポイント自動回復します）`);
            }
        } else {
            // ゲストモード
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

function navigateToSudoku(difficulty, puzzleId) {
    window.location.href = `./puzzles/sudoku.html?diff=${difficulty}&id=${puzzleId}`;
}
